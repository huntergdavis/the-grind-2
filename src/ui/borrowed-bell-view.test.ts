import { describe, expect, it } from "vitest";
import { actorPolicy, advanceWorld, campaignDirector } from "../core/simulation";
import { randomInt } from "../core/rng";
import type { WorldState } from "../core/types";
import { naturalBorrowedBellFixture } from "../../tests/borrowed-bell-fixtures";
import { borrowedBellMemoryRecoveryBoundaryFixture } from "../../tests/borrowed-bell-memory-fixtures";
import { selectBellDeliveryMemory } from "../depth/borrowed-bell-memory";
import { bellDeadlineMarks, projectBorrowedBellScene, type BorrowedBellBoardSceneView } from "./borrowed-bell-view";

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

function boardScene(state: WorldState): BorrowedBellBoardSceneView {
  const scene = projectBorrowedBellScene(state);
  if (scene === null || scene.phase === "memory") throw new Error("Expected an actual Borrowed Bell board scene");
  return scene;
}

/** Explicit service-boundary scenario, not a claimed natural autonomous rest.
 * The hero, visited inn, completed board and delivery receipts are actual. Only
 * the quiet low-mana/route-null boundary is staged after the actual challenge
 * and next ordinary command; the paid wait and memory are real commands.
 */
function innMemoryScenario(locationId?: string): { before: WorldState; after: WorldState } {
  const started = advanceWorld(journey().at(-1)!);
  expect(started.chronicle.at(-1)?.commandType).toBe("start-room-challenge");
  const answered = advanceWorld(started);
  expect(answered.chronicle.at(-1)?.commandType).toBe("answer-room-challenge");
  const ordinary = actorPolicy(answered, campaignDirector(answered));
  expect(["plan-route", "train-ability"]).toContain(ordinary.command.type);
  const next = advanceWorld(answered);
  expect(next.chronicle.at(-1)).toMatchObject({ commandType: ordinary.command.type, commandId: ordinary.commandId });
  expect(next.depth.roomChallenge).toEqual(answered.depth.roomChallenge);
  const before: WorldState = { ...next, depth: { ...next.depth,
    atlas: { ...next.depth.atlas, currentLocationId: locationId ?? next.depth.atlas.currentLocationId, route: null },
    hero: { ...next.depth.hero, resources: { ...next.depth.hero.resources,
      health: next.depth.hero.resources.maxHealth - 1,
      mana: Math.floor(next.depth.hero.resources.maxMana / 3) } },
  } };
  if (selectBellDeliveryMemory(before.depth) === null) throw new Error("Explicit paid-rest memory scenario is not eligible");
  const after = advanceWorld(before);
  if (after.depth.bellMemory === null) throw new Error("Actual wait did not commit the eligible inn memory");
  expect(after.depth.roomChallenge).toEqual(answered.depth.roomChallenge);
  return { before, after };
}

describe("Borrowed Bell presentation", () => {
  it("admits one actual hero with a public nine-cell graph and no invented die or hidden effects", () => {
    const [before, admitted] = journey() as readonly [WorldState, WorldState, ...WorldState[]];
    const original = JSON.stringify(admitted);
    expect(projectBorrowedBellScene(before)).toBeNull();
    const scene = boardScene(admitted);
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
      const scene = boardScene(state);
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
    const final = states.at(-1)!, scene = boardScene(final), completion = final.depth.bellExpedition!.completion!;
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

  it("projects the actual paid wait as a private inn memory, not another board or delivery reward", () => {
    const { before, after } = innMemoryScenario();
    const original = JSON.stringify(after), scene = projectBorrowedBellScene(after);
    expect(scene?.phase).toBe("memory");
    if (scene?.phase !== "memory") throw new Error("Missing actual inn memory");
    const memory = after.depth.bellMemory!;
    if (memory.rest.kind !== "inn") throw new Error("Explicit paid-rest scenario must remain an inn");
    expect(scene.memory).toEqual(memory);
    expect(scene.commandId).toBe(`${after.campaignId}:${memory.sourceCommandId}`);
    expect(after.chronicle.at(-1)).toMatchObject({ commandType: "wait", mode: "chronicle", tick: memory.tick });
    expect(scene.heroId).toBe(after.depth.hero.id);
    expect(scene.narrative).toBe(memory.line);
    expect(scene.title).toContain(memory.rest.innName);
    expect(scene.title).toContain(after.depth.atlas.locations.find(location => location.id === memory.rest.locationId)!.name);
    expect(scene.consequence).toContain("−5 gold");
    expect(scene.consequence).toContain(`MP ${memory.rest.manaBefore} → ${memory.rest.manaAfter}`);
    expect(scene).not.toHaveProperty("board");
    expect(scene).not.toHaveProperty("roll");
    expect(scene).not.toHaveProperty("path");
    expect(scene.deadline).toBe("");
    expect(after.depth.bellExpedition).toEqual(before.depth.bellExpedition);
    expect(after.depth.hero.gold).toBe(before.depth.hero.gold - 5);
    expect(after.depth.companions).toEqual(before.depth.companions);
    expect(projectBorrowedBellScene(JSON.parse(original))).toEqual(scene);
    expect(JSON.stringify(after)).toBe(original);
  });

  it("rejects stale, foreign, wrong-venue and invalid memory receipts without replaying the old board", () => {
    const { after } = innMemoryScenario(), source = after.chronicle.at(-1)!, memory = after.depth.bellMemory!;
    if (memory.rest.kind !== "inn") throw new Error("Explicit paid-rest scenario must remain an inn");
    const variants: WorldState[] = [
      { ...after, tick: after.tick + 1 },
      { ...after, scene: { ...after.scene, mode: "town" } },
      { ...after, chronicle: [{ ...source, mode: "town" }] },
      { ...after, chronicle: [{ ...source, commandType: "move-bell" }] },
      { ...after, chronicle: [{ ...source, commandId: memory.sourceCommandId }] },
      { ...after, chronicle: [{ ...source, commandId: `foreign:${memory.sourceCommandId}` }] },
      { ...after, depth: { ...after.depth, atlas: { ...after.depth.atlas, currentLocationId: "elsewhere" } } },
      { ...after, depth: { ...after.depth, bellMemory: { ...memory, line: "An invented second reward" } } },
      { ...after, depth: { ...after.depth, bellMemory: { ...memory, evidenceSourceCommandId: "unrelated" } } },
      { ...after, depth: { ...after.depth, bellMemory: { ...memory, rest: { ...memory.rest, innId: "invented-inn" } } } },
    ];
    for (const variant of variants) expect(projectBorrowedBellScene(variant)).toBeNull();
    const continued = advanceWorld(after);
    expect(projectBorrowedBellScene(continued)).toBeNull();
    expect(continued.depth.bellMemory).toEqual(memory);
    expect(selectBellDeliveryMemory(continued.depth)).toBeNull();
  });

  it("allows the later paid inn to be in another recorded town and labels its public atlas location", () => {
    const completed = journey().at(-1)!;
    const other = Object.values(completed.depth.towns).find(town => town.visits >= 1
      && town.locationId !== completed.depth.bellExpedition!.locationId
      && town.buildings.some(building => building.kind === "inn"));
    if (other === undefined) throw new Error("Actual journey did not retain its earlier visited inn town");
    const { after } = innMemoryScenario(other.locationId), scene = projectBorrowedBellScene(after);
    expect(scene?.phase).toBe("memory");
    if (scene?.phase !== "memory") throw new Error("Other-town inn memory was incorrectly tied to the old board venue");
    if (scene.memory.rest.kind !== "inn") throw new Error("Explicit other-town scenario must remain an inn");
    const location = after.depth.atlas.locations.find(entry => entry.id === other.locationId)!;
    expect(scene.memory.rest.locationId).not.toBe(after.depth.bellExpedition!.locationId);
    expect(scene.locationName).toBe(location.name);
    expect(scene.title).toBe(`${scene.memory.rest.innName} · ${location.name}`);
  });

  it("presents the earned route's explicit low-HP recovery boundary without inventing an inn or charging gold", () => {
    const before = borrowedBellMemoryRecoveryBoundaryFixture(), after = advanceWorld(before);
    expect(before.tick).toBeGreaterThan(before.depth.bellExpedition!.completion!.tick);
    expect(after.tick).toBe(before.tick + 1);
    const scene = projectBorrowedBellScene(after), memory = after.depth.bellMemory!;
    expect(scene?.phase).toBe("memory");
    if (scene?.phase !== "memory" || memory.rest.kind !== "roadside") throw new Error("Missing actual recovery memory at the explicit boundary");
    const rest = memory.rest;
    const name = (id: string) => after.depth.atlas.locations.find(location => location.id === id)!.name;
    expect(scene.title).toBe(`Roadside camp · ${name(rest.route.path[rest.route.legIndex]!)} → ${name(rest.route.path[rest.route.legIndex + 1]!)}`);
    expect(scene.narrative).toBe(memory.line);
    expect(memory.sourceCommandId).toBe(`depth:${after.tick}:critical-roadside-recovery`);
    expect(scene.commandId).toBe(`${after.campaignId}:${memory.sourceCommandId}`);
    expect(scene.consequence).toBe(`Camp recovery: HP ${rest.healthBefore} → ${rest.healthAfter} · MP ${rest.manaBefore} → ${rest.manaAfter} · gold ${rest.goldAfter}, unchanged.`);
    expect(rest.healthBefore).toBeGreaterThan(0);
    expect(rest.healthBefore * 2).toBeLessThanOrEqual(before.depth.hero.resources.maxHealth);
    expect(rest.goldSpent).toBe(0);
    expect(rest.goldAfter).toBe(rest.goldBefore);
    expect(scene.title).not.toMatch(/inn/iu);
    expect(scene).not.toHaveProperty("board");
    expect(scene).not.toHaveProperty("roll");
    expect(rest).not.toHaveProperty("innId");
    expect(after.depth.atlas.route).toEqual(before.depth.atlas.route);
    expect(after.depth.hero).toEqual({ ...before.depth.hero, resources: { ...before.depth.hero.resources,
      health: before.depth.hero.resources.maxHealth, mana: before.depth.hero.resources.maxMana } });
    expect(after.depth.companions).toEqual(before.depth.companions);
    expect(after.depth.bellExpedition).toEqual(before.depth.bellExpedition);
    expect(projectBorrowedBellScene(JSON.parse(JSON.stringify(after)))).toEqual(scene);
    expect(projectBorrowedBellScene({ ...after, depth: { ...after.depth, atlas: { ...after.depth.atlas, route: null } } })).toBeNull();
    const counter = randomInt(4, after.seed, "depth-director", rest.encounterId, 0, "encounter-engine") === 0;
    const expectedCommand = counter ? { type: "start-counter-duel", encounterId: rest.encounterId }
      : { type: "start-combat", encounterId: rest.encounterId,
        enemyCount: 1 + randomInt(2, after.seed, "depth-director", rest.encounterId, 0, "enemy-count") };
    const opportunity = campaignDirector(after);
    expect(opportunity.candidates.map(candidate => candidate.command)).toEqual([expectedCommand]);
    const continued = advanceWorld(after);
    expect(continued.chronicle.at(-1)).toMatchObject({ commandType: expectedCommand.type,
      commandId: `${after.campaignId}:${opportunity.candidates[0]!.id}` });
    expect((counter ? continued.depth.counterDuel : continued.depth.combat)?.id).toBe(rest.encounterId);
    expect(counter ? continued.depth.combat : continued.depth.counterDuel).toBeNull();
    expect(continued.depth.hero.resources).toEqual(after.depth.hero.resources);
    expect(continued.depth.hero.gold).toBe(after.depth.hero.gold);
    expect(continued.depth.hero.experience).toBe(after.depth.hero.experience + (counter ? 0 : 8));
    expect(projectBorrowedBellScene(continued)).toBeNull();
    expect(continued.depth.bellMemory).toEqual(memory);
  });
});
