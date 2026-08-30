import { describe, expect, it } from "vitest";
import { stepDepth } from "../depth/state";
import { generateTown, visitTown } from "../depth/towns";
import { isValidAtlasState } from "../depth/atlas";
import { isValidCompanionReferences, isValidCompanionRoster } from "../depth/companion";
import { assertForwardMotionReferences, createForwardMotionState } from "./forward-motion";
import {
  advanceWorld,
  campaignDirector,
  catchUpWorld,
  createWorld,
  upgradeWorldState,
} from "./simulation";
import type { WorldState } from "./types";

function eligibleWorld(seed: string): WorldState {
  const base = createWorld(seed, `campaign:${seed}`);
  const originId = base.depth.atlas.currentLocationId;
  const current = base.depth.atlas.locations.find(
    (location) => location.kind === "town" && location.id !== originId,
  );
  if (current === undefined) throw new Error("Shared-road world fixture needs a second town");
  const town = visitTown(generateTown(seed, current.id));
  const depth = {
    ...base.depth,
    atlas: {
      ...base.depth.atlas,
      currentLocationId: current.id,
      discoveredLocationIds: [originId, current.id],
      route: null,
    },
    towns: { ...base.depth.towns, [current.id]: town },
  };
  const world: WorldState = {
    ...base,
    scene: { ...base.scene, mode: "town", location: town.name },
    forwardMotion: createForwardMotionState(current.id, base.tick),
    depth,
  };
  return upgradeWorldState(JSON.parse(JSON.stringify(world)));
}

function activeCompanionCombatWorld(seed: string): WorldState {
  const joined = advanceWorld(eligibleWorld(seed));
  const routed = advanceWorld(joined);
  const depth = stepDepth(routed.depth, {
    type: "start-combat",
    encounterId: `encounter:${seed}`,
    enemyCount: 2,
  });
  return upgradeWorldState({
    ...routed,
    tick: depth.tick,
    hero: {
      ...routed.hero,
      health: depth.hero.resources.health,
      maxHealth: depth.hero.resources.maxHealth,
    },
    scene: {
      ...routed.scene,
      mode: "battle",
      headline: "The oath enters battle.",
      action: "Every combatant holds a canonical place.",
      consequence: "The next living unit acts.",
      sensoryIntensity: 3,
    },
    lifecycle: {
      ...routed.lifecycle,
      simulationTick: depth.tick,
      worldClockMinutes: routed.lifecycle.worldClockMinutes + 15,
    },
    depth,
  });
}

describe("Shared Road Oath world integration", () => {
  it("stops catch-up before the named recruitment event", () => {
    const before = eligibleWorld("shared-road-attention");
    const opportunity = campaignDirector(before);
    expect(opportunity.mode).toBe("chronicle");
    expect(opportunity.candidates).toHaveLength(1);
    expect(opportunity.candidates[0]?.command.type).toBe("recruit-companion");

    const caughtUp = catchUpWorld(before, {
      id: "observation:shared-road-attention",
      observedAtMs: 60_000,
      elapsedMs: 60_000,
      requestedTicks: 8,
    });
    expect(caughtUp.tick).toBe(before.tick);
    expect(caughtUp.depth.companions.active).toEqual([]);
    expect(caughtUp.pendingAttention).toHaveLength(1);
    expect(caughtUp.pendingAttention[0]).toMatchObject({
      tick: before.tick + 1,
      mode: "chronicle",
      commandType: "recruit-companion",
    });
  });

  it("owns its promised route and reaches one separate farewell beat", () => {
    let world = eligibleWorld("shared-road-world-arc");
    world = advanceWorld(world);
    const companion = world.depth.companions.active[0];
    if (companion === undefined) throw new Error("Shared-road world fixture did not recruit");
    expect(world.scene.headline).toContain(companion.identity.name);

    const route = campaignDirector(world);
    expect(route.forwardMotionReason).toBe("companion-oath");
    expect(route.candidates).toHaveLength(1);
    expect(route.candidates[0]?.command).toEqual({
      type: "plan-route",
      destinationId: companion.destination.locationId,
    });

    const seenCommands: string[] = [];
    for (let step = 0; step < 96 && world.depth.companions.former.length === 0; step += 1) {
      const opportunity = campaignDirector(world);
      const command = opportunity.candidates[0]?.command;
      if (command !== undefined) seenCommands.push(command.type);
      expect(command?.type).not.toBe("enter-dungeon");
      world = advanceWorld(world);
      expect(isValidAtlasState(world.depth.atlas), `atlas after ${command?.type}`).toBe(true);
      expect(isValidCompanionRoster(world.depth.companions), `roster after ${command?.type}`).toBe(true);
      expect(
        isValidCompanionReferences(world.depth.companions, world.depth.atlas, world.depth.towns),
        `companion references after ${command?.type}`,
      ).toBe(true);
      expect(assertForwardMotionReferences(world), `forward motion after ${command?.type}`).toBe(true);
      try {
        upgradeWorldState(JSON.parse(JSON.stringify(world)));
      } catch (error) {
        throw new Error(`Invalid world after ${command?.type ?? "unknown"} at tick ${world.tick}: ${JSON.stringify({
          location: world.depth.atlas.currentLocationId,
          route: world.depth.atlas.route,
          companion: world.depth.companions.active[0],
          combat: world.depth.combat?.id ?? null,
        })}`, { cause: error });
      }
    }

    expect(world.depth.companions.active).toEqual([]);
    expect(world.depth.companions.former).toHaveLength(1);
    expect(world.depth.companions.former[0]?.identity.residentId).toBe(companion.identity.residentId);
    expect(world.depth.companions.former[0]?.departure.locationId).toBe(companion.destination.locationId);
    expect(seenCommands.at(-1)).toBe("farewell-companion");
    expect(world.chronicle.at(-1)?.commandType).toBe("farewell-companion");
  });

  it("rejects missing, forged, and resource-divergent companion combatants", () => {
    const valid = activeCompanionCombatWorld("shared-road-combat-link");
    const companion = valid.depth.companions.active[0];
    const combat = valid.depth.combat;
    if (companion === undefined || combat === null) throw new Error("Companion combat-link fixture failed");
    const companionId = companion.identity.residentId;

    const missing = JSON.parse(JSON.stringify(valid)) as WorldState;
    if (missing.depth.combat === null) throw new Error("Missing-link fixture lost combat");
    missing.depth.combat.combatants = missing.depth.combat.combatants.filter((unit) => unit.id !== companionId);
    missing.depth.combat.turnOrder = missing.depth.combat.turnOrder.filter((id) => id !== companionId);
    missing.depth.combat.activeIndex = 0;

    const forged = JSON.parse(JSON.stringify(valid)) as WorldState;
    if (forged.depth.combat === null) throw new Error("Forged-link fixture lost combat");
    forged.depth.combat.combatants = forged.depth.combat.combatants.map((unit) =>
      unit.id === companionId ? { ...unit, power: unit.power + 1 } : unit
    );

    const divergent = JSON.parse(JSON.stringify(valid)) as WorldState;
    const divergentCompanion = divergent.depth.companions.active[0];
    if (divergentCompanion === undefined) throw new Error("Divergent-link fixture lost companion");
    divergent.depth.companions.active = [{
      ...divergentCompanion,
      resources: {
        ...divergentCompanion.resources,
        health: Math.max(1, divergentCompanion.resources.health - 1),
      },
    }];

    for (const malformed of [missing, forged, divergent]) {
      expect(() => upgradeWorldState(malformed)).toThrow("schema invariants");
    }
  });

  it("awards hero combat experience only for the hero's own turns", () => {
    let world = activeCompanionCombatWorld("shared-road-party-experience");
    const companionId = world.depth.companions.active[0]?.identity.residentId;
    if (companionId === undefined) throw new Error("Party-experience fixture lost companion");
    let sawCompanionTurn = false;
    let sawEnemyTurn = false;
    for (let turn = 0; turn < 16 && world.depth.combat !== null; turn += 1) {
      const combat = world.depth.combat;
      const actorId = combat.turnOrder[combat.activeIndex];
      const beforeExperience = world.hero.experience;
      world = advanceWorld(world);
      expect(world.hero.experience - beforeExperience).toBe(actorId === world.hero.id ? 8 : 0);
      if (actorId === companionId) sawCompanionTurn = true;
      if (actorId !== companionId && actorId !== world.hero.id) sawEnemyTurn = true;
    }
    expect(sawCompanionTurn).toBe(true);
    expect(sawEnemyTurn).toBe(true);
  });
});
