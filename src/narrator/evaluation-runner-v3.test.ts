import { describe, expect, it } from "vitest";
import observedReceipt from "../../docs/narrator/t5-artifact-publication-receipt.json";
import {
  createNarratorEvaluationRunSpecV3,
  createNarratorEvaluationWorkerBindingV3,
  type NarratorEvaluationRunSpecV3,
} from "./evaluation-contract-v3";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  NarratorEvaluationDeviceLostError,
  type NarratorEvaluationClock,
  type NarratorEvaluationWatchdog,
} from "./evaluation-runner";
import {
  runNarratorEvaluationV3,
  type NarratorEvaluationWorkerPortV3,
} from "./evaluation-runner-v3";
import {
  accountNarratorFormTargetsV3,
  allowedNarratorFormTokenIdsV3,
  narratorFloat32ToBitsV3,
  narratorFormsV3,
  renderNarratorFormV3,
  type NarratorFormSelectionTraceStepV3,
  type NarratorFormTargetSetV3,
} from "./evaluation-selection-contract-v3";
import {
  createNarratorEvaluationWorkerCaseResponseV3,
  type NarratorEvaluationTargetObservationV3,
  type NarratorEvaluationWorkerCaseRequestV3,
  type NarratorEvaluationWorkerCaseResponseV3,
  type NarratorEvaluationWorkerResponseFieldsV3,
} from "./evaluation-worker-protocol-v3";
import type { NarratorModelCandidate } from "./model-candidate";
import {
  createNarratorT5PublishedCandidateV1,
  isNarratorT5ArtifactPublicationReceiptV1,
  type NarratorT5ArtifactPublicationReceiptV1,
} from "./t5-publication-evidence";

function candidate(): NarratorModelCandidate {
  expect(isNarratorT5ArtifactPublicationReceiptV1(observedReceipt)).toBe(true);
  return createNarratorT5PublishedCandidateV1(
    observedReceipt as NarratorT5ArtifactPublicationReceiptV1,
  );
}

function clock(): NarratorEvaluationClock {
  let current = 0;
  return {
    now: () => current++,
    setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
}

function targetObservations(
  request: NarratorEvaluationWorkerCaseRequestV3,
): readonly NarratorEvaluationTargetObservationV3[] {
  const prompt = narratorEvaluationCasesV1[request.ordinal]!.prompt;
  const forms = new Map(narratorFormsV3(prompt).map((form) => [form.formId, form]));
  return request.eligibility.eligibleFormIds.map((formId) => {
    const form = forms.get(formId)!;
    return {
      formId,
      tokenIds: [...form.targetTokenIds],
      decodedWitness: form.witness,
    };
  });
}

function traceFor(
  request: NarratorEvaluationWorkerCaseRequestV3,
  targetSet: NarratorFormTargetSetV3,
  selectionTokenIds: readonly number[],
): readonly NarratorFormSelectionTraceStepV3[] {
  const prompt = narratorEvaluationCasesV1[request.ordinal]!.prompt;
  const prefix: number[] = [];
  return selectionTokenIds.map((emittedTokenId) => {
    const allowedTokenIds = allowedNarratorFormTokenIdsV3(
      prompt,
      request.eligibility,
      targetSet,
      prefix,
    );
    const step = {
      prefixTokenIds: [...prefix],
      allowedTokenIds: [...allowedTokenIds],
      allowedScoreBits: allowedTokenIds.map((tokenId) =>
        narratorFloat32ToBitsV3(tokenId === emittedTokenId ? 2 : -2)),
      emittedTokenId,
    };
    prefix.push(emittedTokenId);
    return step;
  });
}

function selectedFields(
  request: NarratorEvaluationWorkerCaseRequestV3,
): NarratorEvaluationWorkerResponseFieldsV3 {
  const observations = targetObservations(request);
  const prompt = narratorEvaluationCasesV1[request.ordinal]!.prompt;
  const targetSet = accountNarratorFormTargetsV3(prompt, request.eligibility, observations);
  const selected = targetSet.targets.find((target) =>
    target.formId !== request.eligibility.baselineFormId) ?? targetSet.targets[0]!;
  return {
    outcome: "selected",
    inputTokenIds: [9, 1],
    observedInputTokens: null,
    targetObservations: observations,
    fullDecoderTokenIds: [0, ...selected.tokenIds],
    selectionTrace: traceFor(request, targetSet, selected.tokenIds),
  };
}

function promptFormatErrorFields(): NarratorEvaluationWorkerResponseFieldsV3 {
  return {
    outcome: "prompt-format-error",
    inputTokenIds: null,
    observedInputTokens: null,
    targetObservations: null,
    fullDecoderTokenIds: null,
    selectionTrace: null,
  };
}

type ResultPlan = (
  request: NarratorEvaluationWorkerCaseRequestV3,
) => NarratorEvaluationWorkerResponseFieldsV3;

class WorkerFixture implements NarratorEvaluationWorkerPortV3 {
  readonly workerEpoch = "worker-epoch:v3:test";
  readonly requests: NarratorEvaluationWorkerCaseRequestV3[] = [];
  readonly responses: NarratorEvaluationWorkerCaseResponseV3[] = [];
  terminated = false;
  disposed = false;
  terminationAttempts = 0;
  throwDeviceAt: number | null = null;
  throwAt: number | null = null;
  malformedAt: number | null = null;
  artifactEvidence: unknown = undefined;
  disposeError: "error" | "device-lost" | null = null;
  terminateError = false;
  plans = new Map<number, ResultPlan>();
  fallbackPlan: ResultPlan = selectedFields;

  constructor(
    readonly modelId: string,
    private readonly model: NarratorModelCandidate,
    private readonly runSpec: NarratorEvaluationRunSpecV3,
  ) {}

  async handshake(): Promise<unknown> {
    return createNarratorEvaluationWorkerBindingV3(this.runSpec, this.model);
  }

  async verifyArtifacts(): Promise<unknown> {
    if (this.artifactEvidence !== undefined) return this.artifactEvidence;
    return this.model.artifacts.map(({ path, byteLength, sha256 }) => ({
      path,
      byteLength,
      sha256,
    }));
  }

  async load(): Promise<void> {}

  async evaluate(request: NarratorEvaluationWorkerCaseRequestV3): Promise<unknown> {
    this.requests.push(request);
    if (request.ordinal === this.throwDeviceAt) throw new NarratorEvaluationDeviceLostError();
    if (request.ordinal === this.throwAt) throw new Error("worker transport rejected");
    if (request.ordinal === this.malformedAt) return { schemaVersion: 3, surprise: true };
    const response = createNarratorEvaluationWorkerCaseResponseV3(
      request,
      this.plans.get(request.ordinal)?.(request) ?? this.fallbackPlan(request),
    );
    this.responses.push(response);
    return response;
  }

  async dispose(): Promise<void> {
    if (this.disposeError === "device-lost") throw new NarratorEvaluationDeviceLostError();
    if (this.disposeError === "error") throw new Error("dispose rejected");
    this.disposed = true;
  }

  terminate(): void {
    this.terminationAttempts += 1;
    if (this.terminateError) throw new Error("termination request rejected");
    this.terminated = true;
  }
}

describe("narrator V3 evaluation runner", () => {
  it("runs 200 chained cases and derives only host-rendered prose from valid raw selections", async () => {
    const model = candidate();
    const runSpec = createNarratorEvaluationRunSpecV3(model, "run:v3:runner-success");
    const worker = new WorkerFixture(model.candidateId, model, runSpec);
    let epochReads = 0;
    let modelReads = 0;
    Object.defineProperty(worker, "workerEpoch", {
      configurable: true,
      get: () => {
        epochReads += 1;
        return epochReads === 1 ? "worker-epoch:v3:snapshot" : "worker-epoch:v3:changed";
      },
    });
    Object.defineProperty(worker, "modelId", {
      configurable: true,
      get: () => {
        modelReads += 1;
        return modelReads === 1 ? model.candidateId : "changed/model";
      },
    });
    const receipt = await runNarratorEvaluationV3(
      model,
      runSpec,
      worker,
      clock(),
      new AbortController().signal,
    );

    expect(receipt.load.status).toBe("ok");
    expect(receipt.dispose.status).toBe("ok");
    expect(receipt.termination.status).toBe("not-requested");
    expect(receipt.rows).toHaveLength(200);
    expect(worker.requests).toHaveLength(200);
    expect(worker.responses).toHaveLength(200);
    expect(epochReads).toBe(1);
    expect(modelReads).toBe(1);
    expect(receipt.workerEpoch).toBe("worker-epoch:v3:snapshot");
    expect(worker.requests.map((request) => request.ordinal))
      .toEqual(Array.from({ length: 200 }, (_, ordinal) => ordinal));
    expect(new Set(worker.requests.map((request) => request.requestId)).size).toBe(200);

    for (let ordinal = 0; ordinal < receipt.rows.length; ordinal += 1) {
      const row = receipt.rows[ordinal]!;
      const request = worker.requests[ordinal]!;
      const response = worker.responses[ordinal]!;
      expect(row.status).toBe("ok");
      if (row.status !== "ok") throw new Error("Expected a successful synthetic V3 row");
      expect(row.requestHash).toBe(request.contentHash);
      expect(row.workerResponseHash).toBe(response.contentHash);
      expect(row.selectedFormId).toBe(row.selection.selectedFormId);
      expect(row.renderedText).toBe(renderNarratorFormV3(
        narratorEvaluationCasesV1[ordinal]!.prompt,
        row.selectedFormId,
      ));
      expect(Object.hasOwn(request, "prompt")).toBe(false);
      for (const forbidden of ["selectedFormId", "decodedText", "renderedText", "selection"]) {
        expect(Object.hasOwn(response, forbidden)).toBe(false);
      }
      if (ordinal === 0) {
        expect(request.priorWorkerResponseHash).toBeNull();
      } else {
        expect(request.priorWorkerResponseHash).toBe(worker.responses[ordinal - 1]!.contentHash);
      }
      if (ordinal % 2 === 0) {
        expect(request.eligibility.priorSelectedFormId).toBeNull();
      } else {
        const prior = receipt.rows[ordinal - 1]!;
        if (prior.status !== "ok") throw new Error("Expected a successful prior synthetic V3 row");
        expect(request.eligibility.priorSelectedFormId).toBe(prior.selectedFormId);
      }
    }
    expect(worker.disposed).toBe(true);
    expect(worker.terminated).toBe(false);
  }, 60_000);

  it("maps every worker evidence outcome and retains both validated envelopes", async () => {
    const model = candidate();
    const runSpec = createNarratorEvaluationRunSpecV3(model, "run:v3:runner-stages");
    const worker = new WorkerFixture(model.candidateId, model, runSpec);
    worker.fallbackPlan = promptFormatErrorFields;
    worker.plans.set(0, promptFormatErrorFields);
    worker.plans.set(1, () => ({
      outcome: "input-tokenizer-error",
      inputTokenIds: null,
      observedInputTokens: null,
      targetObservations: null,
      fullDecoderTokenIds: null,
      selectionTrace: null,
    }));
    worker.plans.set(2, () => ({
      outcome: "input-token-contract-error",
      inputTokenIds: [9],
      observedInputTokens: null,
      targetObservations: null,
      fullDecoderTokenIds: null,
      selectionTrace: null,
    }));
    worker.plans.set(3, () => ({
      outcome: "input-budget",
      inputTokenIds: null,
      observedInputTokens: 321,
      targetObservations: null,
      fullDecoderTokenIds: null,
      selectionTrace: null,
    }));
    worker.plans.set(4, () => ({
      outcome: "target-tokenizer-error",
      inputTokenIds: [9, 1],
      observedInputTokens: null,
      targetObservations: null,
      fullDecoderTokenIds: null,
      selectionTrace: null,
    }));
    worker.plans.set(5, (request) => ({
      outcome: "target-token-contract-error",
      inputTokenIds: [9, 1],
      observedInputTokens: null,
      targetObservations: [{
        ...targetObservations(request)[0]!,
        tokenIds: [9, 1],
      }],
      fullDecoderTokenIds: null,
      selectionTrace: null,
    }));
    worker.plans.set(6, (request) => ({
      outcome: "generation-error",
      inputTokenIds: [9, 1],
      observedInputTokens: null,
      targetObservations: targetObservations(request),
      fullDecoderTokenIds: null,
      selectionTrace: null,
    }));
    worker.plans.set(7, (request) => ({
      ...selectedFields(request),
      outcome: "selection-contract-error",
      fullDecoderTokenIds: [0],
      selectionTrace: [],
    }));
    worker.plans.set(8, selectedFields);

    const receipt = await runNarratorEvaluationV3(
      model,
      runSpec,
      worker,
      clock(),
      new AbortController().signal,
    );
    expect(receipt.rows.slice(0, 9).map((row) => row.status)).toEqual([
      "prompt-format-error",
      "input-tokenizer-error",
      "input-token-contract-error",
      "input-budget",
      "target-tokenizer-error",
      "target-token-contract-error",
      "generation-error",
      "selection-contract-error",
      "ok",
    ]);
    for (const row of receipt.rows.slice(0, 8)) {
      expect(row.request).not.toBeNull();
      expect(row.response).not.toBeNull();
      expect(row.requestHash).toBe(row.request?.contentHash);
      expect(row.workerResponseHash).toBe(row.response?.contentHash);
      expect(row.selection).toBeNull();
      expect(row.selectedFormId).toBeNull();
      expect(row.renderedText).toBeNull();
    }
    expect(receipt.rows.slice(9).every((row) => row.status === "prompt-format-error")).toBe(true);
    expect(worker.requests).toHaveLength(200);
    expect(worker.disposed).toBe(true);
  }, 30_000);

  it("terminates one malformed response and marks every later case not run", async () => {
    const model = candidate();
    const runSpec = createNarratorEvaluationRunSpecV3(model, "run:v3:runner-malformed");
    const worker = new WorkerFixture(model.candidateId, model, runSpec);
    worker.malformedAt = 3;
    const receipt = await runNarratorEvaluationV3(
      model,
      runSpec,
      worker,
      clock(),
      new AbortController().signal,
    );
    expect(receipt.rows[3]).toMatchObject({
      status: "worker-response-invalid",
      response: null,
      selectedFormId: null,
      renderedText: null,
    });
    expect(receipt.rows[3]!.request).not.toBeNull();
    expect(receipt.rows.slice(4).every((row) =>
      row.status === "not-run" && row.request === null && row.response === null)).toBe(true);
    expect(worker.requests).toHaveLength(4);
    expect(worker.terminated).toBe(true);
    expect(worker.disposed).toBe(false);
    expect(receipt.dispose.status).toBe("not-attempted");
    expect(receipt.termination.status).toBe("requested");
  });

  it("records model identity and artifact failures without case execution", async () => {
    const model = candidate();

    const identitySpec = createNarratorEvaluationRunSpecV3(model, "run:v3:runner-model-id");
    const identityWorker = new WorkerFixture("wrong/model", model, identitySpec);
    const identity = await runNarratorEvaluationV3(
      model,
      identitySpec,
      identityWorker,
      clock(),
      new AbortController().signal,
    );
    expect(identity.load).toMatchObject({ stage: "model-identity", status: "model-id-mismatch" });
    expect(identity.rows.every((row) => row.status === "not-run")).toBe(true);
    expect(identity.termination.status).toBe("requested");

    const mismatchSpec = createNarratorEvaluationRunSpecV3(model, "run:v3:runner-artifact-mismatch");
    const mismatchWorker = new WorkerFixture(model.candidateId, model, mismatchSpec);
    mismatchWorker.artifactEvidence = [];
    const mismatch = await runNarratorEvaluationV3(
      model,
      mismatchSpec,
      mismatchWorker,
      clock(),
      new AbortController().signal,
    );
    expect(mismatch.load).toMatchObject({
      stage: "artifact-verification",
      status: "artifact-mismatch",
    });
    expect(mismatch.verifiedArtifacts).toEqual([]);
    expect(mismatch.rows.every((row) => row.status === "not-run")).toBe(true);

    const invalidSpec = createNarratorEvaluationRunSpecV3(model, "run:v3:runner-artifact-invalid");
    const invalidWorker = new WorkerFixture(model.candidateId, model, invalidSpec);
    invalidWorker.artifactEvidence = Array(1);
    const invalid = await runNarratorEvaluationV3(
      model,
      invalidSpec,
      invalidWorker,
      clock(),
      new AbortController().signal,
    );
    expect(invalid.load).toMatchObject({
      stage: "artifact-verification",
      status: "artifact-evidence-invalid",
    });
    expect(invalid.verifiedArtifacts).toEqual([]);
    expect(invalid.rows.every((row) => row.status === "not-run")).toBe(true);
  }, 30_000);

  it("hard-terminates transport error, device loss, timeout, and abort", async () => {
    const model = candidate();

    const callSpec = createNarratorEvaluationRunSpecV3(model, "run:v3:runner-call-error");
    const callWorker = new WorkerFixture(model.candidateId, model, callSpec);
    callWorker.throwAt = 2;
    const call = await runNarratorEvaluationV3(
      model,
      callSpec,
      callWorker,
      clock(),
      new AbortController().signal,
    );
    expect(call.rows[2]!.status).toBe("worker-call-error");
    expect(call.rows.slice(3).every((row) => row.status === "not-run")).toBe(true);
    expect(call.termination.status).toBe("requested");

    const deviceSpec = createNarratorEvaluationRunSpecV3(model, "run:v3:runner-device");
    const deviceWorker = new WorkerFixture(model.candidateId, model, deviceSpec);
    deviceWorker.throwDeviceAt = 2;
    const device = await runNarratorEvaluationV3(
      model,
      deviceSpec,
      deviceWorker,
      clock(),
      new AbortController().signal,
    );
    expect(device.rows[2]!.status).toBe("device-lost");
    expect(device.rows.slice(3).every((row) => row.status === "not-run")).toBe(true);

    const timeoutSpec = createNarratorEvaluationRunSpecV3(model, "run:v3:runner-timeout");
    const timeoutWorker = new WorkerFixture(model.candidateId, model, timeoutSpec);
    let operation = 0;
    const timeoutWatchdog: NarratorEvaluationWatchdog = {
      async run(_milliseconds, _signal, action) {
        operation += 1;
        if (operation === 4) return { status: "timeout" };
        return { status: "completed", value: await action(new AbortController().signal) };
      },
    };
    const timeout = await runNarratorEvaluationV3(
      model,
      timeoutSpec,
      timeoutWorker,
      clock(),
      new AbortController().signal,
      timeoutWatchdog,
    );
    expect(timeout.rows[0]!.status).toBe("case-timeout");
    expect(timeout.rows.slice(1).every((row) => row.status === "not-run")).toBe(true);

    const abortSpec = createNarratorEvaluationRunSpecV3(model, "run:v3:runner-abort");
    const abortWorker = new WorkerFixture(model.candidateId, model, abortSpec);
    const controller = new AbortController();
    controller.abort();
    const aborted = await runNarratorEvaluationV3(
      model,
      abortSpec,
      abortWorker,
      clock(),
      controller.signal,
    );
    expect(aborted.load.status).toBe("aborted");
    expect(aborted.rows[0]!.status).toBe("run-aborted");
    expect(aborted.rows.slice(1).every((row) => row.status === "not-run")).toBe(true);
    expect(aborted.termination.status).toBe("requested");
  }, 30_000);

  it("records dispose and termination request failures honestly", async () => {
    const model = candidate();

    const disposeSpec = createNarratorEvaluationRunSpecV3(model, "run:v3:runner-dispose-error");
    const disposeWorker = new WorkerFixture(model.candidateId, model, disposeSpec);
    disposeWorker.fallbackPlan = promptFormatErrorFields;
    disposeWorker.disposeError = "device-lost";
    const dispose = await runNarratorEvaluationV3(
      model,
      disposeSpec,
      disposeWorker,
      clock(),
      new AbortController().signal,
    );
    expect(dispose.dispose.status).toBe("device-lost");
    expect(dispose.termination.status).toBe("requested");
    expect(disposeWorker.terminationAttempts).toBe(1);

    const terminationSpec = createNarratorEvaluationRunSpecV3(
      model,
      "run:v3:runner-termination-error",
    );
    const terminationWorker = new WorkerFixture(model.candidateId, model, terminationSpec);
    terminationWorker.malformedAt = 0;
    terminationWorker.terminateError = true;
    const termination = await runNarratorEvaluationV3(
      model,
      terminationSpec,
      terminationWorker,
      clock(),
      new AbortController().signal,
    );
    expect(termination.rows[0]!.status).toBe("worker-response-invalid");
    expect(termination.dispose.status).toBe("not-attempted");
    expect(termination.termination.status).toBe("request-error");
    expect(terminationWorker.terminationAttempts).toBe(1);
  }, 30_000);
});
