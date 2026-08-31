import { canonicalHash, canonicalStringify } from "./canonical";
import { isValidChampionInduction } from "./champions";
import type {
  CampaignLegacyState,
  ChampionAbilityRecord,
  ChampionInduction,
  ChampionQualification,
  LegendCard,
} from "./types";

export const maximumCampaignLegends = 3;
export const maximumLegendCardBytes = 2_048;

type LegendCardContent = Omit<LegendCard, "id" | "contentHash">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function boundedString(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength;
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function contentOf(card: LegendCard): LegendCardContent {
  const { id: _id, contentHash: _contentHash, ...content } = card;
  return content;
}

function legendId(contentHash: string): string {
  return `legend:${contentHash}`;
}

function isValidSignatureAbility(value: unknown): value is ChampionAbilityRecord {
  if (!isRecord(value) || !hasExactKeys(value, ["abilityId", "abilityName", "kind", "effect", "level"])) return false;
  return boundedString(value.abilityId, 256) &&
    boundedString(value.abilityName, 120) &&
    (value.kind === "spell" || value.kind === "technique" || value.kind === "secret") &&
    (value.effect === "arcane" || value.effect === "burning" || value.effect === "poison" || value.effect === "weaken" || value.effect === "piercing") &&
    Number.isSafeInteger(value.level) &&
    (value.level as number) >= 1 &&
    (value.level as number) <= 20;
}

function createLegendCard(champion: ChampionInduction): LegendCard {
  const signatureAbility = champion.abilities[0];
  const content: LegendCardContent = {
    schemaVersion: 1,
    sourceChampionId: champion.id,
    sourceChampionHash: champion.contentHash,
    sourceCampaignId: champion.sourceCampaignId,
    sourceHeroId: champion.heroId,
    heroName: champion.heroName,
    className: champion.className,
    level: 1_000,
    qualification: champion.qualification,
    recordedTick: champion.recordedTick,
    signatureAbility: signatureAbility === undefined ? null : { ...signatureAbility },
  };
  const contentHash = canonicalHash(content);
  const card: LegendCard = { ...content, id: legendId(contentHash), contentHash };
  if (!isValidLegendCard(card)) throw new TypeError("Legend card exceeds the immutable v1 contract");
  return card;
}

export function isValidLegendCard(value: unknown): value is LegendCard {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion",
    "id",
    "contentHash",
    "sourceChampionId",
    "sourceChampionHash",
    "sourceCampaignId",
    "sourceHeroId",
    "heroName",
    "className",
    "level",
    "qualification",
    "recordedTick",
    "signatureAbility",
  ])) return false;
  if (
    value.schemaVersion !== 1 ||
    !boundedString(value.contentHash, 16) || !/^[0-9a-f]{16}$/.test(value.contentHash) ||
    value.id !== legendId(value.contentHash) ||
    !boundedString(value.sourceChampionHash, 16) || !/^[0-9a-f]{16}$/.test(value.sourceChampionHash) ||
    value.sourceChampionId !== `champion:${value.sourceChampionHash}` ||
    !boundedString(value.sourceCampaignId, 256) ||
    !boundedString(value.sourceHeroId, 256) ||
    !boundedString(value.heroName, 120) ||
    !boundedString(value.className, 80) ||
    value.level !== 1_000 ||
    (value.qualification !== "earned" && value.qualification !== "adopted") ||
    !nonNegativeSafeInteger(value.recordedTick) ||
    (value.signatureAbility !== null && !isValidSignatureAbility(value.signatureAbility))
  ) return false;
  const card = value as unknown as LegendCard;
  return card.contentHash === canonicalHash(contentOf(card)) &&
    new TextEncoder().encode(canonicalStringify(card)).byteLength <= maximumLegendCardBytes;
}

function selectionKey(
  campaignSeed: string,
  sourceChampionId: string,
  sourceChampionHash: string,
): string {
  return canonicalHash({
    selectorVersion: 1,
    campaignSeed,
    sourceChampionId,
    sourceChampionHash,
  });
}

function compareCards(campaignSeed: string, left: LegendCard, right: LegendCard): number {
  const leftKey = selectionKey(campaignSeed, left.sourceChampionId, left.sourceChampionHash);
  const rightKey = selectionKey(campaignSeed, right.sourceChampionId, right.sourceChampionHash);
  return (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0) ||
    (left.sourceChampionId < right.sourceChampionId ? -1 : left.sourceChampionId > right.sourceChampionId ? 1 : 0);
}

export function createCampaignLegacyState(
  campaignSeed: string,
  candidates: readonly unknown[] = [],
): CampaignLegacyState {
  const unique = new Map<string, ChampionInduction>();
  for (const candidate of candidates) {
    if (isValidChampionInduction(candidate) && !unique.has(candidate.id)) unique.set(candidate.id, candidate);
  }
  const cards = [...unique.values()]
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    .map(createLegendCard)
    .sort((left, right) => compareCards(campaignSeed, left, right))
    .slice(0, maximumCampaignLegends);
  return { schemaVersion: 1, selectorVersion: 1, cards };
}

export function isValidCampaignLegacyState(
  value: unknown,
  campaignSeed: string,
): value is CampaignLegacyState {
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "selectorVersion", "cards"])) return false;
  if (
    value.schemaVersion !== 1 ||
    value.selectorVersion !== 1 ||
    !Array.isArray(value.cards) ||
    value.cards.length > maximumCampaignLegends ||
    !value.cards.every(isValidLegendCard)
  ) return false;
  const cards = value.cards as unknown as LegendCard[];
  if (new Set(cards.map((card) => card.id)).size !== cards.length) return false;
  if (new Set(cards.map((card) => card.sourceChampionId)).size !== cards.length) return false;
  const expected = [...cards].sort((left, right) => compareCards(campaignSeed, left, right));
  return cards.every((card, index) => card.id === expected[index]?.id);
}

export function legendQualificationLabel(qualification: ChampionQualification): string {
  return qualification === "earned" ? "earned Champion" : "recovered Champion";
}
