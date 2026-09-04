import { describe, expect, it } from "vitest";
import { canonicalHash } from "../core/canonical";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  accountNarratorFormTargetsV3,
  allowedNarratorFormTokenIdsV3,
  countNarratorFormInputTokenIdsV3,
  createNarratorFormEligibilityDecisionV3,
  formatNarratorFormPromptUtf8V3,
  formatNarratorFormPromptV3,
  isNarratorFormEligibilityDecisionV3,
  isSafeRenderedNarrationV3,
  narratorFloat32FromBitsV3,
  narratorFloat32ToBitsV3,
  narratorFormEligibilityPolicyHashV3,
  narratorFormFloat32ScoreHashV3,
  narratorFormGenerationConfigurationHashV3,
  narratorFormGenerationConfigurationV3,
  narratorFormIdsV3,
  narratorFormInputTokenAccountingHashV3,
  narratorFormPromptFormatterHashV3,
  narratorFormRegistryHashV3,
  narratorFormRendererHashV3,
  narratorFormSelectionContractHashV3,
  narratorFormSelectionContractV3,
  narratorFormTargetTokenAccountingHashV3,
  narratorFormTrieSelectionHashV3,
  narratorFormsV3,
  narratorRenderedSafetyHashV3,
  renderNarratorFormV3,
  validateNarratorFormSelectionV3,
  type NarratorFormEligibilityDecisionV3,
  type NarratorFormTargetObservationV3,
  type NarratorFormTargetSetV3,
  type NarratorFormSelectionTraceStepV3,
} from "./evaluation-selection-contract-v3";
import {
  narratorDecodingConfigurationHashV2,
  narratorGeneratedTokenAccountingHashV2,
  narratorInputTokenAccountingHashV2,
  narratorPromptAndTokenContractHashV2,
  narratorPromptFormatterHashV2,
  narratorVisibleOutputNormalizationHashV2,
} from "./evaluation-prompt-contract";
import { deterministicNarratorFallback, isSafeAmbientNarration } from "./output-policy";
import type { NarratorEnergy, NarratorMoveV1, NarratorPromptV1, NarratorVoiceV1 } from "./protocol";

function prompt(
  place: string,
  sceneKind: NarratorPromptV1["facts"]["sceneKind"] = "town",
  move: NarratorMoveV1 = "establish-setting",
  energy: NarratorEnergy = "quiet",
  voice: NarratorVoiceV1 = "spare-observer-v1",
): NarratorPromptV1 {
  return {
    schemaVersion: 1,
    task: "single-ambient-line",
    voice,
    move,
    facts: { schemaVersion: 1, kind: "public-scene", sceneKind, place, energy },
  };
}

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
}

function context(sequenceSlot = 0, priorSelectedFormId: string | null = null) {
  return { seedId: "narrator-eval-seed:00", sequenceSlot, priorSelectedFormId };
}

const targetIds = {
  "establish-holds": [17501, 4770, 4532, 3, 9, 3, 25576, 12912, 476, 798, 5, 1],
  "establish-gathers": [71, 3, 25576, 12912, 476, 798, 7479, 7, 44, 17501, 4770, 5, 1],
  "establish-waits": [17501, 4770, 1749, 7, 441, 3, 9, 3, 25576, 12912, 476, 798, 5, 1],
  "shade-holds-baseline": [17501, 4770, 4532, 3, 9, 3, 25576, 12912, 476, 798, 5, 1],
  "shade-rests": [17501, 4770, 880, 7, 441, 3, 9, 3, 25576, 12912, 476, 798, 5, 1],
  "shade-settles": [71, 3, 25576, 12912, 476, 798, 8955, 7, 147, 17501, 4770, 5, 1],
  "shade-lingers": [37, 3, 25576, 12912, 476, 798, 3, 14043, 7, 44, 17501, 4770, 5, 1],
  "pressure-attention": [100, 3, 25576, 12912, 476, 798, 65, 82, 1388, 5, 1],
  "pressure-feel": [27, 473, 48, 3, 25576, 12912, 476, 798, 5, 1],
  "pressure-close": [100, 3, 25576, 12912, 476, 798, 4227, 885, 5, 1],
} as const;

function observations(
  value: NarratorPromptV1,
  eligibility: NarratorFormEligibilityDecisionV3,
): NarratorFormTargetObservationV3[] {
  const descriptors = new Map(narratorFormsV3(value).map((form) => [form.formId, form]));
  return eligibility.eligibleFormIds.map((formId) => ({
    formId,
    tokenIds: targetIds[formId],
    decodedWitness: descriptors.get(formId)!.witness,
  }));
}

function targetSet(
  value = prompt("Alder Hall"),
  eligibility = createNarratorFormEligibilityDecisionV3(value, context()),
): NarratorFormTargetSetV3 {
  return accountNarratorFormTargetsV3(value, eligibility, observations(value, eligibility));
}

function bits(...scores: number[]): number[] {
  return scores.map(narratorFloat32ToBitsV3);
}

function gatherTrace(
  value: NarratorPromptV1,
  eligibility: NarratorFormEligibilityDecisionV3,
  set: NarratorFormTargetSetV3,
): NarratorFormSelectionTraceStepV3[] {
  const selected = targetIds["establish-gathers"];
  return selected.map((emittedTokenId, index) => {
    const prefixTokenIds = selected.slice(0, index);
    const allowedTokenIds = allowedNarratorFormTokenIdsV3(value, eligibility, set, prefixTokenIds);
    return {
      prefixTokenIds,
      allowedTokenIds,
      allowedScoreBits: allowedTokenIds.map((tokenId) => narratorFloat32ToBitsV3(
        tokenId === emittedTokenId ? 2 : 1,
      )),
      emittedTokenId,
    };
  });
}

function selectionFixture() {
  const value = prompt("Alder Hall");
  const eligibility = createNarratorFormEligibilityDecisionV3(value, context());
  const set = targetSet(value, eligibility);
  const selectionTokenIds = [...targetIds["establish-gathers"]];
  return {
    value,
    eligibility,
    set,
    selectionTokenIds,
    fullSequence: [0, ...selectionTokenIds],
    trace: gatherTrace(value, eligibility, set),
  };
}

const asciiGolden = "Select the most fitting safe ambient narration form for this scene.\n"
  + "{\"prompt\":{\"facts\":{\"energy\":\"quiet\",\"kind\":\"public-scene\",\"place\":\"Alder Hall\",\"sceneKind\":\"town\",\"schemaVersion\":1},\"move\":\"establish-setting\",\"schemaVersion\":1,\"task\":\"single-ambient-line\",\"voice\":\"spare-observer-v1\"},\"schemaVersion\":3}";

describe("narrator V3 form prompt and registry", () => {
  it("locks the complete ASCII text, UTF-8 framing, Unicode, maximum input, and corpus vectors", () => {
    const value = prompt("Alder Hall");
    const bytes = formatNarratorFormPromptUtf8V3(value);
    expect(formatNarratorFormPromptV3(value)).toBe(asciiGolden);
    expect(bytes).toEqual(new TextEncoder().encode(asciiGolden));
    expect(bytes).toHaveLength(307);
    expect(canonicalHash([...bytes])).toBe("d579c223abcf9cc5");
    expect(bytes[0]).not.toBe(0xef);
    expect(formatNarratorFormPromptV3(value).endsWith("\n")).toBe(false);
    const unicodeBytes = formatNarratorFormPromptUtf8V3(prompt("Dúnmere"));
    expect(unicodeBytes).toHaveLength(305);
    expect(canonicalHash([...unicodeBytes])).toBe("b9cc51c695c9724d");
    expect(new TextDecoder().decode(unicodeBytes)).toContain("Dúnmere");
    const maximumBytes = formatNarratorFormPromptUtf8V3(prompt("x".repeat(120)));
    expect(maximumBytes).toHaveLength(417);
    expect(canonicalHash([...maximumBytes])).toBe("cc40135848e8a45d");
    expect(canonicalHash(narratorEvaluationCasesV1.map(({ prompt: casePrompt }) =>
      [...formatNarratorFormPromptUtf8V3(casePrompt)]))).toBe("a003940df5f483d1");
  });

  it("escapes control syntax and makes every variable prompt field model-visible", () => {
    const escaped = formatNarratorFormPromptV3(prompt("Keep\"\\Gate\tNorth\nSouth\rEast"));
    expect(escaped).toContain("Keep\\\"\\\\Gate\\tNorth\\nSouth\\rEast");
    expect(escaped.match(/\n/gu)).toHaveLength(1);
    expect(escaped).not.toContain("\t");
    expect(escaped).not.toContain("\r");
    expect(formatNarratorFormPromptUtf8V3(prompt("Keep\"\\Gate\tNorth\nSouth\rEast"))).toHaveLength(329);
    expect(canonicalHash([...formatNarratorFormPromptUtf8V3(prompt("Keep\"\\Gate\tNorth\nSouth\rEast"))]))
      .toBe("dda4d97c042a7661");
    const values = [
      prompt("Alder Hall"),
      prompt("Bell Hall"),
      prompt("Alder Hall", "atlas"),
      prompt("Alder Hall", "town", "shade-atmosphere"),
      prompt("Alder Hall", "town", "establish-setting", "heightened"),
      prompt("Alder Hall", "battle", "register-pressure", "quiet", "hero-aside-v1"),
    ];
    expect(new Set(values.map(formatNarratorFormPromptV3))).toHaveLength(values.length);
  });

  it("rejects invalid, extra-key, decomposed, and voice/move-mismatched prompts", () => {
    const valid = prompt("Alder Hall");
    expect(() => formatNarratorFormPromptV3({ ...valid, extra: true })).toThrow(TypeError);
    expect(() => formatNarratorFormPromptV3({ ...valid, voice: "hero-aside-v1" })).toThrow(TypeError);
    expect(() => formatNarratorFormPromptV3({
      ...valid,
      facts: { ...valid.facts, place: "Du\u0301nmere" },
    })).toThrow(TypeError);
    expect(() => narratorFormsV3(null)).toThrow(TypeError);
  });

  it("exposes one baseline and the exact stable forms for every move", () => {
    const establish = narratorFormsV3(prompt("Dúnmere"));
    const shadePrompt = prompt("Dúnmere", "camp", "shade-atmosphere");
    const shade = narratorFormsV3(shadePrompt);
    const pressure = narratorFormsV3(prompt("Dúnmere", "battle", "register-pressure", "quiet", "hero-aside-v1"));
    expect(establish.map((form) => form.formId)).toEqual([
      "establish-holds", "establish-gathers", "establish-waits",
    ]);
    expect(shade.map((form) => form.formId)).toEqual([
      "shade-holds-baseline", "shade-rests", "shade-settles", "shade-lingers",
    ]);
    expect(pressure.map((form) => form.formId)).toEqual([
      "pressure-attention", "pressure-feel", "pressure-close",
    ]);
    expect(Object.isFrozen(narratorFormIdsV3)).toBe(true);
    expect(() => (narratorFormIdsV3 as unknown as string[]).push("forged-form")).toThrow(TypeError);
    for (const set of [establish, shade, pressure]) {
      expect(set.filter((form) => form.baseline)).toHaveLength(1);
      expect(isDeeplyFrozen(set)).toBe(true);
      expect(set.every((form) => form.targetTokenIds.length >= 1 && form.targetTokenIds.length <= 48)).toBe(true);
    }
    expect(Math.max(...[...establish, ...shade, ...pressure].map((form) => form.targetTokenIds.length))).toBe(14);
    expect(canonicalHash(narratorEvaluationCasesV1.map(({ prompt: casePrompt }) =>
      narratorFormsV3(casePrompt).map((form) => renderNarratorFormV3(casePrompt, form.formId)))))
      .toBe("560955158579751c");
    for (const evaluationCase of narratorEvaluationCasesV1) {
      const rendered = narratorFormsV3(evaluationCase.prompt)
        .map((form) => ({ form, text: renderNarratorFormV3(evaluationCase.prompt, form.formId) }));
      expect(rendered.filter(({ form }) => form.baseline).map(({ text }) => text))
        .toEqual([deterministicNarratorFallback(evaluationCase.prompt)]);
      expect(new Set(rendered.map(({ text }) => text))).toHaveLength(rendered.length);
      expect(rendered.every(({ text }) => isSafeRenderedNarrationV3(text, evaluationCase.prompt))).toBe(true);
    }
    expect(renderNarratorFormV3(shadePrompt, "shade-holds-baseline")).toBe("Dúnmere holds a quiet moment.");
    expect(isSafeRenderedNarrationV3("Dúnmere holds a quiet moment.", shadePrompt)).toBe(true);
    expect(isSafeRenderedNarrationV3("Dúnmere\tGate holds a quiet moment.", {
      ...shadePrompt,
      facts: { ...shadePrompt.facts, place: "Dúnmere\tGate" },
    })).toBe(false);
    expect(isSafeAmbientNarration("Dúnmere holds a quiet moment.", shadePrompt)).toBe(false);
    expect(() => renderNarratorFormV3(shadePrompt, "establish-holds")).toThrow(TypeError);
    expect(() => renderNarratorFormV3(shadePrompt, "not-a-form")).toThrow(TypeError);
  });

  it("locks every component as a distinct additive V3 fingerprint without changing V2", () => {
    const hashes = [
      narratorFormPromptFormatterHashV3,
      narratorFormRegistryHashV3,
      narratorFormRendererHashV3,
      narratorRenderedSafetyHashV3,
      narratorFormEligibilityPolicyHashV3,
      narratorFormInputTokenAccountingHashV3,
      narratorFormTargetTokenAccountingHashV3,
      narratorFormGenerationConfigurationHashV3,
      narratorFormFloat32ScoreHashV3,
      narratorFormTrieSelectionHashV3,
      narratorFormSelectionContractHashV3,
    ];
    expect(hashes).toEqual([
      "1dfedad335b8a63b",
      "bf80b8ec308874a6",
      "3e5c827eea70ddd5",
      "399809d869bfce7f",
      "08a761eac07eea2e",
      "5e1670513e041369",
      "dce48b813e196c58",
      "f9064c4ee1e0bb6f",
      "e08eb4ca537f6608",
      "f61ced37516c4894",
      "0b1631e866f3eeae",
    ]);
    expect(new Set(hashes)).toHaveLength(hashes.length);
    expect(hashes).not.toContain(narratorPromptAndTokenContractHashV2);
    expect({
      formatter: narratorPromptFormatterHashV2,
      input: narratorInputTokenAccountingHashV2,
      generated: narratorGeneratedTokenAccountingHashV2,
      normalization: narratorVisibleOutputNormalizationHashV2,
      decoding: narratorDecodingConfigurationHashV2,
      aggregate: narratorPromptAndTokenContractHashV2,
    }).toEqual({
      formatter: "f4110696dae2785d",
      input: "934d8ae1dac022e9",
      generated: "257125851307cf42",
      normalization: "1d8ca196ce8898a6",
      decoding: "fccf17580185c883",
      aggregate: "54d644a6ea398e4a",
    });
    expect(isDeeplyFrozen(narratorFormSelectionContractV3)).toBe(true);
    expect(isDeeplyFrozen(narratorFormGenerationConfigurationV3)).toBe(true);
  });
});

describe("narrator V3 form eligibility", () => {
  it("uses fixed two-call bursts, suppresses only prior nonbaseline, and always retains baseline", () => {
    const value = prompt("Alder Hall");
    const first = createNarratorFormEligibilityDecisionV3(value, context(0));
    const second = createNarratorFormEligibilityDecisionV3(value, context(1, "establish-gathers"));
    expect(first.eligibleFormIds).toEqual(["establish-holds", "establish-gathers", "establish-waits"]);
    expect(second.eligibleFormIds).toEqual(["establish-holds", "establish-waits"]);
    expect(second.suppressedFormId).toBe("establish-gathers");
    expect(second.baselineFormId).toBe("establish-holds");
    expect(isNarratorFormEligibilityDecisionV3(second, value)).toBe(true);
    expect(isDeeplyFrozen(second)).toBe(true);
  });

  it("does not suppress baseline, cross-move, invalid, or reset-boundary history", () => {
    const value = prompt("Alder Hall");
    expect(createNarratorFormEligibilityDecisionV3(value, context(1, "establish-holds")).suppressedFormId).toBeNull();
    expect(createNarratorFormEligibilityDecisionV3(value, context(1, "pressure-feel")).suppressedFormId).toBeNull();
    expect(createNarratorFormEligibilityDecisionV3(value, context(1, null)).suppressedFormId).toBeNull();
    expect(() => createNarratorFormEligibilityDecisionV3(value, context(2, "establish-gathers"))).toThrow(TypeError);
    expect(() => createNarratorFormEligibilityDecisionV3(value, context(10))).toThrow(TypeError);
    expect(() => createNarratorFormEligibilityDecisionV3(value, context(1, "unknown"))).toThrow(TypeError);
    expect(() => createNarratorFormEligibilityDecisionV3(value, { ...context(), extra: true })).toThrow(TypeError);
  });

  it("rejects rehashed or unknown decision mutations", () => {
    const value = prompt("Alder Hall");
    const decision = createNarratorFormEligibilityDecisionV3(value, context(1, "establish-gathers"));
    const { contentHash: _hash, ...content } = structuredClone(decision);
    const reordered = { ...content, eligibleFormIds: [...content.eligibleFormIds].reverse() };
    expect(isNarratorFormEligibilityDecisionV3({ ...reordered, contentHash: canonicalHash(reordered) }, value)).toBe(false);
    const extraArrayProperty = structuredClone(decision) as NarratorFormEligibilityDecisionV3 & {
      eligibleFormIds: string[] & { extra?: boolean };
    };
    extraArrayProperty.eligibleFormIds.extra = true;
    expect(isNarratorFormEligibilityDecisionV3(extraArrayProperty, value)).toBe(false);
    expect(isNarratorFormEligibilityDecisionV3({ ...decision, extra: true }, value)).toBe(false);
  });
});

describe("narrator V3 target accounting and trie", () => {
  it("counts bounded terminal-EOS input IDs", () => {
    expect(countNarratorFormInputTokenIdsV3([9, 8, 1])).toBe(3);
    const maximum = new Uint32Array(320).fill(7);
    maximum[319] = 1;
    expect(countNarratorFormInputTokenIdsV3(maximum)).toBe(320);
    expect(() => countNarratorFormInputTokenIdsV3([])).toThrow(RangeError);
    expect(() => countNarratorFormInputTokenIdsV3(new Uint32Array(321))).toThrow(RangeError);
    expect(() => countNarratorFormInputTokenIdsV3([7, 8])).toThrow(TypeError);
    expect(() => countNarratorFormInputTokenIdsV3([1.5, 1])).toThrow(TypeError);
    expect(() => countNarratorFormInputTokenIdsV3([BigInt(Number.MAX_SAFE_INTEGER) + 1n, 1n])).toThrow(TypeError);
    const sparse = [9, 8, 1];
    delete sparse[1];
    expect(() => countNarratorFormInputTokenIdsV3(sparse)).toThrow(TypeError);
    const extra = [9, 8, 1] as number[] & { extra?: boolean };
    extra.extra = true;
    expect(() => countNarratorFormInputTokenIdsV3(extra)).toThrow(TypeError);
  });

  it("requires exact witness round-trip, terminal EOS, bounds, density, and unique targets", () => {
    const value = prompt("Alder Hall");
    const eligibility = createNarratorFormEligibilityDecisionV3(value, context());
    const valid = observations(value, eligibility);
    const result = accountNarratorFormTargetsV3(value, eligibility, valid);
    expect(result.targets.map((target) => target.formId)).toEqual(eligibility.eligibleFormIds);
    expect(isDeeplyFrozen(result)).toBe(true);
    const invented = valid.map((entry, index) => index === 0 ? {
      ...entry,
      tokenIds: [...new Array(47).fill(9), 1],
    } : entry);
    expect(() => accountNarratorFormTargetsV3(value, eligibility, invented)).toThrow(TypeError);
    expect(() => accountNarratorFormTargetsV3(value, eligibility, valid.map((entry, index) => index === 0
      ? { ...entry, decodedWitness: "Dnmere" }
      : entry))).toThrow(TypeError);
    expect(() => accountNarratorFormTargetsV3(value, eligibility, valid.map((entry, index) => index === 0
      ? { ...entry, tokenIds: [9, 1, 8] }
      : entry))).toThrow(TypeError);
    expect(() => accountNarratorFormTargetsV3(value, eligibility, valid.map((entry, index) => index === 0
      ? { ...entry, tokenIds: [9, 0, 1] }
      : entry))).toThrow(TypeError);
    expect(() => accountNarratorFormTargetsV3(value, eligibility, valid.map((entry, index) => index === 0
      ? { ...entry, tokenIds: [...new Array(48).fill(9), 1] }
      : entry))).toThrow(RangeError);
    expect(() => accountNarratorFormTargetsV3(value, eligibility, valid.map((entry, index) => index === 1
      ? { ...entry, tokenIds: valid[0]!.tokenIds }
      : entry))).toThrow(TypeError);
    const sparse = [...valid];
    delete sparse[1];
    expect(() => accountNarratorFormTargetsV3(value, eligibility, sparse)).toThrow(TypeError);
    const extra = [...valid] as NarratorFormTargetObservationV3[] & { extra?: boolean };
    extra.extra = true;
    expect(() => accountNarratorFormTargetsV3(value, eligibility, extra)).toThrow(TypeError);
  });

  it("recomputes sorted shared-prefix branches and rejects complete or unmatched prefixes", () => {
    const value = prompt("Alder Hall");
    const eligibility = createNarratorFormEligibilityDecisionV3(value, context());
    const set = targetSet(value, eligibility);
    expect(allowedNarratorFormTokenIdsV3(value, eligibility, set, [])).toEqual([71, 17501]);
    expect(allowedNarratorFormTokenIdsV3(value, eligibility, set, [17501])).toEqual([4770]);
    expect(allowedNarratorFormTokenIdsV3(value, eligibility, set, [17501, 4770])).toEqual([1749, 4532]);
    expect(() => allowedNarratorFormTokenIdsV3(value, eligibility, set, [99])).toThrow(TypeError);
    expect(() => allowedNarratorFormTokenIdsV3(
      value,
      eligibility,
      set,
      targetIds["establish-gathers"],
    )).toThrow(TypeError);
  });

  it("rejects rehashed target sets that forge eligibility, prompts, omissions, or tokenizer vectors", () => {
    const value = prompt("Alder Hall");
    const first = createNarratorFormEligibilityDecisionV3(value, context());
    const set = targetSet(value, first);
    const rehash = (mutate: (copy: Record<string, unknown>) => void): NarratorFormTargetSetV3 => {
      const copy = structuredClone(set) as unknown as Record<string, unknown>;
      delete copy.contentHash;
      mutate(copy);
      return { ...copy, contentHash: canonicalHash(copy) } as unknown as NarratorFormTargetSetV3;
    };
    const wrongHash = rehash((copy) => { copy.eligibilityHash = "0".repeat(16); });
    expect(() => allowedNarratorFormTokenIdsV3(value, first, wrongHash, [])).toThrow(TypeError);
    const otherPrompt = prompt("Dúnmere");
    const otherEligibility = createNarratorFormEligibilityDecisionV3(otherPrompt, context());
    expect(otherEligibility.contentHash).toBe(first.contentHash);
    expect(() => allowedNarratorFormTokenIdsV3(otherPrompt, otherEligibility, set, [])).toThrow(TypeError);
    const omitted = rehash((copy) => {
      copy.targets = (copy.targets as unknown[]).filter((_, index) => index !== 1);
    });
    expect(() => allowedNarratorFormTokenIdsV3(value, first, omitted, [])).toThrow(TypeError);
    const forgedIds = rehash((copy) => {
      const targets = copy.targets as Array<Record<string, unknown>>;
      const targetContent: Record<string, unknown> = {
        ...targets[0]!, tokenIds: [9, 8, 1], tokenCount: 3,
      };
      delete targetContent.contentHash;
      targets[0] = { ...targetContent, contentHash: canonicalHash(targetContent) };
    });
    expect(() => allowedNarratorFormTokenIdsV3(value, first, forgedIds, [])).toThrow(TypeError);
    const second = createNarratorFormEligibilityDecisionV3(value, context(1, "establish-gathers"));
    const fullSetForSuppressedCall = rehash((copy) => { copy.eligibilityHash = second.contentHash; });
    expect(() => allowedNarratorFormTokenIdsV3(value, second, fullSetForSuppressedCall, [])).toThrow(TypeError);
  });
});

describe("narrator V3 strict score trace", () => {
  it("round-trips finite float32 score bits and rejects non-finite or invalid encodings", () => {
    expect(narratorFloat32FromBitsV3(narratorFloat32ToBitsV3(1.25))).toBe(1.25);
    expect(Object.is(narratorFloat32FromBitsV3(narratorFloat32ToBitsV3(-0)), -0)).toBe(true);
    expect(() => narratorFloat32ToBitsV3(Number.NaN)).toThrow(TypeError);
    expect(() => narratorFloat32ToBitsV3(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => narratorFloat32FromBitsV3(0x7fc0_0000)).toThrow(TypeError);
    expect(() => narratorFloat32FromBitsV3(0x7f80_0000)).toThrow(TypeError);
    expect(() => narratorFloat32FromBitsV3(-1)).toThrow(TypeError);
  });

  it("accepts only the exact unique-max trie path and returns raw-ID form authority", () => {
    const fixture = selectionFixture();
    const result = validateNarratorFormSelectionV3(
      fixture.value,
      fixture.eligibility,
      fixture.fullSequence,
      fixture.trace,
      fixture.set,
    );
    expect(result.selectedFormId).toBe("establish-gathers");
    expect(result.promptBytesHash).toBe("d579c223abcf9cc5");
    expect(result.selectionTokenIds).toEqual(fixture.selectionTokenIds);
    expect(result.fullDecoderTokenIds).toEqual(fixture.fullSequence);
    expect(isDeeplyFrozen(result)).toBe(true);
  });

  it("rejects same-move selection evidence replayed across prompts", () => {
    const fixture = selectionFixture();
    const otherPrompt = prompt("Dúnmere");
    const otherEligibility = createNarratorFormEligibilityDecisionV3(otherPrompt, context());
    expect(otherEligibility.contentHash).toBe(fixture.eligibility.contentHash);
    expect(() => validateNarratorFormSelectionV3(
      otherPrompt,
      otherEligibility,
      fixture.fullSequence,
      fixture.trace,
      fixture.set,
    )).toThrow(TypeError);
  });

  it("rejects exact top ties including positive/negative zero without host tie-breaking", () => {
    const fixture = selectionFixture();
    fixture.trace[0] = { ...fixture.trace[0]!, allowedScoreBits: bits(+0, -0) };
    expect(() => validateNarratorFormSelectionV3(
      fixture.value,
      fixture.eligibility,
      fixture.fullSequence,
      fixture.trace,
      fixture.set,
    ))
      .toThrow("exact top-score tie");
  });

  it("rejects malformed scores, prefixes, allowed sets, emissions, decoder framing, and unmatched paths", () => {
    const fixture = selectionFixture();
    const mutations: NarratorFormSelectionTraceStepV3[][] = [];
    const wrongPrefix = structuredClone(fixture.trace);
    wrongPrefix[1] = { ...wrongPrefix[1]!, prefixTokenIds: [99] };
    mutations.push(wrongPrefix);
    const wrongAllowed = structuredClone(fixture.trace);
    wrongAllowed[0] = { ...wrongAllowed[0]!, allowedTokenIds: [17501, 71] };
    mutations.push(wrongAllowed);
    const wrongEmission = structuredClone(fixture.trace);
    wrongEmission[0] = { ...wrongEmission[0]!, emittedTokenId: 17501 };
    mutations.push(wrongEmission);
    const nonmaximum = structuredClone(fixture.trace);
    nonmaximum[0] = { ...nonmaximum[0]!, allowedScoreBits: bits(1, 2) };
    mutations.push(nonmaximum);
    for (const trace of mutations) {
      expect(() => validateNarratorFormSelectionV3(
        fixture.value,
        fixture.eligibility,
        fixture.fullSequence,
        trace,
        fixture.set,
      )).toThrow(TypeError);
    }
    const nan = structuredClone(fixture.trace);
    nan[0] = { ...nan[0]!, allowedScoreBits: [0x7fc0_0000, narratorFloat32ToBitsV3(1)] };
    expect(() => validateNarratorFormSelectionV3(
      fixture.value, fixture.eligibility, fixture.fullSequence, nan, fixture.set,
    )).toThrow(TypeError);
    expect(() => validateNarratorFormSelectionV3(
      fixture.value, fixture.eligibility, [9, ...fixture.selectionTokenIds], fixture.trace, fixture.set,
    )).toThrow(TypeError);
    expect(() => validateNarratorFormSelectionV3(
      fixture.value,
      fixture.eligibility,
      fixture.fullSequence.slice(0, -1),
      fixture.trace.slice(0, -1),
      fixture.set,
    )).toThrow(TypeError);
    expect(() => validateNarratorFormSelectionV3(
      fixture.value, fixture.eligibility, [0, 99, 1], fixture.trace.slice(0, 2), fixture.set,
    )).toThrow(TypeError);
    expect(() => validateNarratorFormSelectionV3(
      fixture.value, fixture.eligibility, fixture.fullSequence, fixture.trace.slice(0, -1), fixture.set,
    )).toThrow(TypeError);
    const extraStep = structuredClone(fixture.trace[0]!) as NarratorFormSelectionTraceStepV3 & { extra?: boolean };
    extraStep.extra = true;
    expect(() => validateNarratorFormSelectionV3(
      fixture.value,
      fixture.eligibility,
      fixture.fullSequence,
      [extraStep, ...fixture.trace.slice(1)],
      fixture.set,
    ))
      .toThrow(TypeError);
  });
});
