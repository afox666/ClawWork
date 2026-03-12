declare module "openclaw/plugin-sdk/compat" {
  export function createPluginRuntimeStore<T>(errorMessage: string): {
    setRuntime: (next: T) => void;
    clearRuntime: () => void;
    tryGetRuntime: () => T | null;
    getRuntime: () => T;
  };

  export function emptyPluginConfigSchema(): unknown;

  export function createReplyPrefixOptions(params: {
    cfg: unknown;
    agentId: string;
    channel?: string;
    accountId?: string;
  }): {
    responsePrefix?: string;
    responsePrefixContextProvider?: () => unknown;
    onModelSelected?: () => void;
  };

  export interface PluginRuntime {
    channel: {
      text: {
        resolveMarkdownTableMode: (params: {
          cfg: unknown;
          channel: string;
          accountId?: string;
        }) => unknown;
      };
      reply: {
        resolveEnvelopeFormatOptions: (cfg: unknown) => unknown;
        finalizeInboundContext: <T extends Record<string, unknown>>(
          ctx: T,
          opts?: Record<string, boolean>,
        ) => T & { CommandAuthorized: boolean };
        formatAgentEnvelope: (params: {
          channel: string;
          from?: string;
          timestamp?: number | Date;
          envelope?: unknown;
          body: string;
        }) => string;
        dispatchReplyWithBufferedBlockDispatcher: (params: {
          ctx: unknown;
          cfg: unknown;
          dispatcherOptions: {
            deliver: (
              payload: { text?: string; mediaUrl?: string },
              info?: { kind: string },
            ) => Promise<void>;
            onError?: (err: unknown, info?: { kind: string }) => void;
            responsePrefix?: string;
            responsePrefixContextProvider?: () => unknown;
          };
          replyOptions?: {
            onModelSelected?: () => void;
          };
        }) => Promise<unknown>;
      };
      session: {
        resolveStorePath: (
          store?: unknown,
          opts?: { agentId?: string },
        ) => string;
        recordInboundSession: (params: {
          storePath: string;
          sessionKey: string;
          ctx: unknown;
          onRecordError: (err: unknown) => void;
        }) => Promise<void>;
      };
      routing: {
        buildAgentSessionKey: (params: unknown) => string;
        resolveAgentRoute: (params: unknown) => unknown;
      };
    };
  }
}
