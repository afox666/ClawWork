import { describe, it, expect, vi } from "vitest";
import { WebSocket } from "ws";
import { createSendText, createSendMedia, sendStreamChunk } from "../outbound.js";
import type { DesktopConnection } from "../types.js";

function makeConn(readyState: number = WebSocket.OPEN): DesktopConnection {
  const ws = { readyState, send: vi.fn() } as unknown as WebSocket;
  return { ws, connectedAt: Date.now() };
}

describe("createSendText", () => {
  it("sends WsTextMessage when connected", async () => {
    const conn = makeConn();
    const sendText = createSendText(() => conn);
    const result = await sendText({ to: "agent:main:task-1", text: "hello", cfg: {} });
    expect(result).toEqual({ delivered: true });
    expect(conn.ws.send).toHaveBeenCalledOnce();
    const payload = JSON.parse((conn.ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(payload).toEqual({
      type: "text",
      sessionKey: "agent:main:task-1",
      content: "hello",
    });
  });

  it("returns delivered:false when disconnected", async () => {
    const sendText = createSendText(() => null);
    const result = await sendText({ to: "key", text: "x", cfg: {} });
    expect(result).toEqual({ delivered: false, error: "desktop not connected" });
  });

  it("returns delivered:false when ws not open", async () => {
    const conn = makeConn(WebSocket.CLOSING);
    const sendText = createSendText(() => conn);
    const result = await sendText({ to: "key", text: "x", cfg: {} });
    expect(result).toEqual({ delivered: false, error: "desktop not connected" });
  });
});

describe("createSendMedia", () => {
  it("sends WsMediaMessage with mediaUrl", async () => {
    const conn = makeConn();
    const sendMedia = createSendMedia(() => conn);
    const result = await sendMedia({
      to: "session-1",
      text: "fallback",
      mediaUrl: "/tmp/file.png",
      cfg: {},
    });
    expect(result).toEqual({ delivered: true });
    const payload = JSON.parse((conn.ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(payload.type).toBe("media");
    expect(payload.mediaPath).toBe("/tmp/file.png");
  });

  it("falls back to text when no mediaUrl", async () => {
    const conn = makeConn();
    const sendMedia = createSendMedia(() => conn);
    await sendMedia({ to: "s", text: "/fallback/path.txt", cfg: {} });
    const payload = JSON.parse((conn.ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(payload.mediaPath).toBe("/fallback/path.txt");
  });
});

describe("sendStreamChunk", () => {
  it("sends stream_chunk message", () => {
    const conn = makeConn();
    const ok = sendStreamChunk(conn, "session-1", "partial", false);
    expect(ok).toBe(true);
    const payload = JSON.parse((conn.ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(payload).toEqual({
      type: "stream_chunk",
      sessionKey: "session-1",
      content: "partial",
      done: false,
    });
  });

  it("returns false when no connection", () => {
    expect(sendStreamChunk(null, "s", "x", true)).toBe(false);
  });
});
