import { build } from 'vite';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '../..');
const cache = resolve(repo, '.narrator-t5-rebuild/creative-probe');
const dist = resolve(cache, 'dist');
const modelId = 'onnx-community/SmolLM2-135M-Instruct-ONNX-MHA';
const revision = '5b6682c7c9df18f004bfb7e635cba3f3d98537d8';
const artifactNames = ['config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'];
const capsules = [
  { id: 'river-toll', facts: 'Mara crossed the river at Greyford. She paid the ferryman her last copper coin. She reached the eastern bank safely.' },
  { id: 'empty-watchtower', facts: 'Mara reached the abandoned watchtower before dawn. The climb cost her stamina. She rested inside; no encounter occurred.' },
];
const seed = 'Make an ordinary threshold feel bittersweet: relief arrives a moment before the cost sinks in. Use one concrete sensory detail from the existing setting, then a quiet final image suggesting the traveler has left something of herself behind. Avoid explaining the emotion.';
const response = await fetch(`https://huggingface.co/api/models/${modelId}/revision/${revision}`, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`metadata: ${response.status}`);
const metadata = await response.json();
if (metadata.sha !== revision) throw new Error('Model revision mismatch');
await mkdir(cache, { recursive: true });
const artifacts = await Promise.all(artifactNames.map(async (name) => {
  const target = resolve(cache, 'model', name);
  await mkdir(dirname(target), { recursive: true });
  try { await stat(target); } catch {
    console.log(`Downloading ${name}`);
    const response = await fetch(`https://huggingface.co/${modelId}/resolve/${revision}/${name}`, { signal: AbortSignal.timeout(180000) });
    if (!response.ok || !response.body) throw new Error(`artifact ${name}: ${response.status}`);
    const { createWriteStream } = await import('node:fs');
    await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
  }
  const bytes = await readFile(target);
  return { name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}));
await build({ configFile: false, root, publicDir: false, logLevel: 'warn', build: { outDir: dist, emptyOutDir: true, target: 'es2022' } });
const server = createServer((request, response) => {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  const path = new URL(request.url, 'http://localhost').pathname;
  let file;
  if (path.startsWith('/models/smollm/')) file = resolve(cache, 'model', path.slice('/models/smollm/'.length));
  else if (/^\/runtime\/ort-wasm-[\w.-]+\.(mjs|wasm)$/.test(path)) file = resolve(repo, 'node_modules/onnxruntime-web/dist', path.slice('/runtime/'.length));
  else file = resolve(dist, path === '/' ? 'index.html' : path.slice(1));
  if (![cache, dist, resolve(repo, 'node_modules/onnxruntime-web/dist')].some((allowed) => file.startsWith(`${allowed}/`))) { response.writeHead(403).end(); return; }
  response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.json': 'application/json' })[extname(file)] || 'application/octet-stream');
  const stream = createReadStream(file);
  stream.on('error', () => { response.writeHead(404); response.end(); });
  stream.pipe(response);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
const watchdog = setTimeout(() => { console.error('Probe exceeded 180 seconds of browser time'); browser?.close().finally(() => server.close()); }, 180000);
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const requestsDuringGeneration = [];
  let generating = false;
  page.on('request', (request) => { if (generating) requestsDuringGeneration.push(request.url()); });
  page.on('pageerror', (error) => console.error(`Browser: ${error.message}`));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!globalThis.creativeProbe);
  const load = await page.evaluate(() => globalThis.creativeProbe.load());
  console.log(JSON.stringify(load));
  await context.setOffline(true);
  generating = true;
  const outputs = [];
  for (const capsule of capsules) {
    for (const seeded of [false, true]) {
      const output = await page.evaluate((input) => globalThis.creativeProbe.generate(input), { facts: capsule.facts, seed: seeded ? seed : null });
      const row = { id: capsule.id, seeded, facts: capsule.facts, ...output };
      outputs.push(row);
      console.log(JSON.stringify(row));
    }
  }
  const report = { capturedAt: new Date().toISOString(), modelId, revision, tokenizerRevision: revision, transformersVersion: '4.2.0', onnxRuntimeVersion: '1.26.0-dev.20260416-b7804b056c', device: 'wasm', dtype: 'q8', numThreads: 2, browser: await browser.version(), license: 'Source model: Apache-2.0; ONNX conversion card omits license metadata.', decoding: { maxNewTokens: 64, doSample: false, repetitionPenalty: 1.08, constrainedDecoder: false }, seed, artifacts, artifactBytes: artifacts.reduce((sum, a) => sum + a.bytes, 0), ...load, offlineDuringGeneration: true, requestsDuringGeneration, outputs };
  await writeFile(resolve(root, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ artifactBytes: report.artifactBytes, loadMs: load.loadMs, offlineRequests: requestsDuringGeneration.length, report: 'tools/creative-story-probe/report.json' }));
  await page.evaluate(() => globalThis.creativeProbe.dispose());
} finally {
  clearTimeout(watchdog);
  await browser?.close();
  await new Promise((done) => server.close(done));
}
