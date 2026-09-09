import type { TownBuilding } from "../depth/types";
import type { ChroniclePlateRecipeV1 } from "./chronicle-plate";
import { chroniclePlateMaximumBytes, chroniclePlateMaximumEntries, type createChroniclePlateArchive } from "./chronicle-plate-archive";
import "./chronicle-plate.css";

export interface ChroniclePlateContext {
  readonly campaignId: string;
  readonly currentTick: number;
}

export function chroniclePlatePagesForContext(entries: readonly ChroniclePlateRecipeV1[], context: ChroniclePlateContext): readonly ChroniclePlateRecipeV1[] {
  if (!Number.isSafeInteger(context.currentTick) || context.currentTick < 0) return [];
  return entries.filter((entry) => entry.campaignId === context.campaignId && entry.sourceTick <= context.currentTick);
}

/** Reading stability never takes priority over hiding another hero or a future event. */
export function holdChroniclePlateReading(shown: readonly ChroniclePlateRecipeV1[], context: ChroniclePlateContext, reading: boolean, campaignChanged: boolean): boolean {
  return reading && !campaignChanged && shown.every((entry) => entry.campaignId === context.campaignId && entry.sourceTick <= context.currentTick);
}

// Deliberately abstract building-kind emblems. No people, equipment, weather,
// scene reenactment or claims about the settlement's precise architecture.
const landmarkPaths: Readonly<Record<TownBuilding["kind"], readonly string[]>> = {
  inn: ["M8 80V38H56V80Z M3 38L32 17L61 38", "M18 80V56H30V80 M39 51H48V61H39Z M58 46H69V62H58Z M56 43H69"],
  smithy: ["M7 80V44H58V80Z M3 44L15 30H51L62 44 M43 30V18H52V33", "M17 59H48L43 65H36V73H24V65H20Z"],
  market: ["M8 80V49H58V80 M3 49L13 29H53L63 49Z", "M13 29L16 49 M26 29V49 M40 29V49 M53 29L50 49 M10 65H57 M17 65V80 M49 65V80"],
  shrine: ["M12 80V39L33 14L54 39V80Z M7 80H59", "M25 80V60Q33 43 41 60V80 M28 35H38V45H28Z"],
  hall: ["M5 37L33 18L61 37Z M8 40H58 M5 80H61 M10 75H56", "M14 41V74 M24 41V74 M42 41V74 M52 41V74 M8 44H58"],
  home: ["M10 80V40H55V80Z M5 40L32 20L60 40", "M28 80V60H39V80 M17 49H25V57H17Z M42 49H50V57H42Z"],
};

/** A local reading surface only; rendering never captures a page or advances play. */
export function createChroniclePlateView(
  root: HTMLDetailsElement,
  archive: Pick<ReturnType<typeof createChroniclePlateArchive>, "snapshot">,
  current: () => ChroniclePlateContext,
) {
  const doc = root.ownerDocument;
  function required<T extends HTMLElement>(selector: string): T {
    const element = root.querySelector<T>(selector);
    if (element === null) throw new Error(`Missing Chronicle Plates element: ${selector}`);
    return element;
  }
  const summary = required<HTMLElement>("summary");
  const list = required<HTMLOListElement>("#chronicle-plate-list");
  const status = required<HTMLElement>("#chronicle-plate-status");
  const refresh = required<HTMLButtonElement>("#chronicle-plate-refresh");
  const retention = required<HTMLElement>("#chronicle-plate-retention");
  retention.textContent = `Newest ${chroniclePlateMaximumEntries} pages across heroes, within ${chroniclePlateMaximumBytes / 1_024} KiB. Only this hero's recorded past is shown. The pages stay still while you read.`;
  let campaign: string | undefined;
  let shown: readonly ChroniclePlateRecipeV1[] = [];
  let initialized = false;
  let pending = false;

  function element<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, className = ""): HTMLElementTagNameMap[K] {
    const node = doc.createElement(tag);
    node.textContent = text;
    node.className = className;
    return node;
  }
  function illustration(entry: ChroniclePlateRecipeV1): SVGSVGElement {
    const namespace = "http://www.w3.org/2000/svg";
    const svg = doc.createElementNS(namespace, "svg");
    svg.setAttribute("viewBox", "0 0 300 104");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.classList.add("chronicle-plate-sketch");
    svg.dataset.template = entry.templateId;
    const landmarks = entry.landmarks.slice(0, 3);
    const width = 260 / landmarks.length;
    for (const [index, landmark] of landmarks.entries()) {
      const group = doc.createElementNS(namespace, "g");
      group.setAttribute("transform", `translate(${20 + index * width + (width - 66) / 2} 8)`);
      group.dataset.landmarkId = landmark.id;
      group.dataset.landmarkKind = landmark.kind;
      for (const pathData of landmarkPaths[landmark.kind]) {
        const path = doc.createElementNS(namespace, "path");
        path.setAttribute("d", pathData);
        group.append(path);
      }
      svg.append(group);
    }
    return svg;
  }
  function page(entry: ChroniclePlateRecipeV1): HTMLLIElement {
    const item = element("li", "", "chronicle-plate-page");
    item.dataset.sourceEvent = entry.sourceEventId;
    item.dataset.campaign = entry.campaignId;
    item.dataset.sourceTick = String(entry.sourceTick);
    const figure = element("figure", "");
    figure.append(illustration(entry));
    const caption = element("figcaption", "");
    const heading = element("div", "", "chronicle-plate-heading");
    heading.append(element("h3", entry.town.name), element("span", `T${entry.sourceTick}`, "chronicle-plate-tick"));
    caption.append(element("p", "Illustrated reconstruction", "chronicle-plate-label"), heading,
      element("p", `Town visits ${entry.visit.before}→${entry.visit.after} · Reputation ${entry.reputation.before}→${entry.reputation.after}/100`, "chronicle-plate-outcome"));
    const landmarks = element("ul", "", "chronicle-plate-landmarks");
    landmarks.setAttribute("aria-label", "Recorded landmarks, not building entries");
    for (const landmark of entry.landmarks.slice(0, 3)) {
      const row = element("li", "");
      row.dataset.landmarkId = landmark.id;
      row.dataset.landmarkKind = landmark.kind;
      row.append(element("strong", landmark.name), element("span", landmark.kind));
      landmarks.append(row);
    }
    caption.append(landmarks);
    figure.append(caption);
    item.append(figure);
    return item;
  }
  function syncStatus(entries: readonly ChroniclePlateRecipeV1[], persistent: boolean): void {
    const retained = shown.filter((entry) => entries.some((saved) => saved.campaignId === entry.campaignId && saved.sourceEventId === entry.sourceEventId)).length;
    const storage = !persistent ? "Session only: browser storage could not be updated."
      : retained < shown.length ? `${retained} still saved in this browser; older shown pages have rolled off.`
      : "Saved in this browser.";
    status.textContent = `${shown.length} ${shown.length === 1 ? "page" : "pages"} shown · ${storage}${pending ? " Latest pages available; your reading list has not moved." : ""}`;
    refresh.hidden = !pending;
    root.dataset.pendingPages = String(pending);
    root.dataset.persistent = String(persistent);
  }
  function render(force = false): void {
    const context = current();
    const snapshot = archive.snapshot;
    const next = chroniclePlatePagesForContext(snapshot.entries, context);
    const campaignChanged = campaign !== context.campaignId;
    campaign = context.campaignId;
    const changed = next.length !== shown.length || next.some((entry, index) => entry !== shown[index]);
    const reading = root.open && root.closest("[hidden]") === null;
    if (!force && initialized && changed && holdChroniclePlateReading(shown, context, reading, campaignChanged)) {
      pending = true;
      syncStatus(snapshot.entries, snapshot.persistent);
      return;
    }
    pending = false;
    if (!initialized || campaignChanged || changed) {
      initialized = true;
      shown = next;
      root.dataset.campaign = context.campaignId;
      root.dataset.snapshotTick = String(context.currentTick);
      list.replaceChildren(...shown.map(page));
      if (shown.length === 0) list.append(element("li", "No pages for this hero yet. Recorded town visits will leave a page here.", "chronicle-plate-empty"));
    }
    syncStatus(snapshot.entries, snapshot.persistent);
  }
  refresh.addEventListener("click", () => {
    if (!pending) return;
    const focused = doc.activeElement === refresh;
    render(true);
    // Latest pages is only present for actual updates; return keyboard focus to
    // the disclosure instead of dropping it onto the document when it hides.
    if (focused) summary.focus();
  });
  root.addEventListener("toggle", () => render());
  render();
  return { render: (): void => render() };
}
