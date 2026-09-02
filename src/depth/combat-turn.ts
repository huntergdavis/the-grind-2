import type { CombatAction, CombatState, CombatStatusKind, CombatTurnEvent } from "./types";

export interface CombatTurnSummary {
  id: string;
  turn: number;
  actorId: string;
  actorName: string;
  targetId: string | null;
  targetName: string | null;
  action: CombatAction["type"];
  actionLabel: string;
  intentInterrupted: boolean;
  abilityId: string | null;
  abilityName: string | null;
  companionAction: Extract<CombatTurnEvent, { kind: "companion-action-resolved" }> | null;
  mana: Extract<CombatTurnEvent, { kind: "mana-spent" }> | null;
  restorative: Extract<CombatTurnEvent, { kind: "restorative-used" }> | null;
  damage: Extract<CombatTurnEvent, { kind: "damage" }> | null;
  statusEvents: readonly Extract<CombatTurnEvent, { kind: "status-tick" | "status-expired" | "status-applied" }>[];
  defeatedIds: readonly string[];
  outcome: Exclude<CombatState["outcome"], "ongoing"> | null;
  text: string;
}

function statusLabel(status: CombatStatusKind): string {
  if (status === "poisoned") return "Poison";
  if (status === "weakened") return "Weakened";
  if (status === "burning") return "Burning";
  return "Guarding";
}

function outcomeLabel(outcome: Exclude<CombatState["outcome"], "ongoing">): string {
  if (outcome === "victory") return "Victory";
  if (outcome === "defeat") return "Defeat";
  return "Stalemate";
}

function statusDurationText(
  event: Extract<CombatTurnEvent, { kind: "status-tick" | "status-expired" | "status-applied" }>,
): string {
  const before = event.kind === "status-applied" ? event.durationBefore ?? 0 : event.durationBefore;
  const after = event.durationAfter;
  return `duration ${before}→${after}`;
}

export function projectLatestCombatTurn(combat: CombatState): CombatTurnSummary | null {
  const latest = combat.eventStream.events.at(-1);
  if (latest === undefined) return null;
  let packetStart = combat.eventStream.events.length - 1;
  while (packetStart > 0 && combat.eventStream.events[packetStart - 1]?.turn === latest.turn) packetStart -= 1;
  const events = combat.eventStream.events.slice(packetStart);
  const intent = events.find((event): event is Extract<CombatTurnEvent, { kind: "intent" }> => event.kind === "intent");
  if (intent === undefined) return null;
  const actor = combat.combatants.find((candidate) => candidate.id === intent.actorId);
  if (actor === undefined) return null;
  const mana = events.find((event): event is Extract<CombatTurnEvent, { kind: "mana-spent" }> => event.kind === "mana-spent") ?? null;
  const restorative = events.find((event): event is Extract<CombatTurnEvent, { kind: "restorative-used" }> => event.kind === "restorative-used") ?? null;
  const companionAction = events.find((event): event is Extract<CombatTurnEvent, { kind: "companion-action-resolved" }> => event.kind === "companion-action-resolved") ?? null;
  const damage = events.find((event): event is Extract<CombatTurnEvent, { kind: "damage" }> => event.kind === "damage") ?? null;
  const statusEvents = events.filter((event): event is Extract<CombatTurnEvent, { kind: "status-tick" | "status-expired" | "status-applied" }> =>
    event.kind === "status-tick" || event.kind === "status-expired" || event.kind === "status-applied"
  );
  const defeatedEvents = events.filter((event): event is Extract<CombatTurnEvent, { kind: "defeated" }> => event.kind === "defeated");
  const defeatedIds = defeatedEvents.flatMap((event) => event.targetId === null ? [] : [event.targetId]);
  const outcome = events.find((event): event is Extract<CombatTurnEvent, { kind: "outcome" }> => event.kind === "outcome")?.outcome ?? null;
  const targetId = damage?.targetId
    ?? restorative?.targetId
    ?? companionAction?.targetId
    ?? statusEvents.find((event) => event.kind === "status-applied")?.targetId
    ?? intent.targetId
    ?? (intent.action === "guard" ? actor.id : null);
  const target = targetId === null ? undefined : combat.combatants.find((candidate) => candidate.id === targetId);
  const ability = intent.abilityId === null ? undefined : actor.abilities.find((candidate) => candidate.id === intent.abilityId);
  const actionLabel = intent.action === "guard"
    ? "Guard"
    : intent.action === "item"
      ? restorative?.itemName ?? "Restorative"
      : intent.action === "companion-action" && companionAction !== null
        ? companionAction.companionActionId === "flour-veil" ? "Flour Veil" : "Millstone Drag"
        : ability?.name ?? (intent.action === "attack" ? "Attack" : "Ability");
  const intentInterrupted = defeatedEvents.some((event) => event.targetId === actor.id) && damage === null && mana === null &&
    restorative === null && companionAction === null && !statusEvents.some((event) => event.kind === "status-applied");
  const intentLabel = intent.action === "item" && restorative !== null ? "Restorative" : actionLabel;
  const parts = [`${actor.name} · Intent: ${intentLabel}${intentInterrupted ? " — interrupted" : ""}`];
  for (const event of events.slice(1)) {
    if (event.kind === "status-tick" || event.kind === "status-expired") {
      const status = statusLabel(event.status);
      parts.push(event.amount > 0
        ? `${status} −${event.amount} HP ${event.healthBefore}→${event.healthAfter} · ${statusDurationText(event)}`
        : `${status} · ${statusDurationText(event)}`
      );
    } else if (event.kind === "mana-spent") {
      parts.push(`MP ${event.manaBefore}→${event.manaAfter}`);
    } else if (event.kind === "restorative-used") {
      parts.push(`${event.itemName} ×${event.quantityBefore}→×${event.quantityAfter} · HP ${event.healthBefore}→${event.healthAfter} (+${event.amount})`);
    } else if (event.kind === "companion-action-resolved") {
      parts.push(`0 MP · 0 damage · ${event.effect} ${event.potency}/${event.duration} · ready R${event.readyRoundAfter}`);
    } else if (event.kind === "damage") {
      const eventTarget = combat.combatants.find((candidate) => candidate.id === event.targetId);
      parts.push(`${eventTarget?.name ?? event.targetId} HP ${event.healthBefore}→${event.healthAfter}${event.guarded ? " · guarded" : ""}`);
    } else if (event.kind === "status-applied") {
      parts.push(`${statusLabel(event.status)} ${event.durationBefore === null ? "applied" : "refreshed"} · ${statusDurationText(event)}`);
    } else if (event.kind === "defeated") {
      const defeated = combat.combatants.find((candidate) => candidate.id === event.targetId);
      parts.push(`${defeated?.name ?? event.targetId ?? "Combatant"} defeated`);
    } else if (event.kind === "outcome") {
      parts.push(outcomeLabel(event.outcome));
    }
  }
  return {
    id: `${combat.id}:turn:${latest.turn}`,
    turn: latest.turn,
    actorId: actor.id,
    actorName: actor.name,
    targetId,
    targetName: target?.name ?? null,
    action: intent.action,
    actionLabel,
    intentInterrupted,
    abilityId: intent.abilityId,
    abilityName: ability?.name ?? null,
    companionAction,
    mana,
    restorative,
    damage,
    statusEvents,
    defeatedIds,
    outcome,
    text: parts.join(" · "),
  };
}
