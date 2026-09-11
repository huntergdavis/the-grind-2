import type { ChronicleEntry, WorldState } from "../core/types";
import { isValidCombatState } from "../depth/combat";
import { dungeonGuardianResolutionCommandId, isValidCampaignDungeonLair } from "../depth/dungeon-lair";
import { isValidCampaignRoadSupper } from "../depth/road-supper";
import type { CombatState, CombatTurnEvent } from "../depth/types";

export interface CombatAftermath {
  readonly combatId: string;
  readonly outcome: "victory" | "defeat";
  readonly headline: "Last exchange";
  readonly detail: string;
  readonly compactDetail: string;
  readonly sourceEventIds: readonly string[];
}

export interface BoundCombatAftermath extends CombatAftermath {
  readonly commandId: string;
  readonly tick: number;
  readonly chronicleId: string;
}

type Intent = Extract<CombatTurnEvent, { kind: "intent" }>;
type Damage = Extract<CombatTurnEvent, { kind: "damage" }>;
interface Strike {
  readonly intent: Intent;
  readonly damage: Damage;
  readonly text: string;
  readonly actorName: string;
  readonly actionName: string;
  readonly targetName: string;
}

/** A factual direct strike, never a guessed action or a status-interrupted intent. */
function strike(combat: CombatState, turn: number): Strike | null {
  const packet = combat.eventStream.events.filter(event => event.turn === turn);
  const intent = packet[0], damage = packet.find((event): event is Damage => event.kind === "damage");
  if (intent?.kind !== "intent" || (intent.action !== "attack" && intent.action !== "ability") || damage === undefined
    || damage.actorId !== intent.actorId || damage.targetId !== intent.targetId || damage.abilityId !== intent.abilityId
    || damage.amount !== damage.healthBefore - damage.healthAfter || damage.amount <= 0) return null;
  const actor = combat.combatants.find(unit => unit.id === intent.actorId);
  const target = combat.combatants.find(unit => unit.id === damage.targetId);
  if (actor === undefined || target === undefined || actor.side === target.side) return null;
  const ability = intent.action === "ability" ? actor.abilities.find(entry => entry.id === intent.abilityId) : undefined;
  if (intent.action === "ability" && ability === undefined) return null;
  return { intent, damage, actorName: actor.name, actionName: ability?.name ?? "A strike", targetName: target.name,
    text: ability === undefined ? `${actor.name} struck ${target.name} for ${damage.amount} HP`
      : `${actor.name} used ${ability.name} on ${target.name} for ${damage.amount} HP` };
}

/** Two consecutive retained actions at most; no tactical blame or hypothetical saved HP. */
export function projectCombatAftermath(combat: CombatState): CombatAftermath | null {
  try {
    if (!isValidCombatState(combat) || (combat.outcome !== "victory" && combat.outcome !== "defeat")) return null;
    const outcome = combat.eventStream.events.at(-1);
    if (outcome?.kind !== "outcome" || outcome.turn !== combat.turn || outcome.outcome !== combat.outcome) return null;
    const closing = strike(combat, combat.turn);
    if (closing === null || closing.damage.healthAfter !== 0) return null;
    const defeated = combat.eventStream.events.find(event => event.turn === combat.turn && event.kind === "defeated"
      && event.causeEventId === closing.damage.id && event.targetId === closing.damage.targetId);
    if (defeated === undefined) return null;
    const target = combat.combatants.find(unit => unit.id === closing.damage.targetId)!;
    if (target.side !== (combat.outcome === "victory" ? "enemies" : "heroes")) return null;
    const previous = combat.turn > combat.eventStream.firstRecordedTurn ? strike(combat, combat.turn - 1) : null;
    const detail = `${previous === null ? "" : `${previous.text}. `}${closing.text}; ${closing.targetName} fell.`;
    const closingCompact = `${closing.actionName} from ${closing.actorName} felled ${closing.targetName}.`;
    const bothCompact = `${previous === null ? "" : `${previous.actionName} hit ${previous.targetName}. `}${closingCompact}`;
    const compactDetail = bothCompact.length <= 110 ? bothCompact : closingCompact;
    const sourceEventIds = Object.freeze([...(previous === null ? [] : [previous.intent.id, previous.damage.id]),
      closing.intent.id, closing.damage.id, defeated.id, outcome.id]);
    return Object.freeze({ combatId: combat.id, outcome: combat.outcome, headline: "Last exchange", detail, compactDetail, sourceEventIds });
  } catch { return null; }
}

function sameEntry(left: ChronicleEntry, right: ChronicleEntry): boolean {
  return left.id === right.id && left.tick === right.tick && left.commandId === right.commandId
    && left.commandType === right.commandType && left.mode === right.mode && left.location === right.location
    && left.headline === right.headline && left.action === right.action && left.goal === right.goal
    && left.consequence === right.consequence && left.sensoryIntensity === right.sensoryIntensity;
}

function bind(world: WorldState, entry: ChronicleEntry, combat: CombatState, tick: number, source: string): BoundCombatAftermath | null {
  if (entry.tick !== tick || entry.commandId !== `${world.campaignId}:${source}`
    || source !== dungeonGuardianResolutionCommandId(combat, tick)
    || !combat.combatants.some(unit => unit.id === world.hero.id && unit.side === "heroes")) return null;
  const recap = projectCombatAftermath(combat);
  return recap === null ? null : Object.freeze({ ...recap, commandId: entry.commandId, tick, chronicleId: entry.id });
}

/** Generic combat archives have no absolute tick. Historical rows therefore need
 * an existing timestamped battle receipt; matching a reused route ID is not proof.
 */
export function projectCombatAftermathEntry(world: WorldState, entry: ChronicleEntry): BoundCombatAftermath | null {
  try {
    if (world.tick !== world.depth.tick || world.hero.id !== world.depth.hero.id || entry.tick > world.tick
      || entry.id !== `${world.campaignId}:${entry.tick}` || entry.mode !== "battle" || entry.commandType !== "combat-action"
      || !world.chronicle.some(candidate => sameEntry(candidate, entry))) return null;
    // Only the current terminal beat can use the ordinary untimestamped ring.
    if (entry.tick === world.tick) {
      if (!sameEntry(world.chronicle.at(-1)!, entry) || world.depth.combat !== null
        || world.depth.counterDuel !== null || world.scene.mode !== "battle"
        || (["location", "headline", "action", "goal", "consequence", "sensoryIntensity"] as const)
          .some(key => world.scene[key] !== entry[key])) return null;
      const combat = world.depth.completedCombats.at(-1);
      if (combat === undefined) return null;
      const source = dungeonGuardianResolutionCommandId(combat, entry.tick);
      return source === null ? null : bind(world, entry, combat, entry.tick, source);
    }
    const supper = world.depth.roadSupper?.terminal;
    if (supper != null && supper.tick === entry.tick) {
      return isValidCampaignRoadSupper(world.depth) ? bind(world, entry, supper.combat, supper.tick, supper.sourceCommandId) : null;
    }
    const lair = world.depth.dungeon?.lair?.encounter?.resolution;
    if (lair != null && lair.tick === entry.tick) {
      return isValidCampaignDungeonLair(world.depth) ? bind(world, entry, lair.combat, lair.tick, lair.sourceCommandId) : null;
    }
    return null;
  } catch { return null; }
}

/** The Watch caption must belong to this exact current scene, not a stored victory. */
export function projectCombatAftermathScene(world: WorldState): BoundCombatAftermath | null {
  const entry = world.chronicle.at(-1);
  if (entry === undefined || entry.tick !== world.tick || world.scene.mode !== "battle"
    || world.depth.combat !== null || world.depth.counterDuel !== null
    || (["location", "headline", "action", "goal", "consequence", "sensoryIntensity"] as const)
      .some(key => world.scene[key] !== entry[key])) return null;
  return projectCombatAftermathEntry(world, entry);
}
