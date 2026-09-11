import type { WorldState } from "../core/types";
import { innBluffClaim, innBluffTellText, isValidCampaignInnBluff } from "../depth/inn-bluff";

interface InnBluffSceneBase {
  readonly bluffId: string;
  readonly commandId: string;
  readonly tick: number;
  readonly heroId: string;
  readonly residentId: string;
  readonly residentName: string;
  readonly residentRole: string;
  readonly innId: string;
  readonly innName: string;
  readonly locationName: string;
  readonly claim: string;
  readonly tell: "fidgeting" | "steady";
  readonly tellText: string;
  readonly goldBefore: number;
  readonly goldSpent: number;
  readonly goldReturned: number;
  readonly goldAfter: number;
  readonly headline: string;
  readonly detail: string;
  readonly compactDetail: string;
}

/** Admission deliberately has no face, truth, resolution or outcome property,
 * not even a null placeholder. Private canonical state never reaches drawing.
 */
export type InnBluffScene = InnBluffSceneBase & ({ readonly phase: "admission" } | {
  readonly phase: "result";
  readonly choice: "challenge" | "decline";
  readonly revealedFace: number;
  readonly outcome: "exposed-bluff" | "honest-claim" | "declined";
  readonly line: string;
});

export function projectInnBluffScene(state: WorldState): InnBluffScene | null {
  const bluff = state.depth.innBluff, source = state.chronicle.at(-1);
  if (bluff == null || !isValidCampaignInnBluff(state.depth)
    || state.scene.mode !== "town" || source?.mode !== "town" || source.tick !== state.tick || state.depth.tick !== state.tick
    || state.hero.id !== bluff.heroId || state.depth.hero.id !== bluff.heroId || state.depth.hero.resources.health <= 0
    || state.depth.atlas.currentLocationId !== bluff.locationId || state.depth.atlas.route !== null
    || state.depth.companions.active.length !== 0 || state.depth.combat !== null || state.depth.counterDuel !== null) return null;
  const town = state.depth.towns[bluff.locationId];
  const location = state.depth.atlas.locations.find(entry => entry.id === bluff.locationId);
  const inn = town?.buildings.find(entry => entry.id === bluff.innId && entry.kind === "inn");
  const resident = town?.residents.find(entry => entry.id === bluff.residentId);
  if (location?.kind !== "town" || town === undefined || town.visits < 1 || inn === undefined || resident === undefined
    || resident.name !== bluff.residentName || resident.homeBuildingId !== inn.id || !inn.residentIds.includes(resident.id)) return null;
  const resolution = bluff.resolution, receipt = resolution ?? bluff.admission;
  if (receipt.tick !== state.tick || source.commandId !== `${state.campaignId}:${receipt.sourceCommandId}`
    || source.commandType !== (resolution === null ? "start-inn-bluff" : "resolve-inn-bluff")) return null;
  const goldBefore = resolution?.goldBefore ?? bluff.admission.goldBefore;
  const goldAfter = resolution?.goldAfter ?? goldBefore;
  if (state.depth.hero.gold !== goldAfter) return null;
  const shared = { bluffId: bluff.bluffId, commandId: source.commandId, tick: state.tick, heroId: bluff.heroId,
    residentId: resident.id, residentName: resident.name, residentRole: resident.role,
    innId: inn.id, innName: inn.name, locationName: location.name, claim: innBluffClaim,
    tell: bluff.admission.tell, tellText: innBluffTellText(bluff.admission.tell),
    goldBefore, goldSpent: resolution?.goldSpent ?? 0, goldReturned: resolution?.goldReturned ?? 0, goldAfter };
  if (resolution === null) return Object.freeze({ ...shared, phase: "admission",
    headline: "THE CUP CLAIMS 4+",
    detail: `${bluff.admission.tell === "fidgeting" ? "Fidgeting" : "Steady hand"} · challenge 1 gold; decline free.`,
    compactDetail: `${bluff.admission.tell === "fidgeting" ? "FIDGETING" : "STEADY"} · BET 1 / PASS FREE`,
  });
  return Object.freeze({ ...shared, phase: "result", choice: resolution.choice, revealedFace: resolution.revealedFace,
    outcome: resolution.outcome, line: resolution.line,
    headline: resolution.outcome === "exposed-bluff" ? "BLUFF EXPOSED · +1 GOLD"
      : resolution.outcome === "honest-claim" ? "HONEST CLAIM · −1 GOLD" : "NO BET · NO GOLD SPENT",
    detail: resolution.line,
    compactDetail: resolution.outcome === "exposed-bluff" ? "The cup was exaggerating."
      : resolution.outcome === "honest-claim" ? "The explanation cost gold." : "No investment in the cup.",
  });
}
