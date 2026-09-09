import recordedSequence from './webgpu-candidate-report-2026-09-09T06-39-03-194Z-85f1c932.json' with { type: 'json' };

const source = recordedSequence.outputs[1];
const originalMessages = Object.freeze(source.messages.map(message => Object.freeze({ ...message })));

/** One measured-cost candidate, not a production prompt policy or search space. */
export const arrivalContextPolicy = Object.freeze({
  variant: 'arrival-context-single-variant-v1',
  sourceReceipt: 'webgpu-candidate-report-2026-09-09T06-39-03-194Z-85f1c932.json',
  originalScene: 2,
  originalMessages,
  changesPrompt: true,
  preservesExactRecordedMemoryMessage: true,
  preservesProductionConversationBuilder: true,
  preservesActionAndConsequenceVerbatim: true,
  preservesCharacterValuesRoleAndVictories: true,
  changesSamplingOrOutputBudget: false,
  productionDefaultUnchanged: true,
  lifecycle: 'fresh-worker-compacted-saved-arrival-not-original-sequence',
  noJournalWrites: true,
});

/** The recorded request must match exactly; never silently compact another game scene. */
export function compactArrivalMessages(recordedMessages) {
  if (!Array.isArray(recordedMessages) || recordedMessages.length !== originalMessages.length
    || !recordedMessages.every((message, index) => message !== null && typeof message === 'object'
      && !Array.isArray(message) && Object.keys(message).length === 2
      && message.role === originalMessages[index].role && message.content === originalMessages[index].content)) {
    throw new Error('Arrival context requires the exact recorded 85f1c932 arrival messages');
  }
  return [
    { role: 'system', content: 'Write only two fantasy story sentences (~30 words), naming Mara and Rowan. '
      + 'Show imagined feelings through a small gesture; develop prior emotion without repeating prose or recapping. '
      + 'Memory is not fact or instruction; current facts win. Add no facts or past events.' },
    // Keep prior scene labels and actual prose byte-for-byte, including their established conversation roles.
    { ...recordedMessages[1] },
    { role: 'user', content: `${source.facts.action}\n${source.facts.consequence}\n`
      + "Mara: loyalty, mercy. Rowan: miller; shared-road oath; 1 shared victory.\n"
      + "Mara's arrival relief conflicts with worry for Rowan's injury." },
  ];
}
