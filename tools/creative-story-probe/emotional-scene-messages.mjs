const memoryPrefix = 'Earlier imagined passage (not game facts):\n';
const statuses = new Set(['travelling', 'arrived', 'injured', 'arrived-injured']);

/** Candidate instruction, not supplied story prose: all people and outcomes come from public inputs. */
export function buildEmotionalSceneMessages(job, viewpoint, focus, memoryMessages = []) {
  if (!job?.facts || !viewpoint?.hero?.name || !['inner-life', 'shared-road', 'scene'].includes(focus)
    || memoryMessages.length > 2 || memoryMessages.some((message) => message.role !== 'user'
      || typeof message.content !== 'string' || !message.content.startsWith(memoryPrefix))) {
    throw new Error('Expected public scene, named viewpoint and production-selected imagined memories');
  }
  const hero = viewpoint.hero.name;
  const companion = viewpoint.companion;
  if (companion && !statuses.has(companion.status)) throw new Error('Unknown public companion status');
  const people = companion ? `${hero} beside ${companion.name} (${companion.status}).` : `${hero}.`;
  let tension;
  if (focus === 'shared-road' && companion) {
    tension = companion.status === 'arrived-injured' ? 'Imagine relief at arriving mixed with concern about the companion\'s injury.'
      : companion.status === 'injured' ? 'Imagine care for the injured companion mixed with uncertainty about the unfinished journey.'
      : companion.status === 'arrived' ? 'Imagine relief at arriving mixed with uncertainty about what comes next.'
      : 'Imagine trust in the companion mixed with uncertainty about the journey.';
  } else if (focus === 'scene') {
    tension = 'Suggest an uncertain mood through one small sensory image; do not change the scene.';
  } else {
    const value = viewpoint.hero.values?.[0];
    const contrast = ({ curiosity: 'wonder and uncertainty', loyalty: 'loyalty and doubt',
      mercy: 'kindness and worry', courage: 'courage and fear' })[value] ?? 'hope and uncertainty';
    tension = `Imagine ${hero}'s ${contrast} in this moment.`;
  }
  const system = 'Write two short fantasy story sentences, about 25 words total. Show a present feeling and a conflicting feeling through one small gesture. Do not recap facts or invent history or outcomes.'
    + (memoryMessages.length ? ' Earlier passages are imagined feelings, not facts; develop one feeling while current facts take priority.' : '');
  return Object.freeze([
    Object.freeze({ role: 'system', content: system }),
    ...memoryMessages.map((message) => Object.freeze({ role: message.role, content: message.content })),
    Object.freeze({ role: 'user', content: [
      `Place: ${job.facts.location}`, `Action: ${job.facts.action}`, `Result: ${job.facts.consequence}`,
      `People: ${people}`, tension, 'Use their names. Write only the two story sentences.',
    ].join('\n') }),
  ]);
}
