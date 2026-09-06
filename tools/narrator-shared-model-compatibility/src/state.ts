export type SharedModelCompatibilityHarnessState =
  | "created"
  | "staged"
  | "running"
  | "complete"
  | "failed"
  | "disposed";

export type SharedModelCompatibilityHarnessEvent =
  | "stage-complete"
  | "run-start"
  | "run-complete"
  | "fail"
  | "dispose";

export function advanceSharedModelCompatibilityState(
  state: SharedModelCompatibilityHarnessState,
  event: SharedModelCompatibilityHarnessEvent,
): SharedModelCompatibilityHarnessState {
  if (event === "fail") {
    if (state === "disposed") {
      throw new TypeError("Shared-model compatibility lifecycle is already disposed");
    }
    return "failed";
  }
  if (event === "dispose") return "disposed";
  if (state === "created" && event === "stage-complete") return "staged";
  if (state === "staged" && event === "run-start") return "running";
  if (state === "running" && event === "run-complete") return "complete";
  throw new TypeError(
    `Shared-model compatibility lifecycle rejected ${event} from ${state}`,
  );
}
