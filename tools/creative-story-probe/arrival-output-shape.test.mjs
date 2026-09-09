import test from 'node:test';
import assert from 'node:assert/strict';
import { arrivalSentenceGrammar, arrivalOutputShapePolicy,
  inspectArrivalOutputShape, isValidArrivalOutputShape } from './arrival-output-shape.mjs';

// Lexical fixtures only: these repeated words are not authored story examples or quality evidence.
const sentence = (count = 12, first = 'Word') => [first, ...Array(count - 1).fill('word')].join(' ') + '.';
const passage = (first = 12, second = 12) => `${sentence(first)} ${sentence(second)}`;

test('exactly two sentences accept the 12/15-word boundaries, not 11/16 or unfinished alternatives', () => {
  for (const first of [12, 15]) for (const second of [12, 15]) {
    const result = inspectArrivalOutputShape(passage(first, second));
    assert.equal(result.valid, true);
    assert.equal(result.sentenceCount, 2);
    assert.deepEqual(result.wordCounts, [first, second]);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  }
  for (const text of ['', sentence(), `${passage()} ${sentence()}`, passage(11, 12), passage(12, 11),
    passage(16, 12), passage(12, 16), passage().slice(0, -1), `${passage()} Unfinished`]) {
    assert.equal(isValidArrivalOutputShape(text), false, text);
  }
  for (const input of [null, undefined, 2, {}, []]) assert.equal(inspectArrivalOutputShape(input).valid, false);
});

test('commas and bounded internal ASCII/curly apostrophes and hyphens follow the same word contract', () => {
  for (const first of ['Mara', "Rowan's", 'Rowan’s', 'soft-spoken', "well-earned's", 'a'.repeat(24)]) {
    assert.equal(isValidArrivalOutputShape(`${sentence(12, first)} ${sentence(15)}`), true, first);
  }
  assert.equal(isValidArrivalOutputShape(passage().replace('Word word', 'Word, word')), true);
  for (const first of ["'word", 'word’', '-word', 'word-', 'two--words', "two''words", 'two’-words',
    'éclair', 'word2', 'a'.repeat(25), `a${'-a'.repeat(12)}`]) {
    assert.equal(isValidArrivalOutputShape(`${sentence(12, first)} ${sentence()}`), false, first);
  }
  const maximumConnectorWord = `ab${'-a'.repeat(11)}`;
  assert.equal(maximumConnectorWord.length, 24);
  assert.equal(isValidArrivalOutputShape(`${sentence(12, maximumConnectorWord)} ${sentence()}`), true);
});

test('extra whitespace, malformed punctuation, controls, thinking headers and structured wrappers are rejected', () => {
  const valid = passage();
  for (const value of [` ${valid}`, `${valid} `, `${valid}\n`, `${valid}\u2028`, `${valid}\u2029`, valid.replace(' ', '  '),
    valid.replace(' ', '\t'), valid.replace(' ', '\n'), valid.replace(' ', '\u00a0'),
    valid.replace('Word', 'Word\u200b'), valid.replace('Word', 'Word\u0000'),
    valid.replace('word.', 'word!'), valid.replace('word.', 'word?.'),
    valid.replace('Word word', 'Word,, word'), valid.replace('Word word', 'Word ,word'),
    valid.replace('word.', 'word,.'), valid.replace('. ', '.  '),
    JSON.stringify(valid), JSON.stringify({ story: valid }), `<think>\n\n</think>\n\n${valid}`,
    `Story: ${valid}`, `\`\`\`\n${valid}\n\`\`\``]) {
    assert.equal(isValidArrivalOutputShape(value), false, JSON.stringify(value));
  }
});

test('grammar mirrors exactly the two sentence, word count, connector, and total word-character bounds', () => {
  assert.match(arrivalSentenceGrammar, /^root ::= sentence " " sentence\n/u);
  assert.match(arrivalSentenceGrammar, /sentence ::= word \(separator word\)\{11,14\} "\."/u);
  assert.match(arrivalSentenceGrammar, /separator ::= ","\? " "/u);
  assert.match(arrivalSentenceGrammar, /word ::= letter tail_23/u);
  assert.match(arrivalSentenceGrammar, /letter ::= \[A-Za-z\]/u);
  assert.match(arrivalSentenceGrammar, /connector ::= "'" \| "’" \| "-"/u);
  const rules = arrivalSentenceGrammar.split('\n').filter(line => line.startsWith('tail_'));
  assert.equal(rules.length, 24);
  assert.equal(rules[0], 'tail_0 ::= ""');
  assert.equal(rules[1], 'tail_1 ::= "" | letter tail_0');
  for (let remaining = 2; remaining < 24; remaining++) {
    assert.equal(rules[remaining], `tail_${remaining} ::= "" | letter tail_${remaining - 1} | connector letter tail_${remaining - 2}`);
  }
});

test('policy describes a distribution-changing form constraint, not factual or token-budget guarantees', () => {
  assert.equal(arrivalOutputShapePolicy.sentenceCount, 2);
  assert.equal(arrivalOutputShapePolicy.minimumWordsPerSentence, 12);
  assert.equal(arrivalOutputShapePolicy.maximumWordsPerSentence, 15);
  assert.equal(arrivalOutputShapePolicy.maximumWordCharacters, 24);
  for (const field of ['lexicalWordsNotModelTokens', 'changesSamplingDistribution', 'preservesGroundedPrompt',
    'requiresHumanGroundingReview', 'noJournalWrites', 'productionDefaultUnchanged']) {
    assert.equal(arrivalOutputShapePolicy[field], true, field);
  }
  for (const field of ['changesPrompt', 'changesModel', 'guaranteesFactualQuality', 'guaranteesTokenBudget']) {
    assert.equal(arrivalOutputShapePolicy[field], false, field);
  }
  assert.equal(arrivalOutputShapePolicy.runtimeMaxTokensIncludingHeader, 68);
  assert.equal(arrivalOutputShapePolicy.generatedTokenBudget, 64);
  assert.ok(Object.isFrozen(arrivalOutputShapePolicy));
  assert.equal(isValidArrivalOutputShape(passage()), true); // Shape accepts semantically empty prose too.
});
