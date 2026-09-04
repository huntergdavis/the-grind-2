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
  readlink,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  beginNarratorBrowserRateabilityAttemptVaultV3,
  consumeNarratorBrowserRateabilityAttemptAdmissionV3,
  createNarratorBrowserRateabilityAttemptTerminalReceiptV3,
  createNarratorBrowserRateabilityOutputReservationV3,
  createNarratorBrowserRateabilityVerificationDiagnosticV3,
  finalizeNarratorBrowserRateabilityEvidenceV3,
  issueNarratorBrowserRateabilityAttemptAdmissionV3,
  narratorBrowserRateabilityAttemptRecordContractHashV3,
  narratorBrowserRateabilityAttemptRecordContractV3,
  narratorBrowserRateabilityAttemptVaultContractHashV3,
  publishNarratorBrowserRateabilityAttemptRecordV3,
  readNarratorBrowserRateabilityAttemptRecordV3,
  retainNarratorBrowserRateabilityAttemptVaultV3,
} from "../run-support.mjs";

const temporaryRoots = [];
const activeAttempts = new Set();
const sourceCommit = "a".repeat(40);
const candidateId = "flan-t5-small-q8@11111111";
const defaultRunId = "grind2-v3-rateability:v0.5.91:admission";
const defaultSheetId = "grind2-v3-rateability-sheet:v0.5.91:admission";

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
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalStringify).join(",") + "]";
  const keys = Object.keys(value).sort();
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

function record(label) {
  const content = { schemaVersion: 3, label };
  return Object.freeze({ ...content, contentHash: canonicalHash(content) });
}

function exactBytes(value) {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function outputFixture() {
  const root = await mkdtemp(resolve(tmpdir(), "grind2-attempt-admission-"));
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
  try {
    return await retainNarratorBrowserRateabilityAttemptVaultV3(attempt);
  } finally {
    activeAttempts.delete(attempt);
  }
}

function pathsForAttempt(paths, attempt) {
  const vaultDirectory = resolve(
    paths.outputParent,
    ".narrator-browser-rateability-v3-attempt-" + attempt.attemptId,
  );
  const reservation = createNarratorBrowserRateabilityOutputReservationV3(
    basename(paths.outputDirectory),
  );
  return {
    vaultDirectory,
    lockPath: vaultDirectory + ".lock",
    destinationLockPath: resolve(paths.outputParent, reservation.lockName),
  };
}

const authorityFields = Object.freeze([
  "publicReplayableBeforeRating",
  "humanQualityEvaluated",
  "humanRatingIncluded",
  "modelAdmitted",
  "displayAuthorized",
  "productionAuthority",
]);

async function readExactTombstoneRecord(path) {
  const bytes = await readFile(path);
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  expect(bytes).toEqual(exactBytes(value));
  const { contentHash, ...content } = value;
  expect(contentHash).toBe(canonicalHash(content));
  const metadata = await lstat(path);
  expect(metadata.mode & 0o7777).toBe(0o600);
  expect(metadata.nlink).toBe(1);
  for (const field of authorityFields) expect(value[field]).toBe(false);
  return { bytes, value };
}

async function expectRejectedTombstone(paths, attempt, failureCode, events) {
  const attemptPaths = pathsForAttempt(paths, attempt);
  expect((await readdir(attemptPaths.vaultDirectory)).sort()).toEqual([
    "00-attempt-start.json",
    "40-verification-diagnostic.json",
    "90-attempt-terminal.json",
  ]);
  const startPath = resolve(attemptPaths.vaultDirectory, "00-attempt-start.json");
  const diagnosticPath = resolve(
    attemptPaths.vaultDirectory,
    "40-verification-diagnostic.json",
  );
  const terminalPath = resolve(
    attemptPaths.vaultDirectory,
    "90-attempt-terminal.json",
  );
  const start = await readExactTombstoneRecord(startPath);
  const diagnostic = await readExactTombstoneRecord(diagnosticPath);
  const terminal = await readExactTombstoneRecord(terminalPath);
  expect(start.value.attemptId).toBe(attempt.attemptId);
  expect(diagnostic.value).toEqual(
    createNarratorBrowserRateabilityVerificationDiagnosticV3({
      audit: null,
      failureCode,
    }),
  );
  const diagnosticCommitment = {
    name: "40-verification-diagnostic.json",
    schemaVersion: 1,
    contentHash: diagnostic.value.contentHash,
    byteLength: diagnostic.bytes.byteLength,
    sha256: sha256(diagnostic.bytes),
  };
  const terminalContent = {
    schemaVersion: 1,
    receiptId: narratorBrowserRateabilityAttemptRecordContractV3.terminalReceiptId,
    recordContractHash: narratorBrowserRateabilityAttemptRecordContractHashV3,
    vaultContractHash: narratorBrowserRateabilityAttemptVaultContractHashV3,
    attemptId: attempt.attemptId,
    terminalStatus: "failed",
    preservationReceipts: [],
    verificationDiagnostic: diagnosticCommitment,
    failureCode,
    verificationVerdict: "not-run",
    officialDisposition: null,
    publicReplayableBeforeRating: false,
    humanQualityEvaluated: false,
    humanRatingIncluded: false,
    modelAdmitted: false,
    displayAuthorized: false,
    productionAuthority: false,
  };
  expect(terminal.value).toEqual({
    ...terminalContent,
    contentHash: canonicalHash(terminalContent),
  });
  expect((await lstat(attemptPaths.lockPath)).mode & 0o7777).toBe(0o600);
  expect((await lstat(attemptPaths.destinationLockPath)).mode & 0o7777).toBe(0o600);
  const diagnosticLink = events.findIndex((event) =>
    event.op === "link" && event.destination === diagnosticPath);
  const terminalLink = events.findIndex((event) =>
    event.op === "link" && event.destination === terminalPath);
  expect(diagnosticLink).toBeGreaterThanOrEqual(0);
  expect(terminalLink).toBeGreaterThan(diagnosticLink);
}

function createFilesystemProbe() {
  const events = [];
  let failure = null;
  let hold = null;

  const invoke = async (event, operation) => {
    events.push(event);
    if (failure !== null && failure.predicate(event, events)) {
      const error = failure.error;
      failure = null;
      throw error;
    }
    if (hold !== null && hold.predicate(event, events)) {
      const release = hold.release;
      hold = null;
      await release;
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
        op: "handle." + property,
        path: String(path),
        flags,
      }, () => value.apply(target, arguments_));
    },
  });

  return {
    events,
    filesystem: {
      link: (...arguments_) => invoke({
        op: "link",
        source: String(arguments_[0]),
        destination: String(arguments_[1]),
      }, () => link(...arguments_)),
      lstat: (...arguments_) => invoke({
        op: "lstat",
        path: String(arguments_[0]),
      }, () => lstat(...arguments_)),
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
      unlink: (...arguments_) => invoke({
        op: "unlink",
        path: String(arguments_[0]),
      }, () => unlink(...arguments_)),
    },
    failOnce(predicate, error = new Error("injected admission failure")) {
      failure = { predicate, error };
    },
    holdOnce(predicate) {
      let release;
      const released = new Promise((resolveRelease) => {
        release = resolveRelease;
      });
      hold = { predicate, release: released };
      return release;
    },
  };
}

function deadline(promise) {
  let timeout;
  const expiry = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error("admission operation deadlocked")), 2_000);
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timeout));
}

describe("V3 narrator browser rateability attempt admission", () => {
  it("issues an opaque identity-only capability and rejects every forged request", async () => {
    const paths = await outputFixture();
    const probe = createFilesystemProbe();
    const attempt = await beginTracked(paths, { filesystem: probe.filesystem });
    expect(() => issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt,
      extra: true,
    })).toThrow(/admission issue is invalid/u);
    expect(() => issueNarratorBrowserRateabilityAttemptAdmissionV3(
      new Proxy({}, {
        ownKeys() {
          throw new Error("secret issue trap");
        },
      }),
    )).toThrow(/admission issue is invalid/u);
    let issueReads = 0;
    const issueRequest = {};
    Object.defineProperty(issueRequest, "attempt", {
      enumerable: true,
      get() {
        issueReads += 1;
        return attempt;
      },
    });
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3(
      issueRequest,
    );
    expect(issueReads).toBe(1);

    expect(Object.getPrototypeOf(admission)).toBe(null);
    expect(Object.isFrozen(admission)).toBe(true);
    expect(Object.isExtensible(admission)).toBe(false);
    expect(Reflect.ownKeys(admission)).toEqual([]);
    expect(Object.keys(admission)).toEqual([]);
    expect(Object.getOwnPropertyNames(admission)).toEqual([]);
    expect(Object.getOwnPropertySymbols(admission)).toEqual([]);

    const forgeries = [
      Object.freeze(Object.create(null)),
      { ...admission },
      Object.assign(Object.create(null), admission),
      structuredClone(admission),
      Object.create(admission),
      new Proxy(admission, {}),
    ];
    probe.events.length = 0;
    let callbackCount = 0;
    for (const forged of forgeries) {
      await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
        admission: forged,
        launchBrowser: () => {
          callbackCount += 1;
        },
      })).rejects.toThrow(/admission is invalid/u);
    }
    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: () => undefined,
      attempt,
    })).rejects.toThrow(/request is invalid/u);
    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: null,
    })).rejects.toThrow(/request is invalid/u);
    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3(
      new Proxy({}, {
        ownKeys() {
          throw new Error("secret consume trap");
        },
      }),
    )).rejects.toThrow(/admission request is invalid/u);
    const throwingRequest = { admission };
    Object.defineProperty(throwingRequest, "launchBrowser", {
      enumerable: true,
      get() {
        throw new Error("secret callback getter");
      },
    });
    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3(
      throwingRequest,
    )).rejects.toThrow(/admission request is invalid/u);
    expect(probe.events).toEqual([]);
    expect(callbackCount).toBe(0);

    let observedThis = "unset";
    let observedArguments = -1;
    let admissionReads = 0;
    let callbackReads = 0;
    const consumeRequest = {};
    Object.defineProperties(consumeRequest, {
      admission: {
        enumerable: true,
        get() {
          admissionReads += 1;
          return admission;
        },
      },
      launchBrowser: {
        enumerable: true,
        get() {
          callbackReads += 1;
          return function (...arguments_) {
            callbackCount += 1;
            observedThis = this;
            observedArguments = arguments_.length;
            return "launched";
          };
        },
      },
    });
    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3(
      consumeRequest,
    )).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_REQUIRED",
    });
    expect(admissionReads).toBe(1);
    expect(callbackReads).toBe(1);
    expect(callbackCount).toBe(1);
    expect(observedThis).toBeUndefined();
    expect(observedArguments).toBe(0);
    await expect(readNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "00-attempt-start.json",
    })).rejects.toThrow(/handle is invalid/u);
    await expect(publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "10-run-receipt.json",
      value: record("spent"),
    })).rejects.toThrow(/handle is invalid/u);
    await retainTracked(attempt);
  });

  it("reserves one use synchronously and blocks outside work until settlement", async () => {
    const paths = await outputFixture();
    const attempt = await beginTracked(paths);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({ attempt });
    expect(() => issueNarratorBrowserRateabilityAttemptAdmissionV3({ attempt }))
      .toThrow(/unavailable/u);

    let resolveLaunch;
    let callbackCount = 0;
    let reentrant;
    let markCallbackStarted;
    const callbackStarted = new Promise((resolveStarted) => {
      markCallbackStarted = resolveStarted;
    });
    const consumption = consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: () => {
        callbackCount += 1;
        reentrant = consumeNarratorBrowserRateabilityAttemptAdmissionV3({
          admission,
          launchBrowser: () => {
            callbackCount += 1;
          },
        });
        markCallbackStarted();
        return new Promise((resolve) => {
          resolveLaunch = resolve;
        });
      },
    });
    const duplicateConsumption = consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: () => {
        callbackCount += 1;
      },
    });
    const losingRetain = retainNarratorBrowserRateabilityAttemptVaultV3(attempt);
    await expect(duplicateConsumption).rejects.toThrow(/admission is invalid/u);
    await expect(losingRetain).rejects.toThrow(/reserved/u);
    await expect(retainNarratorBrowserRateabilityAttemptVaultV3(attempt))
      .rejects.toThrow(/reserved/u);
    await callbackStarted;

    await expect(reentrant).rejects.toThrow(/admission is invalid/u);
    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: () => {
        callbackCount += 1;
      },
    })).rejects.toThrow(/admission is invalid/u);
    await expect(readNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "00-attempt-start.json",
    })).rejects.toThrow(/reserved/u);
    await expect(publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "10-run-receipt.json",
      value: record("outside"),
    })).rejects.toThrow(/reserved/u);
    resolveLaunch("settled");
    await expect(consumption).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_REQUIRED",
    });
    expect(callbackCount).toBe(1);
    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: () => undefined,
    })).rejects.toThrow(/admission is invalid/u);
    await retainTracked(attempt);
  });

  it("makes destination lstat the final filesystem event before callback invocation", async () => {
    const paths = await outputFixture();
    const probe = createFilesystemProbe();
    const attempt = await beginTracked(paths, { filesystem: probe.filesystem });
    const attemptPaths = pathsForAttempt(paths, attempt);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({ attempt });
    probe.events.length = 0;

    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: () => {
        probe.events.push({ op: "callback" });
        return "ok";
      },
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_REQUIRED",
    });
    const callbackIndex = probe.events.findIndex(({ op }) => op === "callback");
    expect(callbackIndex).toBeGreaterThan(0);
    expect(probe.events[callbackIndex - 1]).toEqual({
      op: "lstat",
      path: paths.outputDirectory,
    });
    expect(probe.events.filter((event) =>
      event.op === "readdir" && event.path === attemptPaths.vaultDirectory)).toHaveLength(1);
    expect(probe.events.filter((event) =>
      event.op === "handle.readFile"
        && event.path === attemptPaths.lockPath).length).toBeGreaterThanOrEqual(2);
    expect(probe.events.filter((event) =>
      event.op === "handle.readFile"
        && event.path === attemptPaths.destinationLockPath).length).toBeGreaterThanOrEqual(2);
    expect(probe.events.some((event) =>
      event.op === "handle.readFile"
        && event.path === resolve(
          attemptPaths.vaultDirectory,
          "00-attempt-start.json",
        ))).toBe(true);
    await retainTracked(attempt);
  });

  it("runs callback-owned async vault work on a private FIFO without deadlock", async () => {
    const paths = await outputFixture();
    const attempt = await beginTracked(paths);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({ attempt });
    const value = record("inside-admission");

    const consumption = deadline(
      consumeNarratorBrowserRateabilityAttemptAdmissionV3({
        admission,
        launchBrowser: async () => {
          await Promise.resolve();
          const start = await readNarratorBrowserRateabilityAttemptRecordV3({
            attempt,
            name: "00-attempt-start.json",
          });
          expect(start.name).toBe("00-attempt-start.json");
          const published = await publishNarratorBrowserRateabilityAttemptRecordV3({
            attempt,
            name: "10-run-receipt.json",
            value,
          });
          return published.name;
        },
      }),
    );
    await expect(consumption).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_REQUIRED",
    });
    const attemptPaths = pathsForAttempt(paths, attempt);
    expect(JSON.parse(await readFile(
      resolve(attemptPaths.vaultDirectory, "10-run-receipt.json"),
      "utf8",
    ))).toEqual(value);
    await retainTracked(attempt);
  });

  it("drains fire-and-forget work and preserves custom-thenable async context", async () => {
    const paths = await outputFixture();
    const attempt = await beginTracked(paths);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({ attempt });
    let publication;
    const value = record("fire-and-forget");

    const consumption = deadline(
      consumeNarratorBrowserRateabilityAttemptAdmissionV3({
        admission,
        launchBrowser: () => ({
          then(resolveThenable, rejectThenable) {
            readNarratorBrowserRateabilityAttemptRecordV3({
              attempt,
              name: "00-attempt-start.json",
            }).then(() => {
              publication = publishNarratorBrowserRateabilityAttemptRecordV3({
                attempt,
                name: "10-run-receipt.json",
                value,
              });
              resolveThenable("thenable-launched");
              rejectThenable(new Error("ignored second settlement"));
            }, rejectThenable);
          },
        }),
      }),
    );
    await expect(consumption).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_REQUIRED",
    });
    await expect(publication).resolves.toMatchObject({
      name: "10-run-receipt.json",
    });
    await retainTracked(attempt);
  });

  it("holds retained close while admitted fire-and-forget publications drain in FIFO order", async () => {
    const paths = await outputFixture();
    const probe = createFilesystemProbe();
    const attempt = await beginTracked(paths, { filesystem: probe.filesystem });
    const attemptPaths = pathsForAttempt(paths, attempt);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({ attempt });
    const firstPendingPath = resolve(
      attemptPaths.vaultDirectory,
      ".10-run-receipt.json.pending",
    );
    const secondPendingPath = resolve(
      attemptPaths.vaultDirectory,
      ".11-rateability-summary.json.pending",
    );
    const releasePublication = probe.holdOnce((event) =>
      event.op === "open" && event.path === firstPendingPath);
    let firstPublication;
    let secondPublication;
    let consumptionSettled = false;

    const consumption = consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: () => {
        firstPublication = publishNarratorBrowserRateabilityAttemptRecordV3({
          attempt,
          name: "10-run-receipt.json",
          value: record("first-deferred-child"),
        });
        secondPublication = publishNarratorBrowserRateabilityAttemptRecordV3({
          attempt,
          name: "11-rateability-summary.json",
          value: record("second-deferred-child"),
        });
        return "callback-complete";
      },
    }).finally(() => {
      consumptionSettled = true;
    });
    while (!probe.events.some((event) =>
      event.op === "open" && event.path === firstPendingPath)) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 0));
    }
    expect(consumptionSettled).toBe(false);
    expect(probe.events.some((event) =>
      event.op === "open" && event.path === secondPendingPath)).toBe(false);
    await expect(retainNarratorBrowserRateabilityAttemptVaultV3(attempt))
      .rejects.toThrow(/reserved/u);
    releasePublication();
    await expect(consumption).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_REQUIRED",
    });
    await expect(firstPublication).resolves.toMatchObject({
      name: "10-run-receipt.json",
    });
    await expect(secondPublication).resolves.toMatchObject({
      name: "11-rateability-summary.json",
    });
    const firstLink = probe.events.findIndex((event) =>
      event.op === "link"
        && event.destination === resolve(
          attemptPaths.vaultDirectory,
          "10-run-receipt.json",
        ));
    const secondOpen = probe.events.findIndex((event) =>
      event.op === "open" && event.path === secondPendingPath);
    expect(firstLink).toBeGreaterThanOrEqual(0);
    expect(secondOpen).toBeGreaterThan(firstLink);
    await retainTracked(attempt);
  });

  it("does not let a fulfilled callback conceal failed fire-and-forget work", async () => {
    const paths = await outputFixture();
    const attempt = await beginTracked(paths);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({ attempt });
    let childFailure;
    let rejection;
    try {
      await consumeNarratorBrowserRateabilityAttemptAdmissionV3({
        admission,
        launchBrowser: () => {
          childFailure = publishNarratorBrowserRateabilityAttemptRecordV3({
            attempt,
            name: "12-blind-sheet.json",
            value: record("invalid-order"),
          });
          return "masked-success";
        },
      });
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_CALLBACK_FAILED",
    });
    await expect(childFailure).rejects.toMatchObject({
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
    expect((await readdir(pathsForAttempt(paths, attempt).vaultDirectory)).sort())
      .toEqual([
        "00-attempt-start.json",
        "40-verification-diagnostic.json",
        "90-attempt-terminal.json",
      ]);
    await retainTracked(attempt);
  });

  it("allows an awaited child failure to terminalize truthfully before settlement", async () => {
    const paths = await outputFixture();
    const attempt = await beginTracked(paths);
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({ attempt });

    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: async () => {
        await expect(publishNarratorBrowserRateabilityAttemptRecordV3({
          attempt,
          name: "12-blind-sheet.json",
          value: record("invalid-awaited-order"),
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
        return "child-failure-was-handled";
      },
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_CALLBACK_FAILED",
    });
    expect((await readdir(pathsForAttempt(paths, attempt).vaultDirectory)).sort())
      .toEqual([
        "00-attempt-start.json",
        "40-verification-diagnostic.json",
        "90-attempt-terminal.json",
      ]);
    await retainTracked(attempt);
  });

  it("rejects cross-attempt work inherited from another admission context", async () => {
    const firstPaths = await outputFixture();
    const secondPaths = await outputFixture();
    const thirdPaths = await outputFixture();
    const first = await beginTracked(firstPaths, {
      runId: defaultRunId + ":first",
      sheetId: defaultSheetId + ":first",
    });
    const second = await beginTracked(secondPaths, {
      runId: defaultRunId + ":second",
      sheetId: defaultSheetId + ":second",
    });
    const third = await beginTracked(thirdPaths, {
      runId: defaultRunId + ":third",
      sheetId: defaultSheetId + ":third",
    });
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt: first,
    });
    const thirdAdmission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt: third,
    });

    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: async () => {
        await expect(readNarratorBrowserRateabilityAttemptRecordV3({
          attempt: second,
          name: "00-attempt-start.json",
        })).rejects.toThrow(/reserved/u);
        await expect(publishNarratorBrowserRateabilityAttemptRecordV3({
          attempt: second,
          name: "10-run-receipt.json",
          value: record("cross-attempt"),
        })).rejects.toThrow(/reserved/u);
        await expect(retainNarratorBrowserRateabilityAttemptVaultV3(second))
          .rejects.toThrow(/reserved/u);
        expect(() => issueNarratorBrowserRateabilityAttemptAdmissionV3({
          attempt: second,
        })).toThrow(/unavailable/u);
        await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
          admission: thirdAdmission,
          launchBrowser: () => "nested",
        })).rejects.toThrow(/admission is invalid/u);
        return "isolated";
      },
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_REQUIRED",
    });
    await expect(readNarratorBrowserRateabilityAttemptRecordV3({
      attempt: second,
      name: "00-attempt-start.json",
    })).resolves.toMatchObject({ name: "00-attempt-start.json" });
    const secondAdmission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt: second,
    });
    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission: secondAdmission,
      launchBrowser: () => "second",
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_REQUIRED",
    });
    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission: thirdAdmission,
      launchBrowser: () => "third",
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_REQUIRED",
    });
    await retainTracked(first);
    await retainTracked(second);
    await retainTracked(third);
  });

  it("rejects every stale async-context operation after callback settlement", async () => {
    const paths = await outputFixture();
    const freshPaths = await outputFixture();
    const readyPaths = await outputFixture();
    const attempt = await beginTracked(paths);
    const freshAttempt = await beginTracked(freshPaths, {
      runId: defaultRunId + ":stale-fresh",
      sheetId: defaultSheetId + ":stale-fresh",
    });
    const readyAttempt = await beginTracked(readyPaths, {
      runId: defaultRunId + ":stale-ready",
      sheetId: defaultSheetId + ":stale-ready",
    });
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({ attempt });
    const readyAdmission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt: readyAttempt,
    });
    let finishLateOperations;
    const lateOperations = new Promise((resolveLate) => {
      finishLateOperations = resolveLate;
    });

    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: () => {
        setTimeout(async () => {
          let issueError;
          try {
            issueNarratorBrowserRateabilityAttemptAdmissionV3({
              attempt: freshAttempt,
            });
          } catch (error) {
            issueError = error;
          }
          const settled = await Promise.allSettled([
            readNarratorBrowserRateabilityAttemptRecordV3({
              attempt: freshAttempt,
              name: "00-attempt-start.json",
            }),
            publishNarratorBrowserRateabilityAttemptRecordV3({
              attempt: freshAttempt,
              name: "10-run-receipt.json",
              value: record("late"),
            }),
            retainNarratorBrowserRateabilityAttemptVaultV3(freshAttempt),
            consumeNarratorBrowserRateabilityAttemptAdmissionV3({
              admission: readyAdmission,
              launchBrowser: () => "late",
            }),
          ]);
          finishLateOperations({ issueError, settled });
        }, 0);
        return "settled";
      },
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_REQUIRED",
    });

    const { issueError, settled } = await deadline(lateOperations);
    expect(issueError).toBeInstanceOf(TypeError);
    expect(settled.every(({ status }) => status === "rejected")).toBe(true);
    expect(await readdir(pathsForAttempt(paths, attempt).vaultDirectory)).toEqual([
      "00-attempt-start.json",
    ]);
    expect(await readdir(
      pathsForAttempt(freshPaths, freshAttempt).vaultDirectory,
    )).toEqual(["00-attempt-start.json"]);
    expect(await readdir(
      pathsForAttempt(readyPaths, readyAttempt).vaultDirectory,
    )).toEqual(["00-attempt-start.json"]);
    await expect(readNarratorBrowserRateabilityAttemptRecordV3({
      attempt: freshAttempt,
      name: "00-attempt-start.json",
    })).resolves.toMatchObject({ name: "00-attempt-start.json" });
    const freshAdmission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt: freshAttempt,
    });
    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission: freshAdmission,
      launchBrowser: () => "fresh",
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_REQUIRED",
    });
    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission: readyAdmission,
      launchBrowser: () => "ready",
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_REQUIRED",
    });
    await retainTracked(attempt);
    await retainTracked(freshAttempt);
    await retainTracked(readyAttempt);
  });

  it.each([
    ["owned-lock sync", (probe, attemptPaths) => {
      probe.failOnce((event) =>
        event.op === "handle.sync" && event.path === attemptPaths.lockPath);
    }],
    ["exact-set enumeration", (probe, attemptPaths) => {
      probe.failOnce((event) =>
        event.op === "readdir" && event.path === attemptPaths.vaultDirectory);
    }],
    ["start-record readback", (probe, attemptPaths) => {
      probe.failOnce((event) =>
        event.op === "handle.readFile"
          && event.path === resolve(
            attemptPaths.vaultDirectory,
            "00-attempt-start.json",
          ));
    }],
  ])("durably rejects a pre-callback %s failure", async (_label, inject) => {
    const paths = await outputFixture();
    const probe = createFilesystemProbe();
    const attempt = await beginTracked(paths, { filesystem: probe.filesystem });
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({ attempt });
    const attemptPaths = pathsForAttempt(paths, attempt);
    probe.events.length = 0;
    inject(probe, attemptPaths);
    let callbackCount = 0;
    let rejection;
    try {
      await consumeNarratorBrowserRateabilityAttemptAdmissionV3({
        admission,
        launchBrowser: () => {
          callbackCount += 1;
        },
      });
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_ADMISSION_FAILED",
    });
    expect(Object.keys(rejection)).toEqual(["code"]);
    expect(rejection.message).not.toContain(paths.root);
    expect(callbackCount).toBe(0);
    await expectRejectedTombstone(
      paths,
      attempt,
      "attempt-admission-failed",
      probe.events,
    );
  });

  it.each([
    ["file", async (paths) => {
      await writeFile(paths.outputDirectory, "sentinel\n", {
        flag: "wx",
        mode: 0o600,
      });
      return async () => {
        expect(await readFile(paths.outputDirectory, "utf8")).toBe("sentinel\n");
      };
    }],
    ["directory", async (paths) => {
      await mkdir(paths.outputDirectory, { mode: 0o700 });
      return async () => {
        expect((await lstat(paths.outputDirectory)).isDirectory()).toBe(true);
      };
    }],
    ["symlink", async (paths) => {
      await symlink(paths.repositoryRoot, paths.outputDirectory);
      return async () => {
        expect(await readlink(paths.outputDirectory)).toBe(paths.repositoryRoot);
      };
    }],
  ])("retains an exact collision tombstone for a late destination %s", async (
    _label,
    createDestination,
  ) => {
    const paths = await outputFixture();
    const probe = createFilesystemProbe();
    const attempt = await beginTracked(paths, { filesystem: probe.filesystem });
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({ attempt });
    const verifyDestination = await createDestination(paths);
    probe.events.length = 0;
    let callbackCount = 0;

    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: () => {
        callbackCount += 1;
      },
    })).rejects.toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_COLLISION",
    });
    expect(callbackCount).toBe(0);
    await verifyDestination();
    await expectRejectedTombstone(
      paths,
      attempt,
      "destination-reservation-collision",
      probe.events,
    );
    expect(probe.events.some((event) =>
      event.op === "unlink" && event.path === paths.outputDirectory)).toBe(false);
  });

  it.each([
    ["synchronous throw", () => {
      throw new Error("secret synchronous callback detail");
    }],
    ["asynchronous rejection", async () => {
      throw new Error("secret asynchronous callback detail");
    }],
    ["throwing then getter", () => Object.defineProperty({}, "then", {
      get() {
        throw new Error("secret then getter detail");
      },
    })],
  ])("sanitizes %s and leaves only retained close", async (_label, launchBrowser) => {
    const paths = await outputFixture();
    const attempt = await beginTracked(paths, {
      runId: defaultRunId + ":" + _label.replaceAll(" ", "-"),
      sheetId: defaultSheetId + ":" + _label.replaceAll(" ", "-"),
    });
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({ attempt });
    let rejection;
    try {
      await consumeNarratorBrowserRateabilityAttemptAdmissionV3({
        admission,
        launchBrowser,
      });
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toMatchObject({
      code: "ERR_NARRATOR_V3_ATTEMPT_CALLBACK_FAILED",
    });
    expect(Object.keys(rejection)).toEqual(["code"]);
    expect(rejection.message).not.toContain("secret");
    expect(rejection.message).not.toContain(paths.root);
    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: () => undefined,
    })).rejects.toThrow(/admission is invalid/u);
    await expect(readNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "00-attempt-start.json",
    })).rejects.toThrow(/handle is invalid/u);
    expect(await readdir(pathsForAttempt(paths, attempt).vaultDirectory)).toEqual([
      "00-attempt-start.json",
    ]);
    await expect(retainTracked(attempt)).resolves.toMatchObject({
      vaultRetained: true,
      lockRetained: true,
    });
    expect(await readdir(pathsForAttempt(paths, attempt).vaultDirectory)).toEqual([
      "00-attempt-start.json",
    ]);
  });

  it("lets retained close revoke an unused capability permanently", async () => {
    const paths = await outputFixture();
    const probe = createFilesystemProbe();
    const attempt = await beginTracked(paths, { filesystem: probe.filesystem });
    const admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({ attempt });
    await retainTracked(attempt);
    const eventCount = probe.events.length;
    let callbackCount = 0;
    await expect(consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: () => {
        callbackCount += 1;
      },
    })).rejects.toThrow(/admission is invalid/u);
    expect(callbackCount).toBe(0);
    expect(probe.events).toHaveLength(eventCount);
  });

  it("rejects issuance after evidence publication", async () => {
    const evidencePaths = await outputFixture();
    const evidenceAttempt = await beginTracked(evidencePaths, {
      runId: defaultRunId + ":evidence",
      sheetId: defaultSheetId + ":evidence",
    });
    await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt: evidenceAttempt,
      name: "10-run-receipt.json",
      value: record("already-observed"),
    });
    expect(() => issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt: evidenceAttempt,
    })).toThrow(/unavailable/u);
    await retainTracked(evidenceAttempt);
  });

  it("routes the CLI through the coordinator without exposing admission authority", async () => {
    const coordinatorSource = await readFile(
      new URL("../run.mjs", import.meta.url),
      "utf8",
    );
    expect(coordinatorSource).toContain(
      "coordinateNarratorBrowserRateabilityAttemptV3",
    );
    for (const name of [
      "issueNarratorBrowserRateabilityAttemptAdmissionV3",
      "consumeNarratorBrowserRateabilityAttemptAdmissionV3",
    ]) {
      expect(coordinatorSource).not.toContain(name);
      expect(Function.prototype.toString.call(
        finalizeNarratorBrowserRateabilityEvidenceV3,
      )).not.toContain(name);
    }
  });
});
