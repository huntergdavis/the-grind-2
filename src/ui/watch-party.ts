import type { DetailedHeroState } from "../depth/types";
import { projectHeroIdentityAppearance } from "../render/hero-appearance";
import { isInjuredPartyStatus, type ActivePartyCompanionProjection } from "./party-projection";

/** Display only actual resources; companions have no projected mana resource. */
export function projectWatchParty(
  hero: Pick<DetailedHeroState, "id" | "name" | "resources">,
  companion: ActivePartyCompanionProjection | null,
) {
  return {
    hero: {
      id: hero.id, name: hero.name, appearance: projectHeroIdentityAppearance(hero),
      health: hero.resources.health, maxHealth: hero.resources.maxHealth,
      mana: hero.resources.mana, maxMana: hero.resources.maxMana,
    },
    companion: companion === null ? null : {
      id: companion.id, name: companion.name, appearance: projectHeroIdentityAppearance(companion),
      health: companion.health, maxHealth: companion.maxHealth,
      injured: isInjuredPartyStatus(companion.status),
      status: companion.status === "arrived-injured" ? "Arrived injured"
        : companion.status === "injured" ? "Injured"
          : companion.status === "arrived" ? "Arrived" : "Travelling",
    },
  };
}
