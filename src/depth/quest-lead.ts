import { randomInt } from "../core/rng";
import type { AtlasState, QuestObjective, QuestState } from "./types";

export const questLeadSelectorVersion = "quest-lead-v1" as const;
export const questLeadObjectiveId = "quest:cross-maze" as const;

export type QuestLeadPhase = "revealed" | "routed" | "at-lead" | "resolved";

export interface QuestLead {
  id: string;
  questInstanceId: string;
  questOrdinal: number;
  objectiveId: typeof questLeadObjectiveId;
  locationId: string;
  locationName: string;
  revealedTick: number;
  selectorVersion: typeof questLeadSelectorVersion;
}

export interface QuestLeadProjection extends QuestLead {
  phase: QuestLeadPhase;
  discovered: boolean;
}

export function questLeadAdmissionStatus(lead: QuestLeadProjection): string {
  switch (lead.phase) {
    case "revealed": return "quest route not planned";
    case "routed": return "quest route already planned";
    case "at-lead": return "party already at lead";
    case "resolved": return "lead already resolved";
  }
}

function compareId(left: { id: string }, right: { id: string }): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function questObjectives(quest: QuestState): readonly QuestObjective[] {
  return [
    ...quest.objectives,
    ...quest.subquests.flatMap((subquest) => subquest.objectives),
  ];
}

function reachableLocationIds(atlas: AtlasState): ReadonlySet<string> {
  const neighbors = new Map(atlas.locations.map((location) => [location.id, [] as string[]]));
  for (const edge of atlas.edges) {
    neighbors.get(edge.from)?.push(edge.to);
    neighbors.get(edge.to)?.push(edge.from);
  }
  const reached = new Set<string>([atlas.currentLocationId]);
  const pending = [atlas.currentLocationId];
  for (let index = 0; index < pending.length; index += 1) {
    for (const neighbor of neighbors.get(pending[index]!) ?? []) {
      if (reached.has(neighbor)) continue;
      reached.add(neighbor);
      pending.push(neighbor);
    }
  }
  return reached;
}

export function selectSuccessorQuestLead(
  seed: string,
  atlas: AtlasState,
  quest: QuestState,
): QuestLead | null {
  if (quest.ordinal === 0) return null;
  if (!questObjectives(quest).some((objective) => objective.id === questLeadObjectiveId)) {
    throw new TypeError("A successor quest has no canonical cross-maze lead objective");
  }
  const reachable = reachableLocationIds(atlas);
  const dungeons = atlas.locations
    .filter((location) => location.kind === "dungeon" && reachable.has(location.id))
    .sort(compareId);
  if (dungeons.length === 0) throw new TypeError("A successor quest has no dungeon lead candidates");
  const location = dungeons[randomInt(
    dungeons.length,
    seed,
    "quest-lead",
    questLeadSelectorVersion,
    quest.ordinal,
    quest.instanceId,
  )];
  if (location === undefined) throw new TypeError("A successor quest lead could not be selected");
  return {
    id: `${quest.instanceId}:lead:${questLeadObjectiveId}`,
    questInstanceId: quest.instanceId,
    questOrdinal: quest.ordinal,
    objectiveId: questLeadObjectiveId,
    locationId: location.id,
    locationName: location.name,
    revealedTick: quest.admittedTick,
    selectorVersion: questLeadSelectorVersion,
  };
}

export function projectSuccessorQuestLead(
  seed: string,
  atlas: AtlasState,
  quest: QuestState,
): QuestLeadProjection | null {
  const lead = selectSuccessorQuestLead(seed, atlas, quest);
  if (lead === null) return null;
  const objective = questObjectives(quest).find((candidate) => candidate.id === lead.objectiveId);
  if (objective === undefined) throw new TypeError("A successor quest lead objective is missing");
  const phase: QuestLeadPhase = objective.status === "complete"
    ? "resolved"
    : atlas.currentLocationId === lead.locationId
      ? "at-lead"
      : atlas.route?.destinationId === lead.locationId
        ? "routed"
        : "revealed";
  return {
    ...lead,
    phase,
    discovered: atlas.discoveredLocationIds.includes(lead.locationId),
  };
}

export function isQuestLeadDungeon(
  seed: string,
  atlas: AtlasState,
  quest: QuestState,
  dungeonId: string,
): boolean {
  if (quest.ordinal === 0) return true;
  const lead = selectSuccessorQuestLead(seed, atlas, quest);
  return lead !== null && dungeonId === `dungeon:${lead.locationId}:quest:${quest.ordinal}`;
}
