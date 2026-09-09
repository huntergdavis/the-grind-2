import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripEmptyThinkingHeader } from './webgpu-candidate-adapter.mjs';

/** A diagnostic record must not replace the original worker's success/error semantics. */
export function emitSentenceBudgetDecision(decision,
  emit = value => console.debug('TG2_SENTENCE_BUDGET ' + JSON.stringify(value))) {
  try {
    if (decision === null || JSON.stringify(decision).length >= 7900) return;
    emit(decision);
  } catch { /* Missing evidence cannot qualify at the runner. */ }
}

/** Exact returned-text provenance only; ordinary admission and literary review remain separate. */
export function isCompleteSentenceBudgetEvidence(records, output, candidateRawOutputs) {
  if (!Array.isArray(records) || records.length !== 1 || !Array.isArray(candidateRawOutputs)
    || candidateRawOutputs.length !== 1 || typeof candidateRawOutputs[0]?.raw !== 'string'
    || candidateRawOutputs[0].rawTruncated !== false || candidateRawOutputs[0].rawCharacters !== candidateRawOutputs[0].raw.length
    || output?.status !== 'completed' || typeof output.raw !== 'string') return false;
  const record = records[0], original = stripEmptyThinkingHeader(candidateRawOutputs[0].raw);
  if (record?.kind !== 'sentence-budget-decision' || record.stage !== 'worker-success-after-stream-drain'
    || record.selectedPrefix !== output.raw || !original.trimStart().startsWith(record.selectedPrefix)
    || !Number.isFinite(record.elapsedMs) || record.elapsedMs < 0 || record.elapsedMs >= 90000
    || !Number.isInteger(record.sentenceCount) || record.sentenceCount < 1 || record.sentenceCount > 2
    || record.rawTruncated !== false || record.originalCharacters !== original.length
    || record.discardedCharacters !== original.length - record.selectedPrefix.length
    || record.discardedCharacters < 0) return false;
  if (record.mode === 'natural-completion') {
    return record.stopElapsedMs === null && record.stopOriginalCharacters === null && record.stopDiscardedCharacters === null
      && record.hygieneScope === 'ordinary-admission-after-worker-result';
  }
  return record.mode === 'completed-sentence-budget-fallback'
    && record.hygieneScope === 'whole-raw-stream-after-drain'
    && Number.isFinite(record.stopElapsedMs) && record.stopElapsedMs >= 80000 && record.stopElapsedMs < 90000
    && record.elapsedMs >= record.stopElapsedMs
    && Number.isSafeInteger(record.stopOriginalCharacters) && record.stopOriginalCharacters >= record.selectedPrefix.length
    && record.stopOriginalCharacters <= original.length
    && record.stopDiscardedCharacters === record.stopOriginalCharacters - record.selectedPrefix.length;
}

export function instrumentSentenceBudgetWorker(source,
  repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), { connected = false } = {}) {
  const markers = [
    'let boundedMessages = messages;',
    'let text = "", interrupted = false;',
    'for await (const chunk of chunks) {',
    'if (text.length > 4_000 || hasFinishedCreativeStoryPassage(stripEmptyThinkingHeader(text))) {',
    "console.debug('TG2_CANDIDATE_RAW ' + JSON.stringify({ raw: text }));",
    'const result = stripEmptyThinkingHeader(text).trim();',
    'if (!result || result.length > 4_000) throw new Error("Invalid generated text");',
    '__tg2FinishCompleteStoryWorker(true);',
  ];
  if (!source.includes('const stripEmptyThinkingHeader =') || !source.includes('const __tg2NoteWriteTiming =')
    || !source.includes('const __tg2FinishCompleteStoryWorker =') || source.includes('__tg2SentenceBudget')
    || source.includes('__tg2ArrivalGrammarRequest')) throw new Error('Sentence budget requires the timed candidate worker without grammar exactly once');
  for (const marker of markers) {
    if (source.split(marker).length !== 2) throw new Error(`Sentence budget worker source no longer matches: ${marker}`);
  }
  const imports = `import { selectSentenceBudgetFallback as __tg2SelectSentenceBudgetFallback } from ${JSON.stringify(resolve(repo, 'tools/creative-story-probe/sentence-budget.mjs'))};
import { cleanCreativeStoryOutput as __tg2CleanBudgetOutput } from ${JSON.stringify(resolve(repo, 'src/narrator/creative-story.ts'))};
import { completedCreativeStorySentences as __tg2CompletedBudgetSentences } from ${JSON.stringify(resolve(repo, 'src/narrator/creative-story-sentences.ts'))};
const __tg2EmitSentenceBudgetDecision = ${emitSentenceBudgetDecision.toString()};
let __tg2SentenceBudgetDecision = null;
`;
  let transformed = imports + source
    .replace(markers[0], `const __tg2SentenceBudgetStarted = performance.now();
  __tg2SentenceBudgetDecision = null;
  ` + markers[0])
    .replace(markers[1], markers[1] + '\n    let __tg2SentenceBudgetSelection = null, __tg2SentenceBudgetRaw = "", __tg2SentenceBudgetRawCharacters = 0;')
    .replace(markers[2], markers[2] + `
        const __tg2SentenceBudgetDelta = chunk.choices[0]?.delta.content ?? "";
        __tg2SentenceBudgetRawCharacters += __tg2SentenceBudgetDelta.length;
        __tg2SentenceBudgetRaw += __tg2SentenceBudgetDelta.slice(0, Math.max(0, 4000 - __tg2SentenceBudgetRaw.length));`)
    .replace(markers[3], `const __tg2NormalStoryStop = text.length > 4_000 || hasFinishedCreativeStoryPassage(stripEmptyThinkingHeader(text));
          if (!__tg2NormalStoryStop) __tg2SentenceBudgetSelection = __tg2SelectSentenceBudgetFallback(
            stripEmptyThinkingHeader(text), performance.now() - __tg2SentenceBudgetStarted,
            __tg2CleanBudgetOutput, __tg2CompletedBudgetSentences);
          if (__tg2NormalStoryStop || __tg2SentenceBudgetSelection !== null) {`)
    .replace(markers[4], "console.debug('TG2_CANDIDATE_RAW ' + JSON.stringify({ raw: __tg2SentenceBudgetRaw, rawCharacters: __tg2SentenceBudgetRawCharacters, rawTruncated: __tg2SentenceBudgetRawCharacters > __tg2SentenceBudgetRaw.length }));")
    .replace(markers[5], `if (__tg2SentenceBudgetRawCharacters > __tg2SentenceBudgetRaw.length) throw new Error("Sentence budget raw stream exceeded its evidence bound");
      if (__tg2SentenceBudgetSelection !== null && __tg2CleanBudgetOutput(stripEmptyThinkingHeader(__tg2SentenceBudgetRaw)) === null) {
        throw new Error("Sentence budget full drained text did not pass narrative hygiene");
      }
      const result = __tg2SentenceBudgetSelection?.text ?? stripEmptyThinkingHeader(text).trim();`)
    .replace(markers[6], markers[6] + `
      const __tg2SentenceBudgetOriginal = stripEmptyThinkingHeader(__tg2SentenceBudgetRaw);
      __tg2SentenceBudgetDecision = {
        kind: 'sentence-budget-decision', stage: 'worker-success-after-stream-drain',
        mode: __tg2SentenceBudgetSelection === null ? 'natural-completion' : 'completed-sentence-budget-fallback',
        selectedPrefix: result, sentenceCount: __tg2CompletedBudgetSentences(result).length,
        elapsedMs: performance.now() - __tg2SentenceBudgetStarted,
        stopElapsedMs: __tg2SentenceBudgetSelection?.elapsedMs ?? null,
        originalCharacters: __tg2SentenceBudgetRawCharacters - (__tg2SentenceBudgetRaw.length - __tg2SentenceBudgetOriginal.length),
        discardedCharacters: __tg2SentenceBudgetRawCharacters - (__tg2SentenceBudgetRaw.length - __tg2SentenceBudgetOriginal.length) - result.length,
        rawTruncated: __tg2SentenceBudgetRawCharacters > __tg2SentenceBudgetRaw.length,
        hygieneScope: __tg2SentenceBudgetSelection === null ? 'ordinary-admission-after-worker-result' : 'whole-raw-stream-after-drain',
        stopOriginalCharacters: __tg2SentenceBudgetSelection?.originalCharacters ?? null,
        stopDiscardedCharacters: __tg2SentenceBudgetSelection?.discardedCharacters ?? null,
      };`)
    .replace(markers[7], markers[7] + '\n      __tg2EmitSentenceBudgetDecision(__tg2SentenceBudgetDecision);\n      __tg2SentenceBudgetDecision = null;');
  if (connected) {
    transformed = transformed
      .replace('let __tg2SentenceBudgetDecision = null;', 'let __tg2SentenceBudgetDecision = null, __tg2SentenceBudgetStory = 0;')
      .replace('const __tg2SentenceBudgetStarted = performance.now();', `if (__tg2SentenceBudgetStory >= 3) throw new Error("Connected sentence budget permits only three writes");
  const __tg2CurrentBudgetStory = ++__tg2SentenceBudgetStory;
  const __tg2SentenceBudgetStarted = performance.now();`)
      .replace('JSON.stringify({ raw: __tg2SentenceBudgetRaw,', 'JSON.stringify({ story: __tg2CurrentBudgetStory, raw: __tg2SentenceBudgetRaw,')
      .replace("kind: 'sentence-budget-decision', stage: 'worker-success-after-stream-drain',",
        "kind: 'sentence-budget-decision', story: __tg2CurrentBudgetStory, stage: 'worker-success-after-stream-drain',");
  }
  return transformed;
}

export function sentenceBudgetPlugin(repo, options) {
  const worker = resolve(repo, 'src/narrator/creative-writer.worker.ts');
  return { name: 'tg2-isolated-cooperative-sentence-budget', enforce: 'pre',
    transform(source, id) {
      return id.split('?')[0] === worker ? { code: instrumentSentenceBudgetWorker(source, repo, options), map: null } : null;
    } };
}
