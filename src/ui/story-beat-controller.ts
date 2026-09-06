import {
  isStoryBeatAuthoringJob,
  storyBeatAuthoringNarrativeFacts,
  validateStoryBeatAuthoringResult,
  type StoryBeatAuthoringJob,
} from "../narrator/story-beat-authoring";
import type {
  StoryBeatClientFallbackReasonV1,
  StoryBeatClientResultV1,
} from "../narrator/narrator-client";
import {
  createStoryBeatDraftSignatureV1,
  storyBeatDraftEchoReasonV1,
  storyBeatRecentDraftLimit,
  type StoryBeatDraftSignatureV1,
} from "./story-beat-echo";

export type StoryBeatUiPhase =
  | "hidden"
  | "ready"
  | "writing"
  | "authored"
  | "retained"
  | "fallback";

export interface StoryBeatUiLine {
  readonly source: "deterministic" | "model";
  readonly text: string;
  readonly eventId: string;
  readonly tick: number;
  readonly sourceFingerprint: string;
}

export const storyBeatTrailLimit = storyBeatRecentDraftLimit;

export interface StoryBeatTrailEntry {
  readonly campaignId: string;
  readonly eventId: string;
  readonly tick: number;
  readonly sourceFingerprint: string;
  readonly location: string;
  readonly text: string;
}

export interface StoryBeatUiSnapshot {
  readonly phase: StoryBeatUiPhase;
  readonly visible: boolean;
  readonly actionVisible: boolean;
  readonly busy: boolean;
  readonly line: StoryBeatUiLine | null;
  readonly trail: readonly StoryBeatTrailEntry[];
  readonly announcement: string;
  readonly sourceFingerprint: string | null;
  readonly fallbackReason: StoryBeatClientFallbackReasonV1 | null;
}

export interface StoryBeatUiContext {
  readonly enabled: boolean;
  readonly eligible: boolean;
  readonly campaignId?: string;
  readonly job: StoryBeatAuthoringJob | null;
}

export interface StoryBeatAuthorPort {
  authorStoryBeat(job: StoryBeatAuthoringJob): Promise<StoryBeatClientResultV1>;
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

const storyBeatWriteLabels = Object.freeze({
  hidden: "Write this beat",
  ready: "Write this beat",
  writing: "Writing locally…",
  authored: "Write another",
  retained: "Write another",
  fallback: "Try again",
} satisfies Record<StoryBeatUiPhase, string>);

export function storyBeatWriteLabel(phase: StoryBeatUiPhase): string {
  return storyBeatWriteLabels[phase];
}

function sourceIdentity(job: StoryBeatAuthoringJob): string {
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
  private job: StoryBeatAuthoringJob | null = null;
  private line: StoryBeatUiLine | null = null;
  private announcement = "";
  private fallbackReason: StoryBeatClientFallbackReasonV1 | null = null;
  private retainedDraft: StoryBeatUiLine | null = null;
  private surfaceEligible = false;
  private requestEpoch = 0;
  private sessionCampaignId: string | null = null;
  private recentDrafts: readonly StoryBeatDraftSignatureV1[] = Object.freeze([]);
  private trail: readonly StoryBeatTrailEntry[] = Object.freeze([]);
  private currentSnapshot: StoryBeatUiSnapshot;

  constructor(private readonly dependencies: StoryBeatControllerDependencies) {
    this.currentSnapshot = this.buildSnapshot();
  }

  get snapshot(): StoryBeatUiSnapshot {
    return this.currentSnapshot;
  }

  sync(context: StoryBeatUiContext): StoryBeatUiSnapshot {
    const parsedJob = context.job !== null && isStoryBeatAuthoringJob(context.job)
      ? context.job
      : null;
    const campaignId = context.campaignId ?? parsedJob?.campaignId ?? null;
    const validJob = parsedJob !== null
      && (campaignId === null || parsedJob.campaignId === campaignId)
      ? parsedJob
      : null;
    const sessionChanged = this.syncSessionDraftCampaign(context.enabled, campaignId);
    const nextSurfaceEligible = context.enabled && context.eligible;
    const nextJob = context.enabled && context.eligible ? validJob : null;
    const previousIdentity = this.job === null ? null : sourceIdentity(this.job);
    const nextIdentity = nextJob === null ? null : sourceIdentity(nextJob);
    if (
      previousIdentity === nextIdentity
      && this.surfaceEligible === nextSurfaceEligible
      && !sessionChanged
    ) return this.currentSnapshot;

    this.requestEpoch += 1;
    this.surfaceEligible = nextSurfaceEligible;
    this.job = nextJob;
    this.line = null;
    this.announcement = "";
    this.fallbackReason = null;
    this.retainedDraft = null;
    this.phase = nextJob === null ? "hidden" : "ready";
    this.publish();
    return this.currentSnapshot;
  }

  write(): boolean {
    const job = this.job;
    if (job === null || this.phase === "writing") return false;

    const requestEpoch = ++this.requestEpoch;
    const identity = sourceIdentity(job);
    this.retainedDraft = this.line?.source === "model" ? this.line : null;
    this.phase = "writing";
    this.line = this.retainedDraft ?? Object.freeze({
      source: "deterministic",
      text: job.deterministicFallback,
      eventId: job.eventId,
      tick: job.tick,
      sourceFingerprint: job.sourceFingerprint,
    });
    this.announcement = this.retainedDraft === null
      ? "Safe Chronicle headline shown. Writing an optional local draft."
      : "Previous local draft kept visible while another is written.";
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
          const validated = validateStoryBeatAuthoringResult(result.text, job.facts);
          if (validated !== null) {
            const narrativeFacts = storyBeatAuthoringNarrativeFacts(job.facts);
            const signature = createStoryBeatDraftSignatureV1(
              validated,
              narrativeFacts.location,
            );
            if (
              signature === null
              || storyBeatDraftEchoReasonV1(signature, narrativeFacts, this.recentDrafts) !== null
            ) {
              this.settleFallback(requestEpoch, identity, "invalid-output");
              return;
            }
            this.phase = "authored";
            this.retainedDraft = null;
            this.line = Object.freeze({
              source: "model",
              text: validated,
              eventId: job.eventId,
              tick: job.tick,
              sourceFingerprint: job.sourceFingerprint,
            });
            this.announcement = "Fact-bound local draft added to the session Story Trail.";
            this.fallbackReason = null;
            this.rememberDraft(signature);
            this.rememberTrailEntry(job, narrativeFacts.location, validated);
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
    const retainedDraft = this.retainedDraft;
    this.requestEpoch += 1;
    this.retainedDraft = null;
    this.phase = retainedDraft === null ? "ready" : "retained";
    this.line = retainedDraft;
    this.announcement = retainedDraft === null
      ? ""
      : "New local drafting was canceled. The previous local draft remains.";
    this.fallbackReason = null;
    this.publish();
    return true;
  }

  dispose(): void {
    this.requestEpoch += 1;
    this.surfaceEligible = false;
    this.job = null;
    this.phase = "hidden";
    this.line = null;
    this.announcement = "";
    this.fallbackReason = null;
    this.retainedDraft = null;
    this.clearSessionDrafts();
    this.publish();
  }

  private syncSessionDraftCampaign(
    enabled: boolean,
    campaignId: string | null,
  ): boolean {
    if (!enabled) {
      const changed = this.sessionCampaignId !== null
        || this.recentDrafts.length > 0
        || this.trail.length > 0;
      this.clearSessionDrafts();
      return changed;
    }
    if (campaignId === null) return false;
    const changed = this.sessionCampaignId !== null
      && this.sessionCampaignId !== campaignId;
    if (
      changed
    ) {
      this.recentDrafts = Object.freeze([]);
      this.trail = Object.freeze([]);
    }
    this.sessionCampaignId = campaignId;
    return changed;
  }

  private rememberDraft(signature: StoryBeatDraftSignatureV1): void {
    this.recentDrafts = Object.freeze([
      ...this.recentDrafts.slice(-(storyBeatRecentDraftLimit - 1)),
      signature,
    ]);
  }

  private rememberTrailEntry(
    job: StoryBeatAuthoringJob,
    location: string,
    text: string,
  ): void {
    const identity = sourceIdentity(job);
    const prior = this.trail.filter((entry) => [
      entry.campaignId,
      entry.eventId,
      String(entry.tick),
      entry.sourceFingerprint,
    ].join("\n") !== identity);
    const entry = Object.freeze({
      campaignId: job.campaignId,
      eventId: job.eventId,
      tick: job.tick,
      sourceFingerprint: job.sourceFingerprint,
      location,
      text,
    });
    this.trail = Object.freeze([
      ...prior.slice(-(storyBeatTrailLimit - 1)),
      entry,
    ]);
  }

  private clearSessionDrafts(): void {
    this.sessionCampaignId = null;
    this.recentDrafts = Object.freeze([]);
    this.trail = Object.freeze([]);
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
    const retainedDraft = this.retainedDraft;
    this.retainedDraft = null;
    if (retainedDraft !== null) {
      this.phase = "retained";
      this.line = retainedDraft;
      this.announcement = "A new local draft was not available. The previous local draft remains.";
      this.fallbackReason = reason;
      this.publish();
      return;
    }
    this.phase = "fallback";
    this.line = Object.freeze({
      source: "deterministic",
      text: this.job.deterministicFallback,
      eventId: this.job.eventId,
      tick: this.job.tick,
      sourceFingerprint: this.job.sourceFingerprint,
    });
    this.announcement = storyBeatFallbackPresentation(reason).announcement;
    this.fallbackReason = reason;
    this.publish();
  }

  private buildSnapshot(): StoryBeatUiSnapshot {
    return Object.freeze({
      phase: this.phase,
      visible: this.surfaceEligible && (this.job !== null || this.trail.length > 0),
      actionVisible: this.job !== null,
      busy: this.phase === "writing",
      line: this.line,
      trail: this.trail,
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
