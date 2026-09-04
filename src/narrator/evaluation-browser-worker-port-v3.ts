import type { NarratorBrowserStagedArtifactV2 } from "./evaluation-browser-assets-v2";
import {
  isNarratorEvaluationRunSpecV3,
  type NarratorEvaluationRunSpecV3,
} from "./evaluation-contract-v3";
import type { NarratorEvaluationWorkerPortV3 } from "./evaluation-runner-v3";
import { narratorFormIdsV3, type NarratorFormIdV3 } from "./evaluation-selection-contract-v3";
import {
  isNarratorEvaluationWorkerCaseRequestV3,
  type NarratorEvaluationWorkerCaseRequestV3,
} from "./evaluation-worker-protocol-v3";
import {
  isNarratorModelCandidate,
  type NarratorModelCandidate,
} from "./model-candidate";
import { isNarratorBoundedText, isNarratorRecord, narratorHasExactKeys } from "./protocol";

export const narratorBrowserEvaluationRpcVersionV3 = 3 as const;

export type NarratorBrowserEvaluationCommandKindV3 =
  | "initialize"
  | "handshake"
  | "verify-artifacts"
  | "load"
  | "run-case"
  | "dispose";

interface NarratorBrowserEvaluationCommandBaseV3 {
  readonly schemaVersion: 3;
  readonly rpcId: string;
  readonly kind: NarratorBrowserEvaluationCommandKindV3;
}

export interface NarratorBrowserEvaluationInitializeCommandV3 extends NarratorBrowserEvaluationCommandBaseV3 {
  readonly kind: "initialize";
  readonly workerEpoch: string;
  readonly candidate: NarratorModelCandidate;
  readonly runSpec: NarratorEvaluationRunSpecV3;
  readonly modelArtifacts: readonly NarratorBrowserStagedArtifactV2[];
  readonly runtimeArtifacts: readonly NarratorBrowserStagedArtifactV2[];
}

export interface NarratorBrowserEvaluationCaseCommandV3 extends NarratorBrowserEvaluationCommandBaseV3 {
  readonly kind: "run-case";
  readonly request: NarratorEvaluationWorkerCaseRequestV3;
  readonly maximumOutputTokens: 48;
}

export type NarratorBrowserEvaluationCommandV3 =
  | NarratorBrowserEvaluationInitializeCommandV3
  | NarratorBrowserEvaluationCaseCommandV3
  | (NarratorBrowserEvaluationCommandBaseV3 & {
      readonly kind: "handshake" | "verify-artifacts" | "load" | "dispose";
    });

export type NarratorBrowserEvaluationResponseV3 =
  | {
      readonly schemaVersion: 3;
      readonly rpcId: string;
      readonly ok: true;
      readonly value: unknown;
    }
  | {
      readonly schemaVersion: 3;
      readonly rpcId: string;
      readonly ok: false;
      readonly errorCode: string;
    };

export interface NarratorBrowserEvaluationWorkerLikeV3 {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
  terminate(): void;
}

interface PendingCallV3 {
  readonly rpcId: string;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
  readonly signal: AbortSignal;
  readonly abort: () => void;
}

function denseStagedArtifacts(value: unknown): value is readonly NarratorBrowserStagedArtifactV2[] {
  if (!Array.isArray(value)
    || value.length === 0
    || value.length > 16
    || Object.keys(value).length !== value.length) return false;
  const paths = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const artifact = value[index];
    if (!Object.hasOwn(value, index)
      || !isNarratorRecord(artifact)
      || !narratorHasExactKeys(artifact, ["path", "bytes"])
      || !isNarratorBoundedText(artifact.path, 240)
      || !(artifact.bytes instanceof ArrayBuffer)
      || artifact.bytes.byteLength === 0
      || paths.has(artifact.path)) return false;
    paths.add(artifact.path);
  }
  return true;
}

function validResponse(value: unknown): value is NarratorBrowserEvaluationResponseV3 {
  if (!isNarratorRecord(value)
    || value.schemaVersion !== narratorBrowserEvaluationRpcVersionV3
    || !isNarratorBoundedText(value.rpcId, 120)
    || typeof value.ok !== "boolean") return false;
  if (value.ok) return narratorHasExactKeys(value, ["schemaVersion", "rpcId", "ok", "value"]);
  return narratorHasExactKeys(value, ["schemaVersion", "rpcId", "ok", "errorCode"])
    && isNarratorBoundedText(value.errorCode, 160);
}

function validCaseRequest(
  value: unknown,
  runSpec: NarratorEvaluationRunSpecV3,
  candidate: NarratorModelCandidate,
): value is NarratorEvaluationWorkerCaseRequestV3 {
  if (!isNarratorRecord(value) || !isNarratorRecord(value.eligibility)) return false;
  const priorSelectedFormId = value.eligibility.priorSelectedFormId;
  const priorWorkerResponseHash = value.priorWorkerResponseHash;
  if (!(priorSelectedFormId === null
      || (typeof priorSelectedFormId === "string"
        && (narratorFormIdsV3 as readonly string[]).includes(priorSelectedFormId)))
    || !(priorWorkerResponseHash === null || typeof priorWorkerResponseHash === "string")) return false;
  return isNarratorEvaluationWorkerCaseRequestV3(
    value,
    runSpec,
    candidate,
    priorSelectedFormId as NarratorFormIdV3 | null,
    priorWorkerResponseHash,
  );
}

function abortError(): DOMException {
  return new DOMException("Narrator browser worker call aborted", "AbortError");
}

export class NarratorBrowserEvaluationWorkerPortV3 implements NarratorEvaluationWorkerPortV3 {
  readonly modelId: string;
  readonly workerEpoch: string;

  readonly #worker: NarratorBrowserEvaluationWorkerLikeV3;
  readonly #candidate: NarratorModelCandidate;
  readonly #runSpec: NarratorEvaluationRunSpecV3;
  readonly #modelArtifacts: readonly NarratorBrowserStagedArtifactV2[];
  readonly #runtimeArtifacts: readonly NarratorBrowserStagedArtifactV2[];
  #pending: PendingCallV3 | null = null;
  #sequence = 0;
  #initialized = false;
  #initializing: Promise<void> | null = null;
  #terminated = false;
  #disposed = false;

  constructor(fields: {
    readonly worker: NarratorBrowserEvaluationWorkerLikeV3;
    readonly workerEpoch: string;
    readonly candidate: NarratorModelCandidate;
    readonly runSpec: NarratorEvaluationRunSpecV3;
    readonly modelArtifacts: readonly NarratorBrowserStagedArtifactV2[];
    readonly runtimeArtifacts: readonly NarratorBrowserStagedArtifactV2[];
  }) {
    if (!isNarratorModelCandidate(fields.candidate)
      || !isNarratorEvaluationRunSpecV3(fields.runSpec, fields.candidate)
      || !isNarratorBoundedText(fields.workerEpoch, 200)
      || !denseStagedArtifacts(fields.modelArtifacts)
      || !denseStagedArtifacts(fields.runtimeArtifacts)) {
      throw new TypeError("Narrator V3 browser worker initialization is invalid");
    }
    const artifacts = [...fields.modelArtifacts, ...fields.runtimeArtifacts];
    const paths = artifacts.map((artifact) => artifact.path);
    const buffers = artifacts.map((artifact) => artifact.bytes);
    if (new Set(paths).size !== paths.length || new Set(buffers).size !== buffers.length) {
      throw new TypeError("Narrator V3 browser worker artifacts must have unique paths and buffer ownership");
    }
    this.modelId = fields.candidate.candidateId;
    this.workerEpoch = fields.workerEpoch;
    this.#worker = fields.worker;
    this.#candidate = fields.candidate;
    this.#runSpec = fields.runSpec;
    this.#modelArtifacts = fields.modelArtifacts;
    this.#runtimeArtifacts = fields.runtimeArtifacts;
    this.#worker.onmessage = (event) => this.#receive(event.data);
    this.#worker.onmessageerror = () => this.#fatalTransport(new Error("Narrator V3 browser worker message error"));
    this.#worker.onerror = () => this.#fatalTransport(new Error("Narrator V3 browser worker error"));
  }

  async #initialize(signal: AbortSignal): Promise<void> {
    if (this.#terminated) throw new Error("Narrator V3 browser worker is terminated");
    if (this.#disposed) throw new Error("Narrator V3 browser worker is disposed");
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
      this.#fatalTransport(new TypeError("Narrator V3 browser worker response is malformed"));
      return;
    }
    const pending = this.#pending;
    if (pending === null) {
      this.#fatalTransport(new TypeError("Narrator V3 browser worker response is stale"));
      return;
    }
    if (value.rpcId !== pending.rpcId) {
      this.#fatalTransport(new TypeError("Narrator V3 browser worker response RPC id is mismatched"));
      return;
    }
    this.#pending = null;
    pending.signal.removeEventListener("abort", pending.abort);
    if (value.ok) pending.resolve(value.value);
    else pending.reject(new Error(`Narrator V3 browser worker rejected call: ${value.errorCode}`));
  }

  #failPending(error: Error): void {
    const pending = this.#pending;
    if (pending === null) return;
    this.#pending = null;
    pending.signal.removeEventListener("abort", pending.abort);
    pending.reject(error);
  }

  #endTransport(error: Error, suppressTerminationError: boolean): void {
    if (this.#terminated) return;
    this.#terminated = true;
    this.#failPending(error);
    if (!suppressTerminationError) {
      this.#worker.terminate();
      return;
    }
    try { this.#worker.terminate(); } catch { /* Event and abort paths cannot report termination errors. */ }
  }

  #fatalTransport(error: Error): void {
    this.#endTransport(error, true);
  }

  #call(
    kind: NarratorBrowserEvaluationCommandKindV3,
    fields: Readonly<Record<string, unknown>>,
    signal: AbortSignal,
    transfer: Transferable[] = [],
  ): Promise<unknown> {
    if (this.#terminated) return Promise.reject(new Error("Narrator V3 browser worker is terminated"));
    if (this.#disposed) return Promise.reject(new Error("Narrator V3 browser worker is disposed"));
    if (signal.aborted) {
      const error = abortError();
      this.#endTransport(error, true);
      return Promise.reject(error);
    }
    if (this.#pending !== null) {
      return Promise.reject(new Error("Narrator V3 browser worker already has a pending RPC"));
    }
    const rpcId = `rpc:${String(this.#sequence).padStart(4, "0")}`;
    this.#sequence += 1;
    const command = {
      schemaVersion: narratorBrowserEvaluationRpcVersionV3,
      rpcId,
      kind,
      ...fields,
    };
    return new Promise((resolve, reject) => {
      const abort = (): void => {
        if (this.#pending?.rpcId !== rpcId) return;
        this.#endTransport(abortError(), true);
      };
      this.#pending = { rpcId, resolve, reject, signal, abort };
      signal.addEventListener("abort", abort, { once: true });
      try {
        this.#worker.postMessage(command, transfer);
      } catch (error) {
        this.#fatalTransport(error instanceof Error
          ? error
          : new Error("Narrator V3 browser worker postMessage failed"));
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
    request: NarratorEvaluationWorkerCaseRequestV3,
    options: { readonly maximumOutputTokens: 48; readonly signal: AbortSignal },
  ): Promise<unknown> {
    if (options.maximumOutputTokens !== 48
      || !validCaseRequest(request, this.#runSpec, this.#candidate)) {
      throw new TypeError("Narrator V3 browser worker case command is invalid");
    }
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
    this.#endTransport(new Error("Narrator V3 browser worker was terminated"), false);
  }
}
