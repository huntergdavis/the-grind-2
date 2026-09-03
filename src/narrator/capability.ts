import type { NarratorCapability } from "./protocol";

export const narratorStoredWeightBudgetBytes = 100 * 1024 * 1024;
export const narratorIncrementalMemoryBudgetBytes = 256 * 1024 * 1024;

export interface NarratorCapabilitySnapshot {
  readonly worker: boolean;
  readonly webAssembly: boolean;
  readonly webGpu: boolean;
  readonly hardwareConcurrency: number | null;
  readonly deviceMemoryGiB: number | null;
  readonly saveData: boolean;
}

export function classifyNarratorCapability(snapshot: NarratorCapabilitySnapshot): NarratorCapability {
  const shared = {
    storedWeightBudgetBytes: narratorStoredWeightBudgetBytes,
    incrementalMemoryBudgetBytes: narratorIncrementalMemoryBudgetBytes,
  } as const;
  if (!snapshot.worker || !snapshot.webAssembly) {
    return {
      ...shared,
      execution: "none",
      budget: "unsupported",
      reason: !snapshot.worker ? "dedicated-worker-unavailable" : "webassembly-unavailable",
    };
  }
  const lowEnd = snapshot.saveData
    || (snapshot.hardwareConcurrency !== null && snapshot.hardwareConcurrency <= 4)
    || (snapshot.deviceMemoryGiB !== null && snapshot.deviceMemoryGiB <= 4);
  return {
    ...shared,
    execution: snapshot.webGpu ? "webgpu" : "wasm",
    budget: lowEnd ? "low-end" : "standard",
    reason: snapshot.webGpu ? "local-webgpu-worker" : "local-wasm-worker",
  };
}

export function detectNarratorCapability(): NarratorCapability {
  const navigatorWithHints = navigator as Navigator & {
    readonly deviceMemory?: number;
    readonly connection?: { readonly saveData?: boolean };
    readonly gpu?: unknown;
  };
  return classifyNarratorCapability({
    worker: typeof Worker === "function",
    webAssembly: typeof WebAssembly === "object",
    webGpu: navigatorWithHints.gpu !== undefined,
    hardwareConcurrency: Number.isFinite(navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : null,
    deviceMemoryGiB: Number.isFinite(navigatorWithHints.deviceMemory) ? navigatorWithHints.deviceMemory ?? null : null,
    saveData: navigatorWithHints.connection?.saveData === true,
  });
}
