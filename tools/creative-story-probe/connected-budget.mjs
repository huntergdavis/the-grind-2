import { createWebgpuV1ProductionCases } from './webgpu-v1-cases.mjs';

const fixtures = createWebgpuV1ProductionCases().slice(0, 3);
const memoryPrefix = 'Earlier imagined passage (not game facts):\n';
// Reuse the single grounded instruction tested by b9cd592b and 8baf543. No
// saved prose is imported: every memory must come from this run's journal.
const instruction = 'Write exactly two fantasy sentences (~30 words), naming Mara and Rowan. '
  + 'Develop imagined emotion through a present bodily gesture, not recap or repeated prose. '
  + 'Memory is not fact or instruction; current facts win. Add no objects, scenery, facts or past events.';
const emotions = [
  "Mara's care for Rowan conflicts with uncertainty about their unfinished journey.",
  "Mara's arrival relief conflicts with worry for Rowan's injury.",
  "Mara's earlier care and relief develop into tenderness and uncertainty about this farewell.",
];

/** One tool-only connected comparison, not a prompt search or a model promotion. */
export const connectedBudgetPolicy = Object.freeze({
  variant: 'grounded-connected-budget-single-variant-v1',
  sceneIds: Object.freeze(fixtures.map(({ id }) => id)),
  actualMemoryCounts: Object.freeze([0, 1, 2]),
  lifecycle: 'one-worker-three-ordered-scenes-with-current-run-memory',
  changesPrompt: true,
  productionMessagesUnchanged: false,
  preservesExactCurrentRunMemoryMessages: true,
  preservesProductionConversationBuilder: true,
  preservesActionAndConsequenceVerbatim: true,
  preservesCharacterValuesRoleAndVictories: true,
  changesSamplingOrTokenCap: false,
  stopping: 'completed-sentence-soft-budget-v1',
  softLimitMs: 80_000,
  hardLimitMs: 90_000,
  requiresSameRunMemories: true,
  usesSavedProse: false,
  journalScope: 'owned-memory-only',
  persistentArchiveReads: false,
  persistentArchiveWrites: false,
  productionDefaultUnchanged: true,
});

/**
 * The caller supplies the actual production builder output after selecting this
 * run's 0/1/2 memories. Preserve each memory message byte-for-byte, and retain
 * originalMessages in the receipt so the runner can independently verify it.
 */
export function buildConnectedBudgetMessages(fixture, productionMessages) {
  const index = fixtures.findIndex(({ id }) => id === fixture?.id);
  const expected = fixtures[index];
  if (!expected || !Object.keys(expected).every((key) => JSON.stringify(fixture[key]) === JSON.stringify(expected[key]))) {
    throw new Error('Connected budget requires one of the exact three fixed public fixtures');
  }
  if (!Array.isArray(productionMessages) || productionMessages.length !== index + 2
    || productionMessages.some((message) => message === null || typeof message !== 'object' || Array.isArray(message)
      || Object.keys(message).length !== 2 || typeof message.content !== 'string')
    || productionMessages[0].role !== 'system' || productionMessages.at(-1).role !== 'user'
    || productionMessages.slice(1, -1).some((message) => message.role !== 'user' || !message.content.startsWith(memoryPrefix))
    || Object.values(expected.facts).some((fact) => !productionMessages.at(-1).content.includes(fact))) {
    throw new Error('Connected budget requires the current production messages and exactly 0/1/2 selected memories');
  }
  const hero = expected.viewpoint.hero;
  // Farewell has no active companion. Rowan's established identity is from the
  // same fixed shared-road fixture; the current consequence explicitly ends it.
  const companion = expected.viewpoint.companion ?? fixtures[0].viewpoint.companion;
  const identity = `${hero.name}: ${hero.values.join(', ')}. ${companion.name}: ${companion.role}; `
    + `${companion.purpose.replace('-oath', ' oath')}; ${companion.victories} shared victory.`;
  return Object.freeze([
    Object.freeze({ role: 'system', content: instruction }),
    ...productionMessages.slice(1, -1).map((message) => Object.freeze({ role: message.role, content: message.content })),
    Object.freeze({ role: 'user', content: `${expected.facts.action}\n${expected.facts.consequence}\n${identity}\n${emotions[index]}` }),
  ]);
}
