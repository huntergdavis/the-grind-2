import type { CatchUpRequest } from "../core/simulation";
import type { WorldState } from "../core/types";

export const simulationProtocolVersion = 1;
export const maximumEnvelopeBytes = 1_000_000;

export type WorkerRequestKind = "initialize" | "advance" | "catchUp";

interface WorkerRequestBase {
  protocolVersion: 1;
  campaignId: string;
  workerEpoch: string;
  requestId: string;
  expectedRevision: number;
}

export type WorkerRequestEnvelope =
  | (WorkerRequestBase & {
      kind: "initialize";
      payload: { state: WorldState };
    })
  | (WorkerRequestBase & {
      kind: "advance";
      payload: Record<string, never>;
    })
  | (WorkerRequestBase & {
      kind: "catchUp";
      payload: CatchUpRequest;
    });

export type WorkerErrorCode =
  | "invalidEnvelope"
  | "oversizedEnvelope"
  | "wrongProtocolVersion"
  | "unknownRequestKind"
  | "invalidPayload"
  | "uninitialized"
  | "wrongCampaign"
  | "wrongWorkerEpoch"
  | "staleRevision"
  | "internalError";

interface WorkerResponseBase {
  protocolVersion: 1;
  campaignId: string;
  workerEpoch: string;
  requestId: string;
  revision: number;
  canonicalHash: string;
}

export type WorkerResponseEnvelope =
  | (WorkerResponseBase & {
      kind: "state";
      payload: { state: WorldState };
    })
  | (WorkerResponseBase & {
      kind: "error";
      payload: { code: WorkerErrorCode; message: string };
    });

export function envelopeByteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}
