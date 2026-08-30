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

export type ActorInstinctContext = "road" | "ordinaryCombat" | "direCombat";

export type ActorInstinctCondition =
  | "actor-low-health"
  | "bounded-finish"
  | "hero-curious"
  | "hero-courageous"
  | "hero-merciful";

export type ActorInstinctSelector =
  | "finishing-action"
  | "guard"
  | "control-ability"
  | "unpracticed-ability"
  | "strongest-attack"
  | "unknown-route"
  | "dangerous-route"
  | "town-route"
  | "visible-dungeon-objective"
  | "mapped-opportunity"
  | "training"
  | "recovery"
  | "any";

export type ActorInstinctReasonCode =
  | "finish-safely"
  | "survive-danger"
  | "control-conflict"
  | "test-technique"
  | "meet-danger"
  | "seek-safety"
  | "explore-unknown"
  | "help-settlement"
  | "pursue-visible-objective"
  | "pursue-mapped-reward"
  | "practice-growth"
  | "continue-purposefully";

export interface ActorInstinctRule {
  id: string;
  conditions: readonly ActorInstinctCondition[];
  selector: ActorInstinctSelector;
  reasonCode: ActorInstinctReasonCode;
}

export interface ActorInstinctProfile {
  id: ActorInstinctContext;
  rules: readonly ActorInstinctRule[];
}

export interface ActorDecisionConsideration {
  commandId: string;
  actionLabel: string;
  targetLabel: string | null;
  matchedRuleId: string;
}

export interface ActorDecisionTrace {
  actorId: string;
  actorName: string;
  context: ActorInstinctContext;
  profileId: ActorInstinctContext;
  matchedRuleId: string;
  reasonCode: ActorInstinctReasonCode;
  forwardMotionReason?: ForwardMotionReason;
  considered: readonly ActorDecisionConsideration[];
  selected: ActorDecisionConsideration;
  reasons: readonly string[];
}

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
  policyVersion: 2;
  simulationTick: number;
  worldClockMinutes: number;
  attentionClock: number;
  presentationTimeMs: number;
  maximumCatchUpTicks: number;
  wallClockJournal: readonly WallClockObservation[];
}

export type ForwardMotionReason =
  | "explore-unseen"
  | "avoid-immediate-reverse"
  | "only-open-road"
  | "least-recent"
  | "companion-oath";

export interface DirectedJourneyLeg {
  fromLocationId: string;
  toLocationId: string;
  plannedTick: number;
  arrivedTick: number;
  reason: ForwardMotionReason;
}

export interface RouteDirective {
  reason: ForwardMotionReason;
  destinationId: string;
  plannedTick: number;
}

export interface ForwardMotionState {
  schemaVersion: 1;
  recentLocationIds: readonly string[];
  recentLegs: readonly DirectedJourneyLeg[];
  decisionsSinceProgress: number;
  lastProgressTick: number;
  activeDirective: RouteDirective | null;
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
  decisionTrace?: ActorDecisionTrace;
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
  schemaVersion: 5;
  campaignId: string;
  campaignPolicy: CampaignPolicy;
  seed: string;
  tick: number;
  hero: HeroState;
  scene: SceneState;
  chronicle: readonly ChronicleEntry[];
  lifecycle: LifecycleState;
  forwardMotion: ForwardMotionState;
  pendingAttention: readonly PendingAttentionEvent[];
  depth: DepthState;
}

export interface Opportunity {
  mode: SceneMode;
  location: string;
  goal: string;
  candidates: readonly DepthCommandCandidate[];
  forwardMotionReason: ForwardMotionReason | null;
}

export interface ActorChoice {
  commandId: string;
  command: DepthCommand;
  action: string;
  consideredCommandIds: readonly string[];
  consideredActions: readonly string[];
  rationale: string;
  trace: ActorDecisionTrace;
}
import type { DepthCommand, DepthCommandCandidate, DepthState } from "../depth/types";
