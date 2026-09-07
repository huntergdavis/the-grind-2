import type { SceneMode } from "../core/types";
import type { CreativeStoryInspirationTone, CreativeStoryOrigin, CreativeStoryViewpoint } from "../narrator/creative-story";
import type { StoryBeatJobV1 } from "../narrator/story-beat";
import { captureFarewellRemembrance, type FarewellRemembrance } from "../narrator/farewell-remembrance";
import type { createCreativeStoryController } from "./creative-story-controller";

export const creativeStoryCadenceMs = 90_000;
export const creativeStoryReadyMaximumAgeMs = 180_000;

export interface CreativeStoryCandidate {
  readonly job: StoryBeatJobV1;
  readonly mode: SceneMode;
  readonly viewpoint: CreativeStoryViewpoint | null;
  readonly remembrance?: FarewellRemembrance;
}

export interface HeldNarrative {
  readonly text: string;
  readonly location: string;
  readonly headline: string;
  readonly campaignId: string;
  readonly sourceTick: number;
  readonly readyAtMs: number;
  readonly inspirationTone: CreativeStoryInspirationTone;
  readonly origin: CreativeStoryOrigin;
  readonly remembrance?: FarewellRemembrance;
}

interface Dependencies {
  readonly writer: ReturnType<typeof createCreativeStoryController>;
  readonly now?: () => number;
  readonly cadenceMs?: () => number;
  readonly onReady: () => void;
}

function capture(candidate: CreativeStoryCandidate): CreativeStoryCandidate {
  const { job, viewpoint } = candidate;
  return Object.freeze({
    mode: candidate.mode,
    job: Object.freeze({ ...job, facts: Object.freeze({ ...job.facts }) }),
    viewpoint: viewpoint === null ? null : Object.freeze({
      hero: Object.freeze({ ...viewpoint.hero, values: Object.freeze([...viewpoint.hero.values]) }),
      companion: viewpoint.companion === null ? null : Object.freeze({ ...viewpoint.companion }),
    }),
    ...(candidate.remembrance === undefined ? {} : { remembrance: captureFarewellRemembrance(candidate.remembrance) }),
  });
}

/** Owns background writing only. The host decides when a held passage may take the stage. */
export function createCreativeStoryDirector({ writer, now = Date.now, cadenceMs = () => creativeStoryCadenceMs, onReady }: Dependencies) {
  let campaignId: string | null = null;
  let epoch = 0;
  let ready: HeldNarrative | null = null;
  let request: { readonly epoch: number; readonly candidate: CreativeStoryCandidate } | null = null;
  let lastAttemptAtMs = -Infinity;
  let lastPresentationAtMs = -Infinity;
  // Committed ticks are monotonic within a campaign: no growing seen-event collection is needed.
  let attemptedThroughTick = -Infinity;
  // One short-lived milestone, not a persistent memory store or growing scene queue.
  let priority: { readonly candidate: CreativeStoryCandidate; readonly offeredAtMs: number } | null = null;

  const invalidate = (): void => {
    epoch += 1;
    ready = null;
    priority = null;
    // Let a finite request settle without unloading the user's explicitly activated model.
  };

  const reconcile = (): void => {
    const phase = writer.snapshot.phase;
    if (phase === "off" || phase === "failed") priority = null;
    if (phase === "off" || phase === "failed" || phase === "loading") {
      if (ready !== null || (request !== null && request.epoch === epoch)) invalidate();
    }
    if (ready !== null && now() - ready.readyAtMs >= creativeStoryReadyMaximumAgeMs) ready = null;
    if (priority !== null && (now() - priority.offeredAtMs >= creativeStoryReadyMaximumAgeMs
      || priority.candidate.job.campaignId !== campaignId || priority.candidate.job.tick <= attemptedThroughTick)) priority = null;
  };

  return {
    get snapshot(): { readonly ready: HeldNarrative | null; readonly generating: boolean } {
      reconcile();
      return Object.freeze({ ready, generating: request !== null });
    },
    invalidate,
    offerRemembrance(candidate: CreativeStoryCandidate): boolean {
      reconcile();
      const memory = candidate.remembrance;
      const phase = writer.snapshot.phase;
      if (phase === "off" || phase === "failed" || memory === undefined
        || candidate.job.campaignId !== campaignId || memory.campaignId !== campaignId
        || memory.eventId !== candidate.job.eventId || memory.tick !== candidate.job.tick
        || !Number.isSafeInteger(candidate.job.tick) || candidate.job.tick < 0
        || candidate.job.tick <= attemptedThroughTick
        || (priority !== null && candidate.job.tick <= priority.candidate.job.tick)) return false;
      priority = Object.freeze({ candidate: capture(candidate), offeredAtMs: now() });
      return true;
    },
    takeReady(): HeldNarrative | null {
      reconcile();
      const passage = ready;
      if (passage !== null) {
        ready = null;
        lastPresentationAtMs = now();
      }
      return passage;
    },
    sync(next: { readonly campaignId: string; readonly candidate: CreativeStoryCandidate | null; readonly active: boolean }): void {
      if (next.campaignId !== campaignId) {
        invalidate();
        campaignId = next.campaignId;
        attemptedThroughTick = -Infinity;
        lastAttemptAtMs = -Infinity;
        lastPresentationAtMs = -Infinity;
      }
      reconcile();
      const offered = priority;
      const candidate = offered?.candidate ?? next.candidate;
      if (!next.active || request !== null || ready !== null || writer.snapshot.phase !== "ready"
        || candidate === null || candidate.job.campaignId !== campaignId
        || !Number.isSafeInteger(candidate.job.tick) || candidate.job.tick < 0
        || candidate.job.tick <= attemptedThroughTick
        || now() < Math.max(lastAttemptAtMs, lastPresentationAtMs) + cadenceMs()) return;

      const current = { epoch, candidate: capture(candidate) };
      request = current; // Install before sync/write publish, which may re-enter the director.
      try {
        writer.sync({ ...current.candidate, eligible: true });
        if (request !== current || epoch !== current.epoch || !writer.write()) {
          if (request === current) request = null;
          return;
        }
        // Rejected starts must not consume this event or start its cooldown.
        if (epoch === current.epoch && campaignId === current.candidate.job.campaignId) {
          attemptedThroughTick = candidate.job.tick;
          lastAttemptAtMs = now();
          if (priority === offered) priority = null;
        }
        void writer.waitForWriteSettlement().then(() => {
          if (request !== current) return;
          request = null;
          const completed = writer.snapshot;
          if (epoch !== current.epoch || campaignId !== current.candidate.job.campaignId
            || completed.phase !== "ready" || completed.text === null || completed.origin === null) return;
          const source = current.candidate.job;
          ready = Object.freeze({
            text: completed.text,
            location: source.facts.location,
            headline: source.facts.headline,
            campaignId: source.campaignId,
            sourceTick: source.tick,
            readyAtMs: now(),
            inspirationTone: completed.seedTone ?? "neutral",
            origin: completed.origin,
            ...(completed.origin !== "authored" || completed.remembrance === null ? {}
              : { remembrance: captureFarewellRemembrance(completed.remembrance) }),
          });
          onReady();
        }).catch(() => {
          if (request === current) request = null;
        });
      } catch {
        if (request === current) request = null;
      }
    },
  };
}
