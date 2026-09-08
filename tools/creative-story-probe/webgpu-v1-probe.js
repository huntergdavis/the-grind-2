import { CreateWebWorkerMLCEngine } from '@tg2-webllm-v1';
import { buildCreativeStoryMessages, cleanCreativeStoryOutput, selectStorySeed } from '../../src/narrator/creative-story';
import { createNarrativeJournal } from '../../src/ui/narrative-journal';
import { selectNarrativeContinuity } from '../../src/ui/narrative-continuity';
import { createSuccessiveStoryCases, isExactRecalledPassage } from './successive-story-cases.mjs';
import { buildEmotionalSceneMessages } from './emotional-scene-messages.mjs';
import { webgpuV1 } from './webgpu-v1-config.mjs';
import { createWebgpuV1ProductionCases } from './webgpu-v1-cases.mjs';
import { captureStoryCharacterAnchor, hasStoryCharacterAnchor } from '../../src/narrator/story-character-anchor';
import { buildCreativeWriterConversation } from '../../src/narrator/creative-writer-conversation';

const productionScenes = new URLSearchParams(location.search).get('production-scenes') === '1';
const cases = productionScenes ? createWebgpuV1ProductionCases() : createSuccessiveStoryCases();
// Reuse the production journal, but never inherit a previous probe's narrative.
const journal = createNarrativeJournal(() => ({ getItem: () => null, setItem: () => {} }));
let worker, engine, prepared, attempted = 0;
const publish = (event) => { void globalThis.reportWebgpuV1Event?.(event); };

globalThis.webgpuV1Probe = {
  identity: webgpuV1,
  async cacheInventory() {
    return Promise.all((await caches.keys()).map(async (name) => ({ name,
      urls: (await (await caches.open(name)).keys()).map((request) => request.url) })));
  },
  async load() {
    if (worker) throw new Error('Exactly one GPU model load is permitted');
    worker = new Worker(new URL('./webgpu-v1-worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('error', (event) => publish({ type: 'worker-error', message: event.message }));
    const started = performance.now();
    engine = await CreateWebWorkerMLCEngine(worker, webgpuV1.modelId, {
      appConfig: { cacheBackend: 'cache', model_list: [{ model: webgpuV1.modelUrl,
        model_id: webgpuV1.modelId, model_lib: webgpuV1.modelLib,
        required_features: ['shader-f16'], overrides: { context_window_size: webgpuV1.contextWindow } }] },
      initProgressCallback: (progress) => publish({ type: 'load-progress', ...progress }),
    }, { context_window_size: webgpuV1.contextWindow });
    return { loadMs: Math.round(performance.now() - started), cacheNames: await caches.keys() };
  },
  prepare(index) {
    if (!engine || prepared || index !== attempted || !cases[index]) throw new Error('Only the selected ordered, individually approved scenes are allowed');
    const fixture = cases[index];
    const continuity = selectNarrativeContinuity(journal.snapshot.entries, fixture.job, fixture.viewpoint);
    const expectedMemories = productionScenes ? [0, 1, 2, 0][index] : index;
    if (continuity.length !== expectedMemories) throw new Error(`Expected ${expectedMemories} actual production-selected memories, received ${continuity.length}`);
    const seed = selectStorySeed(fixture.mode, fixture.identity, fixture.attempt, { viewpoint: fixture.viewpoint, focus: fixture.focus });
    const productionMessages = buildCreativeStoryMessages(fixture.job, seed, fixture.viewpoint, fixture.focus, continuity);
    const messages = productionScenes ? productionMessages
      : buildEmotionalSceneMessages(fixture.job, fixture.viewpoint, fixture.focus, productionMessages.slice(1, -1));
    prepared = { ...fixture, seed, continuity,
      promptMode: productionScenes ? 'unmodified-production-builder' : 'shared-emotional-builder',
      messages, modelMessages: productionScenes ? buildCreativeWriterConversation(messages) : messages };
    return prepared;
  },
  async write(index) {
    if (!prepared || index !== attempted) throw new Error('Prepare each scene once before generation');
    const fixture = prepared;
    prepared = undefined;
    attempted += 1;
    const started = performance.now();
    let raw = '', usage = null, firstTokenMs = null, finishReason = null;
    try {
      // Production resets every operation; retained state must come only from selected journal history.
      if (productionScenes) await engine.resetChat(false, webgpuV1.modelId);
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
      const cleaned = cleanCreativeStoryOutput(raw);
      const exactMemoryRepeat = isExactRecalledPassage(cleaned, fixture.continuity);
      const characterAnchorPreserved = cleaned !== null && hasStoryCharacterAnchor(cleaned,
        captureStoryCharacterAnchor(fixture.viewpoint, fixture.focus));
      const acceptedNewStory = cleaned !== null && !exactMemoryRepeat && characterAnchorPreserved;
      const archived = acceptedNewStory && journal.record({ sourceEventId: fixture.job.eventId,
        campaignId: fixture.job.campaignId, sourceTick: fixture.job.tick, readyAtMs: Date.now(), text: cleaned,
        location: fixture.facts.location, headline: fixture.facts.headline, origin: 'model', inspirationTone: 'care' });
      return { ...fixture, status: 'completed', raw, cleaned, usage, firstTokenMs, finishReason,
        independentChatReset: productionScenes && index === 3,
        productionChatReset: productionScenes,
        generationMs: Math.round(performance.now() - started), exactMemoryRepeat, characterAnchorPreserved, acceptedNewStory, archived, journal: journal.snapshot };
    } catch (error) {
      return { ...fixture, status: 'failed', raw, cleaned: null, usage, firstTokenMs, finishReason,
        generationMs: Math.round(performance.now() - started), error: String(error) };
    }
  },
  dispose() {
    engine?.interruptGenerate();
    // Terminating the owned worker also cancels an incomplete reload or GPU submission.
    worker?.terminate();
    engine = undefined;
    return { workerTerminated: Boolean(worker) };
  },
};
