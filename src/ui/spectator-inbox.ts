import type { ChronicleEntry, WorldState } from "../core/types";
import {
  counterDuelHabitText,
  counterDuelHabitUnlockText,
  counterDuelPatternBreakText,
  newlyEstablishedCounterDuelHabits,
  projectCounterDuelHabit,
} from "../depth/counter-duel";
import type { EquipmentSlot, QuestObjective } from "../depth/types";

export const maximumSpectatorMoments = 8;
export const maximumSpectatorDetails = 8;

export type SpectatorMomentKind =
  | "battle"
  | "companion"
  | "discovery"
  | "dungeon"
  | "arrival"
  | "quest"
  | "growth"
  | "item";

export interface SpectatorMoment {
  id: string;
  episodeId: string | null;
  sourceId: string | null;
  latestSourceId: string | null;
  provenance: "chronicle" | "aggregate";
  fromTick: number;
  tick: number;
  kind: SpectatorMomentKind;
  status: "ongoing" | "resolved";
  location: string;
  title: string;
  details: readonly string[];
  omittedDetails: number;
  eventCount: number;
}

export interface SpectatorInboxState {
  campaignId: string;
  cursorTick: number;
  attentionClock: number;
  items: readonly SpectatorMoment[];
  dropped: number;
  unavailableTicks: number;
  unread: number;
}

const equipmentSlots: readonly EquipmentSlot[] = [
  "weapon",
  "offhand",
  "head",
  "body",
  "feet",
  "charm",
];

function saturatingAdd(value: number, amount: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, value + Math.max(0, amount));
}

function titleCase(value: string): string {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

function objectives(state: WorldState): readonly QuestObjective[] {
  return [
    ...state.depth.quest.objectives,
    ...state.depth.quest.subquests.flatMap((subquest) => subquest.objectives),
  ];
}

function retainedSources(after: WorldState, cursorTick: number): readonly ChronicleEntry[] {
  return [...after.chronicle]
    .filter((entry) => entry.tick > cursorTick)
    .sort((left, right) => left.tick - right.tick || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

function boundDetails(details: readonly string[]): {
  details: readonly string[];
  omittedDetails: number;
} {
  const unique = [...new Set(details)];
  return {
    details: unique.slice(0, maximumSpectatorDetails),
    omittedDetails: Math.max(0, unique.length - maximumSpectatorDetails),
  };
}

function itemAndEquipmentDetails(before: WorldState, after: WorldState): readonly string[] {
  const beforeItems = new Map(before.depth.hero.inventory.map((item) => [item.id, item]));
  const details: string[] = [];
  for (const item of after.depth.hero.inventory) {
    const gained = item.quantity - (beforeItems.get(item.id)?.quantity ?? 0);
    if (gained > 0) details.push(`Gained ${item.name}${gained === 1 ? "" : ` ×${gained}`}`);
  }
  for (const slot of equipmentSlots) {
    if (before.depth.hero.equipment[slot] === after.depth.hero.equipment[slot]) continue;
    const itemId = after.depth.hero.equipment[slot];
    const item = after.depth.hero.inventory.find((candidate) => candidate.id === itemId);
    details.push(item === undefined ? `${titleCase(slot)} slot cleared` : `Equipped ${item.name} · ${slot}`);
  }
  return details;
}

function growthDetails(before: WorldState, after: WorldState): readonly string[] {
  const details: string[] = [];
  if (after.depth.hero.level > before.depth.hero.level) {
    details.push(`Reached hero level ${after.depth.hero.level}`);
  }
  const beforeAbilities = new Map(before.depth.hero.abilities.map((ability) => [ability.id, ability]));
  for (const ability of after.depth.hero.abilities) {
    const previous = beforeAbilities.get(ability.id);
    if (previous !== undefined && ability.level > previous.level) {
      details.push(`${ability.name} reached level ${ability.level}`);
    }
  }
  return details;
}

function discoveryDelta(before: WorldState, after: WorldState): {
  details: readonly string[];
  heldAdmissionCount: number;
} {
  const known = new Set(before.depth.discoveries.map((discovery) => discovery.id));
  const discoveries = after.depth.discoveries.filter((discovery) => !known.has(discovery.id));
  let heldAdmissionCount = 0;
  const details = discoveries.map((discovery) => {
    const admission = after.depth.secretDiscoveryAdmissions.find((entry) => entry.discoveryId === discovery.id);
    const outcome = admission === undefined
      ? undefined
      : after.depth.secretDiscoveryOutcomes.find((entry) => entry.id === admission.outcomeId);
    if (outcome?.disposition === "deferred-capacity") {
      heldAdmissionCount += 1;
      return `Admitted held field note ${discovery.abilityName} from ${discovery.monsterName} · living form at T${discovery.tick}`;
    }
    return `Learned ${discovery.abilityName} from ${discovery.monsterName}`;
  });
  return { details, heldAdmissionCount };
}

function secretOutcomeDetails(before: WorldState, after: WorldState): readonly string[] {
  const known = new Set(before.depth.secretDiscoveryOutcomes.map((outcome) => outcome.id));
  return after.depth.secretDiscoveryOutcomes
    .filter((outcome) => !known.has(outcome.id) && outcome.disposition !== "learned")
    .map((outcome) => outcome.disposition === "deferred-capacity"
      ? `Held ${outcome.abilityName} from ${outcome.monsterName} · repertoire full ${outcome.repertoireCount}/${outcome.repertoireLimit}`
      : outcome.reason === "ability-id-conflict"
        ? `Rejected ${outcome.abilityName} from ${outcome.monsterName} · ability identity conflict`
        : `Unresolved ${outcome.abilityName} from ${outcome.monsterName} · legacy record incomplete`
    );
}

function questDetails(before: WorldState, after: WorldState): readonly string[] {
  const previous = new Map(objectives(before).map((objective) => [objective.id, objective]));
  return objectives(after)
    .filter((objective) => objective.status === "complete" && previous.get(objective.id)?.status !== "complete")
    .map((objective) => `Objective complete · ${objective.description} ${objective.current}/${objective.target}`);
}

function companionDelta(before: WorldState, after: WorldState): {
  title: string;
  details: readonly string[];
} | null {
  const joined = after.depth.companions.active[0];
  if (before.depth.companions.active.length === 0 && joined !== undefined) {
    const originName = after.depth.towns[joined.identity.originLocationId]?.name ?? "Unknown town";
    return {
      title: `${joined.identity.name} joined the road`,
      details: [
        `${joined.identity.role} · ${joined.identity.name}`,
        `Shared-road oath · ${originName} → ${joined.destination.name}`,
      ],
    };
  }

  const departed = after.depth.companions.former.find((companion) =>
    !before.depth.companions.former.some(
      (previous) => previous.identity.residentId === companion.identity.residentId,
    )
  );
  if (departed === undefined) return null;
  return {
    title: `${departed.identity.name}'s oath ended`,
    details: [
      departed.departure.outcome === "injured"
        ? `Evacuated injured to ${departed.destination.name}`
        : `Oath fulfilled at ${departed.destination.name}`,
      `${departed.victories} shared ${departed.victories === 1 ? "victory" : "victories"} · bond ${departed.bond}`,
    ],
  };
}

function dungeonDelta(before: WorldState, after: WorldState): {
  episodeId: string;
  title: string;
  status: SpectatorMoment["status"];
  details: readonly string[];
} | null {
  const previous = before.depth.dungeon;
  const current = after.depth.dungeon;
  if (current === null) return null;
  const previousTraps = new Map(
    previous?.id === current.id ? previous.traps.map((trap) => [trap.cellId, trap]) : [],
  );
  const triggeredTrap = current.traps.find(
    (trap) => trap.phase === "triggered" && previousTraps.get(trap.cellId)?.phase !== "triggered",
  );
  const healthLost = Math.max(0, before.depth.hero.resources.health - after.depth.hero.resources.health);
  const trapDetails = triggeredTrap === undefined || healthLost === 0
    ? []
    : [
        `Trap sprung · ${healthLost} health lost`,
        `Health · ${after.depth.hero.resources.health}/${after.depth.hero.resources.maxHealth}`,
      ];
  const previousGate = previous?.id === current.id ? previous.keyGate : null;
  const currentGate = current.keyGate;
  const foundKey = previousGate?.phase === "uncollected" && currentGate?.phase === "carried";
  const openedGate = previousGate?.phase === "carried" && currentGate?.phase === "open";
  const crossedGate = previousGate?.phase === "open" && currentGate?.phase === "open" && (
    (previous?.currentCellId === currentGate.unlockCellId && current.currentCellId === currentGate.shortcutCellId)
    || (previous?.currentCellId === currentGate.shortcutCellId && current.currentCellId === currentGate.unlockCellId)
  );
  const mechanismDetails = foundKey
    ? ["Wayfinder Key found · sealed shortcut remembered"]
    : openedGate
      ? ["Wayfinder Gate opened · one stationary unlock tick"]
      : crossedGate
        ? ["Opened shortcut crossed · maze distance saved"]
        : [];
  if (previous === null || previous.id !== current.id) {
    return {
      episodeId: `dungeon:${current.id}`,
      title: `Entered ${current.name}`,
      status: "ongoing",
      details: [`${current.width}×${current.height} maze`, ...trapDetails],
    };
  }
  if (!previous.completed && current.completed) {
    return {
      episodeId: `dungeon:${current.id}`,
      title: `Crossed ${current.name}`,
      status: "resolved",
      details: [`${current.visitedCellIds.length}/${current.cells.length} chambers visited`, ...mechanismDetails, ...trapDetails],
    };
  }
  if (triggeredTrap !== undefined && healthLost > 0) {
    return {
      episodeId: `dungeon:${current.id}`,
      title: `Trap sprung in ${current.name}`,
      status: "ongoing",
      details: trapDetails,
    };
  }
  if (foundKey || openedGate || crossedGate) {
    return {
      episodeId: `dungeon:${current.id}`,
      title: foundKey
        ? `Wayfinder Key found in ${current.name}`
        : openedGate
          ? `Wayfinder Gate opened in ${current.name}`
          : `Shortcut crossed in ${current.name}`,
      status: "ongoing",
      details: mechanismDetails,
    };
  }
  const visited = new Set(previous.visitedCellIds);
  const milestones = current.cells.filter(
    (cell) => !visited.has(cell.id)
      && current.visitedCellIds.includes(cell.id)
      && (cell.feature === "shrine" || cell.feature === "treasure" || cell.feature === "lair"),
  );
  if (milestones.length === 0) return null;
  return {
    episodeId: `dungeon:${current.id}`,
    title: `${current.name} reveals a landmark`,
    status: "ongoing",
    details: milestones.map((cell) => `${titleCase(cell.feature)} chamber reached`),
  };
}

function battleDelta(before: WorldState, after: WorldState): {
  episodeId: string;
  title: string;
  status: SpectatorMoment["status"];
  details: readonly string[];
} | null {
  const previous = before.depth.combat;
  const current = after.depth.combat;
  if (previous === null && current !== null) {
    const enemies = current.combatants.filter((combatant) => combatant.side === "enemies");
    const fieldNote = counterDuelHabitUnlockText(newlyEstablishedCounterDuelHabits(
      before.depth.hero.monsterLore,
      after.depth.hero.monsterLore,
    ));
    return {
      episodeId: `battle:${current.id}`,
      title: "Battle joined",
      status: "ongoing",
      details: [
        `${enemies.length} ${enemies.length === 1 ? "foe" : "foes"} · ${enemies.map((enemy) => enemy.name).join(", ")}`,
        ...(fieldNote === null ? [] : [fieldNote]),
      ],
    };
  }
  if (previous === null || current !== null) return null;
  const completed = [...after.depth.completedCombats].reverse().find((combat) => combat.id === previous.id);
  if (completed === undefined || completed.outcome === "ongoing") return null;
  const enemies = completed.combatants.filter((combatant) => combatant.side === "enemies");
  return {
    episodeId: `battle:${completed.id}`,
    title: completed.outcome === "victory"
      ? "Battle won"
      : completed.outcome === "defeat"
        ? "Battle lost"
        : "Battle ended in stalemate",
    status: "resolved",
    details: [
      `Outcome · ${titleCase(completed.outcome)}`,
      `${enemies.length} ${enemies.length === 1 ? "foe" : "foes"} · ${enemies.map((enemy) => enemy.name).join(", ")}`,
      `Health · ${after.depth.hero.resources.health}/${after.depth.hero.resources.maxHealth}`,
    ],
  };
}

function counterDuelDelta(before: WorldState, after: WorldState): {
  episodeId: string;
  title: string;
  status: SpectatorMoment["status"];
  details: readonly string[];
} | null {
  const previous = before.depth.counterDuel;
  const current = after.depth.counterDuel;
  if (previous === null && current !== null) {
    const fieldNote = counterDuelHabitUnlockText(newlyEstablishedCounterDuelHabits(
      before.depth.hero.monsterLore,
      after.depth.hero.monsterLore,
    ));
    const habit = projectCounterDuelHabit(current, after.depth.hero.monsterLore);
    return {
      episodeId: `counter-duel:${current.id}`,
      title: "Pattern Duel declared",
      status: "ongoing",
      details: [
        `Rival · ${current.opponentName}`,
        "Rule · Rush defeats Feint; Feint defeats Ward; Ward defeats Rush · first to 2; after round 5, leader wins and equal score draws",
        current.patternBreak === undefined
          ? "Pattern Break · unavailable in this legacy duel"
          : "Pattern Break · two consecutive confirmed live-tell reads · ordinary point and standard reward only",
        fieldNote ?? counterDuelHabitText(habit),
        `Stakes · victory +${current.stakes.victoryExperience} XP/+${current.stakes.victoryGold} gold · defeat −${current.stakes.defeatDamage} health`,
      ],
    };
  }
  if (previous !== null && current?.id === previous.id && current.history.length > previous.history.length) {
    const round = current.history.at(-1);
    if (round === undefined) return null;
    return {
      episodeId: `counter-duel:${current.id}`,
      title: `Pattern Duel round ${round.round}`,
      status: "ongoing",
      details: [
        `Tell · ${titleCase(round.tell.suggestedStance)} · clarity ${round.tell.clarity}`,
        `Reveal · hero ${titleCase(round.heroStance)} · rival ${titleCase(round.opponentStance)}`,
        `Score · ${round.heroScore}–${round.opponentScore}`,
        current.patternBreak === undefined ? "Pattern Break · unavailable" : counterDuelPatternBreakText(current.patternBreak),
      ],
    };
  }
  if (previous === null || current !== null) return null;
  const completed = [...after.depth.completedCounterDuels].reverse().find((duel) => duel.id === previous.id);
  if (completed === undefined || completed.outcome === "ongoing") return null;
  return {
    episodeId: `counter-duel:${completed.id}`,
    title: `Pattern Duel ${completed.outcome}`,
    status: "resolved",
    details: [
      `Rival · ${completed.opponentName}`,
      `Final score · ${completed.heroScore}–${completed.opponentScore} after ${completed.history.length} rounds`,
      completed.patternBreak === undefined ? "Pattern Break · unavailable" : counterDuelPatternBreakText(completed.patternBreak),
      completed.outcome === "victory"
        ? `Reward · +${completed.stakes.victoryExperience} XP · +${completed.stakes.victoryGold} gold`
        : completed.outcome === "defeat"
          ? `Consequence · −${completed.stakes.defeatDamage} health · ${after.depth.hero.resources.health}/${after.depth.hero.resources.maxHealth} remains`
          : "Consequence · no campaign resource changed",
    ],
  };
}

function projectMoment(before: WorldState, after: WorldState, cursorTick: number): SpectatorMoment | null {
  const sources = retainedSources(after, cursorTick);
  const latestSource = sources.at(-1);
  if (latestSource === undefined) return null;
  const aggregate = after.tick - cursorTick > 1;
  const source = aggregate ? null : latestSource;
  const battleChange = battleDelta(before, after);
  const counterDuelChange = counterDuelDelta(before, after);
  const companion = companionDelta(before, after);
  const ongoingBattleId = before.depth.combat !== null
    && after.depth.combat?.id === before.depth.combat.id
    ? before.depth.combat.id
    : null;
  const ongoingCounterDuelId = before.depth.counterDuel !== null
    && after.depth.counterDuel?.id === before.depth.counterDuel.id
    ? before.depth.counterDuel.id
    : null;
  const battle = counterDuelChange ?? battleChange ?? (ongoingCounterDuelId !== null
    ? {
        episodeId: `counter-duel:${ongoingCounterDuelId}`,
        title: "Pattern Duel in progress",
        status: "ongoing" as const,
        details: [] as readonly string[],
      }
    : ongoingBattleId !== null
    ? {
        episodeId: `battle:${ongoingBattleId}`,
        title: "Battle in progress",
        status: "ongoing" as const,
        details: [] as readonly string[],
      }
    : null);
  const dungeon = dungeonDelta(before, after);
  const discoveryChange = discoveryDelta(before, after);
  const discoveries = discoveryChange.details;
  const secretOutcomes = secretOutcomeDetails(before, after);
  const quest = questDetails(before, after);
  const growth = growthDetails(before, after);
  const items = itemAndEquipmentDetails(before, after);
  const arrivedLocation = before.depth.atlas.currentLocationId !== after.depth.atlas.currentLocationId
    && !before.depth.atlas.discoveredLocationIds.includes(after.depth.atlas.currentLocationId)
    ? after.depth.atlas.locations.find((location) => location.id === after.depth.atlas.currentLocationId)
    : undefined;
  const details = [
    ...(companion?.details ?? []),
    ...(battle?.details ?? []),
    ...(dungeon?.details ?? []),
    ...discoveries,
    ...secretOutcomes,
    ...(arrivedLocation === undefined ? [] : [`Discovered ${arrivedLocation.name} · ${arrivedLocation.kind}`]),
    ...quest,
    ...growth,
    ...items,
  ];
  if (details.length === 0) return null;

  const kind: SpectatorMomentKind = companion !== null
    ? "companion"
    : battle !== null
    ? "battle"
    : discoveries.length > 0 || secretOutcomes.length > 0
      ? "discovery"
      : dungeon !== null
        ? "dungeon"
        : arrivedLocation !== undefined
          ? "arrival"
          : quest.length > 0
            ? "quest"
            : growth.length > 0
              ? "growth"
              : "item";
  const episodeId = battle?.episodeId ?? dungeon?.episodeId ?? null;
  const entityId = episodeId
    ?? arrivedLocation?.id
    ?? after.depth.secretDiscoveryOutcomes.at(-1)?.id
    ?? after.depth.discoveries.at(-1)?.id
    ?? latestSource.commandId
    ?? String(after.tick);
  const title = companion?.title
    ?? battle?.title
    ?? (discoveries.length > 0
      ? discoveryChange.heldAdmissionCount === discoveries.length
        ? "Held field note admitted"
        : discoveryChange.heldAdmissionCount > 0
          ? "Monster techniques admitted"
          : "Monster secret learned"
      : null)
    ?? (secretOutcomes.length > 0 ? "Monster pattern resolved" : null)
    ?? dungeon?.title
    ?? (arrivedLocation === undefined ? null : `Reached ${arrivedLocation.name}`)
    ?? (quest.length > 0 ? "Quest advanced" : null)
    ?? (growth.length > 0 ? "Power increased" : null)
    ?? "Pack changed";
  const boundedDetails = boundDetails(details);
  const sourceId = source?.id ?? null;

  return {
    id: sourceId === null
      ? `aggregate:${after.campaignId}:${cursorTick + 1}-${after.tick}:${kind}:${entityId}`
      : `${sourceId}:${kind}:${entityId}`,
    episodeId,
    sourceId,
    latestSourceId: sourceId,
    provenance: aggregate ? "aggregate" : "chronicle",
    fromTick: aggregate ? cursorTick + 1 : latestSource.tick,
    tick: latestSource.tick,
    kind,
    status: battle?.status ?? dungeon?.status ?? "resolved",
    location: aggregate ? "Catch-up interval" : latestSource.location,
    title,
    details: boundedDetails.details,
    omittedDetails: boundedDetails.omittedDetails,
    eventCount: 1,
  };
}

function mergeEpisode(existing: SpectatorMoment, incoming: SpectatorMoment): SpectatorMoment {
  const combined = [...new Set([...existing.details, ...incoming.details])];
  const bounded = combined.length <= maximumSpectatorDetails
    ? combined
    : [combined[0]!, ...combined.slice(-(maximumSpectatorDetails - 1))];
  return {
    ...incoming,
    id: existing.id,
    sourceId: existing.sourceId,
    latestSourceId: incoming.latestSourceId,
    provenance: existing.provenance === "aggregate" || incoming.provenance === "aggregate"
      ? "aggregate"
      : "chronicle",
    fromTick: existing.fromTick,
    details: bounded,
    omittedDetails: saturatingAdd(
      saturatingAdd(existing.omittedDetails, incoming.omittedDetails),
      Math.max(0, combined.length - bounded.length),
    ),
    eventCount: saturatingAdd(existing.eventCount, 1),
  };
}

export function createSpectatorInbox(state: WorldState): SpectatorInboxState {
  return {
    campaignId: state.campaignId,
    cursorTick: state.tick,
    attentionClock: state.lifecycle.attentionClock,
    items: [],
    dropped: 0,
    unavailableTicks: 0,
    unread: 0,
  };
}

export function observeSpectatorInbox(
  inbox: SpectatorInboxState,
  before: WorldState,
  after: WorldState,
  capture: boolean,
): SpectatorInboxState {
  if (inbox.campaignId !== after.campaignId || before.campaignId !== after.campaignId) {
    return createSpectatorInbox(after);
  }
  if (after.tick <= inbox.cursorTick) return inbox;

  const oldestRetainedTick = after.chronicle[0]?.tick ?? after.tick;
  const truncated = Math.max(0, oldestRetainedTick - inbox.cursorTick - 1);
  const projected = projectMoment(before, after, inbox.cursorTick);
  let items = [...inbox.items];
  let unread = inbox.unread;
  let dropped = inbox.dropped;
  const unavailableTicks = capture
    ? saturatingAdd(inbox.unavailableTicks, truncated)
    : inbox.unavailableTicks;
  if (projected !== null) {
    const existingIndex = projected.episodeId === null
      ? items.findIndex((item) => item.id === projected.id)
      : items.findIndex((item) => item.episodeId === projected.episodeId);
    if (existingIndex >= 0) {
      const existing = items[existingIndex];
      if (existing !== undefined) items[existingIndex] = mergeEpisode(existing, projected);
    } else if (capture) {
      items.push(projected);
      unread = saturatingAdd(unread, 1);
      if (items.length > maximumSpectatorMoments) {
        const overflow = items.length - maximumSpectatorMoments;
        items = items.slice(overflow);
        dropped = saturatingAdd(dropped, overflow);
        unread = Math.min(unread, items.length);
      }
    }
  }
  return {
    campaignId: inbox.campaignId,
    cursorTick: after.tick,
    attentionClock: after.lifecycle.attentionClock,
    items,
    dropped,
    unavailableTicks,
    unread,
  };
}

export function markSpectatorInboxRead(inbox: SpectatorInboxState): SpectatorInboxState {
  return inbox.unread === 0 ? inbox : { ...inbox, unread: 0 };
}

export function beginSpectatorAbsence(inbox: SpectatorInboxState, state: WorldState): SpectatorInboxState {
  if (inbox.campaignId !== state.campaignId) return createSpectatorInbox(state);
  return {
    ...inbox,
    cursorTick: state.tick,
    attentionClock: state.lifecycle.attentionClock,
    items: [],
    dropped: 0,
    unavailableTicks: 0,
    unread: 0,
  };
}
