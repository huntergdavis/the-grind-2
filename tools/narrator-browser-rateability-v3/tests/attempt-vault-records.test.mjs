import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createNarratorBrowserRateabilityAttemptPreservationReceiptV3,
  createNarratorBrowserRateabilityAttemptTerminalReceiptV3,
  createNarratorBrowserRateabilityVerificationDiagnosticV3,
  isNarratorBrowserRateabilityAttemptPreservationReceiptV3,
  isNarratorBrowserRateabilityAttemptTerminalReceiptV3,
  isNarratorBrowserRateabilityVerificationDiagnosticV3,
  narratorBrowserRateabilityAttemptRecordContractHashV3,
  narratorBrowserRateabilityAttemptRecordContractV3,
  narratorBrowserRateabilityAttemptVaultContractHashV3,
  narratorBrowserRateabilityEvidencePredicateContractV3,
  projectNarratorBrowserRateabilityEvidenceAuditV3,
} from "../run-support.mjs";

const privateWitness = "/private/model/prompt-and-secret-output-never-publish";
const authorityFields = [
  "publicReplayableBeforeRating",
  "humanQualityEvaluated",
  "humanRatingIncluded",
  "modelAdmitted",
  "displayAuthorized",
  "productionAuthority",
];
const preservationPhases = [
  {
    phase: "core",
    recordName: "19-core-preservation.json",
    inputFiles: [
      "10-run-receipt.json",
      "11-rateability-summary.json",
      "12-blind-sheet.json",
      "13-blind-key.json",
    ],
  },
  {
    phase: "bindings",
    recordName: "29-bindings-preservation.json",
    inputFiles: ["20-expected-bindings.json"],
  },
  {
    phase: "provenance",
    recordName: "31-provenance-preservation.json",
    inputFiles: ["30-provenance-receipt.json"],
  },
  {
    phase: "host",
    recordName: "39-host-preservation.json",
    inputFiles: [
      "30-provenance-receipt.json",
      "32-run-package.json",
    ],
  },
];
const diagnosticFailureCodes = [
  "destination-reservation-collision",
  "attempt-admission-failed",
  "core-preservation-failed",
  "bindings-preservation-failed",
  "host-construction-failed",
  "provenance-preservation-failed",
  "host-preservation-failed",
  "evidence-verification-failed",
  "evidence-publication-failed",
  "retention-verification-failed",
];
const failureLifecycles = [
  ["destination-reservation-collision", "not-run", 0, 0],
  ["attempt-admission-failed", "not-run", 0, 0],
  ["core-preservation-failed", "not-run", 0, 0],
  ["bindings-preservation-failed", "not-run", 1, 1],
  ["host-construction-failed", "not-run", 2, 3],
  ["provenance-preservation-failed", "not-run", 2, 2],
  ["host-preservation-failed", "not-run", 3, 3],
  ["evidence-verification-failed", "fail", 4, 4],
  ["evidence-publication-failed", "pass", 4, 4],
  ["retention-verification-failed", "not-run", 0, 4],
].map(([
  failureCode,
  verificationVerdict,
  minimumPreservationReceipts,
  maximumPreservationReceipts,
]) => ({
  failureCode,
  verificationVerdict,
  minimumPreservationReceipts,
  maximumPreservationReceipts,
}));

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

function withHash(content) {
  return { ...content, contentHash: canonicalHash(content) };
}

function rehash(value, mutate) {
  const copy = structuredClone(value);
  delete copy.contentHash;
  mutate(copy);
  return withHash(copy);
}

function bytesFor(value) {
  return new TextEncoder().encode(JSON.stringify(value, null, 2) + "\n");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function makeSnapshot(name, value, options = {}) {
  const bytes = options.bytes ?? bytesFor(value);
  const stableBytes = new Uint8Array(bytes);
  return Object.freeze({
    name: options.name ?? name,
    schemaVersion: options.schemaVersion
      ?? (Number.isSafeInteger(value.schemaVersion) ? value.schemaVersion : null),
    contentHash: options.contentHash
      ?? (typeof value.contentHash === "string" ? value.contentHash : null),
    byteLength: options.byteLength ?? stableBytes.byteLength,
    sha256: options.sha256 ?? sha256(stableBytes),
    value,
    copyBytes: options.copyBytes ?? (() => {
      options.onCopy?.();
      return new Uint8Array(stableBytes);
    }),
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

function expectCanonicalRecord(value) {
  const { contentHash, ...content } = value;
  expect(contentHash).toBe(canonicalHash(content));
}

function expectDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child, seen);
}

function expectSafeThrow(callback, secret = privateWitness) {
  let failure;
  try {
    callback();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(TypeError);
  expect(String(failure)).not.toContain(secret);
  expect(JSON.stringify(failure)).not.toContain(secret);
}

function recordValue(
  name,
  witness = privateWitness,
  disposition = "rateable-for-blind-rating",
) {
  if (name === "20-expected-bindings.json") {
    return {
      sourceCommit: "b".repeat(40),
      privateWitness: witness,
    };
  }
  return withHash({
    schemaVersion: 3,
    recordId: "fixture:" + name,
    privateWitness: witness,
    ...(name === "32-run-package.json" ? { disposition } : {}),
  });
}

function recordValues(
  witness = privateWitness,
  disposition = "rateable-for-blind-rating",
) {
  return new Map([
    ...new Set(preservationPhases.flatMap(({ inputFiles }) => inputFiles)),
  ].map((name) => [name, recordValue(name, witness, disposition)]));
}

function recordsForPhase(phase, values = recordValues(), onCopy = () => {}) {
  const definition = preservationPhases.find((entry) => entry.phase === phase);
  return definition.inputFiles.map((name) =>
    makeSnapshot(name, values.get(name), { onCopy }));
}

function attempt(attemptId = "a".repeat(64)) {
  return Object.freeze({
    schemaVersion: 1,
    attemptId,
    vaultContractHash: narratorBrowserRateabilityAttemptVaultContractHashV3,
  });
}

function makeAudit(failedIds = []) {
  const failures = new Set(failedIds);
  const statusById = new Map();
  const predicates = narratorBrowserRateabilityEvidencePredicateContractV3.map(
    ({ id, prerequisites }) => {
      const blockedBy = prerequisites.filter(
        (prerequisite) => statusById.get(prerequisite) !== "pass",
      );
      const status = blockedBy.length > 0
        ? "not-evaluated"
        : failures.has(id) ? "fail" : "pass";
      statusById.set(id, status);
      return { id, status, blockedBy };
    },
  );
  const failedPredicateIds = predicates
    .filter(({ status }) => status === "fail")
    .map(({ id }) => id);
  const notEvaluatedPredicateIds = predicates
    .filter(({ status }) => status === "not-evaluated")
    .map(({ id }) => id);
  return {
    schemaVersion: 1,
    auditId: "the-grind-2:narrator-browser-rateability-evidence-audit:v3",
    verdict: failedPredicateIds.length === 0 && notEvaluatedPredicateIds.length === 0
      ? "pass"
      : "fail",
    predicates,
    failedPredicateIds,
    notEvaluatedPredicateIds,
  };
}

function preservationReceiptSet(
  targetAttempt = attempt(),
  witness = privateWitness,
  disposition = "rateable-for-blind-rating",
) {
  const values = recordValues(witness, disposition);
  return preservationPhases.map(({ phase, recordName }) => {
    const receipt = createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
      attempt: targetAttempt,
      phase,
      records: recordsForPhase(phase, values),
    });
    return {
      phase,
      receipt,
      snapshot: makeSnapshot(recordName, receipt),
    };
  });
}

function runPackageSnapshot(
  disposition = "rateable-for-blind-rating",
  witness = privateWitness,
) {
  return makeSnapshot(
    "32-run-package.json",
    recordValue("32-run-package.json", witness, disposition),
  );
}

function diagnosticSnapshot({ audit = makeAudit(), failureCode = null } = {}) {
  const diagnostic = createNarratorBrowserRateabilityVerificationDiagnosticV3({
    audit,
    failureCode,
  });
  return {
    diagnostic,
    snapshot: makeSnapshot("40-verification-diagnostic.json", diagnostic),
  };
}

describe("V3 narrator rateability typed attempt-record contract", () => {
  it("freezes the complete additive record contract without changing the vault contract", () => {
    expect(narratorBrowserRateabilityAttemptRecordContractV3).toEqual({
      schemaVersion: 1,
      contractId: "the-grind-2:narrator-browser-rateability-attempt-records:v3",
      snapshotFields: [
        "name",
        "schemaVersion",
        "contentHash",
        "byteLength",
        "sha256",
      ],
      preservationReceiptId:
        "the-grind-2:narrator-browser-rateability-attempt-preservation:v3",
      preservationPhases,
      verificationDiagnosticId:
        "the-grind-2:narrator-browser-rateability-verification-diagnostic:v3",
      diagnosticFailureCodes,
      failureLifecycles,
      terminalReceiptId:
        "the-grind-2:narrator-browser-rateability-attempt-terminal:v3",
      terminalStatuses: ["verified", "failed"],
      verificationVerdicts: ["not-run", "pass", "fail"],
      verifiedDispositions: ["rateable-for-blind-rating", "blocked"],
      verifiedDispositionSource: "32-run-package.json:disposition",
      authorityFields,
      diagnosticPredicateContract:
        narratorBrowserRateabilityEvidencePredicateContractV3,
    });
    expect(narratorBrowserRateabilityAttemptRecordContractHashV3)
      .toBe(canonicalHash(narratorBrowserRateabilityAttemptRecordContractV3));
    expect(narratorBrowserRateabilityAttemptRecordContractHashV3)
      .toBe("bfa9bb2ae77e710a");
    expect(narratorBrowserRateabilityAttemptVaultContractHashV3)
      .toBe("e7e50a2a0ea32945");
    expectDeepFrozen(narratorBrowserRateabilityAttemptRecordContractV3);
  });

  it("keeps builders, predicates, and the audit projector total and path-free for hostile getters", () => {
    const hostile = new Proxy({}, {
      get() {
        throw new Error(privateWitness);
      },
      ownKeys() {
        throw new Error(privateWitness);
      },
    });
    for (const predicate of [
      isNarratorBrowserRateabilityAttemptPreservationReceiptV3,
      isNarratorBrowserRateabilityVerificationDiagnosticV3,
      isNarratorBrowserRateabilityAttemptTerminalReceiptV3,
    ]) {
      expect(() => predicate(hostile)).not.toThrow();
      expect(predicate(hostile)).toBe(false);
    }
    for (const builder of [
      createNarratorBrowserRateabilityAttemptPreservationReceiptV3,
      createNarratorBrowserRateabilityVerificationDiagnosticV3,
      createNarratorBrowserRateabilityAttemptTerminalReceiptV3,
      projectNarratorBrowserRateabilityEvidenceAuditV3,
    ]) {
      expectSafeThrow(() => builder(hostile));
    }
  });
});

describe("V3 narrator attempt preservation receipts", () => {
  it.each(preservationPhases)(
    "builds a frozen, value-free $phase receipt from exact read-back bytes",
    ({ phase, inputFiles }) => {
      let copyCount = 0;
      const records = recordsForPhase(phase, recordValues(), () => {
        copyCount += 1;
      });
      const receipt = createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
        attempt: attempt(),
        phase,
        records,
      });
      const content = {
        schemaVersion: 1,
        receiptId:
          "the-grind-2:narrator-browser-rateability-attempt-preservation:v3",
        recordContractHash: narratorBrowserRateabilityAttemptRecordContractHashV3,
        vaultContractHash: narratorBrowserRateabilityAttemptVaultContractHashV3,
        attemptId: "a".repeat(64),
        phase,
        files: records.map(commitment),
        publicReplayableBeforeRating: false,
        humanQualityEvaluated: false,
        humanRatingIncluded: false,
        modelAdmitted: false,
        displayAuthorized: false,
        productionAuthority: false,
      };

      expect(receipt).toEqual(withHash(content));
      expect(receipt.files.map(({ name }) => name)).toEqual(inputFiles);
      expect(copyCount).toBe(records.length);
      expectCanonicalRecord(receipt);
      expect(isNarratorBrowserRateabilityAttemptPreservationReceiptV3(receipt))
        .toBe(true);
      expectDeepFrozen(receipt);
      const serialized = JSON.stringify(receipt);
      expect(serialized).not.toContain(privateWitness);
      expect(serialized).not.toContain("copyBytes");
      expect(serialized).not.toContain('"value"');
    },
  );

  it("rejects wrong phase membership, metadata, bytes, record projections, and attempts", () => {
    const targetAttempt = attempt();
    const records = recordsForPhase("core");
    const invalidInputs = [
      { phase: "unknown", records },
      { phase: "core", records: records.slice(0, -1) },
      { phase: "core", records: [...records].reverse() },
      { phase: "core", records: [records[0], records[0], ...records.slice(2)] },
      {
        phase: "core",
        records: [
          makeSnapshot("wrong.json", records[0].value),
          ...records.slice(1),
        ],
      },
      {
        phase: "core",
        records: [
          { ...records[0], byteLength: records[0].byteLength + 1 },
          ...records.slice(1),
        ],
      },
      {
        phase: "core",
        records: [
          { ...records[0], sha256: "0".repeat(64) },
          ...records.slice(1),
        ],
      },
      {
        phase: "core",
        records: [
          { ...records[0], copyBytes: () => new Uint8Array([123]) },
          ...records.slice(1),
        ],
      },
      {
        phase: "core",
        records: [
          { ...records[0], ignoredPrivate: privateWitness },
          ...records.slice(1),
        ],
      },
      {
        phase: "core",
        records: [
          makeSnapshot(records[0].name, {
            ...records[0].value,
            contentHash: "0".repeat(16),
          }),
          ...records.slice(1),
        ],
      },
    ];
    for (const input of invalidInputs) {
      expectSafeThrow(() =>
        createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
          attempt: targetAttempt,
          ...input,
        }));
    }
    expectSafeThrow(() =>
      createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
        attempt: targetAttempt,
        phase: "core",
        records,
        ignoredPrivate: privateWitness,
      }));
    expectSafeThrow(() =>
      createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
        attempt: { ...targetAttempt, attemptId: "not-an-attempt" },
        phase: "core",
        records,
      }));
    expectSafeThrow(() =>
      createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
        attempt: {
          ...targetAttempt,
          vaultContractHash: "0".repeat(16),
        },
        phase: "core",
        records,
      }));
  });

  it("captures a stateful attempt identity once before validation and emission", () => {
    let attemptIdReads = 0;
    const statefulAttempt = {};
    Object.defineProperties(statefulAttempt, {
      schemaVersion: { enumerable: true, value: 1 },
      attemptId: {
        enumerable: true,
        get() {
          attemptIdReads += 1;
          return attemptIdReads === 1 ? "a".repeat(64) : privateWitness;
        },
      },
      vaultContractHash: {
        enumerable: true,
        value: narratorBrowserRateabilityAttemptVaultContractHashV3,
      },
    });
    const receipt = createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
      attempt: statefulAttempt,
      phase: "core",
      records: recordsForPhase("core"),
    });
    expect(attemptIdReads).toBe(1);
    expect(receipt.attemptId).toBe("a".repeat(64));
    expect(JSON.stringify(receipt)).not.toContain(privateWitness);
    expect(isNarratorBrowserRateabilityAttemptPreservationReceiptV3(receipt))
      .toBe(true);
  });

  it("rejects fully rehashed receipt forgeries and never throws from its predicate", () => {
    const receipt = preservationReceiptSet()[0].receipt;
    const forgeries = [
      rehash(receipt, (copy) => { copy.phase = "host"; }),
      rehash(receipt, (copy) => { copy.files.reverse(); }),
      rehash(receipt, (copy) => { copy.files.pop(); }),
      rehash(receipt, (copy) => { copy.attemptId = "invalid"; }),
      rehash(receipt, (copy) => { copy.recordContractHash = "0".repeat(16); }),
      rehash(receipt, (copy) => { copy.vaultContractHash = "0".repeat(16); }),
      rehash(receipt, (copy) => { copy.files[0].schemaVersion = null; }),
      rehash(receipt, (copy) => { copy.files[0].sha256 = "not-sha256"; }),
      rehash(receipt, (copy) => { copy.files[0].extra = true; }),
      rehash(receipt, (copy) => { copy.modelAdmitted = true; }),
      rehash(receipt, (copy) => { copy.extra = privateWitness; }),
    ];
    for (const forgery of forgeries) {
      expect(isNarratorBrowserRateabilityAttemptPreservationReceiptV3(forgery))
        .toBe(false);
    }
    const cyclic = {};
    cyclic.files = cyclic;
    for (const malformed of [null, undefined, [], cyclic, privateWitness]) {
      expect(() =>
        isNarratorBrowserRateabilityAttemptPreservationReceiptV3(malformed))
        .not.toThrow();
      expect(isNarratorBrowserRateabilityAttemptPreservationReceiptV3(malformed))
        .toBe(false);
    }
  });
});

describe("V3 narrator public-safe verification diagnostics", () => {
  it.each([
    ["successful verification", makeAudit(), null],
    ["failed verification", makeAudit(["nrv3.authority.denied"]),
      "evidence-verification-failed"],
    ["publication after a pass", makeAudit(), "evidence-publication-failed"],
  ])("builds a frozen safe diagnostic for %s", (_label, audit, failureCode) => {
    const sourceAudit = structuredClone(audit);
    const diagnostic = createNarratorBrowserRateabilityVerificationDiagnosticV3({
      audit: sourceAudit,
      failureCode,
    });
    const content = {
      schemaVersion: 1,
      diagnosticId:
        "the-grind-2:narrator-browser-rateability-verification-diagnostic:v3",
      failureCode,
      audit,
      officialDisposition: null,
      publicReplayableBeforeRating: false,
      humanQualityEvaluated: false,
      humanRatingIncluded: false,
      modelAdmitted: false,
      displayAuthorized: false,
      productionAuthority: false,
    };
    expect(diagnostic).toEqual(withHash(content));
    expectCanonicalRecord(diagnostic);
    expect(isNarratorBrowserRateabilityVerificationDiagnosticV3(diagnostic))
      .toBe(true);
    expectDeepFrozen(diagnostic);
    if (sourceAudit.predicates.length > 0) {
      sourceAudit.predicates[0].status = "fail";
      expect(diagnostic.audit.predicates[0].status).toBe(audit.predicates[0].status);
    }
    const serialized = JSON.stringify(diagnostic);
    for (const prohibited of [
      privateWitness,
      "attemptId",
      "runId",
      "sheetId",
      "candidateId",
      "sourceCommit",
      '"path"',
      '"error"',
      '"message"',
      '"stack"',
      '"cause"',
    ]) {
      expect(serialized).not.toContain(prohibited);
    }
  });

  it.each(diagnosticFailureCodes.filter((code) =>
    code !== "evidence-verification-failed"
      && code !== "evidence-publication-failed"))(
    "represents pre-verification failure %s without an audit",
    (failureCode) => {
      const diagnostic = createNarratorBrowserRateabilityVerificationDiagnosticV3({
        audit: null,
        failureCode,
      });
      expect(diagnostic.audit).toBeNull();
      expect(diagnostic.failureCode).toBe(failureCode);
      expect(isNarratorBrowserRateabilityVerificationDiagnosticV3(diagnostic))
        .toBe(true);
      expectCanonicalRecord(diagnostic);
      expectDeepFrozen(diagnostic);
    },
  );

  it("rejects invalid audit/failure combinations and private diagnostic detail safely", () => {
    const passAudit = makeAudit();
    const failAudit = makeAudit(["nrv3.authority.denied"]);
    const malformedAudit = {
      ...passAudit,
      error: privateWitness,
    };
    const invalid = [
      { audit: passAudit, failureCode: "evidence-verification-failed" },
      { audit: failAudit, failureCode: null },
      { audit: failAudit, failureCode: "evidence-publication-failed" },
      { audit: null, failureCode: null },
      { audit: null, failureCode: "evidence-verification-failed" },
      { audit: null, failureCode: "evidence-publication-failed" },
      { audit: passAudit, failureCode: "private-" + privateWitness },
      { audit: malformedAudit, failureCode: "evidence-verification-failed" },
      { failureCode: "attempt-admission-failed" },
      {
        audit: null,
        failureCode: "attempt-admission-failed",
        ignoredPrivate: privateWitness,
      },
    ];
    for (const input of invalid) {
      expectSafeThrow(() =>
        createNarratorBrowserRateabilityVerificationDiagnosticV3(input));
    }
  });

  it("captures stateful audit and predicate fields exactly once", () => {
    const source = makeAudit();
    const reads = {
      verdict: 0,
      predicates: 0,
      failedPredicateIds: 0,
      notEvaluatedPredicateIds: 0,
      id: 0,
      status: 0,
      blockedBy: 0,
    };
    const statefulPredicate = {};
    const first = source.predicates[0];
    for (const [key, initial] of [
      ["id", first.id],
      ["status", first.status],
      ["blockedBy", first.blockedBy],
    ]) {
      Object.defineProperty(statefulPredicate, key, {
        enumerable: true,
        get() {
          reads[key] += 1;
          return reads[key] === 1 ? initial : privateWitness;
        },
      });
    }
    const predicates = [statefulPredicate, ...source.predicates.slice(1)];
    const statefulAudit = {
      schemaVersion: source.schemaVersion,
      auditId: source.auditId,
    };
    for (const [key, initial] of [
      ["verdict", source.verdict],
      ["predicates", predicates],
      ["failedPredicateIds", source.failedPredicateIds],
      ["notEvaluatedPredicateIds", source.notEvaluatedPredicateIds],
    ]) {
      Object.defineProperty(statefulAudit, key, {
        enumerable: true,
        get() {
          reads[key] += 1;
          return reads[key] === 1 ? initial : privateWitness;
        },
      });
    }
    const diagnostic = createNarratorBrowserRateabilityVerificationDiagnosticV3({
      audit: statefulAudit,
      failureCode: null,
    });
    expect(reads).toEqual({
      verdict: 1,
      predicates: 1,
      failedPredicateIds: 1,
      notEvaluatedPredicateIds: 1,
      id: 1,
      status: 1,
      blockedBy: 1,
    });
    expect(diagnostic.audit).toEqual(source);
    expect(JSON.stringify(diagnostic)).not.toContain(privateWitness);
    expect(isNarratorBrowserRateabilityVerificationDiagnosticV3(diagnostic))
      .toBe(true);
  });

  it("rejects rehashed audit/order/parity/authority forgeries without throwing", () => {
    const diagnostic = diagnosticSnapshot().diagnostic;
    const forgeries = [
      rehash(diagnostic, (copy) => { copy.audit.predicates.reverse(); }),
      rehash(diagnostic, (copy) => {
        copy.audit.predicates.find(({ id }) =>
          id === "nrv3.contracts.frozen").blockedBy =
            ["nrv3.expected-bindings.schema"];
      }),
      rehash(diagnostic, (copy) => {
        copy.audit.failedPredicateIds = ["nrv3.authority.denied"];
      }),
      rehash(diagnostic, (copy) => { copy.audit.verdict = "fail"; }),
      rehash(diagnostic, (copy) => { copy.audit.error = privateWitness; }),
      rehash(diagnostic, (copy) => {
        copy.failureCode = "evidence-verification-failed";
      }),
      rehash(diagnostic, (copy) => {
        copy.officialDisposition = "rateable-for-blind-rating";
      }),
      rehash(diagnostic, (copy) => { copy.displayAuthorized = true; }),
      rehash(diagnostic, (copy) => { copy.extra = true; }),
    ];
    for (const forgery of forgeries) {
      expect(isNarratorBrowserRateabilityVerificationDiagnosticV3(forgery))
        .toBe(false);
    }
    const cyclic = {};
    cyclic.audit = cyclic;
    for (const malformed of [null, undefined, [], cyclic, privateWitness]) {
      expect(() =>
        isNarratorBrowserRateabilityVerificationDiagnosticV3(malformed))
        .not.toThrow();
      expect(isNarratorBrowserRateabilityVerificationDiagnosticV3(malformed))
        .toBe(false);
    }
  });
});

describe("V3 narrator attempt terminal receipts", () => {
  it.each(["rateable-for-blind-rating", "blocked"])(
    "derives a verified %s terminal from four receipts and one passing diagnostic",
    (officialDisposition) => {
      const targetAttempt = attempt();
      const receipts = preservationReceiptSet(
        targetAttempt,
        privateWitness,
        officialDisposition,
      );
      const diagnostic = diagnosticSnapshot();
      const terminal = createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
        attempt: targetAttempt,
        preservationReceipts: receipts.map(({ snapshot }) => snapshot),
        verificationDiagnostic: diagnostic.snapshot,
        runPackage: runPackageSnapshot(officialDisposition),
      });
      const content = {
        schemaVersion: 1,
        receiptId:
          "the-grind-2:narrator-browser-rateability-attempt-terminal:v3",
        recordContractHash: narratorBrowserRateabilityAttemptRecordContractHashV3,
        vaultContractHash: narratorBrowserRateabilityAttemptVaultContractHashV3,
        attemptId: targetAttempt.attemptId,
        terminalStatus: "verified",
        preservationReceipts: receipts.map(({ snapshot }) => commitment(snapshot)),
        verificationDiagnostic: commitment(diagnostic.snapshot),
        failureCode: null,
        verificationVerdict: "pass",
        officialDisposition,
        publicReplayableBeforeRating: false,
        humanQualityEvaluated: false,
        humanRatingIncluded: false,
        modelAdmitted: false,
        displayAuthorized: false,
        productionAuthority: false,
      };
      expect(terminal).toEqual(withHash(content));
      expectCanonicalRecord(terminal);
      expect(isNarratorBrowserRateabilityAttemptTerminalReceiptV3(terminal))
        .toBe(true);
      expectDeepFrozen(terminal);
      const serialized = JSON.stringify(terminal);
      expect(serialized).not.toContain(privateWitness);
      expect(serialized).not.toContain("copyBytes");
      expect(serialized).not.toContain('"value"');
      expect(serialized).not.toContain('"audit"');
    },
  );

  it.each([0, 1, 2, 3, 4])(
    "accepts failed terminal preservation prefix of length %i",
    (prefixLength) => {
      const targetAttempt = attempt();
      const receipts = preservationReceiptSet(targetAttempt);
      const diagnostic = diagnosticSnapshot({
        audit: null,
        failureCode: "retention-verification-failed",
      });
      const terminal = createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
        attempt: targetAttempt,
        preservationReceipts: receipts
          .slice(0, prefixLength)
          .map(({ snapshot }) => snapshot),
        verificationDiagnostic: diagnostic.snapshot,
        runPackage: prefixLength === 4 ? runPackageSnapshot() : null,
      });
      expect(terminal).toMatchObject({
        terminalStatus: "failed",
        failureCode: "retention-verification-failed",
        verificationVerdict: "not-run",
        officialDisposition: null,
      });
      expect(terminal.preservationReceipts)
        .toEqual(receipts.slice(0, prefixLength)
          .map(({ snapshot }) => commitment(snapshot)));
      expect(isNarratorBrowserRateabilityAttemptTerminalReceiptV3(terminal))
        .toBe(true);
      expectCanonicalRecord(terminal);
      expectDeepFrozen(terminal);
    },
  );

  it.each(failureLifecycles)(
    "enforces the $failureCode preservation-prefix lifecycle",
    ({
      failureCode,
      minimumPreservationReceipts,
      maximumPreservationReceipts,
    }) => {
      const targetAttempt = attempt();
      const receipts = preservationReceiptSet(targetAttempt);
      const audit = failureCode === "evidence-verification-failed"
        ? makeAudit(["nrv3.authority.denied"])
        : failureCode === "evidence-publication-failed"
          ? makeAudit()
          : null;
      const diagnostic = diagnosticSnapshot({ audit, failureCode });
      for (let receiptCount = 0; receiptCount <= preservationPhases.length;
        receiptCount += 1) {
        const build = () => createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
          attempt: targetAttempt,
          preservationReceipts: receipts
            .slice(0, receiptCount)
            .map(({ snapshot }) => snapshot),
          verificationDiagnostic: diagnostic.snapshot,
          runPackage: receiptCount === preservationPhases.length
            ? runPackageSnapshot()
            : null,
        });
        const allowed = receiptCount >= minimumPreservationReceipts
          && receiptCount <= maximumPreservationReceipts;
        if (allowed) {
          expect(build()).toMatchObject({ terminalStatus: "failed", failureCode });
        } else {
          expectSafeThrow(build);
        }
      }
    },
  );

  it.each([
    [
      makeAudit(["nrv3.authority.denied"]),
      "evidence-verification-failed",
      "fail",
    ],
    [
      makeAudit(),
      "evidence-publication-failed",
      "pass",
    ],
  ])("derives failed terminal diagnostic verdict %s", (
    audit,
    failureCode,
    verificationVerdict,
  ) => {
    const targetAttempt = attempt();
    const receipts = preservationReceiptSet(targetAttempt);
    const diagnostic = diagnosticSnapshot({ audit, failureCode });
    const terminal = createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
      attempt: targetAttempt,
      preservationReceipts: receipts.map(({ snapshot }) => snapshot),
      verificationDiagnostic: diagnostic.snapshot,
      runPackage: runPackageSnapshot(),
    });
    expect(terminal).toMatchObject({
      terminalStatus: "failed",
      failureCode,
      verificationVerdict,
      officialDisposition: null,
    });
    expect(isNarratorBrowserRateabilityAttemptTerminalReceiptV3(terminal))
      .toBe(true);
  });

  it("rejects non-prefix, cross-attempt, cross-phase, and corrupt read-back inputs", () => {
    const targetAttempt = attempt();
    const receipts = preservationReceiptSet(targetAttempt);
    const diagnostic = diagnosticSnapshot({
      audit: null,
      failureCode: "retention-verification-failed",
    });
    const otherAttemptReceipts = preservationReceiptSet(attempt("b".repeat(64)));
    const changedValues = recordValues();
    changedValues.set(
      "30-provenance-receipt.json",
      recordValue("30-provenance-receipt.json", "different-private-provenance"),
    );
    const divergentHost = createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
      attempt: targetAttempt,
      phase: "host",
      records: recordsForPhase("host", changedValues),
    });
    const invalid = [
      [receipts[1].snapshot],
      [receipts[0].snapshot, receipts[2].snapshot],
      [receipts[1].snapshot, receipts[0].snapshot],
      [receipts[0].snapshot, receipts[0].snapshot],
      [
        receipts[0].snapshot,
        receipts[1].snapshot,
        receipts[2].snapshot,
        makeSnapshot("39-host-preservation.json", divergentHost),
      ],
      [otherAttemptReceipts[0].snapshot],
    ];
    for (const preservationReceipts of invalid) {
      expectSafeThrow(() =>
        createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
          attempt: targetAttempt,
          preservationReceipts,
          verificationDiagnostic: diagnostic.snapshot,
          runPackage: preservationReceipts.length === 4
            ? runPackageSnapshot()
            : null,
        }));
    }
    expectSafeThrow(() =>
      createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
        attempt: targetAttempt,
        preservationReceipts: receipts.map(({ snapshot }) => snapshot),
        verificationDiagnostic: {
          ...diagnostic.snapshot,
          copyBytes: () => new Uint8Array([123]),
        },
        runPackage: runPackageSnapshot(),
      }));
    expectSafeThrow(() =>
      createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
        attempt: targetAttempt,
        preservationReceipts: receipts.map(({ snapshot }) => snapshot),
        verificationDiagnostic: makeSnapshot(
          "wrong-diagnostic.json",
          diagnostic.diagnostic,
        ),
        runPackage: runPackageSnapshot(),
      }));
  });

  it("derives package disposition and rejects invalid package or caller authority", () => {
    const targetAttempt = attempt();
    const receipts = preservationReceiptSet(targetAttempt);
    const diagnostic = diagnosticSnapshot();
    expectSafeThrow(() =>
      createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
        attempt: targetAttempt,
        preservationReceipts: receipts.map(({ snapshot }) => snapshot),
        verificationDiagnostic: diagnostic.snapshot,
        runPackage: null,
      }));
    expectSafeThrow(() =>
      createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
        attempt: targetAttempt,
        preservationReceipts: receipts.map(({ snapshot }) => snapshot),
        verificationDiagnostic: diagnostic.snapshot,
        runPackage: runPackageSnapshot(),
        officialDisposition: privateWitness,
      }));
    expectSafeThrow(() =>
      createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
        attempt: targetAttempt,
        preservationReceipts: receipts.map(({ snapshot }) => snapshot),
        verificationDiagnostic: diagnostic.snapshot,
        runPackage: runPackageSnapshot("blocked"),
      }));
    const invalidDisposition = "forged-disposition";
    const invalidReceipts = preservationReceiptSet(
      targetAttempt,
      privateWitness,
      invalidDisposition,
    );
    expectSafeThrow(() =>
      createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
        attempt: targetAttempt,
        preservationReceipts: invalidReceipts.map(({ snapshot }) => snapshot),
        verificationDiagnostic: diagnostic.snapshot,
        runPackage: runPackageSnapshot(invalidDisposition),
      }));

    const terminal = createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
      attempt: targetAttempt,
      preservationReceipts: receipts.map(({ snapshot }) => snapshot),
      verificationDiagnostic: diagnostic.snapshot,
      runPackage: runPackageSnapshot(),
    });
    const forgeries = [
      rehash(terminal, (copy) => { copy.terminalStatus = "failed"; }),
      rehash(terminal, (copy) => {
        copy.failureCode = "evidence-verification-failed";
      }),
      rehash(terminal, (copy) => { copy.verificationVerdict = "fail"; }),
      rehash(terminal, (copy) => { copy.officialDisposition = null; }),
      rehash(terminal, (copy) => { copy.preservationReceipts.pop(); }),
      rehash(terminal, (copy) => { copy.preservationReceipts.reverse(); }),
      rehash(terminal, (copy) => {
        copy.verificationDiagnostic.name = "39-host-preservation.json";
      }),
      rehash(terminal, (copy) => { copy.productionAuthority = true; }),
      rehash(terminal, (copy) => { copy.extra = true; }),
    ];
    for (const forgery of forgeries) {
      expect(isNarratorBrowserRateabilityAttemptTerminalReceiptV3(forgery))
        .toBe(false);
    }

    const cyclic = {};
    cyclic.preservationReceipts = cyclic;
    for (const malformed of [null, undefined, [], cyclic, privateWitness]) {
      expect(() =>
        isNarratorBrowserRateabilityAttemptTerminalReceiptV3(malformed))
        .not.toThrow();
      expect(isNarratorBrowserRateabilityAttemptTerminalReceiptV3(malformed))
        .toBe(false);
    }
  });

  it("ignores live package getters and emits only the verified bytes", () => {
    const targetAttempt = attempt();
    const receipts = preservationReceiptSet(targetAttempt);
    const diagnostic = diagnosticSnapshot();
    const stableSnapshot = runPackageSnapshot();
    const stableValue = stableSnapshot.value;
    let attemptIdReads = 0;
    const statefulAttempt = {};
    Object.defineProperties(statefulAttempt, {
      schemaVersion: { enumerable: true, value: 1 },
      attemptId: {
        enumerable: true,
        get() {
          attemptIdReads += 1;
          return attemptIdReads === 1 ? targetAttempt.attemptId : privateWitness;
        },
      },
      vaultContractHash: {
        enumerable: true,
        value: narratorBrowserRateabilityAttemptVaultContractHashV3,
      },
    });
    let dispositionReads = 0;
    const statefulValue = {};
    Object.defineProperties(statefulValue, {
      schemaVersion: { enumerable: true, value: stableValue.schemaVersion },
      recordId: { enumerable: true, value: stableValue.recordId },
      privateWitness: { enumerable: true, value: stableValue.privateWitness },
      disposition: {
        enumerable: true,
        get() {
          dispositionReads += 1;
          return dispositionReads === 1
            ? "rateable-for-blind-rating"
            : privateWitness;
        },
      },
      contentHash: { enumerable: true, value: stableValue.contentHash },
    });
    const terminal = createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
      attempt: statefulAttempt,
      preservationReceipts: receipts.map(({ snapshot }) => snapshot),
      verificationDiagnostic: diagnostic.snapshot,
      runPackage: Object.freeze({
        ...stableSnapshot,
        value: statefulValue,
      }),
    });
    expect(attemptIdReads).toBe(1);
    expect(dispositionReads).toBe(0);
    expect(terminal.officialDisposition).toBe("rateable-for-blind-rating");
    expect(JSON.stringify(terminal)).not.toContain(privateWitness);
    expect(isNarratorBrowserRateabilityAttemptTerminalReceiptV3(terminal)).toBe(true);
  });
});
