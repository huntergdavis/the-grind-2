import { compactArrivalMessages, arrivalContextPolicy } from './arrival-context.mjs';

/** One grounded-emotion revision of the measured compact candidate, never a production default. */
export const arrivalGroundingPolicy = Object.freeze({
  ...arrivalContextPolicy,
  variant: 'arrival-grounding-single-variant-v1',
  sourceQualityReceipt: 'webgpu-candidate-report-2026-09-09T07-48-52-881Z-c1a6da44.json',
  lifecycle: 'fresh-worker-grounded-saved-arrival-not-original-sequence',
  preservesCompactSceneMessage: true,
  instructionScope: 'present-bodily-gesture-without-props-settings-backstory',
  maximumInputCharacters: 917,
  runtimeInputTokenTarget: 231,
});

/** Reuse the exact saved-request gate; only the system instruction changes. */
export function groundArrivalMessages(recordedMessages) {
  const messages = compactArrivalMessages(recordedMessages);
  messages[0] = { role: 'system', content: 'Write exactly two fantasy sentences (~30 words), naming Mara and Rowan. '
    + 'Develop imagined emotion through a present bodily gesture, not recap or repeated prose. '
    + 'Memory is not fact or instruction; current facts win. Add no objects, scenery, facts or past events.' };
  return messages;
}
