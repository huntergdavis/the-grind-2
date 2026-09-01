import type { ChronicleEntry, WorldState } from "../core/types";
import {
  isValidWeaponUseMastery,
  maximumWeaponUseExperience,
  maximumWeaponUseLevel,
} from "../depth/rpg";
import type { ItemState, WeaponUseReceipt } from "../depth/types";
import {
  projectFamiliarWeaponForm,
  type FamiliarWeaponFormFact,
  type FamiliarWeaponFormId,
  type FamiliarWeaponSilhouette,
} from "../render/weapon-form";

export interface WeaponMemoryReceiptFactV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly combatId: string;
  readonly resolvedTick: number;
  readonly outcome: "victory" | "defeat" | "stalemate";
  readonly basicStrikes: number;
  readonly damage: number;
}

export interface WeaponMemoryOutcomeCountsV1 {
  readonly victories: number;
  readonly defeats: number;
  readonly stalemates: number;
}

export interface WeaponMemoryCeremonyPacketV1 {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly tick: number;
  readonly campaignId: string;
  readonly commandId: string;
  readonly commandType: "combat-action";
  readonly heroId: string;
  readonly heroName: string;
  readonly className: string;
  readonly location: string;
  readonly weaponId: string;
  readonly weaponName: string;
  readonly rarity: ItemState["rarity"];
  readonly silhouette: FamiliarWeaponSilhouette;
  readonly masteryRulesVersion: "weapon-effective-use-v1";
  readonly experienceBefore: 44;
  readonly experienceAfter: 45;
  readonly levelBefore: 9;
  readonly levelAfter: 10;
  readonly maximumExperience: 45;
  readonly maximumLevel: 10;
  readonly receipts: readonly WeaponMemoryReceiptFactV1[];
  readonly outcomeCounts: WeaponMemoryOutcomeCountsV1;
  readonly totalBasicStrikes: number;
  readonly totalDamage: number;
  readonly firstReceiptId: string;
  readonly highestDamageReceiptId: string;
  readonly finalReceiptId: string;
  readonly familiarFormRulesVersion: "weapon-familiar-form-v1";
  readonly familiarFormId: FamiliarWeaponFormId;
  readonly familiarFormName: FamiliarWeaponFormFact["formName"];
  readonly familiarFormUnlockReceiptId: string;
  readonly equippedAfter: boolean;
  readonly equippedWeaponIdAfter: string | null;
  readonly mechanicalBonus: 0;
}

const PACKET_KEYS = [
  "schemaVersion",
  "eventId",
  "tick",
  "campaignId",
  "commandId",
  "commandType",
  "heroId",
  "heroName",
  "className",
  "location",
  "weaponId",
  "weaponName",
  "rarity",
  "silhouette",
  "masteryRulesVersion",
  "experienceBefore",
  "experienceAfter",
  "levelBefore",
  "levelAfter",
  "maximumExperience",
  "maximumLevel",
  "receipts",
  "outcomeCounts",
  "totalBasicStrikes",
  "totalDamage",
  "firstReceiptId",
  "highestDamageReceiptId",
  "finalReceiptId",
  "familiarFormRulesVersion",
  "familiarFormId",
  "familiarFormName",
  "familiarFormUnlockReceiptId",
  "equippedAfter",
  "equippedWeaponIdAfter",
  "mechanicalBonus",
] as const;

const RECEIPT_KEYS = [
  "schemaVersion",
  "id",
  "combatId",
  "resolvedTick",
  "outcome",
  "basicStrikes",
  "damage",
] as const;

const COUNT_KEYS = ["victories", "defeats", "stalemates"] as const;
const RARITIES: readonly ItemState["rarity"][] = [
  "common",
  "uncommon",
  "rare",
  "legendary",
];
const OUTCOMES = ["victory", "defeat", "stalemate"] as const;
const FORM_BY_SILHOUETTE = {
  sword: { id: "familiar-form-sword-v1", name: "Measured Cut" },
  spear: { id: "familiar-form-spear-v1", name: "Set Thrust" },
  wand: { id: "familiar-form-wand-v1", name: "Anchored Arc" },
} as const satisfies Record<
  FamiliarWeaponSilhouette,
  { readonly id: FamiliarWeaponFormId; readonly name: FamiliarWeaponFormFact["formName"] }
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
}

function isBoundedText(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= maximumLength
  );
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isSafePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function safeSum(values: readonly number[]): number | null {
  let total = 0;
  for (const value of values) {
    if (!isSafeNonNegativeInteger(value) || !Number.isSafeInteger(total + value)) {
      return null;
    }
    total += value;
  }
  return total;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => sameValue(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).filter((key) => left[key] !== undefined);
  const rightKeys = Object.keys(right).filter((key) => right[key] !== undefined);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => key in right && sameValue(left[key], right[key]))
  );
}

function freezeCopy<T>(value: T): Readonly<T> {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => freezeCopy(entry))) as unknown as Readonly<T>;
  }
  if (isRecord(value)) {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, freezeCopy(entry)]),
      ),
    ) as Readonly<T>;
  }
  return value;
}

function safeWorldPair(
  before: WorldState,
  after: WorldState,
  source: ChronicleEntry,
): boolean {
  if (
    before.campaignId !== after.campaignId ||
    before.seed !== after.seed ||
    before.hero.id !== after.hero.id ||
    before.hero.name !== after.hero.name ||
    before.depth.hero.id !== after.depth.hero.id ||
    before.hero.id !== before.depth.hero.id ||
    after.hero.id !== after.depth.hero.id ||
    before.hero.name !== before.depth.hero.name ||
    after.hero.name !== after.depth.hero.name ||
    before.depth.hero.className !== after.depth.hero.className ||
    before.hero.level !== before.depth.hero.level ||
    after.hero.level !== after.depth.hero.level ||
    before.hero.experience !== before.depth.hero.experience ||
    after.hero.experience !== after.depth.hero.experience ||
    before.hero.health !== before.depth.hero.resources.health ||
    after.hero.health !== after.depth.hero.resources.health ||
    before.hero.maxHealth !== before.depth.hero.resources.maxHealth ||
    after.hero.maxHealth !== after.depth.hero.resources.maxHealth ||
    before.hero.gold !== before.depth.hero.gold ||
    after.hero.gold !== after.depth.hero.gold ||
    after.tick !== before.tick + 1 ||
    before.depth.tick !== before.tick ||
    after.depth.tick !== after.tick ||
    source.id !== `${after.campaignId}:${after.tick}` ||
    source.tick !== after.tick ||
    source.commandType !== "combat-action" ||
    !isBoundedText(source.commandId, 512) ||
    before.chronicle.some((entry) => entry.id === source.id) ||
    after.chronicle.filter((entry) => entry.id === source.id).length !== 1 ||
    !sameValue(after.chronicle.at(-1), source)
  ) {
    return false;
  }
  const expectedChronicle = [...before.chronicle.slice(-31), source];
  return (
    sameValue(after.chronicle, expectedChronicle) &&
    sameValue(after.scene, {
      mode: source.mode,
      location: source.location,
      headline: source.headline,
      action: source.action,
      goal: source.goal,
      consequence: source.consequence,
      sensoryIntensity: source.sensoryIntensity,
    })
  );
}

function compactReceipt(receipt: WeaponUseReceipt): WeaponMemoryReceiptFactV1 {
  return {
    schemaVersion: 1,
    id: receipt.id,
    combatId: receipt.combatId,
    resolvedTick: receipt.resolvedTick,
    outcome: receipt.outcome,
    basicStrikes: receipt.basicStrikes,
    damage: receipt.damage,
  };
}

function isReceiptFact(value: unknown): value is WeaponMemoryReceiptFactV1 {
  if (!isRecord(value) || !hasExactKeys(value, RECEIPT_KEYS)) return false;
  return (
    value.schemaVersion === 1 &&
    isBoundedText(value.id, 512) &&
    isBoundedText(value.combatId, 512) &&
    isSafeNonNegativeInteger(value.resolvedTick) &&
    OUTCOMES.includes(value.outcome as (typeof OUTCOMES)[number]) &&
    isSafePositiveInteger(value.basicStrikes) &&
    Number(value.basicStrikes) <= 128 &&
    isSafePositiveInteger(value.damage)
  );
}

function derivedReceiptFactsAreValid(
  receipts: readonly WeaponMemoryReceiptFactV1[],
  weaponId: string,
): boolean {
  const receiptIds = new Set<string>();
  const combatIds = new Set<string>();
  let previousTick = -1;
  for (const receipt of receipts) {
    if (
      receipt.resolvedTick <= previousTick ||
      receipt.id !== `${receipt.combatId}:weapon-use:${weaponId}` ||
      receiptIds.has(receipt.id) ||
      combatIds.has(receipt.combatId)
    ) {
      return false;
    }
    previousTick = receipt.resolvedTick;
    receiptIds.add(receipt.id);
    combatIds.add(receipt.combatId);
  }
  return true;
}

function tallyOutcomes(
  receipts: readonly WeaponMemoryReceiptFactV1[],
): WeaponMemoryOutcomeCountsV1 {
  return {
    victories: receipts.filter((receipt) => receipt.outcome === "victory").length,
    defeats: receipts.filter((receipt) => receipt.outcome === "defeat").length,
    stalemates: receipts.filter((receipt) => receipt.outcome === "stalemate").length,
  };
}

function highestDamageReceipt(
  receipts: readonly WeaponMemoryReceiptFactV1[],
): WeaponMemoryReceiptFactV1 {
  const first = receipts[0];
  if (!first) throw new Error("Weapon memory requires at least one receipt");
  return receipts.slice(1).reduce(
    (highest, receipt) => (receipt.damage > highest.damage ? receipt : highest),
    first,
  );
}

export function isWeaponMemoryCeremonyPacketV1(
  value: unknown,
): value is WeaponMemoryCeremonyPacketV1 {
  if (!isRecord(value) || !hasExactKeys(value, PACKET_KEYS)) return false;
  const receiptValues = value.receipts;
  const outcomeCounts = value.outcomeCounts;
  if (
    value.schemaVersion !== 1 ||
    !isBoundedText(value.eventId, 512) ||
    !isSafeNonNegativeInteger(value.tick) ||
    !isBoundedText(value.campaignId, 512) ||
    !isBoundedText(value.commandId, 512) ||
    value.commandType !== "combat-action" ||
    !isBoundedText(value.heroId, 512) ||
    !isBoundedText(value.heroName, 160) ||
    !isBoundedText(value.className, 160) ||
    !isBoundedText(value.location, 1_000) ||
    !isBoundedText(value.weaponId, 512) ||
    !isBoundedText(value.weaponName, 160) ||
    !RARITIES.includes(value.rarity as ItemState["rarity"]) ||
    !(value.silhouette === "sword" || value.silhouette === "spear" || value.silhouette === "wand") ||
    value.masteryRulesVersion !== "weapon-effective-use-v1" ||
    value.experienceBefore !== 44 ||
    value.experienceAfter !== maximumWeaponUseExperience ||
    value.levelBefore !== 9 ||
    value.levelAfter !== maximumWeaponUseLevel ||
    value.maximumExperience !== maximumWeaponUseExperience ||
    value.maximumLevel !== maximumWeaponUseLevel ||
    !Array.isArray(receiptValues) ||
    receiptValues.length !== maximumWeaponUseExperience ||
    !receiptValues.every(isReceiptFact) ||
    !isRecord(outcomeCounts) ||
    !hasExactKeys(outcomeCounts, COUNT_KEYS) ||
    !COUNT_KEYS.every((key) => isSafeNonNegativeInteger(outcomeCounts[key])) ||
    !isSafePositiveInteger(value.totalBasicStrikes) ||
    !isSafePositiveInteger(value.totalDamage) ||
    !isBoundedText(value.firstReceiptId, 512) ||
    !isBoundedText(value.highestDamageReceiptId, 512) ||
    !isBoundedText(value.finalReceiptId, 512) ||
    value.familiarFormRulesVersion !== "weapon-familiar-form-v1" ||
    !isBoundedText(value.familiarFormId, 160) ||
    !isBoundedText(value.familiarFormName, 160) ||
    !isBoundedText(value.familiarFormUnlockReceiptId, 512) ||
    typeof value.equippedAfter !== "boolean" ||
    !(value.equippedWeaponIdAfter === null || isBoundedText(value.equippedWeaponIdAfter, 512)) ||
    value.mechanicalBonus !== 0
  ) {
    return false;
  }

  const receipts = receiptValues as WeaponMemoryReceiptFactV1[];
  const firstReceipt = receipts[0];
  const finalReceipt = receipts.at(-1);
  const unlockReceipt = receipts[5];
  if (!firstReceipt || !finalReceipt || !unlockReceipt) return false;
  const counts = tallyOutcomes(receipts);
  const strikes = safeSum(receipts.map((receipt) => receipt.basicStrikes));
  const damage = safeSum(receipts.map((receipt) => receipt.damage));
  const form = FORM_BY_SILHOUETTE[value.silhouette as FamiliarWeaponSilhouette];
  return (
    value.eventId === `${value.campaignId}:${value.tick}` &&
    derivedReceiptFactsAreValid(receipts, value.weaponId as string) &&
    strikes !== null &&
    damage !== null &&
    value.totalBasicStrikes === strikes &&
    value.totalDamage === damage &&
    sameValue(outcomeCounts, counts) &&
    value.firstReceiptId === firstReceipt.id &&
    value.highestDamageReceiptId === highestDamageReceipt(receipts).id &&
    value.finalReceiptId === finalReceipt.id &&
    finalReceipt.resolvedTick === value.tick &&
    value.familiarFormId === form.id &&
    value.familiarFormName === form.name &&
    value.familiarFormUnlockReceiptId === unlockReceipt.id &&
    value.equippedAfter === (value.equippedWeaponIdAfter === value.weaponId)
  );
}

function itemWithoutMastery(item: ItemState): ItemState {
  return { ...item, useMastery: null };
}

function isFreshMastery(item: ItemState): boolean {
  return (
    item.useMastery === null ||
    (isValidWeaponUseMastery(item.useMastery, item.id) &&
      item.useMastery.level === 1 &&
      item.useMastery.experience === 0 &&
      item.useMastery.receipts.length === 0)
  );
}

function allOtherMasteryIsUnchanged(
  beforeItems: readonly ItemState[],
  afterItems: readonly ItemState[],
  changedWeaponId: string,
): boolean {
  const beforeIds = new Set(beforeItems.map((item) => item.id));
  const afterIds = new Set(afterItems.map((item) => item.id));
  if (beforeIds.size !== beforeItems.length || afterIds.size !== afterItems.length) {
    return false;
  }
  for (const beforeItem of beforeItems) {
    const afterItem = afterItems.find((item) => item.id === beforeItem.id);
    if (!afterItem) return false;
    if (
      beforeItem.id !== changedWeaponId &&
      !sameValue(beforeItem.useMastery, afterItem.useMastery)
    ) {
      return false;
    }
  }
  return afterItems
    .filter((item) => !beforeIds.has(item.id))
    .every(isFreshMastery);
}

interface WeaponCrossing {
  readonly beforeItem: ItemState;
  readonly afterItem: ItemState;
  readonly finalReceipt: WeaponUseReceipt;
}

function findTerminalCrossings(
  beforeItems: readonly ItemState[],
  afterItems: readonly ItemState[],
): WeaponCrossing[] {
  const crossings: WeaponCrossing[] = [];
  for (const beforeItem of beforeItems) {
    const afterItem = afterItems.find((item) => item.id === beforeItem.id);
    if (
      !afterItem ||
      beforeItem.kind !== "equipment" ||
      beforeItem.slot !== "weapon" ||
      afterItem.kind !== "equipment" ||
      afterItem.slot !== "weapon" ||
      !beforeItem.useMastery ||
      !afterItem.useMastery ||
      !isValidWeaponUseMastery(beforeItem.useMastery, beforeItem.id) ||
      !isValidWeaponUseMastery(afterItem.useMastery, afterItem.id) ||
      beforeItem.useMastery.rulesVersion !== "weapon-effective-use-v1" ||
      afterItem.useMastery.rulesVersion !== "weapon-effective-use-v1" ||
      beforeItem.useMastery.experience !== 44 ||
      beforeItem.useMastery.level !== 9 ||
      beforeItem.useMastery.receipts.length !== 44 ||
      afterItem.useMastery.experience !== maximumWeaponUseExperience ||
      afterItem.useMastery.level !== maximumWeaponUseLevel ||
      afterItem.useMastery.receipts.length !== maximumWeaponUseExperience ||
      !sameValue(
        beforeItem.useMastery.receipts,
        afterItem.useMastery.receipts.slice(0, -1),
      ) ||
      !sameValue(itemWithoutMastery(beforeItem), itemWithoutMastery(afterItem))
    ) {
      continue;
    }
    crossings.push({
      beforeItem,
      afterItem,
      finalReceipt: afterItem.useMastery.receipts.at(-1)!,
    });
  }
  return crossings;
}

function combatBindsCrossing(
  before: WorldState,
  after: WorldState,
  crossing: WeaponCrossing,
  source: ChronicleEntry,
): boolean {
  const active = before.depth.combat;
  const completed = after.depth.completedCombats.at(-1);
  const receipt = crossing.finalReceipt;
  if (
    !active ||
    active.outcome !== "ongoing" ||
    after.depth.combat !== null ||
    !completed ||
    completed.id !== active.id ||
    completed.id !== receipt.combatId ||
    completed.outcome === "ongoing" ||
    completed.outcome !== receipt.outcome ||
    receipt.resolvedTick !== source.tick ||
    active.weaponUse.tracking !== "tracked" ||
    active.weaponUse.heroId !== before.depth.hero.id ||
    active.weaponUse.weaponId !== crossing.beforeItem.id ||
    completed.weaponUse.tracking !== "tracked" ||
    completed.weaponUse.heroId !== before.depth.hero.id ||
    completed.weaponUse.weaponId !== crossing.beforeItem.id ||
    completed.weaponUse.basicStrikes !== receipt.basicStrikes ||
    completed.weaponUse.damage !== receipt.damage ||
    active.weaponUse.basicStrikes > completed.weaponUse.basicStrikes ||
    active.weaponUse.damage > completed.weaponUse.damage
  ) {
    return false;
  }
  return after.depth.completedCombats.filter((combat) => combat.id === active.id).length === 1;
}

export function projectWeaponMemoryCeremony(
  before: WorldState,
  after: WorldState,
  source: ChronicleEntry,
): WeaponMemoryCeremonyPacketV1 | null {
  if (!safeWorldPair(before, after, source)) return null;
  const crossings = findTerminalCrossings(
    before.depth.hero.inventory,
    after.depth.hero.inventory,
  );
  if (crossings.length !== 1) return null;
  const crossing = crossings[0];
  if (!crossing) return null;
  if (
    !allOtherMasteryIsUnchanged(
      before.depth.hero.inventory,
      after.depth.hero.inventory,
      crossing.beforeItem.id,
    ) ||
    !combatBindsCrossing(before, after, crossing, source)
  ) {
    return null;
  }

  const afterMastery = crossing.afterItem.useMastery;
  const unlockReceipt = afterMastery?.receipts[5];
  if (!afterMastery || !unlockReceipt) return null;
  const familiarForm = projectFamiliarWeaponForm(crossing.afterItem);
  if (
    !familiarForm ||
    familiarForm.displayedMasteryLevel !== maximumWeaponUseLevel ||
    familiarForm.mechanicalBonus !== 0 ||
    familiarForm.weaponId !== crossing.afterItem.id ||
    familiarForm.weaponName !== crossing.afterItem.name ||
    familiarForm.unlockReceiptId !== unlockReceipt.id ||
    familiarForm.unlockCombatId !== unlockReceipt.combatId
  ) {
    return null;
  }

  const receipts = afterMastery.receipts.map(compactReceipt);
  const firstReceipt = receipts[0];
  if (!firstReceipt) return null;
  const outcomeCounts = tallyOutcomes(receipts);
  const totalBasicStrikes = safeSum(receipts.map((receipt) => receipt.basicStrikes));
  const totalDamage = safeSum(receipts.map((receipt) => receipt.damage));
  if (totalBasicStrikes === null || totalDamage === null) return null;
  const equippedWeaponIdAfter = after.depth.hero.equipment.weapon;
  const packet: WeaponMemoryCeremonyPacketV1 = {
    schemaVersion: 1,
    eventId: source.id,
    tick: source.tick,
    campaignId: after.campaignId,
    commandId: source.commandId!,
    commandType: "combat-action",
    heroId: after.depth.hero.id,
    heroName: after.depth.hero.name,
    className: after.depth.hero.className,
    location: source.location,
    weaponId: crossing.afterItem.id,
    weaponName: crossing.afterItem.name,
    rarity: crossing.afterItem.rarity,
    silhouette: familiarForm.silhouette,
    masteryRulesVersion: "weapon-effective-use-v1",
    experienceBefore: 44,
    experienceAfter: 45,
    levelBefore: 9,
    levelAfter: 10,
    maximumExperience: maximumWeaponUseExperience,
    maximumLevel: maximumWeaponUseLevel,
    receipts,
    outcomeCounts,
    totalBasicStrikes,
    totalDamage,
    firstReceiptId: firstReceipt.id,
    highestDamageReceiptId: highestDamageReceipt(receipts).id,
    finalReceiptId: crossing.finalReceipt.id,
    familiarFormRulesVersion: "weapon-familiar-form-v1",
    familiarFormId: familiarForm.formId,
    familiarFormName: familiarForm.formName,
    familiarFormUnlockReceiptId: familiarForm.unlockReceiptId,
    equippedAfter: equippedWeaponIdAfter === crossing.afterItem.id,
    equippedWeaponIdAfter,
    mechanicalBonus: 0,
  };
  return isWeaponMemoryCeremonyPacketV1(packet)
    ? (freezeCopy(packet) as WeaponMemoryCeremonyPacketV1)
    : null;
}
