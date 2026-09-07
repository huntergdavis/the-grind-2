/** Trial-only source fragments, not model-authored prose or a production prefix policy. */
export const assistantPrefillPrefixes = Object.freeze({
  'injured-companion-on-the-road': 'Mara travelled beside injured Rowan toward Greyford, and',
  'injured-companion-arrives-alive': 'Mara reached Greyford beside injured Rowan, and',
});

export function assistantPrefillForCase(id) {
  if (!Object.hasOwn(assistantPrefillPrefixes, id)) throw new Error('Unknown prefill fixture; no general prefix policy is claimed');
  return assistantPrefillPrefixes[id];
}
