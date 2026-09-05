export const localNarratorModelRepository = "huntergdavis/the-grind-2-narrator-flan-t5-small";
export const localNarratorModelRevision = "8c85146bbe1a9bcaa4b77faa2c7ef52b2e5b8dd4";
export const localNarratorArtifactManifestHash = "cd7b76c208b0aa3d";
export const localNarratorStoredWeightBytes = 97_082_423;
export const localNarratorDisclosedDownloadBytes = 120_696_862;

export type LocalNarratorAssetKind = "model" | "runtime";
export type LocalNarratorModelAssetRole = "configuration" | "tokenizer" | "weights";
export type LocalNarratorRuntimeAssetRole = "runtime-module" | "runtime-wasm";

export interface LocalNarratorModelArtifact {
  readonly kind: "model";
  readonly path: string;
  readonly role: LocalNarratorModelAssetRole;
  readonly byteLength: number;
  readonly sha256: string;
  readonly sourceUrl: string;
}

export interface LocalNarratorRuntimeArtifact {
  readonly kind: "runtime";
  readonly path: string;
  readonly role: LocalNarratorRuntimeAssetRole;
  readonly byteLength: number;
  readonly sha256: string;
}

export type LocalNarratorArtifact = LocalNarratorModelArtifact | LocalNarratorRuntimeArtifact;

const publishedRawRoot =
  `https://raw.githubusercontent.com/${localNarratorModelRepository}/${localNarratorModelRevision}/`;

export const localNarratorModelArtifacts: readonly LocalNarratorModelArtifact[] = Object.freeze([
  Object.freeze({
    kind: "model" as const,
    path: "config.json",
    role: "configuration" as const,
    byteLength: 1_401,
    sha256: "439aa0fecf5a5546a1def68b1fc45e538e2c94528ce805378daf091e2bf6e4de",
    sourceUrl: `${publishedRawRoot}config.json`,
  }),
  Object.freeze({
    kind: "model" as const,
    path: "generation_config.json",
    role: "configuration" as const,
    byteLength: 147,
    sha256: "f5a1c7e2be8092018d8835128987edf0111637dd98e90599cc80310fef75d95a",
    sourceUrl: `${publishedRawRoot}generation_config.json`,
  }),
  Object.freeze({
    kind: "model" as const,
    path: "onnx/decoder_model_merged_quantized.onnx",
    role: "weights" as const,
    byteLength: 59_041_810,
    sha256: "b311b1a2e1977d79613363959a03fc10db0829e1a317886a9f973630d811d648",
    sourceUrl: `${publishedRawRoot}onnx/decoder_model_merged_quantized.onnx`,
  }),
  Object.freeze({
    kind: "model" as const,
    path: "onnx/encoder_model_quantized.onnx",
    role: "weights" as const,
    byteLength: 35_612_462,
    sha256: "eb075ffa4c573796cf5a2c95197b4be7e2138552224ddeecca8a7454d218ab24",
    sourceUrl: `${publishedRawRoot}onnx/encoder_model_quantized.onnx`,
  }),
  Object.freeze({
    kind: "model" as const,
    path: "tokenizer.json",
    role: "tokenizer" as const,
    byteLength: 2_424_064,
    sha256: "fe2ebbbbde2985be723e0ce18217853e4020c5e9d35bd07be2c27ab9d3ead57a",
    sourceUrl: `${publishedRawRoot}tokenizer.json`,
  }),
  Object.freeze({
    kind: "model" as const,
    path: "tokenizer_config.json",
    role: "tokenizer" as const,
    byteLength: 2_539,
    sha256: "fcde0f79bffda3688119c94330866a8fbf8de20ae65a8c492c9bd47c704655a0",
    sourceUrl: `${publishedRawRoot}tokenizer_config.json`,
  }),
]);

export const localNarratorRuntimeArtifacts: readonly LocalNarratorRuntimeArtifact[] = Object.freeze([
  Object.freeze({
    kind: "runtime" as const,
    path: "ort-wasm-simd-threaded.asyncify.mjs",
    role: "runtime-module" as const,
    byteLength: 47_389,
    sha256: "5959c6733039619c9af710d8e1bae8d6e84402787990637be987c2b1bd6c5fa9",
  }),
  Object.freeze({
    kind: "runtime" as const,
    path: "ort-wasm-simd-threaded.asyncify.wasm",
    role: "runtime-wasm" as const,
    byteLength: 23_567_050,
    sha256: "e0c0c6d3e73d43b8a249972f8358f845b08cc16fec3c80efafdf8bed40366786",
  }),
]);

export const localNarratorAssetCacheName =
  `the-grind-2-local-narrator-v1-${localNarratorModelRevision}`;
export const localNarratorAssetCachePathPrefix =
  `/__the_grind_2_local_narrator__/v1/${localNarratorModelRevision}/`;
export const localNarratorLegacyAssetCacheNames: readonly string[] = Object.freeze([]);

export type LocalNarratorRuntimeAssetPath =
  | "ort-wasm-simd-threaded.asyncify.mjs"
  | "ort-wasm-simd-threaded.asyncify.wasm";

export interface LocalNarratorRuntimeSourceUrls {
  readonly "ort-wasm-simd-threaded.asyncify.mjs": string;
  readonly "ort-wasm-simd-threaded.asyncify.wasm": string;
}

export interface LocalNarratorAssetIdentity {
  readonly kind: LocalNarratorAssetKind;
  readonly path: string;
}

export interface LocalNarratorAssetProgress {
  readonly artifact: LocalNarratorAssetIdentity;
  readonly artifactIndex: number;
  readonly artifactCount: number;
  readonly source: "cache" | "network";
  readonly artifactBytes: number;
  readonly artifactTotalBytes: number;
  readonly totalBytes: number;
  readonly totalDownloadBytes: number;
}

interface LocalNarratorInspectionBase {
  readonly revision: string;
  readonly cachedBytes: number;
  readonly totalBytes: number;
  readonly missingArtifacts: readonly LocalNarratorAssetIdentity[];
  readonly corruptArtifacts: readonly LocalNarratorAssetIdentity[];
}

export type LocalNarratorAssetInspection =
  | (LocalNarratorInspectionBase & {
    readonly status: "complete";
  })
  | (LocalNarratorInspectionBase & {
    readonly status: "missing";
  })
  | (LocalNarratorInspectionBase & {
    readonly status: "corrupt";
  })
  | (LocalNarratorInspectionBase & {
    readonly status: "unsupported";
    readonly reason: "cache-storage-unavailable" | "origin-unavailable" | "web-crypto-unavailable";
  });

export interface LocalNarratorStagedArtifact {
  readonly path: string;
  readonly bytes: ArrayBuffer;
}

export interface LocalNarratorStagedAssets {
  readonly modelId: string;
  readonly revision: string;
  readonly totalBytes: number;
  readonly modelArtifacts: readonly LocalNarratorStagedArtifact[];
  readonly runtimeArtifacts: readonly LocalNarratorStagedArtifact[];
}

interface LocalNarratorCache {
  match(request: RequestInfo | URL): Promise<Response | undefined>;
  put(request: RequestInfo | URL, response: Response): Promise<void>;
}

export interface LocalNarratorCacheStorage {
  has(cacheName: string): Promise<boolean>;
  open(cacheName: string): Promise<LocalNarratorCache>;
  delete(cacheName: string): Promise<boolean>;
}

export interface LocalNarratorAssetStoreOptions {
  readonly runtimeSourceUrls?: LocalNarratorRuntimeSourceUrls;
  readonly fetch?: typeof globalThis.fetch | null;
  readonly cacheStorage?: LocalNarratorCacheStorage | null;
  readonly location?: Pick<Location, "origin"> | null;
  readonly crypto?: Pick<Crypto, "subtle"> | null;
}

export interface LocalNarratorAssetStore {
  inspect(): Promise<LocalNarratorAssetInspection>;
  download(
    signal: AbortSignal,
    onProgress?: (progress: LocalNarratorAssetProgress) => void,
  ): Promise<Extract<LocalNarratorAssetInspection, { readonly status: "complete" }>>;
  read(): Promise<LocalNarratorStagedAssets>;
  remove(): Promise<boolean>;
}

type LocalNarratorAssetStoreErrorCode =
  | "aborted"
  | "cache-corrupt"
  | "cache-missing"
  | "cache-read-failed"
  | "cache-write-failed"
  | "download-in-progress"
  | "fetch-failed"
  | "hash-mismatch"
  | "http-failed"
  | "invalid-manifest"
  | "length-mismatch"
  | "network-unavailable"
  | "runtime-source-unavailable"
  | "unsupported"
  | "verification-failed";

export class LocalNarratorAssetStoreError extends Error {
  constructor(
    readonly code: LocalNarratorAssetStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LocalNarratorAssetStoreError";
  }
}

interface LocalNarratorResolvedArtifact {
  readonly kind: LocalNarratorAssetKind;
  readonly path: string;
  readonly role: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly sourceUrl: string | null;
}

export interface LocalNarratorAssetStoreDefinition {
  readonly modelId: string;
  readonly revision: string;
  readonly cacheName: string;
  readonly cachePathPrefix: string;
  readonly legacyCacheNames: readonly string[];
  readonly totalBytes: number;
  readonly artifacts: readonly LocalNarratorResolvedArtifact[];
}

const safePathPattern =
  /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))(?!.*[\\:?#])[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const cacheNamePattern = /^[A-Za-z0-9._-]{1,180}$/u;
const cachePrefixPattern = /^\/[A-Za-z0-9._/-]{1,360}\/$/u;

function identity(artifact: LocalNarratorResolvedArtifact): LocalNarratorAssetIdentity {
  return Object.freeze({ kind: artifact.kind, path: artifact.path });
}

function encodeArtifactPath(path: string): string {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function validOrigin(rawOrigin: string | undefined): string | null {
  if (rawOrigin === undefined) return null;
  try {
    const url = new URL(rawOrigin);
    if ((url.protocol !== "https:" && url.protocol !== "http:")
      || url.username !== ""
      || url.password !== ""
      || url.pathname !== "/"
      || url.search !== ""
      || url.hash !== ""
      || url.origin !== rawOrigin) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function validateDefinition(
  definition: LocalNarratorAssetStoreDefinition,
): {
  readonly artifacts: readonly LocalNarratorResolvedArtifact[];
  readonly removableCacheNames: readonly string[];
} {
  const revisionIndex = typeof definition.cacheName === "string"
    && typeof definition.revision === "string"
    ? definition.cacheName.indexOf(definition.revision)
    : -1;
  if (typeof definition.modelId !== "string"
    || definition.modelId.length === 0
    || definition.modelId.length > 160
    || /[\t\n\r]/u.test(definition.modelId)
    || typeof definition.revision !== "string"
    || !/^[0-9a-f]{40}$/u.test(definition.revision)
    || !cacheNamePattern.test(definition.cacheName)
    || !definition.cacheName.includes(definition.revision)
    || revisionIndex < 0
    || revisionIndex !== definition.cacheName.lastIndexOf(definition.revision)
    || !cachePrefixPattern.test(definition.cachePathPrefix)
    || !definition.cachePathPrefix.includes(definition.revision)
    || !Array.isArray(definition.legacyCacheNames)
    || definition.legacyCacheNames.length > 8
    || !Number.isSafeInteger(definition.totalBytes)
    || definition.totalBytes <= 0
    || !Array.isArray(definition.artifacts)
    || definition.artifacts.length === 0
    || definition.artifacts.length > 16) {
    throw new LocalNarratorAssetStoreError("invalid-manifest", "Local narrator asset manifest is invalid");
  }

  const cachePrefix = definition.cacheName.slice(0, revisionIndex);
  const cacheSuffix = definition.cacheName.slice(revisionIndex + definition.revision.length);
  const legacyCacheNames: string[] = [];
  const seenCacheNames = new Set([definition.cacheName]);
  for (let index = 0; index < definition.legacyCacheNames.length; index += 1) {
    if (!Object.hasOwn(definition.legacyCacheNames, index)) {
      throw new LocalNarratorAssetStoreError("invalid-manifest", "Local narrator legacy cache list is sparse");
    }
    const cacheName = definition.legacyCacheNames[index];
    if (typeof cacheName !== "string") {
      throw new LocalNarratorAssetStoreError(
        "invalid-manifest",
        "Local narrator legacy cache namespace is invalid",
      );
    }
    const revisionEnd = cacheName.length - cacheSuffix.length;
    const legacyRevision = cacheName.slice(cachePrefix.length, revisionEnd);
    if (!cacheNamePattern.test(cacheName)
      || !cacheName.startsWith(cachePrefix)
      || !cacheName.endsWith(cacheSuffix)
      || !/^[0-9a-f]{40}$/u.test(legacyRevision)
      || seenCacheNames.has(cacheName)) {
      throw new LocalNarratorAssetStoreError(
        "invalid-manifest",
        "Local narrator legacy cache namespace is invalid",
      );
    }
    seenCacheNames.add(cacheName);
    legacyCacheNames.push(cacheName);
  }

  const artifacts: LocalNarratorResolvedArtifact[] = [];
  const identities = new Set<string>();
  let totalBytes = 0;
  for (let index = 0; index < definition.artifacts.length; index += 1) {
    if (!Object.hasOwn(definition.artifacts, index)) {
      throw new LocalNarratorAssetStoreError("invalid-manifest", "Local narrator asset manifest is sparse");
    }
    const artifact = definition.artifacts[index];
    if (artifact === undefined
      || (artifact.kind !== "model" && artifact.kind !== "runtime")
      || !safePathPattern.test(artifact.path)
      || typeof artifact.role !== "string"
      || artifact.role.length === 0
      || artifact.role.length > 80
      || !Number.isSafeInteger(artifact.byteLength)
      || artifact.byteLength <= 0
      || !sha256Pattern.test(artifact.sha256)
      || (artifact.sourceUrl !== null && typeof artifact.sourceUrl !== "string")) {
      throw new LocalNarratorAssetStoreError("invalid-manifest", "Local narrator artifact is invalid");
    }
    const key = `${artifact.kind}:\0${artifact.path}`;
    if (identities.has(key)) {
      throw new LocalNarratorAssetStoreError("invalid-manifest", "Local narrator artifact paths are duplicated");
    }
    identities.add(key);
    totalBytes += artifact.byteLength;
    if (!Number.isSafeInteger(totalBytes)) {
      throw new LocalNarratorAssetStoreError("invalid-manifest", "Local narrator byte total is invalid");
    }
    artifacts.push(Object.freeze({ ...artifact }));
  }
  if (totalBytes !== definition.totalBytes) {
    throw new LocalNarratorAssetStoreError("invalid-manifest", "Local narrator byte total does not match");
  }
  return Object.freeze({
    artifacts: Object.freeze(artifacts),
    removableCacheNames: Object.freeze([definition.cacheName, ...legacyCacheNames]),
  });
}

export function localNarratorAssetCacheKey(
  origin: string,
  artifact: LocalNarratorAssetIdentity,
  cachePathPrefix = localNarratorAssetCachePathPrefix,
): string {
  const trustedOrigin = validOrigin(origin);
  if (trustedOrigin === null
    || (artifact.kind !== "model" && artifact.kind !== "runtime")
    || !safePathPattern.test(artifact.path)
    || !cachePrefixPattern.test(cachePathPrefix)) {
    throw new LocalNarratorAssetStoreError("invalid-manifest", "Local narrator cache key is invalid");
  }
  return new URL(
    `${cachePathPrefix}${artifact.kind}/${encodeArtifactPath(artifact.path)}`,
    trustedOrigin,
  ).href;
}

function resolveDefaults(options: LocalNarratorAssetStoreOptions): {
  readonly fetch: typeof globalThis.fetch | null;
  readonly cacheStorage: LocalNarratorCacheStorage | null;
  readonly location: Pick<Location, "origin"> | null;
  readonly crypto: Pick<Crypto, "subtle"> | null;
} {
  const fetchFunction = Object.hasOwn(options, "fetch")
    ? options.fetch ?? null
    : typeof globalThis.fetch === "function"
      ? globalThis.fetch.bind(globalThis)
      : null;
  const cacheStorage = Object.hasOwn(options, "cacheStorage")
    ? options.cacheStorage ?? null
    : typeof globalThis.caches === "object"
      ? globalThis.caches
      : null;
  const pageLocation = Object.hasOwn(options, "location")
    ? options.location ?? null
    : typeof globalThis.location === "object"
      ? globalThis.location
      : null;
  const browserCrypto = Object.hasOwn(options, "crypto")
    ? options.crypto ?? null
    : typeof globalThis.crypto === "object"
      ? globalThis.crypto
      : null;
  return { fetch: fetchFunction, cacheStorage, location: pageLocation, crypto: browserCrypto };
}

function unsupportedReason(
  cacheStorage: LocalNarratorCacheStorage | null,
  origin: string | null,
  crypto: Pick<Crypto, "subtle"> | null,
): Extract<LocalNarratorAssetInspection, { readonly status: "unsupported" }>["reason"] | null {
  if (cacheStorage === null
    || typeof cacheStorage.has !== "function"
    || typeof cacheStorage.open !== "function"
    || typeof cacheStorage.delete !== "function") return "cache-storage-unavailable";
  if (origin === null) return "origin-unavailable";
  if (crypto === null || typeof crypto.subtle?.digest !== "function") return "web-crypto-unavailable";
  return null;
}

async function sha256(
  bytes: ArrayBuffer,
  crypto: Pick<Crypto, "subtle">,
): Promise<string> {
  let digest: ArrayBuffer;
  try {
    digest = await crypto.subtle.digest("SHA-256", bytes);
  } catch {
    throw new LocalNarratorAssetStoreError("verification-failed", "Local narrator SHA-256 failed");
  }
  const view = new Uint8Array(digest);
  if (view.byteLength !== 32) {
    throw new LocalNarratorAssetStoreError("verification-failed", "Local narrator SHA-256 was malformed");
  }
  return [...view].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function abortIfRequested(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new LocalNarratorAssetStoreError("aborted", "Local narrator download was cancelled");
  }
}

function progress(
  listener: ((progress: LocalNarratorAssetProgress) => void) | undefined,
  value: LocalNarratorAssetProgress,
): void {
  if (listener === undefined) return;
  try {
    listener(Object.freeze(value));
  } catch {
    // Progress is advisory; UI callback failures never alter verified storage.
  }
}

async function downloadResponseBytes(
  response: Response,
  artifact: LocalNarratorResolvedArtifact,
  signal: AbortSignal,
  onBytes: (artifactBytes: number) => void,
): Promise<ArrayBuffer> {
  if (response.body === null) {
    abortIfRequested(signal);
    const bytes = await response.arrayBuffer();
    abortIfRequested(signal);
    if (bytes.byteLength > artifact.byteLength) {
      throw new LocalNarratorAssetStoreError(
        "length-mismatch",
        `Local narrator artifact exceeded its byte bound: ${artifact.path}`,
      );
    }
    onBytes(bytes.byteLength);
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const cancel = (): void => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      abortIfRequested(signal);
      const result = await reader.read();
      abortIfRequested(signal);
      if (result.done) break;
      const chunk = result.value;
      if (chunk.byteLength === 0) continue;
      if (byteLength + chunk.byteLength > artifact.byteLength) {
        await reader.cancel().catch(() => undefined);
        throw new LocalNarratorAssetStoreError(
          "length-mismatch",
          `Local narrator artifact exceeded its byte bound: ${artifact.path}`,
        );
      }
      chunks.push(chunk);
      byteLength += chunk.byteLength;
      onBytes(byteLength);
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  const joined = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined.buffer;
}

function immutableInspection(
  status: "complete" | "missing" | "corrupt",
  revision: string,
  cachedBytes: number,
  totalBytes: number,
  missingArtifacts: readonly LocalNarratorAssetIdentity[],
  corruptArtifacts: readonly LocalNarratorAssetIdentity[],
): LocalNarratorAssetInspection {
  return Object.freeze({
    status,
    revision,
    cachedBytes,
    totalBytes,
    missingArtifacts: Object.freeze([...missingArtifacts]),
    corruptArtifacts: Object.freeze([...corruptArtifacts]),
  });
}

function contentType(path: string): string {
  if (path.endsWith(".mjs")) return "text/javascript";
  if (path.endsWith(".wasm")) return "application/wasm";
  if (path.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

export function createNarratorAssetStore(
  definition: LocalNarratorAssetStoreDefinition,
  options: LocalNarratorAssetStoreOptions = {},
): LocalNarratorAssetStore {
  const { artifacts, removableCacheNames } = validateDefinition(definition);
  const dependencies = resolveDefaults(options);
  const origin = validOrigin(dependencies.location?.origin);
  const supportFailure = unsupportedReason(dependencies.cacheStorage, origin, dependencies.crypto);
  let downloading = false;

  const cacheKey = (artifact: LocalNarratorResolvedArtifact): string =>
    localNarratorAssetCacheKey(origin!, artifact, definition.cachePathPrefix);

  const readCached = async (
    cache: LocalNarratorCache,
    artifact: LocalNarratorResolvedArtifact,
  ): Promise<{ readonly status: "missing" } | { readonly status: "corrupt" } | {
    readonly status: "verified";
    readonly bytes: ArrayBuffer;
  }> => {
    let response: Response | undefined;
    try {
      response = await cache.match(cacheKey(artifact));
    } catch {
      throw new LocalNarratorAssetStoreError("cache-read-failed", "Local narrator cache read failed");
    }
    if (response === undefined) return { status: "missing" };
    if (!response.ok) return { status: "corrupt" };
    let bytes: ArrayBuffer;
    try {
      bytes = await response.arrayBuffer();
    } catch {
      return { status: "corrupt" };
    }
    if (bytes.byteLength !== artifact.byteLength) return { status: "corrupt" };
    if (await sha256(bytes, dependencies.crypto!) !== artifact.sha256) return { status: "corrupt" };
    return { status: "verified", bytes };
  };

  const unsupportedInspection = (): LocalNarratorAssetInspection => Object.freeze({
    status: "unsupported" as const,
    reason: supportFailure!,
    revision: definition.revision,
    cachedBytes: 0,
    totalBytes: definition.totalBytes,
    missingArtifacts: Object.freeze([]),
    corruptArtifacts: Object.freeze([]),
  });

  const requireSupport = (): {
    readonly cacheStorage: LocalNarratorCacheStorage;
    readonly origin: string;
    readonly crypto: Pick<Crypto, "subtle">;
  } => {
    if (supportFailure !== null) {
      throw new LocalNarratorAssetStoreError(
        "unsupported",
        `Local narrator assets are unsupported: ${supportFailure}`,
      );
    }
    return {
      cacheStorage: dependencies.cacheStorage!,
      origin: origin!,
      crypto: dependencies.crypto!,
    };
  };

  return Object.freeze({
    async inspect(): Promise<LocalNarratorAssetInspection> {
      if (supportFailure !== null) return unsupportedInspection();
      const { cacheStorage } = requireSupport();
      let present: boolean;
      try {
        present = await cacheStorage.has(definition.cacheName);
      } catch {
        throw new LocalNarratorAssetStoreError("cache-read-failed", "Local narrator cache lookup failed");
      }
      if (!present) {
        return immutableInspection(
          "missing",
          definition.revision,
          0,
          definition.totalBytes,
          artifacts.map(identity),
          [],
        );
      }
      let cache: LocalNarratorCache;
      try {
        cache = await cacheStorage.open(definition.cacheName);
      } catch {
        throw new LocalNarratorAssetStoreError("cache-read-failed", "Local narrator cache open failed");
      }
      const missing: LocalNarratorAssetIdentity[] = [];
      const corrupt: LocalNarratorAssetIdentity[] = [];
      let cachedBytes = 0;
      for (const artifact of artifacts) {
        const cached = await readCached(cache, artifact);
        if (cached.status === "verified") cachedBytes += artifact.byteLength;
        else if (cached.status === "missing") missing.push(identity(artifact));
        else corrupt.push(identity(artifact));
      }
      const status = corrupt.length > 0 ? "corrupt" : missing.length > 0 ? "missing" : "complete";
      return immutableInspection(
        status,
        definition.revision,
        cachedBytes,
        definition.totalBytes,
        missing,
        corrupt,
      );
    },

    async download(
      signal: AbortSignal,
      onProgress?: (progress: LocalNarratorAssetProgress) => void,
    ): Promise<Extract<LocalNarratorAssetInspection, { readonly status: "complete" }>> {
      if (signal === null
        || typeof signal !== "object"
        || typeof signal.aborted !== "boolean"
        || typeof signal.addEventListener !== "function"
        || typeof signal.removeEventListener !== "function") {
        throw new LocalNarratorAssetStoreError("aborted", "A valid AbortSignal is required");
      }
      abortIfRequested(signal);
      const { cacheStorage } = requireSupport();
      if (dependencies.fetch === null) {
        throw new LocalNarratorAssetStoreError("network-unavailable", "Local narrator download is unavailable");
      }
      if (downloading) {
        throw new LocalNarratorAssetStoreError(
          "download-in-progress",
          "A local narrator download is already running",
        );
      }
      downloading = true;
      try {
        let cache: LocalNarratorCache;
        try {
          cache = await cacheStorage.open(definition.cacheName);
        } catch {
          throw new LocalNarratorAssetStoreError("cache-write-failed", "Local narrator cache open failed");
        }
        let completedBytes = 0;
        for (let artifactIndex = 0; artifactIndex < artifacts.length; artifactIndex += 1) {
          abortIfRequested(signal);
          const artifact = artifacts[artifactIndex]!;
          const artifactIdentity = identity(artifact);
          progress(onProgress, {
            artifact: artifactIdentity,
            artifactIndex,
            artifactCount: artifacts.length,
            source: "cache",
            artifactBytes: 0,
            artifactTotalBytes: artifact.byteLength,
            totalBytes: completedBytes,
            totalDownloadBytes: definition.totalBytes,
          });
          const cached = await readCached(cache, artifact);
          if (cached.status === "verified") {
            completedBytes += artifact.byteLength;
            progress(onProgress, {
              artifact: artifactIdentity,
              artifactIndex,
              artifactCount: artifacts.length,
              source: "cache",
              artifactBytes: artifact.byteLength,
              artifactTotalBytes: artifact.byteLength,
              totalBytes: completedBytes,
              totalDownloadBytes: definition.totalBytes,
            });
            continue;
          }
          if (artifact.sourceUrl === null) {
            throw new LocalNarratorAssetStoreError(
              "runtime-source-unavailable",
              `Local narrator runtime source is unavailable: ${artifact.path}`,
            );
          }
          let source: URL;
          try {
            source = new URL(artifact.sourceUrl, origin!);
          } catch {
            throw new LocalNarratorAssetStoreError(
              "invalid-manifest",
              `Local narrator source URL is invalid: ${artifact.path}`,
            );
          }
          if ((source.protocol !== "https:" && source.protocol !== "http:")
            || source.username !== ""
            || source.password !== ""
            || source.hash !== ""
            || (artifact.kind === "runtime" && source.origin !== origin)) {
            throw new LocalNarratorAssetStoreError(
              "invalid-manifest",
              `Local narrator source URL is not trusted: ${artifact.path}`,
            );
          }
          let response: Response;
          try {
            response = await dependencies.fetch(source.href, {
              method: "GET",
              cache: "no-store",
              credentials: "omit",
              signal,
            });
          } catch {
            abortIfRequested(signal);
            throw new LocalNarratorAssetStoreError(
              "fetch-failed",
              `Local narrator artifact download failed: ${artifact.path}`,
            );
          }
          abortIfRequested(signal);
          if (!response.ok) {
            throw new LocalNarratorAssetStoreError(
              "http-failed",
              `Local narrator artifact download returned HTTP ${response.status}: ${artifact.path}`,
            );
          }
          let receivedBytes = 0;
          const bytes = await downloadResponseBytes(
            response,
            artifact,
            signal,
            (artifactBytes) => {
              receivedBytes = artifactBytes;
              progress(onProgress, {
                artifact: artifactIdentity,
                artifactIndex,
                artifactCount: artifacts.length,
                source: "network",
                artifactBytes,
                artifactTotalBytes: artifact.byteLength,
                totalBytes: completedBytes + artifactBytes,
                totalDownloadBytes: definition.totalBytes,
              });
            },
          );
          abortIfRequested(signal);
          if (bytes.byteLength !== artifact.byteLength) {
            throw new LocalNarratorAssetStoreError(
              "length-mismatch",
              `Local narrator artifact byte length did not match: ${artifact.path}`,
            );
          }
          if (receivedBytes !== artifact.byteLength) {
            progress(onProgress, {
              artifact: artifactIdentity,
              artifactIndex,
              artifactCount: artifacts.length,
              source: "network",
              artifactBytes: artifact.byteLength,
              artifactTotalBytes: artifact.byteLength,
              totalBytes: completedBytes + artifact.byteLength,
              totalDownloadBytes: definition.totalBytes,
            });
          }
          if (await sha256(bytes, dependencies.crypto!) !== artifact.sha256) {
            throw new LocalNarratorAssetStoreError(
              "hash-mismatch",
              `Local narrator artifact SHA-256 did not match: ${artifact.path}`,
            );
          }
          abortIfRequested(signal);
          try {
            await cache.put(cacheKey(artifact), new Response(bytes, {
              status: 200,
              headers: {
                "content-length": String(bytes.byteLength),
                "content-type": contentType(artifact.path),
                "x-the-grind-2-sha256": artifact.sha256,
              },
            }));
          } catch {
            throw new LocalNarratorAssetStoreError(
              "cache-write-failed",
              `Local narrator artifact could not be cached: ${artifact.path}`,
            );
          }
          completedBytes += artifact.byteLength;
        }
        return immutableInspection(
          "complete",
          definition.revision,
          definition.totalBytes,
          definition.totalBytes,
          [],
          [],
        ) as Extract<LocalNarratorAssetInspection, { readonly status: "complete" }>;
      } finally {
        downloading = false;
      }
    },

    async read(): Promise<LocalNarratorStagedAssets> {
      const { cacheStorage } = requireSupport();
      let present: boolean;
      try {
        present = await cacheStorage.has(definition.cacheName);
      } catch {
        throw new LocalNarratorAssetStoreError("cache-read-failed", "Local narrator cache lookup failed");
      }
      if (!present) {
        throw new LocalNarratorAssetStoreError("cache-missing", "Local narrator assets are not cached");
      }
      let cache: LocalNarratorCache;
      try {
        cache = await cacheStorage.open(definition.cacheName);
      } catch {
        throw new LocalNarratorAssetStoreError("cache-read-failed", "Local narrator cache open failed");
      }
      const modelArtifacts: LocalNarratorStagedArtifact[] = [];
      const runtimeArtifacts: LocalNarratorStagedArtifact[] = [];
      for (const artifact of artifacts) {
        const cached = await readCached(cache, artifact);
        if (cached.status === "missing") {
          throw new LocalNarratorAssetStoreError(
            "cache-missing",
            `Local narrator artifact is missing: ${artifact.path}`,
          );
        }
        if (cached.status === "corrupt") {
          throw new LocalNarratorAssetStoreError(
            "cache-corrupt",
            `Local narrator artifact is corrupt: ${artifact.path}`,
          );
        }
        const staged = Object.freeze({ path: artifact.path, bytes: cached.bytes });
        if (artifact.kind === "model") modelArtifacts.push(staged);
        else runtimeArtifacts.push(staged);
      }
      return Object.freeze({
        modelId: definition.modelId,
        revision: definition.revision,
        totalBytes: definition.totalBytes,
        modelArtifacts: Object.freeze(modelArtifacts),
        runtimeArtifacts: Object.freeze(runtimeArtifacts),
      });
    },

    async remove(): Promise<boolean> {
      if (downloading) {
        throw new LocalNarratorAssetStoreError(
          "download-in-progress",
          "Local narrator assets cannot be removed during download",
        );
      }
      if (dependencies.cacheStorage === null
        || typeof dependencies.cacheStorage.delete !== "function") {
        throw new LocalNarratorAssetStoreError("unsupported", "CacheStorage is unavailable");
      }
      let removed = false;
      let failed = false;
      for (const cacheName of removableCacheNames) {
        try {
          removed = await dependencies.cacheStorage.delete(cacheName) || removed;
        } catch {
          failed = true;
        }
      }
      if (failed) {
        throw new LocalNarratorAssetStoreError("cache-write-failed", "Local narrator cache removal failed");
      }
      return removed;
    },
  });
}

function productionDefinition(
  runtimeSourceUrls: LocalNarratorRuntimeSourceUrls | undefined,
): LocalNarratorAssetStoreDefinition {
  const runtime = localNarratorRuntimeArtifacts.map((artifact) => Object.freeze({
    ...artifact,
    sourceUrl: runtimeSourceUrls?.[artifact.path as LocalNarratorRuntimeAssetPath] ?? null,
  }));
  return Object.freeze({
    modelId: localNarratorModelRepository,
    revision: localNarratorModelRevision,
    cacheName: localNarratorAssetCacheName,
    cachePathPrefix: localNarratorAssetCachePathPrefix,
    legacyCacheNames: localNarratorLegacyAssetCacheNames,
    totalBytes: localNarratorDisclosedDownloadBytes,
    artifacts: Object.freeze([
      ...localNarratorModelArtifacts,
      ...runtime,
    ]),
  });
}

export function createLocalNarratorAssetStore(
  options: LocalNarratorAssetStoreOptions = {},
): LocalNarratorAssetStore {
  return createNarratorAssetStore(productionDefinition(options.runtimeSourceUrls), options);
}
