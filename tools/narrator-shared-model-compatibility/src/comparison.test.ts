import { describe, expect, it } from "vitest";
import {
  narratorEvaluationCasesV1,
  narratorEvaluationCorpusHashV1,
} from "../../../src/narrator/evaluation";
import {
  liveNarratorForms,
  renderLiveNarratorForm,
} from "../../../src/narrator/live-form-selection";
import {
  sharedModelCompatibilityCaseCount,
  sharedModelCompatibilityCorpusHash,
} from "./protocol";
import { identifyLiveNarratorSelection } from "./comparison";

describe("shared-model production form identification", () => {
  it("binds the exact complete production evaluation corpus", () => {
    expect(narratorEvaluationCasesV1).toHaveLength(
      sharedModelCompatibilityCaseCount,
    );
    expect(narratorEvaluationCorpusHashV1).toBe(
      sharedModelCompatibilityCorpusHash,
    );
    expect(new Set(narratorEvaluationCasesV1.map((row) => row.seedId)).size)
      .toBe(20);
    expect(new Set(narratorEvaluationCasesV1.map((row) => row.prompt.move)))
      .toEqual(new Set([
        "establish-setting", "shade-atmosphere", "register-pressure",
      ]));
    expect(new Set(narratorEvaluationCasesV1.map((row) => row.prompt.facts.energy)))
      .toEqual(new Set(["quiet", "steady", "heightened"]));
  });

  it("identifies every eligible rendered form uniquely across all 200 prompts", () => {
    let observations = 0;
    for (const row of narratorEvaluationCasesV1) {
      for (const form of liveNarratorForms(row.prompt)) {
        const rendered = renderLiveNarratorForm(row.prompt, form.formId);
        expect(identifyLiveNarratorSelection(row.prompt, rendered).formId)
          .toBe(form.formId);
        observations += 1;
      }
    }
    expect(observations).toBeGreaterThan(600);
  });

  it("accepts the shade baseline even though it is not an allowedOutputs entry", () => {
    const row = narratorEvaluationCasesV1.find(
      (candidate) => candidate.prompt.move === "shade-atmosphere",
    );
    if (row === undefined) throw new Error("Fixture has no shade prompt");
    expect(row.allowedOutputs).not.toContain(row.deterministicBaseline);
    expect(identifyLiveNarratorSelection(
      row.prompt,
      row.deterministicBaseline,
    ).formId).toBe("shade-holds-baseline");
  });

  it("rejects safe-looking text outside the exact production form set", () => {
    const row = narratorEvaluationCasesV1[0]!;
    expect(() => identifyLiveNarratorSelection(
      row.prompt,
      `${row.prompt.facts.place} remembers a ${row.prompt.facts.energy} moment.`,
    )).toThrowError(TypeError);
  });
});
