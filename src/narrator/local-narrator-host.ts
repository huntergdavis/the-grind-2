import type { NarratorHostTokenMeter } from "./narrator-client";
import type { NarratorExperimentalModelPolicyV1 } from "./experimental-policy";
import {
  localNarratorArtifactManifestHash,
  localNarratorDisclosedDownloadBytes,
  localNarratorModelRepository,
  localNarratorModelRevision,
  localNarratorStoredWeightBytes,
} from "./local-model-assets";
import {
  isNarratorPromptV1,
  narratorMaximumInputTokens,
  type NarratorPromptV1,
} from "./protocol";
import {
  isStoryBeatPublicFactsV1,
  storyBeatMaximumInputTokens,
  type StoryBeatPublicFactsV1,
} from "./story-beat";

export const localNarratorExperimentalPolicy = Object.freeze({
  schemaVersion: 1,
  kind: "experimental-unrated",
  modelId: localNarratorModelRepository,
  revision: localNarratorModelRevision,
  artifactManifestHash: localNarratorArtifactManifestHash,
  license: "Apache-2.0",
  storedWeightBytes: localNarratorStoredWeightBytes,
  disclosedDownloadBytes: localNarratorDisclosedDownloadBytes,
  sourceEvidenceDisposition: "blocked",
  humanQualityEvaluated: false,
  modelAdmitted: false,
  formalDisplayAuthorized: false,
  productionAuthority: false,
} as const satisfies NarratorExperimentalModelPolicyV1);

/**
 * The host performs structural admission without duplicating the pinned
 * tokenizer in the main thread. A valid prompt is charged the full protocol
 * budget; the isolated worker performs the exact token count before inference.
 */
export const localNarratorHostTokenMeter: NarratorHostTokenMeter = Object.freeze({
  countInput: (prompt: NarratorPromptV1) => isNarratorPromptV1(prompt)
    ? narratorMaximumInputTokens
    : 0,
  countStoryBeatInput: (facts: StoryBeatPublicFactsV1) => isStoryBeatPublicFactsV1(facts)
    ? storyBeatMaximumInputTokens
    : 0,
});
