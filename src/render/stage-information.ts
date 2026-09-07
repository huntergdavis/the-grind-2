/** Compact Watch and Focus keep analysis in deliberate panels, not over the actors. */
export function stageInformationVisible(
  activeView: string | undefined,
  chromeMode: string | undefined,
  watchLayout?: string,
): boolean {
  return activeView !== "watch" || (chromeMode !== "focus" && watchLayout !== "portraits");
}
