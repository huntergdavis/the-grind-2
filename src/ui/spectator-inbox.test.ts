import { describe, expect, it } from "vitest";
import {
  attentionPolicyForMode,
  createWorld,
  eventPolicyForMode,
} from "../core/simulation";
import type { SceneMode, WorldState } from "../core/types";
import { advanceDepth, stepDepth } from "../depth/state";
import type { DepthState, DungeonState, ItemState } from "../depth/types";
import {
  beginSpectatorAbsence,
  createSpectatorInbox,
  markSpectatorInboxRead,
  maximumSpectatorDetails,
  maximumSpectatorMoments,
  observeSpectatorInbox,
} from "./spectator-inbox";

function withDepth(before: WorldState, depth: DepthState, mode: SceneMode): WorldState {
  const tick = depth.tick;
  const location = depth.atlas.locations.find((entry) => entry.id === depth.atlas.currentLocationId)?.name
    ?? before.scene.location;
  const scene = {
    ...before.scene,
    mode,
    location,
    headline: `${mode} at tick ${tick}`,
    action: `Canonical ${mode} action`,
    consequence: `Canonical ${mode} consequence`,
  };
  const entry = {
    ...scene,
    id: `${before.campaignId}:${tick}`,
    tick,
    attention: attentionPolicyForMode(mode),
    consideredActions: [`consider ${mode}`],
    chosenAction: `choose ${mode}`,
    rationale: `fixture ${mode}`,
    policy: eventPolicyForMode(mode),
    commandId: `${before.campaignId}:fixture:${tick}:${mode}`,
  };
  return {
    ...before,
    tick,
    depth,
    scene,
    chronicle: [...before.chronicle.slice(-31), entry],
    lifecycle: {
      ...before.lifecycle,
      simulationTick: tick,
      attentionClock: before.lifecycle.attentionClock + (entry.attention === "backgroundSafe" ? 0 : 1),
    },
  };
}

function routineBeat(before: WorldState): WorldState {
  return withDepth(before, { ...before.depth, tick: before.depth.tick + 1 }, "travel");
}

describe("spectator inbox", () => {
  it("ignores routine beats and repeated observation without mutating canonical state", () => {
    const before = createWorld("spectator-routine", "campaign:routine");
    const after = routineBeat(before);
    const beforeBytes = JSON.stringify(before);
    const afterBytes = JSON.stringify(after);
    const initial = createSpectatorInbox(before);
    const observed = observeSpectatorInbox(initial, before, after, true);
    expect(observed.items).toEqual([]);
    expect(observed.unread).toBe(0);
    expect(observeSpectatorInbox(observed, before, after, true)).toBe(observed);
    expect(JSON.stringify(before)).toBe(beforeBytes);
    expect(JSON.stringify(after)).toBe(afterBytes);
  });

  it("coalesces a real battle from first threat through exact outcome and rewards", () => {
    let before = createWorld("spectator-battle", "campaign:battle");
    let inbox = createSpectatorInbox(before);
    let after = withDepth(
      before,
      stepDepth(before.depth, { type: "start-combat", encounterId: "encounter:spectator", enemyCount: 1 }),
      "battle",
    );
    inbox = observeSpectatorInbox(inbox, before, after, true);
    expect(inbox.items).toHaveLength(1);
    const origin = after.chronicle.at(-1)!;
    const originId = inbox.items[0]?.id;
    expect(inbox.items[0]).toMatchObject({
      kind: "battle",
      status: "ongoing",
      title: "Battle joined",
      sourceId: origin.id,
      latestSourceId: origin.id,
      provenance: "chronicle",
    });
    expect(originId?.startsWith(`${origin.id}:battle:`)).toBe(true);

    before = after;
    after = withDepth(before, {
      ...before.depth,
      tick: before.depth.tick + 1,
      hero: { ...before.depth.hero, level: before.depth.hero.level + 1 },
    }, "battle");
    inbox = observeSpectatorInbox(inbox, before, after, true);
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]?.id).toBe(originId);
    expect(inbox.items[0]?.sourceId).toBe(origin.id);
    expect(inbox.items[0]?.latestSourceId).toBe(after.chronicle.at(-1)?.id);
    expect(inbox.items[0]?.title).toBe("Battle in progress");
    expect(inbox.items[0]?.details).toContain(`Reached hero level ${after.depth.hero.level}`);

    for (let turn = 0; turn < 80 && after.depth.combat !== null; turn += 1) {
      before = after;
      after = withDepth(before, advanceDepth(before.depth), "battle");
      inbox = observeSpectatorInbox(inbox, before, after, true);
    }
    expect(after.depth.combat).toBeNull();
    expect(inbox.items).toHaveLength(1);
    expect(inbox.unread).toBe(1);
    expect(inbox.items[0]?.status).toBe("resolved");
    expect(inbox.items[0]?.details).toContain("Outcome · Victory");
    expect(inbox.items[0]?.details.some((detail) => detail.startsWith("Gained "))).toBe(true);
  });

  it("coalesces real dungeon entry, landmarks, and completion into one episode", () => {
    let before = createWorld("spectator-dungeon", "campaign:dungeon");
    let inbox = createSpectatorInbox(before);
    let after = withDepth(
      before,
      stepDepth(before.depth, { type: "enter-dungeon", dungeonId: "dungeon:spectator", width: 5, height: 5 }),
      "dungeon",
    );
    inbox = observeSpectatorInbox(inbox, before, after, true);
    const maximumTurns = (after.depth.dungeon?.cells.length ?? 0) * 2;
    for (let turn = 0; turn < maximumTurns && !after.depth.dungeon?.completed; turn += 1) {
      before = after;
      after = withDepth(before, advanceDepth(before.depth), "dungeon");
      inbox = observeSpectatorInbox(inbox, before, after, true);
    }
    expect(after.depth.dungeon?.completed).toBe(true);
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]).toMatchObject({ kind: "dungeon", status: "resolved" });
    expect(inbox.items[0]?.title).toContain("Crossed");
  });

  it("retains exact trap damage when the same step crosses the maze", () => {
    const base = createWorld("spectator-trap", "campaign:trap");
    const id = "dungeon:spectator-trap";
    const entry = `${id}:cell:0,0`;
    const trap = `${id}:cell:1,0`;
    const dungeon: DungeonState = {
      id,
      name: "Ashen Archive",
      width: 2,
      height: 1,
      cells: [
        { id: entry, x: 0, y: 0, exits: ["east"], feature: "empty" },
        { id: trap, x: 1, y: 0, exits: ["west"], feature: "trap" },
      ],
      entryCellId: entry,
      exitCellId: trap,
      currentCellId: entry,
      visitedCellIds: [entry],
      discoveredCellIds: [entry, trap],
      traps: [{ cellId: trap, kind: "tripwire", detectDifficulty: 14, disarmDifficulty: 16, phase: "hidden" }],
      traversalLog: ["Entered the maze."],
      turns: 0,
      completed: false,
    };
    const before: WorldState = { ...base, depth: { ...base.depth, dungeon } };
    const after = withDepth(before, stepDepth(before.depth, { type: "move-dungeon", direction: "east" }), "dungeon");
    const healthLost = before.depth.hero.resources.health - after.depth.hero.resources.health;
    const inbox = observeSpectatorInbox(createSpectatorInbox(before), before, after, true);

    expect(inbox.items[0]).toMatchObject({ kind: "dungeon", status: "resolved", title: "Crossed Ashen Archive" });
    expect(inbox.items[0]?.details).toEqual(expect.arrayContaining([
      `Trap sprung · ${healthLost} health lost`,
      `Health · ${after.depth.hero.resources.health}/${after.depth.hero.resources.maxHealth}`,
    ]));

  });

  it("retains failed disarm damage when the hero is already in the trap cell", () => {
    const base = createWorld("spectator-disarm", "campaign:disarm");
    const id = "dungeon:spectator-disarm";
    const entry = `${id}:cell:0,0`;
    const trap = `${id}:cell:1,0`;
    const exit = `${id}:cell:2,0`;
    const dungeon: DungeonState = {
      id,
      name: "Clockroot Vault",
      width: 3,
      height: 1,
      cells: [
        { id: entry, x: 0, y: 0, exits: ["east"], feature: "empty" },
        { id: trap, x: 1, y: 0, exits: ["east", "west"], feature: "trap" },
        { id: exit, x: 2, y: 0, exits: ["west"], feature: "empty" },
      ],
      entryCellId: entry,
      exitCellId: exit,
      currentCellId: trap,
      visitedCellIds: [entry, trap],
      discoveredCellIds: [entry, trap, exit],
      traps: [{ cellId: trap, kind: "tripwire", detectDifficulty: 10, disarmDifficulty: 16, phase: "detected" }],
      traversalLog: ["A whisper-wire blocks the passage."],
      turns: 1,
      completed: false,
    };
    const before: WorldState = {
      ...base,
      depth: {
        ...base.depth,
        dungeon,
        hero: { ...base.depth.hero, attributes: { ...base.depth.hero.attributes, agility: 0 } },
      },
    };
    const after = withDepth(before, stepDepth(before.depth, { type: "disarm-dungeon-trap" }), "dungeon");
    const healthLost = before.depth.hero.resources.health - after.depth.hero.resources.health;
    const inbox = observeSpectatorInbox(createSpectatorInbox(before), before, after, true);

    expect(inbox.items[0]).toMatchObject({ kind: "dungeon", status: "ongoing", title: "Trap sprung in Clockroot Vault" });
    expect(inbox.items[0]?.details).toEqual(expect.arrayContaining([
      `Trap sprung · ${healthLost} health lost`,
      `Health · ${after.depth.hero.resources.health}/${after.depth.hero.resources.maxHealth}`,
    ]));

    const exitBefore: WorldState = {
      ...before,
      depth: { ...before.depth, dungeon: { ...dungeon, exitCellId: trap } },
    };
    const exitAfter = withDepth(exitBefore, stepDepth(exitBefore.depth, { type: "disarm-dungeon-trap" }), "dungeon");
    const exitInbox = observeSpectatorInbox(createSpectatorInbox(exitBefore), exitBefore, exitAfter, true);
    expect(exitInbox.items[0]).toMatchObject({ kind: "dungeon", status: "resolved", title: "Crossed Clockroot Vault" });
    expect(exitInbox.items[0]?.details).toEqual(expect.arrayContaining([
      `Trap sprung · ${exitBefore.depth.hero.resources.health - exitAfter.depth.hero.resources.health} health lost`,
      `Health · ${exitAfter.depth.hero.resources.health}/${exitAfter.depth.hero.resources.maxHealth}`,
    ]));
    expect(observeSpectatorInbox(exitInbox, exitBefore, exitAfter, true)).toBe(exitInbox);
  });

  it("groups exact arrival, quest, growth, item, and equipment deltas", () => {
    const before = createWorld("spectator-deltas", "campaign:deltas");
    const destination = before.depth.atlas.locations.find(
      (location) => location.id !== before.depth.atlas.currentLocationId
        && !before.depth.atlas.discoveredLocationIds.includes(location.id),
    );
    expect(destination).toBeDefined();
    const reward: ItemState = {
      id: "item:spectator-charm",
      name: "Wayfinder Bell",
      kind: "equipment",
      slot: "charm",
      rarity: "rare",
      quantity: 1,
      modifiers: { luck: 2 },
    };
    const objective = before.depth.quest.objectives[0];
    expect(objective).toBeDefined();
    const depth: DepthState = {
      ...before.depth,
      tick: 1,
      atlas: {
        ...before.depth.atlas,
        currentLocationId: destination?.id ?? before.depth.atlas.currentLocationId,
        discoveredLocationIds: [...before.depth.atlas.discoveredLocationIds, destination?.id ?? "missing"],
      },
      hero: {
        ...before.depth.hero,
        level: before.depth.hero.level + 1,
        inventory: [...before.depth.hero.inventory, reward],
        equipment: { ...before.depth.hero.equipment, charm: reward.id },
      },
      quest: {
        ...before.depth.quest,
        objectives: before.depth.quest.objectives.map((entry) => entry.id === objective?.id
          ? { ...entry, current: entry.target, status: "complete" as const }
          : entry),
      },
    };
    const after = withDepth(before, depth, "travel");
    const inbox = observeSpectatorInbox(createSpectatorInbox(before), before, after, true);
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]?.kind).toBe("arrival");
    expect(inbox.items[0]?.details).toEqual(expect.arrayContaining([
      `Discovered ${destination?.name} · ${destination?.kind}`,
      `Objective complete · ${objective?.description} ${objective?.target}/${objective?.target}`,
      `Reached hero level ${before.depth.hero.level + 1}`,
      "Gained Wayfinder Bell",
      "Equipped Wayfinder Bell · charm",
    ]));
  });

  it("bounds retained moments and accounts for evicted and truncated beats", () => {
    let before = createWorld("spectator-bound", "campaign:bound");
    let inbox = createSpectatorInbox(before);
    for (let index = 0; index < maximumSpectatorMoments + 2; index += 1) {
      const after = withDepth(before, {
        ...before.depth,
        tick: before.depth.tick + 1,
        hero: { ...before.depth.hero, level: before.depth.hero.level + 1 },
      }, "training");
      inbox = observeSpectatorInbox(inbox, before, after, true);
      before = after;
    }
    expect(inbox.items).toHaveLength(maximumSpectatorMoments);
    expect(inbox.unread).toBe(maximumSpectatorMoments);
    expect(inbox.dropped).toBe(2);

    const jumped = withDepth(before, {
      ...before.depth,
      tick: before.depth.tick + 40,
      hero: { ...before.depth.hero, level: before.depth.hero.level + 1 },
    }, "training");
    const truncated = observeSpectatorInbox(inbox, before, {
      ...jumped,
      chronicle: [jumped.chronicle.at(-1)!],
    }, true);
    expect(truncated.dropped).toBe(3);
    expect(truncated.unavailableTicks).toBe(39);
    expect(truncated.items.at(-1)).toMatchObject({
      provenance: "aggregate",
      sourceId: null,
      latestSourceId: null,
      location: "Catch-up interval",
      fromTick: before.tick + 1,
      tick: jumped.tick,
    });
  });

  it("bounds card details and reports every omitted exact delta", () => {
    const before = createWorld("spectator-details", "campaign:details");
    const rewards: ItemState[] = Array.from({ length: maximumSpectatorDetails + 3 }, (_, index) => ({
      id: `item:spectator:${index}`,
      name: `Spectator Relic ${index + 1}`,
      kind: "key",
      slot: null,
      rarity: "common",
      quantity: 1,
      modifiers: {},
    }));
    const after = withDepth(before, {
      ...before.depth,
      tick: before.depth.tick + 1,
      hero: {
        ...before.depth.hero,
        inventory: [...before.depth.hero.inventory, ...rewards],
      },
    }, "town");
    const inbox = observeSpectatorInbox(createSpectatorInbox(before), before, after, true);
    expect(inbox.items[0]?.details).toHaveLength(maximumSpectatorDetails);
    expect(inbox.items[0]?.omittedDetails).toBe(3);
  });

  it("marks retained moments read, clears them on the next absence, and resets campaigns", () => {
    const before = createWorld("spectator-read", "campaign:read");
    const after = withDepth(before, {
      ...before.depth,
      tick: 1,
      hero: { ...before.depth.hero, level: before.depth.hero.level + 1 },
    }, "training");
    const captured = observeSpectatorInbox(createSpectatorInbox(before), before, after, true);
    const read = markSpectatorInboxRead(captured);
    expect(read.unread).toBe(0);
    expect(read.items).toHaveLength(1);
    expect(beginSpectatorAbsence(read, after)).toMatchObject({
      items: [],
      dropped: 0,
      unavailableTicks: 0,
      unread: 0,
      cursorTick: 1,
    });

    const other = createWorld("spectator-other", "campaign:other");
    const reset = observeSpectatorInbox(captured, after, other, true);
    expect(reset).toEqual(createSpectatorInbox(other));
  });
});
