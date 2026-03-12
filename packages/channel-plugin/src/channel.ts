import type { ClawWorkAccount } from "./types.js";
import { createSendText, createSendMedia } from "./outbound.js";
import {
  getDesktopConnection,
  startWsServer,
  stopWsServer,
  isDesktopConnected,
} from "./ws-server.js";
import type { DispatchContext } from "./ws-server.js";
import { PLUGIN_WS_PORT } from "@clawwork/shared";
import type { PluginRuntime } from "openclaw/plugin-sdk/compat";

type GatewayContext = {
  cfg: unknown;
  accountId: string;
  account: ClawWorkAccount;
  abortSignal: AbortSignal;
  channelRuntime?: PluginRuntime["channel"];
  log?: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
};

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
    resolveAccount: (
      _cfg: unknown,
      _accountId?: string | null,
    ): ClawWorkAccount => ({
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
    startAccount: async (ctx: GatewayContext) => {
      const port = ctx.account.wsPort ?? PLUGIN_WS_PORT;
      const log = ctx.log ?? console;

      let dispatch: DispatchContext | undefined;
      if (ctx.channelRuntime) {
        dispatch = { cfg: ctx.cfg, core: ctx.channelRuntime };
      } else {
        log.error(
          "[clawwork] channelRuntime not available — inbound dispatch disabled",
        );
      }

      startWsServer(port, log, dispatch);

      // Block until framework signals abort. Resolving early causes auto-restart.
      await new Promise<void>((resolve) => {
        ctx.abortSignal.addEventListener("abort", () => {
          stopWsServer();
          resolve();
        });
      });
    },

    stopAccount: async () => {
      stopWsServer();
    },
  },

  status: {
    defaultRuntime: { state: "active" as const, label: "ClawWork" },
    buildAccountSnapshot: async (_params: {
      account: ClawWorkAccount;
      cfg: unknown;
    }) => ({
      state: isDesktopConnected() ? ("active" as const) : ("inactive" as const),
      label: "ClawWork Desktop",
      detail: isDesktopConnected() ? "Desktop connected" : "Desktop disconnected",
    }),
  },
} as const;
