import { describe, expect, it } from "vitest";
import { advanceWorld, createWorld } from "../core/simulation";
import {
  NarratorClient,
  type NarratorClock,
  type NarratorWorkerPort,
} from "./narrator-client";
import {
  NarratorWorkerRuntime,
  type NarratorRealizer,
  type NarratorTokenMeter,
} from "./narrator-runtime";
import type { NarratorExperimentalModelPolicyV1 } from "./experimental-policy";
import type {
  NarratorCapability,
  NarratorModelBindingV1,
  NarratorPromptV1,
} from "./protocol";
import {
  type StoryBeatAuthoringFacts,
} from "./story-beat-authoring";
import {
  selectFactualStoryBeatFormEligibilityV2,
} from "./story-beat-v2-form-selection";
import {
  isFactualStoryBeatPublicFactsV2,
  projectFactualStoryBeatTransitionV2,
  validateFactualStoryBeatResultV2,
  type FactualStoryBeatJobV2,
} from "./story-beat-v2";
import type {
  NarratorTransportRequestEnvelope,
  NarratorTransportResponseEnvelope,
} from "./story-beat-worker-protocol";
import {
  createStoryBeatController,
  type StoryBeatUiSnapshot,
} from "../ui/story-beat-controller";

const modelBinding: NarratorModelBindingV1 = Object.freeze({
  modelId: "test/factual-story-model",
  revision: "a".repeat(40),
  artifactManifestHash: "b".repeat(16),
});

const experimentalPolicy: NarratorExperimentalModelPolicyV1 = Object.freeze({
  schemaVersion: 1,
  kind: "experimental-unrated",
  ...modelBinding,
  license: "Apache-2.0",
  storedWeightBytes: 97_098_984,
  disclosedDownloadBytes: 120_713_423,
  sourceEvidenceDisposition: "blocked",
  humanQualityEvaluated: false,
  modelAdmitted: false,
  formalDisplayAuthorized: false,
  productionAuthority: false,
});

const capability: NarratorCapability = Object.freeze({
  execution: "wasm",
  budget: "standard",
  storedWeightBudgetBytes: 128 * 1024 * 1024,
  incrementalMemoryBudgetBytes: 512 * 1024 * 1024,
  reason: "local-wasm-worker",
});

function committedFactualJob(): FactualStoryBeatJobV2 {
  let before = createWorld(
    "factual-story-beat-vertical-slice",
    "campaign:factual-story-beat-vertical-slice",
  );
  for (let index = 0; index < 64; index += 1) {
    const after = advanceWorld(before);
    const job = projectFactualStoryBeatTransitionV2(before, after);
    if (job !== null) return job;
    before = after;
  }
  throw new Error("Fixture did not reach a committed factual story beat");
}

class TestClock implements NarratorClock {
  private ordinal = 0;
  now(): number { return 0; }
  setTimeout(): number { return ++this.ordinal; }
  clearTimeout(): void {}
}

class FactualRealizer implements NarratorRealizer, NarratorTokenMeter {
  readonly modelBinding = modelBinding;
  authoredFacts: StoryBeatAuthoringFacts | null = null;

  async load(): Promise<void> {}
  countInput(): number { return 1; }
  countOutput(): number { return 1; }
  countStoryBeatInput(): number { return 200; }
  realize(_prompt: NarratorPromptV1): Promise<string> {
    return Promise.reject(new Error("Ambient realization is outside this slice"));
  }
  authorStoryBeat(facts: StoryBeatAuthoringFacts) {
    if (!isFactualStoryBeatPublicFactsV2(facts)) {
      return Promise.reject(new Error("Expected factual V2 facts"));
    }
    this.authoredFacts = facts;
    const selected = selectFactualStoryBeatFormEligibilityV2(facts, 0).forms[0];
    if (selected === undefined) {
      return Promise.reject(new Error("Expected one eligible factual form"));
    }
    return Promise.resolve(Object.freeze({
      text: selected.text,
      outputTokens: 12,
    }));
  }
  dispose(): void {}
}

class RuntimeWorker implements NarratorWorkerPort {
  readonly requests: NarratorTransportRequestEnvelope[] = [];
  readonly responses: NarratorTransportResponseEnvelope[] = [];
  private readonly messageListeners:
    ((event: MessageEvent<unknown>) => void)[] = [];
  private readonly errorListeners: (() => void)[] = [];

  constructor(private readonly runtime: NarratorWorkerRuntime) {}

  postMessage(value: unknown): void {
    this.requests.push(structuredClone(value) as NarratorTransportRequestEnvelope);
    void this.runtime.process(structuredClone(value)).then((response) => {
      const cloned = structuredClone(response) as NarratorTransportResponseEnvelope;
      this.responses.push(cloned);
      queueMicrotask(() => {
        for (const listener of this.messageListeners) {
          listener({ data: cloned } as MessageEvent<unknown>);
        }
      });
    }, () => {
      queueMicrotask(() => {
        for (const listener of this.errorListeners) listener();
      });
    });
  }

  terminate(): void {}

  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  addEventListener(
    type: "error" | "messageerror",
    listener: () => void,
  ): void;
  addEventListener(
    type: "message" | "error" | "messageerror",
    listener: ((event: MessageEvent<unknown>) => void) | (() => void),
  ): void {
    if (type === "message") {
      this.messageListeners.push(listener as (event: MessageEvent<unknown>) => void);
    } else {
      this.errorListeners.push(listener as () => void);
    }
  }
}

describe("factual story-beat production vertical slice", () => {
  it("turns one committed mechanic into a validated ephemeral Chronicle line", async () => {
    const job = committedFactualJob();
    const realizer = new FactualRealizer();
    const directCandidate = await realizer.authorStoryBeat(job.facts);
    expect(validateFactualStoryBeatResultV2(directCandidate.text, job.facts))
      .toBe(directCandidate.text);
    const runtime = new NarratorWorkerRuntime(realizer, realizer);
    const worker = new RuntimeWorker(runtime);
    const client = new NarratorClient({
      workerFactory: () => worker,
      clock: new TestClock(),
      tokenMeter: {
        countInput: () => 1,
        countStoryBeatInput: () => 200,
      },
      epochFactory: () => "worker:factual-story-beat",
    });
    expect(client.enableExperimental(job.campaignId, experimentalPolicy, capability))
      .toBe(true);

    let resolveSettled!: (snapshot: StoryBeatUiSnapshot) => void;
    const settled = new Promise<StoryBeatUiSnapshot>((resolve) => {
      resolveSettled = resolve;
    });
    const controller = createStoryBeatController({
      author: client,
      onChange: (snapshot) => {
        if (snapshot.phase === "authored" || snapshot.phase === "fallback") {
          resolveSettled(snapshot);
        }
      },
    });
    controller.sync({ enabled: true, eligible: true, job });

    expect(controller.write()).toBe(true);
    expect(controller.snapshot).toMatchObject({
      phase: "writing",
      busy: true,
      line: {
        source: "deterministic",
        text: job.deterministicFallback,
      },
    });

    const final = await settled;
    expect(worker.responses.filter((response) => response.kind === "error")).toEqual([]);
    expect(final.fallbackReason).toBeNull();
    expect(final.phase).toBe("authored");
    expect(final.line?.source).toBe("model");
    expect(validateFactualStoryBeatResultV2(final.line?.text, job.facts))
      .toBe(final.line?.text);
    expect(realizer.authoredFacts).toEqual(job.facts);
    expect(worker.requests.map((request) => request.kind))
      .toEqual(["load", "author-story-beat"]);
    expect(worker.requests[1]?.payload).toEqual({ job });

    controller.dispose();
    client.dispose();
  });
});
