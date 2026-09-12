import type { ChronicleEntry, WorldState } from "../core/types";
import { isValidCombatState } from "../depth/combat";
import { dungeonGuardianResolutionCommandId, isValidCampaignDungeonLair } from "../depth/dungeon-lair";
import { isValidCampaignRoadSupper } from "../depth/road-supper";
import type { CombatState, CombatTurnEvent } from "../depth/types";

export interface CombatControlRecap {
  readonly combatId: string;
  readonly heroId: string;
  readonly enemyId: string;
  readonly applicationTurn: number;
  readonly retaliationTurn: number;
  readonly detail: string;
  readonly compactDetail: string;
  readonly sourceEventIds: readonly string[];
}

export interface BoundCombatControlRecap extends CombatControlRecap {
  readonly commandId: string;
  readonly tick: number;
  readonly chronicleId: string;
}

type Intent = Extract<CombatTurnEvent, { kind: "intent" }>;
type Damage = Extract<CombatTurnEvent, { kind: "damage" }>;

function directStrike(combat: CombatState, turn: number): { intent: Intent; damage: Damage } | null {
  const packet = combat.eventStream.events.filter(event => event.turn === turn);
  const intent = packet[0], damage = packet.find((event): event is Damage => event.kind === "damage");
  if (intent?.kind !== "intent" || (intent.action !== "attack" && intent.action !== "ability") || damage === undefined
    || damage.actorId !== intent.actorId || damage.targetId !== intent.targetId || damage.abilityId !== intent.abilityId
    || damage.amount !== damage.healthBefore - damage.healthAfter || damage.healthBefore <= 0) return null;
  return { intent, damage };
}

/** Actual weakening and a later attack while it remains active. This reports
 * applied HP loss, never a hypothetical saving, a decisive mistake or an emotion.
 */
export function projectCombatControlRecap(combat: CombatState, heroId: string): CombatControlRecap | null {
  try {
    if (!isValidCombatState(combat)) return null;
    const hero = combat.combatants.find(actor => actor.id === heroId && actor.side === "heroes");
    if (hero === undefined) return null;
    const events = combat.eventStream.events;
    for (let turn = combat.turn; turn >= combat.eventStream.firstRecordedTurn; turn -= 1) {
      const reply = directStrike(combat, turn);
      if (reply === null || reply.damage.targetId !== heroId) continue;
      const enemy = combat.combatants.find(actor => actor.id === reply.intent.actorId && actor.side === "enemies");
      if (enemy === undefined) continue;
      const tick = events.find(event => event.turn === turn && event.kind === "status-tick"
        && event.actorId === enemy.id && event.targetId === enemy.id && event.status === "weakened" && event.durationAfter > 0);
      if (tick?.kind !== "status-tick") continue;
      // The last application must be the hero's actual technique. An intervening
      // refresh from any actor is not evidence for an earlier source.
      const application = [...events].reverse().find(event => event.turn < turn && event.kind === "status-applied"
        && event.status === "weakened" && event.targetId === enemy.id);
      if (application?.kind !== "status-applied" || application.actorId !== heroId || application.abilityId === null
        || application.potencyBefore !== null || application.durationBefore !== null
        || application.potencyAfter !== tick.potency || application.durationAfter < tick.durationBefore) continue;
      const ability = hero.abilities.find(entry => entry.id === application.abilityId && entry.effect === "weaken");
      const source = directStrike(combat, application.turn);
      if (ability === undefined || source === null || source.intent.action !== "ability"
        || source.intent.actorId !== heroId || source.damage.targetId !== enemy.id
        || source.damage.abilityId !== ability.id || source.damage.healthAfter <= 0) continue;
      let duration = application.durationAfter;
      const statusChain = events.filter(event => event.turn > application.turn && event.turn <= turn
        && (event.kind === "status-tick" || event.kind === "status-expired")
        && event.actorId === enemy.id && event.status === "weakened");
      if (!statusChain.every(event => {
        if (event.kind !== "status-tick" || event.potency !== application.potencyAfter
          || event.durationBefore !== duration || event.durationAfter <= 0) return false;
        duration = event.durationAfter;
        return true;
      }) || statusChain.at(-1)?.id !== tick.id) continue;
      const retaliation = reply.intent.action === "ability"
        ? enemy.abilities.find(entry => entry.id === reply.intent.abilityId) : undefined;
      if (reply.intent.action === "ability" && retaliation === undefined) continue;
      const actionName = retaliation?.name ?? "attack";
      const compact = `${ability.name} → weakened ${actionName} · ${reply.damage.amount} HP lost`;
      return Object.freeze({ combatId: combat.id, heroId, enemyId: enemy.id,
        applicationTurn: application.turn, retaliationTurn: turn,
        detail: `${hero.name}'s ${ability.name} left ${enemy.name} weakened. ${enemy.name}'s ${actionName} dealt ${reply.damage.amount} HP to ${hero.name} (${reply.damage.healthBefore}→${reply.damage.healthAfter} HP).`,
        compactDetail: compact.length <= 110 ? compact : `A weakening technique preceded a weakened attack · ${reply.damage.amount} HP lost`,
        sourceEventIds: Object.freeze([source.intent.id, source.damage.id, application.id,
          reply.intent.id, tick.id, reply.damage.id]) });
    }
    return null;
  } catch { return null; }
}

function sameEntry(left: ChronicleEntry, right: ChronicleEntry): boolean {
  return left.id === right.id && left.tick === right.tick && left.commandId === right.commandId
    && left.commandType === right.commandType && left.mode === right.mode && left.location === right.location
    && left.headline === right.headline && left.action === right.action && left.goal === right.goal
    && left.consequence === right.consequence && left.sensoryIntensity === right.sensoryIntensity;
}

function bind(world: WorldState, entry: ChronicleEntry, combat: CombatState, tick: number, source: string,
  currentLive = false): BoundCombatControlRecap | null {
  if (entry.tick !== tick || entry.commandId !== `${world.campaignId}:${source}`
    || source !== dungeonGuardianResolutionCommandId(combat, tick)
    || !combat.combatants.some(actor => actor.id === world.hero.id && actor.side === "heroes")) return null;
  const recap = projectCombatControlRecap(combat, world.hero.id);
  return recap === null || currentLive && recap.retaliationTurn !== combat.turn ? null
    : Object.freeze({ ...recap, commandId: entry.commandId, tick, chronicleId: entry.id });
}

/** A current live reply or a terminal row with an existing exact source anchor.
 * Untimestamped old fights cannot be joined merely by a reusable combat ID.
 */
export function projectCombatControlEntry(world: WorldState, entry: ChronicleEntry): BoundCombatControlRecap | null {
  try {
    if (world.tick !== world.depth.tick || world.hero.id !== world.depth.hero.id || entry.tick > world.tick
      || entry.id !== `${world.campaignId}:${entry.tick}` || entry.mode !== "battle" || entry.commandType !== "combat-action"
      || !world.chronicle.some(candidate => sameEntry(candidate, entry))) return null;
    if (entry.tick === world.tick) {
      if (!sameEntry(world.chronicle.at(-1)!, entry) || world.depth.counterDuel !== null || world.scene.mode !== "battle"
        || (["location", "headline", "action", "goal", "consequence", "sensoryIntensity"] as const)
          .some(key => world.scene[key] !== entry[key])) return null;
      const live = world.depth.combat;
      const combat = live ?? world.depth.completedCombats.at(-1);
      if (combat === undefined || (live !== null && combat.outcome !== "ongoing")
        || (live === null && combat.outcome === "ongoing")) return null;
      const source = dungeonGuardianResolutionCommandId(combat, entry.tick);
      return source === null ? null : bind(world, entry, combat, entry.tick, source, live !== null);
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

/** Watch only shows the actual current live retaliation, never an earlier turn. */
export function projectCombatControlScene(world: WorldState): BoundCombatControlRecap | null {
  if (world.depth.combat === null || world.depth.combat.outcome !== "ongoing") return null;
  const entry = world.chronicle.at(-1);
  return entry === undefined || entry.tick !== world.tick ? null : projectCombatControlEntry(world, entry);
}
