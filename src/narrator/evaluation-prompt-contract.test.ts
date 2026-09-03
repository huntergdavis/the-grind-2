import { describe, expect, it } from "vitest";
import { canonicalHash } from "../core/canonical";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  accountNarratorGeneratedTokenIdsV2,
  countNarratorInputTokenIdsV2,
  formatNarratorPromptUtf8V2,
  formatNarratorPromptV2,
  narratorDecodingConfigurationHashV2,
  narratorDecodingConfigurationV2,
  narratorGeneratedTokenAccountingHashV2,
  narratorInputTokenAccountingHashV2,
  narratorPromptAndTokenContractHashV2,
  narratorPromptFormatterContractV2,
  narratorPromptFormatterHashV2,
  narratorVisibleOutputNormalizationHashV2,
  normalizeNarratorDecodedOutputV2,
} from "./evaluation-prompt-contract";
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

const asciiGolden = "Return exactly one value from allowedOutputs, without JSON quoting or any other text.\n"
  + "{\"allowedOutputs\":[\"Alder Hall holds a quiet moment.\",\"A quiet moment gathers at Alder Hall.\",\"Alder Hall waits within a quiet moment.\"],\"prompt\":{\"facts\":{\"energy\":\"quiet\",\"kind\":\"public-scene\",\"place\":\"Alder Hall\",\"sceneKind\":\"town\",\"schemaVersion\":1},\"move\":\"establish-setting\",\"schemaVersion\":1,\"task\":\"single-ambient-line\",\"voice\":\"spare-observer-v1\"},\"responseFormat\":\"one-allowed-output-verbatim\",\"schemaVersion\":2}";

describe("narrator V2 prompt formatter", () => {
  it("locks the complete ASCII text and exact UTF-8 bytes", () => {
    const value = prompt("Alder Hall");
    const formatted = formatNarratorPromptV2(value);
    const bytes = formatNarratorPromptUtf8V2(value);
    expect(formatted).toBe(asciiGolden);
    expect(bytes).toEqual(new TextEncoder().encode(asciiGolden));
    expect(bytes).toHaveLength(508);
    expect(bytes[0]).toBe(0x52);
    expect([...bytes].slice(0, 3)).not.toEqual([0xef, 0xbb, 0xbf]);
    expect(formatted.endsWith("\n")).toBe(false);
    expect(canonicalHash([...bytes])).toBe("a941f7ab6c035ae8");
  });

  it("locks NFC Unicode, maximum input, and all 200 corpus byte vectors", () => {
    const unicodeBytes = formatNarratorPromptUtf8V2(prompt("Dúnmere"));
    const maximumBytes = formatNarratorPromptUtf8V2(prompt("x".repeat(120)));
    expect(unicodeBytes).toHaveLength(500);
    expect(canonicalHash([...unicodeBytes])).toBe("d87fdd63a59310fc");
    expect(new TextDecoder().decode(unicodeBytes)).toContain("Dúnmere");
    expect(maximumBytes).toHaveLength(948);
    expect(canonicalHash([...maximumBytes])).toBe("3abcd2fb50e0e08b");
    expect(canonicalHash(narratorEvaluationCasesV1.map(({ prompt: value }) =>
      [...formatNarratorPromptUtf8V2(value)]))).toBe("dcd8380a340e03a7");
  });

  it("JSON-escapes quote, backslash, TAB, LF, and CR without adding structural lines", () => {
    const value = prompt("Keep\"\\Gate\tNorth\nSouth\rEast");
    const formatted = formatNarratorPromptV2(value);
    const escaped = "Keep\\\"\\\\Gate\\tNorth\\nSouth\\rEast";
    expect(formatted.split(escaped)).toHaveLength(5);
    expect(formatted.match(/\n/gu)).toHaveLength(1);
    expect(formatted).not.toContain("\t");
    expect(formatted).not.toContain("\r");
    expect(formatNarratorPromptUtf8V2(value)).toHaveLength(596);
    expect(canonicalHash([...formatNarratorPromptUtf8V2(value)])).toBe("e147b0bf16f1ada9");
  });

  it("makes every variable model-visible field part of the bytes", () => {
    const values = [
      prompt("Alder Hall"),
      prompt("Bell Hall"),
      prompt("Alder Hall", "atlas"),
      prompt("Alder Hall", "town", "shade-atmosphere"),
      prompt("Alder Hall", "town", "establish-setting", "heightened"),
      prompt("Alder Hall", "battle", "register-pressure", "quiet", "hero-aside-v1"),
    ];
    const formatted = values.map(formatNarratorPromptV2);
    expect(new Set(formatted)).toHaveLength(values.length);
    expect(formatted[0]).toContain("\"schemaVersion\":1");
    expect(formatted[0]).toContain("\"task\":\"single-ambient-line\"");
    expect(formatted[0]).toContain("\"kind\":\"public-scene\"");
  });

  it("rejects invalid, extra-key, decomposed, and voice/move-mismatched prompts", () => {
    const valid = prompt("Alder Hall");
    expect(() => formatNarratorPromptV2({ ...valid, extra: true })).toThrow(TypeError);
    expect(() => formatNarratorPromptV2({ ...valid, voice: "hero-aside-v1" })).toThrow(TypeError);
    expect(() => formatNarratorPromptV2({ ...valid, facts: { ...valid.facts, place: "Du\u0301nmere" } }))
      .toThrow(TypeError);
    expect(() => formatNarratorPromptUtf8V2(null)).toThrow(TypeError);
  });

  it("locks and deeply freezes the formatter and semantic hashes", () => {
    expect(isDeeplyFrozen(narratorPromptFormatterContractV2)).toBe(true);
    expect(narratorPromptFormatterHashV2).toBe("f4110696dae2785d");
    expect(narratorInputTokenAccountingHashV2).toBe("934d8ae1dac022e9");
    expect(narratorGeneratedTokenAccountingHashV2).toBe("257125851307cf42");
    expect(narratorVisibleOutputNormalizationHashV2).toBe("1d8ca196ce8898a6");
    expect(narratorDecodingConfigurationHashV2).toBe("fccf17580185c883");
    expect(narratorPromptAndTokenContractHashV2).toBe("54d644a6ea398e4a");
  });
});

describe("narrator V2 token accounting", () => {
  it("binds literal Transformers.js tokenizer, generation, and decode kwargs", () => {
    expect(narratorDecodingConfigurationV2.input.tokenizerOptions).toEqual({
      add_special_tokens: true,
      padding: false,
      truncation: false,
      return_tensor: true,
    });
    expect(narratorDecodingConfigurationV2.generation.options).toEqual({
      do_sample: false,
      num_beams: 1,
      num_return_sequences: 1,
      max_new_tokens: 48,
      return_dict_in_generate: false,
    });
    expect(narratorDecodingConfigurationV2.output.decodeOptions).toEqual({
      skip_special_tokens: true,
      clean_up_tokenization_spaces: false,
    });
    expect(isDeeplyFrozen(narratorDecodingConfigurationV2)).toBe(true);
  });

  it("counts all returned input IDs, including tokenizer-added EOS", () => {
    expect(countNarratorInputTokenIdsV2([9, 8, 1])).toBe(3);
    expect(countNarratorInputTokenIdsV2([0, 1])).toBe(2);
    expect(countNarratorInputTokenIdsV2([1, 2, 1])).toBe(3);
    expect(countNarratorInputTokenIdsV2(BigInt64Array.from([7n, 1n]))).toBe(2);
    const maximum = new Uint32Array(320).fill(7);
    maximum[maximum.length - 1] = 1;
    expect(countNarratorInputTokenIdsV2(maximum)).toBe(320);
  });

  it("rejects empty, over-budget, noninteger, negative, missing, and unsafe input IDs", () => {
    expect(() => countNarratorInputTokenIdsV2([])).toThrow(RangeError);
    expect(() => countNarratorInputTokenIdsV2(new Uint32Array(321))).toThrow(RangeError);
    expect(() => countNarratorInputTokenIdsV2([1.5])).toThrow(TypeError);
    expect(() => countNarratorInputTokenIdsV2([-1])).toThrow(TypeError);
    expect(() => countNarratorInputTokenIdsV2([Number.MAX_SAFE_INTEGER + 1])).toThrow(TypeError);
    expect(() => countNarratorInputTokenIdsV2([BigInt(Number.MAX_SAFE_INTEGER) + 1n])).toThrow(TypeError);
    expect(() => countNarratorInputTokenIdsV2({ 0: 1, length: 2 } as never)).toThrow(TypeError);
    expect(() => countNarratorInputTokenIdsV2({ length: Number.MAX_SAFE_INTEGER } as never)).toThrow(RangeError);
    expect(() => countNarratorInputTokenIdsV2([7, 8])).toThrow(TypeError);
    expect(() => countNarratorInputTokenIdsV2([7, 1, 8])).toThrow(TypeError);
  });

  it("removes one decoder-start ID and counts generated IDs including terminal EOS", () => {
    expect(accountNarratorGeneratedTokenIdsV2([0, 10, 11, 1])).toEqual({
      generatedTokenIds: [10, 11, 1],
      outputTokens: 3,
      stopReason: "model-eos",
    });
    expect(accountNarratorGeneratedTokenIdsV2(BigInt64Array.from([0n, 0n, 1n]))).toEqual({
      generatedTokenIds: [0, 1],
      outputTokens: 2,
      stopReason: "model-eos",
    });
    expect(Object.isFrozen(accountNarratorGeneratedTokenIdsV2([0, 1]).generatedTokenIds)).toBe(true);
  });

  it("accepts EOS-less output only at exactly max_new_tokens", () => {
    const generated = Array.from({ length: 48 }, (_, index) => index + 2);
    expect(accountNarratorGeneratedTokenIdsV2([0, ...generated])).toEqual({
      generatedTokenIds: generated,
      outputTokens: 48,
      stopReason: "maximum-new-tokens",
    });
    expect(() => accountNarratorGeneratedTokenIdsV2([0, ...generated.slice(0, 47)])).toThrow(TypeError);
  });

  it("rejects malformed starts, EOS suffixes, excess output, and unsafe IDs", () => {
    expect(() => accountNarratorGeneratedTokenIdsV2([0])).toThrow(RangeError);
    expect(() => accountNarratorGeneratedTokenIdsV2([9, 3, 1])).toThrow(TypeError);
    expect(() => accountNarratorGeneratedTokenIdsV2([0, 3, 1, 4])).toThrow(TypeError);
    expect(() => accountNarratorGeneratedTokenIdsV2([0, 1, 1])).toThrow(TypeError);
    expect(() => accountNarratorGeneratedTokenIdsV2([0, ...new Array(49).fill(2)])).toThrow(RangeError);
    expect(() => accountNarratorGeneratedTokenIdsV2([0, -1, 1])).toThrow(TypeError);
    expect(() => accountNarratorGeneratedTokenIdsV2([0, 1.25, 1])).toThrow(TypeError);
  });

  it("normalizes decoded text exactly once without deriving token counts from it", () => {
    expect(normalizeNarratorDecodedOutputV2("  Du\u0301n\tmere\r\n")).toBe("Dún mere");
    expect(normalizeNarratorDecodedOutputV2("A\u00a0quiet   moment.")).toBe("A quiet moment.");
    expect(normalizeNarratorDecodedOutputV2(" ")).toBeNull();
    expect(normalizeNarratorDecodedOutputV2("x".repeat(241))).toBeNull();
    expect(normalizeNarratorDecodedOutputV2("bad\u0000text")).toBeNull();
    expect(normalizeNarratorDecodedOutputV2(7)).toBeNull();
  });
});
