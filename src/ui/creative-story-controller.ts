import type { SceneMode } from "../core/types";
import { captureCreativeStoryMemory, type CreativeStoryMemory } from "../narrator/creative-continuity";
import { captureStoryCharacterAnchor, hasStoryCharacterAnchor } from "../narrator/story-character-anchor";
import type { CreativeDirectionOptions, CreativeWriterLoadOptions, CreativeWriterMessage } from "../narrator/creative-writer-client";
import {
  buildCreativeStoryMessages,
  cleanCreativeStoryOutput,
  selectStorySeed,
  type CreativeStoryFocus,
  type CreativeStoryInspirationTone,
  type CreativeStoryOrigin,
  type CreativeStoryViewpoint,
} from "../narrator/creative-story";
import type { StoryBeatJobV1 } from "../narrator/story-beat";
import { createStoryVignette } from "../narrator/story-vignette";
import { captureFarewellRemembrance, createFarewellRemembranceVignette, type FarewellRemembrance } from "../narrator/farewell-remembrance";
import { captureFirstSharedVictory, createFirstSharedVictoryVignette, type FirstSharedVictory } from "../narrator/first-shared-victory";
import { captureStoryDuet, storyDuetText, type StoryDuet } from "../narrator/story-duet";
import { createStoryDuetVignette } from "../narrator/story-duet-vignette";
import { captureStoryVoiceInspiration, type StoryVoiceInspiration } from "../narrator/story-voice-inspiration";
import { buildCreativeDirectionMessages, defaultNarrativeDirection, directionChoiceForStage, directionForChoice, type NarrativeDirection, type NarrativeStage } from "../narrator/creative-direction";
import { buildCreativeMomentMessages, momentForChoice, normalizeCreativeMomentSelection, type CreativeMomentSelection } from "../narrator/creative-moment";

export interface CreativeStoryMoment {
  readonly job: StoryBeatJobV1;
  readonly mode: SceneMode;
  readonly viewpoint: CreativeStoryViewpoint | null;
}

export interface CreativeStoryWriter {
  readonly ready: boolean;
  load(progress: (message: string) => void, options?: CreativeWriterLoadOptions): Promise<void>;
  write(messages: readonly CreativeWriterMessage[]): Promise<string>;
  direct?(messages: readonly CreativeWriterMessage[], options?: CreativeDirectionOptions): Promise<string | null>;
  chooseMoment?(messages: readonly CreativeWriterMessage[]): Promise<"1" | "2" | null>;
  dispose(): void;
}

export interface CreativeStorySnapshot {
  readonly phase: "off" | "loading" | "ready" | "writing" | "failed";
  readonly cached: boolean;
  readonly visible: boolean;
  readonly eligible: boolean;
  readonly busy: boolean;
  readonly status: string;
  readonly source: StoryBeatJobV1["facts"] | null;
  readonly text: string | null;
  readonly origin: CreativeStoryOrigin | null;
  readonly direction: NarrativeDirection;
  readonly momentSelection: CreativeMomentSelection | null;
  readonly remembrance: FarewellRemembrance | null;
  readonly firstVictory: FirstSharedVictory | null;
  readonly duet: StoryDuet | null;
  readonly voiceInspiration: StoryVoiceInspiration | null;
  readonly seedTheme: string | null;
  readonly seedTone: CreativeStoryInspirationTone | null;
  readonly focus: CreativeStoryFocus;
  readonly relationshipAvailable: boolean;
}

interface Dependencies {
  createWriter(): CreativeStoryWriter;
  hasCachedModel(): Promise<boolean>;
  removeCachedModel(): Promise<void>;
  allowVignette?(): boolean;
  previousStage?(): NarrativeStage | undefined;
  continuity?(moment: CreativeStoryMoment): readonly CreativeStoryMemory[];
  onChange(snapshot: CreativeStorySnapshot): void;
}

function identity(job: StoryBeatJobV1 | null): string | null {
  return job === null ? null : JSON.stringify([
    job.campaignId, job.eventId, job.tick, job.sourceFingerprint,
  ]);
}

export function createCreativeStoryController(deps: Dependencies) {
  let writer: CreativeStoryWriter | null = null;
  let phase: CreativeStorySnapshot["phase"] = "off";
  let cached = false;
  let eligible = false;
  let job: StoryBeatJobV1 | null = null;
  let mode: SceneMode = "chronicle";
  let viewpoint: CreativeStoryViewpoint | null = null;
  let viewpointKey = "null";
  let focus: CreativeStoryFocus = "inner-life";
  let status = "Off · no automatic download";
  let text: string | null = null;
  let origin: CreativeStoryOrigin | null = null;
  let direction: NarrativeDirection = defaultNarrativeDirection;
  let momentSelection: CreativeMomentSelection | null = null;
  let writtenSource: StoryBeatJobV1["facts"] | null = null;
  let remembrance: FarewellRemembrance | null = null;
  let capturedRemembrance: FarewellRemembrance | null = null;
  let remembranceKey = "null";
  let firstVictory: FirstSharedVictory | null = null;
  let capturedFirstVictory: FirstSharedVictory | null = null;
  let firstVictoryKey = "null";
  let duet: StoryDuet | null = null;
  let voiceInspiration: StoryVoiceInspiration | null = null;
  let lastModelText: string | null = null;
  let seedTheme: string | null = null;
  let seedTone: CreativeStoryInspirationTone | null = null;
  let epoch = 0;
  let attempt = 0;
  let removing = false;
  let settlement = Promise.resolve();
  let settle: (() => void) | null = null;

  const snapshot = (): CreativeStorySnapshot => ({
    phase, cached, eligible,
    visible: eligible && job !== null && (phase === "ready" || phase === "writing"),
    busy: phase === "loading" || phase === "writing" || removing,
    status, source: writtenSource ?? job?.facts ?? null, text, origin, direction, momentSelection, remembrance, firstVictory, duet, voiceInspiration, seedTheme, seedTone,
    focus, relationshipAvailable: viewpoint?.companion != null,
  });
  const publish = () => deps.onChange(snapshot());
  const finish = () => { settle?.(); settle = null; };
  const clearMoment = () => { momentSelection = null; writtenSource = null; firstVictory = null; duet = null; voiceInspiration = null; };
  const stop = (message = "Off · any saved files kept on this device") => {
    epoch += 1;
    writer?.dispose();
    writer = null;
    phase = "off";
    status = message;
    text = null;
    origin = null;
    direction = defaultNarrativeDirection;
    clearMoment();
    remembrance = null;
    capturedRemembrance = null;
    remembranceKey = "null";
    capturedFirstVictory = null;
    firstVictoryKey = "null";
    lastModelText = null;
    seedTheme = null;
    seedTone = null;
    finish();
    publish();
  };

  return {
    get snapshot() { return snapshot(); },
    canChooseMoments: () => typeof writer?.chooseMoment === "function",
    currentWriteIdentity: () => job === null ? null : JSON.stringify([identity(job), mode, viewpointKey, focus, remembranceKey, firstVictoryKey]),
    waitForWriteSettlement: () => settlement,
    async checkCache(): Promise<void> {
      if (removing) return;
      const checking = epoch;
      const found = await deps.hasCachedModel().catch(() => false);
      if (epoch !== checking || removing) return;
      cached = found;
      if (phase === "off") status = found
        ? "Saved model found · ready to restore without downloading"
        : "Off · no automatic download";
      publish();
    },
    sync(next: { job: StoryBeatJobV1 | null; mode: SceneMode; eligible: boolean; viewpoint?: CreativeStoryViewpoint | null; remembrance?: FarewellRemembrance; firstVictory?: FirstSharedVictory }): void {
      const nextViewpointKey = JSON.stringify(next.viewpoint ?? null);
      const memory = next.remembrance;
      const nextRemembrance = next.firstVictory === undefined && memory?.kind === "farewell-remembrance" && next.job !== null
        && memory.campaignId === next.job.campaignId && memory.eventId === next.job.eventId && memory.tick === next.job.tick
        && memory.oath.tick < memory.tick && memory.farewell.tick === memory.tick
        && memory.farewell.location === next.job.facts.location && memory.farewell.headline === next.job.facts.headline
        && memory.heroName === next.viewpoint?.hero.name && next.viewpoint.companion === null
        ? captureFarewellRemembrance(memory) : null;
      const nextRemembranceKey = JSON.stringify(nextRemembrance);
      const victory = next.firstVictory;
      const companion = next.viewpoint?.companion;
      const injured = companion?.status === "injured" || companion?.status === "arrived-injured";
      const nextFirstVictory = memory === undefined && victory?.kind === "first-shared-victory" && next.job !== null
        && victory.campaignId === next.job.campaignId && victory.eventId === next.job.eventId && victory.tick === next.job.tick
        && victory.battle.tick === victory.tick && victory.battle.location === next.job.facts.location
        && victory.battle.headline === next.job.facts.headline && victory.heroName === next.viewpoint?.hero.name
        && companion != null && victory.companionName === companion.name && companion.victories === 1
        && victory.condition === (injured ? "injured" : "healthy")
        ? captureFirstSharedVictory(victory) : null;
      const nextFirstVictoryKey = JSON.stringify(nextFirstVictory);
      const changed = identity(job) !== identity(next.job) || mode !== next.mode || viewpointKey !== nextViewpointKey
        || remembranceKey !== nextRemembranceKey || firstVictoryKey !== nextFirstVictoryKey;
      const wasEligible = eligible;
      job = next.job;
      mode = next.mode;
      viewpoint = next.viewpoint ?? null;
      viewpointKey = nextViewpointKey;
      capturedRemembrance = nextRemembrance;
      remembranceKey = nextRemembranceKey;
      capturedFirstVictory = nextFirstVictory;
      firstVictoryKey = nextFirstVictoryKey;
      if (focus === "shared-road" && viewpoint?.companion == null) focus = "inner-life";
      eligible = next.eligible;
      if (phase === "writing" && (changed || !eligible)) {
        stop("Writing canceled because the scene or view changed. Restore the saved model to retry.");
        return;
      }
      if (changed) {
        clearMoment();
        text = null;
        origin = null;
        direction = defaultNarrativeDirection;
        remembrance = null;
        lastModelText = null;
        seedTheme = null;
        seedTone = null;
        attempt = 0;
        if (phase === "ready") status = "Ready · stories write quietly during play";
      }
      if (changed || wasEligible !== eligible) publish();
    },
    setFocus(next: string): boolean {
      if (phase === "loading" || phase === "writing" || removing
        || !["inner-life", "shared-road", "scene"].includes(next)
        || (next === "shared-road" && viewpoint?.companion == null)) return false;
      if (next === focus) return true;
      focus = next as CreativeStoryFocus;
      clearMoment();
      text = null;
      origin = null;
      direction = defaultNarrativeDirection;
      remembrance = null;
      lastModelText = null;
      seedTheme = null;
      seedTone = null;
      attempt = 0;
      if (phase === "ready") status = "Story focus changed · applies to the next background draft";
      publish();
      return true;
    },
    async load(options?: CreativeWriterLoadOptions): Promise<void> {
      if (phase === "loading" || phase === "writing" || phase === "ready" || removing) return;
      const loading = ++epoch;
      clearMoment();
      phase = "loading";
      text = null;
      origin = null;
      direction = defaultNarrativeDirection;
      remembrance = null;
      seedTheme = null;
      seedTone = null;
      status = cached ? "Restoring saved model…" : "Loading creative writer…";
      publish();
      try {
        writer = deps.createWriter();
        await writer.load((message) => {
          if (epoch !== loading) return;
          status = message;
          publish();
        }, options?.cacheOnly === true ? { cacheOnly: true } : undefined);
        if (epoch !== loading) return;
        const found = await deps.hasCachedModel().catch(() => false);
        if (epoch !== loading) return;
        cached = found;
        phase = "ready";
        status = cached
          ? "Ready · stories write quietly during play"
          : "Ready for this session · browser did not keep a complete saved model";
        publish();
      } catch {
        if (epoch !== loading) return;
        writer?.dispose();
        writer = null;
        phase = "failed";
        status = options?.cacheOnly === true
          ? "Saved creative writer could not be restored. Retry to allow missing files to download."
          : "Could not load the creative writer. Retry uses any saved files.";
        publish();
      }
    },
    write(shouldContinue: () => boolean = () => true, currentMoment?: CreativeStoryMoment, requestedFocus: CreativeStoryFocus = focus): boolean {
      if (phase !== "ready" || !writer?.ready || !eligible || job === null) return false;
      const writing = ++epoch;
      const activeWriter = writer;
      const writingAttempt = attempt++;
      const previousStage = deps.previousStage?.();
      const excludedChoice = previousStage === undefined ? undefined : directionChoiceForStage(previousStage);
      let interrupted = false;
      const allowRecovery = deps.allowVignette?.() === true;
      // Prepare each complete interpretation before awaiting the choice: no later scene can replace its facts or people.
      const prepare = (sourceJob: StoryBeatJobV1, sourceMode: SceneMode, sourceViewpoint: CreativeStoryViewpoint | null,
        memory: FarewellRemembrance | null, sourceFocus: CreativeStoryFocus, victory: FirstSharedVictory | null = null) => {
        const sourceIdentity = identity(sourceJob)!;
        const effectiveFocus = sourceFocus === "shared-road" && sourceViewpoint?.companion == null ? "inner-life" : sourceFocus;
        const seed = selectStorySeed(sourceMode, sourceIdentity, writingAttempt, { viewpoint: sourceViewpoint, focus: effectiveFocus });
        const continuity = captureCreativeStoryMemory(sourceJob,
          deps.continuity?.({ job: sourceJob, mode: sourceMode, viewpoint: sourceViewpoint }) ?? []);
        const rememberedRecovery = allowRecovery
          ? createFarewellRemembranceVignette(memory, effectiveFocus, sourceIdentity, writingAttempt, sourceViewpoint?.hero.values) : null;
        const victoryRecovery = allowRecovery
          ? createFirstSharedVictoryVignette(victory, effectiveFocus, sourceIdentity, writingAttempt) : null;
        const duetRecovery = allowRecovery
          ? createStoryDuetVignette(victory, effectiveFocus, sourceIdentity, writingAttempt, sourceViewpoint?.hero.values) : null;
        return {
          source: Object.freeze({ ...sourceJob.facts }),
          seed,
          messages: buildCreativeStoryMessages(sourceJob, seed, sourceViewpoint ?? undefined, effectiveFocus, continuity),
          characterAnchor: captureStoryCharacterAnchor(sourceViewpoint, effectiveFocus),
          recalledTexts: continuity.map((entry) => entry.text.replace(/\s+/gu, " ").trim()),
          directionMessages: buildCreativeDirectionMessages(sourceJob, sourceViewpoint ?? undefined, effectiveFocus, previousStage),
          firstVictory: victory,
          recovery: duetRecovery === null ? victoryRecovery ?? rememberedRecovery ?? (allowRecovery
            ? createStoryVignette({ viewpoint: sourceViewpoint, focus: effectiveFocus, identity: sourceIdentity, attempt: writingAttempt }) : null)
            : { text: storyDuetText(duetRecovery.duet), tone: duetRecovery.tone },
          recoveryRemembrance: rememberedRecovery === null ? null : memory,
          recoveryFirstVictory: victoryRecovery === null && duetRecovery === null ? null : victory,
          recoveryDuet: duetRecovery?.duet ?? null,
          recoveryVoiceInspiration: rememberedRecovery?.voiceValue === undefined || memory === null ? null
            : captureStoryVoiceInspiration({ kind: "hero-value", heroName: memory.heroName,
              value: rememberedRecovery.voiceValue, text: rememberedRecovery.text }),
        };
      };
      let prepared = prepare(job, mode, viewpoint, capturedRemembrance, requestedFocus, capturedFirstVictory);
      const milestoneKind = capturedFirstVictory === null ? "farewell-remembrance" : "first-shared-victory";
      const alternative = activeWriter.chooseMoment !== undefined && (capturedRemembrance !== null || capturedFirstVictory !== null)
        && currentMoment !== undefined && currentMoment.job.campaignId === job.campaignId
        && Number.isSafeInteger(currentMoment.job.tick) && currentMoment.job.tick > job.tick
        && currentMoment.job.eventId !== job.eventId ? currentMoment : null;
      const currentDraft = alternative === null ? null
        : prepare(alternative.job, alternative.mode, alternative.viewpoint, null, requestedFocus);
      // Shared road is the player's explicit companion-story priority, not an inferred model preference.
      const focusPriority = requestedFocus === "shared-road" && currentDraft !== null;
      const momentMessages = alternative === null || focusPriority ? null : buildCreativeMomentMessages(alternative.job, job, milestoneKind);
      clearMoment();
      text = null;
      origin = null;
      direction = defaultNarrativeDirection;
      remembrance = null;
      seedTheme = null;
      seedTone = null;
      phase = "writing";
      status = "Directing and writing on this device… Cancel is available.";
      settlement = new Promise<void>((resolve) => { settle = resolve; });
      publish();
      const directAndWrite = () => {
        if (epoch !== writing) return;
        if (!shouldContinue()) { interrupted = true; return; }
        writtenSource = prepared.source;
        if (activeWriter.direct === undefined) return activeWriter.write(prepared.messages);
        const decision = excludedChoice === undefined ? activeWriter.direct(prepared.directionMessages)
          : activeWriter.direct(prepared.directionMessages, { exclude: excludedChoice });
        return decision.then((choice) => {
          // A canceled or replaced request must not start prose after its DM choice settles.
          if (epoch !== writing) return;
          if (!shouldContinue()) { interrupted = true; return; }
          direction = choice === excludedChoice ? defaultNarrativeDirection : directionForChoice(choice);
          return activeWriter.write(prepared.messages);
        });
      };
      void Promise.resolve().then(() => {
        if (epoch !== writing) return;
        if (!shouldContinue()) { interrupted = true; return; }
        if (focusPriority) {
          momentSelection = normalizeCreativeMomentSelection({ choice: "milestone", kind: milestoneKind, origin: "focus" });
          return directAndWrite();
        }
        if (currentDraft === null || momentMessages === null || activeWriter.chooseMoment === undefined) return directAndWrite();
        return activeWriter.chooseMoment(momentMessages).then((choice) => {
          if (epoch !== writing) return;
          if (!shouldContinue()) { interrupted = true; return; }
          const selected = momentForChoice(choice);
          momentSelection = normalizeCreativeMomentSelection(selected === "current"
            ? { choice: "current", origin: "model" }
            : { choice: "milestone", kind: milestoneKind, origin: choice === "2" ? "model" : "default" });
          if (selected === "current") prepared = currentDraft;
          return directAndWrite();
        });
      }).then((output) => {
        if (epoch !== writing) return;
        if (interrupted || !shouldContinue()) {
          direction = defaultNarrativeDirection;
          clearMoment();
          status = "Ready · stories write quietly during play";
          return;
        }
        const cleaned = cleanCreativeStoryOutput(output);
        const lostCharacters = cleaned !== null && !hasStoryCharacterAnchor(cleaned, prepared.characterAnchor);
        const { recovery, recoveryRemembrance, recoveryFirstVictory, recoveryDuet, recoveryVoiceInspiration, seed } = prepared;
        if (cleaned === null || lostCharacters || cleaned === lastModelText || prepared.recalledTexts.includes(cleaned)) {
          status = cleaned === null
            ? "Unusable model draft skipped · waiting for the next story opening"
            : lostCharacters ? "Model draft lost the requested characters · waiting for the next story opening"
              : "Repeated model draft skipped · waiting for the next story opening";
          if (recovery !== null && activeWriter.ready && deps.allowVignette?.() === true) {
            text = recovery.text;
            origin = "authored";
            remembrance = recoveryRemembrance;
            firstVictory = recoveryFirstVictory;
            duet = recoveryDuet === null ? null : captureStoryDuet(recoveryDuet);
            voiceInspiration = recoveryVoiceInspiration;
            seedTheme = recoveryDuet !== null ? "Authored shared-road duet"
              : recoveryFirstVictory !== null ? "Authored first shared victory"
              : recoveryRemembrance === null ? "Authored emotional interlude" : "Authored farewell remembrance";
            seedTone = recovery.tone;
            status = lostCharacters
              ? "Model draft lost the requested characters · an authored interlude is ready instead"
              : "Model draft skipped · an authored interlude is ready instead";
          }
        } else {
          text = cleaned;
          origin = "model";
          firstVictory = prepared.firstVictory;
          lastModelText = cleaned;
          seedTheme = seed.theme;
          seedTone = seed.relationshipFit ?? "neutral";
          status = "Local model prose · creative interpretation, not the game record";
        }
      }).catch(() => {
        if (epoch !== writing) return;
        direction = defaultNarrativeDirection;
        clearMoment();
        status = "Writing stopped. Restore the saved model to try again.";
      }).finally(() => {
        if (epoch !== writing) return;
        phase = activeWriter.ready ? "ready" : "failed";
        finish();
        publish();
      });
      return true;
    },
    stop,
    async remove(): Promise<void> {
      if (removing) return;
      stop("Removing saved creative model…");
      removing = true;
      publish();
      try {
        await deps.removeCachedModel();
        cached = false;
        status = "Creative model removed · other game data is unchanged";
      } catch {
        status = "Could not remove the saved model. Try again.";
      } finally {
        epoch += 1;
        removing = false;
        publish();
      }
    },
    dispose: () => stop("Off"),
  };
}
