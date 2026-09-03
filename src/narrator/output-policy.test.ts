import { describe, expect, it } from "vitest";
import type { NarratorEnergy, NarratorMoveV1, NarratorPromptV1 } from "./protocol";
import { allowedNarratorLines, isSafeAmbientNarration } from "./output-policy";

const energies: readonly NarratorEnergy[] = ["quiet", "steady", "heightened"];
const moves: readonly NarratorMoveV1[] = ["establish-setting", "shade-atmosphere", "register-pressure"];

function prompt(move: NarratorMoveV1, energy: NarratorEnergy): NarratorPromptV1 {
  return {
    schemaVersion: 1,
    task: "single-ambient-line",
    voice: move === "register-pressure" ? "hero-aside-v1" : "spare-observer-v1",
    move,
    facts: {
      schemaVersion: 1,
      kind: "public-scene",
      sceneKind: move === "register-pressure" ? "dungeon" : move === "shade-atmosphere" ? "camp" : "travel",
      place: "Moonclock Vault",
      energy,
    },
  };
}

describe("narrator output policy", () => {
  it("accepts only prompt-specific lines for every move and energy", () => {
    for (const move of moves) {
      for (const energy of energies) {
        const packet = prompt(move, energy);
        const allowed = allowedNarratorLines(packet);
        expect(allowed).toHaveLength(3);
        for (const line of allowed) expect(isSafeAmbientNarration(line, packet)).toBe(true);

        const contradictory = energy === "quiet" ? "heightened" : "quiet";
        expect(isSafeAmbientNarration(allowed[0]!.replace(energy, contradictory), packet)).toBe(false);
        if (move !== "register-pressure") {
          expect(isSafeAmbientNarration(allowed[0]!.replace("Moonclock Vault", "Elsewhere"), packet)).toBe(false);
        }
        expect(isSafeAmbientNarration("The air is warm.", packet)).toBe(false);
      }
    }
  });

  it("does not let a valid line cross semantic moves or voices", () => {
    const established = prompt("establish-setting", "steady");
    const shaded = prompt("shade-atmosphere", "steady");
    const pressure = prompt("register-pressure", "steady");
    expect(isSafeAmbientNarration(allowedNarratorLines(established)[0]!, shaded)).toBe(false);
    expect(isSafeAmbientNarration(allowedNarratorLines(shaded)[0]!, pressure)).toBe(false);
    expect(isSafeAmbientNarration(allowedNarratorLines(pressure)[0]!, established)).toBe(false);
  });

  it("rejects normalized, multiline, numeric, URL, markup, and overlong forms", () => {
    const packet = prompt("establish-setting", "steady");
    const line = allowedNarratorLines(packet)[0]!;
    for (const invalid of [
      ` ${line}`,
      `${line}\nAnother line.`,
      `${line} 2`,
      `${line} https://example.com`,
      `<b>${line}</b>`,
    ]) expect(isSafeAmbientNarration(invalid, packet)).toBe(false);
  });
});
