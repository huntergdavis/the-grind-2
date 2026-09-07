import type { NarrativeJournalEntry } from "./narrative-journal";

const storybookHeader = [
  "The Grind 2 — Storybook",
  "Imagined stories, not game facts.",
  "This reading copy is not a game save or a complete adventure history.",
  "Includes only the stories in your selected reading list.",
].join("\n");

/** Formats an already-selected archive snapshot; never rewrites prose or changes its source. */
export function formatNarrativeStorybook(entries: readonly NarrativeJournalEntry[], currentCampaignId: string): string {
  if (entries.length === 0) return `${storybookHeader}\n\nNo stories in this selection.\n`;
  const groups = new Map<string, NarrativeJournalEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.campaignId);
    if (group === undefined) groups.set(entry.campaignId, [entry]);
    else group.push(entry);
  }
  const campaignIds = [...groups.keys()];
  const orderedCampaigns = groups.has(currentCampaignId)
    ? [currentCampaignId, ...campaignIds.filter((id) => id !== currentCampaignId)] : campaignIds;
  const sections = [storybookHeader];
  let otherAdventure = 0;
  for (const campaignId of orderedCampaigns) {
    const title = campaignId === currentCampaignId ? "Current adventure" : `Other adventure ${++otherAdventure}`;
    sections.push(`${title}\nCampaign: ${campaignId}`);
    // These arrays belong to the formatter. Stable sorting keeps input order
    // when both recorded source tick and completion time are equal.
    const stories = groups.get(campaignId)!;
    stories.sort((left, right) => left.sourceTick - right.sourceTick || left.readyAtMs - right.readyAtMs);
    for (const entry of stories) {
      const origin = entry.origin === "model" ? "LLM" : "Authored";
      const presentation = entry.presentedAtMs === null ? "Written; not shown" : "Intermission shown";
      const prose = entry.voices === undefined ? entry.text : entry.voices.map((voice) =>
        `${voice.name} (${voice.role === "hero" ? "Hero" : "Companion"}):\n${voice.text}`).join("\n\n");
      sections.push(`${entry.headline}\n${entry.location} · T${entry.sourceTick} · ${origin} · ${presentation}\n\n${prose}`);
    }
  }
  return `${sections.join("\n\n")}\n`;
}
