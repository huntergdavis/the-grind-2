import { isValidCombatState } from "./combat";
import { isValidActiveCompanion, isValidCompanionReferences } from "./companion";
import type { ActiveCompanion, CombatState, CombatTurnEvent, DepthCommand, DepthState, FormerCompanion } from "./types";

export type CompanionCreditChoice = "acknowledge" | "claim-credit";
export interface CompanionCreditResponse {
  readonly choice: CompanionCreditChoice;
  readonly heroLine: string;
  readonly companionLine: string;
  /** Direction is companion -> hero; not a cumulative bond or flyting score. */
  readonly regardDelta: 1 | -1;
}
export interface CompanionCredit {
  readonly schemaVersion: 1;
  readonly rulesVersion: "companion-credit-v1";
  readonly heroId: string;
  readonly residentId: string;
  readonly companionName: string;
  readonly joinedTick: number;
  readonly locationId: string;
  readonly preference: "fair-credit-v1";
  readonly evidence: {
    /** One existing bounded combat and oath, not an accumulating battle archive. */
    readonly combat: CombatState;
    readonly companion: ActiveCompanion;
    readonly damageEventId: string;
    readonly outcomeEventId: string;
    readonly sourceCommandId: string;
    readonly tick: number;
  };
  readonly exchange: (CompanionCreditResponse & { readonly sourceCommandId: string; readonly tick: number }) | null;
  readonly farewell: { readonly sourceCommandId: string; readonly tick: number; readonly line: string } | null;
}
type CreditCommand = Extract<DepthCommand, { type: "share-companion-credit" }>;
type DamageEvent = Extract<CombatTurnEvent, { kind: "damage" }>;
function integer(value: unknown, minimum = 0): value is number { return Number.isSafeInteger(value) && (value as number) >= minimum; }
function keys(value: unknown, names: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...names].sort().join(",");
}
function same(value: unknown, expected: Record<string, unknown>): boolean {
  return keys(value, Object.keys(expected)) && Object.entries(expected).every(([key, field]) => value[key] === field);
}
/** Compare the one bounded combat snapshot without depending on JSON key order. */
function sameSnapshot(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left)) return Array.isArray(right) && left.length === right.length
    && left.every((entry, index) => sameSnapshot(entry, right[index]));
  return right !== null && typeof right === "object" && !Array.isArray(right)
    && keys(left, Object.keys(right)) && Object.entries(right).every(([key, value]) => sameSnapshot(left[key], value));
}
function healthy(entry: ActiveCompanion | undefined): entry is ActiveCompanion {
  return entry !== undefined && isValidActiveCompanion(entry) && entry.injury === "none" && entry.resources.health > 0;
}
function damageEvidence(combat: CombatState, residentId: string): DamageEvent | undefined {
  return [...combat.eventStream.events].reverse().find((event): event is DamageEvent => event.kind === "damage"
    && event.actorId === residentId && event.amount > 0 && combat.combatants.some((unit) => unit.id === event.targetId && unit.side === "enemies"));
}
function settlementCommandId(combat: CombatState, tick: number): string | null {
  const intent = combat.eventStream.events.find((event) => event.turn === combat.turn && event.kind === "intent");
  if (intent?.kind !== "intent") return null;
  const detail = intent.action === "joint-action" ? intent.jointActionId : intent.action === "companion-action" ? intent.companionActionId
    : intent.abilityId ?? intent.itemId ?? "basic";
  return `depth:${tick}:combat:${combat.id}:${combat.turn - 1}:${intent.actorId}:${intent.action}:${detail}:${intent.targetId ?? "self"}`;
}
export function companionCreditCommandId(tick: number, command: CreditCommand): string {
  return `depth:${tick}:companion:credit:${command.residentId}:${command.joinedTick}:${command.combatId}:${command.choice}`;
}
function responses(credit: CompanionCredit): readonly CompanionCreditResponse[] {
  const damage = credit.evidence.combat.eventStream.events.find((entry) => entry.id === credit.evidence.damageEventId)!;
  const target = credit.evidence.combat.combatants.find((entry) => entry.id === damage.targetId)!;
  return [
    { choice: "acknowledge", heroLine: `You landed that hit on ${target.name}. I will not tell this story without you.`,
      companionLine: "Thank you. I would rather share the work than disappear from the story.", regardDelta: 1 },
    { choice: "claim-credit", heroLine: "A fine solo victory, if I say so myself.",
      companionLine: "An impressive solo victory. Particularly the part where I helped.", regardDelta: -1 },
  ];
}
export function companionCreditFarewellLine(choice: CompanionCreditChoice): string {
  return choice === "acknowledge" ? "You made room for me in the story. I will remember that."
    : "Tell this road however you like. Just leave room for the people who walked it.";
}
function quietWithContributor(state: DepthState, credit: CompanionCredit): boolean {
  const active = state.companions.active.find((entry) => entry.identity.residentId === credit.residentId && entry.joinedTick === credit.joinedTick);
  return healthy(active) && active.identity.name === credit.companionName && state.hero.resources.health > 0
    && state.atlas.currentLocationId === credit.locationId && state.combat === null && state.counterDuel === null
    && state.quest.status === "active" && state.pendingQuestReward === null && state.repartee.active === null
    && (state.dungeon === null || state.dungeon.completed)
    && (state.bellExpedition === null || state.bellExpedition.completion !== null)
    && (state.usefulReply === null || state.usefulReply.reply !== null)
    && (state.roomChallenge === null || state.roomChallenge.result !== null);
}

/** The snapshot's own recorded location validates its oath, independently of a later roster. */
function validArchivedCompanion(state: DepthState, credit: CompanionCredit): boolean {
  const companion = credit.evidence.companion;
  if (!healthy(companion) || companion.identity.residentId !== credit.residentId || companion.identity.name !== credit.companionName
    || companion.joinedTick !== credit.joinedTick || companion.victories < 1) return false;
  return isValidCompanionReferences({ schemaVersion: 2, kitRulesVersion: "explicit-companion-kit-v1",
    explicitKitAfterTick: companion.combatKit === undefined ? companion.joinedTick : Math.max(0, companion.joinedTick - 1),
    active: [companion], former: [] }, { ...state.atlas, currentLocationId: credit.locationId, route: null }, state.towns);
}

export function isValidCampaignCompanionCredit(state: DepthState): boolean {
  try {
    if (!Object.hasOwn(state, "companionCredit")) return true;
    const value: unknown = state.companionCredit;
    if (value === null) return true;
    if (!keys(value, ["schemaVersion", "rulesVersion", "heroId", "residentId", "companionName", "joinedTick", "locationId", "preference", "evidence", "exchange", "farewell"])
      || value.schemaVersion !== 1 || value.rulesVersion !== "companion-credit-v1" || value.preference !== "fair-credit-v1"
      || value.heroId !== state.hero.id || !integer(value.joinedTick)
      || !keys(value.evidence, ["combat", "companion", "damageEventId", "outcomeEventId", "sourceCommandId", "tick"])
      || !integer(value.evidence.tick, 1) || !isValidCombatState(value.evidence.combat)) return false;
    const credit = value as unknown as CompanionCredit, evidence = credit.evidence, battle = evidence.combat;
    if (!validArchivedCompanion(state, credit) || evidence.tick <= credit.joinedTick || evidence.tick > state.tick
      || !state.atlas.discoveredLocationIds.includes(credit.locationId) || !state.atlas.locations.some((entry) => entry.id === credit.locationId)
      || battle.outcome !== "victory" || evidence.tick < battle.turn
      || evidence.sourceCommandId !== settlementCommandId(battle, evidence.tick)) return false;
    const contributor = battle.combatants.find((entry) => entry.id === credit.residentId);
    const hero = battle.combatants.find((entry) => entry.id === credit.heroId);
    const damage = damageEvidence(battle, credit.residentId), outcome = battle.eventStream.events.at(-1);
    if (contributor?.side !== "heroes" || contributor.name !== credit.companionName || contributor.health <= 0 || hero?.side !== "heroes"
      || contributor.health !== evidence.companion.resources.health || contributor.mana !== evidence.companion.resources.mana
      || damage?.id !== evidence.damageEventId || outcome?.kind !== "outcome" || outcome.outcome !== "victory"
      || outcome.id !== evidence.outcomeEventId) return false;
    // Route encounter IDs can recur after eviction. The credited resident
    // identifies this oath's battle: an oath owns one route and former
    // residents are excluded from recruitment. Another party on that route
    // is not the source of this archived exchange.
    const retained = state.completedCombats.find((entry) => entry.id === battle.id
      && entry.combatants.some((actor) => actor.id === credit.residentId && actor.side === "heroes"));
    // While its source still exists, an archive cannot silently rename a foe,
    // alter the recorded contribution, or otherwise tell a different battle.
    // The finite snapshot remains sufficient after ordinary source eviction.
    if (retained !== undefined && !sameSnapshot(battle, retained)) return false;
    if (evidence.tick === state.tick) {
      const present = state.companions.active.find((entry) => entry.identity.residentId === credit.residentId && entry.joinedTick === credit.joinedTick);
      if (!healthy(present) || present.resources.health !== contributor.health || present.resources.mana !== contributor.mana
        || state.atlas.currentLocationId !== credit.locationId || retained === undefined) return false;
    }
    const exchange = credit.exchange;
    if (exchange === null) return credit.farewell === null;
    const response = responses(credit).find((entry) => entry.choice === exchange.choice);
    if (response === undefined || !integer(exchange.tick, 1) || exchange.tick <= evidence.tick || exchange.tick > state.tick
      || !same(exchange, { ...response, sourceCommandId: companionCreditCommandId(exchange.tick, { type: "share-companion-credit",
        residentId: credit.residentId, joinedTick: credit.joinedTick, combatId: battle.id, choice: response.choice }), tick: exchange.tick })) return false;
    if (exchange.tick === state.tick && !quietWithContributor(state, credit)) return false;
    if (credit.farewell === null) return true;
    const farewell = credit.farewell;
    if (!integer(farewell.tick, 1) || farewell.tick <= exchange.tick || farewell.tick > state.tick
      || !same(farewell, { sourceCommandId: `depth:${farewell.tick}:companion:farewell:${credit.residentId}`, tick: farewell.tick,
        line: companionCreditFarewellLine(exchange.choice) })) return false;
    const former = state.companions.former.find((entry) => entry.identity.residentId === credit.residentId && entry.joinedTick === credit.joinedTick);
    if (former !== undefined && (former.departure.tick !== farewell.tick || former.departure.outcome !== "fulfilled"
      || former.departure.locationId !== evidence.companion.destination.locationId)) return false;
    return farewell.tick < state.tick || former !== undefined && former.injury === "none" && former.resources.health > 0
      && state.atlas.currentLocationId === former.departure.locationId && state.atlas.route === null;
  } catch { return false; }
}

/** This producer runs only on an actual combat-action transition into victory. */
export function captureCompanionCredit(before: DepthState, after: DepthState,
  command: Extract<DepthCommand, { type: "combat-action" }>): CompanionCredit | null {
  if (before.companionCredit != null) return before.companionCredit;
  const battle = after.completedCombats.at(-1), companion = after.companions.active[0];
  if (before.combat === null || battle === undefined || battle.id !== before.combat.id || battle.outcome !== "victory"
    || battle.turn !== before.combat.turn + 1 || after.tick !== before.tick + 1 || !healthy(companion)
    || !before.companions.active.some((entry) => entry.identity.residentId === companion.identity.residentId && entry.joinedTick === companion.joinedTick)
    || !isValidCompanionReferences(after.companions, after.atlas, after.towns)) return null;
  const damage = damageEvidence(battle, companion.identity.residentId), outcome = battle.eventStream.events.at(-1);
  if (damage === undefined || outcome?.kind !== "outcome" || outcome.outcome !== "victory") return null;
  const sourceCommandId = settlementCommandId(battle, after.tick);
  const action = command.action, detail = action.type === "joint-action" ? action.jointActionId
    : action.type === "companion-action" ? action.companionActionId : action.abilityId ?? action.itemId ?? "basic";
  if (sourceCommandId !== `depth:${after.tick}:combat:${battle.id}:${before.combat.turn}:${action.actorId}:${action.type}:${detail}:${action.targetId ?? "self"}`) return null;
  return { schemaVersion: 1, rulesVersion: "companion-credit-v1", heroId: after.hero.id,
    residentId: companion.identity.residentId, companionName: companion.identity.name, joinedTick: companion.joinedTick,
    locationId: after.atlas.currentLocationId, preference: "fair-credit-v1",
    evidence: { combat: structuredClone(battle), companion: structuredClone(companion), damageEventId: damage.id,
      outcomeEventId: outcome.id, sourceCommandId, tick: after.tick }, exchange: null, farewell: null };
}
export function selectCompanionCredit(state: DepthState): CompanionCredit | null {
  const credit = state.companionCredit;
  return credit == null || credit.exchange !== null || !isValidCampaignCompanionCredit(state) || !quietWithContributor(state, credit) ? null : credit;
}
export function companionCreditChoices(state: DepthState): readonly CompanionCreditResponse[] {
  const credit = selectCompanionCredit(state);
  return credit === null ? [] : responses(credit);
}
export function stepCompanionCredit(state: DepthState, command: CreditCommand): CompanionCredit {
  const credit = selectCompanionCredit(state);
  if (credit === null || command.residentId !== credit.residentId || command.joinedTick !== credit.joinedTick
    || command.combatId !== credit.evidence.combat.id) throw new Error("No matching earned companion credit is available");
  const response = responses(credit).find((entry) => entry.choice === command.choice);
  if (response === undefined) throw new Error("Unknown companion credit choice");
  return { ...credit, exchange: { ...response, sourceCommandId: companionCreditCommandId(state.tick + 1, command), tick: state.tick + 1 } };
}
export function captureCompanionCreditFarewell(before: DepthState, after: DepthState, former: FormerCompanion): CompanionCredit | null {
  const credit = before.companionCredit;
  if (credit == null) return null;
  if (credit.exchange === null || credit.farewell !== null || former.identity.residentId !== credit.residentId
    || former.joinedTick !== credit.joinedTick || former.departure.tick !== after.tick || after.tick !== before.tick + 1
    || former.departure.outcome !== "fulfilled" || former.injury !== "none" || former.resources.health <= 0
    || !before.companions.active.some((entry) => healthy(entry) && entry.identity.residentId === credit.residentId && entry.joinedTick === credit.joinedTick)
    || after.atlas.currentLocationId !== former.departure.locationId || after.atlas.route !== null) return credit;
  return { ...credit, farewell: { sourceCommandId: `depth:${after.tick}:companion:farewell:${credit.residentId}`,
    tick: after.tick, line: companionCreditFarewellLine(credit.exchange.choice) } };
}
