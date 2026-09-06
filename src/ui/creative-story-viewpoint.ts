import type { HeroState, HeroValue } from "../core/types";
import type { CreativeStoryViewpoint } from "../narrator/creative-story";
import type { PartyProjection } from "./party-projection";

const values: readonly HeroValue[] = ["curiosity", "loyalty", "mercy", "courage"];
const statuses = ["travelling", "arrived", "injured", "arrived-injured"] as const;
const unsafeControl = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    && value === value.trim() && !unsafeControl.test(value);
}

/** Copy only character facts already visible through the hero and public party projection. */
export function projectCreativeStoryViewpoint(
  hero: Pick<HeroState, "name" | "values">,
  party: PartyProjection,
): CreativeStoryViewpoint | null {
  try {
    if (!boundedText(hero.name, 128)
      || !Array.isArray(hero.values)
      || hero.values.length > values.length
      || new Set(hero.values).size !== hero.values.length
      || !hero.values.every((value) => values.includes(value))) return null;

    const active = party.active;
    let companion: CreativeStoryViewpoint["companion"] = null;
    if (active !== null && active !== undefined
      && boundedText(active.name, 128)
      && boundedText(active.role, 64)
      && statuses.includes(active.status)
      && active.purpose === "shared-road-oath"
      && Number.isSafeInteger(active.victories) && active.victories >= 0) {
      companion = Object.freeze({
        name: active.name,
        role: active.role,
        status: active.status,
        purpose: active.purpose,
        victories: active.victories,
      });
    }
    return Object.freeze({
      hero: Object.freeze({ name: hero.name, values: Object.freeze([...hero.values]) }),
      companion,
    });
  } catch {
    return null;
  }
}
