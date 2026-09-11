import { randomInt } from "../core/rng";
import { isValidCombatState, monsterDefinitions } from "./combat";
import { selectDungeonFieldMedicine } from "./dungeon-field-medicine";
import { isDungeonThreatLocation, isValidEncounterThreatProvenance, type DungeonEncounterThreatContext } from "./threat";
import type { CombatState, DepthCommand, DepthState, DungeonState, MazeDirection } from "./types";

export interface DungeonLairEncounter {
  readonly dungeonId: string;
  readonly locationId: string;
  readonly cellId: string;
  readonly heroId: string;
  readonly combatId: string;
  readonly guardian: { readonly id: string; readonly name: string; readonly speciesId: string };
  readonly arrival: { readonly tick: number; readonly sourceCommandId: string; readonly fromCellId: string;
    readonly direction: MazeDirection; readonly turn: number };
  readonly started: { readonly tick: number; readonly sourceCommandId: string } | null;
  readonly resolution: { readonly tick: number; readonly sourceCommandId: string;
    readonly outcome: "victory" | "defeat" | "stalemate"; readonly combat: CombatState } | null;
}
export interface DungeonLairState {
  readonly schemaVersion: 1;
  readonly rulesVersion: "occupied-lair-v1";
  readonly encounter: DungeonLairEncounter | null;
}
type GuardianCommand = Extract<DepthCommand, { type: "start-dungeon-guardian" }>;
export interface DungeonLairSelection extends Omit<GuardianCommand, "type"> {
  readonly enemyCount: 1;
  readonly sourceCommandId: string;
  readonly threatContext: DungeonEncounterThreatContext;
}
const directions: Record<MazeDirection, readonly [number, number]> = {
  north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0],
};
const encounterKeys = ["dungeonId", "locationId", "cellId", "heroId", "combatId", "guardian", "arrival", "started", "resolution"];
function keys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}
function integer(value: unknown, minimum = 0): value is number { return Number.isSafeInteger(value) && (value as number) >= minimum; }
function identifier(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 700; }
function same(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left)) return Array.isArray(right) && left.length === right.length && left.every((entry, index) => same(entry, right[index]));
  return right !== null && typeof right === "object" && !Array.isArray(right) && keys(left, Object.keys(right))
    && Object.entries(right).every(([key, value]) => same(left[key], value));
}
export function createDungeonLairState(): DungeonLairState {
  return { schemaVersion: 1, rulesVersion: "occupied-lair-v1", encounter: null };
}
export function dungeonGuardianCommandId(tick: number, command: GuardianCommand): string {
  return `depth:${tick}:dungeon:${command.dungeonId}:guardian:${command.cellId}:${command.encounterId}`;
}
/** Reconstruct the canonical source from the retained final real action, never prose. */
export function dungeonGuardianResolutionCommandId(combat: CombatState, tick: number): string | null {
  const intent = combat.eventStream.events.find((event) => event.turn === combat.turn && event.kind === "intent");
  if (intent?.kind !== "intent") return null;
  const detail = intent.action === "joint-action" ? intent.jointActionId : intent.action === "companion-action" ? intent.companionActionId
    : intent.abilityId ?? intent.itemId ?? "basic";
  return `depth:${tick}:combat:${combat.id}:${combat.turn - 1}:${intent.actorId}:${intent.action}:${detail}:${intent.targetId ?? "self"}`;
}
function combatId(dungeonId: string, cellId: string, tick: number): string {
  return `encounter:lair:${dungeonId}:${cellId}:${tick}`;
}
function guardian(seed: string, encounterId: string): DungeonLairEncounter["guardian"] {
  const id = `${encounterId}:enemy:0`;
  const definition = monsterDefinitions[randomInt(monsterDefinitions.length, seed, "combat", id, 0, "species")]!;
  return { id, name: `${definition.name} 1`, speciesId: definition.id };
}
function quietDungeon(state: DepthState): boolean {
  return state.dungeon !== null && !state.dungeon.completed && state.hero.resources.health > 0
    && state.companions.active.length === 0 && state.atlas.route === null && state.combat === null && state.counterDuel === null
    && state.quest.status === "active" && state.pendingQuestReward === null && state.repartee.active === null
    && (state.bellExpedition === null || state.bellExpedition.completion !== null)
    && (state.usefulReply === null || state.usefulReply.reply !== null)
    && (state.roomChallenge === null || state.roomChallenge.result !== null);
}
function actualLocation(state: DepthState, encounter: Pick<DungeonLairEncounter, "dungeonId" | "locationId">): boolean {
  return isDungeonThreatLocation(encounter.dungeonId, encounter.locationId)
    && state.atlas.discoveredLocationIds.includes(encounter.locationId)
    && state.atlas.locations.some((location) => location.id === encounter.locationId && location.kind === "dungeon");
}
export function projectDungeonGuardianThreatContext(state: DepthState): DungeonEncounterThreatContext {
  const encounter = state.dungeon?.lair?.encounter;
  if (encounter === null || encounter === undefined || !actualLocation(state, encounter)) throw new Error("No real revealed dungeon guardian");
  return { kind: "dungeon", dungeonId: encounter.dungeonId, cellId: encounter.cellId, locationId: encounter.locationId,
    placeDanger: state.atlas.locations.find((location) => location.id === encounter.locationId)!.danger };
}

/** New arrival only; an absent old-save field is never retroactively enabled. */
export function revealDungeonLair(before: DepthState, after: DepthState, sourceCommandId: string): DungeonState | null {
  const dungeon = after.dungeon, prior = before.dungeon;
  if (dungeon?.lair?.encounter !== null || prior === null || dungeon === null || prior.id !== dungeon.id
    || !quietDungeon(after) || selectDungeonFieldMedicine(after) !== null || after.tick !== before.tick + 1
    || dungeon.turns !== prior.turns + 1 || prior.visitedCellIds.includes(dungeon.currentCellId)
    || !dungeon.visitedCellIds.includes(dungeon.currentCellId)) return dungeon;
  const from = dungeon.cells.find((cell) => cell.id === prior.currentCellId);
  const cell = dungeon.cells.find((entry) => entry.id === dungeon.currentCellId);
  if (from === undefined || cell?.feature !== "lair" || dungeon.currentCellId === dungeon.exitCellId) return dungeon;
  const direction = (Object.keys(directions) as MazeDirection[]).find((entry) => {
    const [dx, dy] = directions[entry];
    return from.x + dx === cell.x && from.y + dy === cell.y;
  });
  if (direction === undefined || sourceCommandId !== `depth:${after.tick}:dungeon:${dungeon.id}:${direction}`
    || !actualLocation(after, { dungeonId: dungeon.id, locationId: after.atlas.currentLocationId })) return dungeon;
  const id = combatId(dungeon.id, cell.id, after.tick);
  return { ...dungeon, lair: { schemaVersion: 1, rulesVersion: "occupied-lair-v1", encounter: {
    dungeonId: dungeon.id, locationId: after.atlas.currentLocationId, cellId: cell.id, heroId: after.hero.id,
    combatId: id, guardian: guardian(after.seed, id), arrival: { tick: after.tick, sourceCommandId,
      fromCellId: from.id, direction, turn: dungeon.turns }, started: null, resolution: null } } };
}

export function isValidDungeonLair(dungeon: DungeonState, currentTick = Number.MAX_SAFE_INTEGER): boolean {
  try {
    if (!Object.hasOwn(dungeon, "lair")) return true;
    const value: unknown = dungeon.lair;
    if (!keys(value, ["schemaVersion", "rulesVersion", "encounter"]) || value.schemaVersion !== 1
      || value.rulesVersion !== "occupied-lair-v1") return false;
    if (value.encounter === null) return true;
    const raw = value.encounter;
    if (!keys(raw, encounterKeys) || ![raw.dungeonId, raw.locationId, raw.cellId, raw.heroId, raw.combatId].every(identifier)
      || !keys(raw.guardian, ["id", "name", "speciesId"]) || !Object.values(raw.guardian).every(identifier)
      || !keys(raw.arrival, ["tick", "sourceCommandId", "fromCellId", "direction", "turn"])
      || !integer(raw.arrival.tick, 1) || raw.arrival.tick > currentTick || !integer(raw.arrival.turn, 1)
      || typeof raw.arrival.direction !== "string" || !Object.hasOwn(directions, raw.arrival.direction)) return false;
    const encounter = raw as unknown as DungeonLairEncounter, arrival = encounter.arrival;
    const from = dungeon.cells.find((cell) => cell.id === arrival.fromCellId), cell = dungeon.cells.find((entry) => entry.id === encounter.cellId);
    const [dx, dy] = directions[arrival.direction];
    const secret = dungeon.secretPassage?.opened !== null && dungeon.secretPassage?.opened !== undefined
      ? dungeon.secretPassage.clue : null;
    const passage = from?.exits.includes(arrival.direction) || secret !== null
      && ((secret.fromCellId === from?.id && secret.toCellId === cell?.id) || (secret.toCellId === from?.id && secret.fromCellId === cell?.id));
    if (encounter.dungeonId !== dungeon.id || !isDungeonThreatLocation(encounter.dungeonId, encounter.locationId)
      || from === undefined || cell?.feature !== "lair" || from.x + dx !== cell.x || from.y + dy !== cell.y || !passage
      || !dungeon.visitedCellIds.includes(cell.id) || !dungeon.visitedCellIds.includes(from.id) || arrival.turn > dungeon.turns
      || encounter.combatId !== combatId(dungeon.id, cell.id, arrival.tick)
      || arrival.sourceCommandId !== `depth:${arrival.tick}:dungeon:${dungeon.id}:${arrival.direction}`
      || encounter.guardian.id !== `${encounter.combatId}:enemy:0`
      || !monsterDefinitions.some((definition) => definition.id === encounter.guardian.speciesId && `${definition.name} 1` === encounter.guardian.name)) return false;
    if (encounter.started === null) return encounter.resolution === null;
    const started = encounter.started;
    if (!keys(started, ["tick", "sourceCommandId"]) || started.tick !== arrival.tick + 1 || started.tick > currentTick
      || started.sourceCommandId !== dungeonGuardianCommandId(started.tick, { type: "start-dungeon-guardian", dungeonId: dungeon.id,
        cellId: cell.id, encounterId: encounter.combatId })) return false;
    if (encounter.resolution === null) return true;
    const resolution = encounter.resolution;
    if (!keys(resolution, ["tick", "sourceCommandId", "outcome", "combat"]) || !integer(resolution.tick, started.tick + 1)
      || resolution.tick > currentTick || !isValidCombatState(resolution.combat) || resolution.combat.outcome === "ongoing"
      || resolution.outcome !== resolution.combat.outcome || resolution.tick !== started.tick + resolution.combat.turn
      || resolution.sourceCommandId !== dungeonGuardianResolutionCommandId(resolution.combat, resolution.tick)) return false;
    return matchesBattle(encounter, resolution.combat);
  } catch { return false; }
}
function matchesBattle(encounter: DungeonLairEncounter, combat: CombatState): boolean {
  const hero = combat.combatants.find((unit) => unit.id === encounter.heroId), enemy = combat.combatants.find((unit) => unit.id === encounter.guardian.id);
  return combat.id === encounter.combatId && combat.combatants.length === 2 && hero?.side === "heroes" && enemy?.side === "enemies"
    && enemy.name === encounter.guardian.name && enemy.speciesId === encounter.guardian.speciesId
    && combat.threat.rating === "dungeon-bound" && combat.threat.dungeonId === encounter.dungeonId
    && combat.threat.cellId === encounter.cellId && combat.threat.locationId === encounter.locationId;
}
export function isValidCampaignDungeonLair(state: DepthState): boolean {
  try {
    const dungeon = state.dungeon;
    if (dungeon === null) return state.combat?.threat.rating !== "dungeon-bound";
    if (!isValidDungeonLair(dungeon, state.tick)) return false;
    const encounter = dungeon.lair?.encounter;
    if (encounter === undefined || encounter === null) return state.combat?.threat.rating !== "dungeon-bound";
    if (encounter.heroId !== state.hero.id || !actualLocation(state, encounter)
      || !same(encounter.guardian, guardian(state.seed, encounter.combatId))) return false;
    if (encounter.started === null) return quietDungeon(state) && state.tick === encounter.arrival.tick
      && dungeon.currentCellId === encounter.cellId && state.atlas.currentLocationId === encounter.locationId;
    if (encounter.resolution === null) return state.combat !== null && matchesBattle(encounter, state.combat)
      && isValidEncounterThreatProvenance(state.combat.threat, state.atlas) && state.combat.outcome === "ongoing"
      && state.tick === encounter.started.tick + state.combat.turn && !dungeon.completed && dungeon.currentCellId === encounter.cellId
      && state.atlas.currentLocationId === encounter.locationId && state.atlas.route === null && state.companions.active.length === 0;
    if (!isValidEncounterThreatProvenance(encounter.resolution.combat.threat, state.atlas)) return false;
    const retained = state.completedCombats.find((combat) => combat.id === encounter.combatId);
    if (retained !== undefined && !same(retained, encounter.resolution.combat)) return false;
    if (state.combat?.threat.rating === "dungeon-bound") return false;
    if (encounter.resolution.tick !== state.tick) return true;
    const hero = encounter.resolution.combat.combatants.find((unit) => unit.id === encounter.heroId)!;
    return state.combat === null && dungeon.currentCellId === encounter.cellId && state.atlas.currentLocationId === encounter.locationId
      && state.hero.resources.health === hero.health && state.hero.resources.mana === hero.mana;
  } catch { return false; }
}
export function selectDungeonLairEncounter(state: DepthState): DungeonLairSelection | null {
  const encounter = state.dungeon?.lair?.encounter;
  if (encounter === undefined || encounter === null || encounter.started !== null || !quietDungeon(state)
    || selectDungeonFieldMedicine(state) !== null || !isValidCampaignDungeonLair(state)) return null;
  const command: GuardianCommand = { type: "start-dungeon-guardian", dungeonId: encounter.dungeonId, cellId: encounter.cellId, encounterId: encounter.combatId };
  return { dungeonId: command.dungeonId, cellId: command.cellId, encounterId: command.encounterId, enemyCount: 1,
    sourceCommandId: dungeonGuardianCommandId(state.tick + 1, command), threatContext: projectDungeonGuardianThreatContext(state) };
}
export function recordDungeonLairStart(before: DepthState, combat: CombatState, sourceCommandId: string): DungeonState {
  const selection = selectDungeonLairEncounter(before), dungeon = before.dungeon, encounter = dungeon?.lair?.encounter;
  if (selection === null || dungeon === null || encounter === undefined || encounter === null || selection.sourceCommandId !== sourceCommandId
    || combat.turn !== 0 || combat.outcome !== "ongoing" || !isValidCombatState(combat) || !matchesBattle(encounter, combat)
    || !isValidEncounterThreatProvenance(combat.threat, before.atlas)) throw new Error("No matching revealed dungeon guardian");
  return { ...dungeon, lair: { ...dungeon.lair!, encounter: { ...encounter, started: { tick: before.tick + 1, sourceCommandId } } } };
}
export function recordDungeonLairOutcome(before: DepthState, combat: CombatState, sourceCommandId: string): DungeonState {
  const dungeon = before.dungeon, encounter = dungeon?.lair?.encounter;
  if (dungeon === null || encounter === undefined || encounter === null || encounter.started === null || encounter.resolution !== null
    || before.combat?.id !== encounter.combatId || combat.turn !== before.combat.turn + 1 || combat.outcome === "ongoing"
    || !isValidCombatState(combat) || !matchesBattle(encounter, combat)
    || sourceCommandId !== dungeonGuardianResolutionCommandId(combat, before.tick + 1)) throw new Error("No matching terminal dungeon guardian battle");
  return { ...dungeon, lair: { ...dungeon.lair!, encounter: { ...encounter, resolution: { tick: before.tick + 1,
    sourceCommandId, outcome: combat.outcome, combat } } } };
}
