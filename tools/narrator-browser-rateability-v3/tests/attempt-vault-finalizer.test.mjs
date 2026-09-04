import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  beginNarratorBrowserRateabilityAttemptVaultV3,
  consumeNarratorBrowserRateabilityAttemptAdmissionV3,
  createNarratorBrowserRateabilityAttemptPreservationReceiptV3,
  createNarratorBrowserRateabilityAttemptTerminalReceiptV3,
  createNarratorBrowserRateabilityOutputReservationV3,
  createNarratorBrowserRateabilityVerificationDiagnosticV3,
  finalizeNarratorBrowserRateabilityAttemptEvidenceV3,
  finalizeNarratorBrowserRateabilityAttemptFailureV3,
  finalizeNarratorBrowserRateabilityEvidenceV3,
  issueNarratorBrowserRateabilityAttemptAdmissionV3,
  narratorBrowserRateabilityAttemptVaultContractV3,
  narratorBrowserRateabilityEvidenceFileNamesV3,
  publishNarratorBrowserRateabilityAttemptRecordV3,
  readNarratorBrowserRateabilityAttemptRecordV3,
  retainNarratorBrowserRateabilityAttemptVaultV3,
  serializeNarratorBrowserRateabilityEvidenceJsonV3,
} from "../run-support.mjs";
import { fixture, sha256 } from "./rateability-fixture.mjs";

const temporaryRoots = [];
const activeAttempts = new Set();
const authorityFields = Object.freeze([
  "publicReplayableBeforeRating",
  "humanQualityEvaluated",
  "humanRatingIncluded",
  "modelAdmitted",
  "displayAuthorized",
  "productionAuthority",
]);
const stagingPrefix = ".narrator-browser-rateability-v3-staging-";
const phaseFailureCases = Object.freeze([
  Object.freeze({
    failureCode: "core-preservation-failed",
    healthyFinalName: "00-attempt-start.json",
    latchedFinalName: "00-attempt-start.json",
    failedPublishName: "10-run-receipt.json",
  }),
  Object.freeze({
    failureCode: "bindings-preservation-failed",
    healthyFinalName: "19-core-preservation.json",
    latchedFinalName: "19-core-preservation.json",
    failedPublishName: "20-expected-bindings.json",
  }),
  Object.freeze({
    failureCode: "host-construction-failed",
    healthyFinalName: "31-provenance-preservation.json",
    latchedFinalName: "31-provenance-preservation.json",
    failedPublishName: "32-run-package.json",
  }),
  Object.freeze({
    failureCode: "provenance-preservation-failed",
    healthyFinalName: "30-provenance-receipt.json",
    latchedFinalName: "29-bindings-preservation.json",
    failedPublishName: "30-provenance-receipt.json",
  }),
  Object.freeze({
    failureCode: "host-preservation-failed",
    healthyFinalName: "32-run-package.json",
    latchedFinalName: "32-run-package.json",
    failedPublishName: "39-host-preservation.json",
  }),
]);

afterEach(async () => {
  const attempts = [...activeAttempts];
  activeAttempts.clear();
  await Promise.allSettled(attempts.map((attempt) =>
    retainNarratorBrowserRateabilityAttemptVaultV3(attempt)));
  await Promise.all(temporaryRoots.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })));
});

async function outputFixture() {
  const root = await mkdtemp(resolve(tmpdir(), "grind2-attempt-finalizer-"));
  temporaryRoots.push(root);
  const repositoryRoot = resolve(root, "repository");
  const outputParent = resolve(root, "private-output");
  await Promise.all([
    mkdir(repositoryRoot, { mode: 0o700 }),
    mkdir(outputParent, { mode: 0o700 }),
  ]);
  await Promise.all([
    chmod(repositoryRoot, 0o700),
    chmod(outputParent, 0o700),
  ]);
  return {
    root,
    repositoryRoot,
    outputParent,
    outputDirectory: resolve(outputParent, "evidence"),
  };
}

async function beginTracked(paths, source, filesystem = {}) {
  const attempt = await beginNarratorBrowserRateabilityAttemptVaultV3({
    outputDirectory: paths.outputDirectory,
    sourceCommit: source.expectedBindings.sourceCommit,
    candidateId: source.expectedBindings.candidate.candidateId,
    runId: source.expectedBindings.runId,
    sheetId: source.expectedBindings.sheetId,
    repositoryRoot: paths.repositoryRoot,
    filesystem,
  });
  activeAttempts.add(attempt);
  return attempt;
}

async function retainTracked(attempt) {
  try {
    return await retainNarratorBrowserRateabilityAttemptVaultV3(attempt);
  } finally {
    activeAttempts.delete(attempt);
  }
}

function markClosed(attempt) {
  activeAttempts.delete(attempt);
}

function attemptPaths(paths, attempt) {
  const vaultDirectory = resolve(
    paths.outputParent,
    `.narrator-browser-rateability-v3-attempt-${attempt.attemptId}`,
  );
  const reservation = createNarratorBrowserRateabilityOutputReservationV3(
    basename(paths.outputDirectory),
  );
  return {
    vaultDirectory,
    lockPath: `${vaultDirectory}.lock`,
    destinationLockPath: resolve(paths.outputParent, reservation.lockName),
  };
}

function sourceEvidence(source) {
  return new Map([
    ["adapter-run-provenance-receipt.json", source.provenanceReceipt],
    ["blind-key.json", source.blindKey],
    ["blind-sheet.json", source.blindSheet],
    ["rateability-summary.json", source.rateabilitySummary],
    ["run-receipt.json", source.runReceipt],
    ["run-package.json", source.runPackage],
  ]);
}

async function publishPrefixBeforeHost(attempt, source) {
  const records = new Map();
  const publish = async (name, value) => {
    const snapshot = await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name,
      value,
    });
    records.set(name, snapshot);
    return snapshot;
  };
  const core = [await publish("10-run-receipt.json", source.runReceipt)];
  core.push(await publish("11-rateability-summary.json", source.rateabilitySummary));
  core.push(await publish("12-blind-sheet.json", source.blindSheet));
  core.push(await publish("13-blind-key.json", source.blindKey));
  await publish(
    "19-core-preservation.json",
    createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
      attempt,
      phase: "core",
      records: core,
    }),
  );
  const expectedBindings = await publish(
    "20-expected-bindings.json",
    source.expectedBindings,
  );
  await publish(
    "29-bindings-preservation.json",
    createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
      attempt,
      phase: "bindings",
      records: [expectedBindings],
    }),
  );
  const provenance = await publish(
    "30-provenance-receipt.json",
    source.provenanceReceipt,
  );
  await publish(
    "31-provenance-preservation.json",
    createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
      attempt,
      phase: "provenance",
      records: [provenance],
    }),
  );
  const runPackage = await publish("32-run-package.json", source.runPackage);
  const hostValue = createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
    attempt,
    phase: "host",
    records: [provenance, runPackage],
  });
  return { records, hostValue };
}

async function publishCompletePrefix(attempt, source) {
  const prefix = await publishPrefixBeforeHost(attempt, source);
  const host = await publishNarratorBrowserRateabilityAttemptRecordV3({
    attempt,
    name: "39-host-preservation.json",
    value: prefix.hostValue,
  });
  prefix.records.set(host.name, host);
  return prefix.records;
}

async function publishPrefixThrough(attempt, source, finalName) {
  const records = new Map();
  if (finalName === "00-attempt-start.json") return records;
  const publish = async (name, value) => {
    const snapshot = await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name,
      value,
    });
    records.set(name, snapshot);
    return snapshot;
  };
  const reached = (name) => name === finalName;

  const core = [await publish("10-run-receipt.json", source.runReceipt)];
  if (reached("10-run-receipt.json")) return records;
  core.push(await publish("11-rateability-summary.json", source.rateabilitySummary));
  if (reached("11-rateability-summary.json")) return records;
  core.push(await publish("12-blind-sheet.json", source.blindSheet));
  if (reached("12-blind-sheet.json")) return records;
  core.push(await publish("13-blind-key.json", source.blindKey));
  if (reached("13-blind-key.json")) return records;
  await publish(
    "19-core-preservation.json",
    createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
      attempt,
      phase: "core",
      records: core,
    }),
  );
  if (reached("19-core-preservation.json")) return records;

  const expectedBindings = await publish(
    "20-expected-bindings.json",
    source.expectedBindings,
  );
  if (reached("20-expected-bindings.json")) return records;
  await publish(
    "29-bindings-preservation.json",
    createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
      attempt,
      phase: "bindings",
      records: [expectedBindings],
    }),
  );
  if (reached("29-bindings-preservation.json")) return records;

  const provenance = await publish(
    "30-provenance-receipt.json",
    source.provenanceReceipt,
  );
  if (reached("30-provenance-receipt.json")) return records;
  await publish(
    "31-provenance-preservation.json",
    createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
      attempt,
      phase: "provenance",
      records: [provenance],
    }),
  );
  if (reached("31-provenance-preservation.json")) return records;

  await publish("32-run-package.json", source.runPackage);
  if (reached("32-run-package.json")) return records;
  throw new Error(`Unsupported attempt-prefix endpoint: ${finalName}`);
}

function createFilesystemProbe() {
  const events = [];
  let hold = null;

  const invoke = async (event, operation) => {
    events.push(event);
    if (hold !== null && hold.predicate(event, events)) {
      const selected = hold;
      hold = null;
      selected.markStarted();
      await selected.released;
    }
    return await operation();
  };
  const handleMethods = new Set([
    "chmod",
    "close",
    "readFile",
    "stat",
    "sync",
    "writeFile",
  ]);
  const wrapHandle = (handle, path, flags) => new Proxy(handle, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      if (!handleMethods.has(property)) return value.bind(target);
      return (...arguments_) => invoke({
        op: `handle.${String(property)}`,
        path: String(path),
        flags,
      }, () => value.apply(target, arguments_));
    },
  });

  return {
    events,
    filesystem: {
      chmod: (...arguments_) => invoke({
        op: "chmod",
        path: String(arguments_[0]),
        mode: arguments_[1],
      }, () => chmod(...arguments_)),
      link: (...arguments_) => invoke({
        op: "link",
        source: String(arguments_[0]),
        destination: String(arguments_[1]),
      }, () => link(...arguments_)),
      lstat: (...arguments_) => invoke({
        op: "lstat",
        path: String(arguments_[0]),
      }, () => lstat(...arguments_)),
      mkdtemp: (...arguments_) => invoke({
        op: "mkdtemp",
        prefix: String(arguments_[0]),
      }, () => mkdtemp(...arguments_)),
      open: async (path, flags, mode) => {
        const handle = await invoke({
          op: "open",
          path: String(path),
          flags,
          mode,
        }, () => open(path, flags, mode));
        return wrapHandle(handle, path, flags);
      },
      readdir: (...arguments_) => invoke({
        op: "readdir",
        path: String(arguments_[0]),
      }, () => readdir(...arguments_)),
      rename: (...arguments_) => invoke({
        op: "rename",
        source: String(arguments_[0]),
        destination: String(arguments_[1]),
      }, () => rename(...arguments_)),
      unlink: (...arguments_) => invoke({
        op: "unlink",
        path: String(arguments_[0]),
      }, () => unlink(...arguments_)),
    },
    holdOnce(predicate) {
      let release;
      let markStarted;
      const released = new Promise((resolveRelease) => {
        release = resolveRelease;
      });
      const started = new Promise((resolveStarted) => {
        markStarted = resolveStarted;
      });
      hold = { predicate, released, markStarted };
      return { release, started };
    },
  };
}

function deadline(promise) {
  let timeout;
  const expiry = new Promise((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error("attempt finalizer operation deadlocked")),
      10_000,
    );
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timeout));
}

async function expectMissing(path) {
  await expect(lstat(path)).rejects.toMatchObject({ code: "ENOENT" });
}

async function readExactRecord(path) {
  const bytes = await readFile(path);
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  expect(new Uint8Array(bytes)).toEqual(
    serializeNarratorBrowserRateabilityEvidenceJsonV3(value),
  );
  const metadata = await lstat(path);
  expect(metadata.isFile()).toBe(true);
  expect(metadata.isSymbolicLink()).toBe(false);
  expect(metadata.mode & 0o7777).toBe(0o600);
  expect(metadata.nlink).toBe(1);
  return { bytes, value };
}

function snapshotFromRead(name, record) {
  return Object.freeze({
    name,
    schemaVersion: Number.isSafeInteger(record.value.schemaVersion)
      ? record.value.schemaVersion
      : null,
    contentHash: typeof record.value.contentHash === "string"
      ? record.value.contentHash
      : null,
    byteLength: record.bytes.byteLength,
    sha256: sha256(record.bytes),
    value: record.value,
    copyBytes: () => new Uint8Array(record.bytes),
  });
}

function commitment(snapshot) {
  return {
    name: snapshot.name,
    schemaVersion: snapshot.schemaVersion,
    contentHash: snapshot.contentHash,
    byteLength: snapshot.byteLength,
    sha256: snapshot.sha256,
  };
}

function expectDeniedAuthority(value) {
  for (const field of authorityFields) expect(value[field]).toBe(false);
}

async function readAndExpectExactTerminal(paths, attempt, records, failureCode) {
  const vaultDirectory = attemptPaths(paths, attempt).vaultDirectory;
  const diagnosticRecord = await readExactRecord(resolve(
    vaultDirectory,
    "40-verification-diagnostic.json",
  ));
  const expectedDiagnostic = createNarratorBrowserRateabilityVerificationDiagnosticV3({
    audit: diagnosticRecord.value.audit,
    failureCode,
  });
  expect(diagnosticRecord.value).toEqual(expectedDiagnostic);
  expectDeniedAuthority(diagnosticRecord.value);
  const diagnostic = snapshotFromRead(
    "40-verification-diagnostic.json",
    diagnosticRecord,
  );
  const terminalRecord = await readExactRecord(resolve(
    vaultDirectory,
    "90-attempt-terminal.json",
  ));
  const expectedTerminal = createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
    attempt,
    preservationReceipts: [
      records.get("19-core-preservation.json"),
      records.get("29-bindings-preservation.json"),
      records.get("31-provenance-preservation.json"),
      records.get("39-host-preservation.json"),
    ],
    verificationDiagnostic: diagnostic,
    runPackage: records.get("32-run-package.json"),
  });
  expect(terminalRecord.value).toEqual(expectedTerminal);
  expectDeniedAuthority(terminalRecord.value);
  return {
    diagnostic: diagnosticRecord,
    terminal: terminalRecord,
    terminalSnapshot: snapshotFromRead("90-attempt-terminal.json", terminalRecord),
  };
}

async function readAndExpectPhaseFailureTerminal(
  paths,
  attempt,
  records,
  failureCode,
) {
  const vaultDirectory = attemptPaths(paths, attempt).vaultDirectory;
  const diagnosticRecord = await readExactRecord(resolve(
    vaultDirectory,
    "40-verification-diagnostic.json",
  ));
  const expectedDiagnostic = createNarratorBrowserRateabilityVerificationDiagnosticV3({
    audit: null,
    failureCode,
  });
  expect(diagnosticRecord.value).toEqual(expectedDiagnostic);
  expectDeniedAuthority(diagnosticRecord.value);
  const diagnostic = snapshotFromRead(
    "40-verification-diagnostic.json",
    diagnosticRecord,
  );
  const preservationReceipts = [
    "19-core-preservation.json",
    "29-bindings-preservation.json",
    "31-provenance-preservation.json",
    "39-host-preservation.json",
  ].filter((name) => records.has(name)).map((name) => records.get(name));
  const terminalRecord = await readExactRecord(resolve(
    vaultDirectory,
    "90-attempt-terminal.json",
  ));
  const expectedTerminal = createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
    attempt,
    preservationReceipts,
    verificationDiagnostic: diagnostic,
    runPackage: null,
  });
  expect(terminalRecord.value).toEqual(expectedTerminal);
  expectDeniedAuthority(terminalRecord.value);
  expect(terminalRecord.value).toMatchObject({
    terminalStatus: "failed",
    failureCode,
    verificationVerdict: "not-run",
    officialDisposition: null,
  });
  return terminalRecord;
}

function terminalNamesThrough(finalName) {
  const finalIndex = narratorBrowserRateabilityAttemptVaultContractV3.fileOrder.indexOf(finalName);
  if (finalIndex < 0) throw new Error(`Unknown attempt-prefix endpoint: ${finalName}`);
  return [
    ...narratorBrowserRateabilityAttemptVaultContractV3.fileOrder.slice(0, finalIndex + 1),
    "40-verification-diagnostic.json",
    "90-attempt-terminal.json",
  ];
}

async function expectExactEvidenceDirectory(path, source) {
  expect((await readdir(path)).sort()).toEqual(
    [...narratorBrowserRateabilityEvidenceFileNamesV3].sort(),
  );
  const directoryMetadata = await lstat(path);
  expect(directoryMetadata.isDirectory()).toBe(true);
  expect(directoryMetadata.isSymbolicLink()).toBe(false);
  expect(directoryMetadata.mode & 0o7777).toBe(0o700);
  const evidence = sourceEvidence(source);
  for (const name of narratorBrowserRateabilityEvidenceFileNamesV3) {
    const expected = serializeNarratorBrowserRateabilityEvidenceJsonV3(
      evidence.get(name),
    );
    const actual = await readFile(resolve(path, name));
    expect(new Uint8Array(actual)).toEqual(expected);
    const metadata = await lstat(resolve(path, name));
    expect(metadata.isFile()).toBe(true);
    expect(metadata.isSymbolicLink()).toBe(false);
    expect(metadata.mode & 0o7777).toBe(0o600);
    expect(metadata.nlink).toBe(1);
  }
}

describe("V3 narrator browser rateability attempt-bound finalizer", () => {
  it("publishes exact retained evidence from the same active opaque admission", async () => {
    const source = fixture();
    const paths = await outputFixture();
    const probe = createFilesystemProbe();
    const attempt = await beginTracked(paths, source, probe.filesystem);
    const reserved = attemptPaths(paths, attempt);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt,
    });
    probe.events.length = 0;

    expect(() => finalizeNarratorBrowserRateabilityAttemptEvidenceV3({ admission }))
      .toThrow(/finalization is invalid/u);
    expect(() => finalizeNarratorBrowserRateabilityAttemptEvidenceV3({
      admission,
      outputDirectory: resolve(paths.root, "caller-chosen"),
    })).toThrow(/request is invalid/u);
    expect(() => finalizeNarratorBrowserRateabilityAttemptEvidenceV3({
      admission: Object.freeze(Object.create(null)),
    })).toThrow(/finalization is invalid/u);
    expect(probe.events).toEqual([]);

    let records;
    let childReturn;
    const receipt = await deadline(
      consumeNarratorBrowserRateabilityAttemptAdmissionV3({
        admission,
        launchBrowser: async () => {
          records = await publishCompletePrefix(attempt, source);
          childReturn = finalizeNarratorBrowserRateabilityAttemptEvidenceV3({
            admission,
          });
          return childReturn;
        },
      }),
    );
    markClosed(attempt);

    expect(childReturn).toBeUndefined();
    expect(Reflect.ownKeys(receipt)).toEqual([
      "schemaVersion",
      "attemptId",
      "outputBasename",
      "destinationPublished",
      "destinationReservationConsumed",
      "files",
      "terminal",
    ]);
    expect(receipt).toMatchObject({
      schemaVersion: 1,
      attemptId: attempt.attemptId,
      outputBasename: "evidence",
      destinationPublished: true,
      destinationReservationConsumed: true,
      files: narratorBrowserRateabilityEvidenceFileNamesV3,
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.files)).toBe(true);
    expect(Object.isFrozen(receipt.terminal)).toBe(true);
    expect(JSON.stringify(receipt)).not.toContain(paths.root);
    expect(JSON.stringify(receipt)).not.toContain("outputDirectory");

    await expectExactEvidenceDirectory(paths.outputDirectory, source);
    expect((await readdir(reserved.vaultDirectory)).sort()).toEqual(
      [...narratorBrowserRateabilityAttemptVaultContractV3.fileOrder].sort(),
    );
    const terminal = await readAndExpectExactTerminal(
      paths,
      attempt,
      records,
      null,
    );
    expect(terminal.diagnostic.value.audit.verdict).toBe("pass");
    expect(terminal.terminal.value).toMatchObject({
      terminalStatus: "verified",
      failureCode: null,
      verificationVerdict: "pass",
      officialDisposition: source.runPackage.disposition,
    });
    expect(receipt.terminal).toEqual(commitment(terminal.terminalSnapshot));

    for (const lockPath of [reserved.lockPath, reserved.destinationLockPath]) {
      expect((await lstat(lockPath)).mode & 0o7777).toBe(0o600);
      expect(probe.events.some((event) =>
        event.op === "unlink" && event.path === lockPath)).toBe(false);
    }
    const stageIndex = probe.events.findIndex(({ op }) => op === "mkdtemp");
    const renameIndex = probe.events.findIndex(({ op }) => op === "rename");
    expect(stageIndex).toBeGreaterThanOrEqual(0);
    expect(renameIndex).toBeGreaterThan(stageIndex);
    expect(probe.events[renameIndex - 1]).toEqual({
      op: "lstat",
      path: paths.outputDirectory,
    });
    expect(probe.events.slice(stageIndex, renameIndex).some((event) =>
      event.op === "readdir" && event.path === reserved.vaultDirectory)).toBe(true);
    for (const lockPath of [reserved.lockPath, reserved.destinationLockPath]) {
      expect(probe.events.slice(stageIndex, renameIndex).filter((event) =>
        event.op === "handle.readFile" && event.path === lockPath).length)
        .toBeGreaterThanOrEqual(2);
    }
    const diagnosticLink = probe.events.findIndex((event) =>
      event.op === "link"
        && event.destination === resolve(
          reserved.vaultDirectory,
          "40-verification-diagnostic.json",
        ));
    const terminalLink = probe.events.findIndex((event) =>
      event.op === "link"
        && event.destination === resolve(
          reserved.vaultDirectory,
          "90-attempt-terminal.json",
        ));
    expect(diagnosticLink).toBeGreaterThan(renameIndex);
    expect(terminalLink).toBeGreaterThan(diagnosticLink);
    const heldLockClose = probe.events.findIndex((event, index) =>
      index > terminalLink
        && event.op === "handle.close"
        && event.path === reserved.destinationLockPath);
    expect(heldLockClose).toBeGreaterThan(terminalLink);

    await expect(readNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "90-attempt-terminal.json",
    })).rejects.toThrow(/handle is invalid/u);
    await expect(retainNarratorBrowserRateabilityAttemptVaultV3(attempt))
      .rejects.toThrow(/handle is invalid/u);
    expect(() => finalizeNarratorBrowserRateabilityAttemptEvidenceV3({ admission }))
      .toThrow(/finalization is invalid/u);
  });

  it("does not let callback fulfillment succeed without finalization and remains retainable", async () => {
    const source = fixture();
    const paths = await outputFixture();
    const attempt = await beginTracked(paths, source);
    const reserved = attemptPaths(paths, attempt);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt,
    });

    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: () => "looks-successful",
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_REQUIRED",
    });
    await expectMissing(paths.outputDirectory);
    expect(await readdir(reserved.vaultDirectory)).toEqual([
      "00-attempt-start.json",
    ]);
    expect(() => finalizeNarratorBrowserRateabilityAttemptEvidenceV3({ admission }))
      .toThrow(/finalization is invalid/u);

    await expect(retainTracked(attempt)).resolves.toMatchObject({
      attemptId: attempt.attemptId,
      vaultRetained: true,
      lockRetained: true,
    });
    expect((await lstat(reserved.lockPath)).mode & 0o7777).toBe(0o600);
    expect((await lstat(reserved.destinationLockPath)).mode & 0o7777).toBe(0o600);
  });

  it("reserves one finalization synchronously and publishes one winner", async () => {
    const source = fixture();
    const paths = await outputFixture();
    const probe = createFilesystemProbe();
    const attempt = await beginTracked(paths, source, probe.filesystem);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt,
    });
    probe.events.length = 0;

    const receipt = await consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: async () => {
        await publishCompletePrefix(attempt, source);
        const winner = finalizeNarratorBrowserRateabilityAttemptEvidenceV3({
          admission,
        });
        expect(winner).toBeUndefined();
        expect(() => finalizeNarratorBrowserRateabilityAttemptEvidenceV3({
          admission,
        })).toThrow(/finalization is invalid/u);
        expect(() => finalizeNarratorBrowserRateabilityAttemptFailureV3({
          admission,
          failureCode: "host-preservation-failed",
        })).toThrow(/failure finalization is invalid/u);
        return winner;
      },
    });
    markClosed(attempt);
    expect(receipt.destinationPublished).toBe(true);
    expect(probe.events.filter(({ op }) => op === "rename")).toHaveLength(1);
    await expectExactEvidenceDirectory(paths.outputDirectory, source);
  });

  it("cannot turn a later callback throw into success after finalization is requested", async () => {
    const source = fixture();
    const paths = await outputFixture();
    const attempt = await beginTracked(paths, source);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt,
    });
    let records;
    let childReturn;

    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: async () => {
        records = await publishCompletePrefix(attempt, source);
        childReturn = finalizeNarratorBrowserRateabilityAttemptEvidenceV3({
          admission,
        });
        throw new Error("callback failed after requesting finalization");
      },
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_CALLBACK_FAILED",
    });
    markClosed(attempt);

    expect(childReturn).toBeUndefined();
    await expectExactEvidenceDirectory(paths.outputDirectory, source);
    const terminal = await readAndExpectExactTerminal(
      paths,
      attempt,
      records,
      null,
    );
    expect(terminal.terminal.value.terminalStatus).toBe("verified");
    await expect(readNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "90-attempt-terminal.json",
    })).rejects.toThrow(/handle is invalid/u);
    await expect(retainNarratorBrowserRateabilityAttemptVaultV3(attempt))
      .rejects.toThrow(/handle is invalid/u);
  });

  it("reports an incomplete prefix as finalization failure and remains retainable", async () => {
    const source = fixture();
    const paths = await outputFixture();
    const attempt = await beginTracked(paths, source);
    const reserved = attemptPaths(paths, attempt);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt,
    });
    let childReturn;

    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: () => {
        childReturn = finalizeNarratorBrowserRateabilityAttemptEvidenceV3({
          admission,
        });
        return "callback-returned";
      },
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_FAILED",
    });
    expect(childReturn).toBeUndefined();
    await expectMissing(paths.outputDirectory);
    expect(await readdir(reserved.vaultDirectory)).toEqual([
      "00-attempt-start.json",
    ]);
    await expect(retainTracked(attempt)).resolves.toMatchObject({
      attemptId: attempt.attemptId,
      vaultRetained: true,
      lockRetained: true,
    });
    expect((await lstat(reserved.lockPath)).mode & 0o7777).toBe(0o600);
    expect((await lstat(reserved.destinationLockPath)).mode & 0o7777).toBe(0o600);
  });

  it("runs earlier admitted work before finalization and blocks all later work", async () => {
    const source = fixture();
    const paths = await outputFixture();
    const probe = createFilesystemProbe();
    const attempt = await beginTracked(paths, source, probe.filesystem);
    const reserved = attemptPaths(paths, attempt);
    const hostPendingPath = resolve(
      reserved.vaultDirectory,
      ".39-host-preservation.json.pending",
    );
    const heldHost = probe.holdOnce((event) =>
      event.op === "open" && event.path === hostPendingPath);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt,
    });
    probe.events.length = 0;
    let earlier;
    let laterOutcome;

    const consumption = consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: async () => {
        const prefix = await publishPrefixBeforeHost(attempt, source);
        earlier = publishNarratorBrowserRateabilityAttemptRecordV3({
          attempt,
          name: "39-host-preservation.json",
          value: prefix.hostValue,
        });
        const finalization = finalizeNarratorBrowserRateabilityAttemptEvidenceV3({
          admission,
        });
        const later = readNarratorBrowserRateabilityAttemptRecordV3({
          attempt,
          name: "32-run-package.json",
        });
        laterOutcome = later.then(
          () => ({ fulfilled: true }),
          (error) => ({ fulfilled: false, error }),
        );
        return finalization;
      },
    });
    await deadline(heldHost.started);
    expect(probe.events.some(({ op }) => op === "mkdtemp")).toBe(false);
    await expect(laterOutcome).resolves.toMatchObject({
      fulfilled: false,
      error: {
        message: expect.stringMatching(/handle is reserved/u),
      },
    });
    heldHost.release();
    await expect(deadline(consumption)).resolves.toMatchObject({
      destinationPublished: true,
    });
    markClosed(attempt);
    await expect(earlier).resolves.toMatchObject({
      name: "39-host-preservation.json",
    });
    const hostLink = probe.events.findIndex((event) =>
      event.op === "link"
        && event.destination === resolve(
          reserved.vaultDirectory,
          "39-host-preservation.json",
        ));
    const stage = probe.events.findIndex(({ op }) => op === "mkdtemp");
    expect(hostLink).toBeGreaterThanOrEqual(0);
    expect(stage).toBeGreaterThan(hostLink);
  });

  it("retains an exact failed terminal without staging when the audit fails", async () => {
    const source = fixture({ wholeRowHash: true });
    const paths = await outputFixture();
    const probe = createFilesystemProbe();
    const attempt = await beginTracked(paths, source, probe.filesystem);
    const reserved = attemptPaths(paths, attempt);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt,
    });
    probe.events.length = 0;
    let records;

    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: async () => {
        records = await publishCompletePrefix(attempt, source);
        return finalizeNarratorBrowserRateabilityAttemptEvidenceV3({ admission });
      },
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_FAILED",
    });
    markClosed(attempt);
    await expectMissing(paths.outputDirectory);
    expect(probe.events.some(({ op }) => op === "mkdtemp")).toBe(false);
    expect(probe.events.some(({ op }) => op === "rename")).toBe(false);
    expect((await readdir(reserved.vaultDirectory)).sort()).toEqual(
      [...narratorBrowserRateabilityAttemptVaultContractV3.fileOrder].sort(),
    );
    const terminal = await readAndExpectExactTerminal(
      paths,
      attempt,
      records,
      "evidence-verification-failed",
    );
    expect(terminal.diagnostic.value.audit.verdict).toBe("fail");
    expect(terminal.diagnostic.value.audit.failedPredicateIds.length)
      .toBeGreaterThan(0);
    expect(terminal.terminal.value).toMatchObject({
      terminalStatus: "failed",
      failureCode: "evidence-verification-failed",
      verificationVerdict: "fail",
      officialDisposition: null,
    });
    expect(terminal.terminal.value.preservationReceipts).toHaveLength(4);
    expect((await lstat(reserved.lockPath)).mode & 0o7777).toBe(0o600);
    expect((await lstat(reserved.destinationLockPath)).mode & 0o7777).toBe(0o600);
  });

  it("retains staged bytes and never overwrites a late destination collision", async () => {
    const source = fixture();
    const paths = await outputFixture();
    const probe = createFilesystemProbe();
    const attempt = await beginTracked(paths, source, probe.filesystem);
    const reserved = attemptPaths(paths, attempt);
    const heldFinalCheck = probe.holdOnce((event, events) =>
      event.op === "lstat"
        && event.path === paths.outputDirectory
        && events.some(({ op }) => op === "mkdtemp"));
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt,
    });
    probe.events.length = 0;
    let records;

    const consumption = consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: async () => {
        records = await publishCompletePrefix(attempt, source);
        return finalizeNarratorBrowserRateabilityAttemptEvidenceV3({ admission });
      },
    });
    await deadline(heldFinalCheck.started);
    const sentinel = Buffer.from("late owner\n");
    await writeFile(paths.outputDirectory, sentinel, { mode: 0o600 });
    await chmod(paths.outputDirectory, 0o600);
    heldFinalCheck.release();
    await expect(deadline(consumption)).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_FAILED",
    });
    markClosed(attempt);

    expect(await readFile(paths.outputDirectory)).toEqual(sentinel);
    expect(probe.events.some(({ op }) => op === "rename")).toBe(false);
    const stageName = (await readdir(paths.outputParent)).find((name) =>
      name.startsWith(`${stagingPrefix}${attempt.attemptId}-`));
    expect(stageName).toBeDefined();
    await expectExactEvidenceDirectory(resolve(paths.outputParent, stageName), source);
    expect((await readdir(reserved.vaultDirectory)).sort()).toEqual(
      [...narratorBrowserRateabilityAttemptVaultContractV3.fileOrder].sort(),
    );
    const terminal = await readAndExpectExactTerminal(
      paths,
      attempt,
      records,
      "evidence-publication-failed",
    );
    expect(terminal.diagnostic.value.audit.verdict).toBe("pass");
    expect(terminal.terminal.value).toMatchObject({
      terminalStatus: "failed",
      failureCode: "evidence-publication-failed",
      verificationVerdict: "pass",
      officialDisposition: null,
    });
    expect((await lstat(reserved.lockPath)).mode & 0o7777).toBe(0o600);
    expect((await lstat(reserved.destinationLockPath)).mode & 0o7777).toBe(0o600);
  });

  it("does not wire the attempt finalizer through the generic finalizer or runner", async () => {
    const attemptSource = Function.prototype.toString.call(
      finalizeNarratorBrowserRateabilityAttemptEvidenceV3,
    );
    const genericSource = Function.prototype.toString.call(
      finalizeNarratorBrowserRateabilityEvidenceV3,
    );
    const runnerSource = await readFile(
      new URL("../run.mjs", import.meta.url),
      "utf8",
    );

    expect(finalizeNarratorBrowserRateabilityAttemptEvidenceV3)
      .not.toBe(finalizeNarratorBrowserRateabilityEvidenceV3);
    expect(attemptSource).not.toContain("outputDirectory");
    expect(attemptSource).not.toContain("filesystem");
    expect(genericSource).not.toContain(
      "finalizeNarratorBrowserRateabilityAttemptEvidenceV3",
    );
    expect(runnerSource).not.toContain(
      "finalizeNarratorBrowserRateabilityAttemptEvidenceV3",
    );
  });
});

describe("V3 narrator browser rateability phase-failure finalizer", () => {
  it.each(phaseFailureCases)(
    "retains the exact healthy $failureCode prefix and closes the admission",
    async ({ failureCode, healthyFinalName }) => {
      const source = fixture();
      const paths = await outputFixture();
      const probe = createFilesystemProbe();
      const attempt = await beginTracked(paths, source, probe.filesystem);
      const reserved = attemptPaths(paths, attempt);
      const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
        attempt,
      });
      probe.events.length = 0;
      let records;
      let childReturn;
      let finalizationEventIndex;

      await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
        admission,
        launchBrowser: async () => {
          records = await publishPrefixThrough(attempt, source, healthyFinalName);
          finalizationEventIndex = probe.events.length;
          childReturn = finalizeNarratorBrowserRateabilityAttemptFailureV3({
            admission,
            failureCode,
          });
          return childReturn;
        },
      })).rejects.toMatchObject({
        code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_FAILED",
      });
      markClosed(attempt);

      expect(childReturn).toBeUndefined();
      await expectMissing(paths.outputDirectory);
      expect((await readdir(reserved.vaultDirectory)).sort()).toEqual(
        terminalNamesThrough(healthyFinalName).sort(),
      );
      await readAndExpectPhaseFailureTerminal(
        paths,
        attempt,
        records,
        failureCode,
      );
      expect(probe.events.some(({ op }) => op === "mkdtemp" || op === "rename"))
        .toBe(false);
      expect(probe.events.slice(finalizationEventIndex).filter((event) =>
        event.path === paths.outputDirectory
          || event.source === paths.outputDirectory
          || event.destination === paths.outputDirectory
          || event.prefix === paths.outputDirectory)).toEqual([]);
      for (const lockPath of [reserved.lockPath, reserved.destinationLockPath]) {
        expect((await lstat(lockPath)).mode & 0o7777).toBe(0o600);
        expect(probe.events.some((event) =>
          event.op === "unlink" && event.path === lockPath)).toBe(false);
      }
      await expect(retainNarratorBrowserRateabilityAttemptVaultV3(attempt))
        .rejects.toThrow(/handle is invalid/u);
    },
  );

  it.each(phaseFailureCases)(
    "terminalizes a matching already-latched $failureCode publication failure",
    async ({ failureCode, latchedFinalName, failedPublishName }) => {
      const source = fixture();
      const paths = await outputFixture();
      const attempt = await beginTracked(paths, source);
      const reserved = attemptPaths(paths, attempt);
      const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
        attempt,
      });
      let records;
      let childReturn;

      await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
        admission,
        launchBrowser: async () => {
          records = await publishPrefixThrough(attempt, source, latchedFinalName);
          await expect(publishNarratorBrowserRateabilityAttemptRecordV3({
            attempt,
            name: failedPublishName,
            value: Symbol("pre-write publication failure"),
          })).rejects.toMatchObject({
            code: "ERR_NARRATOR_V3_ATTEMPT_PUBLISH_FAILED",
          });
          childReturn = finalizeNarratorBrowserRateabilityAttemptFailureV3({
            admission,
            failureCode,
          });
          return childReturn;
        },
      })).rejects.toMatchObject({
        code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_FAILED",
      });
      markClosed(attempt);

      expect(childReturn).toBeUndefined();
      await expectMissing(paths.outputDirectory);
      expect((await readdir(reserved.vaultDirectory)).sort()).toEqual(
        terminalNamesThrough(latchedFinalName).sort(),
      );
      await readAndExpectPhaseFailureTerminal(
        paths,
        attempt,
        records,
        failureCode,
      );
      expect((await lstat(reserved.lockPath)).mode & 0o7777).toBe(0o600);
      expect((await lstat(reserved.destinationLockPath)).mode & 0o7777).toBe(0o600);
    },
  );

  it("rejects malformed, forged, duplicate, and stale requests without filesystem work", async () => {
    const source = fixture();
    const paths = await outputFixture();
    const probe = createFilesystemProbe();
    const attempt = await beginTracked(paths, source, probe.filesystem);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt,
    });
    probe.events.length = 0;
    const requestError =
      "Narrator V3 rateability attempt failure finalization request is invalid";
    const stateError =
      "Narrator V3 rateability attempt failure finalization is invalid";
    const expectNoIoThrow = (operation, message) => {
      const eventCount = probe.events.length;
      expect(operation).toThrow(new TypeError(message));
      expect(probe.events).toHaveLength(eventCount);
    };

    expectNoIoThrow(
      () => finalizeNarratorBrowserRateabilityAttemptFailureV3({
        admission,
        failureCode: "core-preservation-failed",
      }),
      stateError,
    );
    expectNoIoThrow(
      () => finalizeNarratorBrowserRateabilityAttemptFailureV3({
        admission,
        failureCode: "internal-failure",
      }),
      requestError,
    );
    expectNoIoThrow(
      () => finalizeNarratorBrowserRateabilityAttemptFailureV3({
        admission,
        failureCode: "core-preservation-failed",
        outputDirectory: paths.outputDirectory,
      }),
      requestError,
    );
    expectNoIoThrow(
      () => finalizeNarratorBrowserRateabilityAttemptFailureV3(new Proxy({}, {
        ownKeys() {
          throw new Error(paths.root);
        },
      })),
      requestError,
    );
    const forgedAdmission = Object.freeze(Object.create(null));
    expectNoIoThrow(
      () => finalizeNarratorBrowserRateabilityAttemptFailureV3(Object.freeze(
        Object.assign(Object.create(null), {
          admission: forgedAdmission,
          failureCode: "core-preservation-failed",
        }),
      )),
      stateError,
    );
    let admissionReads = 0;
    let failureCodeReads = 0;
    const getterRequest = {};
    Object.defineProperties(getterRequest, {
      admission: {
        enumerable: true,
        get() {
          admissionReads += 1;
          return admission;
        },
      },
      failureCode: {
        enumerable: true,
        get() {
          failureCodeReads += 1;
          return "core-preservation-failed";
        },
      },
    });
    expectNoIoThrow(
      () => finalizeNarratorBrowserRateabilityAttemptFailureV3(getterRequest),
      stateError,
    );
    expect({ admissionReads, failureCodeReads }).toEqual({
      admissionReads: 1,
      failureCodeReads: 1,
    });

    let releaseDescendant;
    const descendantGate = new Promise((resolveGate) => {
      releaseDescendant = resolveGate;
    });
    let descendant;
    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: () => {
        descendant = descendantGate.then(() => {
          const eventCount = probe.events.length;
          let error;
          try {
            finalizeNarratorBrowserRateabilityAttemptFailureV3({
              admission,
              failureCode: "core-preservation-failed",
            });
          } catch (caught) {
            error = caught;
          }
          return { error, eventCount, finalEventCount: probe.events.length };
        });
        const winner = finalizeNarratorBrowserRateabilityAttemptFailureV3({
          admission,
          failureCode: "core-preservation-failed",
        });
        expect(winner).toBeUndefined();
        expectNoIoThrow(
          () => finalizeNarratorBrowserRateabilityAttemptFailureV3({
            admission,
            failureCode: "core-preservation-failed",
          }),
          stateError,
        );
        return winner;
      },
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_FAILED",
    });
    markClosed(attempt);

    const staleEventCount = probe.events.length;
    expect(() => finalizeNarratorBrowserRateabilityAttemptFailureV3({
      admission,
      failureCode: "core-preservation-failed",
    })).toThrow(new TypeError(stateError));
    expect(probe.events).toHaveLength(staleEventCount);
    releaseDescendant();
    await expect(descendant).resolves.toMatchObject({
      error: {
        name: "TypeError",
        message: stateError,
      },
      eventCount: staleEventCount,
      finalEventCount: staleEventCount,
    });
  });

  it("rejects an active token from another attempt without joining its filesystem queue", async () => {
    const source = fixture();
    const firstPaths = await outputFixture();
    const secondPaths = await outputFixture();
    const probe = createFilesystemProbe();
    const firstAttempt = await beginTracked(firstPaths, source);
    const secondAttempt = await beginTracked(
      secondPaths,
      source,
      probe.filesystem,
    );
    const firstAdmission =
      await issueNarratorBrowserRateabilityAttemptAdmissionV3({
        attempt: firstAttempt,
      });
    const secondAdmission =
      await issueNarratorBrowserRateabilityAttemptAdmissionV3({
        attempt: secondAttempt,
      });
    probe.events.length = 0;

    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission: secondAdmission,
      launchBrowser: () => {
        const eventCount = probe.events.length;
        expect(() => finalizeNarratorBrowserRateabilityAttemptFailureV3({
          admission: firstAdmission,
          failureCode: "core-preservation-failed",
        })).toThrow(new TypeError(
          "Narrator V3 rateability attempt failure finalization is invalid",
        ));
        expect(probe.events).toHaveLength(eventCount);
        return finalizeNarratorBrowserRateabilityAttemptFailureV3({
          admission: secondAdmission,
          failureCode: "core-preservation-failed",
        });
      },
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_FAILED",
    });
    markClosed(secondAttempt);

    await expect(retainTracked(firstAttempt)).resolves.toMatchObject({
      vaultRetained: true,
      lockRetained: true,
    });
  });

  it("does not inspect or overwrite a destination created after failure reservation", async () => {
    const source = fixture();
    const paths = await outputFixture();
    const attempt = await beginTracked(paths, source);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt,
    });

    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: async () => {
        const childReturn =
          finalizeNarratorBrowserRateabilityAttemptFailureV3({
            admission,
            failureCode: "core-preservation-failed",
          });
        await mkdir(paths.outputDirectory, { mode: 0o700 });
        await chmod(paths.outputDirectory, 0o700);
        return childReturn;
      },
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_FAILED",
    });
    markClosed(attempt);

    const destination = await lstat(paths.outputDirectory);
    expect(destination.isDirectory()).toBe(true);
    expect(destination.mode & 0o7777).toBe(0o700);
  });

  it("rejects a healthy phase/prefix mismatch before terminal I/O and remains retainable", async () => {
    const source = fixture();
    const paths = await outputFixture();
    const probe = createFilesystemProbe();
    const attempt = await beginTracked(paths, source, probe.filesystem);
    const reserved = attemptPaths(paths, attempt);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt,
    });
    probe.events.length = 0;
    let childReturn;

    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: () => {
        childReturn = finalizeNarratorBrowserRateabilityAttemptFailureV3({
          admission,
          failureCode: "bindings-preservation-failed",
        });
        return childReturn;
      },
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_FAILED",
    });

    expect(childReturn).toBeUndefined();
    await expectMissing(paths.outputDirectory);
    expect(await readdir(reserved.vaultDirectory)).toEqual([
      "00-attempt-start.json",
    ]);
    expect(probe.events.some((event) =>
      event.op === "link"
        && (event.destination.endsWith("/40-verification-diagnostic.json")
          || event.destination.endsWith("/90-attempt-terminal.json")))).toBe(false);
    await expect(retainTracked(attempt)).resolves.toMatchObject({
      vaultRetained: true,
      lockRetained: true,
    });
  });

  it("retains post-link source-publication ambiguity without claiming a terminal", async () => {
    const source = fixture();
    const paths = await outputFixture();
    const probe = createFilesystemProbe();
    let failPendingUnlink = true;
    const filesystem = {
      ...probe.filesystem,
      unlink: async (path) => {
        if (failPendingUnlink
          && String(path).endsWith("/.10-run-receipt.json.pending")) {
          failPendingUnlink = false;
          probe.events.push({ op: "unlink", path: String(path) });
          throw new Error("injected post-link unlink failure");
        }
        return await probe.filesystem.unlink(path);
      },
    };
    const attempt = await beginTracked(paths, source, filesystem);
    const reserved = attemptPaths(paths, attempt);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt,
    });
    probe.events.length = 0;

    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: async () => {
        await expect(publishNarratorBrowserRateabilityAttemptRecordV3({
          attempt,
          name: "10-run-receipt.json",
          value: source.runReceipt,
        })).rejects.toMatchObject({
          code: "ERR_NARRATOR_V3_ATTEMPT_PUBLISH_FAILED",
        });
        return finalizeNarratorBrowserRateabilityAttemptFailureV3({
          admission,
          failureCode: "core-preservation-failed",
        });
      },
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_RETENTION_FAILED",
    });
    markClosed(attempt);

    expect((await readdir(reserved.vaultDirectory)).sort()).toEqual([
      ".10-run-receipt.json.pending",
      "00-attempt-start.json",
      "10-run-receipt.json",
    ]);
    for (const name of [
      ".10-run-receipt.json.pending",
      "10-run-receipt.json",
    ]) {
      const metadata = await lstat(resolve(reserved.vaultDirectory, name));
      expect(metadata.mode & 0o7777).toBe(0o600);
      expect(metadata.nlink).toBe(2);
    }
    expect(probe.events.some((event) =>
      event.op === "unlink"
        && event.path === resolve(
          reserved.vaultDirectory,
          "10-run-receipt.json",
        ))).toBe(false);
    await expectMissing(resolve(
      reserved.vaultDirectory,
      "40-verification-diagnostic.json",
    ));
    await expectMissing(resolve(
      reserved.vaultDirectory,
      "90-attempt-terminal.json",
    ));
  });

  it("runs earlier admitted publication before failure finalization and seals later work", async () => {
    const source = fixture();
    const paths = await outputFixture();
    const probe = createFilesystemProbe();
    const attempt = await beginTracked(paths, source, probe.filesystem);
    const reserved = attemptPaths(paths, attempt);
    const runPackagePendingPath = resolve(
      reserved.vaultDirectory,
      ".32-run-package.json.pending",
    );
    const heldRunPackage = probe.holdOnce((event) =>
      event.op === "open" && event.path === runPackagePendingPath);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt,
    });
    probe.events.length = 0;
    let records;
    let earlier;
    let laterOutcome;

    const consumption = consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: async () => {
        records = await publishPrefixThrough(
          attempt,
          source,
          "31-provenance-preservation.json",
        );
        earlier = publishNarratorBrowserRateabilityAttemptRecordV3({
          attempt,
          name: "32-run-package.json",
          value: source.runPackage,
        });
        const finalization = finalizeNarratorBrowserRateabilityAttemptFailureV3({
          admission,
          failureCode: "host-preservation-failed",
        });
        const later = readNarratorBrowserRateabilityAttemptRecordV3({
          attempt,
          name: "30-provenance-receipt.json",
        });
        laterOutcome = later.then(
          () => ({ fulfilled: true }),
          (error) => ({ fulfilled: false, error }),
        );
        return finalization;
      },
    });

    await deadline(heldRunPackage.started);
    await expect(laterOutcome).resolves.toMatchObject({
      fulfilled: false,
      error: {
        message: expect.stringMatching(/handle is reserved/u),
      },
    });
    expect(probe.events.some(({ op }) => op === "mkdtemp" || op === "rename"))
      .toBe(false);
    heldRunPackage.release();
    await expect(deadline(consumption)).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_FAILED",
    });
    markClosed(attempt);
    records.set("32-run-package.json", await earlier);

    const runPackageLink = probe.events.findIndex((event) =>
      event.op === "link"
        && event.destination === resolve(
          reserved.vaultDirectory,
          "32-run-package.json",
        ));
    const diagnosticLink = probe.events.findIndex((event) =>
      event.op === "link"
        && event.destination === resolve(
          reserved.vaultDirectory,
          "40-verification-diagnostic.json",
        ));
    expect(runPackageLink).toBeGreaterThanOrEqual(0);
    expect(diagnosticLink).toBeGreaterThan(runPackageLink);
    await readAndExpectPhaseFailureTerminal(
      paths,
      attempt,
      records,
      "host-preservation-failed",
    );
  });

  it("keeps durable failure finalization ahead of a later callback throw", async () => {
    const source = fixture();
    const paths = await outputFixture();
    const attempt = await beginTracked(paths, source);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt,
    });
    let records;
    let childReturn;

    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: async () => {
        records = await publishPrefixThrough(
          attempt,
          source,
          "00-attempt-start.json",
        );
        childReturn = finalizeNarratorBrowserRateabilityAttemptFailureV3({
          admission,
          failureCode: "core-preservation-failed",
        });
        expect(() => finalizeNarratorBrowserRateabilityAttemptEvidenceV3({
          admission,
        })).toThrow(/finalization is invalid/u);
        throw new Error("callback failed after requesting phase finalization");
      },
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_FAILED",
    });
    markClosed(attempt);

    expect(childReturn).toBeUndefined();
    await readAndExpectPhaseFailureTerminal(
      paths,
      attempt,
      records,
      "core-preservation-failed",
    );
  });

  it("rejects a mismatched existing latch without relabeling it", async () => {
    const source = fixture();
    const paths = await outputFixture();
    const probe = createFilesystemProbe();
    const attempt = await beginTracked(paths, source, probe.filesystem);
    const reserved = attemptPaths(paths, attempt);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt,
    });
    probe.events.length = 0;

    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: async () => {
        await expect(publishNarratorBrowserRateabilityAttemptRecordV3({
          attempt,
          name: "10-run-receipt.json",
          value: Symbol("pre-write publication failure"),
        })).rejects.toMatchObject({
          code: "ERR_NARRATOR_V3_ATTEMPT_PUBLISH_FAILED",
        });
        const eventCount = probe.events.length;
        expect(() => finalizeNarratorBrowserRateabilityAttemptFailureV3({
          admission,
          failureCode: "bindings-preservation-failed",
        })).toThrow(/failure finalization is invalid/u);
        expect(probe.events).toHaveLength(eventCount);
      },
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_CALLBACK_FAILED",
    });

    expect(await readdir(reserved.vaultDirectory)).toEqual([
      "00-attempt-start.json",
    ]);
    await expect(retainTracked(attempt)).resolves.toMatchObject({
      vaultRetained: true,
      lockRetained: true,
    });
  });

  it("reports terminal publication uncertainty without deleting forensic paths", async () => {
    const source = fixture();
    const paths = await outputFixture();
    const probe = createFilesystemProbe();
    let failTerminalLink = true;
    const filesystem = {
      ...probe.filesystem,
      link: async (sourcePath, destinationPath) => {
        if (failTerminalLink
          && String(destinationPath).endsWith("/90-attempt-terminal.json")) {
          failTerminalLink = false;
          probe.events.push({
            op: "link",
            source: String(sourcePath),
            destination: String(destinationPath),
          });
          throw new Error("injected terminal link failure");
        }
        return await probe.filesystem.link(sourcePath, destinationPath);
      },
    };
    const attempt = await beginTracked(paths, source, filesystem);
    const reserved = attemptPaths(paths, attempt);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt,
    });
    probe.events.length = 0;

    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: () => finalizeNarratorBrowserRateabilityAttemptFailureV3({
        admission,
        failureCode: "core-preservation-failed",
      }),
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_RETENTION_FAILED",
    });
    markClosed(attempt);

    await expectMissing(paths.outputDirectory);
    expect((await readdir(reserved.vaultDirectory)).sort()).toEqual([
      ".90-attempt-terminal.json.pending",
      "00-attempt-start.json",
      "40-verification-diagnostic.json",
    ]);
    expect((await lstat(resolve(
      reserved.vaultDirectory,
      ".90-attempt-terminal.json.pending",
    ))).mode & 0o7777).toBe(0o600);
    expect(probe.events.some((event) =>
      event.op === "unlink"
        && event.path.endsWith("/.90-attempt-terminal.json.pending"))).toBe(false);
    expect(probe.events.some(({ op }) => op === "mkdtemp" || op === "rename"))
      .toBe(false);
    expect((await lstat(reserved.lockPath)).mode & 0o7777).toBe(0o600);
    expect((await lstat(reserved.destinationLockPath)).mode & 0o7777).toBe(0o600);
  });
});
