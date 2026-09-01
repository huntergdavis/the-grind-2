import { describe, expect, it } from "vitest";
import {
  attentionPolicyForMode,
  createWorld,
  eventPolicyForMode,
} from "../core/simulation";
import type { ChronicleEntry, WorldState } from "../core/types";
import { createCombat, resolveCombatTurn } from "../depth/combat";
import {
  applyWeaponUseMastery,
  createWeaponUseMastery,
} from "../depth/rpg";
import type { CombatState, ItemState } from "../depth/types";
import {
  isWeaponMemoryCeremonyPacketV1,
  projectWeaponMemoryCeremony,
  type WeaponMemoryCeremonyPacketV1,
} from "./weapon-memory";

function receiptCombat(
  item: ItemState,
  heroId: string,
  index: number,
  namespace = "weapon-memory",
): Pick<CombatState, "id" | "outcome" | "weaponUse"> {
  const outcome = (["victory", "defeat", "stalemate"] as const)[index % 3] ?? "victory";
  return {
    id: `${namespace}:${item.id}:${index}`,
    outcome,
    weaponUse: {
      schemaVersion: 1,
      tracking: "tracked",
      rulesVersion: "weapon-effective-use-v1",
      heroId,
      weaponId: item.id,
      basicStrikes: 1 + (index % 4),
      damage: index === 7 || index === 19 ? 250 : index + 3,
    },
  };
}

function progressWeapon(
  item: ItemState,
  heroId: string,
  count: number,
  namespace = "weapon-memory",
): ItemState {
  let current = item;
  for (let index = 0; index < count; index += 1) {
    const result = applyWeaponUseMastery(
      current,
      receiptCombat(current, heroId, index, namespace),
      index + 1,
    );
    if (result.receipt === null) throw new Error("Expected a weapon mastery receipt");
    current = result.item;
  }
  return current;
}

function replaceItem(
  state: WorldState,
  itemId: string,
  replacement: ItemState,
): WorldState {
  return {
    ...state,
    depth: {
      ...state.depth,
      hero: {
        ...state.depth.hero,
        inventory: state.depth.hero.inventory.map((item) =>
          item.id === itemId ? replacement : item,
        ),
      },
    },
  };
}

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Array.isArray(value) ? value : Object.values(value)) {
    expectDeepFrozen(nested);
  }
}

interface Fixture {
  readonly before: WorldState;
  readonly after: WorldState;
  readonly source: ChronicleEntry;
  readonly packet: WeaponMemoryCeremonyPacketV1;
  readonly weaponId: string;
  readonly replacementId: string;
}

function fixture(seed = "weapon-memory-ceremony"): Fixture {
  const initial = createWorld(seed, `campaign:${seed}`);
  const equippedWeaponId = initial.depth.hero.equipment.weapon;
  const initialWeapon = initial.depth.hero.inventory.find(
    (item) => item.id === equippedWeaponId,
  );
  if (!initialWeapon || initialWeapon.kind !== "equipment" || initialWeapon.slot !== "weapon") {
    throw new Error("Expected the starting hero to carry an equipped weapon");
  }
  const weaponAtZero: ItemState = {
    ...initialWeapon,
    useMastery: initialWeapon.useMastery ?? createWeaponUseMastery(),
  };
  const weaponAtFortyFour = progressWeapon(weaponAtZero, initial.depth.hero.id, 44);
  const replacement: ItemState = {
    id: "item:weapon-memory:replacement",
    name: "Ashen Pike",
    kind: "equipment",
    slot: "weapon",
    rarity: "rare",
    quantity: 1,
    modifiers: { power: 3, agility: 1 },
    restorative: null,
    useMastery: createWeaponUseMastery(),
  };
  const heroAtFortyFour = {
    ...initial.depth.hero,
    inventory: initial.depth.hero.inventory
      .map((item) => (item.id === weaponAtFortyFour.id ? weaponAtFortyFour : item))
      .concat(replacement),
    equipment: { ...initial.depth.hero.equipment, weapon: weaponAtFortyFour.id },
  };

  const finalCombatId = "combat:weapon-memory:final";
  const created = createCombat(seed, heroAtFortyFour, finalCombatId, 1);
  const heroIndex = created.turnOrder.indexOf(heroAtFortyFour.id);
  const enemy = created.combatants.find((combatant) => combatant.side === "enemies");
  if (heroIndex < 0 || !enemy) throw new Error("Expected a hero and enemy combatant");
  const activeCombat: CombatState = {
    ...created,
    activeIndex: heroIndex,
    combatants: created.combatants.map((combatant) =>
      combatant.id === enemy.id ? { ...combatant, health: 1 } : combatant,
    ),
  };
  const completedCombat = resolveCombatTurn(
    activeCombat,
    {
      actorId: heroAtFortyFour.id,
      type: "attack",
      targetId: enemy.id,
      abilityId: null,
      itemId: null,
    },
    seed,
  );
  if (
    completedCombat.outcome !== "victory" ||
    completedCombat.weaponUse.tracking !== "tracked" ||
    completedCombat.weaponUse.basicStrikes !== 1
  ) {
    throw new Error("Expected a terminal tracked basic attack");
  }

  const tick = 101;
  const settlement = applyWeaponUseMastery(
    weaponAtFortyFour,
    completedCombat,
    tick,
  );
  if (settlement.receipt === null) throw new Error("Expected the final mastery receipt");
  const completedHero = completedCombat.combatants.find(
    (combatant) => combatant.id === heroAtFortyFour.id,
  );
  if (!completedHero) throw new Error("Expected the completed hero combatant");

  const before: WorldState = {
    ...initial,
    tick: tick - 1,
    hero: {
      ...initial.hero,
      health: heroAtFortyFour.resources.health,
      maxHealth: heroAtFortyFour.resources.maxHealth,
    },
    depth: {
      ...initial.depth,
      tick: tick - 1,
      hero: heroAtFortyFour,
      combat: activeCombat,
    },
  };
  const scene = {
    mode: "battle" as const,
    location: before.scene.location,
    headline: "The last lesson lands",
    action: `${heroAtFortyFour.name} settles the duel with one familiar stroke.`,
    goal: "Remember the road carried by this weapon",
    consequence: `${weaponAtFortyFour.name} reaches Use Mastery L10.`,
    sensoryIntensity: 3 as const,
  };
  const source: ChronicleEntry = {
    ...scene,
    id: `${before.campaignId}:${tick}`,
    tick,
    attention: attentionPolicyForMode(scene.mode),
    consideredActions: [scene.action],
    chosenAction: scene.action,
    rationale: "The canonical combat action closes the tracked encounter.",
    policy: eventPolicyForMode(scene.mode),
    commandId: `combat-action:${finalCombatId}:${completedCombat.turn}`,
    commandType: "combat-action",
  };
  const afterHero = {
    ...heroAtFortyFour,
    resources: {
      ...heroAtFortyFour.resources,
      health: completedHero.health,
      mana: completedHero.mana,
    },
    inventory: heroAtFortyFour.inventory.map((item) =>
      item.id === settlement.item.id ? settlement.item : item,
    ),
    // A same-beat auto-equip is allowed; the mastered start-bound weapon is retained.
    equipment: { ...heroAtFortyFour.equipment, weapon: replacement.id },
  };
  const after: WorldState = {
    ...before,
    tick,
    hero: {
      ...before.hero,
      health: afterHero.resources.health,
      maxHealth: afterHero.resources.maxHealth,
    },
    scene,
    chronicle: [...before.chronicle.slice(-31), source],
    depth: {
      ...before.depth,
      tick,
      hero: afterHero,
      combat: null,
      completedCombats: [...before.depth.completedCombats.slice(-3), completedCombat],
    },
  };
  const packet = projectWeaponMemoryCeremony(before, after, source);
  if (packet === null) throw new Error("Expected a weapon memory ceremony packet");
  return {
    before,
    after,
    source,
    packet,
    weaponId: weaponAtFortyFour.id,
    replacementId: replacement.id,
  };
}

describe("weapon memory ceremony projector", () => {
  it("projects the one real 44/L9 to 45/L10 terminal combat crossing", () => {
    const { before, after, source, packet, weaponId, replacementId } = fixture();
    const beforeSnapshot = JSON.stringify(before);
    const afterSnapshot = JSON.stringify(after);

    expect(packet).toMatchObject({
      schemaVersion: 1,
      eventId: source.id,
      tick: source.tick,
      campaignId: after.campaignId,
      commandId: source.commandId,
      commandType: "combat-action",
      heroId: after.depth.hero.id,
      heroName: after.depth.hero.name,
      className: after.depth.hero.className,
      location: source.location,
      weaponId,
      masteryRulesVersion: "weapon-effective-use-v1",
      experienceBefore: 44,
      experienceAfter: 45,
      levelBefore: 9,
      levelAfter: 10,
      maximumExperience: 45,
      maximumLevel: 10,
      outcomeCounts: { victories: 16, defeats: 15, stalemates: 14 },
      totalBasicStrikes: 111,
      totalDamage: 1547,
      highestDamageReceiptId: `weapon-memory:${weaponId}:7:weapon-use:${weaponId}`,
      familiarFormRulesVersion: "weapon-familiar-form-v1",
      familiarFormUnlockReceiptId: `weapon-memory:${weaponId}:5:weapon-use:${weaponId}`,
      equippedAfter: false,
      equippedWeaponIdAfter: replacementId,
      mechanicalBonus: 0,
    });
    expect(packet.receipts).toHaveLength(45);
    expect(packet.firstReceiptId).toBe(packet.receipts[0]?.id);
    expect(packet.finalReceiptId).toBe(packet.receipts[44]?.id);
    expect(packet.finalReceiptId).not.toBe(packet.eventId);
    expect(after.depth.hero.inventory.some((item) => item.id === weaponId)).toBe(true);
    expect(isWeaponMemoryCeremonyPacketV1(packet)).toBe(true);
    expect(isWeaponMemoryCeremonyPacketV1(structuredClone(packet))).toBe(true);
    expectDeepFrozen(packet);
    expect(JSON.stringify(before)).toBe(beforeSnapshot);
    expect(JSON.stringify(after)).toBe(afterSnapshot);
  });

  it("selects the earliest receipt when the highest-damage total is tied", () => {
    const { packet, weaponId } = fixture("weapon-memory-tie");
    expect(packet.receipts[7]?.damage).toBe(250);
    expect(packet.receipts[19]?.damage).toBe(250);
    expect(packet.highestDamageReceiptId).toBe(
      `weapon-memory:${weaponId}:7:weapon-use:${weaponId}`,
    );
  });

  it("rejects forged Chronicle identity and non-combat sources", () => {
    const { before, after, source } = fixture("weapon-memory-source");
    expect(projectWeaponMemoryCeremony(before, after, { ...source, id: `${source.id}:forged` })).toBeNull();
    expect(projectWeaponMemoryCeremony(before, after, { ...source, commandType: "wait" })).toBeNull();
    expect(projectWeaponMemoryCeremony(before, {
      ...after,
      depth: {
        ...after.depth,
        hero: { ...after.depth.hero, id: `${after.depth.hero.id}:forged` },
      },
    }, source)).toBeNull();
  });

  it("rejects a changed receipt prefix and any second same-beat mastery change", () => {
    const { before, after, source, weaponId, replacementId } = fixture("weapon-memory-prefix");
    const changedPrefix = structuredClone(after);
    const crossedWeapon = changedPrefix.depth.hero.inventory.find((item) => item.id === weaponId);
    if (!crossedWeapon?.useMastery) throw new Error("Expected crossed mastery");
    crossedWeapon.useMastery.receipts[4]!.damage += 1;
    expect(projectWeaponMemoryCeremony(before, changedPrefix, source)).toBeNull();

    const changedOther = structuredClone(after);
    const replacement = changedOther.depth.hero.inventory.find((item) => item.id === replacementId);
    if (!replacement) throw new Error("Expected replacement weapon");
    const otherSettlement = applyWeaponUseMastery(
      replacement,
      receiptCombat(replacement, changedOther.depth.hero.id, 0, "other-mastery"),
      99,
    );
    changedOther.depth.hero.inventory = changedOther.depth.hero.inventory.map((item) =>
      item.id === replacementId ? otherSettlement.item : item,
    );
    expect(projectWeaponMemoryCeremony(before, changedOther, source)).toBeNull();
  });

  it("requires the start-bound active tracker and exact completed combat receipt facts", () => {
    const { before, after, source, replacementId } = fixture("weapon-memory-binding");
    const wrongActive = structuredClone(before);
    if (wrongActive.depth.combat?.weaponUse.tracking !== "tracked") {
      throw new Error("Expected tracked active combat");
    }
    wrongActive.depth.combat.weaponUse.weaponId = replacementId;
    expect(projectWeaponMemoryCeremony(wrongActive, after, source)).toBeNull();

    const wrongCompleted = structuredClone(after);
    const completed = wrongCompleted.depth.completedCombats.at(-1);
    if (!completed || completed.weaponUse.tracking !== "tracked") {
      throw new Error("Expected tracked completed combat");
    }
    completed.weaponUse.damage += 1;
    expect(projectWeaponMemoryCeremony(before, wrongCompleted, source)).toBeNull();
  });

  it("requires exactly one crossing and retains the start-bound weapon", () => {
    const { before, after, source, weaponId, replacementId } = fixture("weapon-memory-one-crossing");
    const missingWeapon = structuredClone(after);
    missingWeapon.depth.hero.inventory = missingWeapon.depth.hero.inventory.filter(
      (item) => item.id !== weaponId,
    );
    expect(projectWeaponMemoryCeremony(before, missingWeapon, source)).toBeNull();

    const replacementBefore = before.depth.hero.inventory.find((item) => item.id === replacementId);
    if (!replacementBefore) throw new Error("Expected replacement weapon");
    const secondAtFortyFour = progressWeapon(
      replacementBefore,
      before.depth.hero.id,
      44,
      "second-crossing",
    );
    const secondSettlement = applyWeaponUseMastery(
      secondAtFortyFour,
      {
        id: "combat:second-crossing:final",
        outcome: "victory",
        weaponUse: {
          schemaVersion: 1,
          tracking: "tracked",
          rulesVersion: "weapon-effective-use-v1",
          heroId: before.depth.hero.id,
          weaponId: replacementId,
          basicStrikes: 1,
          damage: 1,
        },
      },
      after.tick,
    );
    const twoBefore = replaceItem(before, replacementId, secondAtFortyFour);
    const twoAfter = replaceItem(after, replacementId, secondSettlement.item);
    expect(projectWeaponMemoryCeremony(twoBefore, twoAfter, source)).toBeNull();
  });

  it("rejects recomputed and exact-key packet forgeries", () => {
    const { packet } = fixture("weapon-memory-validation");
    const forgeries: unknown[] = [
      { ...packet, extra: true },
      { ...packet, eventId: `${packet.eventId}:forged` },
      { ...packet, finalReceiptId: packet.firstReceiptId },
      {
        ...packet,
        receipts: packet.receipts.map((receipt, index) =>
          index === 44 ? { ...receipt, resolvedTick: receipt.resolvedTick + 1 } : receipt,
        ),
      },
      { ...packet, highestDamageReceiptId: packet.receipts[19]?.id },
      { ...packet, totalBasicStrikes: packet.totalBasicStrikes + 1 },
      { ...packet, totalDamage: packet.totalDamage + 1 },
      {
        ...packet,
        outcomeCounts: { ...packet.outcomeCounts, victories: packet.outcomeCounts.victories + 1 },
      },
      {
        ...packet,
        outcomeCounts: { ...packet.outcomeCounts, extra: 0 },
      },
      { ...packet, familiarFormName: "Invented Form" },
      { ...packet, familiarFormUnlockReceiptId: packet.receipts[4]?.id },
      { ...packet, equippedAfter: true },
      { ...packet, mechanicalBonus: 1 },
      {
        ...packet,
        receipts: packet.receipts.map((receipt, index) =>
          index === 0 ? { ...receipt, extra: true } : receipt,
        ),
      },
      {
        ...packet,
        receipts: packet.receipts.map((receipt, index) =>
          index === 4 ? { ...receipt, damage: receipt.damage + 1 } : receipt,
        ),
      },
      {
        ...packet,
        receipts: packet.receipts.map((receipt, index, receipts) =>
          index === 3 ? receipts[2]! : receipt,
        ),
      },
    ];
    for (const forged of forgeries) {
      expect(isWeaponMemoryCeremonyPacketV1(forged)).toBe(false);
    }
  });
});
