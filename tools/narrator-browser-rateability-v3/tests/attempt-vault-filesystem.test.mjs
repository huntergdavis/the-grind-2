import { createHash } from "node:crypto";
import { constants as filesystemConstants } from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  auditNarratorBrowserRateabilityEvidenceSetV3,
  beginNarratorBrowserRateabilityAttemptVaultV3,
  createNarratorBrowserRateabilityAttemptPreservationReceiptV3,
  createNarratorBrowserRateabilityAttemptTerminalReceiptV3,
  createNarratorBrowserRateabilityAttemptIdentityV3,
  createNarratorBrowserRateabilityOutputReservationV3,
  createNarratorBrowserRateabilityVerificationDiagnosticV3,
  narratorBrowserRateabilityAttemptVaultContractHashV3,
  narratorBrowserRateabilityAttemptVaultContractV3,
  narratorBrowserRateabilityAttemptRecordContractHashV3,
  narratorBrowserRateabilityEvidencePredicateContractV3,
  narratorBrowserRateabilityOutputReservationContractHashV3,
  publishNarratorBrowserRateabilityAttemptRecordV3,
  readNarratorBrowserRateabilityAttemptRecordV3,
  retainNarratorBrowserRateabilityAttemptVaultV3,
} from "../run-support.mjs";

const temporaryRoots = [];
const activeAttempts = new Set();

const sourceCommit = "a".repeat(40);
const candidateId = "flan-t5-small-q8@11111111";
const defaultRunId = "grind2-v3-rateability:v0.5.91:test";
const defaultSheetId = "grind2-v3-rateability-sheet:v0.5.91:test";

const exclusiveWriteFlags = filesystemConstants.O_WRONLY
  | filesystemConstants.O_CREAT
  | filesystemConstants.O_EXCL
  | filesystemConstants.O_NOFOLLOW;
const directoryReadFlags = filesystemConstants.O_RDONLY
  | filesystemConstants.O_DIRECTORY
  | filesystemConstants.O_NOFOLLOW;

afterEach(async () => {
  const attempts = [...activeAttempts];
  activeAttempts.clear();
  await Promise.allSettled(attempts.map((attempt) =>
    retainNarratorBrowserRateabilityAttemptVaultV3(attempt)));
  await Promise.all(temporaryRoots.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })));
});

function canonicalStringify(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("invalid canonical number");
    return String(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalStringify).join(",") + "]";
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return "{" + keys.map((key) =>
    JSON.stringify(key) + ":" + canonicalStringify(value[key])).join(",") + "}";
}

function canonicalHash(value) {
  const source = canonicalStringify(value);
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right ^= code + 0x9e3779b9 + (right << 6) + (right >>> 2);
  }
  return (left >>> 0).toString(16).padStart(8, "0")
    + (right >>> 0).toString(16).padStart(8, "0");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactBytes(value) {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n");
}

function record(label, schemaVersion = 3, fields = {}) {
  const content = { schemaVersion, label, ...fields };
  return Object.freeze({ ...content, contentHash: canonicalHash(content) });
}

function rehash(value, mutate) {
  const content = structuredClone(value);
  delete content.contentHash;
  mutate(content);
  return Object.freeze({ ...content, contentHash: canonicalHash(content) });
}

function passingAudit() {
  return Object.freeze({
    schemaVersion: 1,
    auditId: "the-grind-2:narrator-browser-rateability-evidence-audit:v3",
    verdict: "pass",
    predicates: narratorBrowserRateabilityEvidencePredicateContractV3.map(({ id }) =>
      Object.freeze({ id, status: "pass", blockedBy: Object.freeze([]) })),
    failedPredicateIds: Object.freeze([]),
    notEvaluatedPredicateIds: Object.freeze([]),
  });
}

async function outputFixture() {
  const root = await mkdtemp(resolve(tmpdir(), "grind2-attempt-vault-"));
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

function beginRequest(paths, overrides = {}) {
  return {
    outputDirectory: paths.outputDirectory,
    sourceCommit,
    candidateId,
    runId: defaultRunId,
    sheetId: defaultSheetId,
    repositoryRoot: paths.repositoryRoot,
    ...overrides,
  };
}

async function beginTracked(paths, overrides = {}) {
  const attempt = await beginNarratorBrowserRateabilityAttemptVaultV3(
    beginRequest(paths, overrides),
  );
  activeAttempts.add(attempt);
  return attempt;
}

async function retainTracked(attempt) {
  if (!activeAttempts.has(attempt)) return;
  try {
    await retainNarratorBrowserRateabilityAttemptVaultV3(attempt);
  } finally {
    activeAttempts.delete(attempt);
  }
}

async function publishCompletePreservationPrefix(attempt, disposition) {
  const preservationReceipts = [];
  const coreRecords = [];
  for (const [name, label] of [
    ["10-run-receipt.json", "security-run"],
    ["11-rateability-summary.json", "security-summary"],
    ["12-blind-sheet.json", "security-sheet"],
    ["13-blind-key.json", "security-key"],
  ]) {
    coreRecords.push(await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name,
      value: record(label),
    }));
  }
  preservationReceipts.push(await publishNarratorBrowserRateabilityAttemptRecordV3({
    attempt,
    name: "19-core-preservation.json",
    value: createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
      attempt,
      phase: "core",
      records: coreRecords,
    }),
  }));

  const bindings = await publishNarratorBrowserRateabilityAttemptRecordV3({
    attempt,
    name: "20-expected-bindings.json",
    value: Object.freeze({ fixture: "security-bindings" }),
  });
  preservationReceipts.push(await publishNarratorBrowserRateabilityAttemptRecordV3({
    attempt,
    name: "29-bindings-preservation.json",
    value: createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
      attempt,
      phase: "bindings",
      records: [bindings],
    }),
  }));

  const provenance = await publishNarratorBrowserRateabilityAttemptRecordV3({
    attempt,
    name: "30-provenance-receipt.json",
    value: record("security-provenance"),
  });
  preservationReceipts.push(await publishNarratorBrowserRateabilityAttemptRecordV3({
    attempt,
    name: "31-provenance-preservation.json",
    value: createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
      attempt,
      phase: "provenance",
      records: [provenance],
    }),
  }));

  const runPackage = await publishNarratorBrowserRateabilityAttemptRecordV3({
    attempt,
    name: "32-run-package.json",
    value: record("security-package", 3, { disposition }),
  });
  preservationReceipts.push(await publishNarratorBrowserRateabilityAttemptRecordV3({
    attempt,
    name: "39-host-preservation.json",
    value: createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
      attempt,
      phase: "host",
      records: [provenance, runPackage],
    }),
  }));
  return { preservationReceipts, runPackage };
}

function pathsForAttempt(paths, attempt) {
  const vaultDirectory = resolve(
    paths.outputParent,
    ".narrator-browser-rateability-v3-attempt-" + attempt.attemptId,
  );
  const outputReservation = createNarratorBrowserRateabilityOutputReservationV3(
    basename(paths.outputDirectory),
  );
  return {
    vaultDirectory,
    lockPath: vaultDirectory + ".lock",
    destinationLockPath: resolve(paths.outputParent, outputReservation.lockName),
  };
}

function metadataProxy(metadata, changes) {
  return new Proxy(metadata, {
    get(target, property, receiver) {
      if (Object.hasOwn(changes, property)) return changes[property];
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function collectStrings(value, result = []) {
  if (typeof value === "string") {
    result.push(value);
  } else if (Array.isArray(value)) {
    for (const child of value) collectStrings(child, result);
  } else if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) collectStrings(child, result);
  }
  return result;
}

function expectExactPrivate(metadata, mode) {
  expect(metadata.isSymbolicLink()).toBe(false);
  expect(metadata.mode & 0o7777).toBe(mode);
  expect(metadata.uid).toBe(process.geteuid());
}

function expectSnapshot(snapshot, name, value) {
  const bytes = exactBytes(value);
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.keys(snapshot).sort()).toEqual([
    "byteLength",
    "contentHash",
    "copyBytes",
    "name",
    "schemaVersion",
    "sha256",
    "value",
  ]);
  expect(snapshot).toMatchObject({
    name,
    schemaVersion: Number.isSafeInteger(value.schemaVersion) ? value.schemaVersion : null,
    contentHash: value.contentHash ?? null,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
    value,
  });
  expect(snapshot.copyBytes).toBeTypeOf("function");
  const first = snapshot.copyBytes();
  const second = snapshot.copyBytes();
  expect(first).toBeInstanceOf(Uint8Array);
  expect(second).toBeInstanceOf(Uint8Array);
  expect(first).not.toBe(second);
  expect(Buffer.from(first)).toEqual(bytes);
  if (first.byteLength > 0) first[0] ^= 0xff;
  expect(Buffer.from(snapshot.copyBytes())).toEqual(bytes);
}

function createFilesystemProbe() {
  const events = [];
  let failure = null;

  const invoke = async (event, operation) => {
    events.push(event);
    if (failure !== null && failure(event, events)) {
      failure = null;
      throw new Error("injected attempt-vault filesystem failure");
    }
    return await operation();
  };

  const handleMethods = new Set([
    "chmod",
    "close",
    "read",
    "readFile",
    "stat",
    "sync",
    "write",
    "writeFile",
  ]);

  const wrapHandle = (handle, path, flags) => new Proxy(handle, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      if (!handleMethods.has(property)) return value.bind(target);
      return async (...arguments_) => invoke({
        op: "handle." + property,
        path,
        flags,
      }, () => value.apply(target, arguments_));
    },
  });

  const filesystem = {
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
    mkdir: (...arguments_) => invoke({
      op: "mkdir",
      path: String(arguments_[0]),
    }, () => mkdir(...arguments_)),
    mkdtemp: async (...arguments_) => {
      events.push({ op: "mkdtemp", path: String(arguments_[0]) });
      throw new Error("attempt vault must not use mkdtemp");
    },
    open: async (path, flags, mode) => {
      const stringPath = String(path);
      const handle = await invoke({
        op: "open",
        path: stringPath,
        flags,
        mode,
      }, () => open(path, flags, mode));
      return wrapHandle(handle, stringPath, flags);
    },
    readdir: (...arguments_) => invoke({
      op: "readdir",
      path: String(arguments_[0]),
    }, () => readdir(...arguments_)),
    realpath: (...arguments_) => invoke({
      op: "realpath",
      path: String(arguments_[0]),
    }, () => realpath(...arguments_)),
    rename: async (...arguments_) => {
      events.push({
        op: "rename",
        source: String(arguments_[0]),
        destination: String(arguments_[1]),
      });
      throw new Error("attempt vault must not use rename");
    },
    rm: async (...arguments_) => {
      events.push({ op: "rm", path: String(arguments_[0]) });
      throw new Error("attempt vault must not use rm");
    },
    unlink: (...arguments_) => invoke({
      op: "unlink",
      path: String(arguments_[0]),
    }, () => unlink(...arguments_)),
  };

  return {
    events,
    filesystem,
    failOnce(predicate) {
      failure = predicate;
    },
  };
}

function eventIndex(events, predicate, start = 0) {
  return events.findIndex((event, index) => index >= start && predicate(event));
}

function expectAtomicPublicationTrace(events, vaultDirectory, name) {
  const pendingPath = resolve(vaultDirectory, "." + name + ".pending");
  const finalPath = resolve(vaultDirectory, name);
  const pendingOpen = eventIndex(events, (event) =>
    event.op === "open" && event.path === pendingPath);
  const pendingSync = eventIndex(events, (event) =>
    event.op === "handle.sync" && event.path === pendingPath, pendingOpen + 1);
  const pendingClose = eventIndex(events, (event) =>
    event.op === "handle.close" && event.path === pendingPath, pendingSync + 1);
  const publishLink = eventIndex(events, (event) =>
    event.op === "link"
      && event.source === pendingPath
      && event.destination === finalPath, pendingClose + 1);
  const firstVaultSync = eventIndex(events, (event) =>
    event.op === "handle.sync" && event.path === vaultDirectory, publishLink + 1);
  const pendingUnlink = eventIndex(events, (event) =>
    event.op === "unlink" && event.path === pendingPath, firstVaultSync + 1);
  const secondVaultSync = eventIndex(events, (event) =>
    event.op === "handle.sync" && event.path === vaultDirectory, pendingUnlink + 1);
  const finalRead = eventIndex(events, (event) =>
    event.op === "open"
      && event.path === finalPath
      && (event.flags & filesystemConstants.O_NOFOLLOW) !== 0
      && (event.flags & (filesystemConstants.O_WRONLY | filesystemConstants.O_RDWR)) === 0,
  secondVaultSync + 1);

  expect([
    pendingOpen,
    pendingSync,
    pendingClose,
    publishLink,
    firstVaultSync,
    pendingUnlink,
    secondVaultSync,
    finalRead,
  ].every((index) => index >= 0)).toBe(true);
  expect(events[pendingOpen].flags & exclusiveWriteFlags).toBe(exclusiveWriteFlags);
  expect(events[pendingOpen].mode).toBe(0o600);
  expect(pendingOpen).toBeLessThan(pendingSync);
  expect(pendingSync).toBeLessThan(pendingClose);
  expect(pendingClose).toBeLessThan(publishLink);
  expect(publishLink).toBeLessThan(firstVaultSync);
  expect(firstVaultSync).toBeLessThan(pendingUnlink);
  expect(pendingUnlink).toBeLessThan(secondVaultSync);
  expect(secondVaultSync).toBeLessThan(finalRead);
}

describe("V3 narrator browser rateability attempt-vault filesystem", () => {
  it("creates a bound private tombstone and atomically publishes exact snapshots", async () => {
    const paths = await outputFixture();
    const probe = createFilesystemProbe();
    const attempt = await beginTracked(paths, { filesystem: probe.filesystem });
    const { vaultDirectory, lockPath, destinationLockPath } = pathsForAttempt(paths, attempt);

    expect(Object.isFrozen(attempt)).toBe(true);
    expect(Object.keys(attempt).sort()).toEqual([
      "attemptId",
      "schemaVersion",
      "vaultContractHash",
    ]);
    expect(attempt).toEqual({
      schemaVersion: 1,
      attemptId: expect.stringMatching(/^[0-9a-f]{64}$/u),
      vaultContractHash: narratorBrowserRateabilityAttemptVaultContractHashV3,
    });

    expectExactPrivate(await lstat(vaultDirectory), 0o700);
    expectExactPrivate(await lstat(lockPath), 0o600);
    expectExactPrivate(await lstat(destinationLockPath), 0o600);
    const startPath = resolve(vaultDirectory, "00-attempt-start.json");
    const startMetadata = await lstat(startPath);
    expectExactPrivate(startMetadata, 0o600);
    expect(startMetadata.nlink).toBe(1);
    expect((await readdir(vaultDirectory)).sort()).toEqual(["00-attempt-start.json"]);

    const start = await readNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "00-attempt-start.json",
    });
    expectSnapshot(start, "00-attempt-start.json", start.value);
    expect(Object.isFrozen(start.value)).toBe(true);
    expect(Object.isFrozen(start.value.expectedCoreFiles)).toBe(true);
    expect(() => start.value.expectedCoreFiles.push("forged.json")).toThrow(TypeError);
    expect(start.value).toMatchObject({
      schemaVersion: 1,
      attemptId: attempt.attemptId,
      vaultContractHash: attempt.vaultContractHash,
      recordContractHash: narratorBrowserRateabilityAttemptRecordContractHashV3,
      sourceCommit,
      candidateId,
      runId: defaultRunId,
      sheetId: defaultSheetId,
      outputReservationContractHash:
        narratorBrowserRateabilityOutputReservationContractHashV3,
      outputReservationId: createNarratorBrowserRateabilityOutputReservationV3(
        basename(paths.outputDirectory),
      ).reservationId,
    });
    const startStrings = collectStrings(start.value);
    expect(startStrings).toContain(basename(paths.outputDirectory));
    expect(startStrings).not.toContain(paths.outputDirectory);
    expect(await readFile(startPath)).toEqual(Buffer.from(start.copyBytes()));

    const value = record("core-run-receipt");
    const published = await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "10-run-receipt.json",
      value,
    });
    expectSnapshot(published, "10-run-receipt.json", value);
    const reread = await readNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "10-run-receipt.json",
      expected: published,
    });
    expectSnapshot(reread, "10-run-receipt.json", value);
    expect(await readFile(resolve(vaultDirectory, "10-run-receipt.json")))
      .toEqual(exactBytes(value));

    expectAtomicPublicationTrace(probe.events, vaultDirectory, "00-attempt-start.json");
    expectAtomicPublicationTrace(probe.events, vaultDirectory, "10-run-receipt.json");
    const lockOpen = probe.events.find((event) =>
      event.op === "open" && event.path === lockPath);
    expect(lockOpen.flags & exclusiveWriteFlags).toBe(exclusiveWriteFlags);
    expect(lockOpen.mode).toBe(0o600);
    const directoryOpens = probe.events.filter((event) =>
      event.op === "open"
        && [paths.outputParent, vaultDirectory].includes(event.path)
        && (event.flags & filesystemConstants.O_DIRECTORY) !== 0);
    expect(directoryOpens.length).toBeGreaterThan(0);
    expect(directoryOpens.every((event) =>
      (event.flags & directoryReadFlags) === directoryReadFlags)).toBe(true);
    expect(probe.events.some(({ op }) => op === "rename" || op === "rm" || op === "mkdtemp"))
      .toBe(false);

    await retainTracked(attempt);
    expectExactPrivate(await lstat(vaultDirectory), 0o700);
    expectExactPrivate(await lstat(lockPath), 0o600);
    expectExactPrivate(await lstat(destinationLockPath), 0o600);
    for (const retainedLockPath of [lockPath, destinationLockPath]) {
      expect(probe.events.filter((event) =>
        event.op === "handle.sync" && event.path === retainedLockPath)).toHaveLength(2);
    }
  });

  it("publishes schema-less expected bindings with null snapshot metadata and exact readback", async () => {
    const paths = await outputFixture();
    const attempt = await beginTracked(paths, {
      runId: defaultRunId + ":schema-less-bindings",
    });
    const { vaultDirectory } = pathsForAttempt(paths, attempt);
    const value = Object.freeze({
      sourceCommit,
      candidateId,
      runId: defaultRunId + ":schema-less-bindings",
      sheetId: defaultSheetId,
      browser: Object.freeze({ name: "chromium", version: "test" }),
      network: Object.freeze({
        stagingExternalRequestCount: 0,
        postOfflineRequestCount: 0,
      }),
    });

    expect(Object.hasOwn(value, "schemaVersion")).toBe(false);
    expect(Object.hasOwn(value, "contentHash")).toBe(false);
    const coreRecords = [];
    for (const [name, label] of [
      ["10-run-receipt.json", "bindings-prefix-run"],
      ["11-rateability-summary.json", "bindings-prefix-summary"],
      ["12-blind-sheet.json", "bindings-prefix-sheet"],
      ["13-blind-key.json", "bindings-prefix-key"],
    ]) {
      coreRecords.push(await publishNarratorBrowserRateabilityAttemptRecordV3({
        attempt,
        name,
        value: record(label),
      }));
    }
    await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "19-core-preservation.json",
      value: createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
        attempt,
        phase: "core",
        records: coreRecords,
      }),
    });
    const published = await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "20-expected-bindings.json",
      value,
    });
    expectSnapshot(published, "20-expected-bindings.json", value);
    expect(published.schemaVersion).toBeNull();
    expect(published.contentHash).toBeNull();
    const reread = await readNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "20-expected-bindings.json",
      expected: published,
    });
    expectSnapshot(reread, "20-expected-bindings.json", value);
    expect(reread.schemaVersion).toBeNull();
    expect(reread.contentHash).toBeNull();
    expect(await readFile(resolve(vaultDirectory, "20-expected-bindings.json")))
      .toEqual(exactBytes(value));
    await retainTracked(attempt);
  });

  it("round-trips every typed control record through one complete failed audit sequence", async () => {
    const paths = await outputFixture();
    const attempt = await beginTracked(paths, {
      runId: defaultRunId + ":typed-control-sequence",
    });
    const preservationReceipts = [];
    const coreRecords = [];
    for (const [name, label] of [
      ["10-run-receipt.json", "typed-run"],
      ["11-rateability-summary.json", "typed-summary"],
      ["12-blind-sheet.json", "typed-sheet"],
      ["13-blind-key.json", "typed-key"],
    ]) {
      coreRecords.push(await publishNarratorBrowserRateabilityAttemptRecordV3({
        attempt,
        name,
        value: record(label),
      }));
    }
    preservationReceipts.push(await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "19-core-preservation.json",
      value: createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
        attempt,
        phase: "core",
        records: coreRecords,
      }),
    }));

    const bindings = await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "20-expected-bindings.json",
      value: Object.freeze({ fixture: "typed-bindings" }),
    });
    preservationReceipts.push(await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "29-bindings-preservation.json",
      value: createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
        attempt,
        phase: "bindings",
        records: [bindings],
      }),
    }));

    const provenance = await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "30-provenance-receipt.json",
      value: record("typed-provenance"),
    });
    preservationReceipts.push(await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "31-provenance-preservation.json",
      value: createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
        attempt,
        phase: "provenance",
        records: [provenance],
      }),
    }));

    const runPackage = await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "32-run-package.json",
      value: record("typed-package"),
    });
    preservationReceipts.push(await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "39-host-preservation.json",
      value: createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
        attempt,
        phase: "host",
        records: [provenance, runPackage],
      }),
    }));

    const diagnostic = await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "40-verification-diagnostic.json",
      value: createNarratorBrowserRateabilityVerificationDiagnosticV3({
        audit: auditNarratorBrowserRateabilityEvidenceSetV3({}),
        failureCode: "evidence-verification-failed",
      }),
    });
    const terminal = await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "90-attempt-terminal.json",
      value: createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
        attempt,
        preservationReceipts,
        verificationDiagnostic: diagnostic,
        runPackage,
      }),
    });

    expect(terminal.value).toMatchObject({
      terminalStatus: "failed",
      failureCode: "evidence-verification-failed",
      verificationVerdict: "fail",
      officialDisposition: null,
    });
    expect((await readdir(pathsForAttempt(paths, attempt).vaultDirectory)).sort())
      .toEqual([...narratorBrowserRateabilityAttemptVaultContractV3.fileOrder].sort());
    await retainTracked(attempt);
  });

  it("rejects a rehashed verified disposition that disagrees with the live package", async () => {
    const paths = await outputFixture();
    const attempt = await beginTracked(paths, {
      runId: defaultRunId + ":live-disposition-binding",
    });
    const { preservationReceipts, runPackage } =
      await publishCompletePreservationPrefix(
        attempt,
        "rateable-for-blind-rating",
      );
    const diagnostic = await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "40-verification-diagnostic.json",
      value: createNarratorBrowserRateabilityVerificationDiagnosticV3({
        audit: passingAudit(),
        failureCode: null,
      }),
    });
    const terminal = createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
      attempt,
      preservationReceipts,
      verificationDiagnostic: diagnostic,
      runPackage,
    });
    expect(terminal.officialDisposition).toBe("rateable-for-blind-rating");
    const forged = rehash(terminal, (content) => {
      content.officialDisposition = "blocked";
    });
    await expect(publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "90-attempt-terminal.json",
      value: forged,
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_PUBLISH_FAILED",
    });
    expect(await readdir(pathsForAttempt(paths, attempt).vaultDirectory))
      .not.toContain("90-attempt-terminal.json");
    await expect(retainTracked(attempt)).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_RETENTION_FAILED",
    });
  });

  it("refuses a verified terminal after any live vault failure", async () => {
    const paths = await outputFixture();
    const attempt = await beginTracked(paths, {
      runId: defaultRunId + ":failed-state-terminal",
    });
    const { preservationReceipts, runPackage } =
      await publishCompletePreservationPrefix(
        attempt,
        "rateable-for-blind-rating",
      );
    const diagnostic = await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "40-verification-diagnostic.json",
      value: createNarratorBrowserRateabilityVerificationDiagnosticV3({
        audit: passingAudit(),
        failureCode: null,
      }),
    });
    await expect(readNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: runPackage.name,
      expected: {
        name: runPackage.name,
        byteLength: runPackage.byteLength,
        sha256: "0".repeat(64),
      },
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_READBACK_FAILED",
    });
    const terminal = createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
      attempt,
      preservationReceipts,
      verificationDiagnostic: diagnostic,
      runPackage,
    });
    await expect(publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "90-attempt-terminal.json",
      value: terminal,
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_PUBLISH_FAILED",
    });
    expect(await readdir(pathsForAttempt(paths, attempt).vaultDirectory))
      .not.toContain("90-attempt-terminal.json");
    await expect(retainTracked(attempt)).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_RETENTION_FAILED",
    });
  });

  it("rejects a preservation receipt built from another live attempt's snapshots", async () => {
    const firstPaths = await outputFixture();
    const secondPaths = await outputFixture();
    const firstAttempt = await beginTracked(firstPaths, {
      runId: defaultRunId + ":splice-source",
    });
    const secondAttempt = await beginTracked(secondPaths, {
      runId: defaultRunId + ":splice-target",
    });
    const firstRecords = [];
    for (const [index, name] of narratorBrowserRateabilityAttemptVaultContractV3
      .coreFiles.entries()) {
      firstRecords.push(await publishNarratorBrowserRateabilityAttemptRecordV3({
        attempt: firstAttempt,
        name,
        value: record("splice-source-" + index),
      }));
      await publishNarratorBrowserRateabilityAttemptRecordV3({
        attempt: secondAttempt,
        name,
        value: record("splice-target-" + index),
      });
    }
    const forged = createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
      attempt: secondAttempt,
      phase: "core",
      records: firstRecords,
    });

    await expect(publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt: secondAttempt,
      name: "19-core-preservation.json",
      value: forged,
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_PUBLISH_FAILED",
    });
    const secondVault = pathsForAttempt(secondPaths, secondAttempt).vaultDirectory;
    await expect(lstat(resolve(secondVault, "19-core-preservation.json")))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(resolve(secondVault, ".19-core-preservation.json.pending")))
      .rejects.toMatchObject({ code: "ENOENT" });
    await retainTracked(firstAttempt);
    await retainTracked(secondAttempt);
  });

  it("uses runId as the tombstone identity across changed bindings and output names", async () => {
    const paths = await outputFixture();
    const attempt = await beginTracked(paths);
    const { vaultDirectory, lockPath } = pathsForAttempt(paths, attempt);
    await retainTracked(attempt);

    await expect(beginNarratorBrowserRateabilityAttemptVaultV3(beginRequest(paths, {
      outputDirectory: resolve(paths.outputParent, "different-evidence-name"),
      sourceCommit: "b".repeat(40),
      candidateId: "different-candidate@22222222",
      runId: defaultRunId,
      sheetId: "different-sheet",
    }))).rejects.toThrow(/active|attempt|exists|lock|used/u);

    expectExactPrivate(await lstat(vaultDirectory), 0o700);
    expectExactPrivate(await lstat(lockPath), 0o600);
    expect((await readdir(paths.outputParent)).filter((name) =>
      name.startsWith(".narrator-browser-rateability-v3-attempt-")).sort())
      .toEqual([basename(vaultDirectory), basename(lockPath)].sort());
  });

  it("serializes concurrent publications and retained close in invocation order", async () => {
    const paths = await outputFixture();
    let releaseFirstLink;
    const firstLinkGate = new Promise((resolveGate) => {
      releaseFirstLink = resolveGate;
    });
    let signalFirstLink;
    const firstLinkStarted = new Promise((resolveStarted) => {
      signalFirstLink = resolveStarted;
    });
    const filesystem = {
      link: async (source, destination) => {
        if (basename(destination) === "10-run-receipt.json") {
          signalFirstLink();
          await firstLinkGate;
        }
        return link(source, destination);
      },
    };
    const attempt = await beginTracked(paths, { filesystem });
    const { vaultDirectory, lockPath } = pathsForAttempt(paths, attempt);
    const first = publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "10-run-receipt.json",
      value: record("concurrent-first"),
    });
    await firstLinkStarted;
    const second = publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "11-rateability-summary.json",
      value: record("concurrent-second"),
    });
    const retained = retainTracked(attempt);

    await expect(lstat(resolve(vaultDirectory, "11-rateability-summary.json")))
      .rejects.toMatchObject({ code: "ENOENT" });
    expect((await lstat(lockPath)).isFile()).toBe(true);
    releaseFirstLink();

    await expect(first).resolves.toMatchObject({ name: "10-run-receipt.json" });
    await expect(second).resolves.toMatchObject({ name: "11-rateability-summary.json" });
    await retained;
    expect((await readdir(vaultDirectory)).sort()).toEqual([
      "00-attempt-start.json",
      "10-run-receipt.json",
      "11-rateability-summary.json",
    ]);
    expect((await lstat(lockPath)).isFile()).toBe(true);
    await expect(readNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "10-run-receipt.json",
    })).rejects.toThrow(/handle is invalid/u);
  });

  it("reserves one output per canonical parent across distinct run IDs", async () => {
    const paths = await outputFixture();
    const outcomes = await Promise.allSettled([
      beginNarratorBrowserRateabilityAttemptVaultV3(beginRequest(paths, {
        runId: defaultRunId + ":destination:first",
      })),
      beginNarratorBrowserRateabilityAttemptVaultV3(beginRequest(paths, {
        runId: defaultRunId + ":destination:second",
        sheetId: defaultSheetId + ":second",
      })),
    ]);
    const successes = outcomes.filter(({ status }) => status === "fulfilled");
    const failures = outcomes.filter(({ status }) => status === "rejected");
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_COLLISION",
    });
    const winner = successes[0].value;
    activeAttempts.add(winner);
    const winnerPaths = pathsForAttempt(paths, winner);
    expectExactPrivate(await lstat(winnerPaths.destinationLockPath), 0o600);
    await retainTracked(winner);

    const otherParent = await outputFixture();
    const other = await beginTracked(otherParent, {
      runId: defaultRunId + ":destination:third",
    });
    expectExactPrivate(
      await lstat(pathsForAttempt(otherParent, other).destinationLockPath),
      0o600,
    );
    await retainTracked(other);
  });

  it("rejects uppercase and narrator-control output basenames before creating locks", async () => {
    const paths = await outputFixture();
    await expect(beginNarratorBrowserRateabilityAttemptVaultV3(beginRequest(paths, {
      outputDirectory: resolve(paths.outputParent, "EVIDENCE"),
      runId: defaultRunId + ":uppercase-output",
    }))).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_START_FAILED",
    });
    expect(await readdir(paths.outputParent)).toEqual([]);

    const runId = defaultRunId + ":vault-alias";
    const identity = createNarratorBrowserRateabilityAttemptIdentityV3(runId);
    await expect(beginNarratorBrowserRateabilityAttemptVaultV3(beginRequest(paths, {
      outputDirectory: resolve(paths.outputParent, identity.vaultName),
      runId,
    }))).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_START_FAILED",
    });
    expect(await readdir(paths.outputParent)).toEqual([]);
  });

  it.each([
    ["parent", async (paths) => chmod(paths.outputParent, 0o750)],
    ["run lock", async (_paths, attemptPaths) => chmod(attemptPaths.lockPath, 0o640)],
    ["destination lock", async (_paths, attemptPaths) =>
      chmod(attemptPaths.destinationLockPath, 0o640)],
  ])("fails closed instead of claiming retention after tampering with the %s", async (
    _label,
    mutate,
  ) => {
    const paths = await outputFixture();
    const attempt = await beginTracked(paths, {
      runId: defaultRunId + ":retention:" + _label.replaceAll(" ", "-"),
    });
    const attemptPaths = pathsForAttempt(paths, attempt);
    await mutate(paths, attemptPaths);

    await expect(retainTracked(attempt)).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_RETENTION_FAILED",
    });
    expect((await lstat(attemptPaths.vaultDirectory)).isDirectory()).toBe(true);
    expect((await lstat(attemptPaths.lockPath)).isFile()).toBe(true);
    expect((await lstat(attemptPaths.destinationLockPath)).isFile()).toBe(true);
    await expect(readNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "00-attempt-start.json",
    })).rejects.toThrow(/handle is invalid/u);
  });

  it.each([
    ["group-readable", 0o750],
    ["setgid special bit", 0o2700],
  ])("rejects a %s private parent before creating a vault", async (_label, mode) => {
    const paths = await outputFixture();
    await chmod(paths.outputParent, mode);
    expect((await lstat(paths.outputParent)).mode & 0o7777).toBe(mode);

    await expect(beginNarratorBrowserRateabilityAttemptVaultV3(beginRequest(paths)))
      .rejects.toThrow(/0700|private/u);
    expect(await readdir(paths.outputParent)).toEqual([]);
  });

  it("rejects a private parent reported with the wrong owner", async () => {
    const paths = await outputFixture();
    const target = await realpath(paths.outputParent);
    const filesystem = {
      lstat: async (path) => {
        const metadata = await lstat(path);
        return String(path) === target
          ? metadataProxy(metadata, { uid: metadata.uid + 1 })
          : metadata;
      },
      open: async (path, flags, mode) => {
        const handle = await open(path, flags, mode);
        if (String(path) !== target) return handle;
        return new Proxy(handle, {
          get(targetHandle, property) {
            const value = Reflect.get(targetHandle, property, targetHandle);
            if (property === "stat") {
              return async (...arguments_) => {
                const metadata = await value.apply(targetHandle, arguments_);
                return metadataProxy(metadata, { uid: metadata.uid + 1 });
              };
            }
            return typeof value === "function" ? value.bind(targetHandle) : value;
          },
        });
      },
    };

    await expect(beginNarratorBrowserRateabilityAttemptVaultV3(beginRequest(paths, {
      filesystem,
    }))).rejects.toThrow(/0700|owner|owned|private/u);
    expect(await readdir(paths.outputParent)).toEqual([]);
  });

  it("rejects repository-contained and pre-existing output paths without clobbering", async () => {
    const repositoryPaths = await outputFixture();
    const repositoryOutput = resolve(repositoryPaths.repositoryRoot, "evidence");
    await expect(beginNarratorBrowserRateabilityAttemptVaultV3(beginRequest(repositoryPaths, {
      outputDirectory: repositoryOutput,
    }))).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_START_FAILED",
    });
    await expect(lstat(repositoryOutput)).rejects.toMatchObject({ code: "ENOENT" });

    const existingPaths = await outputFixture();
    await mkdir(existingPaths.outputDirectory, { mode: 0o700 });
    const sentinel = resolve(existingPaths.outputDirectory, "sentinel");
    await writeFile(sentinel, "preserve");
    await expect(beginNarratorBrowserRateabilityAttemptVaultV3(beginRequest(existingPaths)))
      .rejects.toThrow(/exists|new|output/u);
    expect(await readFile(sentinel, "utf8")).toBe("preserve");

    const symlinkPaths = await outputFixture();
    const target = resolve(symlinkPaths.outputParent, "existing-target");
    await mkdir(target, { mode: 0o700 });
    await symlink(target, symlinkPaths.outputDirectory);
    await expect(beginNarratorBrowserRateabilityAttemptVaultV3(beginRequest(symlinkPaths)))
      .rejects.toThrow(/exists|new|output|symbolic/u);
    expect((await lstat(symlinkPaths.outputDirectory)).isSymbolicLink()).toBe(true);
  });

  it("rejects pre-existing vault and lock symlinks without following or replacing them", async () => {
    const vaultPaths = await outputFixture();
    const identity = createNarratorBrowserRateabilityAttemptIdentityV3(defaultRunId);
    const vaultPath = resolve(vaultPaths.outputParent, identity.vaultName);
    await symlink(vaultPaths.repositoryRoot, vaultPath);
    await expect(beginNarratorBrowserRateabilityAttemptVaultV3(beginRequest(vaultPaths)))
      .rejects.toThrow(/attempt|exists|symbolic|vault/u);
    expect((await lstat(vaultPath)).isSymbolicLink()).toBe(true);

    const lockPaths = await outputFixture();
    const lockPath = resolve(lockPaths.outputParent, identity.lockName);
    await symlink(lockPaths.repositoryRoot, lockPath);
    await expect(beginNarratorBrowserRateabilityAttemptVaultV3(beginRequest(lockPaths)))
      .rejects.toThrow(/active|attempt|exists|lock/u);
    expect((await lstat(lockPath)).isSymbolicLink()).toBe(true);
  });

  it("requires the exact next contract slot and enters failure-only order after rejection", async () => {
    const paths = await outputFixture();
    const attempt = await beginTracked(paths);

    expect(narratorBrowserRateabilityAttemptVaultContractV3.fileOrder)
      .toContain("11-rateability-summary.json");
    await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "10-run-receipt.json",
      value: record("run"),
    });
    await expect(publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "12-blind-sheet.json",
      value: record("skipped-summary"),
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_PUBLISH_FAILED",
    });
    await expect(publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "11-rateability-summary.json",
      value: record("not-allowed-after-failure"),
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_PUBLISH_FAILED",
    });
    await expect(publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "40-verification-diagnostic.json",
      value: createNarratorBrowserRateabilityVerificationDiagnosticV3({
        audit: null,
        failureCode: "attempt-admission-failed",
      }),
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_PUBLISH_FAILED",
    });
    const diagnostic = await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "40-verification-diagnostic.json",
      value: createNarratorBrowserRateabilityVerificationDiagnosticV3({
        audit: null,
        failureCode: "core-preservation-failed",
      }),
    });
    await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "90-attempt-terminal.json",
      value: createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
        attempt,
        preservationReceipts: [],
        verificationDiagnostic: diagnostic,
        runPackage: null,
      }),
    });
    await expect(publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "not-a-contract-file.json",
      value: record("unknown"),
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_PUBLISH_FAILED",
    });
    await expect(retainTracked(attempt)).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_RETENTION_FAILED",
    });
  });

  it("refuses retention after a terminal link fault invalidates a failed diagnostic", async () => {
    const paths = await outputFixture();
    const probe = createFilesystemProbe();
    const attempt = await beginTracked(paths, {
      filesystem: probe.filesystem,
      runId: defaultRunId + ":post-diagnostic-terminal-link-fault",
    });
    await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "10-run-receipt.json",
      value: record("terminal-fault-run"),
    });
    await expect(publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "12-blind-sheet.json",
      value: record("terminal-fault-skipped-summary"),
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_PUBLISH_FAILED",
    });
    const diagnostic = await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "40-verification-diagnostic.json",
      value: createNarratorBrowserRateabilityVerificationDiagnosticV3({
        audit: null,
        failureCode: "core-preservation-failed",
      }),
    });
    const terminal = createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
      attempt,
      preservationReceipts: [],
      verificationDiagnostic: diagnostic,
      runPackage: null,
    });
    probe.failOnce((event) =>
      event.op === "link"
        && basename(event.destination) === "90-attempt-terminal.json");
    await expect(publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "90-attempt-terminal.json",
      value: terminal,
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_PUBLISH_FAILED",
    });
    const pending = resolve(
      pathsForAttempt(paths, attempt).vaultDirectory,
      ".90-attempt-terminal.json.pending",
    );
    expectExactPrivate(await lstat(pending), 0o600);
    await expect(retainTracked(attempt)).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_RETENTION_FAILED",
    });
  });

  it("uses the hard-link as the no-clobber authority and retains the pending forensic bytes", async () => {
    const paths = await outputFixture();
    let armed = false;
    const filesystem = {
      link: async (source, destination) => {
        if (armed && basename(destination) === "10-run-receipt.json") {
          armed = false;
          await writeFile(destination, "existing-sentinel\n", {
            flag: "wx",
            mode: 0o600,
          });
          await chmod(destination, 0o600);
        }
        return link(source, destination);
      },
      rename: async () => {
        throw new Error("attempt vault must not rename");
      },
      rm: async () => {
        throw new Error("attempt vault must not remove trees");
      },
    };
    const attempt = await beginTracked(paths, { filesystem });
    const { vaultDirectory } = pathsForAttempt(paths, attempt);
    const value = record("intended-core-receipt");
    armed = true;

    await expect(publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "10-run-receipt.json",
      value,
    })).rejects.toThrow();

    const finalPath = resolve(vaultDirectory, "10-run-receipt.json");
    const pendingPath = resolve(vaultDirectory, ".10-run-receipt.json.pending");
    expect(await readFile(finalPath, "utf8")).toBe("existing-sentinel\n");
    expect(await readFile(pendingPath)).toEqual(exactBytes(value));
    expectExactPrivate(await lstat(pendingPath), 0o600);
    await expect(publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "11-rateability-summary.json",
      value: record("forbidden-after-publish-failure"),
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_PUBLISH_FAILED",
    });
    await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "40-verification-diagnostic.json",
      value: createNarratorBrowserRateabilityVerificationDiagnosticV3({
        audit: null,
        failureCode: "core-preservation-failed",
      }),
    });
    await retainTracked(attempt);
  });

  it.each([
    ["different bytes", async ({ finalPath }) => {
      await writeFile(finalPath, "{\"tampered\":true}\n");
    }],
    ["group-readable mode", async ({ finalPath }) => {
      await chmod(finalPath, 0o640);
    }],
    ["setuid special mode", async ({ finalPath }) => {
      await chmod(finalPath, 0o4600);
    }],
    ["symlink substitution", async ({ finalPath }) => {
      await unlink(finalPath);
      await symlink("00-attempt-start.json", finalPath);
    }],
    ["additional hard link", async ({ finalPath, vaultDirectory }) => {
      await link(finalPath, resolve(vaultDirectory, "unexpected-hard-link"));
    }],
  ])("rejects readback after %s", async (label, mutate) => {
    const paths = await outputFixture();
    const attempt = await beginTracked(paths, {
      runId: defaultRunId + ":" + label.replaceAll(" ", "-"),
    });
    const { vaultDirectory } = pathsForAttempt(paths, attempt);
    const name = "10-run-receipt.json";
    const value = record("readback-" + label);
    const expected = await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name,
      value,
    });
    const finalPath = resolve(vaultDirectory, name);
    await mutate({ finalPath, vaultDirectory });

    await expect(readNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name,
      expected,
    })).rejects.toThrow(/canonical|changed|hash|length|link|mode|private|read|symbolic/u);
    await expect(retainTracked(attempt)).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_RETENTION_FAILED",
    });
  });

  it("retains both hard links but refuses certification after a post-link fsync fault", async () => {
    const paths = await outputFixture();
    const probe = createFilesystemProbe();
    const attempt = await beginTracked(paths, { filesystem: probe.filesystem });
    const { vaultDirectory, lockPath } = pathsForAttempt(paths, attempt);
    const name = "10-run-receipt.json";
    const finalPath = resolve(vaultDirectory, name);
    const pendingPath = resolve(vaultDirectory, "." + name + ".pending");
    const value = record("post-link-sync-failure");

    probe.failOnce((event, events) =>
      event.op === "handle.sync"
        && event.path === vaultDirectory
        && events.some((candidate) =>
          candidate.op === "link" && candidate.destination === finalPath));
    await expect(publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name,
      value,
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_PUBLISH_FAILED",
    });

    expect(await readFile(finalPath)).toEqual(exactBytes(value));
    expect(await readFile(pendingPath)).toEqual(exactBytes(value));
    expect((await lstat(finalPath)).nlink).toBe(2);
    expect((await lstat(pendingPath)).nlink).toBe(2);
    await expect(publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "11-rateability-summary.json",
      value: record("forbidden-after-sync-failure"),
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_PUBLISH_FAILED",
    });
    await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "40-verification-diagnostic.json",
      value: createNarratorBrowserRateabilityVerificationDiagnosticV3({
        audit: null,
        failureCode: "core-preservation-failed",
      }),
    });
    expect(probe.events.some(({ op }) => op === "rename" || op === "rm" || op === "mkdtemp"))
      .toBe(false);

    await expect(retainTracked(attempt)).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_RETENTION_FAILED",
    });
    expectExactPrivate(await lstat(vaultDirectory), 0o700);
    expectExactPrivate(await lstat(lockPath), 0o600);
  });
});
