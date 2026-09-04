import { describe, expect, it } from "vitest";
import { advanceWorld, createWorld } from "../core/simulation";
import type { NarratorExperimentalModelPolicyV1 } from "./experimental-policy";
import { allowedNarratorLines, deterministicNarratorFallback } from "./output-policy";
import {
  narratorDispatchWindowMs,
  narratorLoadTimeoutMs,
  narratorRealizationTimeoutMs,
  NarratorClient,
  type NarratorClock,
  type NarratorWorkerPort,
} from "./narrator-client";
import type {
  NarratorCapability,
  NarratorJobV1,
  NarratorModelAdmission,
  NarratorRequestEnvelope,
  NarratorResponseEnvelope,
} from "./protocol";
import { projectSceneNarratorJob } from "./scene-packet";

class FakeClock implements NarratorClock {
  time = 0;
  private ordinal = 0;
  readonly timers = new Map<number, { at: number; callback: () => void }>();

  now(): number { return this.time; }

  setTimeout(callback: () => void, milliseconds: number): number {
    const id = ++this.ordinal;
    this.timers.set(id, { at: this.time + milliseconds, callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  advance(milliseconds: number): void {
    this.time += milliseconds;
    for (const [id, timer] of [...this.timers].sort((left, right) => left[1].at - right[1].at)) {
      if (timer.at > this.time) continue;
      this.timers.delete(id);
      timer.callback();
    }
  }
}

class FakeWorker implements NarratorWorkerPort {
  readonly messages: NarratorRequestEnvelope[] = [];
  terminated = false;
  onPost: ((request: NarratorRequestEnvelope) => void) | null = null;
  private readonly messageListeners: ((event: MessageEvent<unknown>) => void)[] = [];
  private readonly errorListeners: (() => void)[] = [];
  private readonly messageErrorListeners: (() => void)[] = [];

  postMessage(value: unknown): void {
    const request = value as NarratorRequestEnvelope;
    this.messages.push(request);
    this.onPost?.(request);
  }

  terminate(): void { this.terminated = true; }

  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  addEventListener(type: "error" | "messageerror", listener: () => void): void;
  addEventListener(
    type: "message" | "error" | "messageerror",
    listener: ((event: MessageEvent<unknown>) => void) | (() => void),
  ): void {
    if (type === "message") this.messageListeners.push(listener as (event: MessageEvent<unknown>) => void);
    else if (type === "error") this.errorListeners.push(listener as () => void);
    else this.messageErrorListeners.push(listener as () => void);
  }

  emit(value: unknown): void {
    for (const listener of this.messageListeners) listener({ data: value } as MessageEvent<unknown>);
  }

  crash(): void {
    for (const listener of this.errorListeners) listener();
  }

  messageError(): void {
    for (const listener of this.messageErrorListeners) listener();
  }
}

const capability: NarratorCapability = {
  execution: "wasm",
  budget: "low-end",
  storedWeightBudgetBytes: 100 * 1024 * 1024,
  incrementalMemoryBudgetBytes: 256 * 1024 * 1024,
  reason: "local-wasm-worker",
};

const model: NarratorModelAdmission = {
  id: "test-ambient-model",
  revision: "revision:1",
  license: "Apache-2.0",
  storedWeightBytes: 50 * 1024 * 1024,
  incrementalMemoryBytes: 128 * 1024 * 1024,
};

const experimentalPolicy: NarratorExperimentalModelPolicyV1 = {
  schemaVersion: 1,
  kind: "experimental-unrated",
  modelId: model.id,
  revision: model.revision,
  license: model.license,
  storedWeightBytes: model.storedWeightBytes,
  disclosedDownloadBytes: 70 * 1024 * 1024,
  sourceEvidenceDisposition: "blocked",
  humanQualityEvaluated: false,
  modelAdmitted: false,
  formalDisplayAuthorized: false,
  productionAuthority: false,
};

const standardCapability: NarratorCapability = {
  ...capability,
  budget: "standard",
};

function jobFixture(): NarratorJobV1 {
  let world = createWorld("narrator-client", "campaign:narrator-client");
  for (let index = 0; index < 64; index += 1) {
    world = advanceWorld(world);
    const job = projectSceneNarratorJob(
      world.campaignId,
      world.scene,
      world.chronicle.at(-1),
      world.chronicle.at(-1)?.id,
    );
    if (job !== null) return job;
  }
  throw new Error("Narrator client fixture needs one committed scene");
}

function shadeJobFixture(): NarratorJobV1 {
  const job = jobFixture();
  const prompt = {
    ...job.prompt,
    voice: "spare-observer-v1" as const,
    move: "shade-atmosphere" as const,
    facts: { ...job.prompt.facts, sceneKind: "camp" as const },
  };
  return {
    ...job,
    prompt,
    deterministicFallback: deterministicNarratorFallback(prompt),
  };
}

function responseBase(request: NarratorRequestEnvelope) {
  return {
    protocolVersion: 1,
    campaignId: request.campaignId,
    workerEpoch: request.workerEpoch,
    requestId: request.requestId,
  } as const;
}

function installSuccessResponder(worker: FakeWorker): void {
  worker.onPost = (request) => {
    queueMicrotask(() => {
      if (request.kind === "load") {
        worker.emit({
          ...responseBase(request),
          kind: "status",
          payload: { state: "ready", modelId: model.id, reason: "model ready" },
        } satisfies NarratorResponseEnvelope);
      } else if (request.kind === "realize") {
        const { job } = request.payload;
        worker.emit({
          ...responseBase(request),
          kind: "result",
          payload: {
            eventId: job.eventId,
            tick: job.tick,
            sourceFingerprint: job.sourceFingerprint,
            text: allowedNarratorLines(job.prompt)[0]!,
            outputTokens: 8,
            modelId: model.id,
          },
        } satisfies NarratorResponseEnvelope);
      }
    });
  };
}

function harness(inputTokens: number | (() => Promise<number> | number) = 24, autoRespond = false) {
  const clock = new FakeClock();
  const workers: FakeWorker[] = [];
  let factoryCalls = 0;
  const client = new NarratorClient({
    clock,
    epochFactory: () => `epoch:${factoryCalls + 1}`,
    tokenMeter: { countInput: () => typeof inputTokens === "function" ? inputTokens() : inputTokens },
    workerFactory: () => {
      factoryCalls += 1;
      const worker = new FakeWorker();
      if (autoRespond) installSuccessResponder(worker);
      workers.push(worker);
      return worker;
    },
  });
  return { client, clock, workers, factoryCalls: () => factoryCalls };
}

function deferredNumber(): { readonly promise: Promise<number>; readonly resolve: (value: number) => void } {
  let resolve!: (value: number) => void;
  const promise = new Promise<number>((next) => { resolve = next; });
  return { promise, resolve };
}

describe("narrator client", () => {
  it("does no work while off and returns deterministic prose synchronously", () => {
    const { client, clock, factoryCalls } = harness();
    const job = jobFixture();
    const offer = client.narrate(job);
    expect(offer.initial).toEqual({ source: "deterministic", text: job.deterministicFallback });
    expect(offer.enhancement).toBeNull();
    expect(client.state).toBe("off");
    expect(factoryCalls()).toBe(0);
    expect(clock.timers.size).toBe(0);
  });

  it("enables an admitted low-end model without constructing a worker", () => {
    const { client, factoryCalls } = harness();
    expect(client.enable("campaign:narrator-client", model, capability)).toBe(true);
    expect(client.state).toBe("available");
    expect(client.configurationKind).toBe("admitted");
    expect(factoryCalls()).toBe(0);

    const oversized = { ...model, storedWeightBytes: capability.storedWeightBudgetBytes + 1 };
    expect(client.enable("campaign:narrator-client", oversized, capability)).toBe(false);
    expect(client.state).toBe("failed");
    expect(factoryCalls()).toBe(0);

    const memoryHeavy = { ...model, incrementalMemoryBytes: capability.incrementalMemoryBudgetBytes + 1 };
    expect(client.enable("campaign:narrator-client", memoryHeavy, capability)).toBe(false);
    expect(client.state).toBe("failed");
    expect(factoryCalls()).toBe(0);
  });

  it("enables an experimental unrated model only through its separate standard-device policy", () => {
    const { client, factoryCalls } = harness();
    expect(client.configurationKind).toBe("off");
    expect(client.enableExperimental(
      "campaign:narrator-client",
      experimentalPolicy,
      standardCapability,
    )).toBe(true);
    expect(client.state).toBe("available");
    expect(client.configurationKind).toBe("experimental-unrated");
    expect(client.resetAfterFailure()).toBe(false);
    expect(factoryCalls()).toBe(0);

    expect(client.enableExperimental(
      "campaign:narrator-client",
      experimentalPolicy,
      capability,
    )).toBe(false);
    expect(client.state).toBe("failed");
    expect(client.configurationKind).toBe("off");
    expect(client.resetAfterFailure()).toBe(false);
    expect(factoryCalls()).toBe(0);

    expect(client.enable("campaign:narrator-client", model, capability)).toBe(true);
    expect(client.configurationKind).toBe("admitted");
    client.disable();
    expect(client.configurationKind).toBe("off");
  });

  it("cannot reset a rejected campaign into an available configuration", () => {
    const admitted = harness().client;
    expect(admitted.enable(" padded", model, capability)).toBe(false);
    expect(admitted.state).toBe("failed");
    expect(admitted.configurationKind).toBe("off");
    expect(admitted.resetAfterFailure()).toBe(false);

    const experimental = harness().client;
    expect(experimental.enableExperimental(
      " padded",
      experimentalPolicy,
      standardCapability,
    )).toBe(false);
    expect(experimental.state).toBe("failed");
    expect(experimental.configurationKind).toBe("off");
    expect(experimental.resetAfterFailure()).toBe(false);
  });

  it("resets an eligible experimental configuration only after explicit failure recovery", async () => {
    const { client, workers, factoryCalls } = harness();
    expect(client.enableExperimental(
      "campaign:narrator-client",
      experimentalPolicy,
      standardCapability,
    )).toBe(true);
    const offer = client.narrate(jobFixture());
    await Promise.resolve();
    expect(factoryCalls()).toBe(1);
    workers[0]?.crash();
    await expect(offer.enhancement).resolves.toBeNull();
    expect(client.state).toBe("failed");
    expect(client.configurationKind).toBe("experimental-unrated");
    expect(client.resetAfterFailure()).toBe(true);
    expect(client.state).toBe("available");
    expect(client.configurationKind).toBe("experimental-unrated");
  });

  it("snapshots experimental policy before caller mutation can change model identity", async () => {
    const { client, workers } = harness();
    const mutablePolicy = { ...experimentalPolicy };
    expect(client.enableExperimental(
      "campaign:narrator-client",
      mutablePolicy,
      standardCapability,
    )).toBe(true);
    mutablePolicy.modelId = "replacement-model";
    const offer = client.narrate(jobFixture());
    await Promise.resolve();
    const load = workers[0]?.messages[0];
    expect(load?.kind).toBe("load");
    if (load?.kind !== "load") throw new Error("Narrator client did not post load request");
    expect(load.payload.modelId).toBe(experimentalPolicy.modelId);
    client.disable();
    await expect(offer.enhancement).resolves.toBeNull();
  });

  it("returns fallback first, then lazily loads one worker and accepts an exact result", async () => {
    const { client, workers, factoryCalls } = harness(24, true);
    client.enable("campaign:narrator-client", model, capability);
    const job = jobFixture();
    const offer = client.narrate(job);
    expect(offer.initial.text).toBe(job.deterministicFallback);
    expect(factoryCalls()).toBe(0);
    await expect(offer.enhancement).resolves.toEqual({ source: "model", text: allowedNarratorLines(job.prompt)[0] });
    expect(factoryCalls()).toBe(1);
    expect(workers[0]?.messages.map((request) => request.kind)).toEqual(["load", "realize"]);
    expect(client.state).toBe("ready");
  });

  it("accepts the exact shade baseline at the host trust boundary", async () => {
    const { client, workers } = harness();
    client.enable("campaign:narrator-client", model, capability);
    const job = shadeJobFixture();
    expect(allowedNarratorLines(job.prompt)).not.toContain(job.deterministicFallback);
    const offer = client.narrate(job);
    await Promise.resolve();
    const worker = workers[0];
    const load = worker?.messages[0];
    if (worker === undefined || load === undefined) throw new Error("Narrator client did not post load request");
    worker.emit({
      ...responseBase(load),
      kind: "status",
      payload: { state: "ready", modelId: model.id, reason: "model ready" },
    } satisfies NarratorResponseEnvelope);
    await Promise.resolve();
    await Promise.resolve();
    const realize = worker.messages[1];
    if (realize?.kind !== "realize") throw new Error("Narrator client did not post realize request");
    worker.emit({
      ...responseBase(realize),
      kind: "result",
      payload: {
        eventId: job.eventId,
        tick: job.tick,
        sourceFingerprint: job.sourceFingerprint,
        text: job.deterministicFallback,
        outputTokens: 8,
        modelId: model.id,
      },
    } satisfies NarratorResponseEnvelope);
    await expect(offer.enhancement).resolves.toEqual({ source: "model", text: job.deterministicFallback });
    expect(client.state).toBe("ready");
  });

  it("preflights exact input tokens before constructing a worker", async () => {
    const { client, factoryCalls } = harness(321);
    client.enable("campaign:narrator-client", model, capability);
    const offer = client.narrate(jobFixture());
    await expect(offer.enhancement).resolves.toBeNull();
    expect(factoryCalls()).toBe(0);
    expect(client.state).toBe("available");
  });

  it("cannot resume delayed token preflight after any cancellation boundary", async () => {
    const cases = [
      { name: "disable", act: (client: NarratorClient, _job: NarratorJobV1) => client.disable(), state: "off" },
      { name: "hidden", act: (client: NarratorClient, _job: NarratorJobV1) => client.setSuppressed("hidden"), state: "available" },
      { name: "eco", act: (client: NarratorClient, _job: NarratorJobV1) => client.setSuppressed("eco"), state: "available" },
      {
        name: "scene change",
        act: (client: NarratorClient, job: NarratorJobV1) => client.setCurrentSource({ ...job, sourceFingerprint: "0123456789abcdef" }),
        state: "available",
      },
      {
        name: "re-enable",
        act: (client: NarratorClient, _job: NarratorJobV1) => client.enable("campaign:replacement", model, capability),
        state: "available",
      },
      { name: "dispose", act: (client: NarratorClient, _job: NarratorJobV1) => client.dispose(), state: "off" },
    ] as const;
    for (const example of cases) {
      const tokens = deferredNumber();
      const { client, factoryCalls } = harness(() => tokens.promise);
      client.enable("campaign:narrator-client", model, capability);
      const job = jobFixture();
      const offer = client.narrate(job);
      expect(offer.enhancement, example.name).not.toBeNull();
      example.act(client, job);
      tokens.resolve(24);
      await expect(offer.enhancement, example.name).resolves.toBeNull();
      expect(factoryCalls(), example.name).toBe(0);
      expect(client.state, example.name).toBe(example.state);
    }
  });

  it("rejects a foreign-campaign job without leaking its fallback or cancelling active work", async () => {
    const { client, workers, factoryCalls } = harness();
    client.enable("campaign:narrator-client", model, capability);
    const job = jobFixture();
    const active = client.narrate(job);
    await Promise.resolve();
    expect(factoryCalls()).toBe(1);
    const foreign = {
      ...job,
      campaignId: "campaign:foreign",
      deterministicFallback: "Foreign Hollow holds a quiet moment.",
    };
    const offer = client.narrate(foreign);
    expect(offer.enhancement).toBeNull();
    expect(offer.initial.text).not.toContain("Foreign Hollow");
    expect(workers[0]?.terminated).toBe(false);
    expect(client.state).toBe("loading");
    client.disable();
    await expect(active.enhancement).resolves.toBeNull();
  });

  it("allows one active job with no queue and cancels it on scene change", async () => {
    const { client, workers } = harness();
    client.enable("campaign:narrator-client", model, capability);
    const job = jobFixture();
    const first = client.narrate(job);
    await Promise.resolve();
    expect(workers).toHaveLength(1);
    const second = client.narrate(job);
    expect(second.enhancement).toBeNull();
    client.setCurrentSource({ ...job, sourceFingerprint: "0123456789abcdef" });
    await expect(first.enhancement).resolves.toBeNull();
    expect(workers[0]?.terminated).toBe(true);
    expect(client.state).toBe("available");
  });

  it("suppresses hidden and Eco work without creating or retrying a worker", () => {
    const { client, factoryCalls } = harness();
    client.enable("campaign:narrator-client", model, capability);
    client.setSuppressed("hidden");
    expect(client.narrate(jobFixture()).enhancement).toBeNull();
    client.setSuppressed("eco");
    expect(client.narrate(jobFixture()).enhancement).toBeNull();
    expect(factoryCalls()).toBe(0);
    expect(client.state).toBe("available");
  });

  it("fails closed on a matching malformed response and permits only explicit reset", async () => {
    const { client, workers } = harness();
    client.enable("campaign:narrator-client", model, capability);
    const offer = client.narrate(jobFixture());
    await Promise.resolve();
    const request = workers[0]?.messages[0];
    if (request === undefined) throw new Error("Narrator client did not post load request");
    workers[0]?.emit({
      ...responseBase(request),
      kind: "status",
      payload: { state: "ready", modelId: model.id, reason: "model ready", extra: true },
    });
    await expect(offer.enhancement).resolves.toBeNull();
    expect(client.state).toBe("failed");
    expect(workers[0]?.terminated).toBe(true);
    expect(client.resetAfterFailure()).toBe(true);
    expect(client.state).toBe("available");
  });

  it("ignores stale identities and late duplicates while accepting only the active result", async () => {
    const { client, workers } = harness();
    client.enable("campaign:narrator-client", model, capability);
    const job = jobFixture();
    const offer = client.narrate(job);
    await Promise.resolve();
    const worker = workers[0];
    const load = worker?.messages[0];
    if (worker === undefined || load === undefined) throw new Error("Narrator client did not post load request");
    const loadReady: NarratorResponseEnvelope = {
      ...responseBase(load),
      kind: "status",
      payload: { state: "ready", modelId: model.id, reason: "model ready" },
    };
    worker.emit({ ...loadReady, workerEpoch: "epoch:stale" });
    worker.emit({ ...loadReady, requestId: "request:stale" });
    expect(worker.terminated).toBe(false);
    expect(client.state).toBe("loading");
    worker.emit(loadReady);
    await Promise.resolve();
    await Promise.resolve();
    const realize = worker.messages[1];
    if (realize?.kind !== "realize") throw new Error("Narrator client did not post realize request");
    const result: NarratorResponseEnvelope = {
      ...responseBase(realize),
      kind: "result",
      payload: {
        eventId: job.eventId,
        tick: job.tick,
        sourceFingerprint: job.sourceFingerprint,
        text: allowedNarratorLines(job.prompt)[0]!,
        outputTokens: 8,
        modelId: model.id,
      },
    };
    worker.emit(loadReady);
    worker.emit({ ...result, workerEpoch: "epoch:stale" });
    expect(worker.terminated).toBe(false);
    worker.emit(result);
    await expect(offer.enhancement).resolves.toEqual({ source: "model", text: result.payload.text });
    worker.emit(result);
    expect(client.state).toBe("ready");
    expect(worker.terminated).toBe(false);
  });

  it("fails closed on matching wrong-version and oversized responses", async () => {
    for (const kind of ["wrong-version", "oversized"] as const) {
      const { client, workers } = harness();
      client.enable("campaign:narrator-client", model, capability);
      const offer = client.narrate(jobFixture());
      await Promise.resolve();
      const request = workers[0]?.messages[0];
      if (request === undefined) throw new Error("Narrator client did not post load request");
      workers[0]?.emit(kind === "wrong-version"
        ? {
            ...responseBase(request),
            protocolVersion: 99,
            kind: "status",
            payload: { state: "ready", modelId: model.id, reason: "model ready" },
          }
        : {
            ...responseBase(request),
            kind: "status",
            payload: { state: "ready", modelId: model.id, reason: "x".repeat(2_100) },
          });
      await expect(offer.enhancement, kind).resolves.toBeNull();
      expect(client.state, kind).toBe("failed");
      expect(workers[0]?.terminated, kind).toBe(true);
    }
  });

  it("revalidates structurally valid model prose on the host", async () => {
    const { client, workers } = harness();
    client.enable("campaign:narrator-client", model, capability);
    const job = jobFixture();
    const offer = client.narrate(job);
    await Promise.resolve();
    const worker = workers[0];
    const load = worker?.messages[0];
    if (worker === undefined || load === undefined) throw new Error("Narrator client did not post load request");
    worker.emit({
      ...responseBase(load),
      kind: "status",
      payload: { state: "ready", modelId: model.id, reason: "model ready" },
    } satisfies NarratorResponseEnvelope);
    await Promise.resolve();
    await Promise.resolve();
    const realize = worker.messages[1];
    if (realize?.kind !== "realize") throw new Error("Narrator client did not post realize request");
    worker.emit({
      ...responseBase(realize),
      kind: "result",
      payload: {
        eventId: job.eventId,
        tick: job.tick,
        sourceFingerprint: job.sourceFingerprint,
        text: "The air is warm.",
        outputTokens: 5,
        modelId: model.id,
      },
    } satisfies NarratorResponseEnvelope);
    await expect(offer.enhancement).resolves.toBeNull();
    expect(client.state).toBe("failed");
    expect(worker.terminated).toBe(true);
  });

  it("fails closed when the worker returns a valid error envelope", async () => {
    const { client, workers } = harness();
    client.enable("campaign:narrator-client", model, capability);
    const offer = client.narrate(jobFixture());
    await Promise.resolve();
    const request = workers[0]?.messages[0];
    if (request === undefined) throw new Error("Narrator client did not post load request");
    workers[0]?.emit({
      ...responseBase(request),
      kind: "error",
      payload: { code: "deviceLost", message: "Inference device was lost" },
    } satisfies NarratorResponseEnvelope);
    await expect(offer.enhancement).resolves.toBeNull();
    expect(client.state).toBe("failed");
    expect(workers[0]?.terminated).toBe(true);
  });

  it("gives model loading its measured budget, then fails closed without retry", async () => {
    const { client, workers, clock, factoryCalls } = harness();
    client.enable("campaign:narrator-client", model, capability);
    const job = jobFixture();
    const offer = client.narrate(job);
    await Promise.resolve();
    expect(factoryCalls()).toBe(1);
    clock.advance(narratorRealizationTimeoutMs);
    await Promise.resolve();
    expect(client.state).toBe("loading");
    expect(workers[0]?.terminated).toBe(false);
    clock.advance(narratorLoadTimeoutMs - narratorRealizationTimeoutMs);
    await expect(offer.enhancement).resolves.toBeNull();
    expect(client.state).toBe("failed");
    expect(workers[0]?.terminated).toBe(true);
    expect(client.narrate(job).enhancement).toBeNull();
    expect(factoryCalls()).toBe(1);
  });

  it("keeps the short deadline for a stalled realization", async () => {
    const { client, workers, clock, factoryCalls } = harness();
    client.enable("campaign:narrator-client", model, capability);
    const job = jobFixture();
    const offer = client.narrate(job);
    await Promise.resolve();
    const worker = workers[0];
    const load = worker?.messages[0];
    if (worker === undefined || load?.kind !== "load") {
      throw new Error("Narrator client did not post load request");
    }
    worker.emit({
      ...responseBase(load),
      kind: "status",
      payload: { state: "ready", modelId: model.id, reason: "model ready" },
    } satisfies NarratorResponseEnvelope);
    await Promise.resolve();
    await Promise.resolve();
    expect(worker.messages[1]?.kind).toBe("realize");
    clock.advance(narratorRealizationTimeoutMs);
    await expect(offer.enhancement).resolves.toBeNull();
    expect(client.state).toBe("failed");
    expect(worker.terminated).toBe(true);
    expect(client.narrate(job).enhancement).toBeNull();
    expect(factoryCalls()).toBe(1);
  });

  it("counts admitted jobs and cools down after two dispatches per ten minutes", async () => {
    const { client, workers, clock } = harness(24, true);
    client.enable("campaign:narrator-client", model, capability);
    const job = jobFixture();
    await client.narrate(job).enhancement;
    await client.narrate(job).enhancement;
    await expect(client.narrate(job).enhancement).resolves.toBeNull();
    expect(client.state).toBe("cooldown");
    expect(workers[0]?.messages.filter((request) => request.kind === "realize")).toHaveLength(2);

    clock.advance(narratorDispatchWindowMs);
    await expect(client.narrate(job).enhancement).resolves.toEqual({ source: "model", text: allowedNarratorLines(job.prompt)[0] });
    expect(client.state).toBe("ready");
  });

  it("does not reset the rolling dispatch budget when disabled or re-enabled", async () => {
    const { client, factoryCalls } = harness(24, true);
    client.enable("campaign:narrator-client", model, capability);
    const job = jobFixture();
    await client.narrate(job).enhancement;
    await client.narrate(job).enhancement;
    client.disable();
    client.enable("campaign:narrator-client", model, capability);
    await expect(client.narrate(job).enhancement).resolves.toBeNull();
    expect(client.state).toBe("cooldown");
    expect(factoryCalls()).toBe(1);
  });

  it("terminates on worker and message transport failure", async () => {
    for (const failure of ["crash", "messageError"] as const) {
      const { client, workers } = harness();
      client.enable("campaign:narrator-client", model, capability);
      const offer = client.narrate(jobFixture());
      await Promise.resolve();
      workers[0]?.[failure]();
      await expect(offer.enhancement).resolves.toBeNull();
      expect(client.state).toBe("failed");
      expect(workers[0]?.terminated).toBe(true);
    }
  });

  it("fails closed without implicit retry when worker construction throws", async () => {
    const clock = new FakeClock();
    let factoryCalls = 0;
    const client = new NarratorClient({
      clock,
      epochFactory: () => "epoch:construction-failure",
      tokenMeter: { countInput: () => 24 },
      workerFactory: () => {
        factoryCalls += 1;
        throw new Error("construction failed");
      },
    });
    client.enable("campaign:narrator-client", model, capability);
    const job = jobFixture();
    await expect(client.narrate(job).enhancement).resolves.toBeNull();
    expect(client.state).toBe("failed");
    expect(factoryCalls).toBe(1);
    expect(clock.timers.size).toBe(0);
    expect(client.narrate(job).enhancement).toBeNull();
    expect(factoryCalls).toBe(1);
  });

  it("fails closed, clears its timer, and terminates when posting throws", async () => {
    const clock = new FakeClock();
    const worker = new FakeWorker();
    worker.onPost = () => { throw new Error("post failed"); };
    let factoryCalls = 0;
    const client = new NarratorClient({
      clock,
      epochFactory: () => "epoch:post-failure",
      tokenMeter: { countInput: () => 24 },
      workerFactory: () => {
        factoryCalls += 1;
        return worker;
      },
    });
    client.enable("campaign:narrator-client", model, capability);
    const job = jobFixture();
    await expect(client.narrate(job).enhancement).resolves.toBeNull();
    expect(client.state).toBe("failed");
    expect(factoryCalls).toBe(1);
    expect(clock.timers.size).toBe(0);
    expect(worker.terminated).toBe(true);
    expect(client.narrate(job).enhancement).toBeNull();
    expect(factoryCalls).toBe(1);
  });
});
