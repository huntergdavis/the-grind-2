import type { WorldState } from "../core/types";
import { isValidCampaignCompanionReunion } from "../depth/companion-reunion";
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
    || reunion.heroId !== state.depth.hero.id || reunion.locationId !== state.depth.atlas.currentLocationId
    || state.depth.atlas.route !== null || state.depth.companions.active.length !== 0) return null;
  const former = state.depth.companions.former.find((entry) => entry.identity.residentId === reunion.residentId
    && entry.joinedTick === reunion.joinedTick && entry.identity.name === reunion.companionName
    && entry.departure.tick === reunion.departureTick && entry.departure.locationId === reunion.locationId
    && entry.departure.outcome === "fulfilled" && entry.injury === "none" && entry.resources.health > 0);
  const location = state.depth.atlas.locations.find((entry) => entry.id === reunion.locationId && entry.kind === "town");
  if (former === undefined || location === undefined || !state.depth.atlas.discoveredLocationIds.includes(location.id)) return null;
  return Object.freeze({
    phase: "reunion", reunionId: reunion.completed.sourceCommandId,
    commandId: source.commandId, tick: source.tick, heroId: reunion.heroId, heroName: state.hero.name,
    companion: Object.freeze({ id: former.identity.residentId, name: former.identity.name, role: former.identity.role, joinedTick: former.joinedTick }),
    locationId: location.id, locationName: location.name,
    arrivalSourceCommandId: reunion.arrival.sourceCommandId, arrivalTick: reunion.arrival.tick,
    departureTick: reunion.departureTick, sharedVictories: reunion.sharedVictories,
    buildingId: null, buildingName: null, bookId: null, residentId: null, residentName: null,
    title: `A familiar face · ${location.name}`, call: reunion.completed.heroLine, reply: reunion.completed.companionLine,
    marks: Object.freeze([]) as readonly [], momentum: null, outcome: null, witness: null, encore: false,
    consequence: "Two roads cross again.",
  });
}

/** Historical Company record; retained after the hero leaves, without summoning a stage actor. */
export function createCompanionReunionRecord(doc: Document, state: WorldState, residentId: string, joinedTick: number): HTMLDetailsElement | null {
  const reunion = state.depth.companionReunion;
  if (reunion === null || reunion.completed === null || reunion.residentId !== residentId || reunion.joinedTick !== joinedTick
    || !isValidCampaignCompanionReunion(state.depth)) return null;
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
  summary.textContent = `A familiar face · ${location?.name ?? reunion.locationId} · T${reunion.completed.tick}`;
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
  return record;
}
