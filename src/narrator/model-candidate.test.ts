import { describe, expect, it } from "vitest";
import {
  isNarratorModelCandidateV1,
  narratorCandidateManifestBlockers,
  narratorCandidateStoredBytes,
  tinyStoriesInstruct33MInt8Candidate,
  type NarratorModelCandidateV1,
} from "./model-candidate";

function admittedFixture(): NarratorModelCandidateV1 {
  return {
    ...tinyStoriesInstruct33MInt8Candidate,
    model: {
      ...tinyStoriesInstruct33MInt8Candidate.model,
      license: "MIT",
      licenseStatus: "verified",
    },
    measuredIncrementalMemoryBytes: 200 * 1024 * 1024,
  };
}

describe("narrator model candidate manifest", () => {
  it("pins every candidate byte and stays below the first stored-byte gate", () => {
    expect(tinyStoriesInstruct33MInt8Candidate.model.revision).toHaveLength(40);
    expect(tinyStoriesInstruct33MInt8Candidate.model.sourceRevision).toHaveLength(40);
    expect(tinyStoriesInstruct33MInt8Candidate.artifacts).toHaveLength(8);
    expect(narratorCandidateStoredBytes(tinyStoriesInstruct33MInt8Candidate)).toBe(82_096_737);
    expect(tinyStoriesInstruct33MInt8Candidate.artifacts.every((artifact) => /^[0-9a-f]{64}$/u.test(artifact.sha256))).toBe(true);
    expect(Object.isFrozen(tinyStoriesInstruct33MInt8Candidate)).toBe(true);
    expect(Object.isFrozen(tinyStoriesInstruct33MInt8Candidate.artifacts)).toBe(true);
    expect(isNarratorModelCandidateV1(tinyStoriesInstruct33MInt8Candidate)).toBe(true);
    expect(tinyStoriesInstruct33MInt8Candidate.runtime).toMatchObject({
      package: "@huggingface/transformers",
      version: "4.2.0",
      license: "Apache-2.0",
      unpackedByteLength: 9_536_375,
    });
  });

  it("keeps the researched candidate benchmark-only until license and memory are verified", () => {
    expect(narratorCandidateManifestBlockers(tinyStoriesInstruct33MInt8Candidate)).toEqual([
      "model-license-unverified",
      "incremental-memory-unmeasured",
    ]);
  });

  it("admits only a pinned permissive manifest inside both byte budgets", () => {
    expect(narratorCandidateManifestBlockers(admittedFixture())).toEqual([]);
    expect(narratorCandidateManifestBlockers({
      ...admittedFixture(),
      model: { ...admittedFixture().model, license: "custom-research-only" },
    })).toContain("model-license-not-permissive");
    expect(narratorCandidateManifestBlockers({
      ...admittedFixture(),
      artifacts: [
        ...admittedFixture().artifacts,
        { ...admittedFixture().artifacts[1]!, path: "duplicate" },
        { ...admittedFixture().artifacts[1]!, path: "duplicate" },
      ],
    })).toContain("artifact-path-duplicate");
    expect(narratorCandidateManifestBlockers({
      ...admittedFixture(),
      artifacts: admittedFixture().artifacts.map((artifact, index) =>
        index === 0 ? { ...artifact, byteLength: 101 * 1024 * 1024 } : artifact),
    })).toContain("stored-byte-budget-exceeded");
    expect(narratorCandidateManifestBlockers({
      ...admittedFixture(),
      measuredIncrementalMemoryBytes: 257 * 1024 * 1024,
    })).toContain("incremental-memory-budget-exceeded");
  });

  it("rejects forged schemas, runtime identities, unsafe paths, and missing artifact roles", () => {
    expect(narratorCandidateManifestBlockers({ ...admittedFixture(), extra: true })).toEqual([
      "candidate-schema-invalid",
    ]);
    expect(narratorCandidateManifestBlockers({
      ...admittedFixture(),
      runtime: { ...admittedFixture().runtime, package: "lookalike-transformers" },
    })).toEqual(["candidate-schema-invalid"]);
    expect(narratorCandidateManifestBlockers({
      ...admittedFixture(),
      runtime: { ...admittedFixture().runtime, integrity: "sha512-a" },
    })).toEqual(["candidate-schema-invalid"]);
    expect(narratorCandidateManifestBlockers({
      ...admittedFixture(),
      runtime: { ...admittedFixture().runtime, integrity: `sha512-${"a".repeat(87)}=` },
    })).toEqual(["candidate-schema-invalid"]);
    expect(narratorCandidateManifestBlockers({
      ...admittedFixture(),
      artifacts: admittedFixture().artifacts.map((artifact, index) =>
        index === 0 ? { ...artifact, path: "../model.onnx" } : artifact),
    })).toEqual(["candidate-schema-invalid"]);
    expect(narratorCandidateManifestBlockers({
      ...admittedFixture(),
      artifacts: admittedFixture().artifacts.filter((artifact) => artifact.role !== "tokenizer"),
    })).toEqual(["candidate-schema-invalid"]);
    expect(narratorCandidateManifestBlockers({
      ...admittedFixture(),
      artifacts: admittedFixture().artifacts.map((artifact, index) =>
        index === 0 ? { ...artifact, role: "configuration" } : artifact),
    })).toEqual(["candidate-schema-invalid"]);
  });
});
