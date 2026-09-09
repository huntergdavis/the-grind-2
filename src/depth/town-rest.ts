import type { DepthState } from "./types";

export const paidInnRestGoldCost = 5;

export interface PaidInnRestPlan {
  readonly locationId: string;
  readonly townId: string;
  readonly townName: string;
  readonly innId: string;
  readonly innName: string;
  readonly goldBefore: number;
  readonly goldSpent: typeof paidInnRestGoldCost;
  readonly goldAfter: number;
  readonly healthBefore: number;
  readonly healthAfter: number;
  readonly manaBefore: number;
  readonly manaAfter: number;
}

/** One affordable refuge stop for a fit solo hero whose mana is running low. */
export function selectPaidInnRest(state: DepthState): PaidInnRestPlan | null {
  if (
    state.quest.status !== "active" || state.pendingQuestReward !== null ||
    state.companions.active.length > 0 || state.atlas.route !== null ||
    state.combat !== null || state.counterDuel !== null ||
    (state.dungeon !== null && !state.dungeon.completed)
  ) return null;

  const { health, maxHealth, mana, maxMana } = state.hero.resources;
  const gold = state.hero.gold;
  if (
    ![health, maxHealth, mana, maxMana, gold].every(Number.isSafeInteger) ||
    maxHealth < 1 || maxMana < 1 || mana < 0 ||
    health <= Math.floor(maxHealth / 2) || health > maxHealth ||
    mana > Math.floor(maxMana / 3) || mana >= maxMana || gold < paidInnRestGoldCost
  ) return null;

  const location = state.atlas.locations.find((candidate) => candidate.id === state.atlas.currentLocationId);
  if (location?.kind !== "town" || !state.atlas.discoveredLocationIds.includes(location.id)) return null;
  const town = state.towns[location.id];
  if (town === undefined || town.locationId !== location.id || !Number.isSafeInteger(town.visits) || town.visits < 1) return null;
  const inn = town.buildings
    .filter((building) => building.kind === "inn" && town.districts.some((district) =>
      district.id === building.districtId && district.buildingIds.includes(building.id)))
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)[0];
  if (inn === undefined) return null;

  return Object.freeze({
    locationId: location.id,
    townId: town.id,
    townName: town.name,
    innId: inn.id,
    innName: inn.name,
    goldBefore: gold,
    goldSpent: paidInnRestGoldCost,
    goldAfter: gold - paidInnRestGoldCost,
    healthBefore: health,
    healthAfter: maxHealth,
    manaBefore: mana,
    manaAfter: maxMana,
  });
}
