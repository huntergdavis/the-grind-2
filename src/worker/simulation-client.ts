import { upgradeWorldState, type CatchUpRequest } from "../core/simulation";
import { canonicalHash } from "../core/canonical";
import type { WorldState } from "../core/types";
import { randomId } from "../random-id";
import {
  simulationProtocolVersion,
  type WorkerRequestEnvelope,
  type WorkerRequestKind,
  type WorkerResponseEnvelope,
} from "./protocol";

interface PendingRequest {
  resolve: (state: WorldState) => void;
  reject: (error: Error) => void;
  timeout: number;
}

const maximumPendingRequests = 8;
const workerResponseTimeoutMs = 15_000;

export class SimulationWorkerError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SimulationWorkerError";
  }
}

export class SimulationClient {
  private worker: Worker | undefined;
  private workerEpoch = "";
  private campaignId = "";
  private revision = 0;
  private requestOrdinal = 0;
  private readonly pending = new Map<string, PendingRequest>();

  async reset(state: WorldState): Promise<WorldState> {
    this.terminate();
    this.workerEpoch = randomId();
    this.campaignId = state.campaignId;
    this.revision = state.tick;
    this.requestOrdinal = 0;
    this.worker = new Worker(new URL("./simulation.worker.ts", import.meta.url), {
      type: "module",
      name: `the-grind-2:${state.campaignId}`,
    });
    this.worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      this.receive(event.data);
    });
    this.worker.addEventListener("error", () => {
      this.rejectAll(new SimulationWorkerError("workerCrashed", "Simulation worker crashed"));
    });
    return this.request("initialize", { state });
  }

  advance(): Promise<WorldState> {
    return this.request("advance", {});
  }

  catchUp(request: CatchUpRequest): Promise<WorldState> {
    return this.request("catchUp", request);
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.rejectAll(new SimulationWorkerError("workerTerminated", "Simulation worker stopped"));
  }

  private request(kind: WorkerRequestKind, payload: unknown): Promise<WorldState> {
    if (this.worker === undefined) {
      return Promise.reject(
        new SimulationWorkerError("workerUnavailable", "Simulation worker is unavailable"),
      );
    }
    if (this.pending.size >= maximumPendingRequests) {
      return Promise.reject(
        new SimulationWorkerError("backpressure", "Simulation request queue is full"),
      );
    }
    const requestId = `${this.workerEpoch}:${this.requestOrdinal}`;
    this.requestOrdinal += 1;
    const envelope = {
      protocolVersion: simulationProtocolVersion,
      campaignId: this.campaignId,
      workerEpoch: this.workerEpoch,
      requestId,
      expectedRevision: this.revision,
      kind,
      payload,
    } as WorkerRequestEnvelope;

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        const pending = this.pending.get(requestId);
        if (pending === undefined) return;
        this.pending.delete(requestId);
        pending.reject(
          new SimulationWorkerError("workerTimeout", "Simulation worker did not respond"),
        );
      }, workerResponseTimeoutMs);
      this.pending.set(requestId, { resolve, reject, timeout });
      this.worker?.postMessage(envelope);
    });
  }

  private receive(value: unknown): void {
    if (typeof value !== "object" || value === null) return;
    const response = value as WorkerResponseEnvelope;
    if (
      response.protocolVersion !== simulationProtocolVersion ||
      response.workerEpoch !== this.workerEpoch ||
      response.campaignId !== this.campaignId ||
      typeof response.requestId !== "string"
    ) {
      return;
    }
    const pending = this.pending.get(response.requestId);
    if (pending === undefined) return;
    this.pending.delete(response.requestId);
    window.clearTimeout(pending.timeout);
    if (response.kind === "error") {
      pending.reject(new SimulationWorkerError(response.payload.code, response.payload.message));
      return;
    }

    try {
      const state = upgradeWorldState(response.payload.state);
      if (state.tick !== response.revision) {
        throw new Error("Worker response revision does not match state");
      }
      if (canonicalHash(state) !== response.canonicalHash) {
        throw new Error("Worker response canonical hash does not match state");
      }
      this.revision = response.revision;
      pending.resolve(state);
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error("Invalid worker response"));
    }
  }

  private rejectAll(error: Error): void {
    for (const request of this.pending.values()) {
      window.clearTimeout(request.timeout);
      request.reject(error);
    }
    this.pending.clear();
  }
}
