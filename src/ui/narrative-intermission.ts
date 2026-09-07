import "./narrative-intermission.css";
import { narrativeStageLabels, normalizeNarrativeDirection, type NarrativeDirection } from "../narrator/creative-direction";
import { normalizeCreativeMomentSelection, type CreativeMomentSelection } from "../narrator/creative-moment";
import type { FirstSharedVictory } from "../narrator/first-shared-victory";
import { captureStoryDuet, storyDuetText, type StoryDuet } from "../narrator/story-duet";

export type NarrativeInspirationTone = "neutral" | "care" | "trust";
export type NarrativeStoryOrigin = "model" | "authored";

export function narrativeIntermissionStoryOrigin(value: unknown): NarrativeStoryOrigin {
  return value === "authored" ? "authored" : "model";
}

export function narrativeIntermissionAttribution(origin: unknown): string {
  return narrativeIntermissionStoryOrigin(origin) === "authored"
    ? "Authored interlude · imagined interpretation"
    : "Local storyteller · imagined interpretation";
}

export function narrativeIntermissionDirectionAttribution(value: unknown): string | null {
  const direction = normalizeNarrativeDirection(value);
  return direction.origin === "model" ? `Local DM staging · ${narrativeStageLabels[direction.stage]}` : null;
}

export function narrativeIntermissionMomentPresentation(
  location: string,
  value: unknown,
  firstVictory?: Pick<FirstSharedVictory, "kind" | "battle">,
) {
  const selection = normalizeCreativeMomentSelection(value);
  const farewell = selection?.choice === "milestone" && selection.kind === "farewell-remembrance";
  const victory = selection?.choice === "milestone" && selection.kind === "first-shared-victory"
    || selection === null && firstVictory?.kind === "first-shared-victory";
  const title = victory ? "First victory together" : farewell ? "A farewell revisited" : "An earlier moment";
  return Object.freeze({
    caption: location.trim().length > 0 ? `${title} · ${location}` : title,
    attribution: selection?.origin === "focus" ? "Shared road focus prioritized this companion moment."
      : selection?.origin === "model"
      ? victory ? "Local DM chose this recorded first shared victory."
        : farewell ? "Local DM chose this recorded farewell." : "Local DM chose the current recorded moment."
      : null,
  });
}

/** An authored decorative cue, never a report of the characters' emotional state. */
export function narrativeIntermissionInspirationTone(value: unknown): NarrativeInspirationTone {
  return value === "care" || value === "trust" ? value : "neutral";
}

/** Host-bound roles label an exact pair of imagined thoughts, never a differently sourced passage. */
export function narrativeIntermissionVoices(text: string, value: unknown) {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    const duet = value as Partial<StoryDuet>;
    if (duet.kind !== "inner-voices" || duet.hero == null || duet.companion == null
      || ![duet.hero.name, duet.hero.text, duet.companion.name, duet.companion.text]
        .every((field) => typeof field === "string" && field.trim().length > 0)) return null;
    const captured = captureStoryDuet(duet as StoryDuet);
    if (storyDuetText(captured) !== text) return null;
    return Object.freeze([
      Object.freeze({ role: "hero" as const, label: "Hero", ...captured.hero }),
      Object.freeze({ role: "companion" as const, label: "Companion", ...captured.companion }),
    ]);
  } catch {
    return null;
  }
}

export interface NarrativeIntermissionPassage {
  readonly text: string;
  readonly location: string;
  readonly headline: string;
  readonly inspirationTone?: NarrativeInspirationTone;
  readonly origin?: NarrativeStoryOrigin;
  readonly direction?: NarrativeDirection;
  readonly momentSelection?: CreativeMomentSelection;
  readonly firstVictory?: Pick<FirstSharedVictory, "kind" | "battle">;
  readonly duet?: StoryDuet;
  readonly remembrance?: {
    readonly oath: { readonly location: string; readonly headline: string; readonly tick: number };
    readonly farewell: { readonly location: string; readonly headline: string; readonly tick: number };
  };
}

export interface NarrativeRecordedMoment {
  readonly label: string | null;
  readonly location: string | null;
  readonly headline: string;
}

/** Public records explain an authored remembrance without turning imagined prose into canon. */
export function narrativeIntermissionRecordedMoments(
  passage: Pick<NarrativeIntermissionPassage, "headline" | "origin" | "remembrance" | "firstVictory">,
): { readonly summary: string; readonly records: readonly NarrativeRecordedMoment[] } {
  if (passage.origin === "authored" && passage.firstVictory?.kind === "first-shared-victory") {
    const { battle } = passage.firstVictory;
    return Object.freeze({
      summary: "Recorded moment",
      records: Object.freeze([
        Object.freeze({ label: `First shared victory · T${battle.tick}`, location: battle.location, headline: battle.headline }),
      ]),
    });
  }
  if (passage.origin === "authored" && passage.remembrance !== undefined) {
    const { farewell, oath } = passage.remembrance;
    return Object.freeze({
      summary: "Recorded moments",
      records: Object.freeze([
        Object.freeze({ label: `Farewell · T${farewell.tick}`, location: farewell.location, headline: farewell.headline }),
        Object.freeze({ label: `Earlier oath · T${oath.tick}`, location: oath.location, headline: oath.headline }),
      ]),
    });
  }
  return Object.freeze({
    summary: "Recorded moment",
    records: Object.freeze(passage.headline.trim().length === 0
      ? [] : [Object.freeze({ label: null, location: null, headline: passage.headline })]),
  });
}

export type NarrativeIntermissionCloseReason = "finished" | "skipped" | "canceled";

export interface NarrativeIntermissionTiming {
  readonly wordCount: number;
  readonly revealMs: number;
  readonly displayMs: number;
}

export function narrativeIntermissionTiming(text: string): NarrativeIntermissionTiming {
  const wordCount = text.trim().match(/\S+/gu)?.length ?? 0;
  return Object.freeze({
    wordCount,
    revealMs: Math.min(4_000, Math.max(2_000, wordCount * 65)),
    displayMs: Math.min(30_000, Math.max(12_000, Math.ceil(wordCount / 3) * 1_000 + 4_000)),
  });
}

export interface NarrativeIntermissionClock {
  now(): number;
  requestFrame(callback: (time: number) => void): number;
  cancelFrame(handle: number): void;
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
}

/** Isolated timing keeps old frames and timeouts from affecting a later passage. */
export function createNarrativeIntermissionSchedule(
  clock: NarrativeIntermissionClock,
  callbacks: { onReveal(progress: number): void; onFinish(): void },
) {
  let generation = 0;
  let frame: number | null = null;
  let timer: number | null = null;
  const cancel = (): void => {
    generation += 1;
    if (frame !== null) clock.cancelFrame(frame);
    if (timer !== null) clock.clearTimeout(timer);
    frame = null;
    timer = null;
  };
  return {
    start(timing: NarrativeIntermissionTiming, reducedMotion: boolean): void {
      cancel();
      const current = generation;
      const started = clock.now();
      callbacks.onReveal(reducedMotion ? 1 : 0);
      const reveal = (now: number): void => {
        if (generation !== current) return;
        frame = null;
        const progress = Math.min(1, Math.max(0, (now - started) / timing.revealMs));
        callbacks.onReveal(progress);
        if (progress < 1) frame = clock.requestFrame(reveal);
      };
      if (!reducedMotion) frame = clock.requestFrame(reveal);
      timer = clock.setTimeout(() => {
        if (generation !== current) return;
        cancel();
        callbacks.onReveal(1);
        callbacks.onFinish();
      }, timing.displayMs);
    },
    hold(): void {
      cancel();
      callbacks.onReveal(1);
    },
    cancel,
  };
}

let intermissionOrdinal = 0;

export function createNarrativeIntermission(options: {
  readonly onClose: (reason: NarrativeIntermissionCloseReason) => void;
}) {
  const ordinal = ++intermissionOrdinal;
  const id = ordinal === 1 ? "narrative-intermission" : `narrative-intermission-${ordinal}`;
  const dialog = document.createElement("dialog");
  dialog.id = id;
  dialog.className = "narrative-intermission";
  dialog.dataset.inspirationTone = "neutral";
  dialog.dataset.storyOrigin = "model";
  dialog.dataset.storyStage = "parchment";
  dialog.dataset.directionOrigin = "default";
  dialog.dataset.stageStill = "true";
  dialog.setAttribute("aria-labelledby", `${id}-caption`);
  dialog.setAttribute("aria-describedby", `${id}-attribution ${id}-direction ${id}-accessible-prose`);

  const parchment = document.createElement("article");
  parchment.className = "narrative-intermission-parchment";
  const tableau = document.createElement("div");
  tableau.id = `${id}-tableau`;
  tableau.className = "narrative-intermission-tableau";
  tableau.setAttribute("aria-hidden", "true");
  tableau.hidden = true;
  tableau.append(...Array.from({ length: 3 }, () => document.createElement("span")));
  const reading = document.createElement("div");
  reading.id = `${id}-reading`;
  reading.className = "narrative-intermission-reading";
  const caption = document.createElement("h2");
  caption.id = `${id}-caption`;
  caption.className = "narrative-intermission-caption";
  caption.tabIndex = -1;
  caption.setAttribute("autofocus", "");
  const attribution = document.createElement("p");
  attribution.id = `${id}-attribution`;
  attribution.className = "narrative-intermission-attribution";
  attribution.textContent = narrativeIntermissionAttribution("model");
  const directionAttribution = document.createElement("p");
  directionAttribution.id = `${id}-direction`;
  directionAttribution.className = "narrative-intermission-direction";
  directionAttribution.hidden = true;
  const prose = document.createElement("p");
  prose.id = `${id}-prose`;
  prose.className = "narrative-intermission-prose";
  prose.setAttribute("aria-hidden", "true");
  const accessibleText = document.createElement("span");
  accessibleText.id = `${id}-accessible-prose`;
  accessibleText.className = "narrative-intermission-sr-only";
  const ink = document.createElement("span");
  ink.className = "narrative-intermission-ink";
  ink.setAttribute("aria-hidden", "true");
  prose.append(ink);
  const source = document.createElement("details");
  source.id = `${id}-source`;
  source.className = "narrative-intermission-source";
  source.hidden = true;
  const sourceLabel = document.createElement("summary");
  sourceLabel.id = `${id}-source-label`;
  sourceLabel.textContent = "Recorded moment";
  const sourceRecords = document.createElement("div");
  sourceRecords.id = `${id}-source-records`;
  const sourceSelection = document.createElement("p");
  sourceSelection.id = `${id}-moment-selection`;
  sourceSelection.hidden = true;
  source.append(sourceLabel, sourceSelection, sourceRecords);
  reading.append(caption, attribution, directionAttribution, prose, accessibleText, source);

  const footer = document.createElement("footer");
  footer.className = "narrative-intermission-footer";
  const readingStatus = document.createElement("p");
  readingStatus.className = "narrative-intermission-reading-status";
  readingStatus.setAttribute("role", "status");
  const controls = document.createElement("div");
  controls.className = "narrative-intermission-controls";
  const hold = document.createElement("button");
  hold.id = `${id}-hold`;
  hold.type = "button";
  hold.className = "narrative-intermission-hold";
  const skip = document.createElement("button");
  skip.id = `${id}-skip`;
  skip.type = "button";
  skip.textContent = "Skip";
  skip.className = "narrative-intermission-skip";
  controls.append(hold, skip);
  footer.append(readingStatus, controls);
  parchment.append(tableau, reading, footer);
  dialog.append(parchment);
  document.body.append(dialog);

  let active = false;
  let held = false;
  let revealed = 0;
  let words: HTMLSpanElement[] = [];
  const clearSource = (): void => {
    source.open = false;
    source.hidden = true;
    sourceLabel.textContent = "Recorded moment";
    sourceSelection.hidden = true;
    sourceSelection.textContent = "";
    sourceRecords.replaceChildren();
  };
  const finish = (reason: NarrativeIntermissionCloseReason): void => {
    dialog.dataset.inspirationTone = "neutral";
    dialog.dataset.storyOrigin = "model";
    dialog.dataset.storyStage = "parchment";
    dialog.dataset.directionOrigin = "default";
    dialog.dataset.stageStill = "true";
    tableau.hidden = true;
    directionAttribution.hidden = true;
    directionAttribution.textContent = "";
    attribution.textContent = narrativeIntermissionAttribution("model");
    caption.textContent = "An earlier moment";
    clearSource();
    ink.replaceChildren();
    accessibleText.textContent = "";
    words = [];
    revealed = 0;
    if (!active) return;
    active = false;
    schedule.cancel();
    if (dialog.open) dialog.close();
    // Let the browser restore dialog focus; do not force focus from a navigation handler.
    options.onClose(reason);
  };
  const schedule = createNarrativeIntermissionSchedule({
    now: () => performance.now(),
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (handle) => window.cancelAnimationFrame(handle),
    setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimeout: (handle) => window.clearTimeout(handle),
  }, {
    onReveal: (progress) => {
      const count = Math.min(words.length, Math.ceil(words.length * progress));
      while (revealed < count) words[revealed++]!.dataset.visible = "true";
    },
    onFinish: () => finish("finished"),
  });

  const holdForReading = (): void => {
    if (!active || held) return;
    held = true;
    dialog.dataset.stageStill = "true";
    schedule.hold();
    hold.textContent = "Continue";
    readingStatus.textContent = "Take your time · continue when ready";
  };
  hold.addEventListener("click", () => {
    if (!active) return;
    if (held) finish("finished");
    else holdForReading();
  });
  sourceLabel.addEventListener("click", () => {
    // Hold during the activation itself, before a near-deadline timeout or the
    // details element's deferred toggle event can run. Closing never resumes.
    if (!source.open) holdForReading();
  });
  source.addEventListener("toggle", () => {
    if (source.open) holdForReading();
  });
  skip.addEventListener("click", () => finish("skipped"));
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    finish("skipped");
  });
  dialog.addEventListener("close", () => {
    // A close event from an earlier passage must not close a newly opened one.
    if (!dialog.open) finish("skipped");
  });

  return {
    get active(): boolean { return active; },
    show(passage: NarrativeIntermissionPassage, display: { readonly held?: boolean } = {}): void {
      const text = passage.text.trim();
      if (active || text.length === 0) return;
      dialog.dataset.inspirationTone = narrativeIntermissionInspirationTone(passage.inspirationTone);
      dialog.dataset.storyOrigin = narrativeIntermissionStoryOrigin(passage.origin);
      const direction = normalizeNarrativeDirection(passage.direction);
      dialog.dataset.storyStage = direction.stage;
      dialog.dataset.directionOrigin = direction.origin;
      tableau.hidden = direction.stage === "parchment";
      const staging = narrativeIntermissionDirectionAttribution(direction);
      directionAttribution.textContent = staging ?? "";
      directionAttribution.hidden = staging === null;
      attribution.textContent = narrativeIntermissionAttribution(passage.origin);
      held = false;
      revealed = 0;
      const moment = narrativeIntermissionMomentPresentation(passage.location, passage.momentSelection, passage.firstVictory);
      caption.textContent = moment.caption;
      sourceSelection.textContent = moment.attribution ?? "";
      sourceSelection.hidden = moment.attribution === null;
      const recorded = narrativeIntermissionRecordedMoments(passage);
      sourceLabel.textContent = recorded.summary;
      sourceRecords.replaceChildren(...recorded.records.map((record) => {
        const container = document.createElement("div");
        container.className = "narrative-intermission-record";
        if (record.label !== null) {
          const label = document.createElement("strong");
          label.className = "narrative-intermission-record-label";
          label.textContent = record.label;
          container.append(label);
        }
        if (record.location !== null && record.location.trim().length > 0) {
          const location = document.createElement("p");
          location.className = "narrative-intermission-record-location";
          location.textContent = record.location;
          container.append(location);
        }
        const headline = document.createElement("p");
        headline.className = "narrative-intermission-record-headline";
        headline.textContent = record.headline;
        container.append(headline);
        return container;
      }));
      source.hidden = recorded.records.length === 0;
      source.open = false;
      const makeWords = (thought: string) => (thought.match(/\S+\s*/gu) ?? []).map((word) => {
        const span = document.createElement("span");
        span.className = "narrative-intermission-word";
        span.textContent = word;
        return span;
      });
      const voices = narrativeIntermissionVoices(passage.text, passage.duet);
      if (voices === null) {
        accessibleText.textContent = text;
        words = makeWords(text);
        ink.replaceChildren(...words);
      } else {
        accessibleText.textContent = voices.map((voice) => `${voice.label} · ${voice.name}\n${voice.text}`).join("\n\n");
        words = [];
        ink.replaceChildren(...voices.map((voice) => {
          const section = document.createElement("span");
          section.className = "narrative-intermission-voice";
          section.dataset.voiceRole = voice.role;
          const label = document.createElement("span");
          label.className = "narrative-intermission-voice-label";
          label.textContent = `${voice.label} · ${voice.name}`;
          const thought = document.createElement("span");
          thought.className = "narrative-intermission-voice-thought";
          const thoughtWords = makeWords(voice.text);
          words.push(...thoughtWords);
          thought.append(...thoughtWords);
          section.append(label, thought);
          return section;
        }));
      }
      hold.textContent = "Hold to read";
      const timing = narrativeIntermissionTiming(text);
      readingStatus.textContent = `Continues in about ${Math.ceil(timing.displayMs / 1_000)} seconds · hold to linger`;
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      dialog.dataset.stageStill = String(display.held === true || reducedMotion);
      dialog.showModal();
      active = true;
      reading.scrollTop = 0;
      if (display.held === true) holdForReading();
      else schedule.start(timing, reducedMotion);
    },
    close(): void { finish("canceled"); },
  };
}
