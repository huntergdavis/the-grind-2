/** Observations only: an SSE content chunk need not equal one tokenizer token. */
export function createStreamTrace(id) {
  return { id, complete: false, rawPartial: '', firstChunkMs: null, firstVisibleTextMs: null,
    promptTokens: null, promptTokensSource: null, promptProcessingMs: null, chunks: [], snapshotAt90s: null };
}
export function recordStreamChunk(trace, chunk, elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || !chunk || typeof chunk !== 'object') throw new Error('Invalid stream observation');
  if (trace.chunks.length >= 1024) throw new Error('Bounded diagnostic chunk limit exceeded');
  trace.firstChunkMs ??= elapsedMs;
  const text = chunk.choices?.[0]?.delta?.content;
  if (typeof text === 'string' && text.length > 0) {
    trace.firstVisibleTextMs ??= elapsedMs;
    trace.rawPartial += text;
  }
  if (Number.isSafeInteger(chunk.prompt_progress?.total)) {
    trace.promptTokens = chunk.prompt_progress.total;
    trace.promptTokensSource = 'native prompt_progress.total';
  }
  if (Number.isSafeInteger(chunk.usage?.prompt_tokens)) {
    trace.promptTokens = chunk.usage.prompt_tokens;
    trace.promptTokensSource = 'native usage.prompt_tokens';
  }
  if (Number.isFinite(chunk.timings?.prompt_ms)) trace.promptProcessingMs = chunk.timings.prompt_ms;
  trace.lastUsage = chunk.usage ?? trace.lastUsage ?? null;
  trace.lastTimings = chunk.timings ?? trace.lastTimings ?? null;
  trace.lastPromptProgress = chunk.prompt_progress ?? trace.lastPromptProgress ?? null;
  trace.chunks.push({ elapsedMs, chunk });
}
export function snapshotStream(trace) {
  return { rawPartial: trace.rawPartial, chunkCount: trace.chunks.length, firstChunkMs: trace.firstChunkMs,
    firstVisibleTextMs: trace.firstVisibleTextMs, promptTokens: trace.promptTokens,
    lastPromptProgress: structuredClone(trace.lastPromptProgress ?? null), lastTimings: structuredClone(trace.lastTimings ?? null) };
}
export function mayRunSecondScene(elapsedMs, totalMs = 295000) { return totalMs - elapsedMs >= 95000; }
