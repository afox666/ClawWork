import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);

    contextBridge.exposeInMainWorld('clawwork', {
      sendMessage: (sessionKey: string, content: string) =>
        ipcRenderer.invoke('ws:send-message', { sessionKey, content }),
      chatHistory: (sessionKey: string, limit?: number) =>
        ipcRenderer.invoke('ws:chat-history', { sessionKey, limit }),
      listSessions: () =>
        ipcRenderer.invoke('ws:list-sessions'),
      gatewayStatus: () =>
        ipcRenderer.invoke('ws:gateway-status'),

      onAgentMessage: (callback: (...args: unknown[]) => void) => {
        ipcRenderer.on('agent-message', (_event, msg) => callback(msg));
      },
      onGatewayEvent: (callback: (...args: unknown[]) => void) => {
        ipcRenderer.on('gateway-event', (_event, data) => callback(data));
      },
      onGatewayStatus: (callback: (...args: unknown[]) => void) => {
        ipcRenderer.on('gateway-status', (_event, status) => callback(status));
      },
      onPluginStatus: (callback: (...args: unknown[]) => void) => {
        ipcRenderer.on('plugin-status', (_event, status) => callback(status));
      },

      removeAllListeners: (channel: string) => {
        ipcRenderer.removeAllListeners(channel);
      },
    });
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore fallback for non-isolated context
  window.electron = electronAPI;
  // @ts-ignore
  window.clawwork = {
    sendMessage: (sessionKey: string, content: string) =>
      ipcRenderer.invoke('ws:send-message', { sessionKey, content }),
    chatHistory: (sessionKey: string, limit?: number) =>
      ipcRenderer.invoke('ws:chat-history', { sessionKey, limit }),
    listSessions: () =>
      ipcRenderer.invoke('ws:list-sessions'),
    gatewayStatus: () =>
      ipcRenderer.invoke('ws:gateway-status'),
    onAgentMessage: (callback: (...args: unknown[]) => void) => {
      ipcRenderer.on('agent-message', (_event, msg) => callback(msg));
    },
    onGatewayEvent: (callback: (...args: unknown[]) => void) => {
      ipcRenderer.on('gateway-event', (_event, data) => callback(data));
    },
    onGatewayStatus: (callback: (...args: unknown[]) => void) => {
      ipcRenderer.on('gateway-status', (_event, status) => callback(status));
    },
    onPluginStatus: (callback: (...args: unknown[]) => void) => {
      ipcRenderer.on('plugin-status', (_event, status) => callback(status));
    },
    removeAllListeners: (channel: string) => {
      ipcRenderer.removeAllListeners(channel);
    },
  };
}
