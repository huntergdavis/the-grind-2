import { describe, expect, it } from "vitest";
import { advanceWorld, createWorld, upgradeWorldState } from "./simulation";
import type { WorldState } from "./types";
import { releasedCopperhornWorld } from "../../tests/released-copperhorn-fixtures";

function previousSave(world: WorldState) {
  const { inkcap, moonhowl } = world.depth.fieldResearch;
  return { ...world, depth: { ...world.depth, schemaVersion: 24,
    fieldResearch: { schemaVersion: 2, inkcap, moonhowl } } };
}

describe("Copperhorn released-world-save migration", () => {
  it("preserves all old gameplay and existing studies without rebuilding credit from retained combat history", () => {
    const completed = releasedCopperhornWorld(89);
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
    // Released source receipts own these checkpoints; current commands must earn the observations.
    const proof = releasedCopperhornWorld(89).depth.fieldResearch.copperhorn;
    if (proof.application === null || proof.aftereffect === null) throw new Error("Expected the exact released Copperhorn witness");
    const before = releasedCopperhornWorld(proof.application.sourceTick - 1);
    let resumed = upgradeWorldState(JSON.parse(JSON.stringify(previousSave(before))));
    expect(resumed).toEqual(before);
    for (const expectedProgress of [1, 1, 1, 2]) {
      resumed = advanceWorld(resumed);
      const research = resumed.depth.fieldResearch.copperhorn;
      expect(research.aftereffect === null ? research.application === null ? 0 : 1 : 2).toBe(expectedProgress);
      expect(upgradeWorldState(JSON.parse(JSON.stringify(resumed)))).toEqual(resumed);
    }
    expect(resumed).toEqual(releasedCopperhornWorld(proof.aftereffect.sourceTick));
  });

  it("rejects an old research shape inside a current save and unsupported future depth", () => {
    const current = createWorld("copperhorn-migration-invalid", "campaign");
    expect(upgradeWorldState(structuredClone(current))).toEqual(current);
    expect(() => upgradeWorldState({ ...current,
      depth: { ...current.depth, fieldResearch: previousSave(current).depth.fieldResearch } })).toThrow();
    expect(() => upgradeWorldState({ ...current,
      depth: { ...current.depth, schemaVersion: current.depth.schemaVersion + 1 } })).toThrow();
  });
});
