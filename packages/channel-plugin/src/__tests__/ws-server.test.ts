import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocket } from "ws";

vi.mock("openclaw/plugin-sdk/compat", () => ({
  createReplyPrefixOptions: vi.fn().mockReturnValue({
    responsePrefix: "",
    onModelSelected: vi.fn(),
  }),
}));

function makeMockCore() {
  return {
    reply: {
      resolveEnvelopeFormatOptions: vi.fn().mockReturnValue(undefined),
      formatAgentEnvelope: vi.fn().mockReturnValue("envelope-text"),
      finalizeInboundContext: vi.fn().mockImplementation((ctx) => ({
        ...ctx,
        CommandAuthorized: true,
      })),
      dispatchReplyWithBufferedBlockDispatcher: vi
        .fn()
        .mockResolvedValue(undefined),
    },
    session: {
      resolveStorePath: vi.fn().mockReturnValue("/tmp/sessions"),
      recordInboundSession: vi.fn().mockResolvedValue(undefined),
    },
  };
}

import {
  startWsServer,
  stopWsServer,
  getDesktopConnection,
  isDesktopConnected,
} from "../ws-server.js";

const TEST_PORT = 19876;

describe("ws-server", () => {
  let clientWs: WebSocket | null = null;
  let mockCore: ReturnType<typeof makeMockCore>;

  beforeEach(() => {
    mockCore = makeMockCore();
  });

  afterEach(async () => {
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
      await new Promise((r) => setTimeout(r, 50));
    }
    clientWs = null;
    stopWsServer();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("starts server and accepts connections", async () => {
    const log = { info: vi.fn(), error: vi.fn() };
    startWsServer(TEST_PORT, log, { cfg: {}, core: mockCore as never });

    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining(`${TEST_PORT}`),
    );

    clientWs = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
    await new Promise<void>((resolve) => clientWs!.on("open", resolve));
    await new Promise((r) => setTimeout(r, 50));

    expect(isDesktopConnected()).toBe(true);
    expect(getDesktopConnection()).not.toBeNull();
  });

  it("does not start twice", () => {
    const log = { info: vi.fn(), error: vi.fn() };
    startWsServer(TEST_PORT, log, { cfg: {}, core: mockCore as never });
    startWsServer(TEST_PORT, log, { cfg: {}, core: mockCore as never });
    expect(log.info).toHaveBeenCalledTimes(1);
  });

  it("handles heartbeat silently", async () => {
    const log = { info: vi.fn(), error: vi.fn() };
    startWsServer(TEST_PORT, log, { cfg: {}, core: mockCore as never });

    clientWs = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
    await new Promise<void>((resolve) => clientWs!.on("open", resolve));
    await new Promise((r) => setTimeout(r, 50));

    clientWs.send(
      JSON.stringify({ type: "heartbeat", timestamp: new Date().toISOString() }),
    );
    await new Promise((r) => setTimeout(r, 50));

    expect(log.error).not.toHaveBeenCalled();
  });

  it("handles create_session message", async () => {
    const log = { info: vi.fn(), error: vi.fn() };
    startWsServer(TEST_PORT, log, { cfg: {}, core: mockCore as never });

    clientWs = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
    await new Promise<void>((resolve) => clientWs!.on("open", resolve));
    await new Promise((r) => setTimeout(r, 50));

    clientWs.send(
      JSON.stringify({
        type: "create_session",
        sessionKey: "agent:main:task-abc",
      }),
    );
    await new Promise((r) => setTimeout(r, 50));

    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining("session created"),
    );
  });

  it("dispatches user_message through core", async () => {
    const log = { info: vi.fn(), error: vi.fn() };
    startWsServer(TEST_PORT, log, { cfg: {}, core: mockCore as never });

    clientWs = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
    await new Promise<void>((resolve) => clientWs!.on("open", resolve));
    await new Promise((r) => setTimeout(r, 50));

    clientWs.send(
      JSON.stringify({
        type: "user_message",
        sessionKey: "agent:main:task-1",
        content: "hello agent",
      }),
    );
    await new Promise((r) => setTimeout(r, 100));

    expect(mockCore.reply.resolveEnvelopeFormatOptions).toHaveBeenCalledWith(
      {},
    );
    expect(mockCore.reply.formatAgentEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "clawwork",
        body: "hello agent",
        envelope: undefined,
      }),
    );
    expect(mockCore.reply.finalizeInboundContext).toHaveBeenCalledWith(
      expect.objectContaining({
        CommandBody: "hello agent",
        SenderName: "Desktop User",
        SenderId: "desktop",
        OriginatingChannel: "clawwork",
      }),
    );
    expect(mockCore.session.resolveStorePath).toHaveBeenCalledWith(undefined, {
      agentId: "main",
    });
    expect(mockCore.session.recordInboundSession).toHaveBeenCalled();
    expect(
      mockCore.reply.dispatchReplyWithBufferedBlockDispatcher,
    ).toHaveBeenCalled();
  });

  it("rejects invalid JSON", async () => {
    const log = { info: vi.fn(), error: vi.fn() };
    startWsServer(TEST_PORT, log, { cfg: {}, core: mockCore as never });

    clientWs = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
    await new Promise<void>((resolve) => clientWs!.on("open", resolve));
    await new Promise((r) => setTimeout(r, 50));

    clientWs.send("not-json{{{");
    await new Promise((r) => setTimeout(r, 50));

    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining("invalid JSON"),
    );
  });

  it("cleans up on stopWsServer", async () => {
    const log = { info: vi.fn(), error: vi.fn() };
    startWsServer(TEST_PORT, log, { cfg: {}, core: mockCore as never });

    clientWs = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
    await new Promise<void>((resolve) => clientWs!.on("open", resolve));
    await new Promise((r) => setTimeout(r, 50));

    expect(isDesktopConnected()).toBe(true);
    stopWsServer();
    await new Promise((r) => setTimeout(r, 50));

    expect(isDesktopConnected()).toBe(false);
    expect(getDesktopConnection()).toBeNull();
  });
});
