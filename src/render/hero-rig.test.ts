import { describe, expect, it } from "vitest";
import type { SceneMode } from "../core/types";
import { projectHeroRigPose } from "./hero-rig";

const modes: readonly SceneMode[] = ["town", "atlas", "travel", "dungeon", "battle", "training", "discovery", "camp", "chronicle"];

describe("hero rig pose", () => {
  it("projects finite expressive poses for every scene", () => {
    for (const mode of modes) {
      const pose = projectHeroRigPose(mode, 1.25, false);
      expect(Object.values(pose).every(Number.isFinite)).toBe(true);
    }
    expect(projectHeroRigPose("travel", 1.25, false)).not.toEqual(projectHeroRigPose("battle", 1.25, false));
  });

  it("keeps the expressive base pose still under reduced motion", () => {
    for (const mode of modes) {
      expect(projectHeroRigPose(mode, 0, true)).toEqual(projectHeroRigPose(mode, 999, true));
    }
  });
});
