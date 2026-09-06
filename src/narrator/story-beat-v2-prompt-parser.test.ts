import { describe, expect, it } from "vitest";
import { factualStoryBeatTrainingCorpusV2 } from "./story-beat-v2-training-corpus";
import {
  factualStoryBeatFactsFromPromptV2,
  formatFactualStoryBeatPromptV2,
} from "./story-beat-v2";

const cases = factualStoryBeatTrainingCorpusV2.cases;
const byLens = (lens: "cost" | "consequence" | "contrast") =>
  cases.find((entry) => entry.lensId === lens)!;

function replaceLine(prompt: string, lineIndex: number, line: string): string {
  const lines = prompt.split("\n");
  lines[lineIndex] = line;
  return lines.join("\n");
}

describe("factual V2 story-beat prompt parser", () => {
  it("round-trips every production prompt into exact frozen typed facts", () => {
    expect(cases).toHaveLength(1_328);
    for (const entry of cases) {
      const parsed = factualStoryBeatFactsFromPromptV2(entry.prompt);
      expect(parsed, entry.id).toEqual(entry.facts);
      expect(formatFactualStoryBeatPromptV2(parsed), entry.id).toBe(entry.prompt);
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(Object.isFrozen(parsed?.narrative)).toBe(true);
      if (parsed?.cost !== null) expect(Object.isFrozen(parsed?.cost)).toBe(true);
      if (parsed?.consequence !== null) {
        expect(Object.isFrozen(parsed?.consequence)).toBe(true);
      }
    }
  });

  it("reconstructs each lens with only its exact public mechanic fields", () => {
    expect(factualStoryBeatFactsFromPromptV2(byLens("cost").prompt)).toMatchObject({
      beatLensId: "cost",
      cost: { kind: "cost", direction: "decrease" },
      consequence: null,
    });
    expect(factualStoryBeatFactsFromPromptV2(byLens("consequence").prompt))
      .toMatchObject({
        beatLensId: "consequence",
        cost: null,
        consequence: { kind: "consequence" },
      });
    expect(factualStoryBeatFactsFromPromptV2(byLens("contrast").prompt)).toMatchObject({
      beatLensId: "contrast",
      cost: { kind: "cost" },
      consequence: { kind: "consequence" },
    });
  });

  it("fails closed on prompt framing, canonical JSON, label, number, and lens drift", () => {
    const contrast = byLens("contrast").prompt;
    const lines = contrast.split("\n");
    const costClause = JSON.parse(lines[6]!.slice("REQUIRED COST: ".length)) as string;
    const consequenceClause = JSON.parse(
      lines[7]!.slice("REQUIRED CONSEQUENCE: ".length),
    ) as string;
    const invalid = [
      null,
      {},
      `${contrast}\nHIDDEN: true`,
      contrast.replace("\nBEAT:", "\n\nBEAT:"),
      replaceLine(contrast, 1, `${lines[1]} `),
      replaceLine(contrast, 1, "PLACE: \"Moonclock\\u0020Vault\""),
      replaceLine(contrast, 5, 'LENS: "cost"'),
      replaceLine(contrast, 6, "REQUIRED COST: null"),
      replaceLine(contrast, 6, `REQUIRED COST: ${JSON.stringify(
        costClause.replace(/ falls /u, " rises "),
      )}`),
      replaceLine(contrast, 6, `REQUIRED COST: ${JSON.stringify(
        costClause.replace(/from (\d+)/u, "from 01"),
      )}`),
      replaceLine(contrast, 6, `REQUIRED COST: ${JSON.stringify(
        costClause.replace(/^[^ ]+/u, "renown"),
      )}`),
      replaceLine(contrast, 7, `REQUIRED CONSEQUENCE: ${JSON.stringify(
        consequenceClause.replace(/ (?:rises|falls) /u, " shifts "),
      )}`),
      replaceLine(contrast, 7, 'REQUIRED CONSEQUENCE: {"value":"hidden"}'),
      replaceLine(contrast, 8, "BEAT: "),
    ];
    for (const value of invalid) {
      expect(factualStoryBeatFactsFromPromptV2(value), String(value)).toBeNull();
    }
  });
});
