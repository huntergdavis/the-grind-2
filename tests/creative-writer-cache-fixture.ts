import type { Page } from "@playwright/test";
import { creativeWriterCacheScopes, creativeWriterModelUrl, creativeWriterModelLib,
  creativeWriterModelShardFiles } from "../src/narrator/creative-writer-model";

/** Tiny discovery fixtures, never a real model or evidence of prose quality. */
export async function seedCreativeWriterCache(page: Page): Promise<void> {
  await page.evaluate(async ({ scopes, root, lib, shards }) => {
    const model = await caches.open(scopes.model);
    await model.put(root + "tensor-cache.json", new Response(JSON.stringify({ records: shards.map((dataPath) => ({ dataPath })) })));
    await Promise.all(["tokenizer.json", ...shards].map((file) => model.put(root + file, new Response("cache-discovery fixture"))));
    const config = await caches.open(scopes.config);
    await config.put(root + "mlc-chat-config.json", new Response(JSON.stringify({ tokenizer_files: ["tokenizer.json"] })));
    await (await caches.open(scopes.wasm)).put(lib, new Response("cache-discovery fixture"));
  }, { scopes: creativeWriterCacheScopes, root: creativeWriterModelUrl, lib: creativeWriterModelLib, shards: creativeWriterModelShardFiles });
}
