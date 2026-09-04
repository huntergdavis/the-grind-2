import type { NarratorWorkerPort } from "./narrator-client";

export const localNarratorWorkerName = "the-grind-2:local-narrator" as const;

export function createLocalNarratorWorker(): NarratorWorkerPort {
  return new Worker(new URL("./local-narrator.worker.ts", import.meta.url), {
    type: "module",
    name: localNarratorWorkerName,
  });
}
