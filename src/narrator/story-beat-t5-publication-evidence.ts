import type {
  NarratorModelArtifactV1,
} from "./model-candidate";

export const storyBeatTunedQ8ArtifactRepositoryV1 =
  "huntergdavis/the-grind-2-narrator-flan-t5-small";
export const storyBeatTunedQ8ArtifactRevisionV1 =
  "edf60fc44500b19407f6216e1777c3e34224b937";
export const storyBeatTunedQ8ImmutableVersionV1 =
  "story-beat-tuned-q8-v1-604eb51fc38b-29902ecd077b";
export const storyBeatTunedQ8ImmutableTagV1 =
  "v1-604eb51fc38b-29902ecd077b";
export const storyBeatTunedQ8ArtifactManifestHashV1 =
  "b045f9a847bce554";
export const storyBeatTunedQ8QualityReceiptSha256V1 =
  "b11a1efcbc007f7b23073a36f406bed4c5d80415bc8fff550a78d7a8542aa30d";
export const storyBeatTunedQ8QualityReceiptContentHashV1 =
  "ff5b8afb83369d92";

export const storyBeatTunedQ8PublishedArtifactsV1:
readonly NarratorModelArtifactV1[] = Object.freeze([
  Object.freeze({
    path: "config.json",
    role: "configuration" as const,
    byteLength: 1_506,
    sha256: "f8045e716db6684883b20b6274c39cf59e6e84c148542d33c6d01de7574b6b18",
  }),
  Object.freeze({
    path: "generation_config.json",
    role: "configuration" as const,
    byteLength: 142,
    sha256: "8145d7eecabff8e16a9876617a6d52728e9b8fbe24c426e6bf9ebbd6bfb87737",
  }),
  Object.freeze({
    path: "onnx/decoder_model_merged_quantized.onnx",
    role: "weights" as const,
    byteLength: 59_041_810,
    sha256: "cc1b8d2b96ca051d06d47e9db1b1f1f0c131a6d2e6141b067ab9254c0545c36a",
  }),
  Object.freeze({
    path: "onnx/encoder_model_quantized.onnx",
    role: "weights" as const,
    byteLength: 35_612_462,
    sha256: "f8c68d0cd1f8773f3ae01a693f38dcffb6052dfb6566c52f633c16b49b6cc6fa",
  }),
  Object.freeze({
    path: "tokenizer.json",
    role: "tokenizer" as const,
    byteLength: 2_422_234,
    sha256: "4d4b21a8cc7c0407dafd8ac6215269cd05c8e49a521c3580479b567879526160",
  }),
  Object.freeze({
    path: "tokenizer_config.json",
    role: "tokenizer" as const,
    byteLength: 20_830,
    sha256: "26c1243c486c113e7017520b95ef2e82a7fc64d2b79f857759b4d51de0fb8b70",
  }),
]);

export const storyBeatTunedQ8PublicationEvidenceV1 = Object.freeze({
  schemaVersion: 1,
  artifactRepository: storyBeatTunedQ8ArtifactRepositoryV1,
  artifactRevision: storyBeatTunedQ8ArtifactRevisionV1,
  publicationUrl:
    `https://github.com/${storyBeatTunedQ8ArtifactRepositoryV1}/tree/${storyBeatTunedQ8ArtifactRevisionV1}`,
  immutableVersion: storyBeatTunedQ8ImmutableVersionV1,
  immutableTag: storyBeatTunedQ8ImmutableTagV1,
  qualityReceipt: Object.freeze({
    path: "story-beat-tuned-q8-quality-receipt.json",
    byteLength: 18_549,
    sha256: storyBeatTunedQ8QualityReceiptSha256V1,
    contentHash: storyBeatTunedQ8QualityReceiptContentHashV1,
  }),
  producerRevision: "fdffb538496e0157beecb614ee0266f3dfdd7b47",
  checkpointTreeSha256:
    "a75485e0e5e400b664ef321d45b90dadc2e12a2f064a865c589c319b7e8597e7",
  runtimeAggregateSha256:
    "604eb51fc38bad9ea14993e541a6a6677eee8042b42d9a00481e0e13e9230c38",
  totalRuntimeBytes: 97_098_984,
  q8Full: Object.freeze({
    caseCount: 200,
    validCaseCount: 200,
    uniqueValidOutputCount: 200,
    delexicalizedShapeCount: 62,
    maximumShapeFrequency: 11,
    fallbackRequiredCaseCount: 0,
    promptScaffoldEchoCaseCount: 0,
    sourceFieldExactEchoCaseCount: 0,
    unknownLexemeCaseCount: 0,
    outputHash:
      "29902ecd077b1bbc094fa3dd64af190a90dd56d3c47e630da3fdf1e4b6831def",
  }),
  policyGateCount: 27,
  policyPassed: true,
  disposition: "public-quality-evidence-not-runtime-admission",
  modelAdmitted: false,
  displayAuthorized: false,
});
