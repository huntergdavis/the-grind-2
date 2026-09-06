import { describe, expect, it } from "vitest";
import {
  storyBeatConsequenceMetricsV2,
  storyBeatCostMetricsV2,
} from "../../../src/narrator/story-beat-mechanics-v2";
import {
  factualStoryBeatTrainingCorpusV2,
  factualStoryBeatTrainingTargetFrameIds,
} from "../../../src/narrator/story-beat-v2-training-corpus";
import { browserFactualStoryBeatRepresentativeIndexes } from "./protocol";

const expectedModes = Object.freeze([
  "atlas", "battle", "camp", "chronicle", "discovery", "dungeon", "town",
  "training", "travel",
]);
const presentationBuckets = Object.freeze([
  "prefix-as", "prefix-while", "interior-as", "interior-while",
  "suffix-as", "suffix-while",
]);

function counts(values: readonly string[], expected: readonly string[]) {
  return Object.fromEntries(expected.map((value) => [
    value,
    values.filter((entry) => entry === value).length,
  ]));
}

describe("reviewed representative factual story-beat V2 vector", () => {
  it("recomputes exact mode, lens, metric, frame, and sequence coverage", () => {
    expect(new Set(browserFactualStoryBeatRepresentativeIndexes).size).toBe(36);
    expect(browserFactualStoryBeatRepresentativeIndexes.every(
      (index) => index >= 0 && index < 200,
    )).toBe(true);
    expect([...browserFactualStoryBeatRepresentativeIndexes].sort(
      (left, right) => left - right,
    )).toEqual(browserFactualStoryBeatRepresentativeIndexes);

    const holdout = factualStoryBeatTrainingCorpusV2.cases.filter(
      (entry) => entry.split === "holdout",
    );
    expect(holdout).toHaveLength(200);
    const selected = browserFactualStoryBeatRepresentativeIndexes.map(
      (index) => holdout[index]!,
    );
    expect(selected.map((entry) => Number(entry.id.slice(-4))))
      .toEqual(browserFactualStoryBeatRepresentativeIndexes);

    expect(counts(selected.map((entry) => entry.mode), expectedModes))
      .toEqual(Object.fromEntries(expectedModes.map((mode) => [mode, 4])));
    expect(counts(
      selected.map((entry) => entry.lensId),
      ["cost", "consequence", "contrast"],
    )).toEqual({ cost: 12, consequence: 12, contrast: 12 });

    const costMetrics = selected
      .map((entry) => entry.costMetric)
      .filter((metric): metric is NonNullable<typeof metric> => metric !== null);
    expect(counts(costMetrics, storyBeatCostMetricsV2))
      .toEqual(Object.fromEntries(
        storyBeatCostMetricsV2.map((metric) => [metric, 8]),
      ));

    const consequenceMetrics = selected
      .map((entry) => entry.consequenceMetric)
      .filter((metric): metric is NonNullable<typeof metric> => metric !== null);
    expect(consequenceMetrics).toHaveLength(storyBeatConsequenceMetricsV2.length);
    expect(counts(consequenceMetrics, storyBeatConsequenceMetricsV2))
      .toEqual(Object.fromEntries(
        storyBeatConsequenceMetricsV2.map((metric) => [metric, 1]),
      ));

    expect(counts(
      selected.map((entry) => entry.targetFrameId),
      factualStoryBeatTrainingTargetFrameIds,
    )).toEqual(Object.fromEntries(
      factualStoryBeatTrainingTargetFrameIds.map((frame) => [frame, 6]),
    ));

    const sequenced = selected.map(
      (_, slot) => presentationBuckets[slot % presentationBuckets.length]!,
    );
    expect(counts(sequenced, presentationBuckets)).toEqual(Object.fromEntries(
      presentationBuckets.map((bucket) => [bucket, 6]),
    ));
  });
});
