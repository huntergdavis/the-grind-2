import { canonicalHash } from "../core/canonical";
import type { ChronicleEntry, SceneState } from "../core/types";
import { deterministicNarratorFallback } from "./output-policy";
import {
  isNarratorJobV1,
  narratorMaximumInputTokens,
  narratorMaximumOutputTokens,
  narratorMaximumPlaceCharacters,
  type NarratorEnergy,
  type NarratorJobV1,
  type NarratorMoveV1,
  type NarratorPromptV1,
} from "./protocol";

function sourceMatchesScene(scene: Readonly<SceneState>, source: Readonly<ChronicleEntry>): boolean {
  return source.mode === scene.mode
    && source.location === scene.location
    && source.headline === scene.headline
    && source.action === scene.action
    && source.goal === scene.goal
    && source.consequence === scene.consequence
    && source.sensoryIntensity === scene.sensoryIntensity;
}

function energyFor(scene: Readonly<SceneState>): NarratorEnergy {
  if (scene.sensoryIntensity === 0) return "quiet";
  if (scene.sensoryIntensity === 3) return "heightened";
  return "steady";
}

function moveFor(scene: Readonly<SceneState>): NarratorMoveV1 {
  if (scene.mode === "battle" || scene.mode === "dungeon") return "register-pressure";
  if (scene.mode === "camp" || scene.mode === "chronicle") return "shade-atmosphere";
  return "establish-setting";
}

export function projectSceneNarratorJob(
  campaignId: string,
  scene: Readonly<SceneState>,
  source: Readonly<ChronicleEntry> | undefined,
  latestEventId: string | undefined,
): NarratorJobV1 | null {
  if (
    source === undefined
    || latestEventId !== source.id
    || !sourceMatchesScene(scene, source)
    || source.location.length === 0
    || source.location.length > narratorMaximumPlaceCharacters
    || source.location.normalize("NFC") !== source.location
  ) return null;
  const energy = energyFor(scene);
  const move = moveFor(scene);
  const prompt: NarratorPromptV1 = Object.freeze({
    schemaVersion: 1,
    task: "single-ambient-line",
    voice: move === "register-pressure" ? "hero-aside-v1" : "spare-observer-v1",
    move,
    facts: Object.freeze({
      schemaVersion: 1,
      kind: "public-scene",
      sceneKind: scene.mode,
      place: scene.location,
      energy,
    }),
  });
  const sourceFingerprint = canonicalHash({
    campaignId,
    eventId: source.id,
    tick: source.tick,
    scene: {
      mode: scene.mode,
      location: scene.location,
      headline: scene.headline,
      action: scene.action,
      goal: scene.goal,
      consequence: scene.consequence,
      sensoryIntensity: scene.sensoryIntensity,
    },
  });
  const job: NarratorJobV1 = {
    schemaVersion: 1,
    campaignId,
    eventId: source.id,
    tick: source.tick,
    sourceFingerprint,
    prompt,
    deterministicFallback: deterministicNarratorFallback(prompt),
    maximumInputTokens: narratorMaximumInputTokens,
    maximumOutputTokens: narratorMaximumOutputTokens,
  };
  if (!isNarratorJobV1(job)) return null;
  return Object.freeze(job);
}
