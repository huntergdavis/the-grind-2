import { allowedNarratorLines, deterministicNarratorFallback } from "./output-policy";
import {
  isNarratorPromptV1,
  narratorMaximumOutputCharacters,
  normalizeNarratorOutput,
  type NarratorPromptV1,
} from "./protocol";

export const narratorLiveOutputPolicyVersion = 1 as const;

export function isSafeLiveNarration(text: string, prompt: NarratorPromptV1): boolean {
  if (!isNarratorPromptV1(prompt)) return false;
  if (
    normalizeNarratorOutput(text) !== text
    || text.length > narratorMaximumOutputCharacters
    || /[\r\n\u2028\u2029]/u.test(text)
  ) return false;
  if (/\d|https?:|www\.|[`{}<>\[\]]/iu.test(text)) return false;
  const words = text.match(/[\p{L}\p{M}'’]+/gu) ?? [];
  if (words.length === 0 || words.length > 24) return false;
  return text === deterministicNarratorFallback(prompt)
    || allowedNarratorLines(prompt).includes(text);
}
