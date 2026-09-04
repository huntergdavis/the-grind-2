import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  coordinateNarratorBrowserRateabilityAttemptV3,
  narratorBrowserRateabilityAttemptVaultContractV3,
  narratorBrowserRateabilityEvidenceFileNamesV3,
  serializeNarratorBrowserRateabilityEvidenceJsonV3,
} from "../run-support.mjs";
import { fixture } from "./rateability-fixture.mjs";

const temporaryRoots = [];
const attemptVaultPrefix = ".narrator-browser-rateability-v3-attempt-";
const authorityFields = Object.freeze([
  "humanRatingIncluded",
  "modelAdmitted",
  "displayAuthorized",
  "productionAuthority",
]);

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })));
});

async function outputFixture() {
  const root = await mkdtemp(resolve(tmpdir(), "grind2-rateability-coordinator-"));
  temporaryRoots.push(root);
  const outputParent = resolve(root, "private-output");
  await mkdir(outputParent, { mode: 0o700 });
  await chmod(outputParent, 0o700);
  return {
    root,
    outputParent,
    outputDirectory: resolve(outputParent, "evidence"),
  };
}

function completedEvidence(source) {
  return {
    receipt: source.runReceipt,
    summary: source.rateabilitySummary,
    sheet: source.blindSheet,
    key: source.blindKey,
  };
}

function coordinatorStart(paths, source) {
  return {
    outputDirectory: paths.outputDirectory,
    sourceCommit: source.expectedBindings.sourceCommit,
    candidateId: source.expectedBindings.candidate.candidateId,
    runId: source.expectedBindings.runId,
    sheetId: source.expectedBindings.sheetId,
  };
}

function committedSourcesFixture() {
  const bytes = new TextEncoder().encode("committed coordinator source\n");
  return [{ path: "coordinator-source.ts", bytes: bytes.buffer }];
}

function coordinatorRequest(paths, source, overrides = {}) {
  const observe = overrides.observe ?? (async (hooks) => {
    await hooks.preserveCore(completedEvidence(source));
    hooks.confirmProducerSeal();
    return source.expectedBindings;
  });
  const loadHostEvidence = overrides.loadHostEvidence ?? (async () => ({
    createAndVerifyNarratorBrowserProvenanceReceiptV3: async () =>
      source.provenanceReceipt,
    createAndVerifyNarratorBrowserRunPackageV3: async () => source.runPackage,
  }));
  return {
    start: coordinatorStart(paths, source),
    observe,
    loadHostEvidence,
    committedSources: committedSourcesFixture(),
  };
}

async function attemptArtifacts(paths) {
  const names = await readdir(paths.outputParent);
  const vaultNames = names.filter((name) =>
    name.startsWith(attemptVaultPrefix) && !name.endsWith(".lock"));
  expect(vaultNames).toHaveLength(1);
  const lockNames = names.filter((name) => name.endsWith(".lock"));
  expect(lockNames).toHaveLength(2);
  for (const lockName of lockNames) {
    expect((await lstat(resolve(paths.outputParent, lockName))).mode & 0o7777)
      .toBe(0o600);
  }
  return {
    vaultDirectory: resolve(paths.outputParent, vaultNames[0]),
    lockNames,
  };
}

async function expectMissing(path) {
  await expect(lstat(path)).rejects.toMatchObject({ code: "ENOENT" });
}

async function expectExactOutput(paths, source) {
  expect((await readdir(paths.outputDirectory)).sort()).toEqual(
    [...narratorBrowserRateabilityEvidenceFileNamesV3].sort(),
  );
  const values = new Map([
    ["adapter-run-provenance-receipt.json", source.provenanceReceipt],
    ["blind-key.json", source.blindKey],
    ["blind-sheet.json", source.blindSheet],
    ["rateability-summary.json", source.rateabilitySummary],
    ["run-receipt.json", source.runReceipt],
    ["run-package.json", source.runPackage],
  ]);
  for (const [name, value] of values) {
    expect(await readFile(resolve(paths.outputDirectory, name))).toEqual(
      Buffer.from(serializeNarratorBrowserRateabilityEvidenceJsonV3(value)),
    );
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function expectFailedTerminal(paths, expectedNames, failureCode) {
  await expectMissing(paths.outputDirectory);
  const { vaultDirectory } = await attemptArtifacts(paths);
  expect((await readdir(vaultDirectory)).sort()).toEqual([...expectedNames].sort());
  const diagnostic = await readJson(resolve(
    vaultDirectory,
    "40-verification-diagnostic.json",
  ));
  const terminal = await readJson(resolve(vaultDirectory, "90-attempt-terminal.json"));
  expect(diagnostic).toMatchObject({
    audit: null,
    failureCode,
    officialDisposition: null,
  });
  expect(terminal).toMatchObject({
    terminalStatus: "failed",
    failureCode,
    verificationVerdict: "not-run",
    officialDisposition: null,
  });
  for (const field of authorityFields) {
    expect(diagnostic[field]).toBe(false);
    expect(terminal[field]).toBe(false);
  }
}

function expectedReport(source) {
  return {
    status: source.runPackage.disposition === "rateable-for-blind-rating"
      ? "ok"
      : "blocked",
    mode: "run",
    sourceCommit: source.expectedBindings.sourceCommit,
    packageHash: source.runPackage.contentHash,
    provenanceHash: source.provenanceReceipt.contentHash,
    rateabilitySummaryHash: source.rateabilitySummary.contentHash,
    validRowCount: source.rateabilitySummary.validRowCount,
    rateableNonBaselineCount: source.rateabilitySummary.rateableNonBaselineCount,
    disposition: source.runPackage.disposition,
    blockers: source.runPackage.blockers,
    stagingExternalRequestCount:
      source.expectedBindings.network.stagingExternalRequestCount,
    postOfflineRequestCount: source.expectedBindings.network.postOfflineRequestCount,
    humanRatingIncluded: false,
    modelAdmitted: false,
    displayAuthorized: false,
    productionAuthority: false,
  };
}

describe("V3 narrator browser rateability attempt coordinator", () => {
  it.each([
    ["rateable", false],
    ["blocked", true],
  ])("publishes exact %s evidence in phase order and returns only a safe report", async (
    _label,
    blocked,
  ) => {
    const source = fixture({ blocked });
    const paths = await outputFixture();
    const events = [];
    const observedBindings = structuredClone(source.expectedBindings);
    const originalPostOfflineCount = observedBindings.network.postOfflineRequestCount;
    const request = coordinatorRequest(paths, source, {
      observe: async (hooks) => {
        events.push("observe");
        await hooks.preserveCore(completedEvidence(source));
        const { vaultDirectory } = await attemptArtifacts(paths);
        expect((await readdir(vaultDirectory)).sort()).toEqual([
          "00-attempt-start.json",
          "10-run-receipt.json",
          "11-rateability-summary.json",
          "12-blind-sheet.json",
          "13-blind-key.json",
          "19-core-preservation.json",
        ].sort());
        events.push("core-preserved");
        hooks.confirmProducerSeal();
        events.push("producer-sealed");
        return observedBindings;
      },
      loadHostEvidence: async () => {
        events.push("host-loaded");
        const { vaultDirectory } = await attemptArtifacts(paths);
        expect((await readdir(vaultDirectory)).sort()).toEqual([
          "00-attempt-start.json",
          "10-run-receipt.json",
          "11-rateability-summary.json",
          "12-blind-sheet.json",
          "13-blind-key.json",
          "19-core-preservation.json",
          "20-expected-bindings.json",
          "29-bindings-preservation.json",
        ].sort());
        observedBindings.network.postOfflineRequestCount += 100;
        return {
          createAndVerifyNarratorBrowserProvenanceReceiptV3: async (
            provenanceRequest,
            completed,
            committedSources,
          ) => {
            events.push("provenance-created");
            expect(provenanceRequest).toEqual({
              sourceCommit: source.expectedBindings.sourceCommit,
              observedBuild: source.expectedBindings.observedBuild,
              buildToolchain: source.expectedBindings.buildToolchain,
              browser: source.expectedBindings.browser,
              network: {
                ...source.expectedBindings.network,
                postOfflineRequestCount: originalPostOfflineCount,
              },
            });
            expect(completed).toEqual(completedEvidence(source));
            expect(committedSources).toHaveLength(1);
            expect(Object.isFrozen(committedSources)).toBe(true);
            return source.provenanceReceipt;
          },
          createAndVerifyNarratorBrowserRunPackageV3: async (
            completed,
            provenanceReceipt,
          ) => {
            events.push("package-created");
            expect(completed).toEqual(completedEvidence(source));
            expect(provenanceReceipt).toEqual(source.provenanceReceipt);
            expect((await readdir(vaultDirectory)).sort()).toEqual([
              "00-attempt-start.json",
              "10-run-receipt.json",
              "11-rateability-summary.json",
              "12-blind-sheet.json",
              "13-blind-key.json",
              "19-core-preservation.json",
              "20-expected-bindings.json",
              "29-bindings-preservation.json",
              "30-provenance-receipt.json",
              "31-provenance-preservation.json",
            ].sort());
            return source.runPackage;
          },
        };
      },
    });

    const report = await coordinateNarratorBrowserRateabilityAttemptV3(request);

    expect(report).toEqual(expectedReport(source));
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.blockers)).toBe(true);
    expect(JSON.stringify(report)).not.toContain(paths.root);
    expect(JSON.stringify(report)).not.toContain(source.blindKey.secretSalt);
    expect(events).toEqual([
      "observe",
      "core-preserved",
      "producer-sealed",
      "host-loaded",
      "provenance-created",
      "package-created",
    ]);
    await expectExactOutput(paths, source);
    const { vaultDirectory } = await attemptArtifacts(paths);
    expect((await readdir(vaultDirectory)).sort()).toEqual(
      [...narratorBrowserRateabilityAttemptVaultContractV3.fileOrder].sort(),
    );
  });

  it("makes core preservation and producer sealing single-use and rejects sealing while pending", async () => {
    const source = fixture();
    const paths = await outputFixture();
    let hooksSeen;
    const request = coordinatorRequest(paths, source, {
      observe: async (hooks) => {
        hooksSeen = hooks;
        expect(Object.getPrototypeOf(hooks)).toBeNull();
        expect(Object.isFrozen(hooks)).toBe(true);
        expect(Object.keys(hooks).sort()).toEqual([
          "confirmProducerSeal",
          "preserveCore",
        ]);
        const pending = hooks.preserveCore(completedEvidence(source));
        expect(() => hooks.preserveCore(completedEvidence(source)))
          .toThrow(/core preservation is invalid/u);
        expect(() => hooks.confirmProducerSeal())
          .toThrow(/producer seal is invalid/u);
        await pending;
        hooks.confirmProducerSeal();
        expect(() => hooks.confirmProducerSeal())
          .toThrow(/producer seal is invalid/u);
        expect(() => hooks.preserveCore(completedEvidence(source)))
          .toThrow(/core preservation is invalid/u);
        return source.expectedBindings;
      },
    });

    await expect(coordinateNarratorBrowserRateabilityAttemptV3(request))
      .resolves.toEqual(expectedReport(source));
    expect(hooksSeen).toBeDefined();
  });

  it("retains the exact preserved core without a terminal when producer seal is absent", async () => {
    const source = fixture();
    const paths = await outputFixture();
    let hostLoads = 0;
    let staleHooks;
    const request = coordinatorRequest(paths, source, {
      observe: async (hooks) => {
        staleHooks = hooks;
        await hooks.preserveCore(completedEvidence(source));
        return source.expectedBindings;
      },
      loadHostEvidence: async () => {
        hostLoads += 1;
        throw new Error("host must remain unreachable");
      },
    });

    await expect(coordinateNarratorBrowserRateabilityAttemptV3(request))
      .rejects.toMatchObject({
        code: "ERR_NARRATOR_V3_ATTEMPT_CALLBACK_FAILED",
      });
    expect(hostLoads).toBe(0);
    await expectMissing(paths.outputDirectory);
    expect(() => staleHooks.confirmProducerSeal())
      .toThrow(/producer seal is invalid/u);
    expect(() => staleHooks.preserveCore(completedEvidence(source)))
      .toThrow(/core preservation is invalid/u);
    const { vaultDirectory } = await attemptArtifacts(paths);
    expect((await readdir(vaultDirectory)).sort()).toEqual([
      "00-attempt-start.json",
      "10-run-receipt.json",
      "11-rateability-summary.json",
      "12-blind-sheet.json",
      "13-blind-key.json",
      "19-core-preservation.json",
    ].sort());
  });

  it.each([
    {
      label: "observation before core",
      failureCode: "core-preservation-failed",
      finalName: "00-attempt-start.json",
      observe: async (hooks) => {
        hooks.confirmProducerSeal();
        throw new Error("observation failed before core completion");
      },
      loadHostEvidence: async () => {
        throw new Error("host must remain unreachable");
      },
    },
    {
      label: "core publication",
      failureCode: "core-preservation-failed",
      finalName: "00-attempt-start.json",
      observe: async (hooks, source) => {
        let failure;
        try {
          await hooks.preserveCore({
            ...completedEvidence(source),
            receipt: Symbol("invalid core record"),
          });
        } catch (error) {
          failure = error;
        }
        expect(failure).toMatchObject({
          code: "ERR_NARRATOR_V3_ATTEMPT_PUBLISH_FAILED",
        });
        hooks.confirmProducerSeal();
        throw failure;
      },
    },
    {
      label: "bindings publication",
      failureCode: "bindings-preservation-failed",
      finalName: "19-core-preservation.json",
      observe: async (hooks, source) => {
        await hooks.preserveCore(completedEvidence(source));
        hooks.confirmProducerSeal();
        return Symbol("invalid bindings record");
      },
    },
    {
      label: "host loading",
      failureCode: "host-construction-failed",
      finalName: "29-bindings-preservation.json",
      loadHostEvidence: async () => {
        throw new Error("host construction failed");
      },
    },
    {
      label: "provenance publication",
      failureCode: "provenance-preservation-failed",
      finalName: "29-bindings-preservation.json",
      loadHostEvidence: async (source) => ({
        createAndVerifyNarratorBrowserProvenanceReceiptV3: async () =>
          Symbol("invalid provenance record"),
        createAndVerifyNarratorBrowserRunPackageV3: async () => source.runPackage,
      }),
    },
    {
      label: "package construction",
      failureCode: "host-construction-failed",
      finalName: "31-provenance-preservation.json",
      loadHostEvidence: async (source) => ({
        createAndVerifyNarratorBrowserProvenanceReceiptV3: async () =>
          source.provenanceReceipt,
        createAndVerifyNarratorBrowserRunPackageV3: async () => {
          throw new Error("run package construction failed");
        },
      }),
    },
  ])("terminalizes the exact $label failure prefix", async (testCase) => {
    const source = fixture();
    const paths = await outputFixture();
    const observe = testCase.observe === undefined
      ? undefined
      : (hooks) => testCase.observe(hooks, source);
    const loadHostEvidence = testCase.loadHostEvidence === undefined
      ? undefined
      : () => testCase.loadHostEvidence(source);
    const request = coordinatorRequest(paths, source, {
      ...(observe === undefined ? {} : { observe }),
      ...(loadHostEvidence === undefined ? {} : { loadHostEvidence }),
    });

    await expect(coordinateNarratorBrowserRateabilityAttemptV3(request))
      .rejects.toMatchObject({
        code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_FAILED",
      });

    const finalIndex = narratorBrowserRateabilityAttemptVaultContractV3.fileOrder
      .indexOf(testCase.finalName);
    await expectFailedTerminal(paths, [
      ...narratorBrowserRateabilityAttemptVaultContractV3.fileOrder.slice(
        0,
        finalIndex + 1,
      ),
      "40-verification-diagnostic.json",
      "90-attempt-terminal.json",
    ], testCase.failureCode);
  });

  it("binds the final host checkpoint failure before success finalization", () => {
    const source = Function.prototype.toString.call(
      coordinateNarratorBrowserRateabilityAttemptV3,
    );
    const packageRecord = source.indexOf('name: "32-run-package.json"');
    const hostFailure = source.indexOf(
      '"host-preservation-failed"',
      packageRecord,
    );
    const hostRecord = source.indexOf(
      'name: "39-host-preservation.json"',
      hostFailure,
    );
    const successFinalizer = source.indexOf(
      "finalizeNarratorBrowserRateabilityAttemptEvidenceV3({",
      hostRecord,
    );
    expect(packageRecord).toBeGreaterThanOrEqual(0);
    expect(packageRecord).toBeLessThan(hostFailure);
    expect(hostFailure).toBeLessThan(hostRecord);
    expect(hostRecord).toBeLessThan(successFinalizer);
  });
});
