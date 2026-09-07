import "./narrative-intermission.css";

export type NarrativeInspirationTone = "neutral" | "care" | "trust";

/** An authored decorative cue, never a report of the characters' emotional state. */
export function narrativeIntermissionInspirationTone(value: unknown): NarrativeInspirationTone {
  return value === "care" || value === "trust" ? value : "neutral";
}

export interface NarrativeIntermissionPassage {
  readonly text: string;
  readonly location: string;
  readonly headline: string;
  readonly inspirationTone?: NarrativeInspirationTone;
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
  dialog.setAttribute("aria-labelledby", `${id}-caption`);
  dialog.setAttribute("aria-describedby", `${id}-attribution ${id}-accessible-prose`);

  const parchment = document.createElement("article");
  parchment.className = "narrative-intermission-parchment";
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
  attribution.textContent = "Local storyteller · imagined interpretation";
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
  source.className = "narrative-intermission-source";
  const sourceLabel = document.createElement("summary");
  sourceLabel.textContent = "Recorded moment";
  const headline = document.createElement("p");
  source.append(sourceLabel, headline);
  reading.append(caption, attribution, prose, accessibleText, source);

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
  parchment.append(reading, footer);
  dialog.append(parchment);
  document.body.append(dialog);

  let active = false;
  let held = false;
  let revealed = 0;
  let words: HTMLSpanElement[] = [];
  const finish = (reason: NarrativeIntermissionCloseReason): void => {
    dialog.dataset.inspirationTone = "neutral";
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

  hold.addEventListener("click", () => {
    if (!active) return;
    if (held) {
      finish("finished");
      return;
    }
    held = true;
    schedule.hold();
    hold.textContent = "Continue";
    readingStatus.textContent = "Take your time · continue when ready";
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
    show(passage: NarrativeIntermissionPassage): void {
      const text = passage.text.trim();
      if (active || text.length === 0) return;
      dialog.dataset.inspirationTone = narrativeIntermissionInspirationTone(passage.inspirationTone);
      held = false;
      revealed = 0;
      caption.textContent = passage.location.trim().length > 0
        ? `An earlier moment · ${passage.location}` : "An earlier moment";
      headline.textContent = passage.headline;
      source.hidden = passage.headline.trim().length === 0;
      source.open = false;
      accessibleText.textContent = text;
      words = (text.match(/\S+\s*/gu) ?? []).map((word) => {
        const span = document.createElement("span");
        span.className = "narrative-intermission-word";
        span.textContent = word;
        return span;
      });
      ink.replaceChildren(...words);
      hold.textContent = "Hold to read";
      const timing = narrativeIntermissionTiming(text);
      readingStatus.textContent = `Continues in about ${Math.ceil(timing.displayMs / 1_000)} seconds · hold to linger`;
      dialog.showModal();
      active = true;
      reading.scrollTop = 0;
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      schedule.start(timing, reducedMotion);
    },
    close(): void { finish("canceled"); },
  };
}
