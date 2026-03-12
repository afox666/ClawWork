import type { WsTextMessage, WsMediaMessage, WsStreamChunk } from "@clawwork/shared";
import type { DesktopConnection } from "./types.js";
import { WebSocket } from "ws";

function sendJson(conn: DesktopConnection | null, data: unknown): boolean {
  if (!conn || conn.ws.readyState !== WebSocket.OPEN) return false;
  conn.ws.send(JSON.stringify(data));
  return true;
}

export function createSendText(getConn: () => DesktopConnection | null) {
  return async (ctx: {
    to: string;
    text: string;
    cfg: unknown;
    [key: string]: unknown;
  }) => {
    const msg: WsTextMessage = {
      type: "text",
      sessionKey: ctx.to,
      content: ctx.text,
    };
    const ok = sendJson(getConn(), msg);
    if (!ok) return { delivered: false, error: "desktop not connected" };
    return { delivered: true };
  };
}

export function createSendMedia(getConn: () => DesktopConnection | null) {
  return async (ctx: {
    to: string;
    text: string;
    mediaUrl?: string;
    mediaLocalRoots?: readonly string[];
    cfg: unknown;
    [key: string]: unknown;
  }) => {
    const msg: WsMediaMessage = {
      type: "media",
      sessionKey: ctx.to,
      mediaPath: ctx.mediaUrl ?? ctx.text,
      mediaType: "file",
    };
    const ok = sendJson(getConn(), msg);
    if (!ok) return { delivered: false, error: "desktop not connected" };
    return { delivered: true };
  };
}

export function sendStreamChunk(
  conn: DesktopConnection | null,
  sessionKey: string,
  content: string,
  done: boolean,
): boolean {
  const msg: WsStreamChunk = { type: "stream_chunk", sessionKey, content, done };
  return sendJson(conn, msg);
}
