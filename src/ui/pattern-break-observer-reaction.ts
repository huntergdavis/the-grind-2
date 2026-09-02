import type { WorldState } from "../core/types";
import { townResidentRoles } from "../depth/towns";
import type { CounterDuelState } from "../depth/types";
import {
  isInjuredPartyStatus,
  projectParty,
  type ActivePartyCompanionProjection,
  type PartyCompanionStatus,
} from "./party-projection";
import {
  projectCounterDuelPatternBreakSignature,
  type PatternBreakSignatureMotif,
  type PatternBreakSignatureV1,
} from "./pattern-break-signature";

export const patternBreakObserverReactionVersion = "pattern-break-observer-reactions-v1" as const;

export type TownResidentRole = (typeof townResidentRoles)[number];
export type PatternBreakObserverGestureId =
  | "loaf-brace"
  | "map-lift"
  | "staff-plant"
  | "kit-steady"
  | "satchel-catch"
  | "wheel-check"
  | "folio-lift"
  | "hammer-set"
  | "restrained-hand";

export type PatternBreakObserverCue =
  | "loaf"
  | "map"
  | "staff"
  | "kit"
  | "satchel"
  | "wheel"
  | "folio"
  | "hammer"
  | "hand";

export interface PatternBreakObserverGestureV1 {
  readonly id: PatternBreakObserverGestureId;
  readonly label: string;
  readonly caption: string;
  readonly cue: PatternBreakObserverCue;
  readonly offsetX: number;
  readonly liftY: number;
  readonly tilt: number;
}

export interface PatternBreakObserverReactionV1 {
  readonly presentationVersion: 1;
  readonly registryVersion: typeof patternBreakObserverReactionVersion;
  readonly reactionId: string;
  readonly eventId: string;
  readonly tick: number;
  readonly campaignId: string;
  readonly commandId: string;
  readonly commandType: "counter-duel-action";
  readonly duelId: string;
  readonly round: number;
  readonly signatureId: string;
  readonly speciesId: string;
  readonly signatureMotif: PatternBreakSignatureMotif;
  readonly companion: Readonly<{
    id: string;
    name: string;
    role: TownResidentRole;
    status: PartyCompanionStatus;
    health: number;
    maxHealth: number;
  }>;
  readonly motionMode: "full" | "restrained";
  readonly gesture: PatternBreakObserverGestureV1;
  readonly dialogue: null;
  readonly mechanicalEffect: 0;
}

interface RoleGestureDefinition {
  readonly id: Exclude<PatternBreakObserverGestureId, "restrained-hand">;
  readonly label: string;
  readonly cue: Exclude<PatternBreakObserverCue, "hand">;
  readonly caption: (name: string) => string;
  readonly offsetX: number;
  readonly liftY: number;
  readonly tilt: number;
}

function roleGesture(
  id: RoleGestureDefinition["id"],
  label: string,
  cue: RoleGestureDefinition["cue"],
  caption: (name: string) => string,
  offsetX: number,
  liftY: number,
  tilt: number,
): RoleGestureDefinition {
  return Object.freeze({ id, label, cue, caption, offsetX, liftY, tilt });
}

const roleGestures = Object.freeze({
  baker: roleGesture("loaf-brace", "LOAF BRACE", "loaf", (name) => `${name} braces the loaf at the second confirmed mark.`, 1, -1.5, -0.03),
  cartographer: roleGesture("map-lift", "MAP LIFT", "map", (name) => `${name} lifts the map at the second confirmed mark.`, -1, -2, 0.035),
  guard: roleGesture("staff-plant", "STAFF PLANT", "staff", (name) => `${name} plants the guard staff at the second confirmed mark.`, 1, -1, -0.04),
  healer: roleGesture("kit-steady", "KIT STEADY", "kit", (name) => `${name} steadies the healer's kit at the second confirmed mark.`, 0, -1, 0.025),
  merchant: roleGesture("satchel-catch", "SATCHEL CATCH", "satchel", (name) => `${name} catches the satchel at the second confirmed mark.`, -1, -1.5, 0.03),
  miller: roleGesture("wheel-check", "WHEEL CHECK", "wheel", (name) => `${name} checks the mill wheel at the second confirmed mark.`, 1, -1, -0.035),
  scholar: roleGesture("folio-lift", "FOLIO LIFT", "folio", (name) => `${name} raises the folio at the second confirmed mark.`, -1, -2, 0.03),
  smith: roleGesture("hammer-set", "HAMMER SET", "hammer", (name) => `${name} sets the hammer at the second confirmed mark.`, 1, -1.5, -0.045),
} satisfies Readonly<Record<TownResidentRole, RoleGestureDefinition>>);

function frozenGesture(
  definition: RoleGestureDefinition,
  name: string,
): PatternBreakObserverGestureV1 {
  return Object.freeze({
    id: definition.id,
    label: definition.label,
    caption: definition.caption(name),
    cue: definition.cue,
    offsetX: definition.offsetX,
    liftY: definition.liftY,
    tilt: definition.tilt,
  });
}

export function projectPatternBreakObserverGesture(
  role: string,
  name: string,
  status: PartyCompanionStatus,
): PatternBreakObserverGestureV1 | null {
  if (!townResidentRoles.includes(role as TownResidentRole)) return null;
  if (isInjuredPartyStatus(status)) {
    return Object.freeze({
      id: "restrained-hand",
      label: "BRACED WITNESS",
      caption: `${name} stays braced and lifts one hand at the second confirmed mark.`,
      cue: "hand",
      offsetX: 0,
      liftY: -0.5,
      tilt: 0.015,
    });
  }
  return frozenGesture(roleGestures[role as TownResidentRole], name);
}

function presentedCounterDuel(state: WorldState): CounterDuelState | null {
  if (state.scene.mode !== "battle") return null;
  if (state.depth.counterDuel !== null) return state.depth.counterDuel;
  return state.depth.completedCounterDuels.at(-1) ?? null;
}

function exactVisibleCompanion(state: WorldState): ActivePartyCompanionProjection | null {
  if (state.depth.companions.active.length !== 1) return null;
  const source = state.depth.companions.active[0];
  const projected = projectParty(state.depth).active;
  if (
    source === undefined ||
    projected === null ||
    projected.id !== source.identity.residentId ||
    projected.name !== source.identity.name ||
    projected.role !== source.identity.role
  ) return null;
  return projected;
}

export function projectPatternBreakObserverReaction(
  state: WorldState,
): PatternBreakObserverReactionV1 | null {
  const source = state.chronicle.at(-1);
  if (
    source === undefined ||
    source.id !== `${state.campaignId}:${state.tick}` ||
    source.tick !== state.tick ||
    source.commandType !== "counter-duel-action" ||
    source.commandId === undefined
  ) return null;

  const duel = presentedCounterDuel(state);
  const latest = duel?.history.at(-1);
  if (duel === null || latest?.patternBreak?.triggered !== true) return null;
  const expectedCommandId = `${state.campaignId}:depth:${state.tick}:counter-duel:${duel.id}:${latest.round}:${latest.prediction}`;
  if (source.commandId !== expectedCommandId) return null;

  let signature: PatternBreakSignatureV1 | null;
  try {
    signature = projectCounterDuelPatternBreakSignature(duel);
  } catch {
    return null;
  }
  if (signature === null || signature.speciesId !== duel.opponentSpeciesId) return null;

  const companion = exactVisibleCompanion(state);
  if (companion === null) return null;
  const gesture = projectPatternBreakObserverGesture(companion.role, companion.name, companion.status);
  if (gesture === null) return null;
  const role = companion.role as TownResidentRole;

  return Object.freeze({
    presentationVersion: 1,
    registryVersion: patternBreakObserverReactionVersion,
    reactionId: `${source.id}:observer:${companion.id}:${gesture.id}:v1`,
    eventId: source.id,
    tick: state.tick,
    campaignId: state.campaignId,
    commandId: source.commandId,
    commandType: "counter-duel-action",
    duelId: duel.id,
    round: latest.round,
    signatureId: signature.signatureId,
    speciesId: signature.speciesId,
    signatureMotif: signature.motif,
    companion: Object.freeze({
      id: companion.id,
      name: companion.name,
      role,
      status: companion.status,
      health: companion.health,
      maxHealth: companion.maxHealth,
    }),
    motionMode: isInjuredPartyStatus(companion.status) ? "restrained" : "full",
    gesture,
    dialogue: null,
    mechanicalEffect: 0,
  });
}
