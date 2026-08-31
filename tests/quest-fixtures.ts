import { applyQuestProgressFact } from "../src/depth/rpg";
import type { QuestObjective, QuestProgressFact, QuestState } from "../src/depth/types";

function factForObjective(objective: QuestObjective, ordinal: number): QuestProgressFact {
  switch (objective.rule.kind) {
    case "visit-location":
      return {
        schemaVersion: 1,
        kind: "location-first-visited",
        locationId: `test:town:${ordinal}`,
        locationKind: objective.rule.locationKind,
      };
    case "win-combat":
      return {
        schemaVersion: 1,
        kind: "combat-won",
        combatId: `test:combat:${ordinal}`,
        defeatedSpeciesIds: [`test:species:${ordinal}`],
      };
    case "complete-dungeon":
      return {
        schemaVersion: 1,
        kind: "dungeon-completed",
        dungeonId: `test:dungeon:${ordinal}`,
        locationId: `test:location:${ordinal}`,
        binding: objective.rule.binding === "quest-lead" ? "quest-lead" : "unbound",
      };
    case "discover-dungeon-feature":
      return {
        schemaVersion: 1,
        kind: "dungeon-feature-discovered",
        dungeonId: `test:dungeon:${ordinal}`,
        locationId: `test:location:${ordinal}`,
        cellId: `test:cell:${ordinal}`,
        feature: objective.rule.feature,
        binding: objective.rule.binding === "quest-lead" ? "quest-lead" : "unbound",
      };
    case "acquire-item":
      return {
        schemaVersion: 1,
        kind: "item-acquired",
        itemId: `test:item:${ordinal}`,
        sourceId: `test:source:${ordinal}`,
        disposition: objective.rule.disposition,
      };
  }
}

export function completeQuestWithFacts(input: QuestState): QuestState {
  const objectiveIdentities = [
    ...input.objectives,
    ...input.subquests.flatMap((subquest) => subquest.objectives),
  ].map((objective) => objective.id);
  let quest = input;
  let factOrdinal = 0;
  for (const objectiveId of objectiveIdentities) {
    while (true) {
      const objective = [
        ...quest.objectives,
        ...quest.subquests.flatMap((subquest) => subquest.objectives),
      ].find((candidate) => candidate.id === objectiveId);
      if (objective === undefined || objective.status !== "active") break;
      quest = applyQuestProgressFact(quest, factForObjective(objective, factOrdinal));
      factOrdinal += 1;
    }
  }
  return quest;
}

const legacySuccessorDescriptions: Readonly<Record<string, { battle: string; shrine: string }>> = {
  "quest:bell-beneath-briar": {
    battle: "Defeat the creature answering the buried bell",
    shrine: "Find the shrine that remembers the bell's true voice",
  },
  "quest:ashes-of-the-false-star": {
    battle: "Defeat the guardian carrying the false star's brand",
    shrine: "Awaken the lens-shrine below the broken dome",
  },
  "quest:tideglass-oath": {
    battle: "Defeat the oathbound hunter on the vanished river",
    shrine: "Discover the shrine beneath the tide marks",
  },
};

export function downgradeQuestToSchema11(input: QuestState): Record<string, unknown> {
  const legacy = structuredClone(input) as unknown as Record<string, any>;
  const descriptions = input.ordinal === 0
    ? {
        objectives: ["Earn news in two different towns", "Defeat the road's guardian"],
        subquests: [
          ["Traverse a forgotten maze", "Discover the maze shrine"],
          ["Collect useful supplies"],
        ],
      }
    : {
        objectives: [legacySuccessorDescriptions[input.id]?.battle],
        subquests: [[input.subquests[0]?.objectives[0]?.description, legacySuccessorDescriptions[input.id]?.shrine]],
      };
  for (const [index, objective] of legacy.objectives.entries()) {
    objective.description = descriptions.objectives[index];
    delete objective.rule;
  }
  for (const [subquestIndex, subquest] of legacy.subquests.entries()) {
    for (const [objectiveIndex, objective] of subquest.objectives.entries()) {
      objective.description = descriptions.subquests[subquestIndex]?.[objectiveIndex];
      delete objective.rule;
    }
  }
  return legacy;
}

export function downgradeDepthQuestToSchema11(depth: Record<string, any>): void {
  depth.quest = downgradeQuestToSchema11(depth.quest as QuestState);
}
