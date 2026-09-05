import { describe, expect, it, vi } from "vitest";
import type { BrowserStoryBeatWorkerRequestV1 } from "./protocol";
import {
  requestStoryBeatWorker,
  type StoryBeatWorkerChannelClock,
  type StoryBeatWorkerChannelPort,
} from "./worker-channel";

class FakeWorker implements StoryBeatWorkerChannelPort {
  readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  readonly postMessage = vi.fn();

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const request: BrowserStoryBeatWorkerRequestV1 = Object.freeze({
  protocolVersion: 1,
  kind: "run",
  runId: "run:channel:1",
  operationId: "run:channel:1:run:0",
});

describe("story-beat worker channel", () => {
  it("accepts only the exact response identity and removes listeners", async () => {
    const worker = new FakeWorker();
    const pending = requestStoryBeatWorker(worker, request, 1_000);
    worker.emit("message", { data: {
      protocolVersion: 1,
      kind: "complete",
      runId: request.runId,
      operationId: request.operationId,
      loadElapsedMs: 10,
      tokenizerVerified: true,
      results: [],
    } });
    await expect(pending).resolves.toMatchObject({ kind: "complete", tokenizerVerified: true });
    expect([...worker.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
  });

  it.each([
    { runId: "run:stale" },
    { operationId: "operation:stale" },
    { tokenizerVerified: false },
    { hidden: true },
  ])("rejects stale or malformed worker output: %o", async (change) => {
    const worker = new FakeWorker();
    const pending = requestStoryBeatWorker(worker, request, 1_000);
    worker.emit("message", { data: {
      protocolVersion: 1,
      kind: "complete",
      runId: request.runId,
      operationId: request.operationId,
      loadElapsedMs: 10,
      tokenizerVerified: true,
      results: [],
      ...change,
    } });
    await expect(pending).rejects.toThrow("stale or malformed");
  });

  it("fails closed on timeout and removes every listener", async () => {
    const worker = new FakeWorker();
    let timeout: (() => void) | null = null;
    const clock: StoryBeatWorkerChannelClock = {
      setTimeout: (callback) => { timeout = callback; return 1; },
      clearTimeout: vi.fn(),
    };
    const pending = requestStoryBeatWorker(worker, request, 1_000, clock);
    expect(timeout).not.toBeNull();
    timeout!();
    await expect(pending).rejects.toThrow("timed out");
    expect([...worker.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
  });

  it("cleans up when posting the request throws", async () => {
    const worker = new FakeWorker();
    worker.postMessage.mockImplementation(() => { throw new Error("clone failed"); });
    await expect(requestStoryBeatWorker(worker, request, 1_000)).rejects.toThrow("clone failed");
    expect([...worker.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
  });
});
