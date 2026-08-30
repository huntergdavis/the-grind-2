import { describe, expect, it } from "vitest";
import {
  counterDuelStances,
  counterToStance,
  createCounterDuel,
  isValidCounterDuel,
  maximumCounterDuelRounds,
  projectCounterDuelPolicyView,
  resolveCounterDuelMatchup,
  resolveCounterDuelRound,
} from "./counter-duel";
import type { CounterDuelRoundResult, CounterDuelStance, CounterDuelState } from "./types";

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

describe("Pattern Duel canonical engine", () => {
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
    expect(JSON.stringify(view)).not.toContain("opponentStance");
    expect(Object.keys(view).sort()).toEqual([
      "heroScore",
      "id",
      "opponentName",
      "opponentScore",
      "revealedRounds",
      "round",
      "tell",
    ]);
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
    expect(isValidCounterDuel(valid, seed)).toBe(true);
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
