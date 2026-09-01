import type { TownItineraryPacketV1 } from "../ui/town-itinerary";

export type TownItineraryCutawayPhase =
  | "arrival"
  | "district"
  | "route"
  | "encounter"
  | "consequence"
  | "settled"
  | "static";

export interface TownItineraryCutawayFrame {
  readonly phase: TownItineraryCutawayPhase;
  readonly heroX: number;
  readonly heroY: number;
  readonly routeProgress: number;
  readonly districtAlpha: number;
  readonly routeAlpha: number;
  readonly buildingHighlightAlpha: number;
  readonly residentAlpha: number;
  readonly consequenceAlpha: number;
}

export const townItineraryDurationSeconds = 6.4;
export const townItineraryStaticHoldSeconds = 1.2;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function range(value: number, start: number, end: number): number {
  return clampUnit((value - start) / (end - start));
}

function completeFrame(phase: "static" | "settled"): TownItineraryCutawayFrame {
  return {
    phase,
    heroX: 207,
    heroY: 137,
    routeProgress: 1,
    districtAlpha: 1,
    routeAlpha: 1,
    buildingHighlightAlpha: 1,
    residentAlpha: 1,
    consequenceAlpha: 1,
  };
}

export function projectTownItineraryCutawayFrame(
  _packet: TownItineraryPacketV1,
  elapsedSeconds: number,
  reducedMotion: boolean,
  forceOutcome = false,
): TownItineraryCutawayFrame {
  if (reducedMotion || forceOutcome) return completeFrame("static");
  const progress = clampUnit(elapsedSeconds / townItineraryDurationSeconds);
  if (progress >= 1) return completeFrame("settled");
  const phase: TownItineraryCutawayPhase = progress < 0.18
    ? "arrival"
    : progress < 0.36
      ? "district"
      : progress < 0.68
        ? "route"
        : progress < 0.86
          ? "encounter"
          : "consequence";
  const routeProgress = range(progress, 0.28, 0.7);
  return {
    phase,
    heroX: 33 + routeProgress * 174,
    heroY: 137 - Math.sin(routeProgress * Math.PI) * 7,
    routeProgress,
    districtAlpha: range(progress, 0.12, 0.3),
    routeAlpha: range(progress, 0.24, 0.42),
    buildingHighlightAlpha: range(progress, 0.56, 0.72),
    residentAlpha: range(progress, 0.66, 0.8),
    consequenceAlpha: range(progress, 0.82, 0.94),
  };
}
