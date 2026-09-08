import { CreateWebWorkerMLCEngine } from '@tg2-webllm-v1';
import { buildCreativeStoryMessages, cleanCreativeStoryOutput, creativeStoryComparisonKey, selectStorySeed } from '../../src/narrator/creative-story';
import { createNarrativeJournal } from '../../src/ui/narrative-journal';
import { selectNarrativeContinuity } from '../../src/ui/narrative-continuity';
import { createSuccessiveStoryCases, isExactRecalledPassage } from './successive-story-cases.mjs';
import { buildEmotionalSceneMessages } from './emotional-scene-messages.mjs';
import { webgpuV1 as baselineWebgpuV1 } from './webgpu-v1-config.mjs';
import { webgpuCandidate } from './webgpu-candidate-config.mjs';
import { createWebgpuV1ProductionCases } from './webgpu-v1-cases.mjs';
import { captureStoryCharacterAnchor, hasStoryCharacterAnchor } from '../../src/narrator/story-character-anchor';
import { buildCreativeWriterConversation } from '../../src/narrator/creative-writer-conversation';
import { createCreativeWriterClient } from '../../src/narrator/creative-writer-client';
import { creativeWriterModelId, creativeWriterModelRevision, creativeWriterModelUrl, creativeWriterModelLib } from '../../src/narrator/creative-writer-model';
import failedSequence from './webgpu-v1-report-2026-09-08T09-35-34-796Z-bca127e5.json';
import failedCandidate from './webgpu-candidate-report-2026-09-08T22-39-25-104Z-700078b2.json';

const parameters = new URLSearchParams(location.search);
const candidateDiagnostic = parameters.get('candidate-diagnostic') === '1';
const candidateScenes = parameters.get('candidate-scenes') === '1' || candidateDiagnostic;
const webgpuV1 = candidateScenes ? webgpuCandidate : baselineWebgpuV1;
const productionScenes = parameters.get('production-scenes') === '1' || candidateScenes;
const productionSolo = parameters.get('production-solo') === '1';
const replayFarewell = parameters.get('replay-farewell') === '1';
const replaySequence = parameters.get('replay-sequence') === '1';
const replay = replayFarewell || replaySequence;
if (candidateDiagnostic && (parameters.get('cache-only') !== '1' || parameters.get('candidate-scenes') === '1'
  || parameters.get('production-scenes') === '1')) throw new Error('Candidate diagnostics require an isolated cache-only replay');
if ([productionScenes, productionSolo, replayFarewell, replaySequence].filter(Boolean).length > 1) throw new Error('Production modes are mutually exclusive');
const productionMode = productionScenes || productionSolo || replay;
const cases = candidateDiagnostic ? failedCandidate.outputs.slice(0, 1) : replaySequence ? failedSequence.outputs : replayFarewell ? [failedSequence.outputs[2]] : productionSolo ? createWebgpuV1ProductionCases().slice(3, 4)
  : productionScenes ? createWebgpuV1ProductionCases() : createSuccessiveStoryCases();
// Reuse the production journal, but never inherit a previous probe's narrative.
const journal = createNarrativeJournal(() => ({ getItem: () => null, setItem: () => {} }));
let worker, engine, writer, prepared, attempted = 0;
const publish = (event) => { void globalThis.reportWebgpuV1Event?.(event); };

globalThis.webgpuV1Probe = {
  identity: webgpuV1,
  async cacheInventory() {
    return Promise.all((await caches.keys()).map(async (name) => ({ name,
      urls: (await (await caches.open(name)).keys()).map((request) => request.url) })));
  },
  async load() {
    if (worker) throw new Error('Exactly one GPU model load is permitted');
    const started = performance.now();
    if (productionMode) {
      if (creativeWriterModelId !== webgpuV1.modelId || creativeWriterModelRevision !== webgpuV1.modelRevision
        || creativeWriterModelUrl !== webgpuV1.modelUrl || creativeWriterModelLib !== webgpuV1.modelLib) {
        throw new Error('Production model identity differs from the pinned probe');
      }
      writer = createCreativeWriterClient({
        createWorker: () => {
          worker = new Worker(new URL('../../src/narrator/creative-writer.worker.ts', import.meta.url),
            { type: 'module', name: 'the-grind-2:creative-writer' });
          worker.addEventListener('error', (event) => publish({ type: 'worker-error', message: event.message }));
          return worker;
        },
        onIdleFailure: () => publish({ type: 'worker-error', message: 'Production writer stopped while idle' }),
      });
      await writer.load((message) => publish({ type: 'load-progress', message }),
        { cacheOnly: !candidateScenes || parameters.get('cache-only') === '1' });
    } else {
      worker = new Worker(new URL('./webgpu-v1-worker.js', import.meta.url), { type: 'module' });
      worker.addEventListener('error', (event) => publish({ type: 'worker-error', message: event.message }));
      engine = await CreateWebWorkerMLCEngine(worker, webgpuV1.modelId, {
        appConfig: { cacheBackend: 'cache', model_list: [{ model: webgpuV1.modelUrl,
          model_id: webgpuV1.modelId, model_lib: webgpuV1.modelLib,
          required_features: ['shader-f16'], overrides: { context_window_size: webgpuV1.contextWindow } }] },
        initProgressCallback: (progress) => publish({ type: 'load-progress', ...progress }),
      }, { context_window_size: webgpuV1.contextWindow });
    }
    return { loadMs: Math.round(performance.now() - started), cacheNames: await caches.keys() };
  },
  prepare(index) {
    if (!(productionMode ? writer?.ready : engine) || prepared || index !== attempted || !cases[index]) throw new Error('Only the selected ordered, individually approved scenes are allowed');
    const fixture = cases[index];
    if (replay || candidateDiagnostic) {
      // Exact recorded production input and its actual earlier generated prose.
      // Fixed-input diagnostic replay, not another three-scene quality qualification.
      const { id, fixtureKind, mode, focus, facts, job, viewpoint, identity, attempt, seed, continuity, messages } = fixture;
      prepared = { id, fixtureKind, mode, focus, facts, job, viewpoint, identity, attempt, seed, continuity, messages,
        promptMode: 'exact-recorded-production-messages', writerPath: candidateDiagnostic
          ? 'production-client-and-worker-with-candidate-adapter' : 'production-client-and-worker',
        rawOutputKind: 'client-result-after-worker-sentence-stop', isolatedSolo: false,
        modelMessagesOrigin: candidateDiagnostic ? 'reconstructed-before-runtime-empty-thinking-header-not-observed-inside-worker'
          : 'reconstructed-not-observed-inside-worker',
        modelMessages: buildCreativeWriterConversation(messages), diagnosticReplay: true };
      return prepared;
    }
    const continuity = selectNarrativeContinuity(journal.snapshot.entries, fixture.job, fixture.viewpoint);
    const expectedMemories = productionSolo ? 0 : productionScenes ? [0, 1, 2, 0][index] : index;
    if (continuity.length !== expectedMemories) throw new Error(`Expected ${expectedMemories} actual production-selected memories, received ${continuity.length}`);
    const seed = selectStorySeed(fixture.mode, fixture.identity, fixture.attempt, { viewpoint: fixture.viewpoint, focus: fixture.focus });
    const productionMessages = buildCreativeStoryMessages(fixture.job, seed, fixture.viewpoint, fixture.focus, continuity);
    const messages = productionMode ? productionMessages
      : buildEmotionalSceneMessages(fixture.job, fixture.viewpoint, fixture.focus, productionMessages.slice(1, -1));
    prepared = { ...fixture, seed, continuity,
      promptMode: productionMode ? 'unmodified-production-builder' : 'shared-emotional-builder',
      writerPath: candidateScenes ? 'production-client-and-worker-with-candidate-adapter' : productionMode ? 'production-client-and-worker' : 'exploratory-proxy-engine',
      rawOutputKind: productionMode ? 'client-result-after-worker-sentence-stop' : 'full-proxy-stream',
      isolatedSolo: productionSolo,
      // Actual worker conversation/overflow handling is not exposed by the client protocol.
      modelMessagesOrigin: candidateScenes ? 'reconstructed-before-runtime-empty-thinking-header-not-observed-inside-worker'
        : productionMode ? 'reconstructed-not-observed-inside-worker' : 'submitted-to-proxy-engine',
      messages, modelMessages: productionMode ? buildCreativeWriterConversation(messages) : messages };
    return prepared;
  },
  async write(index) {
    if (!prepared || index !== attempted) throw new Error('Prepare each scene once before generation');
    const fixture = prepared;
    prepared = undefined;
    attempted += 1;
    const started = performance.now();
    let raw = productionMode ? null : '', usage = null, firstTokenMs = null, finishReason = null;
    try {
      if (productionMode) {
        // Reuse the real reset, sampling, processor, sentence stop, drain and timeout path.
        // Its protocol returns only settled text, not token chunks, usage or finish reason.
        raw = await writer.write(fixture.messages);
      } else {
        const chunks = await engine.chat.completions.create({ model: webgpuV1.modelId,
          messages: fixture.modelMessages, stream: true, stream_options: { include_usage: true },
          max_tokens: webgpuV1.maxTokens, temperature: webgpuV1.temperature,
          top_p: webgpuV1.topP, seed: webgpuV1.seed });
        for await (const chunk of chunks) {
          if (chunk.usage) usage = chunk.usage;
          const text = chunk.choices[0]?.delta?.content ?? '';
          finishReason = chunk.choices[0]?.finish_reason ?? finishReason;
          if (text) {
            firstTokenMs ??= Math.round(performance.now() - started);
            raw += text;
            publish({ type: 'generated-text', index, text, elapsedMs: Math.round(performance.now() - started) });
          }
        }
      }
      const cleaned = cleanCreativeStoryOutput(raw);
      const exactMemoryRepeat = isExactRecalledPassage(cleaned, fixture.continuity);
      // Keep the historical exact flag; new admission also matches production's typography-only gate.
      const recalledPassageRepeat = cleaned !== null && fixture.continuity.some((entry) =>
        creativeStoryComparisonKey(entry.text) === creativeStoryComparisonKey(cleaned));
      const characterAnchorPreserved = cleaned !== null && hasStoryCharacterAnchor(cleaned,
        captureStoryCharacterAnchor(fixture.viewpoint, fixture.focus));
      const acceptedNewStory = cleaned !== null && !recalledPassageRepeat && characterAnchorPreserved;
      const archived = !replay && !candidateDiagnostic && acceptedNewStory && journal.record({ sourceEventId: fixture.job.eventId,
        campaignId: fixture.job.campaignId, sourceTick: fixture.job.tick, readyAtMs: Date.now(), text: cleaned,
        location: fixture.facts.location, headline: fixture.facts.headline, origin: 'model', inspirationTone: 'care' });
      return { ...fixture, status: 'completed', raw, cleaned, usage, firstTokenMs, finishReason,
        independentChatReset: productionMode && (productionSolo || index === 3),
        productionChatReset: productionMode,
        generationMs: Math.round(performance.now() - started), exactMemoryRepeat, recalledPassageRepeat, characterAnchorPreserved, acceptedNewStory, archived, journal: journal.snapshot };
    } catch (error) {
      return { ...fixture, status: 'failed', raw, cleaned: null, usage, firstTokenMs, finishReason,
        partialOutputAvailable: !productionMode,
        generationMs: Math.round(performance.now() - started), error: String(error) };
    }
  },
  dispose() {
    if (writer) writer.dispose();
    else {
      engine?.interruptGenerate();
      // Terminating the owned worker also cancels an incomplete reload or GPU submission.
      worker?.terminate();
    }
    engine = undefined;
    return { workerTerminated: Boolean(worker) };
  },
};
