import { describe, expect, it } from "vitest";
import { creativeStoryHardLimitMs, creativeStorySoftLimitMs, selectCreativeStoryBudgetFallback } from "./creative-story-budget";
import { cleanCreativeStoryOutput } from "./creative-story";
import { creativeWriterInferenceTimeoutMs } from "./creative-writer-client";

const select = (text: string) => selectCreativeStoryBudgetFallback(text, 80_000);

describe("creative story completed-sentence budget", () => {
  it("retains the exact completed sentence from the cached-model trial, without inventing its ending", () => {
    // Reuses b9cd592b's unfinished arrival, proved by the 8baf543 tool-only trial.
    const completed = "Mara clutches Rowan’s hand, her fingers trembling with the weight of relief and the sting of fear—his breath still uneven, his body a reminder of the path they’ve traversed.";
    const partial = completed + " She whispers his name, not out";
    expect(select(partial)).toEqual({ text: completed, sentenceCount: 1, elapsedMs: 80_000,
      originalCharacters: partial.length, discardedCharacters: partial.length - completed.length });
    expect(partial.startsWith(select(partial)!.text)).toBe(true);
    expect(cleanCreativeStoryOutput(completed)).toBe(completed);
  });

  it("only selects a fallback from 80 seconds until strictly before the existing 90-second limit", () => {
    expect(creativeStorySoftLimitMs).toBe(80_000);
    expect(creativeStoryHardLimitMs).toBe(creativeWriterInferenceTimeoutMs);
    expect(creativeStoryHardLimitMs).toBe(90_000);
    const text = "Mara listened. Rowan was";
    for (const elapsed of [-1, 0, 79_999, 90_000, 90_001, NaN, Infinity, -Infinity]) {
      expect(selectCreativeStoryBudgetFallback(text, elapsed), String(elapsed)).toBeNull();
    }
    for (const elapsed of [80_000, 80_000.5, 89_999]) {
      expect(selectCreativeStoryBudgetFallback(text, elapsed)?.elapsedMs).toBe(elapsed);
    }
  });

  it("preserves exact interior whitespace and at most two already-completed sentences", () => {
    const text = "  Mara  listened.\n\tRowan smiled!  Then he";
    expect(select(text)).toMatchObject({ text: "Mara  listened.\n\tRowan smiled!", sentenceCount: 2 });
    expect(select("Mara's doubt eased. The heroes' hands were")).toMatchObject({ text: "Mara's doubt eased.", sentenceCount: 1 });
    expect(select("Mara kept 3.14 coins. Rowan was")).toMatchObject({ text: "Mara kept 3.14 coins.", sentenceCount: 1 });
    expect(select("Mara listened. Rowan smiled. Then he waited. Mara")).toMatchObject({
      text: "Mara listened. Rowan smiled.", sentenceCount: 2,
    });
  });

  it("waits for real lexical lookahead and never mistakes ambiguous punctuation for a completed sentence", () => {
    for (const text of ["", "Mara waited", "Mara waited.", "Mara waited. 3", "Mara waited. —",
      "Mara greeted Dr. Rowan", "Mara greeted J. Rowan", "Mara visited the U.S. Rowan",
      "Mara waited... Rowan was", "Mara waited… Rowan was", "The clock showed 3.14", "The clock showed 3. 14"]) {
      expect(select(text), text).toBeNull();
    }
    expect(select("Mara listened. Dr. Rowan")).toMatchObject({ text: "Mara listened.", sentenceCount: 1 });
  });

  it("keeps balanced quotations and parentheses, rejecting dangling retained delimiters", () => {
    for (const text of ['Mara said, "Wait. Rowan', "Mara said, “Wait. Rowan", "Mara (waited. Rowan",
      "Mara waited.” Rowan", "Mara waited.) Rowan", "Mara waited.' Rowan"]) {
      expect(select(text), text).toBeNull();
    }
    for (const text of ['Mara said, "Wait." Rowan', "Mara said, “Wait.” Rowan", "Mara said, ‘Wait.’ Rowan",
      "Mara said, 'Wait.' Rowan", "Mara (waited.) Rowan"]) {
      expect(select(text)?.sentenceCount, text).toBe(1);
    }
    expect(select('Mara said, "Wait. Stay here." Rowan')).toMatchObject({
      text: 'Mara said, "Wait. Stay here."', sentenceCount: 2,
    });
    expect(select("Mara waited. “Rowan")).toMatchObject({ text: "Mara waited.", sentenceCount: 1 });
  });

  it("cannot hide unsafe or overlong generated text behind a harmless completed prefix", () => {
    for (const text of ["Mara waited. Rowan <unsafe>", "Mara waited. Rowan\u0000", "Mara waited. Rowan\u200b",
      "Mara waited. assistant: Rowan", "Mara waited. **Rowan**", "Mara waited. Rowan " + "x".repeat(1_000),
      "Mara waited. Rowan " + "x".repeat(4_000)]) {
      expect(cleanCreativeStoryOutput(text), text.slice(0, 40)).toBeNull();
      expect(select(text), text.slice(0, 40)).toBeNull();
    }
  });
});
