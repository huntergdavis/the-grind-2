import { describe, expect, it } from "vitest";
import { createWorld, eventPolicyForMode } from "../core/simulation";
import type { ChronicleEntry, RecordedDepthCommandType, WorldState } from "../core/types";
import {
  createReparteeProgress, readReparteeBook, reparteeBook, reparteeChallenges,
  reparteeResponses, resolveReparteeRound, startRepartee, type ReparteeProgress,
} from "../depth/repartee";
import { selectSharedRoadCompanion } from "../depth/companion";
import { createReparteeWitnessReaction, declareReparteeWitnessPreference } from "../depth/repartee-witness";
import { generateTown, visitTown } from "../depth/towns";
import { projectReparteeScene, projectReparteeWitness, reparteeRoundMarks, signedReparteeMomentum } from "./repartee-view";

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

function witnessFixture() {
  const f = fixture();
  let first = f.answer(f.active, "direct");
  while (first.depth.repartee.active !== null) first = f.answer(first.depth.repartee, "direct");
  const location = f.world.depth.atlas.locations.find((entry) => entry.kind === "town" && entry.id !== f.town.locationId)!;
  const town = visitTown(generateTown(f.world.seed, location.id));
  const atlas = { ...f.world.depth.atlas, currentLocationId: location.id,
    discoveredLocationIds: f.world.depth.atlas.locations.map((entry) => entry.id) };
  const companion = selectSharedRoadCompanion({ seed: f.world.seed, atlas, town,
    roster: f.world.depth.companions, joinedTick: 6, heroLevel: 2 })!;
  const building = town.buildings.find((entry) => ["hall", "inn"].includes(entry.kind)
    && entry.residentIds.some((id) => id !== companion.identity.residentId))!;
  const resident = town.residents.find((entry) => entry.id !== companion.identity.residentId && building.residentIds.includes(entry.id))!;
  const active = startRepartee(f.reading, { ...f.startContext, rulesVersion: 2,
    sourceCommandId: "depth:8:start-repartee", tick: 8, encounterId: `${f.world.campaignId}:encore`,
    residentId: resident.id, locationId: town.locationId, buildingId: building.id });
  const preference = declareReparteeWitnessPreference(f.world.seed, { witnessId: companion.identity.residentId,
    joinedTick: companion.joinedTick, sourceCommandId: active.active!.sourceCommandId, tick: active.active!.startedTick });
  function state(progress: ReparteeProgress): WorldState {
    const duel = progress.active ?? progress.completed!;
    const completion = progress.completed;
    const round = duel.rounds.at(-1);
    const tick = completion?.completedTick ?? round?.tick ?? duel.startedTick;
    const commandId = completion?.completionCommandId ?? round?.sourceCommandId ?? duel.sourceCommandId;
    const base = f.state(progress, round === undefined && completion === null ? "start-repartee" : "repartee-action", commandId, tick);
    return { ...base, depth: { ...base.depth, atlas, towns: { ...base.depth.towns, [town.locationId]: town },
      companions: { ...base.depth.companions, active: [companion] },
      reparteeWitness: { schemaVersion: 1, firstContest: first.depth.repartee, preference,
        reaction: completion === null ? null : createReparteeWitnessReaction(progress, preference, {
          witnessId: companion.identity.residentId, witnessName: companion.identity.name, joinedTick: companion.joinedTick,
          locationId: town.locationId, tick: completion.completedTick,
        }) },
    } };
  }
  function finish(): WorldState {
    let progress = active;
    const styles = preference.preferenceId === "precision" ? ["direct", "category", "category"]
      : preference.preferenceId === "humility" ? ["direct", "personality", "direct"] : ["category", "category", "category"];
    for (let index = 0; index < 3; index += 1) {
      const duel = progress.active!;
      const response = reparteeResponses(progress).find((entry) => entry.style === styles[index])!;
      progress = resolveReparteeRound(progress, { encounterId: duel.encounterId, roundIndex: index, responseId: response.id,
        sourceCommandId: `depth:${9 + index}:repartee-action`, tick: 9 + index, reputationBefore: town.reputation, reputationCap: 100 });
    }
    return state(progress);
  }
  return { f, companion, town, building, resident, preference, first, active, state, finish };
}

describe("Witnessed encore presentation", () => {
  it("stages the actual third participant and declared taste at the encore venue, not the old reading town", () => {
    const f = witnessFixture();
    const state = f.state(f.active);
    const scene = projectReparteeScene(state)!;
    expect(scene.encore).toBe(true);
    expect(scene.phase).toBe("challenge");
    expect(scene.title).toContain("Flyting encore");
    expect(scene.buildingId).toBe(f.building.id);
    expect(scene.buildingId).not.toBe(f.f.building.id);
    expect(scene.residentId).toBe(f.resident.id);
    expect(scene.witness).toMatchObject({ id: f.companion.identity.residentId, name: f.companion.identity.name,
      role: f.companion.identity.role, preferenceId: f.preference.preferenceId, reaction: null });
    expect(scene.witness!.preferenceDescription.length).toBeGreaterThan(20);
    expect(state.depth.repartee.reading).toEqual(f.first.depth.repartee.reading);
    expect(state.depth.reparteeWitness.firstContest).toEqual(f.first.depth.repartee);
    expect(projectReparteeScene(JSON.parse(JSON.stringify(state)))).toEqual(scene);
  });

  it("projects the exact saved reaction and directional regard even when applause disagrees", () => {
    const f = witnessFixture();
    const state = f.finish();
    const original = JSON.stringify(state);
    const reaction = state.depth.reparteeWitness.reaction!;
    const scene = projectReparteeScene(state)!;
    expect(scene.phase).toBe("result");
    expect(scene.witness!.reaction).toEqual({ id: reaction.reactionId, pose: reaction.pose, line: reaction.line,
      explanation: reaction.explanation, regardBefore: null, regardAfter: reaction.regardAfter, regardDelta: reaction.regardDelta });
    expect(scene.consequence).toContain(`${f.companion.identity.name}’s regard toward ${state.hero.name}`);
    expect(scene.consequence).toContain("HP, MP and bond unchanged");
    expect(scene.outcome === "victory").toBe(reaction.regardDelta < 0);
    expect(scene.outcome === "defeat").toBe(reaction.regardDelta > 0);
    expect(projectReparteeScene(JSON.parse(original))).toEqual(scene);
    expect(JSON.stringify(state)).toBe(original);
    expect(state.depth.companions.active[0]!.bond).toBe(f.companion.bond);
  });

  it("suppresses invented, injured, absent, differently joined and mismatched-source witnesses", () => {
    const f = witnessFixture();
    const state = f.finish();
    const witnessState = state.depth.reparteeWitness;
    const variants: WorldState[] = [
      { ...state, depth: { ...state.depth, companions: { ...state.depth.companions, active: [] } } },
      { ...state, depth: { ...state.depth, companions: { ...state.depth.companions, active: [{ ...f.companion, injury: "wounded" }] } } },
      { ...state, depth: { ...state.depth, companions: { ...state.depth.companions, active: [{ ...f.companion, joinedTick: 5 }] } } },
      { ...state, depth: { ...state.depth, reparteeWitness: { ...witnessState, preference: { ...f.preference, witnessId: "invented-witness" } } } },
      { ...state, depth: { ...state.depth, reparteeWitness: { ...witnessState, preference: { ...f.preference, sourceCommandId: "other-start" } } } },
      { ...state, depth: { ...state.depth, reparteeWitness: { ...witnessState, reaction: { ...witnessState.reaction!, line: "I always admired you." } } } },
      { ...state, depth: { ...state.depth, reparteeWitness: { ...witnessState, reaction: { ...witnessState.reaction!, completionCommandId: "other-completion" } } } },
      { ...state, depth: { ...state.depth, reparteeWitness: { ...witnessState, reaction: null } } },
    ];
    for (const variant of variants) {
      expect(projectReparteeWitness(variant)).toBeNull();
      expect(projectReparteeScene(variant)).toBeNull();
    }
    expect(projectReparteeScene({ ...state, tick: state.tick + 1 })).toBeNull();
    expect(projectReparteeScene({ ...state, chronicle: [{ ...state.chronicle[0]!, commandId: "other-campaign:depth:11:repartee-action" }] })).toBeNull();
  });
});
