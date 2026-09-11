import type { WorldState } from "../core/types";
import { projectStatusHistory, type StatusHistoryRow } from "./status-history";
import { projectCombatAftermathEntry } from "./combat-aftermath";

/** Read-only snapshot: a running adventure must not replace focused/open rows. */
export function createStatusHistoryView(root: HTMLElement) {
  const doc = root.ownerDocument;
  function required<T extends HTMLElement>(selector: string): T {
    const element = root.querySelector<T>(selector);
    if (element === null) throw new Error(`Missing status history element: ${selector}`);
    return element;
  }
  const list = required<HTMLOListElement>("#journal-status-list");
  const summary = required<HTMLElement>("#journal-status-summary");
  const refreshButton = required<HTMLButtonElement>("#journal-status-refresh");
  let latest: WorldState | undefined;
  let shown: WorldState | undefined;

  function sameHistory(left: WorldState | undefined, right: WorldState | undefined): boolean {
    return left?.campaignId === right?.campaignId && left?.chronicle === right?.chronicle && left?.depth.log === right?.depth.log
      && left?.depth.combat === right?.depth.combat && left?.depth.completedCombats === right?.depth.completedCombats
      && left?.depth.roadSupper === right?.depth.roadSupper && left?.depth.dungeon === right?.depth.dungeon;
  }
  function syncRefresh(): void {
    const upToDate = sameHistory(latest, shown);
    // Keep keyboard focus on the explicit refresh control after it is used.
    refreshButton.disabled = false;
    refreshButton.setAttribute("aria-disabled", String(upToDate));
    refreshButton.textContent = upToDate ? "Up to date" : "Show latest events";
  }
  function paragraph(text: string, className?: string): HTMLParagraphElement {
    const element = doc.createElement("p");
    element.textContent = text;
    if (className !== undefined) element.className = className;
    return element;
  }
  function row(entry: StatusHistoryRow): HTMLLIElement {
    const item = doc.createElement("li");
    item.dataset.source = entry.source;
    item.dataset.eventId = entry.eventId;
    item.dataset.campaign = entry.campaignId;
    item.dataset.tick = String(entry.tick);
    const source = paragraph(`T${entry.tick} · ${entry.source === "chronicle" ? `Chronicle · ${entry.location}` : `Mechanics · ${entry.category}`}`, "journal-status-source");
    item.append(source);
    if (entry.source === "mechanics") {
      item.append(paragraph(entry.message, "journal-status-action"));
      return item;
    }
    const title = doc.createElement("h3");
    title.textContent = entry.headline;
    item.append(title, paragraph(entry.action, "journal-status-action"), paragraph(entry.consequence, "journal-status-consequence"));
    const details = doc.createElement("details");
    details.className = "journal-status-decision";
    const toggle = doc.createElement("summary");
    toggle.textContent = "Why this action?";
    const { decision } = entry;
    const trace = decision.trace;
    const chosen = trace === null ? decision.chosenAction
      : `${trace.actorName} → ${trace.selected.actionLabel}${trace.selected.targetLabel === null ? "" : ` → ${trace.selected.targetLabel}`}`;
    details.append(toggle, paragraph(`Computer choice · ${chosen}`, "journal-status-choice"), paragraph(decision.rationale));
    if (trace !== null) {
      const reasons = doc.createElement("ul");
      for (const reason of trace.reasons) {
        if (reason === decision.rationale) continue;
        const item = doc.createElement("li");
        item.textContent = reason;
        reasons.append(item);
      }
      if (reasons.childElementCount > 0) details.append(reasons);
    }
    if (entry.goal.length > 0) details.append(paragraph(`Goal · ${entry.goal}`));
    const receipt = paragraph(`Event ${entry.eventId}${decision.commandId === null ? "" : ` · Command ${decision.commandId}`}`, "journal-status-receipt");
    details.append(receipt);
    item.append(details);
    if (entry.aftermath !== undefined) {
      const recap = entry.aftermath;
      const exchange = doc.createElement("details");
      exchange.className = "journal-status-decision journal-status-aftermath";
      exchange.dataset.aftermathCommand = recap.commandId;
      exchange.dataset.aftermathCombat = recap.combatId;
      exchange.dataset.aftermathTick = String(recap.tick);
      exchange.dataset.aftermathEvents = JSON.stringify(recap.sourceEventIds);
      const summary = doc.createElement("summary");
      summary.textContent = "Last exchange";
      exchange.append(summary, paragraph(recap.detail, "journal-status-action"),
        paragraph(`Battle ${recap.combatId} · T${recap.tick} · Command ${recap.commandId}`, "journal-status-receipt"),
        paragraph(`Combat events · ${recap.sourceEventIds.join(" · ")}`, "journal-status-receipt"));
      item.append(exchange);
    }
    return item;
  }
  function refresh(): void {
    if (latest === undefined || sameHistory(latest, shown)) return;
    shown = latest;
    const snapshot = shown;
    const aftermaths = snapshot.chronicle.flatMap((entry) => {
      const recap = projectCombatAftermathEntry(snapshot, entry);
      return recap === null ? [] : [recap];
    });
    const entries = projectStatusHistory(shown, aftermaths);
    root.dataset.campaign = shown.campaignId;
    root.dataset.snapshotTick = String(shown.tick);
    summary.textContent = `${shown.hero.name} · Snapshot T${shown.tick} · ${entries.length} records`;
    list.replaceChildren(...entries.map(row));
    if (entries.length === 0) {
      const empty = doc.createElement("li");
      empty.textContent = "No recorded events yet. The first adventure step will appear here.";
      list.append(empty);
    }
    syncRefresh();
  }
  function render(state: WorldState): void {
    latest = state;
    // Never leave another hero's history visible after a campaign switch.
    if (shown !== undefined && shown.campaignId !== state.campaignId) refresh();
    syncRefresh();
  }
  refreshButton.addEventListener("click", refresh);
  return { render, refresh };
}
