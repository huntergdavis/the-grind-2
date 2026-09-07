import { describe, expect, it } from "vitest";
import { completedCreativeStorySentences, hasFinishedCreativeStoryPassage } from "./creative-story-sentences";

describe("completed creative story sentences", () => {
  it.each([
    ["", []],
    ["The silence softened but", []],
    ["The silence softened. Her resolve was still", ["The silence softened."]],
    ["The silence softened. Her resolve held. The road listened.", ["The silence softened.", "Her resolve held."]],
    ["Was relief always this fragile? Perhaps it was.", ["Was relief always this fragile?", "Perhaps it was."]],
    ["  The silence softened.  Her resolve held.  ", ["The silence softened.", "Her resolve held."]],
  ])("preserves the display cleaner's extraction: %s", (text, expected) => {
    expect(completedCreativeStorySentences(text as string)).toEqual(expected);
  });
});

describe("conservative two-sentence generation stopping", () => {
  it("waits through punctuation and whitespace until lexical look-ahead establishes the second boundary", () => {
    const partials = ["Mara", "Mara listened.", "Mara listened. Rowan", "Mara listened. Rowan smiled",
      "Mara listened. Rowan smiled.", "Mara listened. Rowan smiled. "];
    for (const partial of partials) expect(hasFinishedCreativeStoryPassage(partial), partial).toBe(false);
    expect(hasFinishedCreativeStoryPassage("Mara listened. Rowan smiled. The")).toBe(true);
  });

  it.each([
    "Mara listened! Rowan smiled? Then",
    "Mara listened.\n\nRowan smiled.\nThe",
    "Mara's doubt eased. Rowan's smile held. The",
    "The heroes' doubt eased. Their hope held. The",
    "Mara said, \"Wait. Stay here.\" The",
    "Mara said, ‘Wait. Stay here.’ The",
    "Mara said, “Wait. Stay here.” The",
    "Mara said, 'Wait. Don't move.' The",
    "Mara kept 3.14 coins. Rowan smiled. The",
  ])("stops after an established, closed pair: %s", (text) => {
    expect(hasFinishedCreativeStoryPassage(text)).toBe(true);
  });

  it.each([
    "Mara listened. Dr. Rowan",
    "Mara listened. Mr. Rowan arrived.",
    "Mara listened. J. Rowan",
    "Mara waited... Rowan smiled. Then",
    "Mara waited… Rowan smiled. Then",
    'Mara said, "Wait. Stay here. The',
    "Mara said, ‘Wait. Stay here. The",
    "Mara said, 'Wait. Don't move. The",
    "Mara said, 'The heroes' oath held. We can wait. The",
    "Mara said, ‘The heroes’ oath held. We can wait. The",
    "Mara hesitated (briefly. Rowan smiled. The",
    "Mara waited. The clock showed 3.",
    "Mara waited. The clock showed 3.14",
    "Mara waited. Rowan smiled. 3",
    "An unfinished sentence without punctuation",
  ])("leaves ambiguous/incomplete boundaries to EOS or the existing token cap: %s", (text) => {
    expect(hasFinishedCreativeStoryPassage(text)).toBe(false);
  });

  it("does not retain completion state between requests", () => {
    expect(hasFinishedCreativeStoryPassage("Mara listened. Rowan smiled. The")).toBe(true);
    expect(hasFinishedCreativeStoryPassage("Only one sentence.")).toBe(false);
  });

  it.each(["Capt.", "Sgt.", "Lt.", "Gen.", "Cmdr.", "Rev."])("waits beyond the known title %s", (title) => {
    expect(hasFinishedCreativeStoryPassage(`Mara waited. She asked ${title}`)).toBe(false);
    expect(hasFinishedCreativeStoryPassage(`Mara waited. She asked ${title} Rowan`)).toBe(false);
  });
});
