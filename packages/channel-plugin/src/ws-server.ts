import { WebSocketServer, WebSocket } from "ws";
import type { WsMessage, WsUserMessage, WsError } from "@clawwork/shared";
import type { DesktopConnection } from "./types.js";
import type { PluginRuntime } from "openclaw/plugin-sdk/compat";
import { createSendText, createSendMedia } from "./outbound.js";

type Logger = {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type DispatchContext = {
  cfg: unknown;
  core: PluginRuntime["channel"];
};

let wss: WebSocketServer | null = null;
let desktop: DesktopConnection | null = null;
let dispatchCtx: DispatchContext | null = null;

export function getDesktopConnection(): DesktopConnection | null {
  return desktop;
}

export function isDesktopConnected(): boolean {
  return desktop?.ws.readyState === WebSocket.OPEN;
}

export function startWsServer(
  port: number,
  log: Logger,
  ctx?: DispatchContext,
): void {
  if (wss) return;
  if (ctx) dispatchCtx = ctx;

  wss = new WebSocketServer({ port });

  wss.on("connection", (ws) => {
    log.info("[clawwork] desktop connected");
    desktop = { ws, connectedAt: Date.now() };

    ws.on("message", (raw) => handleMessage(raw.toString(), log));
    ws.on("close", () => {
      log.info("[clawwork] desktop disconnected");
      desktop = null;
    });
    ws.on("error", (err) => log.error("[clawwork] ws error:", err.message));
  });

  log.info(`[clawwork] WS server listening on :${port}`);
}

export function stopWsServer(): void {
  if (wss) {
    wss.close();
    wss = null;
  }
  desktop = null;
  dispatchCtx = null;
}

async function handleMessage(raw: string, log: Logger): Promise<void> {
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

function extractAgentId(sessionKey: string): string {
  const parts = sessionKey.split(":");
  return parts.length >= 2 ? parts[1] : "default";
}

async function dispatchInbound(
  msg: WsUserMessage,
  log: Logger,
): Promise<void> {
  if (!dispatchCtx) {
    log.error("[clawwork] dispatch context not initialized");
    sendErrorToDesktop(msg.sessionKey, "not_ready", "Plugin not initialized");
    return;
  }

  const { cfg, core } = dispatchCtx;
  const envelope = core.reply.formatAgentEnvelope({
    channel: "clawwork",
    from: "clawwork:desktop",
    body: msg.content,
    timestamp: Date.now(),
    envelope: core.reply.resolveEnvelopeFormatOptions(cfg),
  });

  const ctx = core.reply.finalizeInboundContext({
    Body: envelope,
    BodyForAgent: msg.content,
    RawBody: msg.content,
    CommandBody: msg.content,
    From: "clawwork:desktop",
    To: `clawwork:${msg.sessionKey}`,
    SessionKey: msg.sessionKey,
    Provider: "clawwork",
    Surface: "clawwork",
    ChatType: "direct",
    CommandAuthorized: true,
    Timestamp: Date.now(),
    SenderName: "Desktop User",
    SenderId: "desktop",
    OriginatingChannel: "clawwork",
    OriginatingTo: `clawwork:${msg.sessionKey}`,
    MessageSid: `clawwork-${Date.now()}`,
  });

  const agentId = extractAgentId(msg.sessionKey);
  const storePath = core.session.resolveStorePath(undefined, { agentId });
  await core.session.recordInboundSession({
    storePath,
    sessionKey: msg.sessionKey,
    ctx,
    onRecordError: (err: unknown) =>
      log.error("[clawwork] session record error:", String(err)),
  });

  const { createReplyPrefixOptions } = await import(
    "openclaw/plugin-sdk/compat"
  );
  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg,
    agentId,
    channel: "clawwork",
  });

  const sendText = createSendText(getDesktopConnection);
  const sendMedia = createSendMedia(getDesktopConnection);

  await core.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx,
    cfg,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: async (payload: { text?: string; mediaUrl?: string }) => {
        if (payload.mediaUrl) {
          await sendMedia({
            to: msg.sessionKey,
            text: payload.text ?? "",
            mediaUrl: payload.mediaUrl,
            cfg,
          });
        } else if (payload.text) {
          await sendText({ to: msg.sessionKey, text: payload.text, cfg });
        }
      },
      onError: (err: unknown) => {
        log.error("[clawwork] dispatch error:", String(err));
        sendErrorToDesktop(msg.sessionKey, "dispatch_error", String(err));
      },
    },
    replyOptions: { onModelSelected },
  });
}

function sendErrorToDesktop(
  sessionKey: string,
  code: string,
  message: string,
): void {
  if (!desktop || desktop.ws.readyState !== WebSocket.OPEN) return;
  const err: WsError = { type: "error", sessionKey, code, message };
  desktop.ws.send(JSON.stringify(err));
}
