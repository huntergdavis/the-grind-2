import type { DepthState, RoutePlan } from "./types";

/** Shared unchanged route-encounter gate; a rest cannot invent a fresh encounter. */
export function unresolvedRouteEncounterId(state: DepthState): string | null {
  if (state.atlas.route === null) return null;
  const encounterId = `encounter:route:${state.atlas.route.path.join(">")}`;
  const completed = state.completedCombats.some((combat) => combat.id === encounterId)
    || state.completedCounterDuels.some((duel) => duel.id === encounterId);
  return completed ? null : encounterId;
}

export function needsCriticalRoadsideRecovery(state: DepthState): boolean {
  return state.combat === null
    && state.counterDuel === null
    && (state.dungeon === null || state.dungeon.completed)
    && unresolvedRouteEncounterId(state) !== null
    && state.hero.resources.health * 2 <= state.hero.resources.maxHealth;
}

export interface CriticalRoadsideRestPlan {
  readonly locationId: string;
  readonly encounterId: string;
  readonly route: RoutePlan;
  readonly goldBefore: number;
  readonly goldSpent: 0;
  readonly goldAfter: number;
  readonly healthBefore: number;
  readonly healthAfter: number;
  readonly manaBefore: number;
  readonly manaAfter: number;
}

/** Snapshot an already-required recovery, without scheduling it or changing its effects. */
export function selectCriticalRoadsideRest(state: DepthState): CriticalRoadsideRestPlan | null {
  if (!needsCriticalRoadsideRecovery(state) || state.atlas.route === null) return null;
  return Object.freeze({
    locationId: state.atlas.currentLocationId,
    encounterId: unresolvedRouteEncounterId(state)!,
    route: Object.freeze({ ...state.atlas.route, path: Object.freeze([...state.atlas.route.path]) }),
    goldBefore: state.hero.gold, goldSpent: 0, goldAfter: state.hero.gold,
    healthBefore: state.hero.resources.health, healthAfter: state.hero.resources.maxHealth,
    manaBefore: state.hero.resources.mana, manaAfter: state.hero.resources.maxMana,
  });
}
