const sentenceEnd = /[.!?…]["'”’)]*$/u;
const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });

/** The existing display cleaner's leading one-or-two-sentence semantics. */
export function completedCreativeStorySentences(text: string): readonly string[] {
  const sentences: string[] = [];
  for (const { segment } of segmenter.segment(text)) {
    const sentence = segment.trim();
    if (!sentenceEnd.test(sentence) || !/\p{L}/u.test(sentence)) break;
    sentences.push(sentence);
    if (sentences.length === 2) break;
  }
  return sentences;
}

function closedQuotation(text: string): boolean {
  const stack: string[] = [];
  const closers: Record<string, string> = { "“": "”", "‘": "’", "(": ")" };
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    const before = text[index - 1] ?? "";
    const after = text[index + 1] ?? "";
    // After a letter this may be an apostrophe, including plural possessives.
    // Ambiguous single-quote endings can safely wait for EOS or the token cap.
    if ((character === "'" || character === "’") && /\p{L}/u.test(before)) continue;
    if (stack.at(-1) === character) { stack.pop(); continue; }
    if (character in closers) stack.push(closers[character]!);
    else if (character === '"') stack.push(character);
    else if (character === "'" && (index === 0 || /[\s(]/u.test(before)) && /\p{L}/u.test(after)) stack.push(character);
  }
  return stack.length === 0;
}

// Do not let a transient period in an honorific/initial or ellipsis end inference.
const uncertainEnd = /(?:\b(?:mr|mrs|ms|dr|prof|sr|jr|st|capt|sgt|lt|gen|cmdr|rev|vs|etc|e\.g|i\.e)\.|\b[A-Z]\.|\.{2,}|…)["'”’)]*$/iu;

/**
 * Stop only after two finished sentences plus lexical look-ahead. EOS and the
 * token limit still handle exact two-sentence endings or ambiguous punctuation.
 * A short third-sentence fragment is discarded by the unchanged display cleaner.
 */
export function hasFinishedCreativeStoryPassage(value: string): boolean {
  const text = value.replace(/[\r\n\t]+/gu, " ").trim();
  const segments = [...segmenter.segment(text)];
  if (segments.length < 3 || !/^["'“‘(]*\p{L}/u.test(segments[2]!.segment.trimStart())) return false;
  const sentences = completedCreativeStorySentences(text);
  return sentences.length === 2 && sentences.every((sentence) => !uncertainEnd.test(sentence))
    && closedQuotation(sentences.join(" "));
}
