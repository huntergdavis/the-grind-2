export type CampaignPolicy = "EternalHero" | "Legacy" | "Mortal";

export type AttentionPolicy =
  | "backgroundSafe"
  | "queueForPresentation"
  | "forbiddenDuringCatchUp";

export type SceneMode =
  | "town"
  | "atlas"
  | "travel"
  | "dungeon"
  | "battle"
  | "training"
  | "discovery"
  | "camp"
  | "chronicle";

export type HeroValue = "curiosity" | "loyalty" | "mercy" | "courage";

export type FidelityTier = "canonicalNamed" | "supporting" | "aggregate" | "ephemeral";

export type ThresholdBehavior =
  | "continue"
  | "stopBeforeNamedThreshold"
  | "forbiddenDuringCatchUp";

export type EventAggregation = "none" | "coalesce" | "summarize";

export interface EventPolicy {
  attention: AttentionPolicy;
  reversible: boolean;
  maximumFidelityAffected: FidelityTier;
  thresholdBehavior: ThresholdBehavior;
  maximumCreditedDurationTicks: number;
  aggregation: EventAggregation;
  queuedFallback: string;
}

export interface WallClockObservation {
  id: string;
  observedAtMs: number;
  elapsedMs: number;
  requestedTicks: number;
  creditedTicks: number;
  appliedTicks: number;
  stoppedAtEventId?: string;
}

export interface LifecycleState {
  policyVersion: 1;
  simulationTick: number;
  worldClockMinutes: number;
  attentionClock: number;
  presentationTimeMs: number;
  maximumCatchUpTicks: number;
  wallClockJournal: readonly WallClockObservation[];
}

export interface HeroState {
  id: string;
  name: string;
  level: number;
  mastery: number;
  experience: number;
  health: number;
  maxHealth: number;
  gold: number;
  values: readonly HeroValue[];
}

export interface SceneState {
  mode: SceneMode;
  location: string;
  headline: string;
  action: string;
  goal: string;
  consequence: string;
  sensoryIntensity: 0 | 1 | 2 | 3;
}

export interface ChronicleEntry extends SceneState {
  id: string;
  tick: number;
  attention: AttentionPolicy;
  consideredActions: readonly string[];
  chosenAction: string;
  rationale: string;
  policy: EventPolicy;
  commandId?: string;
  commandType?: DepthCommand["type"];
  consideredCommandIds?: readonly string[];
}

export interface PendingAttentionEvent {
  id: string;
  tick: number;
  mode: SceneMode;
  location: string;
  goal: string;
  reason: string;
  policy: EventPolicy;
  commandId?: string;
  commandType?: DepthCommand["type"];
}

export interface WorldState {
  schemaVersion: 4;
  campaignId: string;
  campaignPolicy: CampaignPolicy;
  seed: string;
  tick: number;
  hero: HeroState;
  scene: SceneState;
  chronicle: readonly ChronicleEntry[];
  lifecycle: LifecycleState;
  pendingAttention: readonly PendingAttentionEvent[];
  depth: DepthState;
}

export interface Opportunity {
  mode: SceneMode;
  location: string;
  goal: string;
  candidates: readonly DepthCommandCandidate[];
}

export interface ActorChoice {
  commandId: string;
  command: DepthCommand;
  action: string;
  consideredCommandIds: readonly string[];
  consideredActions: readonly string[];
  rationale: string;
}
import type { DepthCommand, DepthCommandCandidate, DepthState } from "../depth/types";
