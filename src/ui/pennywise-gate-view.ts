import type { WorldState } from "../core/types";
import { isValidCampaignPennywiseGate } from "../depth/pennywise-gate";

export type PennywiseGatePhase = "approach" | "lifting" | "paid" | "passed";

export interface PennywiseGateScene {
  readonly phase: PennywiseGatePhase;
  readonly commandId: string;
  readonly tick: number;
  readonly gateId: string;
  readonly heroId: string;
  readonly edgeId: string;
  readonly fromLocationId: string;
  readonly toLocationId: string;
  readonly fromName: string;
  readonly toName: string;
  readonly nearPointIndex: number;
  readonly farPointIndex: number;
  readonly nearProgress: number;
  readonly farProgress: number;
  readonly goldBefore: number;
  readonly goldSpent: number;
  readonly goldAfter: number;
  readonly distanceBefore: number;
  readonly distanceAfter: number;
  readonly headline: string;
  readonly detail: string;
  readonly compactDetail: string;
}

/** The roadside fixture exists only after its committed approach. History cannot
 * replay the gate over a later journey or put a departed companion on the road.
 */
export function projectPennywiseGateScene(state: WorldState): PennywiseGateScene | null {
  const gate = state.depth.pennywiseGate, source = state.chronicle.at(-1), route = state.depth.atlas.route;
  if (gate == null || route === null || !isValidCampaignPennywiseGate(state.depth)
    || state.scene.mode !== "travel" || source?.mode !== "travel" || source.tick !== state.tick || state.depth.tick !== state.tick
    || state.hero.id !== gate.heroId || state.depth.hero.id !== gate.heroId || state.depth.hero.resources.health <= 0
    || state.depth.companions.active.length !== 0 || state.depth.combat !== null || state.depth.counterDuel !== null) return null;
  let phase: PennywiseGatePhase, ownedSource: string, distanceBefore: number, distanceAfter: number;
  let goldBefore = state.depth.hero.gold, goldSpent = 0, goldAfter = state.depth.hero.gold;
  if (gate.completion !== null) {
    const completion = gate.completion;
    if (gate.choice === null || completion.tick !== state.tick
      || source.commandType !== (gate.choice.kind === "pay" ? "choose-pennywise-gate" : "pass-pennywise-gate")) return null;
    phase = gate.choice.kind === "pay" ? "paid" : "passed";
    ownedSource = completion.sourceCommandId;
    distanceBefore = gate.arrival.routeAtGate.distanceTravelled;
    distanceAfter = completion.routeAfter.distanceTravelled;
    ({ goldBefore, goldSpent, goldAfter } = completion);
  } else if (gate.choice !== null) {
    if (gate.choice.kind !== "lift" || gate.choice.tick !== state.tick || source.commandType !== "choose-pennywise-gate") return null;
    phase = "lifting"; ownedSource = gate.choice.sourceCommandId;
    distanceBefore = distanceAfter = gate.arrival.routeAtGate.distanceTravelled;
    ({ goldBefore, goldSpent, goldAfter } = gate.choice);
  } else {
    if (gate.arrival.tick !== state.tick || source.commandType !== "travel") return null;
    phase = "approach"; ownedSource = gate.arrival.sourceCommandId;
    distanceBefore = gate.arrival.routeBefore.distanceTravelled;
    distanceAfter = gate.arrival.routeAtGate.distanceTravelled;
  }
  if (source.commandId !== `${state.campaignId}:${ownedSource}` || state.depth.hero.gold !== goldAfter) return null;
  const from = state.depth.atlas.locations.find(location => location.id === gate.site.fromLocationId);
  const to = state.depth.atlas.locations.find(location => location.id === gate.site.toLocationId);
  if (from === undefined || to === undefined) return null;
  const headline = phase === "approach" ? "PENNYWISE GATE" : phase === "lifting" ? "LIFTING THE BAR"
    : phase === "paid" ? "PAID PASSAGE" : "FREE PASSAGE";
  return Object.freeze({ phase, commandId: source.commandId, tick: state.tick, gateId: gate.gateId, heroId: gate.heroId,
    edgeId: gate.site.edgeId, fromLocationId: from.id, toLocationId: to.id, fromName: from.name, toName: to.name,
    nearPointIndex: gate.site.nearPointIndex, farPointIndex: gate.site.farPointIndex,
    nearProgress: gate.site.nearProgress, farProgress: gate.site.farProgress,
    goldBefore, goldSpent, goldAfter, distanceBefore, distanceAfter, headline,
    detail: phase === "approach" ? "2 GOLD, OR LIFT THE BAR" : phase === "lifting" ? "BAR HELD · FEET STILL · NO GOLD SPENT" : gate.completion!.line,
    compactDetail: phase === "approach" ? "2 GOLD / LIFT FREE" : phase === "lifting" ? "BAR HELD · HERO STILL"
      : `${goldSpent} GOLD · ROAD +${distanceAfter - distanceBefore}`,
  });
}
