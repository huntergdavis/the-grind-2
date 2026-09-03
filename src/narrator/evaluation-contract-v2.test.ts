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
  createNarratorEvaluationRunSpecV1,
  isNarratorEvaluationRunSpecV1,
  isNarratorEvaluationWorkerBindingV1,
  narratorDecodingConfigurationV1,
  narratorPromptFormatterHashV1,
} from "./evaluation-receipts";
import { runNarratorEvaluationV1 } from "./evaluation-runner";
import {
  narratorDecodingConfigurationHashV2,
  narratorPromptAndTokenContractHashV2,
  narratorPromptFormatterHashV2,
} from "./evaluation-prompt-contract";
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

describe("narrator V2 evaluation contract", () => {
  it("binds and deeply freezes the exact published candidate, corpus, and semantic contract", () => {
    const model = candidate();
    const spec = createNarratorEvaluationRunSpecV2(model, "run:contract:v2");
    expect(isNarratorEvaluationRunSpecV2(spec, model)).toBe(true);
    expect(spec.contentHash).toBe("db4319c3d2dacb6e");
    expect(spec).toMatchObject({
      schemaVersion: 2,
      candidate: {
        candidateId: "flan-t5-small-q8@8c85146b",
        artifactManifestHash: "cd7b76c208b0aa3d",
        runtimeVersion: "4.2.0",
      },
      corpus: { version: 1, hash: "63b3a0ee9fef092a", caseCount: 200 },
      contract: { promptFormatterHash: "f4110696dae2785d" },
    });
    expect(Object.isFrozen(spec)).toBe(true);
    expect(Object.isFrozen(spec.decoding.output.normalization.boundedTextPostcondition)).toBe(true);
  });

  it("mirrors every aggregate and component hash in the worker handshake", () => {
    const model = candidate();
    const spec = createNarratorEvaluationRunSpecV2(model, "run:binding:v2");
    const binding = createNarratorEvaluationWorkerBindingV2(spec, model);
    expect(isNarratorEvaluationWorkerBindingV2(binding, spec, model)).toBe(true);
    expect(binding).toMatchObject({
      schemaVersion: 2,
      runSpecHash: spec.contentHash,
      contractHash: narratorPromptAndTokenContractHashV2,
      promptFormatterHash: narratorPromptFormatterHashV2,
      decodingHash: narratorDecodingConfigurationHashV2,
      candidateManifestHash: spec.candidate.candidateManifestHash,
      artifactManifestHash: "cd7b76c208b0aa3d",
    });
    expect(Object.isFrozen(binding)).toBe(true);
  });

  it("rejects V1/V2 substitution in either validator", () => {
    const model = candidate();
    const v1 = createNarratorEvaluationRunSpecV1(model, "run:cross-version");
    const v2 = createNarratorEvaluationRunSpecV2(model, "run:cross-version");
    expect(isNarratorEvaluationRunSpecV1(v1, model)).toBe(true);
    expect(isNarratorEvaluationRunSpecV2(v1, model)).toBe(false);
    expect(isNarratorEvaluationRunSpecV1(v2, model)).toBe(false);
    expect(isNarratorEvaluationWorkerBindingV1(
      createNarratorEvaluationWorkerBindingV2(v2, model), v1,
    )).toBe(false);
  });

  it("keeps the existing V1 runner closed to V2 before any worker access", async () => {
    const model = candidate();
    const v2 = createNarratorEvaluationRunSpecV2(model, "run:v1-runner-scope-lock");
    await expect(runNarratorEvaluationV1(
      model,
      v2 as never,
      null as never,
      null as never,
      new AbortController().signal,
    )).rejects.toThrow("Narrator evaluation run specification is invalid");
  });

  it("rejects incompatible candidates before a run specification exists", () => {
    const model = candidate();
    const renamed = { ...model, candidateId: "flan-t5-small-q8@different" } as NarratorModelCandidate;
    expect(isNarratorModelCandidate(renamed)).toBe(true);
    expect(() => createNarratorEvaluationRunSpecV2(renamed, "run:renamed")).toThrow(TypeError);

    const alteredArtifact = {
      ...model,
      artifacts: model.artifacts.map((artifact, index) => index === 0
        ? { ...artifact, sha256: "0".repeat(64) }
        : artifact),
    } as NarratorModelCandidate;
    expect(isNarratorModelCandidate(alteredArtifact)).toBe(true);
    expect(() => createNarratorEvaluationRunSpecV2(alteredArtifact, "run:artifact-swap")).toThrow(TypeError);
  });

  it("rejects rehashed mutations and unknown nested keys", () => {
    const model = candidate();
    const spec = createNarratorEvaluationRunSpecV2(model, "run:mutations:v2");
    const mutations: Array<(copy: MutableRecord) => void> = [
      (copy) => { (copy.corpus as MutableRecord).hash = "0".repeat(16); },
      (copy) => { (copy.candidate as MutableRecord).artifactManifestHash = "0".repeat(16); },
      (copy) => { (copy.contract as MutableRecord).promptFormatterHash = narratorPromptFormatterHashV1; },
      (copy) => {
        const decoding = copy.decoding as MutableRecord;
        const input = decoding.input as MutableRecord;
        (input.tokenizerOptions as MutableRecord).add_special_tokens = false;
      },
      (copy) => {
        const decoding = copy.decoding as MutableRecord;
        const generation = decoding.generation as MutableRecord;
        (generation.options as MutableRecord).max_new_tokens = 47;
      },
      (copy) => {
        const decoding = copy.decoding as MutableRecord;
        const output = decoding.output as MutableRecord;
        (output.decodeOptions as MutableRecord).skip_special_tokens = false;
      },
      (copy) => { (copy.decoding as MutableRecord).extra = true; },
      (copy) => { copy.extra = true; },
    ];
    for (const mutate of mutations) {
      expect(isNarratorEvaluationRunSpecV2(rehashedMutation(spec, mutate), model)).toBe(false);
    }
  });

  it("rejects every worker-binding component substitution and unknown key", () => {
    const model = candidate();
    const spec = createNarratorEvaluationRunSpecV2(model, "run:binding-mutations:v2");
    const binding = createNarratorEvaluationWorkerBindingV2(spec, model);
    const hashes = [
      "contractHash", "promptFormatterHash", "inputTokenAccountingHash", "generatedTokenAccountingHash",
      "visibleOutputNormalizationHash", "decodingHash",
    ] as const;
    for (const key of hashes) {
      expect(isNarratorEvaluationWorkerBindingV2({ ...binding, [key]: "0".repeat(16) }, spec, model)).toBe(false);
    }
    expect(isNarratorEvaluationWorkerBindingV2({ ...binding, extra: true }, spec, model)).toBe(false);
    expect(isNarratorEvaluationWorkerBindingV2({
      ...binding,
      decodingHash: canonicalHash(narratorDecodingConfigurationV1),
    }, spec, model)).toBe(false);
  });
});
