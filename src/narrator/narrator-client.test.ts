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
  NarratorResponseEnvelope,
} from "./protocol";
import { projectSceneNarratorJob } from "./scene-packet";
import {
  storyBeatMaximumOutputTokens,
  validateStoryBeatResultV1,
  type StoryBeatJobV1,
} from "./story-beat";
import type {
  NarratorTransportRequestEnvelope,
  NarratorTransportResponseEnvelope,
} from "./story-beat-worker-protocol";

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
  readonly messages: NarratorTransportRequestEnvelope[] = [];
  terminated = false;
  onPost: ((request: NarratorTransportRequestEnvelope) => void) | null = null;
  private readonly messageListeners: ((event: MessageEvent<unknown>) => void)[] = [];
  private readonly errorListeners: (() => void)[] = [];
  private readonly messageErrorListeners: (() => void)[] = [];

  postMessage(value: unknown): void {
    const request = value as NarratorTransportRequestEnvelope;
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
  revision: "a".repeat(40),
  artifactManifestHash: "b".repeat(16),
  license: "Apache-2.0",
  storedWeightBytes: 50 * 1024 * 1024,
  incrementalMemoryBytes: 128 * 1024 * 1024,
};

const experimentalPolicy: NarratorExperimentalModelPolicyV1 = {
  schemaVersion: 1,
  kind: "experimental-unrated",
  modelId: model.id,
  revision: model.revision,
  artifactManifestHash: model.artifactManifestHash,
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

const modelBinding = {
  modelId: model.id,
  revision: model.revision,
  artifactManifestHash: model.artifactManifestHash,
} as const;

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

function storyBeatJobFixture(): StoryBeatJobV1 {
  return {
    schemaVersion: 1,
    task: "author-story-beat",
    disposition: "manual-ephemeral-noncanonical",
    campaignId: "campaign:narrator-client",
    eventId: "chronicle:story-beat:7",
    tick: 7,
    sourceFingerprint: "0123456789abcdef",
    facts: {
      schemaVersion: 1,
      kind: "public-story-beat",
      location: "Moonclock Vault",
      headline: "The marked door opens.",
      action: "Mira crosses the quiet threshold.",
      consequence: "The western passage is now reachable.",
    },
    deterministicFallback: "The marked door opens.",
    maximumInputTokens: 320,
    maximumOutputTokens: storyBeatMaximumOutputTokens,
  };
}

const validStoryBeatText = "At Moonclock Vault, Mira crosses the quiet threshold.";

function responseBase(request: NarratorTransportRequestEnvelope) {
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
          payload: { state: "ready", ...modelBinding, reason: "model ready" },
        } satisfies NarratorTransportResponseEnvelope);
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
            ...modelBinding,
          },
        } satisfies NarratorTransportResponseEnvelope);
      } else if (request.kind === "author-story-beat") {
        const { job } = request.payload;
        worker.emit({
          ...responseBase(request),
          kind: "story-beat-result",
          payload: {
            outcome: "authored",
            eventId: job.eventId,
            tick: job.tick,
            sourceFingerprint: job.sourceFingerprint,
            text: validStoryBeatText,
            outputTokens: 12,
            ...modelBinding,
          },
        } satisfies NarratorTransportResponseEnvelope);
      }
    });
  };
}

function harness(
  inputTokens: number | (() => Promise<number> | number) = 24,
  autoRespond = false,
  storyBeatInputTokens: number | (() => Promise<number> | number) = 80,
) {
  const clock = new FakeClock();
  const workers: FakeWorker[] = [];
  let factoryCalls = 0;
  const client = new NarratorClient({
    clock,
    epochFactory: () => `epoch:${factoryCalls + 1}`,
    tokenMeter: {
      countInput: () => typeof inputTokens === "function" ? inputTokens() : inputTokens,
      countStoryBeatInput: () => typeof storyBeatInputTokens === "function"
        ? storyBeatInputTokens()
        : storyBeatInputTokens,
    },
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

    for (const invalidBinding of [
      { ...model, revision: "a".repeat(39) },
      { ...model, revision: "A".repeat(40) },
      { ...model, artifactManifestHash: "b".repeat(15) },
      { ...model, artifactManifestHash: "B".repeat(16) },
    ]) {
      expect(client.enable("campaign:narrator-client", invalidBinding, capability)).toBe(false);
      expect(client.state).toBe("failed");
      expect(factoryCalls()).toBe(0);
    }
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

  it("snapshots configured bindings before caller mutation can change model identity", async () => {
    const { client, workers } = harness();
    const mutablePolicy = { ...experimentalPolicy };
    expect(client.enableExperimental(
      "campaign:narrator-client",
      mutablePolicy,
      standardCapability,
    )).toBe(true);
    mutablePolicy.modelId = "replacement-model";
    mutablePolicy.revision = "c".repeat(40);
    mutablePolicy.artifactManifestHash = "d".repeat(16);
    const offer = client.narrate(jobFixture());
    await Promise.resolve();
    const load = workers[0]?.messages[0];
    expect(load?.kind).toBe("load");
    if (load?.kind !== "load") throw new Error("Narrator client did not post load request");
    expect(load.payload).toEqual(modelBinding);
    client.disable();
    await expect(offer.enhancement).resolves.toBeNull();

    const admittedHarness = harness();
    const mutableModel = { ...model };
    expect(admittedHarness.client.enable(
      "campaign:narrator-client",
      mutableModel,
      capability,
    )).toBe(true);
    mutableModel.id = "replacement-model";
    mutableModel.revision = "c".repeat(40);
    mutableModel.artifactManifestHash = "d".repeat(16);
    const admittedOffer = admittedHarness.client.narrate(jobFixture());
    await Promise.resolve();
    const admittedLoad = admittedHarness.workers[0]?.messages[0];
    if (admittedLoad?.kind !== "load") throw new Error("Narrator client did not post admitted load request");
    expect(admittedLoad.payload).toEqual(modelBinding);
    admittedHarness.client.disable();
    await expect(admittedOffer.enhancement).resolves.toBeNull();
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

  it("authors a validated story beat through the same warm worker as ambient selection", async () => {
    const { client, workers, factoryCalls } = harness(24, true);
    client.enable("campaign:narrator-client", model, capability);
    await expect(client.narrate(jobFixture()).enhancement).resolves.toMatchObject({
      source: "model",
    });
    const job = storyBeatJobFixture();
    expect(validateStoryBeatResultV1(validStoryBeatText, job.facts)).toBe(validStoryBeatText);
    await expect(client.authorStoryBeat(job)).resolves.toEqual({
      outcome: "authored",
      source: "model",
      text: validStoryBeatText,
    });
    expect(factoryCalls()).toBe(1);
    expect(workers[0]?.messages.map((request) => request.kind))
      .toEqual(["load", "realize", "author-story-beat"]);
    expect(client.state).toBe("ready");
  });

  it("promotes a manual story beat ahead of ambient work without retiring the warm worker", async () => {
    const { client, workers, factoryCalls } = harness();
    client.enable("campaign:narrator-client", model, capability);
    const ambientJob = jobFixture();
    const ambient = client.narrate(ambientJob);
    await Promise.resolve();
    const worker = workers[0];
    const load = worker?.messages[0];
    if (worker === undefined || load?.kind !== "load") {
      throw new Error("Narrator client did not post load request");
    }
    worker.emit({
      ...responseBase(load),
      kind: "status",
      payload: { state: "ready", ...modelBinding, reason: "model ready" },
    } satisfies NarratorTransportResponseEnvelope);
    await Promise.resolve();
    await Promise.resolve();
    const realize = worker.messages[1];
    if (realize?.kind !== "realize") {
      throw new Error("Narrator client did not post ambient request");
    }

    const storyJob = storyBeatJobFixture();
    const storyBeat = client.authorStoryBeat(storyJob);
    let storyBeatSettled = false;
    void storyBeat.then(() => { storyBeatSettled = true; });
    await Promise.resolve();
    expect(storyBeatSettled).toBe(false);
    expect(worker.messages.map((request) => request.kind)).toEqual(["load", "realize"]);

    const sameSceneAmbient = {
      ...ambientJob,
      sourceFingerprint: storyJob.sourceFingerprint,
    };
    const competingAmbient = client.narrate(sameSceneAmbient);
    expect(competingAmbient.enhancement).toBeNull();
    worker.emit({
      ...responseBase(realize),
      kind: "result",
      payload: {
        eventId: ambientJob.eventId,
        tick: ambientJob.tick,
        sourceFingerprint: ambientJob.sourceFingerprint,
        text: allowedNarratorLines(ambientJob.prompt)[0]!,
        outputTokens: 8,
        ...modelBinding,
      },
    } satisfies NarratorTransportResponseEnvelope);
    await expect(ambient.enhancement).resolves.toBeNull();
    await Promise.resolve();
    await Promise.resolve();

    const author = worker.messages[2];
    if (author?.kind !== "author-story-beat") {
      throw new Error("Manual story beat was not promoted after ambient narration");
    }
    expect(client.narrate(sameSceneAmbient).enhancement).toBeNull();
    worker.emit({
      ...responseBase(author),
      kind: "story-beat-result",
      payload: {
        outcome: "authored",
        eventId: storyJob.eventId,
        tick: storyJob.tick,
        sourceFingerprint: storyJob.sourceFingerprint,
        text: validStoryBeatText,
        outputTokens: 12,
        ...modelBinding,
      },
    } satisfies NarratorTransportResponseEnvelope);
    await expect(storyBeat).resolves.toEqual({
      outcome: "authored",
      source: "model",
      text: validStoryBeatText,
    });
    expect(factoryCalls()).toBe(1);
    expect(worker.terminated).toBe(false);
  });

  it("replaces a queued manual beat when a newer manual source arrives", async () => {
    const { client, workers } = harness();
    client.enable("campaign:narrator-client", model, capability);
    const ambientJob = jobFixture();
    const ambient = client.narrate(ambientJob);
    await Promise.resolve();
    const worker = workers[0];
    const load = worker?.messages[0];
    if (worker === undefined || load?.kind !== "load") {
      throw new Error("Narrator client did not post load request");
    }
    worker.emit({
      ...responseBase(load),
      kind: "status",
      payload: { state: "ready", ...modelBinding, reason: "model ready" },
    } satisfies NarratorTransportResponseEnvelope);
    await Promise.resolve();
    await Promise.resolve();
    const realize = worker.messages[1];
    if (realize?.kind !== "realize") {
      throw new Error("Narrator client did not post ambient request");
    }

    const firstJob = storyBeatJobFixture();
    const first = client.authorStoryBeat(firstJob);
    const latestJob = {
      ...firstJob,
      eventId: "chronicle:story-beat:8",
      tick: 8,
      sourceFingerprint: "fedcba9876543210",
    };
    const latest = client.authorStoryBeat(latestJob);
    await expect(first).resolves.toEqual({
      outcome: "fallback",
      source: "deterministic",
      text: firstJob.deterministicFallback,
      reason: "stale",
    });
    expect(worker.messages.map((request) => request.kind)).toEqual(["load", "realize"]);

    worker.emit({
      ...responseBase(realize),
      kind: "result",
      payload: {
        eventId: ambientJob.eventId,
        tick: ambientJob.tick,
        sourceFingerprint: ambientJob.sourceFingerprint,
        text: allowedNarratorLines(ambientJob.prompt)[0]!,
        outputTokens: 8,
        ...modelBinding,
      },
    } satisfies NarratorTransportResponseEnvelope);
    await expect(ambient.enhancement).resolves.toBeNull();
    await Promise.resolve();
    await Promise.resolve();
    const author = worker.messages[2];
    if (author?.kind !== "author-story-beat") {
      throw new Error("Latest manual story beat was not promoted");
    }
    expect(author.payload.job.sourceFingerprint).toBe(latestJob.sourceFingerprint);
    worker.emit({
      ...responseBase(author),
      kind: "story-beat-result",
      payload: {
        outcome: "authored",
        eventId: latestJob.eventId,
        tick: latestJob.tick,
        sourceFingerprint: latestJob.sourceFingerprint,
        text: validStoryBeatText,
        outputTokens: 12,
        ...modelBinding,
      },
    } satisfies NarratorTransportResponseEnvelope);
    await expect(latest).resolves.toEqual({
      outcome: "authored",
      source: "model",
      text: validStoryBeatText,
    });
    expect(worker.messages.filter((request) => request.kind === "author-story-beat")).toHaveLength(1);
    expect(worker.terminated).toBe(false);
  });

  it("stales an active manual beat before promoting a newer manual source", async () => {
    const { client, workers } = harness();
    client.enable("campaign:narrator-client", model, capability);
    const firstJob = storyBeatJobFixture();
    const first = client.authorStoryBeat(firstJob);
    await Promise.resolve();
    const worker = workers[0];
    const load = worker?.messages[0];
    if (worker === undefined || load?.kind !== "load") {
      throw new Error("Narrator client did not post load request");
    }
    worker.emit({
      ...responseBase(load),
      kind: "status",
      payload: { state: "ready", ...modelBinding, reason: "model ready" },
    } satisfies NarratorTransportResponseEnvelope);
    await Promise.resolve();
    await Promise.resolve();
    const firstAuthor = worker.messages[1];
    if (firstAuthor?.kind !== "author-story-beat") {
      throw new Error("Narrator client did not post first manual request");
    }

    const latestJob = {
      ...firstJob,
      eventId: "chronicle:story-beat:9",
      tick: 9,
      sourceFingerprint: "abcdef0123456789",
    };
    const latest = client.authorStoryBeat(latestJob);
    worker.emit({
      ...responseBase(firstAuthor),
      kind: "story-beat-result",
      payload: {
        outcome: "authored",
        eventId: firstJob.eventId,
        tick: firstJob.tick,
        sourceFingerprint: firstJob.sourceFingerprint,
        text: validStoryBeatText,
        outputTokens: 12,
        ...modelBinding,
      },
    } satisfies NarratorTransportResponseEnvelope);
    await expect(first).resolves.toEqual({
      outcome: "fallback",
      source: "deterministic",
      text: firstJob.deterministicFallback,
      reason: "stale",
    });
    await Promise.resolve();
    await Promise.resolve();
    const latestAuthor = worker.messages[2];
    if (latestAuthor?.kind !== "author-story-beat") {
      throw new Error("Latest manual story beat was not promoted");
    }
    expect(latestAuthor.payload.job.sourceFingerprint).toBe(latestJob.sourceFingerprint);
    worker.emit({
      ...responseBase(latestAuthor),
      kind: "story-beat-result",
      payload: {
        outcome: "authored",
        eventId: latestJob.eventId,
        tick: latestJob.tick,
        sourceFingerprint: latestJob.sourceFingerprint,
        text: validStoryBeatText,
        outputTokens: 12,
        ...modelBinding,
      },
    } satisfies NarratorTransportResponseEnvelope);
    await expect(latest).resolves.toEqual({
      outcome: "authored",
      source: "model",
      text: validStoryBeatText,
    });
    expect(worker.terminated).toBe(false);
  });

  it("prevents a stale manual preflight from dispatching or consuming the latest source quota", async () => {
    const firstInputTokens = deferredNumber();
    let storyBeatPreflights = 0;
    const { client, workers } = harness(24, true, () => {
      storyBeatPreflights += 1;
      return storyBeatPreflights === 1 ? firstInputTokens.promise : 80;
    });
    client.enable("campaign:narrator-client", model, capability);
    const firstJob = storyBeatJobFixture();
    const first = client.authorStoryBeat(firstJob);
    const latestJob = {
      ...firstJob,
      eventId: "chronicle:story-beat:10",
      tick: 10,
      sourceFingerprint: "1234567890abcdef",
    };
    const latest = client.authorStoryBeat(latestJob);
    firstInputTokens.resolve(80);

    await expect(first).resolves.toEqual({
      outcome: "fallback",
      source: "deterministic",
      text: firstJob.deterministicFallback,
      reason: "stale",
    });
    await expect(latest).resolves.toEqual({
      outcome: "authored",
      source: "model",
      text: validStoryBeatText,
    });
    expect(
      workers[0]?.messages
        .filter((request) => request.kind === "author-story-beat")
        .map((request) => request.payload.job.sourceFingerprint),
    ).toEqual([latestJob.sourceFingerprint]);

    await expect(client.authorStoryBeat(latestJob)).resolves.toMatchObject({
      outcome: "authored",
    });
    await expect(client.authorStoryBeat(latestJob)).resolves.toMatchObject({
      outcome: "fallback",
      reason: "cooldown",
    });
    expect(workers[0]?.messages.filter((request) => request.kind === "author-story-beat"))
      .toHaveLength(2);
  });

  it("stales active manual work when ambient presentation advances to a new scene", async () => {
    const { client, workers } = harness();
    client.enable("campaign:narrator-client", model, capability);
    const storyJob = storyBeatJobFixture();
    const storyBeat = client.authorStoryBeat(storyJob);
    await Promise.resolve();
    const worker = workers[0];
    const load = worker?.messages[0];
    if (worker === undefined || load?.kind !== "load") {
      throw new Error("Narrator client did not post load request");
    }
    worker.emit({
      ...responseBase(load),
      kind: "status",
      payload: { state: "ready", ...modelBinding, reason: "model ready" },
    } satisfies NarratorTransportResponseEnvelope);
    await Promise.resolve();
    await Promise.resolve();
    const author = worker.messages[1];
    if (author?.kind !== "author-story-beat") {
      throw new Error("Narrator client did not post manual request");
    }

    const ambientBase = jobFixture();
    const changedScene = {
      ...ambientBase,
      sourceFingerprint: "abcdefabcdefabcd",
    };
    const ambient = client.narrate(changedScene);
    expect(ambient.enhancement).not.toBeNull();
    worker.emit({
      ...responseBase(author),
      kind: "story-beat-result",
      payload: {
        outcome: "authored",
        eventId: storyJob.eventId,
        tick: storyJob.tick,
        sourceFingerprint: storyJob.sourceFingerprint,
        text: validStoryBeatText,
        outputTokens: 12,
        ...modelBinding,
      },
    } satisfies NarratorTransportResponseEnvelope);
    await expect(storyBeat).resolves.toEqual({
      outcome: "fallback",
      source: "deterministic",
      text: storyJob.deterministicFallback,
      reason: "stale",
    });
    await Promise.resolve();
    await Promise.resolve();
    const realize = worker.messages[2];
    if (realize?.kind !== "realize") {
      throw new Error("Changed-scene ambient narration was not promoted");
    }
    expect(realize.payload.job.sourceFingerprint).toBe(changedScene.sourceFingerprint);
    worker.emit({
      ...responseBase(realize),
      kind: "result",
      payload: {
        eventId: changedScene.eventId,
        tick: changedScene.tick,
        sourceFingerprint: changedScene.sourceFingerprint,
        text: allowedNarratorLines(changedScene.prompt)[0]!,
        outputTokens: 8,
        ...modelBinding,
      },
    } satisfies NarratorTransportResponseEnvelope);
    await expect(ambient.enhancement).resolves.toEqual({
      source: "model",
      text: allowedNarratorLines(changedScene.prompt)[0],
    });
    expect(worker.terminated).toBe(false);
  });

  it("cancels a queued manual story beat at a real source boundary without retiring the worker", async () => {
    const { client, workers } = harness();
    client.enable("campaign:narrator-client", model, capability);
    const ambientJob = jobFixture();
    const ambient = client.narrate(ambientJob);
    await Promise.resolve();
    const worker = workers[0];
    const load = worker?.messages[0];
    if (worker === undefined || load?.kind !== "load") {
      throw new Error("Narrator client did not post load request");
    }
    worker.emit({
      ...responseBase(load),
      kind: "status",
      payload: { state: "ready", ...modelBinding, reason: "model ready" },
    } satisfies NarratorTransportResponseEnvelope);
    await Promise.resolve();
    await Promise.resolve();
    const realize = worker.messages[1];
    if (realize?.kind !== "realize") {
      throw new Error("Narrator client did not post ambient request");
    }

    const storyJob = storyBeatJobFixture();
    const storyBeat = client.authorStoryBeat(storyJob);
    client.setCurrentSource(null);
    await expect(storyBeat).resolves.toEqual({
      outcome: "fallback",
      source: "deterministic",
      text: storyJob.deterministicFallback,
      reason: "stale",
    });
    worker.emit({
      ...responseBase(realize),
      kind: "result",
      payload: {
        eventId: ambientJob.eventId,
        tick: ambientJob.tick,
        sourceFingerprint: ambientJob.sourceFingerprint,
        text: allowedNarratorLines(ambientJob.prompt)[0]!,
        outputTokens: 8,
        ...modelBinding,
      },
    } satisfies NarratorTransportResponseEnvelope);
    await expect(ambient.enhancement).resolves.toBeNull();
    expect(worker.terminated).toBe(false);
  });

  it("preempts an ambient token preflight so a manual story beat can start immediately", async () => {
    const ambientTokens = deferredNumber();
    const { client, workers, factoryCalls } = harness(() => ambientTokens.promise, true);
    client.enable("campaign:narrator-client", model, capability);
    const ambientJob = jobFixture();
    const ambient = client.narrate(ambientJob);
    const storyJob = {
      ...storyBeatJobFixture(),
      sourceFingerprint: ambientJob.sourceFingerprint,
    };
    const storyBeat = client.authorStoryBeat(storyJob);
    ambientTokens.resolve(24);

    await expect(storyBeat).resolves.toEqual({
      outcome: "authored",
      source: "model",
      text: validStoryBeatText,
    });
    expect(factoryCalls()).toBe(1);
    expect(workers[0]?.messages.map((request) => request.kind))
      .toEqual(["load", "author-story-beat"]);

    await expect(ambient.enhancement).resolves.toBeNull();
    expect(workers[0]?.terminated).toBe(false);
  });

  it("bounds ambient and manual story-beat dispatches with independent rolling quotas", async () => {
    const ambientFirst = harness(24, true);
    ambientFirst.client.enable("campaign:narrator-client", model, capability);
    const ambientJob = jobFixture();
    await ambientFirst.client.narrate(ambientJob).enhancement;
    await ambientFirst.client.narrate(ambientJob).enhancement;
    await expect(ambientFirst.client.narrate(ambientJob).enhancement).resolves.toBeNull();
    await expect(ambientFirst.client.authorStoryBeat(storyBeatJobFixture())).resolves.toMatchObject({
      outcome: "authored",
      source: "model",
    });

    const manualFirst = harness(24, true);
    manualFirst.client.enable("campaign:narrator-client", model, capability);
    const storyJob = storyBeatJobFixture();
    await expect(manualFirst.client.authorStoryBeat(storyJob)).resolves.toMatchObject({
      outcome: "authored",
    });
    await expect(manualFirst.client.authorStoryBeat(storyJob)).resolves.toMatchObject({
      outcome: "authored",
    });
    await expect(manualFirst.client.authorStoryBeat(storyJob)).resolves.toMatchObject({
      outcome: "fallback",
      reason: "cooldown",
    });
    await expect(manualFirst.client.narrate(ambientJob).enhancement).resolves.toMatchObject({
      source: "model",
    });
    expect(
      manualFirst.workers[0]?.messages.filter((request) => request.kind === "author-story-beat"),
    ).toHaveLength(2);
    expect(
      manualFirst.workers[0]?.messages.filter((request) => request.kind === "realize"),
    ).toHaveLength(1);
  });

  it("surfaces worker-rejected prose as a typed deterministic fallback without failing the warm model", async () => {
    const { client, workers } = harness();
    client.enable("campaign:narrator-client", model, capability);
    const job = storyBeatJobFixture();
    const pending = client.authorStoryBeat(job);
    await Promise.resolve();
    const worker = workers[0];
    const load = worker?.messages[0];
    if (worker === undefined || load?.kind !== "load") {
      throw new Error("Story-beat client did not post load request");
    }
    worker.emit({
      ...responseBase(load),
      kind: "status",
      payload: { state: "ready", ...modelBinding, reason: "model ready" },
    } satisfies NarratorResponseEnvelope);
    await Promise.resolve();
    await Promise.resolve();
    const request = worker.messages[1];
    if (request?.kind !== "author-story-beat") {
      throw new Error("Story-beat client did not post author request");
    }
    worker.emit({
      ...responseBase(request),
      kind: "story-beat-result",
      payload: {
        outcome: "fallback",
        eventId: job.eventId,
        tick: job.tick,
        sourceFingerprint: job.sourceFingerprint,
        reason: "invalid-output",
        ...modelBinding,
      },
    } satisfies NarratorTransportResponseEnvelope);
    const result = await pending;
    expect(result).toEqual({
      outcome: "fallback",
      source: "deterministic",
      text: job.deterministicFallback,
      reason: "invalid-output",
    });
    expect(JSON.stringify(result)).not.toContain("dragon");
    expect(client.state).toBe("ready");
    expect(worker.terminated).toBe(false);
  });

  it("revalidates authored story prose on the host and never returns a hostile worker string", async () => {
    const { client, workers } = harness();
    client.enable("campaign:narrator-client", model, capability);
    const job = storyBeatJobFixture();
    const pending = client.authorStoryBeat(job);
    await Promise.resolve();
    const worker = workers[0];
    const load = worker?.messages[0];
    if (worker === undefined || load?.kind !== "load") {
      throw new Error("Story-beat client did not post load request");
    }
    worker.emit({
      ...responseBase(load),
      kind: "status",
      payload: { state: "ready", ...modelBinding, reason: "model ready" },
    } satisfies NarratorResponseEnvelope);
    await Promise.resolve();
    await Promise.resolve();
    const request = worker.messages[1];
    if (request?.kind !== "author-story-beat") {
      throw new Error("Story-beat client did not post author request");
    }
    const hostileText = "A dragon grants 500 gold.";
    worker.emit({
      ...responseBase(request),
      kind: "story-beat-result",
      payload: {
        outcome: "authored",
        eventId: job.eventId,
        tick: job.tick,
        sourceFingerprint: job.sourceFingerprint,
        text: hostileText,
        outputTokens: 8,
        ...modelBinding,
      },
    } satisfies NarratorTransportResponseEnvelope);
    const result = await pending;
    expect(result).toEqual({
      outcome: "fallback",
      source: "deterministic",
      text: job.deterministicFallback,
      reason: "transport-failure",
    });
    expect(JSON.stringify(result)).not.toContain(hostileText);
    expect(client.state).toBe("failed");
    expect(worker.terminated).toBe(true);
  });

  it("returns typed preflight, suppression, unavailable, and active-slot fallbacks", async () => {
    const job = storyBeatJobFixture();
    const off = harness();
    await expect(off.client.authorStoryBeat(job)).resolves.toMatchObject({
      outcome: "fallback",
      reason: "unavailable",
    });

    const overBudget = harness(24, false, 321);
    overBudget.client.enable("campaign:narrator-client", model, capability);
    await expect(overBudget.client.authorStoryBeat(job)).resolves.toMatchObject({
      outcome: "fallback",
      reason: "input-budget",
    });
    expect(overBudget.factoryCalls()).toBe(0);

    const suppressed = harness();
    suppressed.client.enable("campaign:narrator-client", model, capability);
    suppressed.client.setSuppressed("hidden");
    await expect(suppressed.client.authorStoryBeat(job)).resolves.toMatchObject({
      outcome: "fallback",
      reason: "suppressed",
    });
    expect(suppressed.factoryCalls()).toBe(0);

    const active = harness();
    active.client.enable("campaign:narrator-client", model, capability);
    const first = active.client.authorStoryBeat(job);
    await Promise.resolve();
    await expect(active.client.authorStoryBeat(job)).resolves.toMatchObject({
      outcome: "fallback",
      reason: "backpressure",
    });
    active.client.disable();
    await expect(first).resolves.toMatchObject({
      outcome: "fallback",
      reason: "transport-failure",
    });
  });

  it("drops a story-beat response after a source cancellation boundary without retiring the worker", async () => {
    const { client, workers } = harness();
    client.enable("campaign:narrator-client", model, capability);
    const job = storyBeatJobFixture();
    const pending = client.authorStoryBeat(job);
    await Promise.resolve();
    const worker = workers[0];
    const load = worker?.messages[0];
    if (worker === undefined || load?.kind !== "load") {
      throw new Error("Story-beat client did not post load request");
    }
    worker.emit({
      ...responseBase(load),
      kind: "status",
      payload: { state: "ready", ...modelBinding, reason: "model ready" },
    } satisfies NarratorResponseEnvelope);
    await Promise.resolve();
    await Promise.resolve();
    const request = worker.messages[1];
    if (request?.kind !== "author-story-beat") {
      throw new Error("Story-beat client did not post author request");
    }
    client.setCurrentSource(null);
    worker.emit({
      ...responseBase(request),
      kind: "story-beat-result",
      payload: {
        outcome: "authored",
        eventId: job.eventId,
        tick: job.tick,
        sourceFingerprint: job.sourceFingerprint,
        text: validStoryBeatText,
        outputTokens: 12,
        ...modelBinding,
      },
    } satisfies NarratorTransportResponseEnvelope);
    await expect(pending).resolves.toEqual({
      outcome: "fallback",
      source: "deterministic",
      text: job.deterministicFallback,
      reason: "stale",
    });
    expect(client.state).toBe("ready");
    expect(worker.terminated).toBe(false);
  });

  it("applies the short realization timeout to story authoring and returns only a typed fallback", async () => {
    const { client, workers, clock } = harness();
    client.enable("campaign:narrator-client", model, capability);
    const job = storyBeatJobFixture();
    const pending = client.authorStoryBeat(job);
    await Promise.resolve();
    const worker = workers[0];
    const load = worker?.messages[0];
    if (worker === undefined || load?.kind !== "load") {
      throw new Error("Story-beat client did not post load request");
    }
    worker.emit({
      ...responseBase(load),
      kind: "status",
      payload: { state: "ready", ...modelBinding, reason: "model ready" },
    } satisfies NarratorResponseEnvelope);
    await Promise.resolve();
    await Promise.resolve();
    expect(worker.messages[1]?.kind).toBe("author-story-beat");
    clock.advance(narratorRealizationTimeoutMs);
    await expect(pending).resolves.toEqual({
      outcome: "fallback",
      source: "deterministic",
      text: job.deterministicFallback,
      reason: "transport-failure",
    });
    expect(client.state).toBe("failed");
    expect(worker.terminated).toBe(true);
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
      payload: { state: "ready", ...modelBinding, reason: "model ready" },
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
        ...modelBinding,
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

  it("keeps one worker warm, deduplicates its active job, and realizes the latest queued scene", async () => {
    const { client, workers } = harness();
    client.enable("campaign:narrator-client", model, capability);
    const job = jobFixture();
    const first = client.narrate(job);
    await Promise.resolve();
    expect(workers).toHaveLength(1);
    expect(client.narrate(job).enhancement).toBeNull();

    const intermediate = {
      ...job,
      eventId: `${job.eventId}:intermediate`,
      tick: job.tick + 1,
      sourceFingerprint: "fedcba9876543210",
    };
    const skipped = client.narrate(intermediate);
    expect(skipped.enhancement).not.toBeNull();

    const latest = {
      ...job,
      eventId: `${job.eventId}:latest`,
      tick: job.tick + 2,
      sourceFingerprint: "0123456789abcdef",
    };
    const staleSameFingerprint = client.narrate(latest);
    expect(staleSameFingerprint.enhancement).not.toBeNull();
    await expect(skipped.enhancement).resolves.toBeNull();
    client.setCurrentSource(null);
    await expect(staleSameFingerprint.enhancement).resolves.toBeNull();
    const current = client.narrate(latest);
    expect(current.enhancement).not.toBeNull();
    expect(workers[0]?.terminated).toBe(false);

    const load = workers[0]?.messages[0];
    if (load?.kind !== "load") throw new Error("Narrator client did not post load request");
    workers[0]?.emit({
      ...responseBase(load),
      kind: "status",
      payload: { state: "ready", ...modelBinding, reason: "model ready" },
    } satisfies NarratorResponseEnvelope);
    await expect(first.enhancement).resolves.toBeNull();
    await Promise.resolve();
    await Promise.resolve();

    const realize = workers[0]?.messages[1];
    if (realize?.kind !== "realize") throw new Error("Narrator client did not post latest realize request");
    expect(realize.payload.job.sourceFingerprint).toBe(latest.sourceFingerprint);
    workers[0]?.emit({
      ...responseBase(realize),
      kind: "result",
      payload: {
        eventId: latest.eventId,
        tick: latest.tick,
        sourceFingerprint: latest.sourceFingerprint,
        text: allowedNarratorLines(latest.prompt)[0]!,
        outputTokens: 8,
        ...modelBinding,
      },
    } satisfies NarratorResponseEnvelope);

    await expect(current.enhancement).resolves.toEqual({
      source: "model",
      text: allowedNarratorLines(latest.prompt)[0],
    });
    expect(workers).toHaveLength(1);
    expect(workers[0]?.messages.map((request) => request.kind)).toEqual(["load", "realize"]);
    expect(workers[0]?.terminated).toBe(false);
    expect(client.state).toBe("ready");
  });

  it("re-queues an active fingerprint when it returns under a newer source epoch", async () => {
    const { client, workers } = harness();
    client.enable("campaign:narrator-client", model, capability);
    const job = jobFixture();
    const stale = client.narrate(job);
    await Promise.resolve();
    const worker = workers[0];
    const load = worker?.messages[0];
    if (worker === undefined || load?.kind !== "load") {
      throw new Error("Narrator client did not post load request");
    }

    client.setCurrentSource(null);
    const current = client.narrate(job);
    expect(current.enhancement).not.toBeNull();
    expect(worker.terminated).toBe(false);
    worker.emit({
      ...responseBase(load),
      kind: "status",
      payload: { state: "ready", ...modelBinding, reason: "model ready" },
    } satisfies NarratorResponseEnvelope);
    await expect(stale.enhancement).resolves.toBeNull();
    await Promise.resolve();
    await Promise.resolve();

    const realize = worker.messages[1];
    if (realize?.kind !== "realize") throw new Error("Narrator client did not post resumed realize request");
    worker.emit({
      ...responseBase(realize),
      kind: "result",
      payload: {
        eventId: job.eventId,
        tick: job.tick,
        sourceFingerprint: job.sourceFingerprint,
        text: allowedNarratorLines(job.prompt)[0]!,
        outputTokens: 8,
        ...modelBinding,
      },
    } satisfies NarratorResponseEnvelope);

    await expect(current.enhancement).resolves.toEqual({
      source: "model",
      text: allowedNarratorLines(job.prompt)[0],
    });
    expect(worker.messages.map((request) => request.kind)).toEqual(["load", "realize"]);
    expect(worker.terminated).toBe(false);
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
      payload: { state: "ready", ...modelBinding, reason: "model ready", extra: true },
    });
    await expect(offer.enhancement).resolves.toBeNull();
    expect(client.state).toBe("failed");
    expect(workers[0]?.terminated).toBe(true);
    expect(client.resetAfterFailure()).toBe(true);
    expect(client.state).toBe("available");
  });

  it("fails closed on every valid model-binding substitution in ready and result responses", async () => {
    const substitutions = [
      { ...modelBinding, modelId: "replacement-model" },
      { ...modelBinding, revision: "c".repeat(40) },
      { ...modelBinding, artifactManifestHash: "d".repeat(16) },
    ] as const;
    for (const substitution of substitutions) {
      const readyHarness = harness();
      readyHarness.client.enable("campaign:narrator-client", model, capability);
      const readyOffer = readyHarness.client.narrate(jobFixture());
      await Promise.resolve();
      const readyWorker = readyHarness.workers[0];
      const load = readyWorker?.messages[0];
      if (readyWorker === undefined || load === undefined) throw new Error("Narrator client did not post load request");
      readyWorker.emit({
        ...responseBase(load),
        kind: "status",
        payload: { state: "ready", ...substitution, reason: "model ready" },
      } satisfies NarratorResponseEnvelope);
      await expect(readyOffer.enhancement).resolves.toBeNull();
      expect(readyHarness.client.state).toBe("failed");
      expect(readyWorker.terminated).toBe(true);

      const resultHarness = harness();
      resultHarness.client.enable("campaign:narrator-client", model, capability);
      const job = jobFixture();
      const resultOffer = resultHarness.client.narrate(job);
      await Promise.resolve();
      const resultWorker = resultHarness.workers[0];
      const resultLoad = resultWorker?.messages[0];
      if (resultWorker === undefined || resultLoad === undefined) throw new Error("Narrator client did not post load request");
      resultWorker.emit({
        ...responseBase(resultLoad),
        kind: "status",
        payload: { state: "ready", ...modelBinding, reason: "model ready" },
      } satisfies NarratorResponseEnvelope);
      await Promise.resolve();
      await Promise.resolve();
      const realize = resultWorker.messages[1];
      if (realize?.kind !== "realize") throw new Error("Narrator client did not post realize request");
      resultWorker.emit({
        ...responseBase(realize),
        kind: "result",
        payload: {
          eventId: job.eventId,
          tick: job.tick,
          sourceFingerprint: job.sourceFingerprint,
          text: allowedNarratorLines(job.prompt)[0]!,
          outputTokens: 8,
          ...substitution,
        },
      } satisfies NarratorResponseEnvelope);
      await expect(resultOffer.enhancement).resolves.toBeNull();
      expect(resultHarness.client.state).toBe("failed");
      expect(resultWorker.terminated).toBe(true);
    }
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
      payload: { state: "ready", ...modelBinding, reason: "model ready" },
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
        ...modelBinding,
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
            payload: { state: "ready", ...modelBinding, reason: "model ready" },
          }
        : {
            ...responseBase(request),
            kind: "status",
            payload: { state: "ready", ...modelBinding, reason: "x".repeat(2_100) },
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
      payload: { state: "ready", ...modelBinding, reason: "model ready" },
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
        ...modelBinding,
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

  it("gives cold model loading three minutes, then fails closed without retry", async () => {
    const { client, workers, clock, factoryCalls } = harness();
    client.enable("campaign:narrator-client", model, capability);
    const job = jobFixture();
    const offer = client.narrate(job);
    await Promise.resolve();
    expect(factoryCalls()).toBe(1);
    clock.advance(narratorRealizationTimeoutMs);
    await Promise.resolve();
    expect(client.state).toBe("loading");
    clock.advance(60_000 - narratorRealizationTimeoutMs);
    await Promise.resolve();
    expect(client.state).toBe("loading");
    expect(workers[0]?.terminated).toBe(false);
    clock.advance(narratorLoadTimeoutMs - 60_000);
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
      payload: { state: "ready", ...modelBinding, reason: "model ready" },
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

  it("ignores late transport failures from a terminated worker after replacement", async () => {
    for (const failure of ["crash", "messageError"] as const) {
      const { client, workers } = harness();
      client.enable("campaign:narrator-client", model, capability);
      const retiredOffer = client.narrate(jobFixture());
      await Promise.resolve();
      const retiredWorker = workers[0];
      if (retiredWorker === undefined) throw new Error("Narrator client did not create the retired worker");

      client.disable();
      await expect(retiredOffer.enhancement, failure).resolves.toBeNull();
      expect(retiredWorker.terminated, failure).toBe(true);

      client.enable("campaign:narrator-client", model, capability);
      const replacementOffer = client.narrate(jobFixture());
      await Promise.resolve();
      const replacementWorker = workers[1];
      if (replacementWorker === undefined) throw new Error("Narrator client did not create the replacement worker");
      expect(client.state, failure).toBe("loading");

      retiredWorker[failure]();
      expect(client.state, failure).toBe("loading");
      expect(replacementWorker.terminated, failure).toBe(false);

      client.disable();
      await expect(replacementOffer.enhancement, failure).resolves.toBeNull();
    }
  });

  it("ignores stale rejected load continuations after reconfiguration", async () => {
    for (const variant of ["non-ready", "wrong-binding"] as const) {
      const { client, workers } = harness();
      client.enable("campaign:narrator-client", model, capability);
      const retiredOffer = client.narrate(jobFixture());
      await Promise.resolve();
      const retiredWorker = workers[0];
      const load = retiredWorker?.messages[0];
      if (retiredWorker === undefined || load?.kind !== "load") {
        throw new Error("Narrator client did not post the retired load request");
      }
      retiredWorker.emit({
        ...responseBase(load),
        kind: "status",
        payload: variant === "non-ready"
          ? { state: "available", ...modelBinding, reason: "not ready" }
          : {
              state: "ready",
              ...modelBinding,
              modelId: "substituted-model",
              reason: "wrong binding",
            },
      } satisfies NarratorResponseEnvelope);

      client.enable("campaign:replacement", model, capability);
      const replacementJob = {
        ...jobFixture(),
        campaignId: "campaign:replacement",
        eventId: "campaign:replacement:event:1",
      };
      const replacementOffer = client.narrate(replacementJob);
      await expect(retiredOffer.enhancement, variant).resolves.toBeNull();
      await Promise.resolve();
      await Promise.resolve();

      const replacementWorker = workers[1];
      expect(replacementWorker, variant).toBeDefined();
      expect(client.state, variant).toBe("loading");
      expect(retiredWorker.terminated, variant).toBe(true);
      expect(replacementWorker?.terminated, variant).toBe(false);
      expect(replacementWorker?.messages.map((request) => request.kind), variant).toEqual(["load"]);

      client.disable();
      await expect(replacementOffer.enhancement, variant).resolves.toBeNull();
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
