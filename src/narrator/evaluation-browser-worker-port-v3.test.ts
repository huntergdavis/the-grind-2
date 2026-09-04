import observedReceipt from "../../docs/narrator/t5-artifact-publication-receipt.json";
import { describe, expect, it, vi } from "vitest";
import { createNarratorEvaluationRunSpecV3 } from "./evaluation-contract-v3";
import {
  NarratorBrowserEvaluationWorkerPortV3,
  type NarratorBrowserEvaluationCommandV3,
  type NarratorBrowserEvaluationResponseV3,
  type NarratorBrowserEvaluationWorkerLikeV3,
} from "./evaluation-browser-worker-port-v3";
import { createNarratorEvaluationWorkerCaseRequestV3 } from "./evaluation-worker-protocol-v3";
import { createNarratorT5PublishedCandidateV1 } from "./t5-publication-evidence";

class FakeWorker implements NarratorBrowserEvaluationWorkerLikeV3 {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly messages: NarratorBrowserEvaluationCommandV3[] = [];
  readonly transfers: Transferable[][] = [];
  readonly terminate = vi.fn();
  respond = true;
  throwOnPost = false;

  postMessage(message: unknown, transfer: Transferable[]): void {
    if (this.throwOnPost) throw new Error("postMessage rejected");
    const command = message as NarratorBrowserEvaluationCommandV3;
    this.messages.push(command);
    this.transfers.push([...transfer]);
    if (!this.respond) return;
    queueMicrotask(() => this.emit({
      schemaVersion: 3,
      rpcId: command.rpcId,
      ok: true,
      value: command.kind,
    }));
  }

  emit(value: unknown): void {
    this.onmessage?.({ data: value } as MessageEvent<unknown>);
  }
}

function setup() {
  const candidate = createNarratorT5PublishedCandidateV1(observedReceipt);
  const runSpec = createNarratorEvaluationRunSpecV3(candidate, "browser-port-v3-test");
  const worker = new FakeWorker();
  const modelArtifacts = candidate.artifacts.map((artifact) => ({
    path: artifact.path,
    bytes: new ArrayBuffer(1),
  }));
  const runtimeArtifacts = [
    { path: "runtime.mjs", bytes: new ArrayBuffer(1) },
    { path: "runtime.wasm", bytes: new ArrayBuffer(1) },
  ];
  const port = new NarratorBrowserEvaluationWorkerPortV3({
    worker,
    workerEpoch: "browser-worker:v3:test",
    candidate,
    runSpec,
    modelArtifacts,
    runtimeArtifacts,
  });
  return { candidate, runSpec, worker, port, modelArtifacts, runtimeArtifacts };
}

async function waitForMessageCount(worker: FakeWorker, count: number): Promise<void> {
  for (let attempt = 0; attempt < 10 && worker.messages.length < count; attempt += 1) {
    await Promise.resolve();
  }
  expect(worker.messages).toHaveLength(count);
}

describe("Narrator browser evaluation worker port V3", () => {
  it("stages exactly once, transfers each owned buffer once, and leaves semantics to handshake", async () => {
    const { candidate, runSpec, worker, port, modelArtifacts, runtimeArtifacts } = setup();
    expect(port.modelId).toBe(candidate.candidateId);
    expect(port.workerEpoch).toBe("browser-worker:v3:test");

    worker.respond = false;
    const staged = port.stageForOffline(new AbortController().signal);
    expect(worker.messages.map((message) => message.kind)).toEqual(["initialize"]);
    worker.emit({
      schemaVersion: 3,
      rpcId: worker.messages[0]!.rpcId,
      ok: true,
      value: {
        workerBinding: "untrusted-initialize-value",
        verifiedArtifacts: ["untrusted-initialize-value"],
      },
    });
    await expect(staged).resolves.toBeUndefined();
    await expect(port.stageForOffline(new AbortController().signal)).resolves.toBeUndefined();
    expect(worker.messages.map((message) => message.kind)).toEqual(["initialize"]);

    worker.respond = true;
    await expect(port.handshake(new AbortController().signal)).resolves.toBe("handshake");
    await expect(port.verifyArtifacts(new AbortController().signal)).resolves.toBe("verify-artifacts");

    expect(worker.messages.map((message) => message.kind)).toEqual([
      "initialize", "handshake", "verify-artifacts",
    ]);
    const initialize = worker.messages[0]!;
    expect(Object.keys(initialize)).toEqual([
      "schemaVersion", "rpcId", "kind", "workerEpoch", "candidate", "runSpec", "modelArtifacts",
      "runtimeArtifacts",
    ]);
    expect(initialize).toMatchObject({
      schemaVersion: 3,
      rpcId: "rpc:0000",
      kind: "initialize",
      workerEpoch: port.workerEpoch,
      candidate,
      runSpec,
      modelArtifacts,
      runtimeArtifacts,
    });
    expect(worker.transfers[0]).toEqual([
      ...modelArtifacts.map((artifact) => artifact.bytes),
      ...runtimeArtifacts.map((artifact) => artifact.bytes),
    ]);
    expect(worker.transfers[1]).toEqual([]);
    expect(worker.transfers[2]).toEqual([]);
  });

  it("sends only the exact V3 case request and fixed output-token limit", async () => {
    const { candidate, runSpec, worker, port } = setup();
    const request = createNarratorEvaluationWorkerCaseRequestV3(
      runSpec,
      candidate,
      0,
      port.workerEpoch,
      null,
      null,
    );
    await port.evaluate(request, { maximumOutputTokens: 48, signal: new AbortController().signal });
    const command = worker.messages.at(-1)!;
    expect(Object.keys(command)).toEqual([
      "schemaVersion", "rpcId", "kind", "request", "maximumOutputTokens",
    ]);
    expect(command).toEqual({
      schemaVersion: 3,
      rpcId: "rpc:0001",
      kind: "run-case",
      request,
      maximumOutputTokens: 48,
    });
  });

  it("rejects invalid runtime case fields before posting them", async () => {
    const { candidate, runSpec, worker, port } = setup();
    const request = createNarratorEvaluationWorkerCaseRequestV3(
      runSpec,
      candidate,
      0,
      port.workerEpoch,
      null,
      null,
    );
    await expect(port.evaluate(request, {
      maximumOutputTokens: 47 as 48,
      signal: new AbortController().signal,
    })).rejects.toThrow(/case command is invalid/u);
    const tampered = { ...request, schemaVersion: 2 } as unknown as typeof request;
    await expect(port.evaluate(tampered, {
      maximumOutputTokens: 48,
      signal: new AbortController().signal,
    })).rejects.toThrow(/case command is invalid/u);
    expect(worker.messages).toEqual([]);
  });

  it("makes an in-flight or preflight abort terminal and rejects reuse", async () => {
    const active = setup();
    active.worker.respond = false;
    const controller = new AbortController();
    const staging = active.port.stageForOffline(controller.signal);
    controller.abort();
    await expect(staging).rejects.toMatchObject({ name: "AbortError" });
    expect(active.worker.terminate).toHaveBeenCalledOnce();
    await expect(active.port.handshake(new AbortController().signal)).rejects.toThrow(/terminated/u);

    const preflight = setup();
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await expect(preflight.port.stageForOffline(alreadyAborted.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(preflight.worker.messages).toEqual([]);
    expect(preflight.worker.terminate).toHaveBeenCalledOnce();
  });

  it("makes an initialization rejection terminal without returning authority or retrying", async () => {
    const { worker, port } = setup();
    worker.respond = false;
    const staging = port.stageForOffline(new AbortController().signal);
    worker.emit({
      schemaVersion: 3,
      rpcId: worker.messages[0]!.rpcId,
      ok: false,
      errorCode: "initialize-failed",
    });
    await expect(staging).rejects.toThrow("initialize-failed");
    await expect(port.stageForOffline(new AbortController().signal)).rejects.toThrow(
      "initialize-failed",
    );
    await expect(port.handshake(new AbortController().signal)).rejects.toThrow("initialize-failed");
    expect(worker.messages.map((message) => message.kind)).toEqual(["initialize"]);
  });

  it.each([
    ["cross-version", (rpcId: string) => ({ schemaVersion: 2, rpcId, ok: true, value: null })],
    ["wrong-rpc", () => ({ schemaVersion: 3, rpcId: "rpc:9999", ok: true, value: null })],
    ["extra-key", (rpcId: string) => ({ schemaVersion: 3, rpcId, ok: true, value: null, extra: true })],
  ])("hard-terminates a %s response envelope", async (_label, response) => {
    const { worker, port } = setup();
    worker.respond = false;
    const handshake = port.handshake(new AbortController().signal);
    expect(worker.messages[0]?.rpcId).toBe("rpc:0000");
    worker.emit(response(worker.messages[0]!.rpcId));
    await expect(handshake).rejects.toThrow();
    expect(worker.terminate).toHaveBeenCalledOnce();
    await expect(port.handshake(new AbortController().signal)).rejects.toThrow(/terminated/u);
  });

  it("hard-terminates a stale response after its RPC has completed", async () => {
    const { worker, port } = setup();
    await port.handshake(new AbortController().signal);
    const completed = worker.messages.at(-1)!;
    const stale: NarratorBrowserEvaluationResponseV3 = {
      schemaVersion: 3,
      rpcId: completed.rpcId,
      ok: true,
      value: "late-duplicate",
    };
    worker.emit(stale);
    expect(worker.terminate).toHaveBeenCalledOnce();
    await expect(port.verifyArtifacts(new AbortController().signal)).rejects.toThrow(/terminated/u);
  });

  it("allows only one pending RPC while keeping caller misuse nonterminal", async () => {
    const { worker, port } = setup();
    worker.respond = false;
    const first = port.handshake(new AbortController().signal);
    const second = port.verifyArtifacts(new AbortController().signal);
    worker.emit({
      schemaVersion: 3,
      rpcId: worker.messages[0]!.rpcId,
      ok: true,
      value: "initialize",
    });
    await waitForMessageCount(worker, 2);
    await expect(second).rejects.toThrow(/pending RPC/u);
    expect(worker.terminate).not.toHaveBeenCalled();
    worker.emit({
      schemaVersion: 3,
      rpcId: worker.messages.at(-1)!.rpcId,
      ok: true,
      value: "handshake",
    });
    await expect(first).resolves.toBe("handshake");
  });

  it("keeps exact worker rejection envelopes nonterminal", async () => {
    const { worker, port } = setup();
    worker.respond = false;
    const handshake = port.handshake(new AbortController().signal);
    worker.emit({
      schemaVersion: 3,
      rpcId: worker.messages[0]!.rpcId,
      ok: true,
      value: "initialize",
    });
    await waitForMessageCount(worker, 2);
    worker.emit({
      schemaVersion: 3,
      rpcId: worker.messages.at(-1)!.rpcId,
      ok: false,
      errorCode: "handshake-failed",
    });
    await expect(handshake).rejects.toThrow("handshake-failed");
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it("hard-terminates transport faults and synchronous postMessage failures once", async () => {
    const fault = setup();
    fault.worker.respond = false;
    const staging = fault.port.stageForOffline(new AbortController().signal);
    fault.worker.onerror?.({} as ErrorEvent);
    await expect(staging).rejects.toThrow(/worker error/u);
    fault.worker.onmessageerror?.({} as MessageEvent<unknown>);
    expect(fault.worker.terminate).toHaveBeenCalledOnce();
    await expect(fault.port.handshake(new AbortController().signal)).rejects.toThrow(/terminated/u);

    const post = setup();
    post.worker.throwOnPost = true;
    await expect(post.port.stageForOffline(new AbortController().signal))
      .rejects.toThrow("postMessage rejected");
    expect(post.worker.terminate).toHaveBeenCalledOnce();
    await expect(post.port.handshake(new AbortController().signal)).rejects.toThrow(/terminated/u);
  });

  it("disposes once, rejects later work, and gives explicit termination synchronous meaning", async () => {
    const { worker, port } = setup();
    await port.dispose(new AbortController().signal);
    await port.dispose(new AbortController().signal);
    expect(worker.messages.map((message) => message.kind)).toEqual(["initialize", "dispose"]);
    await expect(port.handshake(new AbortController().signal)).rejects.toThrow(/disposed/u);

    worker.terminate.mockImplementationOnce(() => {
      throw new Error("browser termination rejected");
    });
    expect(() => port.terminate()).toThrow("browser termination rejected");
    expect(() => port.terminate()).not.toThrow();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("rejects malformed artifact arrays, duplicate paths, and duplicate buffer ownership", () => {
    const candidate = createNarratorT5PublishedCandidateV1(observedReceipt);
    const runSpec = createNarratorEvaluationRunSpecV3(candidate, "browser-port-v3-invalid-artifacts");
    const fields = {
      worker: new FakeWorker(),
      workerEpoch: "browser-worker:v3:test",
      candidate,
      runSpec,
      modelArtifacts: candidate.artifacts.map((artifact) => ({
        path: artifact.path,
        bytes: new ArrayBuffer(1),
      })),
      runtimeArtifacts: [
        { path: "runtime.mjs", bytes: new ArrayBuffer(1) },
        { path: "runtime.wasm", bytes: new ArrayBuffer(1) },
      ],
    };

    const sparse = [...fields.modelArtifacts];
    delete sparse[1];
    expect(() => new NarratorBrowserEvaluationWorkerPortV3({ ...fields, modelArtifacts: sparse }))
      .toThrow(/initialization is invalid/u);
    expect(() => new NarratorBrowserEvaluationWorkerPortV3({
      ...fields,
      runtimeArtifacts: [
        { path: "runtime.mjs", bytes: new ArrayBuffer(1) },
        { path: "runtime.mjs", bytes: new ArrayBuffer(1) },
      ],
    })).toThrow(/initialization is invalid|unique paths/u);
    const shared = new ArrayBuffer(1);
    expect(() => new NarratorBrowserEvaluationWorkerPortV3({
      ...fields,
      modelArtifacts: fields.modelArtifacts.map((artifact) => ({ ...artifact, bytes: shared })),
    })).toThrow(/buffer ownership/u);
  });
});
