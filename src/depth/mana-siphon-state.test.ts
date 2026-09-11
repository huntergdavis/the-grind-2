import { describe, expect, it } from "vitest";
import { advanceWorld, createWorld } from "../core/simulation";
import { disarmingKitId } from "./disarming-kit";
import { dungeonTrapAt, generateDungeon, projectDungeonTraps } from "./dungeon";
import { depthCommandCandidates, selectDungeonEntryPlan, stepDepth, upgradeDepthState } from "./state";
import type { DepthState } from "./types";

const seed = "browser-dungeon-search:8";
const targetId = "dungeon:location:3:cell:0,1";

function enteredFixture(purchase = false): DepthState {
  const world = createWorld(seed, "campaign:browser-dungeon-search");
  const base = purchase ? advanceWorld(world).depth : world.depth;
  // Explicit location staging; entry, trap placement, checks and any purchase
  // are real reducer results, not an uninterrupted town-to-dungeon journey.
  const located = { ...base, atlas: { ...base.atlas, currentLocationId: "location:3",
    discoveredLocationIds: [...new Set([...base.atlas.discoveredLocationIds, "location:3"])] } };
  const plan = selectDungeonEntryPlan(located)!;
  return stepDepth(located, { type: "enter-dungeon", dungeonId: plan.dungeonId, width: plan.width, height: plan.height });
}

function reload(state: DepthState): DepthState {
  return upgradeDepthState(JSON.parse(JSON.stringify(state)), state.seed, state.hero.id, state.hero.name);
}

describe("mana-siphon gameplay and saved expeditions", () => {
  it("generates new rules only at canonical entry, then spends the hidden siphon with exact MP loss and no HP or XP loss", () => {
    const before = enteredFixture();
    expect(before.dungeon!.trapRulesVersion).toBe(2);
    expect(before.dungeon).toEqual(generateDungeon(seed, "dungeon:location:3", 7, 7, true, 2, 2));
    expect(dungeonTrapAt(before.dungeon!, targetId)).toMatchObject({ kind: "mana-siphon", phase: "hidden",
      detectDifficulty: 11, disarmDifficulty: 12 });
    expect(projectDungeonTraps(before.dungeon!).some((trap) => trap.cellId === targetId)).toBe(false);
    expect(before.hero.resources).toMatchObject({ health: 45, maxHealth: 45, mana: 26, maxMana: 26 });
    const command = depthCommandCandidates(before)[0]!.command;
    expect(command).toEqual({ type: "move-dungeon", direction: "south" });
    const after = stepDepth(before, command);
    expect(after.tick).toBe(before.tick + 1);
    expect(after.hero).toEqual({ ...before.hero, resources: { ...before.hero.resources, mana: 19 } });
    expect(dungeonTrapAt(after.dungeon!, targetId)?.phase).toBe("triggered");
    expect(after.log.at(-1)!.message).toContain("drains 7 MP");
    expect(after.log.at(-1)!.message).toContain("26→19/26 MP; HP unchanged.");
    expect(after.log.at(-1)!.message).not.toContain("for 0 HP");
    expect(reload(after)).toEqual(after);
    expect(stepDepth(reload(before), command)).toEqual(after);
    expect(() => stepDepth(after, { type: "disarm-dungeon-trap" })).toThrow("no detected");
  });

  it.each([0, 2])("records a spent siphon with %i MP available, without inventing HP damage", (mana) => {
    const entered = enteredFixture();
    const before = { ...entered, hero: { ...entered.hero, resources: { ...entered.hero.resources, mana } } };
    const after = stepDepth(before, { type: "move-dungeon", direction: "south" });
    expect(after.hero.resources).toEqual({ ...before.hero.resources, mana: 0 });
    expect(after.log.at(-1)!.message).toContain(`drains ${mana} MP`);
    expect(dungeonTrapAt(after.dungeon!, targetId)?.phase).toBe("triggered");
    expect(reload(after)).toEqual(after);
  });

  it.each([false, true])("uses a real search and same-roll disarm, with purchased assistance=%s", (purchase) => {
    const entered = enteredFixture(purchase);
    let state = { ...entered, hero: { ...entered.hero, resources: { ...entered.hero.resources, health: 22 } } };
    for (const type of ["search-dungeon", "move-dungeon", "disarm-dungeon-trap"]) {
      const command = depthCommandCandidates(state)[0]!.command;
      expect(command.type).toBe(type);
      state = stepDepth(state, command);
    }
    expect(state.hero.resources.health).toBe(22);
    expect(state.hero.resources.mana).toBe(purchase ? 26 : 19);
    expect(state.hero.experience).toBe(entered.hero.experience);
    expect(dungeonTrapAt(state.dungeon!, targetId)?.phase).toBe(purchase ? "disarmed" : "triggered");
    if (purchase) {
      expect(entered.latestDisarmingKitPurchase).toMatchObject({ goldBefore: 12, goldAfter: 7, quantityAfter: 1 });
      expect(state.dungeon!.latestDisarmKitUse).toMatchObject({ kind: "mana-siphon", itemId: disarmingKitId(state.hero.id),
        attribute: "intellect", skill: 11, roll: 0, baseTotal: 11, bonus: 2, total: 13, difficulty: 12,
        success: true, quantityBefore: 1, quantityAfter: 0 });
      expect(state.hero.inventory.some((item) => item.id === disarmingKitId(state.hero.id))).toBe(false);
      expect(state.latestDisarmingKitPurchase).toEqual(entered.latestDisarmingKitPurchase);
    } else {
      expect(state.dungeon!.latestDisarmKitUse).toBeNull();
      expect(state.log.at(-1)!.message).toContain("disarm fails (intellect 11 vs 12)");
    }
    expect(reload(state)).toEqual(state);
    expect(() => stepDepth(state, { type: "disarm-dungeon-trap" })).toThrow("no detected");
  });

  it("migrates v26 without rebuilding existing rooms, traps, resources or history", () => {
    const base = enteredFixture();
    const legacy = generateDungeon(seed, "dungeon:location:3", 7, 7, true, 2, 1);
    const { trapRulesVersion: _rules, ...oldDungeon } = legacy;
    for (const dungeon of [oldDungeon, null]) {
      const old = { ...base, schemaVersion: 26, dungeon };
      const migrated = upgradeDepthState(structuredClone(old), seed, base.hero.id, base.hero.name);
      expect(migrated).toEqual({ ...old, schemaVersion: 34,
        dungeon: dungeon === null ? null : { ...dungeon, trapRulesVersion: 1 } });
      expect(reload(migrated)).toEqual(migrated);
    }
    for (const trapRulesVersion of [undefined, null, 0, 3, "2"]) {
      const malformed = { ...base, schemaVersion: 26, dungeon: { ...legacy, trapRulesVersion } };
      expect(() => upgradeDepthState(malformed, seed, base.hero.id, base.hero.name)).toThrow();
    }
    const { trapRulesVersion: _newRules, ...unsupported } = base.dungeon!;
    expect(() => upgradeDepthState({ ...base, schemaVersion: 26, dungeon: unsupported }, seed, base.hero.id, base.hero.name)).toThrow();
  });
});
