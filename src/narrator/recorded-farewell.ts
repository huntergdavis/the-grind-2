import type { CreativeStoryViewpoint } from "./creative-story";
import { isStoryBeatPublicFactsV1, type StoryBeatJobV1 } from "./story-beat";

/** Current public departure facts plus host identity; no reconstructed oath or private party packet. */
export interface RecordedFarewell {
  readonly kind: "recorded-farewell";
  readonly campaignId: string;
  readonly eventId: string;
  readonly tick: number;
  readonly heroName: string;
  readonly companionName: string;
  readonly condition: "healthy" | "injured";
  readonly facts: StoryBeatJobV1["facts"];
}

const unsafeText = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}<>`*_{}\[\]]|&(?:[a-z]{2,}|#(?:\d+|x[\da-f]+));/iu;
const publicText = (value: unknown, maximum: number): value is string => typeof value === "string"
  && value.length > 0 && value.length <= maximum && value === value.trim() && !unsafeText.test(value);

export function captureRecordedFarewell(value: RecordedFarewell): RecordedFarewell {
  return Object.freeze({ kind: value.kind, campaignId: value.campaignId, eventId: value.eventId, tick: value.tick,
    heroName: value.heroName, companionName: value.companionName, condition: value.condition,
    facts: Object.freeze({ schemaVersion: value.facts.schemaVersion, kind: value.facts.kind,
      location: value.facts.location, headline: value.facts.headline,
      action: value.facts.action, consequence: value.facts.consequence }) });
}

/** Bind only an exact current canonical departure to a solo narration request. */
export function bindRecordedFarewell(
  value: RecordedFarewell | undefined | null,
  job: StoryBeatJobV1 | null,
  viewpoint: CreativeStoryViewpoint | null | undefined,
): RecordedFarewell | null {
  try {
    if (value?.kind !== "recorded-farewell" || job === null || viewpoint?.companion !== null
      || !publicText(value.campaignId, 160) || !publicText(value.eventId, 200)
      || !publicText(value.heroName, 128) || !publicText(value.companionName, 128)
      || !Number.isSafeInteger(value.tick) || value.tick < 0
      || value.campaignId !== job.campaignId || value.eventId !== job.eventId || value.tick !== job.tick
      || value.heroName !== viewpoint.hero.name || !["healthy", "injured"].includes(value.condition)
      || !isStoryBeatPublicFactsV1(value.facts) || !isStoryBeatPublicFactsV1(job.facts)
      || !["location", "headline", "action", "consequence"].every((field) => {
        const key = field as "location" | "headline" | "action" | "consequence";
        return value.facts[key] === job.facts[key] && !unsafeText.test(value.facts[key]);
      }) || value.facts.headline !== `${value.companionName}'s Shared Road Oath is complete.`) return null;
    const prefix = `${value.companionName} departs ${value.condition === "healthy" ? "in good health" : "wounded but alive"} after `;
    if (!value.facts.action.startsWith(prefix)) return null;
    const victories = /^(0|[1-9]\d*) shared (victory|victories)\.$/u.exec(value.facts.action.slice(prefix.length));
    if (victories === null || !Number.isSafeInteger(Number(victories[1]))
      || victories[2] !== (Number(victories[1]) === 1 ? "victory" : "victories")) return null;
    return captureRecordedFarewell(value);
  } catch {
    return null;
  }
}
