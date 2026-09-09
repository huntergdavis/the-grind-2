/// <reference lib="webworker" />

import { MLCEngine, type LogitProcessor } from "@mlc-ai/web-llm";
import type { CreativeWriterMessage } from "./creative-writer-client";
import { createCreativeDirectionMask } from "./creative-direction-logits";
import { hasFinishedCreativeStoryPassage } from "./creative-story-sentences";
import { creativeStoryMemoryPrefix } from "./creative-continuity";
import { creativeWriterModelId, creativeWriterModelUrl, creativeWriterModelLib, creativeWriterCacheScopes } from "./creative-writer-model";
import { blockCreativeWriterNetwork, hasCachedCreativeWriterModel } from "./creative-writer-cache";
import { buildCreativeWriterConversation } from "./creative-writer-conversation";
import { createCreativeWriterDiagnostics } from "./creative-writer-diagnostics";
// BEGIN live sentence budget imports
import { cleanCreativeStoryOutput } from "./creative-story";
import { creativeStoryHardLimitMs, selectCreativeStoryBudgetFallback, type CreativeStoryBudgetSelection } from "./creative-story-budget";
// END live sentence budget imports

const workerScope = self as DedicatedWorkerGlobalScope;
let model: MLCEngine | null = null;
let busy = false;
let directionMask: ReturnType<typeof createCreativeDirectionMask> | null = null;
const sampledTokens: number[] = [];
// Explicit manual-probe build only; normal game builds do not collect or log scores.
const diagnostics = import.meta.env.VITE_CREATIVE_WRITER_DIAGNOSTICS === "1"
  ? createCreativeWriterDiagnostics() : null;
// Exact single-token labels verified against this pinned Qwen tokenizer.json.
const directionTokens = { "1": 16, "2": 17, "3": 18 } as const;
const processor: LogitProcessor = {
  processLogits: (data) => {
    if (directionMask === null) diagnostics?.observeLogits(data);
    return directionMask === null ? data : directionMask({ dims: [1, data.length], data }).data;
  },
  processSampledToken: (token) => {
    if (directionMask !== null) sampledTokens.push(token);
    else diagnostics?.observeToken(token);
  },
  // WebLLM also resets this during prefill: the current operation's mask must survive.
  resetState: () => { sampledTokens.length = 0; },
};
type SetupErrorCode = "unsupported-gpu" | "storage-unavailable" | "cache-incomplete";
class WriterSetupError extends Error {
  constructor(readonly code: SetupErrorCode) { super(code); }
}

async function load(id: number, cacheOnly: boolean): Promise<void> {
  if (model !== null) return;
  if (cacheOnly) blockCreativeWriterNetwork();
  try {
    const adapter = await navigator.gpu?.requestAdapter().catch(() => null);
    if (!adapter?.features.has("shader-f16")) throw new WriterSetupError("unsupported-gpu");
    try {
      if (typeof caches === "undefined") throw new Error("No cache storage");
      await caches.has(creativeWriterCacheScopes.model);
    } catch { throw new WriterSetupError("storage-unavailable"); }
    const cached = await hasCachedCreativeWriterModel();
    if (cacheOnly && !cached) throw new WriterSetupError("cache-incomplete");
    if (cached) blockCreativeWriterNetwork();
    const preparing = cached ? "Restoring saved creative writer…" : "Downloading creative writer for this browser…";
    workerScope.postMessage({ type: "progress", id, message: preparing });
    const candidate = new MLCEngine({
      logLevel: "ERROR",
      appConfig: { cacheBackend: "cache", model_list: [{
        model: creativeWriterModelUrl, model_id: creativeWriterModelId, model_lib: creativeWriterModelLib,
        required_features: ["shader-f16"], overrides: { context_window_size: 1024 },
      }] },
      // This is a DIRECT engine in our existing worker. The WebWorker wrapper ignores this registry.
      logitProcessorRegistry: new Map([[creativeWriterModelId, processor]]),
      initProgressCallback: ({ progress }) => workerScope.postMessage({ type: "progress", id,
        message: cached ? preparing : Number.isFinite(progress)
          ? `Preparing creative writer · ${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`
          : "Preparing creative writer in this browser…" }),
    });
    await candidate.reload(creativeWriterModelId, { context_window_size: 1024 });
    model = candidate;
  } finally {
    // Close fetch AND native Cache.add/addAll, including failed/evicted restores.
    blockCreativeWriterNetwork();
  }
}

function readMessages(value: unknown): CreativeWriterMessage[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) throw new Error("Invalid prompt");
  const messages = value.map((message: unknown): CreativeWriterMessage => {
    if (message === null || typeof message !== "object") throw new Error("Invalid prompt");
    const entry = message as Record<string, unknown>;
    if ((entry.role !== "system" && entry.role !== "user") || typeof entry.content !== "string"
      || entry.content.trim().length === 0 || entry.content.length > 4_000) throw new Error("Invalid prompt");
    return { role: entry.role, content: entry.content };
  });
  if (messages.reduce((length, message) => length + message.content.length, 0) > 8_000) {
    throw new Error("Prompt is too long");
  }
  return messages;
}

async function write(messages: CreativeWriterMessage[]): Promise<string> {
  if (model === null) throw new Error("Load the writer first");
  directionMask = null;
  // BEGIN live sentence budget clock
  const storyStarted = performance.now();
  // END live sentence budget clock
  let boundedMessages = messages;
  while (true) {
    await model.resetChat(false, creativeWriterModelId);
    let text = "", interrupted = false;
    // BEGIN live sentence budget attempt
    let budgetSelection: CreativeStoryBudgetSelection | null = null;
    let receivedText = "", receivedCharacters = 0;
    // END live sentence budget attempt
    let interruptionError: Error | null = null;
    try {
      const chunks = await model.chat.completions.create({ model: creativeWriterModelId,
        messages: buildCreativeWriterConversation(boundedMessages), stream: true, max_tokens: 64, temperature: 0.7, top_p: 0.85, seed: 7 });
      for await (const chunk of chunks) {
        // BEGIN live sentence budget capture
        const receivedDelta = chunk.choices[0]?.delta.content ?? "";
        receivedCharacters += receivedDelta.length;
        receivedText += receivedDelta.slice(0, Math.max(0, 4_000 - receivedText.length));
        // END live sentence budget capture
        if (!interrupted) {
          text += chunk.choices[0]?.delta.content ?? "";
          // BEGIN live sentence budget stop
          const normalStop = text.length > 4_000 || hasFinishedCreativeStoryPassage(text);
          if (!normalStop) budgetSelection = selectCreativeStoryBudgetFallback(text, performance.now() - storyStarted);
          // END live sentence budget stop
          if (text.length > 4_000 || hasFinishedCreativeStoryPassage(text) || budgetSelection !== null) {
            interrupted = true;
            try { await model.interruptGenerate(); }
            catch (error) { interruptionError = error instanceof Error ? error : new Error("Could not interrupt the writer"); }
          }
        }
        // Do not break: WebLLM releases its per-model lock only after the stream's final chunks.
      }
      if (interruptionError !== null) throw interruptionError;
      // BEGIN live sentence budget settlement
      if (budgetSelection !== null) {
        const elapsedMs = performance.now() - storyStarted;
        if (receivedCharacters > receivedText.length || cleanCreativeStoryOutput(receivedText) === null
          || elapsedMs >= creativeStoryHardLimitMs) throw new Error("Incomplete narrative settlement");
        text = budgetSelection.text;
        if (diagnostics !== null) {
          try {
            console.debug("TG2_WRITER_BUDGET " + JSON.stringify({ mode: "completed-sentence-budget-fallback",
              sentenceCount: budgetSelection.sentenceCount, elapsedMs, stopElapsedMs: budgetSelection.elapsedMs,
              originalCharacters: receivedCharacters, discardedCharacters: receivedCharacters - text.length }));
          } catch { /* Optional observation cannot replace the settled story. */ }
        }
      }
      // END live sentence budget settlement
      const result = text.trim();
      if (!result || result.length > 4_000) throw new Error("Invalid generated text");
      return result;
    } catch (error) {
      // The pinned runtime throws this exact error before prefill, with its lock released.
      // Shed only oldest optional memories, never an arbitrary message or current facts.
      if (text.length === 0 && error instanceof Error && error.name === "ContextWindowSizeExceededError"
        && boundedMessages.length > 2 && boundedMessages[0]?.role === "system" && boundedMessages.at(-1)?.role === "user"
        && boundedMessages.slice(1, -1).every((message) => message.role === "user" && message.content.startsWith(creativeStoryMemoryPrefix))) {
        boundedMessages = [boundedMessages[0]!, ...boundedMessages.slice(2)];
      } else throw error;
    }
  }
}

async function direct(messages: CreativeWriterMessage[], exclude: unknown): Promise<string | null> {
  if (model === null) throw new Error("Load the writer first");
  if (exclude !== undefined && exclude !== "1" && exclude !== "2" && exclude !== "3") {
    throw new Error("Direction exclusion must be one label");
  }
  const labels = (["1", "2", "3"] as const).filter((label) => label !== exclude);
  directionMask = createCreativeDirectionMask(labels.map((label) => directionTokens[label]));
  try {
    await model.resetChat(false, creativeWriterModelId);
    const result = await model.chat.completions.create({ model: creativeWriterModelId, messages,
      stream: false, max_tokens: 1, temperature: 0, top_p: 1, seed: 7 });
    if (sampledTokens.length !== 1 || result.choices.length !== 1) return null;
    const label = labels.find((candidate) => directionTokens[candidate] === sampledTokens[0]);
    return label !== undefined && result.choices[0]?.message.content === label ? label : null;
  } finally {
    directionMask = null;
    sampledTokens.length = 0;
  }
}

workerScope.addEventListener("message", async (event: MessageEvent<unknown>) => {
  if (event.data === null || typeof event.data !== "object") return;
  const request = event.data as Record<string, unknown>;
  const id = request.id;
  if (!Number.isSafeInteger(id) || typeof id !== "number" || id < 1) return;
  if (busy) { workerScope.postMessage({ type: "error", id }); return; }
  busy = true;
  diagnostics?.reset();
  try {
    if (request.type === "load") {
      await load(id, request.cacheOnly === true);
      workerScope.postMessage({ type: "ready", id });
    } else if (request.type === "write") {
      const text = await write(readMessages(request.messages));
      workerScope.postMessage({ type: "result", id, text });
    } else if (request.type === "direct") {
      const choice = await direct(readMessages(request.messages), request.exclude);
      workerScope.postMessage({ type: "direction", id, choice });
    } else {
      throw new Error("Unknown writer request");
    }
  } catch (error) {
    workerScope.postMessage({ type: "error", id, ...(error instanceof WriterSetupError ? { code: error.code } : {}) });
  } finally {
    if (request.type === "write" && diagnostics !== null) {
      console.debug("TG2_WRITER_NUMERICS " + JSON.stringify({ id, steps: diagnostics.snapshot() }));
    }
    busy = false;
  }
});
