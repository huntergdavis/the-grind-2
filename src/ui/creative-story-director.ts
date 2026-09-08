import type { CreativeStoryFocus, CreativeStoryInspirationTone, CreativeStoryOrigin } from "../narrator/creative-story";
import { captureFarewellRemembrance, type FarewellRemembrance } from "../narrator/farewell-remembrance";
import { captureFirstSharedVictory, type FirstSharedVictory } from "../narrator/first-shared-victory";
import type { createCreativeStoryController, CreativeStoryMoment } from "./creative-story-controller";
import { normalizeNarrativeDirection, type NarrativeDirection } from "../narrator/creative-direction";
import { normalizeCreativeMomentSelection, type CreativeMomentSelection } from "../narrator/creative-moment";
import { captureStoryDuet, type StoryDuet } from "../narrator/story-duet";
import { captureStoryVoiceInspiration, type StoryVoiceInspiration } from "../narrator/story-voice-inspiration";

export const creativeStoryCadenceMs = 90_000;
export const creativeStoryReadyMaximumAgeMs = 180_000;

export interface CreativeStoryCandidate extends CreativeStoryMoment {
  readonly remembrance?: FarewellRemembrance;
  readonly firstVictory?: FirstSharedVictory;
}

export interface HeldNarrative {
  readonly text: string;
  readonly location: string;
  readonly headline: string;
  readonly campaignId: string;
  readonly sourceEventId: string;
  readonly sourceTick: number;
  readonly readyAtMs: number;
  readonly inspirationTone: CreativeStoryInspirationTone;
  readonly origin: CreativeStoryOrigin;
  readonly direction?: NarrativeDirection;
  readonly momentSelection?: CreativeMomentSelection;
  readonly remembrance?: FarewellRemembrance;
  readonly firstVictory?: FirstSharedVictory;
  readonly duet?: StoryDuet;
  readonly voiceInspiration?: StoryVoiceInspiration;
}

interface Dependencies {
  readonly writer: ReturnType<typeof createCreativeStoryController>;
  readonly now?: () => number;
  readonly cadenceMs?: () => number;
  /** Host cooldown boundary only; temporary pause/reading state is still controlled by active. */
  readonly presentationNotBeforeMs?: () => number;
  readonly storyFocus?: () => CreativeStoryFocus;
  readonly onWritten?: (passage: HeldNarrative) => void;
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
    ...(candidate.firstVictory === undefined ? {} : { firstVictory: captureFirstSharedVictory(candidate.firstVictory) }),
  });
}

/** Owns background writing only. The host decides when a held passage may take the stage. */
export function createCreativeStoryDirector({ writer, now = Date.now, cadenceMs = () => creativeStoryCadenceMs,
  presentationNotBeforeMs = () => -Infinity, storyFocus, onWritten, onReady }: Dependencies) {
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
  const nextPermittedAttemptAtMs = (): number => Math.max(
    Math.max(lastAttemptAtMs, lastPresentationAtMs) + cadenceMs(), presentationNotBeforeMs(),
  );

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
    // Keep the original offer through the next permitted attempt and its grace period.
    // A held story may move that attempt later when shown; polling and duplicate offers cannot.
    if (priority !== null && (now() >= Math.max(priority.offeredAtMs, nextPermittedAttemptAtMs()) + creativeStoryReadyMaximumAgeMs
      || priority.candidate.job.campaignId !== campaignId || priority.candidate.job.tick <= attemptedThroughTick)) priority = null;
  };

  const offerMilestone = (candidate: CreativeStoryCandidate, kind: "farewell-remembrance" | "first-shared-victory"): boolean => {
    reconcile();
    const memory = kind === "farewell-remembrance" ? candidate.remembrance : candidate.firstVictory;
    const phase = writer.snapshot.phase;
    if (phase === "off" || phase === "failed" || memory?.kind !== kind
      || (candidate.remembrance !== undefined && candidate.firstVictory !== undefined)
      || candidate.job.campaignId !== campaignId || memory.campaignId !== campaignId
      || memory.eventId !== candidate.job.eventId || memory.tick !== candidate.job.tick
      || !Number.isSafeInteger(candidate.job.tick) || candidate.job.tick < 0
      || candidate.job.tick <= attemptedThroughTick
      || (priority !== null && candidate.job.tick <= priority.candidate.job.tick)) return false;
    priority = Object.freeze({ candidate: capture(candidate), offeredAtMs: now() });
    return true;
  };

  return {
    get snapshot(): { readonly ready: HeldNarrative | null; readonly generating: boolean } {
      reconcile();
      return Object.freeze({ ready, generating: request !== null });
    },
    invalidate,
    offerRemembrance(candidate: CreativeStoryCandidate): boolean {
      return offerMilestone(candidate, "farewell-remembrance");
    },
    offerFirstVictory: (candidate: CreativeStoryCandidate): boolean => offerMilestone(candidate, "first-shared-victory"),
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
        || now() < nextPermittedAttemptAtMs()) return;

      const alternative = offered !== null && writer.canChooseMoments() && next.candidate !== null
        && next.candidate.job.campaignId === campaignId
        && Number.isSafeInteger(next.candidate.job.tick) && next.candidate.job.tick > candidate.job.tick
        && next.candidate.job.eventId !== candidate.job.eventId ? capture(next.candidate) : null;
      const current = { epoch, candidate: capture(candidate), alternative };
      request = current; // Install before sync/write publish, which may re-enter the director.
      try {
        // The current view may be solo after a farewell. Preserve the user's stored focus for the captured scene.
        const requestedFocus = storyFocus?.() ?? writer.snapshot.focus;
        writer.sync({ ...current.candidate, eligible: true });
        if (request !== current || epoch !== current.epoch
          || !writer.write(() => request === current && epoch === current.epoch, alternative ?? undefined, requestedFocus)) {
          if (request === current) request = null;
          return;
        }
        // Rejected starts must not consume this event or start its cooldown.
        if (epoch === current.epoch && campaignId === current.candidate.job.campaignId) {
          // Both offers belong to one attempt, not a queue that can reopen the unchosen scene later.
          attemptedThroughTick = Math.max(candidate.job.tick, alternative?.job.tick ?? candidate.job.tick);
          lastAttemptAtMs = now();
          if (priority === offered) priority = null;
        }
        void writer.waitForWriteSettlement().then(() => {
          if (request !== current) return;
          request = null;
          const completed = writer.snapshot;
          if (epoch !== current.epoch || campaignId !== current.candidate.job.campaignId
            || completed.phase !== "ready" || completed.text === null || completed.origin === null) return;
          const momentSelection = normalizeCreativeMomentSelection(completed.momentSelection);
          const source = momentSelection?.choice === "current" && current.alternative !== null
            ? current.alternative.job : current.candidate.job;
          const inspiration = captureStoryVoiceInspiration(completed.voiceInspiration);
          const passage: HeldNarrative = Object.freeze({
            text: completed.text,
            location: source.facts.location,
            headline: source.facts.headline,
            campaignId: source.campaignId,
            sourceEventId: source.eventId,
            sourceTick: source.tick,
            readyAtMs: now(),
            inspirationTone: completed.seedTone ?? "neutral",
            origin: completed.origin,
            direction: normalizeNarrativeDirection(completed.direction),
            ...(momentSelection === null ? {} : { momentSelection }),
            ...(completed.origin !== "authored" || completed.remembrance === null ? {}
              : { remembrance: captureFarewellRemembrance(completed.remembrance) }),
            ...(completed.firstVictory === null ? {} : { firstVictory: captureFirstSharedVictory(completed.firstVictory) }),
            ...(completed.duet === null ? {} : { duet: captureStoryDuet(completed.duet) }),
            ...(completed.origin !== "authored" || completed.duet !== null || inspiration === null
              || inspiration.text !== completed.text || inspiration.heroName !== completed.remembrance?.heroName
              ? {} : { voiceInspiration: inspiration }),
          });
          ready = passage;
          // Completion and presentation are separate: an unshown passage may still be archived.
          // Optional viewer storage must never prevent the ready passage from being presented.
          try {
            onWritten?.(passage);
          } catch {
            console.warn("The completed story could not be archived; it remains available to read.");
          }
          if (ready === passage && epoch === current.epoch && campaignId === passage.campaignId) onReady();
        }).catch(() => {
          if (request === current) request = null;
        });
      } catch {
        if (request === current) request = null;
      }
    },
  };
}
