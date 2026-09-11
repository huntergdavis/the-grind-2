import type { WorldState } from "../core/types";
import { isValidCampaignCompanionReunion, type CompanionReunionMemory, type CompanionReunionOvenReport } from "../depth/companion-reunion";
import type { ReparteeContestSceneView } from "./repartee-view";

export interface CompanionReunionSceneView extends Omit<ReparteeContestSceneView, "phase" | "buildingId" | "buildingName" | "bookId" | "momentum"> {
  readonly phase: "reunion";
  readonly reunionId: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly companion: { readonly id: string; readonly name: string; readonly role: string; readonly joinedTick: number };
  readonly arrivalSourceCommandId: string;
  readonly arrivalTick: number;
  readonly departureTick: number;
  readonly sharedVictories: number;
  readonly memory?: Readonly<CompanionReunionMemory>;
  readonly ovenReport?: Readonly<CompanionReunionOvenReport>;
  readonly buildingId: null;
  readonly buildingName: null;
  readonly bookId: null;
  readonly residentId: null;
  readonly residentName: null;
  readonly marks: readonly [];
  readonly momentum: null;
  readonly outcome: null;
  readonly witness: null;
  readonly encore: false;
}

/** A retained arrival is not a spoken reunion. Only the completed current command owns this stage. */
export function projectCompanionReunionScene(state: WorldState): CompanionReunionSceneView | null {
  const reunion = state.depth.companionReunion, source = state.chronicle.at(-1);
  if (reunion === null || reunion.completed === null || !isValidCampaignCompanionReunion(state.depth)
    || source?.commandType !== "reunite-companion" || source.tick !== state.tick || state.depth.tick !== state.tick
    || reunion.completed.tick !== state.tick || source.commandId !== `${state.campaignId}:${reunion.completed.sourceCommandId}`
    || source.mode !== "chronicle" || state.scene.mode !== "chronicle"
    || state.hero.id !== state.depth.hero.id || reunion.heroId !== state.depth.hero.id
    || (["location", "headline", "action", "goal", "consequence", "sensoryIntensity"] as const)
      .some((key) => state.scene[key] !== source[key])
    || reunion.locationId !== state.depth.atlas.currentLocationId
    || state.depth.atlas.route !== null || state.depth.companions.active.length !== 0) return null;
  const former = state.depth.companions.former.find((entry) => entry.identity.residentId === reunion.residentId
    && entry.joinedTick === reunion.joinedTick && entry.identity.name === reunion.companionName
    && entry.departure.tick === reunion.departureTick && entry.departure.locationId === reunion.locationId
    && entry.departure.outcome === "fulfilled" && entry.injury === "none" && entry.resources.health > 0);
  const location = state.depth.atlas.locations.find((entry) => entry.id === reunion.locationId && entry.kind === "town");
  if (former === undefined || location === undefined || !state.depth.atlas.discoveredLocationIds.includes(location.id)) return null;
  const memory = reunion.completed.memory;
  const ovenReport = reunion.completed.ovenReport;
  return Object.freeze({
    phase: "reunion", reunionId: reunion.completed.sourceCommandId,
    commandId: source.commandId, tick: source.tick, heroId: reunion.heroId, heroName: state.hero.name,
    companion: Object.freeze({ id: former.identity.residentId, name: former.identity.name, role: former.identity.role, joinedTick: former.joinedTick }),
    locationId: location.id, locationName: location.name,
    arrivalSourceCommandId: reunion.arrival.sourceCommandId, arrivalTick: reunion.arrival.tick,
    departureTick: reunion.departureTick, sharedVictories: reunion.sharedVictories,
    ...(memory === undefined ? {} : { memory: Object.freeze({ ...memory }) }),
    ...(ovenReport === undefined ? {} : { ovenReport: Object.freeze({
      schemaVersion: ovenReport.schemaVersion, rulesVersion: ovenReport.rulesVersion,
      loafId: ovenReport.loafId, sourceCompletionEventId: ovenReport.sourceCompletionEventId,
      sourceCompletionCommandId: ovenReport.sourceCompletionCommandId,
      sourceCompletionTick: ovenReport.sourceCompletionTick, outcome: ovenReport.outcome, line: ovenReport.line,
    }) }),
    buildingId: null, buildingName: null, bookId: null, residentId: null, residentName: null,
    title: `${memory === undefined ? "A familiar face" : "An old line returns"} · ${location.name}`,
    call: reunion.completed.heroLine, reply: reunion.completed.companionLine,
    marks: Object.freeze([]) as readonly [], momentum: null, outcome: null, witness: null, encore: false,
    consequence: memory === undefined ? "Two roads cross again." : "Some words travel with you.",
  });
}

/** Historical Company record; retained after the hero leaves, without summoning a stage actor. */
export function createCompanionReunionRecord(doc: Document, state: WorldState, residentId: string, joinedTick: number): HTMLDetailsElement | null {
  const reunion = state.depth.companionReunion;
  if (reunion === null || reunion.completed === null || reunion.residentId !== residentId || reunion.joinedTick !== joinedTick
    || state.hero.id !== state.depth.hero.id || !isValidCampaignCompanionReunion(state.depth)) return null;
  const memory = reunion.completed.memory;
  const ovenReport = reunion.completed.ovenReport;
  const location = state.depth.atlas.locations.find((entry) => entry.id === reunion.locationId);
  const sourceLocation = state.depth.atlas.locations.find((entry) => entry.id === reunion.arrival.sourceLocationId);
  const record = doc.createElement("details");
  record.className = "company-history";
  record.dataset.campaign = state.campaignId;
  record.dataset.companionReunion = reunion.completed.sourceCommandId;
  record.dataset.command = reunion.completed.sourceCommandId;
  record.dataset.companion = reunion.residentId;
  record.dataset.joinedTick = String(reunion.joinedTick);
  record.dataset.location = reunion.locationId;
  record.dataset.arrivalSource = reunion.arrival.sourceCommandId;
  const summary = doc.createElement("summary");
  summary.textContent = `${memory === undefined ? "A familiar face" : "An old line returns"} · ${location?.name ?? reunion.locationId} · T${reunion.completed.tick}`;
  function paragraph(text: string, source = false): HTMLElement {
    const node = doc.createElement(source ? "small" : "p");
    node.textContent = text;
    if (source) node.className = "journal-reunion-source";
    return node;
  }
  function line(id: string, name: string, text: string): HTMLElement {
    const node = paragraph("");
    node.className = "reunion-line";
    node.dataset.speaker = id;
    const speaker = doc.createElement("strong");
    speaker.textContent = `${name}: `;
    node.append(speaker, doc.createTextNode(text));
    return node;
  }
  record.append(summary, line(reunion.heroId, state.hero.name, reunion.completed.heroLine),
    line(reunion.residentId, reunion.companionName, reunion.completed.companionLine),
    paragraph(`Fulfilled oath: joined T${reunion.joinedTick}, farewell T${reunion.departureTick} at ${location?.name ?? reunion.locationId}. ${reunion.sharedVictories} shared ${reunion.sharedVictories === 1 ? "victory" : "victories"}. The former companion remains a former companion; bond, regard and resources unchanged.`),
    paragraph(`Actual return from ${sourceLocation?.name ?? reunion.arrival.sourceLocationId}, T${reunion.arrival.tick}. Arrival source: ${reunion.arrival.sourceCommandId}. Route: ${reunion.arrival.route.path.join(" → ")}; committed travel distance ${reunion.arrival.distance}.`, true),
    paragraph(`Reunion T${reunion.completed.tick} · Command: ${reunion.completed.sourceCommandId}. Resident: ${reunion.residentId}; oath joined T${reunion.joinedTick}. Rules ${reunion.rulesVersion}; presence ${reunion.presenceRule}. This is the recorded farewell town, not an invented journey home.`, true));
  if (memory !== undefined) {
    record.dataset.memoryRule = memory.rulesVersion;
    record.dataset.memoryReaction = memory.sourceReactionCommandId;
    record.dataset.memoryEvidence = memory.evidenceSourceCommandId;
    record.dataset.memoryRegard = String(memory.regardAfter);
    const remembered = paragraph(`Remembered reply: “${memory.rememberedReply}”`);
    remembered.className = "journal-reunion-memory";
    record.append(remembered,
      paragraph(`Original witnessed opinion, unchanged: ${memory.pose}; regard ${memory.regardAfter > 0 ? "+" : ""}${memory.regardAfter}. Original contest outcome: ${memory.outcome}. No new contest, regard or reward.`),
      paragraph(`Witness ${memory.witnessId}, oath joined T${memory.joinedTick}, hero ${memory.heroId}. Encounter ${memory.encounterId}. Reaction ${memory.sourceReactionId} at T${memory.sourceReactionTick}: ${memory.sourceReactionCommandId}. Exact reply source: ${memory.evidenceSourceCommandId}; round index ${memory.evidenceRoundIndex}. Memory rules ${memory.rulesVersion}.`, true));
  }
  if (ovenReport !== undefined) {
    record.dataset.ovenReport = ovenReport.loafId;
    record.dataset.bakeEvent = ovenReport.sourceCompletionEventId;
    record.dataset.bakeSource = ovenReport.sourceCompletionCommandId;
    record.dataset.reportSource = reunion.completed.sourceCommandId;
    const reportLine = line(reunion.residentId, reunion.companionName, ovenReport.line);
    reportLine.classList.add("reunion-oven-report");
    reportLine.dataset.ovenReport = ovenReport.loafId;
    record.append(reportLine,
      paragraph(`Bake completed T${ovenReport.sourceCompletionTick}: ${ovenReport.outcome}. NPC event: ${ovenReport.sourceCompletionEventId}. Trigger command: ${ovenReport.sourceCompletionCommandId}.`, true),
      paragraph(`Reported at reunion T${reunion.completed.tick}: ${reunion.completed.sourceCommandId}. Report rules ${ovenReport.rulesVersion}. This is news of the recorded bake, not bread delivered or a new reward.`, true));
  }
  return record;
}
