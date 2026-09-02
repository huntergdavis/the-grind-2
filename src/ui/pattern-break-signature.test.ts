import { describe, expect, it } from "vitest";
import { canonicalHash, canonicalStringify } from "../core/canonical";
import { monsterDefinitions } from "../depth/combat";
import { createCounterDuel, resolveCounterDuelRound } from "../depth/counter-duel";
import type { CounterDuelState } from "../depth/types";
import {
  projectCounterDuelPatternBreakSignature,
  projectPatternBreakSignature,
  speciesPatternBreakSignatureVersion,
} from "./pattern-break-signature";

function duelWithPatternBreak(): CounterDuelState {
  for (let index = 0; index < 256; index += 1) {
    const seed = `signature-pattern-break:${index}`;
    let duel = createCounterDuel(seed, `encounter:${seed}`, "hero:signature", 64);
    duel = resolveCounterDuelRound(duel, duel.tell.suggestedStance, seed);
    if (duel.outcome !== "ongoing" || duel.patternBreak?.status !== "armed") continue;
    duel = resolveCounterDuelRound(duel, duel.tell.suggestedStance, seed);
    if (duel.patternBreak?.status === "spent") return duel;
  }
  throw new Error("No deterministic signature Pattern Break fixture found");
}

describe("species Pattern Break signature projection", () => {
  it("exhaustively maps every current species to one immutable shape and posture", () => {
    const signatures = monsterDefinitions.map((definition) => projectPatternBreakSignature(definition.id));
    expect(signatures.every((entry) => entry !== null)).toBe(true);
    const present = signatures.filter((entry) => entry !== null);
    expect(present.map((entry) => entry.speciesId)).toEqual(monsterDefinitions.map((entry) => entry.id));
    expect(new Set(present.map((entry) => entry.signatureId)).size).toBe(monsterDefinitions.length);
    expect(new Set(present.map((entry) => entry.motif)).size).toBe(monsterDefinitions.length);
    expect(new Set(present.map((entry) => JSON.stringify(entry.opponentPose))).size).toBe(monsterDefinitions.length);

    for (const entry of present) {
      expect(entry).toMatchObject({ presentationVersion: 1, registryVersion: speciesPatternBreakSignatureVersion });
      expect(entry.signatureId).toMatch(new RegExp(`^pattern-break:${entry.speciesId}:.+:v1$`));
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.colors)).toBe(true);
      expect(Object.isFrozen(entry.opponentPose)).toBe(true);
      for (const color of Object.values(entry.colors)) {
        expect(Number.isInteger(color)).toBe(true);
        expect(color).toBeGreaterThanOrEqual(0);
        expect(color).toBeLessThanOrEqual(0xffffff);
      }
      expect(Math.abs(entry.opponentPose.recoilX)).toBeLessThanOrEqual(3);
      expect(Math.abs(entry.opponentPose.liftY)).toBeLessThanOrEqual(2);
      expect(Math.abs(entry.opponentPose.tilt)).toBeLessThanOrEqual(0.07);
    }

    expect(projectPatternBreakSignature("future-unknown-species")).toBeNull();
    const first = present[0]!;
    expect(() => { (first.opponentPose as { recoilX: number }).recoilX = 99; }).toThrow(TypeError);
  });

  it("admits only a persisted triggering receipt without changing canonical state", () => {
    const seed = "signature-admission";
    let ordinary = createCounterDuel(seed, `encounter:${seed}`, "hero:signature", 64);
    expect(projectCounterDuelPatternBreakSignature(ordinary)).toBeNull();
    ordinary = resolveCounterDuelRound(ordinary, ordinary.tell.suggestedStance, seed);
    expect(projectCounterDuelPatternBreakSignature(ordinary)).toBeNull();

    const earned = duelWithPatternBreak();
    const before = canonicalStringify(earned);
    const hash = canonicalHash(earned);
    const signature = projectCounterDuelPatternBreakSignature(earned);
    expect(signature).not.toBeNull();
    expect(() => projectCounterDuelPatternBreakSignature({
      ...earned,
      opponentSpeciesId: "future-unknown-species" as typeof earned.opponentSpeciesId,
    })).toThrow("species signature is unavailable");
    expect(canonicalStringify(earned)).toBe(before);
    expect(canonicalHash(earned)).toBe(hash);
    expect(earned).toMatchObject({ heroScore: 2, stakes: { victoryExperience: 8, victoryGold: 5 } });

    const presentationText = JSON.stringify(monsterDefinitions.map((entry) => projectPatternBreakSignature(entry.id)));
    expect(presentationText).not.toMatch(/Moonhowl|Rootbreaker|Undertow Coil|False Treasure|Bellmetal Charge/i);
    expect(presentationText).not.toMatch(/weaken|piercing|arcane|poison|burning|damage|loot|weakness/i);
  });
});
