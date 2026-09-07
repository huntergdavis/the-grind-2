export type PlayMode = "deterministic" | "llm";

export const playModePreferenceKey = "the-grind-2:play-mode:v1";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

function isPlayMode(value: unknown): value is PlayMode {
  return value === "deterministic" || value === "llm";
}

/** Read only the explicit play-mode choice; missing legacy choices require a fresh decision. */
export function readPlayModePreference(
  getStorage: () => PreferenceStorage = () => localStorage,
): PlayMode | null {
  try {
    const value: unknown = JSON.parse(getStorage().getItem(playModePreferenceKey) ?? "null");
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    const input = value as Record<string, unknown>;
    if (Object.keys(input).length !== 2 || input.schemaVersion !== 1 || !isPlayMode(input.mode)) return null;
    return input.mode;
  } catch {
    return null;
  }
}

/** Remember the choice only; activation and verified-cache restoration belong to the host. */
export function writePlayModePreference(
  mode: PlayMode,
  getStorage: () => PreferenceStorage = () => localStorage,
): void {
  if (!isPlayMode(mode)) return;
  try {
    getStorage().setItem(playModePreferenceKey, JSON.stringify({ schemaVersion: 1, mode }));
  } catch {
    // An explicit choice still applies to this page when storage is blocked or full.
  }
}

/** `cached` means the host verified a complete cache for the current writer, not merely saved files. */
export function planPlayStartup({ mode, fresh, cached }: {
  readonly mode: PlayMode | null;
  readonly fresh: boolean;
  readonly cached: boolean;
}): "choose" | "deterministic" | "restore" {
  if (fresh || mode === null) return "choose";
  if (mode === "deterministic") return "deterministic";
  return mode === "llm" && cached ? "restore" : "choose";
}
