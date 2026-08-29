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
  | "camp"
  | "chronicle";

export type HeroValue = "curiosity" | "loyalty" | "mercy" | "courage";

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
}

export interface WorldState {
  schemaVersion: 1;
  campaignId: string;
  campaignPolicy: CampaignPolicy;
  seed: string;
  tick: number;
  hero: HeroState;
  scene: SceneState;
  chronicle: readonly ChronicleEntry[];
}

export interface Opportunity {
  mode: SceneMode;
  location: string;
  goal: string;
  actions: readonly string[];
}

export interface ActorChoice {
  action: string;
  consideredActions: readonly string[];
  rationale: string;
}
