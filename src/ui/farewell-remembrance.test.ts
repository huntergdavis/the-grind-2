import { describe, expect, it } from "vitest";
import { createForwardMotionState } from "../core/forward-motion";
import { advanceWorld, campaignDirector, createWorld, upgradeWorldState } from "../core/simulation";
import type { ChronicleEntry } from "../core/types";
import { generateTown, visitTown } from "../depth/towns";
import { projectCompanionFarewell } from "./companion-farewell";
import { projectFarewellRemembrance } from "./farewell-remembrance";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

// Reuses the canonical recruitment-to-farewell journey from companion-farewell.test.ts.
function farewellFixture(injury: "none" | "fallen" = "fallen", seed = "remembrance-short-1") {
  const base = createWorld(seed, `campaign:${seed}`);
  const originId = base.depth.atlas.currentLocationId;
  const current = base.depth.atlas.locations.find((location) => location.kind === "town" && location.id !== originId);
  if (current === undefined) throw new Error("Remembrance fixture needs another town");
  const town = visitTown(generateTown(seed, current.id));
  let before = upgradeWorldState({
    ...base,
    scene: { ...base.scene, mode: "town", location: town.name },
    forwardMotion: createForwardMotionState(current.id, base.tick),
    depth: {
      ...base.depth,
      atlas: { ...base.depth.atlas, currentLocationId: current.id, discoveredLocationIds: [originId, current.id], route: null },
      towns: { ...base.depth.towns, [current.id]: town },
    },
  });
  let oath: ChronicleEntry | undefined;
  for (let step = 0; step < 96; step += 1) {
    if (campaignDirector(before).candidates[0]?.command.type === "farewell-companion") break;
    before = advanceWorld(before);
    if (before.chronicle.at(-1)?.commandType === "recruit-companion") oath = before.chronicle.at(-1);
  }
  const active = before.depth.companions.active[0];
  if (active === undefined || active.phase !== "arrived") throw new Error("Remembrance fixture did not arrive");
  before = upgradeWorldState({
    ...before,
    depth: {
      ...before.depth,
      companions: {
        ...before.depth.companions,
        active: [{ ...active, injury, resources: { ...active.resources,
          health: injury === "fallen" ? 0 : active.combat.maxHealth } }],
      },
    },
  });
  const after = advanceWorld(before);
  if (oath === undefined) throw new Error("Remembrance fixture must resolve a real recruitment entry");
  return { before, after, oath, active: before.depth.companions.active[0]! };
}

function changeOath(change: (entry: ChronicleEntry) => readonly ChronicleEntry[]) {
  const fixture = farewellFixture();
  const before = {
    ...fixture.before,
    chronicle: fixture.before.chronicle.flatMap((entry) => entry.id === fixture.oath.id ? change(entry) : [entry]),
  };
  return { before, after: advanceWorld(before) };
}

describe("farewell remembrance projection", () => {
  it("recalls exactly one recorded oath at a zero-health but living injured departure", () => {
    const { before, after, oath, active } = farewellFixture();
    const source = after.chronicle.at(-1)!;
    expect(after.chronicle).toContainEqual(oath);
    expect(source.action).toContain("wounded but alive");
    const packet = projectCompanionFarewell(before, after, source)!;
    expect(packet.outcome).toBe("injured");
    expect(oath.commandId).toBe(`${after.campaignId}:depth:${packet.joinedTick}:companion:join:${packet.companionId}`);
    expect(oath.action).toBe(`${packet.companionName}, ${packet.profession}, will travel from ${packet.originName} to ${packet.destinationName}.`);
    expect(oath.consequence).toBe(`${packet.companionName}, ${packet.profession} of ${packet.originName}, swears to share the road to ${packet.destinationName}.`);
    const originPlace = after.depth.atlas.locations.find((location) => location.id === packet.originLocationId)!;
    expect([oath.id, oath.tick, oath.mode, oath.location, source.location, source.action]).toEqual([
      `${after.campaignId}:${packet.joinedTick}`, packet.joinedTick, "chronicle", originPlace.name,
      packet.destinationName, `${packet.companionName} departs wounded but alive after ${packet.victories} shared ${packet.victories === 1 ? "victory" : "victories"}.`,
    ]);
    expect(oath.location).not.toBe(packet.originName);
    expect(projectFarewellRemembrance(before, after)).toEqual({
      kind: "farewell-remembrance",
      campaignId: after.campaignId,
      eventId: source.id,
      tick: source.tick,
      heroName: after.hero.name,
      companionName: active.identity.name,
      oath: { location: oath.location, headline: oath.headline, tick: oath.tick },
      farewell: { location: source.location, headline: source.headline, tick: source.tick },
    });
  });

  it("keeps only frozen public wording and host binding, without mutating either world", () => {
    const { before, after, active } = farewellFixture();
    const beforeCopy = clone(before);
    const afterCopy = clone(after);
    const first = projectFarewellRemembrance(before, after)!;
    expect(first).not.toBeNull();
    expect(projectFarewellRemembrance(clone(before), clone(after))).toEqual(first);
    expect([first, first.oath, first.farewell].every(Object.isFrozen)).toBe(true);
    expect(before).toEqual(beforeCopy);
    expect(after).toEqual(afterCopy);
    expect(Object.keys(first).sort()).toEqual(["kind", "campaignId", "eventId", "tick", "heroName", "companionName", "oath", "farewell"].sort());
    expect(JSON.stringify(first)).not.toContain(active.identity.residentId);
    expect(JSON.stringify(first)).not.toMatch(/"(?:health|resources|bond|disposition|companionId|commandId)"/u);
  });

  it("leaves healthy departures and non-farewell worlds unchanged", () => {
    const { before, after } = farewellFixture("none");
    expect(projectFarewellRemembrance(before, after)).toBeNull();
    expect(projectFarewellRemembrance(before, before)).toBeNull();
    expect(projectFarewellRemembrance(before, { ...after, chronicle: [] })).toBeNull();
  });

  it("rejects cross-campaign, altered event, stale tick, and replayed transitions", () => {
    const { before, after } = farewellFixture();
    expect(projectFarewellRemembrance({ ...before, campaignId: "other-campaign" }, after)).toBeNull();
    expect(projectFarewellRemembrance(before, { ...after, tick: after.tick + 1 })).toBeNull();
    expect(projectFarewellRemembrance(after, after)).toBeNull();
    const chronicle = [...after.chronicle];
    chronicle[chronicle.length - 1] = { ...chronicle.at(-1)!, id: "other-event" };
    expect(projectFarewellRemembrance(before, { ...after, chronicle })).toBeNull();
  });

  it.each([
    ["wrong campaign ID", { id: "other-campaign:1" }],
    ["wrong companion command", { commandId: "campaign:farewell-injured:depth:1:companion:join:other-person" }],
    ["wrong command kind", { commandType: "wait" }],
    ["future tick", { tick: Number.MAX_SAFE_INTEGER }],
    ["wrong mode", { mode: "town" }],
    ["invented headline", { headline: "An unrecorded promise" }],
    ["invented action", { action: "They promised to meet again." }],
    ["invented oath", { consequence: "They swore revenge." }],
    ["wrong location", { location: "Another place" }],
    ["markup", { headline: "<b>Oath</b>" }],
    ["control characters", { location: "Town\u0000" }],
    ["oversized headline", { headline: "x".repeat(161) }],
  ] as const)("rejects %s in an otherwise retained recruitment source", (_label, change) => {
    const { before, after } = changeOath((entry) => [{ ...entry, ...change } as ChronicleEntry]);
    expect(projectCompanionFarewell(before, after, after.chronicle.at(-1)!)).not.toBeNull();
    expect(projectFarewellRemembrance(before, after)).toBeNull();
  });

  it("rejects missing and duplicate oath records rather than choosing a convenient match", () => {
    for (const change of [() => [], (entry: ChronicleEntry) => [entry, { ...entry }]]) {
      const { before, after } = changeOath(change);
      expect(projectFarewellRemembrance(before, after)).toBeNull();
    }
  });

  it("does not reconstruct an oath after the bounded Chronicle evicts it", () => {
    const { before, after, oath } = farewellFixture("fallen", "farewell-injured");
    expect(before.chronicle).toHaveLength(32);
    expect(after.chronicle).toHaveLength(32);
    expect(after.tick - oath.tick).toBeGreaterThanOrEqual(32);
    expect(after.chronicle.some((entry) => entry.id === oath.id)).toBe(false);
    expect(projectCompanionFarewell(before, after, after.chronicle.at(-1)!)).not.toBeNull();
    expect(projectFarewellRemembrance(before, after)).toBeNull();
  });

  it.each(["x".repeat(129), "<Hero>", "Hero\u0000", " Hero"])("rejects unbounded or unsafe hero text without truncation", (name) => {
    const { before: original, after } = farewellFixture();
    const before = { ...original, hero: { ...original.hero, name } };
    expect(projectFarewellRemembrance(before, { ...after, hero: { ...after.hero, name } })).toBeNull();
  });
});
