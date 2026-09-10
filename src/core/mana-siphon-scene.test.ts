import { describe, expect, it } from "vitest";
import { createForwardMotionState } from "./forward-motion";
import { advanceWorld, createWorld, upgradeWorldState } from "./simulation";
import { dungeonTrapAt } from "../depth/dungeon";
import { selectDungeonEntryPlan, stepDepth } from "../depth/state";

function enteredManaDungeon(mana: 0 | 26) {
  const initial = createWorld("browser-dungeon-search:8", "campaign:browser-dungeon-search");
  const locationId = "location:3";
  // The browser's explicit location handoff; the real entry generates the mechanism.
  // Zero mana is the one deliberately varied resource boundary, not a natural journey claim.
  const located = { ...initial.depth,
    hero: { ...initial.depth.hero, resources: { ...initial.depth.hero.resources, mana } },
    atlas: { ...initial.depth.atlas, currentLocationId: locationId,
      discoveredLocationIds: [...new Set([...initial.depth.atlas.discoveredLocationIds, locationId])] },
  };
  const plan = selectDungeonEntryPlan(located);
  if (plan === null) throw new Error("Expected canonical seed8 dungeon entry plan");
  const depth = stepDepth(located, { type: "enter-dungeon", dungeonId: plan.dungeonId, width: plan.width, height: plan.height });
  return upgradeWorldState({ ...initial, tick: depth.tick, depth,
    hero: { ...initial.hero, health: depth.hero.resources.health, gold: depth.hero.gold, experience: depth.hero.experience },
    forwardMotion: createForwardMotionState(locationId, depth.tick),
    lifecycle: { ...initial.lifecycle, simulationTick: depth.tick, worldClockMinutes: depth.tick * 15 },
    scene: { ...initial.scene, mode: "dungeon", headline: "The hero enters the generated maze." },
  });
}

describe("mana-siphon scene classification", () => {
  for (const manaBefore of [26, 0] as const) {
    it(`shows a newly spent siphon at ${manaBefore} MP without claiming HP damage or repeating the alert`, () => {
      const before = enteredManaDungeon(manaBefore);
      const after = advanceWorld(before);
      const targetId = "dungeon:location:3:cell:0,1";
      expect(after.chronicle.at(-1)?.commandType).toBe("move-dungeon");
      expect(dungeonTrapAt(before.depth.dungeon!, targetId)).toMatchObject({ kind: "mana-siphon", phase: "hidden" });
      expect(dungeonTrapAt(after.depth.dungeon!, targetId)).toMatchObject({ kind: "mana-siphon", phase: "triggered" });
      expect(after.depth.hero.resources).toEqual({ health: 45, maxHealth: 45, mana: manaBefore === 0 ? 0 : 19, maxMana: 26 });
      expect(after.scene).toMatchObject({ mode: "dungeon", sensoryIntensity: 3 });
      expect(after.scene.headline).toContain("a marked trap springs!");
      expect(after.scene.action).toContain("hazard is now spent");
      expect(after.scene.consequence).toBe(after.depth.dungeon!.traversalLog.at(-1));
      expect(upgradeWorldState(JSON.parse(JSON.stringify(after)))).toEqual(after);

      const ordinary = advanceWorld(after);
      expect(ordinary.chronicle.at(-1)?.commandType).toBe("move-dungeon");
      expect(ordinary.depth.dungeon!.currentCellId).not.toBe(targetId);
      expect(dungeonTrapAt(ordinary.depth.dungeon!, targetId)?.phase).toBe("triggered");
      expect(ordinary.scene.sensoryIntensity).toBeLessThan(3);
      expect(ordinary.scene.headline).not.toContain("trap springs");
    });
  }
});
