import { build } from 'vite';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { writeFile, stat } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '../..');
const staged = resolve(repo, '.narrator-t5-rebuild/creative-probe/model');
const dist = resolve(repo, '.narrator-t5-rebuild/creative-probe/cache-dist');
const viewpoint = process.argv.includes('--viewpoint');
const singleWrite = viewpoint || process.argv.includes('--single-write');
const entry = viewpoint ? 'viewpoint.html' : 'cache.html';
await build({ configFile: false, root, publicDir: false, logLevel: 'warn', worker: { format: 'es' }, build: { outDir: dist, emptyOutDir: true, target: 'es2022', rollupOptions: { input: resolve(root, entry) } } });
const type = (file) => ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.json': 'application/json' })[extname(file)] || 'application/octet-stream';
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const file = path.startsWith('/model/') ? resolve(staged, path.slice('/model/'.length)) : resolve(dist, path === '/' ? entry : path.slice(1));
  if (![dist, staged].some((base) => file.startsWith(`${base}/`))) { response.writeHead(403).end(); return; }
  response.setHeader('Content-Type', type(file));
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'public, max-age=3600');
  const stream = createReadStream(file);
  stream.on('error', () => { response.writeHead(404); response.end(); });
  stream.pipe(response);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
const deadlineMs = viewpoint ? 300000 : 180000;
const watchdog = setTimeout(() => { console.error(`Probe exceeded ${deadlineMs / 1000} seconds`); browser?.close().finally(() => server.close()); }, deadlineMs);
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  let phase = 'cold';
  const attemptedRequests = [];
  const assetRequests = [];
  const origin = `http://127.0.0.1:${server.address().port}`;
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    attemptedRequests.push({ phase, url: url.href });
    console.log(JSON.stringify({ phase, request: url.href }));
    if (url.origin === origin) {
      if (phase === 'cold' && url.pathname.startsWith('/model/')) return route.continue();
      const file = resolve(dist, url.pathname === '/' ? entry : url.pathname.slice(1));
      if (!file.startsWith(`${dist}/`)) return route.abort();
      if (phase !== 'cold' && !/creative-writer\.worker-[\w-]+\.js$/.test(url.pathname)) return route.abort();
      const bytes = (await stat(file)).size;
      assetRequests.push({ phase, path: url.pathname, bytes });
      if (phase === 'cold') return route.continue();
      return route.fulfill({ path: file, contentType: type(file) });
    }
    const modelPrefix = '/onnx-community/SmolLM2-135M-Instruct-ONNX-MHA/resolve/5b6682c7c9df18f004bfb7e635cba3f3d98537d8/';
    if (phase === 'cold' && url.hostname === 'huggingface.co' && url.pathname.startsWith(modelPrefix)) {
      const file = resolve(staged, url.pathname.slice(modelPrefix.length));
      if (!file.startsWith(`${staged}/`)) return route.abort();
      try { await stat(file); } catch { return route.fulfill({ status: 404, body: '' }); }
      return route.fulfill({ status: 307, headers: { location: `${origin}/model/${url.pathname.slice(modelPrefix.length)}`, 'access-control-allow-origin': '*' } });
    }
    return route.abort();
  });
  page.on('pageerror', (error) => console.error(error.message));
  page.on('crash', () => console.error('Probe page crashed'));
  page.on('console', (message) => { if (message.type() === 'error') console.error(message.text()); });
  await page.goto(origin);
  await page.waitForFunction(() => !!globalThis.creativeCacheProbe);
  const initiallyCached = await page.evaluate(() => globalThis.creativeCacheProbe.cached());
  const cold = await page.evaluate(() => globalThis.creativeCacheProbe.load());
  console.log(JSON.stringify({ phase, ...cold }));
  let restored = null;
  if (!singleWrite) await page.evaluate(() => globalThis.creativeCacheProbe.dispose());
  phase = singleWrite ? 'generation' : 'restore';
  await context.setOffline(true);
  if (!singleWrite) {
    restored = await page.evaluate(() => globalThis.creativeCacheProbe.load());
    console.log(JSON.stringify({ phase, ...restored }));
  }
  phase = 'generation';
  const output = viewpoint ? [] : await page.evaluate(() => globalThis.creativeCacheProbe.write());
  if (viewpoint) {
    for (let index = 0; index < 3; index++) {
      const row = await page.evaluate((index) => globalThis.creativeCacheProbe.write(index), index);
      output.push(row);
      console.log(JSON.stringify(row));
      await writeFile(resolve(root, 'viewpoint-report.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), complete: false, productionWorker: true, syntheticPublicFixtures: true, offlineDuringGeneration: true, deadlineMs, cold, attemptedRequests, outputs: output }, null, 2)}\n`);
    }
  } else console.log(JSON.stringify(output));
  await page.evaluate(() => globalThis.creativeCacheProbe.dispose());
  const report = { capturedAt: new Date().toISOString(), complete: true, browser: await browser.version(), productionWorker: true, crossOriginIsolated: await page.evaluate(() => crossOriginIsolated), wasmThreads: 1, initiallyCached, cold, restored, singleWrite, offlineDuringGeneration: true, offlineDuringRestore: !singleWrite, bootstrapException: singleWrite ? null : 'The already-built same-origin creative writer worker module is fulfilled from disk during restore; all model and runtime network requests are blocked.', attemptedRequests, assetRequests, ...(viewpoint ? { syntheticPublicFixtures: true, deadlineMs, outputs: output } : { output }) };
  const reportName = viewpoint ? 'viewpoint-report.json' : singleWrite ? 'generation-report.json' : 'cache-report.json';
  await writeFile(resolve(root, reportName), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Saved tools/creative-story-probe/${reportName}`);
} finally {
  clearTimeout(watchdog);
  await browser?.close();
  await new Promise((done) => server.close(done));
}
