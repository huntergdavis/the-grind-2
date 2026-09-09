import { describe, expect, it } from "vitest";
import { createForwardMotionState } from "../core/forward-motion";
import { advanceWorld, campaignDirector, createWorld, upgradeWorldState } from "../core/simulation";
import type { ChronicleEntry, WorldState } from "../core/types";
import { generateTown, visitTown } from "../depth/towns";
import { projectCompanionFarewell } from "./companion-farewell";
import { projectFarewellRemembrance } from "./farewell-remembrance";
import { projectRecordedFarewell } from "./recorded-farewell";

let arrived: WorldState | undefined;

// Reuses the canonical journey pattern from companion-farewell.test.ts, not a fabricated departure packet.
function fixture(injury: "none" | "fallen" = "none", victories = 2) {
  if (arrived === undefined) {
    const seed = "farewell-fulfilled", base = createWorld(seed, `campaign:${seed}`);
    const origin = base.depth.atlas.currentLocationId;
    const destination = base.depth.atlas.locations.find(location => location.kind === "town" && location.id !== origin)!;
    const town = visitTown(generateTown(seed, destination.id));
    let world = upgradeWorldState({ ...base, scene: { ...base.scene, mode: "town", location: town.name },
      forwardMotion: createForwardMotionState(destination.id, base.tick),
      depth: { ...base.depth, atlas: { ...base.depth.atlas, currentLocationId: destination.id,
        discoveredLocationIds: [origin, destination.id], route: null }, towns: { ...base.depth.towns, [destination.id]: town } } });
    for (let count = 0; count < 96; count++) {
      if (campaignDirector(world).candidates[0]?.command.type === "farewell-companion") { arrived = world; break; }
      world = advanceWorld(world);
    }
    if (arrived === undefined) throw new Error("Recorded farewell fixture never arrived");
  }
  const base = structuredClone(arrived), active = base.depth.companions.active[0]!;
  const before = upgradeWorldState({ ...base,
    chronicle: base.chronicle.filter(entry => entry.commandType !== "recruit-companion"),
    depth: { ...base.depth, companions: { ...base.depth.companions, active: [{ ...active, injury, victories,
      resources: { ...active.resources, health: injury === "fallen" ? 0 : active.combat.maxHealth } }] } } });
  const after = advanceWorld(before), source = after.chronicle.at(-1)!;
  return { before, after, source };
}

describe("recorded farewell projection", () => {
  it.each(["none", "fallen"] as const)("projects exact %s departure facts without retained oath history", (injury) => {
    const { before, after, source } = fixture(injury);
    expect(before.chronicle.some(entry => entry.commandType === "recruit-companion")).toBe(false);
    expect(projectFarewellRemembrance(before, after)).toBeNull();
    const packet = projectCompanionFarewell(before, after, source)!;
    expect(packet).not.toBeNull();
    expect(projectRecordedFarewell(before, after)).toEqual({ kind: "recorded-farewell", campaignId: after.campaignId,
      eventId: source.id, tick: source.tick, heroName: after.hero.name, companionName: packet.companionName,
      condition: injury === "none" ? "healthy" : "injured", facts: {
        schemaVersion: 1, kind: "public-story-beat", location: source.location, headline: source.headline,
        action: source.action, consequence: source.consequence,
      } });
    expect(source.action).toContain(injury === "none" ? "in good health" : "wounded but alive");
  });

  it.each([0, 1, 2])("preserves canonical action and consequence for %s shared victories", (victories) => {
    const { before, after, source } = fixture("none", victories);
    const packet = projectRecordedFarewell(before, after);
    expect(packet?.facts.action).toBe(source.action);
    expect(packet?.facts.consequence).toBe(source.consequence);
    expect(source.consequence).toContain(victories === 0 ? "the road was quiet" : `${victories} shared ${victories === 1 ? "victory" : "victories"}`);
  });

  it("copies only immutable public wording and host binding without mutating either world", () => {
    const { before, after } = fixture();
    const initial = structuredClone({ before, after });
    const packet = projectRecordedFarewell(before, after)!;
    expect(packet).not.toBeNull();
    expect(Object.isFrozen(packet)).toBe(true);
    expect(Object.isFrozen(packet.facts)).toBe(true);
    expect({ before, after }).toEqual(initial);
    expect(Object.keys(packet).sort()).toEqual(["kind", "campaignId", "eventId", "tick", "heroName", "companionName", "condition", "facts"].sort());
    expect(JSON.stringify(packet)).not.toMatch(/"(?:health|maxHealth|resources|bond|companionId|commandId|joinedTick|oath)"/u);
    expect(JSON.stringify(packet)).not.toContain(before.depth.companions.active[0]!.identity.residentId);
  });

  it.each([
    { headline: "An invented farewell." }, { action: "A new promise begins." },
    { action: "Ari departs wounded but alive after 2 shared victories." },
    { consequence: "They heal and return together." }, { location: "Another town" },
  ])("rejects altered public source wording even when scene and chronicle agree: %j", (change) => {
    const { before, after, source } = fixture();
    const changed: ChronicleEntry = { ...source, ...change };
    const altered = { ...after, chronicle: [...after.chronicle.slice(0, -1), changed], scene: { ...after.scene, ...change } };
    expect(projectCompanionFarewell(before, altered, changed)).not.toBeNull();
    expect(projectRecordedFarewell(before, altered)).toBeNull();
  });

  it("rejects forged injury wording, cross-campaign/stale transitions, missing records and invalid names", () => {
    const { before, after, source } = fixture("none");
    const action = source.action.replace("in good health", "wounded but alive");
    expect(projectRecordedFarewell(before, { ...after,
      chronicle: [...after.chronicle.slice(0, -1), { ...source, action }], scene: { ...after.scene, action } })).toBeNull();
    expect(projectRecordedFarewell({ ...before, campaignId: "another-campaign" }, after)).toBeNull();
    expect(projectRecordedFarewell(before, before)).toBeNull();
    expect(projectRecordedFarewell(after, after)).toBeNull();
    expect(projectRecordedFarewell(before, { ...after, chronicle: [] })).toBeNull();
    expect(projectRecordedFarewell(before, { ...after, tick: after.tick + 1 })).toBeNull();
    for (const name of ["<Hero>", " Hero", "x".repeat(129), "Hero\u202E"]) {
      expect(projectRecordedFarewell({ ...before, hero: { ...before.hero, name } },
        { ...after, hero: { ...after.hero, name } })).toBeNull();
    }
  });
});
