import { describe, expect, it, vi } from "vitest";
import {
  AutomaticUpdateMonitor,
  isNewerVersion,
  nextUpdateDelay,
  parseVersionManifest,
  updateIntervalMs,
  updateJitterMs,
  type AutomaticUpdateDependencies,
} from "./automatic-update";

function harness(overrides: Partial<AutomaticUpdateDependencies> = {}) {
  const scheduled: Array<{ callback: () => void; delay: number }> = [];
  let visible = true;
  const dependencies: AutomaticUpdateDependencies = {
    currentVersion: "1.2.3",
    fetchVersion: vi.fn(async () => ({ version: "1.2.3" })),
    randomUnit: () => 0.5,
    schedule: (callback, delay) => {
      scheduled.push({ callback, delay });
      return scheduled.length;
    },
    cancel: vi.fn(),
    isVisible: () => visible,
    applyUpdate: vi.fn(async () => undefined),
    report: vi.fn(),
    ...overrides,
  };
  return { dependencies, scheduled, setVisible: (value: boolean) => { visible = value; } };
}

describe("automatic update monitor", () => {
  it("parses only explicit semantic version resources", () => {
    expect(parseVersionManifest({ version: "0.5.4" })).toEqual({ version: "0.5.4" });
    expect(parseVersionManifest({ version: "0.5.4-beta.1" })).toBeNull();
    expect(parseVersionManifest({ version: "latest" })).toBeNull();
    expect(parseVersionManifest(null)).toBeNull();
  });

  it("orders release versions without treating rollbacks as updates", () => {
    expect(isNewerVersion("0.5.4", "0.5.3")).toBe(true);
    expect(isNewerVersion("0.6.0", "0.5.4")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.99.99")).toBe(true);
    expect(isNewerVersion("0.5.3", "0.5.4")).toBe(false);
    expect(isNewerVersion("0.5.4", "0.5.4")).toBe(false);
  });

  it("schedules every check between sixty and seventy-five minutes", () => {
    expect(nextUpdateDelay(0)).toBe(updateIntervalMs);
    expect(nextUpdateDelay(0.5)).toBe(updateIntervalMs + updateJitterMs / 2);
    expect(nextUpdateDelay(1)).toBe(updateIntervalMs + updateJitterMs - 1);
    expect(nextUpdateDelay(Number.NaN)).toBe(updateIntervalMs);
  });

  it("checks immediately then schedules a fresh jittered check when current", async () => {
    const state = harness();
    const monitor = new AutomaticUpdateMonitor(state.dependencies);
    monitor.start();
    await vi.waitFor(() => expect(state.scheduled).toHaveLength(1));
    expect(state.dependencies.fetchVersion).toHaveBeenCalledOnce();
    expect(state.scheduled[0]?.delay).toBe(updateIntervalMs + updateJitterMs / 2);
    expect(state.dependencies.report).toHaveBeenCalledWith("current", "1.2.3");
  });

  it("applies a visible newer version once without scheduling stale work", async () => {
    const state = harness({ fetchVersion: vi.fn(async () => ({ version: "1.2.4" })) });
    const monitor = new AutomaticUpdateMonitor(state.dependencies);
    await monitor.check();
    expect(state.dependencies.applyUpdate).toHaveBeenCalledWith("1.2.4");
    expect(state.scheduled).toHaveLength(0);
  });

  it("treats an older deployed manifest as current instead of reloading", async () => {
    const state = harness({ fetchVersion: vi.fn(async () => ({ version: "1.2.2" })) });
    const monitor = new AutomaticUpdateMonitor(state.dependencies);
    await monitor.check();
    expect(state.dependencies.applyUpdate).not.toHaveBeenCalled();
    expect(state.scheduled).toHaveLength(1);
  });

  it("defers a hidden update until visibility returns", async () => {
    const state = harness({ fetchVersion: vi.fn(async () => ({ version: "2.0.0" })) });
    state.setVisible(false);
    const monitor = new AutomaticUpdateMonitor(state.dependencies);
    await monitor.check();
    expect(state.dependencies.applyUpdate).not.toHaveBeenCalled();
    expect(state.dependencies.report).toHaveBeenCalledWith("deferred", "2.0.0");
    state.setVisible(true);
    monitor.notifyVisible();
    await vi.waitFor(() => expect(state.dependencies.applyUpdate).toHaveBeenCalledWith("2.0.0"));
  });

  it("retries after malformed resources and failed update application", async () => {
    const malformed = harness({ fetchVersion: vi.fn(async () => ({ version: "nope" })) });
    await new AutomaticUpdateMonitor(malformed.dependencies).check();
    expect(malformed.scheduled).toHaveLength(1);
    expect(malformed.dependencies.report).toHaveBeenCalledWith("error");

    const failed = harness({
      fetchVersion: vi.fn(async () => ({ version: "1.2.4" })),
      applyUpdate: vi.fn(async () => { throw new Error("save failed"); }),
    });
    await new AutomaticUpdateMonitor(failed.dependencies).check();
    expect(failed.scheduled).toHaveLength(1);
    expect(failed.dependencies.report).toHaveBeenCalledWith("error", "1.2.4");
  });
});
