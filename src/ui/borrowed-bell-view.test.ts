import { describe, expect, it } from "vitest";
import { advanceWorld } from "../core/simulation";
import type { WorldState } from "../core/types";
import { naturalBorrowedBellFixture } from "../../tests/borrowed-bell-fixtures";
import { bellDeadlineMarks, projectBorrowedBellScene } from "./borrowed-bell-view";

let actualJourney: readonly WorldState[] | undefined;
function journey(): readonly WorldState[] {
  if (actualJourney !== undefined) return actualJourney;
  const states = [naturalBorrowedBellFixture()];
  for (let step = 0; step < 18; step++) {
    const next = advanceWorld(states.at(-1)!); states.push(next);
    if (next.depth.bellExpedition?.completion !== null && next.depth.bellExpedition?.completion !== undefined) {
      actualJourney = states; return states;
    }
  }
  throw new Error("Actual Borrowed Bell journey did not finish within its finite action budget");
}

describe("Borrowed Bell presentation", () => {
  it("admits one actual hero with a public nine-cell graph and no invented die or hidden effects", () => {
    const [before, admitted] = journey() as readonly [WorldState, WorldState, ...WorldState[]];
    const original = JSON.stringify(admitted);
    expect(projectBorrowedBellScene(before)).toBeNull();
    const scene = projectBorrowedBellScene(admitted)!;
    expect(scene.phase).toBe("admission");
    expect(scene.commandId).toBe(admitted.chronicle.at(-1)!.commandId);
    expect(scene.commandId).toBe(`${admitted.campaignId}:${admitted.depth.bellExpedition!.sourceCommandId}`);
    expect(scene.heroId).toBe(admitted.depth.hero.id);
    expect(scene.roll).toBeNull();
    expect(scene.path).toEqual([0]);
    expect(scene.board.cells).toHaveLength(9);
    expect(scene.board.cells.filter(cell => cell.exits.length === 2).map(cell => cell.id)).toEqual([1, 4]);
    expect(scene.board.cells.find(cell => cell.id === 2)!.effectText).toContain("at most 1 MP");
    for (const id of [3, 6]) expect(scene.board.cells.find(cell => cell.id === id)).toMatchObject({
      disclosure: "unrevealed", effectText: "Effect unknown until landing", visited: false, landed: false,
    });
    expect(scene.board.routeNote).toBeNull();
    expect(scene.narrative).toContain("hands you the festival bell");
    expect(scene.narrative).not.toMatch(/parcel|stamp/iu);
    expect(scene.consequence).toContain("at most 1 MP");
    expect(JSON.stringify(admitted)).toBe(original);
    expect(projectBorrowedBellScene(JSON.parse(original))).toEqual(scene);
  });

  it("keeps each committed roll separate from the exact chosen path, pace, landing and resources", () => {
    const states = journey();
    let rolls = 0, moves = 0;
    for (let index = 2; index < states.length; index++) {
      const state = states[index]!, before = states[index - 1]!, expedition = state.depth.bellExpedition!;
      const scene = projectBorrowedBellScene(state)!;
      expect(scene.commandId).toBe(state.chronicle.at(-1)!.commandId);
      expect(projectBorrowedBellScene(JSON.parse(JSON.stringify(state)))).toEqual(scene);
      if (expedition.pendingRoll !== null) {
        rolls++;
        expect(scene.phase).toBe("roll");
        expect(scene.turn).toBe(expedition.pendingRoll.turn);
        expect(scene.roll).toBe(expedition.pendingRoll.value);
        expect(scene.path).toEqual([before.depth.bellExpedition!.currentCell]);
        expect(scene.board.currentCell).toBe(before.depth.bellExpedition!.currentCell);
        expect(scene.narrative).toContain(`die shows ${expedition.pendingRoll.value}`);
      } else {
        moves++;
        const move = expedition.turns.at(-1)!;
        expect(scene.phase).toBe(expedition.completion === null ? "move" : "result");
        expect(scene.turn).toBe(move.turn);
        expect(scene.roll).toBe(move.roll.value);
        expect(scene.path).toEqual(move.path);
        expect(scene.board.currentCell).toBe(move.landedCell);
        expect(scene.narrative).toBe(move.landing.text);
        expect(scene.consequence).toContain(`MP ${move.manaBefore} → ${expedition.mana}`);
        expect(scene.consequence).toContain(`gold ${move.goldBefore} → ${expedition.gold}`);
      }
      for (const id of [3, 6]) {
        const cell = scene.board.cells.find(entry => entry.id === id)!;
        if (!expedition.landedCells.includes(id)) {
          expect(cell.disclosure).toBe("unrevealed");
          expect(cell.effectText).toBe("Effect unknown until landing");
        } else expect(cell.disclosure).toBe("experienced");
      }
    }
    expect(rolls).toBeGreaterThan(0);
    expect(moves).toBe(rolls);
    const final = states.at(-1)!, scene = projectBorrowedBellScene(final)!, completion = final.depth.bellExpedition!.completion!;
    expect(scene.phase).toBe("result");
    expect(scene.board.outcome).toBe(completion.outcome);
    expect(scene.deadline).toContain(completion.bonusGold === 3 ? "+3 gold, once" : "no delivery bonus");
    expect(projectBorrowedBellScene(advanceWorld(final))).toBeNull();
  });

  it("suppresses foreign, stale, mismatched and forged board scene sources", () => {
    const rolled = journey().find(state => state.depth.bellExpedition?.pendingRoll !== null
      && state.depth.bellExpedition?.pendingRoll !== undefined)!;
    const source = rolled.chronicle.at(-1)!, expedition = rolled.depth.bellExpedition!, roll = expedition.pendingRoll!;
    const variants: WorldState[] = [
      { ...rolled, tick: rolled.tick + 1 },
      { ...rolled, scene: { ...rolled.scene, mode: "town" } },
      { ...rolled, chronicle: [{ ...source, commandType: "wait" }] },
      { ...rolled, chronicle: [{ ...source, commandId: roll.sourceCommandId }] },
      { ...rolled, chronicle: [{ ...source, commandId: `foreign:${roll.sourceCommandId}` }] },
      { ...rolled, depth: { ...rolled.depth, hero: { ...rolled.depth.hero, id: "foreign-hero" } } },
      { ...rolled, depth: { ...rolled.depth, atlas: { ...rolled.depth.atlas, currentLocationId: "elsewhere" } } },
      { ...rolled, depth: { ...rolled.depth, bellExpedition: { ...expedition,
        pendingRoll: { ...roll, value: roll.value === 1 ? 2 : 1 } } } },
      { ...rolled, depth: { ...rolled.depth, bellExpedition: { ...expedition, currentCell: 8 } } },
    ];
    for (const variant of variants) expect(projectBorrowedBellScene(variant)).toBeNull();
  });

  it("represents the four-turn deadline separately from health or damage", () => {
    expect(bellDeadlineMarks(0)).toBe("[·] [·] [·] [·]");
    expect(bellDeadlineMarks(2)).toBe("[■] [■] [·] [·]");
    expect(bellDeadlineMarks(7)).toBe("[■] [■] [■] [■]");
  });
});
