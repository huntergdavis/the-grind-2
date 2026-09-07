import { createHash, randomUUID } from 'node:crypto';

export const stoppingBudgets = Object.freeze({ total: 295_000, work: 290_000, cleanup: 5_000, write: 90_000 });
export const stoppingMarker = '    stopping_criteria: new FinishedPassageCriteria(),\n';
export const suffixMarker = '  const suffix = rows[0]?.slice(inputLength).map(Number);';
export const instrumentation = '\n  workerScope.postMessage({ type: "probe-metrics", inputTokens: inputLength, outputTokens: suffix?.length ?? 0 });';
export const bootInstrumentation = '\nworkerScope.postMessage({ type: "probe-boot" });\n';
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function transformStoppingWorker(source, variant) {
  if (!['baseline', 'candidate'].includes(variant)) throw new Error('Unknown stopping variant');
  for (const marker of [stoppingMarker, suffixMarker]) {
    if (source.split(marker).length !== 2) throw new Error('Stopping worker marker missing or ambiguous');
  }
  for (const setting of ['wasm.numThreads = 1;', 'device: "wasm", dtype: "q8"',
    'max_new_tokens: 64, do_sample: false, repetition_penalty: 1.08']) {
    if (!source.includes(setting)) throw new Error('Production generation settings changed');
  }
  const instrumented = source.replace(suffixMarker, suffixMarker + instrumentation) + bootInstrumentation;
  return variant === 'baseline' ? instrumented.replace(stoppingMarker, '') : instrumented;
}

export function selectStoppingFixture(archive) {
  const first = archive?.outputs?.[0];
  if (archive?.complete !== true || first?.id !== 'rested-curious-hero'
    || !Array.isArray(first.messages) || first.messages.length !== 2
    || first.messages[0]?.role !== 'system' || first.messages[1]?.role !== 'user'
    || first.messages.some((message) => typeof message.content !== 'string' || !message.content.trim())
    || typeof first.raw !== 'string' || typeof first.cleaned !== 'string'
    || !first.raw.startsWith(first.cleaned) || first.raw.length <= first.cleaned.length) {
    throw new Error('Expected the exact archived Mara fixture with a discarded tail');
  }
  return structuredClone({ id: first.id, fixtureKind: first.fixtureKind, facts: first.facts,
    viewpoint: first.viewpoint, expected: first.expected, messages: first.messages,
    promptSha256: digest(JSON.stringify(first.messages)), historicalRaw: first.raw,
    historicalCleaned: first.cleaned, historicalGenerationMs: first.generationMs });
}

export function stoppingReportName(now = new Date(), uuid = randomUUID()) {
  return `sentence-stopping-report-${now.toISOString().replace(/[:.]/g, '-')}-${uuid}.json`;
}

export function compareStoppingOutputs(baseline, candidate) {
  const complete = baseline?.status === 'completed' && candidate?.status === 'completed';
  return {
    bothCompleted: complete,
    identicalCleanedProse: complete && baseline.cleaned !== null && baseline.cleaned === candidate.cleaned,
    candidateRawIsBaselinePrefix: complete && baseline.raw.startsWith(candidate.raw),
    baselineOutputTokens: baseline?.outputTokens ?? null,
    candidateOutputTokens: candidate?.outputTokens ?? null,
    savedOutputTokens: complete ? baseline.outputTokens - candidate.outputTokens : null,
    baselineGenerationMs: baseline?.generationMs ?? null,
    candidateGenerationMs: candidate?.generationMs ?? null,
    interpretation: 'One fixed-order matched operational check. Baseline runs first; cache restoration, warm hardware and order confound timing. Prefix preservation and token counts are not general literary-quality or speed evidence.',
  };
}
