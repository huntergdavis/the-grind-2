import { planPlayStartup, type PlayMode } from "./play-mode-preferences";

interface PlayModeStartupDependencies {
  readonly readMode: () => PlayMode | null;
  readonly writeMode: (mode: PlayMode) => void;
  readonly hasCachedModel: () => Promise<boolean>;
  readonly applyMode: (mode: PlayMode, cacheOnly?: boolean) => void;
  readonly showChoice: (cached: boolean) => void;
  readonly onHold: (held: boolean) => void;
  readonly cacheCheckTimeoutMs?: number;
}

/** Coordinates consent and a bounded cache check only; the host owns UI, pause and writer activation. */
export function createPlayModeStartup(deps: PlayModeStartupDependencies) {
  let epoch = 0;
  let pendingCheck: { readonly finish: (cached: boolean) => void } | null = null;
  const configuredTimeout = deps.cacheCheckTimeoutMs ?? 2_000;
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 0 ? configuredTimeout : 2_000;

  const invalidate = (): number => {
    epoch += 1;
    const previous = pendingCheck;
    pendingCheck = null;
    previous?.finish(false);
    return epoch;
  };

  const checkCache = (): Promise<boolean> => new Promise((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const check = {
      finish(cached: boolean): void {
        if (settled) return;
        settled = true;
        if (timeout !== undefined) clearTimeout(timeout);
        if (pendingCheck === check) pendingCheck = null;
        resolve(cached === true);
      },
    };
    pendingCheck = check;
    timeout = setTimeout(() => check.finish(false), timeoutMs);
    try {
      void deps.hasCachedModel().then((cached) => check.finish(cached), () => check.finish(false));
    } catch {
      check.finish(false);
    }
  });

  const apply = (mode: PlayMode, generation: number, cacheOnly = false): void => {
    if (epoch !== generation) return;
    try {
      if (cacheOnly) deps.applyMode(mode, true);
      else deps.applyMode(mode);
    } finally {
      // A re-entrant callback may have started a newer hold; leave that owner alone.
      if (epoch === generation) deps.onHold(false);
    }
  };

  return {
    async start(fresh: boolean): Promise<void> {
      const generation = invalidate();
      deps.onHold(true);
      if (epoch !== generation) return;
      let mode: PlayMode | null;
      try { mode = deps.readMode(); } catch { mode = null; }
      if (epoch !== generation) return;
      if (!fresh && mode === "deterministic") {
        apply("deterministic", generation);
        return;
      }
      const cached = await checkCache();
      if (epoch !== generation) return;
      const plan = planPlayStartup({ mode, fresh, cached });
      if (plan === "choose") {
        deps.showChoice(cached);
        return; // The choice UI keeps the hold until choose() or cancel().
      }
      apply(plan === "restore" ? "llm" : "deterministic", generation, plan === "restore");
    },
    choose(mode: PlayMode): void {
      if (mode !== "llm" && mode !== "deterministic") return;
      const generation = invalidate();
      try { deps.writeMode(mode); } catch { /* An explicit choice still works if persistence fails. */ }
      apply(mode, generation);
    },
    cancel(): void {
      invalidate();
      deps.onHold(false);
    },
  };
}
