import {
  isNarratorPromptV1,
  normalizeNarratorOutput,
  type NarratorPromptV1,
} from "./protocol";

export const narratorOutputPolicyVersion = 1 as const;

export function deterministicNarratorFallback(prompt: NarratorPromptV1): string {
  return prompt.move === "register-pressure"
    ? `This ${prompt.facts.energy} moment has my attention.`
    : `${prompt.facts.place} holds a ${prompt.facts.energy} moment.`;
}

export function allowedNarratorLines(prompt: NarratorPromptV1): readonly string[] {
  if (!isNarratorPromptV1(prompt)) return [];
  const { energy, place } = prompt.facts;
  if (prompt.move === "establish-setting") {
    return [
      `${place} holds a ${energy} moment.`,
      `A ${energy} moment gathers at ${place}.`,
      `${place} waits within a ${energy} moment.`,
    ];
  }
  if (prompt.move === "shade-atmosphere") {
    return [
      `${place} rests within a ${energy} moment.`,
      `A ${energy} moment settles over ${place}.`,
      `The ${energy} moment lingers at ${place}.`,
    ];
  }
  return [
    `This ${energy} moment has my attention.`,
    `I feel this ${energy} moment.`,
    `This ${energy} moment feels close.`,
  ];
}

export function isSafeAmbientNarration(text: string, prompt: NarratorPromptV1): boolean {
  if (normalizeNarratorOutput(text) !== text || text.includes("\n")) return false;
  if (/\d|https?:|www\.|[`{}<>\[\]]/iu.test(text)) return false;
  const words = text.match(/[\p{L}\p{M}'’]+/gu) ?? [];
  if (words.length === 0 || words.length > 24) return false;
  return allowedNarratorLines(prompt).includes(text);
}
