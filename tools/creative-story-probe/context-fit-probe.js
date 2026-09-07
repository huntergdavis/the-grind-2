import {
  createCreativeWriterClient, hasCachedCreativeWriterModel,
  creativeWriterModelId, creativeWriterModelRevision,
  creativeWriterLoadTimeoutMs, creativeWriterInferenceTimeoutMs,
} from '../../src/narrator/creative-writer-client';
import { buildCreativeStoryMessages, cleanCreativeStoryOutput, selectStorySeed } from '../../src/narrator/creative-story';
import { createContextFitCases } from './context-fit-cases.mjs';
import baseline from './viewpoint-report.json';

const cases = createContextFitCases(baseline).map((fixture) => {
  const { viewpoint, focus } = fixture;
  const seed = selectStorySeed(fixture.mode, fixture.identity, fixture.attempt, { viewpoint, focus });
  const expectedFit = fixture.id === 'injured-active-companion' ? 'care'
    : fixture.id === 'newly-sworn-companion' ? 'trust' : null;
  if (expectedFit !== null && seed.relationshipFit !== expectedFit) {
    throw new Error(`Production context selection is not ready for ${fixture.id}: expected ${expectedFit}`);
  }
  return {
    ...fixture, fixtureKind: 'synthetic-public-scene',
    seed, seedId: seed.id, seedTheme: seed.theme, relationshipFit: seed.relationshipFit ?? null,
    messages: buildCreativeStoryMessages(fixture.job, seed, viewpoint, focus),
  };
});

let client;
globalThis.creativeContextFitProbe = {
  identity: {
    modelId: creativeWriterModelId, revision: creativeWriterModelRevision,
    loadTimeoutMs: creativeWriterLoadTimeoutMs, inferenceTimeoutMs: creativeWriterInferenceTimeoutMs,
  },
  cases,
  cached: hasCachedCreativeWriterModel,
  async load() {
    if (client) throw new Error('Context-fit probe loads one production client only');
    client = createCreativeWriterClient();
    const started = performance.now();
    const progress = [];
    await client.load((message) => { if (!progress.includes(message)) progress.push(message); });
    return { loadMs: Math.round(performance.now() - started), cached: await hasCachedCreativeWriterModel(), progress };
  },
  async write(index) {
    const fixture = cases[index];
    if (!fixture || !client) throw new Error('Unknown context-fit fixture or unloaded writer');
    const started = performance.now();
    const raw = await client.write(fixture.messages);
    return { ...fixture, raw, cleaned: cleanCreativeStoryOutput(raw), generationMs: Math.round(performance.now() - started) };
  },
  dispose() { client?.dispose(); client = undefined; },
};
