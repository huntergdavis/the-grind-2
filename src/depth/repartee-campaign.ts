import { isValidReparteeProgress, readReparteeBook, reparteeBook, reparteeChallenges, reparteeResponses, resolveReparteeRound, startRepartee } from "./repartee";
import type { DepthCommand, DepthCommandCandidate, DepthState, TownBuilding, TownResident, TownState } from "./types";

type ReparteeCommand = Extract<DepthCommand, { type: "read-book" | "start-repartee" | "repartee-action" }>;
export interface ReparteeVenue { town: TownState; building: TownBuilding; resident: TownResident; encounterId: string }

function encounterId(actorId: string, locationId: string): string {
  return `repartee:${actorId}:${locationId}:first-contest`;
}

export function reparteeCommandId(tick: number, command: ReparteeCommand): string {
  const suffix = command.type === "read-book" ? `book:${command.bookId}:${command.locationId}:${command.buildingId}`
    : command.type === "start-repartee" ? `repartee:${command.encounterId}:start:${command.residentId}`
      : `repartee:${command.encounterId}:round:${command.roundIndex}:${command.responseId}`;
  return `depth:${tick}:${suffix}`;
}

/** One original book kept at an actual hall/inn; no new resident is invented. */
export function selectReparteeVenue(state: DepthState): ReparteeVenue | null {
  if (state.repartee.completed !== null || state.repartee.active !== null || state.hero.level < 2
    || state.quest.status !== "active" || state.pendingQuestReward !== null
    || state.atlas.route !== null || state.combat !== null || state.counterDuel !== null
    || state.dungeon !== null && !state.dungeon.completed || state.companions.active.length > 0
    || state.hero.resources.health * 2 <= state.hero.resources.maxHealth) return null;
  const locationId = state.atlas.currentLocationId;
  const town = state.towns[locationId];
  if (state.atlas.locations.find((location) => location.id === locationId)?.kind !== "town" || town === undefined || town.visits < 1
    || town.locationId !== locationId || !state.atlas.discoveredLocationIds.includes(locationId)) return null;
  const reading = state.repartee.reading;
  if (reading !== null && reading.locationId !== locationId) return null;
  const venues = town.buildings.filter((building) => (building.kind === "hall" || building.kind === "inn")
    && (reading === null || building.id === reading.buildingId)
    && town.districts.some((district) => district.id === building.districtId && district.buildingIds.includes(building.id)))
    .sort((a, b) => Number(a.kind !== "hall") - Number(b.kind !== "hall") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const building of venues) {
    const resident = town.residents.find((candidate) => candidate.homeBuildingId === building.id && building.residentIds.includes(candidate.id));
    if (resident !== undefined) return { town, building, resident, encounterId: encounterId(state.hero.id, locationId) };
  }
  return null;
}

function candidate(state: DepthState, command: ReparteeCommand, label: string): DepthCommandCandidate {
  return { id: reparteeCommandId(state.tick + 1, command), command, label, deciderId: state.hero.id };
}

export function reparteeCommandCandidates(state: DepthState): readonly DepthCommandCandidate[] | null {
  const active = state.repartee.active;
  if (active !== null) {
    return reparteeResponses(state.repartee).map((response) => candidate(state, {
      type: "repartee-action", encounterId: active.encounterId, roundIndex: active.roundIndex, responseId: response.id,
    }, response.text));
  }
  const venue = selectReparteeVenue(state);
  if (venue === null) return null;
  return state.repartee.reading === null
    ? [candidate(state, { type: "read-book", bookId: reparteeBook.id, locationId: venue.town.locationId, buildingId: venue.building.id }, `read ${reparteeBook.title} at ${venue.building.name}`)]
    : [candidate(state, { type: "start-repartee", encounterId: venue.encounterId, residentId: venue.resident.id, locationId: venue.town.locationId, buildingId: venue.building.id }, `trade words with ${venue.resident.name}`)];
}

export function stepCampaignRepartee(input: DepthState, command: ReparteeCommand): {
  repartee: DepthState["repartee"]; towns: DepthState["towns"]; message: string;
} {
  const tick = input.tick + 1;
  const sourceCommandId = reparteeCommandId(tick, command);
  if (command.type === "read-book" || command.type === "start-repartee") {
    const venue = selectReparteeVenue(input);
    if (venue === null || venue.town.locationId !== command.locationId || venue.building.id !== command.buildingId) throw new Error("No matching safe-town book or contest");
    const context = { actorId: input.hero.id, locationId: command.locationId, buildingId: command.buildingId, sourceCommandId, tick };
    if (command.type === "read-book") {
      if (command.bookId !== reparteeBook.id) throw new Error("Unknown book");
      const repartee = readReparteeBook(input.repartee, context);
      if (repartee === input.repartee) throw new Error("The book has already been read or its source is invalid");
      return { repartee, towns: input.towns, message: `${input.hero.name} reads ${reparteeBook.title} at ${venue.building.name}. ${reparteeBook.excerpt} Learned 12 expressions and two ways to answer a claim; no XP or reputation awarded.` };
    }
    if (command.encounterId !== venue.encounterId || command.residentId !== venue.resident.id) throw new Error("Contest does not match its resident and venue");
    const repartee = startRepartee(input.repartee, { ...context, encounterId: command.encounterId, residentId: command.residentId });
    if (repartee === input.repartee) throw new Error("Contest cannot be started again");
    return { repartee, towns: input.towns, message: `${venue.resident.name} offers ${input.hero.name} a three-round flyting contest. Victory earns one town reputation, capped at 100; other outcomes earn none. No HP, MP, gold or XP is at stake. “${reparteeChallenges[0]!.text}”` };
  }
  const active = input.repartee.active;
  if (active === null || input.atlas.currentLocationId !== active.locationId) throw new Error("No active contest at this location");
  const town = input.towns[active.locationId];
  if (town === undefined) throw new Error("Contest town is missing");
  const repartee = resolveReparteeRound(input.repartee, { ...command, sourceCommandId, tick, reputationBefore: town.reputation, reputationCap: 100 });
  if (repartee === input.repartee) throw new Error("Stale, unknown or repeated repartee response");
  const settled = repartee.completed;
  const round = (repartee.active ?? settled)!.rounds.at(-1);
  const resident = town.residents.find((entry) => entry.id === active.residentId)!;
  const exchange = command.responseId === "retreat" ? `${input.hero.name} concedes the contest to ${resident.name}.`
    : `${resident.name}: “${round!.call}” ${input.hero.name}: “${round!.reply}” ${round!.explanation} Momentum ${round!.momentum > 0 ? "+" : ""}${round!.momentum}.`;
  return { repartee,
    towns: settled === null ? input.towns : { ...input.towns, [town.locationId]: { ...town, reputation: settled.reputationAfter } },
    message: settled === null ? exchange : `${exchange} ${settled.outcome.toUpperCase()} — ${town.name} reputation ${settled.reputationBefore}→${settled.reputationAfter}. The one-time contest is complete.`,
  };
}

/** Cross-check saved episode provenance against this campaign's retained town identities. */
export function isValidCampaignRepartee(state: DepthState): boolean {
  try {
    const progress = state.repartee;
    if (!isValidReparteeProgress(progress)) return false;
    if (progress.reading === null) return progress.active === null && progress.completed === null;
    const reading = progress.reading;
    const town = state.towns[reading.locationId];
    const building = town?.buildings.find((entry) => entry.id === reading.buildingId);
    if (reading.actorId !== state.hero.id || reading.tick > state.tick || building === undefined || town === undefined
      || town.locationId !== reading.locationId || town.visits < 1
      || !state.atlas.discoveredLocationIds.includes(reading.locationId)
      || state.atlas.locations.find((location) => location.id === reading.locationId)?.kind !== "town"
      || !town.districts.some((district) => district.id === building.districtId && district.buildingIds.includes(building.id))
      || !["hall", "inn"].includes(building.kind)
      || reading.sourceCommandId !== reparteeCommandId(reading.tick, { type: "read-book", bookId: reading.bookId, locationId: reading.locationId, buildingId: reading.buildingId })) return false;
    const duel = progress.active ?? progress.completed;
    if (duel === null) return true;
    const resident = town!.residents.find((entry) => entry.id === duel.residentId);
    if (duel.startedTick > state.tick || resident?.homeBuildingId !== building.id || !building.residentIds.includes(duel.residentId)
      || duel.encounterId !== encounterId(state.hero.id, reading.locationId)
      || duel.sourceCommandId !== reparteeCommandId(duel.startedTick, { type: "start-repartee", encounterId: duel.encounterId, residentId: duel.residentId, locationId: duel.locationId, buildingId: duel.buildingId })) return false;
    for (const round of duel.rounds) if (round.tick > state.tick || round.sourceCommandId !== reparteeCommandId(round.tick, {
      type: "repartee-action", encounterId: duel.encounterId, roundIndex: round.roundIndex, responseId: round.responseId,
    })) return false;
    if (progress.active !== null && (state.atlas.currentLocationId !== duel.locationId || state.atlas.route !== null
      || state.combat !== null || state.counterDuel !== null || state.companions.active.length > 0
      || state.dungeon !== null && !state.dungeon.completed || state.pendingQuestReward !== null)) return false;
    const completed = progress.completed;
    if (completed !== null && (completed.completedTick > state.tick || completed.reputationCap !== 100
      || completed.completedTick === state.tick && town!.reputation !== completed.reputationAfter
      || completed.outcome === "retreat" && completed.completionCommandId !== reparteeCommandId(completed.completedTick, {
        type: "repartee-action", encounterId: completed.encounterId, roundIndex: completed.roundIndex, responseId: "retreat",
      }))) return false;
    return true;
  } catch { return false; }
}
