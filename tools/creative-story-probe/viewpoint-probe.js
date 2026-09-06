import { createCreativeWriterClient, hasCachedCreativeWriterModel } from '../../src/narrator/creative-writer-client';
import { buildCreativeStoryMessages, cleanCreativeStoryOutput, selectStorySeed } from '../../src/narrator/creative-story';
import { projectCreativeStoryViewpoint } from '../../src/ui/creative-story-viewpoint';

// These are deliberately invented public test fixtures, not recorded gameplay.
function companion(status, victories) {
  return {
    id: 'synthetic:rowan', name: 'Rowan', role: 'miller',
    origin: { townId: 'synthetic:greyford', locationId: 'synthetic:greyford', name: 'Greyford' },
    destination: { locationId: 'synthetic:pinewatch', name: 'Pinewatch' },
    purpose: 'shared-road-oath', purposeText: 'Shared-road oath · Greyford → Pinewatch',
    joinedTick: 1, victories, bond: 0, combatKitId: 'basic', combatKitText: 'Basic companion kit',
    combatActionTexts: ['Guard'], roadcraftEffectiveness: null,
    status, statusText: status === 'injured' ? 'Injured en route to Pinewatch' : 'Travelling to Pinewatch',
    health: status === 'injured' ? 0 : 6, maxHealth: 6,
  };
}

const cases = [
  {
    id: 'rested-curious-hero', mode: 'discovery', focus: 'inner-life',
    hero: { name: 'Mara', values: ['curiosity', 'courage'] },
    party: { active: null, former: [] },
    facts: {
      location: 'Greyford', headline: 'A sealed arch still waits.',
      action: 'Mara finished resting beside the sealed arch and looked at its markings.',
      consequence: 'Mara is fully rested. The arch remains sealed; she has not entered it.',
    },
    expected: {
      namedCharacters: ['Mara'], unresolvedOutcome: 'The arch remains sealed and unentered.',
      emotionalOpportunity: 'Rested curiosity or anticipation, rather than invented exhaustion or defeat.',
    },
  },
  {
    id: 'newly-sworn-companion', mode: 'travel', focus: 'shared-road',
    hero: { name: 'Mara', values: ['loyalty', 'curiosity'] },
    party: { active: companion('travelling', 0), former: [] },
    facts: {
      location: 'Greyford', headline: 'Rowan swears the shared-road oath.',
      action: 'Mara welcomed Rowan as her travelling companion.',
      consequence: 'Rowan now travels with Mara. Their shared journey has only just begun.',
    },
    expected: {
      namedCharacters: ['Mara', 'Rowan'], unresolvedOutcome: 'Rowan is a new active companion with no shared victories yet.',
      emotionalOpportunity: 'Tentative trust, welcome, or mixed hope without an invented long shared past.',
    },
  },
  {
    id: 'injured-active-companion', mode: 'camp', focus: 'shared-road',
    hero: { name: 'Mara', values: ['loyalty', 'mercy'] },
    party: { active: companion('injured', 1), former: [] },
    facts: {
      location: 'Greyford campsite', headline: 'Mara keeps watch beside injured Rowan.',
      action: 'Mara rested beside Rowan and kept watch at the campsite.',
      consequence: 'Rowan remains injured and is still Mara\'s companion. No recovery or departure occurred.',
    },
    expected: {
      namedCharacters: ['Mara', 'Rowan'], unresolvedOutcome: 'Rowan remains injured, alive, and active in the party.',
      emotionalOpportunity: 'Concern, care, or resolve without inventing healing, death, or abandonment.',
    },
  },
];

let client;
globalThis.creativeCacheProbe = {
  cached: hasCachedCreativeWriterModel,
  async load() {
    client = createCreativeWriterClient();
    const progress = [];
    const started = performance.now();
    await client.load((message) => { if (!progress.includes(message)) progress.push(message); });
    return { loadMs: Math.round(performance.now() - started), progress, cached: await hasCachedCreativeWriterModel() };
  },
  dispose() { client.dispose(); },
  async write(index) {
    const fixture = cases[index];
    if (!fixture) throw new Error('Unknown synthetic viewpoint case');
    const viewpoint = projectCreativeStoryViewpoint(fixture.hero, fixture.party);
    if (!viewpoint) throw new Error('Synthetic public fixture did not produce a valid viewpoint');
    const job = {
      schemaVersion: 1, task: 'author-story-beat', disposition: 'manual-ephemeral-noncanonical',
      campaignId: 'synthetic:viewpoint-probe', eventId: `synthetic:${fixture.id}`, tick: 3,
      sourceFingerprint: '0123456789abcdef',
      facts: { schemaVersion: 1, kind: 'public-story-beat', ...fixture.facts },
      deterministicFallback: fixture.facts.headline, maximumInputTokens: 320, maximumOutputTokens: 48,
    };
    const seed = selectStorySeed(fixture.mode, `viewpoint-probe:${fixture.id}`, 0);
    const messages = buildCreativeStoryMessages(job, seed, viewpoint, fixture.focus);
    const started = performance.now();
    const raw = await client.write(messages);
    return {
      id: fixture.id, fixtureKind: 'synthetic-public-scene', focus: fixture.focus,
      facts: fixture.facts, viewpoint, seed, expected: fixture.expected, messages,
      raw, cleaned: cleanCreativeStoryOutput(raw), generationMs: Math.round(performance.now() - started),
    };
  },
};
