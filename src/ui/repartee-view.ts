import type { WorldState } from "../core/types";
import { isValidReparteeProgress, reparteeBook, reparteeChallenges, reparteeEntries, reparteeResponses } from "../depth/repartee";

export interface ReparteeSceneView {
  readonly phase: "reading" | "challenge" | "round" | "result";
  readonly commandId: string;
  readonly tick: number;
  readonly heroId: string;
  readonly heroName: string;
  readonly residentId: string | null;
  readonly residentName: string | null;
  readonly buildingId: string;
  readonly buildingName: string;
  readonly bookId: string;
  readonly title: string;
  readonly call: string;
  readonly reply: string | null;
  readonly marks: readonly (number | null)[];
  readonly momentum: number;
  readonly outcome: string | null;
  readonly consequence: string;
}

export function signedReparteeMomentum(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** The current command must own the receipt; revisiting town cannot replay a duel. */
export function projectReparteeScene(state: WorldState): ReparteeSceneView | null {
  const source = state.chronicle.at(-1);
  const progress = state.depth.repartee;
  if (!isValidReparteeProgress(progress)) return null;
  const reading = progress.reading;
  if (source === undefined || source.commandId === undefined || source.tick !== state.tick || state.scene.mode !== "chronicle"
    || source.mode !== "chronicle" || reading === null || reading.actorId !== state.depth.hero.id
    || reading.bookId !== reparteeBook.id || reading.contentVersion !== reparteeBook.contentVersion
    || reading.locationId !== state.depth.atlas.currentLocationId) return null;
  const town = state.depth.towns[reading.locationId];
  const building = town?.buildings.find((candidate) => candidate.id === reading.buildingId);
  if (town === undefined || building === undefined) return null;
  const base = {
    commandId: source.commandId,
    tick: source.tick,
    heroId: state.depth.hero.id,
    heroName: state.hero.name,
    buildingId: building.id,
    buildingName: building.name,
    bookId: reading.bookId,
  };
  if (source.commandType === "read-book" && `${state.campaignId}:${reading.sourceCommandId}` === source.commandId && reading.tick === source.tick) {
    return Object.freeze({
      ...base, phase: "reading", residentId: null, residentName: null,
      title: `${state.hero.name} reads · ${reparteeBook.title}`, call: reparteeBook.excerpt, reply: null,
      marks: Object.freeze([null, null, null]), momentum: 0, outcome: null,
      consequence: `${reading.addedEntryIds.length} expressions · ${reading.addedFrameIds.length} counter frames learned from the public reading copy.`,
    });
  }
  const duel = progress.active ?? progress.completed;
  if (duel === null || duel.actorId !== reading.actorId || duel.locationId !== reading.locationId
    || duel.buildingId !== reading.buildingId || duel.readingSourceCommandId !== reading.sourceCommandId) return null;
  const resident = town.residents.find((candidate) => candidate.id === duel.residentId);
  if (resident === undefined || !building.residentIds.includes(resident.id)) return null;
  const round = duel.rounds.at(-1);
  const completion = progress.completed;
  const completedNow = completion !== null && `${state.campaignId}:${completion.completionCommandId}` === source.commandId
    && completion.completedTick === source.tick;
  const startedNow = source.commandType === "start-repartee" && `${state.campaignId}:${duel.sourceCommandId}` === source.commandId
    && duel.startedTick === source.tick && duel.rounds.length === 0;
  const answeredNow = source.commandType === "repartee-action" && round !== undefined
    && `${state.campaignId}:${round.sourceCommandId}` === source.commandId
    && round.tick === source.tick;
  if (!startedNow && !answeredNow && !(completedNow && source.commandType === "repartee-action")) return null;
  const challenge = reparteeChallenges[startedNow ? 0 : round?.roundIndex ?? 0];
  if (challenge === undefined) return null;
  const outcome = completedNow ? completion.outcome : null;
  return Object.freeze({
    ...base, phase: completedNow ? "result" : startedNow ? "challenge" : "round",
    residentId: resident.id, residentName: resident.name,
    title: completedNow ? `Flyting · ${outcome}` : `Flyting · Round ${startedNow ? 1 : (round?.roundIndex ?? 0) + 1} of 3`,
    call: outcome === "retreat" ? `${state.hero.name} concedes the contest.` : startedNow ? challenge.text : round?.call ?? "",
    reply: startedNow || outcome === "retreat" ? null : round?.reply ?? null,
    marks: Object.freeze([0, 1, 2].map((index) => duel.rounds.find((entry) => entry.roundIndex === index)?.delta ?? null)),
    momentum: duel.momentum,
    outcome,
    consequence: completedNow
      ? `Reputation ${completion.reputationBefore} → ${completion.reputationAfter} (${signedReparteeMomentum(completion.reputationAward)}). HP and MP unchanged.`
      : "Words only · HP and MP unchanged. Full choices and sources in Journal → Books & Flyting.",
  });
}

export function reparteeRoundMarks(marks: readonly (number | null)[]): string {
  return marks.map((delta) => delta === null ? "[·]" : `[${signedReparteeMomentum(delta)}]`).join(" ");
}

/** Native dialogue stays legible at small viewports; canvas carries actors, not a second transcript. */
export function createReparteeView(caption: HTMLElement, journal: HTMLDetailsElement) {
  const doc = caption.ownerDocument;
  const queriedContent = journal.querySelector<HTMLElement>(".journal-repartee-content");
  if (queriedContent === null) throw new Error("Missing Books & Flyting Journal content");
  const content: HTMLElement = queriedContent;
  let visible = true;
  let latest: WorldState | null = null;
  let scene: ReparteeSceneView | null = null;
  let shownKey = "";
  let shownCampaign = "";
  function paragraph(text: string, className?: string): HTMLParagraphElement {
    const node = doc.createElement("p");
    node.textContent = text;
    if (className !== undefined) node.className = className;
    return node;
  }
  function heading(text: string): HTMLHeadingElement {
    const node = doc.createElement("h3");
    node.textContent = text;
    return node;
  }
  function dialogue(speaker: string, text: string, className: string): HTMLParagraphElement {
    const node = paragraph("", className);
    const name = doc.createElement("strong");
    name.textContent = `${speaker}: `;
    node.append(name, doc.createTextNode(text));
    return node;
  }
  function renderCaption(): void {
    caption.hidden = !visible || scene === null;
    const app = caption.closest<HTMLElement>("#app");
    if (app !== null) {
      if (caption.hidden) delete app.dataset.reparteeScene;
      else app.dataset.reparteeScene = scene?.phase ?? "";
    }
    if (scene === null) {
      caption.replaceChildren();
      for (const key of ["phase", "command", "book", "round", "momentum", "outcome", "hero", "resident"]) delete caption.dataset[key];
      return;
    }
    caption.dataset.phase = scene.phase;
    caption.dataset.command = scene.commandId;
    caption.dataset.book = scene.bookId;
    caption.dataset.round = String(scene.marks.filter((mark) => mark !== null).length);
    caption.dataset.momentum = String(scene.momentum);
    caption.dataset.outcome = scene.outcome ?? "pending";
    caption.dataset.hero = scene.heroId;
    caption.dataset.resident = scene.residentId ?? "none";
    const title = doc.createElement("h2");
    title.textContent = scene.title;
    const call = scene.phase === "reading"
      ? paragraph(`“${scene.call}”`, "repartee-call")
      : scene.outcome === "retreat" ? paragraph(scene.call, "repartee-call")
      : dialogue(scene.residentName ?? scene.heroName, scene.call, "repartee-call");
    const children: HTMLElement[] = [title, call];
    if (scene.reply !== null) children.push(dialogue(scene.heroName, scene.reply, "repartee-reply"));
    if (scene.phase !== "reading") children.push(paragraph(
      `${reparteeRoundMarks(scene.marks)}  ${signedReparteeMomentum(scene.momentum)} momentum`, "repartee-marks",
    ));
    children.push(paragraph(scene.consequence, "repartee-note"));
    caption.replaceChildren(...children);
  }
  function renderJournal(force = false): void {
    if (latest === null) return;
    const state = latest;
    const progress = state.depth.repartee;
    const key = `${state.campaignId}:${JSON.stringify(progress)}`;
    if (key === shownKey || (!force && journal.open && shownCampaign === state.campaignId)) return;
    shownKey = key;
    shownCampaign = state.campaignId;
    journal.dataset.campaign = state.campaignId;
    const reading = progress.reading;
    if (reading === null) {
      content.replaceChildren(paragraph("No reading or flyting contest recorded for this hero yet. A public book can teach useful replies at a safe town stop."));
      return;
    }
    const town = state.depth.towns[reading.locationId];
    const building = town?.buildings.find((candidate) => candidate.id === reading.buildingId);
    const words = reparteeEntries.filter((entry) => reading.addedEntryIds.includes(entry.id));
    const wordList = doc.createElement("ul");
    wordList.setAttribute("aria-label", "Learned expressions");
    for (const entry of words) {
      const item = doc.createElement("li");
      item.dataset.entry = entry.id;
      item.textContent = `${entry.word} — ${entry.definition}`;
      wordList.append(item);
    }
    const vocabulary = doc.createElement("details");
    const vocabularySummary = doc.createElement("summary");
    vocabularySummary.textContent = `${words.length} learned expressions · ${reading.addedFrameIds.length} counter frames`;
    vocabulary.append(vocabularySummary, wordList);
    const nodes: HTMLElement[] = [heading(reparteeBook.title), paragraph(reparteeBook.excerpt), paragraph(
      `${state.hero.name} read the public copy at ${building?.name ?? reading.buildingId}, ${town?.name ?? reading.locationId}, T${reading.tick}. Reading source: ${reading.sourceCommandId}. Content v${reading.contentVersion}; this is learned repertoire, not an inventory book.`,
      "journal-repartee-source",
    ), vocabulary];
    const duel = progress.active ?? progress.completed;
    if (duel !== null) {
      const resident = town?.residents.find((candidate) => candidate.id === duel.residentId);
      const completion = progress.completed;
      nodes.push(heading(`${state.hero.name} & ${resident?.name ?? duel.residentId} · Flyting`));
      nodes.push(paragraph(`Encounter ${duel.encounterId} · rules v${duel.rulesVersion} · started T${duel.startedTick} by ${duel.sourceCommandId}.`, "journal-repartee-source"));
      nodes.push(paragraph(completion === null
        ? `${duel.rounds.length} of 3 replies recorded · ${signedReparteeMomentum(duel.momentum)} momentum · in progress.`
        : `${completion.outcome} · ${signedReparteeMomentum(duel.momentum)} momentum · reputation ${completion.reputationBefore} → ${completion.reputationAfter}. HP and MP unchanged. This one-time contest is complete.`));
      const rounds = doc.createElement("ol");
      rounds.setAttribute("aria-label", "Exact flyting transcript");
      for (const round of duel.rounds) {
        const item = doc.createElement("li");
        item.dataset.command = round.sourceCommandId;
        item.dataset.round = String(round.roundIndex + 1);
        item.append(dialogue(resident?.name ?? duel.residentId, round.call, "repartee-call"), dialogue(state.hero.name, round.reply, "repartee-reply"));
        item.append(paragraph(`${round.classification} · ${signedReparteeMomentum(round.delta)} · ${round.explanation}`));
        const options = doc.createElement("details");
        const toggle = doc.createElement("summary");
        toggle.textContent = "Known choices and recorded reason";
        const list = doc.createElement("ul");
        for (const choice of reparteeResponses(progress, round.roundIndex)) {
          const alternative = doc.createElement("li");
          alternative.dataset.response = choice.id;
          alternative.textContent = `${choice.id === round.responseId ? "Chosen: " : "Alternative: "}${choice.text} — ${choice.explanation}`;
          list.append(alternative);
        }
        const event = state.chronicle.find((entry) => entry.commandId === `${state.campaignId}:${round.sourceCommandId}`);
        options.append(toggle, list, paragraph(event === undefined
          ? "The exact decision command is retained below; its extra choice trace has left the rolling Chronicle."
          : `Recorded computer choice: ${event.rationale}`));
        const provenance = round.entryIds.length === 0 ? "Starter response; no learned entry used."
          : `Learned entries: ${round.entryIds.join(", ")}. Reading: ${round.readingSourceCommandId}.`;
        options.append(paragraph(`T${round.tick} · Command: ${round.sourceCommandId}. ${provenance}`, "journal-repartee-source"));
        item.append(options);
        rounds.append(item);
      }
      nodes.push(rounds);
      if (completion !== null) {
        nodes.push(paragraph(`Completed T${completion.completedTick} · Command ${completion.completionCommandId}. Reputation award ${signedReparteeMomentum(completion.reputationAward)}, once only.`, "journal-repartee-source"));
      }
    }
    content.replaceChildren(...nodes);
  }
  journal.addEventListener("toggle", () => { if (!journal.open) renderJournal(true); });
  return {
    render(state: WorldState): void {
      latest = state;
      scene = projectReparteeScene(state);
      renderCaption();
      renderJournal();
    },
    setVisible(value: boolean): void {
      visible = value;
      renderCaption();
    },
  };
}
