import { canonicalHash } from "../core/canonical";
import type { SceneMode } from "../core/types";
import {
  formatStoryBeatPromptV1,
  isStoryBeatPublicFactsV1,
  validateStoryBeatResultV1,
  type StoryBeatPublicFactsV1,
} from "./story-beat";

export const storyBeatTrainingCorpusSchemaVersion = 1 as const;
export const storyBeatTrainingCorpusRequiredTrainCases = 1_000;
export const storyBeatTrainingCorpusRequiredDevCases = 128;
export const storyBeatTrainingCorpusRequiredHoldoutCases = 200;
export const storyBeatTrainingCorpusRequiredCases = 1_328;

export const storyBeatTrainingCorpusSplits = Object.freeze([
  "train",
  "dev",
  "holdout",
] as const);
export type StoryBeatTrainingCorpusSplit = (typeof storyBeatTrainingCorpusSplits)[number];

export const storyBeatTrainingLocationShells = Object.freeze([
  "prefix",
  "interior",
  "suffix",
] as const);
export type StoryBeatTrainingLocationShell =
  (typeof storyBeatTrainingLocationShells)[number];

export interface StoryBeatTrainingCaseV1 {
  readonly schemaVersion: 1;
  readonly kind: "story-beat-training-positive";
  readonly id: string;
  readonly split: StoryBeatTrainingCorpusSplit;
  readonly familyId: string;
  readonly targetTemplateFamilyId: string;
  readonly locationShellId: StoryBeatTrainingLocationShell;
  readonly mode: SceneMode;
  readonly actor: string;
  readonly facts: StoryBeatPublicFactsV1;
  readonly prompt: string;
  readonly promptCharacters: number;
  readonly target: string;
  readonly caseHash: string;
}

export interface StoryBeatTrainingCorpusCountsV1 {
  readonly train: 1_000;
  readonly dev: 128;
  readonly holdout: 200;
  readonly total: 1_328;
}

export interface StoryBeatTrainingCorpusV1 {
  readonly schemaVersion: 1;
  readonly kind: "story-beat-training-corpus";
  readonly provenance: "original-project-authored-combinatorial-no-external-text";
  readonly splitPolicy: "actor-location-content-and-target-family-disjoint-v1";
  readonly holdoutPolicy: "sealed-holdout-only-never-training-v1";
  readonly counts: StoryBeatTrainingCorpusCountsV1;
  readonly cases: readonly StoryBeatTrainingCaseV1[];
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

const requiredSplitCounts: Readonly<Record<StoryBeatTrainingCorpusSplit, number>> = Object.freeze({
  train: storyBeatTrainingCorpusRequiredTrainCases,
  dev: storyBeatTrainingCorpusRequiredDevCases,
  holdout: storyBeatTrainingCorpusRequiredHoldoutCases,
});

const caseKeys = Object.freeze([
  "schemaVersion",
  "kind",
  "id",
  "split",
  "familyId",
  "targetTemplateFamilyId",
  "locationShellId",
  "mode",
  "actor",
  "facts",
  "prompt",
  "promptCharacters",
  "target",
  "caseHash",
] as const);

const countKeys = Object.freeze(["train", "dev", "holdout", "total"] as const);

const corpusKeys = Object.freeze([
  "schemaVersion",
  "kind",
  "provenance",
  "splitPolicy",
  "holdoutPolicy",
  "counts",
  "cases",
  "corpusHash",
] as const);

const unsafeUnicode = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const wordPattern = /[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu;

// These are deliberate sentence-frame words, not authored story content.
const sharedGrammarWords = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "beside",
  "in",
  "inside",
  "into",
  "its",
  "near",
  "of",
  "on",
  "remain",
  "remains",
  "the",
  "through",
  "to",
  "while",
  "with",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function isSplit(value: unknown): value is StoryBeatTrainingCorpusSplit {
  return value === "train" || value === "dev" || value === "holdout";
}

function isMode(value: unknown): value is SceneMode {
  return typeof value === "string" && sceneModes.includes(value as SceneMode);
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{16}$/u.test(value);
}

function isActor(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 80
    && value.trim() === value
    && value.normalize("NFC") === value
    && !unsafeUnicode.test(value)
    && /^[\p{L}\p{M}]+(?:[-'’ ][\p{L}\p{M}]+)*$/u.test(value);
}

function isCaseId(value: unknown, split: StoryBeatTrainingCorpusSplit): value is string {
  return typeof value === "string"
    && new RegExp(`^story-beat-training-corpus-v1:${split}:\\d{4}$`, "u").test(value);
}

function isFamilyId(
  value: unknown,
  split: StoryBeatTrainingCorpusSplit,
  mode: SceneMode,
): value is string {
  return typeof value === "string"
    && value.length <= 96
    && new RegExp(`^${split}-${mode}-[a-z0-9]+(?:-[a-z0-9]+)*-family-v1$`, "u").test(value);
}

function isTargetTemplateFamilyId(
  value: unknown,
  split: StoryBeatTrainingCorpusSplit,
  mode: SceneMode,
): value is string {
  return typeof value === "string"
    && value.length <= 96
    && new RegExp(`^${split}-${mode}-frame-(?:0[1-9]|1[0-5])-target-v1$`, "u").test(value);
}

function isLocationShellId(value: unknown): value is StoryBeatTrainingLocationShell {
  return value === "prefix" || value === "interior" || value === "suffix";
}

function targetMatchesLocationShell(
  target: string,
  location: string,
  shell: StoryBeatTrainingLocationShell,
): boolean {
  if (shell === "prefix") return target.startsWith(`At ${location}, `);
  if (shell === "suffix") return target.endsWith(` at ${location}.`);
  return target.includes(` at ${location}, `)
    || target.includes(` at ${location}; `)
    || target.includes(` at ${location} and `);
}

function casePayload(value: StoryBeatTrainingCaseV1): Omit<StoryBeatTrainingCaseV1, "caseHash"> {
  return {
    schemaVersion: value.schemaVersion,
    kind: value.kind,
    id: value.id,
    split: value.split,
    familyId: value.familyId,
    targetTemplateFamilyId: value.targetTemplateFamilyId,
    locationShellId: value.locationShellId,
    mode: value.mode,
    actor: value.actor,
    facts: value.facts,
    prompt: value.prompt,
    promptCharacters: value.promptCharacters,
    target: value.target,
  };
}

function corpusPayload(
  value: StoryBeatTrainingCorpusV1,
): Omit<StoryBeatTrainingCorpusV1, "corpusHash"> {
  return {
    schemaVersion: value.schemaVersion,
    kind: value.kind,
    provenance: value.provenance,
    splitPolicy: value.splitPolicy,
    holdoutPolicy: value.holdoutPolicy,
    counts: value.counts,
    cases: value.cases,
  };
}

export function isStoryBeatTrainingCaseV1(value: unknown): value is StoryBeatTrainingCaseV1 {
  try {
    if (
      !isRecord(value)
      || !hasExactKeys(value, caseKeys)
      || value.schemaVersion !== storyBeatTrainingCorpusSchemaVersion
      || value.kind !== "story-beat-training-positive"
      || !isSplit(value.split)
      || !isMode(value.mode)
    ) return false;

    const split = value.split;
    const mode = value.mode;
    if (
      !isCaseId(value.id, split)
      || !isFamilyId(value.familyId, split, mode)
      || !isTargetTemplateFamilyId(value.targetTemplateFamilyId, split, mode)
      || !isLocationShellId(value.locationShellId)
      || !isActor(value.actor)
      || !isStoryBeatPublicFactsV1(value.facts)
      || !value.facts.action.startsWith(`${value.actor} `)
      || typeof value.prompt !== "string"
      || value.prompt !== formatStoryBeatPromptV1(value.facts)
      || !Number.isSafeInteger(value.promptCharacters)
      || value.promptCharacters !== value.prompt.length
      || typeof value.target !== "string"
      || validateStoryBeatResultV1(value.target, value.facts) !== value.target
      || !targetMatchesLocationShell(value.target, value.facts.location, value.locationShellId)
      || !isHash(value.caseHash)
    ) return false;

    return value.caseHash === canonicalHash(casePayload(value as unknown as StoryBeatTrainingCaseV1));
  } catch {
    return false;
  }
}

function words(value: string): readonly string[] {
  return [...value.matchAll(wordPattern)].map((match) => match[0].toLocaleLowerCase("en-US"));
}

function contentVocabulary(value: StoryBeatTrainingCaseV1): ReadonlySet<string> {
  const metadataWords = new Set(words(`${value.actor} ${value.facts.location}`));
  return new Set(
    words(`${value.facts.headline} ${value.facts.action} ${value.facts.consequence}`)
      .filter((word) =>
        !metadataWords.has(word)
        && !sharedGrammarWords.has(word)
        && !/^\p{N}+$/u.test(word)),
  );
}

function disjoint(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return [...left].every((value) => !right.has(value));
}

function pairwiseDisjoint(values: readonly ReadonlySet<string>[]): boolean {
  return values.every((left, leftIndex) =>
    values.every((right, rightIndex) => leftIndex >= rightIndex || disjoint(left, right)));
}

function splitFields(
  cases: readonly StoryBeatTrainingCaseV1[],
  split: StoryBeatTrainingCorpusSplit,
) {
  const selected = cases.filter((entry) => entry.split === split);
  const content = new Set<string>();
  for (const entry of selected) {
    for (const word of contentVocabulary(entry)) content.add(word);
  }
  return {
    actors: new Set(selected.map((entry) => entry.actor.toLocaleLowerCase("en-US"))),
    locations: new Set(selected.map((entry) => entry.facts.location.toLocaleLowerCase("en-US"))),
    content,
    families: new Set(selected.map((entry) => entry.familyId)),
    targetFamilies: new Set(selected.map((entry) => entry.targetTemplateFamilyId)),
  };
}

function hasDisjointSplits(cases: readonly StoryBeatTrainingCaseV1[]): boolean {
  const groups = storyBeatTrainingCorpusSplits.map((split) => splitFields(cases, split));
  return pairwiseDisjoint(groups.map((group) => group.actors))
    && pairwiseDisjoint(groups.map((group) => group.locations))
    && pairwiseDisjoint(groups.map((group) => group.content))
    && pairwiseDisjoint(groups.map((group) => group.families))
    && pairwiseDisjoint(groups.map((group) => group.targetFamilies));
}

function hasExactCounts(value: unknown): value is StoryBeatTrainingCorpusCountsV1 {
  return isRecord(value)
    && hasExactKeys(value, countKeys)
    && value.train === storyBeatTrainingCorpusRequiredTrainCases
    && value.dev === storyBeatTrainingCorpusRequiredDevCases
    && value.holdout === storyBeatTrainingCorpusRequiredHoldoutCases
    && value.total === storyBeatTrainingCorpusRequiredCases;
}

function hasExpectedOrder(cases: readonly StoryBeatTrainingCaseV1[]): boolean {
  let cursor = 0;
  for (const split of storyBeatTrainingCorpusSplits) {
    const count = requiredSplitCounts[split];
    for (let index = 0; index < count; index += 1) {
      const entry = cases[cursor];
      if (
        entry === undefined
        || entry.split !== split
        || entry.id !== `story-beat-training-corpus-v1:${split}:${String(index).padStart(4, "0")}`
      ) return false;
      cursor += 1;
    }
  }
  return cursor === cases.length;
}

export function isStoryBeatTrainingCorpusV1(value: unknown): value is StoryBeatTrainingCorpusV1 {
  try {
    if (
      !isRecord(value)
      || !hasExactKeys(value, corpusKeys)
      || value.schemaVersion !== storyBeatTrainingCorpusSchemaVersion
      || value.kind !== "story-beat-training-corpus"
      || value.provenance !== "original-project-authored-combinatorial-no-external-text"
      || value.splitPolicy !== "actor-location-content-and-target-family-disjoint-v1"
      || value.holdoutPolicy !== "sealed-holdout-only-never-training-v1"
      || !hasExactCounts(value.counts)
      || !Array.isArray(value.cases)
      || value.cases.length !== storyBeatTrainingCorpusRequiredCases
      || !value.cases.every(isStoryBeatTrainingCaseV1)
      || !isHash(value.corpusHash)
    ) return false;

    const cases = value.cases as StoryBeatTrainingCaseV1[];
    if (!hasExpectedOrder(cases)) return false;
    if (new Set(cases.map((entry) => entry.id)).size !== cases.length) return false;
    if (new Set(cases.map((entry) => entry.caseHash)).size !== cases.length) return false;
    if (new Set(cases.map((entry) => canonicalHash(entry.facts))).size !== cases.length) return false;
    if (new Set(cases.map((entry) =>
      canonicalHash({ prompt: entry.prompt, target: entry.target }))).size !== cases.length) return false;

    for (const split of storyBeatTrainingCorpusSplits) {
      const selected = cases.filter((entry) => entry.split === split);
      if (selected.length !== requiredSplitCounts[split]) return false;
      const modes = new Set(selected.map((entry) => entry.mode));
      if (!sceneModes.every((mode) => modes.has(mode))) return false;
      if (split === "holdout" && sceneModes.some((mode) =>
        selected.filter((entry) => entry.mode === mode).length < 20)) return false;
    }
    if (!hasDisjointSplits(cases)) return false;

    const snapshot: StoryBeatTrainingCorpusV1 = {
      schemaVersion: storyBeatTrainingCorpusSchemaVersion,
      kind: "story-beat-training-corpus",
      provenance: "original-project-authored-combinatorial-no-external-text",
      splitPolicy: "actor-location-content-and-target-family-disjoint-v1",
      holdoutPolicy: "sealed-holdout-only-never-training-v1",
      counts: value.counts,
      cases,
      corpusHash: value.corpusHash,
    };
    return value.corpusHash === canonicalHash(corpusPayload(snapshot));
  } catch {
    return false;
  }
}

interface ModeLexicon {
  readonly mode: SceneMode;
  readonly familyStem: string;
  readonly actorGiven: readonly [string, string];
  readonly actorFamily: readonly [string, string];
  readonly locationLead: readonly [string, string];
  readonly locationKind: readonly [string, string];
  readonly headlineAdjective: string;
  readonly headlineNoun: string;
  readonly actionVerb: string;
  readonly actionAdjective: string;
  readonly actionObject: string;
  readonly consequenceAdjective: string;
  readonly consequenceNoun: string;
}

const trainLexicons = Object.freeze([
  { mode: "town", familyStem: "copperspan", actorGiven: ["Aster", "Celyn"], actorFamily: ["Bramble", "Quill"], locationLead: ["Copper Span", "Bell Braid"], locationKind: ["Arcade", "Ward"], headlineAdjective: "vermilion", headlineNoun: "market bell", actionVerb: "arranges", actionAdjective: "braided", actionObject: "banners", consequenceAdjective: "sunlit", consequenceNoun: "stall fronts" },
  { mode: "atlas", familyStem: "sablechart", actorGiven: ["Borin", "Della"], actorFamily: ["Slate", "Pike"], locationLead: ["Sable Chart", "North Glass"], locationKind: ["Loft", "Survey"], headlineAdjective: "cobalt", headlineNoun: "way line", actionVerb: "etches", actionAdjective: "measured", actionObject: "chart marks", consequenceAdjective: "eastern", consequenceNoun: "grid leaves" },
  { mode: "travel", familyStem: "rainmile", actorGiven: ["Eris", "Faron"], actorFamily: ["Wren", "Moss"], locationLead: ["Rain Mile", "Fox Barrow"], locationKind: ["Crossing", "Turn"], headlineAdjective: "russet", headlineNoun: "trail post", actionVerb: "guides", actionAdjective: "weathered", actionObject: "carts", consequenceAdjective: "sheltered", consequenceNoun: "road bends" },
  { mode: "dungeon", familyStem: "moonvault", actorGiven: ["Galen", "Hesta"], actorFamily: ["Rook", "Vale"], locationLead: ["Moon Vault", "Gloam Lock"], locationKind: ["Underway", "Cellar"], headlineAdjective: "umber", headlineNoun: "key wheel", actionVerb: "turns", actionAdjective: "notched", actionObject: "lock plates", consequenceAdjective: "opened", consequenceNoun: "granite gates" },
  { mode: "battle", familyStem: "emberline", actorGiven: ["Iria", "Joren"], actorFamily: ["Thorn", "Kite"], locationLead: ["Ember Line", "Rook Span"], locationKind: ["Causeway", "Gate"], headlineAdjective: "scarlet", headlineNoun: "shield mark", actionVerb: "braces", actionAdjective: "angled", actionObject: "standards", consequenceAdjective: "guarded", consequenceNoun: "cross lanes" },
  { mode: "training", familyStem: "chalkcourt", actorGiven: ["Kesta", "Lio"], actorFamily: ["Lark", "Flint"], locationLead: ["Chalk Court", "Juniper Yard"], locationKind: ["Ring", "Court"], headlineAdjective: "ivory", headlineNoun: "chalk form", actionVerb: "repeats", actionAdjective: "balanced", actionObject: "stances", consequenceAdjective: "level", consequenceNoun: "practice boards" },
  { mode: "discovery", familyStem: "mosslight", actorGiven: ["Mara", "Nilo"], actorFamily: ["Sedge", "Crane"], locationLead: ["Moss Light", "Amber Star"], locationKind: ["Orrery", "Survey"], headlineAdjective: "amber", headlineNoun: "star index", actionVerb: "reveals", actionAdjective: "folded", actionObject: "dial rings", consequenceAdjective: "visible", consequenceNoun: "lens panes" },
  { mode: "camp", familyStem: "lanternrest", actorGiven: ["Orla", "Perrin"], actorFamily: ["Fern", "Dale"], locationLead: ["Lantern Rest", "Quiet Water"], locationKind: ["Camp", "Shelter"], headlineAdjective: "cedar", headlineNoun: "coal glow", actionVerb: "fastens", actionAdjective: "striped", actionObject: "canopies", consequenceAdjective: "warm", consequenceNoun: "hearth stones" },
  { mode: "chronicle", familyStem: "silverarchive", actorGiven: ["Quora", "Riven"], actorFamily: ["Reed", "Spar"], locationLead: ["Silver Archive", "Dun Mere"], locationKind: ["Record Hall", "Folio"], headlineAdjective: "silver", headlineNoun: "page crest", actionVerb: "inscribes", actionAdjective: "narrow", actionObject: "folio leaves", consequenceAdjective: "complete", consequenceNoun: "record leaves" },
] as const satisfies readonly ModeLexicon[]);

const devLexicons = Object.freeze([
  { mode: "town", familyStem: "azurecourt", actorGiven: ["Sora", "Tavin"], actorFamily: ["Umberly", "Yarrow"], locationLead: ["Azure Court", "Chime Walk"], locationKind: ["Plaza", "Terrace"], headlineAdjective: "azure", headlineNoun: "chime arch", actionVerb: "positions", actionAdjective: "tasseled", actionObject: "kiosk flags", consequenceAdjective: "bright", consequenceNoun: "courtyard rims" },
  { mode: "atlas", familyStem: "ochreatlas", actorGiven: ["Ulla", "Vero"], actorFamily: ["Zephyr", "Acorn"], locationLead: ["Ochre Atlas", "Meridian Moss"], locationKind: ["Gallery", "Cabinet"], headlineAdjective: "ochre", headlineNoun: "meridian thread", actionVerb: "plots", actionAdjective: "segmented", actionObject: "coast glyphs", consequenceAdjective: "mapped", consequenceNoun: "river folds" },
  { mode: "travel", familyStem: "indigoverge", actorGiven: ["Willa", "Xeno"], actorFamily: ["Birch", "Cairn"], locationLead: ["Indigo Verge", "Mile Whistle"], locationKind: ["Road", "Switch"], headlineAdjective: "indigo", headlineNoun: "mile ribbon", actionVerb: "steers", actionAdjective: "rainwashed", actionObject: "wagons", consequenceAdjective: "quiet", consequenceNoun: "verge paths" },
  { mode: "dungeon", familyStem: "pewterstair", actorGiven: ["Yara", "Ziven"], actorFamily: ["Dusk", "Elm"], locationLead: ["Pewter Stair", "Hinge Crypt"], locationKind: ["Vault", "Annex"], headlineAdjective: "pewter", headlineNoun: "hinge panel", actionVerb: "rotates", actionAdjective: "grooved", actionObject: "portcullises", consequenceAdjective: "cleared", consequenceNoun: "stairwells" },
  { mode: "battle", familyStem: "saffronward", actorGiven: ["Adra", "Belor"], actorFamily: ["Frost", "Grove"], locationLead: ["Saffron Ward", "Rampart Blue"], locationKind: ["Landing", "Bridge"], headlineAdjective: "saffron", headlineNoun: "ward emblem", actionVerb: "anchors", actionAdjective: "staggered", actionObject: "barricades", consequenceAdjective: "secured", consequenceNoun: "flank ways" },
  { mode: "training", familyStem: "lilacdrill", actorGiven: ["Cyra", "Demer"], actorFamily: ["Hearth", "Ibis"], locationLead: ["Lilac Drill", "Balance Grove"], locationKind: ["Yard", "Circle"], headlineAdjective: "lilac", headlineNoun: "drill pattern", actionVerb: "practices", actionAdjective: "centered", actionObject: "footwork forms", consequenceAdjective: "aligned", consequenceNoun: "marker slates" },
  { mode: "discovery", familyStem: "opalineglass", actorGiven: ["Elva", "Fenn"], actorFamily: ["Juniper", "Kestrel"], locationLead: ["Opaline Glass", "Prism Hollow"], locationKind: ["Observatory", "Rotunda"], headlineAdjective: "opaline", headlineNoun: "prism token", actionVerb: "uncovers", actionAdjective: "nested", actionObject: "orbit mirrors", consequenceAdjective: "readable", consequenceNoun: "scope sheets" },
  { mode: "camp", familyStem: "willowember", actorGiven: ["Gira", "Halen"], actorFamily: ["Lumen", "Nettle"], locationLead: ["Willow Ember", "Flysheet Green"], locationKind: ["Rest", "Haven"], headlineAdjective: "willow", headlineNoun: "ember cradle", actionVerb: "mends", actionAdjective: "patched", actionObject: "flysheets", consequenceAdjective: "calm", consequenceNoun: "cook hollows" },
  { mode: "chronicle", familyStem: "copperylog", actorGiven: ["Isla", "Jessa"], actorFamily: ["Oriel", "Plume"], locationLead: ["Coppery Log", "Docket Blue"], locationKind: ["Library", "Index"], headlineAdjective: "coppery", headlineNoun: "log sign", actionVerb: "copies", actionAdjective: "ruled", actionObject: "dockets", consequenceAdjective: "indexed", consequenceNoun: "archive cards" },
] as const satisfies readonly ModeLexicon[]);

const holdoutLexicons = Object.freeze([
  { mode: "town", familyStem: "goldensquare", actorGiven: ["Kael", "Luma"], actorFamily: ["Quartz", "Rowan"], locationLead: ["Golden Square", "Vane Market"], locationKind: ["Promenade", "Commons"], headlineAdjective: "golden", headlineNoun: "vane clock", actionVerb: "raises", actionAdjective: "ribboned", actionObject: "bazaar shades", consequenceAdjective: "open", consequenceNoun: "square edges" },
  { mode: "atlas", familyStem: "violetestuary", actorGiven: ["Miro", "Nara"], actorFamily: ["Starling", "Thistle"], locationLead: ["Violet Estuary", "Contour Bay"], locationKind: ["Atlas", "Chart Room"], headlineAdjective: "violet", headlineNoun: "contour arc", actionVerb: "maps", actionAdjective: "tidal", actionObject: "compass lines", consequenceAdjective: "finished", consequenceNoun: "estuary grids" },
  { mode: "travel", familyStem: "tawnypass", actorGiven: ["Oren", "Pava"], actorFamily: ["Vesper", "Willow"], locationLead: ["Tawny Pass", "Switch Stone"], locationKind: ["Trail", "Reach"], headlineAdjective: "tawny", headlineNoun: "switch stone", actionVerb: "steadies", actionAdjective: "windworn", actionObject: "pack animals", consequenceAdjective: "passable", consequenceNoun: "ridge routes" },
  { mode: "dungeon", familyStem: "basaltcell", actorGiven: ["Rhea", "Sena"], actorFamily: ["Xylo", "Yellowleaf"], locationLead: ["Basalt Cell", "Latch Deep"], locationKind: ["Underhall", "Chamber"], headlineAdjective: "basalt", headlineNoun: "latch disc", actionVerb: "slides", actionAdjective: "carved", actionObject: "threshold bars", consequenceAdjective: "vacant", consequenceNoun: "lower cells" },
  { mode: "battle", familyStem: "crimsonbridge", actorGiven: ["Tora", "Vika"], actorFamily: ["Ashby", "Bell"], locationLead: ["Crimson Bridge", "Spear Watch"], locationKind: ["Span", "Redoubt"], headlineAdjective: "crimson", headlineNoun: "spear device", actionVerb: "guards", actionAdjective: "offset", actionObject: "ramparts", consequenceAdjective: "firm", consequenceNoun: "bridge heads" },
  { mode: "training", familyStem: "coralbalance", actorGiven: ["Wyra", "Xara"], actorFamily: ["Clover", "Drift"], locationLead: ["Coral Balance", "Turn Step"], locationKind: ["Quadrangle", "Dojo"], headlineAdjective: "coral", headlineNoun: "balance gauge", actionVerb: "completes", actionAdjective: "poised", actionObject: "turn steps", consequenceAdjective: "upright", consequenceNoun: "maple pegs" },
  { mode: "discovery", familyStem: "tealsky", actorGiven: ["Yori", "Zara"], actorFamily: ["Echo", "Finch"], locationLead: ["Teal Sky", "Orrery Veil"], locationKind: ["Lookout", "Spire"], headlineAdjective: "teal", headlineNoun: "sky flare", actionVerb: "exposes", actionAdjective: "hidden", actionObject: "orrery bands", consequenceAdjective: "legible", consequenceNoun: "sky windows" },
  { mode: "camp", familyStem: "auburnbench", actorGiven: ["Abel", "Bina"], actorFamily: ["Glint", "Hazel"], locationLead: ["Auburn Bench", "Rain Cover"], locationKind: ["Bivouac", "Hearth"], headlineAdjective: "auburn", headlineNoun: "fire basket", actionVerb: "packs", actionAdjective: "canvas", actionObject: "rain covers", consequenceAdjective: "dry", consequenceNoun: "bench circles" },
  { mode: "chronicle", familyStem: "pearlledger", actorGiven: ["Ciro", "Dara"], actorFamily: ["Ivory", "Jade"], locationLead: ["Pearl Ledger", "Seal Mark"], locationKind: ["Registry", "Scriptorium"], headlineAdjective: "pearl", headlineNoun: "seal imprint", actionVerb: "enters", actionAdjective: "bound", actionObject: "registers", consequenceAdjective: "filed", consequenceNoun: "ledger pages" },
] as const satisfies readonly ModeLexicon[]);

const splitLexicons: Readonly<Record<StoryBeatTrainingCorpusSplit, readonly ModeLexicon[]>> =
  Object.freeze({
    train: trainLexicons,
    dev: devLexicons,
    holdout: holdoutLexicons,
  });

interface ContentVariants {
  readonly headline: readonly [string, string];
  readonly actionAdverb: readonly [string, string];
  readonly consequence: readonly [string, string];
  readonly headlineEnding: string;
  readonly consequenceEnding: string;
}

const splitContentVariants: Readonly<Record<StoryBeatTrainingCorpusSplit, ContentVariants>> =
  Object.freeze({
    train: {
      headline: ["lively", "resonant"],
      actionAdverb: ["carefully", "nimbly"],
      consequence: ["orderly", "welcoming"],
      headlineEnding: "comes into view",
      consequenceEnding: "remain sound",
    },
    dev: {
      headline: ["hushed", "rhythmic"],
      actionAdverb: ["patiently", "precisely"],
      consequence: ["restful", "prepared"],
      headlineEnding: "settles in place",
      consequenceEnding: "remain usable",
    },
    holdout: {
      headline: ["vivid", "ringing"],
      actionAdverb: ["gracefully", "surely"],
      consequence: ["durable", "even"],
      headlineEnding: "takes its station",
      consequenceEnding: "remain stable",
    },
  });

type TargetSource = "headline" | "action" | "consequence";

interface TargetFrame {
  readonly first: TargetSource;
  readonly join: "while" | "as" | "semicolon" | "and";
  readonly second: TargetSource;
}

const targetFrames = Object.freeze([
  { first: "action", join: "while", second: "consequence" },
  { first: "consequence", join: "while", second: "action" },
  { first: "headline", join: "while", second: "action" },
  { first: "action", join: "as", second: "headline" },
  { first: "headline", join: "as", second: "consequence" },
  { first: "consequence", join: "as", second: "headline" },
  { first: "action", join: "semicolon", second: "consequence" },
  { first: "consequence", join: "semicolon", second: "action" },
  { first: "headline", join: "semicolon", second: "action" },
  { first: "action", join: "semicolon", second: "headline" },
  { first: "headline", join: "semicolon", second: "consequence" },
  { first: "consequence", join: "semicolon", second: "headline" },
  { first: "action", join: "and", second: "consequence" },
  { first: "headline", join: "and", second: "action" },
  { first: "headline", join: "and", second: "consequence" },
] as const satisfies readonly TargetFrame[]);

function select<T>(values: readonly [T, T], index: number): T {
  return values[index % values.length]!;
}

function makeFacts(
  lexicon: ModeLexicon,
  actor: string,
  location: string,
  split: StoryBeatTrainingCorpusSplit,
  localIndex: number,
): StoryBeatPublicFactsV1 {
  const variants = splitContentVariants[split];
  const contentIndex = Math.floor(localIndex / 16);
  const headlineVariant = select(variants.headline, contentIndex);
  const actionAdverb = select(variants.actionAdverb, Math.floor(contentIndex / 2));
  const consequenceVariant = select(variants.consequence, Math.floor(contentIndex / 4));
  const count = localIndex % 10 === 0 ? 2 + (localIndex % 7) : null;
  const actionObject = count === null
    ? `the ${lexicon.actionAdjective} ${lexicon.actionObject}`
    : `${count} ${lexicon.actionAdjective} ${lexicon.actionObject}`;
  return {
    schemaVersion: 1,
    kind: "public-story-beat",
    location,
    headline: `The ${headlineVariant} ${lexicon.headlineAdjective} ${lexicon.headlineNoun} ${variants.headlineEnding}.`,
    action: `${actor} ${actionAdverb} ${lexicon.actionVerb} ${actionObject}.`,
    consequence: `The ${consequenceVariant} ${lexicon.consequenceAdjective} ${lexicon.consequenceNoun} ${variants.consequenceEnding}.`,
  };
}

function lowerInitial(value: string): string {
  return `${value[0]!.toLocaleLowerCase("en-US")}${value.slice(1, -1)}`;
}

function joinTargetFragments(
  first: string,
  join: TargetFrame["join"],
  second: string,
): string {
  if (join === "semicolon") return `${first}; ${second}`;
  if (join === "and") return `${first} and ${second}`;
  return `${first}, ${join} ${second}`;
}

function makeTarget(
  shell: StoryBeatTrainingLocationShell,
  frame: TargetFrame,
  facts: StoryBeatPublicFactsV1,
  location: string,
): string {
  const fragments: Readonly<Record<TargetSource, string>> = {
    headline: lowerInitial(facts.headline),
    action: facts.action.slice(0, -1),
    consequence: lowerInitial(facts.consequence),
  };
  const first = fragments[frame.first];
  const second = fragments[frame.second];
  if (shell === "prefix") {
    return `At ${location}, ${joinTargetFragments(first, frame.join, second)}.`;
  }
  if (shell === "suffix") {
    return `${joinTargetFragments(first, frame.join, second)} at ${location}.`;
  }
  const joined = frame.join === "semicolon"
    ? `${first} at ${location}; ${second}`
    : frame.join === "and"
      ? `${first} at ${location} and ${second}`
      : `${first} at ${location}, ${frame.join} ${second}`;
  return `${joined}.`;
}

function makeCase(
  split: StoryBeatTrainingCorpusSplit,
  index: number,
  modeIndex: number,
  localIndex: number,
): StoryBeatTrainingCaseV1 {
  const lexicon = splitLexicons[split][modeIndex]!;
  const actor = `${select(lexicon.actorGiven, localIndex)} ${select(lexicon.actorFamily, Math.floor(localIndex / 2))}`;
  const location = `${select(lexicon.locationLead, Math.floor(localIndex / 4))} ${select(lexicon.locationKind, Math.floor(localIndex / 8))}`;
  const facts = deepFreeze(makeFacts(lexicon, actor, location, split, localIndex));
  if (!isStoryBeatPublicFactsV1(facts)) throw new Error("Invalid generated story-beat facts");
  const prompt = formatStoryBeatPromptV1(facts);
  if (prompt === null) throw new Error("Invalid generated story-beat prompt");
  const frameIndex = index % targetFrames.length;
  const frame = targetFrames[frameIndex]!;
  const locationShellId =
    storyBeatTrainingLocationShells[
      (Math.floor(index / targetFrames.length) + frameIndex)
      % storyBeatTrainingLocationShells.length
    ]!;
  const target = makeTarget(locationShellId, frame, facts, location);
  const content: Omit<StoryBeatTrainingCaseV1, "caseHash"> = {
    schemaVersion: storyBeatTrainingCorpusSchemaVersion,
    kind: "story-beat-training-positive",
    id: `story-beat-training-corpus-v1:${split}:${String(index).padStart(4, "0")}`,
    split,
    familyId: `${split}-${lexicon.mode}-${lexicon.familyStem}-family-v1`,
    targetTemplateFamilyId: `${split}-${lexicon.mode}-frame-${String(frameIndex + 1).padStart(2, "0")}-target-v1`,
    locationShellId,
    mode: lexicon.mode,
    actor,
    facts,
    prompt,
    promptCharacters: prompt.length,
    target,
  };
  const result = deepFreeze({ ...content, caseHash: canonicalHash(content) });
  if (!isStoryBeatTrainingCaseV1(result)) throw new Error("Invalid generated story-beat case");
  return result;
}

function generateSplitCases(
  split: StoryBeatTrainingCorpusSplit,
): readonly StoryBeatTrainingCaseV1[] {
  const modeCounts = Array.from({ length: sceneModes.length }, () => 0);
  return Array.from({ length: requiredSplitCounts[split] }, (_, index) => {
    const modeIndex = (index + Math.floor(index / 3)) % sceneModes.length;
    const localIndex = modeCounts[modeIndex]!;
    modeCounts[modeIndex] = localIndex + 1;
    return makeCase(split, index, modeIndex, localIndex);
  });
}

const generatedCases = storyBeatTrainingCorpusSplits.flatMap(generateSplitCases);

const counts: StoryBeatTrainingCorpusCountsV1 = deepFreeze({
  train: storyBeatTrainingCorpusRequiredTrainCases,
  dev: storyBeatTrainingCorpusRequiredDevCases,
  holdout: storyBeatTrainingCorpusRequiredHoldoutCases,
  total: storyBeatTrainingCorpusRequiredCases,
});

const corpusWithoutHash: Omit<StoryBeatTrainingCorpusV1, "corpusHash"> = {
  schemaVersion: storyBeatTrainingCorpusSchemaVersion,
  kind: "story-beat-training-corpus",
  provenance: "original-project-authored-combinatorial-no-external-text",
  splitPolicy: "actor-location-content-and-target-family-disjoint-v1",
  holdoutPolicy: "sealed-holdout-only-never-training-v1",
  counts,
  cases: deepFreeze(generatedCases),
};

export const storyBeatTrainingCorpusV1: StoryBeatTrainingCorpusV1 = deepFreeze({
  ...corpusWithoutHash,
  corpusHash: canonicalHash(corpusWithoutHash),
});

export const storyBeatTrainingCorpusHashV1 = storyBeatTrainingCorpusV1.corpusHash;

if (!isStoryBeatTrainingCorpusV1(storyBeatTrainingCorpusV1)) {
  throw new Error("Generated story-beat training corpus failed its integrity gate");
}
