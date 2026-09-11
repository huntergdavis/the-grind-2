import { beforeAll, describe, expect, it } from "vitest";
import { advanceWorld, campaignDirector, catchUpWorld, createWorld, upgradeWorldState } from "./simulation";
import type { WorldState } from "./types";
import { projectReparteeScene } from "../ui/repartee-view";
import { reparteeResponses } from "../depth/repartee";

describe("Books & Flyting as an autonomous saved story", () => {
  let ready: WorldState;
  beforeAll(() => {
    ready = createWorld("browser-dungeon-search:8", "campaign:repartee-flow");
    // One actual journey, bounded to the known fixture; no invented level or book receipt.
    for (let turn = 0; turn < 384; turn++) {
      if (campaignDirector(ready).candidates[0]?.command.type === "read-book") return;
      ready = advanceWorld(ready);
    }
    throw new Error("The known journey never offered its first book");
  }, 30_000);

  it("saves all five foreground beats with exact source-linked words and no power award", () => {
    let state = ready;
    const hero = state.depth.hero, companions = state.depth.companions, quest = state.depth.quest;
    for (const commandType of ["read-book", "start-repartee", "repartee-action", "repartee-action", "repartee-action"]) {
      const opportunity = campaignDirector(state);
      expect(opportunity.mode).toBe("chronicle");
      expect(opportunity.candidates.every((candidate) => candidate.command.type === commandType)).toBe(true);
      const before = state;
      state = advanceWorld(state);
      const source = state.chronicle.at(-1)!;
      expect(source.commandType).toBe(commandType);
      expect(state.depth.hero).toEqual(hero);
      expect(state.depth.companions).toEqual(companions);
      expect(state.depth.quest).toEqual(quest);
      expect(upgradeWorldState(JSON.parse(JSON.stringify(state)))).toEqual(state);
      const view = projectReparteeScene(state);
      expect(view?.commandId).toBe(source.commandId);
      expect(view?.heroId).toBe(state.hero.id);
      if (commandType === "repartee-action") {
        const round = (state.depth.repartee.active ?? state.depth.repartee.completed)!.rounds.at(-1)!;
        expect(source.commandId).toBe(`${state.campaignId}:${round.sourceCommandId}`);
        expect(view?.reply).toBe(round.reply);
        expect(reparteeResponses(before.depth.repartee).some((reply) => reply.id === round.responseId)).toBe(true);
        expect(source.decisionTrace?.context).toBe("repartee");
        expect(source.decisionTrace?.considered).toHaveLength(4);
      }
    }
    expect(state.depth.repartee.completed?.rounds).toHaveLength(3);
    expect(state.depth.repartee.active).toBeNull();
    expect(campaignDirector(state).candidates.some((candidate) => ["read-book", "start-repartee", "repartee-action"].includes(candidate.command.type))).toBe(false);
    expect(projectReparteeScene(advanceWorld(state))).toBeNull();
  });

  it("never reads or resolves a verbal round during hidden catch-up", () => {
    let state = ready;
    for (let phase = 0; phase < 5; phase++) {
      const request = { id: `flyting:${phase}`, observedAtMs: 100_000 + phase, elapsedMs: 48_000, requestedTicks: 10 };
      const stopped = catchUpWorld(state, request);
      expect(stopped.tick).toBe(state.tick);
      expect(stopped.depth).toEqual(state.depth);
      expect(stopped.pendingAttention.at(-1)?.commandType).toBe(campaignDirector(state).candidates[0]?.command.type);
      expect(stopped.lifecycle.wallClockJournal.at(-1)?.appliedTicks).toBe(0);
      expect(catchUpWorld(stopped, request)).toBe(stopped);
      expect(upgradeWorldState(JSON.parse(JSON.stringify(stopped)))).toEqual(stopped);
      state = advanceWorld(state);
    }
  });
});
