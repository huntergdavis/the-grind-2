import {
  createCreativeWriterClient,
  hasCachedCreativeWriterModel,
  creativeWriterModelId,
  creativeWriterModelRevision,
  creativeWriterLoadTimeoutMs,
  creativeWriterInferenceTimeoutMs,
} from '../../src/narrator/creative-writer-client';
import { cleanCreativeStoryOutput } from '../../src/narrator/creative-story';
import baseline from './viewpoint-report.json';
import { selectCandidateFixtures } from './candidate-story-opening.mjs';

let client;
const storyOpening = new URLSearchParams(location.search).get('story-opening') === '1';
const fixtures = selectCandidateFixtures(baseline, storyOpening);
let openingAttempted = false;
globalThis.creativeCandidateProbe = {
  identity: {
    experiment: storyOpening ? 'compact-story-opening' : 'historical-viewpoint-comparison',
    modelId: creativeWriterModelId,
    revision: creativeWriterModelRevision,
    loadTimeoutMs: creativeWriterLoadTimeoutMs,
    inferenceTimeoutMs: creativeWriterInferenceTimeoutMs,
  },
  cached: hasCachedCreativeWriterModel,
  async load() {
    if (client) throw new Error('Dispose the previous candidate client before loading');
    client = createCreativeWriterClient();
    const progress = [];
    const started = performance.now();
    await client.load((message) => { if (!progress.includes(message)) progress.push(message); });
    return { loadMs: Math.round(performance.now() - started), progress, cached: await hasCachedCreativeWriterModel() };
  },
  dispose() {
    client?.dispose();
    client = undefined;
  },
  async write(index) {
    const fixture = fixtures[index];
    if (!fixture || !client) throw new Error('Unknown baseline fixture or unloaded candidate');
    if (storyOpening && (index !== 0 || openingAttempted)) throw new Error('The compact opening allows exactly one write attempt');
    if (storyOpening) openingAttempted = true;
    const { id, fixtureKind, focus, facts, viewpoint, seed, expected, messages } = fixture;
    // Historical prompts remain exact. The explicit opening uses the same
    // instruction-only public fixture builder as Node, never authored prose.
    const started = performance.now();
    const raw = await client.write(messages);
    return {
      id, fixtureKind, focus, facts, viewpoint, seed, expected, messages,
      raw, cleaned: cleanCreativeStoryOutput(raw), generationMs: Math.round(performance.now() - started),
      ...(storyOpening ? { job: fixture.job, experiment: 'compact-story-opening' }
        : { baseline: { raw: fixture.raw, cleaned: fixture.cleaned, generationMs: fixture.generationMs } }),
    };
  },
};
