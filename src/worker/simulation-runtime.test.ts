import { describe, expect, it } from "vitest";
import { createWorld } from "../core/simulation";
import type { WorldState } from "../core/types";
import { maximumEnvelopeBytes, type WorkerResponseEnvelope } from "./protocol";
import { SimulationRuntime } from "./simulation-runtime";

function initializeEnvelope(state: WorldState) {
  return {
    protocolVersion: 1,
    campaignId: state.campaignId,
    workerEpoch: "epoch:1",
    requestId: "request:init",
    expectedRevision: state.tick,
    kind: "initialize",
    payload: { state },
  } as const;
}

function advanceEnvelope(expectedRevision: number, requestId = "request:advance") {
  return {
    protocolVersion: 1,
    campaignId: "campaign",
    workerEpoch: "epoch:1",
    requestId,
    expectedRevision,
    kind: "advance",
    payload: {},
  } as const;
}

function errorCode(response: WorkerResponseEnvelope): string | undefined {
  return response.kind === "error" ? response.payload.code : undefined;
}

describe("simulation worker runtime", () => {
  it("initializes and advances a revisioned campaign", () => {
    const runtime = new SimulationRuntime();
    const initial = createWorld("worker-seed", "campaign");
    expect(runtime.process(initializeEnvelope(initial))).toMatchObject({
      kind: "state",
      revision: 0,
    });
    expect(runtime.process(advanceEnvelope(0))).toMatchObject({
      kind: "state",
      revision: 1,
    });
    expect(runtime.currentState?.tick).toBe(1);
  });

  it("returns the cached response for duplicate request ids", () => {
    const runtime = new SimulationRuntime();
    runtime.process(initializeEnvelope(createWorld("worker-seed", "campaign")));
    const request = advanceEnvelope(0);
    const first = runtime.process(request);
    const duplicate = runtime.process(request);
    expect(duplicate).toBe(first);
    expect(runtime.currentState?.tick).toBe(1);
  });

  it("rejects stale and reordered revisions without mutation", () => {
    const runtime = new SimulationRuntime();
    runtime.process(initializeEnvelope(createWorld("worker-seed", "campaign")));
    runtime.process(advanceEnvelope(0, "request:first"));
    const stale = runtime.process(advanceEnvelope(0, "request:stale"));
    const future = runtime.process(advanceEnvelope(9, "request:future"));
    expect(errorCode(stale)).toBe("staleRevision");
    expect(errorCode(future)).toBe("staleRevision");
    expect(runtime.currentState?.tick).toBe(1);
  });

  it("rejects a request from the wrong worker epoch", () => {
    const runtime = new SimulationRuntime();
    runtime.process(initializeEnvelope(createWorld("worker-seed", "campaign")));
    const response = runtime.process({
      ...advanceEnvelope(0),
      workerEpoch: "epoch:old",
    });
    expect(errorCode(response)).toBe("wrongWorkerEpoch");
    expect(runtime.currentState?.tick).toBe(0);
  });

  it("rejects wrong versions, unknown kinds, and oversized envelopes", () => {
    const runtime = new SimulationRuntime();
    const base = initializeEnvelope(createWorld("worker-seed", "campaign"));
    expect(errorCode(runtime.process({ ...base, protocolVersion: 99 }))).toBe(
      "wrongProtocolVersion",
    );
    expect(errorCode(runtime.process({ ...base, kind: "teleport" }))).toBe(
      "unknownRequestKind",
    );
    expect(
      errorCode(
        runtime.process({
          ...base,
          payload: { padding: "x".repeat(maximumEnvelopeBytes) },
        }),
      ),
    ).toBe("oversizedEnvelope");
    expect(runtime.currentState).toBeUndefined();
  });

  it("runs bounded catch-up through the same revision gate", () => {
    const runtime = new SimulationRuntime();
    runtime.process(initializeEnvelope(createWorld("worker-seed", "campaign")));
    const response = runtime.process({
      protocolVersion: 1,
      campaignId: "campaign",
      workerEpoch: "epoch:1",
      requestId: "request:catch-up",
      expectedRevision: 0,
      kind: "catchUp",
      payload: {
        id: "observation:worker",
        observedAtMs: 1_000_000,
        elapsedMs: 1_000_000,
        requestedTicks: 1_000,
      },
    });
    expect(response).toMatchObject({ kind: "state", revision: 11 });
    expect(runtime.currentState?.pendingAttention).toHaveLength(1);
  });

  it("rejects malformed schema-three state before initialization", () => {
    const runtime = new SimulationRuntime();
    const initial = createWorld("worker-seed", "campaign");
    const response = runtime.process(
      initializeEnvelope({
        ...initial,
        lifecycle: { ...initial.lifecycle, simulationTick: 99 },
      }),
    );
    expect(errorCode(response)).toBe("invalidPayload");
    expect(runtime.currentState).toBeUndefined();
  });
});
