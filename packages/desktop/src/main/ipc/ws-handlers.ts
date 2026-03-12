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
