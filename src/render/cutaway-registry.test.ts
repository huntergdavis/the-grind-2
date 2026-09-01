import { describe, expect, it } from "vitest";
import {
  completeCutaway,
  createCutawayCandidate,
  createCutawayQueue,
  createCutawayRegistry,
  cutawayRepetitionFingerprint,
  cutawayRegistry,
  discardPendingCutaway,
  offerCutaway,
  resolveCutawayCandidate,
  type AnyCutawayCandidate,
  type CutawayPacketEnvelope,
  type CutawayRecipeV1,
  type CutawayStaticEnvelopeV1,
} from "./cutaway-registry";

function packet(eventId: string, schemaVersion = 1): CutawayPacketEnvelope {
  return Object.freeze({ schemaVersion, eventId, tick: 12 });
}

function staticEnvelope(eventId: string): CutawayStaticEnvelopeV1 {
  return Object.freeze({
    schemaVersion: 1,
    eventId,
    tick: 12,
    location: "The verified road",
    headline: "A resolved moment",
    action: "The canonical action already happened.",
    consequence: "The Chronicle retains its exact outcome.",
  });
}

function candidate(recipeKey: string, eventId: string, schemaVersion = 1): AnyCutawayCandidate {
  if (recipeKey === "trap-resolution@1") {
    return createCutawayCandidate(recipeKey, Object.freeze({
      schemaVersion,
      eventId,
      tick: 12,
      commandId: "move:east",
      commandType: "move-dungeon",
      heroId: "hero:1",
      dungeonId: "dungeon:1",
      cellId: "dungeon:1:cell:1,1",
      trapKind: "tripwire",
      phaseBefore: "hidden",
      phaseAfter: "detected",
      stage: "detect",
      attribute: "intellect",
      skill: 12,
      roll: 2,
      total: 14,
      difficulty: 13,
      success: true,
      healthBefore: 40,
      damage: 0,
      healthAfter: 40,
      maxHealth: 40,
      dungeonCompletedBefore: false,
      dungeonCompletedAfter: false,
      completedExit: false,
      crossMazeBefore: 0,
      crossMazeAfter: 0,
      crossMazeDelta: 0,
    }), staticEnvelope(eventId));
  }
  if (recipeKey === "companion-farewell@1") {
    return createCutawayCandidate(recipeKey, Object.freeze({
      schemaVersion,
      eventId,
      tick: 12,
      commandId: "campaign:depth:12:companion:farewell:resident:1",
      commandType: "farewell-companion",
      heroId: "hero:1",
      companionId: "resident:1",
      companionName: "Hale Vale",
      profession: "baker",
      disposition: "warm",
      originTownId: "town:1",
      originLocationId: "location:1",
      originName: "Amberwick",
      destinationId: "location:2",
      destinationName: "Mossmarket",
      purpose: "shared-road-oath",
      joinedTick: 2,
      departureTick: 12,
      outcome: "fulfilled",
      injury: "none",
      health: 22,
      maxHealth: 22,
      victories: 0,
      bond: 36,
    }), staticEnvelope(eventId));
  }
  return createCutawayCandidate(recipeKey, packet(eventId, schemaVersion), staticEnvelope(eventId));
}

function testRecipe(key = "test-tableau@1"): CutawayRecipeV1 {
  return {
    registryVersion: 1,
    key,
    packetSchemaVersion: 1,
    phaseOrder: ["fact", "final"],
    terminalPhase: "final",
    actorRequirements: ["hero"],
    propRequirements: [],
    truthCueIds: ["test-fact"],
    allowedFlavorIds: [],
    durationBudget: { targetMs: 1_000, maximumMs: 2_000, staticHoldMs: 500 },
    effectBudget: { movingActors: 1, cameraShots: 1, flavorLayers: 0 },
    terminalTableau: "test-terminal-fact",
    domEquivalentId: "test-cutaway",
    reducedMotion: "complete-static-tableau",
    repetitionFingerprintVersion: null,
    repetitionFingerprintFields: [],
  };
}

function containsFunction(value: unknown): boolean {
  if (typeof value === "function") return true;
  if (Array.isArray(value)) return value.some(containsFunction);
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).some(containsFunction);
}

function objectKeys(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.flatMap(objectKeys);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, entry]) => [key, ...objectKeys(entry)]);
}

describe("versioned presentation cutaway registry", () => {
  it("registers exactly the two production recipes as frozen capability-free data", () => {
    expect(cutawayRegistry.schemaVersion).toBe(1);
    expect(cutawayRegistry.recipes.map((recipe) => recipe.key)).toEqual([
      "trap-resolution@1",
      "companion-farewell@1",
    ]);
    expect(Object.isFrozen(cutawayRegistry)).toBe(true);
    expect(Object.isFrozen(cutawayRegistry.recipes)).toBe(true);
    expect(cutawayRegistry.recipes.every(Object.isFrozen)).toBe(true);
    expect(cutawayRegistry.recipes.every((recipe) => Object.isFrozen(recipe.durationBudget))).toBe(true);
    expect(cutawayRegistry.recipes.every((recipe) => Object.isFrozen(recipe.repetitionFingerprintFields))).toBe(true);
    expect(containsFunction(cutawayRegistry)).toBe(false);
    expect(objectKeys(cutawayRegistry)).not.toEqual(expect.arrayContaining([
      "command",
      "reducer",
      "repository",
      "simulation",
      "random",
      "storage",
      "mutate",
    ]));
  });

  it("rejects duplicate, malformed, unbounded, and extra-key registrations", () => {
    expect(() => createCutawayRegistry([testRecipe(), testRecipe()])).toThrow(/Duplicate/);
    expect(() => createCutawayRegistry([{ ...testRecipe(), phaseOrder: [] }])).toThrow(/Invalid/);
    expect(() => createCutawayRegistry([{
      ...testRecipe(),
      registryVersion: 2,
    } as unknown as CutawayRecipeV1])).toThrow(/Invalid/);
    expect(() => createCutawayRegistry([{ ...testRecipe(), durationBudget: {
      targetMs: 2_001,
      maximumMs: 2_000,
      staticHoldMs: 500,
    } }])).toThrow(/Invalid/);
    expect(() => createCutawayRegistry([{ ...testRecipe(), allowedFlavorIds: Array.from({ length: 9 }, (_, index) => `flavor-${index}`) }])).toThrow(/Invalid/);
    const extra = { ...testRecipe(), mutateWorld: "forbidden" } as unknown as CutawayRecipeV1;
    expect(() => createCutawayRegistry([extra])).toThrow(/Invalid/);
  });

  it("fails unknown recipe and packet versions to the independently validated Chronicle envelope", () => {
    const unknownRegistryVersion = {
      ...candidate("trap-resolution@1", "event:registry-v2"),
      registryVersion: 2,
    } as unknown as AnyCutawayCandidate;
    expect(resolveCutawayCandidate(cutawayRegistry, unknownRegistryVersion)).toMatchObject({
      mode: "static-chronicle",
      reason: "unknown-registry-version",
      staticEnvelope: unknownRegistryVersion.staticEnvelope,
    });

    const unknown = candidate("unknown-recipe@1", "event:unknown");
    expect(resolveCutawayCandidate(cutawayRegistry, unknown)).toEqual({
      mode: "static-chronicle",
      reason: "unknown-recipe",
      recipe: null,
      staticEnvelope: unknown.staticEnvelope,
    });

    const wrongPacketVersion = candidate("trap-resolution@1", "event:packet-v2", 2);
    expect(resolveCutawayCandidate(cutawayRegistry, wrongPacketVersion)).toMatchObject({
      mode: "static-chronicle",
      reason: "packet-version-mismatch",
      staticEnvelope: wrongPacketVersion.staticEnvelope,
    });

    const invalidEnvelope = {
      ...candidate("trap-resolution@1", "event:invalid-envelope"),
      staticEnvelope: { ...staticEnvelope("another:event"), eventId: "another:event" },
    } as AnyCutawayCandidate;
    expect(resolveCutawayCandidate(cutawayRegistry, invalidEnvelope)).toMatchObject({
      mode: "static-chronicle",
      reason: "invalid-packet-envelope",
      staticEnvelope: null,
    });

    const invalidProductionShape = createCutawayCandidate(
      "trap-resolution@1",
      packet("event:not-a-trap"),
      staticEnvelope("event:not-a-trap"),
    );
    expect(resolveCutawayCandidate(cutawayRegistry, invalidProductionShape)).toMatchObject({
      mode: "static-chronicle",
      reason: "invalid-packet-envelope",
    });
  });

  it("rejects semantically forged production packets and extra packet capabilities", () => {
    const trap = candidate("trap-resolution@1", "event:forged-trap");
    for (const forgedPacket of [
      { ...trap.packet, total: 999 },
      { ...trap.packet, success: false },
      { ...trap.packet, mutateWorld: "forbidden" },
    ]) {
      const forged = createCutawayCandidate("trap-resolution@1", forgedPacket, trap.staticEnvelope);
      expect(resolveCutawayCandidate(cutawayRegistry, forged)).toMatchObject({
        mode: "static-chronicle",
        reason: "invalid-packet-envelope",
      });
    }

    const farewell = candidate("companion-farewell@1", "event:forged-farewell");
    for (const forgedPacket of [
      { ...farewell.packet, departureTick: 11 },
      { ...farewell.packet, injury: "wounded" },
      { ...farewell.packet, extraActor: "forbidden" },
    ]) {
      const forged = createCutawayCandidate("companion-farewell@1", forgedPacket, farewell.staticEnvelope);
      expect(resolveCutawayCandidate(cutawayRegistry, forged)).toMatchObject({
        mode: "static-chronicle",
        reason: "invalid-packet-envelope",
      });
    }
  });

  it("derives semantic repetition separately from event identity using recipe-declared fields", () => {
    const first = candidate("trap-resolution@1", "event:semantic-a");
    const second = candidate("trap-resolution@1", "event:semantic-b");
    expect(cutawayRepetitionFingerprint(cutawayRegistry, first)).toBe(
      'trap-resolution@1|v1|trapKind="tripwire"|stage="detect"|phaseAfter="detected"|completedExit=false',
    );
    expect(cutawayRepetitionFingerprint(cutawayRegistry, second)).toBe(
      cutawayRepetitionFingerprint(cutawayRegistry, first),
    );
    expect(cutawayRepetitionFingerprint(
      cutawayRegistry,
      candidate("companion-farewell@1", "event:no-fingerprint"),
    )).toBeNull();
  });

  it("keeps one heterogeneous active and pending candidate with exact dedupe and FIFO promotion", () => {
    const trap = candidate("trap-resolution@1", "event:trap");
    const farewell = candidate("companion-farewell@1", "event:farewell");
    const overflow = candidate("trap-resolution@1", "event:overflow");
    let queue = createCutawayQueue();
    const started = offerCutaway(cutawayRegistry, queue, trap);
    expect(started.action).toBe("start");
    queue = started.queue;
    expect(offerCutaway(cutawayRegistry, queue, trap).action).toBe("deduplicated");
    const queued = offerCutaway(cutawayRegistry, queue, farewell);
    expect(queued.action).toBe("queued");
    queue = queued.queue;
    expect(offerCutaway(cutawayRegistry, queue, farewell).action).toBe("deduplicated");
    expect(offerCutaway(cutawayRegistry, queue, overflow)).toMatchObject({ action: "dropped", queue });
    expect(completeCutaway(queue)).toEqual({ active: farewell, pending: null });
    expect(discardPendingCutaway(queue)).toEqual({ active: trap, pending: null });
  });

  it("registers and queues a synthetic third recipe without a new controller branch", () => {
    const registry = createCutawayRegistry([...cutawayRegistry.recipes, testRecipe()]);
    const third = candidate("test-tableau@1", "event:third");
    const offered = offerCutaway(registry, createCutawayQueue(), third);
    expect(offered.action).toBe("start");
    expect(offered.resolution).toMatchObject({
      mode: "animate",
      reason: "registered",
      recipe: { key: "test-tableau@1" },
    });
    expect(offered.queue.active).toEqual(third);
  });

  it("does not let an unsupported candidate occupy or mutate the queue", () => {
    const queue = offerCutaway(
      cutawayRegistry,
      createCutawayQueue(),
      candidate("trap-resolution@1", "event:active"),
    ).queue;
    const fallback = offerCutaway(
      cutawayRegistry,
      queue,
      candidate("future-montage@9", "event:future"),
    );
    expect(fallback.action).toBe("fallback");
    expect(fallback.queue).toBe(queue);
    expect(fallback.resolution.mode).toBe("static-chronicle");
  });
});
