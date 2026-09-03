import { describe, expect, it } from "vitest";
import {
  createNarratorEvaluationWorkerBindingV1,
  createNarratorEvaluationRunSpecV1,
  isNarratorRunReceiptV1,
} from "./evaluation-receipts";
import {
  createNarratorEvaluationWatchdog,
  NarratorEvaluationDeviceLostError,
  runNarratorEvaluationV1,
  type NarratorDeadlineOutcome,
  type NarratorEvaluationClock,
  type NarratorEvaluationWatchdog,
  type NarratorEvaluationWorkerPort,
} from "./evaluation-runner";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  tinyStoriesInstruct33MInt8Candidate,
  type NarratorModelCandidateV1,
} from "./model-candidate";
import type { NarratorPromptV1 } from "./protocol";

function benchmarkCandidate(): NarratorModelCandidateV1 {
  return {
    ...tinyStoriesInstruct33MInt8Candidate,
    model: { ...tinyStoriesInstruct33MInt8Candidate.model, license: "MIT", licenseStatus: "verified" },
  };
}

class StepClock implements NarratorEvaluationClock {
  private value = 0;
  now(): number { this.value += 5; return this.value; }
  setTimeout(callback: () => void, milliseconds: number): unknown { return globalThis.setTimeout(callback, milliseconds); }
  clearTimeout(handle: unknown): void { globalThis.clearTimeout(handle as number); }
}

class FakeEvaluationWorker implements NarratorEvaluationWorkerPort {
  readonly modelId: string;
  verifyCalls = 0;
  handshakeCalls = 0;
  loadCalls = 0;
  evaluateCalls = 0;
  disposeCalls = 0;
  terminateCalls = 0;
  failLoad = false;
  deviceLostAt: number | null = null;
  oversizedOutputAt: number | null = null;
  malformedArtifacts = false;
  malformedResultAt: number | null = null;
  resultOverrideAt: number | null = null;
  resultOverride: unknown = null;
  bindingMismatch = false;
  deviceLostDuringVerification = false;
  deviceLostDuringDisposal = false;
  prompts: NarratorPromptV1[] = [];

  constructor(
    private readonly candidate: NarratorModelCandidateV1,
    private readonly runSpec: ReturnType<typeof createNarratorEvaluationRunSpecV1>,
  ) {
    this.modelId = candidate.candidateId;
  }

  handshake(): Promise<unknown> {
    this.handshakeCalls += 1;
    const binding = createNarratorEvaluationWorkerBindingV1(this.runSpec);
    return Promise.resolve(this.bindingMismatch ? { ...binding, runtimeVersion: "0.0.0" } : binding);
  }

  verifyArtifacts(): Promise<unknown> {
    this.verifyCalls += 1;
    if (this.deviceLostDuringVerification) return Promise.reject(new NarratorEvaluationDeviceLostError());
    if (this.malformedArtifacts) return Promise.resolve({ artifacts: [] });
    return Promise.resolve(this.candidate.artifacts.map(({ path, byteLength, sha256 }) => ({ path, byteLength, sha256 })));
  }

  load(): Promise<void> {
    this.loadCalls += 1;
    return this.failLoad ? Promise.reject(new Error("load failed")) : Promise.resolve();
  }

  evaluate(prompt: NarratorPromptV1): Promise<unknown> {
    this.prompts.push(prompt);
    const ordinal = this.evaluateCalls;
    this.evaluateCalls += 1;
    if (ordinal === this.deviceLostAt) throw new NarratorEvaluationDeviceLostError();
    if (ordinal === this.malformedResultAt) return Promise.resolve({ outputText: "missing receipt fields" });
    if (ordinal === this.resultOverrideAt) return Promise.resolve(this.resultOverride);
    return Promise.resolve({
      error: null,
      inputTokens: 40,
      outputTokens: 8,
      outputText: ordinal === this.oversizedOutputAt
        ? "x".repeat(10_000)
        : narratorEvaluationCasesV1[ordinal]!.allowedOutputs[1]!,
    });
  }

  dispose(): Promise<void> {
    this.disposeCalls += 1;
    return this.deviceLostDuringDisposal
      ? Promise.reject(new NarratorEvaluationDeviceLostError())
      : Promise.resolve();
  }
  terminate(): void { this.terminateCalls += 1; }
}

class IndexedWatchdog implements NarratorEvaluationWatchdog {
  calls = 0;
  constructor(private readonly timeoutCall: number | null = null) {}
  async run<T>(
    _milliseconds: number,
    signal: AbortSignal,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<NarratorDeadlineOutcome<T>> {
    this.calls += 1;
    if (signal.aborted) return { status: "aborted" };
    if (this.calls === this.timeoutCall) return { status: "timeout" };
    try {
      return { status: "completed", value: await operation(signal) };
    } catch (error) {
      return { status: "error", error };
    }
  }
}

describe("narrator evaluation runner", () => {
  it("verifies artifacts, loads once, runs exactly 200 prompts, and disposes once", async () => {
    const candidate = benchmarkCandidate();
    const spec = createNarratorEvaluationRunSpecV1(candidate, "run:success");
    const worker = new FakeEvaluationWorker(candidate, spec);
    const receipt = await runNarratorEvaluationV1(
      candidate,
      spec,
      worker,
      new StepClock(),
      new AbortController().signal,
    );
    expect(isNarratorRunReceiptV1(receipt, candidate)).toBe(true);
    expect(receipt.rows.every((row) => row.status === "ok")).toBe(true);
    expect(worker.verifyCalls).toBe(1);
    expect(worker.handshakeCalls).toBe(1);
    expect(worker.loadCalls).toBe(1);
    expect(worker.evaluateCalls).toBe(200);
    expect(worker.disposeCalls).toBe(1);
    expect(worker.terminateCalls).toBe(0);
    expect(worker.prompts).toEqual(narratorEvaluationCasesV1.map((entry) => entry.prompt));
    expect(JSON.stringify(worker.prompts)).not.toContain("deterministicBaseline");
  });

  it("returns 200 ordered not-run rows on load failure and still disposes", async () => {
    const candidate = benchmarkCandidate();
    const spec = createNarratorEvaluationRunSpecV1(candidate, "run:load-failure");
    const worker = new FakeEvaluationWorker(candidate, spec);
    worker.failLoad = true;
    const receipt = await runNarratorEvaluationV1(
      candidate, spec, worker, new StepClock(), new AbortController().signal,
    );
    expect(isNarratorRunReceiptV1(receipt, candidate)).toBe(true);
    expect(receipt.load.status).toBe("load-error");
    expect(receipt.rows).toHaveLength(200);
    expect(receipt.rows.every((row) => row.status === "not-run")).toBe(true);
    expect(worker.evaluateCalls).toBe(0);
    expect(worker.disposeCalls).toBe(1);
  });

  it("hard-terminates a timed-out case and deterministically fills every remaining row", async () => {
    const candidate = benchmarkCandidate();
    const spec = createNarratorEvaluationRunSpecV1(candidate, "run:timeout");
    const worker = new FakeEvaluationWorker(candidate, spec);
    const receipt = await runNarratorEvaluationV1(
      candidate,
      spec,
      worker,
      new StepClock(),
      new AbortController().signal,
      new IndexedWatchdog(7),
    );
    expect(isNarratorRunReceiptV1(receipt, candidate)).toBe(true);
    expect(receipt.rows.slice(0, 3).every((row) => row.status === "ok")).toBe(true);
    expect(receipt.rows[3]!.status).toBe("realizer-timeout");
    expect(receipt.rows.slice(4).every((row) => row.status === "not-run")).toBe(true);
    expect(receipt.dispose.status).toBe("hard-terminated");
    expect(worker.evaluateCalls).toBe(3);
    expect(worker.terminateCalls).toBe(1);
    expect(worker.disposeCalls).toBe(0);
  });

  it("records one abort row plus 199 not-run rows when cancelled before load", async () => {
    const candidate = benchmarkCandidate();
    const spec = createNarratorEvaluationRunSpecV1(candidate, "run:aborted");
    const worker = new FakeEvaluationWorker(candidate, spec);
    const controller = new AbortController();
    controller.abort();
    const receipt = await runNarratorEvaluationV1(candidate, spec, worker, new StepClock(), controller.signal);
    expect(isNarratorRunReceiptV1(receipt, candidate)).toBe(true);
    expect(receipt.load.status).toBe("aborted");
    expect(receipt.rows[0]!.status).toBe("run-aborted");
    expect(receipt.rows.slice(1).every((row) => row.status === "not-run")).toBe(true);
    expect(worker.terminateCalls).toBe(1);
  });

  it("hard-terminates on device loss and retains no unbounded raw output", async () => {
    const candidate = benchmarkCandidate();
    const spec = createNarratorEvaluationRunSpecV1(candidate, "run:device-loss");
    const worker = new FakeEvaluationWorker(candidate, spec);
    worker.deviceLostAt = 3;
    const receipt = await runNarratorEvaluationV1(
      candidate, spec, worker, new StepClock(), new AbortController().signal,
    );
    expect(isNarratorRunReceiptV1(receipt, candidate)).toBe(true);
    expect(receipt.rows[3]!.status).toBe("device-lost");
    expect(receipt.rows.slice(4).every((row) => row.status === "not-run")).toBe(true);
    expect(JSON.stringify(receipt)).not.toContain("x".repeat(100));
    expect(worker.terminateCalls).toBe(1);
    expect(worker.disposeCalls).toBe(0);
  });

  it("hard-terminates malformed worker bindings, artifacts, and case results", async () => {
    const candidate = benchmarkCandidate();
    const bindingSpec = createNarratorEvaluationRunSpecV1(candidate, "run:binding-mismatch");
    const bindingWorker = new FakeEvaluationWorker(candidate, bindingSpec);
    bindingWorker.bindingMismatch = true;
    const bindingReceipt = await runNarratorEvaluationV1(
      candidate, bindingSpec, bindingWorker, new StepClock(), new AbortController().signal,
    );
    expect(bindingReceipt.load.status).toBe("worker-binding-mismatch");
    expect(bindingReceipt.rows.every((row) => row.status === "not-run")).toBe(true);
    expect(bindingWorker.loadCalls).toBe(0);
    expect(bindingWorker.terminateCalls).toBe(1);

    const artifactSpec = createNarratorEvaluationRunSpecV1(candidate, "run:malformed-artifacts");
    const artifactWorker = new FakeEvaluationWorker(candidate, artifactSpec);
    artifactWorker.malformedArtifacts = true;
    const artifactReceipt = await runNarratorEvaluationV1(
      candidate, artifactSpec, artifactWorker, new StepClock(), new AbortController().signal,
    );
    expect(artifactReceipt.load.status).toBe("artifact-evidence-invalid");
    expect(artifactReceipt.rows.every((row) => row.status === "not-run")).toBe(true);

    const caseSpec = createNarratorEvaluationRunSpecV1(candidate, "run:malformed-case");
    const caseWorker = new FakeEvaluationWorker(candidate, caseSpec);
    caseWorker.malformedResultAt = 2;
    const caseReceipt = await runNarratorEvaluationV1(
      candidate, caseSpec, caseWorker, new StepClock(), new AbortController().signal,
    );
    expect(caseReceipt.rows[2]!.status).toBe("worker-response-invalid");
    expect(caseReceipt.rows.slice(3).every((row) => row.status === "not-run")).toBe(true);
    expect(caseWorker.terminateCalls).toBe(1);
  });

  it("classifies device loss during verification and disposal", async () => {
    const candidate = benchmarkCandidate();
    const verifySpec = createNarratorEvaluationRunSpecV1(candidate, "run:verify-device-loss");
    const verifyWorker = new FakeEvaluationWorker(candidate, verifySpec);
    verifyWorker.deviceLostDuringVerification = true;
    const verifyReceipt = await runNarratorEvaluationV1(
      candidate, verifySpec, verifyWorker, new StepClock(), new AbortController().signal,
    );
    expect(verifyReceipt.load.status).toBe("device-lost");
    expect(verifyReceipt.dispose.status).toBe("hard-terminated");

    const disposeSpec = createNarratorEvaluationRunSpecV1(candidate, "run:dispose-device-loss");
    const disposeWorker = new FakeEvaluationWorker(candidate, disposeSpec);
    disposeWorker.deviceLostDuringDisposal = true;
    const disposeReceipt = await runNarratorEvaluationV1(
      candidate, disposeSpec, disposeWorker, new StepClock(), new AbortController().signal,
    );
    expect(disposeReceipt.load.status).toBe("ok");
    expect(disposeReceipt.dispose.status).toBe("device-lost");
    expect(disposeWorker.terminateCalls).toBe(1);
  });

  it("retains no oversized raw worker text", async () => {
    const candidate = benchmarkCandidate();
    const spec = createNarratorEvaluationRunSpecV1(candidate, "run:oversized-result");
    const worker = new FakeEvaluationWorker(candidate, spec);
    worker.oversizedOutputAt = 0;
    const receipt = await runNarratorEvaluationV1(
      candidate, spec, worker, new StepClock(), new AbortController().signal,
    );
    expect(receipt.rows[0]).toMatchObject({ status: "worker-response-invalid", outputText: null });
    expect(receipt.rows.slice(1).every((row) => row.status === "not-run")).toBe(true);
    expect(JSON.stringify(receipt)).not.toContain("x".repeat(100));
  });

  it("classifies null, zero, NaN, and oversized token measurements without throwing", async () => {
    const candidate = benchmarkCandidate();
    const cases: readonly { label: string; result: unknown; status: string; terminal: boolean }[] = [
      {
        label: "null-input",
        result: { error: null, inputTokens: null, outputTokens: 8, outputText: narratorEvaluationCasesV1[0]!.allowedOutputs[1]! },
        status: "worker-response-invalid",
        terminal: true,
      },
      {
        label: "null-output",
        result: { error: null, inputTokens: 40, outputTokens: null, outputText: narratorEvaluationCasesV1[0]!.allowedOutputs[1]! },
        status: "worker-response-invalid",
        terminal: true,
      },
      {
        label: "nan-input",
        result: { error: null, inputTokens: Number.NaN, outputTokens: 8, outputText: narratorEvaluationCasesV1[0]!.allowedOutputs[1]! },
        status: "worker-response-invalid",
        terminal: true,
      },
      {
        label: "nan-output",
        result: { error: null, inputTokens: 40, outputTokens: Number.NaN, outputText: narratorEvaluationCasesV1[0]!.allowedOutputs[1]! },
        status: "worker-response-invalid",
        terminal: true,
      },
      {
        label: "zero-input",
        result: { error: null, inputTokens: 0, outputTokens: 8, outputText: narratorEvaluationCasesV1[0]!.allowedOutputs[1]! },
        status: "input-budget",
        terminal: false,
      },
      {
        label: "zero-output",
        result: { error: null, inputTokens: 40, outputTokens: 0, outputText: narratorEvaluationCasesV1[0]!.allowedOutputs[1]! },
        status: "output-budget",
        terminal: false,
      },
      {
        label: "oversized-input",
        result: { error: null, inputTokens: 321, outputTokens: 8, outputText: narratorEvaluationCasesV1[0]!.allowedOutputs[1]! },
        status: "input-budget",
        terminal: false,
      },
      {
        label: "oversized-output",
        result: { error: null, inputTokens: 40, outputTokens: 49, outputText: narratorEvaluationCasesV1[0]!.allowedOutputs[1]! },
        status: "output-budget",
        terminal: false,
      },
    ];
    for (const entry of cases) {
      const spec = createNarratorEvaluationRunSpecV1(candidate, `run:tokens:${entry.label}`);
      const worker = new FakeEvaluationWorker(candidate, spec);
      worker.resultOverrideAt = 0;
      worker.resultOverride = entry.result;
      const receipt = await runNarratorEvaluationV1(
        candidate, spec, worker, new StepClock(), new AbortController().signal,
      );
      expect(receipt.rows[0]!.status, entry.label).toBe(entry.status);
      expect(receipt.rows.slice(1).every((row) => row.status === (entry.terminal ? "not-run" : "ok")), entry.label)
        .toBe(true);
      expect(isNarratorRunReceiptV1(receipt, candidate), entry.label).toBe(true);
    }
  });

  it("the real watchdog returns on timeout and aborts an uncooperative operation", async () => {
    const clock = new StepClock();
    const watchdog = createNarratorEvaluationWatchdog(clock);
    let operationAborted = false;
    const outcome = await watchdog.run(1, new AbortController().signal, (signal) => new Promise<void>(() => {
      signal.addEventListener("abort", () => { operationAborted = true; }, { once: true });
    }));
    expect(outcome.status).toBe("timeout");
    expect(operationAborted).toBe(true);
  });

  it("does not start work when an injected deadline fires synchronously", async () => {
    let operationCalls = 0;
    const watchdog = createNarratorEvaluationWatchdog({
      now: () => 0,
      setTimeout: (callback) => { callback(); return "already-fired"; },
      clearTimeout: () => undefined,
    });
    const outcome = await watchdog.run(8_000, new AbortController().signal, async () => {
      operationCalls += 1;
    });
    expect(outcome.status).toBe("timeout");
    expect(operationCalls).toBe(0);
  });
});
