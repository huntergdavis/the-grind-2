import type { ChronicleEntry, WorldState } from "../core/types";
import { isValidCampaignElsewhereLoaf } from "../depth/elsewhere-loaf";

export interface ElsewhereLoafPacket {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly tick: number;
  readonly campaignId: string;
  readonly triggerCommandId: string;
  readonly sourceCommandId: string;
  readonly loafId: string;
  readonly phase: "admission" | "completion";
  readonly residentId: string;
  readonly companionName: string;
  readonly role: "baker";
  readonly joinedTick: number;
  readonly locationId: string;
  readonly locationName: string;
  readonly innId: string;
  readonly innName: string;
  readonly heroLocationId: string;
  readonly presenceRule: "retained-farewell-inn-worksite-v1";
  readonly supplyRule: "inn-trial-dough-v1";
  readonly style: "steady" | "experimental";
  readonly doughQuantity: 0 | 1;
  readonly productQuantity: 0 | 1;
  readonly product: "dough" | "plain-loaf" | "unexpected-delight" | "bricklike-loaf";
  readonly line: string;
  readonly outcome?: "plain-loaf" | "unexpected-delight" | "bricklike-loaf";
}

const packetKeys = ["schemaVersion", "eventId", "tick", "campaignId", "triggerCommandId", "sourceCommandId", "loafId", "phase",
  "residentId", "companionName", "role", "joinedTick", "locationId", "locationName", "innId", "innName", "heroLocationId",
  "presenceRule", "supplyRule", "style", "doughQuantity", "productQuantity", "product", "line"];

/** Strict public envelope: even an otherwise valid packet cannot carry a private oven roll. */
export function isElsewhereLoafPacket(value: unknown): value is ElsewhereLoafPacket {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  const keys = p.phase === "completion" ? [...packetKeys, "outcome"] : packetKeys;
  if (Object.keys(p).sort().join("|") !== [...keys].sort().join("|")) return false;
  const textFields = keys.filter(key => !["schemaVersion", "tick", "joinedTick", "doughQuantity", "productQuantity"].includes(key));
  return p.schemaVersion === 1 && Number.isSafeInteger(p.tick) && (p.tick as number) > 0
    && Number.isSafeInteger(p.joinedTick) && (p.joinedTick as number) > 0 && (p.joinedTick as number) < (p.tick as number)
    && textFields.every(key => typeof p[key] === "string" && (p[key] as string).length > 0 && (p[key] as string).length <= 1_000)
    && p.sourceCommandId === `${p.campaignId}:${p.triggerCommandId}`
    && (p.eventId as string).startsWith(`${p.campaignId}:`) && p.role === "baker"
    && p.presenceRule === "retained-farewell-inn-worksite-v1" && p.supplyRule === "inn-trial-dough-v1"
    && p.heroLocationId !== p.locationId && ["steady", "experimental"].includes(p.style as string)
    && (p.phase === "admission" ? p.doughQuantity === 1 && p.productQuantity === 0 && p.product === "dough"
      : p.phase === "completion" && p.doughQuantity === 0 && p.productQuantity === 1
        && ["plain-loaf", "unexpected-delight", "bricklike-loaf"].includes(p.outcome as string) && p.product === p.outcome);
}

/** Only retained, validated NPC facts enter the camera; the hero's scene remains separate. */
export function projectElsewhereLoafPacket(state: WorldState, phase: ElsewhereLoafPacket["phase"]): ElsewhereLoafPacket | null {
  const loaf = state.depth.elsewhereLoaf;
  if (loaf == null || state.hero.id !== state.depth.hero.id || state.tick !== state.depth.tick
    || !isValidCampaignElsewhereLoaf(state.depth)) return null;
  const event = phase === "admission" ? loaf.admission : loaf.completion;
  if (event === null) return null;
  const source = state.chronicle.find(entry => entry.tick === event.tick
    && entry.commandId === `${state.campaignId}:${event.triggerCommandId}`);
  const location = state.depth.atlas.locations.find(entry => entry.id === loaf.locationId && entry.kind === "town");
  if (source === undefined || location === undefined) return null;
  const completed = phase === "completion" ? loaf.completion! : null;
  const packet: ElsewhereLoafPacket = Object.freeze({ schemaVersion: 1,
    eventId: `${state.campaignId}:${event.eventId}`, tick: event.tick, campaignId: state.campaignId,
    triggerCommandId: event.triggerCommandId, sourceCommandId: source.commandId!, loafId: loaf.id, phase,
    residentId: loaf.residentId, companionName: loaf.companionName, role: loaf.role, joinedTick: loaf.joinedTick,
    locationId: location.id, locationName: location.name, innId: loaf.innId, innName: loaf.innName,
    heroLocationId: event.heroLocationId, presenceRule: loaf.presenceRule, supplyRule: loaf.supplyRule,
    style: loaf.admission.style, doughQuantity: completed === null ? 1 : 0,
    productQuantity: completed === null ? 0 : 1, product: completed?.outcome ?? "dough", line: event.line,
    ...(completed === null ? {} : { outcome: completed.outcome }) });
  return isElsewhereLoafPacket(packet) ? packet : null;
}

export function projectElsewhereLoafTransition(before: WorldState, after: WorldState, source: ChronicleEntry): ElsewhereLoafPacket | null {
  if (before.campaignId !== after.campaignId || before.hero.id !== after.hero.id || after.tick !== before.tick + 1
    || source.id !== after.chronicle.at(-1)?.id || source.tick !== after.tick
    || source.commandId !== after.chronicle.at(-1)?.commandId) return null;
  const loaf = after.depth.elsewhereLoaf;
  const phase = loaf?.completion?.tick === after.tick && before.depth.elsewhereLoaf?.completion == null ? "completion"
    : loaf?.admission.tick === after.tick && before.depth.elsewhereLoaf == null ? "admission" : null;
  if (phase === null) return null;
  const packet = projectElsewhereLoafPacket(after, phase);
  return packet?.sourceCommandId === source.commandId ? packet : null;
}

export function elsewhereLoafTitle(packet: ElsewhereLoafPacket, currentTick: number): string {
  return `${currentTick > packet.tick ? "Earlier, elsewhere" : "Elsewhere"} · ${packet.locationName}`;
}

export function createElsewhereLoafRecord(doc: Document, state: WorldState, residentId: string, joinedTick: number): HTMLDetailsElement | null {
  const loaf = state.depth.elsewhereLoaf;
  if (loaf == null || loaf.residentId !== residentId || loaf.joinedTick !== joinedTick
    || state.hero.id !== state.depth.hero.id || !isValidCampaignElsewhereLoaf(state.depth)) return null;
  const place = state.depth.atlas.locations.find(entry => entry.id === loaf.locationId)?.name ?? loaf.locationId;
  const details = doc.createElement("details"); details.className = "company-history";
  Object.assign(details.dataset, { elsewhereLoaf: loaf.id, campaign: state.campaignId, companion: residentId,
    joinedTick: String(joinedTick), admissionEvent: loaf.admission.eventId,
    admissionSource: loaf.admission.triggerCommandId, ...(loaf.completion === null ? {} : {
      completionEvent: loaf.completion.eventId, completionSource: loaf.completion.triggerCommandId }) });
  const summary = doc.createElement("summary"); summary.textContent = `Elsewhere · ${loaf.innName}, ${place}`;
  details.append(summary);
  for (const [phase, event] of [["admission", loaf.admission], ["completion", loaf.completion]] as const) {
    if (event === null) continue;
    const line = doc.createElement("p"); line.dataset.loafPhase = phase;
    line.textContent = `${loaf.companionName}: ${event.line}`;
    const source = doc.createElement("small"); source.className = "journal-elsewhere-source";
    source.textContent = `T${event.tick} · NPC event ${event.eventId} · Hero command ${event.triggerCommandId} at ${event.heroLocationId}.`;
    details.append(line, source);
  }
  const truth = doc.createElement("small"); truth.className = "journal-elsewhere-source";
  truth.textContent = `Inn-supplied trial dough: ${loaf.completion === null ? "1 remaining; not yet baked" : `1→0; one ${loaf.completion.outcome}`}. Oath joined T${loaf.joinedTick}; farewell T${loaf.departureTick}. ${loaf.presenceRule}; ${loaf.supplyRule}. Observed elsewhere, not learned by the absent hero; no hero food, resources or reward.`;
  details.append(truth); return details;
}
