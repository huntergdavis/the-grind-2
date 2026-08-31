import { describe, expect, it } from "vitest";
import { generateAtlas, planRoute } from "./atlas";
import { applyQuestProgressFact, createQuest } from "./rpg";
import { projectSuccessorQuestLead, questLeadAdmissionStatus, selectSuccessorQuestLead } from "./quest-lead";

describe("successor quest leads", () => {
  it("leaves the released chapter-zero quest unbound", () => {
    const seed = "quest-lead-released";
    expect(selectSuccessorQuestLead(seed, generateAtlas(seed, 20), createQuest(seed))).toBeNull();
  });

  it("selects one stable reachable dungeon across movement, route state, ordering, JSON, and object identity", () => {
    const seed = "quest-lead-stability";
    const atlas = generateAtlas(seed, 20);
    const quest = createQuest(seed, 3, 47);
    const first = selectSuccessorQuestLead(seed, atlas, quest);
    if (first === null) throw new Error("Successor fixture has no lead");
    const movedCurrent = atlas.locations.find((location) => location.id !== atlas.currentLocationId)?.id;
    if (movedCurrent === undefined) throw new Error("Atlas has no alternate current location");
    const reordered = {
      ...structuredClone(atlas),
      currentLocationId: movedCurrent,
      route: planRoute(atlas, first.locationId).route,
      locations: [...atlas.locations].reverse(),
      edges: [...atlas.edges].reverse(),
    };

    expect(selectSuccessorQuestLead(seed, reordered, structuredClone(quest))).toEqual(first);
    expect(selectSuccessorQuestLead(seed, JSON.parse(JSON.stringify(reordered)), JSON.parse(JSON.stringify(quest)))).toEqual(first);
  });

  it("projects revealed, routed, at-lead, and resolved from canonical state facts", () => {
    const seed = "quest-lead-phases";
    const atlas = generateAtlas(seed, 20);
    const quest = createQuest(seed, 1, 12);
    const revealed = projectSuccessorQuestLead(seed, atlas, quest);
    if (revealed === null) throw new Error("Successor fixture has no lead");
    expect(revealed).toMatchObject({ phase: "revealed", revealedTick: 12, selectorVersion: "quest-lead-v1" });
    expect(questLeadAdmissionStatus(revealed)).toBe("quest route not planned");

    const routed = projectSuccessorQuestLead(seed, planRoute(atlas, revealed.locationId), quest);
    expect(routed?.phase).toBe("routed");
    if (routed === null) throw new Error("Expected routed lead");
    expect(questLeadAdmissionStatus(routed)).toBe("quest route already planned");
    const arrived = {
      ...atlas,
      currentLocationId: revealed.locationId,
      route: null,
      discoveredLocationIds: [...new Set([...atlas.discoveredLocationIds, revealed.locationId])],
    };
    const atLead = projectSuccessorQuestLead(seed, arrived, quest);
    expect(atLead).toMatchObject({ phase: "at-lead", discovered: true });
    if (atLead === null) throw new Error("Expected at-lead projection");
    expect(questLeadAdmissionStatus(atLead)).toBe("party already at lead");
    const resolved = projectSuccessorQuestLead(seed, arrived, applyQuestProgressFact(quest, {
      schemaVersion: 1,
      kind: "dungeon-completed",
      dungeonId: `dungeon:${revealed.locationId}:quest:${quest.ordinal}`,
      locationId: revealed.locationId,
      binding: "quest-lead",
    }));
    expect(resolved).toMatchObject({ phase: "resolved" });
    if (resolved === null) throw new Error("Expected resolved projection");
    expect(questLeadAdmissionStatus(resolved)).toBe("lead already resolved");
  });

  it("fails closed when no dungeon can be reached", () => {
    const seed = "quest-lead-unreachable";
    const atlas = generateAtlas(seed, 20);
    const dungeonIds = new Set(atlas.locations.filter((location) => location.kind === "dungeon").map((location) => location.id));
    const disconnected = {
      ...atlas,
      edges: atlas.edges.filter((edge) => !dungeonIds.has(edge.from) && !dungeonIds.has(edge.to)),
    };
    expect(() => selectSuccessorQuestLead(seed, disconnected, createQuest(seed, 1, 4))).toThrow("no dungeon lead candidates");
  });
});
