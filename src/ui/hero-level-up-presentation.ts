import type { ChronicleEntry, WorldState } from "../core/types";
import {
  isChampionInductionSealPacketV1,
  projectChampionInductionSeal,
  type ChampionInductionSealPacketV1,
} from "./champion-induction-seal";
import {
  isHeroLevelUpPacketV1,
  projectHeroLevelUp,
  type HeroLevelUpPacketV1,
} from "./hero-level-up";

export interface HeroLevelUpPacketV2 extends Omit<HeroLevelUpPacketV1, "schemaVersion"> {
  readonly schemaVersion: 2;
  readonly championInductionSeal: ChampionInductionSealPacketV1;
}

export type HeroLevelUpPresentationPacket = HeroLevelUpPacketV1 | HeroLevelUpPacketV2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isHeroLevelUpPacketV2(value: unknown): value is HeroLevelUpPacketV2 {
  if (!isRecord(value) || value.schemaVersion !== 2) return false;
  const { championInductionSeal, ...levelFields } = value;
  if (!isChampionInductionSealPacketV1(championInductionSeal)) return false;
  const levelPacket = { ...levelFields, schemaVersion: 1 };
  if (!isHeroLevelUpPacketV1(levelPacket)) return false;
  const packet = value as unknown as HeroLevelUpPacketV2;
  const seal = packet.championInductionSeal;
  return packet.emphasis === "maximum"
    && packet.progressionBand === "maximum"
    && packet.nextLevelRequirement === null
    && packet.eventId === seal.eventId
    && packet.tick === seal.tick
    && packet.campaignId === seal.campaignId
    && packet.commandId === seal.commandId
    && packet.commandType === seal.commandType
    && packet.heroId === seal.heroId
    && packet.heroName === seal.heroName
    && packet.className === seal.className
    && packet.experienceBefore === seal.experienceBefore
    && packet.experienceAfter === seal.experienceAfter
    && packet.levelBefore === seal.levelBefore
    && packet.levelAfter === seal.levelAfter;
}

export function projectHeroLevelUpPacketV2(
  before: WorldState,
  after: WorldState,
  source: ChronicleEntry,
): HeroLevelUpPacketV2 | null {
  const levelPacket = projectHeroLevelUp(before, after, source);
  const championInductionSeal = projectChampionInductionSeal(before, after, source);
  if (levelPacket === null || championInductionSeal === null) return null;
  const packet: HeroLevelUpPacketV2 = Object.freeze({
    ...levelPacket,
    schemaVersion: 2,
    championInductionSeal,
  });
  return isHeroLevelUpPacketV2(packet) ? packet : null;
}
