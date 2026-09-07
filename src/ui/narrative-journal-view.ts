import { narrativeJournalMaximumEntries, type createNarrativeJournal, type NarrativeJournalEntry } from "./narrative-journal";

/** A reading surface only: it never loads a model, advances play, or changes a save. */
export function createNarrativeJournalView(root: HTMLElement, journal: ReturnType<typeof createNarrativeJournal>, campaignId: () => string) {
  function required<T extends HTMLElement>(selector: string): T {
    const element = root.querySelector<T>(selector);
    if (element === null) throw new Error(`Missing narrative journal element: ${selector}`);
    return element;
  }
  const doc = root.ownerDocument;
  const adventureButton = required<HTMLButtonElement>("#journal-adventure-button");
  const statusButton = required<HTMLButtonElement>("#journal-status-button");
  const statusHistory = required<HTMLElement>("#journal-status");
  const narrativesButton = required<HTMLButtonElement>("#journal-narratives-button");
  const narratives = required<HTMLElement>("#journal-narratives");
  const scope = required<HTMLSelectElement>("#journal-narrative-scope");
  const exportButton = required<HTMLButtonElement>("#journal-narrative-export");
  const status = required<HTMLElement>("#journal-narrative-status");
  const list = required<HTMLOListElement>("#journal-narrative-list");
  let previousEntries: readonly NarrativeJournalEntry[] | undefined;
  let previousCampaign: string | undefined;
  let previousPersistent: boolean | undefined;
  let shown: readonly NarrativeJournalEntry[] = [];

  function render(force = false): void {
    const snapshot = journal.snapshot;
    const currentCampaign = campaignId();
    if (!force && previousEntries === snapshot.entries && previousCampaign === currentCampaign
      && previousPersistent === snapshot.persistent) return;
    previousEntries = snapshot.entries;
    previousCampaign = currentCampaign;
    previousPersistent = snapshot.persistent;
    shown = snapshot.entries.filter((entry) => scope.value === "all" || entry.campaignId === currentCampaign);
    exportButton.disabled = shown.length === 0;
    status.textContent = `${shown.length} ${shown.length === 1 ? "story" : "stories"} · ${snapshot.persistent
      ? "Saved in this browser."
      : "Session only: the browser archive could not be updated. Export to keep these stories."} Newest ${narrativeJournalMaximumEntries} across heroes, within 256 KiB; older stories roll off.`;
    list.replaceChildren(...shown.map((entry) => {
      const item = doc.createElement("li");
      item.className = "journal-narrative-entry";
      item.dataset.origin = entry.origin;
      item.dataset.sourceEvent = entry.sourceEventId;
      item.dataset.campaign = entry.campaignId;
      const source = doc.createElement("p");
      source.className = "journal-narrative-source";
      source.textContent = `${entry.origin === "model" ? "LLM" : "Authored"} · T${entry.sourceTick} · ${entry.presentedAtMs === null ? "Written; not shown" : "Intermission shown"}${entry.campaignId === currentCampaign ? "" : " · Earlier hero"}`;
      const title = doc.createElement("h3");
      title.textContent = entry.headline;
      const location = doc.createElement("p");
      location.className = "journal-narrative-location";
      location.textContent = entry.location;
      const prose = doc.createElement("div");
      prose.className = "journal-narrative-prose";
      if (entry.voices === undefined) prose.textContent = entry.text;
      else for (const voice of entry.voices) {
        const thought = doc.createElement("p");
        const speaker = doc.createElement("strong");
        speaker.className = "journal-narrative-speaker";
        speaker.textContent = `${voice.name} · ${voice.role === "hero" ? "Hero" : "Companion"}'s thought: `;
        thought.append(speaker, doc.createTextNode(voice.text));
        prose.append(thought);
      }
      item.append(source, title, location, prose);
      return item;
    }));
    if (shown.length === 0) {
      const empty = doc.createElement("li");
      empty.className = "journal-narrative-empty";
      empty.textContent = "No stories here yet. In LLM mode, completed background stories are saved here automatically—even before an intermission can show them. Reading this page never starts the narrator.";
      list.append(empty);
    }
  }

  function selectSection(section: "adventure" | "status" | "narratives"): void {
    root.dataset.journalSection = section;
    adventureButton.setAttribute("aria-pressed", String(section === "adventure"));
    statusButton.setAttribute("aria-pressed", String(section === "status"));
    narrativesButton.setAttribute("aria-pressed", String(section === "narratives"));
    narratives.hidden = section !== "narratives";
    statusHistory.hidden = section !== "status";
    for (const article of root.querySelectorAll<HTMLElement>('[data-journal-section="adventure"]')) article.hidden = section !== "adventure";
    if (section === "narratives") render();
  }
  adventureButton.addEventListener("click", () => selectSection("adventure"));
  statusButton.addEventListener("click", () => selectSection("status"));
  narrativesButton.addEventListener("click", () => selectSection("narratives"));
  scope.addEventListener("change", () => render(true));
  exportButton.addEventListener("click", () => {
    if (shown.length === 0) return;
    const link = doc.createElement("a");
    let url: string | undefined;
    try {
      const content = JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), entries: shown }, null, 2);
      url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
      link.href = url;
      link.download = "the-grind-2-narratives.json";
      doc.body.append(link);
      link.click();
    } catch {
      status.textContent = "Export could not start. Your stories are still available below.";
    } finally {
      link.remove();
      if (url !== undefined) {
        const downloadUrl = url;
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1_000);
      }
    }
  });
  selectSection("adventure");
  render();
  return { render, selectSection };
}
