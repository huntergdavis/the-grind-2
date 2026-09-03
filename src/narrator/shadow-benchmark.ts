import { canonicalHash, canonicalStringify } from "../core/canonical";
import {
  isNarratorBenchmarkReportForEvidenceV1,
  isNarratorRatingConsumptionReceiptForEvidenceV1,
  type NarratorBenchmarkReportV1,
  type NarratorBlindKeyV1,
  type NarratorBlindSheetV1,
  type NarratorRatingBundleV1,
  type NarratorRatingConsumptionReceiptV1,
  type NarratorRatingReplayRegistryV1,
} from "./blind-evaluation";
import {
  narratorArtifactManifestHash,
  narratorCandidateManifestHash,
  isNarratorVerifiedArtifactsV1,
  narratorArtifactsMatchCandidate,
  type NarratorRunReceiptV1,
  type NarratorVerifiedArtifactV1,
} from "./evaluation-receipts";
import {
  isNarratorModelCandidate,
  narratorCandidateStoredBytes,
  type NarratorModelCandidate,
} from "./model-candidate";
import {
  isNarratorCandidateProvenanceDossier,
  isNarratorCandidateStagingReportForEvidenceV1,
  type NarratorCandidateProvenanceDossier,
  type NarratorCandidateStagingReportV1,
} from "./model-provenance";
import { deterministicNarratorFallback, isSafeAmbientNarration } from "./output-policy";
import {
  isNarratorBoundedText,
  isNarratorJobV1,
  isNarratorPromptV1,
  isNarratorRecord,
  narratorHasExactKeys,
  narratorMaximumInputTokens,
  narratorMaximumOutputTokens,
  normalizeNarratorOutput,
  type NarratorPromptV1,
} from "./protocol";
import {
  narratorIncrementalMemoryBudgetBytes,
  narratorStoredWeightBudgetBytes,
} from "./capability";
import { narratorEvaluationCasesV1 } from "./evaluation";

export const narratorShadowComparisonPhaseMilliseconds = 10 * 60_000;
export const narratorShadowWorkdayMilliseconds = 60 * 60_000;
export const narratorShadowSuppressionPhaseMilliseconds = 10 * 60_000;
export const narratorShadowStressMinimumAttempts = 30;
export const narratorShadowLineDeadlineMilliseconds = 8_000;
export const narratorShadowCombinedMemoryBudgetBytes = 900 * 1024 * 1024;
export const narratorShadowMaximumWorkdayTokensPerHour = 480;
export const narratorShadowSettlementObservationMilliseconds = 10 * 60_000;
export const narratorShadowSuppressionActionDeadlineMilliseconds = 250;
export const narratorShadowMaximumAddedEnergyMilliwattHours = 25;

const maximumTraceSamples = 100_000;
const maximumOpportunities = 256;
const narratorShadowFrameWindowMilliseconds = 5_000;
const narratorShadowFrameWindowCadenceMilliseconds = 60_000;
export const narratorShadowMemoryCadenceMilliseconds = 5 * 60_000;
const narratorShadowPeakMemoryCadenceMilliseconds = 100;
export const narratorShadowThermalCadenceMilliseconds = 60_000;
const narratorShadowTerminationDeadlineMilliseconds = 1_000;
const hashPattern = /^[0-9a-f]{16}$/u;
const revisionPattern = /^[0-9a-f]{40}$/u;
const semverPattern = /^\d+\.\d+\.\d+$/u;

export type NarratorShadowPhaseKind =
  | "comparison-ai-off"
  | "comparison-shadow"
  | "stress-shadow"
  | "workday-shadow"
  | "eco-suppression"
  | "hidden-suppression";

export type NarratorShadowThermalState = "nominal" | "fair" | "serious" | "critical";
export type NarratorShadowPresentationOwner = "ambient" | "cutaway" | "other";
export type NarratorShadowResultStatus = "ok" | "timeout" | "device-lost" | "malformed" | "cancelled";

export interface NarratorB2EvidenceV1 {
  readonly candidate: NarratorModelCandidate;
  readonly provenanceDossier: NarratorCandidateProvenanceDossier;
  readonly stagingReport: NarratorCandidateStagingReportV1;
  readonly runReceipt: NarratorRunReceiptV1;
  readonly sheet: NarratorBlindSheetV1;
  readonly key: NarratorBlindKeyV1;
  readonly ratings: NarratorRatingBundleV1;
  readonly priorReplayRegistry: NarratorRatingReplayRegistryV1;
  readonly report: NarratorBenchmarkReportV1;
  readonly consumption: NarratorRatingConsumptionReceiptV1;
  readonly currentReplayRegistry: NarratorRatingReplayRegistryV1;
}

export interface NarratorNamedPhoneProfileV1 {
  readonly schemaVersion: 1;
  readonly phoneLabel: string;
  readonly sku: string;
  readonly systemOnChip: string;
  readonly ramBytes: number;
  readonly osName: string;
  readonly osBuild: string;
  readonly browserName: string;
  readonly browserBuild: string;
  readonly refreshRateMilliHertz: number;
  readonly viewportCssWidth: number;
  readonly viewportCssHeight: number;
  readonly devicePixelRatioMilli: number;
  readonly orientation: "portrait" | "landscape";
  readonly motionPreference: "normal" | "reduced";
  readonly brightnessPercent: number;
  readonly powerMode: "balanced" | "battery-saver";
  readonly charging: boolean;
  readonly radioMode: "offline" | "wifi" | "cellular";
  readonly ambientTemperatureCentiCelsius: number | null;
  readonly caseState: "none" | "installed";
  readonly enteredBy: "coordinator";
  readonly contentHash: string;
}

export interface NarratorShadowBenchmarkPlanV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly app: {
    readonly version: string;
    readonly buildRevision: string;
  };
  readonly bindings: {
    readonly phoneProfileHash: string;
    readonly candidateId: string;
    readonly candidateManifestHash: string;
    readonly artifactManifestHash: string;
    readonly provenanceDossierHash: string;
    readonly candidateStagingReportHash: string;
    readonly runtimeIntegrity: string;
    readonly corpusHash: string;
    readonly decodingHash: string;
    readonly b2ReportHash: string;
    readonly b2ConsumptionHash: string;
  };
  readonly policy: {
    readonly comparisonOrder: readonly ["ai-off", "shadow", "shadow", "ai-off"];
    readonly comparisonPhaseMilliseconds: number;
    readonly stressMinimumAttempts: number;
    readonly workdayMilliseconds: number;
    readonly suppressionPhaseMilliseconds: number;
    readonly responseDeadlineMilliseconds: number;
    readonly maximumDispatchesPerRollingTenMinutes: 2;
    readonly workdayDutyMustBeBelowPermille: 10;
    readonly maximumWorkdayTokensPerHour: number;
    readonly storedArtifactBudgetBytes: number;
    readonly incrementalMemoryBudgetBytes: number;
    readonly combinedMemoryBudgetBytes: number;
    readonly settlementObservationMilliseconds: number;
    readonly suppressionActionDeadlineMilliseconds: number;
    readonly maximumAddedEnergyMilliwattHoursPerComparisonPhase: number;
  };
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

export interface NarratorShadowLongTaskV1 {
  readonly startOffsetMilliseconds: number;
  readonly durationMilliseconds: number;
}

export interface NarratorShadowFrameWindowV1 {
  readonly startOffsetMilliseconds: number;
  readonly frameIntervalsMicroseconds: readonly number[];
  readonly droppedEntryCount: number;
}

export interface NarratorShadowObserverCoverageV1 {
  readonly startOffsetMilliseconds: number;
  readonly endOffsetMilliseconds: number;
  readonly droppedEntryCount: number;
}

export interface NarratorShadowMemorySampleV1 {
  readonly offsetMilliseconds: number;
  readonly bytes: number;
}

export interface NarratorShadowMeasuredWorkIntervalV1 {
  readonly startMilliseconds: number;
  readonly endMilliseconds: number;
  readonly memorySamples: readonly NarratorShadowMemorySampleV1[];
}

export interface NarratorShadowThermalSampleV1 {
  readonly offsetMilliseconds: number;
  readonly state: NarratorShadowThermalState;
  readonly temperatureCentiCelsius: number | null;
}

export interface NarratorShadowBatterySampleV1 {
  readonly offsetMilliseconds: number;
  readonly levelPermille: number;
  readonly charging: boolean;
}

export interface NarratorShadowPhaseV1 {
  readonly schemaVersion: 1;
  readonly phaseId: string;
  readonly sequence: number;
  readonly kind: NarratorShadowPhaseKind;
  readonly durationMilliseconds: number;
  readonly visibility: "visible" | "hidden";
  readonly ecoMode: boolean;
  readonly frameWindows: readonly NarratorShadowFrameWindowV1[];
  readonly longTaskCoverage: NarratorShadowObserverCoverageV1;
  readonly longTasks: readonly NarratorShadowLongTaskV1[];
  readonly memorySamples: readonly NarratorShadowMemorySampleV1[];
  readonly memoryDroppedEntryCount: number;
  readonly thermalSamples: readonly NarratorShadowThermalSampleV1[];
  readonly thermalDroppedEntryCount: number;
  readonly batterySamples: readonly NarratorShadowBatterySampleV1[];
  readonly batteryDroppedEntryCount: number;
  readonly energyUsedMilliwattHours: number | null;
  readonly workerLoadIntervals: readonly NarratorShadowMeasuredWorkIntervalV1[];
  readonly workerCreations: number;
  readonly modelRequests: number;
  readonly successfulNetworkRequests: number;
  readonly canonicalCheckpointHashes: readonly string[];
  readonly eventSequenceHash: string;
  readonly cutawayStartTicks: readonly number[];
  readonly projectionHash: string;
  readonly layoutShiftMicroUnits: number;
  readonly contentHash: string;
}

export interface NarratorShadowOpportunityV1 {
  readonly schemaVersion: 1;
  readonly planHash: string;
  readonly ordinal: number;
  readonly phaseId: string;
  readonly evaluationCaseOrdinal: number;
  readonly evaluationCaseId: string;
  readonly evaluationCaseHash: string;
  readonly workloadOrigin: "frozen-evaluation-corpus";
  readonly workloadCampaignId: "benchmark:frozen-evaluation-corpus-v1";
  readonly workloadEventId: string;
  readonly workloadTick: number;
  readonly workloadSourceFingerprint: string;
  readonly prompt: NarratorPromptV1;
  readonly deterministicFallback: string;
  readonly fallbackSourceFingerprint: string;
  readonly fallbackCommittedAtMilliseconds: number;
  readonly observedCampaignIdAtDispatch: string;
  readonly observedEventIdAtDispatch: string;
  readonly observedTickAtDispatch: number;
  readonly observedSourceFingerprintAtDispatch: string;
  readonly dispatchAtMilliseconds: number;
  readonly resultAtMilliseconds: number;
  readonly observedCampaignIdAtResult: string;
  readonly observedEventIdAtResult: string;
  readonly observedTickAtResult: number;
  readonly observedSourceFingerprintAtResult: string;
  readonly presentationOwnerAtDispatch: NarratorShadowPresentationOwner;
  readonly presentationOwnerAtResult: NarratorShadowPresentationOwner;
  readonly visibilityAtDispatch: "visible" | "hidden";
  readonly visibilityAtResult: "visible" | "hidden";
  readonly ecoAtDispatch: boolean;
  readonly ecoAtResult: boolean;
  readonly resultStatus: NarratorShadowResultStatus;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly outputText: string | null;
  readonly inferenceIntervals: readonly NarratorShadowMeasuredWorkIntervalV1[];
  readonly displayed: false;
  readonly persisted: false;
  readonly canonicalMutation: false;
  readonly contentHash: string;
}

export interface NarratorNamedPhoneShadowReceiptV1 {
  readonly schemaVersion: 1;
  readonly plan: NarratorShadowBenchmarkPlanV1;
  readonly profile: NarratorNamedPhoneProfileV1;
  readonly observer: {
    readonly frameMethod: "request-animation-frame" | "unsupported";
    readonly longTaskMethod: "performance-observer" | "unsupported";
    readonly memoryMethod: "measure-user-agent-specific-memory" | "external-task-manager" | "unsupported";
    readonly thermalMethod: "android-thermal-api" | "external-probe" | "unsupported";
    readonly batteryMethod: "android-battery-stats" | "external-power-meter" | "unsupported";
    readonly memoryInstrumentId: string | null;
    readonly thermalInstrumentId: string | null;
    readonly batteryInstrumentId: string | null;
    readonly externalOperatorId: string | null;
  };
  readonly phases: readonly NarratorShadowPhaseV1[];
  readonly opportunities: readonly NarratorShadowOpportunityV1[];
  readonly postDisposalMemoryDurationMilliseconds: number;
  readonly postDisposalMemorySamples: readonly NarratorShadowMemorySampleV1[];
  readonly observedCachedArtifacts: readonly NarratorVerifiedArtifactV1[];
  readonly suppressionTransitions: readonly {
    readonly mode: "eco" | "hidden";
    readonly phaseId: string;
    readonly workerStateBefore: "loading" | "tokenizing" | "realizing";
    readonly pendingWorkBefore: true;
    readonly action: "cancel-and-terminate";
    readonly actionAtMilliseconds: number;
    readonly workerTerminatedAtMilliseconds: number;
    readonly workerStateAfter: "off";
    readonly acceptedLateResultCount: 0;
    readonly workBeforeNextEligibleScene: 0;
  }[];
  readonly retainedRawTraceHashes: readonly string[];
  readonly terminalStatus: "complete" | "aborted" | "device-lost";
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

export type NarratorShadowBenchmarkBlocker =
  | "b2-evidence-invalid"
  | "plan-invalid"
  | "receipt-invalid"
  | "observation-incomplete"
  | "stored-artifact-budget-exceeded"
  | "stress-attempts-below-30"
  | "stress-corpus-coverage-below-30"
  | "stress-result-failed"
  | "stress-p95-latency-above-eight-seconds"
  | "current-result-rate-below-90-percent"
  | "comparison-shadow-current-result-missing"
  | "workday-current-results-below-11"
  | "workday-duty-not-below-one-percent"
  | "workday-token-budget-exceeded"
  | "dispatch-rate-exceeded"
  | "eco-inference-observed"
  | "hidden-inference-observed"
  | "network-activity-observed"
  | "canonical-trace-diverged"
  | "cutaway-trace-diverged"
  | "projection-trace-diverged"
  | "layout-shift-observed"
  | "frame-evidence-unavailable"
  | "frame-evidence-incomplete"
  | "workday-frame-p95-above-25-ms"
  | "workday-frame-p99-above-33-ms"
  | "frame-p95-regression-above-two-ms"
  | "frame-p99-regression-above-four-ms"
  | "dropped-frame-regression-above-quarter-percent"
  | "long-task-evidence-unavailable"
  | "long-task-evidence-incomplete"
  | "long-task-regression-above-half-percent"
  | "long-task-density-above-one-per-ten-minutes"
  | "long-task-above-100-ms"
  | "memory-evidence-unavailable"
  | "memory-evidence-incomplete"
  | "incremental-memory-budget-exceeded"
  | "settled-memory-not-recovered"
  | "combined-memory-budget-exceeded"
  | "thermal-evidence-unavailable"
  | "thermal-evidence-incomplete"
  | "thermal-state-too-high"
  | "thermal-delta-above-three-celsius"
  | "battery-evidence-unavailable"
  | "battery-evidence-incomplete"
  | "battery-energy-budget-exceeded"
  | "cached-artifact-evidence-invalid"
  | "suppression-lifecycle-incomplete"
  | "last-quartile-latency-degraded-above-10-percent";

export interface NarratorShadowBenchmarkReportV1 {
  readonly schemaVersion: 1;
  readonly planHash: string;
  readonly receiptHash: string;
  readonly candidateId: string;
  readonly stressAttemptCount: number;
  readonly stressP95LatencyMilliseconds: number | null;
  readonly currentResultPermille: number;
  readonly workdayCurrentResultCount: number;
  readonly workdayDutyPermille: number;
  readonly workdayOutputTokens: number;
  readonly workdayFrameP95Microseconds: number | null;
  readonly workdayFrameP99Microseconds: number | null;
  readonly frameP95RegressionMicroseconds: number | null;
  readonly frameP99RegressionMicroseconds: number | null;
  readonly droppedFrameRegressionPartsPerMillion: number | null;
  readonly addedLongTaskBlockedPermille: number | null;
  readonly incrementalPeakMemoryBytes: number | null;
  readonly combinedPeakMemoryBytes: number | null;
  readonly settledMemoryLimitBytes: number | null;
  readonly addedEnergyMilliwattHours: number | null;
  readonly lastQuartileLatencyRegressionPermille: number | null;
  readonly disposition: "blocked" | "eligible-for-v04.13b3b";
  readonly blockers: readonly NarratorShadowBenchmarkBlocker[];
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

interface PhoneProfileFields extends Omit<NarratorNamedPhoneProfileV1, "schemaVersion" | "enteredBy" | "contentHash"> {}

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

function boundedArray(value: unknown, maximum = maximumTraceSamples): value is readonly unknown[] {
  return Array.isArray(value) && value.length <= maximum;
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && hashPattern.test(value);
}

function hashedContentIsValid(value: Record<string, unknown>): boolean {
  if (!isHash(value.contentHash)) return false;
  const { contentHash, ...content } = value;
  return value.contentHash === canonicalHash(content);
}

function b2EvidenceIsValid(evidence: NarratorB2EvidenceV1): boolean {
  return isNarratorModelCandidate(evidence.candidate)
    && isNarratorCandidateProvenanceDossier(evidence.provenanceDossier)
    && isNarratorCandidateStagingReportForEvidenceV1(
      evidence.stagingReport,
      evidence.candidate,
      evidence.provenanceDossier,
    )
    && evidence.stagingReport.disposition === "eligible-for-device-staging"
    && evidence.stagingReport.modelAdmitted === false
    && evidence.stagingReport.displayAuthorized === false
    && isNarratorBenchmarkReportForEvidenceV1(
      evidence.report,
      evidence.candidate,
      evidence.runReceipt,
      evidence.sheet,
      evidence.key,
      evidence.ratings,
      evidence.priorReplayRegistry,
    )
    && evidence.report.disposition === "advance-to-v04.13b3"
    && evidence.report.modelAdmitted === false
    && isNarratorRatingConsumptionReceiptForEvidenceV1(
      evidence.consumption,
      evidence.report,
      evidence.candidate,
      evidence.runReceipt,
      evidence.sheet,
      evidence.key,
      evidence.ratings,
      evidence.currentReplayRegistry,
    );
}

export function createNarratorNamedPhoneProfileV1(fields: PhoneProfileFields): NarratorNamedPhoneProfileV1 {
  const content = { schemaVersion: 1 as const, ...fields, enteredBy: "coordinator" as const };
  const profile = deepFreeze({ ...content, contentHash: canonicalHash(content) });
  if (!isNarratorNamedPhoneProfileV1(profile)) throw new TypeError("Named phone profile is invalid");
  return profile;
}

export function isNarratorNamedPhoneProfileV1(value: unknown): value is NarratorNamedPhoneProfileV1 {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "phoneLabel", "sku", "systemOnChip", "ramBytes", "osName", "osBuild",
      "browserName", "browserBuild", "refreshRateMilliHertz", "viewportCssWidth", "viewportCssHeight",
      "devicePixelRatioMilli", "orientation", "motionPreference", "brightnessPercent", "powerMode",
      "charging", "radioMode", "ambientTemperatureCentiCelsius", "caseState", "enteredBy", "contentHash",
    ])
    || value.schemaVersion !== 1
    || ![value.phoneLabel, value.sku, value.systemOnChip, value.osName, value.osBuild,
      value.browserName, value.browserBuild].every((entry) => isNarratorBoundedText(entry, 160))
    || !positiveInteger(value.ramBytes)
    || !positiveInteger(value.refreshRateMilliHertz)
    || !positiveInteger(value.viewportCssWidth)
    || !positiveInteger(value.viewportCssHeight)
    || !Number.isSafeInteger(value.devicePixelRatioMilli)
    || Number(value.devicePixelRatioMilli) < 500
    || Number(value.devicePixelRatioMilli) > 8_000
    || !["portrait", "landscape"].includes(String(value.orientation))
    || !["normal", "reduced"].includes(String(value.motionPreference))
    || !nonNegativeInteger(value.brightnessPercent)
    || Number(value.brightnessPercent) > 100
    || !["balanced", "battery-saver"].includes(String(value.powerMode))
    || typeof value.charging !== "boolean"
    || !["offline", "wifi", "cellular"].includes(String(value.radioMode))
    || !(value.ambientTemperatureCentiCelsius === null
      || (Number.isSafeInteger(value.ambientTemperatureCentiCelsius)
        && Number(value.ambientTemperatureCentiCelsius) >= -5_000
        && Number(value.ambientTemperatureCentiCelsius) <= 8_000))
    || !["none", "installed"].includes(String(value.caseState))
    || value.enteredBy !== "coordinator") return false;
  return hashedContentIsValid(value);
}

export function generateNarratorShadowRunIdV1(
  source: Pick<Crypto, "getRandomValues"> = globalThis.crypto,
): string {
  if (source === undefined || typeof source.getRandomValues !== "function") {
    throw new TypeError("Web Crypto random generation is unavailable");
  }
  const bytes = new Uint8Array(32);
  source.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createNarratorShadowBenchmarkPlanV1(
  evidence: NarratorB2EvidenceV1,
  profile: NarratorNamedPhoneProfileV1,
  runId: string,
  appVersion: string,
  buildRevision: string,
): NarratorShadowBenchmarkPlanV1 {
  if (!b2EvidenceIsValid(evidence)) throw new TypeError("V04.13b2 evidence is invalid");
  if (!isNarratorNamedPhoneProfileV1(profile)
    || !/^[0-9a-f]{64}$/u.test(runId)
    || !semverPattern.test(appVersion)
    || !revisionPattern.test(buildRevision)) throw new TypeError("Shadow benchmark plan identity is invalid");
  const content = {
    schemaVersion: 1 as const,
    runId,
    app: { version: appVersion, buildRevision },
    bindings: {
      phoneProfileHash: profile.contentHash,
      candidateId: evidence.candidate.candidateId,
      candidateManifestHash: narratorCandidateManifestHash(evidence.candidate),
      artifactManifestHash: narratorArtifactManifestHash(evidence.candidate),
      provenanceDossierHash: evidence.provenanceDossier.contentHash,
      candidateStagingReportHash: evidence.stagingReport.contentHash,
      runtimeIntegrity: evidence.candidate.runtime.integrity,
      corpusHash: evidence.runReceipt.runSpec.corpus.hash,
      decodingHash: canonicalHash(evidence.runReceipt.runSpec.decoding),
      b2ReportHash: evidence.report.contentHash,
      b2ConsumptionHash: evidence.consumption.contentHash,
    },
    policy: {
      comparisonOrder: ["ai-off", "shadow", "shadow", "ai-off"] as const,
      comparisonPhaseMilliseconds: narratorShadowComparisonPhaseMilliseconds,
      stressMinimumAttempts: narratorShadowStressMinimumAttempts,
      workdayMilliseconds: narratorShadowWorkdayMilliseconds,
      suppressionPhaseMilliseconds: narratorShadowSuppressionPhaseMilliseconds,
      responseDeadlineMilliseconds: narratorShadowLineDeadlineMilliseconds,
      maximumDispatchesPerRollingTenMinutes: 2 as const,
      workdayDutyMustBeBelowPermille: 10 as const,
      maximumWorkdayTokensPerHour: narratorShadowMaximumWorkdayTokensPerHour,
      storedArtifactBudgetBytes: narratorStoredWeightBudgetBytes,
      incrementalMemoryBudgetBytes: narratorIncrementalMemoryBudgetBytes,
      combinedMemoryBudgetBytes: narratorShadowCombinedMemoryBudgetBytes,
      settlementObservationMilliseconds: narratorShadowSettlementObservationMilliseconds,
      suppressionActionDeadlineMilliseconds: narratorShadowSuppressionActionDeadlineMilliseconds,
      maximumAddedEnergyMilliwattHoursPerComparisonPhase: narratorShadowMaximumAddedEnergyMilliwattHours,
    },
    modelAdmitted: false as const,
    displayAuthorized: false as const,
  };
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

export function isNarratorShadowBenchmarkPlanForEvidenceV1(
  value: unknown,
  evidence: NarratorB2EvidenceV1,
  profile: unknown,
): value is NarratorShadowBenchmarkPlanV1 {
  if (!isNarratorRecord(value)
    || !isNarratorNamedPhoneProfileV1(profile)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "runId", "app", "bindings", "policy", "modelAdmitted", "displayAuthorized", "contentHash",
    ])
    || value.schemaVersion !== 1
    || !/^[0-9a-f]{64}$/u.test(String(value.runId))
    || !isNarratorRecord(value.app)
    || !narratorHasExactKeys(value.app, ["version", "buildRevision"])
    || !semverPattern.test(String(value.app.version))
    || !revisionPattern.test(String(value.app.buildRevision))
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false
    || !b2EvidenceIsValid(evidence)) return false;
  try {
    const expected = createNarratorShadowBenchmarkPlanV1(
      evidence,
      profile,
      String(value.runId),
      String(value.app.version),
      String(value.app.buildRevision),
    );
    return canonicalStringify(value) === canonicalStringify(expected);
  } catch {
    return false;
  }
}

function isLongTask(value: unknown, duration: number): value is NarratorShadowLongTaskV1 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["startOffsetMilliseconds", "durationMilliseconds"])
    && nonNegativeInteger(value.startOffsetMilliseconds)
    && positiveInteger(value.durationMilliseconds)
    && Number(value.durationMilliseconds) >= 50
    && Number(value.startOffsetMilliseconds) + Number(value.durationMilliseconds) <= duration;
}

function isFrameWindow(value: unknown, duration: number): value is NarratorShadowFrameWindowV1 {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, ["startOffsetMilliseconds", "frameIntervalsMicroseconds", "droppedEntryCount"])
    || !nonNegativeInteger(value.startOffsetMilliseconds)
    || Number(value.startOffsetMilliseconds) > duration
    || !boundedArray(value.frameIntervalsMicroseconds, 10_000)
    || value.frameIntervalsMicroseconds.length === 0
    || value.frameIntervalsMicroseconds.some((sample) => !positiveInteger(sample))
    || !nonNegativeInteger(value.droppedEntryCount)) return false;
  const observedMicroseconds = (value.frameIntervalsMicroseconds as number[])
    .reduce((sum, sample) => sum + sample, 0);
  return observedMicroseconds >= narratorShadowFrameWindowMilliseconds * 1_000
    && Number(value.startOffsetMilliseconds) + Math.floor(observedMicroseconds / 1_000) <= duration;
}

function isCoverage(value: unknown, duration: number): value is NarratorShadowObserverCoverageV1 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["startOffsetMilliseconds", "endOffsetMilliseconds", "droppedEntryCount"])
    && value.startOffsetMilliseconds === 0
    && value.endOffsetMilliseconds === duration
    && nonNegativeInteger(value.droppedEntryCount);
}

function isMemorySample(value: unknown, duration: number): value is NarratorShadowMemorySampleV1 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["offsetMilliseconds", "bytes"])
    && nonNegativeInteger(value.offsetMilliseconds)
    && Number(value.offsetMilliseconds) <= duration
    && positiveInteger(value.bytes);
}

function isThermalSample(value: unknown, duration: number): value is NarratorShadowThermalSampleV1 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["offsetMilliseconds", "state", "temperatureCentiCelsius"])
    && nonNegativeInteger(value.offsetMilliseconds)
    && Number(value.offsetMilliseconds) <= duration
    && ["nominal", "fair", "serious", "critical"].includes(String(value.state))
    && (value.temperatureCentiCelsius === null
      || (Number.isSafeInteger(value.temperatureCentiCelsius)
        && Number(value.temperatureCentiCelsius) >= -5_000
        && Number(value.temperatureCentiCelsius) <= 12_000));
}

function isBatterySample(value: unknown, duration: number): value is NarratorShadowBatterySampleV1 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["offsetMilliseconds", "levelPermille", "charging"])
    && nonNegativeInteger(value.offsetMilliseconds)
    && Number(value.offsetMilliseconds) <= duration
    && nonNegativeInteger(value.levelPermille)
    && Number(value.levelPermille) <= 1_000
    && typeof value.charging === "boolean";
}

function isMeasuredWorkInterval(
  value: unknown,
  started: number,
  ended: number,
): value is NarratorShadowMeasuredWorkIntervalV1 {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, ["startMilliseconds", "endMilliseconds", "memorySamples"])
    || !nonNegativeInteger(value.startMilliseconds)
    || !positiveInteger(value.endMilliseconds)
    || Number(value.startMilliseconds) < started
    || Number(value.endMilliseconds) > ended
    || Number(value.startMilliseconds) >= Number(value.endMilliseconds)
    || !boundedArray(value.memorySamples, 1_000)
    || !value.memorySamples.every((sample) => isMemorySample(sample, ended))
    || !orderedOffsets(value.memorySamples, "offsetMilliseconds")) return false;
  const samples = value.memorySamples as NarratorShadowMemorySampleV1[];
  return samples.length >= 2
    && samples[0]!.offsetMilliseconds === value.startMilliseconds
    && samples[samples.length - 1]!.offsetMilliseconds === value.endMilliseconds
    && samples.every((sample, index) => index === 0
      || sample.offsetMilliseconds - samples[index - 1]!.offsetMilliseconds
        <= narratorShadowPeakMemoryCadenceMilliseconds);
}

function coversCadence(values: readonly unknown[], duration: number, cadence: number): boolean {
  if (values.length < 2) return false;
  const offsets = values.map((value) => Number((value as Record<string, unknown>).offsetMilliseconds));
  return offsets[0] === 0
    && offsets[offsets.length - 1] === duration
    && offsets.every((offset, index) => index === 0 || offset - offsets[index - 1]! <= cadence);
}

function frameWindowsCoverPhase(windows: readonly NarratorShadowFrameWindowV1[], duration: number): boolean {
  if (windows.length < Math.ceil(duration / narratorShadowFrameWindowCadenceMilliseconds)) return false;
  if (windows[0]?.startOffsetMilliseconds !== 0) return false;
  if ((windows[windows.length - 1]?.startOffsetMilliseconds ?? 0)
    < duration - narratorShadowFrameWindowCadenceMilliseconds) return false;
  return windows.every((window, index) => index === 0
    || window.startOffsetMilliseconds - windows[index - 1]!.startOffsetMilliseconds
      <= narratorShadowFrameWindowCadenceMilliseconds);
}

function orderedOffsets(values: readonly unknown[], key: string): boolean {
  return values.every((value, index) => index === 0
    || Number((values[index - 1] as Record<string, unknown>)[key])
      <= Number((value as Record<string, unknown>)[key]));
}

export function isNarratorShadowPhaseV1(value: unknown): value is NarratorShadowPhaseV1 {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "phaseId", "sequence", "kind", "durationMilliseconds", "visibility", "ecoMode",
      "frameWindows", "longTaskCoverage", "longTasks", "memorySamples", "memoryDroppedEntryCount",
      "thermalSamples", "thermalDroppedEntryCount", "batterySamples", "batteryDroppedEntryCount",
      "energyUsedMilliwattHours", "workerLoadIntervals", "workerCreations",
      "modelRequests", "successfulNetworkRequests", "canonicalCheckpointHashes", "eventSequenceHash",
      "cutawayStartTicks", "projectionHash", "layoutShiftMicroUnits", "contentHash",
    ])
    || value.schemaVersion !== 1
    || !isNarratorBoundedText(value.phaseId, 200)
    || !nonNegativeInteger(value.sequence)
    || !["comparison-ai-off", "comparison-shadow", "stress-shadow", "workday-shadow",
      "eco-suppression", "hidden-suppression"].includes(String(value.kind))
    || !positiveInteger(value.durationMilliseconds)
    || !["visible", "hidden"].includes(String(value.visibility))
    || typeof value.ecoMode !== "boolean"
    || !boundedArray(value.frameWindows, 120)
    || !value.frameWindows.every((window) => isFrameWindow(window, Number(value.durationMilliseconds)))
    || value.frameWindows.some((window, index, windows) => index > 0
      && Number(windows[index - 1]!.startOffsetMilliseconds) >= Number(window.startOffsetMilliseconds))
    || !isCoverage(value.longTaskCoverage, Number(value.durationMilliseconds))
    || !boundedArray(value.longTasks)
    || !value.longTasks.every((sample) => isLongTask(sample, Number(value.durationMilliseconds)))
    || !orderedOffsets(value.longTasks, "startOffsetMilliseconds")
    || !boundedArray(value.memorySamples)
    || !value.memorySamples.every((sample) => isMemorySample(sample, Number(value.durationMilliseconds)))
    || !orderedOffsets(value.memorySamples, "offsetMilliseconds")
    || !nonNegativeInteger(value.memoryDroppedEntryCount)
    || !boundedArray(value.thermalSamples)
    || !value.thermalSamples.every((sample) => isThermalSample(sample, Number(value.durationMilliseconds)))
    || !orderedOffsets(value.thermalSamples, "offsetMilliseconds")
    || !nonNegativeInteger(value.thermalDroppedEntryCount)
    || !boundedArray(value.batterySamples, 10_000)
    || !value.batterySamples.every((sample) => isBatterySample(sample, Number(value.durationMilliseconds)))
    || !orderedOffsets(value.batterySamples, "offsetMilliseconds")
    || !nonNegativeInteger(value.batteryDroppedEntryCount)
    || !(value.energyUsedMilliwattHours === null || positiveInteger(value.energyUsedMilliwattHours))
    || !boundedArray(value.workerLoadIntervals, 64)
    || !value.workerLoadIntervals.every((interval) => isMeasuredWorkInterval(
      interval, 0, Number(value.durationMilliseconds),
    ))
    || !orderedOffsets(value.workerLoadIntervals, "startMilliseconds")
    || value.workerLoadIntervals.some((interval, index, intervals) => index > 0
      && Number(intervals[index - 1]!.endMilliseconds) > Number(interval.startMilliseconds))
    || !nonNegativeInteger(value.workerCreations)
    || Number(value.workerCreations) !== value.workerLoadIntervals.length
    || !nonNegativeInteger(value.modelRequests)
    || !nonNegativeInteger(value.successfulNetworkRequests)
    || !boundedArray(value.canonicalCheckpointHashes, 512)
    || value.canonicalCheckpointHashes.length === 0
    || value.canonicalCheckpointHashes.some((hash) => !isHash(hash))
    || !isHash(value.eventSequenceHash)
    || !boundedArray(value.cutawayStartTicks, 512)
    || value.cutawayStartTicks.some((tick) => !nonNegativeInteger(tick))
    || value.cutawayStartTicks.some((tick, index, ticks) => index > 0 && Number(ticks[index - 1]) >= Number(tick))
    || !isHash(value.projectionHash)
    || !nonNegativeInteger(value.layoutShiftMicroUnits)) return false;
  if ((value.kind === "hidden-suppression") !== (value.visibility === "hidden")
    || (value.kind === "eco-suppression") !== value.ecoMode
    || (["eco-suppression", "hidden-suppression"].includes(String(value.kind))
      && (Number(value.workerCreations) !== 0 || Number(value.modelRequests) !== 0
        || Number(value.successfulNetworkRequests) !== 0))) return false;
  if (value.visibility === "visible" && !frameWindowsCoverPhase(
    value.frameWindows as NarratorShadowFrameWindowV1[], Number(value.durationMilliseconds),
  )) return false;
  if (value.visibility === "hidden" && value.frameWindows.length !== 0) return false;
  if (!coversCadence(value.memorySamples, Number(value.durationMilliseconds), narratorShadowMemoryCadenceMilliseconds)
    || !coversCadence(value.thermalSamples, Number(value.durationMilliseconds), narratorShadowThermalCadenceMilliseconds)
    || !coversCadence(value.batterySamples, Number(value.durationMilliseconds), narratorShadowThermalCadenceMilliseconds)) {
    return false;
  }
  return hashedContentIsValid(value);
}

function opportunityIsCurrent(value: NarratorShadowOpportunityV1): boolean {
  return value.resultStatus === "ok"
    && value.observedCampaignIdAtDispatch === value.observedCampaignIdAtResult
    && value.observedEventIdAtDispatch === value.observedEventIdAtResult
    && value.observedTickAtDispatch === value.observedTickAtResult
    && value.observedSourceFingerprintAtDispatch === value.observedSourceFingerprintAtResult
    && value.presentationOwnerAtDispatch === "ambient"
    && value.presentationOwnerAtResult === "ambient"
    && value.visibilityAtDispatch === "visible"
    && value.visibilityAtResult === "visible"
    && !value.ecoAtDispatch
    && !value.ecoAtResult
    && value.resultAtMilliseconds - value.dispatchAtMilliseconds <= narratorShadowLineDeadlineMilliseconds;
}

export function isNarratorShadowOpportunityV1(
  value: unknown,
  plan: NarratorShadowBenchmarkPlanV1,
  phases: readonly NarratorShadowPhaseV1[],
): value is NarratorShadowOpportunityV1 {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "planHash", "ordinal", "phaseId", "evaluationCaseOrdinal", "evaluationCaseId",
      "evaluationCaseHash", "workloadOrigin", "workloadCampaignId", "workloadEventId", "workloadTick",
      "workloadSourceFingerprint", "prompt", "deterministicFallback", "fallbackSourceFingerprint",
      "fallbackCommittedAtMilliseconds", "observedCampaignIdAtDispatch", "observedEventIdAtDispatch",
      "observedTickAtDispatch", "observedSourceFingerprintAtDispatch", "dispatchAtMilliseconds",
      "resultAtMilliseconds", "observedCampaignIdAtResult", "observedEventIdAtResult",
      "observedTickAtResult", "observedSourceFingerprintAtResult", "presentationOwnerAtDispatch",
      "presentationOwnerAtResult", "visibilityAtDispatch", "visibilityAtResult", "ecoAtDispatch", "ecoAtResult",
      "resultStatus", "inputTokens", "outputTokens", "outputText", "inferenceIntervals", "displayed",
      "persisted", "canonicalMutation", "contentHash",
    ])
    || value.schemaVersion !== 1
    || value.planHash !== plan.contentHash
    || !nonNegativeInteger(value.ordinal)
    || !isNarratorBoundedText(value.phaseId, 200)
    || !nonNegativeInteger(value.evaluationCaseOrdinal)
    || narratorEvaluationCasesV1[Number(value.evaluationCaseOrdinal)] === undefined
    || value.evaluationCaseId !== narratorEvaluationCasesV1[Number(value.evaluationCaseOrdinal)]!.id
    || value.evaluationCaseHash !== canonicalHash(narratorEvaluationCasesV1[Number(value.evaluationCaseOrdinal)]!)
    || value.workloadOrigin !== "frozen-evaluation-corpus"
    || value.workloadCampaignId !== "benchmark:frozen-evaluation-corpus-v1"
    || value.workloadEventId !== value.evaluationCaseId
    || value.workloadTick !== value.evaluationCaseOrdinal
    || value.workloadSourceFingerprint !== value.evaluationCaseHash
    || ![value.observedCampaignIdAtDispatch, value.observedEventIdAtDispatch,
      value.observedSourceFingerprintAtDispatch, value.observedCampaignIdAtResult,
      value.observedEventIdAtResult, value.observedSourceFingerprintAtResult]
      .every((entry) => isNarratorBoundedText(entry, 200))
    || !nonNegativeInteger(value.observedTickAtDispatch)
    || !nonNegativeInteger(value.observedTickAtResult)
    || !isNarratorPromptV1(value.prompt)
    || canonicalStringify(value.prompt) !== canonicalStringify(
      narratorEvaluationCasesV1[Number(value.evaluationCaseOrdinal)]!.prompt,
    )
    || normalizeNarratorOutput(value.deterministicFallback) !== value.deterministicFallback
    || value.deterministicFallback !== narratorEvaluationCasesV1[Number(value.evaluationCaseOrdinal)]!.deterministicBaseline
    || value.deterministicFallback !== deterministicNarratorFallback(value.prompt as NarratorPromptV1)
    || value.fallbackSourceFingerprint !== value.workloadSourceFingerprint
    || !nonNegativeInteger(value.fallbackCommittedAtMilliseconds)
    || !nonNegativeInteger(value.dispatchAtMilliseconds)
    || !positiveInteger(value.resultAtMilliseconds)
    || Number(value.fallbackCommittedAtMilliseconds) > Number(value.dispatchAtMilliseconds)
    || Number(value.dispatchAtMilliseconds) > Number(value.resultAtMilliseconds)
    || !["ambient", "cutaway", "other"].includes(String(value.presentationOwnerAtDispatch))
    || !["ambient", "cutaway", "other"].includes(String(value.presentationOwnerAtResult))
    || !["visible", "hidden"].includes(String(value.visibilityAtDispatch))
    || !["visible", "hidden"].includes(String(value.visibilityAtResult))
    || typeof value.ecoAtDispatch !== "boolean"
    || typeof value.ecoAtResult !== "boolean"
    || !["ok", "timeout", "device-lost", "malformed", "cancelled"].includes(String(value.resultStatus))
    || !(value.inputTokens === null
      || (positiveInteger(value.inputTokens) && Number(value.inputTokens) <= narratorMaximumInputTokens))
    || !(value.outputTokens === null
      || (positiveInteger(value.outputTokens) && Number(value.outputTokens) <= narratorMaximumOutputTokens))
    || !(value.outputText === null || normalizeNarratorOutput(value.outputText) === value.outputText)
    || !boundedArray(value.inferenceIntervals, 64)
    || !value.inferenceIntervals.every((interval) => isMeasuredWorkInterval(
      interval,
      Number(value.dispatchAtMilliseconds),
      Number(value.resultAtMilliseconds),
    ))
    || value.inferenceIntervals.length === 0
    || !orderedOffsets(value.inferenceIntervals, "startMilliseconds")
    || value.inferenceIntervals.some((interval, index, intervals) => index > 0
      && Number(intervals[index - 1]!.endMilliseconds) > Number(interval.startMilliseconds))
    || value.displayed !== false
    || value.persisted !== false
    || value.canonicalMutation !== false) return false;
  const phase = phases.find((entry) => entry.phaseId === value.phaseId);
  if (phase === undefined || !["comparison-shadow", "stress-shadow", "workday-shadow"].includes(phase.kind)) return false;
  if (Number(value.resultAtMilliseconds) > phase.durationMilliseconds) return false;
  if (!isNarratorJobV1({
    schemaVersion: 1,
    campaignId: value.workloadCampaignId,
    eventId: value.workloadEventId,
    tick: value.workloadTick,
    sourceFingerprint: value.workloadSourceFingerprint,
    prompt: value.prompt,
    deterministicFallback: value.deterministicFallback,
    maximumInputTokens: narratorMaximumInputTokens,
    maximumOutputTokens: narratorMaximumOutputTokens,
  }) || !/^[0-9a-f]{16}$/u.test(String(value.observedSourceFingerprintAtDispatch))
    || !/^[0-9a-f]{16}$/u.test(String(value.observedSourceFingerprintAtResult))) return false;
  if (value.resultStatus === "ok") {
    if (value.inputTokens === null || value.outputTokens === null || typeof value.outputText !== "string"
      || !isSafeAmbientNarration(value.outputText, value.prompt)) return false;
  } else if (value.outputText !== null || value.outputTokens !== null) return false;
  return hashedContentIsValid(value);
}

interface ReceiptFields extends Omit<NarratorNamedPhoneShadowReceiptV1,
  "schemaVersion" | "retainedRawTraceHashes" | "modelAdmitted" | "displayAuthorized" | "contentHash"> {}

export function createNarratorNamedPhoneShadowReceiptV1(fields: ReceiptFields): NarratorNamedPhoneShadowReceiptV1 {
  const retainedRawTraceHashes = Object.freeze([
    canonicalHash(fields.phases),
    canonicalHash(fields.opportunities),
    canonicalHash({
      postDisposalDuration: fields.postDisposalMemoryDurationMilliseconds,
      postDisposal: fields.postDisposalMemorySamples,
      cachedArtifacts: fields.observedCachedArtifacts,
      suppressionTransitions: fields.suppressionTransitions,
    }),
  ]);
  const content = {
    schemaVersion: 1 as const,
    ...fields,
    retainedRawTraceHashes,
    modelAdmitted: false as const,
    displayAuthorized: false as const,
  };
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

function optionalIdentity(value: unknown): boolean {
  return value === null || isNarratorBoundedText(value, 200);
}

function isSuppressionTransition(
  value: unknown,
  phases: readonly NarratorShadowPhaseV1[],
): value is NarratorNamedPhoneShadowReceiptV1["suppressionTransitions"][number] {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "mode", "phaseId", "workerStateBefore", "pendingWorkBefore", "action", "actionAtMilliseconds",
      "workerTerminatedAtMilliseconds", "workerStateAfter", "acceptedLateResultCount", "workBeforeNextEligibleScene",
    ])
    || !["eco", "hidden"].includes(String(value.mode))
    || !isNarratorBoundedText(value.phaseId, 200)
    || !["loading", "tokenizing", "realizing"].includes(String(value.workerStateBefore))
    || value.pendingWorkBefore !== true
    || value.action !== "cancel-and-terminate"
    || !nonNegativeInteger(value.actionAtMilliseconds)
    || Number(value.actionAtMilliseconds) > narratorShadowSuppressionActionDeadlineMilliseconds
    || !positiveInteger(value.workerTerminatedAtMilliseconds)
    || Number(value.workerTerminatedAtMilliseconds) < Number(value.actionAtMilliseconds)
    || Number(value.workerTerminatedAtMilliseconds) - Number(value.actionAtMilliseconds)
      > narratorShadowTerminationDeadlineMilliseconds
    || value.workerStateAfter !== "off"
    || value.acceptedLateResultCount !== 0
    || value.workBeforeNextEligibleScene !== 0) return false;
  const phase = phases.find((entry) => entry.phaseId === value.phaseId);
  return phase !== undefined
    && phase.kind === `${String(value.mode)}-suppression`
    && Number(value.workerTerminatedAtMilliseconds) <= phase.durationMilliseconds;
}

function expectedPhaseShape(phases: readonly NarratorShadowPhaseV1[]): boolean {
  const kinds: readonly NarratorShadowPhaseKind[] = [
    "comparison-ai-off", "comparison-shadow", "comparison-shadow", "comparison-ai-off",
    "stress-shadow", "workday-shadow", "eco-suppression", "hidden-suppression",
  ];
  return phases.length === kinds.length && phases.every((phase, sequence) => {
    if (phase.sequence !== sequence || phase.kind !== kinds[sequence]) return false;
    if (sequence <= 3) return phase.durationMilliseconds === narratorShadowComparisonPhaseMilliseconds;
    if (phase.kind === "workday-shadow") return phase.durationMilliseconds === narratorShadowWorkdayMilliseconds;
    if (phase.kind === "eco-suppression" || phase.kind === "hidden-suppression") {
      return phase.durationMilliseconds === narratorShadowSuppressionPhaseMilliseconds;
    }
    return true;
  });
}

export function isNarratorNamedPhoneShadowReceiptForEvidenceV1(
  value: unknown,
  evidence: NarratorB2EvidenceV1,
): value is NarratorNamedPhoneShadowReceiptV1 {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "plan", "profile", "observer", "phases", "opportunities",
      "postDisposalMemoryDurationMilliseconds", "postDisposalMemorySamples", "observedCachedArtifacts",
      "suppressionTransitions", "retainedRawTraceHashes", "terminalStatus", "modelAdmitted",
      "displayAuthorized", "contentHash",
    ])
    || value.schemaVersion !== 1
    || !isNarratorNamedPhoneProfileV1(value.profile)
    || !isNarratorShadowBenchmarkPlanForEvidenceV1(value.plan, evidence, value.profile)
    || !isNarratorRecord(value.observer)
    || !narratorHasExactKeys(value.observer, [
      "frameMethod", "longTaskMethod", "memoryMethod", "thermalMethod", "batteryMethod",
      "memoryInstrumentId", "thermalInstrumentId", "batteryInstrumentId", "externalOperatorId",
    ])
    || !["request-animation-frame", "unsupported"].includes(String(value.observer.frameMethod))
    || !["performance-observer", "unsupported"].includes(String(value.observer.longTaskMethod))
    || !["measure-user-agent-specific-memory", "external-task-manager", "unsupported"].includes(String(value.observer.memoryMethod))
    || !["android-thermal-api", "external-probe", "unsupported"].includes(String(value.observer.thermalMethod))
    || !["android-battery-stats", "external-power-meter", "unsupported"].includes(String(value.observer.batteryMethod))
    || !optionalIdentity(value.observer.memoryInstrumentId)
    || !optionalIdentity(value.observer.thermalInstrumentId)
    || !optionalIdentity(value.observer.batteryInstrumentId)
    || !optionalIdentity(value.observer.externalOperatorId)
    || !Array.isArray(value.phases)
    || !value.phases.every(isNarratorShadowPhaseV1)
    || !expectedPhaseShape(value.phases)
    || new Set(value.phases.map((phase) => phase.phaseId)).size !== value.phases.length
    || !boundedArray(value.opportunities, maximumOpportunities)
    || !value.opportunities.every((opportunity) => isNarratorShadowOpportunityV1(
      opportunity,
      value.plan as NarratorShadowBenchmarkPlanV1,
      value.phases as NarratorShadowPhaseV1[],
    ))
    || value.opportunities.some((opportunity, ordinal) => opportunity.ordinal !== ordinal)
    || value.postDisposalMemoryDurationMilliseconds !== narratorShadowSettlementObservationMilliseconds
    || !boundedArray(value.postDisposalMemorySamples, 1_000)
    || !value.postDisposalMemorySamples.every((sample) => isMemorySample(
      sample, Number(value.postDisposalMemoryDurationMilliseconds),
    ))
    || !orderedOffsets(value.postDisposalMemorySamples, "offsetMilliseconds")
    || !isNarratorVerifiedArtifactsV1(value.observedCachedArtifacts)
    || !narratorArtifactsMatchCandidate(value.observedCachedArtifacts, evidence.candidate)
    || !boundedArray(value.suppressionTransitions, 2)
    || value.suppressionTransitions.length !== 2
    || !value.suppressionTransitions.every((transition) => isSuppressionTransition(
      transition, value.phases as NarratorShadowPhaseV1[],
    ))
    || new Set(value.suppressionTransitions.map((transition) => transition.mode)).size !== 2
    || !boundedArray(value.retainedRawTraceHashes, 64)
    || value.retainedRawTraceHashes.length !== 3
    || value.retainedRawTraceHashes.some((hash) => !isHash(hash))
    || new Set(value.retainedRawTraceHashes).size !== value.retainedRawTraceHashes.length
    || !["complete", "aborted", "device-lost"].includes(String(value.terminalStatus))
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false) return false;
  const expectedTraceHashes = [
    canonicalHash(value.phases),
    canonicalHash(value.opportunities),
    canonicalHash({
      postDisposalDuration: value.postDisposalMemoryDurationMilliseconds,
      postDisposal: value.postDisposalMemorySamples,
      cachedArtifacts: value.observedCachedArtifacts,
      suppressionTransitions: value.suppressionTransitions,
    }),
  ];
  if (canonicalStringify(value.retainedRawTraceHashes) !== canonicalStringify(expectedTraceHashes)) return false;
  if (value.observer.memoryMethod !== "unsupported" && value.observer.memoryInstrumentId === null) return false;
  if (value.observer.thermalMethod !== "unsupported" && value.observer.thermalInstrumentId === null) return false;
  if (value.observer.batteryMethod !== "unsupported" && value.observer.batteryInstrumentId === null) return false;
  if ((value.observer.thermalMethod === "external-probe" || value.observer.batteryMethod === "external-power-meter"
    || value.observer.memoryMethod === "external-task-manager") && value.observer.externalOperatorId === null) return false;
  if (!coversCadence(
    value.postDisposalMemorySamples,
    value.postDisposalMemoryDurationMilliseconds,
    narratorShadowMemoryCadenceMilliseconds,
  )) return false;
  for (const phase of value.phases) {
    const phaseOpportunities = value.opportunities.filter((opportunity) => opportunity.phaseId === phase.phaseId);
    const opportunityCount = phaseOpportunities.length;
    if (phase.modelRequests !== opportunityCount) return false;
    if (phase.kind === "comparison-ai-off"
      && (phase.workerCreations !== 0 || phase.modelRequests !== 0 || phase.successfulNetworkRequests !== 0)) return false;
    if (["comparison-shadow", "stress-shadow", "workday-shadow"].includes(phase.kind)
      && (opportunityCount === 0 || phase.workerCreations < 1)) return false;
    if (phaseOpportunities.some((opportunity, index) => index > 0
      && phaseOpportunities[index - 1]!.resultAtMilliseconds > opportunity.dispatchAtMilliseconds)) return false;
  }
  const phaseSequence = new Map(value.phases.map((phase) => [phase.phaseId, phase.sequence]));
  const opportunities = value.opportunities as NarratorShadowOpportunityV1[];
  if (opportunities.some((opportunity, index) => index > 0
    && (phaseSequence.get(opportunities[index - 1]!.phaseId) ?? -1)
      > (phaseSequence.get(opportunity.phaseId) ?? -1))) return false;
  return hashedContentIsValid(value);
}

function nearestRank(values: readonly number[], percentile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * percentile) - 1] ?? null;
}

function nearestRank95(values: readonly number[]): number | null {
  return nearestRank(values, 0.95);
}

function nearestRank99(values: readonly number[]): number | null {
  return nearestRank(values, 0.99);
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle] ?? null
    : Math.floor(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

function permille(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : Math.floor((numerator * 1_000) / denominator);
}

function intervalUnionMilliseconds(opportunities: readonly NarratorShadowOpportunityV1[]): number {
  const intervals = opportunities.flatMap((opportunity) => opportunity.inferenceIntervals)
    .sort((left, right) => left.startMilliseconds - right.startMilliseconds);
  let total = 0;
  let start = -1;
  let end = -1;
  for (const interval of intervals) {
    if (start < 0) {
      start = interval.startMilliseconds;
      end = interval.endMilliseconds;
    } else if (interval.startMilliseconds <= end) end = Math.max(end, interval.endMilliseconds);
    else {
      total += end - start;
      start = interval.startMilliseconds;
      end = interval.endMilliseconds;
    }
  }
  return start < 0 ? 0 : total + end - start;
}

function dispatchRateExceeded(opportunities: readonly NarratorShadowOpportunityV1[]): boolean {
  const times = opportunities.map((entry) => entry.dispatchAtMilliseconds).sort((left, right) => left - right);
  for (let index = 0; index < times.length; index += 1) {
    let inside = 0;
    for (let cursor = index; cursor < times.length && times[cursor]! < times[index]! + 600_000; cursor += 1) inside += 1;
    if (inside > 2) return true;
  }
  return false;
}

function droppedFrameCounts(
  intervals: readonly number[],
  refreshRateMilliHertz: number,
): { readonly missed: number; readonly expected: number } {
  const expectedMicroseconds = Math.floor(1_000_000_000 / refreshRateMilliHertz);
  let missed = 0;
  let expected = 0;
  for (const interval of intervals) {
    const refreshes = Math.max(1, Math.round(interval / expectedMicroseconds));
    expected += refreshes;
    missed += refreshes - 1;
  }
  return { missed, expected };
}

function rateRegressionPartsPerMillion(
  baseline: { readonly missed: number; readonly expected: number },
  shadow: { readonly missed: number; readonly expected: number },
): number {
  if (baseline.expected === 0 || shadow.expected === 0) return 0;
  const numerator = shadow.missed * baseline.expected - baseline.missed * shadow.expected;
  const denominator = shadow.expected * baseline.expected;
  return numerator <= 0 ? 0 : Math.floor((numerator * 1_000_000) / denominator);
}

function longTaskUnionMilliseconds(phases: readonly NarratorShadowPhaseV1[]): number {
  let total = 0;
  for (const phase of phases) {
    let start = -1;
    let end = -1;
    for (const task of phase.longTasks) {
      const taskEnd = task.startOffsetMilliseconds + task.durationMilliseconds;
      if (start < 0) {
        start = task.startOffsetMilliseconds;
        end = taskEnd;
      } else if (task.startOffsetMilliseconds <= end) end = Math.max(end, taskEnd);
      else {
        total += end - start;
        start = task.startOffsetMilliseconds;
        end = taskEnd;
      }
    }
    if (start >= 0) total += end - start;
  }
  return total;
}

function quartileAverage(values: readonly number[], first: boolean): number | null {
  if (values.length < 4) return null;
  const count = Math.max(1, Math.floor(values.length / 4));
  const slice = first ? values.slice(0, count) : values.slice(-count);
  return Math.floor(slice.reduce((sum, value) => sum + value, 0) / slice.length);
}

function report(content: Omit<NarratorShadowBenchmarkReportV1, "contentHash">): NarratorShadowBenchmarkReportV1 {
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

export function evaluateNarratorNamedPhoneShadowV1(
  receiptValue: unknown,
  evidence: NarratorB2EvidenceV1,
): NarratorShadowBenchmarkReportV1 {
  const blockers: NarratorShadowBenchmarkBlocker[] = [];
  const evidenceValid = b2EvidenceIsValid(evidence);
  if (!evidenceValid) blockers.push("b2-evidence-invalid");
  const valid = evidenceValid && isNarratorNamedPhoneShadowReceiptForEvidenceV1(receiptValue, evidence);
  if (!valid) blockers.push("receipt-invalid");
  const receipt = valid ? receiptValue : null;
  const blank = {
    stressAttemptCount: 0,
    stressP95LatencyMilliseconds: null,
    currentResultPermille: 0,
    workdayCurrentResultCount: 0,
    workdayDutyPermille: 0,
    workdayOutputTokens: 0,
    workdayFrameP95Microseconds: null,
    workdayFrameP99Microseconds: null,
    frameP95RegressionMicroseconds: null,
    frameP99RegressionMicroseconds: null,
    droppedFrameRegressionPartsPerMillion: null,
    addedLongTaskBlockedPermille: null,
    incrementalPeakMemoryBytes: null,
    combinedPeakMemoryBytes: null,
    settledMemoryLimitBytes: null,
    addedEnergyMilliwattHours: null,
    lastQuartileLatencyRegressionPermille: null,
  };
  if (receipt === null) return report({
    schemaVersion: 1,
    planHash: "invalid",
    receiptHash: "invalid",
    candidateId: isNarratorModelCandidate(evidence.candidate) ? evidence.candidate.candidateId : "invalid-candidate",
    ...blank,
    disposition: "blocked",
    blockers: Object.freeze([...new Set(blockers)]),
    modelAdmitted: false,
    displayAuthorized: false,
  });

  if (receipt.terminalStatus !== "complete") blockers.push("observation-incomplete");
  const observedStoredBytes = receipt.observedCachedArtifacts.reduce((sum, artifact) => sum + artifact.byteLength, 0);
  if (observedStoredBytes > narratorStoredWeightBudgetBytes
    || narratorCandidateStoredBytes(evidence.candidate) > narratorStoredWeightBudgetBytes) {
    blockers.push("stored-artifact-budget-exceeded");
  }
  if (!narratorArtifactsMatchCandidate(receipt.observedCachedArtifacts, evidence.candidate)) {
    blockers.push("cached-artifact-evidence-invalid");
  }
  if (receipt.phases.some((phase) => phase.successfulNetworkRequests > 0)) blockers.push("network-activity-observed");
  const byKind = (kind: NarratorShadowPhaseKind) => receipt.phases.filter((phase) => phase.kind === kind);
  const opportunitiesFor = (kind: NarratorShadowPhaseKind) => {
    const ids = new Set(byKind(kind).map((phase) => phase.phaseId));
    return receipt.opportunities.filter((opportunity) => ids.has(opportunity.phaseId));
  };
  const stress = opportunitiesFor("stress-shadow")
    .sort((left, right) => left.dispatchAtMilliseconds - right.dispatchAtMilliseconds);
  const workday = opportunitiesFor("workday-shadow");
  const eligibleStress = stress.filter(opportunityIsCurrent);
  const current = receipt.opportunities.filter(opportunityIsCurrent);
  const stressLatencies = stress.map((opportunity) => opportunity.resultAtMilliseconds - opportunity.dispatchAtMilliseconds);
  const stressP95LatencyMilliseconds = nearestRank95(stressLatencies);
  if (stress.length < narratorShadowStressMinimumAttempts) blockers.push("stress-attempts-below-30");
  if (new Set(stress.map((opportunity) => opportunity.evaluationCaseOrdinal)).size
    < narratorShadowStressMinimumAttempts) blockers.push("stress-corpus-coverage-below-30");
  if (eligibleStress.length !== stress.length) blockers.push("stress-result-failed");
  if (stressP95LatencyMilliseconds === null
    || stressP95LatencyMilliseconds > narratorShadowLineDeadlineMilliseconds) {
    blockers.push("stress-p95-latency-above-eight-seconds");
  }
  const currentResultPermille = permille(current.length, receipt.opportunities.length);
  if (receipt.opportunities.length === 0 || currentResultPermille < 900) {
    blockers.push("current-result-rate-below-90-percent");
  }
  const workdayCurrentResultCount = workday.filter(opportunityIsCurrent).length;
  if (workdayCurrentResultCount < 11) blockers.push("workday-current-results-below-11");
  const workdayDuration = byKind("workday-shadow")[0]?.durationMilliseconds ?? 0;
  const workdayDutyPermille = permille(intervalUnionMilliseconds(workday), workdayDuration);
  if (workdayDutyPermille >= 10) blockers.push("workday-duty-not-below-one-percent");
  const workdayOutputTokens = workday.reduce((sum, opportunity) => sum + (opportunity.outputTokens ?? 0), 0);
  const normalizedWorkdayTokens = workdayDuration > 0
    ? Math.ceil((workdayOutputTokens * narratorShadowWorkdayMilliseconds) / workdayDuration)
    : workdayOutputTokens;
  if (normalizedWorkdayTokens > narratorShadowMaximumWorkdayTokensPerHour) blockers.push("workday-token-budget-exceeded");
  if (dispatchRateExceeded(workday)
    || byKind("comparison-shadow").some((phase) => dispatchRateExceeded(
      receipt.opportunities.filter((opportunity) => opportunity.phaseId === phase.phaseId),
    ))) blockers.push("dispatch-rate-exceeded");
  for (const [kind, blocker] of [["eco-suppression", "eco-inference-observed"],
    ["hidden-suppression", "hidden-inference-observed"]] as const) {
    const phase = byKind(kind)[0];
    if (phase === undefined || phase.workerCreations > 0 || phase.modelRequests > 0
      || receipt.opportunities.some((opportunity) => opportunity.phaseId === phase.phaseId)) blockers.push(blocker);
  }

  const comparison = receipt.phases.slice(0, 4);
  const baseline = comparison.filter((phase) => phase.kind === "comparison-ai-off");
  const shadow = comparison.filter((phase) => phase.kind === "comparison-shadow");
  if (shadow.some((phase) => !receipt.opportunities.some((opportunity) =>
    opportunity.phaseId === phase.phaseId && opportunityIsCurrent(opportunity)))) {
    blockers.push("comparison-shadow-current-result-missing");
  }
  const matchesBaseline = (project: (phase: NarratorShadowPhaseV1) => unknown) => {
    const expected = canonicalStringify(project(baseline[0]!));
    return comparison.every((phase) => canonicalStringify(project(phase)) === expected);
  };
  if (!matchesBaseline((phase) => [phase.canonicalCheckpointHashes, phase.eventSequenceHash])) {
    blockers.push("canonical-trace-diverged");
  }
  if (!matchesBaseline((phase) => phase.cutawayStartTicks)) blockers.push("cutaway-trace-diverged");
  if (!matchesBaseline((phase) => phase.projectionHash)) blockers.push("projection-trace-diverged");
  if (shadow.some((phase) => phase.layoutShiftMicroUnits > 0)) blockers.push("layout-shift-observed");

  const frames = (phases: readonly NarratorShadowPhaseV1[]) => phases.flatMap((phase) =>
    phase.frameWindows.flatMap((window) => window.frameIntervalsMicroseconds));
  const baselineFrames = frames(baseline);
  const shadowFrames = frames(shadow);
  const workdayFrames = frames(byKind("workday-shadow"));
  const frameOverflow = receipt.phases.some((phase) => phase.frameWindows.some((window) => window.droppedEntryCount > 0));
  const workdayFrameP95Microseconds = nearestRank95(workdayFrames);
  const workdayFrameP99Microseconds = nearestRank99(workdayFrames);
  let frameP95RegressionMicroseconds: number | null = null;
  let frameP99RegressionMicroseconds: number | null = null;
  let droppedFrameRegressionPartsPerMillion: number | null = null;
  if (receipt.observer.frameMethod === "unsupported" || baselineFrames.length === 0 || shadowFrames.length === 0) {
    blockers.push("frame-evidence-unavailable");
  } else {
    if (frameOverflow) blockers.push("frame-evidence-incomplete");
    if (workdayFrameP95Microseconds === null || workdayFrameP95Microseconds > 25_000) {
      blockers.push("workday-frame-p95-above-25-ms");
    }
    if (workdayFrameP99Microseconds === null || workdayFrameP99Microseconds > 33_000) {
      blockers.push("workday-frame-p99-above-33-ms");
    }
    frameP95RegressionMicroseconds = Math.max(0, (nearestRank95(shadowFrames) ?? 0) - (nearestRank95(baselineFrames) ?? 0));
    frameP99RegressionMicroseconds = Math.max(0, (nearestRank99(shadowFrames) ?? 0) - (nearestRank99(baselineFrames) ?? 0));
    droppedFrameRegressionPartsPerMillion = rateRegressionPartsPerMillion(
      droppedFrameCounts(baselineFrames, receipt.profile.refreshRateMilliHertz),
      droppedFrameCounts(shadowFrames, receipt.profile.refreshRateMilliHertz),
    );
    if (frameP95RegressionMicroseconds > 2_000) blockers.push("frame-p95-regression-above-two-ms");
    if (frameP99RegressionMicroseconds > 4_000) blockers.push("frame-p99-regression-above-four-ms");
    if (droppedFrameRegressionPartsPerMillion > 2_500) {
      blockers.push("dropped-frame-regression-above-quarter-percent");
    }
  }

  let addedLongTaskBlockedPermille: number | null = null;
  if (receipt.observer.longTaskMethod === "unsupported") blockers.push("long-task-evidence-unavailable");
  else {
    const duration = (phases: readonly NarratorShadowPhaseV1[]) => phases.reduce(
      (sum, phase) => sum + phase.durationMilliseconds, 0,
    );
    if (receipt.phases.some((phase) => phase.longTaskCoverage.droppedEntryCount > 0)) {
      blockers.push("long-task-evidence-incomplete");
    }
    const baselineBlocked = longTaskUnionMilliseconds(baseline);
    const shadowBlocked = longTaskUnionMilliseconds(shadow);
    addedLongTaskBlockedPermille = Math.max(0,
      permille(shadowBlocked, duration(shadow)) - permille(baselineBlocked, duration(baseline)));
    if (shadowBlocked * duration(baseline) - baselineBlocked * duration(shadow)
      > 0.005 * duration(shadow) * duration(baseline)) blockers.push("long-task-regression-above-half-percent");
    const visibleShadow = [...shadow, ...byKind("stress-shadow"), ...byKind("workday-shadow")];
    if (visibleShadow.some((phase) => phase.longTasks.length > Math.ceil(phase.durationMilliseconds / 600_000))) {
      blockers.push("long-task-density-above-one-per-ten-minutes");
    }
    if (visibleShadow.some((phase) => phase.longTasks.some((task) => task.durationMilliseconds > 100))) {
      blockers.push("long-task-above-100-ms");
    }
  }

  const baselineMemory = baseline.flatMap((phase) => phase.memorySamples.map((sample) => sample.bytes));
  const activePhases = [...shadow, ...byKind("stress-shadow"), ...byKind("workday-shadow")];
  const activeMemory = [
    ...activePhases.flatMap((phase) => phase.memorySamples.map((sample) => sample.bytes)),
    ...activePhases.flatMap((phase) => phase.workerLoadIntervals
      .flatMap((interval) => interval.memorySamples.map((sample) => sample.bytes))),
    ...receipt.opportunities.flatMap((opportunity) => opportunity.inferenceIntervals
      .flatMap((interval) => interval.memorySamples.map((sample) => sample.bytes))),
  ];
  const settledMemory = receipt.postDisposalMemorySamples.map((sample) => sample.bytes);
  const baselineMedian = median(baselineMemory);
  const activePeak = activeMemory.length > 0 ? Math.max(...activeMemory) : null;
  const settledPeak = settledMemory.length > 0 ? Math.max(...settledMemory) : null;
  let incrementalPeakMemoryBytes: number | null = null;
  const combinedPeakMemoryBytes = activePeak;
  let settledMemoryLimitBytes: number | null = null;
  if (receipt.observer.memoryMethod === "unsupported" || baselineMedian === null || activePeak === null || settledPeak === null) {
    blockers.push("memory-evidence-unavailable");
  } else {
    if (receipt.phases.some((phase) => phase.memoryDroppedEntryCount > 0)) blockers.push("memory-evidence-incomplete");
    incrementalPeakMemoryBytes = Math.max(0, activePeak - baselineMedian);
    settledMemoryLimitBytes = baselineMedian + Math.max(16 * 1024 * 1024, Math.floor(baselineMedian / 10));
    if (incrementalPeakMemoryBytes > narratorIncrementalMemoryBudgetBytes) {
      blockers.push("incremental-memory-budget-exceeded");
    }
    if (settledPeak > settledMemoryLimitBytes) blockers.push("settled-memory-not-recovered");
  }
  if (combinedPeakMemoryBytes === null || combinedPeakMemoryBytes >= narratorShadowCombinedMemoryBudgetBytes) {
    blockers.push("combined-memory-budget-exceeded");
  }

  const allThermal = receipt.phases.flatMap((phase) => phase.thermalSamples);
  if (receipt.observer.thermalMethod === "unsupported" || allThermal.length === 0) {
    blockers.push("thermal-evidence-unavailable");
  } else {
    if (receipt.phases.some((phase) => phase.thermalDroppedEntryCount > 0)) blockers.push("thermal-evidence-incomplete");
    if (allThermal.some((sample) => sample.state === "serious" || sample.state === "critical")) {
      blockers.push("thermal-state-too-high");
    }
    if (receipt.observer.thermalMethod === "external-probe") {
      const baselineTemperatures = baseline.flatMap((phase) => phase.thermalSamples)
        .map((sample) => sample.temperatureCentiCelsius).filter((value): value is number => value !== null);
      const shadowTemperatures = shadow.flatMap((phase) => phase.thermalSamples)
        .map((sample) => sample.temperatureCentiCelsius).filter((value): value is number => value !== null);
      if (baselineTemperatures.length === 0 || shadowTemperatures.length === 0) blockers.push("thermal-evidence-unavailable");
      else if (Math.max(...shadowTemperatures) - Math.max(...baselineTemperatures) > 300) {
        blockers.push("thermal-delta-above-three-celsius");
      }
    }
  }

  const allBattery = receipt.phases.flatMap((phase) => phase.batterySamples);
  const baselineEnergy = baseline.map((phase) => phase.energyUsedMilliwattHours);
  const shadowEnergy = shadow.map((phase) => phase.energyUsedMilliwattHours);
  let addedEnergyMilliwattHours: number | null = null;
  if (receipt.observer.batteryMethod === "unsupported" || allBattery.length === 0) {
    blockers.push("battery-evidence-unavailable");
  } else if (receipt.phases.some((phase) => phase.batteryDroppedEntryCount > 0)
    || [...baselineEnergy, ...shadowEnergy].some((value) => value === null)) {
    blockers.push("battery-evidence-incomplete");
  } else {
    const baselineAverage = Math.floor((baselineEnergy as number[]).reduce((sum, value) => sum + value, 0)
      / baselineEnergy.length);
    const shadowAverage = Math.floor((shadowEnergy as number[]).reduce((sum, value) => sum + value, 0)
      / shadowEnergy.length);
    addedEnergyMilliwattHours = Math.max(0, shadowAverage - baselineAverage);
    if (addedEnergyMilliwattHours > narratorShadowMaximumAddedEnergyMilliwattHours) {
      blockers.push("battery-energy-budget-exceeded");
    }
  }

  const firstQuartile = quartileAverage(stressLatencies, true);
  const lastQuartile = quartileAverage(stressLatencies, false);
  const lastQuartileLatencyRegressionPermille = firstQuartile === null || lastQuartile === null
    ? null
    : permille(Math.max(0, lastQuartile - firstQuartile), firstQuartile);
  if (lastQuartileLatencyRegressionPermille === null || lastQuartileLatencyRegressionPermille > 100) {
    blockers.push("last-quartile-latency-degraded-above-10-percent");
  }
  const unique = Object.freeze([...new Set(blockers)]);
  return report({
    schemaVersion: 1,
    planHash: receipt.plan.contentHash,
    receiptHash: receipt.contentHash,
    candidateId: evidence.candidate.candidateId,
    stressAttemptCount: stress.length,
    stressP95LatencyMilliseconds,
    currentResultPermille,
    workdayCurrentResultCount,
    workdayDutyPermille,
    workdayOutputTokens,
    workdayFrameP95Microseconds,
    workdayFrameP99Microseconds,
    frameP95RegressionMicroseconds,
    frameP99RegressionMicroseconds,
    droppedFrameRegressionPartsPerMillion,
    addedLongTaskBlockedPermille,
    incrementalPeakMemoryBytes,
    combinedPeakMemoryBytes,
    settledMemoryLimitBytes,
    addedEnergyMilliwattHours,
    lastQuartileLatencyRegressionPermille,
    disposition: unique.length === 0 ? "eligible-for-v04.13b3b" : "blocked",
    blockers: unique,
    modelAdmitted: false,
    displayAuthorized: false,
  });
}

export function isNarratorShadowBenchmarkReportForEvidenceV1(
  value: unknown,
  receipt: unknown,
  evidence: NarratorB2EvidenceV1,
): value is NarratorShadowBenchmarkReportV1 {
  if (!isNarratorRecord(value) || !isHash(value.contentHash)) return false;
  try {
    return canonicalStringify(value) === canonicalStringify(evaluateNarratorNamedPhoneShadowV1(receipt, evidence));
  } catch {
    return false;
  }
}
