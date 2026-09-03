import { describe, expect, it } from "vitest";
import { canonicalHash } from "../core/canonical";
import {
  consumeNarratorBenchmarkReportV1,
  createNarratorBlindStudyV1,
  createNarratorRatingBundleV1,
  createNarratorRatingReplayRegistryV1,
  evaluateNarratorBenchmarkV1,
  type NarratorBlindRatingChoice,
} from "./blind-evaluation";
import {
  createNarratorCaseReceiptV1,
  createNarratorEvaluationRunSpecV1,
  createNarratorRunReceiptV1,
} from "./evaluation-receipts";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  tinyStoriesInstruct33MInt8Candidate,
  type NarratorModelCandidateV1,
} from "./model-candidate";
import {
  createNarratorNamedPhoneProfileV1,
  createNarratorNamedPhoneShadowReceiptV1,
  createNarratorShadowBenchmarkPlanV1,
  evaluateNarratorNamedPhoneShadowV1,
  generateNarratorShadowRunIdV1,
  isNarratorNamedPhoneShadowReceiptForEvidenceV1,
  isNarratorShadowBenchmarkPlanForEvidenceV1,
  isNarratorShadowBenchmarkReportForEvidenceV1,
  isNarratorShadowOpportunityV1,
  isNarratorShadowPhaseV1,
  narratorShadowComparisonPhaseMilliseconds,
  narratorShadowMaximumAddedEnergyMilliwattHours,
  narratorShadowSettlementObservationMilliseconds,
  narratorShadowSuppressionPhaseMilliseconds,
  narratorShadowWorkdayMilliseconds,
  type NarratorB2EvidenceV1,
  type NarratorNamedPhoneShadowReceiptV1,
  type NarratorShadowOpportunityV1,
  type NarratorShadowPhaseKind,
  type NarratorShadowPhaseV1,
} from "./shadow-benchmark";
import {
  createNarratorShadowCollectorInitializeRequestV1,
  isNarratorShadowCollectorRequestForPlanV1,
  isNarratorShadowCollectorResponseForPlanV1,
  narratorShadowCollectorProtocolVersion,
  type NarratorShadowCollectorRequestV1,
} from "./shadow-collector-protocol";
import {
  NarratorShadowCollectorDeviceLostError,
  NarratorShadowCollectorWorkerV1,
  narratorShadowCollectorRequestBudgetV1,
  type NarratorShadowCollectorBindingV1,
  type NarratorShadowCollectorModelPortV1,
  type NarratorShadowCollectorTokenMeterPortV1,
} from "./shadow-worker-runtime";

function candidateFixture(): NarratorModelCandidateV1 {
  return {
    ...tinyStoriesInstruct33MInt8Candidate,
    model: {
      ...tinyStoriesInstruct33MInt8Candidate.model,
      license: "MIT",
      licenseStatus: "verified",
    },
  };
}

function passingChoices(key: ReturnType<typeof createNarratorBlindStudyV1>["key"]): NarratorBlindRatingChoice[] {
  const groups = new Map<string, number[]>();
  for (let ordinal = 0; ordinal < narratorEvaluationCasesV1.length; ordinal += 1) {
    const prompt = narratorEvaluationCasesV1[ordinal]!.prompt;
    const name = `${prompt.move}:${prompt.facts.energy}:${prompt.voice}`;
    const group = groups.get(name) ?? [];
    group.push(ordinal);
    groups.set(name, group);
  }
  const choices = Array<NarratorBlindRatingChoice>(200).fill("tie");
  for (const ordinals of groups.values()) {
    const wins = Math.ceil(ordinals.length * 0.6);
    const losses = Math.ceil(ordinals.length * 0.2);
    for (let rank = 0; rank < ordinals.length; rank += 1) {
      const ordinal = ordinals[rank]!;
      const modelSide = key.items[ordinal]!.modelSide;
      choices[ordinal] = rank < wins
        ? modelSide
        : rank < wins + losses
          ? (modelSide === "left" ? "right" : "left")
          : "tie";
    }
  }
  return choices;
}

function b2Evidence(): NarratorB2EvidenceV1 {
  const candidate = candidateFixture();
  const runSpec = createNarratorEvaluationRunSpecV1(candidate, "run:shadow-benchmark:test");
  const rows = narratorEvaluationCasesV1.map((entry, ordinal) => createNarratorCaseReceiptV1({
    runSpecHash: runSpec.contentHash,
    ordinal,
    status: "ok",
    inputTokens: 40,
    outputTokens: 8,
    outputText: entry.allowedOutputs[(ordinal % 2) + 1]!,
    latencyMilliseconds: 100,
  }));
  const runReceipt = createNarratorRunReceiptV1({
    runSpec,
    verifiedArtifacts: candidate.artifacts.map(({ path, byteLength, sha256 }) => ({ path, byteLength, sha256 })),
    load: { status: "ok", latencyMilliseconds: 500 },
    rows,
    dispose: { status: "ok", latencyMilliseconds: 5 },
  });
  const study = createNarratorBlindStudyV1(candidate, runReceipt, "sheet:shadow-benchmark", "s".repeat(64));
  const ratings = createNarratorRatingBundleV1(
    study.sheet,
    "ratings:shadow-benchmark",
    "rater:shadow-benchmark",
    passingChoices(study.key),
  );
  const priorReplayRegistry = createNarratorRatingReplayRegistryV1();
  const report = evaluateNarratorBenchmarkV1(
    candidate,
    runReceipt,
    study.sheet,
    study.key,
    ratings,
    priorReplayRegistry,
  );
  const consumption = consumeNarratorBenchmarkReportV1(
    report,
    candidate,
    runReceipt,
    study.sheet,
    study.key,
    ratings,
    priorReplayRegistry,
  );
  return {
    candidate,
    runReceipt,
    sheet: study.sheet,
    key: study.key,
    ratings,
    priorReplayRegistry,
    report,
    consumption,
    currentReplayRegistry: consumption.nextRegistry,
  };
}

const sharedB2Evidence = b2Evidence();

const phaseKinds: readonly NarratorShadowPhaseKind[] = [
  "comparison-ai-off",
  "comparison-shadow",
  "comparison-shadow",
  "comparison-ai-off",
  "stress-shadow",
  "workday-shadow",
  "eco-suppression",
  "hidden-suppression",
];

function hashed<T extends Record<string, unknown>>(content: T): T & { readonly contentHash: string } {
  return { ...content, contentHash: canonicalHash(content) };
}

function offsets(durationMilliseconds: number, cadenceMilliseconds: number): number[] {
  const values: number[] = [];
  for (let offset = 0; offset < durationMilliseconds; offset += cadenceMilliseconds) values.push(offset);
  values.push(durationMilliseconds);
  return values;
}

function phase(sequence: number): NarratorShadowPhaseV1 {
  const kind = phaseKinds[sequence]!;
  const shadow = ["comparison-shadow", "stress-shadow", "workday-shadow"].includes(kind);
  const requests = kind === "comparison-shadow" ? 2 : kind === "stress-shadow" ? 30 : kind === "workday-shadow" ? 12 : 0;
  const durationMilliseconds = sequence <= 3
    ? narratorShadowComparisonPhaseMilliseconds
    : kind === "workday-shadow"
      ? narratorShadowWorkdayMilliseconds
      : kind === "eco-suppression" || kind === "hidden-suppression"
        ? narratorShadowSuppressionPhaseMilliseconds
        : 300_000;
  return hashed({
    schemaVersion: 1 as const,
    phaseId: `phase:${sequence}`,
    sequence,
    kind,
    durationMilliseconds,
    visibility: kind === "hidden-suppression" ? "hidden" as const : "visible" as const,
    ecoMode: kind === "eco-suppression",
    frameWindows: kind === "hidden-suppression"
      ? []
      : offsets(durationMilliseconds, 60_000).slice(0, -1).map((startOffsetMilliseconds) => ({
        startOffsetMilliseconds,
        frameIntervalsMicroseconds: Array<number>(300).fill(shadow ? 17_667 : 16_667),
        droppedEntryCount: 0,
      })),
    longTaskCoverage: {
      startOffsetMilliseconds: 0,
      endOffsetMilliseconds: durationMilliseconds,
      droppedEntryCount: 0,
    },
    longTasks: [],
    memorySamples: offsets(durationMilliseconds, 300_000).map((offsetMilliseconds) => ({
      offsetMilliseconds,
      bytes: shadow ? 400 * 1024 * 1024 : 200 * 1024 * 1024,
    })),
    memoryDroppedEntryCount: 0,
    thermalSamples: offsets(durationMilliseconds, 60_000).map((offsetMilliseconds) => ({
      offsetMilliseconds,
      state: "nominal" as const,
      temperatureCentiCelsius: shadow ? 2_700 : 2_500,
    })),
    thermalDroppedEntryCount: 0,
    batterySamples: offsets(durationMilliseconds, 60_000).map((offsetMilliseconds) => ({
      offsetMilliseconds,
      levelPermille: shadow ? 890 : 900,
      charging: false,
    })),
    batteryDroppedEntryCount: 0,
    energyUsedMilliwattHours: shadow ? 110 : 100,
    workerLoadIntervals: shadow ? [{
      startMilliseconds: 0,
      endMilliseconds: 200,
      memorySamples: [
        { offsetMilliseconds: 0, bytes: 380 * 1024 * 1024 },
        { offsetMilliseconds: 100, bytes: 400 * 1024 * 1024 },
        { offsetMilliseconds: 200, bytes: 390 * 1024 * 1024 },
      ],
    }] : [],
    workerCreations: shadow ? 1 : 0,
    modelRequests: requests,
    successfulNetworkRequests: 0,
    canonicalCheckpointHashes: ["1".repeat(16), "2".repeat(16)],
    eventSequenceHash: "3".repeat(16),
    cutawayStartTicks: [10, 20],
    projectionHash: "4".repeat(16),
    layoutShiftMicroUnits: 0,
  });
}

function opportunity(
  planHash: string,
  ordinal: number,
  phaseId: string,
  dispatchAtMilliseconds: number,
): NarratorShadowOpportunityV1 {
  const entry = narratorEvaluationCasesV1[ordinal % narratorEvaluationCasesV1.length]!;
  const resultAtMilliseconds = dispatchAtMilliseconds + 1_000;
  const observedSourceFingerprint = canonicalHash({ ordinal, phaseId });
  return hashed({
    schemaVersion: 1 as const,
    planHash,
    ordinal,
    phaseId,
    evaluationCaseOrdinal: ordinal % narratorEvaluationCasesV1.length,
    evaluationCaseId: entry.id,
    evaluationCaseHash: canonicalHash(entry),
    workloadOrigin: "frozen-evaluation-corpus" as const,
    workloadCampaignId: "benchmark:frozen-evaluation-corpus-v1" as const,
    workloadEventId: entry.id,
    workloadTick: ordinal % narratorEvaluationCasesV1.length,
    workloadSourceFingerprint: canonicalHash(entry),
    prompt: entry.prompt,
    deterministicFallback: entry.deterministicBaseline,
    fallbackSourceFingerprint: canonicalHash(entry),
    fallbackCommittedAtMilliseconds: dispatchAtMilliseconds,
    observedCampaignIdAtDispatch: "campaign:shadow",
    observedEventIdAtDispatch: `event:${ordinal}`,
    observedTickAtDispatch: ordinal + 1,
    observedSourceFingerprintAtDispatch: observedSourceFingerprint,
    dispatchAtMilliseconds,
    resultAtMilliseconds,
    observedCampaignIdAtResult: "campaign:shadow",
    observedEventIdAtResult: `event:${ordinal}`,
    observedTickAtResult: ordinal + 1,
    observedSourceFingerprintAtResult: observedSourceFingerprint,
    presentationOwnerAtDispatch: "ambient" as const,
    presentationOwnerAtResult: "ambient" as const,
    visibilityAtDispatch: "visible" as const,
    visibilityAtResult: "visible" as const,
    ecoAtDispatch: false,
    ecoAtResult: false,
    resultStatus: "ok" as const,
    inputTokens: 40,
    outputTokens: 8,
    outputText: entry.allowedOutputs[1]!,
    inferenceIntervals: [{
      startMilliseconds: dispatchAtMilliseconds,
      endMilliseconds: dispatchAtMilliseconds + 200,
      memorySamples: [
        { offsetMilliseconds: dispatchAtMilliseconds, bytes: 390 * 1024 * 1024 },
        { offsetMilliseconds: dispatchAtMilliseconds + 100, bytes: 400 * 1024 * 1024 },
        { offsetMilliseconds: dispatchAtMilliseconds + 200, bytes: 395 * 1024 * 1024 },
      ],
    }],
    displayed: false as const,
    persisted: false as const,
    canonicalMutation: false as const,
  });
}

function profile() {
  return createNarratorNamedPhoneProfileV1({
    phoneLabel: "Test Phone 2026",
    sku: "TP-2026",
    systemOnChip: "Example Eight Core",
    ramBytes: 4 * 1024 * 1024 * 1024,
    osName: "Android",
    osBuild: "16-test",
    browserName: "Chrome",
    browserBuild: "140.0.0.0",
    refreshRateMilliHertz: 60_000,
    viewportCssWidth: 390,
    viewportCssHeight: 844,
    devicePixelRatioMilli: 2_750,
    orientation: "portrait",
    motionPreference: "normal",
    brightnessPercent: 50,
    powerMode: "balanced",
    charging: false,
    radioMode: "wifi",
    ambientTemperatureCentiCelsius: 2_300,
    caseState: "installed",
  });
}

function fixture() {
  const evidence = sharedB2Evidence;
  const phone = profile();
  const plan = createNarratorShadowBenchmarkPlanV1(
    evidence,
    phone,
    "a".repeat(64),
    "0.5.74",
    "b".repeat(40),
  );
  const phases = phaseKinds.map((_, sequence) => phase(sequence));
  let ordinal = 0;
  const opportunities: NarratorShadowOpportunityV1[] = [];
  for (const sequence of [1, 2]) {
    for (let index = 0; index < 2; index += 1) {
      opportunities.push(opportunity(plan.contentHash, ordinal, phases[sequence]!.phaseId, 1_000 + index * 2_000));
      ordinal += 1;
    }
  }
  for (let index = 0; index < 30; index += 1) {
    opportunities.push(opportunity(plan.contentHash, ordinal, phases[4]!.phaseId, 10_000 + index * 2_000));
    ordinal += 1;
  }
  for (let index = 0; index < 12; index += 1) {
    const group = Math.floor(index / 2);
    const insideGroup = index % 2;
    opportunities.push(opportunity(
      plan.contentHash,
      ordinal,
      phases[5]!.phaseId,
      group * 600_001 + insideGroup * 1_000,
    ));
    ordinal += 1;
  }
  const receipt = createNarratorNamedPhoneShadowReceiptV1({
    plan,
    profile: phone,
    observer: {
      frameMethod: "request-animation-frame",
      longTaskMethod: "performance-observer",
      memoryMethod: "external-task-manager",
      thermalMethod: "external-probe",
      batteryMethod: "external-power-meter",
      memoryInstrumentId: "Android Studio Profiler 2026.2",
      thermalInstrumentId: "Probe T-1 firmware 3",
      batteryInstrumentId: "Meter P-1 firmware 4",
      externalOperatorId: "operator:local-one",
    },
    phases,
    opportunities,
    postDisposalMemoryDurationMilliseconds: narratorShadowSettlementObservationMilliseconds,
    postDisposalMemorySamples: [
      { offsetMilliseconds: 0, bytes: 205 * 1024 * 1024 },
      { offsetMilliseconds: 300_000, bytes: 210 * 1024 * 1024 },
      { offsetMilliseconds: 600_000, bytes: 208 * 1024 * 1024 },
    ],
    observedCachedArtifacts: evidence.candidate.artifacts.map(({ path, byteLength, sha256 }) => ({
      path, byteLength, sha256,
    })),
    suppressionTransitions: [
      {
        mode: "eco",
        phaseId: phases[6]!.phaseId,
        workerStateBefore: "realizing",
        pendingWorkBefore: true,
        action: "cancel-and-terminate",
        actionAtMilliseconds: 100,
        workerTerminatedAtMilliseconds: 600,
        workerStateAfter: "off",
        acceptedLateResultCount: 0,
        workBeforeNextEligibleScene: 0,
      },
      {
        mode: "hidden",
        phaseId: phases[7]!.phaseId,
        workerStateBefore: "loading",
        pendingWorkBefore: true,
        action: "cancel-and-terminate",
        actionAtMilliseconds: 100,
        workerTerminatedAtMilliseconds: 600,
        workerStateAfter: "off",
        acceptedLateResultCount: 0,
        workBeforeNextEligibleScene: 0,
      },
    ],
    terminalStatus: "complete",
  });
  return { evidence, phone, plan, receipt };
}

function receiptFields(receipt: NarratorNamedPhoneShadowReceiptV1) {
  return {
    plan: receipt.plan,
    profile: receipt.profile,
    observer: receipt.observer,
    phases: receipt.phases,
    opportunities: receipt.opportunities,
    postDisposalMemoryDurationMilliseconds: receipt.postDisposalMemoryDurationMilliseconds,
    postDisposalMemorySamples: receipt.postDisposalMemorySamples,
    observedCachedArtifacts: receipt.observedCachedArtifacts,
    suppressionTransitions: receipt.suppressionTransitions,
    terminalStatus: receipt.terminalStatus,
  };
}

function rehashPhase(phaseValue: NarratorShadowPhaseV1, changes: Partial<NarratorShadowPhaseV1>): NarratorShadowPhaseV1 {
  const { contentHash: _discarded, ...content } = { ...phaseValue, ...changes };
  return hashed(content);
}

function rehashOpportunity(
  opportunityValue: NarratorShadowOpportunityV1,
  changes: Partial<NarratorShadowOpportunityV1>,
): NarratorShadowOpportunityV1 {
  const { contentHash: _discarded, ...content } = { ...opportunityValue, ...changes };
  return hashed(content);
}

function collectorRequest(
  plan: ReturnType<typeof createNarratorShadowBenchmarkPlanV1>,
  workerEpoch: string,
  requestId: string,
  kind: "verify-artifacts" | "load" | "dispose",
): NarratorShadowCollectorRequestV1;
function collectorRequest(
  plan: ReturnType<typeof createNarratorShadowBenchmarkPlanV1>,
  workerEpoch: string,
  requestId: string,
  kind: "run-case",
  payload: { readonly evaluationCaseOrdinal: number },
): NarratorShadowCollectorRequestV1;
function collectorRequest(
  plan: ReturnType<typeof createNarratorShadowBenchmarkPlanV1>,
  workerEpoch: string,
  requestId: string,
  kind: "cancel",
  payload: { readonly targetRequestId: string },
): NarratorShadowCollectorRequestV1;
function collectorRequest(
  plan: ReturnType<typeof createNarratorShadowBenchmarkPlanV1>,
  workerEpoch: string,
  requestId: string,
  kind: "verify-artifacts" | "load" | "run-case" | "cancel" | "dispose",
  payload: Record<string, unknown> = {},
): NarratorShadowCollectorRequestV1 {
  return {
    schemaVersion: 1,
    protocolVersion: narratorShadowCollectorProtocolVersion,
    runId: plan.runId,
    planHash: plan.contentHash,
    workerEpoch,
    requestId,
    kind,
    payload,
  } as NarratorShadowCollectorRequestV1;
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

class CollectorModelFixture implements NarratorShadowCollectorModelPortV1, NarratorShadowCollectorTokenMeterPortV1 {
  readonly binding: NarratorShadowCollectorBindingV1;
  terminated = 0;
  disposed = 0;
  runPrompts: unknown[] = [];
  artifacts: unknown;
  verifyImplementation: NarratorShadowCollectorModelPortV1["verifyArtifacts"] | null = null;
  loadImplementation: NarratorShadowCollectorModelPortV1["load"] | null = null;
  runImplementation: NarratorShadowCollectorModelPortV1["runCase"] | null = null;
  disposeImplementation: NarratorShadowCollectorModelPortV1["dispose"] | null = null;
  inputTokens: unknown = 40;
  outputTokens: unknown = 8;

  constructor(candidate: NarratorModelCandidateV1, plan: ReturnType<typeof createNarratorShadowBenchmarkPlanV1>) {
    this.binding = Object.freeze({
      candidateId: candidate.candidateId,
      candidateManifestHash: plan.bindings.candidateManifestHash,
      artifactManifestHash: plan.bindings.artifactManifestHash,
      runtimeIntegrity: candidate.runtime.integrity,
      corpusHash: plan.bindings.corpusHash,
      decodingHash: plan.bindings.decodingHash,
    });
    this.artifacts = candidate.artifacts.map(({ path, byteLength, sha256 }) => ({ path, byteLength, sha256 }));
  }

  verifyArtifacts(signal: AbortSignal): Promise<unknown> {
    if (this.verifyImplementation !== null) return this.verifyImplementation(signal);
    return Promise.resolve(this.artifacts);
  }

  load(signal: AbortSignal): Promise<void> {
    if (this.loadImplementation !== null) return this.loadImplementation(signal);
    return Promise.resolve();
  }

  runCase(prompt: Parameters<NarratorShadowCollectorModelPortV1["runCase"]>[0], options: {
    readonly maximumOutputTokens: 48;
    readonly signal: AbortSignal;
  }): Promise<unknown> {
    this.runPrompts.push(prompt);
    if (this.runImplementation !== null) return this.runImplementation(prompt, options);
    return Promise.resolve(narratorEvaluationCasesV1[0]!.allowedOutputs[1]!);
  }

  countInput(_prompt: Parameters<NarratorShadowCollectorTokenMeterPortV1["countInput"]>[0], _signal: AbortSignal): Promise<unknown> {
    return Promise.resolve(this.inputTokens);
  }

  countOutput(_text: string, _signal: AbortSignal): Promise<unknown> {
    return Promise.resolve(this.outputTokens);
  }

  dispose(signal: AbortSignal): Promise<void> {
    this.disposed += 1;
    if (this.disposeImplementation !== null) return this.disposeImplementation(signal);
    return Promise.resolve();
  }

  terminate(): void {
    this.terminated += 1;
  }
}

describe("named-phone narrator shadow benchmark", () => {
  it("binds the phone, app, candidate, artifacts, runtime, corpus, decoding, and consumed b2 report", () => {
    const { evidence, phone, plan } = fixture();
    expect(isNarratorShadowBenchmarkPlanForEvidenceV1(plan, evidence, phone)).toBe(true);
    expect(plan).toMatchObject({
      app: { version: "0.5.74", buildRevision: "b".repeat(40) },
      bindings: {
        phoneProfileHash: phone.contentHash,
        candidateId: evidence.candidate.candidateId,
        b2ReportHash: evidence.report.contentHash,
        b2ConsumptionHash: evidence.consumption.contentHash,
      },
      policy: {
        settlementObservationMilliseconds: narratorShadowSettlementObservationMilliseconds,
        maximumAddedEnergyMilliwattHoursPerComparisonPhase: narratorShadowMaximumAddedEnergyMilliwattHours,
      },
      modelAdmitted: false,
      displayAuthorized: false,
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(generateNarratorShadowRunIdV1()).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("advances a complete raw observation only to guarded-integration work", () => {
    const { evidence, receipt } = fixture();
    expect(receipt.phases.map(isNarratorShadowPhaseV1)).toEqual(Array(8).fill(true));
    expect(receipt.opportunities.every((entry) => isNarratorShadowOpportunityV1(
      entry,
      receipt.plan,
      receipt.phases,
    ))).toBe(true);
    expect(isNarratorNamedPhoneShadowReceiptForEvidenceV1(receipt, evidence)).toBe(true);
    const report = evaluateNarratorNamedPhoneShadowV1(receipt, evidence);
    expect(report).toMatchObject({
      disposition: "eligible-for-v04.13b3b",
      blockers: [],
      stressAttemptCount: 30,
      stressP95LatencyMilliseconds: 1_000,
      currentResultPermille: 1_000,
      workdayCurrentResultCount: 12,
      workdayOutputTokens: 96,
      frameP95RegressionMicroseconds: 1_000,
      frameP99RegressionMicroseconds: 1_000,
      droppedFrameRegressionPartsPerMillion: 0,
      addedLongTaskBlockedPermille: 0,
      modelAdmitted: false,
      displayAuthorized: false,
    });
    expect(report.incrementalPeakMemoryBytes).toBe(200 * 1024 * 1024);
    expect(isNarratorShadowBenchmarkReportForEvidenceV1(report, receipt, evidence)).toBe(true);
  }, 15_000);

  it("blocks a stale stress result even though the hidden prose remains well formed", () => {
    const { evidence, receipt } = fixture();
    const stale = rehashOpportunity(receipt.opportunities[4]!, {
      observedSourceFingerprintAtResult: "f".repeat(16),
    });
    const changed = createNarratorNamedPhoneShadowReceiptV1({
      ...receiptFields(receipt),
      opportunities: [...receipt.opportunities.slice(0, 4), stale, ...receipt.opportunities.slice(5)],
    });
    expect(evaluateNarratorNamedPhoneShadowV1(changed, evidence).blockers).toContain("stress-result-failed");
  });

  it("requires production fallback identity, measured inference, and a current result in each comparison phase", () => {
    const { evidence, receipt } = fixture();
    const sourceMismatch = rehashOpportunity(receipt.opportunities[0]!, {
      fallbackSourceFingerprint: "f".repeat(16),
    });
    const zeroDutySuccess = rehashOpportunity(receipt.opportunities[0]!, { inferenceIntervals: [] });
    const borrowedSchedulingIdentity = rehashOpportunity(receipt.opportunities[0]!, {
      workloadSourceFingerprint: receipt.opportunities[0]!.observedSourceFingerprintAtDispatch,
      fallbackSourceFingerprint: receipt.opportunities[0]!.observedSourceFingerprintAtDispatch,
    });
    expect(isNarratorShadowOpportunityV1(sourceMismatch, receipt.plan, receipt.phases)).toBe(false);
    expect(isNarratorShadowOpportunityV1(zeroDutySuccess, receipt.plan, receipt.phases)).toBe(false);
    expect(isNarratorShadowOpportunityV1(borrowedSchedulingIdentity, receipt.plan, receipt.phases)).toBe(false);

    const cancelled = receipt.opportunities.slice(0, 2).map((entry) => rehashOpportunity(entry, {
      resultStatus: "cancelled",
      outputTokens: null,
      outputText: null,
    }));
    const changed = createNarratorNamedPhoneShadowReceiptV1({
      ...receiptFields(receipt),
      opportunities: [...cancelled, ...receipt.opportunities.slice(2)],
    });
    expect(isNarratorNamedPhoneShadowReceiptForEvidenceV1(changed, evidence)).toBe(true);
    expect(evaluateNarratorNamedPhoneShadowV1(changed, evidence).blockers).toContain(
      "comparison-shadow-current-result-missing",
    );
  });

  it("treats unsupported frame, long-task, memory, and thermal methods as evidence gaps", () => {
    const { evidence, receipt } = fixture();
    const changed = createNarratorNamedPhoneShadowReceiptV1({
      ...receiptFields(receipt),
      observer: {
        frameMethod: "unsupported",
        longTaskMethod: "unsupported",
        memoryMethod: "unsupported",
        thermalMethod: "unsupported",
        batteryMethod: "unsupported",
        memoryInstrumentId: null,
        thermalInstrumentId: null,
        batteryInstrumentId: null,
        externalOperatorId: null,
      },
    });
    expect(evaluateNarratorNamedPhoneShadowV1(changed, evidence).blockers).toEqual(expect.arrayContaining([
      "frame-evidence-unavailable",
      "long-task-evidence-unavailable",
      "memory-evidence-unavailable",
      "thermal-evidence-unavailable",
      "battery-evidence-unavailable",
    ]));
  });

  it("counts every dispatch in freshness and rejects overlapping one-inflight histories", () => {
    const { evidence, receipt } = fixture();
    const cancelled = rehashOpportunity(receipt.opportunities[0]!, {
      resultStatus: "cancelled",
      outputTokens: null,
      outputText: null,
    });
    const changed = createNarratorNamedPhoneShadowReceiptV1({
      ...receiptFields(receipt),
      opportunities: [cancelled, ...receipt.opportunities.slice(1)],
    });
    expect(evaluateNarratorNamedPhoneShadowV1(changed, evidence).currentResultPermille).toBe(978);

    const second = receipt.opportunities[1]!;
    const overlapping = rehashOpportunity(second, {
      fallbackCommittedAtMilliseconds: 1_500,
      dispatchAtMilliseconds: 1_500,
      resultAtMilliseconds: 2_500,
      inferenceIntervals: [{
        startMilliseconds: 1_500,
        endMilliseconds: 1_700,
        memorySamples: [
          { offsetMilliseconds: 1_500, bytes: 390 * 1024 * 1024 },
          { offsetMilliseconds: 1_600, bytes: 400 * 1024 * 1024 },
          { offsetMilliseconds: 1_700, bytes: 395 * 1024 * 1024 },
        ],
      }],
    });
    const impossible = createNarratorNamedPhoneShadowReceiptV1({
      ...receiptFields(receipt),
      opportunities: [receipt.opportunities[0]!, overlapping, ...receipt.opportunities.slice(2)],
    });
    expect(isNarratorNamedPhoneShadowReceiptForEvidenceV1(impossible, evidence)).toBe(false);
  });

  it("blocks dropped observer entries and absolute Workday frame regressions", () => {
    const { evidence, receipt } = fixture();
    const comparison = receipt.phases[1]!;
    const incomplete = rehashPhase(comparison, {
      frameWindows: comparison.frameWindows.map((window, index) => index === 0
        ? { ...window, droppedEntryCount: 1 }
        : window),
      longTaskCoverage: { ...comparison.longTaskCoverage, droppedEntryCount: 1 },
      memoryDroppedEntryCount: 1,
      thermalDroppedEntryCount: 1,
      batteryDroppedEntryCount: 1,
    });
    const workday = receipt.phases[5]!;
    const slowWorkday = rehashPhase(workday, {
      frameWindows: workday.frameWindows.map((window) => ({
        ...window,
        frameIntervalsMicroseconds: Array<number>(130).fill(40_000),
      })),
    });
    const changed = createNarratorNamedPhoneShadowReceiptV1({
      ...receiptFields(receipt),
      phases: [receipt.phases[0]!, incomplete, ...receipt.phases.slice(2, 5), slowWorkday,
        ...receipt.phases.slice(6)],
    });
    expect(evaluateNarratorNamedPhoneShadowV1(changed, evidence).blockers).toEqual(expect.arrayContaining([
      "frame-evidence-incomplete",
      "long-task-evidence-incomplete",
      "memory-evidence-incomplete",
      "thermal-evidence-incomplete",
      "battery-evidence-incomplete",
      "workday-frame-p95-above-25-ms",
      "workday-frame-p99-above-33-ms",
    ]));
  });

  it("rejects incomplete suppression and cache evidence and blocks late-run slowdown", () => {
    const { evidence, receipt } = fixture();
    const badTransition = {
      ...receipt.suppressionTransitions[0]!,
      acceptedLateResultCount: 1 as unknown as 0,
    };
    const incompleteLifecycle = createNarratorNamedPhoneShadowReceiptV1({
      ...receiptFields(receipt),
      suppressionTransitions: [badTransition, receipt.suppressionTransitions[1]!],
    });
    expect(isNarratorNamedPhoneShadowReceiptForEvidenceV1(incompleteLifecycle, evidence)).toBe(false);

    const mismatchedArtifacts = createNarratorNamedPhoneShadowReceiptV1({
      ...receiptFields(receipt),
      observedCachedArtifacts: receipt.observedCachedArtifacts.map((artifact, index) => index === 0
        ? { ...artifact, sha256: "f".repeat(64) }
        : artifact),
    });
    expect(isNarratorNamedPhoneShadowReceiptForEvidenceV1(mismatchedArtifacts, evidence)).toBe(false);

    const stress = receipt.opportunities.filter((entry) => entry.phaseId === receipt.phases[4]!.phaseId);
    const lateOrdinals = new Set(stress.slice(-Math.floor(stress.length / 4)).map((entry) => entry.ordinal));
    const slowed = receipt.opportunities.map((entry) => lateOrdinals.has(entry.ordinal)
      ? rehashOpportunity(entry, { resultAtMilliseconds: entry.dispatchAtMilliseconds + 1_200 })
      : entry);
    const slowReceipt = createNarratorNamedPhoneShadowReceiptV1({
      ...receiptFields(receipt),
      opportunities: slowed,
    });
    expect(evaluateNarratorNamedPhoneShadowV1(slowReceipt, evidence).blockers).toContain(
      "last-quartile-latency-degraded-above-10-percent",
    );
  }, 15_000);

  it("requires suppression at phase onset and the complete declared settlement observation", () => {
    const { evidence, receipt } = fixture();
    const lateTransition = {
      ...receipt.suppressionTransitions[0]!,
      actionAtMilliseconds: narratorShadowSuppressionPhaseMilliseconds - 1,
      workerTerminatedAtMilliseconds: narratorShadowSuppressionPhaseMilliseconds,
    };
    const lateSuppression = createNarratorNamedPhoneShadowReceiptV1({
      ...receiptFields(receipt),
      suppressionTransitions: [lateTransition, receipt.suppressionTransitions[1]!],
    });
    expect(isNarratorNamedPhoneShadowReceiptForEvidenceV1(lateSuppression, evidence)).toBe(false);

    const shortSettlement = createNarratorNamedPhoneShadowReceiptV1({
      ...receiptFields(receipt),
      postDisposalMemoryDurationMilliseconds: 1,
      postDisposalMemorySamples: [
        { offsetMilliseconds: 0, bytes: 205 * 1024 * 1024 },
        { offsetMilliseconds: 1, bytes: 205 * 1024 * 1024 },
      ],
    });
    expect(isNarratorNamedPhoneShadowReceiptForEvidenceV1(shortSettlement, evidence)).toBe(false);
  });

  it("requires measured peak-memory coverage for every load and every dispatched result", () => {
    const { receipt } = fixture();
    const failedWithoutMeasuredWork = rehashOpportunity(receipt.opportunities[0]!, {
      resultStatus: "cancelled",
      outputTokens: null,
      outputText: null,
      inferenceIntervals: [],
    });
    expect(isNarratorShadowOpportunityV1(failedWithoutMeasuredWork, receipt.plan, receipt.phases)).toBe(false);

    const sparseLoad = rehashPhase(receipt.phases[1]!, {
      workerLoadIntervals: [{
        startMilliseconds: 0,
        endMilliseconds: 200,
        memorySamples: [
          { offsetMilliseconds: 0, bytes: 380 * 1024 * 1024 },
          { offsetMilliseconds: 200, bytes: 400 * 1024 * 1024 },
        ],
      }],
    });
    expect(isNarratorShadowPhaseV1(sparseLoad)).toBe(false);
  });

  it("requires exact paired comparison durations and gates incremental battery energy", () => {
    const { evidence, receipt } = fixture();
    const unequal = rehashPhase(receipt.phases[0]!, {
      durationMilliseconds: narratorShadowComparisonPhaseMilliseconds + 1,
    });
    const unequalReceipt = createNarratorNamedPhoneShadowReceiptV1({
      ...receiptFields(receipt),
      phases: [unequal, ...receipt.phases.slice(1)],
    });
    expect(isNarratorNamedPhoneShadowReceiptForEvidenceV1(unequalReceipt, evidence)).toBe(false);

    const highEnergy = receipt.phases.map((phaseValue) => phaseValue.kind === "comparison-shadow"
      ? rehashPhase(phaseValue, {
        energyUsedMilliwattHours: 100 + narratorShadowMaximumAddedEnergyMilliwattHours + 1,
      })
      : phaseValue);
    const highEnergyReceipt = createNarratorNamedPhoneShadowReceiptV1({
      ...receiptFields(receipt),
      phases: highEnergy,
    });
    expect(evaluateNarratorNamedPhoneShadowV1(highEnergyReceipt, evidence).blockers).toContain(
      "battery-energy-budget-exceeded",
    );
  });

  it("rejects any worker activity in Eco or hidden policy phases", () => {
    const { evidence, receipt } = fixture();
    const eco = rehashPhase(receipt.phases[6]!, { workerCreations: 1 });
    const changed = createNarratorNamedPhoneShadowReceiptV1({
      ...receiptFields(receipt),
      phases: [...receipt.phases.slice(0, 6), eco, receipt.phases[7]!],
    });
    expect(isNarratorNamedPhoneShadowReceiptForEvidenceV1(changed, evidence)).toBe(false);
    expect(evaluateNarratorNamedPhoneShadowV1(changed, evidence).blockers).toContain("receipt-invalid");
  });

  it("detects canonical, cutaway, projection, layout, and memory regressions from raw evidence", () => {
    const { evidence, receipt } = fixture();
    const diverged = rehashPhase(receipt.phases[2]!, {
      canonicalCheckpointHashes: ["1".repeat(16), "9".repeat(16)],
      cutawayStartTicks: [10, 21],
      projectionHash: "8".repeat(16),
      layoutShiftMicroUnits: 1,
    });
    const oversized = rehashPhase(receipt.phases[4]!, {
      memorySamples: receipt.phases[4]!.memorySamples.map((sample) => ({
        ...sample,
        bytes: 901 * 1024 * 1024,
      })),
    });
    const changed = createNarratorNamedPhoneShadowReceiptV1({
      ...receiptFields(receipt),
      phases: [receipt.phases[0]!, receipt.phases[1]!, diverged, receipt.phases[3]!, oversized,
        ...receipt.phases.slice(5)],
      postDisposalMemorySamples: receipt.postDisposalMemorySamples.map((sample) => ({
        ...sample,
        bytes: 300 * 1024 * 1024,
      })),
    });
    expect(evaluateNarratorNamedPhoneShadowV1(changed, evidence).blockers).toEqual(expect.arrayContaining([
      "canonical-trace-diverged",
      "cutaway-trace-diverged",
      "projection-trace-diverged",
      "layout-shift-observed",
      "incremental-memory-budget-exceeded",
      "settled-memory-not-recovered",
      "combined-memory-budget-exceeded",
    ]));
  });

  it("rejects altered exact-key receipts and self-certified reports", () => {
    const { evidence, receipt } = fixture();
    expect(isNarratorNamedPhoneShadowReceiptForEvidenceV1({ ...receipt, extra: true }, evidence)).toBe(false);
    expect(isNarratorNamedPhoneShadowReceiptForEvidenceV1({
      ...receipt,
      retainedRawTraceHashes: ["0".repeat(16), ...receipt.retainedRawTraceHashes.slice(1)],
    }, evidence)).toBe(false);
    const report = evaluateNarratorNamedPhoneShadowV1(receipt, evidence);
    expect(isNarratorShadowBenchmarkReportForEvidenceV1({
      ...report,
      disposition: "blocked",
      blockers: ["receipt-invalid"],
    }, receipt, evidence)).toBe(false);
  });
});

describe("developer-only narrator shadow collector worker", () => {
  it("binds initialization exactly and lets run-case carry only a frozen corpus ordinal", () => {
    const { plan } = fixture();
    const initialize = createNarratorShadowCollectorInitializeRequestV1(plan, "epoch:one", "request:init");
    expect(isNarratorShadowCollectorRequestForPlanV1(initialize, plan)).toBe(true);
    expect(Object.isFrozen(initialize)).toBe(true);
    const run = collectorRequest(plan, "epoch:one", "request:run", "run-case", { evaluationCaseOrdinal: 0 });
    expect(isNarratorShadowCollectorRequestForPlanV1(run, plan)).toBe(true);
    expect(isNarratorShadowCollectorRequestForPlanV1({
      ...run,
      payload: { ...run.payload, prompt: narratorEvaluationCasesV1[0]!.prompt },
    }, plan)).toBe(false);
    expect(isNarratorShadowCollectorRequestForPlanV1({ ...initialize, planHash: "f".repeat(16) }, plan)).toBe(false);
  });

  it("runs the exact hidden evaluation lifecycle and resolves the prompt inside the worker", async () => {
    const { evidence, plan } = fixture();
    const model = new CollectorModelFixture(evidence.candidate, plan);
    const worker = new NarratorShadowCollectorWorkerV1(plan, evidence.candidate, model, model);
    const epoch = "epoch:happy";
    expect((await worker.process(createNarratorShadowCollectorInitializeRequestV1(
      plan, epoch, "request:init",
    ))).kind).toBe("status");
    expect((await worker.process(collectorRequest(plan, epoch, "request:verify", "verify-artifacts"))).kind).toBe("artifacts");
    expect((await worker.process(collectorRequest(plan, epoch, "request:load", "load"))).kind).toBe("status");
    const caseRequest = collectorRequest(
      plan, epoch, "request:case", "run-case", { evaluationCaseOrdinal: 0 },
    );
    const result = await worker.process(caseRequest);
    expect(result).toMatchObject({
      kind: "case-result",
      payload: {
        evaluationCaseOrdinal: 0,
        evaluationCaseHash: canonicalHash(narratorEvaluationCasesV1[0]!),
        outputText: narratorEvaluationCasesV1[0]!.allowedOutputs[1],
      },
      modelAdmitted: false,
      displayAuthorized: false,
    });
    expect(isNarratorShadowCollectorResponseForPlanV1(result, plan, caseRequest)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.payload)).toBe(true);
    expect(isNarratorShadowCollectorResponseForPlanV1({ ...result, displayAuthorized: true }, plan, caseRequest)).toBe(false);
    expect(model.runPrompts).toEqual([narratorEvaluationCasesV1[0]!.prompt]);
    expect((await worker.process(collectorRequest(plan, epoch, "request:dispose", "dispose"))).kind).toBe("status");
    expect(worker.state).toBe("disposed");
    expect(model.disposed).toBe(1);
  });

  it("fails closed before load when verified artifacts differ from the candidate", async () => {
    const { evidence, plan } = fixture();
    const model = new CollectorModelFixture(evidence.candidate, plan);
    model.artifacts = (model.artifacts as { path: string; byteLength: number; sha256: string }[]).map((artifact, index) =>
      index === 0 ? { ...artifact, sha256: "f".repeat(64) } : artifact);
    const worker = new NarratorShadowCollectorWorkerV1(plan, evidence.candidate, model, model);
    const epoch = "epoch:artifact-mismatch";
    await worker.process(createNarratorShadowCollectorInitializeRequestV1(plan, epoch, "request:init"));
    const result = await worker.process(collectorRequest(plan, epoch, "request:verify", "verify-artifacts"));
    expect(result).toMatchObject({ kind: "error", payload: { code: "artifact-mismatch" } });
    expect(worker.state).toBe("failed");
    expect(model.terminated).toBe(1);
    expect(await worker.process(collectorRequest(plan, epoch, "request:load", "load"))).toMatchObject({
      kind: "error", payload: { code: "wrong-state" },
    });
  });

  it("rejects a changed candidate manifest even when its public id is reused", async () => {
    const { evidence, plan } = fixture();
    const changedCandidate: NarratorModelCandidateV1 = {
      ...evidence.candidate,
      runtime: { ...evidence.candidate.runtime, version: "4.2.1" },
    };
    const model = new CollectorModelFixture(changedCandidate, plan);
    const worker = new NarratorShadowCollectorWorkerV1(plan, changedCandidate, model, model);
    const result = await worker.process(createNarratorShadowCollectorInitializeRequestV1(
      plan, "epoch:manifest", "request:init",
    ));
    expect(result).toMatchObject({ kind: "error", payload: { code: "identity-mismatch" } });
    expect(worker.state).toBe("available");
  });

  it("enforces one in-flight request, exact duplicate replay, conflict rejection, and hard cancellation", async () => {
    const { evidence, plan } = fixture();
    const model = new CollectorModelFixture(evidence.candidate, plan);
    const lateOutput = deferred<unknown>();
    model.runImplementation = () => lateOutput.promise;
    const worker = new NarratorShadowCollectorWorkerV1(plan, evidence.candidate, model, model);
    const epoch = "epoch:cancellation";
    await worker.process(createNarratorShadowCollectorInitializeRequestV1(plan, epoch, "request:init"));
    await worker.process(collectorRequest(plan, epoch, "request:verify", "verify-artifacts"));
    await worker.process(collectorRequest(plan, epoch, "request:load", "load"));
    const request = collectorRequest(plan, epoch, "request:running", "run-case", { evaluationCaseOrdinal: 0 });
    const running = worker.process(request);
    expect(worker.process(request)).toBe(running);
    expect(await worker.process(collectorRequest(
      plan, epoch, "request:second", "run-case", { evaluationCaseOrdinal: 1 },
    ))).toMatchObject({ kind: "error", payload: { code: "wrong-state" } });
    expect(await worker.process({ ...request, kind: "dispose", payload: {} })).toMatchObject({
      kind: "error", payload: { code: "duplicate-conflict" },
    });
    expect(await worker.process(collectorRequest(
      plan, epoch, "request:cancel", "cancel", { targetRequestId: request.requestId },
    ))).toMatchObject({ kind: "status", payload: { state: "terminated", code: "cancelled" } });
    expect(model.runPrompts).toHaveLength(1);
    lateOutput.resolve(narratorEvaluationCasesV1[0]!.allowedOutputs[1]!);
    expect(await running).toMatchObject({ kind: "error", payload: { code: "cancelled" } });
    expect(model.terminated).toBe(1);
  });

  it("rejects stale, impossible, and artifact-substitution responses even after rehashing", async () => {
    const { evidence, plan } = fixture();
    const model = new CollectorModelFixture(evidence.candidate, plan);
    const worker = new NarratorShadowCollectorWorkerV1(plan, evidence.candidate, model, model);
    const epoch = "epoch:response-binding";
    const initialize = createNarratorShadowCollectorInitializeRequestV1(plan, epoch, "request:init");
    const initialized = await worker.process(initialize);
    expect(isNarratorShadowCollectorResponseForPlanV1(initialized, plan, initialize)).toBe(true);

    const { contentHash: _statusHash, ...statusContent } = initialized;
    const impossibleStatusContent = {
      ...statusContent,
      payload: { state: "ready", code: "cancelled" },
    };
    const impossibleStatus = {
      ...impossibleStatusContent,
      contentHash: canonicalHash(impossibleStatusContent),
    };
    expect(isNarratorShadowCollectorResponseForPlanV1(impossibleStatus, plan, initialize)).toBe(false);

    const verify = collectorRequest(plan, epoch, "request:verify", "verify-artifacts");
    const artifacts = await worker.process(verify);
    expect(isNarratorShadowCollectorResponseForPlanV1(artifacts, plan, verify)).toBe(true);
    const { contentHash: _artifactHash, ...artifactContent } = artifacts;
    const substitutedContent = { ...artifactContent, payload: { artifacts: [] } };
    const substituted = { ...substitutedContent, contentHash: canonicalHash(substitutedContent) };
    expect(isNarratorShadowCollectorResponseForPlanV1(substituted, plan, verify)).toBe(false);
    expect(isNarratorShadowCollectorResponseForPlanV1(artifacts, plan, {
      ...verify,
      requestId: "request:stale",
    })).toBe(false);
  });

  it("meters frozen prompts and raw outputs inside the runtime instead of trusting model counts", async () => {
    for (const budget of ["input", "output"] as const) {
      const { evidence, plan } = fixture();
      const model = new CollectorModelFixture(evidence.candidate, plan);
      if (budget === "input") model.inputTokens = 321;
      else model.outputTokens = 49;
      const worker = new NarratorShadowCollectorWorkerV1(plan, evidence.candidate, model, model);
      const epoch = `epoch:${budget}-budget`;
      await worker.process(createNarratorShadowCollectorInitializeRequestV1(plan, epoch, "request:init"));
      await worker.process(collectorRequest(plan, epoch, "request:verify", "verify-artifacts"));
      await worker.process(collectorRequest(plan, epoch, "request:load", "load"));
      const result = await worker.process(collectorRequest(
        plan, epoch, "request:run", "run-case", { evaluationCaseOrdinal: 0 },
      ));
      expect(result).toMatchObject({ kind: "error", payload: { code: "invalid-output" } });
      expect(worker.state).toBe("failed");
      expect(model.runPrompts).toHaveLength(budget === "input" ? 0 : 1);
    }
  });

  it("rejects any model or tokenizer port whose frozen binding tuple differs from the plan", async () => {
    const { evidence, plan } = fixture();
    const model = new CollectorModelFixture(evidence.candidate, plan);
    (model as unknown as { binding: NarratorShadowCollectorBindingV1 }).binding = Object.freeze({
      ...model.binding,
      decodingHash: "f".repeat(16),
    });
    const worker = new NarratorShadowCollectorWorkerV1(plan, evidence.candidate, model, model);
    expect(await worker.process(createNarratorShadowCollectorInitializeRequestV1(
      plan, "epoch:binding", "request:init",
    ))).toMatchObject({ kind: "error", payload: { code: "identity-mismatch" } });
  });

  it("fails closed on device loss during verification, loading, or generation", async () => {
    for (const phase of ["verify", "load", "run"] as const) {
      const { evidence, plan } = fixture();
      const model = new CollectorModelFixture(evidence.candidate, plan);
      const lost = () => Promise.reject(new NarratorShadowCollectorDeviceLostError());
      if (phase === "verify") model.verifyImplementation = lost;
      if (phase === "load") model.loadImplementation = lost;
      if (phase === "run") model.runImplementation = lost;
      const worker = new NarratorShadowCollectorWorkerV1(plan, evidence.candidate, model, model);
      const epoch = `epoch:device-${phase}`;
      await worker.process(createNarratorShadowCollectorInitializeRequestV1(plan, epoch, "request:init"));
      let result = await worker.process(collectorRequest(plan, epoch, "request:verify", "verify-artifacts"));
      if (phase !== "verify") result = await worker.process(collectorRequest(plan, epoch, "request:load", "load"));
      if (phase === "run") result = await worker.process(collectorRequest(
        plan, epoch, "request:run", "run-case", { evaluationCaseOrdinal: 0 },
      ));
      expect(result).toMatchObject({ kind: "error", payload: { code: "device-lost" } });
      expect(worker.state).toBe("failed");
      expect(model.terminated).toBe(1);
    }
  });

  it("reserves disposal exclusively, rejects concurrent work, and disposes idempotently", async () => {
    const { evidence, plan } = fixture();
    const model = new CollectorModelFixture(evidence.candidate, plan);
    const disposal = deferred<void>();
    model.disposeImplementation = () => disposal.promise;
    const worker = new NarratorShadowCollectorWorkerV1(plan, evidence.candidate, model, model);
    const epoch = "epoch:disposal";
    await worker.process(createNarratorShadowCollectorInitializeRequestV1(plan, epoch, "request:init"));
    const disposeRequest = collectorRequest(plan, epoch, "request:dispose", "dispose");
    const disposing = worker.process(disposeRequest);
    expect(worker.state).toBe("disposing");
    expect(await worker.process(collectorRequest(
      plan, epoch, "request:cancel-disposal", "cancel", { targetRequestId: disposeRequest.requestId },
    ))).toMatchObject({ kind: "error", payload: { code: "wrong-state" } });
    expect(worker.state).toBe("disposing");
    expect(await worker.process(collectorRequest(plan, epoch, "request:dispose-two", "dispose"))).toMatchObject({
      kind: "error", payload: { code: "wrong-state" },
    });
    expect(await worker.process(collectorRequest(plan, epoch, "request:verify", "verify-artifacts"))).toMatchObject({
      kind: "error", payload: { code: "wrong-state" },
    });
    disposal.resolve();
    expect(await disposing).toMatchObject({ kind: "status", payload: { state: "disposed", code: "disposed" } });
    expect(await worker.process(collectorRequest(plan, epoch, "request:dispose-three", "dispose"))).toMatchObject({
      kind: "status", payload: { state: "disposed", code: "disposed" },
    });
    expect(model.disposed).toBe(1);
  });

  it("never evicts replay identities and fails closed at the plan-derived request ceiling", async () => {
    const { evidence, plan } = fixture();
    const model = new CollectorModelFixture(evidence.candidate, plan);
    const worker = new NarratorShadowCollectorWorkerV1(plan, evidence.candidate, model, model);
    const epoch = "epoch:request-budget";
    const initialize = createNarratorShadowCollectorInitializeRequestV1(plan, epoch, "request:init");
    const first = worker.process(initialize);
    await first;
    const budget = narratorShadowCollectorRequestBudgetV1(plan);
    for (let ordinal = 1; ordinal < budget; ordinal += 1) {
      expect(await worker.process(collectorRequest(
        plan, epoch, `request:flood:${ordinal}`, "load",
      ))).toMatchObject({ kind: "error", payload: { code: "wrong-state" } });
    }
    expect(worker.process(initialize)).toBe(first);
    expect(await worker.process(collectorRequest(
      plan, epoch, "request:over-budget", "load",
    ))).toMatchObject({ kind: "error", payload: { code: "request-budget-exceeded" } });
  });

  it("hard-terminates on disposal rejection and suppresses late work when disposal interrupts it", async () => {
    const rejectedFixture = fixture();
    const rejectedModel = new CollectorModelFixture(rejectedFixture.evidence.candidate, rejectedFixture.plan);
    rejectedModel.disposeImplementation = () => Promise.reject(new NarratorShadowCollectorDeviceLostError());
    const rejectedWorker = new NarratorShadowCollectorWorkerV1(
      rejectedFixture.plan, rejectedFixture.evidence.candidate, rejectedModel, rejectedModel,
    );
    const rejectedEpoch = "epoch:dispose-rejected";
    await rejectedWorker.process(createNarratorShadowCollectorInitializeRequestV1(
      rejectedFixture.plan, rejectedEpoch, "request:init",
    ));
    expect(await rejectedWorker.process(collectorRequest(
      rejectedFixture.plan, rejectedEpoch, "request:dispose", "dispose",
    ))).toMatchObject({ kind: "error", payload: { code: "device-lost" } });
    expect(rejectedWorker.state).toBe("failed");
    expect(rejectedModel.terminated).toBe(1);

    const activeFixture = fixture();
    const activeModel = new CollectorModelFixture(activeFixture.evidence.candidate, activeFixture.plan);
    const lateOutput = deferred<unknown>();
    activeModel.runImplementation = () => lateOutput.promise;
    const activeWorker = new NarratorShadowCollectorWorkerV1(
      activeFixture.plan, activeFixture.evidence.candidate, activeModel, activeModel,
    );
    const activeEpoch = "epoch:dispose-active";
    await activeWorker.process(createNarratorShadowCollectorInitializeRequestV1(
      activeFixture.plan, activeEpoch, "request:init",
    ));
    await activeWorker.process(collectorRequest(activeFixture.plan, activeEpoch, "request:verify", "verify-artifacts"));
    await activeWorker.process(collectorRequest(activeFixture.plan, activeEpoch, "request:load", "load"));
    const running = activeWorker.process(collectorRequest(
      activeFixture.plan, activeEpoch, "request:run", "run-case", { evaluationCaseOrdinal: 0 },
    ));
    await Promise.resolve();
    expect(await activeWorker.process(collectorRequest(
      activeFixture.plan, activeEpoch, "request:dispose", "dispose",
    ))).toMatchObject({ kind: "status", payload: { state: "disposed", code: "disposed" } });
    lateOutput.resolve(narratorEvaluationCasesV1[0]!.allowedOutputs[1]!);
    expect(await running).toMatchObject({ kind: "error", payload: { code: "cancelled" } });
    expect(activeModel.terminated).toBe(1);
  });
});
