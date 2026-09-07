import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creativeWriterModelId, creativeWriterModelRevision } from "./creative-writer-client";

const transformers = vi.hoisted(() => ({
  tokenizer: vi.fn(),
  model: vi.fn(),
  env: { backends: { onnx: { wasm: {} } } } as Record<string, unknown> & {
    backends: { onnx: { wasm: Record<string, unknown> } };
  },
}));

vi.mock("@huggingface/transformers", () => ({
  AutoTokenizer: { from_pretrained: transformers.tokenizer },
  AutoModelForCausalLM: { from_pretrained: transformers.model },
  LogLevel: { NONE: 0 },
  env: transformers.env,
}));
vi.mock("onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url", () => ({ default: "/runtime.mjs" }));
vi.mock("onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url", () => ({ default: "/runtime.wasm" }));

const modelRoot = `https://huggingface.co/${creativeWriterModelId}/resolve/${creativeWriterModelRevision}/`;
const artifactKeys = [
  ...["config.json", "generation_config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"]
    .map((file) => modelRoot + file),
  "https://the-grind-2.invalid/creative-writer-runtime/ort-wasm-simd-threaded.asyncify.mjs",
  "https://the-grind-2.invalid/creative-writer-runtime/ort-wasm-simd-threaded.asyncify.wasm",
];

beforeEach(() => {
  vi.resetModules();
  transformers.tokenizer.mockReset().mockResolvedValue({});
  transformers.model.mockReset().mockResolvedValue({});
  for (const key of Object.keys(transformers.env)) {
    if (key !== "backends") delete transformers.env[key];
  }
  transformers.env.backends.onnx.wasm = {};
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function setup(saved = new Set(artifactKeys), blockedCache = false) {
  let handler: (event: MessageEvent<unknown>) => Promise<void> = async () => { throw Error("Worker not installed"); };
  const postMessage = vi.fn();
  const network = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
  vi.stubGlobal("fetch", network);
  vi.stubGlobal("caches", {
    open: async () => {
      if (blockedCache) throw Error("Cache unavailable");
      return {
        match: async (key: string) => saved.has(key) ? new Response(new Uint8Array([1, 2, 3])) : undefined,
        put: vi.fn(async () => undefined),
      };
    },
  });
  vi.stubGlobal("self", {
    location: { href: "https://example.test/assets/creative-writer.js" },
    postMessage,
    addEventListener: (_type: string, listener: typeof handler) => { handler = listener; },
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic-runtime");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  await import("./creative-writer.worker");
  return {
    network, postMessage,
    send: (request: unknown) => handler({ data: request } as MessageEvent<unknown>),
  };
}

describe("creative writer cache-only worker restoration", () => {
  it.each(["model", "runtime-module", "runtime-wasm", "blocked-cache"])(
    "rejects missing %s without fetching or starting model loaders", async (missing) => {
      const saved = new Set(artifactKeys);
      if (missing === "model") saved.delete(modelRoot + "onnx/model_quantized.onnx");
      if (missing === "runtime-module") saved.delete(artifactKeys[5]!);
      if (missing === "runtime-wasm") saved.delete(artifactKeys[6]!);
      const { send, network, postMessage } = await setup(saved, missing === "blocked-cache");
      await send({ type: "load", id: 1, cacheOnly: true });
      expect(postMessage).toHaveBeenLastCalledWith({ type: "error", id: 1 });
      expect(network).not.toHaveBeenCalled();
      expect(transformers.tokenizer).not.toHaveBeenCalled();
      expect(transformers.model).not.toHaveBeenCalled();
    },
  );

  it("restores a complete cache with local-only model options and closed fetch", async () => {
    const { send, network, postMessage } = await setup();
    await send({ type: "load", id: 1, cacheOnly: true });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "ready", id: 1 });
    expect(transformers.tokenizer).toHaveBeenCalledWith(creativeWriterModelId,
      expect.objectContaining({ revision: creativeWriterModelRevision, local_files_only: true }));
    expect(transformers.model).toHaveBeenCalledWith(creativeWriterModelId,
      expect.objectContaining({ local_files_only: true, device: "wasm", dtype: "q8" }));
    expect(transformers.env.allowRemoteModels).toBe(false);
    expect(transformers.env.fetch).toBe(globalThis.fetch);
    await expect(fetch("https://example.test/should-not-download")).rejects.toThrow("network is closed");
    expect(network).not.toHaveBeenCalled();
  });

  it("blocks a loader fetch even if an artifact disappears after the cache precheck", async () => {
    const { send, network, postMessage } = await setup();
    transformers.tokenizer.mockImplementationOnce(async () => {
      await fetch(modelRoot + "tokenizer.json");
      return {};
    });
    await send({ type: "load", id: 1, cacheOnly: true });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "error", id: 1 });
    expect(network).not.toHaveBeenCalled();
    expect(transformers.model).not.toHaveBeenCalled();
  });

  it("preserves explicit first-use runtime downloads and remote model loading", async () => {
    const { send, network, postMessage } = await setup(new Set());
    await send({ type: "load", id: 1 });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "ready", id: 1 });
    expect(network).toHaveBeenCalledTimes(2);
    expect(transformers.tokenizer).toHaveBeenCalledWith(creativeWriterModelId,
      expect.objectContaining({ local_files_only: false }));
    expect(transformers.model).toHaveBeenCalledWith(creativeWriterModelId,
      expect.objectContaining({ local_files_only: false }));
  });
});
