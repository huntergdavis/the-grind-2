import { describe, expect, it } from "vitest";
import {
  isNarratorExperimentalModelEligible,
  isNarratorExperimentalModelPolicyV1,
  narratorExperimentalArtifactManifestHashMaximumCharacters,
  narratorExperimentalLicenseMaximumCharacters,
  narratorExperimentalModelIdMaximumCharacters,
  narratorExperimentalRevisionMaximumCharacters,
  type NarratorExperimentalEligibilityCapability,
  type NarratorExperimentalModelPolicyV1,
} from "./experimental-policy";

const storedBudget = 100 * 1024 * 1024;

const policy: NarratorExperimentalModelPolicyV1 = {
  schemaVersion: 1,
  kind: "experimental-unrated",
  modelId: "huntergdavis/the-grind-2-narrator-flan-t5-small",
  revision: "8c85146bbe1a9bcaa4b77faa2c7ef52b2e5b8dd4",
  artifactManifestHash: "0123456789abcdef",
  license: "Apache-2.0",
  storedWeightBytes: 97_082_423,
  disclosedDownloadBytes: 120_696_862,
  sourceEvidenceDisposition: "blocked",
  humanQualityEvaluated: false,
  modelAdmitted: false,
  formalDisplayAuthorized: false,
  productionAuthority: false,
};

const standardCapability: NarratorExperimentalEligibilityCapability = {
  execution: "wasm",
  budget: "standard",
  storedWeightBudgetBytes: storedBudget,
};

describe("experimental narrator model policy", () => {
  it("accepts the exact unrated policy without making an incremental-memory claim", () => {
    expect(isNarratorExperimentalModelPolicyV1(policy)).toBe(true);
    expect(isNarratorExperimentalModelEligible(policy, standardCapability)).toBe(true);
    expect(Object.keys(policy)).not.toContain("incrementalMemoryBytes");
    expect(Object.keys(policy)).not.toContain("measuredIncrementalMemoryBytes");
  });

  it("fails closed on unknown, missing, or substituted policy fields", () => {
    const mutations: unknown[] = [
      { ...policy, unknown: true },
      Object.fromEntries(Object.entries(policy).filter(([key]) => key !== "productionAuthority")),
      { ...policy, schemaVersion: 2 },
      { ...policy, kind: "admitted" },
      { ...policy, sourceEvidenceDisposition: "accepted" },
      { ...policy, humanQualityEvaluated: true },
      { ...policy, modelAdmitted: true },
      { ...policy, formalDisplayAuthorized: true },
      { ...policy, productionAuthority: true },
      { ...policy, incrementalMemoryBytes: 1 },
    ];
    for (const mutation of mutations) {
      expect(isNarratorExperimentalModelPolicyV1(mutation)).toBe(false);
    }
  });

  it("requires bounded normalized model identity text", () => {
    const mutations: unknown[] = [
      { ...policy, modelId: "" },
      { ...policy, modelId: " padded" },
      { ...policy, modelId: "model\nnext-line" },
      { ...policy, modelId: "x".repeat(narratorExperimentalModelIdMaximumCharacters + 1) },
      { ...policy, revision: "bad\u202erevision" },
      { ...policy, revision: "revision\tfragment" },
      { ...policy, revision: "a".repeat(narratorExperimentalRevisionMaximumCharacters - 1) },
      { ...policy, revision: "x".repeat(narratorExperimentalRevisionMaximumCharacters + 1) },
      { ...policy, revision: "A".repeat(narratorExperimentalRevisionMaximumCharacters) },
      { ...policy, artifactManifestHash: "a".repeat(narratorExperimentalArtifactManifestHashMaximumCharacters - 1) },
      { ...policy, artifactManifestHash: "x".repeat(narratorExperimentalArtifactManifestHashMaximumCharacters) },
      { ...policy, artifactManifestHash: "A".repeat(narratorExperimentalArtifactManifestHashMaximumCharacters) },
      { ...policy, license: "A\u030A" },
      { ...policy, license: "Apache-2.0\rreplacement" },
      { ...policy, license: "x".repeat(narratorExperimentalLicenseMaximumCharacters + 1) },
    ];
    for (const mutation of mutations) {
      expect(isNarratorExperimentalModelPolicyV1(mutation)).toBe(false);
    }
  });

  it("requires positive safe stored bytes and an integer disclosure covering them", () => {
    const mutations: unknown[] = [
      { ...policy, storedWeightBytes: 0 },
      { ...policy, storedWeightBytes: 1.5 },
      { ...policy, storedWeightBytes: Number.MAX_SAFE_INTEGER + 1 },
      { ...policy, disclosedDownloadBytes: policy.storedWeightBytes - 1 },
      { ...policy, disclosedDownloadBytes: policy.storedWeightBytes + 0.5 },
      { ...policy, disclosedDownloadBytes: Number.MAX_SAFE_INTEGER + 1 },
    ];
    for (const mutation of mutations) {
      expect(isNarratorExperimentalModelPolicyV1(mutation)).toBe(false);
    }
    expect(isNarratorExperimentalModelPolicyV1({
      ...policy,
      disclosedDownloadBytes: policy.storedWeightBytes,
    })).toBe(true);
  });

  it("is eligible only on executable standard devices within their stored-byte budget", () => {
    expect(isNarratorExperimentalModelEligible(policy, {
      ...standardCapability,
      execution: "webgpu",
    })).toBe(true);
    expect(isNarratorExperimentalModelEligible(policy, {
      ...standardCapability,
      budget: "low-end",
    })).toBe(false);
    expect(isNarratorExperimentalModelEligible(policy, {
      ...standardCapability,
      execution: "none",
    })).toBe(false);
    expect(isNarratorExperimentalModelEligible(policy, {
      ...standardCapability,
      execution: "unexpected-runtime" as "wasm",
    })).toBe(false);
    expect(isNarratorExperimentalModelEligible(policy, {
      ...standardCapability,
      storedWeightBudgetBytes: policy.storedWeightBytes - 1,
    })).toBe(false);
    expect(isNarratorExperimentalModelEligible({
      ...policy,
      storedWeightBytes: storedBudget,
      disclosedDownloadBytes: storedBudget,
    }, standardCapability)).toBe(true);
  });

  it("does not treat the legacy admitted-model shape as experimental policy", () => {
    expect(isNarratorExperimentalModelPolicyV1({
      id: policy.modelId,
      revision: policy.revision,
      artifactManifestHash: policy.artifactManifestHash,
      license: policy.license,
      storedWeightBytes: policy.storedWeightBytes,
      incrementalMemoryBytes: 128 * 1024 * 1024,
    })).toBe(false);
  });
});
