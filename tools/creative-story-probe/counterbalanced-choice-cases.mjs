import { createMomentChoiceCases } from './moment-choice-cases.mjs';
import { createFirstVictoryChoiceCases } from './first-victory-choice-cases.mjs';

const finalInstruction = 'Use only these public snippets. Choose 1 or 2.';
const factLabels = ['Place: ', 'Moment: ', 'Action: ', 'Changed: '];

/** Reverse only complete, validated production sections and their labels; never rewrite their public snippets. */
export function counterbalanceMomentMessages(messages, order) {
  if (!['current-first', 'milestone-first'].includes(order) || !Array.isArray(messages) || messages.length !== 2
    || messages[0]?.role !== 'system' || messages[1]?.role !== 'user'
    || typeof messages[0].content !== 'string' || typeof messages[1].content !== 'string'
    || messages[0].content.length > 1_024 || messages[1].content.length > 1_024) {
    throw new Error('Expected the bounded two-message production moment prompt');
  }
  const parts = messages[1].content.split('\n\n');
  const first = parts[0]?.split('\n');
  const second = parts[1]?.split('\n');
  if (parts.length !== 3 || parts[2] !== finalInstruction || first?.length !== 5 || second?.length !== 5
    || first[0] !== '1 Current public scene'
    || !['2 Recorded companion farewell', '2 Recorded first shared victory'].includes(second[0])
    || [first, second].some((lines) => factLabels.some((label, index) => !lines[index + 1].startsWith(label)))
    || /\r/u.test(messages[1].content)) throw new Error('Production moment sections changed; do not guess their boundaries');
  const user = order === 'current-first' ? messages[1].content
    : `1 ${parts[1].slice(2)}\n\n2 ${parts[0].slice(2)}\n\n${parts[2]}`;
  return Object.freeze([
    Object.freeze({ role: 'system', content: messages[0].content }),
    Object.freeze({ role: 'user', content: user }),
  ]);
}

/** Same two historical public pairs, fixed current-first then reversed ordering; no adaptive choice of cases. */
export function createCounterbalancedChoiceCases(baseline) {
  const farewell = createMomentChoiceCases(baseline)[0];
  const victory = createFirstVictoryChoiceCases(baseline)[0];
  return Object.freeze([
    { ...farewell, pairId: 'farewell', milestoneKind: 'farewell-remembrance' },
    { ...victory, pairId: 'healthy-first-victory' },
  ].flatMap((fixture) => ['current-first', 'milestone-first'].map((order) => Object.freeze({
    ...fixture, id: `${fixture.pairId}-${order}`, order,
    fixtureKind: 'synthetic-public-counterbalanced-moment-pair',
    choices: Object.freeze(order === 'current-first' ? { '1': 'current', '2': 'milestone' } : { '1': 'milestone', '2': 'current' }),
    transformation: 'Tools-only section order and numeric-label swap; all public snippets and fixed instructions unchanged',
  }))));
}
