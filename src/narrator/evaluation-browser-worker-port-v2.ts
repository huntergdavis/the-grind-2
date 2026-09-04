import {
  isNarratorEvaluationRunSpecV2,
  type NarratorEvaluationRunSpecV2,
} from "./evaluation-contract-v2";
import type { NarratorBrowserStagedArtifactV2 } from "./evaluation-browser-assets-v2";
import type { NarratorEvaluationWorkerPortV2 } from "./evaluation-runner-v2";
import type { NarratorEvaluationWorkerCaseRequestV2 } from "./evaluation-worker-protocol-v2";
import {
  isNarratorModelCandidate,
  type NarratorModelCandidate,
} from "./model-candidate";
import { isNarratorBoundedText, isNarratorRecord, narratorHasExactKeys } from "./protocol";

export const narratorBrowserEvaluationRpcVersionV2 = 2 as const;

export type NarratorBrowserEvaluationCommandKindV2 =
  | "initialize"
  | "handshake"
  | "verify-artifacts"
  | "load"
  | "run-case"
  | "dispose";

interface NarratorBrowserEvaluationCommandBaseV2 {
  readonly schemaVersion: 2;
  readonly rpcId: string;
  readonly kind: NarratorBrowserEvaluationCommandKindV2;
}

export interface NarratorBrowserEvaluationInitializeCommandV2 extends NarratorBrowserEvaluationCommandBaseV2 {
  readonly kind: "initialize";
  readonly workerEpoch: string;
  readonly candidate: NarratorModelCandidate;
  readonly runSpec: NarratorEvaluationRunSpecV2;
  readonly modelArtifacts: readonly NarratorBrowserStagedArtifactV2[];
  readonly runtimeArtifacts: readonly NarratorBrowserStagedArtifactV2[];
}

export interface NarratorBrowserEvaluationCaseCommandV2 extends NarratorBrowserEvaluationCommandBaseV2 {
  readonly kind: "run-case";
  readonly request: NarratorEvaluationWorkerCaseRequestV2;
  readonly maximumOutputTokens: 48;
}

export type NarratorBrowserEvaluationCommandV2 =
  | NarratorBrowserEvaluationInitializeCommandV2
  | NarratorBrowserEvaluationCaseCommandV2
  | (NarratorBrowserEvaluationCommandBaseV2 & {
      readonly kind: "handshake" | "verify-artifacts" | "load" | "dispose";
    });

export type NarratorBrowserEvaluationResponseV2 =
  | {
      readonly schemaVersion: 2;
      readonly rpcId: string;
      readonly ok: true;
      readonly value: unknown;
    }
  | {
      readonly schemaVersion: 2;
      readonly rpcId: string;
      readonly ok: false;
      readonly errorCode: string;
    };

export interface NarratorBrowserEvaluationWorkerLikeV2 {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
  terminate(): void;
}

interface PendingCall {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
  readonly signal: AbortSignal;
  readonly abort: () => void;
}

function denseStagedArtifacts(value: unknown): value is readonly NarratorBrowserStagedArtifactV2[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) return false;
  for (let index = 0; index < value.length; index += 1) {
    const artifact = value[index];
    if (!Object.hasOwn(value, index)
      || !isNarratorRecord(artifact)
      || !narratorHasExactKeys(artifact, ["path", "bytes"])
      || !isNarratorBoundedText(artifact.path, 240)
      || !(artifact.bytes instanceof ArrayBuffer)) return false;
  }
  return true;
}

function validResponse(value: unknown): value is NarratorBrowserEvaluationResponseV2 {
  if (!isNarratorRecord(value)
    || value.schemaVersion !== narratorBrowserEvaluationRpcVersionV2
    || !isNarratorBoundedText(value.rpcId, 120)
    || typeof value.ok !== "boolean") return false;
  if (value.ok) return narratorHasExactKeys(value, ["schemaVersion", "rpcId", "ok", "value"]);
  return narratorHasExactKeys(value, ["schemaVersion", "rpcId", "ok", "errorCode"])
    && isNarratorBoundedText(value.errorCode, 160);
}

function abortError(): DOMException {
  return new DOMException("Narrator browser worker call aborted", "AbortError");
}

export class NarratorBrowserEvaluationWorkerPortV2 implements NarratorEvaluationWorkerPortV2 {
  readonly modelId: string;
  readonly workerEpoch: string;

  readonly #worker: NarratorBrowserEvaluationWorkerLikeV2;
  readonly #candidate: NarratorModelCandidate;
  readonly #runSpec: NarratorEvaluationRunSpecV2;
  readonly #modelArtifacts: readonly NarratorBrowserStagedArtifactV2[];
  readonly #runtimeArtifacts: readonly NarratorBrowserStagedArtifactV2[];
  readonly #pending = new Map<string, PendingCall>();
  #sequence = 0;
  #initialized = false;
  #initializing: Promise<void> | null = null;
  #terminated = false;
  #disposed = false;

  constructor(fields: {
    readonly worker: NarratorBrowserEvaluationWorkerLikeV2;
    readonly workerEpoch: string;
    readonly candidate: NarratorModelCandidate;
    readonly runSpec: NarratorEvaluationRunSpecV2;
    readonly modelArtifacts: readonly NarratorBrowserStagedArtifactV2[];
    readonly runtimeArtifacts: readonly NarratorBrowserStagedArtifactV2[];
  }) {
    if (!isNarratorModelCandidate(fields.candidate)
      || !isNarratorEvaluationRunSpecV2(fields.runSpec, fields.candidate)
      || !isNarratorBoundedText(fields.workerEpoch, 200)
      || !denseStagedArtifacts(fields.modelArtifacts)
      || !denseStagedArtifacts(fields.runtimeArtifacts)) {
      throw new TypeError("Narrator browser worker initialization is invalid");
    }
    const buffers = [...fields.modelArtifacts, ...fields.runtimeArtifacts].map((artifact) => artifact.bytes);
    if (new Set(buffers).size !== buffers.length) {
      throw new TypeError("Narrator browser worker artifact buffers must have unique ownership");
    }
    this.modelId = fields.candidate.candidateId;
    this.workerEpoch = fields.workerEpoch;
    this.#worker = fields.worker;
    this.#candidate = fields.candidate;
    this.#runSpec = fields.runSpec;
    this.#modelArtifacts = fields.modelArtifacts;
    this.#runtimeArtifacts = fields.runtimeArtifacts;
    this.#worker.onmessage = (event) => this.#receive(event.data);
    this.#worker.onmessageerror = () => this.#fatalTransport(new Error("Narrator browser worker message error"));
    this.#worker.onerror = () => this.#fatalTransport(new Error("Narrator browser worker error"));
  }

  async #initialize(signal: AbortSignal): Promise<void> {
    if (this.#initialized) return;
    if (this.#initializing !== null) return this.#initializing;
    this.#initializing = (async () => {
      await this.#call("initialize", {
        workerEpoch: this.workerEpoch,
        candidate: this.#candidate,
        runSpec: this.#runSpec,
        modelArtifacts: this.#modelArtifacts,
        runtimeArtifacts: this.#runtimeArtifacts,
      }, signal, [...this.#modelArtifacts, ...this.#runtimeArtifacts].map((artifact) => artifact.bytes));
      this.#initialized = true;
    })();
    return this.#initializing;
  }

  #receive(value: unknown): void {
    if (!validResponse(value)) {
      this.#fatalTransport(new TypeError("Narrator browser worker response is malformed"));
      return;
    }
    const pending = this.#pending.get(value.rpcId);
    if (pending === undefined) return;
    this.#pending.delete(value.rpcId);
    pending.signal.removeEventListener("abort", pending.abort);
    if (value.ok) pending.resolve(value.value);
    else pending.reject(new Error(`Narrator browser worker rejected call: ${value.errorCode}`));
  }

  #failPending(error: Error): void {
    for (const [rpcId, pending] of this.#pending) {
      this.#pending.delete(rpcId);
      pending.signal.removeEventListener("abort", pending.abort);
      pending.reject(error);
    }
  }

  #endTransport(error: Error, suppressTerminationError: boolean): void {
    if (this.#terminated) return;
    this.#terminated = true;
    this.#failPending(error);
    if (!suppressTerminationError) {
      this.#worker.terminate();
      return;
    }
    try { this.#worker.terminate(); } catch { /* Event callbacks cannot report termination errors. */ }
  }

  #fatalTransport(error: Error): void {
    this.#endTransport(error, true);
  }

  #call(
    kind: NarratorBrowserEvaluationCommandKindV2,
    fields: Readonly<Record<string, unknown>>,
    signal: AbortSignal,
    transfer: Transferable[] = [],
  ): Promise<unknown> {
    if (this.#terminated) return Promise.reject(new Error("Narrator browser worker is terminated"));
    if (signal.aborted) return Promise.reject(abortError());
    const rpcId = `rpc:${String(this.#sequence).padStart(4, "0")}`;
    this.#sequence += 1;
    const command = {
      schemaVersion: narratorBrowserEvaluationRpcVersionV2,
      rpcId,
      kind,
      ...fields,
    };
    return new Promise((resolve, reject) => {
      const abort = (): void => {
        const pending = this.#pending.get(rpcId);
        if (pending === undefined) return;
        this.#pending.delete(rpcId);
        pending.signal.removeEventListener("abort", pending.abort);
        reject(abortError());
      };
      this.#pending.set(rpcId, { resolve, reject, signal, abort });
      signal.addEventListener("abort", abort, { once: true });
      try {
        this.#worker.postMessage(command, transfer);
      } catch (error) {
        this.#fatalTransport(error instanceof Error
          ? error
          : new Error("Narrator browser worker postMessage failed"));
      }
    });
  }

  async handshake(signal: AbortSignal): Promise<unknown> {
    await this.#initialize(signal);
    return this.#call("handshake", {}, signal);
  }

  async verifyArtifacts(signal: AbortSignal): Promise<unknown> {
    await this.#initialize(signal);
    return this.#call("verify-artifacts", {}, signal);
  }

  async load(signal: AbortSignal): Promise<void> {
    await this.#initialize(signal);
    await this.#call("load", {}, signal);
  }

  async evaluate(
    request: NarratorEvaluationWorkerCaseRequestV2,
    options: { readonly maximumOutputTokens: 48; readonly signal: AbortSignal },
  ): Promise<unknown> {
    await this.#initialize(options.signal);
    return this.#call("run-case", {
      request,
      maximumOutputTokens: options.maximumOutputTokens,
    }, options.signal);
  }

  async dispose(signal: AbortSignal): Promise<void> {
    if (this.#disposed) return;
    await this.#initialize(signal);
    await this.#call("dispose", {}, signal);
    this.#disposed = true;
  }

  terminate(): void {
    this.#endTransport(new Error("Narrator browser worker was terminated"), false);
  }
}
