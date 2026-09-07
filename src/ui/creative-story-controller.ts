import type { SceneMode } from "../core/types";
import type { CreativeWriterMessage } from "../narrator/creative-writer-client";
import {
  buildCreativeStoryMessages,
  cleanCreativeStoryOutput,
  selectStorySeed,
  type CreativeStoryFocus,
  type CreativeStoryInspirationTone,
  type CreativeStoryViewpoint,
} from "../narrator/creative-story";
import type { StoryBeatJobV1 } from "../narrator/story-beat";

export interface CreativeStoryWriter {
  readonly ready: boolean;
  load(progress: (message: string) => void): Promise<void>;
  write(messages: readonly CreativeWriterMessage[]): Promise<string>;
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
  readonly seedTheme: string | null;
  readonly seedTone: CreativeStoryInspirationTone | null;
  readonly focus: CreativeStoryFocus;
  readonly relationshipAvailable: boolean;
}

interface Dependencies {
  createWriter(): CreativeStoryWriter;
  hasCachedModel(): Promise<boolean>;
  removeCachedModel(): Promise<void>;
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
    status, source: job?.facts ?? null, text, seedTheme, seedTone,
    focus, relationshipAvailable: viewpoint?.companion != null,
  });
  const publish = () => deps.onChange(snapshot());
  const finish = () => { settle?.(); settle = null; };
  const stop = (message = "Off · any saved files kept on this device") => {
    epoch += 1;
    writer?.dispose();
    writer = null;
    phase = "off";
    status = message;
    text = null;
    seedTheme = null;
    seedTone = null;
    finish();
    publish();
  };

  return {
    get snapshot() { return snapshot(); },
    currentWriteIdentity: () => job === null ? null : JSON.stringify([identity(job), mode, viewpointKey, focus]),
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
    sync(next: { job: StoryBeatJobV1 | null; mode: SceneMode; eligible: boolean; viewpoint?: CreativeStoryViewpoint | null }): void {
      const nextViewpointKey = JSON.stringify(next.viewpoint ?? null);
      const changed = identity(job) !== identity(next.job) || mode !== next.mode || viewpointKey !== nextViewpointKey;
      const wasEligible = eligible;
      job = next.job;
      mode = next.mode;
      viewpoint = next.viewpoint ?? null;
      viewpointKey = nextViewpointKey;
      if (focus === "shared-road" && viewpoint?.companion == null) focus = "inner-life";
      eligible = next.eligible;
      if (phase === "writing" && (changed || !eligible)) {
        stop("Writing canceled because the scene or view changed. Restore the saved model to retry.");
        return;
      }
      if (changed) {
        text = null;
        seedTheme = null;
        seedTone = null;
        attempt = 0;
        if (phase === "ready") status = "Ready · choose Tell this scene in Chronicle";
      }
      if (changed || wasEligible !== eligible) publish();
    },
    setFocus(next: string): boolean {
      if (phase === "loading" || phase === "writing" || removing
        || !["inner-life", "shared-road", "scene"].includes(next)
        || (next === "shared-road" && viewpoint?.companion == null)) return false;
      if (next === focus) return true;
      focus = next as CreativeStoryFocus;
      text = null;
      seedTheme = null;
      seedTone = null;
      attempt = 0;
      if (phase === "ready") status = "Story focus changed · choose Tell this scene";
      publish();
      return true;
    },
    async load(): Promise<void> {
      if (phase === "loading" || phase === "writing" || phase === "ready" || removing) return;
      const loading = ++epoch;
      phase = "loading";
      status = cached ? "Restoring saved model…" : "Loading creative writer…";
      publish();
      try {
        writer = deps.createWriter();
        await writer.load((message) => {
          if (epoch !== loading) return;
          status = message;
          publish();
        });
        if (epoch !== loading) return;
        const found = await deps.hasCachedModel().catch(() => false);
        if (epoch !== loading) return;
        cached = found;
        phase = "ready";
        status = cached
          ? "Ready · choose Tell this scene in Chronicle"
          : "Ready for this session · browser did not keep a complete saved model";
        publish();
      } catch {
        if (epoch !== loading) return;
        writer?.dispose();
        writer = null;
        phase = "failed";
        status = "Could not load the creative writer. Retry uses any saved files.";
        publish();
      }
    },
    write(): boolean {
      if (phase !== "ready" || !writer?.ready || !eligible || job === null) return false;
      const writing = ++epoch;
      const activeWriter = writer;
      const seed = selectStorySeed(mode, identity(job)!, attempt++, { viewpoint, focus });
      const messages = buildCreativeStoryMessages(job, seed, viewpoint ?? undefined, focus);
      phase = "writing";
      status = "Writing on this device… may take about a minute. Cancel is available.";
      settlement = new Promise<void>((resolve) => { settle = resolve; });
      publish();
      void Promise.resolve().then(() => activeWriter.write(messages)).then((output) => {
        if (epoch !== writing) return;
        const cleaned = cleanCreativeStoryOutput(output);
        if (cleaned === null || cleaned === text) {
          status = cleaned === null
            ? "The model returned an unfinished or unusable draft. Try another idea."
            : "The model repeated its draft. Try another idea.";
        } else {
          text = cleaned;
          seedTheme = seed.theme;
          seedTone = seed.relationshipFit ?? "neutral";
          status = "Local model prose · creative interpretation, not the game record";
        }
      }).catch(() => {
        if (epoch !== writing) return;
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
