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

let client;
globalThis.creativeCandidateProbe = {
  identity: {
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
    const fixture = baseline.outputs[index];
    if (!fixture || !client) throw new Error('Unknown baseline fixture or unloaded candidate');
    const { id, fixtureKind, focus, facts, viewpoint, seed, expected, messages } = fixture;
    // Deliberately do not rebuild prompts: current prompt edits must not change this comparison.
    const started = performance.now();
    const raw = await client.write(messages);
    return {
      id, fixtureKind, focus, facts, viewpoint, seed, expected, messages,
      raw, cleaned: cleanCreativeStoryOutput(raw), generationMs: Math.round(performance.now() - started),
      baseline: { raw: fixture.raw, cleaned: fixture.cleaned, generationMs: fixture.generationMs },
    };
  },
};
