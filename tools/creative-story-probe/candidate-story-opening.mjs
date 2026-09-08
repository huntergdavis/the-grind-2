import { createSuccessiveStoryCases } from './successive-story-cases.mjs';
import { buildEmotionalSceneMessages } from './emotional-scene-messages.mjs';

/** Same public facts and instruction-only prompt in Node and browser; no supplied story prose. */
export function selectCandidateFixtures(baseline, storyOpening = false) {
  if (storyOpening) {
    const fixture = createSuccessiveStoryCases()[0];
    return [{ ...fixture, messages: buildEmotionalSceneMessages(fixture.job, fixture.viewpoint, fixture.focus) }];
  }
  if (baseline?.outputs?.length !== 3 || baseline.outputs.some((row) => !Array.isArray(row.messages) || !row.facts)) {
    throw new Error('Expected the exact three historical viewpoint inputs');
  }
  return baseline.outputs;
}
