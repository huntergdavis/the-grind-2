import { describe, expect, it } from "vitest";
import {
  counterDuelHabitEncounterThreshold,
  counterDuelOpponentStancePool,
  counterDuelPatternBreakRequiredOpening,
  counterDuelRulesVersion,
  counterDuelStanceLabel,
  counterDuelStances,
  counterToStance,
  createCounterDuel,
  isValidCounterDuel,
  maximumCounterDuelRounds,
  projectCounterDuelHabit,
  projectCounterDuelPolicyView,
  projectCounterDuelSpeciesHabit,
  resolveCounterDuelMatchup,
  resolveCounterDuelRound,
  scoreCounterDuelPrediction,
  upgradeCounterDuel,
} from "./counter-duel";
import { monsterDefinitions } from "./combat";
import type { CounterDuelPolicyView, CounterDuelRound, CounterDuelRoundResult, CounterDuelStance, CounterDuelState, MonsterLoreState } from "./types";

const expected: Readonly<Record<CounterDuelStance, Readonly<Record<CounterDuelStance, CounterDuelRoundResult>>>> = {
  rush: { rush: "tie", ward: "opponent", feint: "hero" },
  ward: { rush: "hero", ward: "tie", feint: "opponent" },
  feint: { rush: "opponent", ward: "hero", feint: "tie" },
};

function play(seed: string): CounterDuelState {
  let duel = createCounterDuel(seed, `encounter:${seed}`, "hero:test", 73);
  while (duel.outcome === "ongoing") {
    duel = resolveCounterDuelRound(duel, duel.tell.suggestedStance, seed);
  }
  return duel;
}

function cappedDuelWithScore(heroScore: number, opponentScore: number): CounterDuelState {
  const sequences = counterDuelStances.flatMap((first) =>
    counterDuelStances.flatMap((second) =>
      counterDuelStances.flatMap((third) =>
        counterDuelStances.flatMap((fourth) =>
          counterDuelStances.map((fifth) => [first, second, third, fourth, fifth] as const)
        )
      )
    )
  );
  for (let seedIndex = 0; seedIndex < 32; seedIndex += 1) {
    const seed = `counter-cap:${seedIndex}`;
    for (const predictions of sequences) {
      let duel = createCounterDuel(seed, `encounter:cap:${seedIndex}`, "hero:cap", 50);
      for (const prediction of predictions) {
        if (duel.outcome !== "ongoing") break;
        duel = resolveCounterDuelRound(duel, prediction, seed);
      }
      if (
        duel.history.length === maximumCounterDuelRounds &&
        duel.heroScore === heroScore &&
        duel.opponentScore === opponentScore
      ) return duel;
    }
  }
  throw new Error(`No capped ${heroScore}-${opponentScore} Pattern Duel fixture found`);
}

function duelWithPatternBreak(): { seed: string; duel: CounterDuelState } {
  for (let index = 0; index < 128; index += 1) {
    const seed = `counter-pattern-break:${index}`;
    let duel = createCounterDuel(seed, `encounter:${seed}`, "hero:break", 64);
    duel = resolveCounterDuelRound(duel, duel.tell.suggestedStance, seed);
    if (duel.outcome !== "ongoing" || duel.patternBreak?.status !== "armed") continue;
    duel = resolveCounterDuelRound(duel, duel.tell.suggestedStance, seed);
    if (duel.patternBreak?.status === "spent") return { seed, duel };
  }
  throw new Error("No deterministic Pattern Break fixture found");
}

function releasedSchemaOne(duel: CounterDuelState): CounterDuelState {
  const released = structuredClone(duel) as CounterDuelState;
  released.schemaVersion = 1;
  delete released.rulesVersion;
  delete released.patternBreak;
  released.history = released.history.map(({ patternBreak: _receipt, ...round }) => round);
  return released;
}

describe("Pattern Duel canonical engine", () => {
  it("starts new duels under the earned Pattern Break rules contract", () => {
    const duel = createCounterDuel("counter-rules-v2", "encounter:rules-v2", "hero:rules-v2", 72);
    expect(duel).toMatchObject({
      schemaVersion: 2,
      rulesVersion: counterDuelRulesVersion,
      patternBreak: {
        opening: 0,
        required: counterDuelPatternBreakRequiredOpening,
        status: "building",
        armedRound: null,
        triggeredRound: null,
      },
    });
  });

  it("defines one original field note for every current species without a fallback", () => {
    expect(counterDuelHabitEncounterThreshold).toBe(3);
    for (const species of monsterDefinitions) {
      const habit = projectCounterDuelSpeciesHabit(species.id, 3);
      expect(habit).toMatchObject({ status: "established", encounters: 3, requiredEncounters: 3 });
      if (habit?.status !== "established") throw new Error("Expected an established current-species habit");
      expect(counterDuelStances).toContain(habit.preferredStance);
      expect(habit.label).toMatch(/often favor/i);
      expect(habit.label).not.toMatch(/will use|%/i);
      const pool = counterDuelOpponentStancePool(species.id);
      for (const stance of counterDuelStances) {
        expect(pool.filter((entry) => entry === stance)).toHaveLength(
          stance === habit.preferredStance ? 2 : 1,
        );
        expect(counterDuelOpponentStancePool(species.id, stance)).not.toContain(stance);
      }
    }
    expect(projectCounterDuelSpeciesHabit("future-unknown-species", 99)).toBeNull();
  });

  it("resolves every stance matchup through one exhaustive counter matrix", () => {
    for (const hero of counterDuelStances) {
      for (const opponent of counterDuelStances) {
        expect(resolveCounterDuelMatchup(hero, opponent)).toBe(expected[hero][opponent]);
      }
      expect(counterToStance(counterToStance(counterToStance(hero)))).toBe(hero);
    }
  });

  it("replays byte-identically across JSON reload after every committed round", () => {
    const seed = "counter-replay";
    let direct = createCounterDuel(seed, "encounter:replay", "hero:replay", 81);
    let restored = JSON.parse(JSON.stringify(direct)) as CounterDuelState;
    while (direct.outcome === "ongoing") {
      const prediction = direct.tell.suggestedStance;
      direct = resolveCounterDuelRound(direct, prediction, seed);
      restored = resolveCounterDuelRound(restored, prediction, seed);
      restored = JSON.parse(JSON.stringify(restored)) as CounterDuelState;
      expect(restored).toEqual(direct);
      expect(isValidCounterDuel(restored, seed)).toBe(true);
    }
  });

  it("keeps unrevealed intent outside the public policy view", () => {
    const duel = createCounterDuel("counter-public", "encounter:public", "hero:public", 60);
    const view = projectCounterDuelPolicyView(duel);
    expect(view.revealedRounds).toEqual([]);
    expect(view.habit).toEqual({ status: "unconfirmed", encounters: 0, requiredEncounters: 3 });
    expect(JSON.stringify(view)).not.toContain("opponentStance");
    expect(JSON.stringify(view)).not.toContain("often favor");
    expect(Object.keys(view).sort()).toEqual([
      "habit",
      "heroScore",
      "id",
      "opponentName",
      "opponentScore",
      "patternBreak",
      "revealedRounds",
      "round",
      "tell",
    ]);
  });

  it("arms and spends an opening only across two consecutive confirmed live-tell reads", () => {
    const { duel } = duelWithPatternBreak();
    expect(duel).toMatchObject({
      heroScore: 2,
      outcome: "victory",
      patternBreak: { opening: 2, status: "spent", armedRound: 1, triggeredRound: 2 },
    });
    expect(duel.history).toHaveLength(2);
    expect(duel.history[0]?.patternBreak).toEqual({
      openingBefore: 0,
      openingGain: 1,
      openingAfter: 1,
      evidence: "confirmed-live-tell",
      reset: false,
      triggered: false,
    });
    expect(duel.history[1]?.patternBreak).toEqual({
      openingBefore: 1,
      openingGain: 1,
      openingAfter: 2,
      evidence: "confirmed-live-tell",
      reset: false,
      triggered: true,
    });
    expect(duel.stakes).toMatchObject({ victoryExperience: 8, victoryGold: 5 });
  });

  it("does not charge an unsupported lucky read and resets an armed opening on any nonqualifying round", () => {
    let unsupported: CounterDuelState | null = null;
    let reset: CounterDuelState | null = null;
    for (let index = 0; index < 256 && (unsupported === null || reset === null); index += 1) {
      const seed = `counter-opening-boundary:${index}`;
      const initial = createCounterDuel(seed, `encounter:${seed}`, "hero:boundary", 60);
      for (const prediction of counterDuelStances) {
        const trial = resolveCounterDuelRound(initial, prediction, seed);
        if (trial.history.at(-1)?.result === "hero" && prediction !== initial.tell.suggestedStance) {
          unsupported = trial;
        }
      }
      const armed = resolveCounterDuelRound(initial, initial.tell.suggestedStance, seed);
      if (armed.outcome !== "ongoing" || armed.patternBreak?.status !== "armed") continue;
      for (const prediction of counterDuelStances) {
        const trial = resolveCounterDuelRound(armed, prediction, seed);
        if (trial.outcome === "ongoing" && trial.history.at(-1)?.patternBreak?.reset === true) reset = trial;
      }
    }
    expect(unsupported?.history.at(-1)?.patternBreak).toMatchObject({
      openingGain: 0,
      evidence: "none",
      triggered: false,
    });
    expect(reset?.patternBreak).toMatchObject({ opening: 0, status: "building", armedRound: null });
    expect(reset?.history.at(-1)?.patternBreak).toMatchObject({ openingBefore: 1, openingAfter: 0, reset: true });
  });

  it("migrates released schema-one history to inert receipts without retroactive Pattern Breaks", () => {
    const { seed, duel } = duelWithPatternBreak();
    const released = releasedSchemaOne(duel);
    expect(isValidCounterDuel(released, seed)).toBe(true);
    const migrated = upgradeCounterDuel(released, seed);
    expect(migrated).toMatchObject({
      schemaVersion: 2,
      rulesVersion: "legacy-inert-v1",
      heroScore: duel.heroScore,
      opponentScore: duel.opponentScore,
      outcome: duel.outcome,
      patternBreak: { opening: 0, status: "legacy-inert", armedRound: null, triggeredRound: null },
    });
    expect(migrated.history.every((round) => round.patternBreak?.openingAfter === 0 && round.patternBreak.triggered === false)).toBe(true);
    expect(isValidCounterDuel(migrated, seed)).toBe(true);
    expect(upgradeCounterDuel(migrated, seed)).toBe(migrated);
  });

  it("rejects forged Pattern Break arithmetic chronology and extra rewards", () => {
    const { seed, duel } = duelWithPatternBreak();
    const first = duel.history[0];
    expect(first?.patternBreak).toBeDefined();
    const forgedReceipt = {
      ...duel,
      history: [{ ...first, patternBreak: { ...first?.patternBreak, openingAfter: 2, triggered: true } }, ...duel.history.slice(1)],
    };
    expect(isValidCounterDuel(forgedReceipt, seed)).toBe(false);
    expect(isValidCounterDuel({ ...duel, patternBreak: { ...duel.patternBreak, triggeredRound: 1 } }, seed)).toBe(false);
    expect(isValidCounterDuel({ ...duel, heroScore: 3 }, seed)).toBe(false);
    expect(isValidCounterDuel({ ...duel, stakes: { ...duel.stakes, victoryGold: 6 } }, seed)).toBe(false);
  });

  it("reveals a tendency only at the exact third matching encounter", () => {
    const duel = createCounterDuel("counter-habit-boundary", "encounter:habit-boundary", "hero:habit", 60);
    const definition = monsterDefinitions.find((entry) => entry.id === duel.opponentSpeciesId);
    if (definition === undefined) throw new Error("Habit boundary fixture has no species definition");
    const lore = (encounters: number, monsterId: string = definition.id): MonsterLoreState => ({
      monsterId,
      monsterName: definition.name,
      encounters,
      victories: 0,
      insight: 0,
      requiredInsight: 3,
      secretTechniqueId: definition.secret.id,
      secretTechniqueName: definition.secret.name,
      learned: false,
    });
    const before = projectCounterDuelHabit(duel, [lore(2)]);
    expect(before).toEqual({ status: "unconfirmed", encounters: 2, requiredEncounters: 3 });
    expect(JSON.stringify(before)).not.toMatch(/rush|ward|feint|often favor/i);
    const mismatch = projectCounterDuelHabit(duel, [lore(99, "different-species")]);
    expect(mismatch).toEqual({ status: "unconfirmed", encounters: 0, requiredEncounters: 3 });
    const established = projectCounterDuelHabit(duel, [lore(3)]);
    expect(established).toMatchObject({ status: "established", encounters: 3, requiredEncounters: 3 });
    if (established.status !== "established") throw new Error("Expected an established habit");
    expect(established.label).toContain(counterDuelStanceLabel(established.preferredStance));
  });

  it("orders anti-streak, every live tell, then an established habit fallback", () => {
    const duel = createCounterDuel("counter-habit-ranking", "encounter:habit-ranking", "hero:habit", 60);
    const established = projectCounterDuelSpeciesHabit(duel.opponentSpeciesId, 3);
    if (established?.status !== "established") throw new Error("Expected an established ranking habit");
    const conflictingTell = counterDuelStances.find((stance) => stance !== established.preferredStance);
    if (conflictingTell === undefined) throw new Error("Expected a conflicting tell stance");
    const view = (clarity: 1 | 2 | 3): CounterDuelPolicyView => ({
      ...projectCounterDuelPolicyView(duel),
      habit: established,
      tell: { ...duel.tell, suggestedStance: conflictingTell, clarity },
    });
    for (const clarity of [1, 2, 3] as const) {
      expect(scoreCounterDuelPrediction(view(clarity), conflictingTell).score)
        .toBeGreaterThan(scoreCounterDuelPrediction(view(clarity), established.preferredStance).score);
    }

    const repeated: CounterDuelRound = {
      round: 1,
      tell: duel.tell,
      prediction: established.preferredStance,
      heroStance: counterToStance(established.preferredStance),
      opponentStance: established.preferredStance,
      result: "tie",
      heroScore: 0,
      opponentScore: 0,
    };
    const blocked = { ...view(1), revealedRounds: [repeated, { ...repeated, round: 2 }] };
    expect(scoreCounterDuelPrediction(blocked, established.preferredStance)).toMatchObject({ score: 0 });
    expect(scoreCounterDuelPrediction(blocked, conflictingTell).reason).toContain("temporarily impossible");

    const otherFallback = counterDuelStances.find(
      (stance) => stance !== established.preferredStance && stance !== conflictingTell,
    );
    if (otherFallback === undefined) throw new Error("Expected a third fallback stance");
    const repeatedTell = { ...repeated, opponentStance: conflictingTell };
    const tellBlocked = { ...view(1), revealedRounds: [repeatedTell, { ...repeatedTell, round: 2 }] };
    expect(scoreCounterDuelPrediction(tellBlocked, established.preferredStance).score)
      .toBeGreaterThan(scoreCounterDuelPrediction(tellBlocked, otherFallback).score);
    expect(scoreCounterDuelPrediction(tellBlocked, established.preferredStance).reason)
      .toContain(`make the live ${counterDuelStanceLabel(conflictingTell)} tell impossible`);
  });

  it("produces both honest and false tells while bounding every duel and opponent streak", () => {
    let honest = 0;
    let falseTells = 0;
    for (let index = 0; index < 128; index += 1) {
      const duel = play(`counter-soak:${index}`);
      expect(duel.outcome).not.toBe("ongoing");
      expect(duel.history.length).toBeLessThanOrEqual(maximumCounterDuelRounds);
      expect(duel.history.length).toBeGreaterThan(0);
      for (let round = 0; round < duel.history.length; round += 1) {
        const record = duel.history[round];
        if (record === undefined) continue;
        if (record.tell.suggestedStance === record.opponentStance) honest += 1;
        else falseTells += 1;
        if (round >= 2) {
          expect([
            duel.history[round - 2]?.opponentStance,
            duel.history[round - 1]?.opponentStance,
            record.opponentStance,
          ]).not.toEqual([record.opponentStance, record.opponentStance, record.opponentStance]);
        }
      }
      expect(new TextEncoder().encode(JSON.stringify(duel)).byteLength).toBeLessThan(4_096);
    }
    expect(honest).toBeGreaterThan(0);
    expect(falseTells).toBeGreaterThan(0);
  });

  it("uses the disclosed round-five leader tiebreak and draws equal capped scores", () => {
    expect(cappedDuelWithScore(1, 0).outcome).toBe("victory");
    expect(cappedDuelWithScore(0, 1).outcome).toBe("defeat");
    expect(cappedDuelWithScore(0, 0).outcome).toBe("draw");
  });

  it("rejects impossible scores, stakes, history, and deterministic identity", () => {
    const seed = "counter-invalid";
    const valid = play(seed);
    const opening = createCounterDuel(seed, "encounter:counter-invalid-opening", "hero:test", 73);
    expect(isValidCounterDuel(valid, seed)).toBe(true);
    expect(isValidCounterDuel(opening, seed)).toBe(true);
    expect(isValidCounterDuel({ ...opening, rulesVersion: undefined }, seed)).toBe(false);
    expect(isValidCounterDuel({ ...opening, rulesVersion: "unknown-rules-v1" }, seed)).toBe(false);
    expect(isValidCounterDuel({ ...valid, heroScore: valid.heroScore + 1 }, seed)).toBe(false);
    expect(isValidCounterDuel({ ...valid, stakes: { ...valid.stakes, victoryGold: 6 } }, seed)).toBe(false);
    expect(isValidCounterDuel({ ...valid, opponentSpeciesId: "forged" }, seed)).toBe(false);
    expect(isValidCounterDuel({ ...valid, history: [...valid.history, valid.history[0]!] }, seed)).toBe(false);
    const reordered = JSON.parse(JSON.stringify(valid), (key, entry) => {
      if (key === "" || typeof entry !== "object" || entry === null || Array.isArray(entry)) return entry;
      return Object.fromEntries(Object.entries(entry).reverse());
    });
    expect(isValidCounterDuel(reordered, seed)).toBe(true);
  });
});
