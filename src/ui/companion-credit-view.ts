import type { WorldState } from "../core/types";
import { isValidCampaignCompanionCredit, type CompanionCredit } from "../depth/companion-credit";
import type { ReparteeContestSceneView } from "./repartee-view";

export interface CompanionCreditSceneView extends Omit<ReparteeContestSceneView, "phase" | "buildingId" | "buildingName" | "bookId" | "momentum"> {
  readonly phase: "credit" | "credit-farewell";
  readonly creditId: string;
  readonly choice: "acknowledge" | "claim-credit";
  readonly regardDelta: 1 | -1;
  readonly evidenceId: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly venue: "road" | "threshold" | "outdoors";
  readonly companion: { readonly id: string; readonly name: string; readonly role: string; readonly joinedTick: number };
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

/** History alone cannot summon a contributor or replay their later parting words. */
export function projectCompanionCreditScene(state: WorldState): CompanionCreditSceneView | null {
  const credit = state.depth.companionCredit, source = state.chronicle.at(-1);
  if (credit == null || credit.exchange === null || !isValidCampaignCompanionCredit(state.depth)
    || source?.tick !== state.tick || state.depth.tick !== state.tick
    || state.hero.id !== credit.heroId || state.depth.hero.id !== credit.heroId
    || state.scene.mode !== "chronicle" || source.mode !== "chronicle") return null;
  const farewell = source.commandType === "farewell-companion" ? credit.farewell : null;
  const phase = farewell === null ? "credit" : "credit-farewell";
  const event = farewell ?? credit.exchange;
  if (event.tick !== state.tick || source.commandId !== `${state.campaignId}:${event.sourceCommandId}`
    || (phase === "credit" && source.commandType !== "share-companion-credit")) return null;
  const active = state.depth.companions.active.find((entry) => entry.identity.residentId === credit.residentId
    && entry.joinedTick === credit.joinedTick);
  const former = state.depth.companions.former.find((entry) => entry.identity.residentId === credit.residentId
    && entry.joinedTick === credit.joinedTick && entry.departure.tick === state.tick
    && entry.departure.outcome === "fulfilled");
  const companion = phase === "credit" ? active : former;
  if (companion === undefined || companion.identity.name !== credit.companionName
    || companion.injury !== "none" || companion.resources.health <= 0 || state.depth.hero.resources.health <= 0
    || state.depth.combat !== null || state.depth.dungeon !== null && !state.depth.dungeon.completed
    || (phase === "credit" && state.depth.atlas.currentLocationId !== credit.locationId)
    || (phase === "credit-farewell" && (state.depth.companions.active.length !== 0
      || state.depth.atlas.route !== null || former?.departure.locationId !== state.depth.atlas.currentLocationId))) return null;
  const location = state.depth.atlas.locations.find((entry) => entry.id === state.depth.atlas.currentLocationId);
  if (location === undefined || !state.depth.atlas.discoveredLocationIds.includes(location.id)) return null;
  const route = state.depth.atlas.route;
  const routeNames = route === null ? null : [route.path[route.legIndex], route.path[route.legIndex + 1]]
    .map((id) => state.depth.atlas.locations.find((entry) => entry.id === id)?.name);
  const locationName = routeNames?.every((name) => name !== undefined) === true
    ? `${routeNames[0]} → ${routeNames[1]}` : location.name;
  return Object.freeze({
    phase, creditId: credit.exchange.sourceCommandId, commandId: source.commandId, tick: state.tick,
    choice: credit.exchange.choice, regardDelta: credit.exchange.regardDelta,
    evidenceId: credit.evidence.damageEventId, heroId: credit.heroId, heroName: state.hero.name,
    companion: Object.freeze({ id: companion.identity.residentId, name: companion.identity.name,
      role: companion.identity.role, joinedTick: companion.joinedTick }),
    locationId: location.id, locationName,
    venue: phase === "credit-farewell" || route === null && location.kind === "town" ? "threshold" : route === null ? "outdoors" : "road",
    buildingId: null, buildingName: null, bookId: null, residentId: null, residentName: null,
    title: phase === "credit" ? "Share the credit" : `Parting words · ${location.name}`,
    call: phase === "credit" ? credit.exchange.heroLine : "",
    reply: farewell?.line ?? credit.exchange.companionLine,
    marks: Object.freeze([]) as readonly [], momentum: null, outcome: null, witness: null, encore: false,
    consequence: phase === "credit" ? `${locationName} · Two people, one victory.` : "The road ends; the words remain.",
  });
}

/** One earned conduct record moves with its actual oath from active to former Company. */
export function projectCompanionCreditHistory(state: WorldState, residentId: string, joinedTick: number): CompanionCredit | null {
  const credit = state.depth.companionCredit;
  if (credit == null || credit.exchange === null || credit.residentId !== residentId || credit.joinedTick !== joinedTick
    || !isValidCampaignCompanionCredit(state.depth)) return null;
  return credit;
}

export function createCompanionCreditRecord(doc: Document, state: WorldState, residentId: string, joinedTick: number): HTMLDetailsElement | null {
  const credit = projectCompanionCreditHistory(state, residentId, joinedTick);
  if (credit === null || credit.exchange === null) return null;
  const exchange = credit.exchange, evidence = credit.evidence;
  const damage = evidence.combat.eventStream.events.find((event) => event.id === evidence.damageEventId && event.kind === "damage");
  if (damage?.kind !== "damage") return null;
  const target = evidence.combat.combatants.find((entry) => entry.id === damage.targetId);
  const record = doc.createElement("details");
  record.className = "company-history";
  Object.assign(record.dataset, { campaign: state.campaignId, companionCredit: exchange.sourceCommandId,
    command: exchange.sourceCommandId, companion: credit.residentId, joinedTick: String(credit.joinedTick),
    choice: exchange.choice, regard: `${exchange.regardDelta > 0 ? "+" : ""}${exchange.regardDelta}` });
  const summary = doc.createElement("summary");
  summary.textContent = `Share the credit · T${exchange.tick}`;
  function paragraph(text: string, source = false): HTMLElement {
    const node = doc.createElement(source ? "small" : "p");
    node.textContent = text;
    if (source) node.className = "journal-credit-source";
    return node;
  }
  function line(id: string, name: string, text: string): HTMLElement {
    const node = paragraph("");
    node.className = "credit-line";
    node.dataset.speaker = id;
    const speaker = doc.createElement("strong");
    speaker.textContent = `${name}: `;
    node.append(speaker, doc.createTextNode(text));
    return node;
  }
  record.append(summary, line(credit.heroId, state.hero.name, exchange.heroLine),
    line(credit.residentId, credit.companionName, exchange.companionLine),
    paragraph(`Declared preference: fair credit (${credit.preference}). ${credit.companionName} → ${state.hero.name}: ${record.dataset.regard} regard for this conduct. This separate judgment is not combat bond or a cumulative relationship score.`),
    paragraph(`${credit.companionName} dealt ${damage.amount} damage to ${target?.name ?? damage.targetId}, HP ${damage.healthBefore} → ${damage.healthAfter}, during the recorded shared victory. Battle rewards and bond are unchanged by this exchange.`),
    paragraph(`Battle: ${evidence.combat.id}. Damage event: ${evidence.damageEventId}. Victory event: ${evidence.outcomeEventId}. Completion T${evidence.tick}: ${evidence.sourceCommandId}.`, true),
    paragraph(`Exchange T${exchange.tick}: ${exchange.sourceCommandId}. Companion ${credit.residentId}, oath joined T${credit.joinedTick}. Rules ${credit.rulesVersion}.`, true));
  if (credit.farewell !== null) record.append(line(credit.residentId, credit.companionName, credit.farewell.line),
    paragraph(`Remembered at the actual farewell T${credit.farewell.tick}: ${credit.farewell.sourceCommandId}. Source exchange: ${exchange.sourceCommandId}.`, true));
  return record;
}
