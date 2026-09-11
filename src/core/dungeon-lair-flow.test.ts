import { describe, expect, it } from "vitest";
import { naturalDungeonGuardianJourneyFixture } from "../../tests/dungeon-lair-fixtures";
import { projectDungeonGuardianScene } from "../ui/dungeon-guardian-view";
import { advanceWorld, upgradeWorldState } from "./simulation";

describe("an actual entered lair uses the existing battle and recovery flow", () => {
  it("records the real action modes, ordinary XP and natural defeat without a room bonus", () => {
    const { before, arrived, started, turns, resolved, next } = naturalDungeonGuardianJourneyFixture();
    expect(arrived.hero.experience - before.hero.experience).toBe(4);
    expect(started.hero.experience - arrived.hero.experience).toBe(8);
    expect(arrived.scene.mode).toBe("dungeon");
    expect(started.chronicle.at(-1)?.commandType).toBe("start-dungeon-guardian");
    expect(turns).toHaveLength(2);
    expect(turns[0]!.hero.experience - started.hero.experience).toBe(8);
    expect(resolved.hero.experience).toBe(turns[0]!.hero.experience);
    for (const world of [started, ...turns]) {
      expect(world.scene.mode).toBe("battle");
      expect(world.chronicle.at(-1)?.mode).toBe("battle");
      expect(world.depth.dungeon!.currentCellId).toBe(arrived.depth.dungeon!.currentCellId);
    }
    expect(resolved.depth.dungeon!.lair!.encounter!.resolution!.outcome).toBe("defeat");
    expect(resolved.depth.hero.resources.health).toBe(0);
    expect(resolved.depth.hero.gold).toBe(arrived.depth.hero.gold);
    expect(resolved.depth.hero.inventory).toEqual(arrived.depth.hero.inventory);
    expect(next.chronicle.at(-1)?.commandType).toBe("wait");
    expect(next.scene.mode).toBe("camp");
    expect(next.depth.dungeon!.currentCellId).toBe(next.depth.dungeon!.entryCellId);
    expect(next.depth.hero.resources.health).toBeGreaterThan(0);
    expect(next.hero.experience - resolved.hero.experience).toBe(1);
    expect(projectDungeonGuardianScene(next)).toBeNull();
  });

  it("resumes each source boundary without replaying a result or losing the remembered encounter", () => {
    const { arrived, started, resolved, next } = naturalDungeonGuardianJourneyFixture();
    for (const world of [arrived, started, resolved, next]) {
      const loaded = upgradeWorldState(JSON.parse(JSON.stringify(world)));
      expect(loaded).toEqual(world);
      expect(advanceWorld(loaded)).toEqual(advanceWorld(world));
    }
    const continued = advanceWorld(next);
    expect(continued.chronicle.at(-1)?.commandType).not.toBe("start-dungeon-guardian");
    expect(continued.depth.dungeon!.lair).toEqual(resolved.depth.dungeon!.lair);
    expect(projectDungeonGuardianScene(continued)).toBeNull();
  });
});
