import { createSuccessiveStoryCases } from './successive-story-cases.mjs';

/** Public synthetic game facts only; no authored story text or supplied memory. */
export function createWebgpuV1ProductionCases() {
  const pair = createSuccessiveStoryCases().map((fixture) => ({ ...fixture,
    job: { ...fixture.job, maximumInputTokens: 1024, maximumOutputTokens: 64 } }));
  const create = (id, campaignId, tick, facts, viewpoint, mode, expected) => {
    const job = { ...pair[0].job, campaignId, eventId: `synthetic:${id}`, tick,
      sourceFingerprint: tick === 22 ? '3333333333333333' : '4444444444444444',
      facts: { schemaVersion: 1, kind: 'public-story-beat', ...facts }, deterministicFallback: facts.headline };
    return { id, fixtureKind: 'synthetic-public-production-scene', mode, focus: 'inner-life', facts, job, viewpoint,
      identity: JSON.stringify([job.campaignId, job.eventId, job.tick, job.sourceFingerprint]), attempt: 0, expected };
  };
  return [...pair,
    create('injured-companion-farewell-alive', pair[0].job.campaignId, 22, {
      location: 'Greyford', headline: 'Mara and Rowan say farewell after completing their shared-road oath.',
      action: 'Mara said farewell to Rowan at Greyford. Their shared-road oath is complete.',
      consequence: 'Rowan remains alive and injured in Greyford. He is no longer Mara\'s active companion. No healing or death occurred.',
    }, { hero: pair[0].viewpoint.hero, companion: null }, 'town',
    'Develop earlier care and relief into a mixed feeling about farewell. Rowan is alive, still injured, and no longer an active companion; no healing, death, reunion or invented history.'),
    create('solo-traveler-new-adventure', 'synthetic:webgpu-v1-independent-solo', 30, {
      location: 'Road to Old Hollow', headline: 'Inez continues alone toward Old Hollow.',
      action: 'Inez travelled alone on the road toward Old Hollow and has not arrived.',
      consequence: 'Inez remains alive and uninjured, with no active companion. No battle or encounter occurred.',
    }, { hero: { name: 'Inez', values: ['curiosity', 'courage'] }, companion: null }, 'travel',
    'A present hope or worry and a conflicting feeling for Inez alone. No Mara, Rowan, inherited oath, companion, arrival, battle or invented past events.'),
  ];
}
