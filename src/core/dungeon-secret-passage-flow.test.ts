import { beforeAll, describe, expect, it } from "vitest";
import { releasedDungeonSecretPassageBeforeClueFixture, releasedDungeonSecretPassageFixture } from "../../tests/dungeon-secret-passage-fixtures";
import { dungeonEffectiveExits, dungeonSecretPassageCommandId, isDungeonPassageOpen, isValidDungeonSecretPassage, projectDungeonSecretPassageCue } from "../depth/dungeon";
import { depthCommandCandidates, selectAvailableDungeonSecretPassage, stepDepth, upgradeDepthState } from "../depth/state";
import type { DepthCommand } from "../depth/types";
import { actorPolicy } from "./actor-policy";
import { canonicalStringify } from "./canonical";
import { advanceWorld, campaignDirector, upgradeWorldState } from "./simulation";
import type { WorldState } from "./types";

describe("a released v171 save resumes its earned draught and useful dungeon shortcut", () => {
  let beforeClue: WorldState, ready: WorldState, opened: WorldState, crossed: WorldState;
  beforeAll(() => {
    beforeClue = releasedDungeonSecretPassageBeforeClueFixture();
    ready = releasedDungeonSecretPassageFixture();
    opened = advanceWorld(ready);
    crossed = advanceWorld(opened);
  });

  it("records the real clue and stationary opening without rewriting the base maze or rewards", () => {
    expect(advanceWorld(beforeClue)).toEqual(ready);
    const dungeon = ready.depth.dungeon!, passage = dungeon.secretPassage!, clue = passage.clue!;
    const after = opened.depth.dungeon!;
    expect(beforeClue.depth.dungeon!.secretPassage!.clue).toBeNull();
    expect(clue.revealedTick).toBe(ready.tick);
    expect(ready.chronicle.at(-1)?.commandId).toBe(`${ready.campaignId}:${clue.revealSourceCommandId}`);
    expect(dungeon.keyGate?.phase).toBe("open");
    expect(dungeon.visitedCellIds).toContain(clue.fromCellId);
    expect(dungeon.visitedCellIds).toContain(clue.toCellId);
    expect(clue.knownRouteCellIds.length).toBeGreaterThanOrEqual(4);
    expect(projectDungeonSecretPassageCue(dungeon)).toEqual({ direction: clue.direction, text: expect.any(String) });
    expect(isDungeonPassageOpen(dungeon, clue.fromCellId, clue.toCellId)).toBe(false);
    expect(dungeonEffectiveExits(dungeon, clue.fromCellId)).not.toContain(clue.direction);
    expect(after).toEqual({ ...dungeon, turns: dungeon.turns + 1,
      secretPassage: { ...passage, opened: after.secretPassage!.opened }, traversalLog: after.traversalLog });
    expect(after.secretPassage!.opened).toEqual({ tick: opened.tick, turn: after.turns,
      sourceCommandId: dungeonSecretPassageCommandId(opened.tick, dungeon.id, clue.fromCellId, clue.toCellId) });
    expect(opened.depth).toEqual({ ...ready.depth, tick: opened.tick, dungeon: after, log: opened.depth.log });
    expect(opened.hero).toEqual(ready.hero);
    expect(opened.scene.mode).toBe("dungeon");
    expect(opened.chronicle.at(-1)).toMatchObject({ commandType: "open-dungeon-passage", tick: opened.tick,
      commandId: `${opened.campaignId}:${after.secretPassage!.opened!.sourceCommandId}` });
  });

  it("uses ordinary movement through the actual reciprocal shortcut, without discovering a new room", () => {
    const dungeon = opened.depth.dungeon!, clue = dungeon.secretPassage!.clue!;
    expect(isDungeonPassageOpen(dungeon, clue.fromCellId, clue.toCellId)).toBe(true);
    expect(isDungeonPassageOpen(dungeon, clue.toCellId, clue.fromCellId)).toBe(true);
    expect(dungeonEffectiveExits(dungeon, clue.fromCellId)).toContain(clue.direction);
    const choice = actorPolicy(opened, campaignDirector(opened));
    expect(choice.command).toEqual({ type: "move-dungeon", direction: clue.direction });
    expect(crossed.depth.dungeon!.currentCellId).toBe(clue.toCellId);
    expect(crossed.depth.dungeon!.visitedCellIds).toEqual(dungeon.visitedCellIds);
    expect(crossed.depth.dungeon!.secretPassage).toEqual(dungeon.secretPassage);
    expect(crossed.hero.experience).toBe(opened.hero.experience);
    expect(crossed.depth.quest).toEqual(opened.depth.quest);
    expect(selectAvailableDungeonSecretPassage(opened.depth)).toBeNull();
    expect(projectDungeonSecretPassageCue(dungeon)).toBeNull();
  });

  it("round-trips each real boundary and leaves absent legacy expedition rules absent", () => {
    for (const world of [beforeClue, ready, opened, crossed]) {
      expect(upgradeWorldState(JSON.parse(canonicalStringify(world)))).toEqual(world);
      expect(upgradeDepthState(JSON.parse(canonicalStringify(world.depth)), world.seed, world.hero.id, world.hero.name)).toEqual(world.depth);
    }
    const { secretPassage: _newRules, ...legacyDungeon } = beforeClue.depth.dungeon!;
    const legacy = { ...beforeClue.depth, dungeon: legacyDungeon };
    const restored = upgradeDepthState(JSON.parse(canonicalStringify(legacy)), beforeClue.seed, beforeClue.hero.id, beforeClue.hero.name);
    expect(Object.hasOwn(restored.dungeon!, "secretPassage")).toBe(false);
    expect(selectAvailableDungeonSecretPassage(restored)).toBeNull();
    const next = stepDepth(restored, depthCommandCandidates(restored)[0]!.command);
    expect(Object.hasOwn(next.dungeon!, "secretPassage")).toBe(false);
  });

  it("rejects forged, repeated, dead, active-encounter and settlement-time openings", () => {
    const base = ready.depth, command = campaignDirector(ready).candidates[0]!.command;
    expect(command.type).toBe("open-dungeon-passage");
    if (command.type !== "open-dungeon-passage") throw new Error("Missing earned opening");
    const wrong: DepthCommand[] = [{ ...command, dungeonId: "foreign" }, { ...command, fromCellId: "foreign" }, { ...command, toCellId: "foreign" }];
    for (const entry of wrong) expect(() => stepDepth(base, entry)).toThrow();
    expect(() => stepDepth(opened.depth, command)).toThrow();
    for (const boundary of [
      { ...base, hero: { ...base.hero, resources: { ...base.hero.resources, health: 0 } } },
      { ...base, combat: base.completedCombats.at(-1)! },
      { ...base, quest: { ...base.quest, status: "ready-to-fulfill" as const } },
      { ...base, dungeon: { ...base.dungeon!, completed: true } },
    ]) {
      expect(selectAvailableDungeonSecretPassage(boundary)).toBeNull();
      expect(() => stepDepth(boundary, command)).toThrow();
    }
    const dungeon = opened.depth.dungeon!, passage = dungeon.secretPassage!;
    expect(isValidDungeonSecretPassage({ ...dungeon, secretPassage: { ...passage,
      opened: { ...passage.opened!, tick: opened.tick + 1 } } }, opened.tick)).toBe(false);
  });
});
