import {
  creativeWriterCacheScopes,
  creativeWriterModelLib,
  creativeWriterModelShardFiles,
  creativeWriterModelUrl,
} from "./creative-writer-model";

type ModelCache = Pick<Cache, "match" | "delete">;
interface ModelCacheStorage {
  has(name: string): Promise<boolean>;
  open(name: string): Promise<ModelCache>;
}
type GetModelCacheStorage = () => ModelCacheStorage | undefined;
const defaultStorage: GetModelCacheStorage = () => typeof caches === "undefined" ? undefined : caches;
const modelFile = (file: string): string => creativeWriterModelUrl + file;

function hasPinnedShards(manifest: unknown): boolean {
  if (manifest === null || typeof manifest !== "object") return false;
  const records: unknown = (manifest as Record<string, unknown>).records;
  if (!Array.isArray(records) || records.length !== creativeWriterModelShardFiles.length) return false;
  const paths = records.map((record: unknown) => record !== null && typeof record === "object"
    ? (record as Record<string, unknown>).dataPath : null);
  return new Set(paths).size === creativeWriterModelShardFiles.length
    && creativeWriterModelShardFiles.every((file) => paths.includes(file));
}

/** Presence/completeness, not a cryptographic integrity or device-capability claim. Never fetches. */
export async function hasCachedCreativeWriterModel(getStorage: GetModelCacheStorage = defaultStorage): Promise<boolean> {
  try {
    const storage = getStorage();
    if (storage === undefined) return false;
    const scopes = Object.values(creativeWriterCacheScopes);
    if (!(await Promise.all(scopes.map((scope) => storage.has(scope)))).every(Boolean)) return false;
    const [model, config, wasm] = await Promise.all([
      storage.open(creativeWriterCacheScopes.model),
      storage.open(creativeWriterCacheScopes.config),
      storage.open(creativeWriterCacheScopes.wasm),
    ]);
    const [manifest, tokenizer, chatConfig, modelLib] = await Promise.all([
      model.match(modelFile("tensor-cache.json")),
      model.match(modelFile("tokenizer.json")),
      config.match(modelFile("mlc-chat-config.json")),
      wasm.match(creativeWriterModelLib),
    ]);
    if (!manifest?.ok || !tokenizer?.ok || !chatConfig?.ok || !modelLib?.ok) return false;
    if (!hasPinnedShards(await manifest.json())) return false;
    const configData: unknown = await chatConfig.json();
    if (configData === null || typeof configData !== "object"
      || !Array.isArray((configData as Record<string, unknown>).tokenizer_files)
      || !(configData as { tokenizer_files: unknown[] }).tokenizer_files.includes("tokenizer.json")) return false;
    return (await Promise.all(creativeWriterModelShardFiles.map(async (file) =>
      (await model.match(modelFile(file)))?.ok === true))).every(Boolean);
  } catch {
    return false;
  }
}

/** Deletes only this pinned model's entries, including partial caches, without reading/fetching a manifest. */
export async function removeCachedCreativeWriterModel(getStorage: GetModelCacheStorage = defaultStorage): Promise<void> {
  const storage = getStorage();
  if (storage === undefined) return;
  if (await storage.has(creativeWriterCacheScopes.model)) {
    const model = await storage.open(creativeWriterCacheScopes.model);
    await Promise.all(["tensor-cache.json", "tokenizer.json", ...creativeWriterModelShardFiles]
      .map((file) => model.delete(modelFile(file))));
  }
  if (await storage.has(creativeWriterCacheScopes.config)) {
    const config = await storage.open(creativeWriterCacheScopes.config);
    await config.delete(modelFile("mlc-chat-config.json"));
  }
  // This architecture-level WASM URL can be shared by other models. Keep their reusable runtime.
  // Never delete a whole webllm scope or the existing 135M cache.
}

/** Permanent until this dedicated worker terminates; never invoke in the page realm. */
export function blockCreativeWriterNetwork(): void {
  if (typeof importScripts !== "function" || typeof document !== "undefined") {
    throw new Error("The creative writer network guard is worker-only.");
  }
  const rejectNetwork = async (): Promise<never> => {
    throw new Error("The local writer cannot download outside explicit model loading.");
  };
  globalThis.fetch = rejectNetwork;
  // Native Cache.add/addAll fetch internally and do not call the JavaScript fetch override.
  if (typeof Cache !== "undefined") {
    Cache.prototype.add = rejectNetwork;
    Cache.prototype.addAll = rejectNetwork;
  }
}
