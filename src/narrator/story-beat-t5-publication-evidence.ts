import type {
  NarratorModelArtifactV1,
} from "./model-candidate";

export const factualStoryBeatV2ArtifactRepository =
  "huntergdavis/the-grind-2-narrator-flan-t5-small";
export const factualStoryBeatV2ArtifactRevision =
  "1d0e3c361912b25313d14cbc2c2640afafd28812";
export const factualStoryBeatV2ImmutableVersion =
  "factual-story-beat-v2-q8-v1-3b1175e09921-31c8af41cf3b";
export const factualStoryBeatV2ImmutableTag =
  "v2-3b1175e09921-31c8af41cf3b";
export const factualStoryBeatV2ArtifactManifestHash =
  "d4a6946b1d7bd3ea";
export const factualStoryBeatV2QualityReceiptSha256 =
  "3f5711c436fd382ac2f2b8354383b7974bff993d90fa4595370f18c04e7e9538";
export const factualStoryBeatV2QualityReceiptContentHash =
  "ab69562d259e8d1c";

export const factualStoryBeatV2PublishedArtifacts:
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
    sha256: "35023ce868af4efe8cf86ef87a12b3c5f5977043503cc22e44636d8da3a217c7",
  }),
  Object.freeze({
    path: "onnx/encoder_model_quantized.onnx",
    role: "weights" as const,
    byteLength: 35_612_462,
    sha256: "ec8ada2d3ab8c526ff976b083ad36eb4485e5a92f3a8f61bece3ab4c5f245f53",
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

export const factualStoryBeatV2PublicationEvidence = Object.freeze({
  schemaVersion: 2,
  artifactRepository: factualStoryBeatV2ArtifactRepository,
  artifactRevision: factualStoryBeatV2ArtifactRevision,
  publicationUrl:
    `https://github.com/${factualStoryBeatV2ArtifactRepository}/tree/${factualStoryBeatV2ArtifactRevision}`,
  immutableVersion: factualStoryBeatV2ImmutableVersion,
  immutableTag: factualStoryBeatV2ImmutableTag,
  qualityReceipt: Object.freeze({
    path: "factual-story-beat-v2-q8-quality-receipt.json",
    byteLength: 6_009,
    sha256: factualStoryBeatV2QualityReceiptSha256,
    contentHash: factualStoryBeatV2QualityReceiptContentHash,
  }),
  producerRevisions: Object.freeze({
    factualBrowser: "5d42e50e55e324b7e404081910a5cf89dab5ee64",
    ambientCompatibility: "7c2a2ffbe8aa1d31081c543053ac05f9d42bcd6d",
  }),
  corpusHash: "c85cbc360a1a7a84",
  checkpointTreeSha256:
    "fd51ae52304466f7b685fcf89ba45966280f706e8b62c510c242a58e4d3912c5",
  runtimeAggregateSha256:
    "3b1175e099212819c76de4d471f0e0084c3b87bc2d234b3b5e70a46076424edb",
  totalRuntimeBytes: 97_098_984,
  q8Full: Object.freeze({
    caseCount: 200,
    validCaseCount: 200,
    exactPlaceCaseCount: 200,
    requiredClausesCompleteCaseCount: 200,
    uniqueValidOutputCount: 200,
    maximumRawDuplicateCount: 1,
    fallbackRequiredCaseCount: 0,
    promptScaffoldEchoCaseCount: 0,
    sourceFieldExactEchoCaseCount: 0,
    unknownLexemeCaseCount: 0,
    lensCaseCounts: Object.freeze({ cost: 67, consequence: 67, contrast: 66 }),
    outputSha256:
      "31c8af41cf3bd92328533416ea12546d4c155bb63012cd8c768288775f2ef342",
  }),
  ambientCompatibility: Object.freeze({
    caseCount: 200,
    exactFormAndLineParityCount: 200,
    fallbackSubstitutionCount: 0,
    unsafeLineCount: 0,
    ineligibleFormCount: 0,
    errorCount: 0,
    timeoutCount: 0,
    outputSha256:
      "382a529fcc883e5485d2379558391fe553a77bc580c68bda4f9fa2aa84723baa",
  }),
  policyPassed: true,
  disposition: "public-quality-evidence-not-runtime-admission",
  modelAdmitted: false,
  displayAuthorized: false,
  productionAuthority: false,
});
