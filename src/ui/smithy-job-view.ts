import type { WorldState } from "../core/types";
import { isValidCampaignSmithyJob } from "../depth/smithy-job";

export interface SmithyJobScene {
  readonly phase: "admission" | "stroke" | "result";
  readonly commandId: string;
  readonly tick: number;
  readonly jobId: string;
  readonly heroId: string;
  readonly residentId: string;
  readonly residentName: string;
  readonly residentRole: string;
  readonly smithId: string;
  readonly smithName: string;
  readonly locationName: string;
  readonly strokeCount: number;
  readonly stroke: "tap" | "drive" | null;
  readonly points: number;
  readonly shape: "in-progress" | "unfinished" | "straight" | "bent";
  readonly manaBefore: number;
  readonly manaSpent: number;
  readonly manaAfter: number;
  readonly goldBefore: number;
  readonly goldEarned: number;
  readonly goldAfter: number;
  readonly headline: string;
  readonly detail: string;
  readonly compactDetail: string;
}

/** Admission, rather than a resident's profession or home, establishes the two
 * actual participants at this worksite. Old receipts never replay over town life.
 */
export function projectSmithyJobScene(state: WorldState): SmithyJobScene | null {
  const job = state.depth.smithyJob, source = state.chronicle.at(-1);
  if (job == null || !isValidCampaignSmithyJob(state.depth)
    || state.scene.mode !== "town" || source?.mode !== "town" || source.tick !== state.tick || state.depth.tick !== state.tick
    || state.hero.id !== job.heroId || state.depth.hero.id !== job.heroId || state.depth.hero.resources.health <= 0
    || state.depth.atlas.currentLocationId !== job.locationId || state.depth.atlas.route !== null
    || state.depth.companions.active.length !== 0 || state.depth.combat !== null || state.depth.counterDuel !== null) return null;
  const town = state.depth.towns[job.locationId];
  const location = state.depth.atlas.locations.find(entry => entry.id === job.locationId);
  const smith = town?.buildings.find(entry => entry.id === job.smithId && entry.kind === "smithy");
  const resident = town?.residents.find(entry => entry.id === job.residentId);
  if (location?.kind !== "town" || town === undefined || town.visits < 1 || smith === undefined || resident === undefined
    || resident.name !== job.residentName || resident.homeBuildingId !== smith.id || !smith.residentIds.includes(resident.id)) return null;
  const lastStroke = job.strokes.at(-1), receipt = job.completion ?? lastStroke ?? job.admission;
  const phase = job.completion !== null ? "result" : lastStroke === undefined ? "admission" : "stroke";
  if (receipt.tick !== state.tick || source.commandId !== `${state.campaignId}:${receipt.sourceCommandId}`
    || source.commandType !== (phase === "admission" ? "start-smithy-job" : "smithy-stroke")) return null;
  const manaBefore = lastStroke?.manaBefore ?? job.admission.manaBefore;
  const manaSpent = lastStroke?.manaSpent ?? 0, manaAfter = lastStroke?.manaAfter ?? manaBefore;
  const goldBefore = job.completion?.goldBefore ?? job.admission.goldBefore;
  const goldEarned = job.completion?.goldEarned ?? 0, goldAfter = job.completion?.goldAfter ?? goldBefore;
  if (state.depth.hero.resources.mana !== manaAfter || state.depth.hero.gold !== goldAfter) return null;
  const shape = job.completion?.shape ?? "in-progress", strokeCount = job.strokes.length;
  const points = lastStroke?.pointsAfter ?? 0;
  const headline = phase === "admission" ? "ONE NAIL · 2 GOLD" : phase === "stroke"
    ? `${lastStroke!.stroke === "drive" ? "FOCUSED DRIVE" : "GENTLE TAP"} · 1/2`
    : shape === "straight" ? "STRAIGHT · +2 GOLD" : shape === "bent" ? "BENT · NO PAY" : "UNFINISHED · NO PAY";
  const detail = phase === "admission" ? "Two strokes. Three points make a straight nail."
    : phase === "result" ? job.completion!.line : `${points}/3 points · MP ${manaBefore}→${manaAfter}`;
  return Object.freeze({ phase, commandId: source.commandId, tick: state.tick, jobId: job.jobId,
    heroId: job.heroId, residentId: resident.id, residentName: resident.name, residentRole: resident.role,
    smithId: smith.id, smithName: smith.name, locationName: location.name,
    strokeCount, stroke: lastStroke?.stroke ?? null, points, shape,
    manaBefore, manaSpent, manaAfter, goldBefore, goldEarned, goldAfter, headline, detail,
    compactDetail: phase === "admission" ? "2 STROKES · AIM FOR 3"
      : shape === "straight" ? "A nail, as advertised."
      : shape === "unfinished" ? "The point is still missing." : detail,
  });
}
