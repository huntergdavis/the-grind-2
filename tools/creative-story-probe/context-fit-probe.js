import {
  createCreativeWriterClient, hasCachedCreativeWriterModel,
  creativeWriterModelId, creativeWriterModelRevision,
  creativeWriterLoadTimeoutMs, creativeWriterInferenceTimeoutMs,
  creativeWriterDirectionTimeoutMs,
} from '../../src/narrator/creative-writer-client';
import { buildCreativeStoryMessages, cleanCreativeStoryOutput, selectStorySeed } from '../../src/narrator/creative-story';
import { buildCreativeDirectionMessages, directionChoiceForStage } from '../../src/narrator/creative-direction';
import { buildCreativeMomentMessages } from '../../src/narrator/creative-moment';
import { createContextFitCases } from './context-fit-cases.mjs';
import { createMomentChoiceCases } from './moment-choice-cases.mjs';
import { createFirstVictoryChoiceCases } from './first-victory-choice-cases.mjs';
import { withExemplarDemonstrations } from './exemplar-messages.mjs';
import baseline from './viewpoint-report.json';

const exemplars = new URLSearchParams(location.search).get('exemplars') === '1';
const firstVictoryChoice = new URLSearchParams(location.search).get('first-victory-choice') === '1';
const momentChoice = firstVictoryChoice || new URLSearchParams(location.search).get('moment-choice') === '1';
const directionCooldown = new URLSearchParams(location.search).get('direction-cooldown') === '1';
const direction = directionCooldown || new URLSearchParams(location.search).get('direction') === '1';
const cases = momentChoice ? (firstVictoryChoice ? createFirstVictoryChoiceCases(baseline) : createMomentChoiceCases(baseline)).map((fixture) => ({
  ...fixture, momentMessages: buildCreativeMomentMessages(fixture.currentJob, fixture.milestoneJob, fixture.milestoneKind),
})) : createContextFitCases(baseline).map((fixture, index) => {
  const { viewpoint, focus } = fixture;
  const seed = selectStorySeed(fixture.mode, fixture.identity, fixture.attempt, { viewpoint, focus });
  const expectedFit = fixture.id === 'injured-active-companion' ? 'care'
    : fixture.id === 'newly-sworn-companion' ? 'trust' : null;
  if (expectedFit !== null && seed.relationshipFit !== expectedFit) {
    throw new Error(`Production context selection is not ready for ${fixture.id}: expected ${expectedFit}`);
  }
  const productionMessages = buildCreativeStoryMessages(fixture.job, seed, viewpoint, focus);
  const previousStage = directionCooldown ? ['parchment', 'orrery', 'moth-court'][index] : undefined;
  const excludedChoice = previousStage === undefined ? undefined : directionChoiceForStage(previousStage);
  return {
    ...fixture, fixtureKind: 'synthetic-public-scene',
    seed, seedId: seed.id, seedTheme: seed.theme, relationshipFit: seed.relationshipFit ?? null,
    ...(exemplars ? { productionMessages, systemOnlyDemonstrations: true } : {}),
    ...(direction ? { directionMessages: buildCreativeDirectionMessages(fixture.job, viewpoint, focus, previousStage) } : {}),
    ...(directionCooldown ? { previousStage, excludedChoice, eligibilityFixture: 'Explicit synthetic previous-stage input, not observed gameplay history' } : {}),
    messages: exemplars ? withExemplarDemonstrations(productionMessages) : productionMessages,
  };
});

let client;
globalThis.creativeContextFitProbe = {
  identity: {
    modelId: creativeWriterModelId, revision: creativeWriterModelRevision,
    loadTimeoutMs: creativeWriterLoadTimeoutMs, inferenceTimeoutMs: creativeWriterInferenceTimeoutMs,
    ...(direction ? { directionTimeoutMs: creativeWriterDirectionTimeoutMs } : {}),
    ...(momentChoice ? { momentTimeoutMs: creativeWriterDirectionTimeoutMs } : {}),
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
  async direct(index) {
    const fixture = cases[index];
    if (!fixture?.directionMessages || !client) throw new Error('Unknown direction fixture or unloaded writer');
    const started = performance.now();
    const choice = await client.direct(fixture.directionMessages,
      fixture.excludedChoice === undefined ? undefined : { exclude: fixture.excludedChoice });
    return { ...fixture, choice,
      ...(directionCooldown ? { eligible: ['1', '2', '3'].includes(choice) && choice !== fixture.excludedChoice } : {}),
      generationMs: Math.round(performance.now() - started) };
  },
  async chooseMoment(index) {
    const fixture = cases[index];
    if (!fixture?.momentMessages || !client) throw new Error('Unknown moment pair or unloaded writer');
    const started = performance.now();
    const choice = await client.chooseMoment(fixture.momentMessages);
    return { ...fixture, choice, eligible: choice === '1' || choice === '2',
      generationMs: Math.round(performance.now() - started) };
  },
  dispose() { client?.dispose(); client = undefined; },
};
