import { describe, expect, it } from "vitest";
import { runtimeStallThresholdMs, shouldRecoverRuntime } from "./liveness";

describe("runtime liveness", () => {
  it("uses a bounded threshold for fast and normal presentation beats", () => {
    expect(runtimeStallThresholdMs(250)).toBe(20_000);
    expect(runtimeStallThresholdMs(4_800)).toBe(28_800);
  });

  it("recovers only a visible unpaused idle runtime past its threshold", () => {
    const base = { nowMs: 30_000, lastAdvanceAtMs: 0, beatDurationMs: 4_800, paused: false, hidden: false, interacting: false };
    expect(shouldRecoverRuntime(base)).toBe(true);
    expect(shouldRecoverRuntime({ ...base, paused: true })).toBe(false);
    expect(shouldRecoverRuntime({ ...base, hidden: true })).toBe(false);
    expect(shouldRecoverRuntime({ ...base, interacting: true })).toBe(false);
    expect(shouldRecoverRuntime({ ...base, nowMs: 28_799 })).toBe(false);
  });
});
