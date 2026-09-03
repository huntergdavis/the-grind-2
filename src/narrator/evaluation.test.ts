import { describe, expect, it } from "vitest";
import { canonicalHash } from "../core/canonical";
import { advanceWorld, createWorld } from "../core/simulation";
import {
  narratorEvaluationCasesV1,
  narratorEvaluationCorpusHashV1,
  narratorEvaluationRequiredCases,
  narratorEvaluationRequiredSeeds,
} from "./evaluation";
import { isSafeAmbientNarration } from "./output-policy";
import { isNarratorPromptV1, narratorMaximumPlaceCharacters } from "./protocol";
import { projectSceneNarratorJob } from "./scene-packet";

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

  it("locks a 20-packet subset projected through the real Scene and Chronicle path", () => {
    const prompts = [];
    for (let seed = 0; seed < 4; seed += 1) {
      let world = createWorld(`narrator-production:${seed}`, `campaign:narrator-production:${seed}`);
      let previousEventId: string | undefined;
      let collected = 0;
      for (let tick = 0; tick < 160 && collected < 5; tick += 1) {
        const source = world.chronicle.at(-1);
        const job = source?.id === previousEventId
          ? null
          : projectSceneNarratorJob(world.campaignId, world.scene, source, source?.id);
        if (source !== undefined) previousEventId = source.id;
        if (job !== null) {
          prompts.push(job.prompt);
          collected += 1;
        }
        world = advanceWorld(world);
      }
      expect(collected).toBe(5);
    }
    expect(prompts).toHaveLength(20);
    expect(prompts.every(isNarratorPromptV1)).toBe(true);
    expect(canonicalHash(prompts)).toBe("2658c23702c3d037");
    expect(JSON.stringify(prompts)).not.toMatch(/reward|objective|consequence|decision|gold|experience/iu);
  });

  it("rejects decomposed Unicode, control characters, and bidirectional overrides", () => {
    const prompt = narratorEvaluationCasesV1[0]!.prompt;
    const withPlace = (place: string) => ({ ...prompt, facts: { ...prompt.facts, place } });
    expect(isNarratorPromptV1(withPlace("Du\u0301nmere"))).toBe(false);
    expect(isNarratorPromptV1(withPlace("Dun\u0000mere"))).toBe(false);
    expect(isNarratorPromptV1(withPlace("Dun\u202emere"))).toBe(false);
  });
});
