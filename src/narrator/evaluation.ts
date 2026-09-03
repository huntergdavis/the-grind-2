import { canonicalHash } from "../core/canonical";
import type { SceneMode } from "../core/types";
import {
  allowedNarratorLines,
  deterministicNarratorFallback,
} from "./output-policy";
import {
  isNarratorPromptV1,
  type NarratorEnergy,
  type NarratorMoveV1,
  type NarratorPromptV1,
} from "./protocol";

export const narratorEvaluationCorpusVersion = 1 as const;
export const narratorEvaluationRequiredCases = 200;
export const narratorEvaluationRequiredSeeds = 20;

export interface NarratorEvaluationCaseV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly seedId: string;
  readonly prompt: NarratorPromptV1;
  readonly deterministicBaseline: string;
  readonly allowedOutputs: readonly string[];
}

interface Scenario {
  readonly sceneKind: SceneMode;
  readonly move: NarratorMoveV1;
}

const places = [
  "Alder's Wake", "Bellweather-Ford", "Copperglass Reach", "Dúnmere", "Emberfen",
  "Foxglove Crossing", "Gloambridge", "Hearthward", "Ivory Moss", "Juniper Watch & Weir",
  "Kestrel Hollow", "Lantern Vale", "Moonclock Vault", "Northwind Steps", "Oathstone",
  "Peregrine Rest", "Quietwater", "Rookery Gate", "Starfall Road",
  "The Far Observatory ".padEnd(120, "x"),
] as const;

const coreScenarios: readonly Scenario[] = [
  { sceneKind: "town", move: "establish-setting" },
  { sceneKind: "atlas", move: "establish-setting" },
  { sceneKind: "travel", move: "establish-setting" },
  { sceneKind: "training", move: "establish-setting" },
  { sceneKind: "discovery", move: "establish-setting" },
  { sceneKind: "camp", move: "shade-atmosphere" },
  { sceneKind: "chronicle", move: "shade-atmosphere" },
  { sceneKind: "battle", move: "register-pressure" },
  { sceneKind: "dungeon", move: "register-pressure" },
];
const energies: readonly NarratorEnergy[] = ["quiet", "steady", "heightened"];

function evaluationPrompt(place: string, scenario: Scenario, energy: NarratorEnergy): NarratorPromptV1 {
  const prompt: NarratorPromptV1 = {
    schemaVersion: 1,
    task: "single-ambient-line",
    voice: scenario.move === "register-pressure" ? "hero-aside-v1" : "spare-observer-v1",
    move: scenario.move,
    facts: {
      schemaVersion: 1,
      kind: "public-scene",
      sceneKind: scenario.sceneKind,
      place,
      energy,
    },
  };
  if (!isNarratorPromptV1(prompt)) throw new Error("Narrator evaluation prompt is invalid");
  Object.freeze(prompt.facts);
  return Object.freeze(prompt);
}

function buildCorpus(): readonly NarratorEvaluationCaseV1[] {
  const cases: NarratorEvaluationCaseV1[] = [];
  for (let seedIndex = 0; seedIndex < places.length; seedIndex += 1) {
    const place = places[seedIndex]!;
    const scenarios = [...coreScenarios, coreScenarios[seedIndex % coreScenarios.length]!];
    for (let scenarioIndex = 0; scenarioIndex < scenarios.length; scenarioIndex += 1) {
      const prompt = evaluationPrompt(
        place,
        scenarios[scenarioIndex]!,
        energies[(seedIndex + scenarioIndex) % energies.length]!,
      );
      const allowedOutputs = Object.freeze([...allowedNarratorLines(prompt)]);
      cases.push(Object.freeze({
        schemaVersion: 1,
        id: `narrator-eval-v1:${String(seedIndex).padStart(2, "0")}:${String(scenarioIndex).padStart(2, "0")}`,
        seedId: `narrator-eval-seed:${String(seedIndex).padStart(2, "0")}`,
        prompt,
        deterministicBaseline: deterministicNarratorFallback(prompt),
        allowedOutputs,
      }));
    }
  }
  return Object.freeze(cases);
}

export const narratorEvaluationCasesV1 = buildCorpus();
export const narratorEvaluationCorpusHashV1 = canonicalHash(narratorEvaluationCasesV1);
