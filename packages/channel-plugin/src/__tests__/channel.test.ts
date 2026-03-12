import { describe, it, expect, vi } from "vitest";

vi.mock("openclaw/plugin-sdk/compat", () => ({
  createPluginRuntimeStore: vi.fn().mockReturnValue({
    setRuntime: vi.fn(),
    clearRuntime: vi.fn(),
    tryGetRuntime: vi.fn(),
    getRuntime: vi.fn(),
  }),
  emptyPluginConfigSchema: vi.fn().mockReturnValue({}),
}));

vi.mock("../runtime.js", () => ({
  getClawworkRuntime: vi.fn(),
  setClawworkRuntime: vi.fn(),
  tryGetClawworkRuntime: vi.fn(),
}));

import { clawworkChannel } from "../channel.js";

describe("clawworkChannel", () => {
  it("has correct id and meta", () => {
    expect(clawworkChannel.id).toBe("clawwork");
    expect(clawworkChannel.meta.id).toBe("clawwork");
    expect(clawworkChannel.meta.label).toBe("ClawWork Desktop");
  });

  it("declares direct chat and media capabilities", () => {
    expect(clawworkChannel.capabilities.chatTypes).toContain("direct");
    expect(clawworkChannel.capabilities.media).toBe(true);
    expect(clawworkChannel.capabilities.blockStreaming).toBe(true);
  });

  it("listAccountIds returns single default account", () => {
    const ids = clawworkChannel.config.listAccountIds({});
    expect(ids).toEqual(["default"]);
  });

  it("resolveAccount returns enabled with correct port", () => {
    const account = clawworkChannel.config.resolveAccount({});
    expect(account.enabled).toBe(true);
    expect(account.wsPort).toBe(13579);
  });

  it("outbound has direct delivery mode", () => {
    expect(clawworkChannel.outbound.deliveryMode).toBe("direct");
    expect(typeof clawworkChannel.outbound.sendText).toBe("function");
    expect(typeof clawworkChannel.outbound.sendMedia).toBe("function");
  });

  it("gateway has start/stop methods", () => {
    expect(typeof clawworkChannel.gateway.startAccount).toBe("function");
    expect(typeof clawworkChannel.gateway.stopAccount).toBe("function");
  });

  it("status snapshot reports inactive when no desktop connected", async () => {
    const snapshot = await clawworkChannel.status.buildAccountSnapshot({
      account: { enabled: true, wsPort: 13579 },
      cfg: {},
    });
    expect(snapshot.state).toBe("inactive");
    expect(snapshot.detail).toBe("Desktop disconnected");
  });
});
