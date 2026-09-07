import workerUrl from '../../src/narrator/creative-writer.worker.ts?worker&url';
import runtimeModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import runtimeWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import { createCreativeWriterClient, hasCachedCreativeWriterModel, creativeWriterCacheName,
  creativeWriterModelId, creativeWriterModelRevision, creativeWriterInferenceTimeoutMs } from '../../src/narrator/creative-writer-client';
import { buildCreativeStoryMessages, cleanCreativeStoryOutput, selectStorySeed } from '../../src/narrator/creative-story';
import { createNarrativeJournal } from '../../src/ui/narrative-journal';
import { selectNarrativeContinuity } from '../../src/ui/narrative-continuity';
import { createSuccessiveStoryCases, isExactRecalledPassage } from './successive-story-cases.mjs';
import { assistantPrefillForCase } from './assistant-prefill-cases.mjs';
import { buildEmotionalSceneMessages } from './emotional-scene-messages.mjs';

const cases = createSuccessiveStoryCases();
const assistantPrefill = new URLSearchParams(location.search).get('assistant-prefill') === '1';
const emotion360m = new URLSearchParams(location.search).get('emotion-360m') === '1';
const journal = createNarrativeJournal();
let worker;
let client;
let prepared;
let metrics = null;
let completed = 0;
let terminated = false;
let activePrefix = null;
const publish = (event) => { void globalThis.reportProbeEvent?.(event); };

globalThis.successiveStoryProbe = {
  identity: { modelId: creativeWriterModelId, revision: creativeWriterModelRevision,
    inferenceTimeoutMs: creativeWriterInferenceTimeoutMs },
  cases,
  async prime(artifacts) {
    if (await hasCachedCreativeWriterModel()) throw new Error('Expected a fresh isolated cache');
    const cache = await caches.open(creativeWriterCacheName);
    const modelRoot = `https://huggingface.co/${creativeWriterModelId}/resolve/${creativeWriterModelRevision}/`;
    const runtimeRoot = 'https://the-grind-2.invalid/creative-writer-runtime/';
    const entries = [
      ...artifacts.map((artifact) => ({ key: modelRoot + artifact.name,
        source: new URL(`/model/${artifact.name}`, location.href).href, expectedBytes: artifact.bytes })),
      { key: runtimeRoot + 'ort-wasm-simd-threaded.asyncify.mjs', source: new URL(runtimeModuleUrl, location.href).href },
      { key: runtimeRoot + 'ort-wasm-simd-threaded.asyncify.wasm', source: new URL(runtimeWasmUrl, location.href).href },
    ];
    const receipts = [];
    for (const entry of entries) {
      publish({ type: 'cache-prime-start', key: entry.key });
      if (new URL(entry.source).origin !== location.origin) throw new Error('Only locally staged artifacts may prime cache');
      const response = await fetch(entry.source);
      if (!response.ok) throw new Error('Local artifact staging failed');
      const bytes = Number(response.headers.get('content-length'));
      if (entry.expectedBytes !== undefined && bytes !== entry.expectedBytes) throw new Error('Primed artifact length mismatch');
      await cache.put(entry.key, response);
      receipts.push({ ...entry, bytes });
      publish({ type: 'cache-prime-complete', key: entry.key, bytes });
    }
    return { cached: await hasCachedCreativeWriterModel(), receipts,
      provenance: 'Fresh isolated CacheStorage seeded from verified existing localhost artifacts, not a previous user session or new download.' };
  },
  async boot() {
    if (worker) throw new Error('Exactly one worker is allowed');
    await new Promise((accept, decline) => {
      const timer = setTimeout(() => decline(new Error('Worker bootstrap exceeded10seconds')), 10_000);
      worker = new Worker(new URL(workerUrl, location.href), { type: 'module' });
      worker.addEventListener('message', ({ data }) => {
        if (data?.type === 'probe-boot') { clearTimeout(timer); accept(); }
        if (data?.type === 'probe-input') { metrics = { ...metrics, inputTokens: data.inputTokens,
          effectiveMessages: data.effectiveMessages }; publish({ type: 'input', index: completed, ...metrics }); }
        if (data?.type === 'probe-metrics') metrics = { ...metrics, inputTokens: data.inputTokens, outputTokens: data.outputTokens };
        if (data?.type === 'probe-suffix') metrics = { ...metrics, hostPrefix: data.hostPrefix, generatedSuffix: data.generatedSuffix };
      });
      worker.addEventListener('error', () => { clearTimeout(timer); decline(new Error('Worker bootstrap failed')); });
    });
    client = createCreativeWriterClient({ createWorker: () => ({
      postMessage: (message) => worker.postMessage(assistantPrefill && message.type === 'write'
        ? { ...message, probePrefix: activePrefix } : message),
      addEventListener: (type, listener) => worker.addEventListener(type, listener),
      terminate: () => { worker.terminate(); terminated = true; },
    }) });
  },
  async load() {
    const start = performance.now();
    const progress = [];
    await client.load((message) => { progress.push(message); publish({ type: 'load-progress', message }); }, { cacheOnly: true });
    return { loadMs: Math.round(performance.now() - start), cacheOnly: true,
      cached: await hasCachedCreativeWriterModel(), progress };
  },
  prepare(index) {
    if (index !== completed || !cases[index]) throw new Error('Only two ordered writes are allowed');
    const fixture = cases[index];
    const continuity = selectNarrativeContinuity(journal.snapshot.entries, fixture.job, fixture.viewpoint);
    if (index === 1 && continuity.length !== 1) throw new Error('First model output yielded no eligible complete continuity excerpt');
    const seed = selectStorySeed(fixture.mode, fixture.identity, fixture.attempt,
      { viewpoint: fixture.viewpoint, focus: fixture.focus });
    const productionMessages = buildCreativeStoryMessages(fixture.job, seed, fixture.viewpoint, fixture.focus, continuity);
    prepared = { ...fixture, seed, continuity,
      ...(assistantPrefill ? { hostPrefix: assistantPrefillForCase(fixture.id),
        prefixProvenance: 'Trial-only host-authored factual fragment; emotional generation and quality scored on generatedSuffix separately.' } : {}),
      ...(emotion360m ? { promptProvenance: 'Generic tools-only emotional-scene instruction; original public location/action/consequence and actual production-selected imagined-memory messages. No supplied story prose.',
        productionMessagesForComparison: productionMessages } : {}),
      messages: emotion360m ? buildEmotionalSceneMessages(fixture.job, fixture.viewpoint, fixture.focus,
        productionMessages.slice(1, -1)) : productionMessages };
    return prepared;
  },
  async write(index) {
    if (!prepared || prepared.id !== cases[index]?.id || index !== completed) throw new Error('Prepare each write exactly once in order');
    const fixture = prepared;
    prepared = null;
    metrics = null;
    activePrefix = fixture.hostPrefix ?? null;
    const start = performance.now();
    try {
      const raw = await client.write(fixture.messages);
      const cleaned = cleanCreativeStoryOutput(raw);
      const exactMemoryRepeat = isExactRecalledPassage(cleaned, fixture.continuity);
      const acceptedNewStory = cleaned !== null && !exactMemoryRepeat;
      const archived = acceptedNewStory && journal.record({ sourceEventId: fixture.job.eventId,
        campaignId: fixture.job.campaignId, sourceTick: fixture.job.tick, readyAtMs: Date.now(), text: cleaned,
        location: fixture.facts.location, headline: fixture.facts.headline, origin: 'model', inspirationTone: 'care' });
      completed += 1;
      return { ...fixture, status: 'completed', raw, cleaned, exactMemoryRepeat, acceptedNewStory, archived, journal: journal.snapshot,
        ...metrics, generationMs: Math.round(performance.now() - start) };
    } catch (error) {
      return { ...fixture, status: 'failed', raw: null, cleaned: null, ...metrics,
        error: error instanceof Error ? error.message : String(error), generationMs: Math.round(performance.now() - start) };
    }
  },
  dispose() {
    client?.dispose();
    if (worker && !terminated) { worker.terminate(); terminated = true; }
    return { workerTerminated: terminated };
  },
};
