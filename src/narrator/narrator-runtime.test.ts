import { describe, expect, it } from "vitest";
import { advanceWorld, createWorld } from "../core/simulation";
import { allowedNarratorLines, deterministicNarratorFallback } from "./output-policy";
import {
  narratorMaximumRequestBytes,
  type NarratorModelBindingV1,
  type NarratorPromptV1,
  type NarratorRequestEnvelope,
  type NarratorResponseEnvelope,
} from "./protocol";
import {
  NarratorDeviceLostError,
  NarratorWorkerRuntime,
  type NarratorRealizer,
  type NarratorTokenMeter,
} from "./narrator-runtime";
import { projectSceneNarratorJob } from "./scene-packet";

const defaultModelBinding: NarratorModelBindingV1 = Object.freeze({
  modelId: "test-ambient-model",
  revision: "a".repeat(40),
  artifactManifestHash: "b".repeat(16),
});

class FakeRealizer implements NarratorRealizer {
  constructor(readonly modelBinding: NarratorModelBindingV1 = defaultModelBinding) {}

  loadCalls = 0;
  realizeCalls = 0;
  disposeCalls = 0;
  prompts: NarratorPromptV1[] = [];
  output = "The road holds a steady moment.";
  waitForAbort = false;
  waitForLoadAbort = false;
  loadFailure: Error | null = null;
  realizeFailure: Error | null = null;

  async load(signal: AbortSignal): Promise<void> {
    this.loadCalls += 1;
    if (this.loadFailure !== null) throw this.loadFailure;
    if (this.waitForLoadAbort) {
      return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    }
  }

  async realize(prompt: NarratorPromptV1, options: { signal: AbortSignal }): Promise<string> {
    this.realizeCalls += 1;
    this.prompts.push(prompt);
    if (this.realizeFailure !== null) throw this.realizeFailure;
    if (this.waitForAbort) {
      return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    }
    return this.output;
  }

  dispose(): void {
    this.disposeCalls += 1;
  }
}

class FakeTokenMeter implements NarratorTokenMeter {
  input = 24;
  output = 8;
  inputGate: Promise<number> | null = null;
  outputGate: Promise<number> | null = null;
  countInput(): Promise<number> | number { return this.inputGate ?? this.input; }
  countOutput(): Promise<number> | number { return this.outputGate ?? this.output; }
}

function deferredNumber(): { readonly promise: Promise<number>; readonly resolve: (value: number) => void } {
  let resolve!: (value: number) => void;
  const promise = new Promise<number>((next) => { resolve = next; });
  return { promise, resolve };
}

function jobFixture() {
  let world = createWorld("narrator-runtime", "campaign:narrator-runtime");
  for (let index = 0; index < 64; index += 1) {
    world = advanceWorld(world);
    const source = world.chronicle.at(-1);
    const job = projectSceneNarratorJob(world.campaignId, world.scene, source, world.chronicle.at(-1)?.id);
    if (job !== null && job.prompt.facts.energy === "steady" && job.prompt.move !== "register-pressure") return job;
  }
  throw new Error("Narrator runtime fixture needs a steady observer scene");
}

function shadeJobFixture() {
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

function envelope(
  kind: NarratorRequestEnvelope["kind"],
  payload: NarratorRequestEnvelope["payload"],
  requestId: string,
): NarratorRequestEnvelope {
  return {
    protocolVersion: 1,
    campaignId: "campaign:narrator-runtime",
    workerEpoch: "epoch:1",
    requestId,
    kind,
    payload,
  } as NarratorRequestEnvelope;
}

function code(response: NarratorResponseEnvelope): string | undefined {
  return response.kind === "error" ? response.payload.code : undefined;
}

async function readyRuntime(realizer = new FakeRealizer(), tokens = new FakeTokenMeter()) {
  const runtime = new NarratorWorkerRuntime(realizer, tokens);
  const loaded = await runtime.process(envelope("load", realizer.modelBinding, "request:load"));
  expect(loaded).toMatchObject({
    kind: "status",
    payload: { state: "ready", ...realizer.modelBinding },
  });
  return { runtime, realizer, tokens };
}

describe("narrator worker runtime", () => {
  it("loads once and passes only the minimal prompt to the realizer", async () => {
    const { runtime, realizer } = await readyRuntime();
    const job = jobFixture();
    realizer.output = allowedNarratorLines(job.prompt)[0]!;
    const response = await runtime.process(envelope("realize", { job }, "request:realize"));
    expect(response).toMatchObject({
      kind: "result",
      payload: {
        eventId: job.eventId,
        tick: job.tick,
        sourceFingerprint: job.sourceFingerprint,
        outputTokens: 8,
        ...realizer.modelBinding,
      },
    });
    expect(realizer.loadCalls).toBe(1);
    expect(realizer.realizeCalls).toBe(1);
    expect(realizer.prompts).toEqual([job.prompt]);
    expect(JSON.stringify(realizer.prompts[0])).not.toContain(job.eventId);
  });

  it("rejects every model-binding substitution before loading the realizer", async () => {
    const substitutions: readonly NarratorModelBindingV1[] = [
      { ...defaultModelBinding, modelId: "replacement-model" },
      { ...defaultModelBinding, revision: "c".repeat(40) },
      { ...defaultModelBinding, artifactManifestHash: "d".repeat(16) },
    ];
    for (const [index, substitution] of substitutions.entries()) {
      const realizer = new FakeRealizer();
      const runtime = new NarratorWorkerRuntime(realizer, new FakeTokenMeter());
      expect(code(await runtime.process(envelope(
        "load",
        substitution,
        `request:binding-substitution:${index}`,
      )))).toBe("invalidPayload");
      expect(realizer.loadCalls).toBe(0);
      expect(runtime.state).toBe("available");
    }
  });

  it("rejects malformed realizer bindings and snapshots a valid binding before load", async () => {
    const malformed = new FakeRealizer({
      ...defaultModelBinding,
      revision: "a".repeat(39),
    });
    const malformedRuntime = new NarratorWorkerRuntime(malformed, new FakeTokenMeter());
    expect(code(await malformedRuntime.process(envelope(
      "load",
      defaultModelBinding,
      "request:malformed-realizer-binding",
    )))).toBe("invalidPayload");
    expect(malformed.loadCalls).toBe(0);

    const mutableBinding = { ...defaultModelBinding };
    const snapshotted = new FakeRealizer(mutableBinding);
    const runtime = new NarratorWorkerRuntime(snapshotted, new FakeTokenMeter());
    mutableBinding.revision = "c".repeat(40);
    const loaded = await runtime.process(envelope(
      "load",
      defaultModelBinding,
      "request:snapshotted-binding",
    ));
    expect(loaded).toMatchObject({
      kind: "status",
      payload: { state: "ready", ...defaultModelBinding },
    });
  });

  it("accepts the exact shade baseline at the worker trust boundary", async () => {
    const { runtime, realizer } = await readyRuntime();
    const job = shadeJobFixture();
    expect(allowedNarratorLines(job.prompt)).not.toContain(job.deterministicFallback);
    realizer.output = job.deterministicFallback;
    expect(await runtime.process(envelope("realize", { job }, "request:shade-baseline"))).toMatchObject({
      kind: "result",
      payload: { text: job.deterministicFallback },
    });
  });

  it("returns one cached response for an exact duplicate and rejects conflicting reuse", async () => {
    const { runtime, realizer } = await readyRuntime();
    const job = jobFixture();
    realizer.output = allowedNarratorLines(job.prompt)[0]!;
    const request = envelope("realize", { job }, "request:once");
    const first = runtime.process(request);
    const duplicate = runtime.process(request);
    expect(await duplicate).toBe(await first);
    expect(realizer.realizeCalls).toBe(1);
    expect(code(await runtime.process({
      ...request,
      payload: { job: { ...job, tick: job.tick + 1 } },
    }))).toBe("duplicateConflict");
  });

  it("rejects wrong versions, kinds, extra keys, and oversized requests", async () => {
    const runtime = new NarratorWorkerRuntime(new FakeRealizer(), new FakeTokenMeter());
    const load = envelope("load", defaultModelBinding, "request:bad");
    expect(code(await runtime.process({ ...load, protocolVersion: 99 }))).toBe("wrongProtocolVersion");
    expect(code(await runtime.process({ ...load, kind: "teleport" }))).toBe("unknownRequestKind");
    expect(code(await runtime.process({ ...load, extra: true }))).toBe("invalidEnvelope");
    expect(code(await runtime.process({
      ...load,
      requestId: "request:malformed-binding",
      payload: { ...defaultModelBinding, revision: "a".repeat(39) },
    }))).toBe("invalidPayload");
    expect(code(await runtime.process({
      ...load,
      requestId: "request:huge",
      payload: { ...defaultModelBinding, modelId: `test-${"x".repeat(narratorMaximumRequestBytes)}` },
    }))).toBe("oversizedEnvelope");
  });

  it("enforces exact input/output token budgets and the ambient grammar", async () => {
    const { runtime, realizer, tokens } = await readyRuntime();
    const job = jobFixture();
    tokens.input = 0;
    expect(code(await runtime.process(envelope("realize", { job }, "request:empty-input")))).toBe("invalidPayload");
    expect(realizer.realizeCalls).toBe(0);

    tokens.input = 321;
    expect(code(await runtime.process(envelope("realize", { job }, "request:input")))).toBe("invalidPayload");
    expect(realizer.realizeCalls).toBe(0);

    tokens.input = 24;
    tokens.output = 49;
    realizer.output = allowedNarratorLines(job.prompt)[0]!;
    expect(code(await runtime.process(envelope("realize", { job }, "request:output")))).toBe("invalidOutput");

    tokens.output = 8;
    realizer.output = "A dragon grants 500 gold.";
    expect(code(await runtime.process(envelope("realize", { job }, "request:invented")))).toBe("invalidOutput");
  });

  it("classifies inference device loss during load and generation", async () => {
    const loadRealizer = new FakeRealizer();
    loadRealizer.loadFailure = new NarratorDeviceLostError();
    const loadRuntime = new NarratorWorkerRuntime(loadRealizer, new FakeTokenMeter());
    expect(code(await loadRuntime.process(envelope("load", loadRealizer.modelBinding, "request:device-load"))))
      .toBe("deviceLost");
    expect(loadRuntime.state).toBe("failed");

    const { runtime, realizer } = await readyRuntime();
    realizer.realizeFailure = new NarratorDeviceLostError();
    expect(code(await runtime.process(envelope("realize", { job: jobFixture() }, "request:device-realize"))))
      .toBe("deviceLost");
    expect(runtime.state).toBe("failed");
  });

  it("preserves off when disposal interrupts asynchronous model loading", async () => {
    const realizer = new FakeRealizer();
    realizer.waitForLoadAbort = true;
    const runtime = new NarratorWorkerRuntime(realizer, new FakeTokenMeter());
    const loading = runtime.process(envelope("load", realizer.modelBinding, "request:loading"));
    await Promise.resolve();
    const disposed = await runtime.process(envelope("dispose", {}, "request:dispose-loading"));
    expect(disposed).toMatchObject({ kind: "status", payload: { state: "off" } });
    expect(code(await loading)).toBe("cancelled");
    expect(realizer.disposeCalls).toBe(1);
    expect(runtime.state).toBe("off");
  });

  it("reserves one active slot before async input metering and cancels before realization", async () => {
    for (const action of ["cancel", "dispose"] as const) {
      const { runtime, realizer, tokens } = await readyRuntime();
      const gate = deferredNumber();
      tokens.inputGate = gate.promise;
      const job = jobFixture();
      const active = runtime.process(envelope("realize", { job }, `request:input-${action}`));
      await Promise.resolve();
      expect(code(await runtime.process(envelope("realize", { job }, `request:blocked-${action}`))))
        .toBe("backpressure");
      const control = action === "cancel"
        ? await runtime.process(envelope("cancel", { targetRequestId: `request:input-${action}` }, `request:cancel-${action}`))
        : await runtime.process(envelope("dispose", {}, `request:dispose-${action}`));
      expect(control.kind).toBe("status");
      gate.resolve(24);
      expect(code(await active)).toBe("cancelled");
      expect(realizer.realizeCalls).toBe(0);
      expect(runtime.state).toBe(action === "dispose" ? "off" : "cooldown");
    }
  });

  it("cannot return a result after cancel or dispose during async output metering", async () => {
    for (const action of ["cancel", "dispose"] as const) {
      const { runtime, realizer, tokens } = await readyRuntime();
      const gate = deferredNumber();
      tokens.outputGate = gate.promise;
      const job = jobFixture();
      realizer.output = allowedNarratorLines(job.prompt)[0]!;
      const active = runtime.process(envelope("realize", { job }, `request:output-${action}`));
      await Promise.resolve();
      await Promise.resolve();
      expect(realizer.realizeCalls).toBe(1);
      if (action === "cancel") {
        await runtime.process(envelope("cancel", { targetRequestId: `request:output-${action}` }, `request:cancel-output-${action}`));
      } else {
        await runtime.process(envelope("dispose", {}, `request:dispose-output-${action}`));
      }
      gate.resolve(8);
      expect(code(await active)).toBe("cancelled");
      expect(runtime.state).toBe(action === "dispose" ? "off" : "cooldown");
    }
  });

  it("cancels one active generation without starting another", async () => {
    const { runtime, realizer } = await readyRuntime();
    const job = jobFixture();
    realizer.waitForAbort = true;
    const active = runtime.process(envelope("realize", { job }, "request:active"));
    await Promise.resolve();
    const blocked = await runtime.process(envelope("realize", { job }, "request:blocked"));
    expect(code(blocked)).toBe("backpressure");
    const cancelled = await runtime.process(envelope("cancel", { targetRequestId: "request:active" }, "request:cancel"));
    expect(cancelled).toMatchObject({ kind: "status", payload: { state: "cooldown" } });
    expect(code(await active)).toBe("cancelled");
    expect(realizer.realizeCalls).toBe(1);
  });

  it("rejects wrong campaign and epoch, then disposes idempotently", async () => {
    const { runtime, realizer } = await readyRuntime();
    const job = jobFixture();
    expect(code(await runtime.process({
      ...envelope("realize", { job }, "request:campaign"),
      campaignId: "campaign:other",
    }))).toBe("wrongCampaign");
    expect(code(await runtime.process({
      ...envelope("realize", { job }, "request:epoch"),
      workerEpoch: "epoch:old",
    }))).toBe("wrongWorkerEpoch");
    expect(code(await runtime.process(envelope(
      "realize",
      { job: { ...job, campaignId: "campaign:other" } },
      "request:job-campaign",
    )))).toBe("invalidPayload");
    const disposed = await runtime.process(envelope("dispose", {}, "request:dispose"));
    expect(disposed).toMatchObject({ kind: "status", payload: { state: "off" } });
    expect(await runtime.process(envelope("dispose", {}, "request:dispose"))).toBe(disposed);
    expect(realizer.disposeCalls).toBe(1);
  });
});
