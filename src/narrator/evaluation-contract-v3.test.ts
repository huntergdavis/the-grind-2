import { describe, expect, it } from "vitest";
import observedReceipt from "../../docs/narrator/t5-artifact-publication-receipt.json";
import { canonicalHash } from "../core/canonical";
import {
  createNarratorEvaluationRunSpecV2,
  createNarratorEvaluationWorkerBindingV2,
  isNarratorEvaluationRunSpecV2,
  isNarratorEvaluationWorkerBindingV2,
} from "./evaluation-contract-v2";
import {
  createNarratorEvaluationRunSpecV3,
  createNarratorEvaluationWorkerBindingV3,
  isNarratorEvaluationRunSpecV3,
  isNarratorEvaluationWorkerBindingV3,
} from "./evaluation-contract-v3";
import {
  createNarratorEvaluationRunSpecV1,
  isNarratorEvaluationRunSpecV1,
  isNarratorEvaluationWorkerBindingV1,
} from "./evaluation-receipts";
import {
  narratorFormEligibilityPolicyHashV3,
  narratorFormFloat32ScoreHashV3,
  narratorFormGenerationConfigurationHashV3,
  narratorFormInputTokenAccountingHashV3,
  narratorFormPromptFormatterHashV3,
  narratorFormRegistryHashV3,
  narratorFormRendererHashV3,
  narratorFormSelectionContractHashV3,
  narratorFormTargetTokenAccountingHashV3,
  narratorFormTrieSelectionHashV3,
  narratorRenderedSafetyHashV3,
} from "./evaluation-selection-contract-v3";
import { isNarratorModelCandidate, type NarratorModelCandidate } from "./model-candidate";
import {
  createNarratorT5PublishedCandidateV1,
  isNarratorT5ArtifactPublicationReceiptV1,
  type NarratorT5ArtifactPublicationReceiptV1,
} from "./t5-publication-evidence";

type MutableRecord = Record<string, unknown>;

function candidate(): NarratorModelCandidate {
  expect(isNarratorT5ArtifactPublicationReceiptV1(observedReceipt)).toBe(true);
  return createNarratorT5PublishedCandidateV1(observedReceipt as NarratorT5ArtifactPublicationReceiptV1);
}

function rehashedMutation(value: object, mutate: (copy: MutableRecord) => void): MutableRecord {
  const content = structuredClone(value) as MutableRecord;
  delete content.contentHash;
  mutate(content);
  return { ...content, contentHash: canonicalHash(content) };
}

describe("narrator V3 evaluation contract", () => {
  it("binds and deeply freezes the exact published candidate, corpus, and form-selection contract", () => {
    const model = candidate();
    const spec = createNarratorEvaluationRunSpecV3(model, "run:contract:v3");
    expect(isNarratorEvaluationRunSpecV3(spec, model)).toBe(true);
    expect(spec.contentHash).toBe("475ac8514875b3d9");
    expect(spec).toMatchObject({
      schemaVersion: 3,
      candidate: {
        candidateId: "flan-t5-small-q8@8c85146b",
        artifactManifestHash: "cd7b76c208b0aa3d",
        runtimeVersion: "4.2.0",
      },
      corpus: { version: 1, hash: "63b3a0ee9fef092a", caseCount: 200 },
      contract: {
        claim: "model-selected-form-with-deterministic-host-rendering",
        modelGeneratedVisibleProse: false,
      },
    });
    expect(Object.isFrozen(spec)).toBe(true);
    expect(Object.isFrozen(spec.decoding.options)).toBe(true);
  });

  it("mirrors every aggregate and component hash in the worker handshake", () => {
    const model = candidate();
    const spec = createNarratorEvaluationRunSpecV3(model, "run:binding:v3");
    const binding = createNarratorEvaluationWorkerBindingV3(spec, model);
    expect(isNarratorEvaluationWorkerBindingV3(binding, spec, model)).toBe(true);
    expect(binding).toMatchObject({
      schemaVersion: 3,
      runSpecHash: spec.contentHash,
      contractHash: narratorFormSelectionContractHashV3,
      promptFormatterHash: narratorFormPromptFormatterHashV3,
      formRegistryHash: narratorFormRegistryHashV3,
      rendererHash: narratorFormRendererHashV3,
      renderedSafetyHash: narratorRenderedSafetyHashV3,
      eligibilityPolicyHash: narratorFormEligibilityPolicyHashV3,
      inputTokenAccountingHash: narratorFormInputTokenAccountingHashV3,
      targetTokenAccountingHash: narratorFormTargetTokenAccountingHashV3,
      generationConfigurationHash: narratorFormGenerationConfigurationHashV3,
      float32ScoreHash: narratorFormFloat32ScoreHashV3,
      trieSelectionHash: narratorFormTrieSelectionHashV3,
    });
    expect(Object.isFrozen(binding)).toBe(true);
  });

  it("rejects genuine V1/V2/V3 run and worker substitutions", () => {
    const model = candidate();
    const v1 = createNarratorEvaluationRunSpecV1(model, "run:cross-version");
    const v2 = createNarratorEvaluationRunSpecV2(model, "run:cross-version");
    const v3 = createNarratorEvaluationRunSpecV3(model, "run:cross-version");
    expect(isNarratorEvaluationRunSpecV1(v1, model)).toBe(true);
    expect(isNarratorEvaluationRunSpecV2(v2, model)).toBe(true);
    expect(isNarratorEvaluationRunSpecV3(v3, model)).toBe(true);
    expect(isNarratorEvaluationRunSpecV3(v1, model)).toBe(false);
    expect(isNarratorEvaluationRunSpecV3(v2, model)).toBe(false);
    expect(isNarratorEvaluationRunSpecV1(v3, model)).toBe(false);
    expect(isNarratorEvaluationRunSpecV2(v3, model)).toBe(false);
    const v2Binding = createNarratorEvaluationWorkerBindingV2(v2, model);
    const v3Binding = createNarratorEvaluationWorkerBindingV3(v3, model);
    expect(isNarratorEvaluationWorkerBindingV3(v2Binding, v3, model)).toBe(false);
    expect(isNarratorEvaluationWorkerBindingV2(v3Binding, v2, model)).toBe(false);
    expect(isNarratorEvaluationWorkerBindingV1(v3Binding, v1)).toBe(false);
  });

  it("rejects incompatible candidates before a V3 run specification exists", () => {
    const model = candidate();
    if (model.schemaVersion !== 2) throw new Error("Published T5 candidate must use schema V2");
    const renamed = { ...model, candidateId: "flan-t5-small-q8@different" } as NarratorModelCandidate;
    expect(isNarratorModelCandidate(renamed)).toBe(true);
    expect(() => createNarratorEvaluationRunSpecV3(renamed, "run:renamed")).toThrow(TypeError);
    const alteredArtifact = {
      ...model,
      artifacts: model.artifacts.map((artifact, index) => index === 0
        ? { ...artifact, sha256: "0".repeat(64) }
        : artifact),
    } as NarratorModelCandidate;
    expect(isNarratorModelCandidate(alteredArtifact)).toBe(true);
    expect(() => createNarratorEvaluationRunSpecV3(alteredArtifact, "run:artifact-swap")).toThrow(TypeError);

    const alteredCandidates = [
      {
        ...model,
        model: { ...model.model, sourceRevision: "0".repeat(40) },
      },
      {
        ...model,
        model: { ...model.model, sourceRepository: "google/t5-small" },
      },
      {
        ...model,
        model: { ...model.model, license: "MIT" },
      },
      {
        ...model,
        model: { ...model.model, licenseStatus: "unverified" },
      },
      {
        ...model,
        measuredIncrementalMemoryBytes: 1,
      },
    ] as NarratorModelCandidate[];
    for (const altered of alteredCandidates) {
      expect(isNarratorModelCandidate(altered)).toBe(true);
      expect(() => createNarratorEvaluationRunSpecV3(altered, "run:provenance-swap")).toThrow(TypeError);
    }
    const baseInvalidCandidates = [
      { ...model, runtime: { ...model.runtime, license: "MIT" } },
      { ...model, sessions: [...model.sessions].reverse() },
    ] as NarratorModelCandidate[];
    for (const invalid of baseInvalidCandidates) {
      expect(isNarratorModelCandidate(invalid)).toBe(false);
      expect(() => createNarratorEvaluationRunSpecV3(invalid, "run:base-invalid")).toThrow(TypeError);
    }
  });

  it("rejects rehashed run mutations, schema swaps, and unknown nested keys", () => {
    const model = candidate();
    const spec = createNarratorEvaluationRunSpecV3(model, "run:mutations:v3");
    const mutations: Array<(copy: MutableRecord) => void> = [
      (copy) => { copy.schemaVersion = 2; },
      (copy) => { (copy.corpus as MutableRecord).hash = "0".repeat(16); },
      (copy) => { (copy.candidate as MutableRecord).artifactManifestHash = "0".repeat(16); },
      (copy) => { (copy.contract as MutableRecord).rendererHash = "0".repeat(16); },
      (copy) => { (copy.contract as MutableRecord).modelGeneratedVisibleProse = true; },
      (copy) => { ((copy.decoding as MutableRecord).options as MutableRecord).max_new_tokens = 47; },
      (copy) => { (copy.decoding as MutableRecord).extra = true; },
      (copy) => { copy.extra = true; },
    ];
    for (const mutate of mutations) {
      expect(isNarratorEvaluationRunSpecV3(rehashedMutation(spec, mutate), model)).toBe(false);
    }
  });

  it("rejects every worker component substitution and unknown key", () => {
    const model = candidate();
    const spec = createNarratorEvaluationRunSpecV3(model, "run:binding-mutations:v3");
    const binding = createNarratorEvaluationWorkerBindingV3(spec, model);
    const hashes = [
      "contractHash", "promptFormatterHash", "formRegistryHash", "rendererHash", "renderedSafetyHash",
      "eligibilityPolicyHash", "inputTokenAccountingHash", "targetTokenAccountingHash",
      "generationConfigurationHash", "float32ScoreHash", "trieSelectionHash",
    ] as const;
    for (const key of hashes) {
      expect(isNarratorEvaluationWorkerBindingV3({ ...binding, [key]: "0".repeat(16) }, spec, model)).toBe(false);
    }
    expect(isNarratorEvaluationWorkerBindingV3({ ...binding, schemaVersion: 2 }, spec, model)).toBe(false);
    expect(isNarratorEvaluationWorkerBindingV3({ ...binding, extra: true }, spec, model)).toBe(false);
  });
});
