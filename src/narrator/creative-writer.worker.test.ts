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
  LogitsProcessor: class {},
  LogitsProcessorList: class {
    processors: unknown[] = [];
    push(processor: unknown) { this.processors.push(processor); }
  },
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

describe("creative writer one-token direction", () => {
  const messages = [{ role: "user", content: "Choose 1, 2, or 3 for this scene." }];
  function fakeTokenizer(inputLength = 2) {
    return {
      apply_chat_template: vi.fn(() => ({ input_ids: { dims: [1, inputLength] } })),
      encode: vi.fn((label: string) => [32 + Number(label)]),
      decode: vi.fn((ids: number[]) => ids.length === 1 && ids[0]! >= 33 && ids[0]! <= 35
        ? String(ids[0]! - 32) : "Ordinary prose."),
    };
  }

  it.each([33, 34, 35])("emits model-scored label token %s then writes prose without another load", async (winningToken) => {
    const tokenizer = fakeTokenizer();
    transformers.tokenizer.mockResolvedValue(tokenizer);
    const generate = vi.fn(async (options: { max_new_tokens: number; logits_processor?: { processors: { _call(ids: bigint[][], logits: unknown): unknown }[] } }) => {
      if (options.max_new_tokens === 1) {
        const data = new Float32Array(40).fill(100);
        data[33] = -3; data[34] = -2; data[35] = -1;
        data[winningToken] = 0.5;
        options.logits_processor!.processors[0]!._call([[7n, 8n]], { dims: [1, 40], data });
        expect([...data].indexOf(Math.max(...data))).toBe(winningToken);
        return { tolist: () => [[7n, 8n, BigInt(winningToken)]] };
      }
      return { tolist: () => [[7n, 8n, 99n]] };
    });
    transformers.model.mockResolvedValue({ generate });
    const { send, postMessage, network } = await setup();
    await send({ type: "load", id: 1, cacheOnly: true });
    await send({ type: "direct", id: 2, messages, max_new_tokens: 999 });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "direction", id: 2, choice: String(winningToken - 32) });
    expect(generate).toHaveBeenNthCalledWith(1, expect.objectContaining({ max_new_tokens: 1, do_sample: false, repetition_penalty: 1 }));
    for (const label of ["1", "2", "3"]) expect(tokenizer.encode).toHaveBeenCalledWith(label, { add_special_tokens: false });
    await send({ type: "write", id: 3, messages });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "result", id: 3, text: "Ordinary prose." });
    expect(generate).toHaveBeenNthCalledWith(2, expect.objectContaining({ max_new_tokens: 64, do_sample: false, repetition_penalty: 1.08 }));
    expect(generate.mock.calls[1]![0]).not.toHaveProperty("logits_processor");
    expect(transformers.model).toHaveBeenCalledTimes(1);
    expect(network).not.toHaveBeenCalled();
  });

  it.each([
    { name: "outside labels", tokens: [99n] },
    { name: "empty suffix", tokens: [] },
    { name: "multiple tokens", tokens: [33n, 34n] },
  ])("returns null for completed $name without reloading", async ({ tokens }) => {
    transformers.tokenizer.mockResolvedValue(fakeTokenizer());
    const generate = vi.fn().mockResolvedValueOnce({ tolist: () => [[7n, 8n, ...tokens]] })
      .mockResolvedValueOnce({ tolist: () => [[7n, 8n, 99n]] });
    transformers.model.mockResolvedValue({ generate });
    const { send, postMessage } = await setup();
    await send({ type: "load", id: 1, cacheOnly: true });
    await send({ type: "direct", id: 2, messages });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "direction", id: 2, choice: null });
    await send({ type: "write", id: 3, messages });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "result", id: 3, text: "Ordinary prose." });
    expect(transformers.model).toHaveBeenCalledTimes(1);
  });

  it("rejects a direction over512 tokens before generation", async () => {
    transformers.tokenizer.mockResolvedValue(fakeTokenizer(513));
    const generate = vi.fn();
    transformers.model.mockResolvedValue({ generate });
    const { send, postMessage } = await setup();
    await send({ type: "load", id: 1, cacheOnly: true });
    await send({ type: "direct", id: 2, messages });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "error", id: 2 });
    expect(generate).not.toHaveBeenCalled();
  });

  it.each(["split", "decode"])("rejects %s label mismatches before generation", async (mismatch) => {
    const tokenizer = fakeTokenizer();
    if (mismatch === "split") tokenizer.encode.mockReturnValueOnce([33, 34]);
    else tokenizer.decode.mockReturnValueOnce("not a label");
    transformers.tokenizer.mockResolvedValue(tokenizer);
    const generate = vi.fn();
    transformers.model.mockResolvedValue({ generate });
    const { send, postMessage } = await setup();
    await send({ type: "load", id: 1, cacheOnly: true });
    await send({ type: "direct", id: 2, messages });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "error", id: 2 });
    expect(generate).not.toHaveBeenCalled();
  });

  it.each(["1", "2", "3"])("scores exactly two eligible tokens when label%s is excluded", async (exclude) => {
    transformers.tokenizer.mockResolvedValue(fakeTokenizer());
    const excluded = 32 + Number(exclude);
    const allowed = [33, 34, 35].filter((id) => id !== excluded);
    const generate = vi.fn(async (options: { logits_processor: { processors: { _call(ids: bigint[][], logits: unknown): unknown }[] } }) => {
      const data = new Float32Array(40).fill(999);
      data[allowed[0]!] = 0.5;
      data[allowed[1]!] = -1;
      options.logits_processor.processors[0]!._call([[7n, 8n]], { dims: [1, 40], data });
      expect(data[excluded]).toBe(-Infinity);
      expect([...data].filter(Number.isFinite)).toEqual([0.5, -1]);
      return { tolist: () => [[7n, 8n, BigInt(allowed[0]!)]] };
    });
    transformers.model.mockResolvedValue({ generate });
    const { send, postMessage } = await setup();
    await send({ type: "load", id: 1, cacheOnly: true });
    await send({ type: "direct", id: 2, messages, exclude });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "direction", id: 2, choice: String(allowed[0]! - 32) });
  });

  it("rejects an excluded generated token and malformed exclusion values", async () => {
    transformers.tokenizer.mockResolvedValue(fakeTokenizer());
    const generate = vi.fn().mockResolvedValue({ tolist: () => [[7n, 8n, 33n]] });
    transformers.model.mockResolvedValue({ generate });
    const { send, postMessage } = await setup();
    await send({ type: "load", id: 1, cacheOnly: true });
    await send({ type: "direct", id: 2, messages, exclude: "1" });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "direction", id: 2, choice: null });
    generate.mockClear();
    await send({ type: "direct", id: 3, messages, exclude: ["1", "2"] });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "error", id: 3 });
    expect(generate).not.toHaveBeenCalled();
  });
});
