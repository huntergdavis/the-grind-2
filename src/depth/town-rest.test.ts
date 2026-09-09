import { describe, expect, it } from "vitest";
import { planRoute } from "./atlas";
import { generateDungeon } from "./dungeon";
import { createDepthState, depthCommandCandidates, stepDepth, upgradeDepthState } from "./state";
import { paidInnRestGoldCost, selectPaidInnRest } from "./town-rest";
import type { DepthState } from "./types";

function fixture(): DepthState {
  const state = createDepthState("paid-inn-rest", "hero:paid-inn-rest", "Aster Vale");
  return {
    ...state,
    hero: {
      ...state.hero,
      resources: {
        ...state.hero.resources,
        health: state.hero.resources.maxHealth - 1,
        mana: Math.floor(state.hero.resources.maxMana / 3),
      },
    },
  };
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

describe("paid town inn rest", () => {
  it("selects a real recorded inn with exact five-gold and full-resource deltas", () => {
    const state = fixture();
    const plan = selectPaidInnRest(state);
    expect(paidInnRestGoldCost).toBe(5);
    expect(plan).toEqual({
      locationId: "location:0",
      townId: "town:location:0",
      townName: "Raincross",
      innId: "town:location:0:district:0:building:2",
      innName: "The Badger Inn",
      goldBefore: 12, goldSpent: 5, goldAfter: 7,
      healthBefore: 47, healthAfter: 48,
      manaBefore: 8, manaAfter: 26,
    });
    expect(Object.isFrozen(plan)).toBe(true);
  });

  it("uses the strict half-health and one-third-mana thresholds and permits exactly five gold", () => {
    const state = fixture();
    const withResources = (health: number, mana: number, maxMana = state.hero.resources.maxMana) => ({
      ...state, hero: { ...state.hero, resources: { ...state.hero.resources, health, mana, maxMana } },
    });
    expect(selectPaidInnRest(withResources(24, 8))).toBeNull();
    expect(selectPaidInnRest(withResources(25, 8))).not.toBeNull();
    expect(selectPaidInnRest(withResources(48, 8))).not.toBeNull();
    expect(selectPaidInnRest(withResources(48, 9))).toBeNull();
    expect(selectPaidInnRest(withResources(48, 26))).toBeNull();
    expect(selectPaidInnRest(withResources(48, 0, 0))).toBeNull();
    expect(selectPaidInnRest({ ...state, hero: { ...state.hero, gold: 5 } })?.goldAfter).toBe(0);
    expect(selectPaidInnRest({ ...state, hero: { ...state.hero, gold: 4 } })).toBeNull();
  });

  it("does not expose a hidden, unvisited, mismatched, missing, or non-town service", () => {
    const state = fixture();
    const locationId = state.atlas.currentLocationId;
    const town = state.towns[locationId]!;
    expect(selectPaidInnRest({ ...state, atlas: { ...state.atlas, discoveredLocationIds: [] } })).toBeNull();
    expect(selectPaidInnRest({ ...state, towns: {} })).toBeNull();
    expect(selectPaidInnRest({ ...state, towns: { [locationId]: { ...town, visits: 0 } } })).toBeNull();
    expect(selectPaidInnRest({ ...state, towns: { [locationId]: { ...town, locationId: "another-place" } } })).toBeNull();
    expect(selectPaidInnRest({
      ...state,
      atlas: { ...state.atlas, locations: state.atlas.locations.map((location) => location.id === locationId
        ? { ...location, kind: "wilds" as const } : location) },
    })).toBeNull();
  });

  it("requires a real inn with mutual district membership and chooses the next valid inn by stable ID", () => {
    const state = fixture();
    const locationId = state.atlas.currentLocationId;
    const town = state.towns[locationId]!;
    const inns = town.buildings.filter((building) => building.kind === "inn").sort((left, right) => left.id < right.id ? -1 : 1);
    expect(inns.length).toBeGreaterThan(1);
    const noInn = { ...town, buildings: town.buildings.filter((building) => building.kind !== "inn") };
    expect(selectPaidInnRest({ ...state, towns: { [locationId]: noInn } })).toBeNull();
    const unlisted = {
      ...town,
      districts: town.districts.map((district) => ({ ...district, buildingIds: district.buildingIds.filter((id) => id !== inns[0]!.id) })),
    };
    expect(selectPaidInnRest({ ...state, towns: { [locationId]: unlisted } })?.innId).toBe(inns[1]!.id);
    const wrongDistrict = {
      ...town,
      buildings: town.buildings.map((building) => building.id === inns[0]!.id ? { ...building, districtId: "missing-district" } : building),
    };
    expect(selectPaidInnRest({ ...state, towns: { [locationId]: wrongDistrict } })?.innId).toBe(inns[1]!.id);
  });

  it("is unavailable on a route or in an unfinished dungeon but permits a retained completed dungeon", () => {
    const state = fixture();
    const destination = state.atlas.locations.find((location) => location.id !== state.atlas.currentLocationId)!;
    expect(selectPaidInnRest({ ...state, atlas: planRoute(state.atlas, destination.id) })).toBeNull();
    const dungeon = generateDungeon(state.seed, "paid-rest-dungeon", 5, 5);
    expect(selectPaidInnRest({ ...state, dungeon })).toBeNull();
    expect(selectPaidInnRest({ ...state, dungeon: { ...dungeon, completed: true } })).toEqual(selectPaidInnRest(state));
  });

  it("does not interrupt companion, encounter, quest-closure, or pending-reward ownership", () => {
    const state = fixture();
    // Presence guards must reject before reading any active encounter/companion fields.
    expect(selectPaidInnRest({ ...state, companions: { ...state.companions, active: [{} as never] } })).toBeNull();
    expect(selectPaidInnRest({ ...state, combat: {} as never })).toBeNull();
    expect(selectPaidInnRest({ ...state, counterDuel: {} as never })).toBeNull();
    expect(selectPaidInnRest({ ...state, quest: { ...state.quest, status: "ready-to-fulfill" } })).toBeNull();
    expect(selectPaidInnRest({ ...state, quest: { ...state.quest, status: "fulfilled" } })).toBeNull();
    expect(selectPaidInnRest({ ...state, pendingQuestReward: {} as never })).toBeNull();
    expect(selectPaidInnRest({ ...state, hero: { ...state.hero, resources: { ...state.hero.resources, health: 0 } } })).toBeNull();
  });

  it("resolves the actual selected wait once, spending only gold and restoring HP/MP", () => {
    const state = fixture();
    const before = JSON.stringify(state);
    const candidate = depthCommandCandidates(state)[0]!;
    expect(candidate).toMatchObject({
      id: "depth:1:town:location:0:inn-rest:town:location:0:district:0:building:2",
      label: "rest at The Badger Inn for 5 gold",
      command: { type: "wait" },
    });
    const after = stepDepth(state, candidate.command);
    expect(after.tick).toBe(state.tick + 1);
    expect(after.hero).toEqual({
      ...state.hero, gold: 7,
      resources: { ...state.hero.resources, health: 48, mana: 26 },
    });
    const { hero: _hero, tick: _tick, log: _log, ...remainingBefore } = state;
    const { hero: _afterHero, tick: _afterTick, log: _afterLog, ...remainingAfter } = after;
    expect(remainingAfter).toEqual(remainingBefore);
    expect(after.log.at(-1)).toMatchObject({
      tick: after.tick,
      category: "town",
      message: "Paid inn rest at The Badger Inn, Raincross: gold 12→7 (-5) · HP 47→48 (+1) · MP 8→26 (+18). Fully rested; no items or rewards gained.",
    });
    expect(selectPaidInnRest(after)).toBeNull();
    expect(depthCommandCandidates(after).some((next) => next.command.type === "wait")).toBe(false);
    const ordinaryWait = stepDepth(after, { type: "wait" });
    expect(ordinaryWait.hero).toEqual(after.hero);
    expect(ordinaryWait.log.at(-1)?.message).toBe("The party watches and listens; rest away from refuge restores nothing.");
    expect(JSON.stringify(state)).toBe(before);
  });

  it("keeps tonic restocking ahead of the paid service", () => {
    const state = fixture();
    const lowStock = {
      ...state,
      hero: { ...state.hero, inventory: state.hero.inventory.map((item) => item.restorative === null ? item : { ...item, quantity: 1 }) },
    };
    expect(selectPaidInnRest(lowStock)).not.toBeNull();
    expect(depthCommandCandidates(lowStock)[0]?.command.type).toBe("restock-tonic");
  });

  it("selects deterministically without mutation and preserves the exact reducer result after JSON resume", () => {
    const state = fixture();
    const expected = selectPaidInnRest(state);
    const locationId = state.atlas.currentLocationId;
    const town = state.towns[locationId]!;
    const reordered = {
      ...state,
      atlas: { ...state.atlas, locations: [...state.atlas.locations].reverse() },
      towns: { [locationId]: { ...town, buildings: [...town.buildings].reverse(), districts: [...town.districts].reverse() } },
    };
    expect(selectPaidInnRest(freezeDeep(reordered))).toEqual(expected);
    const resumed = upgradeDepthState(JSON.parse(JSON.stringify(state)), state.seed, state.hero.id, state.hero.name);
    expect(selectPaidInnRest(resumed)).toEqual(expected);
    const after = stepDepth(state, { type: "wait" });
    expect(stepDepth(resumed, { type: "wait" })).toEqual(after);
    expect(upgradeDepthState(JSON.parse(JSON.stringify(after)), after.seed, after.hero.id, after.hero.name)).toEqual(after);
  });
});
