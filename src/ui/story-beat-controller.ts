import {
  isStoryBeatJobV1,
  validateStoryBeatResultV1,
  type StoryBeatJobV1,
} from "../narrator/story-beat";
import type {
  StoryBeatClientFallbackReasonV1,
  StoryBeatClientResultV1,
} from "../narrator/narrator-client";

export type StoryBeatUiPhase =
  | "hidden"
  | "ready"
  | "writing"
  | "authored"
  | "fallback";

export interface StoryBeatUiLine {
  readonly source: "deterministic" | "model";
  readonly text: string;
  readonly sourceFingerprint: string;
}

export interface StoryBeatUiSnapshot {
  readonly phase: StoryBeatUiPhase;
  readonly visible: boolean;
  readonly busy: boolean;
  readonly line: StoryBeatUiLine | null;
  readonly announcement: string;
  readonly sourceFingerprint: string | null;
  readonly fallbackReason: StoryBeatClientFallbackReasonV1 | null;
}

export interface StoryBeatUiContext {
  readonly enabled: boolean;
  readonly eligible: boolean;
  readonly job: StoryBeatJobV1 | null;
}

export interface StoryBeatAuthorPort {
  authorStoryBeat(job: StoryBeatJobV1): Promise<StoryBeatClientResultV1>;
}

export interface StoryBeatControllerDependencies {
  readonly author: StoryBeatAuthorPort;
  readonly onChange?: (snapshot: StoryBeatUiSnapshot) => void;
}

export interface StoryBeatFallbackPresentation {
  readonly label: string;
  readonly announcement: string;
}

const sceneChangedFallback = Object.freeze({
  label: "Scene changed · safe",
  announcement: "The scene changed before local drafting could finish. The safe Chronicle headline remains.",
});
const localUnavailableFallback = Object.freeze({
  label: "Local unavailable · safe",
  announcement: "Local drafting is unavailable on this device. The safe Chronicle headline remains.",
});
const localPausedFallback = Object.freeze({
  label: "Local drafting paused · safe",
  announcement: "Local drafting is paused for this view. The safe Chronicle headline remains.",
});
const localBusyFallback = Object.freeze({
  label: "Local narrator busy · safe",
  announcement: "The local narrator is busy. The safe Chronicle headline remains.",
});
const sceneTooLargeFallback = Object.freeze({
  label: "Scene too large · safe",
  announcement: "This scene is too large for a local draft. The safe Chronicle headline remains.",
});
const draftSetAsideFallback = Object.freeze({
  label: "Draft set aside · safe",
  announcement: "The local draft was set aside. The safe Chronicle headline remains.",
});
const localInterruptedFallback = Object.freeze({
  label: "Local interrupted · safe",
  announcement: "Local drafting was interrupted on this device. The safe Chronicle headline remains.",
});

const storyBeatFallbackPresentations = Object.freeze({
  "invalid-job": sceneChangedFallback,
  unavailable: localUnavailableFallback,
  suppressed: localPausedFallback,
  backpressure: localBusyFallback,
  "input-budget": sceneTooLargeFallback,
  cooldown: localBusyFallback,
  "invalid-output": draftSetAsideFallback,
  stale: sceneChangedFallback,
  "transport-failure": localInterruptedFallback,
} satisfies Record<StoryBeatClientFallbackReasonV1, StoryBeatFallbackPresentation>);

export function storyBeatFallbackPresentation(
  reason: StoryBeatClientFallbackReasonV1,
): StoryBeatFallbackPresentation {
  return storyBeatFallbackPresentations[reason];
}

function sourceIdentity(job: StoryBeatJobV1): string {
  return [
    job.campaignId,
    job.eventId,
    String(job.tick),
    job.sourceFingerprint,
  ].join("\n");
}

function safeNotify(
  callback: StoryBeatControllerDependencies["onChange"],
  snapshot: StoryBeatUiSnapshot,
): void {
  try {
    callback?.(snapshot);
  } catch {
    // Presentation observers cannot alter controller authority or request identity.
  }
}

export class StoryBeatController {
  private phase: StoryBeatUiPhase = "hidden";
  private job: StoryBeatJobV1 | null = null;
  private line: StoryBeatUiLine | null = null;
  private announcement = "";
  private fallbackReason: StoryBeatClientFallbackReasonV1 | null = null;
  private requestEpoch = 0;
  private currentSnapshot: StoryBeatUiSnapshot;

  constructor(private readonly dependencies: StoryBeatControllerDependencies) {
    this.currentSnapshot = this.buildSnapshot();
  }

  get snapshot(): StoryBeatUiSnapshot {
    return this.currentSnapshot;
  }

  sync(context: StoryBeatUiContext): StoryBeatUiSnapshot {
    const nextJob = context.enabled
      && context.eligible
      && context.job !== null
      && isStoryBeatJobV1(context.job)
      ? context.job
      : null;
    const previousIdentity = this.job === null ? null : sourceIdentity(this.job);
    const nextIdentity = nextJob === null ? null : sourceIdentity(nextJob);
    if (previousIdentity === nextIdentity) return this.currentSnapshot;

    this.requestEpoch += 1;
    this.job = nextJob;
    this.line = null;
    this.announcement = "";
    this.fallbackReason = null;
    this.phase = nextJob === null ? "hidden" : "ready";
    this.publish();
    return this.currentSnapshot;
  }

  write(): boolean {
    const job = this.job;
    if (job === null || this.phase === "writing") return false;

    const requestEpoch = ++this.requestEpoch;
    const identity = sourceIdentity(job);
    this.phase = "writing";
    this.line = Object.freeze({
      source: "deterministic",
      text: job.deterministicFallback,
      sourceFingerprint: job.sourceFingerprint,
    });
    this.announcement = "Safe Chronicle headline shown. Writing an optional local draft.";
    this.fallbackReason = null;
    this.publish();

    let request: Promise<StoryBeatClientResultV1>;
    try {
      request = this.dependencies.author.authorStoryBeat(job);
    } catch {
      this.settleFallback(requestEpoch, identity, "transport-failure");
      return true;
    }
    void request.then(
      (result) => {
        if (!this.isCurrent(requestEpoch, identity)) return;
        if (result.outcome === "authored") {
          const validated = validateStoryBeatResultV1(result.text, job.facts);
          if (validated !== null) {
            this.phase = "authored";
            this.line = Object.freeze({
              source: "model",
              text: validated,
              sourceFingerprint: job.sourceFingerprint,
            });
            this.announcement = "Optional local draft replaced the safe headline for this scene.";
            this.fallbackReason = null;
            this.publish();
            return;
          }
          this.settleFallback(requestEpoch, identity, "invalid-output");
          return;
        }
        this.settleFallback(requestEpoch, identity, result.reason);
      },
      () => this.settleFallback(requestEpoch, identity, "transport-failure"),
    );
    return true;
  }

  cancel(): boolean {
    if (this.job === null || (this.phase === "ready" && this.line === null)) return false;
    this.requestEpoch += 1;
    this.phase = "ready";
    this.line = null;
    this.announcement = "";
    this.fallbackReason = null;
    this.publish();
    return true;
  }

  dispose(): void {
    this.requestEpoch += 1;
    this.job = null;
    this.phase = "hidden";
    this.line = null;
    this.announcement = "";
    this.fallbackReason = null;
    this.publish();
  }

  private isCurrent(requestEpoch: number, identity: string): boolean {
    return requestEpoch === this.requestEpoch
      && this.job !== null
      && sourceIdentity(this.job) === identity;
  }

  private settleFallback(
    requestEpoch: number,
    identity: string,
    reason: StoryBeatClientFallbackReasonV1,
  ): void {
    if (!this.isCurrent(requestEpoch, identity) || this.job === null) return;
    this.phase = "fallback";
    this.line = Object.freeze({
      source: "deterministic",
      text: this.job.deterministicFallback,
      sourceFingerprint: this.job.sourceFingerprint,
    });
    this.announcement = storyBeatFallbackPresentation(reason).announcement;
    this.fallbackReason = reason;
    this.publish();
  }

  private buildSnapshot(): StoryBeatUiSnapshot {
    return Object.freeze({
      phase: this.phase,
      visible: this.job !== null,
      busy: this.phase === "writing",
      line: this.line,
      announcement: this.announcement,
      sourceFingerprint: this.job?.sourceFingerprint ?? null,
      fallbackReason: this.fallbackReason,
    });
  }

  private publish(): void {
    this.currentSnapshot = this.buildSnapshot();
    safeNotify(this.dependencies.onChange, this.currentSnapshot);
  }
}

export function createStoryBeatController(
  dependencies: StoryBeatControllerDependencies,
): StoryBeatController {
  return new StoryBeatController(dependencies);
}
