import { describe, expect, it } from "vitest";
import { naturalCompanionReunionFixture } from "../../tests/companion-reunion-fixtures";
import { canonicalHash, canonicalStringify } from "./canonical";
import { advanceWorld, campaignDirector, upgradeWorldState } from "./simulation";

describe("an old line returns in the actual reunion", () => {
  it("keeps the earned arrival and all character facts while recording the new exact dialogue", () => {
    const before = naturalCompanionReunionFixture();
    expect([before.tick, canonicalHash(before)]).toEqual([85, "b9f956d8d29d2d94"]);
    const world = advanceWorld(before), reunion = world.depth.companionReunion!, completed = reunion.completed!;
    expect(world.tick).toBe(86);
    expect(completed.memory).toMatchObject({ witnessId: reunion.residentId, joinedTick: reunion.joinedTick,
      sourceReactionId: "unmoved", quote: "I will accept being called cautious." });
    expect(world.scene).toMatchObject({ mode: "chronicle", headline: "An old line returns: Ada Fen",
      goal: "Remember a line from the shared road" });
    expect(world.scene.action).toContain(completed.heroLine);
    expect(world.scene.action).toContain(completed.companionLine);
    expect(completed.heroLine).toContain(completed.memory!.quote);
    expect(world.chronicle.at(-1)).toMatchObject({ commandType: "reunite-companion", tick: 86,
      commandId: `${world.campaignId}:${completed.sourceCommandId}`, action: world.scene.action });
    const { tick: _beforeTick, log: _beforeLog, companionReunion: _beforeReunion, ...beforeFacts } = before.depth;
    const { tick: _tick, log: _log, companionReunion: _reunion, ...afterFacts } = world.depth;
    expect(afterFacts).toEqual(beforeFacts);
    expect(world.hero).toEqual(before.hero);
    expect(world.depth.reparteeCallback!.tick).toBe(44);
    expect(world.depth.reparteeCallback).toEqual(before.depth.reparteeCallback);
  });

  it("retains exactly the committed words after reload and continues without repeating the reunion", () => {
    const world = advanceWorld(naturalCompanionReunionFixture());
    const raw = canonicalStringify(world), restored = upgradeWorldState(JSON.parse(raw));
    expect(canonicalStringify(restored)).toBe(raw);
    expect(campaignDirector(world).candidates.every(candidate => candidate.command.type !== "reunite-companion")).toBe(true);
    const next = advanceWorld(world);
    expect(next.tick).toBe(world.tick + 1);
    expect(next.chronicle.at(-1)!.commandType).not.toBe("reunite-companion");
    expect(next.depth.companionReunion).toEqual(world.depth.companionReunion);
    expect(canonicalStringify(upgradeWorldState(JSON.parse(canonicalStringify(next))))).toBe(canonicalStringify(next));
    expect(canonicalStringify(world)).toBe(raw);
  });
});
