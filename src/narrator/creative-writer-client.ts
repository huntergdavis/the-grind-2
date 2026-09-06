export const creativeWriterModelId = "onnx-community/SmolLM2-135M-Instruct-ONNX-MHA";
export const creativeWriterModelRevision = "5b6682c7c9df18f004bfb7e635cba3f3d98537d8";
export const creativeWriterLoadTimeoutMs = 180_000;
export const creativeWriterInferenceTimeoutMs = 90_000;
export const creativeWriterCacheName = `the-grind-2:creative-writer:${creativeWriterModelRevision}:ort-1.26.0-dev.20260416-b7804b056c`;

export async function hasCachedCreativeWriterModel(): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    if (!(await caches.has(creativeWriterCacheName))) return false;
    const cache = await caches.open(creativeWriterCacheName);
    const modelRoot = `https://huggingface.co/${creativeWriterModelId}/resolve/${creativeWriterModelRevision}/`;
    const runtimeRoot = "https://the-grind-2.invalid/creative-writer-runtime/";
    const files = [
      ...["config.json", "generation_config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"]
        .map((file) => modelRoot + file),
      ...["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"]
        .map((file) => runtimeRoot + file),
    ];
    return (await Promise.all(files.map(async (file) => (await cache.match(file))?.ok === true))).every(Boolean);
  } catch {
    return false;
  }
}

export async function removeCachedCreativeWriterModel(): Promise<void> {
  if (typeof caches !== "undefined") await caches.delete(creativeWriterCacheName);
}

export interface CreativeWriterMessage {
  readonly role: "system" | "user";
  readonly content: string;
}

export interface CreativeWriterWorkerPort {
  postMessage(message: unknown): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  addEventListener(type: "error" | "messageerror", listener: () => void): void;
}

export interface CreativeWriterDependencies {
  readonly createWorker?: () => CreativeWriterWorkerPort;
}

interface PendingWrite {
  readonly id: number;
  readonly type: "load" | "write";
  readonly promise: Promise<string>;
  readonly resolve: (text: string) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly onProgress: ((message: string) => void) | undefined;
}

export class CreativeWriterClient {
  private worker: CreativeWriterWorkerPort | null = null;
  private pending: PendingWrite | null = null;
  private loaded = false;
  private disposed = false;
  private ordinal = 0;

  constructor(private readonly dependencies: CreativeWriterDependencies = {}) {}

  get ready(): boolean { return this.loaded && !this.disposed; }

  async load(onProgress?: (message: string) => void): Promise<void> {
    if (this.disposed) throw new Error("Creative writer is closed.");
    if (this.ready) return;
    if (this.pending?.type === "load") {
      await this.pending.promise;
      return;
    }
    if (this.worker === null) {
      const worker: CreativeWriterWorkerPort = this.dependencies.createWorker?.() ?? new Worker(
        new URL("./creative-writer.worker.ts", import.meta.url),
        { type: "module", name: "the-grind-2:creative-writer" },
      );
      this.worker = worker;
      worker.addEventListener("message", (event) => {
        if (this.worker === worker) this.receive(event.data);
      });
      const failed = () => {
        if (this.worker === worker) this.fail("Creative writer stopped. Load it again to retry.");
      };
      worker.addEventListener("error", failed);
      worker.addEventListener("messageerror", failed);
    }
    await this.request("load", undefined, onProgress);
  }

  async write(messages: readonly CreativeWriterMessage[]): Promise<string> {
    if (!this.ready) throw new Error("Load the creative writer before writing a story.");
    if (!Array.isArray(messages) || messages.length < 1 || messages.length > 4
      || messages.some((message) => !message
        || (message.role !== "system" && message.role !== "user")
        || typeof message.content !== "string" || message.content.trim().length === 0
        || message.content.length > 4_000)
      || messages.reduce((length, message) => length + message.content.length, 0) > 8_000) {
      throw new Error("Creative writer needs a short story prompt.");
    }
    return this.request("write", messages.map(({ role, content }) => ({ role, content })));
  }

  dispose(): void {
    this.disposed = true;
    this.fail("Creative writer is closed.");
  }

  private request(
    type: "load" | "write",
    messages?: readonly CreativeWriterMessage[],
    onProgress?: (message: string) => void,
  ): Promise<string> {
    if (this.pending !== null) return Promise.reject(new Error("Creative writer is already writing."));
    const id = ++this.ordinal;
    let resolve!: (text: string) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<string>((accept, decline) => { resolve = accept; reject = decline; });
    const timer = setTimeout(() => this.fail(type === "load"
      ? "Creative writer loading timed out. Try loading it again."
      : "Creative writer took too long. Load it again to retry."),
    type === "load" ? creativeWriterLoadTimeoutMs : creativeWriterInferenceTimeoutMs);
    this.pending = { id, type, promise, resolve, reject, timer, onProgress };
    try {
      this.worker!.postMessage(type === "load" ? { type, id } : { type, id, messages });
    } catch {
      this.fail("Creative writer could not start. Load it again to retry.");
    }
    return promise;
  }

  private receive(value: unknown): void {
    if (value === null || typeof value !== "object") return;
    const response = value as Record<string, unknown>;
    const pending = this.pending;
    if (pending === null || response.id !== pending.id) return;
    if (response.type === "progress" && pending.type === "load") {
      if (typeof response.message === "string" && response.message.length <= 200) {
        // Presentation callbacks must never strand a worker request.
        try { pending.onProgress?.(response.message); } catch { /* Observer only. */ }
      }
      return;
    }
    if (response.type === "error") {
      this.fail(pending.type === "load"
        ? "Creative writer could not load. Check your connection and retry."
        : "Creative writer could not finish. Load it again to retry.");
      return;
    }
    if (pending.type === "load" && response.type === "ready") {
      this.loaded = true;
      this.finish("");
    } else if (pending.type === "write" && response.type === "result"
      && typeof response.text === "string" && response.text.trim().length > 0
      && response.text.length <= 4_000) {
      this.finish(response.text.trim());
    } else {
      this.fail("Creative writer returned an unreadable response. Load it again to retry.");
    }
  }

  private finish(text: string): void {
    const pending = this.pending;
    this.pending = null;
    if (pending !== null) { clearTimeout(pending.timer); pending.resolve(text); }
  }

  private fail(message: string): void {
    const pending = this.pending;
    this.pending = null;
    this.loaded = false;
    const worker = this.worker;
    this.worker = null;
    worker?.terminate();
    if (pending !== null) { clearTimeout(pending.timer); pending.reject(new Error(message)); }
  }
}

export function createCreativeWriterClient(dependencies?: CreativeWriterDependencies): CreativeWriterClient {
  return new CreativeWriterClient(dependencies);
}
