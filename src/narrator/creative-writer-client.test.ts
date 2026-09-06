import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCreativeWriterClient,
  creativeWriterCacheName,
  creativeWriterInferenceTimeoutMs,
  creativeWriterLoadTimeoutMs,
  creativeWriterModelId,
  creativeWriterModelRevision,
  hasCachedCreativeWriterModel,
  removeCachedCreativeWriterModel,
  type CreativeWriterWorkerPort,
} from "./creative-writer-client";

class FakeWorker implements CreativeWriterWorkerPort {
  readonly messages: Record<string, unknown>[] = [];
  terminated = false;
  private listeners = new Map<string, ((event: MessageEvent<unknown>) => void)[]>();
  postMessage(message: unknown): void { this.messages.push(message as Record<string, unknown>); }
  terminate(): void { this.terminated = true; }
  addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(value: unknown): void {
    for (const listener of this.listeners.get("message") ?? []) listener({ data: value } as MessageEvent<unknown>);
  }
  crash(type = "error"): void {
    for (const listener of this.listeners.get(type) ?? []) listener({} as MessageEvent<unknown>);
  }
}

const prompt = [{ role: "user" as const, content: "Write one brief story moment." }];

function setup() {
  const workers: FakeWorker[] = [];
  const createWorker = vi.fn(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  const client = createCreativeWriterClient({ createWorker });
  async function load(): Promise<FakeWorker> {
    const promise = client.load();
    const worker = workers.at(-1)!;
    worker.emit({ type: "ready", id: worker.messages.at(-1)!.id });
    await promise;
    return worker;
  }
  return { client, createWorker, workers, load };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("creative writer lifecycle", () => {
  it("creates no worker and starts no download until explicitly loaded", async () => {
    const { client, createWorker } = setup();
    expect(client.ready).toBe(false);
    await expect(client.write(prompt)).rejects.toThrow("Load the creative writer");
    expect(createWorker).not.toHaveBeenCalled();
    client.dispose();
    await expect(client.load()).rejects.toThrow("closed");
  });

  it("shares an in-flight load, reports progress, and reuses the loaded model", async () => {
    const { client, workers, createWorker } = setup();
    const progress = vi.fn();
    const first = client.load(progress);
    const second = client.load();
    const worker = workers[0]!;
    worker.emit({ type: "progress", id: 1, message: "Restoring saved creative writer…" });
    expect(progress).toHaveBeenCalledWith("Restoring saved creative writer…");
    expect(worker.messages).toEqual([{ type: "load", id: 1 }]);
    worker.emit({ type: "ready", id: 1 });
    await Promise.all([first, second]);
    await client.load();
    expect(client.ready).toBe(true);
    expect(createWorker).toHaveBeenCalledTimes(1);
    client.dispose();
  });

  it("allows repeated completed writes and rejects overlapping writes without stranding the first", async () => {
    const { client, load } = setup();
    const worker = await load();
    for (let id = 2; id <= 5; id++) {
      const written = client.write(prompt);
      await expect(client.write(prompt)).rejects.toThrow("already writing");
      worker.emit({ type: "result", id: id - 1, text: "Stale answer" });
      worker.emit({ type: "result", id, text: `  Story ${id}.  ` });
      await expect(written).resolves.toBe(`Story ${id}.`);
      expect(client.ready).toBe(true);
    }
    client.dispose();
  });

  it.each(["error", "messageerror"])("settles a %s failure and allows an explicit fresh load", async (event) => {
    const { client, load, workers } = setup();
    const oldWorker = await load();
    const pending = client.write(prompt);
    const rejection = expect(pending).rejects.toThrow("stopped");
    oldWorker.crash(event);
    await rejection;
    expect(oldWorker.terminated).toBe(true);
    expect(client.ready).toBe(false);
    const freshWorker = await load();
    expect(workers).toHaveLength(2);
    oldWorker.emit({ type: "error", id: freshWorker.messages[0]!.id });
    expect(client.ready).toBe(true);
    client.dispose();
  });

  it.each(["load", "write"] as const)("settles and terminates a timed-out %s", async (kind) => {
    vi.useFakeTimers();
    const { client, load, workers } = setup();
    if (kind === "write") await load();
    const pending = kind === "load" ? client.load() : client.write(prompt);
    const rejection = expect(pending).rejects.toThrow(kind === "load" ? "timed out" : "too long");
    await vi.advanceTimersByTimeAsync(kind === "load" ? creativeWriterLoadTimeoutMs : creativeWriterInferenceTimeoutMs);
    await rejection;
    expect(workers.at(-1)!.terminated).toBe(true);
    expect(client.ready).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["load", "write"] as const)("cancels an active %s immediately on disposal", async (kind) => {
    vi.useFakeTimers();
    const { client, load, workers } = setup();
    if (kind === "write") await load();
    const pending = kind === "load" ? client.load() : client.write(prompt);
    const rejection = expect(pending).rejects.toThrow("closed");
    client.dispose();
    await rejection;
    expect(workers.at(-1)!.terminated).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects oversized prompts before posting them and invalid output without hanging", async () => {
    const { client, load } = setup();
    const worker = await load();
    await expect(client.write([{ role: "user", content: "a".repeat(4_001) }])).rejects.toThrow("short story prompt");
    expect(worker.messages).toHaveLength(1);
    const pending = client.write(prompt);
    worker.emit({ type: "result", id: 2, text: "" });
    await expect(pending).rejects.toThrow("unreadable response");
    expect(worker.terminated).toBe(true);
  });
});

describe("saved creative model", () => {
  it("reports unavailable storage without creating a worker or throwing", async () => {
    vi.stubGlobal("caches", undefined);
    await expect(hasCachedCreativeWriterModel()).resolves.toBe(false);
    await expect(removeCachedCreativeWriterModel()).resolves.toBeUndefined();
  });

  it("requires every pinned model and runtime artifact and deletes only its own namespace", async () => {
    const modelRoot = `https://huggingface.co/${creativeWriterModelId}/resolve/${creativeWriterModelRevision}/`;
    const saved = new Set([
      ...["config.json", "generation_config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"]
        .map((file) => modelRoot + file),
      "https://the-grind-2.invalid/creative-writer-runtime/ort-wasm-simd-threaded.asyncify.mjs",
      "https://the-grind-2.invalid/creative-writer-runtime/ort-wasm-simd-threaded.asyncify.wasm",
    ]);
    const remove = vi.fn(async () => true);
    const open = vi.fn(async () => ({ match: async (key: string) => saved.has(key) ? { ok: true } : undefined }));
    vi.stubGlobal("caches", { has: async () => true, open, delete: remove });
    await expect(hasCachedCreativeWriterModel()).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith(creativeWriterCacheName);
    saved.delete(modelRoot + "onnx/model_quantized.onnx");
    await expect(hasCachedCreativeWriterModel()).resolves.toBe(false);
    await removeCachedCreativeWriterModel();
    expect(remove).toHaveBeenCalledExactlyOnceWith(creativeWriterCacheName);
  });

  it("handles blocked browser storage", async () => {
    vi.stubGlobal("caches", { has: async () => { throw new Error("Storage blocked"); } });
    await expect(hasCachedCreativeWriterModel()).resolves.toBe(false);
  });
});
