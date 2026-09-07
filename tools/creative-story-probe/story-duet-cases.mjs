import { createFirstVictoryChoiceCases } from './first-victory-choice-cases.mjs';

/** Explicit public first-victory fixtures, not observed gameplay or a claim that role parsing proves good fiction. */
export function createStoryDuetCases(baseline) {
  return Object.freeze(createFirstVictoryChoiceCases(baseline).map((fixture) => {
    const job = fixture.milestoneJob;
    const packet = Object.freeze({
      kind: 'first-shared-victory', campaignId: job.campaignId, eventId: job.eventId, tick: job.tick,
      combatId: `synthetic:duet-combat-${fixture.companionStatus}`, companionId: 'synthetic:rowan',
      heroName: 'Mara', companionName: 'Rowan', condition: fixture.companionStatus,
      battle: Object.freeze({ location: job.facts.location, headline: job.facts.headline, tick: job.tick }),
    });
    return Object.freeze({
      id: `first-victory-${fixture.companionStatus}-duet`, job, packet,
      mode: 'battle', focus: 'shared-road', fixtureKind: 'synthetic-public-first-victory-duet',
      roleBindings: Object.freeze({ HERO: packet.heroName, COMPANION: packet.companionName }),
      eligibility: 'Explicit bound first-victory fixtures; no gameplay transition, canonical emotion, or rollout claim',
    });
  }));
}
