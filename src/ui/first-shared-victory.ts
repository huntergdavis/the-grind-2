import { canonicalStringify } from "../core/canonical";
import { advanceWorld } from "../core/simulation";
import type { WorldState } from "../core/types";
import { companionMatchesCombatantIdentity, isValidCompanionRoster } from "../depth/companion";
import { captureFirstSharedVictory, type FirstSharedVictory } from "../narrator/first-shared-victory";

export type { FirstSharedVictory } from "../narrator/first-shared-victory";

const unsafeText = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}<>`*_{}\[\]]|&(?:[a-z]{2,}|#(?:\d+|x[\da-f]+));/iu;

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    && value === value.trim() && !unsafeText.test(value);
}

function boundedIdentity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && value === value.trim()
    && !/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value);
}

/** One canonical final combat action with an actual active participant's victories changing from zero to one. */
export function projectFirstSharedVictory(before: WorldState, after: WorldState): FirstSharedVictory | null {
  try {
    const source = after.chronicle.at(-1);
    const combat = before.depth.combat;
    const completed = after.depth.completedCombats.at(-1);
    if (source?.commandType !== "combat-action" || source.mode !== "battle"
      || combat === null || combat.outcome !== "ongoing" || after.depth.combat !== null
      || completed?.id !== combat.id || completed.outcome !== "victory"
      || before.depth.companions.active.length !== 1 || after.depth.companions.active.length !== 1) return null;
    const companion = before.depth.companions.active[0]!;
    const retained = after.depth.companions.active[0]!;
    const companionId = companion.identity.residentId;
    if (companion.victories !== 0 || retained.victories !== 1 || retained.identity.residentId !== companionId
      || !isValidCompanionRoster(before.depth.companions) || !isValidCompanionRoster(after.depth.companions)
      || before.campaignId !== after.campaignId || before.seed !== after.seed || before.depth.seed !== after.depth.seed
      || before.hero.id !== after.hero.id || before.depth.hero.id !== before.hero.id || after.depth.hero.id !== after.hero.id
      || before.hero.name !== after.hero.name || after.hero.name !== after.depth.hero.name
      || companion.identity.name !== retained.identity.name
      || !Number.isSafeInteger(before.tick) || before.tick < 0 || !Number.isSafeInteger(after.tick)
      || after.tick !== before.tick + 1 || before.depth.tick !== before.tick || after.depth.tick !== after.tick
      || source.tick !== after.tick || source.id !== `${after.campaignId}:${after.tick}`
      || !boundedIdentity(source.commandId)
      || before.chronicle.some((entry) => entry.id === source.id)
      || after.chronicle.filter((entry) => entry.id === source.id).length !== 1
      || before.depth.completedCombats.some((entry) => entry.id === combat.id)
      || after.depth.completedCombats.filter((entry) => entry.id === combat.id).length !== 1) return null;

    for (const [roster, record] of [[combat.combatants, companion], [completed.combatants, retained]] as const) {
      const participant = roster.filter((entry) => entry.id === companionId);
      if (participant.length !== 1 || !companionMatchesCombatantIdentity(record, participant[0]!)
        || participant[0]!.health !== record.resources.health || participant[0]!.mana !== record.resources.mana) return null;
    }
    if (!boundedIdentity(after.campaignId) || !boundedIdentity(source.id)
      || !boundedIdentity(combat.id) || !boundedIdentity(companionId)
      || !boundedText(after.hero.name, 128) || !boundedText(retained.identity.name, 128)
      || !boundedText(source.location, 120) || !boundedText(source.headline, 160)) return null;

    // Reuse the canonical reducer only after the rare zero-to-one guard. Do not duplicate evolving loot,
    // progression, actor-policy or combat rules, and do not compare unrelated host wall-clock/save metadata.
    const expected = advanceWorld(before);
    for (const key of ["depth", "hero", "scene", "chronicle"] as const) {
      if (canonicalStringify(expected[key]) !== canonicalStringify(after[key])) return null;
    }
    return captureFirstSharedVictory({
      kind: "first-shared-victory", campaignId: after.campaignId, eventId: source.id, tick: source.tick,
      combatId: combat.id, heroName: after.hero.name, companionName: retained.identity.name, companionId,
      condition: retained.injury === "none" ? "healthy" : "injured",
      battle: { location: source.location, headline: source.headline, tick: source.tick },
    });
  } catch {
    return null;
  }
}
