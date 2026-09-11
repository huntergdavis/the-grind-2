import { isValidReparteeProgress, readReparteeBook, reparteeBook, reparteeChallenges, reparteeResponses, resolveReparteeRound, startRepartee } from "./repartee";
import { createReparteeWitnessReaction, declareReparteeWitnessPreference, isValidReparteeWitnessPreference, isValidReparteeWitnessReaction } from "./repartee-witness";
import type { DepthCommand, DepthCommandCandidate, DepthState, TownBuilding, TownResident, TownState } from "./types";

type ReparteeCommand = Extract<DepthCommand, { type: "read-book" | "start-repartee" | "repartee-action" }>;
export interface ReparteeVenue { town: TownState; building: TownBuilding; resident: TownResident; encounterId: string }

function encounterId(actorId: string, locationId: string): string {
  return `repartee:${actorId}:${locationId}:first-contest`;
}

export function witnessedReparteeEncounterId(actorId: string, locationId: string, witnessId: string, joinedTick: number): string {
  return `repartee:${actorId}:${locationId}:witness-contest:${witnessId}:${joinedTick}`;
}

/** A single pre-departure encore, never a detour or a repeatable regard farm. */
export function selectWitnessedReparteeVenue(state: DepthState): ReparteeVenue | null {
  const witness = state.companions.active[0];
  const first = state.repartee.completed;
  if (state.reparteeWitness.firstContest !== null || first === null || witness === undefined
    || witness.phase !== "travelling" || witness.injury !== "none" || witness.resources.health <= 0
    || witness.identity.originLocationId !== state.atlas.currentLocationId
    || state.quest.status !== "active" || state.pendingQuestReward !== null || state.atlas.route !== null
    || state.combat !== null || state.counterDuel !== null || state.dungeon !== null && !state.dungeon.completed
    || state.hero.resources.health * 2 <= state.hero.resources.maxHealth) return null;
  const locationId = state.atlas.currentLocationId, town = state.towns[locationId];
  if (town === undefined || town.visits < 1 || town.locationId !== locationId
    || !state.atlas.discoveredLocationIds.includes(locationId)
    || state.atlas.locations.find((entry) => entry.id === locationId)?.kind !== "town") return null;
  const buildings = town.buildings.filter((building) => ["hall", "inn"].includes(building.kind)
    && town.districts.some((district) => district.id === building.districtId && district.buildingIds.includes(building.id)))
    .sort((a, b) => Number(a.kind !== "hall") - Number(b.kind !== "hall") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const building of buildings) {
    const resident = town.residents.find((entry) => entry.id !== witness.identity.residentId
      && entry.homeBuildingId === building.id && building.residentIds.includes(entry.id));
    if (resident !== undefined) return { town, building, resident,
      encounterId: witnessedReparteeEncounterId(state.hero.id, locationId, witness.identity.residentId, witness.joinedTick) };
  }
  return null;
}

export function witnessedReparteeCommandCandidates(state: DepthState): readonly DepthCommandCandidate[] | null {
  const venue = selectWitnessedReparteeVenue(state);
  return venue === null ? null : [candidate(state, { type: "start-repartee", encounterId: venue.encounterId,
    residentId: venue.resident.id, locationId: venue.town.locationId, buildingId: venue.building.id },
  `offer one flyting encore before ${state.companions.active[0]!.identity.name}'s road oath`)];
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
  repartee: DepthState["repartee"]; reparteeWitness: DepthState["reparteeWitness"]; towns: DepthState["towns"]; message: string;
} {
  const tick = input.tick + 1;
  const sourceCommandId = reparteeCommandId(tick, command);
  if (command.type === "read-book" || command.type === "start-repartee") {
    const encore = command.type === "start-repartee" ? selectWitnessedReparteeVenue(input) : null;
    const venue = encore ?? selectReparteeVenue(input);
    if (venue === null || venue.town.locationId !== command.locationId || venue.building.id !== command.buildingId) throw new Error("No matching safe-town book or contest");
    const context = { actorId: input.hero.id, locationId: command.locationId, buildingId: command.buildingId, sourceCommandId, tick };
    if (command.type === "read-book") {
      if (command.bookId !== reparteeBook.id) throw new Error("Unknown book");
      const repartee = readReparteeBook(input.repartee, context);
      if (repartee === input.repartee) throw new Error("The book has already been read or its source is invalid");
      return { repartee, reparteeWitness: input.reparteeWitness, towns: input.towns, message: `${input.hero.name} reads ${reparteeBook.title} at ${venue.building.name}. ${reparteeBook.excerpt} Learned 12 expressions and two ways to answer a claim; no XP or reputation awarded.` };
    }
    if (command.encounterId !== venue.encounterId || command.residentId !== venue.resident.id) throw new Error("Contest does not match its resident and venue");
    const prior = encore === null ? input.repartee : { ...input.repartee, completed: null };
    const repartee = startRepartee(prior, { ...context, encounterId: command.encounterId, residentId: command.residentId,
      rulesVersion: encore === null ? 1 : 2 });
    if (repartee === prior) throw new Error("Contest cannot be started again");
    const witness = input.companions.active[0];
    const reparteeWitness = encore === null ? input.reparteeWitness : {
      schemaVersion: 1 as const, firstContest: input.repartee,
      preference: declareReparteeWitnessPreference(input.seed, { witnessId: witness!.identity.residentId,
        joinedTick: witness!.joinedTick, sourceCommandId, tick }), reaction: null,
    };
    return { repartee, reparteeWitness, towns: input.towns, message: `${venue.resident.name} offers ${input.hero.name} a three-round flyting ${encore === null ? "contest" : `encore, with ${witness!.identity.name} watching before departure`}. Victory earns one town reputation, capped at 100; other outcomes earn none. No HP, MP, gold or XP is at stake. “${reparteeChallenges[0]!.text}”` };
  }
  const active = input.repartee.active;
  if (active === null || input.atlas.currentLocationId !== active.locationId) throw new Error("No active contest at this location");
  const town = input.towns[active.locationId];
  if (town === undefined) throw new Error("Contest town is missing");
  const repartee = resolveReparteeRound(input.repartee, { ...command, sourceCommandId, tick, reputationBefore: town.reputation, reputationCap: 100 });
  if (repartee === input.repartee) throw new Error("Stale, unknown or repeated repartee response");
  const settled = repartee.completed;
  const witness = input.companions.active[0];
  const reaction = settled === null || input.reparteeWitness.preference === null ? null
    : createReparteeWitnessReaction(repartee, input.reparteeWitness.preference,
      witness === undefined || witness.injury !== "none" || witness.resources.health <= 0 ? null : {
        witnessId: witness.identity.residentId, witnessName: witness.identity.name, joinedTick: witness.joinedTick,
        locationId: input.atlas.currentLocationId, tick,
      });
  const reparteeWitness = reaction === null ? input.reparteeWitness : { ...input.reparteeWitness, reaction };
  const round = (repartee.active ?? settled)!.rounds.at(-1);
  const resident = town.residents.find((entry) => entry.id === active.residentId)!;
  const exchange = command.responseId === "retreat" ? `${input.hero.name} concedes the contest to ${resident.name}.`
    : `${resident.name}: “${round!.call}” ${input.hero.name}: “${round!.reply}” ${round!.explanation} Momentum ${round!.momentum > 0 ? "+" : ""}${round!.momentum}.`;
  return { repartee, reparteeWitness,
    towns: settled === null ? input.towns : { ...input.towns, [town.locationId]: { ...town, reputation: settled.reputationAfter } },
    message: settled === null ? exchange : `${exchange} ${settled.outcome.toUpperCase()} — ${town.name} reputation ${settled.reputationBefore}→${settled.reputationAfter}. The one-time contest is complete.${reaction === null ? "" : ` ${reaction.witnessName}: “${reaction.line}”`}`,
  };
}

/** Cross-check saved episode provenance against this campaign's retained town identities. */
function isValidCampaignReparteeEpisode(state: DepthState, expectedEncounterId: string, witnessed: boolean): boolean {
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
    const duelTown = state.towns[duel.locationId];
    const duelBuilding = duelTown?.buildings.find((entry) => entry.id === duel.buildingId);
    const resident = duelTown?.residents.find((entry) => entry.id === duel.residentId);
    if (duelTown === undefined || duelBuilding === undefined || duelTown.visits < 1 || duelTown.locationId !== duel.locationId
      || !state.atlas.discoveredLocationIds.includes(duel.locationId)
      || state.atlas.locations.find((entry) => entry.id === duel.locationId)?.kind !== "town"
      || !["hall", "inn"].includes(duelBuilding.kind)
      || !duelTown.districts.some((entry) => entry.id === duelBuilding.districtId && entry.buildingIds.includes(duelBuilding.id))
      || duel.rulesVersion !== (witnessed ? 2 : 1)
      || duel.startedTick > state.tick || resident?.homeBuildingId !== duelBuilding.id || !duelBuilding.residentIds.includes(duel.residentId)
      || duel.encounterId !== expectedEncounterId
      || duel.sourceCommandId !== reparteeCommandId(duel.startedTick, { type: "start-repartee", encounterId: duel.encounterId, residentId: duel.residentId, locationId: duel.locationId, buildingId: duel.buildingId })) return false;
    for (const round of duel.rounds) if (round.tick > state.tick || round.sourceCommandId !== reparteeCommandId(round.tick, {
      type: "repartee-action", encounterId: duel.encounterId, roundIndex: round.roundIndex, responseId: round.responseId,
    })) return false;
    if (progress.active !== null && (state.atlas.currentLocationId !== duel.locationId || state.atlas.route !== null
      || state.combat !== null || state.counterDuel !== null || (!witnessed && state.companions.active.length > 0)
      || state.dungeon !== null && !state.dungeon.completed || state.pendingQuestReward !== null)) return false;
    const completed = progress.completed;
    if (completed !== null && (completed.completedTick > state.tick || completed.reputationCap !== 100
      || completed.completedTick === state.tick && duelTown.reputation !== completed.reputationAfter
      || completed.outcome === "retreat" && completed.completionCommandId !== reparteeCommandId(completed.completedTick, {
        type: "repartee-action", encounterId: completed.encounterId, roundIndex: completed.roundIndex, responseId: "retreat",
      }))) return false;
    return true;
  } catch { return false; }
}

/** Validate both retained contests and the witness's actual oath identity, never the display roster alone. */
export function isValidCampaignRepartee(state: DepthState): boolean {
  try {
    const memory = state.reparteeWitness;
    if (memory === null || typeof memory !== "object" || Array.isArray(memory) || memory.schemaVersion !== 1
      || Object.keys(memory).sort().join(",") !== "firstContest,preference,reaction,schemaVersion") return false;
    const originalId = encounterId(state.hero.id, state.repartee.reading?.locationId ?? "");
    if (memory.firstContest === null) return memory.preference === null && memory.reaction === null
      && isValidCampaignReparteeEpisode(state, originalId, false);
    const first = memory.firstContest;
    if (!isValidReparteeProgress(first) || first.completed === null || first.active !== null
      || !isValidCampaignReparteeEpisode({ ...state, repartee: first }, originalId, false)
      || JSON.stringify(first.reading) !== JSON.stringify(state.repartee.reading)
      || !isValidReparteeWitnessPreference(memory.preference)) return false;
    const preference = memory.preference;
    const duel = state.repartee.active ?? state.repartee.completed;
    if (duel === null || duel.startedTick <= first.completed.completedTick
      || preference.declaredTick !== duel.startedTick || preference.sourceCommandId !== duel.sourceCommandId
      || preference.joinedTick > preference.declaredTick
      || preference.preferenceId !== declareReparteeWitnessPreference(state.seed, {
        witnessId: preference.witnessId, joinedTick: preference.joinedTick,
        sourceCommandId: preference.sourceCommandId, tick: preference.declaredTick,
      }).preferenceId) return false;
    const witness = [...state.companions.active, ...state.companions.former].find((entry) =>
      entry.identity.residentId === preference.witnessId && entry.joinedTick === preference.joinedTick);
    if (witness === undefined || witness.identity.originLocationId !== duel.locationId
      || witness.identity.residentId === duel.actorId || witness.identity.residentId === duel.residentId
      || witness.phase === "former" && witness.departure.tick <= (state.repartee.completed?.completedTick ?? state.tick)) return false;
    const expectedId = witnessedReparteeEncounterId(state.hero.id, duel.locationId, preference.witnessId, preference.joinedTick);
    if (!isValidCampaignReparteeEpisode(state, expectedId, true)) return false;
    if (state.repartee.active !== null) return memory.reaction === null && witness.phase === "travelling"
      && witness.injury === "none" && witness.resources.health > 0 && state.companions.active[0] === witness;
    if (state.repartee.completed?.completedTick === state.tick && (witness.phase !== "travelling"
      || witness.injury !== "none" || witness.resources.health <= 0 || state.companions.active[0] !== witness
      || state.atlas.currentLocationId !== duel.locationId || state.atlas.route !== null
      || state.combat !== null || state.counterDuel !== null
      || state.dungeon !== null && !state.dungeon.completed || state.pendingQuestReward !== null)) return false;
    return memory.reaction !== null && memory.reaction.witnessName === witness.identity.name
      && isValidReparteeWitnessReaction(memory.reaction, state.repartee, preference);
  } catch { return false; }
}
