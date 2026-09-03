import { describe, expect, it } from "vitest";
import {
  consumeNarratorBenchmarkReportV1,
  createNarratorBlindStudyV1,
  createNarratorRatingReplayRegistryV1,
  createNarratorRatingBundleV1,
  evaluateNarratorBenchmarkV1,
  generateNarratorBlindStudySaltV1,
  isNarratorBenchmarkReportForEvidenceV1,
  isNarratorBlindKeyV1,
  isNarratorBlindSheetV1,
  isNarratorRatingBundleV1,
  isNarratorRatingConsumptionReceiptForEvidenceV1,
  type NarratorBlindRatingChoice,
} from "./blind-evaluation";
import {
  createNarratorCaseReceiptV1,
  createNarratorEvaluationRunSpecV1,
  createNarratorRunReceiptV1,
} from "./evaluation-receipts";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  tinyStoriesInstruct33MInt8Candidate,
  type NarratorModelCandidateV1,
} from "./model-candidate";

function benchmarkCandidate(): NarratorModelCandidateV1 {
  return {
    ...tinyStoriesInstruct33MInt8Candidate,
    model: { ...tinyStoriesInstruct33MInt8Candidate.model, license: "MIT", licenseStatus: "verified" },
  };
}

function successfulReceipt(candidate = benchmarkCandidate()) {
  const runSpec = createNarratorEvaluationRunSpecV1(candidate, "run:blind:v1");
  const rows = narratorEvaluationCasesV1.map((entry, ordinal) => createNarratorCaseReceiptV1({
    runSpecHash: runSpec.contentHash,
    ordinal,
    status: "ok",
    inputTokens: 40,
    outputTokens: 8,
    outputText: entry.allowedOutputs[(ordinal % 2) + 1]!,
    latencyMilliseconds: 100 + ordinal,
  }));
  return createNarratorRunReceiptV1({
    runSpec,
    verifiedArtifacts: candidate.artifacts.map(({ path, byteLength, sha256 }) => ({ path, byteLength, sha256 })),
    load: { status: "ok", latencyMilliseconds: 500 },
    rows,
    dispose: { status: "ok", latencyMilliseconds: 5 },
  });
}

const privateSalt = generateNarratorBlindStudySaltV1();
const otherPrivateSalt = generateNarratorBlindStudySaltV1();

function emptyReplayRegistry() {
  return createNarratorRatingReplayRegistryV1();
}

function passingChoices(
  key: ReturnType<typeof createNarratorBlindStudyV1>["key"],
): NarratorBlindRatingChoice[] {
  const groups = new Map<string, number[]>();
  for (let ordinal = 0; ordinal < narratorEvaluationCasesV1.length; ordinal += 1) {
    const prompt = narratorEvaluationCasesV1[ordinal]!.prompt;
    const stratum = `${prompt.move}:${prompt.facts.energy}:${prompt.voice}`;
    const group = groups.get(stratum) ?? [];
    group.push(ordinal);
    groups.set(stratum, group);
  }
  const selected = Array<NarratorBlindRatingChoice>(200).fill("tie");
  for (const ordinals of groups.values()) {
    const modelWins = Math.ceil(ordinals.length * 0.6);
    const templateWins = Math.ceil(ordinals.length * 0.2);
    for (let rank = 0; rank < ordinals.length; rank += 1) {
      const ordinal = ordinals[rank]!;
      const modelSide = key.items[ordinal]!.modelSide;
      selected[ordinal] = rank < modelWins
        ? modelSide
        : rank < modelWins + templateWins
          ? (modelSide === "left" ? "right" : "left")
          : "tie";
    }
  }
  return selected;
}

describe("narrator blind evaluation", () => {
  it("counterbalances anonymous model sides globally and inside every stratum", () => {
    const candidate = benchmarkCandidate();
    const receipt = successfulReceipt(candidate);
    const study = createNarratorBlindStudyV1(candidate, receipt, "sheet:one", privateSalt);
    expect(study.key.items.filter((item) => item.modelSide === "left")).toHaveLength(100);
    expect(study.key.items.filter((item) => item.modelSide === "right")).toHaveLength(100);
    const strata = new Map<string, { left: number; right: number }>();
    for (const item of study.key.items) {
      const prompt = narratorEvaluationCasesV1[item.ordinal]!.prompt;
      const stratum = `${prompt.move}:${prompt.facts.energy}:${prompt.voice}`;
      const counts = strata.get(stratum) ?? { left: 0, right: 0 };
      counts[item.modelSide] += 1;
      strata.set(stratum, counts);
    }
    expect([...strata.values()].every(({ left, right }) => Math.abs(left - right) <= 1)).toBe(true);
    expect(JSON.stringify(study.sheet)).not.toContain(privateSalt);
    expect(JSON.stringify(study.sheet)).not.toContain("modelSide");
    expect(isNarratorBlindKeyV1(study.key, receipt, study.sheet)).toBe(true);
    expect(isNarratorBlindSheetV1(study.sheet, candidate, receipt, study.key)).toBe(true);
  });

  it("advances a complete preferred run only to named-phone evaluation", () => {
    const candidate = benchmarkCandidate();
    const receipt = successfulReceipt(candidate);
    const study = createNarratorBlindStudyV1(candidate, receipt, "sheet:passing", privateSalt);
    const ratings = createNarratorRatingBundleV1(
      study.sheet,
      "ratings:passing",
      "local-reviewer:one",
      passingChoices(study.key),
    );
    expect(isNarratorRatingBundleV1(ratings, study.sheet)).toBe(true);
    const replayRegistry = emptyReplayRegistry();
    const report = evaluateNarratorBenchmarkV1(candidate, receipt, study.sheet, study.key, ratings, replayRegistry);
    expect(report).toMatchObject({
      firstPassValidityPermille: 1_000,
      unsafeOutputCount: 0,
      acceptedKnowledgeViolations: 0,
      disposition: "advance-to-v04.13b3",
      blockers: [],
      requiredInV04_13b3: ["named-phone-memory-receipt", "incremental-memory-unmeasured"],
      modelAdmitted: false,
      repeatedBurstCount: 0,
      sequencesWithAtLeastTwoVariants: 20,
    });
    expect(report.modelWins).toBeGreaterThanOrEqual(120);
    expect(report.decisiveCount).toBeGreaterThanOrEqual(140);
    expect(report.fullDenominatorScorePermille).toBeGreaterThanOrEqual(600);
    expect(report.modelWinWilsonLowerPermille).toBeGreaterThan(500);
    expect(report.strata).toHaveLength(9);
    expect(isNarratorBenchmarkReportForEvidenceV1(
      report, candidate, receipt, study.sheet, study.key, ratings, replayRegistry,
    )).toBe(true);
    expect(isNarratorBenchmarkReportForEvidenceV1(
      { ...report, modelAdmitted: true }, candidate, receipt, study.sheet, study.key, ratings, replayRegistry,
    )).toBe(false);
  });

  it("keeps the researched candidate blocked regardless of prose ratings", () => {
    const candidate = tinyStoriesInstruct33MInt8Candidate;
    const receipt = successfulReceipt(candidate);
    const study = createNarratorBlindStudyV1(candidate, receipt, "sheet:blocked", privateSalt);
    const ratings = createNarratorRatingBundleV1(
      study.sheet,
      "ratings:blocked",
      "local-reviewer:one",
      passingChoices(study.key),
    );
    const report = evaluateNarratorBenchmarkV1(candidate, receipt, study.sheet, study.key, ratings, emptyReplayRegistry());
    expect(report.disposition).toBe("blocked");
    expect(report.blockers).toEqual(expect.arrayContaining([
      "model-license-unverified",
    ]));
    expect(report.requiredInV04_13b3).toContain("incremental-memory-unmeasured");
    expect(report.modelAdmitted).toBe(false);
  });

  it("forces unsafe rows to unrated and baseline-identical rows to ties", () => {
    const candidate = benchmarkCandidate();
    const original = successfulReceipt(candidate);
    const unsafe = createNarratorCaseReceiptV1({
      runSpecHash: original.runSpec.contentHash,
      ordinal: 0,
      status: "output-policy-rejected",
      inputTokens: 40,
      outputTokens: 8,
      outputText: "A dragon grants five hundred gold.",
      latencyMilliseconds: 20,
    });
    const identical = createNarratorCaseReceiptV1({
      runSpecHash: original.runSpec.contentHash,
      ordinal: 1,
      status: "ok",
      inputTokens: 40,
      outputTokens: 8,
      outputText: narratorEvaluationCasesV1[1]!.deterministicBaseline,
      latencyMilliseconds: 20,
    });
    const receipt = createNarratorRunReceiptV1({
      ...original,
      rows: [unsafe, identical, ...original.rows.slice(2)],
    });
    const study = createNarratorBlindStudyV1(candidate, receipt, "sheet:forced", privateSalt);
    expect(study.sheet.items[0]!.resolution).toBe("unrated-invalid");
    expect(study.sheet.items[0]!.leftText).toBeNull();
    expect(study.sheet.items[0]!.rightText).toBeNull();
    expect(study.sheet.items[1]!.resolution).toBe("auto-tie");
    const selected = passingChoices(study.key);
    selected[0] = "unrated";
    selected[1] = "tie";
    const ratings = createNarratorRatingBundleV1(study.sheet, "ratings:forced", "local-reviewer:one", selected);
    const report = evaluateNarratorBenchmarkV1(candidate, receipt, study.sheet, study.key, ratings, emptyReplayRegistry());
    expect(report.unrated).toBeGreaterThanOrEqual(1);
    expect(report.ties).toBeGreaterThanOrEqual(1);
    expect(() => createNarratorRatingBundleV1(
      study.sheet,
      "ratings:cheat",
      "local-reviewer:one",
      selected.map((choice, ordinal) => ordinal === 0 ? study.key.items[0]!.modelSide : choice),
    )).toThrow();
  });

  it("rejects altered bindings and replayed rating run ids", () => {
    const candidate = benchmarkCandidate();
    const receipt = successfulReceipt(candidate);
    const study = createNarratorBlindStudyV1(candidate, receipt, "sheet:integrity", privateSalt);
    const ratings = createNarratorRatingBundleV1(
      study.sheet,
      "ratings:integrity",
      "local-reviewer:one",
      passingChoices(study.key),
    );
    expect(isNarratorBlindKeyV1({ ...study.key, secretSalt: otherPrivateSalt }, receipt, study.sheet)).toBe(false);
    expect(isNarratorRatingBundleV1({ ...ratings, sheetHash: "0000000000000000" }, study.sheet)).toBe(false);
    const registry = emptyReplayRegistry();
    const report = evaluateNarratorBenchmarkV1(
      candidate, receipt, study.sheet, study.key, ratings, registry,
    );
    const consumption = consumeNarratorBenchmarkReportV1(
      report, candidate, receipt, study.sheet, study.key, ratings, registry,
    );
    expect(isNarratorRatingConsumptionReceiptForEvidenceV1(
      consumption,
      report,
      candidate,
      receipt,
      study.sheet,
      study.key,
      ratings,
      consumption.nextRegistry,
    )).toBe(true);
    const replayed = evaluateNarratorBenchmarkV1(
      candidate, receipt, study.sheet, study.key, ratings, consumption.nextRegistry,
    );
    expect(replayed.disposition).toBe("blocked");
    expect(replayed.blockers).toContain("rating-run-replayed");
    const renamedRatings = createNarratorRatingBundleV1(
      study.sheet,
      "ratings:renamed",
      ratings.raterId,
      ratings.ratings.map((rating) => rating.choice),
    );
    expect(evaluateNarratorBenchmarkV1(
      candidate, receipt, study.sheet, study.key, renamedRatings, consumption.nextRegistry,
    ).blockers).toContain("rating-run-replayed");
  });

  it("reproduces sheet, key, rating, and report hashes from identical inputs", () => {
    const candidate = benchmarkCandidate();
    const receipt = successfulReceipt(candidate);
    const first = createNarratorBlindStudyV1(candidate, receipt, "sheet:stable", privateSalt);
    const second = createNarratorBlindStudyV1(candidate, receipt, "sheet:stable", privateSalt);
    expect(second).toEqual(first);
    const firstRatings = createNarratorRatingBundleV1(
      first.sheet, "ratings:stable", "local-reviewer:one", passingChoices(first.key),
    );
    const secondRatings = createNarratorRatingBundleV1(
      second.sheet, "ratings:stable", "local-reviewer:one", passingChoices(second.key),
    );
    expect(secondRatings.contentHash).toBe(firstRatings.contentHash);
    expect(evaluateNarratorBenchmarkV1(candidate, receipt, second.sheet, second.key, secondRatings, emptyReplayRegistry()))
      .toEqual(evaluateNarratorBenchmarkV1(candidate, receipt, first.sheet, first.key, firstRatings, emptyReplayRegistry()));
  });

  it("scores narrative forms rather than place-specific rendered strings", () => {
    const candidate = benchmarkCandidate();
    const original = successfulReceipt(candidate);
    const rows = narratorEvaluationCasesV1.map((entry, ordinal) => createNarratorCaseReceiptV1({
      runSpecHash: original.runSpec.contentHash,
      ordinal,
      status: "ok",
      inputTokens: 40,
      outputTokens: 8,
      outputText: entry.allowedOutputs[1]!,
      latencyMilliseconds: 100,
    }));
    const receipt = createNarratorRunReceiptV1({ ...original, rows });
    const study = createNarratorBlindStudyV1(candidate, receipt, "sheet:fatigue", privateSalt);
    const ratings = createNarratorRatingBundleV1(
      study.sheet, "ratings:fatigue", "local-reviewer:one", passingChoices(study.key),
    );
    const report = evaluateNarratorBenchmarkV1(candidate, receipt, study.sheet, study.key, ratings, emptyReplayRegistry());
    expect(report.disposition).toBe("blocked");
    expect(report.blockers).toContain("repeated-line-inside-burst");
    expect(report.repeatedBurstCount).toBeGreaterThan(0);
  });

  it("blocks failed load and disposal evidence even when their structures are valid", () => {
    const candidate = benchmarkCandidate();
    const successful = successfulReceipt(candidate);
    const notRunRows = narratorEvaluationCasesV1.map((_, ordinal) => createNarratorCaseReceiptV1({
      runSpecHash: successful.runSpec.contentHash,
      ordinal,
      status: "not-run",
      inputTokens: null,
      outputTokens: null,
      outputText: null,
      latencyMilliseconds: 0,
    }));
    const failedLoad = createNarratorRunReceiptV1({
      ...successful,
      load: { status: "load-error", latencyMilliseconds: 4 },
      rows: notRunRows,
    });
    const failedLoadStudy = createNarratorBlindStudyV1(candidate, failedLoad, "sheet:failed-load", privateSalt);
    const failedLoadRatings = createNarratorRatingBundleV1(
      failedLoadStudy.sheet,
      "ratings:failed-load",
      "local-reviewer:one",
      failedLoadStudy.sheet.items.map(() => "unrated"),
    );
    const loadReport = evaluateNarratorBenchmarkV1(
      candidate, failedLoad, failedLoadStudy.sheet, failedLoadStudy.key, failedLoadRatings, emptyReplayRegistry(),
    );
    expect(loadReport.blockers).toEqual(expect.arrayContaining(["run-load-not-ok", "run-incomplete"]));

    const failedDispose = createNarratorRunReceiptV1({
      ...successful,
      dispose: { status: "error", latencyMilliseconds: 4 },
    });
    const failedDisposeStudy = createNarratorBlindStudyV1(candidate, failedDispose, "sheet:failed-dispose", privateSalt);
    const failedDisposeRatings = createNarratorRatingBundleV1(
      failedDisposeStudy.sheet,
      "ratings:failed-dispose",
      "local-reviewer:one",
      passingChoices(failedDisposeStudy.key),
    );
    const disposeReport = evaluateNarratorBenchmarkV1(
      candidate, failedDispose, failedDisposeStudy.sheet, failedDisposeStudy.key, failedDisposeRatings, emptyReplayRegistry(),
    );
    expect(disposeReport.blockers).toContain("run-dispose-not-ok");
  });

  it("returns a blocked report for malformed evidence without throwing", () => {
    expect(() => evaluateNarratorBenchmarkV1(
      { candidateId: 4 }, { contentHash: [] }, { sheetId: 5 }, null, null, emptyReplayRegistry(),
    )).not.toThrow();
    const report = evaluateNarratorBenchmarkV1(
      { candidateId: 4 }, { contentHash: [] }, { sheetId: 5 }, null, null, emptyReplayRegistry(),
    );
    expect(report).toMatchObject({
      candidateId: "invalid-candidate",
      disposition: "blocked",
      modelAdmitted: false,
    });
    expect(report.blockers).toContain("candidate-schema-invalid");
  });

  it("generates the coordinator salt from 32 Web Crypto bytes", () => {
    const salt = generateNarratorBlindStudySaltV1();
    expect(salt).toMatch(/^[0-9a-f]{64}$/u);
    expect(salt).not.toBe(privateSalt);
    expect(() => createNarratorBlindStudyV1(
      benchmarkCandidate(), successfulReceipt(), "sheet:weak-salt", "predictable",
    )).toThrow();
  });
});
