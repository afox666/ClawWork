import type { BrowserWindow } from 'electron';
import { GatewayClient } from './gateway-client.js';
import { PluginClient } from './plugin-client.js';

const AUTH_TOKEN = '38d7f008d24a0b508a0ef7149a18bba3ab6ee0bfe5b6f4b9';

let gatewayClient: GatewayClient | null = null;
let pluginClient: PluginClient | null = null;

export function initWebSockets(mainWindow: BrowserWindow): void {
  gatewayClient = new GatewayClient(AUTH_TOKEN);
  gatewayClient.setMainWindow(mainWindow);
  gatewayClient.connect();

  pluginClient = new PluginClient();
  pluginClient.setMainWindow(mainWindow);
  pluginClient.connect();
}

export function getGatewayClient(): GatewayClient | null {
  return gatewayClient;
}

export function getPluginClient(): PluginClient | null {
  return pluginClient;
}

export function destroyWebSockets(): void {
  gatewayClient?.destroy();
  gatewayClient = null;
  pluginClient?.destroy();
  pluginClient = null;
}
