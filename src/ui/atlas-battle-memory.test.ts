import { describe, expect, it } from "vitest";
import { advanceWorld, createWorld, upgradeWorldState } from "../core/simulation";
import type { WorldState } from "../core/types";
import { isValidAtlasState } from "../depth/atlas";
import { createCombat, isValidCombatState, legalCombatActions, monsterDefinition, resolveCombatTurn } from "../depth/combat";
import { maximumCompletedCombats } from "../depth/state";
import type { AtlasEdge, CombatState, DepthState } from "../depth/types";
import { projectAtlasBattleMemory } from "./atlas-battle-memory";

let natural: WorldState | undefined;
function realWorld(): WorldState {
  if (natural !== undefined) return natural;
  let world = createWorld("golden:1", "campaign:1");
  for (let tick = 0; tick < 80; tick += 1) {
    world = advanceWorld(world);
    if (world.depth.completedCombats.some((combat) => combat.threat.rating === "place-bound"
      && world.depth.atlas.discoveredLocationIds.includes(combat.threat.fromLocationId)
      && world.depth.atlas.discoveredLocationIds.includes(combat.threat.destinationLocationId))) {
      natural = world;
      return world;
    }
  }
  throw new Error("The bounded natural route fixture did not reach a known completed road");
}

function source(): Pick<DepthState, "atlas" | "completedCombats"> {
  const world = realWorld();
  return { atlas: world.depth.atlas, completedCombats: world.depth.completedCombats };
}

function battleForRoad(edge: AtlasEdge, seed: string, initialHealth?: number): CombatState {
  const world = realWorld();
  const destination = world.depth.atlas.locations.find((location) => location.id === edge.to)!;
  const hero = initialHealth === undefined ? world.depth.hero : {
    ...world.depth.hero, resources: { ...world.depth.hero.resources, health: initialHealth },
  };
  let combat = createCombat(seed, hero, `encounter:route:${edge.from}>${edge.to}`, 1, [], {
    edgeId: edge.id, fromLocationId: edge.from, destinationLocationId: edge.to,
    placeDanger: destination.danger, questLeadId: null, questInstanceId: null, questModifier: 0,
  });
  for (let turn = 0; turn < 128 && combat.outcome === "ongoing"; turn += 1) {
    combat = resolveCombatTurn(combat, legalCombatActions(combat)[0]!, seed);
  }
  expect(isValidCombatState(combat)).toBe(true);
  expect(combat.outcome).not.toBe("ongoing");
  return combat;
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

describe("recorded road-battle memory", () => {
  it("projects a natural completed journey and survives exact saved reload without changing state", () => {
    const world = realWorld();
    const saved = JSON.stringify(world);
    const memories = projectAtlasBattleMemory(freezeDeep(world.depth));
    expect(memories.length).toBeGreaterThan(0);
    for (const memory of memories) {
      const combat = world.depth.completedCombats.find((entry) => entry.id === memory.combatId)!;
      expect(memory.outcome).toBe(combat.outcome);
      expect(memory.speciesNames).toEqual([...new Set(combat.combatants.filter((unit) => unit.side === "enemies")
        .map((unit) => monsterDefinition(unit.speciesId!)!.name))].sort());
      expect(memory.label).toContain("Recorded road battle");
      expect(memory.label).toContain("Historical record, not current danger.");
      expect(Object.keys(memory).sort()).toEqual(["projectionVersion", "edgeId", "fromLocationId", "destinationLocationId",
        "fromName", "destinationName", "combatId", "outcome", "speciesNames", "label", "position"].sort());
      expect(Object.isFrozen(memory)).toBe(true);
      expect(Object.isFrozen(memory.speciesNames)).toBe(true);
      expect(Object.isFrozen(memory.position)).toBe(true);
    }
    expect(Object.isFrozen(memories)).toBe(true);
    expect(JSON.stringify(world)).toBe(saved);
    expect(projectAtlasBattleMemory(upgradeWorldState(JSON.parse(saved)).depth)).toEqual(memories);
  });

  it("places a diagrammatic marker halfway along the recorded known road, not at the hero", () => {
    const projected = projectAtlasBattleMemory(source())[0]!;
    const atlas = source().atlas;
    const edge = atlas.edges.find((entry) => entry.id === projected.edgeId)!;
    const midpoint = edge.distance / 2;
    const index = edge.pathDistances.findIndex((distance, slot) => slot > 0 && distance >= midpoint) - 1;
    const a = atlas.terrain.points[edge.pathPointIndices[index]!]!;
    const b = atlas.terrain.points[edge.pathPointIndices[index + 1]!]!;
    const fraction = (midpoint - edge.pathDistances[index]!) / (edge.pathDistances[index + 1]! - edge.pathDistances[index]!);
    expect(projected.position).toEqual({ terrainX: Math.round(a.x + (b.x - a.x) * fraction), terrainY: Math.round(a.y + (b.y - a.y) * fraction) });
  });

  it("omits hidden roads even when a retained battle knows their endpoints", () => {
    const original = source();
    const memory = projectAtlasBattleMemory(original)[0]!;
    const atlas = { ...original.atlas, route: null, currentLocationId: memory.fromLocationId,
      discoveredLocationIds: [memory.fromLocationId] };
    expect(isValidAtlasState(atlas)).toBe(true);
    expect(projectAtlasBattleMemory({ ...original, atlas })).toEqual([]);
  });

  it("chooses the latest retained completion per road and removes records when the source ring drops them", () => {
    const original = source();
    const memory = projectAtlasBattleMemory(original)[0]!;
    const edge = original.atlas.edges.find((entry) => entry.id === memory.edgeId)!;
    const first = original.completedCombats.find((combat) => combat.id === memory.combatId)!;
    const later = battleForRoad(edge, "road-memory-later", 1);
    const result = projectAtlasBattleMemory({ ...original, completedCombats: [first, later, later] });
    expect(result).toHaveLength(1);
    expect(result[0]?.combatId).toBe(later.id);
    expect(result[0]?.outcome).toBe(later.outcome);
    expect(result[0]?.speciesNames).toEqual(later.combatants.filter((unit) => unit.side === "enemies")
      .map((unit) => monsterDefinition(unit.speciesId!)!.name));
    expect(projectAtlasBattleMemory({ ...original, completedCombats: [] })).toEqual([]);
    expect(projectAtlasBattleMemory({ ...original, completedCombats: Array(maximumCompletedCombats + 1).fill(first) })).toEqual([]);
  });

  it("omits legacy-unrated, unfinished, unknown-species and unbound route/profile sources", () => {
    const original = source();
    const combat = original.completedCombats[0]!;
    if (combat.threat.rating !== "place-bound") throw new Error("A rated natural combat is required");
    // Rebase event references too: this remains a valid combat, but its recorded
    // route direction contradicts the exact place-bound provenance.
    const reversedId = `encounter:route:${combat.threat.destinationLocationId}>${combat.threat.fromLocationId}`;
    const wrongRoute = JSON.parse(JSON.stringify(combat).split(combat.id).join(reversedId)) as CombatState;
    expect(isValidCombatState(wrongRoute)).toBe(true);
    expect(projectAtlasBattleMemory({ ...original, completedCombats: [wrongRoute] })).toEqual([]);
    const invalid = [
      { ...combat, threat: { schemaVersion: 1, rating: "legacy-unrated" } },
      { ...combat, outcome: "ongoing" },
      { ...combat, id: "encounter:unrelated" },
      { ...combat, threat: { ...combat.threat, edgeId: "foreign-road" } },
      { ...combat, threat: { ...combat.threat, destinationLocationId: "foreign-place" } },
      { ...combat, combatants: combat.combatants.map((unit) => unit.side === "enemies" ? { ...unit, speciesId: "invented-monster" } : unit) },
      { ...combat, eventStream: null },
    ];
    for (const record of invalid) {
      expect(projectAtlasBattleMemory({ ...original, completedCombats: [record as CombatState] })).toEqual([]);
    }
  });

  it("fails closed on malformed geometry and keeps valid records when a separate retained entry is corrupt", () => {
    const original = source();
    expect(projectAtlasBattleMemory({ ...original, atlas: { ...original.atlas, edges: [] } })).toEqual([]);
    expect(projectAtlasBattleMemory(null as unknown as DepthState)).toEqual([]);
    expect(projectAtlasBattleMemory({ ...original, atlas: { ...original.atlas, terrain: null } } as unknown as DepthState)).toEqual([]);
    expect(projectAtlasBattleMemory({ ...original, completedCombats: [null as unknown as CombatState, ...original.completedCombats] }))
      .toEqual(projectAtlasBattleMemory(original));
  });
});
