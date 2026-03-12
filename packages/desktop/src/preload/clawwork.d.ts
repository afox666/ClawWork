import type { WsMessage } from '@clawwork/shared';

interface IpcResult {
  ok: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

interface ConnectionStatus {
  connected: boolean;
  error?: string;
}

interface GatewayEvent {
  event: string;
  payload: Record<string, unknown>;
  seq?: number;
}

export interface ClawWorkAPI {
  sendMessage: (sessionKey: string, content: string) => Promise<IpcResult>;
  chatHistory: (sessionKey: string, limit?: number) => Promise<IpcResult>;
  listSessions: () => Promise<IpcResult>;
  gatewayStatus: () => Promise<ConnectionStatus>;

  onAgentMessage: (callback: (msg: WsMessage) => void) => void;
  onGatewayEvent: (callback: (data: GatewayEvent) => void) => void;
  onGatewayStatus: (callback: (status: ConnectionStatus) => void) => void;
  onPluginStatus: (callback: (status: ConnectionStatus) => void) => void;
  removeAllListeners: (channel: string) => void;

  saveArtifact: (params: {
    taskId: string;
    sourcePath: string;
    messageId: string;
    fileName?: string;
    mediaType?: string;
  }) => Promise<IpcResult>;
  listArtifacts: (taskId?: string) => Promise<IpcResult>;
  getArtifact: (id: string) => Promise<IpcResult>;
  readArtifactFile: (localPath: string) => Promise<IpcResult>;
  onArtifactSaved: (callback: (artifact: unknown) => void) => void;

  isWorkspaceConfigured: () => Promise<boolean>;
  getWorkspacePath: () => Promise<string | null>;
  getDefaultWorkspacePath: () => Promise<string>;
  browseWorkspace: () => Promise<string | null>;
  setupWorkspace: (path: string) => Promise<IpcResult>;
}

declare global {
  interface Window {
    clawwork: ClawWorkAPI;
  }
}
