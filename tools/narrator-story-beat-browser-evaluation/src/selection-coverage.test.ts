import { describe, expect, it } from "vitest";
import { storyBeatTrainingCorpusV1 } from "../../../src/narrator/story-beat-training-corpus";
import { browserStoryBeatRepresentativeIndexes } from "./protocol";

const expectedModes = Object.freeze([
  "atlas", "battle", "camp", "chronicle", "discovery", "dungeon", "town", "training", "travel",
]);
const expectedFrames = Object.freeze(Array.from({ length: 15 }, (_, index) =>
  String(index + 1).padStart(2, "0")));
const numericClaim = /[+\-−]?\p{N}+(?:[.,]\p{N}+)*(?:[%‰])?/gu;

describe("reviewed representative story-beat vector", () => {
  it("recomputes two cases per mode, all frames, balanced shells, and numeric coverage", () => {
    expect(new Set(browserStoryBeatRepresentativeIndexes).size).toBe(18);
    expect(browserStoryBeatRepresentativeIndexes.every((index) => index >= 0 && index < 200)).toBe(true);

    const holdout = storyBeatTrainingCorpusV1.cases.filter((entry) => entry.split === "holdout");
    expect(holdout).toHaveLength(200);
    const selected = browserStoryBeatRepresentativeIndexes.map((index) => holdout[index]!);
    expect(selected.map((entry) => Number(entry.id.slice(-4))))
      .toEqual(browserStoryBeatRepresentativeIndexes);

    const modeCounts = Object.fromEntries(expectedModes.map((mode) => [
      mode,
      selected.filter((entry) => entry.mode === mode).length,
    ]));
    expect(modeCounts).toEqual(Object.fromEntries(expectedModes.map((mode) => [mode, 2])));

    const frames = selected.map((entry) => {
      const match = /frame-(\d{2})-target-v1$/u.exec(entry.targetTemplateFamilyId);
      expect(match).not.toBeNull();
      return match![1]!;
    });
    expect([...new Set(frames)].sort()).toEqual(expectedFrames);
    expect(new Set(selected.map((entry) => entry.targetTemplateFamilyId)).size).toBe(18);

    const shellCounts = Object.fromEntries(["prefix", "interior", "suffix"].map((shell) => [
      shell,
      selected.filter((entry) => entry.locationShellId === shell).length,
    ]));
    expect(shellCounts).toEqual({ prefix: 6, interior: 6, suffix: 6 });

    const numericIndexes = browserStoryBeatRepresentativeIndexes.filter((_, slot) =>
      (selected[slot]!.facts.action.match(numericClaim) ?? []).length > 0);
    expect(numericIndexes).toEqual([4, 89, 91]);
    expect(selected.filter((entry) => (entry.facts.action.match(numericClaim) ?? []).length > 0)
      .map((entry) => entry.facts.action)).toEqual([
      "Wyra Clover gracefully completes 2 poised turn steps.",
      "Miro Thistle gracefully maps 5 tidal compass lines.",
      "Tora Bell gracefully guards 5 offset ramparts.",
    ]);
  });
});
