import { describe, expect, it } from "vitest";
import { advanceRoute, generateAtlas, planRoute } from "../depth/atlas";
import { projectSuccessorQuestLead } from "../depth/quest-lead";
import { createQuest } from "../depth/rpg";
import { projectRoute } from "../render/route-projection";
import { miniMapViewBox, projectMiniMap } from "./mini-map";
import { projectAtlasPartyMarker, type AtlasPartyMarkerV1 } from "./atlas-party-marker";

function soloMarker(atlas: ReturnType<typeof generateAtlas>): AtlasPartyMarkerV1 {
  const marker = projectAtlasPartyMarker({
    atlas,
    hero: {
      id: "hero:mini-map",
      name: "Aster Vale",
      className: "Wayfarer",
      level: 1,
      experience: 0,
      attributes: { strength: 1, agility: 1, vitality: 1, intellect: 1, spirit: 1, luck: 1 },
      resources: { health: 1, maxHealth: 1, mana: 0, maxMana: 0 },
      gold: 0,
      inventory: [],
      equipment: { weapon: null, offhand: null, head: null, body: null, feet: null, charm: null },
      abilities: [],
      monsterLore: [],
    },
    companions: {
      schemaVersion: 2,
      kitRulesVersion: "explicit-companion-kit-v1",
      explicitKitAfterTick: 0,
      active: [],
      former: [],
    },
  });
  if (marker === null) throw new Error("Expected a solo mini-map marker");
  return marker;
}

describe("mini-map projection", () => {
  it("shows a quest lead as knowledge without fabricating a selected road", () => {
    const seed = "mini-map-quest-lead";
    const atlas = generateAtlas(seed, 20);
    const lead = projectSuccessorQuestLead(seed, atlas, createQuest(seed, 1, 9));
    if (lead === null) throw new Error("Expected successor quest lead");
    const projection = projectMiniMap(atlas, soloMarker(atlas), lead);
    expect(projection.sites.find((site) => site.id === lead.locationId)).toMatchObject({
      id: lead.locationId,
      kind: lead.discovered ? "dungeon" : "unknown",
      destination: false,
      lead: true,
    });
    expect(projection.roads.filter((road) => road.selected)).toEqual([]);
    expect(projection.routeSummary).toContain(`Lead · ${lead.locationName}`);
    expect(projection.ariaLabel).toContain("No route is planned");
  });

  it("keeps an unrelated route destination separate from the quest lead", () => {
    const seed = "mini-map-route-and-lead";
    const atlas = generateAtlas(seed, 20);
    const quest = createQuest(seed, 2, 14);
    const lead = projectSuccessorQuestLead(seed, atlas, quest);
    if (lead === null) throw new Error("Expected successor quest lead");
    const destination = atlas.locations.find((location) => location.id !== atlas.currentLocationId && location.id !== lead.locationId);
    if (destination === undefined) throw new Error("Expected unrelated route destination");
    const routed = planRoute(atlas, destination.id);
    const projection = projectMiniMap(routed, soloMarker(routed), projectSuccessorQuestLead(seed, routed, quest));
    expect(projection.sites.find((site) => site.id === lead.locationId)).toMatchObject({ lead: true, destination: false });
    expect(projection.sites.find((site) => site.id === destination.id)).toMatchObject({ lead: false, destination: true });
    expect(projection.roads.some((road) => road.selected)).toBe(true);
    expect(projection.ariaLabel).toContain(`Quest lead at ${lead.locationName}`);
  });

  it("keeps a coincident party and quest lead as separate marker semantics", () => {
    const seed = "mini-map-party-at-lead";
    const atlas = generateAtlas(seed, 20);
    const quest = createQuest(seed, 3, 21);
    const revealed = projectSuccessorQuestLead(seed, atlas, quest);
    if (revealed === null) throw new Error("Expected successor quest lead");
    const atLeadAtlas = {
      ...atlas,
      currentLocationId: revealed.locationId,
      discoveredLocationIds: [...new Set([...atlas.discoveredLocationIds, revealed.locationId])],
    };
    const atLead = projectSuccessorQuestLead(seed, atLeadAtlas, quest);
    if (atLead === null) throw new Error("Expected at-lead projection");
    const projection = projectMiniMap(atLeadAtlas, soloMarker(atLeadAtlas), atLead);
    const site = projection.sites.find((candidate) => candidate.id === atLead.locationId);
    expect(atLead.phase).toBe("at-lead");
    expect(site).toMatchObject({ current: true, lead: true, destination: false });
    expect(projection.party).toMatchObject({ x: site?.x, y: site?.y });
    expect(projection.party.marker?.formation.kind).toBe("solo");
  });

  it("shows only discovered sites plus the selected destination and canonical roads", () => {
    const atlas = generateAtlas("mini-map-knowledge", 20);
    const destination = atlas.locations.find((location) => !atlas.discoveredLocationIds.includes(location.id));
    if (destination === undefined) throw new Error("Atlas has no undiscovered destination");
    const planned = planRoute(atlas, destination.id);
    const projection = projectMiniMap(planned, soloMarker(planned));
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
    const projection = projectMiniMap(advanced, soloMarker(advanced));
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
    const first = projectMiniMap(planned, soloMarker(planned));
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

    expect(projectMiniMap(reordered, soloMarker(reordered))).toEqual(first);
    expect(JSON.stringify(planned)).toBe(before);
  });
});
