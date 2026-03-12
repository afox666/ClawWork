// ============================================================
// Gateway WebSocket Protocol Types
// JSON-RPC inspired frames: req, res, event
// ============================================================

export interface GatewayReqFrame {
  type: 'req';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export interface GatewayResFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: Record<string, unknown>;
  error?: { code: string; message: string };
}

export interface GatewayEventFrame {
  type: 'event';
  event: string;
  seq?: number;
  payload: Record<string, unknown>;
}

export type GatewayFrame =
  | GatewayReqFrame
  | GatewayResFrame
  | GatewayEventFrame;

export interface GatewayConnectParams {
  minProtocol: 3;
  maxProtocol: 3;
  client: {
    id: 'gateway-client';
    displayName: string;
    version: string;
    platform: string;
    mode: 'backend';
  };
  caps: string[];
  auth: { token: string };
  role: 'operator';
  scopes: string[];
}
