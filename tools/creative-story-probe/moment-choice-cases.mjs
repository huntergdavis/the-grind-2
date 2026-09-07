import { createContextFitCases } from './context-fit-cases.mjs';

function job(id, tick, facts) {
  return Object.freeze({
    schemaVersion: 1, task: 'author-story-beat', disposition: 'manual-ephemeral-noncanonical',
    campaignId: 'synthetic:moment-choice', eventId: `synthetic:${id}`, tick,
    sourceFingerprint: '0123456789abcdef',
    facts: Object.freeze({ schemaVersion: 1, kind: 'public-story-beat', ...facts }),
    deterministicFallback: facts.headline, maximumInputTokens: 320, maximumOutputTokens: 48,
  });
}

/** Explicit public fixtures, not a recorded campaign or a browser TTL/queue test. */
export function createMomentChoiceCases(baseline) {
  const arch = createContextFitCases(baseline)[0];
  const milestoneJob = job('recorded-rowan-farewell', 40, {
    location: 'Greyford', headline: 'Mara and Rowan parted at Greyford.',
    action: 'Rowan left the travelling party.',
    consequence: 'Rowan was alive and injured when their shared road ended.',
  });
  return Object.freeze([
    { id: 'sealed-arch-or-recorded-farewell', currentJob: job('current-sealed-arch', 43, arch.facts) },
    { id: 'ordinary-travel-or-recorded-farewell', currentJob: job('current-solo-travel', 44, {
      location: 'Dawnwood road', headline: 'Mara continued along the road.',
      action: 'Mara travelled toward Dawnwood.',
      consequence: 'The route advanced; no encounter occurred.',
    }) },
  ].map((fixture) => Object.freeze({
    ...fixture, milestoneJob, fixtureKind: 'synthetic-public-moment-pair',
    eligibility: 'Two explicitly eligible input fixtures, not observed gameplay or a TTL validation',
    choices: Object.freeze({ '1': 'current-public-scene', '2': 'recorded-companion-farewell' }),
    excludedChoice: '3',
  })));
}
