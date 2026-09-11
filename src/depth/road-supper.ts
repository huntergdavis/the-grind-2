import { randomInt } from "../core/rng";
import { edgeBetween } from "./atlas";
import { isValidCombatState } from "./combat";
import { inventoryCapacity } from "./rpg";
import { isCanonicalRoadRations, roadRationId } from "./road-rations";
import { needsCriticalRoadsideRecovery, unresolvedRouteEncounterId } from "./roadside-rest";
import { isValidEncounterThreatProvenance } from "./threat";
import { selectPaidInnRest } from "./town-rest";
import type { AtlasState, CombatState, DepthCommand, DepthState, RoutePlan } from "./types";

export interface RoadRationPurchasePlan {
  readonly heroId: string;
  readonly locationId: string;
  readonly townId: string;
  readonly townName: string;
  readonly marketId: string;
  readonly marketName: string;
  readonly itemId: string;
  readonly itemName: "Road Rations";
  readonly quantityBefore: 0;
  readonly quantityBought: 2;
  readonly quantityAfter: 2;
  readonly unitPrice: 1;
  readonly goldBefore: number;
  readonly goldSpent: 2;
  readonly goldAfter: number;
}
export interface RoadRationPurchaseReceipt extends RoadRationPurchasePlan {
  readonly tick: number;
  readonly sourceCommandId: string;
}
export interface RoadSupperMealPlan {
  readonly heroId: string;
  readonly itemId: string;
  readonly itemName: "Road Rations";
  readonly locationId: string;
  readonly route: RoutePlan;
  readonly encounterId: string;
  readonly enemyCount: number;
  readonly quantityBefore: 2;
  readonly quantityUsed: 2;
  readonly quantityAfter: 0;
  readonly line: string;
}
export interface RoadSupperMealReceipt extends RoadSupperMealPlan {
  readonly tick: number;
  readonly sourceCommandId: string;
}
export interface RoadSupperState {
  readonly schemaVersion: 1;
  readonly rulesVersion: "road-supper-v1";
  readonly purchase: RoadRationPurchaseReceipt;
  readonly meal: RoadSupperMealReceipt | null;
  readonly assignment: { readonly combatId: string; readonly tick: number; readonly sourceCommandId: string } | null;
  readonly terminal: { readonly tick: number; readonly sourceCommandId: string; readonly combat: CombatState } | null;
}
type SupperCommand = Extract<DepthCommand, { type: "buy-road-rations" | "prepare-road-supper" }>;
const purchaseKeys = ["heroId", "locationId", "townId", "townName", "marketId", "marketName", "itemId", "itemName", "quantityBefore",
  "quantityBought", "quantityAfter", "unitPrice", "goldBefore", "goldSpent", "goldAfter", "tick", "sourceCommandId"];
const mealKeys = ["heroId", "itemId", "itemName", "locationId", "route", "encounterId", "enemyCount", "quantityBefore", "quantityUsed",
  "quantityAfter", "line", "tick", "sourceCommandId"];
const supperLine = "Two rations, one pot. A feast, provided nobody asks the pot.";
function integer(value: unknown, minimum = 0): value is number { return Number.isSafeInteger(value) && (value as number) >= minimum; }
function keys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}
function same(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left)) return Array.isArray(right) && left.length === right.length && left.every((entry, index) => same(entry, right[index]));
  return right !== null && typeof right === "object" && !Array.isArray(right) && keys(left, Object.keys(right))
    && Object.entries(right).every(([key, value]) => same(left[key], value));
}
function quietSolo(state: DepthState): boolean {
  return state.hero.resources.health > 0 && state.hero.resources.health * 2 > state.hero.resources.maxHealth
    && state.companions.active.length === 0 && state.combat === null && state.counterDuel === null
    && (state.dungeon === null || state.dungeon.completed) && state.repartee.active === null
    && (state.bellExpedition === null || state.bellExpedition.completion !== null)
    && (state.usefulReply === null || state.usefulReply.reply !== null)
    && (state.roomChallenge === null || state.roomChallenge.result !== null)
    && (state.companionReunion === null || state.companionReunion.completed !== null)
    && (state.companionCredit == null || state.companionCredit.exchange !== null)
    && (state.pennywiseGate == null || state.pennywiseGate.completion !== null)
    && (state.smithyJob == null || state.smithyJob.completion !== null)
    && (state.innBluff == null || state.innBluff.resolution !== null)
    && state.quest.status === "active" && state.pendingQuestReward === null;
}
function laterMarket(state: DepthState, locationId: string, marketId: string): Omit<RoadRationPurchasePlan,
  "heroId" | "itemId" | "itemName" | "quantityBefore" | "quantityBought" | "quantityAfter" | "unitPrice" | "goldBefore" | "goldSpent" | "goldAfter"> | null {
  const town = state.towns[locationId], market = town?.buildings.find((building) => building.id === marketId && building.kind === "market");
  const visited = Object.values(state.towns).filter((candidate) => integer(candidate.visits, 1)
    && state.atlas.discoveredLocationIds.includes(candidate.locationId)
    && state.atlas.locations.some((location) => location.id === candidate.locationId && location.kind === "town"));
  if (visited.length < 2 || town === undefined || town.locationId !== locationId || !integer(town.visits, 1)
    || !state.atlas.discoveredLocationIds.includes(locationId)
    || !state.atlas.locations.some((location) => location.id === locationId && location.kind === "town")
    || market === undefined || !town.districts.some((district) => district.id === market.districtId && district.buildingIds.includes(market.id))) return null;
  return { locationId, townId: town.id, townName: town.name, marketId: market.id, marketName: market.name };
}
function validRoute(atlas: AtlasState, value: unknown): value is RoutePlan {
  if (!keys(value, ["destinationId", "path", "legIndex", "legProgress", "distanceTravelled", "totalDistance"])
    || !Array.isArray(value.path) || value.path.length < 2 || value.path.length > atlas.locations.length
    || new Set(value.path).size !== value.path.length || !value.path.every((id) => typeof id === "string"
      && atlas.locations.some((location) => location.id === id)) || value.path.at(-1) !== value.destinationId
    || !integer(value.legIndex) || value.legIndex >= value.path.length - 1 || !integer(value.legProgress)
    || !integer(value.distanceTravelled) || !integer(value.totalDistance, 1)) return false;
  const path = value.path as string[], edges = path.slice(1).map((to, index) => edgeBetween(atlas, path[index]!, to));
  return value.totalDistance === edges.reduce((sum, edge) => sum + edge.distance, 0)
    && value.legProgress < edges[value.legIndex]!.distance
    && value.distanceTravelled === edges.slice(0, value.legIndex).reduce((sum, edge) => sum + edge.distance, 0) + value.legProgress;
}
function tactical(seed: string, encounterId: string, enemyCount: number): boolean {
  return randomInt(4, seed, "depth-director", encounterId, 0, "encounter-engine") !== 0
    && enemyCount === 1 + randomInt(2, seed, "depth-director", encounterId, 0, "enemy-count");
}
function ownedFood(state: DepthState) {
  return state.hero.inventory.filter((item) => item.id === roadRationId(state.hero.id) || Object.hasOwn(item, "food"));
}
export function roadSupperCommandId(tick: number, command: SupperCommand): string {
  return command.type === "buy-road-rations" ? `depth:${tick}:road-rations:${command.marketId}`
    : `depth:${tick}:road-supper:${command.encounterId}`;
}
export function selectRoadRationPurchase(state: DepthState): RoadRationPurchasePlan | null {
  if (Object.hasOwn(state, "roadSupper") || !quietSolo(state) || state.atlas.route !== null
    || !integer(state.hero.gold, 2) || state.hero.inventory.length >= inventoryCapacity || ownedFood(state).length !== 0
    || selectPaidInnRest(state) !== null || state.discoveries.at(-1)?.tick === state.tick
    || state.tick > 0 && state.tick % 29 === 0 && state.hero.abilities.length > 0) return null;
  const town = state.towns[state.atlas.currentLocationId];
  const market = town?.buildings.filter((building) => building.kind === "market")
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .map((building) => laterMarket(state, state.atlas.currentLocationId, building.id)).find((venue) => venue !== null);
  if (market === undefined) return null;
  return { ...market, heroId: state.hero.id, itemId: roadRationId(state.hero.id), itemName: "Road Rations",
    quantityBefore: 0, quantityBought: 2, quantityAfter: 2, unitPrice: 1, goldBefore: state.hero.gold, goldSpent: 2, goldAfter: state.hero.gold - 2 };
}
export function selectRoadSupperCamp(state: DepthState, encounterId: string, enemyCount: number): RoadSupperMealPlan | null {
  try {
    if (state.roadSupper === undefined || state.roadSupper.meal !== null || !quietSolo(state)
      || !isValidCampaignRoadSupper(state) || needsCriticalRoadsideRecovery(state) || state.atlas.route === null
      || !validRoute(state.atlas, state.atlas.route) || unresolvedRouteEncounterId(state) !== encounterId
      || !tactical(state.seed, encounterId, enemyCount) || state.discoveries.at(-1)?.tick === state.tick
      || state.tick > 0 && state.tick % 29 === 0 && state.hero.abilities.length > 0) return null;
    const food = ownedFood(state);
    if (food.length !== 1 || !isCanonicalRoadRations(food[0], state.hero.id) || food[0].quantity !== 2) return null;
    return { heroId: state.hero.id, itemId: roadRationId(state.hero.id), itemName: "Road Rations", locationId: state.atlas.currentLocationId,
      route: { ...state.atlas.route, path: [...state.atlas.route.path] }, encounterId, enemyCount,
      quantityBefore: 2, quantityUsed: 2, quantityAfter: 0, line: supperLine };
  } catch { return null; }
}
function terminalCommandId(combat: CombatState, tick: number): string | null {
  const intent = combat.eventStream.events.find((event) => event.turn === combat.turn && event.kind === "intent");
  if (intent?.kind !== "intent") return null;
  const detail = intent.action === "joint-action" ? intent.jointActionId : intent.action === "companion-action" ? intent.companionActionId
    : intent.abilityId ?? intent.itemId ?? "basic";
  return `depth:${tick}:combat:${combat.id}:${combat.turn - 1}:${intent.actorId}:${intent.action}:${detail}:${intent.targetId ?? "self"}`;
}
function matchesMealBattle(state: DepthState, meal: RoadSupperMealReceipt, combat: CombatState): boolean {
  const preparation = combat.supper, threat = combat.threat;
  const from = meal.route.path[meal.route.legIndex]!, to = meal.route.path[meal.route.legIndex + 1]!;
  return combat.id === meal.encounterId && combat.combatants.filter((unit) => unit.side === "heroes").length === 1
    && combat.combatants.some((unit) => unit.id === meal.heroId && unit.side === "heroes")
    && combat.combatants.filter((unit) => unit.side === "enemies").length === meal.enemyCount
    && preparation !== undefined && preparation.heroId === meal.heroId && preparation.mealTick === meal.tick
    && preparation.mealSourceCommandId === meal.sourceCommandId && isValidCombatState(combat)
    && threat.rating === "place-bound" && threat.edgeId === edgeBetween(state.atlas, from, to).id
    && threat.fromLocationId === from && threat.destinationLocationId === to && isValidEncounterThreatProvenance(threat, state.atlas);
}
export function isValidCampaignRoadSupper(state: DepthState): boolean {
  try {
    const food = ownedFood(state);
    const preparedHistory = state.completedCombats.filter((combat) => Object.hasOwn(combat, "supper"));
    if (!Object.hasOwn(state, "roadSupper")) return food.length === 0 && state.combat?.supper === undefined && preparedHistory.length === 0;
    const value: unknown = state.roadSupper;
    if (!keys(value, ["schemaVersion", "rulesVersion", "purchase", "meal", "assignment", "terminal"])
      || value.schemaVersion !== 1 || value.rulesVersion !== "road-supper-v1" || !keys(value.purchase, purchaseKeys)) return false;
    const supper = value as unknown as RoadSupperState, purchase = supper.purchase;
    if (!integer(purchase.tick, 1) || purchase.tick > state.tick || purchase.heroId !== state.hero.id
      || purchase.itemId !== roadRationId(state.hero.id) || purchase.itemName !== "Road Rations"
      || purchase.quantityBefore !== 0 || purchase.quantityBought !== 2 || purchase.quantityAfter !== 2 || purchase.unitPrice !== 1
      || !integer(purchase.goldBefore, 2) || purchase.goldSpent !== 2 || purchase.goldAfter !== purchase.goldBefore - 2
      || purchase.sourceCommandId !== roadSupperCommandId(purchase.tick, { type: "buy-road-rations", marketId: purchase.marketId })) return false;
    const venue = laterMarket(state, purchase.locationId, purchase.marketId);
    if (venue === null || !Object.entries(venue).every(([key, value]) => purchase[key as keyof RoadRationPurchasePlan] === value)) return false;
    if (purchase.tick === state.tick && (!quietSolo(state) || state.atlas.route !== null
      || state.atlas.currentLocationId !== purchase.locationId || state.hero.gold !== purchase.goldAfter)) return false;
    const meal = supper.meal;
    if (meal === null) return supper.assignment === null && supper.terminal === null && state.combat?.supper === undefined && preparedHistory.length === 0
      && food.length === 1 && isCanonicalRoadRations(food[0], state.hero.id) && food[0].quantity === 2;
    if (!keys(meal, mealKeys) || !integer(meal.tick, purchase.tick + 1) || meal.tick > state.tick || meal.heroId !== state.hero.id
      || meal.itemId !== purchase.itemId || meal.itemName !== purchase.itemName || meal.quantityBefore !== 2 || meal.quantityUsed !== 2
      || meal.quantityAfter !== 0 || meal.line !== supperLine || food.length !== 0 || !validRoute(state.atlas, meal.route)
      || meal.route.path[meal.route.legIndex] !== meal.locationId || !state.atlas.discoveredLocationIds.includes(meal.locationId)
      || meal.encounterId !== `encounter:route:${meal.route.path.join(">")}` || !tactical(state.seed, meal.encounterId, meal.enemyCount)
      || meal.sourceCommandId !== roadSupperCommandId(meal.tick, { type: "prepare-road-supper", encounterId: meal.encounterId })) return false;
    const assignment = supper.assignment;
    if (assignment === null) return supper.terminal === null && preparedHistory.length === 0 && state.tick === meal.tick && quietSolo(state)
      && same(state.atlas.route, meal.route) && state.atlas.currentLocationId === meal.locationId
      && unresolvedRouteEncounterId(state) === meal.encounterId;
    if (!keys(assignment, ["combatId", "tick", "sourceCommandId"]) || assignment.combatId !== meal.encounterId
      || assignment.tick !== meal.tick + 1 || assignment.tick > state.tick
      || assignment.sourceCommandId !== `depth:${assignment.tick}:${meal.encounterId}:${meal.enemyCount}`) return false;
    const terminal = supper.terminal;
    if (terminal === null) return preparedHistory.length === 0 && state.combat !== null && state.combat.outcome === "ongoing" && matchesMealBattle(state, meal, state.combat)
      && state.tick === assignment.tick + state.combat.turn && state.companions.active.length === 0
      && state.atlas.currentLocationId === meal.locationId && same(state.atlas.route, meal.route);
    if (!keys(terminal, ["tick", "sourceCommandId", "combat"]) || !integer(terminal.tick, assignment.tick + 1)
      || terminal.tick > state.tick || terminal.combat.outcome === "ongoing" || !matchesMealBattle(state, meal, terminal.combat)
      || terminal.tick !== assignment.tick + terminal.combat.turn || terminal.sourceCommandId !== terminalCommandId(terminal.combat, terminal.tick)
      || state.combat?.supper !== undefined) return false;
    // Reused route IDs are not the same prepared battle. Its meal source is
    // the exact capture identity; keep the finite archive after normal pruning.
    if (preparedHistory.some((combat) => combat.id !== terminal.combat.id
      || combat.supper?.mealSourceCommandId !== meal.sourceCommandId || !same(combat, terminal.combat))) return false;
    if (terminal.tick !== state.tick) return true;
    const hero = terminal.combat.combatants.find((unit) => unit.id === state.hero.id)!;
    return state.combat === null && same(state.atlas.route, meal.route) && state.atlas.currentLocationId === meal.locationId
      && state.hero.resources.health === hero.health && state.hero.resources.mana === hero.mana;
  } catch { return false; }
}
export function recordRoadRationPurchase(before: DepthState, sourceCommandId: string): RoadSupperState {
  const plan = selectRoadRationPurchase(before), tick = before.tick + 1;
  if (plan === null || sourceCommandId !== roadSupperCommandId(tick, { type: "buy-road-rations", marketId: plan.marketId })) {
    throw new Error("No matching later-market ration purchase");
  }
  return { schemaVersion: 1, rulesVersion: "road-supper-v1", purchase: { ...plan, tick, sourceCommandId }, meal: null, assignment: null, terminal: null };
}
export function recordRoadSupperMeal(before: DepthState, encounterId: string, enemyCount: number, sourceCommandId: string): RoadSupperState {
  const plan = selectRoadSupperCamp(before, encounterId, enemyCount), tick = before.tick + 1;
  if (plan === null || sourceCommandId !== roadSupperCommandId(tick, { type: "prepare-road-supper", encounterId })) throw new Error("No matching owned road supper");
  return { ...before.roadSupper!, meal: { ...plan, tick, sourceCommandId } };
}
export function recordRoadSupperAssignment(before: DepthState, combat: CombatState, sourceCommandId: string): RoadSupperState {
  const supper = before.roadSupper, meal = supper?.meal, tick = before.tick + 1;
  if (supper === undefined || meal == null || supper.assignment !== null || !isValidCampaignRoadSupper(before)
    || combat.turn !== 0 || combat.outcome !== "ongoing" || !matchesMealBattle(before, meal, combat)
    || sourceCommandId !== `depth:${tick}:${meal.encounterId}:${meal.enemyCount}`) throw new Error("No matching prepared tactical battle");
  return { ...supper, assignment: { combatId: combat.id, tick, sourceCommandId } };
}
export function recordRoadSupperTerminal(before: DepthState, combat: CombatState, sourceCommandId: string): RoadSupperState {
  const supper = before.roadSupper, meal = supper?.meal, tick = before.tick + 1;
  if (supper === undefined || meal == null || supper.assignment === null || supper.terminal !== null
    || before.combat?.supper?.mealSourceCommandId !== meal.sourceCommandId || combat.turn !== before.combat.turn + 1
    || combat.outcome === "ongoing" || !matchesMealBattle(before, meal, combat)
    || sourceCommandId !== terminalCommandId(combat, tick)) throw new Error("No matching terminal prepared battle");
  return { ...supper, terminal: { tick, sourceCommandId, combat } };
}
