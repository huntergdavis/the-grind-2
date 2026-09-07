import type { CreativeStoryFocus } from "./creative-story";
import type { FirstSharedVictory } from "./first-shared-victory";
import { captureStoryDuet, type StoryDuet } from "./story-duet";

// Original authored interiority, not dialogue, durable feelings, combat credit, or promises about recovery.
const healthy = [
  {
    hero: "I want to trust this small warmth without turning it into a promise.",
    companion: "I hope I can belong here without becoming someone braver than I am.",
  },
  {
    hero: "I am relieved, and a little afraid of how much this company already matters.",
    companion: "I want room for my doubts, even while I enjoy feeling useful.",
  },
  {
    hero: "I hope confidence can grow without making me careless with another person's trust.",
    companion: "I feel proud, but I still want the freedom to be uncertain.",
  },
] as const;

const injured = [
  {
    hero: "I wish relief could make more room for the worry I cannot put down.",
    companion: "I hurt, but I want to be seen as more than something fragile.",
  },
  {
    hero: "I am glad we won, yet I cannot make concern feel like celebration.",
    companion: "I want help without having to surrender every stubborn piece of myself.",
  },
  {
    hero: "I hope caring can be gentle without sounding like pity.",
    companion: "I fear becoming a burden, though part of me still wants to feel proud.",
  },
] as const;

/** The host supplies a verified milestone; only Shared road receives this authored recovery treatment. */
export function createStoryDuetVignette(
  packet: FirstSharedVictory | null,
  focus: CreativeStoryFocus,
  identity: string,
  attempt: number,
): Readonly<{ duet: StoryDuet; tone: "trust" | "care" }> | null {
  if (packet === null || packet.kind !== "first-shared-victory" || focus !== "shared-road"
    || (packet.condition !== "healthy" && packet.condition !== "injured")) return null;
  const entries = packet.condition === "injured" ? injured : healthy;
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index++) hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619) >>> 0;
  const rotation = Number.isSafeInteger(attempt) && attempt >= 0 ? attempt % entries.length : 0;
  const entry = entries[(hash % entries.length + rotation) % entries.length]!;
  return Object.freeze({
    duet: captureStoryDuet({
      kind: "inner-voices",
      hero: { name: packet.heroName, text: entry.hero },
      companion: { name: packet.companionName, text: entry.companion },
    }),
    tone: packet.condition === "injured" ? "care" : "trust",
  });
}
