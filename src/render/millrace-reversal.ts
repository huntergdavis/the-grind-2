import { projectLatestCombatTurn } from "../depth/combat-turn";
import type { CombatState, SharedOpening } from "../depth/types";

export interface MillraceReversalPresentation {
  phase: "ready" | "spent";
  opening: SharedOpening;
  heroName: string;
  companionName: string;
  targetName: string;
  headline: string;
}

/** Presentation reads the earned pip, never a historical Roadcraft impact count. */
export function projectMillraceReversal(combat: CombatState): MillraceReversalPresentation | null {
  const runtime = combat.companionActionRuntime;
  const held = combat.outcome === "ongoing" && runtime?.schemaVersion === 2 ? runtime.sharedOpening : null;
  const summary = projectLatestCombatTurn(combat);
  const spent = summary?.sharedOpening?.kind === "shared-opening-spent" ? summary.sharedOpening : null;
  const opening = held ?? spent;
  if (opening === null) return null;
  const hero = combat.combatants.find((unit) => unit.id === opening.heroId);
  const companion = combat.combatants.find((unit) => unit.id === opening.companionId);
  const target = combat.combatants.find((unit) => unit.id === opening.targetId);
  if (hero === undefined || companion === undefined || target === undefined) return null;
  if (held !== null && (hero.health <= 0 || companion.health <= 0 || target.health <= 0)) return null;
  return {
    phase: held === null ? "spent" : "ready", opening,
    heroName: hero.name, companionName: companion.name, targetName: target.name,
    headline: held !== null
      ? `${companion.name}'s Millstone Drag opens ${target.name} to ${hero.name}.`
      : `Millrace Reversal · ${companion.name} braces; ${hero.name} strikes ${target.name} once · ${spent!.damage} damage · piercing · armor penalty ${spent!.armorReduction} · Opening 1→0.`,
  };
}
