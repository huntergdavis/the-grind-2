import workerUrl from '../../src/narrator/creative-writer.worker.ts?worker&url';
import { createCreativeWriterClient, hasCachedCreativeWriterModel, creativeWriterModelId,
  creativeWriterModelRevision, creativeWriterInferenceTimeoutMs } from '../../src/narrator/creative-writer-client';
import { cleanCreativeStoryOutput } from '../../src/narrator/creative-story';
import { completedCreativeStorySentences } from '../../src/narrator/creative-story-sentences';

let worker;
let client;
let metrics = null;
let terminated = false;
globalThis.sentenceStoppingProbe = {
  workerUrl: new URL(workerUrl, location.href).href,
  identity: { modelId: creativeWriterModelId, revision: creativeWriterModelRevision,
    inferenceTimeoutMs: creativeWriterInferenceTimeoutMs },
  cached: hasCachedCreativeWriterModel,
  async boot() {
    if (worker) throw new Error('Each variant creates exactly one worker');
    await new Promise((accept, decline) => {
      const timer = setTimeout(() => decline(new Error('Worker bootstrap exceeded10seconds')), 10_000);
      worker = new Worker(new URL(workerUrl, location.href), { type: 'module' });
      worker.addEventListener('message', ({ data }) => {
        if (data?.type === 'probe-boot') { clearTimeout(timer); accept(); }
        if (data?.type === 'probe-metrics') metrics = { inputTokens: data.inputTokens, outputTokens: data.outputTokens };
      });
      worker.addEventListener('error', () => { clearTimeout(timer); decline(new Error('Worker bootstrap failed')); });
    });
    client = createCreativeWriterClient({ createWorker: () => ({
      postMessage: (message) => worker.postMessage(message),
      addEventListener: (type, listener) => worker.addEventListener(type, listener),
      terminate: () => { worker.terminate(); terminated = true; },
    }) });
  },
  async load(cacheOnly) {
    const start = performance.now();
    const progress = [];
    await client.load((message) => progress.push(message), { cacheOnly });
    return { loadMs: Math.round(performance.now() - start), cacheOnly, progress,
      cached: await hasCachedCreativeWriterModel() };
  },
  async write(messages) {
    metrics = null;
    const start = performance.now();
    try {
      const raw = await client.write(messages);
      const cleaned = cleanCreativeStoryOutput(raw);
      return { status: 'completed', raw, cleaned, ...metrics,
        completedSentences: completedCreativeStorySentences(raw),
        discardedSuffix: cleaned !== null && raw.startsWith(cleaned) ? raw.slice(cleaned.length) : null,
        generationMs: Math.round(performance.now() - start) };
    } catch (error) {
      return { status: 'failed', raw: null, cleaned: null, ...metrics,
        error: error instanceof Error ? error.message : String(error),
        generationMs: Math.round(performance.now() - start), workerTerminated: terminated };
    }
  },
  dispose() {
    client?.dispose();
    if (worker && !terminated) { worker.terminate(); terminated = true; }
    return { workerTerminated: terminated };
  },
};
