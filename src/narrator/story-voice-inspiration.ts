import { normalizeStoryVoiceValue, type HeroValue } from "./story-voice";

/** Authored presentation metadata, never a recorded feeling or a model-written memory. */
export interface StoryVoiceInspiration {
  readonly kind: "hero-value";
  readonly heroName: string;
  readonly value: HeroValue;
  readonly text: string;
}

const unsafeControl = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const boundedText = (value: unknown, maximum: number): value is string => typeof value === "string"
  && value.length > 0 && value.length <= maximum && value.trim() === value && !unsafeControl.test(value);

/** Callers additionally bind this exact text and hero to the authored source they present. */
export function captureStoryVoiceInspiration(raw: unknown): StoryVoiceInspiration | null {
  try {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const fields = Object.getOwnPropertyDescriptors(raw);
    const keys = Reflect.ownKeys(fields);
    if (keys.length !== 4 || !["kind", "heroName", "value", "text"].every((key) => keys.includes(key))) return null;
    // Do not invoke caller-owned accessors while capturing presentation metadata.
    const kind: unknown = fields.kind?.value;
    const heroName: unknown = fields.heroName?.value;
    const value = normalizeStoryVoiceValue(fields.value?.value);
    const text: unknown = fields.text?.value;
    if (kind !== "hero-value" || value === null || !boundedText(heroName, 128) || !boundedText(text, 1000)) return null;
    return Object.freeze({ kind, heroName, value, text });
  } catch {
    return null;
  }
}
