import { isValidAtlasState, orientedEdgePath } from "../depth/atlas";
import { isValidCombatState, monsterDefinition } from "../depth/combat";
import { maximumCompletedCombats } from "../depth/state";
import { isValidEncounterThreatProvenance } from "../depth/threat";
import type { AtlasEdge, AtlasState, CombatState, DepthState } from "../depth/types";

export interface AtlasBattleMemory {
  readonly projectionVersion: "atlas-battle-memory-v1";
  readonly edgeId: string;
  readonly fromLocationId: string;
  readonly destinationLocationId: string;
  readonly fromName: string;
  readonly destinationName: string;
  readonly combatId: string;
  readonly outcome: "victory" | "defeat" | "stalemate";
  readonly speciesNames: readonly string[];
  readonly label: string;
  readonly position: { readonly terrainX: number; readonly terrainY: number };
}

const empty: readonly AtlasBattleMemory[] = Object.freeze([]);

function matchesRecordedRoute(combat: CombatState, atlas: AtlasState): boolean {
  if (combat.threat.rating !== "place-bound" || !combat.id.startsWith("encounter:route:")) return false;
  const path = combat.id.slice("encounter:route:".length).split(">");
  if (path.length < 2 || path.length > atlas.locations.length || new Set(path).size !== path.length
    || path.some((id) => !atlas.locations.some((location) => location.id === id))) return false;
  const { fromLocationId, destinationLocationId } = combat.threat;
  return path.some((from, index) => from === fromLocationId && path[index + 1] === destinationLocationId)
    && path.slice(1).every((to, index) => atlas.edges.some((edge) =>
      (edge.from === path[index] && edge.to === to) || (edge.to === path[index] && edge.from === to)));
}

/** A diagrammatic road midpoint, never an observed creature coordinate. */
function roadMidpoint(atlas: AtlasState, edge: AtlasEdge): AtlasBattleMemory["position"] {
  const { pointIndices, distances } = orientedEdgePath(edge, edge.from);
  const halfway = edge.distance / 2;
  let index = 0;
  while (index < distances.length - 2 && halfway > distances[index + 1]!) index += 1;
  const start = atlas.terrain.points[pointIndices[index]!]!;
  const end = atlas.terrain.points[pointIndices[index + 1]!]!;
  const ratio = (halfway - distances[index]!) / (distances[index + 1]! - distances[index]!);
  return Object.freeze({
    terrainX: Math.round(start.x + (end.x - start.x) * ratio),
    terrainY: Math.round(start.y + (end.y - start.y) * ratio),
  });
}

function projectBattle(combat: CombatState, atlas: AtlasState): AtlasBattleMemory | null {
  if (!isValidCombatState(combat) || combat.outcome === "ongoing" || combat.threat.rating !== "place-bound"
    || !isValidEncounterThreatProvenance(combat.threat, atlas) || !matchesRecordedRoute(combat, atlas)) return null;
  const { edgeId, fromLocationId, destinationLocationId } = combat.threat;
  if (!atlas.discoveredLocationIds.includes(fromLocationId) || !atlas.discoveredLocationIds.includes(destinationLocationId)) return null;
  const edge = atlas.edges.find((candidate) => candidate.id === edgeId)!;
  const fromName = atlas.locations.find((location) => location.id === fromLocationId)!.name;
  const destinationName = atlas.locations.find((location) => location.id === destinationLocationId)!.name;
  const names = combat.combatants.filter((unit) => unit.side === "enemies").map((unit) =>
    unit.speciesId === null ? undefined : monsterDefinition(unit.speciesId)?.name);
  if (names.length === 0 || names.some((name) => name === undefined)) return null;
  const speciesNames = Object.freeze([...new Set(names as string[])].sort());
  const outcome = combat.outcome;
  return Object.freeze({
    projectionVersion: "atlas-battle-memory-v1",
    edgeId, fromLocationId, destinationLocationId, fromName, destinationName,
    combatId: combat.id, outcome, speciesNames,
    label: `Recorded road battle · ${fromName} → ${destinationName} · ${speciesNames.join(", ")} · ${outcome}. Historical record, not current danger.`,
    position: roadMidpoint(atlas, edge),
  });
}

/** Derived only from the existing bounded ring; absence never implies a safe road. */
export function projectAtlasBattleMemory(source: Pick<DepthState, "atlas" | "completedCombats">): readonly AtlasBattleMemory[] {
  try {
    if (source === null || typeof source !== "object" || !Array.isArray(source.completedCombats)
      || source.completedCombats.length > maximumCompletedCombats || !isValidAtlasState(source.atlas)) return empty;
    const byRoad = new Map<string, AtlasBattleMemory>();
    for (const combat of source.completedCombats) {
      let memory: AtlasBattleMemory | null;
      try { memory = projectBattle(combat, source.atlas); } catch { continue; }
      if (memory === null) continue;
      // Reinsert so the final order is the retained completion order, not map ID order.
      byRoad.delete(memory.edgeId);
      byRoad.set(memory.edgeId, memory);
    }
    return Object.freeze([...byRoad.values()]);
  } catch {
    return empty;
  }
}
