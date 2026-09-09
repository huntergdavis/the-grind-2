import { build } from 'vite';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { createReadStream, writeFileSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { webgpuV1 as baselineWebgpuV1, webgpuV1Flags } from './webgpu-v1-config.mjs';
import { webgpuCandidate } from './webgpu-candidate-config.mjs';
import { adaptCandidateWorker, candidateModelPlugin } from './webgpu-candidate-adapter.mjs';
import { instrumentSamplingRuntime, samplingDiagnosticPlugin } from './webgpu-sampling-diagnostics.mjs';
import { transferDiagnosticPlugin } from './webgpu-transfer-diagnostics.mjs';
import { computeDiagnosticPlugin } from './webgpu-compute-diagnostics.mjs';
import { instrumentModelBufferRuntime, modelBufferDiagnosticPlugin } from './webgpu-model-buffer-diagnostics.mjs';
import { instrumentDispatchRuntime, dispatchDiagnosticPlugin } from './webgpu-dispatch-diagnostics.mjs';
import { instrumentFirstTokenStop, firstTokenStopPlugin, isExpectedFirstTokenStop, hasCompleteFirstTokenEvidence } from './webgpu-first-token-stop.mjs';
import { instrumentSubmissionRuntime, submissionDiagnosticPlugin, isCompleteSubmissionDiagnostic } from './webgpu-submission-diagnostics.mjs';
import { instrumentCompleteStoryRuntime, completeStoryPlugin, isCompleteStoryDiagnostic, isCompleteConnectedStoryEvidence } from './webgpu-complete-story.mjs';
import { instrumentShaderRepairRuntime, shaderRepairPlugin, isCompleteShaderRepairEvidence } from './webgpu-shader-repair.mjs';
import { instrumentWriteTimingRuntime, writeTimingPlugin, isCompleteWriteTiming } from './webgpu-write-timing.mjs';
import { arrivalContextPolicy } from './arrival-context.mjs';
import { arrivalGroundingPolicy } from './arrival-grounding.mjs';
import { arrivalOutputShapePolicy, inspectArrivalOutputShape } from './arrival-output-shape.mjs';
import { arrivalGrammarPlugin, instrumentArrivalGrammarRuntime, isCompleteArrivalGrammarEvidence } from './arrival-grammar-adapter.mjs';
import { sentenceBudgetPolicy } from './sentence-budget.mjs';
import { sentenceBudgetPlugin, isCompleteSentenceBudgetEvidence } from './sentence-budget-adapter.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '../..');
const stage = resolve(repo, '.narrator-t5-rebuild/creative-probe/webllm-v1');
const runtime = resolve(stage, 'node_modules/@mlc-ai/web-llm');
const timestamp = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', timeZoneName: 'short' }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}]`;
};
const log = (value) => console.log(`${timestamp()} ${typeof value === 'string' ? value : JSON.stringify(value)}`);
const timed = (promise, ms, label) => new Promise((accept, decline) => {
  const timer = setTimeout(() => decline(new Error(`${label} exceeded ${ms / 1000}s`)), ms);
  Promise.resolve(promise).then(accept, decline).finally(() => clearTimeout(timer));
});
const mime = (file) => ({ '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' })[extname(file)] ?? 'application/octet-stream';
const safeUrl = (url) => { const value = new URL(url); return value.origin + value.pathname; };

export function parseWebgpuV1Arguments(args) {
  const sentenceBudget = args.includes('--sentence-budget');
  const sentenceGrammar = args.includes('--sentence-grammar');
  const groundedArrival = args.includes('--grounded-arrival');
  const compactArrival = args.includes('--compact-arrival');
  const replayArrival = args.includes('--replay-arrival');
  const connectedStory = args.includes('--connected-story');
  const repairSoftmaxRace = args.includes('--repair-softmax-race');
  const completeStory = args.includes('--complete-story');
  const submitEachDispatch = args.includes('--submit-each-dispatch');
  const inspectDispatch = args.includes('--inspect-dispatch');
  const inspectModelBuffer = args.includes('--inspect-model-buffer');
  const observePreSort = args.includes('--observe-pre-sort');
  const candidateComputeCheck = args.includes('--candidate-compute-check');
  const candidateTransferCheck = args.includes('--candidate-transfer-check');
  const candidateDiagnostic = args.includes('--candidate-diagnostic');
  const candidateScenes = args.includes('--candidate-scenes') || candidateDiagnostic || candidateTransferCheck || candidateComputeCheck;
  const productionScenes = args.includes('--production-scenes') || candidateScenes;
  const productionSolo = args.includes('--production-solo');
  const replayFarewell = args.includes('--replay-farewell');
  const replaySequence = args.includes('--replay-sequence');
  const replay = replayFarewell || replaySequence;
  const productionMode = productionScenes || productionSolo || replay;
  if (!args.includes('--run') || new Set(args).size !== args.length
    || [productionScenes, productionSolo, replayFarewell, replaySequence].filter(Boolean).length > 1
    || candidateScenes && args.includes('--production-scenes')
    || candidateDiagnostic && (args.includes('--candidate-scenes') || !args.includes('--cache-only'))
    || candidateTransferCheck && (args.includes('--candidate-scenes') || candidateDiagnostic || !args.includes('--cache-only'))
    || candidateComputeCheck && (args.includes('--candidate-scenes') || candidateDiagnostic || candidateTransferCheck || !args.includes('--cache-only'))
    || observePreSort && !candidateDiagnostic
    || inspectModelBuffer && (!candidateDiagnostic || observePreSort)
    || inspectDispatch && !inspectModelBuffer
    || submitEachDispatch && !inspectDispatch
    || completeStory && !submitEachDispatch
    || repairSoftmaxRace && !completeStory
    || connectedStory && !repairSoftmaxRace
    || replayArrival && (!repairSoftmaxRace || connectedStory)
    || compactArrival && !replayArrival
    || groundedArrival && !compactArrival
    || sentenceGrammar && !groundedArrival
    || sentenceBudget && (!groundedArrival || sentenceGrammar)
    || (candidateScenes ? args.includes('--allow-model-download') === args.includes('--cache-only')
      : args.includes('--allow-model-download') || args.includes('--cache-only'))
    || args.some((arg) => !['--run', '--production-scenes', '--production-solo', '--replay-farewell', '--replay-sequence',
      '--candidate-scenes', '--candidate-diagnostic', '--candidate-transfer-check', '--candidate-compute-check', '--observe-pre-sort', '--inspect-model-buffer', '--inspect-dispatch', '--submit-each-dispatch', '--complete-story', '--repair-softmax-race', '--connected-story', '--replay-arrival', '--compact-arrival', '--grounded-arrival', '--sentence-grammar', '--sentence-budget', '--allow-model-download', '--cache-only'].includes(arg))) {
    throw new Error('Usage: --run [--production-scenes | --production-solo | --replay-farewell | --replay-sequence | --candidate-scenes (--allow-model-download | --cache-only) | --candidate-diagnostic --cache-only [--observe-pre-sort | --inspect-model-buffer [--inspect-dispatch [--submit-each-dispatch [--complete-story [--repair-softmax-race [--connected-story | --replay-arrival [--compact-arrival [--grounded-arrival [--sentence-grammar | --sentence-budget]]]]]]]]] | --candidate-transfer-check --cache-only | --candidate-compute-check --cache-only]');
  }
  return { productionScenes, productionSolo, replayFarewell, replaySequence, replay, productionMode, candidateScenes, candidateDiagnostic, candidateTransferCheck, candidateComputeCheck, observePreSort, inspectModelBuffer, inspectDispatch, submitEachDispatch, completeStory, repairSoftmaxRace, connectedStory,
    replayArrival, compactArrival, groundedArrival, sentenceGrammar, sentenceBudget, cacheOnly: productionMode && (!candidateScenes || args.includes('--cache-only')) };
}

/** Stop before authorizing another scene if admission or current-run memory provenance is missing. */
export function hasConnectedStoryProgress(outputs) {
  if (!Array.isArray(outputs) || outputs.length < 1 || outputs.length > 3) return false;
  return outputs.every((output, index) => {
    if (output?.status !== 'completed' || output.acceptedNewStory !== true || output.archived !== true
      || output.characterAnchorPreserved !== true || output.connectedSequence !== true
      || output.journalScope !== 'owned-memory-only' || output.journal?.persistent !== false
      || output.promptMode !== 'unmodified-production-builder' || output.productionChatReset !== true
      || typeof output.cleaned !== 'string' || output.cleaned.length === 0
      || output.expectedActualMemories !== index || output.continuity?.length !== index
      || output.actualMemorySourceEventIds?.length !== index || output.journal.entries?.length !== index + 1) return false;
    for (let earlier = 0; earlier < index; earlier++) {
      const previous = outputs[earlier], memory = output.continuity[earlier];
      if (!memory || memory.sourceEventId !== previous.job?.eventId
        || memory.campaignId !== previous.job?.campaignId || memory.sourceTick !== previous.job?.tick
        || output.actualMemorySourceEventIds[earlier] !== memory.sourceEventId
        || memory.scene?.location !== previous.facts?.location || memory.scene?.headline !== previous.facts?.headline
        || typeof memory.text !== 'string' || memory.text.length === 0
        || !previous.cleaned.replace(/[\r\n\t]+/gu, ' ').trim().includes(memory.text)) return false;
    }
    return outputs.slice(0, index + 1).every(previous => output.journal.entries.some(entry =>
      entry.sourceEventId === previous.job?.eventId && entry.campaignId === previous.job?.campaignId
      && entry.sourceTick === previous.job?.tick && entry.text === previous.cleaned && entry.origin === 'model'));
  });
}

/** A formatting pass is not literary approval; require raw prose and native grammar execution. */
export function hasCompleteGrammarArrivalEvidence(report) {
  const output = report.outputs?.[0];
  return report.outputs?.length === 1 && output?.status === 'completed'
    && output.acceptedNewStory === true && output.archived === false
    && inspectArrivalOutputShape(output.raw).valid
    && isCompleteArrivalGrammarEvidence(report.arrivalGrammarObservations)
    && report.samplingObservations?.length > 0
    && report.samplingObservations.every(record => record.settings?.grammarConstrained === true)
    && !report.errors?.some(error => error.field === 'arrivalGrammarObservations');
}

/** A shorter settled passage is not a two-sentence or literary-quality pass. */
export function hasCompleteSentenceBudgetArrivalEvidence(report) {
  const output = report.outputs?.[0];
  return report.outputs?.length === 1 && output?.status === 'completed'
    && output.acceptedNewStory === true && output.archived === false
    && isCompleteSentenceBudgetEvidence(report.sentenceBudgetObservations, output, report.candidateRawOutputs)
    && report.samplingObservations?.length > 0
    && report.samplingObservations.every(record => record.settings?.grammarConstrained === false)
    && !report.errors?.some(error => error.field === 'sentenceBudgetObservations');
}

async function run() {
  const { productionScenes, productionSolo, replayFarewell, replaySequence, replay, productionMode, candidateScenes, candidateDiagnostic, candidateTransferCheck, candidateComputeCheck, observePreSort, inspectModelBuffer, inspectDispatch, submitEachDispatch, completeStory, repairSoftmaxRace, connectedStory, replayArrival, compactArrival, groundedArrival, sentenceGrammar, sentenceBudget, cacheOnly }
    = parseWebgpuV1Arguments(process.argv.slice(2));
  const requestedArrivalPolicy = groundedArrival ? arrivalGroundingPolicy : arrivalContextPolicy;
  const webgpuV1 = candidateScenes ? webgpuCandidate : baselineWebgpuV1;
  if (candidateScenes && webgpuV1.artifactBytes > webgpuV1.maximumArtifactBytes) throw new Error('Candidate exceeds the artifact budget');
  const profile = resolve(stage, candidateScenes ? 'qwen3-4b-browser-profile' : 'candidate-browser-profile');
  const plannedScenes = connectedStory ? 3 : candidateTransferCheck || candidateComputeCheck ? 0 : candidateDiagnostic ? 1 : replaySequence ? 3 : productionSolo || replayFarewell ? 1 : productionScenes ? 4 : 2;
  const totalDeadlineMs = connectedStory ? 600_000 : candidateTransferCheck || candidateComputeCheck || inspectDispatch ? 300_000 : candidateDiagnostic ? 600_000 : productionScenes ? 900_000 : webgpuV1.totalDeadlineMs;
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const reportPath = resolve(root, `${candidateScenes ? 'webgpu-candidate' : 'webgpu-v1'}-report-${runId}.json`);
  const dist = resolve(stage, `dist-${runId}`);
  const report = { startedAt: new Date().toISOString(), phase: 'preflight', complete: false,
    mode: compactArrival ? 'qwen3-compact-arrival-context-timing-cache-only' : replayArrival ? 'qwen3-recorded-arrival-timing-cache-only' : connectedStory ? 'qwen3-connected-story-repaired-softmax-cache-only' : repairSoftmaxRace ? 'qwen3-complete-story-repaired-softmax-cache-only' : completeStory ? 'qwen3-complete-story-per-dispatch-cache-only' : submitEachDispatch ? 'qwen3-first-token-per-dispatch-cache-only' : inspectDispatch ? 'qwen3-first-token-dispatch-cache-only' : candidateComputeCheck ? 'qwen3-zero-token-compute-check-cache-only' : candidateTransferCheck ? 'qwen3-zero-token-transfer-check-cache-only' : candidateDiagnostic ? 'qwen3-recorded-first-scene-sampling-diagnostic-cache-only' : candidateScenes ? `qwen3-candidate-scenes-${cacheOnly ? 'cache-only' : 'explicit-download'}` : replaySequence ? 'recorded-sequence-diagnostic-cache-only' : replayFarewell ? 'recorded-farewell-diagnostic-cache-only' : productionSolo ? 'production-solo-cache-only' : productionScenes ? 'production-scenes-cache-only' : 'shared-emotional-scenes',
    writerPath: candidateScenes ? 'production-client-and-worker-with-candidate-adapter' : productionMode ? 'production-client-and-worker' : 'exploratory-proxy-engine',
    plannedScenes, totalDeadlineMs, isolatedSolo: productionSolo,
    cacheOnlyRestore: cacheOnly,
    ...(compactArrival ? { arrivalContextPolicy } : {}),
    ...(groundedArrival ? { arrivalGroundingPolicy } : {}),
    ...(sentenceBudget ? { sentenceBudgetPolicy, sentenceBudgetObservations: [],
      sentenceBudgetComparison: { unconstrained: 'webgpu-candidate-report-2026-09-09T08-35-32-034Z-b9cd592b.json',
        rejectedGrammar: 'webgpu-candidate-report-2026-09-09T09-41-28-959Z-870ed082.json' } } : {}),
    ...(sentenceGrammar ? { arrivalOutputShapePolicy, arrivalGrammarObservations: [],
      grammarNumericalPolicy: { reference: 'post-grammar-mask-logits', allowsNegativeInfinityMask: true,
        rejectsNaNPositiveInfinityAndAllMasked: true, preservesUnconstrainedDefaults: true },
      comparisonReceipt: 'webgpu-candidate-report-2026-09-09T08-35-32-034Z-b9cd592b.json' } : {}),
    ...(replayArrival ? { arrivalReplay: {
      receipt: 'webgpu-candidate-report-2026-09-09T06-39-03-194Z-85f1c932.json', scene: 2,
      lifecycle: compactArrival ? requestedArrivalPolicy.lifecycle : 'fresh-worker-exact-messages-not-original-sequence',
      history: 'actual-recorded-road-prose', noJournalWrites: true,
    }, writeTimingPolicy: { maximumRecords: 128, maximumRecordChars: 4000,
      boundaries: 'worker-reset-prefill-decode-interrupt-drain-settlement',
      extraGpuSynchronization: false, changesPromptOrSampling: false,
      partialProgressIsNotCompletedProse: true, timingMayDiffer: true,
    }, writeTimingObservations: [] } : {}),
    ...(connectedStory ? { connectedSequence: { scenes: ['road', 'arrival', 'farewell'],
      maximumScenes: 3, modelLoads: 1, requiresIndividualApproval: true,
      history: 'actual-current-run-accepted-prose', journalScope: 'owned-memory-only',
      productionMessagesUnchanged: true, numericalEvidenceScope: 'first-comparison-and-first-64-worker-samples' } } : {}),
    ...(repairSoftmaxRace ? { shaderRepairPolicy: { kind: 'single-writer-shared-scalars',
      changesShaders: true, exactSourceRequired: true, scalarStoreGuardsChanged: 2,
      changesPromptOrSampling: false, changesModelArtifacts: false, productionDefaultUnchanged: true },
      shaderRepairObservations: [] } : {}),
    ...(completeStory ? { completeStoryObservations: [], fullStoryTrial: { maximumScenes: connectedStory ? 3 : 1,
      automaticFirstTokenStop: false, originalPromptAndSampling: !compactArrival, noJournalWrites: !connectedStory,
      ...(connectedStory ? { journalScope: 'owned-memory-only' } : {}) } } : {}),
    ...(submitEachDispatch ? { submissionPolicy: { kind: 'per-dispatch', changesShaders: false,
      changesScores: false, changesQueueBoundaries: true }, submissionObservations: [] } : {}),
    ...(candidateTransferCheck ? { transferObservations: [], transferOnly: true, storyGenerationCalls: 0 } : {}),
    ...(candidateComputeCheck ? { computeObservations: [], computeOnly: true, storyGenerationCalls: 0 } : {}),
    ...(inspectDispatch ? { dispatchDiagnostic: { maximumRecords: 16, maximumWGSLChars: 262144,
      stopsAfterFirstSample: !completeStory, completedStory: false, noJournalWrites: !connectedStory },
      dispatchObservations: [], firstTokenStops: [], deviceLosses: [] } : {}),
    ...(candidateScenes ? { candidateAdapter: { modelManifestSubstitution: true, enableThinking: false,
      stripsOnlyExactRuntimeEmptyThinkingHeader: true, originalWorkerSourceUnchanged: true,
      generatedTokenLimit: 64, runtimeMaxTokensIncludingHeader: 68,
      emptyThinkingHeaderTokenIds: webgpuV1.emptyThinkingHeaderTokenIds,
      productionDefaultUnchanged: true }, candidateRawOutputs: [] } : {}),
    ...(candidateDiagnostic ? { samplingDiagnostic: {
      ...(connectedStory ? { requestOrigin: 'unmodified-production-builder-with-current-run-history',
        scope: 'first-64-worker-samples' } : replayArrival
        ? { receipt: 'webgpu-candidate-report-2026-09-09T06-39-03-194Z-85f1c932.json', scene: 2,
          ...(compactArrival ? { promptVariant: requestedArrivalPolicy.variant } : {}) }
        : { receipt: 'webgpu-candidate-report-2026-09-08T22-39-25-104Z-700078b2.json', scene: 1 }),
      recordLimit: 64, observesExistingProcessorArrays: true, additionalProbabilityReadback: true,
      reusesExistingDeviceSynchronization: !inspectModelBuffer, changesScoresOrSampling: false,
      timingMayDiffer: true, noJournalWrites: !connectedStory,
      ...(observePreSort ? { comparesPreSortProbabilities: true, probabilityReadbacksPerStep: 2 } : {}),
    }, samplingObservations: [] } : {}),
    ...(inspectModelBuffer ? { modelBufferDiagnostic: { recordLimit: 1, firstEligibleTokenOnly: true,
      freshComputeAfterOriginalSample: true, preservesOriginalProbabilitySnapshot: true,
      extraComputeAndSynchronization: true, timingAndAllocationMayDiffer: true,
      laterTokensMayDiffer: true, noJournalWrites: !connectedStory }, modelBufferObservations: [] } : {}),
    ...(replay ? { replay: { receipt: 'webgpu-v1-report-2026-09-08T09-35-34-796Z-bca127e5.json', scenes: replaySequence ? [1, 2, 3] : [3],
      lifecycle: replaySequence ? 'same-worker-recorded-request-order-fixed-history' : 'fresh-worker-exact-messages-not-original-sequence' }, diagnostics: [] } : {}),
    identity: webgpuV1, args: webgpuV1Flags, sources: [], requests: [], blockedRequests: [],
    progress: [], generatedChunks: [], inputs: [], outputs: [], approvals: [], errors: [],
    quality: 'Candidate only. Human literary assessment is required; completed inference is not production approval.',
    profile: { directory: profile, kind: 'owned persistent probe cache, never a real user profile', preserved: true },
    cleanup: { workerTerminated: false, contextClosed: false, browserClosed: false, serverClosed: false } };
  if (groundedArrival) report.mode = 'qwen3-grounded-arrival-timing-cache-only';
  if (sentenceGrammar) report.mode = 'qwen3-grammar-grounded-arrival-cache-only';
  if (sentenceBudget) report.mode = 'qwen3-sentence-budget-grounded-arrival-cache-only';
  const started = Date.now();
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  let writes = Promise.resolve();
  const checkpoint = () => { const text = JSON.stringify(report, null, 2) + '\n';
    writes = writes.then(() => writeFile(reportPath, text)); return writes; };
  let context, page, server, input, cancelled = false, online = !cacheOnly, lineWaiter;
  const commandQueue = [];
  const nextCommand = () => commandQueue.length ? Promise.resolve(commandQueue.shift()) : new Promise((accept) => { lineWaiter = accept; });
  const guard = () => { if (cancelled) throw new Error('Probe deadline reached'); };
  const execute = async () => {
    const pkg = JSON.parse(await readFile(resolve(runtime, 'package.json'), 'utf8'));
    if (pkg.version !== webgpuV1.runtimeVersion) throw new Error('Staged WebLLM version does not match the pinned probe');
    if (productionMode) {
      const installedRuntime = resolve(repo, 'node_modules/@mlc-ai/web-llm');
      const installedPackage = JSON.parse(await readFile(resolve(installedRuntime, 'package.json'), 'utf8'));
      const stagedBytes = await readFile(resolve(runtime, 'lib/index.js'));
      const installedBytes = await readFile(resolve(installedRuntime, 'lib/index.js'));
      if (installedPackage.version !== pkg.version || !stagedBytes.equals(installedBytes)) {
        throw new Error('Production and staged runtime bytes must match');
      }
    }
    for (const file of ['webgpu-v1-config.mjs', 'webgpu-candidate-config.mjs', 'webgpu-candidate-adapter.mjs',
      'webgpu-sampling-diagnostics.mjs', 'webgpu-candidate-report-2026-09-08T22-39-25-104Z-700078b2.json',
      'webgpu-transfer-diagnostics.mjs',
      'webgpu-compute-diagnostics.mjs',
      'webgpu-model-buffer-diagnostics.mjs',
      'webgpu-dispatch-diagnostics.mjs', 'webgpu-first-token-stop.mjs',
      'webgpu-submission-diagnostics.mjs',
      'webgpu-complete-story.mjs',
      ...(replayArrival ? ['webgpu-write-timing.mjs', 'webgpu-candidate-report-2026-09-09T06-39-03-194Z-85f1c932.json'] : []),
      ...(compactArrival ? ['arrival-context.mjs'] : []),
      ...(groundedArrival ? ['arrival-grounding.mjs', 'webgpu-candidate-report-2026-09-09T07-48-52-881Z-c1a6da44.json'] : []),
      ...(sentenceBudget ? ['sentence-budget.mjs', 'sentence-budget-adapter.mjs',
        'webgpu-candidate-report-2026-09-09T08-35-32-034Z-b9cd592b.json',
        'webgpu-candidate-report-2026-09-09T09-41-28-959Z-870ed082.json'] : []),
      ...(sentenceGrammar ? ['arrival-output-shape.mjs', 'arrival-grammar-adapter.mjs',
        'webgpu-candidate-report-2026-09-09T08-35-32-034Z-b9cd592b.json'] : []),
      ...(repairSoftmaxRace ? ['webgpu-shader-repair.mjs', 'webgpu-candidate-report-2026-09-09T04-39-55-729Z-d474de03.json'] : []),
      'webgpu-v1-probe.js', 'webgpu-v1-worker.js', 'webgpu-v1-cases.mjs', 'run-webgpu-v1.mjs',
      'emotional-scene-messages.mjs', 'successive-story-cases.mjs', '../../src/narrator/creative-story.ts',
      '../../src/narrator/creative-writer-conversation.ts',
      '../../src/narrator/creative-continuity.ts',
      '../../src/narrator/creative-writer-client.ts', '../../src/narrator/creative-writer.worker.ts',
      '../../src/narrator/creative-writer-model.ts', '../../src/narrator/creative-writer-cache.ts',
      '../../src/narrator/creative-direction-logits.ts', '../../src/narrator/creative-story-sentences.ts',
      '../../src/narrator/creative-writer-diagnostics.ts', 'webgpu-v1-report-2026-09-08T09-35-34-796Z-bca127e5.json',
      '../../src/ui/narrative-journal.ts', '../../src/ui/narrative-continuity.ts', '../../src/narrator/story-character-anchor.ts',
      resolve(repo, 'node_modules/@mlc-ai/web-llm/lib/index.js'), resolve(repo, 'node_modules/@mlc-ai/web-llm/package.json'),
      resolve(runtime, 'lib/index.js'), resolve(runtime, 'package.json')]) {
      const bytes = await readFile(resolve(root, file));
      report.sources.push({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    report.profile.preexisting = await stat(profile).then(() => true, () => false);
    if (candidateScenes) {
      const workerPath = resolve(repo, 'src/narrator/creative-writer.worker.ts');
      let adaptedWorker = adaptCandidateWorker(await readFile(workerPath, 'utf8'));
      if (candidateTransferCheck) adaptedWorker = transferDiagnosticPlugin(repo).transform(adaptedWorker, workerPath).code;
      if (candidateComputeCheck) adaptedWorker = computeDiagnosticPlugin(repo).transform(adaptedWorker, workerPath).code;
      if (completeStory) adaptedWorker = completeStoryPlugin(repo, []).transform(adaptedWorker, workerPath).code;
      if (replayArrival) adaptedWorker = writeTimingPlugin(repo, []).transform(adaptedWorker, workerPath).code;
      if (sentenceGrammar) adaptedWorker = arrivalGrammarPlugin(repo).transform(adaptedWorker, workerPath).code;
      if (sentenceBudget) adaptedWorker = sentenceBudgetPlugin(repo).transform(adaptedWorker, workerPath).code;
      report.candidateAdapter.transformedWorkerSha256 = createHash('sha256').update(adaptedWorker).digest('hex');
    }
    const diagnosticRuntimePaths = [resolve(repo, 'node_modules/@mlc-ai/web-llm/lib/index.js'), resolve(runtime, 'lib/index.js')];
    if (candidateDiagnostic) {
      let diagnosticRuntime = instrumentSamplingRuntime(await readFile(diagnosticRuntimePaths[0], 'utf8'), { beforeSort: observePreSort });
      if (inspectModelBuffer) diagnosticRuntime = instrumentModelBufferRuntime(diagnosticRuntime, { allowGrammarMask: sentenceGrammar });
      if (inspectDispatch) {
        diagnosticRuntime = instrumentDispatchRuntime(diagnosticRuntime);
        if (!completeStory) diagnosticRuntime = instrumentFirstTokenStop(diagnosticRuntime);
      }
      if (submitEachDispatch) diagnosticRuntime = instrumentSubmissionRuntime(diagnosticRuntime);
      if (completeStory) diagnosticRuntime = instrumentCompleteStoryRuntime(diagnosticRuntime, { connected: connectedStory });
      if (repairSoftmaxRace) diagnosticRuntime = instrumentShaderRepairRuntime(diagnosticRuntime);
      if (replayArrival) diagnosticRuntime = instrumentWriteTimingRuntime(diagnosticRuntime);
      if (sentenceGrammar) diagnosticRuntime = instrumentArrivalGrammarRuntime(diagnosticRuntime);
      report.samplingDiagnostic.transformedRuntimeSha256 = createHash('sha256').update(diagnosticRuntime).digest('hex');
    }
    if (cacheOnly && !report.profile.preexisting) throw new Error('Cache-only proof requires the existing owned cached-model profile');
    await mkdir(profile, { recursive: true });
    report.phase = 'build'; await checkpoint();
    await timed(build({ configFile: false, root, publicDir: false, logLevel: 'silent',
      define: { 'import.meta.env.VITE_CREATIVE_WRITER_DIAGNOSTICS': JSON.stringify(replay ? '1' : '0') },
      resolve: { alias: { '@tg2-webllm-v1': resolve(runtime, 'lib/index.js') } },
      plugins: [...(candidateScenes ? [candidateModelPlugin(repo)] : []),
        ...(candidateDiagnostic ? [samplingDiagnosticPlugin(diagnosticRuntimePaths, { beforeSort: observePreSort })] : []),
        ...(inspectModelBuffer ? [modelBufferDiagnosticPlugin(diagnosticRuntimePaths, { allowGrammarMask: sentenceGrammar })] : []),
        ...(inspectDispatch ? [dispatchDiagnosticPlugin(diagnosticRuntimePaths), ...(!completeStory ? [firstTokenStopPlugin(diagnosticRuntimePaths)] : [])] : []),
        ...(submitEachDispatch ? [submissionDiagnosticPlugin(diagnosticRuntimePaths)] : []),
        ...(completeStory ? [completeStoryPlugin(repo, diagnosticRuntimePaths, { connected: connectedStory })] : []),
        ...(repairSoftmaxRace ? [shaderRepairPlugin(diagnosticRuntimePaths)] : []),
        ...(replayArrival ? [writeTimingPlugin(repo, diagnosticRuntimePaths)] : []),
        ...(sentenceGrammar ? [arrivalGrammarPlugin(repo, diagnosticRuntimePaths)] : []),
        ...(sentenceBudget ? [sentenceBudgetPlugin(repo)] : []),
        ...(candidateTransferCheck ? [transferDiagnosticPlugin(repo)] : []),
        ...(candidateComputeCheck ? [computeDiagnosticPlugin(repo)] : [])],
      worker: { format: 'es', plugins: () => [...(candidateScenes ? [candidateModelPlugin(repo)] : []),
        ...(candidateDiagnostic ? [samplingDiagnosticPlugin(diagnosticRuntimePaths, { beforeSort: observePreSort })] : []),
        ...(inspectModelBuffer ? [modelBufferDiagnosticPlugin(diagnosticRuntimePaths, { allowGrammarMask: sentenceGrammar })] : []),
        ...(inspectDispatch ? [dispatchDiagnosticPlugin(diagnosticRuntimePaths), ...(!completeStory ? [firstTokenStopPlugin(diagnosticRuntimePaths)] : [])] : []),
        ...(submitEachDispatch ? [submissionDiagnosticPlugin(diagnosticRuntimePaths)] : []),
        ...(completeStory ? [completeStoryPlugin(repo, diagnosticRuntimePaths, { connected: connectedStory })] : []),
        ...(repairSoftmaxRace ? [shaderRepairPlugin(diagnosticRuntimePaths)] : []),
        ...(replayArrival ? [writeTimingPlugin(repo, diagnosticRuntimePaths)] : []),
        ...(sentenceGrammar ? [arrivalGrammarPlugin(repo, diagnosticRuntimePaths)] : []),
        ...(sentenceBudget ? [sentenceBudgetPlugin(repo)] : []),
        ...(candidateTransferCheck ? [transferDiagnosticPlugin(repo)] : []),
        ...(candidateComputeCheck ? [computeDiagnosticPlugin(repo)] : [])] },
      build: { outDir: dist, emptyOutDir: false, target: 'es2022', rollupOptions: { input: resolve(root, 'webgpu-v1.html') } },
    }), 60_000, 'Probe build');
    guard();
    server = createServer((request, response) => {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      const file = resolve(dist, pathname === '/' ? 'webgpu-v1.html' : pathname.slice(1));
      if (!file.startsWith(dist + '/')) { response.writeHead(403).end(); return; }
      response.setHeader('Content-Type', mime(file));
      createReadStream(file).on('error', () => { if (!response.headersSent) response.writeHead(404); response.end(); }).pipe(response);
    });
    // A stable, exclusively bound local origin lets this owned profile reuse its CacheStorage.
    await new Promise((accept, decline) => { server.once('error', decline); server.listen(19877, '127.0.0.1', accept); });
    const origin = 'http://127.0.0.1:19877';
    context = await chromium.launchPersistentContext(profile, { headless: true, args: [...webgpuV1Flags], timeout: 15_000 });
    report.browser = context.browser()?.version();
    context.on('request', (request) => report.requests.push({ elapsedMs: Date.now() - started, phase: report.phase,
      method: request.method(), resourceType: request.resourceType(), url: safeUrl(request.url()) }));
    context.on('requestfailed', (request) => report.errors.push({ type: 'requestfailed', url: safeUrl(request.url()), error: request.failure()?.errorText }));
    await context.route('**/*', async (route) => {
      const request = route.request(); const url = new URL(request.url());
      const artifact = url.href.startsWith(webgpuV1.modelUrl) || url.href === webgpuV1.modelLib
        || url.href.startsWith(`https://huggingface.co/api/resolve-cache/models/mlc-ai/${webgpuV1.modelId}/${webgpuV1.modelRevision}/`)
        || url.hostname.endsWith('.hf.co') || url.hostname.endsWith('.huggingface.co');
      if (['GET', 'HEAD'].includes(request.method()) && (url.origin === origin || (online && artifact))) return route.continue();
      report.blockedRequests.push({ elapsedMs: Date.now() - started, phase: report.phase, method: request.method(), url: safeUrl(request.url()) });
      return route.abort('blockedbyclient');
    });
    page = context.pages()[0] ?? await context.newPage();
    page.on('pageerror', (error) => report.errors.push({ type: 'pageerror', message: String(error).slice(0, 1000) }));
    page.on('console', (message) => {
      const text = message.text();
      const dispatchEvent = inspectDispatch && [
        ['TG2_DISPATCH_DIAGNOSTIC ', 'dispatchObservations', 16, 524288],
        ['TG2_FIRST_TOKEN_STOP ', 'firstTokenStops', 1, 2000],
        ['TG2_DEVICE_LOSS ', 'deviceLosses', 1, 4000],
        ...(submitEachDispatch ? [['TG2_SUBMISSION_DIAGNOSTIC ', 'submissionObservations', 1, 4000]] : []),
        ...(completeStory ? [['TG2_COMPLETE_STORY ', 'completeStoryObservations', connectedStory ? 3 : 1, 4000]] : []),
        ...(repairSoftmaxRace ? [['TG2_SHADER_REPAIR ', 'shaderRepairObservations', 1, 4000]] : []),
        ...(replayArrival ? [['TG2_WRITE_TIMING ', 'writeTimingObservations', 128, 4000]] : []),
        ...(sentenceGrammar ? [['TG2_ARRIVAL_GRAMMAR ', 'arrivalGrammarObservations', 2, 2000]] : []),
        ...(sentenceBudget ? [['TG2_SENTENCE_BUDGET ', 'sentenceBudgetObservations', 2, 8000]] : []),
      ].find(([prefix]) => text.startsWith(prefix));
      if (dispatchEvent) {
        const [prefix, field, limit, maximumLength] = dispatchEvent;
        try {
          if (text.length >= maximumLength || report[field].length >= limit) throw new Error('record bound exceeded');
          const record = JSON.parse(text.slice(prefix.length));
          if (record === null || typeof record !== 'object' || Array.isArray(record)) throw new Error('invalid record');
          report[field].push(record);
          // Keep every timing event in memory, but avoid a full receipt rewrite for
          // each token. Milestones/every eighth timing event and final cleanup persist
          // partial progress; the write deadline does not depend on worker settlement.
          if (field !== 'writeTimingObservations' || report[field].length % 8 === 0
            || record.phase !== 'decode-end') void checkpoint();
        } catch { report.errors.push({ type: 'invalid-dispatch-diagnostic', field }); }
      } else if (inspectModelBuffer && text.startsWith('TG2_MODEL_BUFFER_DIAGNOSTIC ')) {
        if (text.length >= 40_000 || report.modelBufferObservations.length >= 1) {
          report.errors.push({ type: 'invalid-model-buffer-diagnostic', reason: 'record bound exceeded' });
        } else {
          try { report.modelBufferObservations.push(JSON.parse(text.slice('TG2_MODEL_BUFFER_DIAGNOSTIC '.length))); void checkpoint(); }
          catch { report.errors.push({ type: 'invalid-model-buffer-diagnostic' }); }
        }
      } else if (candidateComputeCheck && text.startsWith('TG2_COMPUTE_DIAGNOSTIC ') && text.length < 40_000 && report.computeObservations.length < 1) {
        try { report.computeObservations.push(JSON.parse(text.slice('TG2_COMPUTE_DIAGNOSTIC '.length))); void checkpoint(); }
        catch { report.errors.push({ type: 'invalid-compute-diagnostic' }); }
      } else if (candidateTransferCheck && text.startsWith('TG2_TRANSFER_DIAGNOSTIC ') && text.length < 40_000 && report.transferObservations.length < 1) {
        try { report.transferObservations.push(JSON.parse(text.slice('TG2_TRANSFER_DIAGNOSTIC '.length))); void checkpoint(); }
        catch { report.errors.push({ type: 'invalid-transfer-diagnostic' }); }
      } else if (candidateDiagnostic && text.startsWith('TG2_SAMPLING_DIAGNOSTIC ') && text.length < 40_000 && report.samplingObservations.length < 64) {
        try { report.samplingObservations.push(JSON.parse(text.slice('TG2_SAMPLING_DIAGNOSTIC '.length))); void checkpoint(); }
        catch { report.errors.push({ type: 'invalid-sampling-diagnostic' }); }
      } else if (candidateScenes && text.startsWith('TG2_CANDIDATE_RAW ') && text.length < 40_000 && report.candidateRawOutputs.length < plannedScenes) {
        try { report.candidateRawOutputs.push(JSON.parse(text.slice('TG2_CANDIDATE_RAW '.length))); }
        catch { report.errors.push({ type: 'invalid-candidate-raw-output' }); }
      } else if (replay && text.startsWith('TG2_WRITER_NUMERICS ') && text.length < 40_000 && report.diagnostics.length < plannedScenes) {
        try { report.diagnostics.push(JSON.parse(text.slice('TG2_WRITER_NUMERICS '.length))); }
        catch { report.errors.push({ type: 'invalid-diagnostics' }); }
      } else if (message.type() === 'error') report.errors.push({ type: 'console-error', message: text.slice(0, 1000) });
    });
    await page.exposeFunction('reportWebgpuV1Event', async (event) => {
      if (event.type === 'load-progress') {
        report.progress.push({ elapsedMs: Date.now() - started, ...event });
        log({ phase: report.phase, ...event });
      } else if (event.type === 'generated-text') report.generatedChunks.push(event);
      else report.errors.push(event);
      await checkpoint();
    });
    await page.goto(origin + (sentenceBudget ? '/?candidate-diagnostic=1&cache-only=1&replay-arrival=1&compact-arrival=1&grounded-arrival=1&sentence-budget=1' : sentenceGrammar ? '/?candidate-diagnostic=1&cache-only=1&replay-arrival=1&compact-arrival=1&grounded-arrival=1&sentence-grammar=1' : groundedArrival ? '/?candidate-diagnostic=1&cache-only=1&replay-arrival=1&compact-arrival=1&grounded-arrival=1' : compactArrival ? '/?candidate-diagnostic=1&cache-only=1&replay-arrival=1&compact-arrival=1' : replayArrival ? '/?candidate-diagnostic=1&cache-only=1&replay-arrival=1' : connectedStory ? '/?candidate-diagnostic=1&cache-only=1&connected-story=1' : candidateDiagnostic ? '/?candidate-diagnostic=1&cache-only=1' : candidateScenes ? `/?candidate-scenes=1&cache-only=${cacheOnly ? '1' : '0'}` : replaySequence ? '/?replay-sequence=1' : replayFarewell ? '/?replay-farewell=1' : productionSolo ? '/?production-solo=1' : productionScenes ? '/?production-scenes=1' : '/'),
      { waitUntil: 'load', timeout: 15_000 });
    report.cacheBeforeLoad = await page.evaluate(() => globalThis.webgpuV1Probe.cacheInventory());
    report.capability = await page.evaluate(async () => {
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error('No WebGPU adapter');
      const info = adapter.info;
      return { vendor: info.vendor, architecture: info.architecture, device: info.device,
        description: info.description, isFallbackAdapter: info.isFallbackAdapter,
        features: [...adapter.features], maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize };
    });
    if (report.capability.isFallbackAdapter || !report.capability.features.includes('shader-f16')) throw new Error('This candidate requires a nonfallback shader-f16 adapter');
    report.phase = 'load'; await checkpoint();
    report.load = await timed(page.evaluate(() => globalThis.webgpuV1Probe.load()), webgpuV1.loadDeadlineMs, 'GPU model load');
    guard();
    online = false; await context.setOffline(true); report.offlineAfterLoad = true;
    if (candidateComputeCheck) {
      if (report.computeObservations.length !== 1) throw new Error('Expected exactly one computation diagnostic report');
      report.complete = true; report.phase = 'closed-after-compute-check';
      return;
    }
    if (candidateTransferCheck) {
      if (report.transferObservations.length !== 1) throw new Error('Expected exactly one transfer diagnostic report');
      report.complete = true; report.phase = 'closed-after-transfer-check';
      return;
    }
    input = createInterface({ input: process.stdin });
    input.on('line', (line) => { if (lineWaiter) { const accept = lineWaiter; lineWaiter = undefined; accept(line.trim()); } else commandQueue.push(line.trim()); });
    input.on('close', () => { if (lineWaiter) { lineWaiter('quit'); lineWaiter = undefined; } else commandQueue.push('quit'); });
    for (let index = 0; index < plannedScenes; index += 1) {
      guard(); report.phase = `scene-${index + 1}`;
      const fixture = await page.evaluate((value) => globalThis.webgpuV1Probe.prepare(value), index);
      report.inputs.push(fixture); await checkpoint();
      const writeStarted = Date.now();
      const result = await timed(page.evaluate((value) => globalThis.webgpuV1Probe.write(value), index), webgpuV1.generationDeadlineMs, 'GPU scene')
        .catch((error) => ({ ...fixture, status: 'failed', error: String(error), cleaned: null,
          raw: productionMode ? null : report.generatedChunks.filter((chunk) => chunk.index === index).map((chunk) => chunk.text).join(''),
          usage: null, firstTokenMs: null, finishReason: null,
          generationMs: Date.now() - writeStarted, partialOutputAvailable: !productionMode, partialOutputOnly: !productionMode }));
      if (sentenceGrammar) report.outputShape = inspectArrivalOutputShape(result.raw);
      if (sentenceBudget) {
        const settlement = report.sentenceBudgetObservations[0];
        result.sentenceBudgetOutcome = { mode: settlement?.mode ?? 'unsettled',
          sentenceCount: settlement?.sentenceCount ?? null };
      }
      report.outputs.push(result); await checkpoint(); log({ phase: report.phase, result, reportPath });
      if (inspectDispatch) {
        if (repairSoftmaxRace && !isCompleteShaderRepairEvidence(report)) {
          throw new Error('Shader repair did not produce complete source and dispatch evidence');
        }
        if (submitEachDispatch && (report.submissionObservations.length !== 1
          || !isCompleteSubmissionDiagnostic(report.submissionObservations[0]))) {
          throw new Error('Per-dispatch submission policy did not produce complete evidence');
        }
        if (completeStory) {
          const completedWrites = connectedStory
            ? isCompleteConnectedStoryEvidence(report.completeStoryObservations, index + 1)
            : report.completeStoryObservations.length === 1 && isCompleteStoryDiagnostic(report.completeStoryObservations[0]);
          if (!completedWrites
            || !hasCompleteFirstTokenEvidence(report) || report.firstTokenStops.length !== 0) {
            throw new Error('Complete-story trial did not produce complete execution evidence');
          }
        } else {
          if (!isExpectedFirstTokenStop(report, result)) throw new Error('First-token diagnostic did not reach its verified intentional stop');
          report.requestTermination = { expected: true, afterSample: 1, completedStory: false,
            workerReplyPreserved: true, reason: 'comparison-complete' };
          report.complete = true; report.phase = 'closed-after-first-token-diagnostic';
          return;
        }
      }
      if (result.status !== 'completed') throw new Error(result.error ?? 'GPU generation failed');
      if (sentenceGrammar && !hasCompleteGrammarArrivalEvidence(report)) {
        throw new Error('Grammar arrival requires valid raw prose and actual constrained-runtime evidence');
      }
      if (sentenceBudget && !hasCompleteSentenceBudgetArrivalEvidence(report)) {
        throw new Error('Sentence-budget arrival requires an unchanged completed prefix and successful stop/drain evidence');
      }
      if (replayArrival && !isCompleteWriteTiming(report.writeTimingObservations)) {
        throw new Error('Arrival replay lacks complete write timing; partial progress is not settlement');
      }
      if (connectedStory && !hasConnectedStoryProgress(report.outputs)) {
        throw new Error('Connected story requires accepted current-run prose and exact memory provenance');
      }
      if (completeStory) report.dispatchDiagnostic.completedStory = true;
      if (inspectModelBuffer && (report.modelBufferObservations.length !== 1
        || report.errors.some(error => error.type === 'invalid-model-buffer-diagnostic'))) {
        throw new Error('Expected exactly one bounded model-buffer diagnostic report');
      }
      report.phase = 'human-review'; await checkpoint();
      log(index < plannedScenes - 1
        ? `Paused after scene ${index + 1}. Enter next to approve exactly one more scene, or quit to stop.`
        : `Paused after scene ${index + 1}. Enter quit to finish; no further scene is authorized.`);
      let command;
      const singleScene = connectedStory ? index === plannedScenes - 1 : productionSolo || replayFarewell || candidateDiagnostic;
      const allowedCommands = singleScene ? ['quit'] : ['next', 'quit'];
      do { command = await nextCommand(); if (!allowedCommands.includes(command)) log(singleScene ? 'Expected quit; this one-scene check has no next scene.' : 'Expected next or quit.'); } while (!allowedCommands.includes(command));
      guard();
      report.approvals.push({ afterScene: index + 1, command, at: new Date().toISOString() });
      if (command === 'quit' || index === plannedScenes - 1) break;
    }
    guard();
    if (connectedStory && report.outputs.length !== plannedScenes) {
      report.phase = 'closed-before-connected-sequence';
      return;
    }
    report.complete = true; report.phase = 'closed-after-human-review';
  };
  try { await timed(execute(), totalDeadlineMs, 'Entire GPU probe'); }
  catch (error) { cancelled = true; report.errors.push({ phase: report.phase, message: String(error) }); process.exitCode = 1; }
  finally {
    // Playwright's installed process launcher registers an exit hook that kills
    // only browser process groups created by this Node process. Never use a broad pkill.
    const cleanupWatchdog = setTimeout(() => {
      report.complete = false; report.phase = 'cleanup-watchdog';
      report.cleanup.forcedProcessExit = true; report.elapsedMs = Date.now() - started;
      report.errors.push({ phase: 'cleanup', message: 'Owned cleanup exceeded 25s; exiting through Playwright child-process exit hooks. Closure not confirmed.' });
      try { writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n'); }
      finally { log({ reportPath, complete: false, cleanup: report.cleanup }); process.exit(1); }
    }, 25_000);
    cancelled = true; input?.close();
    if (page && !page.isClosed()) report.cleanup.workerTerminated = await timed(page.evaluate(() => globalThis.webgpuV1Probe?.dispose().workerTerminated ?? false), 3_000, 'Worker termination').catch(() => false);
    if (context) {
      try { await timed(context.close(), 10_000, 'Browser context cleanup'); report.cleanup.contextClosed = true; report.cleanup.browserClosed = true; }
      catch (error) {
        report.errors.push({ phase: 'cleanup', message: String(error) });
        const browser = context.browser();
        if (browser) await timed(browser.close(), 5_000, 'Browser fallback cleanup').then(() => {
          report.cleanup.contextClosed = true; report.cleanup.browserClosed = true;
        }).catch((failure) => report.errors.push({ phase: 'cleanup', message: String(failure) }));
      }
    } else report.cleanup.contextClosed = report.cleanup.browserClosed = true;
    if (server) {
      server.closeAllConnections();
      await timed(new Promise((accept) => server.close(accept)), 5_000, 'Local server cleanup')
        .then(() => { report.cleanup.serverClosed = true; })
        .catch((error) => report.errors.push({ phase: 'cleanup', message: String(error) }));
    } else report.cleanup.serverClosed = true;
    if (!Object.values(report.cleanup).every((value) => value === true)) {
      report.complete = false; process.exitCode = 1;
      report.errors.push({ phase: 'cleanup', message: 'One or more owned resources did not confirm closure.' });
    }
    report.elapsedMs = Date.now() - started;
    if (inspectDispatch && (report.errors.length || report.deviceLosses.length)) { report.complete = false; process.exitCode = 1; }
    await checkpoint(); log({ reportPath, phase: report.phase, complete: report.complete, outputs: report.outputs.length, cleanup: report.cleanup });
    if (!report.cleanup.browserClosed) process.exit(1);
    clearTimeout(cleanupWatchdog);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => { log(String(error)); process.exitCode = 1; });
}
