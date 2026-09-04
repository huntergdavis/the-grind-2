import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  auditNarratorBrowserRateabilityEvidenceSetV3,
  finalizeNarratorBrowserRateabilityEvidenceV3,
  narratorBrowserRateabilityEvidenceFileNamesV3,
  narratorBrowserRateabilityEvidencePredicateContractV3,
  narratorBrowserRateabilityEvidencePredicateIdsV3,
  parseNarratorBrowserRateabilityArgumentsV3,
  serializeNarratorBrowserRateabilityEvidenceJsonV3,
  verifyNarratorBrowserRateabilityEvidenceSetV3,
} from "../run-support.mjs";
import {
  canonicalHash,
  canonicalStringify,
  fixture,
  rehash,
  replacePackagedEvidence,
  sha256,
} from "./rateability-fixture.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })));
});


async function outputFixture() {
  const root = await mkdtemp(resolve(tmpdir(), "grind2-rateability-support-"));
  temporaryRoots.push(root);
  const repositoryRoot = resolve(root, "repository");
  const outputParent = resolve(root, "private-output");
  await Promise.all([
    mkdir(repositoryRoot, { mode: 0o700 }),
    mkdir(outputParent, { mode: 0o700 }),
  ]);
  return {
    root,
    repositoryRoot,
    outputParent,
    outputDirectory: resolve(outputParent, "evidence"),
  };
}

describe("V3 narrator browser rateability arguments", () => {
  it("accepts exactly one run invocation with all five named options", () => {
    const parsed = parseNarratorBrowserRateabilityArgumentsV3([
      "run",
      "--sheet-id", "sheet:001",
      "--model-dir", "/private/model",
      "--secret-salt-file", "/private/salt",
      "--out", "/private/evidence",
      "--run-id", "run:001",
    ]);
    expect(parsed).toEqual({
      mode: "run",
      "sheet-id": "sheet:001",
      "model-dir": "/private/model",
      "secret-salt-file": "/private/salt",
      out: "/private/evidence",
      "run-id": "run:001",
    });
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it.each([
    [],
    ["smoke", "--model-dir", "m", "--run-id", "r", "--out", "o", "--sheet-id", "s", "--secret-salt-file", "k"],
    ["run", "--model-dir", "m", "--run-id", "r", "--out", "o", "--sheet-id", "s"],
    ["run", "--model-dir", "m", "--run-id", "r", "--out", "o", "--sheet-id", "s", "--unknown", "x"],
    ["run", "--model-dir", "m", "--model-dir", "n", "--out", "o", "--sheet-id", "s", "--secret-salt-file", "k"],
    ["run", "model-dir", "m", "--run-id", "r", "--out", "o", "--sheet-id", "s", "--secret-salt-file", "k"],
    ["run", "--model-dir", "", "--run-id", "r", "--out", "o", "--sheet-id", "s", "--secret-salt-file", "k"],
  ])("rejects incomplete, duplicate, unknown, malformed, and non-run arguments", (argv) => {
    expect(parseNarratorBrowserRateabilityArgumentsV3(argv)).toBeNull();
  });
});

describe("V3 narrator browser rateability evidence verification", () => {
  it("returns a frozen ordered all-pass predicate audit for valid evidence", () => {
    const audit = auditNarratorBrowserRateabilityEvidenceSetV3(fixture());
    expect(audit.predicates).toEqual(narratorBrowserRateabilityEvidencePredicateIdsV3.map((id) => ({
      id,
      status: "pass",
      blockedBy: [],
    })));
    expect(audit).toMatchObject({
      schemaVersion: 1,
      auditId: "the-grind-2:narrator-browser-rateability-evidence-audit:v3",
      verdict: "pass",
      failedPredicateIds: [],
      notEvaluatedPredicateIds: [],
    });
    expect(narratorBrowserRateabilityEvidencePredicateContractV3.map(({ id }) => id))
      .toEqual(narratorBrowserRateabilityEvidencePredicateIdsV3);
    expect(Object.isFrozen(narratorBrowserRateabilityEvidencePredicateContractV3)).toBe(true);
    expect(Object.isFrozen(audit)).toBe(true);
    expect(Object.isFrozen(audit.predicates)).toBe(true);
    expect(Object.isFrozen(audit.failedPredicateIds)).toBe(true);
    expect(Object.isFrozen(audit.notEvaluatedPredicateIds)).toBe(true);
    expect(audit.predicates.every(Object.isFrozen)).toBe(true);
    expect(audit.predicates.every(({ blockedBy }) => Object.isFrozen(blockedBy))).toBe(true);
  });

  it("returns a deterministic failure audit for malformed cyclic input", () => {
    const cyclic = {};
    cyclic.expectedBindings = cyclic;
    let first;
    expect(() => {
      first = auditNarratorBrowserRateabilityEvidenceSetV3(cyclic);
    }).not.toThrow();
    const second = auditNarratorBrowserRateabilityEvidenceSetV3(cyclic);
    expect(first).toEqual(second);
    expect(first.verdict).toBe("fail");
    expect(first.failedPredicateIds).toEqual([
      "nrv3.expected-bindings.schema",
      "nrv3.evidence.content-hashes",
      "nrv3.evidence.schemas",
    ]);
  });

  it.each([null, undefined, "cyclic"])(
    "routes malformed verifier input %s through the stable safe error",
    (value) => {
      const input = value === "cyclic" ? {} : value;
      if (value === "cyclic") input.expectedBindings = input;
      let failure;
      try {
        verifyNarratorBrowserRateabilityEvidenceSetV3(input);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(TypeError);
      expect(failure.code).toBe("ERR_NARRATOR_V3_RATEABILITY_EVIDENCE_INVALID");
      expect(failure.audit).toEqual(auditNarratorBrowserRateabilityEvidenceSetV3(input));
      expect(failure.message).toMatch(/^Narrator V3 rateability expected host bindings are invalid:/u);
    },
  );

  it("marks dependent predicates not-evaluated after an invalid content hash", () => {
    const source = fixture();
    const audit = auditNarratorBrowserRateabilityEvidenceSetV3({
      ...source,
      runReceipt: { ...source.runReceipt, contentHash: "0".repeat(16) },
    });
    expect(audit.predicates.find(({ id }) => id === "nrv3.evidence.content-hashes").status)
      .toBe("fail");
    expect(audit.predicates.find(({ id }) => id === "nrv3.evidence.schemas").status)
      .toBe("pass");
    expect(audit.predicates.find(({ id }) => id === "nrv3.links.evidence")).toEqual({
      id: "nrv3.links.evidence",
      status: "not-evaluated",
      blockedBy: ["nrv3.evidence.content-hashes"],
    });
    expect(audit.predicates.find(({ id }) => id === "nrv3.package.files").status)
      .toBe("not-evaluated");
  });

  it.each([
    ["nrv3.expected-bindings.schema", (source) => ({
      ...source,
      expectedBindings: (({ runId: _omitted, ...bindings }) => bindings)(source.expectedBindings),
    })],
    ["nrv3.evidence.content-hashes", (source) => ({
      ...source,
      runReceipt: { ...source.runReceipt, contentHash: "0".repeat(16) },
    })],
    ["nrv3.evidence.schemas", (source) => ({
      ...source,
      runReceipt: rehash(source.runReceipt, (value) => { value.unexpected = true; }),
    })],
    ["nrv3.contracts.frozen", (source) => ({
      ...source,
      runPackage: rehash(source.runPackage, (value) => {
        value.packageContractHash = "0".repeat(16);
      }),
    })],
    ["nrv3.authority.denied", (source) => ({
      ...source,
      runPackage: rehash(source.runPackage, (value) => { value.modelAdmitted = true; }),
    })],
    ["nrv3.links.evidence", (source) => ({
      ...source,
      runPackage: rehash(source.runPackage, (value) => {
        value.runSpecHash = "0".repeat(16);
      }),
    })],
    ["nrv3.commitments.run", () => fixture({ wholeRowHash: true })],
    ["nrv3.disposition.blockers", (source) => ({
      ...source,
      runPackage: rehash(source.runPackage, (value) => { value.disposition = "blocked"; }),
    })],
    ["nrv3.expected.source-build", (source) => ({
      ...source,
      expectedBindings: { ...source.expectedBindings, sourceCommit: "c".repeat(40) },
    })],
    ["nrv3.expected.browser-network", (source) => ({
      ...source,
      expectedBindings: {
        ...source.expectedBindings,
        browser: { ...source.expectedBindings.browser, version: "141.0.0.0" },
      },
    })],
    ["nrv3.expected.candidate-artifacts", (source) => ({
      ...source,
      expectedBindings: {
        ...source.expectedBindings,
        candidate: {
          ...source.expectedBindings.candidate,
          candidateId: "flan-t5-small-q8@22222222",
        },
      },
    })],
    ["nrv3.expected.runtime", (source) => ({
      ...source,
      expectedBindings: {
        ...source.expectedBindings,
        runtime: { ...source.expectedBindings.runtime, ortVersion: "1.26.0-wrong" },
      },
    })],
    ["nrv3.expected.run", (source) => ({
      ...source,
      expectedBindings: { ...source.expectedBindings, runId: "wrong-run-id" },
    })],
    ["nrv3.expected.adapter-smoke", (source) => {
      const receiptHash = "a".repeat(16);
      const provenanceReceipt = rehash(source.provenanceReceipt, (value) => {
        value.adapterSmokeReceiptHash = receiptHash;
      });
      return replacePackagedEvidence(
        source,
        "adapter-run-provenance-receipt.json",
        "provenanceReceipt",
        provenanceReceipt,
        (value) => { value.adapterSmokeReceiptHash = receiptHash; },
      );
    }],
    ["nrv3.expected.blockers", (source) => {
      const network = { ...source.expectedBindings.network, postOfflineRequestCount: 1 };
      const provenanceReceipt = rehash(source.provenanceReceipt, (value) => {
        value.network = network;
      });
      return {
        ...replacePackagedEvidence(
          source,
          "adapter-run-provenance-receipt.json",
          "provenanceReceipt",
          provenanceReceipt,
        ),
        expectedBindings: { ...source.expectedBindings, network },
      };
    }],
    ["nrv3.contracts.graph", (source) => ({
      ...source,
      runPackage: rehash(source.runPackage, (value) => {
        value.contractHashes.formSelection = "0".repeat(16);
      }),
    })],
    ["nrv3.package.files", (source) => ({
      ...source,
      runPackage: rehash(source.runPackage, (value) => {
        value.files[0].sha256 = "f".repeat(64);
      }),
    })],
  ])("reports stable predicate ID %s for its targeted mutation", (id, mutate) => {
    const source = mutate(fixture());
    const audit = auditNarratorBrowserRateabilityEvidenceSetV3(source);
    expect(audit.predicates.find((result) => result.id === id).status).toBe("fail");
    const exactFailures = {
      "nrv3.expected-bindings.schema": ["nrv3.expected-bindings.schema"],
      "nrv3.evidence.content-hashes": ["nrv3.evidence.content-hashes"],
      "nrv3.evidence.schemas": ["nrv3.evidence.schemas"],
      "nrv3.contracts.frozen": ["nrv3.contracts.frozen"],
      "nrv3.authority.denied": ["nrv3.authority.denied"],
      "nrv3.links.evidence": ["nrv3.links.evidence"],
      "nrv3.commitments.run": ["nrv3.commitments.run"],
      "nrv3.disposition.blockers": ["nrv3.disposition.blockers"],
      "nrv3.expected.source-build": ["nrv3.expected.source-build"],
      "nrv3.expected.browser-network": ["nrv3.expected.browser-network"],
      "nrv3.expected.candidate-artifacts": ["nrv3.expected.candidate-artifacts"],
      "nrv3.expected.runtime": ["nrv3.expected.runtime"],
      "nrv3.expected.run": ["nrv3.expected.run"],
      "nrv3.expected.adapter-smoke": [
        "nrv3.contracts.frozen",
        "nrv3.expected.adapter-smoke",
      ],
      "nrv3.expected.blockers": ["nrv3.expected.blockers"],
      "nrv3.contracts.graph": ["nrv3.contracts.frozen", "nrv3.contracts.graph"],
      "nrv3.package.files": ["nrv3.package.files"],
    };
    expect(audit.failedPredicateIds).toEqual(exactFailures[id]);
    const expectedNotEvaluated = {
      "nrv3.expected-bindings.schema": [
        "nrv3.expected.source-build",
        "nrv3.expected.browser-network",
        "nrv3.expected.candidate-artifacts",
        "nrv3.expected.runtime",
        "nrv3.expected.run",
        "nrv3.expected.adapter-smoke",
        "nrv3.expected.blockers",
      ],
      "nrv3.evidence.content-hashes":
        narratorBrowserRateabilityEvidencePredicateIdsV3.slice(3),
      "nrv3.evidence.schemas":
        narratorBrowserRateabilityEvidencePredicateIdsV3.slice(3),
    };
    expect(audit.notEvaluatedPredicateIds).toEqual(expectedNotEvaluated[id] ?? []);
    for (const result of audit.predicates) {
      const { prerequisites } = narratorBrowserRateabilityEvidencePredicateContractV3
        .find((entry) => entry.id === result.id);
      const blockedBy = prerequisites.filter((prerequisite) =>
        audit.predicates.find(({ id: candidateId }) => candidateId === prerequisite)
          .status !== "pass");
      expect(result.blockedBy).toEqual(blockedBy);
    }
  });

  it("throws only stable predicate diagnostics without evidence values", () => {
    const source = fixture();
    const mutated = {
      ...source,
      runPackage: rehash(source.runPackage, (value) => { value.modelAdmitted = true; }),
    };
    let failure;
    try {
      verifyNarratorBrowserRateabilityEvidenceSetV3(mutated);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(TypeError);
    expect(failure.code).toBe("ERR_NARRATOR_V3_RATEABILITY_EVIDENCE_INVALID");
    expect(failure.message).toContain("nrv3.authority.denied");
    expect(failure.message).not.toContain(source.blindKey.secretSalt);
    expect(failure.audit)
      .toEqual(auditNarratorBrowserRateabilityEvidenceSetV3(mutated));
  });

  it("accepts a valid bound fixture with exact JSON and six ordered snapshots", () => {
    expect(new TextDecoder().decode(
      serializeNarratorBrowserRateabilityEvidenceJsonV3({ z: 1, a: true }),
    )).toBe(`{
  "z": 1,
  "a": true
}
`);
    const evidence = verifyNarratorBrowserRateabilityEvidenceSetV3(fixture());
    expect(evidence.map((entry) => entry.name))
      .toEqual(narratorBrowserRateabilityEvidenceFileNamesV3);
    expect(evidence.at(-1).name).toBe("run-package.json");
    expect(Object.isFrozen(evidence)).toBe(true);
    for (const entry of evidence) {
      expect(new TextDecoder().decode(entry.bytes))
        .toBe(JSON.stringify(entry.value, null, 2) + "\n");
    }
  });

  it("returns the exact package-validated byte snapshots without reserialization", () => {
    const source = fixture();
    const blindSheet = structuredClone(source.blindSheet);
    let serializationCalls = 0;
    Object.defineProperty(blindSheet, "toJSON", {
      enumerable: false,
      value() {
        serializationCalls += 1;
        if (serializationCalls === 1) return { ...this };
        return { ...this, sheetId: "changed-after-validation" };
      },
    });
    const evidence = verifyNarratorBrowserRateabilityEvidenceSetV3({
      ...source,
      blindSheet,
    });
    expect(serializationCalls).toBe(1);
    for (const entry of evidence.slice(0, -1)) {
      const commitment = source.runPackage.files.find(({ name }) => name === entry.name);
      expect(entry.bytes.byteLength).toBe(commitment.byteLength);
      expect(sha256(entry.bytes)).toBe(commitment.sha256);
    }
  });

  it("snapshots the run package once and rejects a divergent JSON projection safely", () => {
    const accepted = fixture();
    let serializationCalls = 0;
    Object.defineProperty(accepted.runPackage, "toJSON", {
      enumerable: false,
      value() {
        serializationCalls += 1;
        if (serializationCalls === 1) return { ...this };
        return { ...this, runId: "changed-after-validation" };
      },
    });
    const evidence = verifyNarratorBrowserRateabilityEvidenceSetV3(accepted);
    expect(serializationCalls).toBe(1);
    expect(evidence.at(-1).name).toBe("run-package.json");
    expect(new TextDecoder().decode(evidence.at(-1).bytes))
      .not.toContain("changed-after-validation");

    const rejected = fixture();
    Object.defineProperty(rejected.runPackage, "toJSON", {
      enumerable: false,
      value() {
        return { ...this, runId: "divergent-json-projection" };
      },
    });
    let failure;
    try {
      verifyNarratorBrowserRateabilityEvidenceSetV3(rejected);
    } catch (error) {
      failure = error;
    }
    expect(failure.code).toBe("ERR_NARRATOR_V3_RATEABILITY_EVIDENCE_INVALID");
    expect(failure.audit.failedPredicateIds).toEqual(["nrv3.package.files"]);
    expect(failure.message).not.toContain("divergent-json-projection");
  });

  it("captures each top-level evidence value once before auditing", () => {
    const source = fixture();
    const laterRunPackage = rehash(source.runPackage, (value) => {
      value.modelAdmitted = true;
    });
    let runPackageReads = 0;
    const evidence = { ...source };
    Object.defineProperty(evidence, "runPackage", {
      enumerable: true,
      get() {
        runPackageReads += 1;
        return runPackageReads === 1 ? source.runPackage : laterRunPackage;
      },
    });
    const snapshots = verifyNarratorBrowserRateabilityEvidenceSetV3(evidence);
    expect(runPackageReads).toBe(1);
    expect(snapshots.at(-1).value).toBe(source.runPackage);
    expect(snapshots.at(-1).value.modelAdmitted).toBe(false);
  });

  it("retains a structurally bound blocked observation as writable evidence", () => {
    const evidence = verifyNarratorBrowserRateabilityEvidenceSetV3(fixture({ blocked: true }));
    expect(evidence.at(-1).value).toMatchObject({
      disposition: "blocked",
      blockers: ["post-offline-network-observed"],
    });
  });

  it("uses the core receipt's ordered nonempty row-content-hash commitment", () => {
    const source = fixture();
    expect(source.runReceipt.rows).toHaveLength(1);
    expect(source.runReceipt.rowsHash).toBe(canonicalHash(
      source.runReceipt.rows.map((row) => row.contentHash),
    ));
    expect(source.runReceipt.rowsHash).not.toBe(canonicalHash(source.runReceipt.rows));
    expect(() => verifyNarratorBrowserRateabilityEvidenceSetV3(source)).not.toThrow();
  });

  it("rejects the former whole-row commitment after every dependent hash is rebuilt", () => {
    const source = fixture({ wholeRowHash: true });
    expect(source.runReceipt.rowsHash).toBe(canonicalHash(source.runReceipt.rows));
    expect(() => verifyNarratorBrowserRateabilityEvidenceSetV3(source)).toThrow(/bindings/u);
  });

  it("requires exact Node-owned bindings and rejects a wrong expected run identity", () => {
    const source = fixture();
    const { expectedBindings: _omitted, ...withoutBindings } = source;
    expect(() => verifyNarratorBrowserRateabilityEvidenceSetV3(withoutBindings))
      .toThrow(/expected host bindings/u);
    expect(() => verifyNarratorBrowserRateabilityEvidenceSetV3({
      ...source,
      expectedBindings: { ...source.expectedBindings, runId: "wrong-run-id" },
    })).toThrow(/bindings/u);
  });

  it.each([
    ["source commit", (bindings) => ({ ...bindings, sourceCommit: "c".repeat(40) })],
    ["observed build", (bindings) => {
      const bundleFiles = structuredClone(bindings.observedBuild.bundleFiles);
      bundleFiles[0].sha256 = "7".repeat(64);
      return {
        ...bindings,
        observedBuild: {
          ...bindings.observedBuild,
          bundleFiles,
          bundleAggregateSha256: sha256(
            new TextEncoder().encode(canonicalStringify(bundleFiles)),
          ),
        },
      };
    }],
    ["build toolchain", (bindings) => ({
      ...bindings,
      buildToolchain: { ...bindings.buildToolchain, nodeVersion: "22.20.0" },
    })],
    ["browser", (bindings) => ({
      ...bindings,
      browser: { ...bindings.browser, version: "141.0.0.0" },
    })],
    ["network", (bindings) => ({
      ...bindings,
      network: { ...bindings.network, postOfflineRequestCount: 1 },
    })],
    ["candidate", (bindings) => ({
      ...bindings,
      candidate: { ...bindings.candidate, candidateId: "flan-t5-small-q8@22222222" },
    })],
    ["model artifacts", (bindings) => ({
      ...bindings,
      modelArtifacts: bindings.modelArtifacts.map((artifact) => ({
        ...artifact,
        sha256: "8".repeat(64),
      })),
    })],
    ["runtime", (bindings) => ({
      ...bindings,
      runtime: { ...bindings.runtime, ortVersion: "1.26.0-wrong" },
    })],
    ["runtime artifacts", (bindings) => {
      const runtimeArtifacts = structuredClone(bindings.runtimeArtifacts);
      runtimeArtifacts[0].sha256 = "9".repeat(64);
      return {
        ...bindings,
        runtimeArtifacts,
        runtime: { ...bindings.runtime, assets: runtimeArtifacts },
      };
    }],
    ["smoke", (bindings) => ({
      ...bindings,
      adapterSmoke: { ...bindings.adapterSmoke, receiptHash: "a".repeat(16) },
    })],
    ["sheet id", (bindings) => ({ ...bindings, sheetId: "wrong-sheet-id" })],
  ])("rejects a wrong Node-owned %s binding", (_label, mutateBindings) => {
    const source = fixture();
    expect(() => verifyNarratorBrowserRateabilityEvidenceSetV3({
      ...source,
      expectedBindings: mutateBindings(source.expectedBindings),
    })).toThrow(TypeError);
  });

  it("rejects a self-consistently rehashed package with a fake frozen contract hash", () => {
    const source = fixture();
    expect(() => verifyNarratorBrowserRateabilityEvidenceSetV3({
      ...source,
      runPackage: rehash(source.runPackage, (value) => {
        value.packageContractHash = "0".repeat(16);
      }),
    })).toThrow(/bindings/u);
  });

  it.each([
    ["serialized hash", (source) => ({
      ...source,
      runPackage: rehash(source.runPackage, (value) => { value.files[0].sha256 = "f".repeat(64); }),
    })],
    ["serialized length", (source) => ({
      ...source,
      runPackage: rehash(source.runPackage, (value) => { value.files[1].byteLength += 1; }),
    })],
    ["content-hash link", (source) => ({
      ...source,
      runPackage: rehash(source.runPackage, (value) => { value.files[2].contentHash = "f".repeat(16); }),
    })],
    ["run-spec link", (source) => ({
      ...source,
      runPackage: rehash(source.runPackage, (value) => { value.runSpecHash = "f".repeat(16); }),
    })],
    ["file order", (source) => ({
      ...source,
      runPackage: rehash(source.runPackage, (value) => { value.files.reverse(); }),
    })],
    ["authority", (source) => ({
      ...source,
      runPackage: rehash(source.runPackage, (value) => { value.modelAdmitted = true; }),
    })],
  ])("rejects a fully rehashed %s mutation", (_label, mutate) => {
    expect(() => verifyNarratorBrowserRateabilityEvidenceSetV3(mutate(fixture()))).toThrow(TypeError);
  });
});

describe("V3 narrator browser rateability atomic finalization", () => {
  it("accepts and publishes a valid fixture as six exact private regular files", async () => {
    const paths = await outputFixture();
    const source = fixture({ blocked: true });
    const evidenceSet = verifyNarratorBrowserRateabilityEvidenceSetV3(source);
    const result = await finalizeNarratorBrowserRateabilityEvidenceV3({
      outputDirectory: paths.outputDirectory,
      evidenceSet,
      expectedBindings: source.expectedBindings,
      repositoryRoot: paths.repositoryRoot,
    });
    expect(result.outputDirectory).toBe(paths.outputDirectory);
    const directory = await lstat(paths.outputDirectory);
    expect(directory.isDirectory()).toBe(true);
    expect(directory.isSymbolicLink()).toBe(false);
    expect(directory.mode & 0o777).toBe(0o700);
    expect((await readdir(paths.outputDirectory)).sort())
      .toEqual([...narratorBrowserRateabilityEvidenceFileNamesV3].sort());
    for (const entry of evidenceSet) {
      const path = resolve(paths.outputDirectory, entry.name);
      const metadata = await lstat(path);
      expect(metadata.isFile()).toBe(true);
      expect(metadata.isSymbolicLink()).toBe(false);
      expect(metadata.mode & 0o777).toBe(0o600);
      expect(await readFile(path)).toEqual(Buffer.from(entry.bytes));
    }
    expect(await readdir(paths.outputParent)).toEqual(["evidence"]);
  });

  it("rejects directory and symlink collisions without overwriting either target", async () => {
    const paths = await outputFixture();
    const source = fixture();
    const evidenceSet = verifyNarratorBrowserRateabilityEvidenceSetV3(source);
    await mkdir(paths.outputDirectory);
    const sentinel = resolve(paths.outputDirectory, "sentinel");
    await writeFile(sentinel, "preserve");
    await expect(finalizeNarratorBrowserRateabilityEvidenceV3({
      outputDirectory: paths.outputDirectory,
      evidenceSet,
      expectedBindings: source.expectedBindings,
      repositoryRoot: paths.repositoryRoot,
    })).rejects.toThrow(/already exists/u);
    expect(await readFile(sentinel, "utf8")).toBe("preserve");

    const link = resolve(paths.outputParent, "evidence-link");
    await symlink(paths.outputDirectory, link);
    await expect(finalizeNarratorBrowserRateabilityEvidenceV3({
      outputDirectory: link,
      evidenceSet,
      expectedBindings: source.expectedBindings,
      repositoryRoot: paths.repositoryRoot,
    })).rejects.toThrow(/already exists/u);
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
  });

  it("rejects a destination inside the repository before creating it", async () => {
    const paths = await outputFixture();
    const destination = resolve(paths.repositoryRoot, "evidence");
    const source = fixture();
    await expect(finalizeNarratorBrowserRateabilityEvidenceV3({
      outputDirectory: destination,
      evidenceSet: verifyNarratorBrowserRateabilityEvidenceSetV3(source),
      expectedBindings: source.expectedBindings,
      repositoryRoot: paths.repositoryRoot,
    })).rejects.toThrow(/outside the repository/u);
    await expect(lstat(destination)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("requires an exact-mode 0700 output parent owned by the current effective user", async () => {
    const modePaths = await outputFixture();
    const source = fixture();
    const evidenceSet = verifyNarratorBrowserRateabilityEvidenceSetV3(source);
    await chmod(modePaths.outputParent, 0o750);
    await expect(finalizeNarratorBrowserRateabilityEvidenceV3({
      outputDirectory: modePaths.outputDirectory,
      evidenceSet,
      expectedBindings: source.expectedBindings,
      repositoryRoot: modePaths.repositoryRoot,
    })).rejects.toThrow(/0700.*owned by the current user/u);
    expect(await readdir(modePaths.outputParent)).toEqual([]);

    const ownerPaths = await outputFixture();
    await expect(finalizeNarratorBrowserRateabilityEvidenceV3({
      outputDirectory: ownerPaths.outputDirectory,
      evidenceSet,
      expectedBindings: source.expectedBindings,
      repositoryRoot: ownerPaths.repositoryRoot,
      filesystem: {
        lstat: async (path) => {
          const metadata = await lstat(path);
          if (path !== ownerPaths.outputParent) return metadata;
          return new Proxy(metadata, {
            get(target, property, receiver) {
              if (property === "uid") return target.uid + 1;
              const value = Reflect.get(target, property, receiver);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
        },
      },
    })).rejects.toThrow(/0700.*owned by the current user/u);
    expect(await readdir(ownerPaths.outputParent)).toEqual([]);
  });

  it("rejects special permission bits on the private parent, lock, and evidence files", async () => {
    const source = fixture();
    const evidenceSet = verifyNarratorBrowserRateabilityEvidenceSetV3(source);
    const withMode = (metadata, mode) => new Proxy(metadata, {
      get(target, property, receiver) {
        if (property === "mode") return mode;
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    const parentPaths = await outputFixture();
    await expect(finalizeNarratorBrowserRateabilityEvidenceV3({
      outputDirectory: parentPaths.outputDirectory,
      evidenceSet,
      expectedBindings: source.expectedBindings,
      repositoryRoot: parentPaths.repositoryRoot,
      filesystem: {
        lstat: async (path) => {
          const metadata = await lstat(path);
          return path === parentPaths.outputParent
            ? withMode(metadata, (metadata.mode & ~0o7777) | 0o2700)
            : metadata;
        },
      },
    })).rejects.toThrow(/0700.*owned by the current user/u);
    expect(await readdir(parentPaths.outputParent)).toEqual([]);

    const lockPaths = await outputFixture();
    await expect(finalizeNarratorBrowserRateabilityEvidenceV3({
      outputDirectory: lockPaths.outputDirectory,
      evidenceSet,
      expectedBindings: source.expectedBindings,
      repositoryRoot: lockPaths.repositoryRoot,
      filesystem: {
        open: async (...arguments_) => {
          const handle = await open(...arguments_);
          if (!String(arguments_[0]).endsWith(".lock")) return handle;
          return new Proxy(handle, {
            get(target, property, receiver) {
              if (property === "stat") {
                return async () => {
                  const metadata = await target.stat();
                  return withMode(metadata, (metadata.mode & ~0o7777) | 0o4600);
                };
              }
              const value = Reflect.get(target, property, receiver);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
        },
      },
    })).rejects.toThrow(/lock must be an exact-mode 0600 file/u);
    expect(await readdir(lockPaths.outputParent)).toEqual([]);

    const filePaths = await outputFixture();
    await expect(finalizeNarratorBrowserRateabilityEvidenceV3({
      outputDirectory: filePaths.outputDirectory,
      evidenceSet,
      expectedBindings: source.expectedBindings,
      repositoryRoot: filePaths.repositoryRoot,
      filesystem: {
        open: async (...arguments_) => {
          const handle = await open(...arguments_);
          if (!String(arguments_[0]).endsWith("/blind-key.json")) return handle;
          return new Proxy(handle, {
            get(target, property, receiver) {
              if (property === "stat") {
                return async () => {
                  const metadata = await target.stat();
                  return withMode(metadata, (metadata.mode & ~0o7777) | 0o4600);
                };
              }
              const value = Reflect.get(target, property, receiver);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
        },
      },
    })).rejects.toThrow(/exact-mode private regular file/u);
    await expect(lstat(filePaths.outputDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readdir(filePaths.outputParent)).toEqual([]);
  });

  it("serializes concurrent cooperative finalizers without collision or overwrite", async () => {
    const paths = await outputFixture();
    const source = fixture();
    const evidenceSet = verifyNarratorBrowserRateabilityEvidenceSetV3(source);
    let signalRenameStarted;
    const renameStarted = new Promise((resolveStarted) => {
      signalRenameStarted = resolveStarted;
    });
    let releaseRename;
    const renameGate = new Promise((resolveGate) => {
      releaseRename = resolveGate;
    });
    const first = finalizeNarratorBrowserRateabilityEvidenceV3({
      outputDirectory: paths.outputDirectory,
      evidenceSet,
      expectedBindings: source.expectedBindings,
      repositoryRoot: paths.repositoryRoot,
      filesystem: {
        rename: async (...arguments_) => {
          signalRenameStarted();
          await renameGate;
          return rename(...arguments_);
        },
      },
    });
    await renameStarted;
    try {
      await expect(finalizeNarratorBrowserRateabilityEvidenceV3({
        outputDirectory: paths.outputDirectory,
        evidenceSet,
        expectedBindings: source.expectedBindings,
        repositoryRoot: paths.repositoryRoot,
      })).rejects.toThrow(/already active/u);
    } finally {
      releaseRename();
    }
    await first;
    expect(await readdir(paths.outputParent)).toEqual(["evidence"]);
  });

  it("removes private staging and leaves no partial destination after a write failure", async () => {
    const paths = await outputFixture();
    const source = fixture();
    const evidenceSet = verifyNarratorBrowserRateabilityEvidenceSetV3(source);
    await expect(finalizeNarratorBrowserRateabilityEvidenceV3({
      outputDirectory: paths.outputDirectory,
      evidenceSet,
      expectedBindings: source.expectedBindings,
      repositoryRoot: paths.repositoryRoot,
      filesystem: {
        open: async (...arguments_) => {
          if (String(arguments_[0]).endsWith("/blind-key.json")) {
            throw new Error("simulated evidence write failure");
          }
          return open(...arguments_);
        },
      },
    })).rejects.toThrow(/simulated evidence write failure/u);
    await expect(lstat(paths.outputDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readdir(paths.outputParent)).toEqual([]);
  });
});
