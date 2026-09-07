import { describe, expect, it } from "vitest";
import type { NarrativeJournalEntry } from "./narrative-journal";
import { formatNarrativeStorybook } from "./narrative-storybook";

function entry(overrides: Partial<NarrativeJournalEntry> = {}): NarrativeJournalEntry {
  return { sourceEventId: "event:storybook:one", campaignId: "campaign:current", sourceTick: 7,
    readyAtMs: 100, text: "Mara hoped that relief could leave room for doubt.", location: "Greyford",
    headline: "A quiet road", origin: "model", presentedAtMs: null, ...overrides };
}

function groupHeadings(text: string): string[] {
  return [...text.matchAll(/^(?:Current adventure|Other adventure \d+)\nCampaign: .+$/gmu)]
    .map((match) => match[0]);
}

describe("plain-text narrative storybook", () => {
  it("explains imagined prose and the non-save boundary even for an empty selection", () => {
    const result = formatNarrativeStorybook([], "campaign:current");
    expect(result).toBe("The Grind 2 — Storybook\nImagined stories, not game facts.\n"
      + "This reading copy is not a game save or a complete adventure history.\n"
      + "Includes only the stories in your selected reading list.\n\nNo stories in this selection.\n");
    expect(groupHeadings(result)).toEqual([]);
  });

  it("keeps source metadata and distinguishes model/authored and shown/unshown stories", () => {
    const generated = entry();
    const authored = entry({ sourceEventId: "event:storybook:two", sourceTick: 9, readyAtMs: 200,
      headline: "A shared breath", location: "The mill", text: "Rowan wanted to belong without hiding his fear.",
      origin: "authored", presentedAtMs: 300 });
    const result = formatNarrativeStorybook([generated, authored], "campaign:current");
    expect(result).toContain(`A quiet road\nGreyford · T7 · LLM · Written; not shown\n\n${generated.text}`);
    expect(result).toContain(`A shared breath\nThe mill · T9 · Authored · Intermission shown\n\n${authored.text}`);
    expect(result.split("Campaign: campaign:current")).toHaveLength(2);
  });

  it("orders each adventure by source tick, then completion time, preserving exact ties", () => {
    const stories = [
      entry({ sourceEventId: "event:later", sourceTick: 12, readyAtMs: 10, text: "Later source; earlier completion." }),
      entry({ sourceEventId: "event:same-tick", sourceTick: 3, readyAtMs: 300, text: "Same source tick; later completion." }),
      entry({ sourceEventId: "event:tied-first", sourceTick: 3, readyAtMs: 200, text: "First tied story." }),
      entry({ sourceEventId: "event:tied-second", sourceTick: 3, readyAtMs: 200, text: "Second tied story." }),
    ];
    const result = formatNarrativeStorybook(stories, "campaign:current");
    const positions = [stories[2]!, stories[3]!, stories[1]!, stories[0]!].map((story) => result.indexOf(story.text));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it("puts the current adventure first and keeps other groups in first-seen order", () => {
    const stories = [entry({ campaignId: "campaign:older-b", text: "B's first story." }),
      entry({ campaignId: "campaign:older-a", text: "A's story." }),
      entry({ text: "Current story." }),
      entry({ sourceEventId: "event:storybook:two", campaignId: "campaign:older-b", sourceTick: 8, text: "B's second story." })];
    const result = formatNarrativeStorybook(stories, "campaign:current");
    expect(groupHeadings(result)).toEqual(["Current adventure\nCampaign: campaign:current",
      "Other adventure 1\nCampaign: campaign:older-b", "Other adventure 2\nCampaign: campaign:older-a"]);
    const bSection = result.split("Other adventure 1\n")[1]!.split("Other adventure 2\n")[0]!;
    expect(bSection).toContain("B's first story.");
    expect(bSection).toContain("B's second story.");
    expect(bSection).not.toContain("A's story.");
    for (const id of ["campaign:current", "campaign:older-b", "campaign:older-a"]) {
      expect(result.split(`Campaign: ${id}`)).toHaveLength(2);
    }
  });

  it("does not invent a current adventure when the selection only contains earlier campaigns", () => {
    const result = formatNarrativeStorybook([entry({ campaignId: "campaign:old-z" }),
      entry({ campaignId: "campaign:old-a" })], "campaign:absent");
    expect(groupHeadings(result)).toEqual(["Other adventure 1\nCampaign: campaign:old-z",
      "Other adventure 2\nCampaign: campaign:old-a"]);
    expect(result).not.toContain("Current adventure");
    expect(result).not.toContain("campaign:absent");
  });

  it("labels both archived voices with their actual names and roles without rewriting their thoughts", () => {
    const voices = [{ role: "hero" as const, name: "Mára", text: "I hope there is room for doubt." },
      { role: "companion" as const, name: "Rowan", text: "I wish I could say that I was not afraid." }];
    const result = formatNarrativeStorybook([entry({ text: voices.map((voice) => voice.text).join("\n\n"), voices })], "campaign:current");
    expect(result).toContain("Mára (Hero):\nI hope there is room for doubt.\n\n"
      + "Rowan (Companion):\nI wish I could say that I was not afraid.");
    for (const voice of voices) expect(result.split(voice.text)).toHaveLength(2);
  });

  it("preserves Unicode, line breaks, and original prose whitespace in UTF-8 text", () => {
    const text = "  Éowyn whispered, ‘明日も — perhaps tomorrow.’ 🕯️\n\nShe did not answer.  ";
    const result = formatNarrativeStorybook([entry({ text, location: "Vallée d’Étoiles", headline: "静かな道" })], "campaign:current");
    expect(result).toContain("静かな道\nVallée d’Étoiles · T7");
    expect(result).toContain(`\n\n${text}\n`);
    expect(new TextDecoder().decode(new TextEncoder().encode(result))).toBe(result);
  });

  it("is repeatable without mutating a frozen input snapshot or its nested voices", () => {
    const voices = Object.freeze([Object.freeze({ role: "hero" as const, name: "Mara", text: "I wonder." }),
      Object.freeze({ role: "companion" as const, name: "Rowan", text: "I hope." })]);
    const stories = Object.freeze([
      Object.freeze(entry({ sourceTick: 10, text: "I wonder.\n\nI hope.", voices })),
      Object.freeze(entry({ sourceEventId: "event:storybook:two", sourceTick: 2, readyAtMs: 500, text: "Earlier on the road." })),
    ]);
    const before = JSON.stringify(stories);
    const first = formatNarrativeStorybook(stories, "campaign:current");
    expect(formatNarrativeStorybook(stories, "campaign:current")).toBe(first);
    expect(JSON.stringify(stories)).toBe(before);
    expect(stories.map((story) => story.sourceTick)).toEqual([10, 2]);
  });
});
