import { heroGrowthCheckpointLevels } from "../core/hero-growth";
import type {
  DetailedHeroState,
  HeroAttributes,
  HeroGrowthRecord,
  HeroGrowthState,
} from "../depth/types";

const attributeDefinitions = [
  ["strength", "STR"],
  ["agility", "AGI"],
  ["vitality", "VIT"],
  ["intellect", "INT"],
  ["spirit", "SPI"],
  ["luck", "LCK"],
] as const satisfies readonly (readonly [keyof HeroAttributes, string])[];

const derivedDefinitions = [
  ["power", "POW"],
  ["armor", "ARM"],
  ["initiative", "INIT"],
  ["maxHealth", "MAX HP"],
  ["maxMana", "MAX MP"],
] as const;

export interface HeroGrowthAttributeProjection {
  key: keyof HeroAttributes;
  label: string;
  baseline: number;
  current: number;
}

export interface HeroGrowthCheckpointProjection {
  checkpointLevel: 10 | 25 | 50;
  state: "settled" | "held" | "ahead";
  mark: "✓" | "…" | "○";
  label: string;
}

export interface HeroGrowthRecordProjection {
  id: string;
  tick: number;
  checkpointLevel: 10 | 25 | 50;
  packageId: HeroGrowthRecord["selectedPackageId"];
  packageLabel: string;
  rationale: string;
  attributeFacts: readonly string[];
  derivedFacts: readonly string[];
  healthFact: string;
  manaFact: string;
}

export interface HeroGrowthProjection {
  hudSummary: string;
  summary: string;
  checkpoints: readonly HeroGrowthCheckpointProjection[];
  attributes: readonly HeroGrowthAttributeProjection[];
  records: readonly HeroGrowthRecordProjection[];
}

function projectRecord(record: HeroGrowthRecord): HeroGrowthRecordProjection {
  const selected = record.candidates.find((candidate) => candidate.packageId === record.selectedPackageId);
  if (selected === undefined) throw new TypeError("Hero growth record has no selected candidate");
  const attributeFacts = attributeDefinitions.flatMap(([key, label]) => selected.attributeDeltas[key] === 0
    ? []
    : [`${label} ${record.attributesBefore[key]}→${selected.attributesAfter[key]}`]);
  const derivedFacts = derivedDefinitions.map(([key, label]) => {
    const before = record.derivedBefore[key];
    const after = selected.derivedAfter[key];
    return `${label} ${before}→${after}${before === after ? " STAYS" : ""}`;
  });
  return Object.freeze({
    id: record.id,
    tick: record.tick,
    checkpointLevel: record.checkpointLevel,
    packageId: record.selectedPackageId,
    packageLabel: selected.label,
    rationale: record.rationale,
    attributeFacts: Object.freeze(attributeFacts),
    derivedFacts: Object.freeze(derivedFacts),
    healthFact: `HP ${record.resourcesBefore.health}→${selected.resourcesAfter.health} STAYS · MAX HP ${record.resourcesBefore.maxHealth}→${selected.resourcesAfter.maxHealth}`,
    manaFact: `MP ${record.resourcesBefore.mana}→${selected.resourcesAfter.mana} STAYS · MAX MP ${record.resourcesBefore.maxMana}→${selected.resourcesAfter.maxMana}`,
  });
}

export function projectHeroGrowth(growth: HeroGrowthState, hero: DetailedHeroState): HeroGrowthProjection {
  const records = Object.freeze(growth.records.map(projectRecord));
  const checkpoints = Object.freeze(heroGrowthCheckpointLevels.map((checkpointLevel): HeroGrowthCheckpointProjection => {
    const record = records.find((candidate) => candidate.checkpointLevel === checkpointLevel);
    if (record !== undefined) return Object.freeze({ checkpointLevel, state: "settled", mark: "✓", label: `${record.packageLabel} · SETTLED` });
    if (growth.pendingTriggers.some((trigger) => trigger.checkpointLevel === checkpointLevel)) return Object.freeze({ checkpointLevel, state: "held", mark: "…", label: "HELD · encounter resolving" });
    if (growth.settledCheckpointLevels.includes(checkpointLevel)) return Object.freeze({ checkpointLevel, state: "settled", mark: "✓", label: "SETTLED · prior save" });
    return Object.freeze({ checkpointLevel, state: "ahead", mark: "○", label: "AHEAD" });
  }));
  const latest = records.at(-1);
  const held = checkpoints.find((checkpoint) => checkpoint.state === "held");
  const settledCount = checkpoints.filter((checkpoint) => checkpoint.state === "settled").length;
  const hudSummary = latest !== undefined
    ? `TURNING POINT ${latest.checkpointLevel} ✓ ${latest.packageLabel.toUpperCase()}`
    : held !== undefined
      ? `TURNING POINT ${held.checkpointLevel} … HELD`
      : `TURNING POINTS · ${settledCount}/3 SETTLED`;
  return Object.freeze({
    hudSummary,
    summary: held !== undefined
      ? `A Level ${held.checkpointLevel} choice is held until the active encounter ends; no stats have changed yet.`
      : `${settledCount} of 3 permanent growth choices settled. Current HP and MP never refill during growth.`,
    checkpoints,
    attributes: Object.freeze(attributeDefinitions.map(([key, label]) => Object.freeze({
      key,
      label,
      baseline: growth.baselineAttributes[key],
      current: hero.attributes[key],
    }))),
    records,
  });
}
