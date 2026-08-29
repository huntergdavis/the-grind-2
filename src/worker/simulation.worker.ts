/// <reference lib="webworker" />

import { SimulationRuntime } from "./simulation-runtime";

const runtime = new SimulationRuntime();

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  self.postMessage(runtime.process(event.data));
});
