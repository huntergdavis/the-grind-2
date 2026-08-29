import {
  advanceWorld,
  catchUpWorld,
  upgradeWorldState,
  type CatchUpRequest,
} from "../core/simulation";
import { canonicalHash } from "../core/canonical";
import type { WorldState } from "../core/types";
import {
  envelopeByteLength,
  maximumEnvelopeBytes,
  simulationProtocolVersion,
  type WorkerErrorCode,
  type WorkerRequestEnvelope,
  type WorkerResponseEnvelope,
} from "./protocol";

const maximumCachedResponses = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "unknown";
}

function integerField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : 0;
}

function isCatchUpRequest(value: unknown): value is CatchUpRequest {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    Number.isSafeInteger(value.observedAtMs) &&
    (value.observedAtMs as number) >= 0 &&
    Number.isSafeInteger(value.elapsedMs) &&
    (value.elapsedMs as number) >= 0 &&
    Number.isSafeInteger(value.requestedTicks) &&
    (value.requestedTicks as number) >= 0
  );
}

export class SimulationRuntime {
  private state: WorldState | undefined;
  private campaignId = "unknown";
  private workerEpoch = "unknown";
  private readonly responses = new Map<string, WorkerResponseEnvelope>();

  get currentState(): WorldState | undefined {
    return this.state;
  }

  process(value: unknown): WorkerResponseEnvelope {
    const record = isRecord(value) ? value : {};
    if (envelopeByteLength(value) > maximumEnvelopeBytes) {
      return this.error(record, "oversizedEnvelope", "Worker envelope exceeds byte limit");
    }
    if (!isRecord(value)) {
      return this.error(record, "invalidEnvelope", "Worker envelope must be an object");
    }
    if (value.protocolVersion !== simulationProtocolVersion) {
      return this.error(record, "wrongProtocolVersion", "Unsupported protocol version");
    }

    const campaignId = value.campaignId;
    const workerEpoch = value.workerEpoch;
    const requestId = value.requestId;
    const expectedRevision = value.expectedRevision;
    if (
      typeof campaignId !== "string" ||
      campaignId.length === 0 ||
      typeof workerEpoch !== "string" ||
      workerEpoch.length === 0 ||
      typeof requestId !== "string" ||
      requestId.length === 0 ||
      !Number.isSafeInteger(expectedRevision) ||
      (expectedRevision as number) < 0 ||
      !isRecord(value.payload)
    ) {
      return this.error(value, "invalidEnvelope", "Worker envelope fields are invalid");
    }

    const cached = this.responses.get(requestId);
    if (cached !== undefined) return cached;

    if (value.kind === "initialize") {
      return this.initialize(value as unknown as WorkerRequestEnvelope);
    }
    if (value.kind !== "advance" && value.kind !== "catchUp") {
      return this.error(value, "unknownRequestKind", "Unknown worker request kind");
    }
    if (this.state === undefined) {
      return this.remember(
        requestId,
        this.error(value, "uninitialized", "Worker has no campaign state"),
      );
    }
    if (campaignId !== this.campaignId) {
      return this.remember(
        requestId,
        this.error(value, "wrongCampaign", "Campaign ID does not match worker state"),
      );
    }
    if (workerEpoch !== this.workerEpoch) {
      return this.remember(
        requestId,
        this.error(value, "wrongWorkerEpoch", "Worker epoch does not match"),
      );
    }
    if (expectedRevision !== this.state.tick) {
      return this.remember(
        requestId,
        this.error(value, "staleRevision", "Expected revision does not match"),
      );
    }

    try {
      if (value.kind === "catchUp" && !isCatchUpRequest(value.payload)) {
        return this.remember(
          requestId,
          this.error(value, "invalidPayload", "Catch-up payload is invalid"),
        );
      }
      this.state =
        value.kind === "advance"
          ? advanceWorld(this.state)
          : catchUpWorld(this.state, value.payload as unknown as CatchUpRequest);
      return this.remember(
        requestId,
        this.success({ campaignId, workerEpoch, requestId }, this.state),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown worker failure";
      return this.remember(requestId, this.error(value, "internalError", message));
    }
  }

  private initialize(value: WorkerRequestEnvelope): WorkerResponseEnvelope {
    const record = value as unknown as Record<string, unknown>;
    const requestId = stringField(record, "requestId");
    if (value.kind !== "initialize" || !isRecord(value.payload) || !("state" in value.payload)) {
      return this.remember(
        requestId,
        this.error(record, "invalidPayload", "Initialize payload is invalid"),
      );
    }

    try {
      const state = upgradeWorldState(value.payload.state);
      if (state.campaignId !== value.campaignId || state.tick !== value.expectedRevision) {
        return this.remember(
          requestId,
          this.error(record, "invalidPayload", "Initial state identity or revision mismatch"),
        );
      }
      this.state = state;
      this.campaignId = value.campaignId;
      this.workerEpoch = value.workerEpoch;
      this.responses.clear();
      return this.remember(requestId, this.success(value, state));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid campaign state";
      return this.remember(requestId, this.error(record, "invalidPayload", message));
    }
  }

  private success(
    request: Pick<WorkerRequestEnvelope, "campaignId" | "workerEpoch" | "requestId">,
    state: WorldState,
  ): WorkerResponseEnvelope {
    return {
      protocolVersion: simulationProtocolVersion,
      campaignId: request.campaignId,
      workerEpoch: request.workerEpoch,
      requestId: request.requestId,
      revision: state.tick,
      canonicalHash: canonicalHash(state),
      kind: "state",
      payload: { state },
    };
  }

  private error(
    record: Record<string, unknown>,
    code: WorkerErrorCode,
    message: string,
  ): WorkerResponseEnvelope {
    return {
      protocolVersion: simulationProtocolVersion,
      campaignId: stringField(record, "campaignId"),
      workerEpoch: stringField(record, "workerEpoch"),
      requestId: stringField(record, "requestId"),
      revision: this.state?.tick ?? integerField(record, "expectedRevision"),
      canonicalHash: this.state === undefined ? "uninitialized" : canonicalHash(this.state),
      kind: "error",
      payload: { code, message },
    };
  }

  private remember(
    requestId: string,
    response: WorkerResponseEnvelope,
  ): WorkerResponseEnvelope {
    this.responses.set(requestId, response);
    while (this.responses.size > maximumCachedResponses) {
      const oldest = this.responses.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.responses.delete(oldest);
    }
    return response;
  }
}
