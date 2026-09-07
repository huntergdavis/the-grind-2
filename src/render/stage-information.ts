/** Hide ordinary analytical canvas chrome only in focused Watch, never an inspection or cutaway layer. */
export function stageInformationVisible(activeView: string | undefined, chromeMode: string | undefined): boolean {
  return activeView !== "watch" || chromeMode !== "focus";
}
