import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { arrivalSentenceGrammar } from './arrival-output-shape.mjs';

export const arrivalGrammarIdentity = Object.freeze({
  grammarSha256: createHash('sha256').update(arrivalSentenceGrammar).digest('hex'),
  grammarCharacters: arrivalSentenceGrammar.length,
  responseFormatType: 'grammar', syntheticHeaderInGrammar: false,
  enableThinking: false, runtimeMaxTokensIncludingHeader: 68,
  changesSamplingConstraints: true, changesPrompt: false,
});

/** This exact return value is installed in the streaming write request, never direction selection. */
export function createArrivalGrammarRequest(grammar, identity,
  emit = record => console.debug('TG2_ARRIVAL_GRAMMAR ' + JSON.stringify(record))) {
  let reported = false;
  return () => {
    if (!reported) {
      reported = true;
      try { emit({ kind: 'arrival-grammar-request', ...identity }); } catch { /* Separate receipt validation fails closed. */ }
    }
    return { type: 'grammar', grammar };
  };
}

/** Prove the native matcher accepted a sampled token, not merely that a config object existed. */
export function createArrivalGrammarDiagnostics(grammar, identity,
  emit = record => console.debug('TG2_ARRIVAL_GRAMMAR ' + JSON.stringify(record))) {
  let reported = false;
  return {
    accepted(pipeline, genConfig, accepted) {
      if (reported || genConfig?.response_format?.type !== 'grammar'
        || genConfig.response_format.grammar !== grammar || genConfig.enable_thinking !== false
        || genConfig.max_tokens !== 68) return;
      reported = true;
      let grammarInitMs = null, grammarPerTokenMs = null, error = null;
      try {
        grammarInitMs = pipeline.getCurRoundGrammarInitTotalTime() * 1000;
        grammarPerTokenMs = pipeline.getCurRoundGrammarPerTokenTotalTime() * 1000;
      } catch (failure) { error = String(failure?.message ?? failure).slice(0, 400); }
      try { emit({ kind: 'arrival-grammar-native', stage: 'first-sampled-token-accepted', ...identity,
        accepted: accepted === true, grammarInitMs, grammarPerTokenMs, error }); }
      catch { /* Observation cannot replace the native accept/reject decision. */ }
    },
  };
}

/** Grammar execution evidence is separate from complete output shape and literary acceptance. */
export function isCompleteArrivalGrammarEvidence(records) {
  if (!Array.isArray(records) || records.length !== 2
    || records[0]?.kind !== 'arrival-grammar-request' || records[1]?.kind !== 'arrival-grammar-native'
    || !records.every(record => Object.entries(arrivalGrammarIdentity).every(([key, value]) => record[key] === value))) return false;
  const native = records[1];
  return native.stage === 'first-sampled-token-accepted' && native.accepted === true && native.error === null
    && Number.isFinite(native.grammarInitMs) && native.grammarInitMs >= 0
    && Number.isFinite(native.grammarPerTokenMs) && native.grammarPerTokenMs >= 0;
}

export function instrumentArrivalGrammarWorker(source) {
  const marker = 'messages: buildCreativeWriterConversation(boundedMessages), stream: true, max_tokens: 68,';
  if (!source.includes('const stripEmptyThinkingHeader =') || !source.includes('const __tg2FinishCompleteStoryWorker =')
    || !source.includes('const __tg2NoteWriteTiming =') || source.includes('__tg2ArrivalGrammarRequest')) {
    throw new Error('Arrival grammar requires the timed candidate complete-story worker exactly once');
  }
  if (source.split(marker).length !== 2) throw new Error('Arrival grammar worker source no longer matches');
  return `const __tg2ArrivalGrammarRequest = (${createArrivalGrammarRequest.toString()})(${JSON.stringify(arrivalSentenceGrammar)}, ${JSON.stringify(arrivalGrammarIdentity)});\n` + source
    .replace(marker, 'messages: buildCreativeWriterConversation(boundedMessages), response_format: __tg2ArrivalGrammarRequest(), stream: true, max_tokens: 68,');
}

export function instrumentArrivalGrammarRuntime(source) {
  const marker = `const accepted = this.grammarMatcher.acceptToken(sampledToken);
                this.curRoundGrammarPerTokenTotalTime +=
                    (performance.now() - tAcceptStart) / 1e3;`;
  if (!source.includes('const __tg2WriteTiming =') || !source.includes('const __tg2ShaderRepair =')
    || source.includes('__tg2ArrivalGrammarNative')) {
    throw new Error('Arrival grammar requires the timed repaired runtime exactly once');
  }
  if (source.split(marker).length !== 2) throw new Error('Arrival grammar runtime source no longer matches');
  return `const __tg2ArrivalGrammarNative = (${createArrivalGrammarDiagnostics.toString()})(${JSON.stringify(arrivalSentenceGrammar)}, ${JSON.stringify(arrivalGrammarIdentity)});\n` + source
    .replace(marker, marker + '\n                __tg2ArrivalGrammarNative.accepted(this, genConfig, accepted);');
}

export function arrivalGrammarPlugin(repo, runtimePaths = []) {
  const runtimes = new Set(runtimePaths), worker = resolve(repo, 'src/narrator/creative-writer.worker.ts');
  return { name: 'tg2-isolated-arrival-sentence-grammar', enforce: 'pre',
    transform(source, id) {
      const path = id.split('?')[0];
      if (runtimes.has(path)) return { code: instrumentArrivalGrammarRuntime(source), map: null };
      return path === worker ? { code: instrumentArrivalGrammarWorker(source), map: null } : null;
    } };
}
