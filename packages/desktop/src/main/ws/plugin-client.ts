import WebSocket from 'ws';
import {
  PLUGIN_WS_PORT,
  RECONNECT_DELAY_MS,
  MAX_RECONNECT_ATTEMPTS,
  HEARTBEAT_INTERVAL_MS,
} from '@clawwork/shared';
import type { WsMessage, WsHeartbeat, WsUserMessage } from '@clawwork/shared';
import { isOutboundMessage } from '@clawwork/shared';
import type { BrowserWindow } from 'electron';

export class PluginClient {
  private ws: WebSocket | null = null;
  private mainWindow: BrowserWindow | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(
    private readonly host = '127.0.0.1',
    private readonly port = PLUGIN_WS_PORT,
  ) {}

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  connect(): void {
    if (this.destroyed) return;
    this.cleanup();

    const url = `ws://${this.host}:${this.port}`;
    console.log(`[plugin] connecting to ${url}`);
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('[plugin] connected');
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.mainWindow?.webContents.send('plugin-status', { connected: true });
    });

    this.ws.on('message', (raw) => {
      this.handleRaw(raw.toString());
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[plugin] closed: ${code} ${reason}`);
      this.stopHeartbeat();
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error(`[plugin] ws error: ${err.message}`);
    });
  }

  private handleRaw(raw: string): void {
    let msg: WsMessage;
    try {
      msg = JSON.parse(raw) as WsMessage;
    } catch {
      console.error('[plugin] invalid JSON message');
      return;
    }

    if (msg.type === 'heartbeat') {
      return;
    }

    if (isOutboundMessage(msg)) {
      this.mainWindow?.webContents.send('agent-message', msg);
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(message: WsMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  sendUserMessage(sessionKey: string, content: string): boolean {
    const msg: WsUserMessage = { type: 'user_message', sessionKey, content };
    return this.send(msg);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        const hb: WsHeartbeat = {
          type: 'heartbeat',
          timestamp: new Date().toISOString(),
        };
        this.ws.send(JSON.stringify(hb));
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[plugin] max reconnect attempts reached');
      this.mainWindow?.webContents.send('plugin-status', {
        connected: false,
        error: 'max reconnect attempts',
      });
      return;
    }

    const delay = RECONNECT_DELAY_MS * Math.pow(2, Math.min(this.reconnectAttempts, 5));
    this.reconnectAttempts++;
    console.log(`[plugin] reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private cleanup(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.cleanup();
  }
}
