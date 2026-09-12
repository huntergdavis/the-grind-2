import type { WorldState } from "../core/types";
import { isValidReparteeProgress, reparteeBook, reparteeChallenges, reparteeEntries, reparteeResponses } from "../depth/repartee";
import {
  declareReparteeWitnessPreference, isValidReparteeWitnessPreference, isValidReparteeWitnessReaction,
  reparteeWitnessPreference,
} from "../depth/repartee-witness";
import { isValidCampaignReparteeCallback } from "../depth/repartee-memory";
import { isValidCampaignUsefulReply, usefulReplyBook, usefulReplyResponses } from "../depth/useful-reply";
import { isValidCampaignRoomChallenge, roomChallengeResponses } from "../depth/room-challenge";
import { projectCompanionReunionScene, type CompanionReunionSceneView } from "./companion-reunion-view";
import { projectCompanionCreditScene, type CompanionCreditSceneView } from "./companion-credit-view";

export interface ReparteeContestSceneView {
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

export interface ReparteeMemorySceneView extends Omit<ReparteeContestSceneView, "phase" | "buildingId" | "buildingName"> {
  readonly phase: "memory";
  readonly buildingId: null;
  readonly buildingName: null;
  readonly residentId: null;
  readonly residentName: null;
  readonly witness: ReparteeWitnessView;
  readonly memory: {
    readonly locationId: string;
    readonly locationName: string;
    readonly pose: "nod" | "frown" | "laugh" | "quiet";
    readonly sourceReactionCommandId: string;
    readonly evidenceSourceCommandId: string;
    readonly rememberedReply: string;
    readonly regard: number;
  };
}

export interface ReparteeLessonSceneView extends Omit<ReparteeContestSceneView, "phase" | "momentum"> {
  readonly phase: "lesson-reading" | "lesson-practice";
  readonly lessonId: string;
  readonly classification: "learned" | "constructive" | "concession" | "boast";
  readonly readingSourceCommandId: string;
  readonly marks: readonly [];
  readonly momentum: null;
  readonly outcome: null;
  readonly witness: null;
  readonly encore: false;
}

export interface ReparteeRoomSceneView extends Omit<ReparteeContestSceneView, "phase" | "momentum"> {
  readonly phase: "room-challenge" | "room-result";
  readonly challengeId: string;
  readonly classification: "direct" | "near" | "category" | null;
  readonly readingSourceCommandId: string;
  readonly score: -1 | 0 | 1 | null;
  readonly momentum: null;
  readonly witness: null;
  readonly encore: false;
}

export type ReparteeSceneView = ReparteeContestSceneView | ReparteeMemorySceneView | ReparteeLessonSceneView | ReparteeRoomSceneView | CompanionReunionSceneView | CompanionCreditSceneView;

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

/** Only this arrival command can stage a memory; historical Journal receipts do not summon actors. */
export function projectReparteeMemory(state: WorldState): ReparteeMemorySceneView | null {
  const callback = state.depth.reparteeCallback;
  const source = state.chronicle.at(-1);
  if (callback === null || !isValidCampaignReparteeCallback(state.depth)
    || source?.commandType !== "recall-repartee" || source.commandId !== `${state.campaignId}:${callback.sourceCommandId}`
    || source.tick !== state.tick || callback.tick !== state.tick || source.mode !== "chronicle" || state.scene.mode !== "chronicle"
    || callback.heroId !== state.depth.hero.id || callback.restLocationId !== state.depth.atlas.currentLocationId) return null;
  const companion = state.depth.companions.active.find((entry) => entry.identity.residentId === callback.witnessId
    && entry.joinedTick === callback.joinedTick && entry.identity.name === callback.witnessName
    && entry.phase === "arrived" && entry.destination.locationId === callback.restLocationId
    && entry.injury === "none" && entry.resources.health > 0);
  const location = state.depth.atlas.locations.find((entry) => entry.id === callback.restLocationId && entry.kind === "town");
  const preference = state.depth.reparteeWitness.preference;
  const reaction = state.depth.reparteeWitness.reaction;
  if (companion === undefined || location === undefined
    || preference === null || reaction === null) return null;
  const locationName = location.name;
  const definition = reparteeWitnessPreference(preference.preferenceId);
  return Object.freeze({
    phase: "memory", commandId: source.commandId, tick: source.tick,
    heroId: state.depth.hero.id, heroName: state.hero.name, residentId: null, residentName: null,
    buildingId: null, buildingName: null, bookId: reparteeBook.id,
    title: `After the road · ${locationName}`, call: callback.line, reply: null,
    marks: Object.freeze([]), momentum: 0, outcome: null, encore: false,
    consequence: "A shared memory. Regard and bond unchanged; no healing or new reward.",
    witness: Object.freeze({ id: companion.identity.residentId, name: companion.identity.name, role: companion.identity.role,
      preferenceId: preference.preferenceId, preferenceLabel: definition.label, preferenceDescription: definition.description, reaction: null }),
    memory: Object.freeze({ locationId: callback.restLocationId, locationName, pose: callback.pose,
      sourceReactionCommandId: callback.sourceReactionCommandId, evidenceSourceCommandId: callback.evidenceSourceCommandId,
      rememberedReply: callback.rememberedReply, regard: reaction.regardAfter }),
  });
}

/** A saved reading or reply owns its stage only during the exact committed command. */
export function projectUsefulReplyScene(state: WorldState): ReparteeLessonSceneView | null {
  const lesson = state.depth.usefulReply;
  const source = state.chronicle.at(-1);
  if (lesson === null || !isValidCampaignUsefulReply(state.depth) || source === undefined
    || source.tick !== state.tick || state.depth.tick !== state.tick
    || source.mode !== "chronicle" || state.scene.mode !== "chronicle"
    || lesson.heroId !== state.depth.hero.id || lesson.locationId !== state.depth.atlas.currentLocationId) return null;
  const practice = source.commandType === "practice-useful-reply";
  const receipt = practice ? lesson.reply : source.commandType === "read-useful-book" && lesson.reply === null ? lesson.reading : null;
  if (receipt === null || receipt.tick !== state.tick || source.commandId !== `${state.campaignId}:${receipt.sourceCommandId}`) return null;
  const town = state.depth.towns[lesson.locationId];
  const building = town?.buildings.find((entry) => entry.id === lesson.buildingId);
  const resident = town?.residents.find((entry) => entry.id === lesson.residentId && entry.name === lesson.residentName);
  if (town === undefined || building === undefined || resident === undefined) return null;
  return Object.freeze({
    phase: practice ? "lesson-practice" : "lesson-reading", commandId: source.commandId, tick: source.tick,
    heroId: lesson.heroId, heroName: state.hero.name,
    residentId: practice ? resident.id : null, residentName: practice ? resident.name : null,
    buildingId: building.id, buildingName: building.name, bookId: usefulReplyBook.id,
    lessonId: lesson.lessonId, classification: practice ? lesson.reply!.classification : "learned",
    readingSourceCommandId: lesson.reading.sourceCommandId,
    title: practice ? "Practice · unscored" : usefulReplyBook.title,
    call: practice ? lesson.reply!.call : usefulReplyBook.excerpt,
    reply: practice ? lesson.reply!.reply : null,
    marks: Object.freeze([]) as readonly [], momentum: null, outcome: null, witness: null, encore: false,
    consequence: !practice ? "One constructive reply learned · practice is unscored."
      : lesson.reply!.classification === "constructive" ? "Constructive · leadership means helping others."
      : lesson.reply!.classification === "concession" ? "Concession · volume alone does not establish leadership."
      : "Boast · more volume, not more useful leadership.",
  });
}

/** The current command must own the receipt; revisiting town cannot replay a duel. */
export function projectRoomChallengeScene(state: WorldState): ReparteeRoomSceneView | null {
  const challenge = state.depth.roomChallenge;
  const source = state.chronicle.at(-1);
  if (challenge === null || !isValidCampaignRoomChallenge(state.depth) || source === undefined
    || source.tick !== state.tick || state.depth.tick !== state.tick
    || source.mode !== "chronicle" || state.scene.mode !== "chronicle"
    || challenge.heroId !== state.depth.hero.id || challenge.locationId !== state.depth.atlas.currentLocationId) return null;
  const result = challenge.result;
  const answering = source.commandType === "answer-room-challenge";
  const sourceId = answering ? result?.sourceCommandId : source.commandType === "start-room-challenge" && result === null ? challenge.sourceCommandId : null;
  const sourceTick = answering ? result?.tick : challenge.startedTick;
  if (sourceId === null || sourceId === undefined || sourceTick !== state.tick
    || source.commandId !== `${state.campaignId}:${sourceId}`) return null;
  const town = state.depth.towns[challenge.locationId];
  const building = town?.buildings.find((entry) => entry.id === challenge.buildingId);
  const resident = town?.residents.find((entry) => entry.id === challenge.residentId && entry.name === challenge.residentName);
  if (town === undefined || building === undefined || resident === undefined) return null;
  const outcome = result?.outcome ?? null;
  return Object.freeze({
    phase: answering ? "room-result" : "room-challenge", commandId: source.commandId, tick: source.tick,
    heroId: challenge.heroId, heroName: state.hero.name, residentId: resident.id, residentName: resident.name,
    buildingId: building.id, buildingName: building.name, bookId: usefulReplyBook.id,
    challengeId: challenge.encounterId, classification: result?.classification ?? null,
    readingSourceCommandId: challenge.readingSourceCommandId,
    title: result === null ? "Let the room answer" : `${outcome!.charAt(0).toUpperCase()}${outcome!.slice(1)} · ${signedReparteeMomentum(result.delta)} counter`,
    call: challenge.claim, reply: result?.reply ?? null,
    marks: Object.freeze(result === null ? [] : [result.delta]), score: result?.delta ?? null,
    momentum: null, outcome, witness: null, encore: false,
    consequence: result === null ? `One answer. Victory: +1 town reputation, capped at ${challenge.reputationCap}.`
      : `Town reputation ${result.reputationBefore} → ${result.reputationAfter}${result.reputationAward === 1 ? " · +1, once only." : result.outcome === "victory" ? " · already at the cap." : " · no award."}`,
  });
}

/** The current command must own the receipt; revisiting town cannot replay a duel. */
export function projectReparteeScene(state: WorldState): ReparteeSceneView | null {
  if (["share-companion-credit", "farewell-companion"].includes(state.chronicle.at(-1)?.commandType ?? "")) return projectCompanionCreditScene(state);
  if (state.chronicle.at(-1)?.commandType === "reunite-companion") return projectCompanionReunionScene(state);
  if (["start-room-challenge", "answer-room-challenge"].includes(state.chronicle.at(-1)?.commandType ?? "")) return projectRoomChallengeScene(state);
  if (["read-useful-book", "practice-useful-reply"].includes(state.chronicle.at(-1)?.commandType ?? "")) return projectUsefulReplyScene(state);
  if (state.chronicle.at(-1)?.commandType === "recall-repartee") return projectReparteeMemory(state);
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
      for (const key of ["phase", "command", "book", "round", "momentum", "outcome", "hero", "resident", "witness", "reaction", "regard", "encore", "memorySource", "memoryLocation", "lesson", "classification", "readingSource", "challenge", "score", "reunion", "companion", "location", "credit", "choice", "creditRegard", "ovenReport"]) delete caption.dataset[key];
      return;
    }
    caption.dataset.phase = scene.phase;
    caption.dataset.command = scene.commandId;
    if (scene.bookId === null) delete caption.dataset.book;
    else caption.dataset.book = scene.bookId;
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
    delete caption.dataset.memorySource;
    delete caption.dataset.memoryLocation;
    delete caption.dataset.lesson;
    delete caption.dataset.classification;
    delete caption.dataset.readingSource;
    delete caption.dataset.challenge;
    delete caption.dataset.score;
    delete caption.dataset.reunion;
    delete caption.dataset.companion;
    delete caption.dataset.location;
    delete caption.dataset.credit;
    delete caption.dataset.choice;
    delete caption.dataset.creditRegard;
    delete caption.dataset.ovenReport;
    const title = doc.createElement("h2");
    title.textContent = scene.title;
    if ("creditId" in scene) {
      for (const key of ["round", "momentum", "outcome", "resident", "witness", "reaction", "regard", "encore"]) delete caption.dataset[key];
      caption.dataset.credit = scene.creditId;
      caption.dataset.companion = scene.companion.id;
      caption.dataset.location = scene.locationId;
      caption.dataset.choice = scene.choice;
      caption.dataset.creditRegard = `${scene.regardDelta > 0 ? "+" : ""}${scene.regardDelta}`;
      const children: HTMLElement[] = [title];
      if (scene.phase === "credit") {
        const heroLine = dialogue(scene.heroName, scene.call, "repartee-call credit-line");
        heroLine.dataset.speaker = scene.heroId;
        children.push(heroLine);
      }
      const companionLine = dialogue(scene.companion.name, scene.reply!, "repartee-reply credit-line");
      companionLine.dataset.speaker = scene.companion.id;
      children.push(companionLine, paragraph(scene.consequence, "repartee-note"));
      caption.replaceChildren(...children);
      return;
    }
    if (scene.phase === "reunion") {
      for (const key of ["round", "momentum", "outcome", "resident", "witness", "reaction", "regard", "encore"]) delete caption.dataset[key];
      caption.dataset.reunion = scene.reunionId;
      caption.dataset.companion = scene.companion.id;
      caption.dataset.location = scene.locationId;
      const heroLine = dialogue(scene.heroName, scene.call, "repartee-call reunion-line");
      heroLine.dataset.speaker = scene.heroId;
      const companionLine = dialogue(scene.companion.name, scene.reply!, "repartee-reply reunion-line");
      companionLine.dataset.speaker = scene.companion.id;
      const children = [title, heroLine, companionLine];
      if (scene.ovenReport !== undefined) {
        caption.dataset.ovenReport = scene.ovenReport.loafId;
        const reportLine = dialogue(scene.companion.name, scene.ovenReport.line, "reunion-oven-report");
        reportLine.dataset.speaker = scene.companion.id;
        reportLine.dataset.ovenReport = scene.ovenReport.loafId;
        reportLine.dataset.bakeEvent = scene.ovenReport.sourceCompletionEventId;
        reportLine.dataset.bakeSource = scene.ovenReport.sourceCompletionCommandId;
        reportLine.dataset.reportSource = scene.commandId;
        children.push(reportLine);
      }
      children.push(paragraph(scene.consequence, "repartee-note"));
      caption.replaceChildren(...children);
      return;
    }
    if ("challengeId" in scene) {
      for (const key of ["round", "momentum", "witness", "reaction", "regard", "encore"]) delete caption.dataset[key];
      caption.dataset.challenge = scene.challengeId;
      caption.dataset.classification = scene.classification ?? "pending";
      caption.dataset.readingSource = scene.readingSourceCommandId;
      if (scene.score !== null) {
        caption.dataset.score = String(scene.score);
        title.dataset.resultMarker = String(scene.score);
      }
      const children = [title, dialogue(scene.residentName!, scene.call, "repartee-call")];
      if (scene.reply !== null) children.push(dialogue(scene.heroName, scene.reply, "repartee-reply"));
      children.push(paragraph(scene.consequence, "repartee-note"));
      caption.replaceChildren(...children);
      return;
    }
    if ("lessonId" in scene) {
      for (const key of ["round", "momentum", "outcome", "witness", "reaction", "regard", "encore"]) delete caption.dataset[key];
      caption.dataset.lesson = scene.lessonId;
      caption.dataset.classification = scene.classification;
      caption.dataset.readingSource = scene.readingSourceCommandId;
      const children = [title, scene.phase === "lesson-reading"
        ? paragraph(`“${scene.call}”`, "repartee-call")
        : dialogue(scene.residentName!, scene.call, "repartee-call")];
      if (scene.reply !== null) children.push(dialogue(scene.heroName, scene.reply, "repartee-reply"));
      children.push(paragraph(scene.consequence, "repartee-note"));
      caption.replaceChildren(...children);
      return;
    }
    if (scene.phase === "memory") {
      caption.dataset.reaction = "remembered";
      caption.dataset.regard = String(scene.memory.regard);
      caption.dataset.outcome = "not-a-contest";
      caption.dataset.memorySource = scene.memory.sourceReactionCommandId;
      caption.dataset.memoryLocation = scene.memory.locationId;
      caption.replaceChildren(title, dialogue(scene.witness.name, scene.call, "repartee-witness"),
        paragraph(scene.consequence, "repartee-note"));
      return;
    }
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
    const key = `${state.campaignId}:${JSON.stringify(progress)}:${JSON.stringify(state.depth.reparteeWitness)}:${JSON.stringify(state.depth.reparteeCallback)}:${JSON.stringify(state.depth.usefulReply)}:${JSON.stringify(state.depth.roomChallenge)}`;
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
    const callback = state.depth.reparteeCallback;
    if (callback !== null && isValidCampaignReparteeCallback(state.depth)) {
      const restLocation = state.depth.atlas.locations.find((entry) => entry.id === callback.restLocationId);
      const line = dialogue(callback.witnessName, callback.line, "repartee-witness");
      line.dataset.witnessMemory = callback.sourceReactionId;
      line.dataset.command = callback.sourceCommandId;
      line.dataset.witness = callback.witnessId;
      line.dataset.memorySource = callback.sourceReactionCommandId;
      line.dataset.evidence = callback.evidenceSourceCommandId;
      line.dataset.location = callback.restLocationId;
      nodes.push(heading(`Remembered at ${restLocation?.name ?? callback.restLocationId}`), line,
        paragraph("One shared-road arrival memory. Regard, bond and resources were not changed; the earlier reaction was not awarded again."),
        paragraph(`Rest T${callback.tick} · Command ${callback.sourceCommandId}. Witness ${callback.witnessId}, joined T${callback.joinedTick}. Encounter ${callback.encounterId}.`, "journal-repartee-source"),
        paragraph(`Original reaction ${callback.sourceReactionId}: ${callback.sourceReactionCommandId}, T${callback.sourceReactionTick}. Remembered round ${callback.evidenceRoundIndex + 1}: ${callback.evidenceSourceCommandId}. Reading source: ${progress.reading?.sourceCommandId ?? "unavailable"}.`, "journal-repartee-source"));
    }
    const lesson = state.depth.usefulReply;
    if (lesson !== null && isValidCampaignUsefulReply(state.depth)) {
      const lessonTown = state.depth.towns[lesson.locationId];
      const lessonLocation = state.depth.atlas.locations.find((entry) => entry.id === lesson.locationId);
      const lessonBuilding = lessonTown?.buildings.find((entry) => entry.id === lesson.buildingId);
      const record = doc.createElement("details");
      record.dataset.usefulLesson = lesson.lessonId;
      const summary = doc.createElement("summary");
      summary.textContent = `${usefulReplyBook.title} · ${lesson.reply === null ? "read" : "unscored practice"}`;
      const learned = doc.createElement("div");
      learned.dataset.readingSource = lesson.reading.sourceCommandId;
      learned.append(paragraph(usefulReplyBook.excerpt), paragraph(
        `Learned “${usefulReplyBook.expression}”: ${usefulReplyBook.definition} Constructive frame: ${usefulReplyBook.frameId}.`,
      ), paragraph(`${state.hero.name} read the public copy at ${lessonBuilding?.name ?? lesson.buildingId}, ${lessonLocation?.name ?? lesson.locationId}, T${lesson.reading.tick}. Reading source: ${lesson.reading.sourceCommandId}. Content v${lesson.contentVersion}. Learned repertoire, not an inventory book.`, "journal-repartee-source"));
      record.append(summary, learned);
      if (lesson.reply !== null) {
        const reply = lesson.reply;
        const practice = doc.createElement("div");
        practice.dataset.replySource = reply.sourceCommandId;
        practice.dataset.classification = reply.classification;
        practice.append(heading(`${state.hero.name} & ${lesson.residentName} · unscored practice`),
          dialogue(lesson.residentName, reply.call, "repartee-call"), dialogue(state.hero.name, reply.reply, "repartee-reply"),
          paragraph(`${reply.classification} · ${reply.explanation}`),
          paragraph(`T${reply.tick} · Command: ${reply.sourceCommandId}. Reading source: ${reply.readingSourceCommandId ?? "starter response"}. Resident: ${lesson.residentId}. No score, reputation, regard, bond or resource award.`, "journal-repartee-source"));
        record.append(practice);
      } else record.append(paragraph("One constructive reply learned. The resident’s practice exchange is still to come; it is not a scored contest."));
      const choices = doc.createElement("details");
      const choiceSummary = doc.createElement("summary");
      choiceSummary.textContent = "Known replies and the reading that unlocked them";
      const list = doc.createElement("ul");
      for (const choice of usefulReplyResponses(lesson)) {
        const item = doc.createElement("li");
        item.dataset.response = choice.id;
        item.textContent = `${choice.id === lesson.reply?.responseId ? "Chosen: " : "Known: "}${choice.text} — ${choice.explanation} ${choice.expressionId === null ? "Starter response." : `Learned “${usefulReplyBook.expression}”; reading source: ${lesson.reading.sourceCommandId}.`}`;
        list.append(item);
      }
      choices.append(choiceSummary, list);
      record.append(choices);
      nodes.push(record);
    }
    const challenge = state.depth.roomChallenge;
    if (challenge !== null && isValidCampaignRoomChallenge(state.depth)) {
      const challengeTown = state.depth.towns[challenge.locationId];
      const challengeLocation = state.depth.atlas.locations.find((entry) => entry.id === challenge.locationId);
      const challengeBuilding = challengeTown?.buildings.find((entry) => entry.id === challenge.buildingId);
      const record = doc.createElement("details");
      record.dataset.roomChallenge = challenge.encounterId;
      const summary = doc.createElement("summary");
      summary.textContent = `Let the room answer · ${challenge.result?.outcome ?? "public challenge"}`;
      const admission = doc.createElement("div");
      admission.dataset.startSource = challenge.sourceCommandId;
      admission.append(heading(`${state.hero.name} & ${challenge.residentName} · one public claim`),
        dialogue(challenge.residentName, challenge.claim, "repartee-call"),
        paragraph(`One answer: a direct counter wins (+1); a concession draws (0); a claim-missing boast loses (-1). A victory awards +1 town reputation once, capped at ${challenge.reputationCap}; no other rewards.`),
        paragraph(`${challengeBuilding?.name ?? challenge.buildingId}, ${challengeLocation?.name ?? challenge.locationId} · T${challenge.startedTick}. Start source: ${challenge.sourceCommandId}. Resident: ${challenge.residentId}. Rules ${challenge.rulesVersion}; content v${challenge.contentVersion}.`, "journal-repartee-source"),
        paragraph(`Learned “${usefulReplyBook.expression}”, frame ${challenge.frameId}. Reading: ${challenge.readingSourceCommandId}, T${challenge.readingTick}. Practice: ${challenge.lessonSourceCommandId}, T${challenge.lessonTick}.`, "journal-repartee-source"),
        paragraph(`Earlier Bell completion: ${challenge.bellSourceCommandId}, T${challenge.bellTick}. This establishes the earlier adventure, not a claim that this resident witnessed it.`, "journal-repartee-source"));
      record.append(summary, admission);
      const result = challenge.result;
      if (result !== null) {
        const answer = doc.createElement("div");
        answer.dataset.answerSource = result.sourceCommandId;
        answer.dataset.classification = result.classification;
        answer.dataset.score = String(result.delta);
        answer.dataset.outcome = result.outcome;
        answer.append(dialogue(state.hero.name, result.reply, "repartee-reply"),
          paragraph(`${result.outcome} · ${signedReparteeMomentum(result.delta)} counter · ${result.explanation}`),
          paragraph(`Town reputation ${result.reputationBefore} → ${result.reputationAfter}; award ${signedReparteeMomentum(result.reputationAward)}, once only. HP, MP, gold, XP, quest state, bonds and regard unchanged.`),
          paragraph(`T${result.tick} · Answer source: ${result.sourceCommandId}. ${result.readingSourceCommandId === null ? "Starter response; no learned frame used." : `Reading source: ${result.readingSourceCommandId}. Expression: ${result.expressionId}; frame: ${result.frameId}.`}`, "journal-repartee-source"));
        record.append(answer);
      }
      const alternatives = doc.createElement("details");
      const alternativeSummary = doc.createElement("summary");
      alternativeSummary.textContent = "Known answers and their meaning";
      const list = doc.createElement("ul");
      for (const choice of roomChallengeResponses(state.depth)) {
        const item = doc.createElement("li");
        item.dataset.response = choice.id;
        item.textContent = `${choice.id === result?.responseId ? "Chosen: " : "Known: "}${choice.text} — ${signedReparteeMomentum(choice.delta)} counter; ${choice.explanation} ${choice.frameId === null ? "Starter response." : `Learned from ${challenge.readingSourceCommandId}.`}`;
        list.append(item);
      }
      alternatives.append(alternativeSummary, list);
      record.append(alternatives);
      nodes.push(record);
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
