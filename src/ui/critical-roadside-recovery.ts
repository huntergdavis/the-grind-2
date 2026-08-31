import type { WorldState } from "../core/types";

export interface CriticalRoadsideRecoveryProjection {
  commandId: string;
  tick: number;
  location: string;
  recoveryText: string;
  readinessText: string;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
}

export function projectCriticalRoadsideRecovery(
  state: WorldState,
): CriticalRoadsideRecoveryProjection | null {
  const source = state.chronicle.at(-1);
  const latestLog = state.depth.log.at(-1);
  const resources = state.depth.hero.resources;
  if (
    source === undefined
    || source.tick !== state.tick
    || source.commandType !== "wait"
    || source.commandId === undefined
    || source.commandId !== `${state.campaignId}:depth:${state.tick}:critical-roadside-recovery`
    || source.mode !== "camp"
    || state.scene.mode !== "camp"
    || state.depth.atlas.route === null
    || resources.health !== resources.maxHealth
    || resources.mana !== resources.maxMana
    || latestLog?.tick !== state.tick
    || latestLog.category !== "world"
    || latestLog.message !== source.action
    || source.location !== state.scene.location
    || source.headline !== state.scene.headline
    || source.action !== state.scene.action
    || source.goal !== state.scene.goal
    || source.consequence !== state.scene.consequence
    || source.sensoryIntensity !== state.scene.sensoryIntensity
  ) return null;

  return Object.freeze({
    commandId: source.commandId,
    tick: state.tick,
    location: source.location,
    recoveryText: source.action,
    readinessText: source.consequence,
    health: resources.health,
    maxHealth: resources.maxHealth,
    mana: resources.mana,
    maxMana: resources.maxMana,
  });
}
