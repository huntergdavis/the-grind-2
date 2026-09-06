import { describe, expect, it } from "vitest";
import { canonicalHash } from "../core/canonical";
import { storyBeatTrainingCorpusV1 } from "./story-beat-training-corpus";
import {
  storyBeatConsequenceMetricsV2,
  storyBeatCostMetricsV2,
  storyBeatLensIdsV2,
} from "./story-beat-mechanics-v2";
import {
  formatFactualStoryBeatPromptV2,
  validateFactualStoryBeatResultV2,
} from "./story-beat-v2";
import {
  factualStoryBeatTrainingCorpusHashV2,
  factualStoryBeatTrainingCorpusRequiredCases,
  factualStoryBeatTrainingCorpusRequiredDevCases,
  factualStoryBeatTrainingCorpusRequiredHoldoutCases,
  factualStoryBeatTrainingCorpusRequiredTrainCases,
  factualStoryBeatTrainingCorpusV2,
  factualStoryBeatTrainingTargetFrameIds,
  isFactualStoryBeatTrainingCaseV2,
  isFactualStoryBeatTrainingCorpusV2,
  type FactualStoryBeatTrainingCaseV2,
} from "./story-beat-v2-training-corpus";

const splits = ["train", "dev", "holdout"] as const;
const modes = [
  "town",
  "atlas",
  "travel",
  "dungeon",
  "battle",
  "training",
  "discovery",
  "camp",
  "chronicle",
] as const;

function withoutCaseHash(
  value: FactualStoryBeatTrainingCaseV2,
): Record<string, unknown> {
  const result = { ...value } as Record<string, unknown>;
  delete result.caseHash;
  return result;
}

function rehashCase(value: Record<string, unknown>): Record<string, unknown> {
  const payload = { ...value };
  delete payload.caseHash;
  return { ...payload, caseHash: canonicalHash(payload) };
}

function rehashCorpus(value: Record<string, unknown>): Record<string, unknown> {
  const payload = { ...value };
  delete payload.corpusHash;
  return { ...payload, corpusHash: canonicalHash(payload) };
}

describe("factual story-beat V2 training corpus", () => {
  it("locks its source, golden hash, exact split counts, order, and case hashes", () => {
    expect(factualStoryBeatTrainingCorpusHashV2).toBe("d66b901b71c4613a");
    expect(factualStoryBeatTrainingCorpusV2.sourceCorpusHash)
      .toBe(storyBeatTrainingCorpusV1.corpusHash);
    expect(factualStoryBeatTrainingCorpusV2.counts).toEqual({
      train: factualStoryBeatTrainingCorpusRequiredTrainCases,
      dev: factualStoryBeatTrainingCorpusRequiredDevCases,
      holdout: factualStoryBeatTrainingCorpusRequiredHoldoutCases,
      total: factualStoryBeatTrainingCorpusRequiredCases,
    });
    expect(factualStoryBeatTrainingCorpusV2.cases)
      .toHaveLength(factualStoryBeatTrainingCorpusRequiredCases);
    expect(factualStoryBeatTrainingCorpusV2.cases.every((entry, index) =>
      entry.sourceCaseId === storyBeatTrainingCorpusV1.cases[index]?.id
      && entry.caseHash === canonicalHash(withoutCaseHash(entry)))).toBe(true);
    expect(new Set(
      factualStoryBeatTrainingCorpusV2.cases.map((entry) => entry.caseHash),
    ).size).toBe(factualStoryBeatTrainingCorpusRequiredCases);
  });

  it("binds every target to the production V2 prompt and result validator", () => {
    expect(factualStoryBeatTrainingCorpusV2.cases.every((entry) =>
      entry.prompt === formatFactualStoryBeatPromptV2(entry.facts)
      && entry.promptCharacters === entry.prompt.length
      && entry.targetWords > 0
      && entry.targetWords <= 24
      && validateFactualStoryBeatResultV2(entry.target, entry.facts) === entry.target
    )).toBe(true);
  });

  it("balances every lens and covers every closed metric in every split", () => {
    const expectedLensCounts = {
      train: [334, 333, 333],
      dev: [42, 43, 43],
      holdout: [67, 67, 66],
    } as const;
    for (const split of splits) {
      const selected = factualStoryBeatTrainingCorpusV2.cases
        .filter((entry) => entry.split === split);
      expect(storyBeatLensIdsV2.map((lens) =>
        selected.filter((entry) => entry.lensId === lens).length
      )).toEqual(expectedLensCounts[split]);
      for (const metric of storyBeatCostMetricsV2) {
        expect(selected.some((entry) => entry.costMetric === metric), `${split}:${metric}`)
          .toBe(true);
      }
      for (const metric of storyBeatConsequenceMetricsV2) {
        expect(
          selected.some((entry) => entry.consequenceMetric === metric),
          `${split}:${metric}`,
        ).toBe(true);
      }
      for (const lens of storyBeatLensIdsV2) {
        for (const frame of factualStoryBeatTrainingTargetFrameIds) {
          expect(selected.some((entry) =>
            entry.lensId === lens && entry.targetFrameId === frame
          ), `${split}:${lens}:${frame}`).toBe(true);
        }
      }
    }
  });

  it("retains every scene mode and inherited split-disjoint source family", () => {
    for (const split of splits) {
      const selected = factualStoryBeatTrainingCorpusV2.cases
        .filter((entry) => entry.split === split);
      for (const mode of modes) {
        expect(selected.some((entry) => entry.mode === mode), `${split}:${mode}`)
          .toBe(true);
      }
      expect(selected.every((entry) =>
        entry.sourceCaseId.includes(`:${split}:`)
        && entry.familyId.startsWith(`${split}-`)
        && entry.targetTemplateFamilyId.startsWith(`${split}-`)
      )).toBe(true);
    }
    const sourceIds = splits.map((split) => new Set(
      factualStoryBeatTrainingCorpusV2.cases
        .filter((entry) => entry.split === split)
        .map((entry) => entry.sourceCaseId),
    ));
    for (let left = 0; left < sourceIds.length; left += 1) {
      for (let right = left + 1; right < sourceIds.length; right += 1) {
        expect([...sourceIds[left]!].filter((id) => sourceIds[right]!.has(id))).toEqual([]);
      }
    }
  });

  it("covers six target frames and locks prompt/target size maxima", () => {
    for (const frame of factualStoryBeatTrainingTargetFrameIds) {
      expect(factualStoryBeatTrainingCorpusV2.cases.some(
        (entry) => entry.targetFrameId === frame,
      ), frame).toBe(true);
    }
    expect([
      Math.max(...factualStoryBeatTrainingCorpusV2.cases.map(
        (entry) => entry.promptCharacters,
      )),
      Math.max(...factualStoryBeatTrainingCorpusV2.cases.map(
        (entry) => entry.target.length,
      )),
      Math.max(...factualStoryBeatTrainingCorpusV2.cases.map(
        (entry) => entry.targetWords,
      )),
    ]).toEqual([585, 134, 23]);
  });

  it("is deeply frozen and preserves exact versioned key order", () => {
    expect(Object.isFrozen(factualStoryBeatTrainingTargetFrameIds)).toBe(true);
    expect(Object.isFrozen(factualStoryBeatTrainingCorpusV2)).toBe(true);
    expect(Object.isFrozen(factualStoryBeatTrainingCorpusV2.counts)).toBe(true);
    expect(Object.isFrozen(factualStoryBeatTrainingCorpusV2.cases)).toBe(true);
    expect(factualStoryBeatTrainingCorpusV2.cases.every((entry) =>
      Object.isFrozen(entry)
      && Object.isFrozen(entry.facts)
      && Object.isFrozen(entry.facts.narrative)
    )).toBe(true);
    expect(Object.keys(factualStoryBeatTrainingCorpusV2)).toEqual([
      "schemaVersion",
      "kind",
      "provenance",
      "sourceCorpusHash",
      "splitPolicy",
      "holdoutPolicy",
      "counts",
      "cases",
      "corpusHash",
    ]);
    expect(Object.keys(factualStoryBeatTrainingCorpusV2.cases[0]!)).toEqual([
      "schemaVersion",
      "kind",
      "id",
      "sourceCaseId",
      "split",
      "familyId",
      "targetTemplateFamilyId",
      "targetFrameId",
      "mode",
      "actor",
      "lensId",
      "costMetric",
      "consequenceMetric",
      "facts",
      "prompt",
      "promptCharacters",
      "target",
      "targetWords",
      "caseHash",
    ]);
  });
});

describe("factual story-beat V2 corpus hostile boundary", () => {
  it("accepts a clone and rejects missing, extra, forged, or stale envelope fields", () => {
    expect(isFactualStoryBeatTrainingCorpusV2(
      structuredClone(factualStoryBeatTrainingCorpusV2),
    )).toBe(true);
    const valid = structuredClone(
      factualStoryBeatTrainingCorpusV2,
    ) as unknown as Record<string, unknown>;
    for (const key of Object.keys(valid)) {
      const missing = { ...valid };
      delete missing[key];
      expect(isFactualStoryBeatTrainingCorpusV2(missing), `missing ${key}`).toBe(false);
    }
    expect(isFactualStoryBeatTrainingCorpusV2({ ...valid, externalText: true }))
      .toBe(false);
    expect(isFactualStoryBeatTrainingCorpusV2({
      ...valid,
      sourceCorpusHash: "0".repeat(16),
    })).toBe(false);
    expect(isFactualStoryBeatTrainingCorpusV2({
      ...valid,
      holdoutPolicy: "train-on-holdout",
    })).toBe(false);
    expect(isFactualStoryBeatTrainingCorpusV2({
      ...valid,
      corpusHash: "0".repeat(16),
    })).toBe(false);
  });

  it("rejects mutated, reordered, duplicated, sparse, and cross-split cases", () => {
    const valid = structuredClone(factualStoryBeatTrainingCorpusV2);
    const first = valid.cases[0] as unknown as Record<string, unknown>;
    expect(isFactualStoryBeatTrainingCaseV2({ ...first, hidden: true })).toBe(false);
    expect(isFactualStoryBeatTrainingCaseV2(rehashCase({
      ...first,
      target: "At Moonclock Vault, invented mechanics rise from 0 to 9.",
    }))).toBe(false);

    const reordered = [...valid.cases];
    [reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!];
    expect(isFactualStoryBeatTrainingCorpusV2(rehashCorpus({
      ...valid,
      cases: reordered,
    }))).toBe(false);

    const duplicated = [...valid.cases];
    duplicated[1] = duplicated[0]!;
    expect(isFactualStoryBeatTrainingCorpusV2(rehashCorpus({
      ...valid,
      cases: duplicated,
    }))).toBe(false);

    const sparse = new Array(factualStoryBeatTrainingCorpusRequiredCases);
    expect(isFactualStoryBeatTrainingCorpusV2(rehashCorpus({
      ...valid,
      cases: sparse,
    }))).toBe(false);

    const holdoutIndex = valid.cases.findIndex((entry) => entry.split === "holdout");
    const leaked = [...valid.cases];
    leaked[0] = leaked[holdoutIndex]!;
    expect(isFactualStoryBeatTrainingCorpusV2(rehashCorpus({
      ...valid,
      cases: leaked,
    }))).toBe(false);
  });

  it("fails closed on proxy traps and throwing case getters", () => {
    expect(isFactualStoryBeatTrainingCorpusV2(new Proxy({}, {
      ownKeys() {
        throw new Error("hostile ownKeys");
      },
    }))).toBe(false);
    const first = structuredClone(factualStoryBeatTrainingCorpusV2.cases[0]!);
    const throwing = Object.defineProperty({ ...first }, "facts", {
      enumerable: true,
      get() {
        throw new Error("hostile facts getter");
      },
    });
    expect(isFactualStoryBeatTrainingCaseV2(throwing)).toBe(false);
  });
});
