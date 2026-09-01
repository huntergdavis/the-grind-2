import { describe, expect, it } from "vitest";
import { isValidCompanionReferences, isValidCompanionRoster } from "./companion";
import { projectSuccessorQuestLead } from "./quest-lead";
import { createQuest } from "./rpg";
import { createDepthState, depthCommandCandidates, stepDepth, unresolvedRouteEncounterId, upgradeDepthState } from "./state";
import { downgradeDepthQuestToSchema11 } from "../../tests/quest-fixtures";
import { generateTown, visitTown } from "./towns";
import type { DepthCommand, DepthState } from "./types";

function eligibleState(seed = "shared-road-lifecycle"): DepthState {
  const base = createDepthState(seed, `hero:${seed}`, "Aster Vale");
  const originId = base.atlas.currentLocationId;
  const current = base.atlas.locations.find((location) => location.kind === "town" && location.id !== originId);
  if (current === undefined) throw new Error("Shared-road fixture needs a second town");
  const town = visitTown(generateTown(seed, current.id));
  return {
    ...base,
    atlas: {
      ...base.atlas,
      currentLocationId: current.id,
      discoveredLocationIds: [originId, current.id],
      route: null,
    },
    towns: { ...base.towns, [current.id]: town },
  };
}

function recruit(state: DepthState): DepthState {
  const candidate = depthCommandCandidates(state).find((entry) => entry.command.type === "recruit-companion");
  if (candidate?.command.type !== "recruit-companion") throw new Error("No canonical companion recruitment candidate");
  return stepDepth(state, candidate.command);
}

function planOathRoute(state: DepthState): DepthState {
  const candidate = depthCommandCandidates(state)[0];
  if (candidate?.command.type !== "plan-route") throw new Error("Shared Road Oath did not own route planning");
  return stepDepth(state, candidate.command);
}

function startOathCombat(state: DepthState, enemyCount: number): DepthState {
  const routed = planOathRoute(state);
  const encounterId = unresolvedRouteEncounterId(routed);
  if (encounterId === null) throw new Error("Shared Road Oath has no unresolved route encounter");
  return stepDepth(routed, { type: "start-combat", encounterId, enemyCount });
}

function arrive(state: DepthState): DepthState {
  let current = state;
  for (let step = 0; step < 32 && current.atlas.route !== null; step += 1) {
    current = stepDepth(current, { type: "travel", distance: 10_000 });
  }
  if (current.atlas.route !== null) throw new Error("Shared-road fixture did not arrive");
  return current;
}

describe("Shared Road Oath lifecycle", () => {
  it("migrates released schema-eight state to an empty roster without retroactive companions", () => {
    const current = createDepthState("shared-road-migration", "hero:shared-road-migration", "Aster Vale");
    const legacy = JSON.parse(JSON.stringify(current)) as Record<string, unknown>;
    downgradeDepthQuestToSchema11(legacy as Record<string, any>);
    legacy.schemaVersion = 8;
    delete legacy.companions;
    const upgraded = upgradeDepthState(legacy, current.seed, current.hero.id, current.hero.name);
    expect(upgraded.schemaVersion).toBe(17);
    expect(upgraded.companions).toEqual({ schemaVersion: 1, active: [], former: [] });
    expect(upgradeDepthState(JSON.parse(JSON.stringify(upgraded)), current.seed, current.hero.id, current.hero.name)).toEqual(upgraded);
  });

  it("recruits one stable resident and gives their public destination exclusive route priority", () => {
    const before = eligibleState();
    const candidates = depthCommandCandidates(before);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.command.type).toBe("recruit-companion");
    const joined = recruit(before);
    const companion = joined.companions.active[0];
    expect(companion).toBeDefined();
    expect(joined.companions.former).toEqual([]);
    expect(isValidCompanionRoster(joined.companions)).toBe(true);
    expect(isValidCompanionReferences(joined.companions, joined.atlas, joined.towns)).toBe(true);

    const routeCandidates = depthCommandCandidates(joined);
    expect(routeCandidates).toHaveLength(1);
    expect(routeCandidates[0]?.command).toEqual({
      type: "plan-route",
      destinationId: companion?.destination.locationId,
    });
    const conflictingDestination = joined.atlas.locations.find((location) => location.id !== companion?.destination.locationId);
    if (conflictingDestination === undefined) throw new Error("Shared-road fixture needs a conflicting destination");
    expect(() => stepDepth(joined, {
      type: "plan-route",
      destinationId: conflictingDestination.id,
    })).toThrow("Shared Road Oath owns the next destination");
    expect(() => stepDepth(joined, {
      type: "recruit-companion",
      residentId: companion?.identity.residentId ?? "missing",
      destinationId: companion?.destination.locationId ?? "missing",
    })).toThrow(/already resolved/);
  });

  it("keeps an active oath ahead of a successor lead through arrival and farewell", () => {
    const seed = "shared-road-successor-lead";
    const joined = recruit(eligibleState(seed));
    const successor: DepthState = { ...joined, quest: createQuest(seed, 1, joined.tick) };
    const lead = projectSuccessorQuestLead(seed, successor.atlas, successor.quest);
    const companion = successor.companions.active[0];
    if (lead === null || companion === undefined) throw new Error("Expected oath and successor lead");
    expect(depthCommandCandidates(successor)).toHaveLength(1);
    expect(depthCommandCandidates(successor)[0]?.command).toEqual({
      type: "plan-route",
      destinationId: companion.destination.locationId,
    });
    expect(() => stepDepth(successor, { type: "plan-route", destinationId: lead.locationId })).toThrow("Shared Road Oath owns the next destination");

    const atDestination = arrive(planOathRoute(successor));
    expect(depthCommandCandidates(atDestination)[0]?.command).toMatchObject({ type: "farewell-companion" });
    let afterFarewell = stepDepth(atDestination, depthCommandCandidates(atDestination)[0]!.command);
    if (depthCommandCandidates(afterFarewell)[0]?.command.type === "visit-town") {
      afterFarewell = stepDepth(afterFarewell, depthCommandCandidates(afterFarewell)[0]!.command);
    }
    expect(depthCommandCandidates(afterFarewell)[0]?.command).toEqual({
      type: "plan-route",
      destinationId: lead.locationId,
    });
  });

  it("stages the fit companion as a real targetable ally and synchronizes exact damage through reload", () => {
    const joined = recruit(eligibleState("shared-road-target"));
    const started = startOathCombat(joined, 1);
    const companion = started.companions.active[0];
    const combat = started.combat;
    if (companion === undefined || combat === null) throw new Error("Companion combat fixture failed");
    const companionUnit = combat.combatants.find((unit) => unit.id === companion.identity.residentId);
    const enemy = combat.combatants.find((unit) => unit.side === "enemies");
    if (companionUnit === undefined || enemy === undefined) throw new Error("Companion combatants are missing");
    const tonic = started.hero.inventory.find((item) => item.restorative !== null);
    if (tonic === undefined) throw new Error("Companion combat fixture has no tonic");
    expect(() => stepDepth({
      ...started,
      combat: {
        ...combat,
        activeIndex: 0,
        turnOrder: [companionUnit.id, started.hero.id, enemy.id],
      },
    }, {
      type: "combat-action",
      action: { actorId: companionUnit.id, type: "item", targetId: companionUnit.id, abilityId: null, itemId: tonic.id },
    })).toThrow("unavailable");
    const staged = {
      ...combat,
      activeIndex: 0,
      turnOrder: [enemy.id, started.hero.id, companionUnit.id],
    };
    const damaged = stepDepth({ ...started, combat: staged }, {
      type: "combat-action",
      action: { actorId: enemy.id, type: "attack", targetId: companionUnit.id, abilityId: null, itemId: null },
    });
    const after = damaged.companions.active[0];
    expect(after?.resources.health).toBeLessThan(companion.resources.health);
    expect(after?.resources.health).toBe(
      damaged.combat?.combatants.find((unit) => unit.id === companion.identity.residentId)?.health,
    );
    const restored = upgradeDepthState(JSON.parse(JSON.stringify(damaged)), damaged.seed, damaged.hero.id, damaged.hero.name);
    expect(restored.companions).toEqual(damaged.companions);
  });

  it("keeps the companion active after victory and records the shared result exactly once", () => {
    const joined = recruit(eligibleState("shared-road-victory"));
    const started = startOathCombat(joined, 1);
    const companion = started.companions.active[0];
    const combat = started.combat;
    if (companion === undefined || combat === null) throw new Error("Companion victory fixture failed");
    const enemy = combat.combatants.find((unit) => unit.side === "enemies");
    if (enemy === undefined) throw new Error("Companion victory fixture has no enemy");
    const staged = {
      ...combat,
      activeIndex: 0,
      turnOrder: [companion.identity.residentId, started.hero.id, enemy.id],
      combatants: combat.combatants.map((unit) => unit.id === enemy.id ? { ...unit, health: 1 } : unit),
    };
    const resolved = stepDepth({ ...started, combat: staged }, {
      type: "combat-action",
      action: { actorId: companion.identity.residentId, type: "attack", targetId: enemy.id, abilityId: null, itemId: null },
    });
    expect(resolved.combat).toBeNull();
    expect(resolved.companions.active[0]).toMatchObject({
      identity: { residentId: companion.identity.residentId },
      victories: 1,
      bond: companion.bond + 2,
    });
  });

  it("allows a quiet road, arrives before farewell, and retires the companion exactly once", () => {
    const joined = recruit(eligibleState("shared-road-quiet"));
    const arrived = arrive(planOathRoute(joined));
    const companion = arrived.companions.active[0];
    expect(companion?.phase).toBe("arrived");
    expect(companion?.victories).toBe(0);
    const farewell = depthCommandCandidates(arrived)[0];
    expect(farewell?.command.type).toBe("farewell-companion");
    const departed = stepDepth(arrived, farewell?.command as DepthCommand);
    expect(departed.companions.active).toEqual([]);
    expect(departed.companions.former).toHaveLength(1);
    expect(departed.companions.former[0]).toMatchObject({
      victories: 0,
      departure: { outcome: "fulfilled", locationId: companion?.destination.locationId },
    });
    expect(depthCommandCandidates(departed).every((candidate) => candidate.command.type !== "farewell-companion")).toBe(true);
  });

  it("evacuates a fallen companion without resurrecting or restaging them in combat", () => {
    const joined = recruit(eligibleState("shared-road-injured"));
    const active = joined.companions.active[0];
    if (active === undefined) throw new Error("Injured companion fixture failed");
    const injured = {
      ...joined,
      companions: {
        ...joined.companions,
        active: [{ ...active, resources: { ...active.resources, health: 0 }, injury: "fallen" as const }],
      },
    };
    const combat = startOathCombat(injured, 1);
    expect(combat.combat?.combatants.some((unit) => unit.id === active.identity.residentId)).toBe(false);
    const withoutCombat = { ...combat, combat: null, completedCombats: [] };
    const arrived = arrive(withoutCombat);
    expect(arrived.companions.active[0]).toMatchObject({ phase: "arrived", injury: "fallen", resources: { health: 0 } });
    const farewell = depthCommandCandidates(arrived)[0];
    const departed = stepDepth(arrived, farewell?.command as DepthCommand);
    expect(departed.companions.former[0]?.departure.outcome).toBe("injured");
    expect(departed.companions.former[0]?.resources.health).toBe(0);
  });
});
