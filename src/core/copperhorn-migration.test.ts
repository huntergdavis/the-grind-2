import { describe, expect, it } from "vitest";
import { advanceWorld, createWorld, upgradeWorldState } from "./simulation";
import type { WorldState } from "./types";

function naturalWorld(tick: number): WorldState {
  let world = createWorld("golden:27", "campaign:27");
  while (world.tick < tick) world = advanceWorld(world);
  return world;
}

function previousSave(world: WorldState) {
  const { inkcap, moonhowl } = world.depth.fieldResearch;
  return { ...world, depth: { ...world.depth, schemaVersion: 24,
    fieldResearch: { schemaVersion: 2, inkcap, moonhowl } } };
}

describe("Copperhorn world-save migration", () => {
  it("preserves all old gameplay and existing studies without rebuilding credit from retained combat history", () => {
    const completed = naturalWorld(89);
    expect(completed.depth.fieldResearch.copperhorn.aftereffect).not.toBeNull();
    const previous = previousSave(completed);
    const bytes = JSON.stringify(previous);
    const migrated = upgradeWorldState(JSON.parse(bytes));
    expect(migrated).toEqual({ ...completed, depth: { ...completed.depth,
      fieldResearch: { ...completed.depth.fieldResearch,
        copperhorn: { taskId: "copperhorn:final-ember@1", application: null, firstTick: null, aftereffect: null } } } });
    expect(JSON.stringify(previous)).toBe(bytes);
    expect(upgradeWorldState(JSON.parse(JSON.stringify(migrated)))).toEqual(migrated);
    expect(upgradeWorldState(JSON.parse(JSON.stringify(completed)))).toEqual(completed);
  });

  it("resumes an actual old active combat and earns only the new post-migration observations", () => {
    // Service turns can move this natural encounter; its retained evidence owns the checkpoint.
    const proof = naturalWorld(89).depth.fieldResearch.copperhorn;
    if (proof.application === null || proof.aftereffect === null) throw new Error("Expected the existing bounded natural Copperhorn witness");
    const before = naturalWorld(proof.application.sourceTick - 1);
    let resumed = upgradeWorldState(JSON.parse(JSON.stringify(previousSave(before))));
    expect(resumed).toEqual(before);
    for (const expectedProgress of [1, 1, 1, 2]) {
      resumed = advanceWorld(resumed);
      const research = resumed.depth.fieldResearch.copperhorn;
      expect(research.aftereffect === null ? research.application === null ? 0 : 1 : 2).toBe(expectedProgress);
      expect(upgradeWorldState(JSON.parse(JSON.stringify(resumed)))).toEqual(resumed);
    }
    expect(resumed).toEqual(naturalWorld(proof.aftereffect.sourceTick));
  });

  it("rejects an old research shape inside a current save and unsupported future depth", () => {
    const current = createWorld("copperhorn-migration-invalid", "campaign");
    expect(() => upgradeWorldState({ ...current,
      depth: { ...current.depth, fieldResearch: previousSave(current).depth.fieldResearch } })).toThrow();
    expect(() => upgradeWorldState({ ...current, depth: { ...current.depth, schemaVersion: 27 } })).toThrow();
  });
});
