// ============================================================
// Shared Constants
// ============================================================

/** Default OpenClaw Gateway WebSocket port */
export const GATEWAY_WS_PORT = 18789;

/** Default ClawWork Plugin WebSocket port */
export const PLUGIN_WS_PORT = 13579;

/** Session key prefix format: agent:<agentId>:<taskId> */
export const SESSION_KEY_PREFIX = 'agent';

/** Build a session key from agentId and taskId */
export function buildSessionKey(agentId: string, taskId: string): string {
  return `${SESSION_KEY_PREFIX}:${agentId}:task-${taskId}`;
}

/** Extract taskId from a session key */
export function parseTaskIdFromSessionKey(sessionKey: string): string | null {
  const match = sessionKey.match(/^agent:[^:]+:task-(.+)$/);
  return match ? match[1] : null;
}

/** Heartbeat interval in milliseconds */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/** Reconnect delay in milliseconds */
export const RECONNECT_DELAY_MS = 3_000;

/** Max reconnect attempts before giving up */
export const MAX_RECONNECT_ATTEMPTS = 10;

/** Default workspace directory name (under user home) */
export const DEFAULT_WORKSPACE_DIR = 'ClawWork-Workspace';

/** Config file name stored in Electron userData */
export const CONFIG_FILE_NAME = 'clawwork-config.json';

/** SQLite database file name within workspace */
export const DB_FILE_NAME = '.clawwork.db';
