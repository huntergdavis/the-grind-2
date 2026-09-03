import { canonicalHash } from "../core/canonical";
import {
  isNarratorShadowObservationV1,
  isNarratorShadowPhaseArchiveForEvidenceV1,
  narratorShadowCompletionObservationChannels,
  narratorShadowPhaseObservationChannels,
  type NarratorShadowArchiveEntryV1,
  type NarratorShadowObservationV1,
  type NarratorShadowPhaseArchiveV1,
  type NarratorShadowPhaseObservationChannel,
} from "./shadow-collector-archive";
import {
  isNarratorShadowCollectorRequestForPlanV1,
  isNarratorShadowCollectorResponseForPlanV1,
  type NarratorShadowCollectorRequestV1,
  type NarratorShadowCollectorResponseV1,
} from "./shadow-collector-protocol";
import {
  createNarratorNamedPhoneShadowReceiptV1,
  isNarratorNamedPhoneShadowReceiptForEvidenceV1,
  isNarratorShadowOpportunityV1,
  isNarratorShadowPhaseV1,
  narratorShadowComparisonPhaseMilliseconds,
  narratorShadowMemoryCadenceMilliseconds,
  narratorShadowSettlementObservationMilliseconds,
  narratorShadowSuppressionPhaseMilliseconds,
  narratorShadowThermalCadenceMilliseconds,
  narratorShadowWorkdayMilliseconds,
  type NarratorB2EvidenceV1,
  type NarratorNamedPhoneProfileV1,
  type NarratorNamedPhoneShadowReceiptV1,
  type NarratorShadowOpportunityV1,
  type NarratorShadowPhaseKind,
  type NarratorShadowPhaseV1,
} from "./shadow-benchmark";
import { isNarratorRecord, narratorHasExactKeys } from "./protocol";

export interface NarratorShadowArchiveFinalizationV1 {
  readonly schemaVersion: 1;
  readonly planHash: string;
  readonly archiveHash: string;
  readonly status: "complete" | "incomplete";
  readonly reasons: readonly string[];
  readonly receipt: NarratorNamedPhoneShadowReceiptV1 | null;
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

interface WorkerExchangeV1 {
  readonly request: NarratorShadowCollectorRequestV1;
  readonly response: NarratorShadowCollectorResponseV1;
}

const expectedKinds: readonly NarratorShadowPhaseKind[] = Object.freeze([
  "comparison-ai-off",
  "comparison-shadow",
  "comparison-shadow",
  "comparison-ai-off",
  "stress-shadow",
  "workday-shadow",
  "eco-suppression",
  "hidden-suppression",
]);

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function finalization(
  content: Omit<NarratorShadowArchiveFinalizationV1, "contentHash">,
): NarratorShadowArchiveFinalizationV1 {
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

function phaseDuration(sequence: number, kind: NarratorShadowPhaseKind): number | null {
  if (sequence <= 3) return narratorShadowComparisonPhaseMilliseconds;
  if (kind === "workday-shadow") return narratorShadowWorkdayMilliseconds;
  if (kind === "eco-suppression" || kind === "hidden-suppression") {
    return narratorShadowSuppressionPhaseMilliseconds;
  }
  return null;
}

function isWorkerExchange(
  value: unknown,
  archive: NarratorShadowPhaseArchiveV1,
): value is WorkerExchangeV1 {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, ["request", "response"])
    || !isNarratorShadowCollectorRequestForPlanV1(value.request, archive.plan)) return false;
  const request = value.request as NarratorShadowCollectorRequestV1;
  return (request.kind === "run-case" || request.kind === "cancel")
    && request.workerEpoch === archive.collectorSessionId
    && isNarratorShadowCollectorResponseForPlanV1(value.response, archive.plan, request);
}

function phaseObservationPayload(
  channel: NarratorShadowPhaseObservationChannel,
  phase: NarratorShadowPhaseV1,
  opportunities: readonly NarratorShadowOpportunityV1[],
  exchanges: readonly WorkerExchangeV1[],
): unknown {
  if (channel === "frames") return phase.frameWindows;
  if (channel === "long-tasks") return { coverage: phase.longTaskCoverage, tasks: phase.longTasks };
  if (channel === "memory") {
    return {
      samples: phase.memorySamples,
      droppedEntryCount: phase.memoryDroppedEntryCount,
      workerLoadIntervals: phase.workerLoadIntervals,
    };
  }
  if (channel === "thermal") {
    return { samples: phase.thermalSamples, droppedEntryCount: phase.thermalDroppedEntryCount };
  }
  if (channel === "battery") {
    return {
      samples: phase.batterySamples,
      droppedEntryCount: phase.batteryDroppedEntryCount,
      energyUsedMilliwattHours: phase.energyUsedMilliwattHours,
    };
  }
  if (channel === "network") return { successfulNetworkRequests: phase.successfulNetworkRequests };
  if (channel === "canonical") {
    return { checkpoints: phase.canonicalCheckpointHashes, eventSequenceHash: phase.eventSequenceHash };
  }
  if (channel === "presentation") {
    return {
      cutawayStartTicks: phase.cutawayStartTicks,
      projectionHash: phase.projectionHash,
      layoutShiftMicroUnits: phase.layoutShiftMicroUnits,
    };
  }
  if (channel === "worker") {
    return {
      workerCreations: phase.workerCreations,
      modelRequests: phase.modelRequests,
      exchanges,
    };
  }
  return opportunities;
}

function phaseObservationCount(
  channel: NarratorShadowPhaseObservationChannel,
  phase: NarratorShadowPhaseV1,
  opportunities: readonly NarratorShadowOpportunityV1[],
  exchanges: readonly WorkerExchangeV1[],
): number {
  if (channel === "frames") return phase.frameWindows.length;
  if (channel === "long-tasks") return phase.longTasks.length;
  if (channel === "memory") return phase.memorySamples.length;
  if (channel === "thermal") return phase.thermalSamples.length;
  if (channel === "battery") return phase.batterySamples.length;
  if (channel === "network") return phase.successfulNetworkRequests;
  if (channel === "canonical") return phase.canonicalCheckpointHashes.length;
  if (channel === "presentation") return phase.cutawayStartTicks.length;
  if (channel === "worker") return exchanges.length;
  return opportunities.length;
}

function expectedMethod(channel: NarratorShadowPhaseObservationChannel, phase: NarratorShadowPhaseV1): string {
  if (channel === "frames") return phase.visibility === "hidden" ? "visibility-state" : "request-animation-frame";
  if (channel === "long-tasks") return "performance-observer";
  if (channel === "network") return "performance-resource-timing";
  if (channel === "canonical") return "game-checkpoint-trace";
  if (channel === "presentation") return "presentation-trace";
  if (channel === "worker") return "collector-worker-protocol-v1";
  if (channel === "opportunities") return "frozen-corpus-dispatch";
  return "";
}

function observationOriginAllowed(
  channel: NarratorShadowPhaseObservationChannel,
  observation: Extract<NarratorShadowObservationV1, { availability: "present" }>,
  archive: NarratorShadowPhaseArchiveV1,
): boolean {
  if (observation.origin === "synthetic") return false;
  if (["thermal", "battery"].includes(channel)) return observation.origin === "coordinator-imported";
  if (channel === "memory") {
    const method = archive.completion?.observer?.memoryMethod;
    if (method === "measure-user-agent-specific-memory") return observation.origin === "browser-observed";
    if (method === "external-task-manager") return observation.origin === "coordinator-imported";
    return false;
  }
  return observation.origin === "browser-observed";
}

function importedIdentityMatches(
  observation: Extract<NarratorShadowObservationV1, { availability: "present" }>,
  archive: NarratorShadowPhaseArchiveV1,
  channel: "memory" | "thermal" | "battery" | "settlement",
): boolean {
  if (observation.origin !== "coordinator-imported") return true;
  const completion = archive.completion;
  const observer = completion?.observer;
  if (observer === null || observer === undefined) return false;
  const instrumentId = channel === "memory" || channel === "settlement"
    ? observer.memoryInstrumentId
    : channel === "thermal"
      ? observer.thermalInstrumentId
      : observer.batteryInstrumentId;
  const units = channel === "memory" || channel === "settlement"
    ? "bytes"
    : channel === "thermal"
      ? "thermal-state-and-centicelsius"
      : "permille-and-milliwatt-hours";
  const maximumCaptureIntervalMilliseconds = channel === "thermal" || channel === "battery"
    ? narratorShadowThermalCadenceMilliseconds
    : narratorShadowMemoryCadenceMilliseconds;
  return observation.instrumentId === instrumentId
    && observation.operatorId === observer.externalOperatorId
    && observation.units === units
    && observation.captureIntervalMilliseconds <= maximumCaptureIntervalMilliseconds;
}

function phaseDropCount(channel: NarratorShadowPhaseObservationChannel, phase: NarratorShadowPhaseV1): number {
  if (channel === "frames") {
    return phase.frameWindows.reduce((total, window) => total + window.droppedEntryCount, 0);
  }
  if (channel === "long-tasks") return phase.longTaskCoverage.droppedEntryCount;
  if (channel === "memory") return phase.memoryDroppedEntryCount;
  if (channel === "thermal") return phase.thermalDroppedEntryCount;
  if (channel === "battery") return phase.batteryDroppedEntryCount;
  return 0;
}

function exchangeMatchesOpportunity(
  exchange: WorkerExchangeV1,
  opportunity: NarratorShadowOpportunityV1,
  exchanges: readonly WorkerExchangeV1[],
  deadlineMilliseconds: number,
): boolean {
  if (exchange.request.kind !== "run-case"
    || exchange.request.payload.evaluationCaseOrdinal !== opportunity.evaluationCaseOrdinal) return false;
  if (opportunity.resultStatus === "ok") {
    return exchange.response.kind === "case-result"
      && exchange.response.payload.evaluationCaseOrdinal === opportunity.evaluationCaseOrdinal
      && exchange.response.payload.inputTokens === opportunity.inputTokens
      && exchange.response.payload.outputTokens === opportunity.outputTokens
      && exchange.response.payload.outputText === opportunity.outputText;
  }
  if (exchange.response.kind !== "error") return false;
  const expectedCode = opportunity.resultStatus === "device-lost"
    ? "device-lost"
    : opportunity.resultStatus === "malformed"
      ? "invalid-output"
      : "cancelled";
  if (exchange.response.payload.code !== expectedCode) return false;
  const matchingCancels = exchanges.filter((candidate) => candidate.request.kind === "cancel"
    && candidate.request.payload.targetRequestId === exchange.request.requestId
    && candidate.response.kind === "status"
    && candidate.response.payload.code === "cancelled");
  if (opportunity.resultStatus !== "timeout" && opportunity.resultStatus !== "cancelled") {
    return matchingCancels.length === 0;
  }
  return (opportunity.resultStatus !== "timeout"
      || opportunity.resultAtMilliseconds - opportunity.dispatchAtMilliseconds >= deadlineMilliseconds)
    && matchingCancels.length === 1
    && exchanges.indexOf(matchingCancels[0]!) > exchanges.indexOf(exchange);
}

function phaseReasons(
  archive: NarratorShadowPhaseArchiveV1,
  entry: NarratorShadowArchiveEntryV1,
): { readonly phase: NarratorShadowPhaseV1 | null; readonly opportunities: readonly NarratorShadowOpportunityV1[];
  readonly reasons: readonly string[] } {
  const sequence = entry.phaseSequence;
  const reasons: string[] = [];
  if (entry.phase === null || !isNarratorShadowPhaseV1(entry.phase)) {
    return { phase: null, opportunities: [], reasons: [`phase:${sequence}:payload-invalid`] };
  }
  const phase = entry.phase;
  const expectedKind = expectedKinds[sequence];
  const duration = expectedKind === undefined ? null : phaseDuration(sequence, expectedKind);
  if (phase.sequence !== sequence || phase.kind !== expectedKind
    || (duration !== null && phase.durationMilliseconds !== duration)) {
    reasons.push(`phase:${sequence}:shape-mismatch`);
  }
  if (!Array.isArray(entry.opportunities)
    || !entry.opportunities.every((value) => isNarratorShadowOpportunityV1(value, archive.plan, [phase]))) {
    reasons.push(`phase:${sequence}:opportunities-invalid`);
  }
  const opportunities = reasons.includes(`phase:${sequence}:opportunities-invalid`)
    ? []
    : entry.opportunities as NarratorShadowOpportunityV1[];
  if (!Array.isArray(entry.workerExchanges)
    || !entry.workerExchanges.every((value) => isWorkerExchange(value, archive))) {
    reasons.push(`phase:${sequence}:worker-exchanges-invalid`);
  }
  const exchanges = reasons.includes(`phase:${sequence}:worker-exchanges-invalid`)
    ? []
    : entry.workerExchanges as WorkerExchangeV1[];
  const runExchanges = exchanges.filter((exchange) => exchange.request.kind === "run-case");
  const cancelExchanges = exchanges.filter((exchange) => exchange.request.kind === "cancel");
  const cancellationRequestIds = new Set(runExchanges.flatMap((exchange, index) =>
    opportunities[index]?.resultStatus === "timeout" || opportunities[index]?.resultStatus === "cancelled"
      ? [exchange.request.requestId]
      : []));
  if (new Set(exchanges.map((exchange) => exchange.request.requestId)).size !== exchanges.length
    || runExchanges.length !== opportunities.length
    || runExchanges.some((exchange, index) => !exchangeMatchesOpportunity(
      exchange,
      opportunities[index]!,
      exchanges,
      archive.plan.policy.responseDeadlineMilliseconds,
    ))
    || cancelExchanges.some((exchange) => exchange.request.kind !== "cancel"
      || !cancellationRequestIds.has(exchange.request.payload.targetRequestId))) {
    reasons.push(`phase:${sequence}:worker-exchanges-mismatch`);
  }
  if (phase.modelRequests !== opportunities.length) reasons.push(`phase:${sequence}:request-count-mismatch`);

  for (const channel of narratorShadowPhaseObservationChannels) {
    const observation = entry.observations.find((value) => value.channel === channel);
    if (observation === undefined || !isNarratorShadowObservationV1(observation)) {
      reasons.push(`phase:${sequence}:${channel}:invalid`);
      continue;
    }
    if (observation.availability !== "present") {
      reasons.push(`phase:${sequence}:${channel}:${observation.availability}`);
      continue;
    }
    if (!observationOriginAllowed(channel, observation, archive)) {
      reasons.push(`phase:${sequence}:${channel}:${observation.origin}`);
    }
    const method = ["memory", "thermal", "battery"].includes(channel)
      ? archive.completion?.observer?.[`${channel}Method` as "memoryMethod" | "thermalMethod" | "batteryMethod"] ?? ""
      : expectedMethod(channel, phase);
    if (observation.method !== method) reasons.push(`phase:${sequence}:${channel}:method-mismatch`);
    if (observation.collectorSessionId !== archive.collectorSessionId
      || observation.startOffsetMilliseconds !== 0
      || observation.endOffsetMilliseconds !== phase.durationMilliseconds) {
      reasons.push(`phase:${sequence}:${channel}:coverage-mismatch`);
    }
    if (observation.payloadHash !== canonicalHash(phaseObservationPayload(
      channel, phase, opportunities, exchanges,
    ))) reasons.push(`phase:${sequence}:${channel}:hash-mismatch`);
    if (observation.recordCount !== phaseObservationCount(channel, phase, opportunities, exchanges)) {
      reasons.push(`phase:${sequence}:${channel}:count-mismatch`);
    }
    if (["memory", "thermal", "battery"].includes(channel)
      && !importedIdentityMatches(
        observation, archive, channel as "memory" | "thermal" | "battery",
      )) reasons.push(`phase:${sequence}:${channel}:instrument-mismatch`);
    if (phaseDropCount(channel, phase) > 0) reasons.push(`phase:${sequence}:${channel}:dropped`);
  }
  return { phase, opportunities, reasons };
}

function completionReasons(archive: NarratorShadowPhaseArchiveV1): readonly string[] {
  const completion = archive.completion;
  if (completion === null) return ["completion:missing"];
  const reasons: string[] = [];
  if (completion.observer === null) reasons.push("completion:observer:missing");
  if (completion.observer !== null) {
    const methods = [
      ["frames", completion.observer.frameMethod],
      ["long-tasks", completion.observer.longTaskMethod],
      ["memory", completion.observer.memoryMethod],
      ["thermal", completion.observer.thermalMethod],
      ["battery", completion.observer.batteryMethod],
    ] as const;
    for (const [channel, method] of methods) {
      if (method === "unsupported") reasons.push(`completion:observer:${channel}:unsupported`);
    }
  }
  if (completion.postDisposalMemoryDurationMilliseconds === null
    || completion.postDisposalMemorySamples === null) reasons.push("completion:settlement:payload-missing");
  if (completion.observedCachedArtifacts === null) reasons.push("completion:artifacts:payload-missing");
  if (completion.suppressionTransitions === null) reasons.push("completion:suppression:payload-missing");
  const payloads = {
    artifacts: completion.observedCachedArtifacts,
    suppression: completion.suppressionTransitions,
    settlement: completion.postDisposalMemoryDurationMilliseconds === null
      ? null
      : {
          durationMilliseconds: completion.postDisposalMemoryDurationMilliseconds,
          samples: completion.postDisposalMemorySamples,
        },
  } as const;
  for (const channel of narratorShadowCompletionObservationChannels) {
    const observation = completion.observations.find((value) => value.channel === channel);
    if (observation === undefined || !isNarratorShadowObservationV1(observation)) {
      reasons.push(`completion:${channel}:invalid`);
      continue;
    }
    if (observation.availability !== "present") {
      reasons.push(`completion:${channel}:${observation.availability}`);
      continue;
    }
    if (observation.origin === "synthetic") reasons.push(`completion:${channel}:synthetic`);
    const expectedOrigin = channel === "settlement"
      && completion.observer?.memoryMethod === "external-task-manager"
      ? "coordinator-imported"
      : "browser-observed";
    if (observation.origin !== expectedOrigin) reasons.push(`completion:${channel}:origin-mismatch`);
    const expectedMethod = channel === "artifacts"
      ? "digest-verified-cache"
      : channel === "suppression"
        ? "visibility-lifecycle"
        : completion.observer?.memoryMethod ?? "";
    if (observation.method !== expectedMethod) reasons.push(`completion:${channel}:method-mismatch`);
    if (observation.collectorSessionId !== archive.collectorSessionId) {
      reasons.push(`completion:${channel}:session-mismatch`);
    }
    const payload = payloads[channel];
    if (payload === null || observation.payloadHash !== canonicalHash(payload)) {
      reasons.push(`completion:${channel}:hash-mismatch`);
    }
    const count = Array.isArray(payload)
      ? payload.length
      : channel === "settlement" && completion.postDisposalMemorySamples !== null
        ? completion.postDisposalMemorySamples.length
        : 0;
    if (observation.recordCount !== count) reasons.push(`completion:${channel}:count-mismatch`);
    if (channel === "settlement") {
      if (completion.postDisposalMemoryDurationMilliseconds !== narratorShadowSettlementObservationMilliseconds
        || observation.startOffsetMilliseconds !== 0
        || observation.endOffsetMilliseconds !== narratorShadowSettlementObservationMilliseconds) {
        reasons.push("completion:settlement:coverage-mismatch");
      }
      if (!importedIdentityMatches(observation, archive, "settlement")) {
        reasons.push("completion:settlement:instrument-mismatch");
      }
    } else if (observation.startOffsetMilliseconds !== 0
      || observation.endOffsetMilliseconds !== (channel === "suppression"
        ? narratorShadowSuppressionPhaseMilliseconds
        : 0)) {
      reasons.push(`completion:${channel}:coverage-mismatch`);
    }
  }
  return reasons;
}

export function finalizeNarratorShadowPhaseArchiveV1(
  archiveValue: unknown,
  evidence: NarratorB2EvidenceV1,
  profile: NarratorNamedPhoneProfileV1,
): NarratorShadowArchiveFinalizationV1 {
  if (!isNarratorShadowPhaseArchiveForEvidenceV1(archiveValue, evidence, profile)) {
    return finalization({
      schemaVersion: 1,
      planHash: "invalid",
      archiveHash: "invalid",
      status: "incomplete",
      reasons: Object.freeze(["archive:invalid"]),
      receipt: null,
      modelAdmitted: false,
      displayAuthorized: false,
    });
  }
  const archive = archiveValue;
  const reasons: string[] = [];
  if (archive.terminalStatus === "open") reasons.push("archive:open");
  if (archive.terminalStatus === "aborted") reasons.push("archive:aborted");
  if (archive.terminalStatus === "device-lost") reasons.push("archive:device-lost");
  if (archive.terminalStatus !== "sealed") reasons.push("archive:not-sealed");
  const phases: NarratorShadowPhaseV1[] = [];
  const opportunities: NarratorShadowOpportunityV1[] = [];
  for (const entry of archive.entries) {
    if (entry.outcome === "interrupted") reasons.push(`phase:${entry.phaseSequence}:interrupted`);
  }
  for (let sequence = 0; sequence < expectedKinds.length; sequence += 1) {
    const entries = archive.entries.filter((entry) => entry.phaseSequence === sequence && entry.outcome === "finished");
    if (entries.length !== 1) {
      reasons.push(entries.length === 0 ? `phase:${sequence}:missing` : `phase:${sequence}:duplicate-finished`);
      continue;
    }
    const result = phaseReasons(archive, entries[0]!);
    reasons.push(...result.reasons);
    if (result.phase !== null) phases.push(result.phase);
    opportunities.push(...result.opportunities);
  }
  reasons.push(...completionReasons(archive));
  const allObservations = [
    ...archive.entries.flatMap((entry) => entry.observations),
    ...(archive.completion?.observations ?? []),
  ].filter((observation): observation is Extract<NarratorShadowObservationV1, { availability: "present" }> =>
    observation.availability === "present");
  const browserClockDomains = new Set(allObservations
    .filter((observation) => observation.origin === "browser-observed")
    .map((observation) => observation.clockDomain));
  if (browserClockDomains.size > 1) reasons.push("observations:browser-clock-domain-mismatch");
  const importedTimebases = new Set(allObservations
    .filter((observation): observation is Extract<NarratorShadowObservationV1,
      { availability: "present"; origin: "coordinator-imported" }> =>
      observation.origin === "coordinator-imported")
    .map((observation) => `${observation.clockDomain}\0${observation.timebaseMapping}`));
  if (importedTimebases.size > 1) reasons.push("observations:imported-timebase-mismatch");
  if (opportunities.some((opportunity, ordinal) => opportunity.ordinal !== ordinal)) {
    reasons.push("opportunities:ordinal-gap");
  }
  if (new Set(opportunities.map((opportunity) => opportunity.contentHash)).size !== opportunities.length) {
    reasons.push("opportunities:duplicate");
  }
  const sortedReasons = Object.freeze([...new Set(reasons)].sort());
  const completion = archive.completion;
  if (sortedReasons.length > 0 || completion === null || completion.observer === null
    || completion.postDisposalMemoryDurationMilliseconds === null
    || completion.postDisposalMemorySamples === null
    || completion.observedCachedArtifacts === null
    || completion.suppressionTransitions === null
    || phases.length !== expectedKinds.length) {
    return finalization({
      schemaVersion: 1,
      planHash: archive.plan.contentHash,
      archiveHash: archive.contentHash,
      status: "incomplete",
      reasons: sortedReasons,
      receipt: null,
      modelAdmitted: false,
      displayAuthorized: false,
    });
  }
  const receipt = createNarratorNamedPhoneShadowReceiptV1({
    plan: archive.plan,
    profile: archive.profile,
    observer: completion.observer,
    phases,
    opportunities,
    postDisposalMemoryDurationMilliseconds: completion.postDisposalMemoryDurationMilliseconds,
    postDisposalMemorySamples: completion.postDisposalMemorySamples as NarratorNamedPhoneShadowReceiptV1["postDisposalMemorySamples"],
    observedCachedArtifacts: completion.observedCachedArtifacts as NarratorNamedPhoneShadowReceiptV1["observedCachedArtifacts"],
    suppressionTransitions: completion.suppressionTransitions as NarratorNamedPhoneShadowReceiptV1["suppressionTransitions"],
    terminalStatus: "complete",
  });
  if (!isNarratorNamedPhoneShadowReceiptForEvidenceV1(receipt, evidence)) {
    return finalization({
      schemaVersion: 1,
      planHash: archive.plan.contentHash,
      archiveHash: archive.contentHash,
      status: "incomplete",
      reasons: Object.freeze(["receipt:invalid"]),
      receipt: null,
      modelAdmitted: false,
      displayAuthorized: false,
    });
  }
  return finalization({
    schemaVersion: 1,
    planHash: archive.plan.contentHash,
    archiveHash: archive.contentHash,
    status: "complete",
    reasons: Object.freeze([]),
    receipt,
    modelAdmitted: false,
    displayAuthorized: false,
  });
}
