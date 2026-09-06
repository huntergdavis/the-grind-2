import {
  isStoryBeatJobV1,
  isStoryBeatPublicFactsV1,
  storyBeatMaximumInputTokens,
  validateStoryBeatResultV1,
  type StoryBeatJobV1,
  type StoryBeatPublicFactsV1,
} from "./story-beat";
import {
  factualStoryBeatMaximumInputTokens,
  isFactualStoryBeatJobV2,
  isFactualStoryBeatPublicFactsV2,
  validateFactualStoryBeatResultV2,
  type FactualStoryBeatJobV2,
  type FactualStoryBeatPublicFactsV2,
} from "./story-beat-v2";

export type StoryBeatAuthoringJob =
  | StoryBeatJobV1
  | FactualStoryBeatJobV2;

export type StoryBeatAuthoringFacts =
  | StoryBeatPublicFactsV1
  | FactualStoryBeatPublicFactsV2;

export function isStoryBeatAuthoringJob(
  value: unknown,
): value is StoryBeatAuthoringJob {
  return isStoryBeatJobV1(value) || isFactualStoryBeatJobV2(value);
}

export function isStoryBeatAuthoringFacts(
  value: unknown,
): value is StoryBeatAuthoringFacts {
  return isStoryBeatPublicFactsV1(value) || isFactualStoryBeatPublicFactsV2(value);
}

export function storyBeatAuthoringInputTokenLimit(
  facts: StoryBeatAuthoringFacts,
): typeof storyBeatMaximumInputTokens | typeof factualStoryBeatMaximumInputTokens {
  return isFactualStoryBeatPublicFactsV2(facts)
    ? factualStoryBeatMaximumInputTokens
    : storyBeatMaximumInputTokens;
}

export function storyBeatAuthoringNarrativeFacts(
  facts: StoryBeatAuthoringFacts,
): StoryBeatPublicFactsV1 {
  return isFactualStoryBeatPublicFactsV2(facts)
    ? facts.narrative
    : facts;
}

export function validateStoryBeatAuthoringResult(
  value: unknown,
  facts: StoryBeatAuthoringFacts,
): string | null {
  return isFactualStoryBeatPublicFactsV2(facts)
    ? validateFactualStoryBeatResultV2(value, facts)
    : validateStoryBeatResultV1(value, facts);
}
