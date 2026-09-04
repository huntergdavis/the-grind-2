import { describe, expect, it } from "vitest";
import { isSafeLiveNarration } from "./live-output-policy";
import { allowedNarratorLines, deterministicNarratorFallback } from "./output-policy";
import {
  narratorMaximumOutputCharacters,
  type NarratorEnergy,
  type NarratorMoveV1,
  type NarratorPromptV1,
} from "./protocol";

const energies: readonly NarratorEnergy[] = ["quiet", "steady", "heightened"];
const moves: readonly NarratorMoveV1[] = ["establish-setting", "shade-atmosphere", "register-pressure"];

function prompt(
  move: NarratorMoveV1,
  energy: NarratorEnergy = "steady",
  place = "Moonclock Vault",
): NarratorPromptV1 {
  return {
    schemaVersion: 1,
    task: "single-ambient-line",
    voice: move === "register-pressure" ? "hero-aside-v1" : "spare-observer-v1",
    move,
    facts: {
      schemaVersion: 1,
      kind: "public-scene",
      sceneKind: move === "register-pressure" ? "dungeon" : move === "shade-atmosphere" ? "camp" : "travel",
      place,
      energy,
    },
  };
}

describe("live narrator output policy", () => {
  it("accepts only the deterministic baseline or a prompt-specific authored form", () => {
    for (const move of moves) {
      for (const energy of energies) {
        const packet = prompt(move, energy);
        expect(isSafeLiveNarration(deterministicNarratorFallback(packet), packet)).toBe(true);
        for (const line of allowedNarratorLines(packet)) {
          expect(isSafeLiveNarration(line, packet)).toBe(true);
        }
      }
    }

    const shaded = prompt("shade-atmosphere");
    const shadeBaseline = deterministicNarratorFallback(shaded);
    expect(allowedNarratorLines(shaded)).not.toContain(shadeBaseline);
    expect(isSafeLiveNarration(shadeBaseline, shaded)).toBe(true);
  });

  it("rejects arbitrary prose, mutations, and lines from another semantic move", () => {
    const established = prompt("establish-setting");
    const shaded = prompt("shade-atmosphere");
    const line = allowedNarratorLines(established)[1]!;
    expect(isSafeLiveNarration("The air is warm.", established)).toBe(false);
    expect(isSafeLiveNarration(`${line} `, established)).toBe(false);
    expect(isSafeLiveNarration(line.replace("steady", "quiet"), established)).toBe(false);
    expect(isSafeLiveNarration(line, shaded)).toBe(false);
  });

  it("reapplies normalization, newline, markup, numeric, URL, character, and word guards", () => {
    for (const unsafePlace of [
      "Moonclock  Vault",
      "Moonclock\nVault",
      "<Moonclock Vault>",
      "Moonclock Vault 2",
      "https://example.com",
      "www.example.com",
      Array.from({ length: 22 }, () => "word").join(" "),
    ]) {
      const packet = prompt("establish-setting", "steady", unsafePlace);
      expect(isSafeLiveNarration(allowedNarratorLines(packet)[0]!, packet), unsafePlace).toBe(false);
      expect(isSafeLiveNarration(deterministicNarratorFallback(packet), packet), unsafePlace).toBe(false);
    }

    expect(isSafeLiveNarration(
      "x".repeat(narratorMaximumOutputCharacters + 1),
      prompt("establish-setting"),
    )).toBe(false);
  });
});
