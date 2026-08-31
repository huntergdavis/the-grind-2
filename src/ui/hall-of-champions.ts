import { isValidChampionInduction } from "../core/champions";
import type { ChampionInduction } from "../core/types";

export const maximumHallChampionCards = 64;

export interface HallOfChampionsProjection {
  totalCount: number;
  earnedCount: number;
  adoptedCount: number;
  hiddenCount: number;
  champions: readonly ChampionInduction[];
}

function compareChampions(left: ChampionInduction, right: ChampionInduction): number {
  return right.recordedTick - left.recordedTick ||
    (left.heroName < right.heroName ? -1 : left.heroName > right.heroName ? 1 : 0) ||
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

export function projectHallOfChampions(values: readonly unknown[]): HallOfChampionsProjection {
  const unique = new Map<string, ChampionInduction>();
  for (const value of values) {
    if (isValidChampionInduction(value) && !unique.has(value.id)) unique.set(value.id, value);
  }
  const all = [...unique.values()].sort(compareChampions);
  const champions = all.slice(0, maximumHallChampionCards);
  return {
    totalCount: all.length,
    earnedCount: all.filter((record) => record.qualification === "earned").length,
    adoptedCount: all.filter((record) => record.qualification === "adopted").length,
    hiddenCount: Math.max(0, all.length - champions.length),
    champions,
  };
}
