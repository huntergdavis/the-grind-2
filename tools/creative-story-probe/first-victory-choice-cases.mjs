import { createMomentChoiceCases } from './moment-choice-cases.mjs';

/** Synthetic public sources only: this does not prove a real victory transition or queue eligibility. */
export function createFirstVictoryChoiceCases(baseline) {
  return Object.freeze(createMomentChoiceCases(baseline).map(({ currentJob }, index) => {
    const injured = index === 1;
    const status = injured ? 'injured' : 'healthy';
    const facts = Object.freeze({
      schemaVersion: 1, kind: 'public-story-beat', location: 'Greyford road',
      headline: 'Mara and Rowan won their first fight.',
      action: 'The pair defeated the roadside bandit.',
      consequence: injured ? 'Rowan is alive and injured after their first shared victory.'
        : 'Rowan remains uninjured after their first shared victory.',
    });
    const campaignId = `synthetic:first-victory-${status}`;
    return Object.freeze({
      id: `current-or-${status}-first-shared-victory`,
      currentJob: Object.freeze({ ...currentJob, campaignId, eventId: `synthetic:current-after-${status}-victory` }),
      milestoneJob: Object.freeze({
        ...currentJob, campaignId, eventId: `synthetic:${status}-first-shared-victory`, tick: 40,
        facts, deterministicFallback: facts.headline,
      }),
      milestoneKind: 'first-shared-victory', companionStatus: status,
      fixtureKind: 'synthetic-public-first-victory-pair',
      eligibility: 'Two explicitly eligible public fixtures, not observed gameplay or a TTL validation',
      choices: Object.freeze({ '1': 'current-public-scene', '2': 'recorded-first-shared-victory' }),
      excludedChoice: '3',
    });
  }));
}
