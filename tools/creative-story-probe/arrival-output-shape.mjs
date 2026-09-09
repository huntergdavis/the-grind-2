const minimumWords = 12, maximumWords = 15, maximumWordCharacters = 24;

/** Finite tails count connector characters too; connectors must be followed by a letter. */
const wordTails = Array.from({ length: maximumWordCharacters }, (_, remaining) =>
  `tail_${remaining} ::= ""${remaining > 0 ? ` | letter tail_${remaining - 1}` : ''}`
    + `${remaining > 1 ? ` | connector letter tail_${remaining - 2}` : ''}`);

/** Plain prose only. This constrains lexical shape, not truth, originality, or model-token count. */
export const arrivalSentenceGrammar = [
  'root ::= sentence " " sentence',
  `sentence ::= word (separator word){${minimumWords - 1},${maximumWords - 1}} "."`,
  'separator ::= ","? " "',
  `word ::= letter tail_${maximumWordCharacters - 1}`,
  'letter ::= [A-Za-z]',
  `connector ::= "'" | "’" | "-"`,
  ...wordTails,
].join('\n') + '\n';

export const arrivalOutputShapePolicy = Object.freeze({
  variant: 'arrival-output-shape-single-variant-v1',
  format: 'two-plain-prose-sentences',
  sentenceCount: 2,
  minimumWordsPerSentence: minimumWords,
  maximumWordsPerSentence: maximumWords,
  maximumWordCharacters,
  wordDefinition: 'ASCII letters with internal ASCII/curly apostrophes or hyphens between letters',
  separators: 'one ASCII space; an optional comma may precede an inter-word space',
  sentenceEnding: 'period',
  lexicalWordsNotModelTokens: true,
  guaranteesTokenBudget: false,
  guaranteesFactualQuality: false,
  requiresHumanGroundingReview: true,
  changesSamplingDistribution: true,
  changesPrompt: false,
  changesModel: false,
  preservesGroundedPrompt: true,
  runtimeMaxTokensIncludingHeader: 68,
  generatedTokenBudget: 64,
  noJournalWrites: true,
  productionDefaultUnchanged: true,
});

const wordPattern = "[A-Za-z](?:[A-Za-z]|['’-][A-Za-z])*";
const sentencePattern = `${wordPattern}(?:,? ${wordPattern}){${minimumWords - 1},${maximumWords - 1}}\\.`;
const passagePattern = new RegExp(`^(?:${sentencePattern}) (?:${sentencePattern})(?![\\s\\S])`, 'u');
const maximumPassageCharacters = 2 * (maximumWords * maximumWordCharacters + (maximumWords - 1) * 2 + 1) + 1;

/** Inspect without trimming, rewriting, or salvaging an unfinished response. */
export function inspectArrivalOutputShape(text) {
  if (typeof text !== 'string') return { valid: false, sentenceCount: 0, wordCounts: [],
    wordLengthsValid: false, formatValid: false, errors: ['not-text'] };
  const segments = text.split('.');
  segments.pop(); // Counts only period-terminated segments, never an unfinished tail as a sentence.
  const wordCounts = segments.map(segment => segment.trim() === '' ? 0 : segment.trim().split(/\s+/u).length);
  const words = segments.flatMap(segment => segment.trim() === '' ? [] : segment.trim().split(/\s+/u));
  const wordLengthsValid = words.every(word => word.replace(/,$/u, '').length <= maximumWordCharacters);
  const formatValid = text.length <= maximumPassageCharacters && passagePattern.test(text)
    && !/[\r\n\t\p{Cc}\p{Cf}\p{Cs}]/u.test(text);
  const errors = [];
  if (segments.length !== 2) errors.push('sentence-count');
  if (wordCounts.some(count => count < minimumWords || count > maximumWords)) errors.push('word-count');
  if (!wordLengthsValid) errors.push('word-length');
  if (!formatValid) errors.push('plain-prose-format');
  return { valid: errors.length === 0, sentenceCount: segments.length, wordCounts,
    wordLengthsValid, formatValid, errors };
}

export const isValidArrivalOutputShape = text => inspectArrivalOutputShape(text).valid;
