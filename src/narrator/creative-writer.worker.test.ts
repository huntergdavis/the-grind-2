import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LogitProcessor, MLCEngineConfig } from "@mlc-ai/web-llm";
import { creativeWriterModelId, creativeWriterModelUrl, creativeWriterModelLib } from "./creative-writer-model";
import { creativeStoryMemoryPrefix } from "./creative-continuity";

const runtime = vi.hoisted(() => ({
  construct: vi.fn(), reload: vi.fn(), resetChat: vi.fn(), create: vi.fn(),
  interrupt: vi.fn(), drained: vi.fn(), processor: null as LogitProcessor | null,
}));
const cache = vi.hoisted(() => ({ inspect: vi.fn() }));
vi.mock("@mlc-ai/web-llm", () => ({
  MLCEngine: class {
    chat = { completions: { create: runtime.create } };
    reload = runtime.reload;
    resetChat = runtime.resetChat;
    interruptGenerate = runtime.interrupt;
    constructor(config: MLCEngineConfig) {
      runtime.construct(config);
      runtime.processor = config.logitProcessorRegistry?.get(creativeWriterModelId) ?? null;
    }
  },
}));
vi.mock("./creative-writer-cache", async (original) => ({
  ...await original<typeof import("./creative-writer-cache")>(),
  hasCachedCreativeWriterModel: cache.inspect,
}));

function stream(pieces = ["Mara listened. Rowan smiled."]) {
  return (async function* () {
    runtime.processor?.resetState(); // Real WebLLM resets during prefill as well as resetChat.
    for (const content of pieces) yield { choices: [{ delta: { content } }] };
    yield { choices: [], usage: { completion_tokens: pieces.length } };
    // This executes only if the consumer drains the final chunk, not merely calls return().
    runtime.drained();
  })();
}
const prompt = [{ role: "user", content: "Write a brief story." }];

beforeEach(() => {
  vi.resetModules();
  runtime.processor = null;
  for (const mock of [runtime.construct, runtime.reload, runtime.resetChat, runtime.create, runtime.interrupt, runtime.drained, cache.inspect]) mock.mockReset();
  runtime.reload.mockResolvedValue(undefined);
  runtime.resetChat.mockImplementation(async () => { runtime.processor?.resetState(); });
  runtime.create.mockImplementation(async () => stream());
  cache.inspect.mockResolvedValue(true);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function setup(options: { cached?: boolean; storageUnavailable?: boolean; gpu?: "missing" | "no-f16" | "reject" } = {}) {
  let handler: (event: MessageEvent<unknown>) => Promise<void> = async () => { throw Error("Worker not installed"); };
  const postMessage = vi.fn();
  const network = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
  const storageHas = vi.fn(async () => { if (options.storageUnavailable) throw Error("Cache unavailable"); return true; });
  const requestAdapter = options.gpu === "reject" ? vi.fn().mockRejectedValue(Error("GPU unavailable"))
    : vi.fn().mockResolvedValue(options.gpu === "missing" ? null : { features: new Set(options.gpu === "no-f16" ? [] : ["shader-f16"]) });
  if (options.cached !== undefined) cache.inspect.mockResolvedValue(options.cached);
  vi.stubGlobal("fetch", network);
  vi.stubGlobal("importScripts", () => undefined);
  // Native Cache.add/addAll fetch without using the JavaScript fetch override.
  vi.stubGlobal("Cache", class {
    async add() { await network(); }
    async addAll() { await network(); }
  });
  vi.stubGlobal("caches", { has: storageHas });
  vi.stubGlobal("navigator", { gpu: { requestAdapter } });
  vi.stubGlobal("self", { postMessage,
    addEventListener: (_type: string, listener: typeof handler) => { handler = listener; } });
  await import("./creative-writer.worker");
  return { network, postMessage, storageHas, requestAdapter,
    send: (request: unknown) => handler({ data: request } as MessageEvent<unknown>) };
}
async function expectClosed(network: ReturnType<typeof vi.fn>) {
  await expect(fetch("https://example.test/no-download")).rejects.toThrow("cannot download");
  await expect(new Cache().add("https://example.test/no-native-download")).rejects.toThrow("cannot download");
  await expect(new Cache().addAll(["https://example.test/no-native-download"])).rejects.toThrow("cannot download");
  expect(network).not.toHaveBeenCalled();
}

describe("GPU creative writer loading and permanent network closure", () => {
  it.each(["missing", "no-f16", "reject"] as const)("rejects %s GPU before cache inspection or downloads", async (gpu) => {
    const { send, postMessage, storageHas, network } = await setup({ gpu, cached: false });
    await send({ type: "load", id: 1 });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "error", id: 1, code: "unsupported-gpu" });
    expect(storageHas).not.toHaveBeenCalled();
    expect(cache.inspect).not.toHaveBeenCalled();
    expect(runtime.construct).not.toHaveBeenCalled();
    await expectClosed(network);
  });
  it("fails unavailable storage instead of choosing a downloading no-storage backend", async () => {
    const { send, postMessage, network } = await setup({ storageUnavailable: true });
    await send({ type: "load", id: 1, cacheOnly: true });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "error", id: 1, code: "storage-unavailable" });
    expect(runtime.reload).not.toHaveBeenCalled();
    await expectClosed(network);
  });
  it("closes network before inspecting an automatic restore and rejects incomplete cache", async () => {
    const { send, postMessage, network } = await setup();
    cache.inspect.mockImplementation(async () => { await expectClosed(network); return false; });
    await send({ type: "load", id: 1, cacheOnly: true });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "error", id: 1, code: "cache-incomplete" });
    expect(runtime.construct).not.toHaveBeenCalled();
  });
  it.each([true, false])("restores complete cache without downloads, cacheOnly=%s", async (cacheOnly) => {
    const { send, postMessage, network } = await setup();
    runtime.reload.mockImplementation(async () => { await expectClosed(network); });
    await send({ type: "load", id: 1, cacheOnly });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "ready", id: 1 });
    expect(runtime.reload).toHaveBeenCalledWith(creativeWriterModelId, { context_window_size: 1024 });
    const config = runtime.construct.mock.calls[0]![0] as MLCEngineConfig;
    expect(config.logLevel).toBe("ERROR");
    expect(config.appConfig).toMatchObject({ cacheBackend: "cache", model_list: [{
      model: creativeWriterModelUrl, model_id: creativeWriterModelId, model_lib: creativeWriterModelLib,
      required_features: ["shader-f16"], overrides: { context_window_size: 1024 },
    }] });
    expect(config.logitProcessorRegistry?.get(creativeWriterModelId)).toBe(runtime.processor);
    await expectClosed(network);
  });
  it.each(["fetch", "add", "addAll"])("cannot repair an evicted artifact using %s after the precheck", async (method) => {
    const { send, postMessage, network } = await setup();
    runtime.reload.mockImplementation(async () => {
      if (method === "fetch") await fetch(creativeWriterModelUrl + "tokenizer.json");
      else if (method === "add") await new Cache().add(creativeWriterModelUrl + "tokenizer.json");
      else await new Cache().addAll([creativeWriterModelUrl + "tokenizer.json"]);
    });
    await send({ type: "load", id: 1, cacheOnly: true });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "error", id: 1 });
    await expectClosed(network);
  });
  it.each([false, true])("permits explicit first load, then closes network even when reload fails=%s", async (fails) => {
    const { send, postMessage, network } = await setup({ cached: false });
    runtime.reload.mockImplementation(async () => {
      await fetch(creativeWriterModelUrl + "mlc-chat-config.json");
      if (fails) throw Error("Load failure");
    });
    await send({ type: "load", id: 1 });
    expect(network).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenLastCalledWith({ type: fails ? "error" : "ready", id: 1 });
    network.mockClear();
    await expectClosed(network);
  });
});

describe("GPU writer one-token DM score boundary", () => {
  const directionPrompt = [{ role: "user", content: "Choose 1, 2, or 3." }];
  it.each([16, 17, 18])("preserves the winning score for token %s, then writes twice without reloading", async (winning) => {
    runtime.create.mockImplementationOnce(async (options) => {
      expect(options).toMatchObject({ stream: false, max_tokens: 1, temperature: 0, top_p: 1, seed: 7 });
      runtime.processor!.resetState(); // Must not remove the active mask.
      const scores = new Float32Array(32).fill(999);
      scores[16] = -3; scores[17] = -2; scores[18] = -1; scores[winning] = 0.5;
      const result = runtime.processor!.processLogits(scores);
      expect(result).toBe(scores);
      expect([...scores].filter(Number.isFinite)).toHaveLength(3);
      expect(scores[winning]).toBe(0.5);
      expect([...scores].indexOf(Math.max(...scores))).toBe(winning);
      runtime.processor!.processSampledToken(winning);
      return { choices: [{ message: { content: String(winning - 15) } }] };
    });
    const { send, postMessage } = await setup();
    await send({ type: "load", id: 1, cacheOnly: true });
    await send({ type: "direct", id: 2, messages: directionPrompt, max_tokens: 999 });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "direction", id: 2, choice: String(winning - 15) });
    const proseScores = new Float32Array([0.2, -4, 9]);
    expect(runtime.processor!.processLogits(proseScores)).toEqual(new Float32Array([0.2, -4, 9]));
    for (const id of [3, 4]) {
      await send({ type: "write", id, messages: prompt });
      expect(postMessage).toHaveBeenLastCalledWith({ type: "result", id, text: "Mara listened. Rowan smiled." });
    }
    expect(runtime.reload).toHaveBeenCalledTimes(1);
    expect(runtime.resetChat).toHaveBeenCalledTimes(3);
    expect(runtime.drained).toHaveBeenCalledTimes(2);
    expect(runtime.create).toHaveBeenLastCalledWith(expect.objectContaining({ stream: true, max_tokens: 64, temperature: 0.7, top_p: 0.85, seed: 7 }));
  });
  it.each(["1", "2", "3"] as const)("excludes label %s without changing the two eligible scores", async (exclude) => {
    const allowed = [16, 17, 18].filter((id) => id !== 15 + Number(exclude));
    runtime.create.mockImplementationOnce(async () => {
      runtime.processor!.resetState();
      const scores = new Float32Array(32).fill(999);
      scores[allowed[0]!] = 0.5; scores[allowed[1]!] = -1;
      runtime.processor!.processLogits(scores);
      expect(scores[15 + Number(exclude)]).toBe(-Infinity);
      expect([...scores].filter(Number.isFinite)).toEqual([0.5, -1]);
      runtime.processor!.processSampledToken(allowed[0]!);
      return { choices: [{ message: { content: String(allowed[0]! - 15) } }] };
    });
    const { send, postMessage } = await setup();
    await send({ type: "load", id: 1 });
    await send({ type: "direct", id: 2, messages: directionPrompt, exclude });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "direction", id: 2, choice: String(allowed[0]! - 15) });
  });
  it.each([
    { tokens: [], text: "1", exclude: undefined },
    { tokens: [99], text: "1", exclude: undefined },
    { tokens: [16, 17], text: "1", exclude: undefined },
    { tokens: [16], text: "2", exclude: undefined },
    { tokens: [16], text: " 1", exclude: undefined },
    { tokens: [16], text: "1", exclude: "1" },
  ])("rejects a sampled/literal mismatch %# and clears the mask for later prose", async ({ tokens, text, exclude }) => {
    runtime.create.mockImplementationOnce(async () => {
      tokens.forEach((token) => runtime.processor!.processSampledToken(token));
      return { choices: [{ message: { content: text } }] };
    });
    const { send, postMessage } = await setup();
    await send({ type: "load", id: 1 });
    await send({ type: "direct", id: 2, messages: directionPrompt, exclude });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "direction", id: 2, choice: null });
    await send({ type: "write", id: 3, messages: prompt });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "result", id: 3, text: "Mara listened. Rowan smiled." });
  });
  it.each([NaN, Infinity, -Infinity])("rejects nonfinite eligible model scores %s", async (bad) => {
    runtime.create.mockImplementationOnce(async () => {
      const scores = new Float32Array(32); scores[16] = bad;
      runtime.processor!.processLogits(scores);
    });
    const { send, postMessage } = await setup();
    await send({ type: "load", id: 1 });
    await send({ type: "direct", id: 2, messages: directionPrompt });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "error", id: 2 });
    expect(runtime.processor!.processLogits(new Float32Array([3]))[0]).toBe(3);
  });
  it("rejects malformed exclusion before generation", async () => {
    const { send, postMessage } = await setup();
    await send({ type: "load", id: 1 });
    await send({ type: "direct", id: 2, messages: directionPrompt, exclude: ["1", "2"] });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "error", id: 2 });
    expect(runtime.create).not.toHaveBeenCalled();
  });
});

describe("GPU writer production memory context budget", () => {
  const messages = [
    { role: "system", content: "Current facts override imagined prose." },
    { role: "user", content: creativeStoryMemoryPrefix + '"Mara feared the road."' },
    { role: "user", content: creativeStoryMemoryPrefix + '"Mara hoped Rowan would stay."' },
    { role: "user", content: "Mara and injured Rowan reached Greyford. Write the scene." },
  ];
  const overflow = () => Object.assign(new Error("Prompt exceeds 1024 tokens"), { name: "ContextWindowSizeExceededError" });
  it.each([0, 1, 2])("drops exactly %s oldest optional memories only on runtime context rejection", async (drops) => {
    runtime.create.mockImplementation(async (options) => {
      if (options.messages.length > 6 - drops * 2) throw overflow();
      return stream();
    });
    const { send, postMessage } = await setup();
    await send({ type: "load", id: 1 });
    await send({ type: "write", id: 2, messages });
    expect(runtime.create).toHaveBeenCalledTimes(drops + 1);
    expect(runtime.create.mock.calls.at(-1)![0].messages).toEqual([messages[0],
      ...["Mara feared the road.", "Mara hoped Rowan would stay."].slice(drops)
        .flatMap((content) => [{ role: "user", content: expect.stringContaining("Earlier imagined moment") },
          { role: "assistant", content }]), messages[3]]);
    expect(messages[1]!.content).toBe(creativeStoryMemoryPrefix + '"Mara feared the road."');
    expect(messages[2]!.content).toBe(creativeStoryMemoryPrefix + '"Mara hoped Rowan would stay."');
    expect(messages).toHaveLength(4);
    expect(runtime.resetChat).toHaveBeenCalledTimes(drops + 1);
    expect(postMessage).toHaveBeenLastCalledWith({ type: "result", id: 2, text: "Mara listened. Rowan smiled." });
  });
  it("stops after both memories are removed if current facts still exceed context", async () => {
    runtime.create.mockRejectedValue(overflow());
    const { send, postMessage } = await setup();
    await send({ type: "load", id: 1 });
    await send({ type: "write", id: 2, messages });
    expect(runtime.create).toHaveBeenCalledTimes(3);
    expect(runtime.create.mock.calls.at(-1)![0].messages).toEqual([messages[0], messages[3]]);
    expect(postMessage).toHaveBeenLastCalledWith({ type: "error", id: 2 });
  });
  it("fails malformed recognized prose history before model generation", async () => {
    const { send, postMessage } = await setup();
    await send({ type: "load", id: 1 });
    await send({ type: "write", id: 2, messages: [messages[0],
      { role: "user", content: creativeStoryMemoryPrefix + "not JSON" }, messages[3]] });
    expect(runtime.create).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenLastCalledWith({ type: "error", id: 2 });
  });
  it.each(["required-middle", "generic-error", "already-generated", "direction"])("does not retry or shed history for %s", async (condition) => {
    runtime.create.mockImplementation(async () => {
      if (condition === "already-generated") return (async function* () {
        yield { choices: [{ delta: { content: "Some prose" } }] }; throw overflow();
      })();
      throw condition === "generic-error" ? new Error("GPU failure") : overflow();
    });
    const { send, postMessage } = await setup();
    await send({ type: "load", id: 1 });
    await send({ type: condition === "direction" ? "direct" : "write", id: 2,
      messages: condition === "required-middle" ? [messages[0], { role: "user", content: "Required facts." }, messages[3]] : messages });
    expect(runtime.create).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenLastCalledWith({ type: "error", id: 2 });
  });
});

describe("GPU story streaming lifecycle and wire validation", () => {
  it("drains even a rejected interruption before reporting failure and accepting another write", async () => {
    runtime.create.mockResolvedValueOnce(stream(["Mara listened. Rowan smiled. The", " ignored tail"]));
    runtime.interrupt.mockRejectedValueOnce(Error("Interruption failed"));
    const { send, postMessage } = await setup();
    await send({ type: "load", id: 1 });
    await send({ type: "write", id: 2, messages: prompt });
    expect(runtime.drained).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenLastCalledWith({ type: "error", id: 2 });
    await send({ type: "write", id: 3, messages: prompt });
    expect(runtime.drained).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenLastCalledWith({ type: "result", id: 3, text: "Mara listened. Rowan smiled." });
  });
  it("interrupts after two sentences plus lookahead but fully drains before another write", async () => {
    runtime.create.mockResolvedValueOnce(stream(["Mara listened", ".", " Rowan smiled", ".", " The", " ignored tail"]));
    const { send, postMessage } = await setup();
    await send({ type: "load", id: 1 });
    await send({ type: "write", id: 2, messages: prompt });
    expect(runtime.interrupt).toHaveBeenCalledTimes(1);
    expect(runtime.drained).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenLastCalledWith({ type: "result", id: 2, text: "Mara listened. Rowan smiled. The" });
    runtime.create.mockResolvedValueOnce(stream(["Only one sentence."]));
    await send({ type: "write", id: 3, messages: prompt });
    expect(runtime.drained).toHaveBeenCalledTimes(2);
    expect(runtime.interrupt).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenLastCalledWith({ type: "result", id: 3, text: "Only one sentence." });
  });
  it("retains the 64-token request cap when no sentence pair completes", async () => {
    runtime.create.mockImplementation(async (options) => {
      expect(options.max_tokens).toBe(64);
      return stream(Array.from({ length: options.max_tokens }, () => "still "));
    });
    const { send, postMessage } = await setup();
    await send({ type: "load", id: 1 });
    await send({ type: "write", id: 2, messages: prompt });
    expect(runtime.interrupt).not.toHaveBeenCalled();
    expect(runtime.drained).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenLastCalledWith({ type: "result", id: 2, text: "still ".repeat(64).trim() });
  });
  it.each(["", "x".repeat(4001)])("rejects malformed output after draining %#", async (text) => {
    runtime.create.mockResolvedValueOnce(stream([text]));
    const { send, postMessage } = await setup();
    await send({ type: "load", id: 1 });
    await send({ type: "write", id: 2, messages: prompt });
    expect(runtime.drained).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenLastCalledWith({ type: "error", id: 2 });
  });
  it("rejects a concurrent operation without stranding the original busy state", async () => {
    let release!: () => void;
    runtime.create.mockImplementationOnce(async () => {
      await new Promise<void>((accept) => { release = accept; }); return stream();
    });
    const { send, postMessage } = await setup();
    await send({ type: "load", id: 1 });
    const first = send({ type: "write", id: 2, messages: prompt });
    await vi.waitFor(() => expect(runtime.create).toHaveBeenCalledTimes(1));
    await send({ type: "write", id: 3, messages: prompt });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "error", id: 3 });
    release(); await first;
    await send({ type: "write", id: 4, messages: prompt });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "result", id: 4, text: "Mara listened. Rowan smiled." });
  });
  it.each([[], [{ role: "assistant", content: "No." }], [{ role: "user", content: " " }],
    [{ role: "user", content: "x".repeat(4001) }], Array(5).fill({ role: "user", content: "x" }),
    Array(3).fill({ role: "user", content: "x".repeat(3000) })])("preserves invalid-prompt rejection %#", async (messages) => {
    const { send, postMessage } = await setup();
    await send({ type: "load", id: 1 });
    await send({ type: "write", id: 2, messages });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "error", id: 2 });
    expect(runtime.create).not.toHaveBeenCalled();
  });
  it("ignores malformed request IDs and rejects operations before load", async () => {
    const { send, postMessage } = await setup();
    for (const id of [0, -1, 1.2, "1", NaN]) await send({ type: "load", id });
    expect(postMessage).not.toHaveBeenCalled();
    await send({ type: "write", id: 1, messages: prompt });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "error", id: 1 });
    expect(runtime.create).not.toHaveBeenCalled();
  });
});
