import { describe, expect, it } from "vitest";
import {
  accountNarratorFormTargetsV3,
  allowedNarratorFormTokenIdsV3,
  createNarratorFormEligibilityDecisionV3,
  formatNarratorFormPromptUtf8V3,
  formatNarratorFormPromptV3,
  narratorFormsV3,
  renderNarratorFormV3,
} from "./evaluation-selection-contract-v3";
import {
  narratorTransformersGenerationOptionsV3,
  narratorTransformersInputTokenizerOptionsV3,
  narratorTransformersTargetDecodeOptionsV3,
  narratorTransformersTargetTokenizerOptionsV3,
} from "./evaluation-transformers-adapter-v3";
import {
  countLiveNarratorFormInputTokenIds,
  createLiveNarratorTrieLogitsProcessor,
  formatLiveNarratorFormPrompt,
  formatLiveNarratorFormPromptUtf8,
  isLiveNarratorFormId,
  liveNarratorAllowedTokenIds,
  liveNarratorFormIds,
  liveNarratorForms,
  liveNarratorGenerationOptions,
  liveNarratorInputTokenizerOptions,
  liveNarratorTargetDecodeOptions,
  liveNarratorTargetTokenizerOptions,
  renderLiveNarratorForm,
  type LiveNarratorFormDescriptor,
  type LiveNarratorLogitsTensor,
} from "./live-form-selection";
import {
  allowedNarratorLines,
  deterministicNarratorFallback,
} from "./output-policy";
import type {
  NarratorEnergy,
  NarratorMoveV1,
  NarratorPromptV1,
} from "./protocol";

const vocabularySize = 25_600;

function prompt(
  move: NarratorMoveV1,
  place = "Dúnmere",
  energy: NarratorEnergy = "steady",
): NarratorPromptV1 {
  return {
    schemaVersion: 1,
    task: "single-ambient-line",
    voice: move === "register-pressure" ? "hero-aside-v1" : "spare-observer-v1",
    move,
    facts: {
      schemaVersion: 1,
      kind: "public-scene",
      sceneKind: move === "register-pressure"
        ? "battle"
        : move === "shade-atmosphere"
          ? "camp"
          : "travel",
      place,
      energy,
    },
  };
}

const prompts = Object.freeze([
  prompt("establish-setting"),
  prompt("shade-atmosphere"),
  prompt("register-pressure"),
]);

function mutableLogits(
  allowedTokenIds: readonly number[],
  preferredTokenId: number,
): LiveNarratorLogitsTensor {
  const data = new Float32Array(vocabularySize);
  data.fill(-8);
  for (const tokenId of allowedTokenIds) data[tokenId] = -2;
  data[preferredTokenId] = 4;
  return { dims: [1, vocabularySize], data };
}

function driveSelection(
  packet: NarratorPromptV1,
  descriptor: LiveNarratorFormDescriptor,
) {
  const processor = createLiveNarratorTrieLogitsProcessor(packet);
  const emitted: number[] = [];
  for (const tokenId of descriptor.targetTokenIds) {
    const allowed = liveNarratorAllowedTokenIds(packet, emitted);
    expect(allowed).toContain(tokenId);
    const logits = mutableLogits(allowed, tokenId);
    const allowedBefore = allowed.map((allowedTokenId) => logits.data[allowedTokenId]);
    expect(processor.process([[0, ...emitted]], logits)).toBe(logits);
    expect(allowed.map((allowedTokenId) => logits.data[allowedTokenId])).toEqual(allowedBefore);
    expect(logits.data[2]).toBe(Number.NEGATIVE_INFINITY);
    emitted.push(tokenId);
  }
  return {
    processor,
    selection: processor.finalize(BigInt64Array.from([0, ...emitted].map(BigInt))),
  };
}

describe("live narrator form catalog and prompt", () => {
  it("copies the frozen V3 forms, target vectors, rendering, and runtime options without importing them", () => {
    expect(liveNarratorFormIds).toEqual([
      "establish-holds",
      "establish-gathers",
      "establish-waits",
      "shade-holds-baseline",
      "shade-rests",
      "shade-settles",
      "shade-lingers",
      "pressure-attention",
      "pressure-feel",
      "pressure-close",
    ]);
    expect(liveNarratorInputTokenizerOptions)
      .toEqual(narratorTransformersInputTokenizerOptionsV3);
    expect(liveNarratorTargetTokenizerOptions)
      .toEqual(narratorTransformersTargetTokenizerOptionsV3);
    expect(liveNarratorTargetDecodeOptions)
      .toEqual(narratorTransformersTargetDecodeOptionsV3);
    expect(liveNarratorGenerationOptions)
      .toEqual(narratorTransformersGenerationOptionsV3);

    for (const packet of prompts) {
      const live = liveNarratorForms(packet);
      const frozen = narratorFormsV3(packet);
      expect(live.map(({ formId, move, witness, targetTokenIds, baseline }) => ({
        formId,
        move,
        witness,
        targetTokenIds,
        baseline,
      }))).toEqual(frozen.map(({ formId, move, witness, targetTokenIds, baseline }) => ({
        formId,
        move,
        witness,
        targetTokenIds,
        baseline,
      })));
      expect(live.filter((form) => form.baseline)).toHaveLength(1);
      expect(Object.isFrozen(live)).toBe(true);
      for (const form of live) {
        expect(Object.isFrozen(form)).toBe(true);
        expect(Object.isFrozen(form.targetTokenIds)).toBe(true);
        expect(renderLiveNarratorForm(packet, form.formId))
          .toBe(renderNarratorFormV3(packet, form.formId));
      }
    }
  });

  it("formats arbitrary valid prompts byte-for-byte like the frozen model contract", () => {
    const arbitrary = [
      ...prompts,
      prompt("establish-setting", "x".repeat(120), "heightened"),
      prompt("shade-atmosphere", "Keep\"\\Gate\tNorth\nSouth\rEast", "quiet"),
      {
        ...prompt("register-pressure", "Élan", "heightened"),
        facts: {
          ...prompt("register-pressure", "Élan", "heightened").facts,
          sceneKind: "dungeon" as const,
        },
      },
    ];
    for (const packet of arbitrary) {
      expect(formatLiveNarratorFormPrompt(packet)).toBe(formatNarratorFormPromptV3(packet));
      expect(formatLiveNarratorFormPromptUtf8(packet))
        .toEqual(formatNarratorFormPromptUtf8V3(packet));
      expect(formatLiveNarratorFormPrompt(packet).endsWith("\n")).toBe(false);
    }
  });

  it("preserves the shade baseline while mapping every visible line through trusted policy code", () => {
    for (const packet of prompts) {
      for (const form of liveNarratorForms(packet)) {
        const rendered = renderLiveNarratorForm(packet, form.formId);
        if (form.baseline) {
          expect(rendered).toBe(deterministicNarratorFallback(packet));
        } else {
          expect(allowedNarratorLines(packet)).toContain(rendered);
        }
      }
    }
    const shade = prompt("shade-atmosphere", "Moonclock Vault", "quiet");
    expect(renderLiveNarratorForm(shade, "shade-holds-baseline"))
      .toBe("Moonclock Vault holds a quiet moment.");
    expect(allowedNarratorLines(shade))
      .not.toContain(renderLiveNarratorForm(shade, "shade-holds-baseline"));
  });

  it("rejects invalid prompts, unknown forms, and cross-move rendering", () => {
    const valid = prompt("shade-atmosphere");
    expect(isLiveNarratorFormId("shade-rests")).toBe(true);
    expect(isLiveNarratorFormId("unknown")).toBe(false);
    expect(() => liveNarratorForms({ ...valid, extra: true })).toThrow(/prompt/u);
    expect(() => formatLiveNarratorFormPrompt({ ...valid, voice: "hero-aside-v1" }))
      .toThrow(/prompt/u);
    expect(() => renderLiveNarratorForm(valid, "establish-holds")).toThrow(/prompt move/u);
    expect(() => renderLiveNarratorForm(valid, "unknown")).toThrow(/form id/u);
  });
});

describe("live narrator current-move token trie", () => {
  it("matches every frozen V3 allowed branch for arbitrary current-move prompts", () => {
    for (const [promptIndex, packet] of prompts.entries()) {
      const frozenForms = narratorFormsV3(packet);
      const eligibility = createNarratorFormEligibilityDecisionV3(packet, {
        seedId: `live-parity:${promptIndex}`,
        sequenceSlot: 0,
        priorSelectedFormId: null,
      });
      const targetSet = accountNarratorFormTargetsV3(
        packet,
        eligibility,
        frozenForms.map((form) => ({
          formId: form.formId,
          tokenIds: form.targetTokenIds,
          decodedWitness: form.witness,
        })),
      );
      for (const form of frozenForms) {
        for (let prefixLength = 0; prefixLength < form.targetTokenIds.length; prefixLength += 1) {
          const prefix = form.targetTokenIds.slice(0, prefixLength);
          expect(liveNarratorAllowedTokenIds(packet, prefix)).toEqual(
            allowedNarratorFormTokenIdsV3(packet, eligibility, targetSet, prefix),
          );
        }
      }
    }
  });

  it("selects all ten forms via unique maxima and returns only raw token authority", () => {
    for (const packet of prompts) {
      for (const form of liveNarratorForms(packet)) {
        const { processor, selection } = driveSelection(packet, form);
        expect(selection).toEqual({
          formId: form.formId,
          generatedTokenIds: form.targetTokenIds,
        });
        expect(Object.keys(selection)).toEqual(["formId", "generatedTokenIds"]);
        expect(selection).not.toHaveProperty("text");
        expect(selection).not.toHaveProperty("witness");
        expect(Object.isFrozen(selection)).toBe(true);
        expect(Object.isFrozen(selection.generatedTokenIds)).toBe(true);
        expect(() => processor.finalize([0, ...form.targetTokenIds]))
          .toThrow(/already finalized/u);
      }
    }
  });

  it("retains allowed logits exactly and masks every disallowed vocabulary entry", () => {
    const packet = prompt("establish-setting");
    const processor = createLiveNarratorTrieLogitsProcessor(packet);
    const allowed = liveNarratorAllowedTokenIds(packet, []);
    const preferred = allowed.at(-1)!;
    const logits = mutableLogits(allowed, preferred);
    const before = new Float32Array(logits.data);
    processor.process([[0]], logits);
    for (let tokenId = 0; tokenId < logits.data.length; tokenId += 1) {
      expect(logits.data[tokenId]).toBe(
        allowed.includes(tokenId) ? before[tokenId] : Number.NEGATIVE_INFINITY,
      );
    }
  });

  it("rejects exact ties, signed-zero ties, and every non-finite allowed score before masking", () => {
    const packet = prompt("establish-setting");
    const allowed = liveNarratorAllowedTokenIds(packet, []);
    for (const pair of [[3, 3], [-0, +0]] as const) {
      const processor = createLiveNarratorTrieLogitsProcessor(packet);
      const logits = mutableLogits(allowed, allowed[0]!);
      logits.data[allowed[0]!] = pair[0];
      logits.data[allowed[1]!] = pair[1];
      const disallowedBefore = logits.data[2];
      expect(() => processor.process([[0]], logits)).toThrow(/top-score tie/u);
      expect(logits.data[2]).toBe(disallowedBefore);
    }
    for (const score of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const processor = createLiveNarratorTrieLogitsProcessor(packet);
      const logits = mutableLogits(allowed, allowed[0]!);
      logits.data[allowed[0]!] = score;
      expect(() => processor.process([[0]], logits)).toThrow(/finite/u);
    }
  });

  it("rejects malformed decoder batches, prefixes, logits, and undersized vocabularies", () => {
    const packet = prompt("establish-setting");
    const allowed = liveNarratorAllowedTokenIds(packet, []);
    const validLogits = () => mutableLogits(allowed, allowed[0]!);
    for (const batch of [
      [],
      [[1]],
      [[0, allowed[0]!]],
      Object.assign([[0]], { extra: true }),
    ]) {
      expect(() => createLiveNarratorTrieLogitsProcessor(packet).process(batch, validLogits()))
        .toThrow();
    }
    for (const logits of [
      { dims: [2, vocabularySize], data: new Float32Array(vocabularySize) },
      { dims: [1, vocabularySize - 1], data: new Float32Array(vocabularySize) },
      { dims: [1, vocabularySize], data: new Float64Array(vocabularySize) },
    ]) {
      expect(() => createLiveNarratorTrieLogitsProcessor(packet)
        .process([[0]], logits as LiveNarratorLogitsTensor)).toThrow(/logits tensor/u);
    }
    expect(() => createLiveNarratorTrieLogitsProcessor(packet).process(
      [[0]],
      { dims: [1, 100], data: new Float32Array(100) },
    )).toThrow(/outside the logits vocabulary/u);
  });

  it("requires sequential prefixes to emit the declared unique maximum", () => {
    const packet = prompt("establish-setting");
    const rootAllowed = liveNarratorAllowedTokenIds(packet, []);
    const selected = rootAllowed[0]!;
    const other = rootAllowed[1]!;

    const wrongEmission = createLiveNarratorTrieLogitsProcessor(packet);
    wrongEmission.process([[0]], mutableLogits(rootAllowed, selected));
    const nextAllowed = liveNarratorAllowedTokenIds(packet, [other]);
    expect(() => wrongEmission.process(
      [[0, other]],
      mutableLogits(nextAllowed, nextAllowed[0]!),
    )).toThrow(/unique maximum token/u);

    const repeated = createLiveNarratorTrieLogitsProcessor(packet);
    repeated.process([[0]], mutableLogits(rootAllowed, selected));
    expect(() => repeated.process([[0]], mutableLogits(rootAllowed, selected)))
      .toThrow(/next trie step/u);
  });

  it("rejects completed, unmatched, sparse, oversized, and extra-property prefixes", () => {
    const packet = prompt("shade-atmosphere");
    const target = liveNarratorForms(packet)[0]!.targetTokenIds;
    expect(() => liveNarratorAllowedTokenIds(packet, target)).toThrow(/incomplete/u);
    expect(() => liveNarratorAllowedTokenIds(packet, [999])).toThrow(/incomplete/u);
    expect(() => liveNarratorAllowedTokenIds(
      packet,
      new Array(49).fill(9),
    )).toThrow(/budget/u);
    const sparse = [1, 2, 3];
    delete sparse[1];
    expect(() => liveNarratorAllowedTokenIds(packet, sparse)).toThrow(/dense/u);
    expect(() => liveNarratorAllowedTokenIds(
      packet,
      Object.assign([target[0]!], { forged: true }),
    )).toThrow(/extra properties/u);
  });
});

describe("live narrator generated-sequence validation", () => {
  it("rejects malformed framing, missing or early EOS, and non-executed target completion", () => {
    const packet = prompt("register-pressure");
    const target = liveNarratorForms(packet)[0]!.targetTokenIds;
    const cases: readonly (readonly number[])[] = [
      [0],
      [9, ...target],
      [0, ...target.slice(0, -1)],
      [0, target[0]!, 1, ...target.slice(1)],
      [0, ...target],
    ];
    for (const sequence of cases) {
      expect(() => createLiveNarratorTrieLogitsProcessor(packet).finalize(sequence))
        .toThrow();
    }
    expect(() => createLiveNarratorTrieLogitsProcessor(packet).finalize(
      new Array(50).fill(1),
    )).toThrow(/budget/u);
  });

  it("rejects dense-array violations and invalid token ids at the completion boundary", () => {
    const packet = prompt("register-pressure");
    const sparse = [0, 1];
    delete sparse[1];
    for (const sequence of [
      sparse,
      Object.assign([0, 1], { forged: true }),
      [0, -1, 1],
      [0, 1.5, 1],
      [0, Number.MAX_SAFE_INTEGER + 1, 1],
    ]) {
      expect(() => createLiveNarratorTrieLogitsProcessor(packet)
        .finalize(sequence)).toThrow();
    }
  });

  it("counts only dense bounded tokenizer input ending in EOS", () => {
    expect(countLiveNarratorFormInputTokenIds([7, 8, 1])).toBe(3);
    expect(countLiveNarratorFormInputTokenIds(BigInt64Array.from([7n, 1n]))).toBe(2);
    for (const ids of [
      [],
      [7, 8],
      [7, -1, 1],
      new Array(321).fill(1),
      Object.assign([7, 1], { extra: true }),
    ]) {
      expect(() => countLiveNarratorFormInputTokenIds(ids)).toThrow();
    }
  });
});
