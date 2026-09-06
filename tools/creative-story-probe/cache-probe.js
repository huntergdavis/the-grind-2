import { createCreativeWriterClient, hasCachedCreativeWriterModel } from '../../src/narrator/creative-writer-client';
import { buildCreativeStoryMessages, cleanCreativeStoryOutput, selectStorySeed } from '../../src/narrator/creative-story';

let client;
globalThis.creativeCacheProbe = {
  cached: hasCachedCreativeWriterModel,
  async load() {
    client = createCreativeWriterClient();
    const progress = [];
    const started = performance.now();
    await client.load((message) => { if (!progress.includes(message)) progress.push(message); });
    return { loadMs: Math.round(performance.now() - started), progress, cached: await hasCachedCreativeWriterModel() };
  },
  dispose() { client.dispose(); },
  async write() {
    const job = { facts: { location: 'Greyford', headline: 'The eastern bank is reached safely.', action: 'Mara crossed the river and paid the ferryman her last copper coin.', consequence: 'Mara is safely across the river with no copper coins remaining.' } };
    const seed = selectStorySeed('travel', 'creative-cache-probe:river', 0);
    const messages = buildCreativeStoryMessages(job, seed);
    const started = performance.now();
    const raw = await client.write(messages);
    return { seed, messages, raw, cleaned: cleanCreativeStoryOutput(raw), generationMs: Math.round(performance.now() - started) };
  },
};
