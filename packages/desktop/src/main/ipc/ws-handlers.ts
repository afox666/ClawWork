import { ipcMain } from 'electron';
import { getGatewayClient } from '../ws/index.js';

export function registerWsHandlers(): void {
  ipcMain.handle('ws:send-message', async (_event, payload: {
    sessionKey: string;
    content: string;
  }) => {
    const gw = getGatewayClient();
    if (!gw?.isConnected) {
      return { ok: false, error: 'gateway not connected' };
    }
    try {
      const result = await gw.sendChatMessage(payload.sessionKey, payload.content);
      return { ok: true, result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      return { ok: false, error: msg };
    }
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
    return { connected: gw?.isConnected ?? false };
  });
}
