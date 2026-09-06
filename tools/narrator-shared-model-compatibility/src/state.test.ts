import { describe, expect, it } from "vitest";
import {
  advanceSharedModelCompatibilityState,
  type SharedModelCompatibilityHarnessState,
} from "./state";

describe("shared-model compatibility lifecycle", () => {
  it("permits exactly one staged model and one run", () => {
    let state: SharedModelCompatibilityHarnessState = "created";
    state = advanceSharedModelCompatibilityState(state, "stage-complete");
    state = advanceSharedModelCompatibilityState(state, "run-start");
    state = advanceSharedModelCompatibilityState(state, "run-complete");
    expect(state).toBe("complete");
    expect(() => advanceSharedModelCompatibilityState(state, "stage-complete"))
      .toThrow(/rejected/u);
    expect(() => advanceSharedModelCompatibilityState(state, "run-start"))
      .toThrow(/rejected/u);
    expect(advanceSharedModelCompatibilityState(state, "dispose")).toBe("disposed");
  });

  it("fails closed without making a disposed harness reusable", () => {
    expect(advanceSharedModelCompatibilityState("running", "fail")).toBe("failed");
    expect(advanceSharedModelCompatibilityState("failed", "dispose")).toBe("disposed");
    expect(() => advanceSharedModelCompatibilityState("disposed", "fail"))
      .toThrow(/already disposed/u);
    expect(() => advanceSharedModelCompatibilityState("disposed", "stage-complete"))
      .toThrow(/rejected/u);
  });
});
