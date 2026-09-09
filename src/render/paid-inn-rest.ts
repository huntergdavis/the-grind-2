import type { WorldState } from "../core/types";

/** Read the completed stop, not current eligibility (rest has already restored mana). */
export function projectPaidInnRestScene(state: WorldState): { innId: string; innName: string; receipt: string } | null {
  const entry = state.chronicle.at(-1);
  const town = state.depth.towns[state.depth.atlas.currentLocationId];
  if (state.scene.mode !== "town" || entry?.mode !== "town" || entry.tick !== state.tick
    || entry.commandType !== "wait" || town === undefined) return null;
  const inn = town.buildings.find((building) => building.kind === "inn"
    && entry.commandId === `${state.campaignId}:depth:${state.depth.tick}:town:${town.locationId}:inn-rest:${building.id}`
    && town.districts.some((district) => district.id === building.districtId && district.buildingIds.includes(building.id)));
  return inn === undefined ? null : { innId: inn.id, innName: inn.name, receipt: entry.consequence };
}
