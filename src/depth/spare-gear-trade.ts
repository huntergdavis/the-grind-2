import { createHero, generateLoot, isValidItemState } from "./rpg";
import { selectPaidInnRest } from "./town-rest";
import type { DepthCommand, DepthState, ItemModifier, ItemState } from "./types";

export interface SpareGearTrade {
  readonly schemaVersion: 1;
  readonly rulesVersion: "spare-gear-trade-v1";
  readonly heroId: string;
  readonly locationId: string;
  readonly townId: string;
  readonly townName: string;
  readonly marketId: string;
  readonly marketName: string;
  readonly soldItem: ItemState;
  readonly keptWeapon: ItemState;
  readonly quantityBefore: 1;
  readonly quantitySold: 1;
  readonly quantityAfter: 0;
  readonly goldBefore: number;
  readonly goldEarned: 1;
  readonly goldAfter: number;
  readonly tick: number;
  readonly sourceCommandId: string;
}
type TradeCommand = Extract<DepthCommand, { type: "sell-spare-gear" }>;
const receiptKeys = ["schemaVersion", "rulesVersion", "heroId", "locationId", "townId", "townName", "marketId", "marketName",
  "soldItem", "keptWeapon", "quantityBefore", "quantitySold", "quantityAfter", "goldBefore", "goldEarned", "goldAfter", "tick", "sourceCommandId"];
function integer(value: unknown, minimum = 0): value is number { return Number.isSafeInteger(value) && (value as number) >= minimum; }
function keys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}
function same(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left)) return Array.isArray(right) && left.length === right.length && left.every((value, index) => same(value, right[index]));
  return right !== null && typeof right === "object" && !Array.isArray(right) && keys(left, Object.keys(right))
    && Object.entries(right).every(([key, value]) => same(left[key], value));
}
function quietTown(state: DepthState): boolean {
  return state.hero.resources.health > 0 && state.hero.resources.health * 2 > state.hero.resources.maxHealth
    && state.companions.active.length === 0 && state.atlas.route === null && state.combat === null && state.counterDuel === null
    && (state.dungeon === null || state.dungeon.completed) && state.repartee.active === null
    && (state.bellExpedition === null || state.bellExpedition.completion !== null)
    && (state.usefulReply === null || state.usefulReply.reply !== null)
    && (state.roomChallenge === null || state.roomChallenge.result !== null)
    && (state.companionReunion === null || state.companionReunion.completed !== null)
    && (state.companionCredit == null || state.companionCredit.exchange !== null)
    && (state.pennywiseGate == null || state.pennywiseGate.completion !== null)
    && (state.smithyJob == null || state.smithyJob.completion !== null)
    && (state.innBluff == null || state.innBluff.resolution !== null)
    && state.roadSupper !== undefined && (state.roadSupper.meal === null || state.roadSupper.terminal !== null)
    && state.quest.status === "active" && state.pendingQuestReward === null;
}
function venue(state: DepthState, locationId: string, marketId: string) {
  const town = state.towns[locationId], market = town?.buildings.find(building => building.id === marketId && building.kind === "market");
  const visited = Object.values(state.towns).filter(entry => entry.visits > 0 && state.atlas.discoveredLocationIds.includes(entry.locationId)
    && state.atlas.locations.some(location => location.id === entry.locationId && location.kind === "town"));
  if (visited.length < 2 || town === undefined || town.locationId !== locationId || town.visits < 1 || market === undefined
    || !state.atlas.discoveredLocationIds.includes(locationId)
    || !state.atlas.locations.some(location => location.id === locationId && location.kind === "town")
    || !town.districts.some(district => district.id === market.districtId && district.buildingIds.includes(market.id))) return null;
  return { locationId, townId: town.id, townName: town.name, marketId: market.id, marketName: market.name };
}
/** Original immutable item identity, with the exact recorded mastery left intact. */
function canonicalWeapon(state: DepthState, item: unknown): item is ItemState {
  if (!isValidItemState(item) || item.kind !== "equipment" || item.slot !== "weapon" || item.quantity !== 1 || item.useMastery === null) return false;
  let original: ItemState | undefined;
  if (item.id === `${state.hero.id}:item:roadblade`) original = createHero(state.seed, state.hero.id).inventory[0];
  else if (item.id.startsWith("loot:")) {
    const split = item.id.lastIndexOf(":"), ordinalText = item.id.slice(split + 1), source = item.id.slice(5, split);
    if (source.length === 0 || !/^(0|[1-9]\d*)$/.test(ordinalText) || !integer(Number(ordinalText))) return false;
    original = generateLoot(state.seed, source, Number(ordinalText));
  }
  return original !== undefined && same(item, { ...original, useMastery: item.useMastery });
}
function unused(item: ItemState): boolean {
  return (item.rarity === "common" || item.rarity === "uncommon") && item.useMastery !== null
    && item.useMastery.level === 1 && item.useMastery.experience === 0 && item.useMastery.receipts.length === 0;
}
/** Every printed modifier is at least as good, and one is strictly better. No mixed tradeoff is sold. */
function outclassed(sold: ItemState, kept: ItemState): boolean {
  const modifiers = [...new Set([...Object.keys(sold.modifiers), ...Object.keys(kept.modifiers)])] as ItemModifier[];
  return sold.id !== kept.id && modifiers.every(key => (sold.modifiers[key] ?? 0) <= (kept.modifiers[key] ?? 0))
    && modifiers.some(key => (sold.modifiers[key] ?? 0) < (kept.modifiers[key] ?? 0));
}
function protectedItem(state: DepthState, itemId: string): boolean {
  if (state.pendingQuestReward?.item.id === itemId || state.completedQuests.some(quest =>
    quest.reward.status !== "legacy-no-grant" && quest.reward.grant.item.id === itemId)) return true;
  const battles = [...state.completedCombats, ...(state.combat === null ? [] : [state.combat]),
    state.roadSupper?.terminal?.combat, state.dungeon?.lair?.encounter?.resolution?.combat, state.companionCredit?.evidence.combat];
  return battles.some(combat => combat?.weaponUse.tracking === "tracked" && combat.weaponUse.weaponId === itemId);
}

export function spareGearTradeCommandId(tick: number, command: TradeCommand): string {
  return `depth:${tick}:spare-gear:${command.marketId}:${command.itemId}`;
}

export function selectSpareGearTrade(state: DepthState): SpareGearTrade | null {
  try {
    if (Object.hasOwn(state, "spareGearTrade") || !quietTown(state) || !integer(state.tick) || state.tick >= Number.MAX_SAFE_INTEGER
      || !integer(state.hero.gold) || state.hero.gold >= Number.MAX_SAFE_INTEGER || selectPaidInnRest(state) !== null
      || state.discoveries.at(-1)?.tick === state.tick || state.tick > 0 && state.tick % 29 === 0 && state.hero.abilities.length > 0) return null;
    const keptWeapon = state.hero.inventory.find(item => item.id === state.hero.equipment.weapon);
    if (!canonicalWeapon(state, keptWeapon)) return null;
    const soldItem = state.hero.inventory.filter(item => canonicalWeapon(state, item) && unused(item)
      && !Object.values(state.hero.equipment).includes(item.id) && !protectedItem(state, item.id) && outclassed(item, keptWeapon))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)[0];
    if (soldItem === undefined) return null;
    const market = state.towns[state.atlas.currentLocationId]?.buildings.filter(building => building.kind === "market")
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      .map(building => venue(state, state.atlas.currentLocationId, building.id)).find(entry => entry !== null);
    if (market === undefined) return null;
    const tick = state.tick + 1;
    return { schemaVersion: 1, rulesVersion: "spare-gear-trade-v1", heroId: state.hero.id, ...market,
      soldItem: structuredClone(soldItem), keptWeapon: structuredClone(keptWeapon), quantityBefore: 1, quantitySold: 1, quantityAfter: 0,
      goldBefore: state.hero.gold, goldEarned: 1, goldAfter: state.hero.gold + 1, tick,
      sourceCommandId: spareGearTradeCommandId(tick, { type: "sell-spare-gear", marketId: market.marketId, itemId: soldItem.id }) };
  } catch { return null; }
}

export function isValidCampaignSpareGearTrade(state: DepthState): boolean {
  try {
    if (!Object.hasOwn(state, "spareGearTrade")) return true;
    const value: unknown = state.spareGearTrade;
    if (!keys(value, receiptKeys) || value.schemaVersion !== 1 || value.rulesVersion !== "spare-gear-trade-v1") return false;
    const trade = value as unknown as SpareGearTrade;
    if (trade.heroId !== state.hero.id || !integer(trade.tick, 1) || trade.tick > state.tick
      || state.roadSupper === undefined || state.roadSupper.purchase.tick >= trade.tick
      || !canonicalWeapon(state, trade.soldItem) || !unused(trade.soldItem) || !canonicalWeapon(state, trade.keptWeapon)
      || !outclassed(trade.soldItem, trade.keptWeapon) || trade.keptWeapon.useMastery!.receipts.some(receipt => receipt.resolvedTick >= trade.tick)
      || trade.quantityBefore !== 1 || trade.quantitySold !== 1 || trade.quantityAfter !== 0
      || !integer(trade.goldBefore) || trade.goldEarned !== 1 || !integer(trade.goldAfter, 1) || trade.goldAfter !== trade.goldBefore + 1
      || trade.sourceCommandId !== spareGearTradeCommandId(trade.tick, { type: "sell-spare-gear", marketId: trade.marketId, itemId: trade.soldItem.id })) return false;
    const market = venue(state, trade.locationId, trade.marketId);
    if (market === null || !Object.entries(market).every(([key, value]) => trade[key as keyof SpareGearTrade] === value)) return false;
    if (trade.tick !== state.tick) return true;
    return quietTown(state) && state.atlas.currentLocationId === trade.locationId && state.hero.gold === trade.goldAfter
      && !state.hero.inventory.some(item => item.id === trade.soldItem.id) && !protectedItem(state, trade.soldItem.id)
      && state.hero.equipment.weapon === trade.keptWeapon.id
      && same(state.hero.inventory.find(item => item.id === trade.keptWeapon.id), trade.keptWeapon);
  } catch { return false; }
}

export function stepSpareGearTrade(state: DepthState, command: TradeCommand): { hero: DepthState["hero"]; spareGearTrade: SpareGearTrade } {
  const trade = selectSpareGearTrade(state);
  if (trade === null || command.marketId !== trade.marketId || command.itemId !== trade.soldItem.id) throw new Error("No matching spare-weapon trade is available");
  return { spareGearTrade: trade, hero: { ...state.hero, gold: trade.goldAfter,
    inventory: state.hero.inventory.filter(item => item.id !== trade.soldItem.id) } };
}
