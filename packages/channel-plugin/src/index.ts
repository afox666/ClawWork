import { emptyPluginConfigSchema } from "openclaw/plugin-sdk/compat";
import { setClawworkRuntime } from "./runtime.js";
import { clawworkChannel } from "./channel.js";

const plugin = {
  id: "clawwork",
  name: "ClawWork Desktop Channel",
  description: "OpenClaw channel plugin for ClawWork desktop client",
  configSchema: emptyPluginConfigSchema(),
  register(api: {
    runtime: unknown;
    registerChannel: (reg: { plugin: typeof clawworkChannel }) => void;
    logger: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
  }) {
    setClawworkRuntime(api.runtime as never);
    api.registerChannel({ plugin: clawworkChannel });
    api.logger.info("[clawwork] channel plugin registered");
  },
};

export default plugin;
