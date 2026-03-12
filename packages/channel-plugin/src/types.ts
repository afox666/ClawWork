import type { WebSocket } from "ws";

export type ClawWorkAccount = {
  enabled: boolean;
  wsPort: number;
};

export type DesktopConnection = {
  ws: WebSocket;
  connectedAt: number;
};
