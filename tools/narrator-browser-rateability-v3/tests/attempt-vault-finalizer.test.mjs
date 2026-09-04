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
