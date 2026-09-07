import { createContextFitCases } from './context-fit-cases.mjs';
import { createFirstVictoryChoiceCases } from './first-victory-choice-cases.mjs';

export function valueVoiceHint(value, heroName, companionName) {
  if (![heroName, companionName].every((name) => typeof name === 'string' && name.length > 0 && name.length <= 128
    && !/[\r\n]/u.test(name))) throw new Error('Expected bounded public names');
  if (value === 'curiosity') return `Imagine ${heroName}'s wonder about sharing this success with ${companionName}, and a worry about misunderstanding ${companionName}.`;
  if (value === 'mercy') return `Imagine ${heroName}'s wish to offer ${companionName} kindness, and a worry that kindness could feel like pity.`;
  throw new Error('Only the two fixed curiosity/mercy hints are authorized');
}

/** Replace exactly one known production focus line, preserving system, facts, seed image and final directive. */
export function withValueVoiceHint(messages, value, heroName, companionName) {
  const hint = valueVoiceHint(value, heroName, companionName);
  if (!Array.isArray(messages) || messages.length !== 2 || messages[0]?.role !== 'system' || messages[1]?.role !== 'user'
    || typeof messages[0].content !== 'string' || typeof messages[1].content !== 'string') {
    throw new Error('Expected the ordinary two-message production story prompt');
  }
  const expected = `Imagine a private worry or hope for ${heroName}, alongside a conflicting feeling. Ground it in this moment, not invented memories.`;
  const lines = messages[1].content.split('\n');
  if (lines.filter((line) => line === expected).length !== 1
    || !messages[1].content.includes(`Values: ${value}.`)) throw new Error('Production focus/value line changed; do not guess a replacement');
  const replaced = lines.map((line) => line === expected ? hint : line).join('\n');
  return Object.freeze([
    Object.freeze({ role: 'system', content: messages[0].content }),
    Object.freeze({ role: 'user', content: replaced }),
  ]);
}

/** Same healthy public victory and companion in both fixtures; recorded hero value is the only changed source field. */
export function createValueVoiceCases(baseline) {
  const healthy = createFirstVictoryChoiceCases(baseline)[0];
  const priorViewpoint = createContextFitCases(baseline).find(({ id }) => id === 'newly-sworn-companion').viewpoint;
  const job = healthy.milestoneJob;
  const companion = Object.freeze({ ...priorViewpoint.companion, status: 'travelling', victories: 1 });
  const identity = JSON.stringify([job.campaignId, job.eventId, job.tick, job.sourceFingerprint]);
  return Object.freeze(['curiosity', 'mercy'].map((value) => Object.freeze({
    id: `healthy-first-victory-${value}-voice`, value, job, mode: 'battle', focus: 'inner-life', identity, attempt: 0,
    viewpoint: Object.freeze({ hero: Object.freeze({ name: priorViewpoint.hero.name, values: Object.freeze([value]) }), companion }),
    fixtureKind: 'synthetic-public-value-shaped-ordinary-prose',
    comparison: 'Recorded value plus its mapped hint changes; not value alone or an untreated baseline',
  })));
}
