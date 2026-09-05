import { describe, expect, it } from "vitest";
import { isNarratorExperimentalModelPolicyV1 } from "./experimental-policy";
import {
  localNarratorExperimentalPolicy,
  localNarratorHostTokenMeter,
} from "./local-narrator-host";
import {
  localNarratorArtifactManifestHash,
  localNarratorDisclosedDownloadBytes,
  localNarratorModelRepository,
  localNarratorModelRevision,
  localNarratorStoredWeightBytes,
} from "./local-model-assets";
import { narratorMaximumInputTokens, type NarratorPromptV1 } from "./protocol";
import {
  storyBeatMaximumInputTokens,
  type StoryBeatPublicFactsV1,
} from "./story-beat";

const prompt: NarratorPromptV1 = {
  schemaVersion: 1,
  task: "single-ambient-line",
  voice: "spare-observer-v1",
  move: "establish-setting",
  facts: {
    schemaVersion: 1,
    kind: "public-scene",
    sceneKind: "travel",
    place: "Juniper Watch",
    energy: "steady",
  },
};

const storyBeatFacts: StoryBeatPublicFactsV1 = {
  schemaVersion: 1,
  kind: "public-story-beat",
  location: "Juniper Watch",
  headline: "The western gate opens.",
  action: "Mira crosses the marked threshold.",
  consequence: "The western passage is now reachable.",
};

describe("local narrator host configuration", () => {
  it("binds the experimental policy to the exact cached artifact closure", () => {
    expect(isNarratorExperimentalModelPolicyV1(localNarratorExperimentalPolicy)).toBe(true);
    expect(localNarratorExperimentalPolicy).toMatchObject({
      modelId: localNarratorModelRepository,
      revision: localNarratorModelRevision,
      artifactManifestHash: localNarratorArtifactManifestHash,
      storedWeightBytes: localNarratorStoredWeightBytes,
      disclosedDownloadBytes: localNarratorDisclosedDownloadBytes,
      kind: "experimental-unrated",
      humanQualityEvaluated: false,
      modelAdmitted: false,
      formalDisplayAuthorized: false,
      productionAuthority: false,
    });
  });

  it("charges valid prompts the full host budget and rejects malformed prompts", async () => {
    expect(await localNarratorHostTokenMeter.countInput(prompt))
      .toBe(narratorMaximumInputTokens);
    expect(await localNarratorHostTokenMeter.countInput({
      ...prompt,
      facts: { ...prompt.facts, place: "" },
    } as NarratorPromptV1)).toBe(0);
    expect(await localNarratorHostTokenMeter.countStoryBeatInput?.(storyBeatFacts))
      .toBe(storyBeatMaximumInputTokens);
    expect(await localNarratorHostTokenMeter.countStoryBeatInput?.({
      ...storyBeatFacts,
      action: "",
    })).toBe(0);
  });
});
