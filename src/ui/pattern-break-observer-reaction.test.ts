import { describe, expect, it } from "vitest";
import { canonicalHash, canonicalStringify } from "../core/canonical";
import { createForwardMotionState } from "../core/forward-motion";
import { advanceWorld, createWorld, upgradeWorldState } from "../core/simulation";
import type { WorldState } from "../core/types";
import { advanceDepth, stepDepth, unresolvedRouteEncounterId } from "../depth/state";
import { generateTown, townResidentRoles, visitTown } from "../depth/towns";
import {
  patternBreakObserverReactionVersion,
  projectPatternBreakObserverGesture,
  projectPatternBreakObserverReaction,
} from "./pattern-break-observer-reaction";

function eligibleWorld(seed: string): WorldState {
  const base = createWorld(seed, `campaign:${seed}`);
  const originId = base.depth.atlas.currentLocationId;
  const current = base.depth.atlas.locations.find(
    (location) => location.kind === "town" && location.id !== originId,
  );
  if (current === undefined) throw new Error("Observer reaction fixture needs a second town");
  const town = visitTown(generateTown(seed, current.id));
  return upgradeWorldState({
    ...base,
    scene: { ...base.scene, mode: "town", location: town.name },
    forwardMotion: createForwardMotionState(current.id, base.tick),
    depth: {
      ...base.depth,
      atlas: {
        ...base.depth.atlas,
        currentLocationId: current.id,
        discoveredLocationIds: [originId, current.id],
        route: null,
      },
      towns: { ...base.depth.towns, [current.id]: town },
    },
  });
}

let cachedEarnedReactionWorld: WorldState | null = null;

function earnedCompanionReactionWorld(): WorldState {
  if (cachedEarnedReactionWorld !== null) return cachedEarnedReactionWorld;
  for (let index = 0; index < 512; index += 1) {
    const seed = `pattern-break-observer:${index}`;
    const joined = advanceWorld(eligibleWorld(seed));
    const routed = advanceWorld(joined);
    const encounterId = unresolvedRouteEncounterId(routed.depth);
    if (encounterId === null || routed.depth.companions.active.length !== 1) continue;
    const started = stepDepth(routed.depth, { type: "start-counter-duel", encounterId });
    const armed = advanceDepth(started);
    if (armed.counterDuel?.patternBreak?.status !== "armed") continue;
    const preview = advanceDepth(armed);
    if (preview.completedCounterDuels.at(-1)?.patternBreak?.status !== "spent") continue;
    const world = upgradeWorldState({
      ...routed,
      tick: armed.tick,
      depth: armed,
      scene: {
        ...routed.scene,
        mode: "battle",
        headline: `Pattern Duel · Round 1 · ${armed.counterDuel.heroScore}–${armed.counterDuel.opponentScore}`,
        action: "The first prediction matched the public live tell and revealed stance.",
        consequence: "Opening armed · 1/2 confirmed reads · the next confirmed read breaks the pattern.",
        sensoryIntensity: 3,
      },
      lifecycle: {
        ...routed.lifecycle,
        simulationTick: armed.tick,
      },
    });
    const resolved = advanceWorld(world);
    if (projectPatternBreakObserverReaction(resolved) !== null) {
      cachedEarnedReactionWorld = resolved;
      return resolved;
    }
  }
  throw new Error("No deterministic companion Pattern Break reaction fixture found");
}

describe("Pattern Break observer reaction projection", () => {
  it("maps all eight generated roles to unique frozen visible gestures and restrains injury", () => {
    const gestures = townResidentRoles.map((role) =>
      projectPatternBreakObserverGesture(role, "Mira Vale", "travelling")
    );
    expect(gestures.every((gesture) => gesture !== null)).toBe(true);
    const present = gestures.filter((gesture) => gesture !== null);
    expect(new Set(present.map((gesture) => gesture.id)).size).toBe(townResidentRoles.length);
    expect(new Set(present.map((gesture) => gesture.cue)).size).toBe(townResidentRoles.length);
    for (const gesture of present) {
      expect(Object.isFrozen(gesture)).toBe(true);
      expect(gesture.caption).toContain("Mira Vale");
      expect(gesture.caption).toContain("second confirmed mark");
      expect(Math.abs(gesture.offsetX)).toBeLessThanOrEqual(4);
      expect(Math.abs(gesture.liftY)).toBeLessThanOrEqual(4);
      expect(Math.abs(gesture.tilt)).toBeLessThanOrEqual(0.08);
    }
    expect(projectPatternBreakObserverGesture("future-or-corrupt-role", "Mira Vale", "travelling")).toBeNull();

    for (const role of townResidentRoles) {
      const injured = projectPatternBreakObserverGesture(role, "Mira Vale", "injured");
      expect(injured).toMatchObject({
        id: "restrained-hand",
        label: "BRACED WITNESS",
        cue: "hand",
        offsetX: 0,
        liftY: -0.5,
        tilt: 0.015,
      });
      expect(injured?.caption).toContain("stays braced");
    }
  });

  it("admits only the exact persisted Break, Chronicle, species and visible companion join", () => {
    const world = earnedCompanionReactionWorld();
    const before = canonicalStringify(world);
    const hash = canonicalHash(world);
    const reaction = projectPatternBreakObserverReaction(world);
    const completed = world.depth.counterDuel ?? world.depth.completedCounterDuels.at(-1);
    const companion = world.depth.companions.active[0];
    const latest = completed?.history.at(-1);
    expect(reaction).toMatchObject({
      presentationVersion: 1,
      registryVersion: patternBreakObserverReactionVersion,
      eventId: `${world.campaignId}:${world.tick}`,
      tick: world.tick,
      campaignId: world.campaignId,
      commandId: `${world.campaignId}:depth:${world.tick}:counter-duel:${completed?.id}:${latest?.round}:${latest?.prediction}`,
      commandType: "counter-duel-action",
      duelId: completed?.id,
      round: latest?.round,
      signatureId: expect.stringContaining(completed?.opponentSpeciesId ?? "missing"),
      speciesId: completed?.opponentSpeciesId,
      companion: {
        id: companion?.identity.residentId,
        name: companion?.identity.name,
        role: companion?.identity.role,
        health: companion?.resources.health,
        maxHealth: companion?.combat.maxHealth,
      },
      motionMode: "full",
      dialogue: null,
      mechanicalEffect: 0,
    });
    expect(Object.isFrozen(reaction)).toBe(true);
    expect(Object.isFrozen(reaction?.companion)).toBe(true);
    expect(Object.isFrozen(reaction?.gesture)).toBe(true);
    expect(Object.keys(reaction ?? {})).toEqual([
      "presentationVersion",
      "registryVersion",
      "reactionId",
      "eventId",
      "tick",
      "campaignId",
      "commandId",
      "commandType",
      "duelId",
      "round",
      "signatureId",
      "speciesId",
      "signatureMotif",
      "companion",
      "motionMode",
      "gesture",
      "dialogue",
      "mechanicalEffect",
    ]);
    expect(Object.keys(reaction?.companion ?? {})).toEqual(["id", "name", "role", "status", "health", "maxHealth"]);
    expect(Object.keys(reaction?.gesture ?? {})).toEqual(["id", "label", "caption", "cue", "offsetX", "liftY", "tilt"]);
    expect(canonicalStringify(world)).toBe(before);
    expect(canonicalHash(world)).toBe(hash);
    expect(completed).toMatchObject({ heroScore: 2, stakes: { victoryExperience: 8, victoryGold: 5 } });
    expect(world.depth.companions.active[0]).toMatchObject({
      victories: companion?.victories,
      bond: companion?.bond,
      resources: companion?.resources,
    });

    const latestEntry = world.chronicle.at(-1);
    if (latestEntry === undefined || companion === undefined) throw new Error("Strict reaction fixture is incomplete");
    expect(projectPatternBreakObserverReaction({ ...world, scene: { ...world.scene, mode: "travel" } })).toBeNull();
    expect(projectPatternBreakObserverReaction({ ...world, chronicle: [] })).toBeNull();
    expect(projectPatternBreakObserverReaction({
      ...world,
      chronicle: [...world.chronicle.slice(0, -1), { ...latestEntry, tick: latestEntry.tick - 1 }],
    })).toBeNull();
    expect(projectPatternBreakObserverReaction({
      ...world,
      chronicle: [...world.chronicle.slice(0, -1), { ...latestEntry, commandType: "wait" }],
    })).toBeNull();
    expect(projectPatternBreakObserverReaction({
      ...world,
      chronicle: [...world.chronicle.slice(0, -1), { ...latestEntry, commandId: `${latestEntry.commandId}:wrong` }],
    })).toBeNull();
    expect(projectPatternBreakObserverReaction({
      ...world,
      depth: { ...world.depth, companions: { ...world.depth.companions, active: [] } },
    })).toBeNull();
    expect(projectPatternBreakObserverReaction({
      ...world,
      depth: {
        ...world.depth,
        companions: {
          ...world.depth.companions,
          active: [{ ...companion, identity: { ...companion.identity, role: "future-or-corrupt-role" } }],
        },
      },
    })).toBeNull();

    if (completed === undefined || latest === undefined || latest.patternBreak === undefined) {
      throw new Error("Receipt rejection fixture is incomplete");
    }
    const replaceCompleted = (replacement: typeof completed): WorldState => ({
      ...world,
      depth: world.depth.counterDuel === null
        ? {
            ...world.depth,
            completedCounterDuels: [...world.depth.completedCounterDuels.slice(0, -1), replacement],
          }
        : { ...world.depth, counterDuel: replacement },
    });
    expect(projectPatternBreakObserverReaction(replaceCompleted({
      ...completed,
      history: [...completed.history.slice(0, -1), {
        ...latest,
        patternBreak: { ...latest.patternBreak, triggered: false },
      }],
    }))).toBeNull();
    const { patternBreak: _legacyReceipt, ...legacyLatest } = latest;
    expect(projectPatternBreakObserverReaction(replaceCompleted({
      ...completed,
      history: [...completed.history.slice(0, -1), legacyLatest],
    }))).toBeNull();
    expect(projectPatternBreakObserverReaction(replaceCompleted({
      ...completed,
      opponentSpeciesId: "future-or-corrupt-species" as typeof completed.opponentSpeciesId,
    }))).toBeNull();
  });

  it("keeps an injured visible companion braced without implying recovery", () => {
    const world = earnedCompanionReactionWorld();
    const companion = world.depth.companions.active[0];
    if (companion === undefined) throw new Error("Injured reaction fixture has no companion");
    const injured: WorldState = {
      ...world,
      depth: {
        ...world.depth,
        companions: {
          ...world.depth.companions,
          active: [{
            ...companion,
            injury: "fallen",
            resources: { ...companion.resources, health: 0 },
          }],
        },
      },
    };
    expect(projectPatternBreakObserverReaction(injured)).toMatchObject({
      motionMode: "restrained",
      companion: { status: "injured", health: 0 },
      gesture: { id: "restrained-hand", label: "BRACED WITNESS", cue: "hand" },
      mechanicalEffect: 0,
    });
    expect(injured.depth.companions.active[0]?.resources.health).toBe(0);
  });
});
