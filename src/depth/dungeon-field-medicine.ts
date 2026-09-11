import { createEmberTonic, emberTonicId, isCanonicalEmberTonic, restorativeHealthAmount } from "./rpg";
import type { DepthCommand, DepthState, DungeonState, ItemState } from "./types";

export interface DungeonFieldMedicineUse {
  readonly schemaVersion: 1;
  readonly effect: "restore-health-quarter-max-v1";
  readonly heroId: string;
  readonly dungeonId: string;
  readonly locationId: string;
  readonly cellId: string;
  readonly itemId: string;
  readonly itemName: "Ember Tonic";
  readonly sourceCommandId: string;
  readonly tick: number;
  readonly maxHealth: number;
  readonly healthBefore: number;
  readonly healthAfter: number;
  readonly amount: number;
  readonly quantityBefore: number;
  readonly quantityAfter: number;
  readonly disposition: "retained" | "depleted";
}
type MedicineCommand = Extract<DepthCommand, { type: "use-dungeon-tonic" }>;
const receiptKeys = ["schemaVersion", "effect", "heroId", "dungeonId", "locationId", "cellId", "itemId", "itemName",
  "sourceCommandId", "tick", "maxHealth", "healthBefore", "healthAfter", "amount", "quantityBefore", "quantityAfter", "disposition"];
function integer(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}
function identifier(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 600; }
function keys(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...receiptKeys].sort().join(",");
}
export function dungeonFieldMedicineCommandId(atTick: number, command: MedicineCommand): string {
  return `depth:${atTick}:dungeon:${command.dungeonId}:tonic:${command.cellId}:${command.itemId}`;
}
function actualDungeonLocation(state: DepthState, locationId: string, dungeonId: string): boolean {
  const prefix = `dungeon:${locationId}`;
  return state.atlas.discoveredLocationIds.includes(locationId)
    && state.atlas.locations.some((entry) => entry.id === locationId && entry.kind === "dungeon")
    && (dungeonId === prefix || dungeonId.startsWith(`${prefix}:quest:`)
      && /^[1-9]\d*$/.test(dungeonId.slice(`${prefix}:quest:`.length)));
}
function betweenDungeonActions(state: DepthState): boolean {
  return state.dungeon !== null && !state.dungeon.completed && state.hero.resources.health > 0
    && state.companions.active.length === 0 && state.atlas.route === null && state.combat === null && state.counterDuel === null
    && state.quest.status === "active" && state.pendingQuestReward === null && state.repartee.active === null
    && (state.bellExpedition === null || state.bellExpedition.completion !== null)
    && (state.usefulReply === null || state.usefulReply.reply !== null)
    && (state.roomChallenge === null || state.roomChallenge.result !== null);
}
function ownedTonic(state: DepthState): ItemState | null {
  const items = state.hero.inventory.filter((item) => item.id === emberTonicId(state.hero.id));
  return items.length === 1 && isCanonicalEmberTonic(items[0]!, state.hero.id) ? items[0]! : null;
}

/** Historical arithmetic is checked against the recorded maximum, not future growth. */
export function isValidDungeonFieldMedicineUse(value: unknown, dungeon: DungeonState): value is DungeonFieldMedicineUse | null {
  if (value === null) return true;
  if (!keys(value) || value.schemaVersion !== 1 || value.effect !== "restore-health-quarter-max-v1"
    || ![value.heroId, value.dungeonId, value.locationId, value.cellId, value.itemId, value.sourceCommandId].every(identifier)
    || value.itemName !== "Ember Tonic" || !integer(value.tick, 1) || !integer(value.maxHealth, 1)
    || !integer(value.healthBefore, 1) || !integer(value.healthAfter, 1) || !integer(value.amount, 1)
    || !integer(value.quantityBefore, 1) || !integer(value.quantityAfter)) return false;
  try {
    const receipt = value as unknown as DungeonFieldMedicineUse;
    const item = createEmberTonic(receipt.heroId, receipt.quantityBefore);
    const amount = Math.min(receipt.maxHealth - receipt.healthBefore, restorativeHealthAmount(item, receipt.maxHealth));
    return receipt.itemId === item.id && receipt.healthBefore * 2 <= receipt.maxHealth && amount === receipt.amount
      && receipt.healthAfter === receipt.healthBefore + amount && receipt.healthAfter <= receipt.maxHealth
      && receipt.quantityAfter === receipt.quantityBefore - 1
      && receipt.disposition === (receipt.quantityAfter === 0 ? "depleted" : "retained")
      && receipt.dungeonId === dungeon.id && dungeon.visitedCellIds.includes(receipt.cellId)
      && dungeon.cells.some((cell) => cell.id === receipt.cellId)
      && receipt.sourceCommandId === dungeonFieldMedicineCommandId(receipt.tick, { type: "use-dungeon-tonic",
        dungeonId: receipt.dungeonId, cellId: receipt.cellId, itemId: receipt.itemId });
  } catch { return false; }
}

export function isValidCampaignDungeonFieldMedicine(state: DepthState): boolean {
  try {
    const dungeon = state.dungeon;
    // An absent legacy property is inert. A malformed present property is not.
    if (dungeon === null || !Object.hasOwn(dungeon, "latestFieldMedicineUse")) return true;
    const receipt = dungeon.latestFieldMedicineUse;
    if (!isValidDungeonFieldMedicineUse(receipt, dungeon)) return false;
    if (receipt === null) return true;
    if (receipt.heroId !== state.hero.id || receipt.tick > state.tick
      || !actualDungeonLocation(state, receipt.locationId, receipt.dungeonId)) return false;
    if (receipt.tick < state.tick) return true;
    const stack = ownedTonic(state);
    return betweenDungeonActions(state) && dungeon.currentCellId === receipt.cellId
      && state.atlas.currentLocationId === receipt.locationId
      && state.hero.resources.maxHealth === receipt.maxHealth && state.hero.resources.health === receipt.healthAfter
      && (receipt.quantityAfter === 0
        ? !state.hero.inventory.some((item) => item.id === receipt.itemId)
        : stack !== null && stack.quantity === receipt.quantityAfter);
  } catch { return false; }
}

/** The direct command and automatic policy share the same badly-wounded boundary. */
export function selectDungeonFieldMedicine(state: DepthState): DungeonFieldMedicineUse | null {
  if (!integer(state.tick) || state.tick >= Number.MAX_SAFE_INTEGER || !betweenDungeonActions(state)
    || !isValidCampaignDungeonFieldMedicine(state)) return null;
  const dungeon = state.dungeon!, { health, maxHealth } = state.hero.resources;
  if (!integer(health, 1) || !integer(maxHealth, 1) || health * 2 > maxHealth
    || !actualDungeonLocation(state, state.atlas.currentLocationId, dungeon.id)
    || !dungeon.visitedCellIds.includes(dungeon.currentCellId)
    || !dungeon.cells.some((cell) => cell.id === dungeon.currentCellId)) return null;
  const item = ownedTonic(state);
  if (item === null) return null;
  const amount = Math.min(maxHealth - health, restorativeHealthAmount(item, maxHealth));
  if (amount <= 0) return null;
  const tick = state.tick + 1, quantityAfter = item.quantity - 1;
  return { schemaVersion: 1, effect: "restore-health-quarter-max-v1", heroId: state.hero.id,
    dungeonId: dungeon.id, locationId: state.atlas.currentLocationId, cellId: dungeon.currentCellId,
    itemId: item.id, itemName: "Ember Tonic", sourceCommandId: dungeonFieldMedicineCommandId(tick,
      { type: "use-dungeon-tonic", dungeonId: dungeon.id, cellId: dungeon.currentCellId, itemId: item.id }),
    tick, maxHealth, healthBefore: health, healthAfter: health + amount, amount,
    quantityBefore: item.quantity, quantityAfter, disposition: quantityAfter === 0 ? "depleted" : "retained" };
}

export function stepDungeonFieldMedicine(state: DepthState, command: MedicineCommand): { hero: DepthState["hero"]; dungeon: DungeonState } {
  const receipt = selectDungeonFieldMedicine(state);
  if (receipt === null || command.dungeonId !== receipt.dungeonId || command.cellId !== receipt.cellId || command.itemId !== receipt.itemId) {
    throw new Error("No matching dungeon field medicine is available");
  }
  return { dungeon: { ...state.dungeon!, latestFieldMedicineUse: receipt }, hero: { ...state.hero,
    resources: { ...state.hero.resources, health: receipt.healthAfter },
    inventory: receipt.quantityAfter === 0 ? state.hero.inventory.filter((item) => item.id !== receipt.itemId)
      : state.hero.inventory.map((item) => item.id === receipt.itemId ? { ...item, quantity: receipt.quantityAfter } : item) } };
}
