import { describe, expect, it } from "vitest";
import { advanceRoute, generateAtlas, planRoute } from "../depth/atlas";
import { projectRoute } from "../render/route-projection";
import { miniMapViewBox, projectMiniMap } from "./mini-map";

describe("mini-map projection", () => {
  it("shows only discovered sites plus the selected destination and canonical roads", () => {
    const atlas = generateAtlas("mini-map-knowledge", 20);
    const destination = atlas.locations.find((location) => !atlas.discoveredLocationIds.includes(location.id));
    if (destination === undefined) throw new Error("Atlas has no undiscovered destination");
    const planned = planRoute(atlas, destination.id);
    const projection = projectMiniMap(planned);
    const routeEdges = new Set<string>();
    for (let index = 0; index < (planned.route?.path.length ?? 0) - 1; index += 1) {
      const left = planned.route?.path[index];
      const right = planned.route?.path[index + 1];
      if (left !== undefined && right !== undefined) routeEdges.add([left, right].sort().join("~"));
    }

    expect(projection.sites.map((site) => site.id).sort()).toEqual(
      [...new Set([...atlas.discoveredLocationIds, destination.id])].sort(),
    );
    expect(projection.sites.find((site) => site.id === destination.id)?.kind).toBe("unknown");
    expect(projection.roads.filter((road) => road.selected).map((road) => road.id).sort()).toEqual([...routeEdges].sort());
    expect(projection.roads.every((road) => road.selected || (
      atlas.discoveredLocationIds.includes(atlas.edges.find((edge) => edge.id === road.id)?.from ?? "") &&
      atlas.discoveredLocationIds.includes(atlas.edges.find((edge) => edge.id === road.id)?.to ?? "")
    ))).toBe(true);
  });

  it("places the party at the exact shared mid-route terrain projection", () => {
    const atlas = generateAtlas("mini-map-party", 20);
    const destination = atlas.locations.at(-1)?.id;
    if (destination === undefined) throw new Error("Atlas has no destination");
    const planned = planRoute(atlas, destination);
    const route = projectRoute(planned);
    if (route === null) throw new Error("Atlas has no planned route");
    const advanced = advanceRoute(planned, Math.max(1, Math.floor(route.legDistance / 2)));
    const exact = projectRoute(advanced);
    if (exact === null) throw new Error("Atlas has no projected route");
    const projection = projectMiniMap(advanced);
    const drawableWidth = miniMapViewBox.width - miniMapViewBox.padding * 2;
    const drawableHeight = miniMapViewBox.height - miniMapViewBox.padding * 2;

    expect(projection.party.x).toBeCloseTo(miniMapViewBox.padding + exact.terrainX / advanced.terrain.width * drawableWidth);
    expect(projection.party.y).toBeCloseTo(miniMapViewBox.padding + exact.terrainY / advanced.terrain.height * drawableHeight);
    expect(projection.currentPlace).toContain("→");
    expect(projection.ariaLabel).toContain("miles remaining");
  });

  it("is deterministic, serialization-safe, and non-mutating", () => {
    const generated = generateAtlas("mini-map-stability", 16);
    const destination = generated.locations.at(-1)?.id;
    if (destination === undefined) throw new Error("Atlas has no destination");
    const planned = planRoute(generated, destination);
    const before = JSON.stringify(planned);
    const first = projectMiniMap(planned);
    const restored = JSON.parse(before) as typeof planned;
    const reordered = {
      ...restored,
      locations: [...restored.locations].reverse(),
      edges: [...restored.edges].reverse(),
      terrain: {
        ...restored.terrain,
        coastline: [...restored.terrain.coastline].reverse(),
        rivers: [...restored.terrain.rivers].reverse(),
      },
    };

    expect(projectMiniMap(reordered)).toEqual(first);
    expect(JSON.stringify(planned)).toBe(before);
  });
});
