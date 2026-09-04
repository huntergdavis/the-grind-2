import observedReceipt from "../../docs/narrator/t5-artifact-publication-receipt.json";
import { describe, expect, it, vi } from "vitest";
import { createNarratorEvaluationRunSpecV2 } from "./evaluation-contract-v2";
import {
  NarratorBrowserEvaluationWorkerPortV2,
  type NarratorBrowserEvaluationCommandV2,
  type NarratorBrowserEvaluationWorkerLikeV2,
} from "./evaluation-browser-worker-port-v2";
import { createNarratorEvaluationWorkerCaseRequestV2 } from "./evaluation-worker-protocol-v2";
import { createNarratorT5PublishedCandidateV1 } from "./t5-publication-evidence";

class FakeWorker implements NarratorBrowserEvaluationWorkerLikeV2 {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly messages: NarratorBrowserEvaluationCommandV2[] = [];
  readonly terminate = vi.fn();
  respond = true;
  throwOnPost = false;

  postMessage(message: unknown, _transfer: Transferable[]): void {
    if (this.throwOnPost) throw new Error("postMessage rejected");
    const command = message as NarratorBrowserEvaluationCommandV2;
    this.messages.push(command);
    if (!this.respond) return;
    queueMicrotask(() => this.onmessage?.({ data: {
      schemaVersion: 2,
      rpcId: command.rpcId,
      ok: true,
      value: command.kind,
    } } as MessageEvent<unknown>));
  }
}

function setup() {
  const candidate = createNarratorT5PublishedCandidateV1(observedReceipt);
  const runSpec = createNarratorEvaluationRunSpecV2(candidate, "browser-port-test");
  const worker = new FakeWorker();
  const modelArtifacts = candidate.artifacts.map((artifact) => ({
    path: artifact.path,
    bytes: new ArrayBuffer(1),
  }));
  const runtimeArtifacts = [
    { path: "runtime.mjs", bytes: new ArrayBuffer(1) },
    { path: "runtime.wasm", bytes: new ArrayBuffer(1) },
  ];
  const port = new NarratorBrowserEvaluationWorkerPortV2({
    worker,
    workerEpoch: "browser-worker:test",
    candidate,
    runSpec,
    modelArtifacts,
    runtimeArtifacts,
  });
  return { candidate, runSpec, worker, port };
}

describe("Narrator browser evaluation worker port V2", () => {
  it("initializes once and exposes stable model and worker identities", async () => {
    const { candidate, worker, port } = setup();
    expect(port.modelId).toBe(candidate.candidateId);
    expect(port.workerEpoch).toBe("browser-worker:test");
    await expect(port.handshake(new AbortController().signal)).resolves.toBe("handshake");
    await expect(port.verifyArtifacts(new AbortController().signal)).resolves.toBe("verify-artifacts");
    expect(worker.messages.map((message) => message.kind)).toEqual([
      "initialize", "handshake", "verify-artifacts",
    ]);
  });

  it("sends only the exact case request and fixed output-token limit", async () => {
    const { candidate, runSpec, worker, port } = setup();
    const request = createNarratorEvaluationWorkerCaseRequestV2(
      runSpec,
      candidate,
      0,
      port.workerEpoch,
      "request:browser:0",
    );
    await port.evaluate(request, { maximumOutputTokens: 48, signal: new AbortController().signal });
    expect(worker.messages.at(-1)).toMatchObject({
      schemaVersion: 2,
      kind: "run-case",
      request,
      maximumOutputTokens: 48,
    });
  });

  it("rejects an aborted call and gives terminate real synchronous meaning", async () => {
    const { worker, port } = setup();
    worker.respond = false;
    const controller = new AbortController();
    const handshake = port.handshake(controller.signal);
    controller.abort();
    await expect(handshake).rejects.toMatchObject({ name: "AbortError" });
    port.terminate();
    port.terminate();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("hard-terminates malformed response envelopes and rejects reuse", async () => {
    const { worker, port } = setup();
    worker.respond = false;
    const handshake = port.handshake(new AbortController().signal);
    worker.onmessage?.({ data: { ok: true } } as MessageEvent<unknown>);
    await expect(handshake).rejects.toThrow(/malformed/u);
    expect(worker.terminate).toHaveBeenCalledOnce();
    await expect(port.handshake(new AbortController().signal)).rejects.toThrow();
  });

  it("hard-terminates worker transport faults once", async () => {
    const { worker, port } = setup();
    worker.respond = false;
    const handshake = port.handshake(new AbortController().signal);
    worker.onerror?.({} as ErrorEvent);
    await expect(handshake).rejects.toThrow(/worker error/u);
    worker.onmessageerror?.({} as MessageEvent<unknown>);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("surfaces an explicit termination error without retrying it", () => {
    const { worker, port } = setup();
    worker.terminate.mockImplementationOnce(() => {
      throw new Error("browser termination rejected");
    });
    expect(() => port.terminate()).toThrow("browser termination rejected");
    expect(() => port.terminate()).not.toThrow();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("hard-terminates a synchronous postMessage failure and rejects reuse", async () => {
    const { worker, port } = setup();
    worker.throwOnPost = true;
    await expect(port.handshake(new AbortController().signal)).rejects.toThrow("postMessage rejected");
    expect(worker.terminate).toHaveBeenCalledOnce();
    await expect(port.handshake(new AbortController().signal)).rejects.toThrow();
  });

  it("rejects duplicate transferred buffer ownership", () => {
    const candidate = createNarratorT5PublishedCandidateV1(observedReceipt);
    const runSpec = createNarratorEvaluationRunSpecV2(candidate, "duplicate-buffer-test");
    const shared = new ArrayBuffer(1);
    expect(() => new NarratorBrowserEvaluationWorkerPortV2({
      worker: new FakeWorker(),
      workerEpoch: "browser-worker:test",
      candidate,
      runSpec,
      modelArtifacts: candidate.artifacts.map((artifact) => ({ path: artifact.path, bytes: shared })),
      runtimeArtifacts: [
        { path: "runtime.mjs", bytes: new ArrayBuffer(1) },
        { path: "runtime.wasm", bytes: new ArrayBuffer(1) },
      ],
    })).toThrow(/unique ownership/u);
  });
});
