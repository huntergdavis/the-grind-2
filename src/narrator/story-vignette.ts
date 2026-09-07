import type {
  CreativeStoryFocus,
  CreativeStoryInspirationTone,
  CreativeStoryViewpoint,
} from "./creative-story";
import { createHeroInnerLifeVoice } from "./story-voice";

export interface StoryVignette {
  readonly id: string;
  readonly text: string;
  readonly tone: CreativeStoryInspirationTone;
}

interface VignetteTemplate {
  readonly id: string;
  readonly render: (hero: string, companion: string) => string;
}

// Original authored interpretations, never model prose, recorded feelings, or new game events.
const innerLife: readonly VignetteTemplate[] = [
  {
    id: "inner-life-unlit-lantern",
    render: (hero) => `For ${hero}, hope felt less like a lantern than the small, stubborn wish to light one. `
      + "Doubt stayed close, but wanting something still seemed worth the risk.",
  },
  {
    id: "inner-life-private-measure",
    render: (hero) => `${hero} wanted to feel equal to the moment, and distrusted how badly that mattered. `
      + "Beneath the wish to seem certain lay a quieter hope: that uncertainty need not mean inadequacy.",
  },
  {
    id: "inner-life-room-for-questions",
    render: (hero) => `${hero}'s thoughts seemed crowded with questions, each one asking for more room than it needed. `
      + "Curiosity pulled one way and caution another, leaving a strange, almost tender patience between them.",
  },
  {
    id: "inner-life-two-wishes",
    render: (hero) => `Part of ${hero} longed for certainty; another part feared how little room certainty might leave for wonder. `
      + "The two wishes sat uneasily together, neither quite willing to make way.",
  },
];

type CompanionStatus = NonNullable<CreativeStoryViewpoint["companion"]>["status"];

const sharedRoad: Readonly<Record<CompanionStatus, readonly VignetteTemplate[]>> = {
  travelling: [
    {
      id: "shared-road-separate-silences",
      render: (hero, companion) => `${hero} found an odd comfort in sharing the road with ${companion}, even while some thoughts remained difficult to share. `
        + "Companionship could feel like shelter without making the world beyond it any less uncertain.",
    },
    {
      id: "shared-road-weight-of-company",
      render: (hero, companion) => `${companion}'s place beside ${hero} made the shared-road oath feel both reassuring and weighty. `
        + "Hope leaned toward what company might offer; caution kept a little space for all that neither could promise.",
    },
    {
      id: "shared-road-welcome-with-questions",
      render: (hero, companion) => `For ${hero}, the thought of sharing the road with ${companion} held a quiet warmth and an awkward question. `
        + "It was possible to welcome company and still wonder how much of oneself to let it see.",
    },
  ],
  arrived: [
    {
      id: "arrival-unfastened-knot",
      render: (hero, companion) => `${hero} and ${companion} had reached the oath's destination, yet relief did not feel as simple as an ending. `
        + "The uncertainty ahead gave their shared arrival a tenderness that certainty might have missed.",
    },
    {
      id: "arrival-room-for-a-question",
      render: (hero, companion) => `For ${hero}, relief at arriving with ${companion} shared its space with a question about what this moment meant. `
        + "Reaching the oath's destination made room for that question without supplying its answer.",
    },
    {
      id: "arrival-tangled-gratitude",
      render: (hero, companion) => `${hero} could feel gratitude and reluctance tangled together at the oath's destination with ${companion}. `
        + "Arrival was real; whatever might come after it was still only a thought.",
    },
  ],
  injured: [
    {
      id: "injury-hope-without-answers",
      render: (hero, companion) => `${companion}'s injury gave ${hero}'s concern a sharp edge, even within the quieter wish to be reassuring. `
        + "Hope was there too, but it had no answers to offer and no right to pretend otherwise.",
    },
    {
      id: "injury-no-neat-boundary",
      render: (hero, companion) => `${hero} wanted there to be some neat boundary around the worry for injured ${companion}. `
        + "Instead, care and helplessness seemed to occupy the same small space, neither canceling the other.",
    },
    {
      id: "injury-weight-of-an-oath",
      render: (hero, companion) => `With ${companion} injured, ${hero} felt the shared-road oath as something heavier than a destination. `
        + "Wanting to be dependable did not make uncertainty disappear; it only made that uncertainty harder to dismiss.",
    },
  ],
  "arrived-injured": [
    {
      id: "injured-arrival-room-for-worry",
      render: (hero, companion) => `${hero} and injured ${companion} were at the oath's destination, but relief still had to make room for worry. `
        + "An arrival could be real without answering every fear within it.",
    },
    {
      id: "injured-arrival-two-true-feelings",
      render: (hero, companion) => `Reaching the oath's destination with injured ${companion} left ${hero} caught between gratitude and concern. `
        + "Neither feeling was a mistake, and neither could tell what would happen next.",
    },
    {
      id: "injured-arrival-partly-loosened",
      render: (hero, companion) => `At the oath's destination, ${hero}'s relief for the arrival sat uneasily beside concern for injured ${companion}. `
        + "The moment felt like a knot loosened in one place and still held tight in another.",
    },
  ],
};

/** A finite authored fallback from captured focus, hero values and public companion status. */
export function createStoryVignette({ viewpoint, focus, identity, attempt }: {
  readonly viewpoint: CreativeStoryViewpoint | null;
  readonly focus: CreativeStoryFocus;
  readonly identity: string;
  readonly attempt: number;
}): Readonly<StoryVignette> | null {
  if (viewpoint === null || focus === "scene") return null;
  if (focus === "inner-life") {
    const voice = createHeroInnerLifeVoice(viewpoint.hero.values, viewpoint.hero.name, identity, attempt);
    if (voice !== null) return Object.freeze({ id: voice.id, text: voice.text, tone: "neutral" });
  }
  const companion = viewpoint.companion;
  const templates = focus === "inner-life" ? innerLife
    : focus === "shared-road" && companion !== null ? sharedRoad[companion.status] : undefined;
  if (templates === undefined || templates.length === 0) return null;

  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619) >>> 0;
  }
  const rotation = Number.isSafeInteger(attempt) && attempt >= 0 ? attempt % templates.length : 0;
  const template = templates[(hash % templates.length + rotation) % templates.length]!;
  const tone: CreativeStoryInspirationTone = focus === "inner-life" ? "neutral"
    : companion?.status === "injured" || companion?.status === "arrived-injured" ? "care" : "trust";
  return Object.freeze({
    id: template.id,
    text: template.render(viewpoint.hero.name, companion?.name ?? ""),
    tone,
  });
}
