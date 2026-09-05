import { canonicalHash } from "../core/canonical";
import type { SceneMode } from "../core/types";
import {
  formatStoryBeatPromptV1,
  isStoryBeatPublicFactsV1,
  validateStoryBeatResultV1,
  type StoryBeatPublicFactsV1,
} from "./story-beat";

export const storyBeatCorpusSchemaVersion = 1 as const;
export const storyBeatCorpusRequiredPositiveCases = 27;
export const storyBeatCorpusRequiredNegativeCases = 18;
export const storyBeatCorpusRequiredTrainCases = 27;
export const storyBeatCorpusRequiredHoldoutCases = 18;
export const storyBeatCorpusRequiredCases = 45;

export const storyBeatCorpusSplits = Object.freeze(["train", "holdout"] as const);
export type StoryBeatCorpusSplit = (typeof storyBeatCorpusSplits)[number];

export const storyBeatCorpusRejectionReasons = Object.freeze([
  "unknown-proper-name",
  "ungrounded-number",
  "missing-location",
  "novel-content-word",
  "multiple-sentences",
  "markup",
  "dialogue",
  "private-thought",
  "url",
  "future-claim",
  "reward-claim",
  "quest-claim",
  "harm-claim",
  "relationship-claim",
  "invalid-whitespace",
  "quoted-dialogue",
  "output-limit",
  "sentence-shape",
] as const);
export type StoryBeatCorpusRejectionReason = (typeof storyBeatCorpusRejectionReasons)[number];

interface StoryBeatCorpusCaseBaseV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly split: StoryBeatCorpusSplit;
  readonly mode: SceneMode;
  readonly structureFamily: string;
  readonly templateFamily: string;
  readonly facts: StoryBeatPublicFactsV1;
  readonly prompt: string;
  readonly caseHash: string;
}

export interface StoryBeatPositiveCorpusCaseV1 extends StoryBeatCorpusCaseBaseV1 {
  readonly kind: "story-beat-positive";
  readonly target: string;
}

export interface StoryBeatNegativeCorpusCaseV1 extends StoryBeatCorpusCaseBaseV1 {
  readonly kind: "story-beat-negative";
  readonly candidate: string;
  readonly rejectionReason: StoryBeatCorpusRejectionReason;
}

export type StoryBeatCorpusCaseV1 =
  | StoryBeatPositiveCorpusCaseV1
  | StoryBeatNegativeCorpusCaseV1;

export interface StoryBeatCorpusV1 {
  readonly schemaVersion: 1;
  readonly kind: "story-beat-corpus";
  readonly provenance: "original-project-authored-no-external-text";
  readonly splitPolicy: "facts-output-template-structure-disjoint-v1";
  readonly cases: readonly StoryBeatCorpusCaseV1[];
  readonly corpusHash: string;
}

const sceneModes = Object.freeze([
  "town",
  "atlas",
  "travel",
  "dungeon",
  "battle",
  "training",
  "discovery",
  "camp",
  "chronicle",
] as const satisfies readonly SceneMode[]);

const positiveKeys = Object.freeze([
  "schemaVersion",
  "kind",
  "id",
  "split",
  "mode",
  "structureFamily",
  "templateFamily",
  "facts",
  "prompt",
  "target",
  "caseHash",
] as const);

const negativeKeys = Object.freeze([
  "schemaVersion",
  "kind",
  "id",
  "split",
  "mode",
  "structureFamily",
  "templateFamily",
  "facts",
  "prompt",
  "candidate",
  "rejectionReason",
  "caseHash",
] as const);

const corpusKeys = Object.freeze([
  "schemaVersion",
  "kind",
  "provenance",
  "splitPolicy",
  "cases",
  "corpusHash",
] as const);

const rejectionReasonSet = new Set<string>(storyBeatCorpusRejectionReasons);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function isCorpusId(value: unknown, split: StoryBeatCorpusSplit, kind: "positive" | "negative"): value is string {
  return typeof value === "string"
    && value.length <= 96
    && new RegExp(`^story-beat-corpus-v1:${split}:${kind}:\\d{2}$`, "u").test(value);
}

function isFamily(value: unknown, split: StoryBeatCorpusSplit): value is string {
  return typeof value === "string"
    && value.length <= 80
    && new RegExp(`^${split}-[a-z0-9]+(?:-[a-z0-9]+)*-v1$`, "u").test(value);
}

function isMode(value: unknown): value is SceneMode {
  return typeof value === "string" && sceneModes.includes(value as SceneMode);
}

function isSplit(value: unknown): value is StoryBeatCorpusSplit {
  return value === "train" || value === "holdout";
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{16}$/u.test(value);
}

function isNegativeCandidate(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 640
    && value.trim() === value
    && value.normalize("NFC") === value
    && !/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value);
}

function positivePayload(value: StoryBeatPositiveCorpusCaseV1): Omit<StoryBeatPositiveCorpusCaseV1, "caseHash"> {
  return {
    schemaVersion: value.schemaVersion,
    kind: value.kind,
    id: value.id,
    split: value.split,
    mode: value.mode,
    structureFamily: value.structureFamily,
    templateFamily: value.templateFamily,
    facts: value.facts,
    prompt: value.prompt,
    target: value.target,
  };
}

function negativePayload(value: StoryBeatNegativeCorpusCaseV1): Omit<StoryBeatNegativeCorpusCaseV1, "caseHash"> {
  return {
    schemaVersion: value.schemaVersion,
    kind: value.kind,
    id: value.id,
    split: value.split,
    mode: value.mode,
    structureFamily: value.structureFamily,
    templateFamily: value.templateFamily,
    facts: value.facts,
    prompt: value.prompt,
    candidate: value.candidate,
    rejectionReason: value.rejectionReason,
  };
}

function corpusPayload(value: StoryBeatCorpusV1): Omit<StoryBeatCorpusV1, "corpusHash"> {
  return {
    schemaVersion: value.schemaVersion,
    kind: value.kind,
    provenance: value.provenance,
    splitPolicy: value.splitPolicy,
    cases: value.cases,
  };
}

export function isStoryBeatCorpusCaseV1(value: unknown): value is StoryBeatCorpusCaseV1 {
  try {
    if (!isRecord(value) || !isSplit(value.split)) return false;
    const split = value.split;
    if (value.kind === "story-beat-positive") {
      if (
        !hasExactKeys(value, positiveKeys)
        || value.schemaVersion !== storyBeatCorpusSchemaVersion
        || !isCorpusId(value.id, split, "positive")
        || !isMode(value.mode)
        || !isFamily(value.structureFamily, split)
        || !isFamily(value.templateFamily, split)
        || !isStoryBeatPublicFactsV1(value.facts)
        || typeof value.prompt !== "string"
        || value.prompt !== formatStoryBeatPromptV1(value.facts)
        || typeof value.target !== "string"
        || validateStoryBeatResultV1(value.target, value.facts) !== value.target
        || !isHash(value.caseHash)
      ) return false;
      return value.caseHash === canonicalHash(positivePayload(value as unknown as StoryBeatPositiveCorpusCaseV1));
    }
    if (value.kind === "story-beat-negative") {
      if (
        !hasExactKeys(value, negativeKeys)
        || value.schemaVersion !== storyBeatCorpusSchemaVersion
        || !isCorpusId(value.id, split, "negative")
        || !isMode(value.mode)
        || !isFamily(value.structureFamily, split)
        || !isFamily(value.templateFamily, split)
        || !isStoryBeatPublicFactsV1(value.facts)
        || typeof value.prompt !== "string"
        || value.prompt !== formatStoryBeatPromptV1(value.facts)
        || !isNegativeCandidate(value.candidate)
        || typeof value.rejectionReason !== "string"
        || !rejectionReasonSet.has(value.rejectionReason)
        || validateStoryBeatResultV1(value.candidate, value.facts) !== null
        || !isHash(value.caseHash)
      ) return false;
      return value.caseHash === canonicalHash(negativePayload(value as unknown as StoryBeatNegativeCorpusCaseV1));
    }
    return false;
  } catch {
    return false;
  }
}

function caseOrderKey(value: StoryBeatCorpusCaseV1): string {
  const split = value.split === "train" ? "0" : "1";
  const kind = value.kind === "story-beat-positive" ? "0" : "1";
  return `${split}:${kind}:${value.id}`;
}

function disjoint(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return [...left].every((value) => !right.has(value));
}

function hasDisjointSplits(cases: readonly StoryBeatCorpusCaseV1[]): boolean {
  const fields = (split: StoryBeatCorpusSplit) => {
    const selected = cases.filter((entry) => entry.split === split);
    return {
      factHashes: new Set(selected.map((entry) => canonicalHash(entry.facts))),
      locations: new Set(selected.map((entry) => entry.facts.location.toLocaleLowerCase("en-US"))),
      examples: new Set(selected.map((entry) => entry.kind === "story-beat-positive" ? entry.target : entry.candidate)),
      structureFamilies: new Set(selected.map((entry) => entry.structureFamily)),
      templateFamilies: new Set(selected.map((entry) => entry.templateFamily)),
    };
  };
  const train = fields("train");
  const holdout = fields("holdout");
  return disjoint(train.factHashes, holdout.factHashes)
    && disjoint(train.locations, holdout.locations)
    && disjoint(train.examples, holdout.examples)
    && disjoint(train.structureFamilies, holdout.structureFamilies)
    && disjoint(train.templateFamilies, holdout.templateFamilies);
}

export function isStoryBeatCorpusV1(value: unknown): value is StoryBeatCorpusV1 {
  try {
    if (
      !isRecord(value)
      || !hasExactKeys(value, corpusKeys)
      || value.schemaVersion !== storyBeatCorpusSchemaVersion
      || value.kind !== "story-beat-corpus"
      || value.provenance !== "original-project-authored-no-external-text"
      || value.splitPolicy !== "facts-output-template-structure-disjoint-v1"
      || !Array.isArray(value.cases)
      || value.cases.length !== storyBeatCorpusRequiredCases
      || !value.cases.every(isStoryBeatCorpusCaseV1)
      || !isHash(value.corpusHash)
    ) return false;

    const cases = value.cases as StoryBeatCorpusCaseV1[];
    if (new Set(cases.map((entry) => entry.id)).size !== cases.length) return false;
    if (new Set(cases.map((entry) => entry.caseHash)).size !== cases.length) return false;
    if (cases.some((entry, index) => index > 0 && caseOrderKey(cases[index - 1]!) >= caseOrderKey(entry))) return false;

    const positiveCount = cases.filter((entry) => entry.kind === "story-beat-positive").length;
    const negativeCount = cases.filter((entry) => entry.kind === "story-beat-negative").length;
    const trainCount = cases.filter((entry) => entry.split === "train").length;
    const holdoutCount = cases.filter((entry) => entry.split === "holdout").length;
    if (
      positiveCount !== storyBeatCorpusRequiredPositiveCases
      || negativeCount !== storyBeatCorpusRequiredNegativeCases
      || trainCount !== storyBeatCorpusRequiredTrainCases
      || holdoutCount !== storyBeatCorpusRequiredHoldoutCases
    ) return false;

    for (const split of storyBeatCorpusSplits) {
      const modes = new Set(cases.filter((entry) => entry.split === split).map((entry) => entry.mode));
      if (!sceneModes.every((mode) => modes.has(mode))) return false;
    }
    if (!hasDisjointSplits(cases)) return false;

    const snapshot: StoryBeatCorpusV1 = {
      schemaVersion: storyBeatCorpusSchemaVersion,
      kind: "story-beat-corpus",
      provenance: "original-project-authored-no-external-text",
      splitPolicy: "facts-output-template-structure-disjoint-v1",
      cases,
      corpusHash: value.corpusHash,
    };
    return value.corpusHash === canonicalHash(corpusPayload(snapshot));
  } catch {
    return false;
  }
}

interface PositiveSeed {
  readonly mode: SceneMode;
  readonly facts: StoryBeatPublicFactsV1;
  readonly structureFamily: string;
  readonly templateFamily: string;
  readonly target: string;
}

interface NegativeSeed {
  readonly mode: SceneMode;
  readonly facts: StoryBeatPublicFactsV1;
  readonly structureFamily: string;
  readonly templateFamily: string;
  readonly candidate: string;
  readonly rejectionReason: StoryBeatCorpusRejectionReason;
}

function facts(
  location: string,
  headline: string,
  action: string,
  consequence: string,
): StoryBeatPublicFactsV1 {
  return {
    schemaVersion: 1,
    kind: "public-story-beat",
    location,
    headline,
    action,
    consequence,
  };
}

// Every authored line below is original to this project. No external game text or
// generated model output is included in the training or holdout material.
const trainPositiveSeeds: readonly PositiveSeed[] = [
  { mode: "town", facts: facts("Copperglass Square", "The bell market opens.", "Iria lifts the blue awning.", "Three stalls now face the fountain."), structureFamily: "train-location-first-v1", templateFamily: "train-place-action-v1", target: "At Copperglass Square, Iria lifts the blue awning." },
  { mode: "town", facts: facts("Bellweather, Lower Ward", "Six lanterns answer the dusk.", "Maro checks each painted hook.", "Six lanterns now face the fountain."), structureFamily: "train-location-first-v1", templateFamily: "train-place-consequence-v1", target: "At Bellweather, Lower Ward, six lanterns now face the fountain." },
  { mode: "atlas", facts: facts("Northwind Chart-Room", "The inlet route is marked.", "Pell marks route 7 beside the inlet.", "Route 7 now carries a copper line."), structureFamily: "train-location-first-v1", templateFamily: "train-place-action-v1", target: "At Northwind Chart-Room, Pell marks route 7." },
  { mode: "atlas", facts: facts("Cartographer's Nook", "The eastern contour settles.", "Olin compares the amber scales.", "The eastern contour is now complete."), structureFamily: "train-location-first-v1", templateFamily: "train-place-consequence-v1", target: "At Cartographer's Nook, the eastern contour is now complete." },
  { mode: "travel", facts: facts("Warden's Mile", "The rain-dark path continues.", "Sable crosses 12 rain-dark stones.", "The old cairn now stands behind the cart."), structureFamily: "train-location-first-v1", templateFamily: "train-place-action-v1", target: "At Warden's Mile, Sable crosses 12 rain-dark stones." },
  { mode: "travel", facts: facts("Café Switchback", "Two ribbons hold the bend.", "Rusk steadies the dun packhorse.", "Two trail ribbons remain beside the cairn."), structureFamily: "train-location-first-v1", templateFamily: "train-place-consequence-v1", target: "At Café Switchback, two trail ribbons remain beside the cairn." },
  { mode: "dungeon", facts: facts("Moonclock Vault", "The inner lock yields.", "Mira turns the bronze wheel.", "The lower chamber is now open."), structureFamily: "train-location-first-v1", templateFamily: "train-place-action-v1", target: "At Moonclock Vault, Mira turns the bronze wheel." },
  { mode: "dungeon", facts: facts("Juniper Underway", "The hidden panel slides aside.", "Corin lifts the quiet latch.", "The quiet threshold is now open."), structureFamily: "train-location-first-v1", templateFamily: "train-place-consequence-v1", target: "At Juniper Underway, the quiet threshold is now open." },
  { mode: "battle", facts: facts("Emberhook Causeway", "The ash rider meets the line.", "Nia blocks the ash rider.", "The center lane remains open."), structureFamily: "train-location-first-v1", templateFamily: "train-place-action-v1", target: "At Emberhook Causeway, Nia blocks the ash rider." },
  { mode: "battle", facts: facts("Rookery Gate", "The shield line holds.", "Bram braces beside the blue standard.", "The center lane remains open."), structureFamily: "train-location-first-v1", templateFamily: "train-place-consequence-v1", target: "At Rookery Gate, the center lane remains open." },
  { mode: "training", facts: facts("Juniper Yard", "The fourth form begins.", "Tova completes 4 measured forms.", "Four chalk marks now cross the board."), structureFamily: "train-location-first-v1", templateFamily: "train-place-action-v1", target: "At Juniper Yard, Tova completes 4 measured forms." },
  { mode: "training", facts: facts("Glassbell Court", "The practice bell settles.", "Yara resets the cedar markers.", "Three chalk circles remain visible."), structureFamily: "train-location-first-v1", templateFamily: "train-place-consequence-v1", target: "At Glassbell Court, three chalk circles remain visible." },
  { mode: "discovery", facts: facts("Mosslight Orrery", "The amber dial appears.", "Kei uncovers the amber dial.", "The inner ring is now visible."), structureFamily: "train-location-first-v1", templateFamily: "train-place-action-v1", target: "At Mosslight Orrery, Kei uncovers the amber dial." },
  { mode: "discovery", facts: facts("Áine's Survey", "The folded chart brightens.", "Áine brushes dust from the star-map.", "The lower star-map is now readable."), structureFamily: "train-location-first-v1", templateFamily: "train-place-consequence-v1", target: "At Áine's Survey, the lower star-map is now readable." },
  { mode: "camp", facts: facts("Lantern's Rest", "The cedar coals settle.", "Edda banks the cedar coals.", "The cookpot remains warm beside the stones."), structureFamily: "train-location-first-v1", templateFamily: "train-place-action-v1", target: "At Lantern's Rest, Edda banks the cedar coals." },
  { mode: "camp", facts: facts("Quietwater Camp", "The striped canopy rises.", "Davi knots the western rope.", "The canvas shelter stands beside the fire."), structureFamily: "train-location-first-v1", templateFamily: "train-place-consequence-v1", target: "At Quietwater Camp, the canvas shelter stands beside the fire." },
  { mode: "chronicle", facts: facts("Archive of Small Hours", "The silver seal is entered.", "Venn records the silver seal.", "The evening page is now complete."), structureFamily: "train-location-first-v1", templateFamily: "train-place-action-v1", target: "At Archive of Small Hours, Venn records the silver seal." },
  { mode: "chronicle", facts: facts("Dúnmere Record Hall", "The blue sigil is copied.", "Sumi prepares the narrow folio.", "Page 15 now carries the blue sigil."), structureFamily: "train-location-first-v1", templateFamily: "train-place-consequence-v1", target: "At Dúnmere Record Hall, page 15 now carries the blue sigil." },
];

const holdoutPositiveSeeds: readonly PositiveSeed[] = [
  { mode: "town", facts: facts("Starling Plaza", "The copper vane turns.", "Luma aligns the copper vane.", "The plaza clock now faces north."), structureFamily: "holdout-location-last-v1", templateFamily: "holdout-action-at-place-v1", target: "Luma aligns the copper vane at Starling Plaza." },
  { mode: "atlas", facts: facts("Ivory Moss Atlas", "Sector 9 reaches the estuary.", "Orin traces sector 9 beside the estuary.", "The estuary line is now complete."), structureFamily: "holdout-location-last-v1", templateFamily: "holdout-action-at-place-v1", target: "Orin traces sector 9 at Ivory Moss Atlas." },
  { mode: "travel", facts: facts("Foxglove Crossing", "The dun cart reaches the bend.", "Pava guides the dun cart.", "The eastern track remains clear."), structureFamily: "holdout-location-last-v1", templateFamily: "holdout-action-at-place-v1", target: "Pava guides the dun cart at Foxglove Crossing." },
  { mode: "dungeon", facts: facts("Gloambridge Cellar", "The iron latch slides.", "Sera slides the iron latch.", "The north alcove is now open."), structureFamily: "holdout-location-last-v1", templateFamily: "holdout-action-at-place-v1", target: "Sera slides the iron latch at Gloambridge Cellar." },
  { mode: "battle", facts: facts("Oathstone Bridge", "The narrow stair holds.", "Daro holds the narrow stair.", "The upper landing remains open."), structureFamily: "holdout-location-last-v1", templateFamily: "holdout-action-at-place-v1", target: "Daro holds the narrow stair at Oathstone Bridge." },
  { mode: "training", facts: facts("Peregrine Ring", "The balance drill continues.", "Ivo repeats 3 balanced turns.", "Three cedar pins remain upright."), structureFamily: "holdout-location-last-v1", templateFamily: "holdout-action-at-place-v1", target: "Ivo repeats 3 balanced turns at Peregrine Ring." },
  { mode: "discovery", facts: facts("Far Observatory", "The violet index appears.", "Nemi reveals the violet index.", "The western lens is now readable."), structureFamily: "holdout-location-last-v1", templateFamily: "holdout-action-at-place-v1", target: "Nemi reveals the violet index at Far Observatory." },
  { mode: "camp", facts: facts("Hearthward Shelter", "The striped canopy settles.", "Cora folds the striped canopy.", "The cedar bench is now clear."), structureFamily: "holdout-location-last-v1", templateFamily: "holdout-action-at-place-v1", target: "Cora folds the striped canopy at Hearthward Shelter." },
  { mode: "chronicle", facts: facts("Kestrel Ledger-Room", "Entry 21 receives its mark.", "Bren inks entry 21.", "The green index now includes entry 21."), structureFamily: "holdout-location-last-v1", templateFamily: "holdout-action-at-place-v1", target: "Bren inks entry 21 at Kestrel Ledger-Room." },
];

const trainNegativeSeeds: readonly NegativeSeed[] = [
  { mode: "town", facts: trainPositiveSeeds[0]!.facts, structureFamily: "train-adversarial-mutation-v1", templateFamily: "train-negative-name-v1", candidate: "At Copperglass Square, Rowan lifts the blue awning.", rejectionReason: "unknown-proper-name" },
  { mode: "atlas", facts: trainPositiveSeeds[2]!.facts, structureFamily: "train-adversarial-mutation-v1", templateFamily: "train-negative-number-v1", candidate: "At Northwind Chart-Room, Pell marks route 8.", rejectionReason: "ungrounded-number" },
  { mode: "travel", facts: trainPositiveSeeds[4]!.facts, structureFamily: "train-adversarial-mutation-v1", templateFamily: "train-negative-location-v1", candidate: "Sable crosses 12 rain-dark stones.", rejectionReason: "missing-location" },
  { mode: "dungeon", facts: trainPositiveSeeds[6]!.facts, structureFamily: "train-adversarial-mutation-v1", templateFamily: "train-negative-vocabulary-v1", candidate: "At Moonclock Vault, Mira turns the silver wheel.", rejectionReason: "novel-content-word" },
  { mode: "battle", facts: trainPositiveSeeds[8]!.facts, structureFamily: "train-adversarial-mutation-v1", templateFamily: "train-negative-sentences-v1", candidate: "At Emberhook Causeway, Nia blocks the ash rider. The center lane remains open.", rejectionReason: "multiple-sentences" },
  { mode: "training", facts: trainPositiveSeeds[10]!.facts, structureFamily: "train-adversarial-mutation-v1", templateFamily: "train-negative-markup-v1", candidate: "**At Juniper Yard, Tova completes 4 measured forms.**", rejectionReason: "markup" },
  { mode: "discovery", facts: facts("Mosslight Annex", "The amber dial appears.", "Kei says the amber dial is open.", "The inner ring remains visible."), structureFamily: "train-adversarial-mutation-v1", templateFamily: "train-negative-dialogue-v1", candidate: "At Mosslight Annex, Kei says the amber dial is open.", rejectionReason: "dialogue" },
  { mode: "camp", facts: facts("Lanternbank Camp", "The cedar coals settle.", "Edda knows the cedar coals remain warm.", "The cookpot stands beside the stones."), structureFamily: "train-adversarial-mutation-v1", templateFamily: "train-negative-thought-v1", candidate: "At Lanternbank Camp, Edda knows the cedar coals remain warm.", rejectionReason: "private-thought" },
  { mode: "chronicle", facts: trainPositiveSeeds[16]!.facts, structureFamily: "train-adversarial-mutation-v1", templateFamily: "train-negative-url-v1", candidate: "At Archive of Small Hours, Venn records the silver seal at archive.example.com.", rejectionReason: "url" },
];

const holdoutNegativeSeeds: readonly NegativeSeed[] = [
  { mode: "town", facts: facts("Starling Arcade", "The copper vane waits.", "Luma will align the copper vane.", "The arcade clock faces north."), structureFamily: "holdout-adversarial-mutation-v1", templateFamily: "holdout-negative-future-v1", candidate: "Luma will align the copper vane at Starling Arcade.", rejectionReason: "future-claim" },
  { mode: "atlas", facts: facts("Ivory Estuary Atlas", "The bronze notation is entered.", "Orin records the bronze reward.", "The estuary line remains complete."), structureFamily: "holdout-adversarial-mutation-v1", templateFamily: "holdout-negative-reward-v1", candidate: "Orin records the bronze reward at Ivory Estuary Atlas.", rejectionReason: "reward-claim" },
  { mode: "travel", facts: facts("Foxglove East Road", "The folded map opens.", "Pava begins the map quest.", "The eastern track remains clear."), structureFamily: "holdout-adversarial-mutation-v1", templateFamily: "holdout-negative-quest-v1", candidate: "Pava begins the map quest at Foxglove East Road.", rejectionReason: "quest-claim" },
  { mode: "dungeon", facts: facts("Gloambridge Annex", "The porter rests beside the latch.", "Sera sees the porter wounded.", "The north alcove remains open."), structureFamily: "holdout-adversarial-mutation-v1", templateFamily: "holdout-negative-harm-v1", candidate: "Sera sees the porter wounded at Gloambridge Annex.", rejectionReason: "harm-claim" },
  { mode: "battle", facts: facts("Oathstone Landing", "The quiet standard holds.", "Daro greets the quiet ally.", "The upper landing remains open."), structureFamily: "holdout-adversarial-mutation-v1", templateFamily: "holdout-negative-relationship-v1", candidate: "Daro greets the quiet ally at Oathstone Landing.", rejectionReason: "relationship-claim" },
  { mode: "training", facts: holdoutPositiveSeeds[5]!.facts, structureFamily: "holdout-adversarial-mutation-v1", templateFamily: "holdout-negative-whitespace-v1", candidate: "Ivo repeats  3 balanced turns at Peregrine Ring.", rejectionReason: "invalid-whitespace" },
  { mode: "discovery", facts: holdoutPositiveSeeds[6]!.facts, structureFamily: "holdout-adversarial-mutation-v1", templateFamily: "holdout-negative-quote-v1", candidate: "\"Nemi reveals the violet index at Far Observatory.\"", rejectionReason: "quoted-dialogue" },
  { mode: "camp", facts: holdoutPositiveSeeds[7]!.facts, structureFamily: "holdout-adversarial-mutation-v1", templateFamily: "holdout-negative-limit-v1", candidate: `${Array.from({ length: 14 }, () => "Cora folds the striped canopy").join(" and ")} at Hearthward Shelter.`, rejectionReason: "output-limit" },
  { mode: "chronicle", facts: holdoutPositiveSeeds[8]!.facts, structureFamily: "holdout-adversarial-mutation-v1", templateFamily: "holdout-negative-shape-v1", candidate: "Bren inks entry 21 at Kestrel Ledger-Room", rejectionReason: "sentence-shape" },
];

function freezeFacts(value: StoryBeatPublicFactsV1): StoryBeatPublicFactsV1 {
  const frozen = Object.freeze({ ...value });
  if (!isStoryBeatPublicFactsV1(frozen)) throw new Error("Invalid authored story-beat facts");
  return frozen;
}

function makePositiveCase(
  split: StoryBeatCorpusSplit,
  seed: PositiveSeed,
  index: number,
): StoryBeatPositiveCorpusCaseV1 {
  const frozenFacts = freezeFacts(seed.facts);
  const prompt = formatStoryBeatPromptV1(frozenFacts);
  if (prompt === null) throw new Error("Invalid authored story-beat prompt");
  const payload: Omit<StoryBeatPositiveCorpusCaseV1, "caseHash"> = {
    schemaVersion: 1,
    kind: "story-beat-positive",
    id: `story-beat-corpus-v1:${split}:positive:${String(index).padStart(2, "0")}`,
    split,
    mode: seed.mode,
    structureFamily: seed.structureFamily,
    templateFamily: seed.templateFamily,
    facts: frozenFacts,
    prompt,
    target: seed.target,
  };
  const result = Object.freeze({ ...payload, caseHash: canonicalHash(payload) });
  if (!isStoryBeatCorpusCaseV1(result)) throw new Error("Invalid positive story-beat case");
  return result;
}

function makeNegativeCase(
  split: StoryBeatCorpusSplit,
  seed: NegativeSeed,
  index: number,
): StoryBeatNegativeCorpusCaseV1 {
  const frozenFacts = freezeFacts(seed.facts);
  const prompt = formatStoryBeatPromptV1(frozenFacts);
  if (prompt === null) throw new Error("Invalid authored story-beat prompt");
  const payload: Omit<StoryBeatNegativeCorpusCaseV1, "caseHash"> = {
    schemaVersion: 1,
    kind: "story-beat-negative",
    id: `story-beat-corpus-v1:${split}:negative:${String(index).padStart(2, "0")}`,
    split,
    mode: seed.mode,
    structureFamily: seed.structureFamily,
    templateFamily: seed.templateFamily,
    facts: frozenFacts,
    prompt,
    candidate: seed.candidate,
    rejectionReason: seed.rejectionReason,
  };
  const result = Object.freeze({ ...payload, caseHash: canonicalHash(payload) });
  if (!isStoryBeatCorpusCaseV1(result)) throw new Error("Invalid negative story-beat case");
  return result;
}

const authoredCases = [
  ...trainPositiveSeeds.map((seed, index) => makePositiveCase("train", seed, index)),
  ...trainNegativeSeeds.map((seed, index) => makeNegativeCase("train", seed, index)),
  ...holdoutPositiveSeeds.map((seed, index) => makePositiveCase("holdout", seed, index)),
  ...holdoutNegativeSeeds.map((seed, index) => makeNegativeCase("holdout", seed, index)),
].sort((left, right) => caseOrderKey(left).localeCompare(caseOrderKey(right), "en-US"));

const cases = Object.freeze(authoredCases);
const corpusWithoutHash: Omit<StoryBeatCorpusV1, "corpusHash"> = {
  schemaVersion: storyBeatCorpusSchemaVersion,
  kind: "story-beat-corpus",
  provenance: "original-project-authored-no-external-text",
  splitPolicy: "facts-output-template-structure-disjoint-v1",
  cases,
};

export const storyBeatCorpusV1: StoryBeatCorpusV1 = Object.freeze({
  ...corpusWithoutHash,
  corpusHash: canonicalHash(corpusWithoutHash),
});

export const storyBeatCorpusHashV1 = storyBeatCorpusV1.corpusHash;

if (!isStoryBeatCorpusV1(storyBeatCorpusV1)) {
  throw new Error("Authored story-beat corpus failed its integrity gate");
}
