import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { narratorBrowserOrtRuntimeV2 } from "./evaluation-browser-assets-v2";
import { narratorArtifactManifestHash } from "./evaluation-receipts";
import type { NarratorModelCandidate } from "./model-candidate";
import {
  LocalNarratorAssetStoreError,
  createLocalNarratorAssetStore,
  createNarratorAssetStore,
  localNarratorArtifactManifestHash,
  localNarratorAssetCacheKey,
  localNarratorAssetCacheName,
  localNarratorAssetCachePathPrefix,
  localNarratorDisclosedDownloadBytes,
  localNarratorLegacyAssetCacheNames,
  localNarratorModelArtifacts,
  localNarratorModelRepository,
  localNarratorModelRevision,
  localNarratorRuntimeArtifacts,
  localNarratorStoredWeightBytes,
  type LocalNarratorAssetStoreDefinition,
  type LocalNarratorAssetStoreOptions,
  type LocalNarratorCacheStorage,
} from "./local-model-assets";
import {
  narratorT5ArtifactRepositoryV1,
  narratorT5ArtifactRevisionV1,
  narratorT5PublishedArtifactsV1,
} from "./t5-publication-evidence";

const origin = "https://game.example";
const fixtureRevision = "a".repeat(40);
const fixtureLegacyRevision = "b".repeat(40);
const fixtureSecondLegacyRevision = "c".repeat(40);
const modelBytes = Uint8Array.from([1, 2, 3]);
const runtimeBytes = Uint8Array.from([4, 5, 6, 7]);

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const fixtureDefinition = Object.freeze({
  modelId: "owner/test-model",
  revision: fixtureRevision,
  cacheName: `test-local-narrator-${fixtureRevision}`,
  cachePathPrefix: `/__test_local_narrator__/${fixtureRevision}/`,
  legacyCacheNames: Object.freeze([
    `test-local-narrator-${fixtureLegacyRevision}`,
    `test-local-narrator-${fixtureSecondLegacyRevision}`,
  ]),
  totalBytes: modelBytes.byteLength + runtimeBytes.byteLength,
  artifacts: Object.freeze([
    Object.freeze({
      kind: "model" as const,
      path: "config.json",
      role: "configuration",
      byteLength: modelBytes.byteLength,
      sha256: digest(modelBytes),
      sourceUrl: "https://model.example/pinned/config.json",
    }),
    Object.freeze({
      kind: "runtime" as const,
      path: "runtime.wasm",
      role: "runtime-wasm",
      byteLength: runtimeBytes.byteLength,
      sha256: digest(runtimeBytes),
      sourceUrl: `${origin}/assets/runtime.wasm`,
    }),
  ]),
}) satisfies LocalNarratorAssetStoreDefinition;

class MemoryCache {
  readonly responses = new Map<string, { readonly bytes: Uint8Array; readonly status: number }>();

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    const stored = this.responses.get(String(request));
    if (stored === undefined) return undefined;
    return new Response(stored.bytes.slice(), { status: stored.status });
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.responses.set(String(request), {
      bytes: new Uint8Array(await response.arrayBuffer()),
      status: response.status,
    });
  }
}

class MemoryCacheStorage implements LocalNarratorCacheStorage {
  readonly stores = new Map<string, MemoryCache>();
  readonly openCalls: string[] = [];
  readonly deletedNames: string[] = [];

  async has(cacheName: string): Promise<boolean> {
    return this.stores.has(cacheName);
  }

  async open(cacheName: string): Promise<MemoryCache> {
    this.openCalls.push(cacheName);
    let cache = this.stores.get(cacheName);
    if (cache === undefined) {
      cache = new MemoryCache();
      this.stores.set(cacheName, cache);
    }
    return cache;
  }

  async delete(cacheName: string): Promise<boolean> {
    this.deletedNames.push(cacheName);
    return this.stores.delete(cacheName);
  }

  seed(
    cacheName: string,
    key: string,
    bytes: Uint8Array,
    status = 200,
  ): void {
    let cache = this.stores.get(cacheName);
    if (cache === undefined) {
      cache = new MemoryCache();
      this.stores.set(cacheName, cache);
    }
    cache.responses.set(key, { bytes: bytes.slice(), status });
  }
}

const testCrypto = {
  subtle: {
    async digest(_algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> {
      const view = data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      return Uint8Array.from(createHash("sha256").update(view).digest()).buffer;
    },
  },
} as unknown as Pick<Crypto, "subtle">;

function responseFor(
  input: string | URL | Request,
  overrides: ReadonlyMap<string, Uint8Array> = new Map(),
): Response {
  const url = String(input);
  const overridden = overrides.get(url);
  if (overridden !== undefined) return new Response(overridden.slice(), { status: 200 });
  if (url === fixtureDefinition.artifacts[0]!.sourceUrl) {
    return new Response(modelBytes.slice(), { status: 200 });
  }
  if (url === fixtureDefinition.artifacts[1]!.sourceUrl) {
    return new Response(runtimeBytes.slice(), { status: 200 });
  }
  return new Response(null, { status: 404 });
}

function setup(overrides: Partial<LocalNarratorAssetStoreOptions> = {}) {
  const cacheStorage = overrides.cacheStorage instanceof MemoryCacheStorage
    ? overrides.cacheStorage
    : new MemoryCacheStorage();
  const fetchMock = overrides.fetch ?? vi.fn(async (input: string | URL | Request) => responseFor(input));
  const options: LocalNarratorAssetStoreOptions = {
    fetch: fetchMock,
    cacheStorage,
    location: { origin } as Location,
    crypto: testCrypto,
    ...overrides,
  };
  return {
    cacheStorage,
    fetchMock,
    store: createNarratorAssetStore(fixtureDefinition, options),
  };
}

function fixtureKey(kind: "model" | "runtime", path: string): string {
  return localNarratorAssetCacheKey(
    origin,
    { kind, path },
    fixtureDefinition.cachePathPrefix,
  );
}

async function expectStoreCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
    throw new Error("Expected local narrator store operation to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(LocalNarratorAssetStoreError);
    expect((error as LocalNarratorAssetStoreError).code).toBe(code);
  }
}

describe("local narrator production asset manifest", () => {
  it("duplicates only the exact sanitized publication and runtime closure", () => {
    expect(localNarratorModelRepository).toBe(narratorT5ArtifactRepositoryV1);
    expect(localNarratorModelRevision).toBe(narratorT5ArtifactRevisionV1);
    expect(localNarratorModelArtifacts.map(({
      path,
      role,
      byteLength,
      sha256,
    }) => ({ path, role, byteLength, sha256 }))).toEqual(narratorT5PublishedArtifactsV1);
    expect(localNarratorRuntimeArtifacts.map(({
      path,
      role,
      byteLength,
      sha256,
    }) => ({ path, role, byteLength, sha256 }))).toEqual(narratorBrowserOrtRuntimeV2.assets);
    expect(localNarratorStoredWeightBytes).toBe(
      narratorT5PublishedArtifactsV1.reduce((total, artifact) => total + artifact.byteLength, 0),
    );
    expect(localNarratorDisclosedDownloadBytes).toBe(
      localNarratorStoredWeightBytes
        + narratorBrowserOrtRuntimeV2.assets.reduce(
          (total, artifact) => total + artifact.byteLength,
          0,
        ),
    );
    expect(localNarratorDisclosedDownloadBytes).toBe(120_696_862);
  });

  it("binds the protocol hash to the canonical publication artifact projection", () => {
    const artifactCarrier = {
      artifacts: narratorT5PublishedArtifactsV1,
    } as NarratorModelCandidate;
    expect(narratorArtifactManifestHash(artifactCarrier)).toBe(localNarratorArtifactManifestHash);
    expect(localNarratorArtifactManifestHash).toBe("cd7b76c208b0aa3d");
  });

  it("uses immutable revision URLs and revision-specific same-origin cache keys", () => {
    expect(localNarratorModelArtifacts.map((artifact) => artifact.sourceUrl)).toEqual([
      `https://raw.githubusercontent.com/${localNarratorModelRepository}/${localNarratorModelRevision}/config.json`,
      `https://raw.githubusercontent.com/${localNarratorModelRepository}/${localNarratorModelRevision}/generation_config.json`,
      `https://raw.githubusercontent.com/${localNarratorModelRepository}/${localNarratorModelRevision}/onnx/decoder_model_merged_quantized.onnx`,
      `https://raw.githubusercontent.com/${localNarratorModelRepository}/${localNarratorModelRevision}/onnx/encoder_model_quantized.onnx`,
      `https://raw.githubusercontent.com/${localNarratorModelRepository}/${localNarratorModelRevision}/tokenizer.json`,
      `https://raw.githubusercontent.com/${localNarratorModelRepository}/${localNarratorModelRevision}/tokenizer_config.json`,
    ]);
    expect(localNarratorAssetCacheName).toBe(
      `the-grind-2-local-narrator-v1-${localNarratorModelRevision}`,
    );
    expect(localNarratorAssetCachePathPrefix).toBe(
      `/__the_grind_2_local_narrator__/v1/${localNarratorModelRevision}/`,
    );
    expect(localNarratorLegacyAssetCacheNames).toEqual([]);
    expect(localNarratorAssetCacheKey(
      origin,
      { kind: "model", path: "onnx/encoder_model_quantized.onnx" },
    )).toBe(
      `${origin}${localNarratorAssetCachePathPrefix}model/onnx/encoder_model_quantized.onnx`,
    );
    expect(localNarratorAssetCacheKey(
      origin,
      { kind: "runtime", path: "ort-wasm-simd-threaded.asyncify.wasm" },
    )).toBe(
      `${origin}${localNarratorAssetCachePathPrefix}runtime/ort-wasm-simd-threaded.asyncify.wasm`,
    );
  });

  it("accepts caller-supplied same-origin runtime URLs without fetching during construction", async () => {
    const fetchMock = vi.fn();
    const cacheStorage = new MemoryCacheStorage();
    const store = createLocalNarratorAssetStore({
      runtimeSourceUrls: {
        "ort-wasm-simd-threaded.asyncify.mjs": `${origin}/assets/ort.mjs`,
        "ort-wasm-simd-threaded.asyncify.wasm": `${origin}/assets/ort.wasm`,
      },
      fetch: fetchMock,
      cacheStorage,
      location: { origin } as Location,
      crypto: testCrypto,
    });
    expect((await store.inspect()).status).toBe("missing");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cacheStorage.openCalls).toEqual([]);
  });
});

describe("local narrator verified asset store", () => {
  it.each([
    [["unrelated-cache"]],
    [[fixtureDefinition.cacheName]],
    [[`test-local-narrator-${fixtureLegacyRevision}`, `test-local-narrator-${fixtureLegacyRevision}`]],
    [[`test-local-narrator-${"c".repeat(39)}`]],
  ])("rejects unsafe, current, duplicate, or malformed legacy cache namespaces", (legacyCacheNames) => {
    expect(() => createNarratorAssetStore({
      ...fixtureDefinition,
      legacyCacheNames,
    }, {
      cacheStorage: new MemoryCacheStorage(),
      location: { origin } as Location,
      crypto: testCrypto,
      fetch: vi.fn(),
    })).toThrowError(LocalNarratorAssetStoreError);
  });

  it("rejects non-string and sparse legacy cache namespace lists", () => {
    const sparse = new Array<string>(1);
    for (const legacyCacheNames of [[123] as never, sparse]) {
      expect(() => createNarratorAssetStore({
        ...fixtureDefinition,
        legacyCacheNames,
      }, {
        cacheStorage: new MemoryCacheStorage(),
        location: { origin } as Location,
        crypto: testCrypto,
        fetch: vi.fn(),
      })).toThrowError(LocalNarratorAssetStoreError);
    }
  });

  it("snapshots the validated legacy cache namespace list", async () => {
    const initialLegacyCacheName = "test-local-narrator-" + fixtureLegacyRevision;
    const legacyCacheNames = [initialLegacyCacheName];
    const cacheStorage = new MemoryCacheStorage();
    const store = createNarratorAssetStore({
      ...fixtureDefinition,
      legacyCacheNames,
    }, {
      cacheStorage,
      location: { origin } as Location,
      crypto: testCrypto,
      fetch: vi.fn(),
    });
    const lateCacheName = "test-local-narrator-" + "d".repeat(40);
    legacyCacheNames.push(lateCacheName);
    await cacheStorage.open(fixtureDefinition.cacheName);
    await cacheStorage.open(initialLegacyCacheName);
    await cacheStorage.open(lateCacheName);

    await expect(store.remove()).resolves.toBe(true);
    expect(cacheStorage.deletedNames).toEqual([
      fixtureDefinition.cacheName,
      initialLegacyCacheName,
    ]);
    expect(cacheStorage.stores.has(lateCacheName)).toBe(true);
  });

  it("downloads, verifies, caches, inspects, and returns reverified transferable buffers", async () => {
    const { store, fetchMock } = setup();
    const before = await store.inspect();
    expect(before.status).toBe("missing");
    expect(before.missingArtifacts).toEqual([
      { kind: "model", path: "config.json" },
      { kind: "runtime", path: "runtime.wasm" },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(store.download(new AbortController().signal)).resolves.toMatchObject({
      status: "complete",
      cachedBytes: fixtureDefinition.totalBytes,
      totalBytes: fixtureDefinition.totalBytes,
    });
    await expect(store.inspect()).resolves.toMatchObject({
      status: "complete",
      missingArtifacts: [],
      corruptArtifacts: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(fetchMock).mock.calls) {
      expect(call[1]).toMatchObject({
        method: "GET",
        cache: "no-store",
        credentials: "omit",
      });
      expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
    }

    const staged = await store.read();
    expect(staged).toMatchObject({
      modelId: fixtureDefinition.modelId,
      revision: fixtureDefinition.revision,
      totalBytes: fixtureDefinition.totalBytes,
    });
    expect(staged.modelArtifacts.map((artifact) => ({
      path: artifact.path,
      bytes: [...new Uint8Array(artifact.bytes)],
    }))).toEqual([{ path: "config.json", bytes: [...modelBytes] }]);
    expect(staged.runtimeArtifacts.map((artifact) => ({
      path: artifact.path,
      bytes: [...new Uint8Array(artifact.bytes)],
    }))).toEqual([{ path: "runtime.wasm", bytes: [...runtimeBytes] }]);
    expect(staged.modelArtifacts[0]!.bytes).toBeInstanceOf(ArrayBuffer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports monotonic per-artifact and total progress", async () => {
    const { store } = setup();
    const progress: Array<{
      readonly path: string;
      readonly artifactBytes: number;
      readonly artifactTotalBytes: number;
      readonly totalBytes: number;
      readonly totalDownloadBytes: number;
    }> = [];
    await store.download(new AbortController().signal, (event) => {
      progress.push({
        path: event.artifact.path,
        artifactBytes: event.artifactBytes,
        artifactTotalBytes: event.artifactTotalBytes,
        totalBytes: event.totalBytes,
        totalDownloadBytes: event.totalDownloadBytes,
      });
    });
    expect(progress.length).toBeGreaterThanOrEqual(4);
    for (let index = 1; index < progress.length; index += 1) {
      expect(progress[index]!.totalBytes).toBeGreaterThanOrEqual(progress[index - 1]!.totalBytes);
    }
    for (const path of ["config.json", "runtime.wasm"]) {
      const events = progress.filter((event) => event.path === path);
      for (let index = 1; index < events.length; index += 1) {
        expect(events[index]!.artifactBytes).toBeGreaterThanOrEqual(events[index - 1]!.artifactBytes);
      }
      expect(events.at(-1)!.artifactBytes).toBe(events.at(-1)!.artifactTotalBytes);
    }
    expect(progress.at(-1)).toMatchObject({
      totalBytes: fixtureDefinition.totalBytes,
      totalDownloadBytes: fixtureDefinition.totalBytes,
    });
  });

  it("reuses a fully verified cache without network traffic", async () => {
    const first = setup();
    await first.store.download(new AbortController().signal);
    const fetchMock = vi.fn();
    const second = setup({ cacheStorage: first.cacheStorage, fetch: fetchMock });
    await second.store.download(new AbortController().signal);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(second.store.inspect()).resolves.toMatchObject({ status: "complete" });
  });

  it("distinguishes absent, partial, corrupt, and unsupported storage without fetching", async () => {
    const missing = setup();
    expect((await missing.store.inspect()).status).toBe("missing");
    expect(missing.fetchMock).not.toHaveBeenCalled();

    missing.cacheStorage.seed(
      fixtureDefinition.cacheName,
      fixtureKey("model", "config.json"),
      modelBytes,
    );
    const partial = await missing.store.inspect();
    expect(partial).toMatchObject({
      status: "missing",
      cachedBytes: modelBytes.byteLength,
      missingArtifacts: [{ kind: "runtime", path: "runtime.wasm" }],
      corruptArtifacts: [],
    });

    missing.cacheStorage.seed(
      fixtureDefinition.cacheName,
      fixtureKey("model", "config.json"),
      Uint8Array.from([9, 9, 9]),
    );
    const corrupt = await missing.store.inspect();
    expect(corrupt).toMatchObject({
      status: "corrupt",
      cachedBytes: 0,
      corruptArtifacts: [{ kind: "model", path: "config.json" }],
      missingArtifacts: [{ kind: "runtime", path: "runtime.wasm" }],
    });
    expect(missing.fetchMock).not.toHaveBeenCalled();

    const unsupported = createNarratorAssetStore(fixtureDefinition, {
      fetch: null,
      cacheStorage: null,
      location: null,
      crypto: null,
    });
    await expect(unsupported.inspect()).resolves.toMatchObject({
      status: "unsupported",
      reason: "cache-storage-unavailable",
    });
  });

  it("refetches a missing or corrupt entry while preserving verified cache hits", async () => {
    const cacheStorage = new MemoryCacheStorage();
    cacheStorage.seed(
      fixtureDefinition.cacheName,
      fixtureKey("model", "config.json"),
      modelBytes,
    );
    cacheStorage.seed(
      fixtureDefinition.cacheName,
      fixtureKey("runtime", "runtime.wasm"),
      Uint8Array.from([9, 9, 9, 9]),
    );
    const { store, fetchMock } = setup({ cacheStorage });
    await store.download(new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      fixtureDefinition.artifacts[1]!.sourceUrl,
      expect.objectContaining({ credentials: "omit", cache: "no-store" }),
    );
    await expect(store.inspect()).resolves.toMatchObject({ status: "complete" });
  });

  it.each([
    ["length-mismatch", Uint8Array.from([1, 2])],
    ["hash-mismatch", Uint8Array.from([9, 9, 9])],
  ])("rejects a remote %s before caching", async (code, substitutedBytes) => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => responseFor(
      input,
      new Map([[fixtureDefinition.artifacts[0]!.sourceUrl!, substitutedBytes]]),
    ));
    const { store, cacheStorage } = setup({ fetch: fetchMock });
    await expectStoreCode(store.download(new AbortController().signal), code);
    expect(cacheStorage.stores.get(fixtureDefinition.cacheName)?.responses.size ?? 0).toBe(0);
  });

  it("cancels an in-flight stream before caching it", async () => {
    const fetchMock = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(modelBytes.slice(0, 1));
      },
    }), { status: 200 }));
    const { store, cacheStorage } = setup({ fetch: fetchMock });
    const abortController = new AbortController();
    const operation = store.download(abortController.signal, (event) => {
      if (event.source === "network" && event.artifactBytes > 0) abortController.abort();
    });
    await expectStoreCode(operation, "aborted");
    expect(cacheStorage.stores.get(fixtureDefinition.cacheName)?.responses.size ?? 0).toBe(0);
  });

  it("rejects cached corruption during read without any network fallback", async () => {
    const { store, cacheStorage, fetchMock } = setup();
    cacheStorage.seed(
      fixtureDefinition.cacheName,
      fixtureKey("model", "config.json"),
      Uint8Array.from([9, 9, 9]),
    );
    cacheStorage.seed(
      fixtureDefinition.cacheName,
      fixtureKey("runtime", "runtime.wasm"),
      runtimeBytes,
    );
    await expectStoreCode(store.read(), "cache-corrupt");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("removes only the current and exact declared legacy revision cache namespaces", async () => {
    const { store, cacheStorage } = setup();
    await cacheStorage.open(fixtureDefinition.cacheName);
    for (const cacheName of fixtureDefinition.legacyCacheNames) {
      await cacheStorage.open(cacheName);
    }
    await cacheStorage.open("unrelated-cache");
    await expect(store.remove()).resolves.toBe(true);
    expect(cacheStorage.deletedNames).toEqual([
      fixtureDefinition.cacheName,
      ...fixtureDefinition.legacyCacheNames,
    ]);
    expect(cacheStorage.stores.has(fixtureDefinition.cacheName)).toBe(false);
    for (const cacheName of fixtureDefinition.legacyCacheNames) {
      expect(cacheStorage.stores.has(cacheName)).toBe(false);
    }
    expect(cacheStorage.stores.has("unrelated-cache")).toBe(true);
  });

  it("attempts every exact removal namespace before surfacing a cache failure", async () => {
    const { store, cacheStorage } = setup();
    await cacheStorage.open(fixtureDefinition.cacheName);
    for (const cacheName of fixtureDefinition.legacyCacheNames) {
      await cacheStorage.open(cacheName);
    }
    const originalDelete = cacheStorage.delete.bind(cacheStorage);
    vi.spyOn(cacheStorage, "delete").mockImplementation(async (cacheName) => {
      if (cacheName === fixtureDefinition.legacyCacheNames[0]) {
        cacheStorage.deletedNames.push(cacheName);
        throw new Error("fixture legacy-cache failure");
      }
      return originalDelete(cacheName);
    });

    await expectStoreCode(store.remove(), "cache-write-failed");
    expect(cacheStorage.deletedNames).toEqual([
      fixtureDefinition.cacheName,
      ...fixtureDefinition.legacyCacheNames,
    ]);
    expect(cacheStorage.stores.has(fixtureDefinition.cacheName)).toBe(false);
    expect(cacheStorage.stores.has(fixtureDefinition.legacyCacheNames[0]!)).toBe(true);
    expect(cacheStorage.stores.has(fixtureDefinition.legacyCacheNames[1]!)).toBe(false);
  });
});
