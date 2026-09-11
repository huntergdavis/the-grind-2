import type { WorldState } from "../core/types";
import { isValidReparteeProgress, reparteeBook, reparteeChallenges, reparteeEntries, reparteeResponses } from "../depth/repartee";
import {
  declareReparteeWitnessPreference, isValidReparteeWitnessPreference, isValidReparteeWitnessReaction,
  reparteeWitnessPreference,
} from "../depth/repartee-witness";

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
  readonly witness: ReparteeWitnessView | null;
  readonly encore: boolean;
}

export interface ReparteeWitnessView {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly preferenceId: string;
  readonly preferenceLabel: string;
  readonly preferenceDescription: string;
  readonly reaction: {
    readonly id: string;
    readonly pose: "nod" | "frown" | "laugh" | "quiet";
    readonly line: string;
    readonly explanation: string;
    readonly regardBefore: null;
    readonly regardAfter: number;
    readonly regardDelta: number;
  } | null;
}

/** Present-stage projection; the Journal separately retains the historical receipt after departure. */
export function projectReparteeWitness(state: WorldState): ReparteeWitnessView | null {
  const witnessState = state.depth.reparteeWitness;
  const progress = state.depth.repartee;
  const first = witnessState.firstContest;
  const preference = witnessState.preference;
  const duel = progress.active ?? progress.completed;
  if (!isValidReparteeProgress(progress) || !isValidReparteeProgress(first) || first.completed === null
    || !isValidReparteeWitnessPreference(preference) || duel === null
    || first.completed.encounterId === duel.encounterId || first.completed.completedTick >= duel.startedTick
    || JSON.stringify(first.reading) !== JSON.stringify(progress.reading)
    || duel.sourceCommandId !== preference.sourceCommandId || duel.startedTick !== preference.declaredTick
    || duel.actorId !== state.depth.hero.id || duel.locationId !== state.depth.atlas.currentLocationId
    || preference.witnessId === duel.actorId || preference.witnessId === duel.residentId) return null;
  const companion = state.depth.companions.active.find((entry) => entry.identity.residentId === preference.witnessId
    && entry.joinedTick === preference.joinedTick && entry.injury === "none" && entry.resources.health > 0);
  if (companion === undefined || declareReparteeWitnessPreference(state.seed, {
    witnessId: companion.identity.residentId, joinedTick: companion.joinedTick,
    sourceCommandId: duel.sourceCommandId, tick: duel.startedTick,
  }).preferenceId !== preference.preferenceId) return null;
  const reaction = witnessState.reaction;
  if ((progress.completed === null) !== (reaction === null)
    || (reaction !== null && (!isValidReparteeWitnessReaction(reaction, progress, preference)
      || reaction.witnessName !== companion.identity.name))) return null;
  const definition = reparteeWitnessPreference(preference.preferenceId);
  return Object.freeze({
    id: companion.identity.residentId, name: companion.identity.name, role: companion.identity.role,
    preferenceId: preference.preferenceId, preferenceLabel: definition.label, preferenceDescription: definition.description,
    reaction: reaction === null ? null : Object.freeze({
      id: reaction.reactionId, pose: reaction.pose, line: reaction.line, explanation: reaction.explanation,
      regardBefore: reaction.regardBefore, regardAfter: reaction.regardAfter, regardDelta: reaction.regardDelta,
    }),
  });
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
    || reading.bookId !== reparteeBook.id || reading.contentVersion !== reparteeBook.contentVersion) return null;
  const base = {
    commandId: source.commandId,
    tick: source.tick,
    heroId: state.depth.hero.id,
    heroName: state.hero.name,
    bookId: reading.bookId,
    witness: null,
    encore: false,
  };
  if (source.commandType === "read-book" && `${state.campaignId}:${reading.sourceCommandId}` === source.commandId && reading.tick === source.tick) {
    const town = state.depth.towns[reading.locationId];
    const building = town?.buildings.find((candidate) => candidate.id === reading.buildingId);
    if (town === undefined || building === undefined || reading.locationId !== state.depth.atlas.currentLocationId) return null;
    return Object.freeze({
      ...base, phase: "reading", residentId: null, residentName: null,
      buildingId: building.id, buildingName: building.name,
      title: `${state.hero.name} reads · ${reparteeBook.title}`, call: reparteeBook.excerpt, reply: null,
      marks: Object.freeze([null, null, null]), momentum: 0, outcome: null,
      consequence: `${reading.addedEntryIds.length} expressions · ${reading.addedFrameIds.length} counter frames learned from the public reading copy.`,
    });
  }
  const duel = progress.active ?? progress.completed;
  if (duel === null || duel.actorId !== reading.actorId || duel.locationId !== state.depth.atlas.currentLocationId
    || duel.readingSourceCommandId !== reading.sourceCommandId) return null;
  const town = state.depth.towns[duel.locationId];
  const building = town?.buildings.find((candidate) => candidate.id === duel.buildingId);
  if (town === undefined || building === undefined) return null;
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
  const encore = state.depth.reparteeWitness.firstContest !== null;
  const witness = encore ? projectReparteeWitness(state) : null;
  if (encore && witness === null) return null;
  const contestLabel = encore ? "Flyting encore" : "Flyting";
  return Object.freeze({
    ...base, phase: completedNow ? "result" : startedNow ? "challenge" : "round",
    buildingId: building.id, buildingName: building.name,
    encore, witness,
    residentId: resident.id, residentName: resident.name,
    title: completedNow ? `${contestLabel} · ${outcome}` : `${contestLabel} · Round ${startedNow ? 1 : (round?.roundIndex ?? 0) + 1} of 3`,
    call: outcome === "retreat" ? `${state.hero.name} concedes the contest.` : startedNow ? challenge.text : round?.call ?? "",
    reply: startedNow || outcome === "retreat" ? null : round?.reply ?? null,
    marks: Object.freeze([0, 1, 2].map((index) => duel.rounds.find((entry) => entry.roundIndex === index)?.delta ?? null)),
    momentum: duel.momentum,
    outcome,
    consequence: completedNow
      ? witness?.reaction !== null && witness !== null
        ? `${witness.name}’s regard toward ${state.hero.name}: ${signedReparteeMomentum(witness.reaction.regardAfter)}. Reputation ${completion.reputationBefore} → ${completion.reputationAfter}. HP, MP and bond unchanged.`
        : `Reputation ${completion.reputationBefore} → ${completion.reputationAfter} (${signedReparteeMomentum(completion.reputationAward)}). HP and MP unchanged.`
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
      for (const key of ["phase", "command", "book", "round", "momentum", "outcome", "hero", "resident", "witness", "reaction", "regard", "encore"]) delete caption.dataset[key];
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
    caption.dataset.witness = scene.witness?.id ?? "none";
    caption.dataset.reaction = scene.witness?.reaction?.id ?? "none";
    caption.dataset.regard = scene.witness?.reaction === null || scene.witness === null
      ? "unestablished" : String(scene.witness.reaction.regardAfter);
    caption.dataset.encore = String(scene.encore);
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
    if (scene.witness !== null) children.push(scene.witness.reaction === null
      ? paragraph(`${scene.witness.name} watches; values ${scene.witness.preferenceLabel.toLocaleLowerCase()}.`, "repartee-witness")
      : dialogue(scene.witness.name, scene.witness.reaction.line, "repartee-witness"));
    children.push(paragraph(scene.consequence, "repartee-note"));
    caption.replaceChildren(...children);
  }
  function renderJournal(force = false): void {
    if (latest === null) return;
    const state = latest;
    const progress = state.depth.repartee;
    const key = `${state.campaignId}:${JSON.stringify(progress)}:${JSON.stringify(state.depth.reparteeWitness)}`;
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
    const firstContest = state.depth.reparteeWitness.firstContest;
    const contests = firstContest === null ? [{ progress, label: "Flyting" }]
      : [{ progress: firstContest, label: "Original flyting contest" }, { progress, label: "Witnessed encore" }];
    for (const contest of contests) {
      const progress = contest.progress;
      const duel = progress.active ?? progress.completed;
      if (duel === null) continue;
      const duelTown = state.depth.towns[duel.locationId];
      const duelBuilding = duelTown?.buildings.find((candidate) => candidate.id === duel.buildingId);
      const resident = duelTown?.residents.find((candidate) => candidate.id === duel.residentId);
      const completion = progress.completed;
      nodes.push(heading(`${state.hero.name} & ${resident?.name ?? duel.residentId} · ${contest.label}`));
      nodes.push(paragraph(`Encounter ${duel.encounterId} · ${duelBuilding?.name ?? duel.buildingId}, ${duelTown?.name ?? duel.locationId} · rules v${duel.rulesVersion} · started T${duel.startedTick} by ${duel.sourceCommandId}.`, "journal-repartee-source"));
      nodes.push(paragraph(completion === null
        ? `${duel.rounds.length} of 3 replies recorded · ${signedReparteeMomentum(duel.momentum)} momentum · in progress.`
        : `${completion.outcome} · ${signedReparteeMomentum(duel.momentum)} momentum · reputation ${completion.reputationBefore} → ${completion.reputationAfter}. HP and MP unchanged. This one-time contest is complete.`));
      const rounds = doc.createElement("ol");
      rounds.setAttribute("aria-label", "Exact flyting transcript");
      rounds.dataset.encounter = duel.encounterId;
      rounds.dataset.contest = firstContest === null ? "original" : contest.progress === firstContest ? "original" : "encore";
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
    const preference = state.depth.reparteeWitness.preference;
    if (isValidReparteeWitnessPreference(preference)) {
      const reaction = state.depth.reparteeWitness.reaction;
      const companion = [...state.depth.companions.active, ...state.depth.companions.former]
        .find((entry) => entry.identity.residentId === preference.witnessId && entry.joinedTick === preference.joinedTick);
      const witnessName = reaction?.witnessName ?? companion?.identity.name ?? preference.witnessId;
      const definition = reparteeWitnessPreference(preference.preferenceId);
      nodes.push(heading(`${witnessName}’s view`), paragraph(`${definition.label} — ${definition.description}`), paragraph(
        `Preference declared T${preference.declaredTick} by ${preference.sourceCommandId}. Witness ${preference.witnessId}, joined T${preference.joinedTick}. This is an explicit preference, not an opinion inferred from profession or personality.`,
        "journal-repartee-source",
      ));
      if (isValidReparteeWitnessReaction(reaction, progress, preference)) {
        const line = dialogue(witnessName, reaction.line, "repartee-witness");
        line.dataset.witnessReaction = reaction.reactionId;
        line.dataset.witness = reaction.witnessId;
        line.dataset.command = reaction.completionCommandId;
        line.dataset.regard = String(reaction.regardAfter);
        nodes.push(line, paragraph(reaction.explanation), paragraph(
          `Regard from ${witnessName} toward ${state.hero.name}: not previously established → ${signedReparteeMomentum(reaction.regardAfter)} (${signedReparteeMomentum(reaction.regardDelta)}). Contest result: ${reaction.outcome}. HP, MP and existing bond unchanged.`,
        ));
        if (reaction.evidence !== null) nodes.push(paragraph(
          `Remembered cause, round ${reaction.evidence.roundIndex + 1}: “${reaction.evidence.reply}” Command ${reaction.evidence.sourceCommandId}, T${reaction.evidence.tick}. Reading source: ${reaction.evidence.readingSourceCommandId ?? "starter response"}.`,
          "journal-repartee-source",
        ));
        nodes.push(paragraph(
          `Reaction recorded T${reaction.completedTick} by ${reaction.completionCommandId}. Encounter ${reaction.encounterId}; preference source ${reaction.preferenceSourceCommandId}. One recorded reaction, not a repeatable bond reward.`,
          "journal-repartee-source",
        ));
      } else nodes.push(paragraph("No regard has been established from this encore yet; the witness is still listening."));
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
