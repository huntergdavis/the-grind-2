import { describe, expect, it } from "vitest";
import {
  sharedModelCompatibilityProtocolVersion,
  type SharedModelCompatibilityWorkerRequestV1,
} from "./protocol";
import {
  requestCompatibilityWorker,
  type SharedModelCompatibilityClock,
  type SharedModelCompatibilityWorkerPort,
} from "./worker-channel";

class FixtureClock implements SharedModelCompatibilityClock {
  callback: (() => void) | null = null;
  setTimeout(callback: () => void): unknown {
    this.callback = callback;
    return 1;
  }
  clearTimeout(): void {
    this.callback = null;
  }
}

class FixtureWorker implements SharedModelCompatibilityWorkerPort {
  readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  posted: SharedModelCompatibilityWorkerRequestV1 | null = null;
  transfers: readonly Transferable[] = [];
  addEventListener(type: string, listener: (event: unknown) => void): void {
    const values = this.listeners.get(type) ?? new Set();
    values.add(listener);
    this.listeners.set(type, values);
  }
  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  postMessage(
    message: SharedModelCompatibilityWorkerRequestV1,
    transfer: readonly Transferable[],
  ): void {
    this.posted = message;
    this.transfers = transfer;
  }
  dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const request: SharedModelCompatibilityWorkerRequestV1 = {
  protocolVersion: sharedModelCompatibilityProtocolVersion,
  kind: "dispose",
  runId: "fixture",
  operationId: "fixture:dispose:0",
};

describe("shared-model compatibility worker channel", () => {
  it("resolves only the exact matching response", async () => {
    const worker = new FixtureWorker();
    const pending = requestCompatibilityWorker(worker, request, 1_000);
    worker.dispatch("message", { data: {
      ...request,
      kind: "disposed",
    } });
    await expect(pending).resolves.toMatchObject({ kind: "disposed" });
  });

  it("rejects stale responses and clears all listeners", async () => {
    const worker = new FixtureWorker();
    const pending = requestCompatibilityWorker(worker, request, 1_000);
    worker.dispatch("message", { data: {
      ...request,
      kind: "disposed",
      operationId: "stale",
    } });
    await expect(pending).rejects.toThrow(/stale or malformed/u);
    expect([...worker.listeners.values()].every((values) => values.size === 0))
      .toBe(true);
  });

  it("fails closed on timeout", async () => {
    const worker = new FixtureWorker();
    const clock = new FixtureClock();
    const pending = requestCompatibilityWorker(worker, request, 1_000, clock);
    clock.callback?.();
    await expect(pending).rejects.toThrow(/timed out/u);
  });
});
