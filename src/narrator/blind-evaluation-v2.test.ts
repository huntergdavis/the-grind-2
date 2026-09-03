import { describe, expect, it } from "vitest";
import observedReceipt from "../../docs/narrator/t5-artifact-publication-receipt.json";
import { canonicalHash } from "../core/canonical";
import { isNarratorBlindSheetV1 } from "./blind-evaluation";
import {
  createNarratorBlindStudyV2,
  generateNarratorBlindStudySaltV2,
  isNarratorBlindKeyV2,
  isNarratorBlindRaterSheetV2,
  isNarratorBlindSheetV2,
} from "./blind-evaluation-v2";
import {
  createNarratorEvaluationRunSpecV2,
  createNarratorEvaluationWorkerBindingV2,
} from "./evaluation-contract-v2";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  createNarratorCaseReceiptV2,
  createNarratorRunReceiptV2,
} from "./evaluation-receipts-v2";
import type { NarratorModelCandidate } from "./model-candidate";
import {
  createNarratorT5PublishedCandidateV1,
  isNarratorT5ArtifactPublicationReceiptV1,
  type NarratorT5ArtifactPublicationReceiptV1,
} from "./t5-publication-evidence";

const privateSalt = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function candidate(): NarratorModelCandidate {
  expect(isNarratorT5ArtifactPublicationReceiptV1(observedReceipt)).toBe(true);
  return createNarratorT5PublishedCandidateV1(observedReceipt as NarratorT5ArtifactPublicationReceiptV1);
}

function runReceipt(model = candidate()) {
  const runSpec = createNarratorEvaluationRunSpecV2(model, "run:v2:blind");
  const rows = narratorEvaluationCasesV1.map((entry, ordinal) => {
    if (ordinal === 0) {
      return createNarratorCaseReceiptV2({
        runSpecHash: runSpec.contentHash,
        ordinal,
        status: "normalization-error",
        inputTokenIds: [10, 1],
        fullDecoderTokenIds: [0, 11, 1],
        latencyMilliseconds: 10,
      });
    }
    return createNarratorCaseReceiptV2({
      runSpecHash: runSpec.contentHash,
      ordinal,
      status: "ok",
      inputTokenIds: [10 + ordinal, 1],
      fullDecoderTokenIds: [0, 20 + ordinal, 1],
      outputText: ordinal === 1 ? entry.deterministicBaseline : entry.allowedOutputs[1]!,
      latencyMilliseconds: 10 + ordinal,
    });
  });
  return createNarratorRunReceiptV2({
    runSpec,
    workerEpoch: "worker-epoch:test",
    workerBinding: createNarratorEvaluationWorkerBindingV2(runSpec, model),
    verifiedArtifacts: model.artifacts.map(({ path, byteLength, sha256 }) => ({ path, byteLength, sha256 })),
    load: { stage: "model-load", status: "ok", latencyMilliseconds: 500 },
    rows,
    dispose: { status: "ok", latencyMilliseconds: 5 },
    termination: { status: "not-requested" },
  });
}

describe("narrator V2 blind evaluation", () => {
  it("exports a secret-free rater sheet and a separate coordinator key", () => {
    const model = candidate();
    const receipt = runReceipt(model);
    const study = createNarratorBlindStudyV2(model, receipt, "sheet:v2:secrecy", privateSalt);
    expect(isNarratorBlindRaterSheetV2(study.sheet, model, receipt)).toBe(true);
    expect(isNarratorBlindSheetV2(study.sheet, model, receipt, study.key)).toBe(true);
    expect(isNarratorBlindKeyV2(study.key, model, receipt, study.sheet)).toBe(true);
    expect(study.sheet).toMatchObject({ schemaVersion: 2, modelAdmitted: false, displayAuthorized: false });
    expect(study.key).toMatchObject({ schemaVersion: 2, modelAdmitted: false, displayAuthorized: false });
    const publicExport = JSON.stringify(study.sheet);
    expect(publicExport).not.toContain(privateSalt);
    expect(publicExport).not.toContain("secretSalt");
    expect(publicExport).not.toContain("modelSide");
    expect(publicExport).not.toContain("inputTokenIds");
    expect(publicExport).not.toContain("fullDecoderTokenIds");
    expect(isNarratorBlindSheetV1(study.sheet, model, receipt, study.key)).toBe(false);
  });

  it("balances model sides globally and within every prompt stratum", () => {
    const model = candidate();
    const receipt = runReceipt(model);
    const { key } = createNarratorBlindStudyV2(model, receipt, "sheet:v2:balance", privateSalt);
    expect(key.items.filter((item) => item.modelSide === "left")).toHaveLength(100);
    expect(key.items.filter((item) => item.modelSide === "right")).toHaveLength(100);
    const strata = new Map<string, { left: number; right: number }>();
    key.items.forEach((item, ordinal) => {
      const prompt = narratorEvaluationCasesV1[ordinal]!.prompt;
      const stratum = `${prompt.move}:${prompt.facts.energy}:${prompt.voice}`;
      const counts = strata.get(stratum) ?? { left: 0, right: 0 };
      counts[item.modelSide] += 1;
      strata.set(stratum, counts);
    });
    expect([...strata.values()].every(({ left, right }) => Math.abs(left - right) <= 1)).toBe(true);
  });

  it("hides invalid output and forces a baseline-identical output to auto-tie", () => {
    const model = candidate();
    const receipt = runReceipt(model);
    const { sheet } = createNarratorBlindStudyV2(model, receipt, "sheet:v2:resolution", privateSalt);
    expect(sheet.items[0]).toMatchObject({
      resolution: "unrated-invalid", leftText: null, rightText: null,
    });
    expect(sheet.items[1]!.resolution).toBe("auto-tie");
    expect(sheet.items[1]!.leftText).toBe(narratorEvaluationCasesV1[1]!.deterministicBaseline);
    expect(sheet.items[1]!.rightText).toBe(narratorEvaluationCasesV1[1]!.deterministicBaseline);
  });

  it("is reproducible and rejects altered key or sheet bindings", () => {
    const model = candidate();
    const receipt = runReceipt(model);
    const first = createNarratorBlindStudyV2(model, receipt, "sheet:v2:stable", privateSalt);
    const second = createNarratorBlindStudyV2(model, receipt, "sheet:v2:stable", privateSalt);
    expect(second).toEqual(first);
    expect(isNarratorBlindKeyV2(
      { ...first.key, secretSalt: "a".repeat(64) }, model, receipt, first.sheet,
    )).toBe(false);
    expect(isNarratorBlindSheetV2(
      { ...first.sheet, contractHash: "0".repeat(16) }, model, receipt, first.key,
    )).toBe(false);
    const firstRatedOrdinal = first.sheet.items.findIndex((item) => item.resolution === "rate");
    const alteredItems = [...first.sheet.items];
    const original = alteredItems[firstRatedOrdinal]!;
    alteredItems[firstRatedOrdinal] = { ...original, leftText: original.rightText, rightText: original.leftText };
    const sheetContent = { ...first.sheet, items: alteredItems } as Record<string, unknown>;
    delete sheetContent.contentHash;
    const swappedSheet = { ...sheetContent, contentHash: canonicalHash(sheetContent) };
    expect(isNarratorBlindRaterSheetV2(swappedSheet, model, receipt)).toBe(true);
    expect(isNarratorBlindSheetV2(swappedSheet, model, receipt, first.key)).toBe(false);
    expect(isNarratorBlindKeyV2(first.key, model, receipt, swappedSheet)).toBe(false);
    const sparseItems = Array(first.sheet.items.length);
    const sparseSheetContent = { ...first.sheet, items: sparseItems } as Record<string, unknown>;
    delete sparseSheetContent.contentHash;
    const sparseSheet = { ...sparseSheetContent, contentHash: canonicalHash(sparseSheetContent) };
    expect(() => isNarratorBlindRaterSheetV2(sparseSheet, model, receipt)).not.toThrow();
    expect(isNarratorBlindRaterSheetV2(sparseSheet, model, receipt)).toBe(false);
    const sparseKeyContent = { ...first.key, items: Array(first.key.items.length) } as Record<string, unknown>;
    delete sparseKeyContent.contentHash;
    const sparseKey = { ...sparseKeyContent, contentHash: canonicalHash(sparseKeyContent) };
    expect(() => isNarratorBlindKeyV2(sparseKey, model, receipt, first.sheet)).not.toThrow();
    expect(isNarratorBlindKeyV2(sparseKey, model, receipt, first.sheet)).toBe(false);
    expect(Object.isFrozen(first.sheet.items[0])).toBe(true);
    expect(Object.isFrozen(first.key.items[0])).toBe(true);
  });

  it("returns false for malformed imported evidence without throwing", () => {
    const model = candidate();
    const receipt = runReceipt(model);
    const study = createNarratorBlindStudyV2(model, receipt, "sheet:v2:malformed", privateSalt);
    for (const malformed of [null, {}, { contentHash: [] }, { ...study.sheet, items: null }]) {
      expect(() => isNarratorBlindKeyV2(study.key, model, malformed, malformed)).not.toThrow();
      expect(isNarratorBlindKeyV2(study.key, model, malformed, malformed)).toBe(false);
      expect(() => isNarratorBlindSheetV2(malformed, model, receipt, study.key)).not.toThrow();
      expect(isNarratorBlindSheetV2(malformed, model, receipt, study.key)).toBe(false);
    }
  });

  it("draws a private salt from exactly 32 Web Crypto bytes", () => {
    let requested = 0;
    const salt = generateNarratorBlindStudySaltV2({
      getRandomValues<T extends ArrayBufferView | null>(array: T): T {
        requested = array?.byteLength ?? 0;
        if (array instanceof Uint8Array) array.fill(0xab);
        return array;
      },
    });
    expect(requested).toBe(32);
    expect(salt).toBe("ab".repeat(32));
  });
});
