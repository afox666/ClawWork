import { createPluginRuntimeStore } from "openclaw/plugin-sdk/compat";
import type { PluginRuntime } from "openclaw/plugin-sdk/compat";

const store = createPluginRuntimeStore<PluginRuntime>(
  "ClawWork plugin runtime not initialized. Was register() called?",
);

export const setClawworkRuntime = store.setRuntime;
export const getClawworkRuntime = store.getRuntime;
export const tryGetClawworkRuntime = store.tryGetRuntime;
