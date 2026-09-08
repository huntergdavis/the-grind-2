import { afterEach, describe, expect, it, vi } from "vitest";
import {
  blockCreativeWriterNetwork,
  hasCachedCreativeWriterModel,
  removeCachedCreativeWriterModel,
} from "./creative-writer-cache";
import {
  creativeWriterCacheScopes as scopes,
  creativeWriterModelId,
  creativeWriterModelLib,
  creativeWriterModelRevision,
  creativeWriterModelShardFiles,
  creativeWriterModelUrl,
} from "./creative-writer-model";

const url = (file: string): string => creativeWriterModelUrl + file;
const manifest = () => ({ records: creativeWriterModelShardFiles.map((dataPath) => ({ dataPath })) });

function setup() {
  const stores = new Map<string, Map<string, Response>>([
    [scopes.model, new Map([
      [url("tensor-cache.json"), Response.json(manifest())],
      [url("tokenizer.json"), Response.json({ model: {} })],
      ...creativeWriterModelShardFiles.map((file): [string, Response] => [url(file), new Response("shard")]),
    ])],
    [scopes.config, new Map([[url("mlc-chat-config.json"), Response.json({ tokenizer_files: ["tokenizer.json"] })]])],
    [scopes.wasm, new Map([[creativeWriterModelLib, new Response("wasm")]])],
  ]);
  const match = vi.fn(async (scope: string, key: RequestInfo | URL) =>
    stores.get(scope)?.get(String(key))?.clone());
  const remove = vi.fn(async (scope: string, key: RequestInfo | URL) => stores.get(scope)?.delete(String(key)) ?? false);
  const storage = {
    has: vi.fn(async (scope: string) => stores.has(scope)),
    open: vi.fn(async (scope: string) => ({
      match: (key: RequestInfo | URL) => match(scope, key),
      delete: (key: RequestInfo | URL) => remove(scope, key),
    })),
  };
  const fetch = vi.fn(async () => new Response("unexpected network"));
  vi.stubGlobal("fetch", fetch);
  return { stores, storage, match, remove, fetch, getStorage: () => storage };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("pinned WebGPU creative writer cache", () => {
  it("pins the evaluated model revision, shared WASM and exactly thirty frozen shard names", () => {
    expect(creativeWriterModelId).toBe("Qwen2.5-1.5B-Instruct-q4f16_1-MLC");
    expect(creativeWriterModelRevision).toBe("9bd564b064631febf14deadcac492efb761d60c3");
    expect(creativeWriterModelUrl).toContain(`/resolve/${creativeWriterModelRevision}/`);
    expect(creativeWriterModelLib).toContain("/025bcaf3780fa8254f5e5efd3bfea0a5397248f4/");
    expect(creativeWriterModelShardFiles).toHaveLength(30);
    expect(new Set(creativeWriterModelShardFiles).size).toBe(30);
    expect(creativeWriterModelShardFiles.at(-1)).toBe("params_shard_29.bin");
    expect(Object.isFrozen(creativeWriterModelShardFiles)).toBe(true);
    expect(Object.isFrozen(scopes)).toBe(true);
  });

  it("requires the full closure and reads it repeatedly without network, deletion or consumed cached bodies", async () => {
    const fixture = setup();
    expect(await hasCachedCreativeWriterModel(fixture.getStorage)).toBe(true);
    expect(await hasCachedCreativeWriterModel(fixture.getStorage)).toBe(true);
    expect(fixture.remove).not.toHaveBeenCalled();
    expect(fixture.fetch).not.toHaveBeenCalled();
    expect(fixture.match).toHaveBeenCalledWith(scopes.wasm, creativeWriterModelLib);
    for (const file of creativeWriterModelShardFiles) {
      expect(fixture.match).toHaveBeenCalledWith(scopes.model, url(file));
    }
  });

  it.each(Object.values(scopes))("does not create an absent %s cache during inspection", async (scope) => {
    const fixture = setup();
    fixture.stores.delete(scope);
    expect(await hasCachedCreativeWriterModel(fixture.getStorage)).toBe(false);
    expect(fixture.storage.open).not.toHaveBeenCalled();
    expect(fixture.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [scopes.model, url("tensor-cache.json")], [scopes.model, url("tokenizer.json")],
    [scopes.model, url("params_shard_0.bin")], [scopes.model, url("params_shard_14.bin")],
    [scopes.model, url("params_shard_29.bin")], [scopes.config, url("mlc-chat-config.json")],
    [scopes.wasm, creativeWriterModelLib],
  ])("rejects missing or failed %s entry %s", async (scope, key) => {
    const fixture = setup();
    fixture.stores.get(scope!)!.delete(key!);
    expect(await hasCachedCreativeWriterModel(fixture.getStorage)).toBe(false);
    fixture.stores.get(scope!)!.set(key!, new Response("failed", { status: 500 }));
    expect(await hasCachedCreativeWriterModel(fixture.getStorage)).toBe(false);
    expect(fixture.fetch).not.toHaveBeenCalled();
  });

  it.each([
    null, {}, { records: [] }, { records: manifest().records.slice(1) },
    { records: [...manifest().records, { dataPath: "params_shard_30.bin" }] },
    { records: manifest().records.map(() => ({ dataPath: "params_shard_0.bin" })) },
    { records: [{ dataPath: "../other-model.bin" }, ...manifest().records.slice(1)] },
    { records: [null, ...manifest().records.slice(1)] },
  ])("rejects a malformed, duplicate, incomplete or non-pinned manifest %#", async (value) => {
    const fixture = setup();
    fixture.stores.get(scopes.model)!.set(url("tensor-cache.json"), Response.json(value));
    expect(await hasCachedCreativeWriterModel(fixture.getStorage)).toBe(false);
    expect(fixture.fetch).not.toHaveBeenCalled();
  });

  it("rejects corrupt manifest/config JSON and unsupported tokenizer configuration", async () => {
    for (const [scope, file] of [[scopes.model, "tensor-cache.json"], [scopes.config, "mlc-chat-config.json"]]) {
      const fixture = setup();
      fixture.stores.get(scope!)!.set(url(file!), new Response("not JSON"));
      expect(await hasCachedCreativeWriterModel(fixture.getStorage)).toBe(false);
    }
    const fixture = setup();
    fixture.stores.get(scopes.config)!.set(url("mlc-chat-config.json"), Response.json({ tokenizer_files: ["tokenizer.model"] }));
    expect(await hasCachedCreativeWriterModel(fixture.getStorage)).toBe(false);
  });

  it("never counts another revision or the existing 135M cache as this model", async () => {
    const fixture = setup();
    fixture.stores.set("the-grind-2:creative-writer:old-135m", new Map([[url("params_shard_0.bin"), new Response("old")]]));
    fixture.stores.get(scopes.model)!.delete(url("params_shard_0.bin"));
    fixture.stores.get(scopes.model)!.set(url("params_shard_0.bin").replace(creativeWriterModelRevision, "other-revision"), new Response("other"));
    expect(await hasCachedCreativeWriterModel(fixture.getStorage)).toBe(false);
  });

  it("degrades missing or blocked cache inspection to false", async () => {
    expect(await hasCachedCreativeWriterModel(() => undefined)).toBe(false);
    expect(await hasCachedCreativeWriterModel(() => { throw new Error("blocked"); })).toBe(false);
    const fixture = setup();
    fixture.storage.has.mockRejectedValue(new Error("blocked"));
    expect(await hasCachedCreativeWriterModel(fixture.getStorage)).toBe(false);
    expect(fixture.fetch).not.toHaveBeenCalled();
  });

  it("removes exact candidate files without fetching even when the manifest is absent, preserving shared caches and WASM", async () => {
    const fixture = setup();
    const unrelated = "https://example.test/other-model/params_shard_0.bin";
    fixture.stores.get(scopes.model)!.delete(url("tensor-cache.json"));
    fixture.stores.get(scopes.model)!.set(unrelated, new Response("other"));
    fixture.stores.get(scopes.config)!.set(unrelated, new Response("other config"));
    const oldCache = new Map([["old-model", new Response("old")]]);
    fixture.stores.set("the-grind-2:creative-writer:135m", oldCache);
    await removeCachedCreativeWriterModel(fixture.getStorage);
    expect([...fixture.stores.get(scopes.model)!.keys()]).toEqual([unrelated]);
    expect([...fixture.stores.get(scopes.config)!.keys()]).toEqual([unrelated]);
    expect(fixture.stores.get(scopes.wasm)!.has(creativeWriterModelLib)).toBe(true);
    expect(fixture.stores.get("the-grind-2:creative-writer:135m")).toBe(oldCache);
    expect(oldCache.has("old-model")).toBe(true);
    expect(fixture.remove).toHaveBeenCalledTimes(33);
    expect(fixture.match).not.toHaveBeenCalled();
    expect(fixture.fetch).not.toHaveBeenCalled();
    expect(await hasCachedCreativeWriterModel(fixture.getStorage)).toBe(false);
  });

  it("does not create absent caches during removal, and reports blocked removal instead of claiming success", async () => {
    const fixture = setup();
    fixture.stores.clear();
    await removeCachedCreativeWriterModel(fixture.getStorage);
    await removeCachedCreativeWriterModel(() => undefined);
    expect(fixture.storage.open).not.toHaveBeenCalled();
    expect(fixture.remove).not.toHaveBeenCalled();
    fixture.storage.has.mockRejectedValue(new Error("blocked"));
    await expect(removeCachedCreativeWriterModel(fixture.getStorage)).rejects.toThrow("blocked");
  });
});

describe("dedicated writer network guard", () => {
  function workerRealm() {
    const fetch = vi.fn(async () => new Response("network"));
    const nativeAdd = vi.fn(async () => undefined);
    const nativeAddAll = vi.fn(async () => undefined);
    class WorkerCache {
      async add(): Promise<void> { await nativeAdd(); }
      async addAll(): Promise<void> { await nativeAddAll(); }
      async match(): Promise<Response> { return new Response("cached"); }
    }
    // Native Cache methods live on its realm-local prototype, not individual objects.
    Object.assign(WorkerCache.prototype, { add: nativeAdd, addAll: nativeAddAll });
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("importScripts", vi.fn());
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("Cache", WorkerCache);
    return { fetch, nativeAdd, nativeAddAll, WorkerCache };
  }

  it("blocks fetch and both native cache network entrypoints but leaves cache reads available", async () => {
    const fixture = workerRealm();
    blockCreativeWriterNetwork();
    const cache = new fixture.WorkerCache();
    await expect(globalThis.fetch("https://example.test/model")).rejects.toThrow("outside explicit model loading");
    await expect(cache.add()).rejects.toThrow("outside explicit model loading");
    await expect(cache.addAll()).rejects.toThrow("outside explicit model loading");
    expect(await (await cache.match()).text()).toBe("cached");
    expect(fixture.fetch).not.toHaveBeenCalled();
    expect(fixture.nativeAdd).not.toHaveBeenCalled();
    expect(fixture.nativeAddAll).not.toHaveBeenCalled();
  });

  it("is idempotent and blocks fetch when CacheStorage/Cache are unavailable", async () => {
    workerRealm();
    vi.stubGlobal("Cache", undefined);
    vi.stubGlobal("caches", undefined);
    blockCreativeWriterNetwork();
    blockCreativeWriterNetwork();
    await expect(globalThis.fetch("https://example.test/model")).rejects.toThrow("outside explicit model loading");
  });

  it("refuses the page realm before touching its fetch or Cache prototype", () => {
    const fixture = workerRealm();
    vi.stubGlobal("document", {});
    expect(() => blockCreativeWriterNetwork()).toThrow("worker-only");
    expect(globalThis.fetch).toBe(fixture.fetch);
    expect(fixture.WorkerCache.prototype.add).toBe(fixture.nativeAdd);
    expect(fixture.WorkerCache.prototype.addAll).toBe(fixture.nativeAddAll);
  });

  it("refuses other non-worker realms", () => {
    const fixture = workerRealm();
    vi.stubGlobal("importScripts", undefined);
    expect(() => blockCreativeWriterNetwork()).toThrow("worker-only");
    expect(globalThis.fetch).toBe(fixture.fetch);
  });
});
