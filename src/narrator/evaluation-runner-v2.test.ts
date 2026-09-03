import { describe, expect, it } from "vitest";
import observedReceipt from "../../docs/narrator/t5-artifact-publication-receipt.json";
import { canonicalHash } from "../core/canonical";
import {
  createNarratorEvaluationRunSpecV2,
  createNarratorEvaluationWorkerBindingV2,
  type NarratorEvaluationRunSpecV2,
} from "./evaluation-contract-v2";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  NarratorEvaluationDeviceLostError,
  type NarratorEvaluationClock,
  type NarratorEvaluationWatchdog,
} from "./evaluation-runner";
import {
  runNarratorEvaluationV2,
  type NarratorEvaluationWorkerPortV2,
} from "./evaluation-runner-v2";
import {
  createNarratorEvaluationWorkerCaseResponseV2,
  type NarratorEvaluationWorkerCaseRequestV2,
  type NarratorEvaluationWorkerOutcomeV2,
} from "./evaluation-worker-protocol-v2";
import type { NarratorModelCandidate } from "./model-candidate";
import {
  createNarratorT5PublishedCandidateV1,
  isNarratorT5ArtifactPublicationReceiptV1,
  type NarratorT5ArtifactPublicationReceiptV1,
} from "./t5-publication-evidence";

function candidate(): NarratorModelCandidate {
  expect(isNarratorT5ArtifactPublicationReceiptV1(observedReceipt)).toBe(true);
  return createNarratorT5PublishedCandidateV1(observedReceipt as NarratorT5ArtifactPublicationReceiptV1);
}

function clock(): NarratorEvaluationClock {
  let current = 0;
  return {
    now: () => current++,
    setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
}

interface ResultPlan {
  readonly outcome: NarratorEvaluationWorkerOutcomeV2;
  readonly inputTokenIds: readonly number[] | null;
  readonly observedInputTokens?: number | null;
  readonly fullDecoderTokenIds: readonly number[] | null;
  readonly decodedText: string | null;
}

class WorkerFixture implements NarratorEvaluationWorkerPortV2 {
  readonly workerEpoch = "worker-epoch:test";
  readonly requests: NarratorEvaluationWorkerCaseRequestV2[] = [];
  terminated = false;
  disposed = false;
  terminationAttempts = 0;
  throwDeviceAt: number | null = null;
  throwAt: number | null = null;
  malformedAt: number | null = null;
  sparseAt: number | null = null;
  artifactEvidence: unknown = undefined;
  disposeError = false;
  terminateError = false;
  plans = new Map<number, ResultPlan>();

  constructor(
    readonly modelId: string,
    private readonly model: NarratorModelCandidate,
    private readonly runSpec: NarratorEvaluationRunSpecV2,
  ) {}

  async handshake(): Promise<unknown> {
    return createNarratorEvaluationWorkerBindingV2(this.runSpec, this.model);
  }

  async verifyArtifacts(): Promise<unknown> {
    if (this.artifactEvidence !== undefined) return this.artifactEvidence;
    return this.model.artifacts.map(({ path, byteLength, sha256 }) => ({ path, byteLength, sha256 }));
  }

  async load(): Promise<void> {}

  async evaluate(request: NarratorEvaluationWorkerCaseRequestV2): Promise<unknown> {
    this.requests.push(request);
    if (request.ordinal === this.throwDeviceAt) throw new NarratorEvaluationDeviceLostError();
    if (request.ordinal === this.throwAt) throw new Error("worker transport rejected");
    if (request.ordinal === this.malformedAt) return { schemaVersion: 2, surprise: true };
    const planned = this.plans.get(request.ordinal);
    const response = createNarratorEvaluationWorkerCaseResponseV2(request, planned ?? {
      outcome: "generated",
      inputTokenIds: [1000 + request.ordinal, 1],
      fullDecoderTokenIds: [0, 2000 + request.ordinal, 1],
      decodedText: narratorEvaluationCasesV1[request.ordinal]!.allowedOutputs[1]!,
    });
    if (request.ordinal !== this.sparseAt) return response;
    const sparseInput = Array<number>(2);
    sparseInput[1] = 1;
    const { contentHash: _contentHash, ...content } = response;
    const sparseContent = { ...content, inputTokenIds: sparseInput };
    return { ...sparseContent, contentHash: canonicalHash(sparseContent) };
  }

  async dispose(): Promise<void> {
    if (this.disposeError) throw new Error("dispose rejected");
    this.disposed = true;
  }

  terminate(): void {
    this.terminationAttempts += 1;
    if (this.terminateError) throw new Error("termination request rejected");
    this.terminated = true;
  }
}

describe("narrator V2 evaluation runner", () => {
  it("runs 200 ordered identity-only cases and derives counts from raw ids", async () => {
    const model = candidate();
    const runSpec = createNarratorEvaluationRunSpecV2(model, "run:v2:runner-success");
    const worker = new WorkerFixture(model.candidateId, model, runSpec);
    const receipt = await runNarratorEvaluationV2(
      model, runSpec, worker, clock(), new AbortController().signal,
    );
    expect(receipt.load.status).toBe("ok");
    expect(receipt.dispose.status).toBe("ok");
    expect(receipt.rows).toHaveLength(200);
    expect(receipt.rows.every((row) => row.status === "ok")).toBe(true);
    expect(receipt.rows[0]).toMatchObject({ inputTokens: 2, outputTokens: 2, generationStopReason: "model-eos" });
    expect(worker.requests.map((request) => request.ordinal)).toEqual(Array.from({ length: 200 }, (_, index) => index));
    expect(worker.requests.every((request) => !Object.hasOwn(request, "prompt"))).toBe(true);
    expect(new Set(worker.requests.map((request) => request.requestId)).size).toBe(200);
    expect(worker.disposed).toBe(true);
    expect(worker.terminated).toBe(false);
  });

  it("records each formatter/token/generation/decode/normalization/policy stage honestly", async () => {
    const model = candidate();
    const runSpec = createNarratorEvaluationRunSpecV2(model, "run:v2:runner-stages");
    const worker = new WorkerFixture(model.candidateId, model, runSpec);
    worker.plans.set(0, {
      outcome: "prompt-format-error", inputTokenIds: null, fullDecoderTokenIds: null, decodedText: null,
    });
    worker.plans.set(1, {
      outcome: "input-tokenizer-error", inputTokenIds: null, fullDecoderTokenIds: null, decodedText: null,
    });
    worker.plans.set(2, {
      outcome: "input-budget", inputTokenIds: null, observedInputTokens: 321,
      fullDecoderTokenIds: null, decodedText: null,
    });
    worker.plans.set(3, {
      outcome: "generation-error", inputTokenIds: [33, 1], fullDecoderTokenIds: null, decodedText: null,
    });
    worker.plans.set(4, {
      outcome: "input-token-contract-error", inputTokenIds: [44], fullDecoderTokenIds: null,
      decodedText: null,
    });
    worker.plans.set(5, {
      outcome: "generated-token-contract-error", inputTokenIds: [55, 1], fullDecoderTokenIds: [0, 56],
      decodedText: null,
    });
    worker.plans.set(6, {
      outcome: "decode-error", inputTokenIds: [66, 1], fullDecoderTokenIds: [0, 67, 1], decodedText: null,
    });
    worker.plans.set(7, {
      outcome: "generated", inputTokenIds: [77, 1], fullDecoderTokenIds: [0, 78, 1], decodedText: " \n\t ",
    });
    worker.plans.set(8, {
      outcome: "generated", inputTokenIds: [88, 1], fullDecoderTokenIds: [0, 89, 1],
      decodedText: "A dragon grants five hundred gold.",
    });
    worker.plans.set(9, {
      outcome: "generated-token-contract-error", inputTokenIds: [99, 1], fullDecoderTokenIds: null, decodedText: null,
    });
    const receipt = await runNarratorEvaluationV2(
      model, runSpec, worker, clock(), new AbortController().signal,
    );
    expect(receipt.rows.slice(0, 10).map((row) => row.status)).toEqual([
      "prompt-format-error",
      "input-tokenizer-error",
      "input-budget",
      "generation-error",
      "input-token-contract-error",
      "generated-token-contract-error",
      "decode-error",
      "normalization-error",
      "output-policy-rejected",
      "generated-token-contract-error",
    ]);
    expect(receipt.rows[5]).toMatchObject({
      fullDecoderTokenIds: [0, 56], outputTokens: null, outputText: null,
    });
    expect(receipt.rows[6]).toMatchObject({
      outputTokens: 2, generationStopReason: "model-eos", outputText: null,
    });
    expect(receipt.dispose.status).toBe("ok");
  });

  it("hard-terminates malformed responses and suppresses every late case", async () => {
    const model = candidate();
    const runSpec = createNarratorEvaluationRunSpecV2(model, "run:v2:runner-malformed");
    const worker = new WorkerFixture(model.candidateId, model, runSpec);
    worker.malformedAt = 3;
    const receipt = await runNarratorEvaluationV2(
      model, runSpec, worker, clock(), new AbortController().signal,
    );
    expect(receipt.rows[3]!.status).toBe("worker-response-invalid");
    expect(receipt.rows.slice(4).every((row) => row.status === "not-run")).toBe(true);
    expect(worker.requests).toHaveLength(4);
    expect(worker.terminated).toBe(true);
    expect(worker.disposed).toBe(false);
    expect(receipt.dispose.status).toBe("not-attempted");
    expect(receipt.termination.status).toBe("requested");
  });

  it("snapshots a mutable worker epoch exactly once and binds it into every request and receipt", async () => {
    const model = candidate();
    const runSpec = createNarratorEvaluationRunSpecV2(model, "run:v2:runner-epoch");
    const worker = new WorkerFixture(model.candidateId, model, runSpec);
    let reads = 0;
    let modelReads = 0;
    Object.defineProperty(worker, "workerEpoch", {
      configurable: true,
      get: () => {
        reads += 1;
        return reads === 1 ? "worker-epoch:snapshot" : "worker-epoch:changed";
      },
    });
    Object.defineProperty(worker, "modelId", {
      configurable: true,
      get: () => {
        modelReads += 1;
        return modelReads === 1 ? model.candidateId : "changed/model";
      },
    });
    const receipt = await runNarratorEvaluationV2(
      model, runSpec, worker, clock(), new AbortController().signal,
    );
    expect(reads).toBe(1);
    expect(modelReads).toBe(1);
    expect(receipt.workerEpoch).toBe("worker-epoch:snapshot");
    expect(worker.requests.every((request) => request.workerEpoch === receipt.workerEpoch)).toBe(true);
  });

  it("turns sparse token evidence into one terminal malformed-response row", async () => {
    const model = candidate();
    const runSpec = createNarratorEvaluationRunSpecV2(model, "run:v2:runner-sparse");
    const worker = new WorkerFixture(model.candidateId, model, runSpec);
    worker.sparseAt = 2;
    const receipt = await runNarratorEvaluationV2(
      model, runSpec, worker, clock(), new AbortController().signal,
    );
    expect(receipt.rows[2]!.status).toBe("worker-response-invalid");
    expect(receipt.rows.slice(3).every((row) => row.status === "not-run")).toBe(true);
    expect(receipt.termination.status).toBe("requested");
  });

  it("returns an honest artifact mismatch receipt for an empty verified set", async () => {
    const model = candidate();
    const runSpec = createNarratorEvaluationRunSpecV2(model, "run:v2:runner-empty-artifacts");
    const worker = new WorkerFixture(model.candidateId, model, runSpec);
    worker.artifactEvidence = [];
    const receipt = await runNarratorEvaluationV2(
      model, runSpec, worker, clock(), new AbortController().signal,
    );
    expect(receipt.load).toMatchObject({ stage: "artifact-verification", status: "artifact-mismatch" });
    expect(receipt.verifiedArtifacts).toEqual([]);
    expect(receipt.rows.every((row) => row.status === "not-run")).toBe(true);
    expect(receipt.dispose.status).toBe("not-attempted");
    expect(receipt.termination.status).toBe("requested");
  });

  it("returns an artifact-evidence failure receipt for a sparse verifier array", async () => {
    const model = candidate();
    const runSpec = createNarratorEvaluationRunSpecV2(model, "run:v2:runner-sparse-artifacts");
    const worker = new WorkerFixture(model.candidateId, model, runSpec);
    worker.artifactEvidence = Array(1);
    const receipt = await runNarratorEvaluationV2(
      model, runSpec, worker, clock(), new AbortController().signal,
    );
    expect(receipt.load).toMatchObject({
      stage: "artifact-verification", status: "artifact-evidence-invalid",
    });
    expect(receipt.verifiedArtifacts).toEqual([]);
    expect(receipt.rows.every((row) => row.status === "not-run")).toBe(true);
    expect(receipt.dispose.status).toBe("not-attempted");
    expect(receipt.termination.status).toBe("requested");
  });

  it("terminates an untyped worker rejection and records failed cleanup requests honestly", async () => {
    const model = candidate();

    const callSpec = createNarratorEvaluationRunSpecV2(model, "run:v2:runner-call-error");
    const callWorker = new WorkerFixture(model.candidateId, model, callSpec);
    callWorker.throwAt = 2;
    const callReceipt = await runNarratorEvaluationV2(
      model, callSpec, callWorker, clock(), new AbortController().signal,
    );
    expect(callReceipt.rows[2]!.status).toBe("worker-call-error");
    expect(callReceipt.rows.slice(3).every((row) => row.status === "not-run")).toBe(true);
    expect(callReceipt.termination.status).toBe("requested");
    expect(callWorker.terminationAttempts).toBe(1);

    const disposeSpec = createNarratorEvaluationRunSpecV2(model, "run:v2:runner-dispose-error");
    const disposeWorker = new WorkerFixture(model.candidateId, model, disposeSpec);
    disposeWorker.disposeError = true;
    const disposeReceipt = await runNarratorEvaluationV2(
      model, disposeSpec, disposeWorker, clock(), new AbortController().signal,
    );
    expect(disposeReceipt.dispose.status).toBe("error");
    expect(disposeReceipt.termination.status).toBe("requested");
    expect(disposeWorker.terminationAttempts).toBe(1);

    const terminationSpec = createNarratorEvaluationRunSpecV2(model, "run:v2:runner-termination-error");
    const terminationWorker = new WorkerFixture(model.candidateId, model, terminationSpec);
    terminationWorker.malformedAt = 0;
    terminationWorker.terminateError = true;
    const terminationReceipt = await runNarratorEvaluationV2(
      model, terminationSpec, terminationWorker, clock(), new AbortController().signal,
    );
    expect(terminationReceipt.rows[0]!.status).toBe("worker-response-invalid");
    expect(terminationReceipt.dispose.status).toBe("not-attempted");
    expect(terminationReceipt.termination.status).toBe("request-error");
    expect(terminationWorker.terminationAttempts).toBe(1);
  });

  it("hard-terminates case timeout, pre-run abort, and device loss", async () => {
    const model = candidate();

    const timeoutSpec = createNarratorEvaluationRunSpecV2(model, "run:v2:runner-timeout");
    const timeoutWorker = new WorkerFixture(model.candidateId, model, timeoutSpec);
    let operation = 0;
    const timeoutWatchdog: NarratorEvaluationWatchdog = {
      async run(_milliseconds, _signal, action) {
        operation += 1;
        if (operation === 4) return { status: "timeout" };
        return { status: "completed", value: await action(new AbortController().signal) };
      },
    };
    const timedOut = await runNarratorEvaluationV2(
      model, timeoutSpec, timeoutWorker, clock(), new AbortController().signal, timeoutWatchdog,
    );
    expect(timedOut.rows[0]!.status).toBe("case-timeout");
    expect(timedOut.rows.slice(1).every((row) => row.status === "not-run")).toBe(true);
    expect(timeoutWorker.terminated).toBe(true);

    const abortSpec = createNarratorEvaluationRunSpecV2(model, "run:v2:runner-abort");
    const abortWorker = new WorkerFixture(model.candidateId, model, abortSpec);
    const controller = new AbortController();
    controller.abort();
    const aborted = await runNarratorEvaluationV2(model, abortSpec, abortWorker, clock(), controller.signal);
    expect(aborted.load.status).toBe("aborted");
    expect(aborted.rows[0]!.status).toBe("run-aborted");
    expect(aborted.rows.slice(1).every((row) => row.status === "not-run")).toBe(true);
    expect(abortWorker.terminated).toBe(true);

    const deviceSpec = createNarratorEvaluationRunSpecV2(model, "run:v2:runner-device");
    const deviceWorker = new WorkerFixture(model.candidateId, model, deviceSpec);
    deviceWorker.throwDeviceAt = 2;
    const lost = await runNarratorEvaluationV2(
      model, deviceSpec, deviceWorker, clock(), new AbortController().signal,
    );
    expect(lost.rows[2]!.status).toBe("device-lost");
    expect(lost.rows.slice(3).every((row) => row.status === "not-run")).toBe(true);
    expect(deviceWorker.terminated).toBe(true);
  });
});
