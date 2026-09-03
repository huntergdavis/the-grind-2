import { canonicalHash, canonicalStringify } from "../core/canonical";
import { isNarratorVerifiedArtifactsV1 } from "./evaluation-receipts";
import {
  isNarratorNamedPhoneProfileV1,
  isNarratorShadowBenchmarkPlanForEvidenceV1,
  type NarratorB2EvidenceV1,
  type NarratorNamedPhoneProfileV1,
  type NarratorNamedPhoneShadowReceiptV1,
  type NarratorShadowBenchmarkPlanV1,
} from "./shadow-benchmark";
import {
  isNarratorBoundedText,
  isNarratorRecord,
  narratorEnvelopeByteLength,
  narratorHasExactKeys,
} from "./protocol";

export const narratorShadowArchiveMaximumBytes = 8 * 1024 * 1024;
export const narratorShadowArchiveMaximumEntries = 32;

export const narratorShadowPhaseObservationChannels = Object.freeze([
  "frames",
  "long-tasks",
  "memory",
  "thermal",
  "battery",
  "network",
  "canonical",
  "presentation",
  "worker",
  "opportunities",
] as const);

export const narratorShadowCompletionObservationChannels = Object.freeze([
  "artifacts",
  "suppression",
  "settlement",
] as const);

export type NarratorShadowPhaseObservationChannel = typeof narratorShadowPhaseObservationChannels[number];
export type NarratorShadowCompletionObservationChannel = typeof narratorShadowCompletionObservationChannels[number];
export type NarratorShadowObservationChannel =
  | NarratorShadowPhaseObservationChannel
  | NarratorShadowCompletionObservationChannel;

export type NarratorShadowObservationOrigin =
  | "browser-observed"
  | "coordinator-imported"
  | "synthetic";

interface NarratorShadowPresentObservationBaseV1 {
  readonly channel: NarratorShadowObservationChannel;
  readonly availability: "present";
  readonly origin: NarratorShadowObservationOrigin;
  readonly method: string;
  readonly collectorSessionId: string;
  readonly clockDomain: string;
  readonly startOffsetMilliseconds: number;
  readonly endOffsetMilliseconds: number;
  readonly recordCount: number;
  readonly payloadHash: string;
}

export type NarratorShadowObservationV1 =
  | (NarratorShadowPresentObservationBaseV1 & {
      readonly origin: "browser-observed";
    })
  | (NarratorShadowPresentObservationBaseV1 & {
      readonly origin: "coordinator-imported";
      readonly instrumentId: string;
      readonly operatorId: string;
      readonly units: string;
      readonly captureIntervalMilliseconds: number;
      readonly timebaseMapping: string;
      readonly sourceFileSha256: string;
    })
  | (NarratorShadowPresentObservationBaseV1 & {
      readonly origin: "synthetic";
      readonly fixtureId: string;
    })
  | {
      readonly channel: NarratorShadowObservationChannel;
      readonly availability: "missing";
    }
  | {
      readonly channel: NarratorShadowObservationChannel;
      readonly availability: "unsupported";
      readonly method: string;
      readonly reason: string;
    };

export interface NarratorShadowArchiveBindingV1 {
  readonly runId: string;
  readonly planHash: string;
  readonly profileHash: string;
  readonly buildRevision: string;
  readonly candidateId: string;
  readonly candidateManifestHash: string;
  readonly artifactManifestHash: string;
  readonly runtimeIntegrity: string;
  readonly corpusHash: string;
  readonly decodingHash: string;
  readonly b2ReportHash: string;
  readonly b2ConsumptionHash: string;
}

export type NarratorShadowArchiveAttemptOutcome =
  | "finished"
  | "interrupted"
  | "aborted"
  | "device-lost";

export interface NarratorShadowArchiveEntryV1 {
  readonly schemaVersion: 1;
  readonly binding: NarratorShadowArchiveBindingV1;
  readonly collectorSessionId: string;
  readonly ordinal: number;
  readonly previousEntryHash: string | null;
  readonly phaseSequence: number;
  readonly attemptId: string;
  readonly outcome: NarratorShadowArchiveAttemptOutcome;
  readonly phase: unknown | null;
  readonly opportunities: readonly unknown[] | null;
  readonly workerExchanges: readonly unknown[] | null;
  readonly observations: readonly NarratorShadowObservationV1[];
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

export interface NarratorShadowArchiveCompletionV1 {
  readonly schemaVersion: 1;
  readonly binding: NarratorShadowArchiveBindingV1;
  readonly collectorSessionId: string;
  readonly observer: NarratorNamedPhoneShadowReceiptV1["observer"] | null;
  readonly postDisposalMemoryDurationMilliseconds: number | null;
  readonly postDisposalMemorySamples: readonly unknown[] | null;
  readonly observedCachedArtifacts: readonly unknown[] | null;
  readonly suppressionTransitions: readonly unknown[] | null;
  readonly observations: readonly NarratorShadowObservationV1[];
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

export type NarratorShadowArchiveTerminalStatus = "open" | "sealed" | "aborted" | "device-lost";

export interface NarratorShadowPhaseArchiveV1 {
  readonly schemaVersion: 1;
  readonly plan: NarratorShadowBenchmarkPlanV1;
  readonly profile: NarratorNamedPhoneProfileV1;
  readonly binding: NarratorShadowArchiveBindingV1;
  readonly collectorSessionId: string;
  readonly entries: readonly NarratorShadowArchiveEntryV1[];
  readonly revision: number;
  readonly terminalStatus: NarratorShadowArchiveTerminalStatus;
  readonly completion: NarratorShadowArchiveCompletionV1 | null;
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

interface ArchiveEntryFields extends Omit<NarratorShadowArchiveEntryV1,
  "schemaVersion" | "binding" | "modelAdmitted" | "displayAuthorized" | "contentHash"> {
  readonly plan: NarratorShadowBenchmarkPlanV1;
  readonly profile: NarratorNamedPhoneProfileV1;
}

interface ArchiveCompletionFields extends Omit<NarratorShadowArchiveCompletionV1,
  "schemaVersion" | "binding" | "modelAdmitted" | "displayAuthorized" | "contentHash"> {
  readonly plan: NarratorShadowBenchmarkPlanV1;
  readonly profile: NarratorNamedPhoneProfileV1;
}

const hashPattern = /^[0-9a-f]{16}$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && hashPattern.test(value);
}

function hashedContentIsValid(value: Record<string, unknown>): boolean {
  if (!isHash(value.contentHash)) return false;
  const { contentHash, ...content } = value;
  return value.contentHash === canonicalHash(content);
}

export function narratorShadowArchiveBindingV1(
  plan: NarratorShadowBenchmarkPlanV1,
  profile: NarratorNamedPhoneProfileV1,
): NarratorShadowArchiveBindingV1 {
  return deepFreeze({
    runId: plan.runId,
    planHash: plan.contentHash,
    profileHash: profile.contentHash,
    buildRevision: plan.app.buildRevision,
    candidateId: plan.bindings.candidateId,
    candidateManifestHash: plan.bindings.candidateManifestHash,
    artifactManifestHash: plan.bindings.artifactManifestHash,
    runtimeIntegrity: plan.bindings.runtimeIntegrity,
    corpusHash: plan.bindings.corpusHash,
    decodingHash: plan.bindings.decodingHash,
    b2ReportHash: plan.bindings.b2ReportHash,
    b2ConsumptionHash: plan.bindings.b2ConsumptionHash,
  });
}

function bindingMatches(
  value: unknown,
  plan: NarratorShadowBenchmarkPlanV1,
  profile: NarratorNamedPhoneProfileV1,
): value is NarratorShadowArchiveBindingV1 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, [
      "runId", "planHash", "profileHash", "buildRevision", "candidateId", "candidateManifestHash",
      "artifactManifestHash", "runtimeIntegrity", "corpusHash", "decodingHash", "b2ReportHash",
      "b2ConsumptionHash",
    ])
    && canonicalStringify(value) === canonicalStringify(narratorShadowArchiveBindingV1(plan, profile));
}

export function isNarratorShadowObservationV1(value: unknown): value is NarratorShadowObservationV1 {
  if (!isNarratorRecord(value)
    || !narratorShadowPhaseObservationChannels.includes(value.channel as NarratorShadowPhaseObservationChannel)
      && !narratorShadowCompletionObservationChannels.includes(value.channel as NarratorShadowCompletionObservationChannel)
    || !["present", "missing", "unsupported"].includes(String(value.availability))) return false;
  if (value.availability === "missing") {
    return narratorHasExactKeys(value, ["channel", "availability"]);
  }
  if (value.availability === "unsupported") {
    return narratorHasExactKeys(value, ["channel", "availability", "method", "reason"])
      && isNarratorBoundedText(value.method, 160)
      && isNarratorBoundedText(value.reason, 240);
  }
  const commonKeys = [
    "channel", "availability", "origin", "method", "collectorSessionId", "clockDomain",
    "startOffsetMilliseconds", "endOffsetMilliseconds", "recordCount", "payloadHash",
  ];
  if (!["browser-observed", "coordinator-imported", "synthetic"].includes(String(value.origin))
    || !isNarratorBoundedText(value.method, 160)
    || !isNarratorBoundedText(value.collectorSessionId, 200)
    || !isNarratorBoundedText(value.clockDomain, 160)
    || !nonNegativeInteger(value.startOffsetMilliseconds)
    || !nonNegativeInteger(value.endOffsetMilliseconds)
    || Number(value.endOffsetMilliseconds) < Number(value.startOffsetMilliseconds)
    || !nonNegativeInteger(value.recordCount)
    || !isHash(value.payloadHash)) return false;
  if (value.origin === "browser-observed") return narratorHasExactKeys(value, commonKeys);
  if (value.origin === "synthetic") {
    return narratorHasExactKeys(value, [...commonKeys, "fixtureId"])
      && isNarratorBoundedText(value.fixtureId, 200);
  }
  return narratorHasExactKeys(value, [
    ...commonKeys, "instrumentId", "operatorId", "units", "captureIntervalMilliseconds",
    "timebaseMapping", "sourceFileSha256",
  ])
    && isNarratorBoundedText(value.instrumentId, 200)
    && isNarratorBoundedText(value.operatorId, 200)
    && isNarratorBoundedText(value.units, 80)
    && positiveInteger(value.captureIntervalMilliseconds)
    && isNarratorBoundedText(value.timebaseMapping, 240)
    && typeof value.sourceFileSha256 === "string"
    && sha256Pattern.test(value.sourceFileSha256);
}

function observationsHaveExactChannels(
  value: unknown,
  channels: readonly NarratorShadowObservationChannel[],
): value is readonly NarratorShadowObservationV1[] {
  return Array.isArray(value)
    && value.length === channels.length
    && value.every(isNarratorShadowObservationV1)
    && value.every((observation, index) => observation.channel === channels[index]);
}

export function createNarratorShadowArchiveEntryV1(fields: ArchiveEntryFields): NarratorShadowArchiveEntryV1 {
  const content = {
    schemaVersion: 1 as const,
    binding: narratorShadowArchiveBindingV1(fields.plan, fields.profile),
    collectorSessionId: fields.collectorSessionId,
    ordinal: fields.ordinal,
    previousEntryHash: fields.previousEntryHash,
    phaseSequence: fields.phaseSequence,
    attemptId: fields.attemptId,
    outcome: fields.outcome,
    phase: fields.phase,
    opportunities: fields.opportunities,
    workerExchanges: fields.workerExchanges,
    observations: fields.observations,
    modelAdmitted: false as const,
    displayAuthorized: false as const,
  };
  const entry = deepFreeze({ ...content, contentHash: canonicalHash(content) });
  if (!isNarratorShadowArchiveEntryForPlanV1(entry, fields.plan, fields.profile, fields.collectorSessionId)) {
    throw new TypeError("Narrator shadow archive entry is invalid");
  }
  return entry;
}

export function isNarratorShadowArchiveEntryForPlanV1(
  value: unknown,
  plan: NarratorShadowBenchmarkPlanV1,
  profile: NarratorNamedPhoneProfileV1,
  collectorSessionId: string,
): value is NarratorShadowArchiveEntryV1 {
  if (narratorEnvelopeByteLength(value) > narratorShadowArchiveMaximumBytes
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "binding", "collectorSessionId", "ordinal", "previousEntryHash", "phaseSequence",
      "attemptId", "outcome", "phase", "opportunities", "workerExchanges", "observations",
      "modelAdmitted", "displayAuthorized", "contentHash",
    ])
    || value.schemaVersion !== 1
    || !bindingMatches(value.binding, plan, profile)
    || value.collectorSessionId !== collectorSessionId
    || !isNarratorBoundedText(value.collectorSessionId, 200)
    || !nonNegativeInteger(value.ordinal)
    || Number(value.ordinal) >= narratorShadowArchiveMaximumEntries
    || !(value.previousEntryHash === null || isHash(value.previousEntryHash))
    || !nonNegativeInteger(value.phaseSequence)
    || Number(value.phaseSequence) >= 8
    || !isNarratorBoundedText(value.attemptId, 200)
    || !["finished", "interrupted", "aborted", "device-lost"].includes(String(value.outcome))
    || !(value.phase === null || isNarratorRecord(value.phase))
    || !(value.opportunities === null
      || (Array.isArray(value.opportunities) && value.opportunities.length <= 256))
    || !(value.workerExchanges === null
      || (Array.isArray(value.workerExchanges) && value.workerExchanges.length <= 256))
    || !observationsHaveExactChannels(value.observations, narratorShadowPhaseObservationChannels)
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false) return false;
  return hashedContentIsValid(value);
}

function observerIsStructurallyValid(value: unknown): value is NarratorNamedPhoneShadowReceiptV1["observer"] {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, [
      "frameMethod", "longTaskMethod", "memoryMethod", "thermalMethod", "batteryMethod",
      "memoryInstrumentId", "thermalInstrumentId", "batteryInstrumentId", "externalOperatorId",
    ])
    && ["request-animation-frame", "unsupported"].includes(String(value.frameMethod))
    && ["performance-observer", "unsupported"].includes(String(value.longTaskMethod))
    && ["measure-user-agent-specific-memory", "external-task-manager", "unsupported"].includes(String(value.memoryMethod))
    && ["android-thermal-api", "external-probe", "unsupported"].includes(String(value.thermalMethod))
    && ["android-battery-stats", "external-power-meter", "unsupported"].includes(String(value.batteryMethod))
    && [value.memoryInstrumentId, value.thermalInstrumentId, value.batteryInstrumentId, value.externalOperatorId]
      .every((entry) => entry === null || isNarratorBoundedText(entry, 200));
}

export function createNarratorShadowArchiveCompletionV1(
  fields: ArchiveCompletionFields,
): NarratorShadowArchiveCompletionV1 {
  const content = {
    schemaVersion: 1 as const,
    binding: narratorShadowArchiveBindingV1(fields.plan, fields.profile),
    collectorSessionId: fields.collectorSessionId,
    observer: fields.observer,
    postDisposalMemoryDurationMilliseconds: fields.postDisposalMemoryDurationMilliseconds,
    postDisposalMemorySamples: fields.postDisposalMemorySamples,
    observedCachedArtifacts: fields.observedCachedArtifacts,
    suppressionTransitions: fields.suppressionTransitions,
    observations: fields.observations,
    modelAdmitted: false as const,
    displayAuthorized: false as const,
  };
  const completion = deepFreeze({ ...content, contentHash: canonicalHash(content) });
  if (!isNarratorShadowArchiveCompletionForPlanV1(
    completion, fields.plan, fields.profile, fields.collectorSessionId,
  )) throw new TypeError("Narrator shadow archive completion is invalid");
  return completion;
}

export function isNarratorShadowArchiveCompletionForPlanV1(
  value: unknown,
  plan: NarratorShadowBenchmarkPlanV1,
  profile: NarratorNamedPhoneProfileV1,
  collectorSessionId: string,
): value is NarratorShadowArchiveCompletionV1 {
  if (narratorEnvelopeByteLength(value) > narratorShadowArchiveMaximumBytes
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "binding", "collectorSessionId", "observer",
      "postDisposalMemoryDurationMilliseconds", "postDisposalMemorySamples", "observedCachedArtifacts",
      "suppressionTransitions", "observations", "modelAdmitted", "displayAuthorized", "contentHash",
    ])
    || value.schemaVersion !== 1
    || !bindingMatches(value.binding, plan, profile)
    || value.collectorSessionId !== collectorSessionId
    || !(value.observer === null || observerIsStructurallyValid(value.observer))
    || !(value.postDisposalMemoryDurationMilliseconds === null
      || positiveInteger(value.postDisposalMemoryDurationMilliseconds))
    || !(value.postDisposalMemorySamples === null
      || (Array.isArray(value.postDisposalMemorySamples) && value.postDisposalMemorySamples.length <= 1_000))
    || !(value.observedCachedArtifacts === null
      || isNarratorVerifiedArtifactsV1(value.observedCachedArtifacts))
    || !(value.suppressionTransitions === null
      || (Array.isArray(value.suppressionTransitions) && value.suppressionTransitions.length <= 2))
    || !observationsHaveExactChannels(value.observations, narratorShadowCompletionObservationChannels)
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false) return false;
  return hashedContentIsValid(value);
}

function archiveContent(
  archive: Omit<NarratorShadowPhaseArchiveV1, "contentHash">,
): NarratorShadowPhaseArchiveV1 {
  return deepFreeze({ ...archive, contentHash: canonicalHash(archive) });
}

export function createNarratorShadowPhaseArchiveV1(
  plan: NarratorShadowBenchmarkPlanV1,
  profile: NarratorNamedPhoneProfileV1,
  evidence: NarratorB2EvidenceV1,
  collectorSessionId: string,
): NarratorShadowPhaseArchiveV1 {
  if (!isNarratorShadowBenchmarkPlanForEvidenceV1(plan, evidence, profile)
    || !isNarratorBoundedText(collectorSessionId, 200)) {
    throw new TypeError("Narrator shadow archive identity is invalid");
  }
  return archiveContent({
    schemaVersion: 1,
    plan,
    profile,
    binding: narratorShadowArchiveBindingV1(plan, profile),
    collectorSessionId,
    entries: Object.freeze([]),
    revision: 0,
    terminalStatus: "open",
    completion: null,
    modelAdmitted: false,
    displayAuthorized: false,
  });
}

function entriesFollowAppendRules(entries: readonly NarratorShadowArchiveEntryV1[]): boolean {
  let expectedSequence = 0;
  const attempts = new Set<string>();
  for (let ordinal = 0; ordinal < entries.length; ordinal += 1) {
    const entry = entries[ordinal]!;
    if (entry.ordinal !== ordinal
      || entry.phaseSequence !== expectedSequence
      || attempts.has(entry.attemptId)
      || entry.previousEntryHash !== (ordinal === 0 ? null : entries[ordinal - 1]!.contentHash)) return false;
    attempts.add(entry.attemptId);
    if (entry.outcome === "finished") expectedSequence += 1;
    if (["aborted", "device-lost"].includes(entry.outcome) && ordinal !== entries.length - 1) return false;
    if (expectedSequence > 8) return false;
  }
  return true;
}

export function isNarratorShadowPhaseArchiveForEvidenceV1(
  value: unknown,
  evidence: NarratorB2EvidenceV1,
  profile: NarratorNamedPhoneProfileV1,
): value is NarratorShadowPhaseArchiveV1 {
  return isNarratorShadowPhaseArchiveStructureV1(value, profile)
    && isNarratorShadowBenchmarkPlanForEvidenceV1(value.plan, evidence, profile);
}

function isNarratorShadowPhaseArchiveStructureV1(
  value: unknown,
  profile: NarratorNamedPhoneProfileV1,
): value is NarratorShadowPhaseArchiveV1 {
  if (narratorEnvelopeByteLength(value) > narratorShadowArchiveMaximumBytes
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "plan", "profile", "binding", "collectorSessionId", "entries", "revision",
      "terminalStatus", "completion", "modelAdmitted", "displayAuthorized", "contentHash",
    ])
    || value.schemaVersion !== 1
    || !isNarratorNamedPhoneProfileV1(value.profile)
    || canonicalStringify(value.profile) !== canonicalStringify(profile)
    || !isNarratorRecord(value.plan)
    || !hashedContentIsValid(value.plan)
    || !bindingMatches(
      value.binding,
      value.plan as unknown as NarratorShadowBenchmarkPlanV1,
      profile,
    )
    || !isNarratorBoundedText(value.collectorSessionId, 200)
    || !Array.isArray(value.entries)
    || value.entries.length > narratorShadowArchiveMaximumEntries
    || !value.entries.every((entry) => isNarratorShadowArchiveEntryForPlanV1(
      entry, value.plan as unknown as NarratorShadowBenchmarkPlanV1, profile, String(value.collectorSessionId),
    ))
    || !entriesFollowAppendRules(value.entries as NarratorShadowArchiveEntryV1[])
    || value.revision !== value.entries.length
    || !["open", "sealed", "aborted", "device-lost"].includes(String(value.terminalStatus))
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false) return false;
  const entries = value.entries as NarratorShadowArchiveEntryV1[];
  const lastOutcome = entries.at(-1)?.outcome;
  if ((value.terminalStatus === "open" && value.completion !== null)
    || (value.terminalStatus === "sealed" && !isNarratorShadowArchiveCompletionForPlanV1(
      value.completion,
      value.plan as unknown as NarratorShadowBenchmarkPlanV1,
      profile,
      String(value.collectorSessionId),
    ))
    || (value.terminalStatus === "aborted" && (value.completion !== null || lastOutcome !== "aborted"))
    || (value.terminalStatus === "device-lost" && (value.completion !== null || lastOutcome !== "device-lost"))) {
    return false;
  }
  return hashedContentIsValid(value);
}

export function appendNarratorShadowArchiveEntryV1(
  archive: NarratorShadowPhaseArchiveV1,
  entry: NarratorShadowArchiveEntryV1,
  profile: NarratorNamedPhoneProfileV1,
): NarratorShadowPhaseArchiveV1 {
  if (!isNarratorShadowPhaseArchiveStructureV1(archive, profile)) {
    throw new TypeError("Narrator shadow archive is invalid");
  }
  const existing = archive.entries[entry.ordinal];
  if (existing !== undefined) {
    if (canonicalStringify(existing) === canonicalStringify(entry)) return archive;
    throw new TypeError("Narrator shadow archive entry conflicts with retained history");
  }
  if (archive.terminalStatus !== "open") throw new TypeError("Narrator shadow archive is terminal");
  if (entry.ordinal !== archive.entries.length) throw new TypeError("Narrator shadow archive entry has a gap");
  if (!isNarratorShadowArchiveEntryForPlanV1(
    entry, archive.plan, profile, archive.collectorSessionId,
  )) throw new TypeError("Narrator shadow archive entry identity is invalid");
  const entries = Object.freeze([...archive.entries, entry]);
  if (!entriesFollowAppendRules(entries)) throw new TypeError("Narrator shadow archive append order is invalid");
  const terminalStatus = entry.outcome === "aborted"
    ? "aborted"
    : entry.outcome === "device-lost"
      ? "device-lost"
      : "open";
  const next = archiveContent({
    schemaVersion: 1,
    plan: archive.plan,
    profile: archive.profile,
    binding: archive.binding,
    collectorSessionId: archive.collectorSessionId,
    entries,
    revision: entries.length,
    terminalStatus,
    completion: null,
    modelAdmitted: false,
    displayAuthorized: false,
  });
  if (!isNarratorShadowPhaseArchiveStructureV1(next, profile)) {
    throw new TypeError("Narrator shadow archive append produced invalid state");
  }
  return next;
}

export function sealNarratorShadowPhaseArchiveV1(
  archive: NarratorShadowPhaseArchiveV1,
  completion: NarratorShadowArchiveCompletionV1,
  profile: NarratorNamedPhoneProfileV1,
): NarratorShadowPhaseArchiveV1 {
  if (!isNarratorShadowPhaseArchiveStructureV1(archive, profile)
    || archive.terminalStatus !== "open"
    || !isNarratorShadowArchiveCompletionForPlanV1(
      completion, archive.plan, profile, archive.collectorSessionId,
    )) throw new TypeError("Narrator shadow archive cannot be sealed");
  const sealed = archiveContent({
    schemaVersion: 1,
    plan: archive.plan,
    profile: archive.profile,
    binding: archive.binding,
    collectorSessionId: archive.collectorSessionId,
    entries: archive.entries,
    revision: archive.revision,
    terminalStatus: "sealed",
    completion,
    modelAdmitted: false,
    displayAuthorized: false,
  });
  if (!isNarratorShadowPhaseArchiveStructureV1(sealed, profile)) {
    throw new TypeError("Narrator shadow archive seal produced invalid state");
  }
  return sealed;
}
