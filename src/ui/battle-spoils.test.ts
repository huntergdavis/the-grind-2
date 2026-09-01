import { describe, expect, it } from "vitest";
import { attentionPolicyForMode, createWorld, eventPolicyForMode } from "../core/simulation";
import type { ChronicleEntry, WorldState } from "../core/types";
import { createCombat } from "../depth/combat";
import { applyHeroExperience, createWeaponUseMastery, derivedStats, generateLoot } from "../depth/rpg";
import { stepDepth } from "../depth/state";
import type { CombatState, EquipmentSlot, ItemState } from "../depth/types";
import {
  isBattleSpoilsComparisonPacketV1,
  projectBattleSpoilsComparison,
  type BattleSpoilsComparisonPacketV1,
} from "./battle-spoils";

const slots = ["weapon", "offhand", "head", "body", "feet", "charm"] as const;

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Array.isArray(value) ? value : Object.values(value)) expectDeepFrozen(nested);
}

function combatIdForLoot(
  seed: string,
  slot: EquipmentSlot,
  accept: (item: ItemState) => boolean = () => true,
): string {
  for (let index = 0; index < 5_000; index += 1) {
    const id = `combat:battle-spoils:${slot}:${index}`;
    const item = generateLoot(seed, id);
    if (item.slot === slot && accept(item)) return id;
  }
  throw new Error(`Could not find deterministic ${slot} loot`);
}

interface FixtureOptions {
  readonly seed?: string;
  readonly slot?: EquipmentSlot;
  readonly oldItem?: ItemState | null;
  readonly acceptLoot?: (item: ItemState) => boolean;
  readonly fullInventory?: boolean;
  readonly experience?: number;
}

interface Fixture {
  readonly before: WorldState;
  readonly after: WorldState;
  readonly source: ChronicleEntry;
  readonly loot: ItemState;
  readonly packet: BattleSpoilsComparisonPacketV1 | null;
}

function fixture(options: FixtureOptions = {}): Fixture {
  const seed = options.seed ?? "battle-spoils-projector";
  const slot = options.slot ?? "weapon";
  const initial = createWorld(seed, `campaign:${seed}:${slot}`);
  let hero = initial.depth.hero;
  if (options.oldItem !== undefined) {
    const priorId = hero.equipment[slot];
    const retained = priorId === null
      ? hero.inventory
      : hero.inventory.filter((item) => item.id !== priorId);
    hero = {
      ...hero,
      inventory: options.oldItem === null ? retained : [...retained, options.oldItem],
      equipment: { ...hero.equipment, [slot]: options.oldItem?.id ?? null },
    };
  }
  if (options.experience !== undefined) {
    hero = applyHeroExperience(hero, options.experience - hero.experience).hero;
  }
  const installedStats = derivedStats(hero);
  hero = {
    ...hero,
    resources: {
      health: Math.min(hero.resources.health, installedStats.maxHealth),
      maxHealth: installedStats.maxHealth,
      mana: Math.min(hero.resources.mana, installedStats.maxMana),
      maxMana: installedStats.maxMana,
    },
  };
  if (options.fullInventory) {
    const inventory = [...hero.inventory];
    for (let index = inventory.length; index < 32; index += 1) {
      inventory.push({
        id: `item:packed:${slot}:${index}`,
        name: `Packed Supply ${index}`,
        kind: "consumable",
        slot: null,
        rarity: "common",
        quantity: 1,
        modifiers: {},
        restorative: null,
        useMastery: null,
      });
    }
    hero = { ...hero, inventory };
  }
  const combatId = combatIdForLoot(seed, slot, options.acceptLoot);
  const loot = generateLoot(seed, combatId);
  const created = createCombat(seed, hero, combatId, 1);
  const heroIndex = created.turnOrder.indexOf(hero.id);
  const enemy = created.combatants.find((entry) => entry.side === "enemies");
  if (heroIndex < 0 || enemy === undefined) throw new Error("Battle-spoils fixture has no combatants");
  const combat: CombatState = {
    ...created,
    activeIndex: heroIndex,
    combatants: created.combatants.map((entry) => entry.id === hero.id
      ? { ...entry, power: 999 }
      : entry.id === enemy.id ? { ...entry, health: 1 } : entry),
  };
  const before: WorldState = {
    ...initial,
    tick: 40,
    hero: {
      ...initial.hero,
      health: hero.resources.health,
      maxHealth: hero.resources.maxHealth,
    },
    depth: { ...initial.depth, tick: 40, hero, combat },
  };
  const settledDepth = stepDepth(before.depth, {
    type: "combat-action",
    action: {
      actorId: hero.id,
      type: "attack",
      targetId: enemy.id,
      abilityId: null,
      itemId: null,
    },
  });
  if (settledDepth.combat !== null) throw new Error("Battle-spoils fixture did not settle combat");
  const progression = applyHeroExperience(settledDepth.hero, 8);
  const progressedDepth = {
    ...settledDepth,
    hero: progression.hero,
  };
  const scene = {
    mode: "battle" as const,
    location: before.scene.location,
    headline: "Spoils from the final exchange",
    action: `${hero.name} ends the battle and the loadout settles.`,
    goal: "Compare the equipment change",
    consequence: `${loot.name} enters the pack.`,
    sensoryIntensity: 3 as const,
  };
  const tick = before.tick + 1;
  const source: ChronicleEntry = {
    ...scene,
    id: `${before.campaignId}:${tick}`,
    tick,
    attention: attentionPolicyForMode(scene.mode),
    consideredActions: [scene.action],
    chosenAction: scene.action,
    rationale: "The canonical combat action settles deterministic loot.",
    policy: eventPolicyForMode(scene.mode),
    commandId: `combat-action:${combat.id}:${combat.turn}`,
    commandType: "combat-action",
  };
  const after: WorldState = {
    ...before,
    tick,
    hero: {
      ...before.hero,
      level: progressedDepth.hero.level,
      experience: progressedDepth.hero.experience,
      health: progressedDepth.hero.resources.health,
      maxHealth: progressedDepth.hero.resources.maxHealth,
      gold: progressedDepth.hero.gold,
    },
    scene,
    chronicle: [...before.chronicle.slice(-31), source],
    depth: progressedDepth,
  };
  return {
    before,
    after,
    source,
    loot,
    packet: projectBattleSpoilsComparison(before, after, source),
  };
}

describe("battle spoils comparison projector", () => {
  it("projects and freezes a real deterministic terminal-victory auto-equip", () => {
    const oldWeapon: ItemState = {
      id: "item:battle-spoils:old-weapon",
      name: "Roadworn Blade",
      kind: "equipment",
      slot: "weapon",
      rarity: "common",
      quantity: 1,
      modifiers: { power: 1 },
      restorative: null,
      useMastery: createWeaponUseMastery(),
    };
    const { before, after, source, loot, packet } = fixture({
      oldItem: oldWeapon,
      acceptLoot: (item) => (item.modifiers.power ?? 0) > 1,
    });
    const beforeSnapshot = JSON.stringify(before);
    const afterSnapshot = JSON.stringify(after);
    expect(packet).toMatchObject({
      schemaVersion: 1,
      eventId: source.id,
      tick: source.tick,
      campaignId: after.campaignId,
      commandId: source.commandId,
      commandType: "combat-action",
      combatId: before.depth.combat?.id,
      heroId: after.depth.hero.id,
      slot: "weapon",
      oldItem: { id: oldWeapon.id, name: oldWeapon.name, slot: "weapon" },
      newItem: { id: loot.id, name: loot.name, slot: "weapon" },
      oldItemDisposition: "pack",
      mechanicalEffect: "already-applied-auto-equip",
    });
    expect(after.depth.hero.equipment.weapon).toBe(loot.id);
    expect(after.depth.hero.inventory.find((item) => item.id === oldWeapon.id)?.useMastery).toMatchObject({
      level: 2,
      experience: 1,
    });
    expect(packet?.oldItem?.mastery).toEqual({ schemaVersion: 1, level: 2, experience: 1, receiptCount: 1 });
    expect(isBattleSpoilsComparisonPacketV1(packet)).toBe(true);
    expect(isBattleSpoilsComparisonPacketV1(structuredClone(packet))).toBe(true);
    expectDeepFrozen(packet);
    expect(JSON.stringify(before)).toBe(beforeSnapshot);
    expect(JSON.stringify(after)).toBe(afterSnapshot);
  });

  it("admits the exact canonical auto-equip in every equipment slot", () => {
    for (const slot of slots) {
      const result = fixture({
        seed: `battle-spoils-slot-${slot}`,
        slot,
        oldItem: null,
      });
      expect(result.packet?.slot, slot).toBe(slot);
      expect(result.packet?.oldItem, slot).toBeNull();
      expect(result.packet?.oldItemDisposition, slot).toBe("empty-slot");
      expect(result.packet?.newItem.id, slot).toBe(result.loot.id);
      expect(result.after.depth.hero.equipment[slot], slot).toBe(result.loot.id);
    }
  });

  it("reports complete derived tradeoffs and resource maxima without inventing a refill", () => {
    const oldItem: ItemState = {
      id: "item:battle-spoils:tradeoff",
      name: "Patient Spear",
      kind: "equipment",
      slot: "weapon",
      rarity: "uncommon",
      quantity: 1,
      modifiers: { power: 1, vitality: 4 },
      restorative: null,
      useMastery: createWeaponUseMastery(),
    };
    const result = fixture({
      seed: "battle-spoils-tradeoff",
      oldItem,
      acceptLoot: (item) => (item.modifiers.power ?? 0) >= 4,
    });
    expect(result.packet).not.toBeNull();
    expect(result.packet?.derivedDelta.power).toBeGreaterThan(0);
    expect(result.packet?.derivedDelta.maxHealth).toBeLessThan(0);
    expect(result.packet?.resourcesAfter.maxHealth).toBe(result.packet?.derivedAfter.maxHealth);
    expect(result.packet?.resourcesAfter.health).toBeLessThanOrEqual(result.packet?.resourcesBefore.health ?? 0);
  });

  it("fails closed for full inventory, equal selection, and unchanged equipment", () => {
    const packed = fixture({ slot: "offhand", fullInventory: true });
    expect(packed.after.depth.hero.inventory.some((item) => item.id === packed.loot.id)).toBe(false);
    expect(packed.packet).toBeNull();

    const equalOld: ItemState = {
      id: "item:battle-spoils:equal",
      name: "Equal Blade",
      kind: "equipment",
      slot: "weapon",
      rarity: "common",
      quantity: 1,
      modifiers: { power: 1 },
      restorative: null,
      useMastery: createWeaponUseMastery(),
    };
    const tied = fixture({
      seed: "battle-spoils-tie",
      oldItem: equalOld,
      acceptLoot: (item) => item.modifiers.power === 1,
    });
    expect(tied.after.depth.hero.equipment.weapon).toBe(equalOld.id);
    expect(tied.packet).toBeNull();
  });

  it("rejects forged Chronicle, combat, loot, slot, and retained-item provenance", () => {
    const result = fixture({ slot: "offhand", oldItem: null });
    expect(result.packet).not.toBeNull();
    expect(projectBattleSpoilsComparison(result.before, result.after, { ...result.source, id: `${result.source.id}:forged` })).toBeNull();
    expect(projectBattleSpoilsComparison(result.before, {
      ...result.after,
      depth: {
        ...result.after.depth,
        completedCombats: result.after.depth.completedCombats.map((combat) =>
          combat.id === result.before.depth.combat?.id ? { ...combat, id: `${combat.id}:forged` } : combat),
      },
    }, result.source)).toBeNull();
    expect(projectBattleSpoilsComparison(result.before, {
      ...result.after,
      depth: {
        ...result.after.depth,
        hero: {
          ...result.after.depth.hero,
          inventory: result.after.depth.hero.inventory.map((item) =>
            item.id === result.loot.id ? { ...item, name: `${item.name} forged` } : item),
        },
      },
    }, result.source)).toBeNull();
    expect(projectBattleSpoilsComparison(result.before, {
      ...result.after,
      depth: {
        ...result.after.depth,
        hero: {
          ...result.after.depth.hero,
          equipment: { ...result.after.depth.hero.equipment, head: result.loot.id },
        },
      },
    }, result.source)).toBeNull();
    expect(projectBattleSpoilsComparison(result.before, {
      ...result.after,
      depth: {
        ...result.after.depth,
        hero: {
          ...result.after.depth.hero,
          experience: result.after.depth.hero.experience + 1,
        },
      },
    }, result.source)).toBeNull();

    const leveling = fixture({ slot: "feet", oldItem: null, experience: 11 });
    expect(leveling.after.depth.hero.level).toBe(2);
    expect(leveling.packet).toBeNull();

    const oldItem: ItemState = {
      id: "item:battle-spoils:retained",
      name: "Retained Blade",
      kind: "equipment",
      slot: "weapon",
      rarity: "common",
      quantity: 1,
      modifiers: { power: 1 },
      restorative: null,
      useMastery: createWeaponUseMastery(),
    };
    const retained = fixture({ oldItem, acceptLoot: (item) => (item.modifiers.power ?? 0) > 1 });
    expect(projectBattleSpoilsComparison(retained.before, {
      ...retained.after,
      depth: {
        ...retained.after.depth,
        hero: {
          ...retained.after.depth.hero,
          inventory: retained.after.depth.hero.inventory.filter((item) => item.id !== oldItem.id),
        },
      },
    }, retained.source)).toBeNull();
  });

  it("rejects forged packet deltas, resources, identities, ordering, and extra keys", () => {
    const packet = fixture({ slot: "body", oldItem: null }).packet;
    if (packet === null) throw new Error("Expected a battle-spoils packet");
    const forgeries: unknown[] = [
      { ...packet, eventId: `${packet.eventId}:forged` },
      { ...packet, slot: "head" },
      { ...packet, oldItemDisposition: "pack" },
      { ...packet, derivedDelta: { ...packet.derivedDelta, armor: packet.derivedDelta.armor + 1 } },
      { ...packet, resourcesAfter: { ...packet.resourcesAfter, maxHealth: packet.resourcesAfter.maxHealth + 1 } },
      { ...packet, newItem: { ...packet.newItem, id: packet.eventId } },
      { ...packet, newItem: { ...packet.newItem, modifiers: [...packet.newItem.modifiers, { schemaVersion: 1, modifier: "strength", amount: 1 }] } },
      { ...packet, mechanicalEffect: "future-effect" },
      { ...packet, extra: true },
    ];
    for (const forged of forgeries) expect(isBattleSpoilsComparisonPacketV1(forged)).toBe(false);
  });
});
