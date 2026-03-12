# Channel Plugin Full Rewrite — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite the skeleton channel plugin into a fully conformant `ChannelPlugin` that handles ALL message routing (inbound Desktop->Agent + outbound Agent->Desktop), and modify Desktop to send messages through Plugin WS instead of Gateway.

**Architecture:** Plugin Full Channel. Desktop sends `user_message` via Plugin WS. Plugin builds `MsgContext`, calls `dispatchReplyWithBufferedBlockDispatcher` to trigger Agent. Agent reply flows back through Plugin's `deliver` callback, which pushes via WS to Desktop. Gateway connection retained for monitoring/history only.

**Tech Stack:** TypeScript strict, `ws` library, OpenClaw Plugin SDK (`openclaw/plugin-sdk/compat`), `@clawwork/shared` protocol types, Zustand stores (Desktop renderer).

---

## File Map

### Plugin — packages/channel-plugin/src/

| File | Action | Purpose | Est. Lines |
|------|--------|---------|------------|
| `index.ts` | Rewrite | Plugin entry: default export with `id`, `name`, `configSchema`, `register()` | ~30 |
| `runtime.ts` | Create | `createPluginRuntimeStore` wrapper | ~10 |
| `channel.ts` | Create | `ChannelPlugin` object: meta, capabilities, config, outbound, gateway, status | ~120 |
| `ws-server.ts` | Create | WS server lifecycle, connection management, inbound message dispatch | ~150 |
| `outbound.ts` | Create | `sendText`/`sendMedia` conforming to `ChannelOutboundContext` | ~60 |
| `types.ts` | Create | ClawWork-specific types (account config, WS state) | ~30 |

### Plugin — config

| File | Action | Purpose |
|------|--------|---------|
| `openclaw.plugin.json` | Modify | Add `channels: ["clawwork"]` |
| `package.json` | Modify | Add `openclaw` devDependency path, add test script |
| `tsconfig.json` | Modify | Add paths alias for `openclaw/plugin-sdk/compat` |

### Desktop — packages/desktop/src/main/

| File | Action | Purpose |
|------|--------|---------|
| `ws/plugin-client.ts` | Modify | Add `send()` method to emit `WsUserMessage` to plugin |
| `ipc/ws-handlers.ts` | Modify | Route `ws:send-message` through Plugin WS instead of Gateway |
| `ws/index.ts` | No change | Already initializes both clients |

### Shared — packages/shared/src/

| File | Action | Purpose |
|------|--------|---------|
| No changes | — | Protocol types already define `WsUserMessage`, `WsTextMessage`, etc. |

---

## Task 1: Plugin Types (`types.ts`)

**Files:**
- Create: `packages/channel-plugin/src/types.ts`

**Step 1: Write types file**

```typescript
import type { WebSocket } from "ws";

export type ClawWorkAccount = {
  enabled: boolean;
  wsPort: number;
};

export type DesktopConnection = {
  ws: WebSocket;
  connectedAt: number;
};
```

**Step 2: Verify no syntax errors**

Run: `packages/desktop/node_modules/.bin/tsc --noEmit -p packages/channel-plugin/tsconfig.json`
Expected: PASS (no errors)

---

## Task 2: Plugin Runtime Store (`runtime.ts`)

**Files:**
- Create: `packages/channel-plugin/src/runtime.ts`

**Step 1: Write runtime store**

```typescript
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/compat";
import type { PluginRuntime } from "openclaw/plugin-sdk/compat";

const store = createPluginRuntimeStore<PluginRuntime>(
  "ClawWork plugin runtime not initialized. Was register() called?"
);

export const setClawworkRuntime = store.setRuntime;
export const getClawworkRuntime = store.getRuntime;
export const tryGetClawworkRuntime = store.tryGetRuntime;
```

**Step 2: Verify**

Run: `packages/desktop/node_modules/.bin/tsc --noEmit -p packages/channel-plugin/tsconfig.json`
Expected: PASS

---

## Task 3: Outbound Adapter (`outbound.ts`)

**Files:**
- Create: `packages/channel-plugin/src/outbound.ts`

**Step 1: Write outbound adapter**

The outbound adapter handles Agent->Desktop message delivery. `sendText` and `sendMedia` receive a `ChannelOutboundContext` and must return `OutboundDeliveryResult`.

```typescript
import type { WsTextMessage, WsMediaMessage, WsStreamChunk } from "@clawwork/shared";
import type { DesktopConnection } from "./types.js";
import { WebSocket } from "ws";

function sendJson(conn: DesktopConnection | null, data: unknown): boolean {
  if (!conn || conn.ws.readyState !== WebSocket.OPEN) return false;
  conn.ws.send(JSON.stringify(data));
  return true;
}

export function createSendText(getConn: () => DesktopConnection | null) {
  return async (ctx: {
    to: string;
    text: string;
    cfg: unknown;
    [key: string]: unknown;
  }) => {
    const msg: WsTextMessage = {
      type: "text",
      sessionKey: ctx.to,
      content: ctx.text,
    };
    const ok = sendJson(getConn(), msg);
    if (!ok) return { delivered: false, error: "desktop not connected" };
    return { delivered: true };
  };
}

export function createSendMedia(getConn: () => DesktopConnection | null) {
  return async (ctx: {
    to: string;
    text: string;
    mediaUrl?: string;
    mediaLocalRoots?: readonly string[];
    cfg: unknown;
    [key: string]: unknown;
  }) => {
    const msg: WsMediaMessage = {
      type: "media",
      sessionKey: ctx.to,
      mediaPath: ctx.mediaUrl ?? ctx.text,
      mediaType: "file",
    };
    const ok = sendJson(getConn(), msg);
    if (!ok) return { delivered: false, error: "desktop not connected" };
    return { delivered: true };
  };
}

export function sendStreamChunk(
  conn: DesktopConnection | null,
  sessionKey: string,
  content: string,
  done: boolean
): boolean {
  const msg: WsStreamChunk = { type: "stream_chunk", sessionKey, content, done };
  return sendJson(conn, msg);
}
```

**Step 2: Verify**

Run: `packages/desktop/node_modules/.bin/tsc --noEmit -p packages/channel-plugin/tsconfig.json`
Expected: PASS

---

## Task 4: WS Server + Inbound Dispatch (`ws-server.ts`)

This is the core file. It starts the WS server, handles Desktop connections, and dispatches inbound user messages to the Agent via `channelRuntime`.

**Files:**
- Create: `packages/channel-plugin/src/ws-server.ts`

**Step 1: Write WS server**

```typescript
import { WebSocketServer, WebSocket } from "ws";
import { PLUGIN_WS_PORT, HEARTBEAT_INTERVAL_MS } from "@clawwork/shared";
import type { WsMessage, WsUserMessage, WsHeartbeat, WsError } from "@clawwork/shared";
import { isInboundMessage } from "@clawwork/shared";
import type { DesktopConnection } from "./types.js";
import { getClawworkRuntime } from "./runtime.js";
import { createSendText, createSendMedia } from "./outbound.js";

let wss: WebSocketServer | null = null;
let desktop: DesktopConnection | null = null;

export function getDesktopConnection(): DesktopConnection | null {
  return desktop;
}

export function startWsServer(
  port: number,
  log: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void }
): void {
  if (wss) return;

  wss = new WebSocketServer({ port });

  wss.on("connection", (ws) => {
    log.info("[clawwork] desktop connected");
    desktop = { ws, connectedAt: Date.now() };

    ws.on("message", (raw) => handleMessage(raw.toString(), log));

    ws.on("close", () => {
      log.info("[clawwork] desktop disconnected");
      desktop = null;
    });

    ws.on("error", (err) => {
      log.error("[clawwork] ws error:", err.message);
    });
  });

  log.info(`[clawwork] WS server listening on :${port}`);
}

export function stopWsServer(): void {
  if (wss) {
    wss.close();
    wss = null;
  }
  desktop = null;
}

export function isDesktopConnected(): boolean {
  return desktop?.ws.readyState === WebSocket.OPEN;
}

async function handleMessage(
  raw: string,
  log: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void }
): Promise<void> {
  let msg: WsMessage;
  try {
    msg = JSON.parse(raw) as WsMessage;
  } catch {
    log.error("[clawwork] invalid JSON from desktop");
    return;
  }

  if (msg.type === "heartbeat") return;

  if (msg.type === "user_message") {
    await dispatchInbound(msg, log);
    return;
  }

  if (msg.type === "create_session") {
    log.info(`[clawwork] session created: ${msg.sessionKey}`);
    return;
  }
}

async function dispatchInbound(
  msg: WsUserMessage,
  log: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void }
): Promise<void> {
  const runtime = getClawworkRuntime();
  const channelRuntime = runtime.channel;
  const cfg = runtime.config.get();

  const envelope = channelRuntime.reply.formatAgentEnvelope({
    channel: "clawwork",
    from: `clawwork:desktop`,
    body: msg.content,
    timestamp: Date.now(),
  });

  const ctx = channelRuntime.reply.finalizeInboundContext({
    Body: envelope,
    BodyForAgent: msg.content,
    RawBody: msg.content,
    From: "clawwork:desktop",
    To: `clawwork:${msg.sessionKey}`,
    SessionKey: msg.sessionKey,
    Provider: "clawwork",
    Surface: "desktop",
    ChatType: "direct",
    CommandAuthorized: true,
    Timestamp: Date.now(),
  });

  const storePath = channelRuntime.session.resolveStorePath({ cfg });

  await channelRuntime.session.recordInboundSession({
    storePath,
    sessionKey: msg.sessionKey,
    ctx,
    onRecordError: (err) => {
      log.error("[clawwork] session record error:", String(err));
    },
  });

  const { onModelSelected, ...prefixOptions } = channelRuntime.reply
    ? (await import("openclaw/plugin-sdk/compat")).createReplyPrefixOptions({
        cfg,
        agentId: msg.sessionKey.split(":")[1] ?? "default",
        channel: "clawwork",
      })
    : { onModelSelected: undefined };

  await channelRuntime.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx,
    cfg,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: async (payload) => {
        const sendText = createSendText(getDesktopConnection);
        await sendText({
          to: msg.sessionKey,
          text: typeof payload === "string" ? payload : payload.text ?? "",
          cfg,
        });
      },
      onError: (err) => {
        log.error("[clawwork] dispatch error:", String(err));
        sendError(msg.sessionKey, "dispatch_error", String(err));
      },
    },
    replyOptions: {
      onModelSelected,
    },
  });
}

function sendError(sessionKey: string, code: string, message: string): void {
  const conn = getDesktopConnection();
  if (!conn || conn.ws.readyState !== WebSocket.OPEN) return;
  const err: WsError = { type: "error", sessionKey, code, message };
  conn.ws.send(JSON.stringify(err));
}
```

**Step 2: Verify**

Run: `packages/desktop/node_modules/.bin/tsc --noEmit -p packages/channel-plugin/tsconfig.json`

Note: This file imports from `openclaw/plugin-sdk/compat` which may not resolve during standalone tsc. The plugin runs inside OpenClaw (loaded via `jiti`), so these imports resolve at runtime. For tsc, we need a `paths` alias in `tsconfig.json` pointing to the local OpenClaw checkout. See Task 7.

---

## Task 5: Channel Definition (`channel.ts`)

**Files:**
- Create: `packages/channel-plugin/src/channel.ts`

**Step 1: Write channel plugin object**

```typescript
import type { ClawWorkAccount } from "./types.js";
import { createSendText, createSendMedia } from "./outbound.js";
import {
  getDesktopConnection,
  startWsServer,
  stopWsServer,
  isDesktopConnected,
} from "./ws-server.js";
import { PLUGIN_WS_PORT } from "@clawwork/shared";

export const clawworkChannel = {
  id: "clawwork" as const,

  meta: {
    id: "clawwork" as const,
    label: "ClawWork Desktop",
    selectionLabel: "ClawWork",
    docsPath: "channels/clawwork",
    blurb: "Local desktop client for OpenClaw",
    order: 100,
  },

  capabilities: {
    chatTypes: ["direct" as const],
    media: true,
    blockStreaming: true,
  },

  config: {
    listAccountIds: (_cfg: unknown) => ["default"],

    resolveAccount: (_cfg: unknown, _accountId?: string | null): ClawWorkAccount => ({
      enabled: true,
      wsPort: PLUGIN_WS_PORT,
    }),
  },

  outbound: {
    deliveryMode: "direct" as const,
    sendText: createSendText(getDesktopConnection),
    sendMedia: createSendMedia(getDesktopConnection),
  },

  gateway: {
    startAccount: async (ctx: {
      cfg: unknown;
      accountId: string;
      account: ClawWorkAccount;
      channelRuntime?: unknown;
      abortSignal: AbortSignal;
      log?: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
    }) => {
      const port = ctx.account.wsPort ?? PLUGIN_WS_PORT;
      const log = ctx.log ?? console;
      startWsServer(port, log);

      ctx.abortSignal.addEventListener("abort", () => {
        stopWsServer();
      });
    },

    stopAccount: async () => {
      stopWsServer();
    },
  },

  status: {
    defaultRuntime: {
      state: "active" as const,
      label: "ClawWork",
    },
    buildAccountSnapshot: async (params: {
      account: ClawWorkAccount;
      cfg: unknown;
    }) => ({
      state: isDesktopConnected() ? ("active" as const) : ("inactive" as const),
      label: "ClawWork Desktop",
      detail: isDesktopConnected() ? "Desktop connected" : "Desktop disconnected",
    }),
  },
} as const;
```

**Step 2: Verify**

Run: `packages/desktop/node_modules/.bin/tsc --noEmit -p packages/channel-plugin/tsconfig.json`
Expected: PASS

---

## Task 6: Plugin Entry Point (`index.ts`)

**Files:**
- Rewrite: `packages/channel-plugin/src/index.ts`

**Step 1: Rewrite entry point**

```typescript
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk/compat";
import { setClawworkRuntime } from "./runtime.js";
import { clawworkChannel } from "./channel.js";

const plugin = {
  id: "clawwork",
  name: "ClawWork Desktop Channel",
  description: "OpenClaw channel plugin for ClawWork desktop client",
  configSchema: emptyPluginConfigSchema(),
  register(api: {
    runtime: unknown;
    registerChannel: (reg: { plugin: typeof clawworkChannel }) => void;
    logger: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
  }) {
    setClawworkRuntime(api.runtime as any);
    api.registerChannel({ plugin: clawworkChannel });
    api.logger.info("[clawwork] channel plugin registered");
  },
};

export default plugin;
```

**Step 2: Verify**

Run: `packages/desktop/node_modules/.bin/tsc --noEmit -p packages/channel-plugin/tsconfig.json`
Expected: PASS

---

## Task 7: Plugin Config Files

**Files:**
- Modify: `packages/channel-plugin/openclaw.plugin.json`
- Modify: `packages/channel-plugin/tsconfig.json`
- Modify: `packages/channel-plugin/package.json`

**Step 1: Update plugin manifest**

```json
{
  "id": "clawwork",
  "name": "ClawWork Desktop Channel",
  "version": "0.2.0",
  "description": "OpenClaw channel plugin for ClawWork desktop client",
  "author": "samzong",
  "license": "MIT",
  "channels": ["clawwork"]
}
```

**Step 2: Update tsconfig with paths alias**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "paths": {
      "openclaw/plugin-sdk/compat": [
        "../../node_modules/openclaw/src/plugin-sdk/compat.ts",
        "../../../openclaw/src/plugin-sdk/compat.ts"
      ]
    }
  },
  "include": ["src"]
}
```

The paths resolve to either a local `openclaw` devDependency in node_modules or a sibling checkout at `~/git/openclaw`. Only one needs to exist.

**Step 3: Update package.json**

Add test script placeholder. The `openclaw` types resolution is handled via tsconfig paths (not as a real dependency, since OpenClaw loads the plugin at runtime via `jiti`).

```json
{
  "name": "openclaw-channel-clawwork",
  "version": "0.2.0",
  "type": "module",
  "description": "OpenClaw channel plugin for ClawWork desktop client",
  "main": "./src/index.ts",
  "openclaw": {
    "extensions": ["./src/index.ts"]
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@clawwork/shared": "workspace:*",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.0",
    "typescript": "^5.7.0"
  }
}
```

**Step 4: Verify all config changes**

Run: `packages/desktop/node_modules/.bin/tsc --noEmit -p packages/channel-plugin/tsconfig.json`
Expected: PASS (with valid paths resolution)

---

## Task 8: Desktop — PluginClient `send()` Method

**Files:**
- Modify: `packages/desktop/src/main/ws/plugin-client.ts` (lines 12-140)

**Step 1: Add `send()` method to PluginClient**

Add after line 78 (`get isConnected`):

```typescript
  send(message: WsMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  sendUserMessage(sessionKey: string, content: string): boolean {
    const msg: WsUserMessage = { type: "user_message", sessionKey, content };
    return this.send(msg);
  }
```

Also add `WsUserMessage` to the import:

```typescript
import type { WsMessage, WsHeartbeat, WsUserMessage } from '@clawwork/shared';
```

**Step 2: Verify**

Run: `packages/desktop/node_modules/.bin/tsc --noEmit -p packages/desktop/tsconfig.json`
Expected: PASS

---

## Task 9: Desktop — Route Messages Through Plugin WS

**Files:**
- Modify: `packages/desktop/src/main/ipc/ws-handlers.ts`

**Step 1: Change `ws:send-message` handler**

Replace the `ws:send-message` handler to route through Plugin WS. Gateway is kept for `chat-history` and `list-sessions` (read-only operations).

```typescript
import { ipcMain } from 'electron';
import { getGatewayClient, getPluginClient } from '../ws/index.js';

export function registerWsHandlers(): void {
  ipcMain.handle('ws:send-message', async (_event, payload: {
    sessionKey: string;
    content: string;
  }) => {
    const plugin = getPluginClient();
    if (!plugin?.isConnected) {
      return { ok: false, error: 'plugin not connected' };
    }
    const sent = plugin.sendUserMessage(payload.sessionKey, payload.content);
    return sent ? { ok: true } : { ok: false, error: 'send failed' };
  });

  ipcMain.handle('ws:chat-history', async (_event, payload: {
    sessionKey: string;
    limit?: number;
  }) => {
    const gw = getGatewayClient();
    if (!gw?.isConnected) {
      return { ok: false, error: 'gateway not connected' };
    }
    try {
      const result = await gw.getChatHistory(payload.sessionKey, payload.limit);
      return { ok: true, result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      return { ok: false, error: msg };
    }
  });

  ipcMain.handle('ws:list-sessions', async () => {
    const gw = getGatewayClient();
    if (!gw?.isConnected) {
      return { ok: false, error: 'gateway not connected' };
    }
    try {
      const result = await gw.listSessions();
      return { ok: true, result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      return { ok: false, error: msg };
    }
  });

  ipcMain.handle('ws:gateway-status', () => {
    const gw = getGatewayClient();
    const plugin = getPluginClient();
    return {
      connected: gw?.isConnected ?? false,
      pluginConnected: plugin?.isConnected ?? false,
    };
  });
}
```

**Step 2: Verify**

Run: `packages/desktop/node_modules/.bin/tsc --noEmit -p packages/desktop/tsconfig.json`
Expected: PASS

---

## Task 10: Full Type-Check Verification

**Step 1: Build shared (composite project)**

Run: `packages/desktop/node_modules/.bin/tsc -b packages/shared/tsconfig.json`
Expected: PASS

**Step 2: Type-check channel-plugin**

Run: `packages/desktop/node_modules/.bin/tsc --noEmit -p packages/channel-plugin/tsconfig.json`
Expected: PASS (or expected errors for `openclaw/plugin-sdk/compat` imports — these resolve at runtime via jiti)

**Step 3: Type-check desktop**

Run: `packages/desktop/node_modules/.bin/tsc --noEmit -p packages/desktop/tsconfig.json`
Expected: PASS (zero errors)

**Step 4: Dev server smoke test**

Run: `pnpm --filter @clawwork/desktop dev`
Expected: Electron window opens, no crash

---

## Execution Order

```
Task 1 (types.ts)           ─┐
Task 2 (runtime.ts)          ├─ independent, can parallel
Task 3 (outbound.ts)         │  (but 3 depends on 1 for DesktopConnection)
                             ─┘
Task 4 (ws-server.ts)        ← depends on 1, 2, 3
Task 5 (channel.ts)          ← depends on 1, 3, 4
Task 6 (index.ts)            ← depends on 2, 5
Task 7 (config files)        ← depends on 6
Task 8 (desktop plugin-client) ─┐ independent of plugin tasks
Task 9 (desktop ws-handlers)    ├─ depends on 8
                               ─┘
Task 10 (verification)       ← depends on ALL above
```

## Known Risks

1. **`openclaw/plugin-sdk/compat` resolution** — The plugin runs inside OpenClaw via `jiti`, so these imports resolve at runtime. For local `tsc`, we need the tsconfig `paths` alias pointing to a local OpenClaw checkout. If the checkout doesn't exist, tsc will report errors for those imports — this is expected and acceptable.

2. **`dispatchReplyWithBufferedBlockDispatcher` deliver callback shape** — The `deliver` callback receives a `payload` object. Its exact shape depends on OpenClaw internals. The plan uses a defensive `typeof payload === "string" ? payload : payload.text` pattern. May need adjustment after runtime testing.

3. **`createReplyPrefixOptions` dynamic import** — Used via `await import("openclaw/plugin-sdk/compat")` in `ws-server.ts` to avoid top-level import issues. This is how feishu/twitch do it.

4. **Session key parsing** — `msg.sessionKey.split(":")[1]` extracts `agentId` from `agent:<agentId>:task-<taskId>`. If the format changes, this breaks. Mitigated by using shared `parseTaskIdFromSessionKey()`.
