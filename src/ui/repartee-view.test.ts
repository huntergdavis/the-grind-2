import { describe, expect, it } from "vitest";
import { createWorld, eventPolicyForMode } from "../core/simulation";
import type { ChronicleEntry, RecordedDepthCommandType, WorldState } from "../core/types";
import {
  createReparteeProgress, readReparteeBook, reparteeBook, reparteeChallenges,
  reparteeResponses, resolveReparteeRound, startRepartee, type ReparteeProgress,
} from "../depth/repartee";
import { projectReparteeScene, reparteeRoundMarks, signedReparteeMomentum } from "./repartee-view";

function fixture() {
  const world = createWorld("repartee-presentation", "campaign:repartee-presentation");
  const town = world.depth.towns[world.depth.atlas.currentLocationId]!;
  const building = town.buildings.find((entry) => entry.residentIds.length > 0)!;
  const resident = town.residents.find((entry) => building.residentIds.includes(entry.id))!;
  const context = {
    actorId: world.depth.hero.id, locationId: town.locationId, buildingId: building.id,
    sourceCommandId: "depth:1:read-book", tick: 1,
  };
  const reading = readReparteeBook(createReparteeProgress(), context);
  const startContext = {
    ...context, encounterId: `${world.campaignId}:flyting`, residentId: resident.id,
    sourceCommandId: "depth:2:start-repartee", tick: 2,
  };
  const active = startRepartee(reading, startContext);
  function state(progress: ReparteeProgress, commandType: RecordedDepthCommandType, commandId: string, tick: number): WorldState {
    const scene = { ...world.scene, mode: "chronicle" as const };
    const source: ChronicleEntry = {
      ...scene, id: `${world.campaignId}:event:${tick}`, tick, attention: "backgroundSafe",
      consideredActions: [], chosenAction: commandType, rationale: "A recorded fixture choice.",
      policy: eventPolicyForMode("chronicle"), commandId: `${world.campaignId}:${commandId}`, commandType,
    };
    return { ...world, tick, scene, chronicle: [source], depth: { ...world.depth, tick, repartee: progress } };
  }
  function answer(progress: ReparteeProgress, style: "direct" | "near" | "category" | "retreat") {
    const duel = progress.active!;
    const tick = 3 + duel.roundIndex;
    const commandId = `depth:${tick}:repartee-action`;
    const responseId = style === "retreat" ? "retreat" : reparteeResponses(progress).find((entry) => entry.style === style)!.id;
    const updated = resolveReparteeRound(progress, {
      encounterId: duel.encounterId, roundIndex: duel.roundIndex, responseId, sourceCommandId: commandId,
      tick, reputationBefore: town.reputation, reputationCap: 10,
    });
    return state(updated, "repartee-action", commandId, tick);
  }
  return { world, town, building, resident, context, startContext, reading, active, state, answer };
}

describe("Books & Flyting presentation", () => {
  it("shows a real public reading with exact source, finite unlock counts and no fabricated ownership", () => {
    const f = fixture();
    const state = f.state(f.reading, "read-book", f.context.sourceCommandId, 1);
    const original = JSON.stringify(state);
    const scene = projectReparteeScene(state)!;
    expect(scene.phase).toBe("reading");
    expect(scene.heroId).toBe(f.world.depth.hero.id);
    expect(scene.buildingId).toBe(f.building.id);
    expect(scene.call).toBe(reparteeBook.excerpt);
    expect(scene.title).toContain(reparteeBook.title);
    expect(scene.consequence).toContain("12 expressions · 2 counter frames");
    expect(scene.consequence).toContain("public reading copy");
    expect(scene.residentId).toBeNull();
    expect(scene.reply).toBeNull();
    expect(Object.isFrozen(scene)).toBe(true);
    expect(projectReparteeScene(JSON.parse(original))).toEqual(scene);
    expect(JSON.stringify(state)).toBe(original);
  });

  it("shows the declared first public call with its actual resident and no unchosen reply", () => {
    const f = fixture();
    const scene = projectReparteeScene(f.state(f.active, "start-repartee", f.startContext.sourceCommandId, 2))!;
    expect(scene.phase).toBe("challenge");
    expect(scene.residentName).toBe(f.resident.name);
    expect(scene.residentId).toBe(f.resident.id);
    expect(scene.call).toBe(reparteeChallenges[0]!.text);
    expect(scene.reply).toBeNull();
    expect(scene.marks).toEqual([null, null, null]);
    expect(scene.consequence).toContain("HP and MP unchanged");
  });

  it("uses the exact persisted reply and signed result, never regenerated dialogue", () => {
    const f = fixture();
    let state = f.answer(f.active, "direct");
    for (let index = 0; index < 3; index++) {
      if (index > 0) state = f.answer(state.depth.repartee, "direct");
      const scene = projectReparteeScene(state)!;
      const duel = state.depth.repartee.active ?? state.depth.repartee.completed!;
      const receipt = duel.rounds.at(-1)!;
      expect(scene.call).toBe(receipt.call);
      expect(scene.reply).toBe(receipt.reply);
      expect(scene.commandId).toBe(`${state.campaignId}:${receipt.sourceCommandId}`);
      expect(scene.momentum).toBe(index + 1);
      expect(scene.marks).toEqual([0, 1, 2].map((round) => round <= index ? 1 : null));
      expect(projectReparteeScene(JSON.parse(JSON.stringify(state)))).toEqual(scene);
    }
    expect(projectReparteeScene(state)).toMatchObject({ phase: "result", outcome: "victory", momentum: 3 });
    expect(projectReparteeScene(state)!.consequence).toContain("(+1)");
  });

  it.each(["near", "category", "retreat"] as const)("keeps %s outcomes distinct without health damage", (style) => {
    const f = fixture();
    let state = f.answer(f.active, style);
    while (state.depth.repartee.active !== null) state = f.answer(state.depth.repartee, style);
    const scene = projectReparteeScene(state)!;
    expect(scene.outcome).toBe(style === "near" ? "draw" : style === "category" ? "defeat" : "retreat");
    expect(scene.momentum).toBe(style === "category" ? -3 : 0);
    expect(scene.consequence).toContain("(0). HP and MP unchanged");
    expect(scene.marks).toHaveLength(3);
    if (style === "retreat") {
      expect(scene.call).toBe(`${f.world.hero.name} concedes the contest.`);
      expect(scene.reply).toBeNull();
    }
  });

  it("suppresses stale, mismatched, forged or foreign read and round presentations", () => {
    const f = fixture();
    const state = f.answer(f.active, "direct");
    const source = state.chronicle.at(-1)!;
    const active = state.depth.repartee.active!;
    const variants: WorldState[] = [
      { ...state, tick: state.tick + 1 },
      { ...state, scene: { ...state.scene, mode: "town" } },
      { ...state, chronicle: [{ ...source, commandId: "unrelated-command" }] },
      { ...state, chronicle: [{ ...source, commandId: active.rounds[0]!.sourceCommandId }] },
      { ...state, chronicle: [{ ...source, commandId: `other-campaign:${active.rounds[0]!.sourceCommandId}` }] },
      { ...state, chronicle: [{ ...source, commandType: "wait" }] },
      { ...state, chronicle: [{ ...source, mode: "battle" }] },
      { ...state, depth: { ...state.depth, atlas: { ...state.depth.atlas, currentLocationId: "elsewhere" } } },
      { ...state, depth: { ...state.depth, hero: { ...state.depth.hero, id: "foreign-hero" } } },
      { ...state, depth: { ...state.depth, repartee: { ...state.depth.repartee, active: { ...active, residentId: "invented-resident" } } } },
      { ...state, depth: { ...state.depth, repartee: { ...state.depth.repartee, active: { ...active, rounds: [{ ...active.rounds[0]!, reply: "Invented dialogue." }] } } } },
    ];
    for (const variant of variants) expect(projectReparteeScene(variant)).toBeNull();
    const readingState = f.state(f.reading, "read-book", f.context.sourceCommandId, 1);
    expect(projectReparteeScene({ ...readingState, chronicle: [{ ...readingState.chronicle[0]!, commandId: "other-reading" }] })).toBeNull();
    expect(projectReparteeScene(f.world)).toBeNull();
  });

  it("keeps round marks explicit rather than treating momentum as a damage bar", () => {
    expect(reparteeRoundMarks([1, 0, -1])).toBe("[+1] [0] [-1]");
    expect(reparteeRoundMarks([null, null, null])).toBe("[·] [·] [·]");
    expect([0, 3, -3].map(signedReparteeMomentum)).toEqual(["0", "+3", "-3"]);
  });
});
