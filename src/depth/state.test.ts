import { describe, expect, it } from "vitest";
import { advanceDepth, createDepthState, maximumCompletedCombats, maximumDepthLogEntries, stepDepth } from "./state";

describe("composed depth state", () => {
  it("replays autonomously from a semantic seed", () => {
    const play = () => {
      let state = createDepthState("depth-replay", "hero:replay", "Dara Moss");
      for (let index = 0; index < 600; index += 1) state = advanceDepth(state);
      return state;
    };
    const first = play();
    expect(play()).toEqual(first);
    expect(first.tick).toBe(600);
    expect(first.log.length).toBeLessThanOrEqual(maximumDepthLogEntries);
    expect(first.completedCombats.length).toBeLessThanOrEqual(maximumCompletedCombats);
    expect(first.atlas.discoveredLocationIds.length).toBeGreaterThan(1);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it("updates explicit quest commands through the same reducer", () => {
    const initial = createDepthState("commands");
    const progressed = stepDepth(initial, { type: "progress-objective", objectiveId: "quest:visit-towns", amount: 1 });
    expect(progressed.tick).toBe(1);
    expect(progressed.quest.objectives.find((entry) => entry.id === "quest:visit-towns")?.current).toBe(1);
    expect(progressed.log.at(-1)?.category).toBe("quest");
  });

  it("adds one deterministic inventory reward for a combat victory", () => {
    let state = createDepthState("reward-seed", "hero:reward", "Iona Vale");
    const startingItems = state.hero.inventory.length;
    state = stepDepth(state, { type: "start-combat", encounterId: "encounter:reward", enemyCount: 1 });
    while (state.combat !== null) state = advanceDepth(state);
    const outcome = state.completedCombats.at(-1)?.outcome;
    expect(outcome).toBe("victory");
    expect(state.hero.inventory).toHaveLength(startingItems + 1);
    expect(state.hero.inventory.at(-1)?.id).toBe("loot:encounter:reward:0");
    expect(state.quest.subquests.find((entry) => entry.id === "subquest-supplies")?.objectives[0]?.current).toBe(1);
  });
});
