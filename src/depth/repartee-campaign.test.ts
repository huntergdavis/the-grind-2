import { describe, expect, it } from "vitest";
import { createWorld } from "../core/simulation";
import { applyHeroExperience, heroExperienceFloor } from "./rpg";
import { reparteeBook, reparteeResponses, type ReparteeResponse } from "./repartee";
import { isValidCampaignRepartee, reparteeCommandId, selectReparteeVenue } from "./repartee-campaign";
import { depthCommandCandidates, stepDepth, upgradeDepthState } from "./state";
import type { DepthCommand, DepthState } from "./types";

/** Explicit earned-level staging in a real generated visited town, not a claimed natural journey. */
function fixture(): DepthState {
  const depth = createWorld("browser-dungeon-search:8", "campaign:browser-dungeon-search").depth;
  return { ...depth, hero: applyHeroExperience(depth.hero, heroExperienceFloor(2)).hero };
}

function offered(state: DepthState, type: DepthCommand["type"]) {
  const candidate = depthCommandCandidates(state).find((entry) => entry.command.type === type);
  expect(candidate, `Expected actual ${type} candidate`).toBeDefined();
  return candidate!;
}

function read(state = fixture()): DepthState {
  return stepDepth(state, offered(state, "read-book").command);
}

function start(state = read()): DepthState {
  return stepDepth(state, offered(state, "start-repartee").command);
}

function respond(state: DepthState, style: ReparteeResponse["style"] | "retreat"): DepthState {
  const active = state.repartee.active!;
  if (style === "retreat") {
    // A declared concession is legal to the reducer, not an invented spectator click or forced policy choice.
    return stepDepth(state, { type: "repartee-action", encounterId: active.encounterId, roundIndex: active.roundIndex, responseId: "retreat" });
  }
  const response = reparteeResponses(state.repartee).find((entry) => entry.style === style)!;
  const candidate = depthCommandCandidates(state).find((entry) => entry.command.type === "repartee-action" && entry.command.responseId === response.id);
  expect(candidate).toBeDefined();
  return stepDepth(state, candidate!.command);
}

function finish(styles: readonly (ReparteeResponse["style"] | "retreat")[], state = fixture()): DepthState {
  return styles.reduce((current, style) => respond(current, style), start(read(state)));
}

function reload(state: DepthState): DepthState {
  return upgradeDepthState(JSON.parse(JSON.stringify(state)), state.seed, state.hero.id, state.hero.name);
}

describe("the first useful book in the actual campaign reducer", () => {
  it("reads at a real generated building, learns 12 entries, and binds the offered command without awarding power", () => {
    const before = fixture(), venue = selectReparteeVenue(before)!;
    expect(before.hero.level).toBe(2);
    expect(before.hero.experience).toBe(12);
    expect(venue).not.toBeNull();
    expect(venue.town.locationId).toBe(before.atlas.currentLocationId);
    expect(venue.town.buildings).toContain(venue.building);
    expect(venue.town.residents).toContain(venue.resident);
    expect(venue.building.residentIds).toContain(venue.resident.id);
    expect(venue.resident.homeBuildingId).toBe(venue.building.id);
    const candidate = offered(before, "read-book"), after = stepDepth(before, candidate.command);
    expect(after.repartee.reading).toEqual({
      schemaVersion: 1, bookId: reparteeBook.id, contentVersion: 1,
      actorId: before.hero.id, locationId: venue.town.locationId, buildingId: venue.building.id,
      sourceCommandId: candidate.id, tick: before.tick + 1, firstRead: true,
      addedEntryIds: reparteeBook.entryIds, addedFrameIds: reparteeBook.frameIds,
    });
    expect(after.hero).toEqual(before.hero);
    expect(after.companions).toEqual(before.companions);
    expect(after.towns).toEqual(before.towns);
    expect(after.quest).toEqual(before.quest);
    expect(after.repartee.active).toBeNull();
    expect(after.repartee.completed).toBeNull();
    expect(depthCommandCandidates(after).map((entry) => entry.command.type)).toEqual(["start-repartee"]);
    expect(reload(after)).toEqual(after);
    expect(stepDepth(before, candidate.command)).toEqual(after);
    expect(() => stepDepth(after, candidate.command)).toThrow("already been read");
  });

  it("plays three legal scored replies and awards one bounded reputation increment with no combat side effects", () => {
    const before = fixture(), venue = selectReparteeVenue(before)!;
    const learned = read(before), admitted = offered(learned, "start-repartee");
    let state = stepDepth(learned, admitted.command);
    expect(state.repartee.active).toMatchObject({ sourceCommandId: admitted.id, startedTick: learned.tick + 1,
      actorId: before.hero.id, residentId: venue.resident.id, locationId: venue.town.locationId, buildingId: venue.building.id,
      readingSourceCommandId: learned.repartee.reading?.sourceCommandId, roundIndex: 0, rounds: [] });
    for (let index = 0; index < 3; index++) {
      const choices = depthCommandCandidates(state);
      expect(choices).toHaveLength(4);
      expect(choices.every((entry) => entry.command.type === "repartee-action")).toBe(true);
      const response = reparteeResponses(state.repartee).find((entry) => entry.style === "direct")!;
      const candidate = choices.find((entry) => entry.command.type === "repartee-action" && entry.command.responseId === response.id)!;
      const next = stepDepth(state, candidate.command);
      const duel = next.repartee.active ?? next.repartee.completed;
      expect(duel?.rounds[index]).toMatchObject({ roundIndex: index, sourceCommandId: candidate.id, tick: state.tick + 1,
        reply: response.text, delta: 1, momentum: index + 1, readingSourceCommandId: learned.repartee.reading?.sourceCommandId });
      expect(next.hero).toEqual(before.hero);
      expect(next.companions).toEqual(before.companions);
      expect(next.quest).toEqual(before.quest);
      if (index < 2) expect(next.towns).toEqual(before.towns);
      expect(reload(next)).toEqual(next);
      state = next;
    }
    expect(state.repartee.active).toBeNull();
    expect(state.repartee.completed).toMatchObject({ outcome: "victory", momentum: 3, roundIndex: 3,
      reputationBefore: venue.town.reputation, reputationAfter: Math.min(100, venue.town.reputation + 1),
      reputationCap: 100, consumedOpportunity: true });
    expect(state.towns[venue.town.locationId]?.reputation).toBe(venue.town.reputation + 1);
    expect(selectReparteeVenue(state)).toBeNull();
    expect(depthCommandCandidates(state).some((entry) => ["read-book", "start-repartee", "repartee-action"].includes(entry.command.type))).toBe(false);
    expect(() => stepDepth(state, admitted.command)).toThrow();
    expect(() => stepDepth(state, { type: "repartee-action", encounterId: venue.encounterId, roundIndex: 2, responseId: "retreat" })).toThrow("No active contest");
  });

  it("keeps defeat, draw, and explicit retreat distinct while leaving reputation and the entire hero unchanged", () => {
    const before = fixture();
    for (const [styles, outcome, score] of [
      [["category", "category", "category"], "defeat", -3],
      [["direct", "category", "near"], "draw", 0],
      [["retreat"], "retreat", 0],
      [["direct", "retreat"], "retreat", 1],
    ] as const) {
      const after = finish(styles, before);
      expect(after.repartee.completed).toMatchObject({ outcome, momentum: score, reputationAward: 0 });
      expect(after.towns).toEqual(before.towns);
      expect(after.hero).toEqual(before.hero);
      expect(after.companions).toEqual(before.companions);
      expect(reload(after)).toEqual(after);
      expect(depthCommandCandidates(after).some((entry) => entry.command.type === "repartee-action")).toBe(false);
    }
  });

  it("honors the actual town reputation cap without a duplicate or overflow award", () => {
    const base = fixture(), locationId = base.atlas.currentLocationId;
    const before = { ...base, towns: { ...base.towns, [locationId]: { ...base.towns[locationId]!, reputation: 100 } } };
    const after = finish(["direct", "direct", "direct"], before);
    expect(after.repartee.completed).toMatchObject({ outcome: "victory", reputationBefore: 100, reputationAfter: 100, reputationAward: 0 });
    expect(after.towns).toEqual(before.towns);
    expect(reload(after)).toEqual(after);
  });

  it("rejects unknown, stale and competing actions atomically during a contest", () => {
    const state = start(), active = state.repartee.active!, saved = JSON.stringify(state);
    const command: DepthCommand = { type: "repartee-action", encounterId: active.encounterId, roundIndex: 0, responseId: reparteeResponses(state.repartee)[0]!.id };
    for (const invalid of [
      { type: "wait" }, { ...command, encounterId: "foreign" }, { ...command, roundIndex: 1 },
      { ...command, responseId: "unlearned-answer" },
      { type: "read-book", bookId: reparteeBook.id, locationId: active.locationId, buildingId: active.buildingId },
    ] as DepthCommand[]) {
      expect(() => stepDepth(state, invalid)).toThrow();
      expect(JSON.stringify(state)).toBe(saved);
    }
    const once = stepDepth(state, command), onceSaved = JSON.stringify(once);
    expect(() => stepDepth(once, command)).toThrow("Stale");
    expect(JSON.stringify(once)).toBe(onceSaved);
    expect(() => stepDepth(fixture(), { type: "read-book", bookId: "unknown", locationId: active.locationId, buildingId: active.buildingId })).toThrow("Unknown book");
  });

  it("restores empty v27 campaigns without fabricated reading or contest credit, rejecting malformed present fields", () => {
    const before = fixture(), { repartee: _repartee, ...legacy } = before;
    const old = { ...legacy, schemaVersion: 27 };
    const loaded = upgradeDepthState(old, before.seed, before.hero.id, before.hero.name);
    expect(loaded.schemaVersion).toBe(28);
    expect(loaded.repartee).toEqual({ schemaVersion: 1, reading: null, active: null, completed: null });
    expect(loaded.hero).toEqual(before.hero);
    expect(loaded.towns).toEqual(before.towns);
    for (const repartee of [undefined, null, {}, { schemaVersion: 2, reading: null, active: null, completed: null }]) {
      expect(() => upgradeDepthState({ ...old, repartee }, before.seed, before.hero.id, before.hero.name)).toThrow("schema invariants");
    }
    const learned = read(before), mid = respond(start(learned), "direct");
    expect(respond(respond(reload(mid), "category"), "near")).toEqual(respond(respond(mid, "category"), "near"));
  });

  it("requires a safe, discovered, visited town with a real district, reading building, and matching resident", () => {
    const before = fixture(), locationId = before.atlas.currentLocationId, town = before.towns[locationId]!;
    const originalLevel = createWorld("browser-dungeon-search:8", "campaign:browser-dungeon-search").depth;
    const invalid: DepthState[] = [
      originalLevel,
      { ...before, hero: { ...before.hero, resources: { ...before.hero.resources, health: Math.floor(before.hero.resources.maxHealth / 2) } } },
      { ...before, atlas: { ...before.atlas, discoveredLocationIds: [] } },
      { ...before, towns: {} },
      { ...before, towns: { ...before.towns, [locationId]: { ...town, visits: 0 } } },
      { ...before, towns: { ...before.towns, [locationId]: { ...town, locationId: "foreign-location" } } },
      { ...before, towns: { ...before.towns, [locationId]: { ...town, districts: [] } } },
      { ...before, towns: { ...before.towns, [locationId]: { ...town, residents: [] } } },
      { ...before, towns: { ...before.towns, [locationId]: { ...town, buildings: town.buildings.filter((building) => !["hall", "inn"].includes(building.kind)) } } },
    ];
    for (const [index, state] of invalid.entries()) expect(selectReparteeVenue(state) === null, `inadmissible venue fixture ${index}`).toBe(true);
    const venue = selectReparteeVenue(before)!;
    const learned = read(before);
    const rejected = { ...learned, towns: { ...learned.towns, [locationId]: { ...town,
      residents: town.residents.map((resident) => resident.homeBuildingId === venue.building.id ? { ...resident, homeBuildingId: "foreign-building" } : resident),
    } } };
    expect(selectReparteeVenue(rejected)).toBeNull();
  });

  it("rejects forged actor, town, building, resident, command, and future-tick provenance on load", () => {
    const learned = read(), reading = learned.repartee.reading!, locationId = reading.locationId, town = learned.towns[locationId]!;
    for (const state of [
      { ...learned, tick: reading.tick - 1 },
      { ...learned, repartee: { ...learned.repartee, reading: { ...reading, actorId: "another-hero" } } },
      { ...learned, repartee: { ...learned.repartee, reading: { ...reading, sourceCommandId: "invented-candidate" } } },
      { ...learned, atlas: { ...learned.atlas, discoveredLocationIds: [] } },
      { ...learned, towns: { ...learned.towns, [locationId]: { ...town, visits: 0 } } },
      { ...learned, towns: { ...learned.towns, [locationId]: { ...town, districts: [] } } },
      { ...learned, towns: { ...learned.towns, [locationId]: { ...town, buildings: town.buildings.filter((building) => building.id !== reading.buildingId) } } },
    ]) {
      expect(isValidCampaignRepartee(state)).toBe(false);
      expect(() => upgradeDepthState(state, state.seed, state.hero.id, state.hero.name)).toThrow("schema invariants");
    }
    const active = start(learned), duel = active.repartee.active!;
    const forgedResident = "resident:invented";
    const fabricated = { ...active, repartee: { ...active.repartee, active: { ...duel,
      residentId: forgedResident,
      sourceCommandId: reparteeCommandId(duel.startedTick, { type: "start-repartee", encounterId: duel.encounterId,
        residentId: forgedResident, locationId: duel.locationId, buildingId: duel.buildingId }),
    } } };
    expect(isValidCampaignRepartee(fabricated)).toBe(false);
    expect(() => stepDepth(fabricated, { type: "repartee-action", encounterId: duel.encounterId, roundIndex: 0, responseId: "retreat" })).toThrow("schema invariants");
    const wrongLocation = { ...active, atlas: { ...active.atlas, currentLocationId: "location:3" } };
    expect(isValidCampaignRepartee(wrongLocation)).toBe(false);
  });

  it("requires the immediate completed snapshot to contain its paid reputation while allowing later legitimate changes", () => {
    const completed = finish(["direct", "direct", "direct"]), receipt = completed.repartee.completed!;
    const town = completed.towns[receipt.locationId]!;
    const unpaid = { ...completed, towns: { ...completed.towns, [receipt.locationId]: { ...town, reputation: receipt.reputationBefore } } };
    expect(isValidCampaignRepartee(unpaid)).toBe(false);
    expect(() => reload(unpaid)).toThrow("schema invariants");
    expect(isValidCampaignRepartee({ ...unpaid, tick: unpaid.tick + 1 })).toBe(true);
    const last = receipt.rounds.at(-1)!;
    const repeated: DepthCommand = { type: "repartee-action", encounterId: receipt.encounterId, roundIndex: last.roundIndex, responseId: last.responseId };
    expect(() => stepDepth(completed, repeated)).toThrow("No active contest");
    expect(completed.towns[receipt.locationId]?.reputation).toBe(receipt.reputationAfter);
  });
});
