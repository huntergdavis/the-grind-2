import { describe, expect, it } from "vitest";
import {
  narratorEvaluationCasesV1,
  narratorEvaluationCorpusHashV1,
  narratorEvaluationRequiredCases,
  narratorEvaluationRequiredSeeds,
} from "./evaluation";
import { isSafeAmbientNarration } from "./output-policy";
import { isNarratorPromptV1, narratorMaximumPlaceCharacters } from "./protocol";

describe("narrator evaluation corpus", () => {
  it("has a reviewed golden fingerprint", () => {
    expect(narratorEvaluationCorpusHashV1).toBe("63b3a0ee9fef092a");
  });

  it("fixes 200 valid paired packets over 20 seeds and every current scene mode", () => {
    expect(narratorEvaluationCasesV1).toHaveLength(narratorEvaluationRequiredCases);
    expect(new Set(narratorEvaluationCasesV1.map((entry) => entry.seedId)).size)
      .toBe(narratorEvaluationRequiredSeeds);
    expect(new Set(narratorEvaluationCasesV1.map((entry) => entry.id)).size).toBe(200);
    expect(new Set(narratorEvaluationCasesV1.map((entry) => entry.prompt.facts.sceneKind))).toEqual(new Set([
      "town", "atlas", "travel", "dungeon", "battle", "training", "discovery", "camp", "chronicle",
    ]));
    expect(narratorEvaluationCasesV1.every((entry) =>
      isNarratorPromptV1(entry.prompt)
      && entry.allowedOutputs.length === 3
      && entry.allowedOutputs.every((line) => isSafeAmbientNarration(line, entry.prompt))
      && entry.deterministicBaseline.length > 0)).toBe(true);
  });

  it("covers every semantic move and energy stratum", () => {
    const strata = new Set(narratorEvaluationCasesV1.map((entry) =>
      `${entry.prompt.move}:${entry.prompt.facts.energy}`));
    expect(strata).toEqual(new Set([
      "establish-setting:quiet",
      "establish-setting:steady",
      "establish-setting:heightened",
      "shade-atmosphere:quiet",
      "shade-atmosphere:steady",
      "shade-atmosphere:heightened",
      "register-pressure:quiet",
      "register-pressure:steady",
      "register-pressure:heightened",
    ]));
  });

  it("keeps every scene on its production semantic move", () => {
    const expectedMoves = {
      town: "establish-setting",
      atlas: "establish-setting",
      travel: "establish-setting",
      training: "establish-setting",
      discovery: "establish-setting",
      camp: "shade-atmosphere",
      chronicle: "shade-atmosphere",
      battle: "register-pressure",
      dungeon: "register-pressure",
    } as const;
    expect(narratorEvaluationCasesV1.every((entry) =>
      entry.prompt.move === expectedMoves[entry.prompt.facts.sceneKind])).toBe(true);
  });

  it("covers punctuation, Unicode, multiword, and maximum-length place names", () => {
    const places = narratorEvaluationCasesV1.map((entry) => entry.prompt.facts.place);
    expect(places).toContain("Alder's Wake");
    expect(places).toContain("Bellweather-Ford");
    expect(places).toContain("Dúnmere");
    expect(places).toContain("Juniper Watch & Weir");
    expect(places.some((place) => place.length === narratorMaximumPlaceCharacters)).toBe(true);
  });

  it("freezes the corpus, cases, prompts, facts, and allowed output sets", () => {
    expect(Object.isFrozen(narratorEvaluationCasesV1)).toBe(true);
    expect(narratorEvaluationCasesV1.every((entry) =>
      Object.isFrozen(entry)
      && Object.isFrozen(entry.prompt)
      && Object.isFrozen(entry.prompt.facts)
      && Object.isFrozen(entry.allowedOutputs))).toBe(true);
  });
});
