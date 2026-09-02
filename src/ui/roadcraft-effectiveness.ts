import { combatDamageV1 } from "../depth/combat-damage";
import { isValidCombatState } from "../depth/combat";
import { companionMatchesCombatantIdentity } from "../depth/companion";
import {
  companionActionVerbId,
  type CompanionActionVerbId,
} from "../depth/companion-kit";
import {
  abilityExperienceFloor,
  abilityLevelForExperience,
} from "../depth/rpg";
import type {
  AbilityState,
  ActiveCompanion,
  CombatState,
  CombatTurnEvent,
  CompanionActionId,
  FormerCompanion,
} from "../depth/types";

type CompanionRecord = ActiveCompanion | FormerCompanion;
type CompanionActionReceipt = Extract<CombatTurnEvent, { kind: "companion-action-resolved" }>;
type IntentReceipt = Extract<CombatTurnEvent, { kind: "intent" }>;

export interface RoadcraftEffectivenessSource {
  readonly seed: string;
  readonly combat: CombatState | null;
  readonly completedCombats: readonly CombatState[];
}

export interface RoadcraftUseFactV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly verbId: CompanionActionVerbId;
  readonly combatId: string;
  readonly turn: number;
  readonly actorId: string;
  readonly targetId: string;
  readonly companionActionId: CompanionActionId;
}

export type RoadcraftImpactFactV1 =
  | {
      readonly schemaVersion: 1;
      readonly id: string;
      readonly kind: "flour-veil";
      readonly combatId: string;
      readonly turn: number;
      readonly sourceEventId: string;
      readonly damageEventId: string;
      readonly actorId: string;
      readonly targetId: string;
      readonly preventedDamage: number;
    }
  | {
      readonly schemaVersion: 1;
      readonly id: string;
      readonly kind: "millstone-drag";
      readonly combatId: string;
      readonly turn: number;
      readonly sourceEventId: string;
      readonly damageEventId: string;
      readonly actorId: string;
      readonly targetId: string;
      readonly preventedDamage: 0;
    };

export interface RoadcraftEffectivenessV1 {
  readonly schemaVersion: 1;
  readonly scope: "verified-retained-combat-history-v1";
  readonly companionId: string;
  readonly kitId: "miller-roadcraft";
  readonly rulesVersion: "miller-roadcraft-v1";
  readonly combatIds: readonly string[];
  readonly retainedCombatCount: number;
  readonly completeEventCombatCount: number;
  readonly truncatedEventCombatCount: number;
  readonly unmeasuredImpactCount: number;
  readonly flourVeilUses: number;
  readonly millstoneDragUses: number;
  readonly flourScreenedHits: number;
  readonly damagePrevented: number;
  readonly millstoneAffectedAttacks: number;
  readonly victoriesTogether: number;
  readonly injuryCount: 0 | 1;
  readonly injury: CompanionRecord["injury"];
  readonly uses: readonly RoadcraftUseFactV1[];
  readonly impacts: readonly RoadcraftImpactFactV1[];
  readonly latestImpact: RoadcraftImpactFactV1 | null;
}

interface StatusSource {
  readonly receipt: CompanionActionReceipt;
}

function freezeCopy<T>(value: T): Readonly<T> {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => freezeCopy(entry))) as unknown as Readonly<T>;
  }
  if (typeof value === "object" && value !== null) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, freezeCopy(entry)]),
    )) as Readonly<T>;
  }
  return value;
}

function sameRoadcraftReceipt(receipt: CompanionActionReceipt, companionId: string): boolean {
  return receipt.actorId === companionId && receipt.targetId !== null &&
    receipt.kitId === "miller-roadcraft" && receipt.rulesVersion === "miller-roadcraft-v1";
}

function abilityAtDamage(
  combat: CombatState,
  eventIndex: number,
  intent: IntentReceipt,
): Pick<AbilityState, "effect" | "potency" | "level"> | null | undefined {
  if (intent.action === "attack") return null;
  if (intent.action !== "ability" || intent.abilityId === null) return undefined;
  const actor = combat.combatants.find((combatant) => combatant.id === intent.actorId);
  const finalAbility = actor?.abilities.find((ability) => ability.id === intent.abilityId);
  if (finalAbility === undefined) return undefined;
  const laterResolvedUses = combat.eventStream.events.slice(eventIndex + 1).filter((event) =>
    event.kind === "mana-spent" && event.actorId === intent.actorId &&
    event.abilityId === intent.abilityId
  ).length;
  if (finalAbility.uses < laterResolvedUses + 1) return undefined;
  const maximumExperience = abilityExperienceFloor(20);
  const lowerExperience = Math.max(0, finalAbility.experience - (laterResolvedUses + 1) * 2);
  const upperExperience = finalAbility.experience === maximumExperience
    ? maximumExperience
    : lowerExperience;
  const lowerLevel = abilityLevelForExperience(lowerExperience);
  const upperLevel = abilityLevelForExperience(upperExperience);
  if (lowerLevel !== upperLevel) return undefined;
  return { effect: finalAbility.effect, potency: finalAbility.potency, level: lowerLevel };
}

function joinedCombats(
  source: RoadcraftEffectivenessSource,
  companion: CompanionRecord,
): readonly CombatState[] | null {
  const combats = [...source.completedCombats, ...(source.combat === null ? [] : [source.combat])];
  if (new Set(combats.map((combat) => combat.id)).size !== combats.length) return null;
  const joined: CombatState[] = [];
  for (const combat of combats) {
    if (!isValidCombatState(combat)) return null;
    const matches = combat.combatants.filter((combatant) => combatant.id === companion.identity.residentId);
    if (matches.length === 0) continue;
    if (matches.length !== 1 || !companionMatchesCombatantIdentity(companion, matches[0]!)) return null;
    joined.push(combat);
  }
  return joined;
}

function statusKey(actorId: string, status: "guarding" | "weakened"): string {
  return `${actorId}\u001f${status}`;
}

function intentForTurn(combat: CombatState, turn: number): IntentReceipt | undefined {
  return combat.eventStream.events.find((event): event is IntentReceipt =>
    event.turn === turn && event.kind === "intent"
  );
}

function safeAdd(left: number, right: number): number | null {
  const total = left + right;
  return Number.isSafeInteger(total) && total >= 0 ? total : null;
}

export function projectRoadcraftEffectiveness(
  source: RoadcraftEffectivenessSource,
  companion: CompanionRecord,
): RoadcraftEffectivenessV1 | null {
  if (companion.combatKit?.kitId !== "miller-roadcraft" || companion.combatKit.rulesVersion !== "miller-roadcraft-v1") {
    return null;
  }
  const combats = joinedCombats(source, companion);
  if (combats === null) return null;
  const uses: RoadcraftUseFactV1[] = [];
  const impacts: RoadcraftImpactFactV1[] = [];
  let unmeasuredImpactCount = 0;
  let damagePrevented = 0;

  for (const combat of combats) {
    const sources = new Map<string, StatusSource>();
    const events = combat.eventStream.events;
    for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
      const event = events[eventIndex]!;
      if (event.kind === "companion-action-resolved" && sameRoadcraftReceipt(event, companion.identity.residentId)) {
        uses.push({
          schemaVersion: 1,
          id: event.id,
          verbId: companionActionVerbId(event.companionActionId),
          combatId: combat.id,
          turn: event.turn,
          actorId: event.actorId,
          targetId: event.targetId!,
          companionActionId: event.companionActionId,
        });
        continue;
      }
      if (event.kind === "status-applied" && (event.status === "guarding" || event.status === "weakened") && event.targetId !== null) {
        const previous = events[eventIndex - 1];
        const expectedAction = event.status === "guarding" ? "flour-veil" : "millstone-drag";
        if (
          previous?.kind === "companion-action-resolved" &&
          previous.turn === event.turn && previous.ordinal + 1 === event.ordinal &&
          previous.companionActionId === expectedAction && previous.targetId === event.targetId &&
          sameRoadcraftReceipt(previous, companion.identity.residentId)
        ) {
          sources.set(statusKey(event.targetId, event.status), { receipt: previous });
        } else {
          sources.delete(statusKey(event.targetId, event.status));
        }
        continue;
      }
      if (event.kind === "status-expired" && (event.status === "guarding" || event.status === "weakened")) {
        sources.delete(statusKey(event.actorId, event.status));
        continue;
      }
      if (event.kind !== "damage" || event.targetId === null) continue;

      const flourSource = sources.get(statusKey(event.targetId, "guarding"));
      if (event.guarded && flourSource?.receipt.companionActionId === "flour-veil") {
        const intent = intentForTurn(combat, event.turn);
        const actor = combat.combatants.find((combatant) => combatant.id === event.actorId);
        const target = combat.combatants.find((combatant) => combatant.id === event.targetId);
        const ability = intent === undefined ? undefined : abilityAtDamage(combat, eventIndex, intent);
        const weakenedTick = events.find((candidate) =>
          candidate.turn === event.turn && candidate.ordinal < event.ordinal &&
          candidate.actorId === event.actorId && candidate.kind === "status-tick" &&
          candidate.status === "weakened" && candidate.durationAfter > 0
        );
        if (
          intent === undefined || actor === undefined || target === undefined || ability === undefined ||
          intent.actorId !== event.actorId || intent.targetId !== event.targetId ||
          event.abilityId !== intent.abilityId
        ) {
          unmeasuredImpactCount += 1;
        } else {
          const calculation = combatDamageV1(
            source.seed,
            combat.id,
            event.turn,
            actor,
            { ...target, health: event.healthBefore },
            ability,
            weakenedTick?.kind === "status-tick" ? weakenedTick.potency : 0,
            true,
          );
          if (calculation.appliedDamage !== event.amount) {
            unmeasuredImpactCount += 1;
          } else {
            const nextTotal = safeAdd(damagePrevented, calculation.preventedDamage);
            if (nextTotal === null) return null;
            damagePrevented = nextTotal;
            impacts.push({
              schemaVersion: 1,
              id: `${event.id}:roadcraft:flour-veil`,
              kind: "flour-veil",
              combatId: combat.id,
              turn: event.turn,
              sourceEventId: flourSource.receipt.id,
              damageEventId: event.id,
              actorId: event.actorId,
              targetId: event.targetId,
              preventedDamage: calculation.preventedDamage,
            });
          }
        }
      }

      const millstoneSource = sources.get(statusKey(event.actorId, "weakened"));
      const weakenedTick = events.find((candidate) =>
        candidate.turn === event.turn && candidate.ordinal < event.ordinal &&
        candidate.actorId === event.actorId && candidate.kind === "status-tick" &&
        candidate.status === "weakened" && candidate.durationAfter > 0
      );
      if (millstoneSource?.receipt.companionActionId === "millstone-drag" && weakenedTick !== undefined) {
        impacts.push({
          schemaVersion: 1,
          id: `${event.id}:roadcraft:millstone-drag`,
          kind: "millstone-drag",
          combatId: combat.id,
          turn: event.turn,
          sourceEventId: millstoneSource.receipt.id,
          damageEventId: event.id,
          actorId: event.actorId,
          targetId: event.targetId,
          preventedDamage: 0,
        });
      }
    }
  }

  const completeEventCombatCount = combats.filter((combat) => combat.eventStream.firstRecordedTurn === 1).length;
  const packet: RoadcraftEffectivenessV1 = {
    schemaVersion: 1,
    scope: "verified-retained-combat-history-v1",
    companionId: companion.identity.residentId,
    kitId: "miller-roadcraft",
    rulesVersion: "miller-roadcraft-v1",
    combatIds: combats.map((combat) => combat.id),
    retainedCombatCount: combats.length,
    completeEventCombatCount,
    truncatedEventCombatCount: combats.length - completeEventCombatCount,
    unmeasuredImpactCount,
    flourVeilUses: uses.filter((use) => use.companionActionId === "flour-veil").length,
    millstoneDragUses: uses.filter((use) => use.companionActionId === "millstone-drag").length,
    flourScreenedHits: impacts.filter((impact) => impact.kind === "flour-veil").length,
    damagePrevented,
    millstoneAffectedAttacks: impacts.filter((impact) => impact.kind === "millstone-drag").length,
    victoriesTogether: companion.victories,
    injuryCount: companion.injury === "none" ? 0 : 1,
    injury: companion.injury,
    uses,
    impacts,
    latestImpact: impacts.at(-1) ?? null,
  };
  return freezeCopy(packet) as RoadcraftEffectivenessV1;
}

function countText(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

export function describeRoadcraftEffectiveness(effectiveness: RoadcraftEffectivenessV1): string {
  const coverage = effectiveness.retainedCombatCount === 0
    ? "no retained battles"
    : `${countText(effectiveness.retainedCombatCount, "retained battle")}${effectiveness.truncatedEventCombatCount > 0 ? ` · ${effectiveness.truncatedEventCombatCount} partial` : ""}`;
  const unmeasured = effectiveness.unmeasuredImpactCount === 0
    ? ""
    : ` · ${effectiveness.unmeasuredImpactCount} unmeasured impact`;
  return `RETAINED ROADCRAFT RECORD · ${coverage} · Flour Veil ${countText(effectiveness.flourVeilUses, "use")} · ${countText(effectiveness.flourScreenedHits, "screened hit")} · ${effectiveness.damagePrevented} HP prevented · Millstone Drag ${countText(effectiveness.millstoneDragUses, "use")} · ${countText(effectiveness.millstoneAffectedAttacks, "affected attack")}${unmeasured}`;
}
