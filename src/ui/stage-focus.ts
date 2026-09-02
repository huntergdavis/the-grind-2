export const stageFocusPreferenceKey = "the-grind-2:stage-focus:v1";
export const compactStageFocusQuery = "(max-width: 1024px), (max-height: 560px)";

export type StageChromeMode = "focus" | "panels";

export function parseStageChromeMode(value: string | null): StageChromeMode | null {
  return value === "focus" || value === "panels" ? value : null;
}

export function defaultStageChromeMode(compactViewport: boolean): StageChromeMode {
  return compactViewport ? "focus" : "panels";
}

export function resolveStageChromeMode(
  storedPreference: string | null,
  compactViewport: boolean,
): { readonly mode: StageChromeMode; readonly explicit: boolean } {
  const stored = parseStageChromeMode(storedPreference);
  return stored === null
    ? Object.freeze({ mode: defaultStageChromeMode(compactViewport), explicit: false })
    : Object.freeze({ mode: stored, explicit: true });
}

export function toggledStageChromeMode(mode: StageChromeMode): StageChromeMode {
  return mode === "focus" ? "panels" : "focus";
}

export function shouldOpenCompactPanelsDrawer(
  compactViewport: boolean,
  mode: StageChromeMode,
  activeView: string,
): boolean {
  return compactViewport && mode === "focus" && activeView === "watch";
}
