import { build } from 'vite';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '../..');
export const archivedReport = 'context-fit-report-2026-09-07T00-37-03-923Z-d0521c53-3063-4750-b32c-e523137be3cf.json';
export const model = Object.freeze({ modelId: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF', revision: '9217f5db79a29953eb74d5343926648285ec7e67',
  file: 'qwen2.5-0.5b-instruct-q4_k_m.gguf', bytes: 491400032,
  sha256: '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db', license: 'Apache-2.0' });
export const runtime = Object.freeze({ package: '@wllama/wllama', version: '3.6.1', revision: 'c35450cf9597eaf901293b12458cae204aea0b65',
  archiveBytes: 5626116, archiveSha512: 'v6cA0w6sHuaTLmUo9nSU37Sln+5YqZy/OGWp2dXWaR3ts26yLiMnKHGGbjdzQolPSPydPSKUlHHSKZgXK5Prkw==',
  wasmBytes: 8457512, wasmSha256: '6ca9fdd1b6c03206cd3a04e359b52c8f539896d6c5fb5d36243dded4a689f0ad', license: 'MIT' });
export const budgets = Object.freeze({ stagingMs: 300000, totalMs: 295000, loadMs: 80000, writeMs: 90000, restoreMs: 30000, cleanupMs: 5000 });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function selectArchivedScenes(report) {
  return ['rested-curious-hero', 'injured-active-companion'].map(id => {
    const row = report.outputs?.find(item => item.id === id);
    if (!row || row.messages?.length !== 2 || row.messages[0].role !== 'system' || row.messages[1].role !== 'user') throw new Error(`Missing exact archived scene: ${id}`);
    return { id, facts: row.facts, viewpoint: row.viewpoint, expected: row.expected, seed: row.seed,
      messages: row.messages, messagesSha256: sha(JSON.stringify(row.messages)), historicalRaw: row.raw,
      historicalGenerationMs: row.generationMs };
  });
}
async function fileHash(path, algorithm = 'sha256', encoding = 'hex') {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest(encoding);
}
export async function verifyStage(stage) {
  if ((await stat(resolve(stage, 'model.gguf'))).size !== model.bytes || await fileHash(resolve(stage, 'model.gguf')) !== model.sha256) throw new Error('Staged GGUF mismatch; no run-time downloads');
  if ((await stat(resolve(stage, 'runtime.tgz'))).size !== runtime.archiveBytes || await fileHash(resolve(stage, 'runtime.tgz'), 'sha512', 'base64') !== runtime.archiveSha512) throw new Error('Staged runtime archive mismatch');
  if ((await stat(resolve(stage, 'package/esm/wasm/wllama.wasm'))).size !== runtime.wasmBytes || await fileHash(resolve(stage, 'package/esm/wasm/wllama.wasm')) !== runtime.wasmSha256) throw new Error('Staged WASM mismatch');
  return { modelBytes: model.bytes, runtimeArchiveBytes: runtime.archiveBytes, runtimeWasmBytes: runtime.wasmBytes, allHashesMatch: true };
}
async function stageArtifacts(stage) {
  const signal = AbortSignal.timeout(budgets.stagingMs);
  await Promise.all([
    ['model.gguf', `https://huggingface.co/${model.modelId}/resolve/${model.revision}/${model.file}`],
    ['runtime.tgz', `https://registry.npmjs.org/@wllama/wllama/-/wllama-${runtime.version}.tgz`],
  ].map(async ([name, url]) => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Artifact HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(resolve(stage, name), { flags: 'wx' }), { signal });
  }));
  if (await fileHash(resolve(stage, 'runtime.tgz'), 'sha512', 'base64') !== runtime.archiveSha512) throw new Error('Runtime archive mismatch before extraction');
  execFileSync('tar', ['-xzf', resolve(stage, 'runtime.tgz'), '-C', stage], { timeout: 15000 });
  console.log(JSON.stringify(await verifyStage(stage)));
}

export async function run(stage) {
  const verifiedArtifacts = await verifyStage(stage);
  const archivedBytes = await readFile(resolve(root, archivedReport));
  const scenes = selectArchivedScenes(JSON.parse(archivedBytes));
  const protectedPaths = ['src/narrator/creative-story.ts', `tools/creative-story-probe/${archivedReport}`,
    'tools/creative-story-probe/run-stronger-writer.mjs', 'tools/creative-story-probe/stronger-writer-probe.js'];
  const protectedInputs = await Promise.all(protectedPaths.map(async path => ({ path, sha256: await fileHash(resolve(repo, path)) })));
  const dist = resolve(stage, 'dist');
  await build({ configFile: false, root, publicDir: false, logLevel: 'warn', build: { outDir: dist, emptyOutDir: false,
    target: 'es2022', rollupOptions: { input: resolve(root, 'stronger-writer.html') } } });
  const reportPath = resolve(root, `stronger-writer-report-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`);
  const report = { schemaVersion: 1, capturedAt: new Date().toISOString(), complete: false, model, runtime, verifiedArtifacts, budgets,
    comparison: 'Historical, not a fresh paired A/B: model, runtime, quantization and chat-template implementation differ. Exact archived system/user messages retained.',
    fixtures: 'Synthetic public scenes, not recorded gameplay episodes', archivedReport, archivedSha256: sha(archivedBytes), protectedInputs,
    sampling: { max_tokens: 64, temperature: 0, penalty_repeat: 1.08, penalty_last_n: -1, seed: 17, cache_prompt: false },
    requests: [], generationRequests: [], blockedRequests: [], pageErrors: [], runtimeErrors: [], outputs: [], scenes,
    requestBytes: 0, browserClosed: false, serverClosed: false, quality: 'Pending human review of raw output; text cleaner acceptance is not a quality assessment.' };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  const checkpoint = async phase => { report.phase = phase; await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ phase, at: new Date().toISOString(), report: reportPath })); };
  let browser, server, watchdog, offline = false;
  const started = Date.now();
  const bounded = async (promise, ms, label) => {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), Math.min(ms, Math.max(1, budgets.totalMs - budgets.cleanupMs - (Date.now() - started)))); })]); }
    finally { clearTimeout(timer); }
  };
  try {
    server = createServer(async (request, response) => {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      const file = pathname === '/model.gguf' ? resolve(stage, 'model.gguf') : pathname.startsWith('/runtime/')
        ? resolve(stage, 'package', pathname.slice('/runtime/'.length)) : resolve(dist, pathname === '/' ? 'stronger-writer.html' : pathname.slice(1));
      if (![dist, resolve(stage, 'package')].some(base => file.startsWith(base + '/')) && file !== resolve(stage, 'model.gguf')) { response.writeHead(403).end(); return; }
      try {
        const info = await stat(file);
        response.writeHead(200, { 'Content-Type': ({ '.js': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html' })[extname(file)] || 'application/octet-stream', 'Content-Length': info.size });
        const stream = createReadStream(file); stream.on('data', chunk => { report.requestBytes += chunk.length; }); stream.pipe(response);
      } catch { response.writeHead(404).end(); }
    });
    await new Promise(resolveReady => server.listen(0, '127.0.0.1', resolveReady));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    watchdog = setTimeout(() => { void browser?.close(); server?.closeAllConnections(); }, budgets.totalMs - budgets.cleanupMs);
    report.browser = browser.version(); report.customChromiumFlags = [];
    const context = await browser.newContext();
    await context.route('**/*', route => {
      const url = route.request().url();
      if (!url.startsWith(origin + '/') || offline) { report.blockedRequests.push(url); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => report.pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.runtimeErrors.push(message.text().slice(0, 500)); });
    page.on('request', request => { report.requests.push(request.url()); if (offline) report.generationRequests.push(request.url()); });
    await bounded(page.goto(origin), 15000, 'Probe page');
    await bounded(page.waitForFunction(() => !!globalThis.strongerWriterProbe), 10000, 'Probe entry');
    report.capability = await page.evaluate(() => globalThis.strongerWriterProbe.capability);
    if (!report.capability.jspi) throw new Error('Ordinary browser lacks JSPI; compatibility fallback is disabled');
    await checkpoint('cold-load');
    report.cold = await bounded(page.evaluate(() => globalThis.strongerWriterProbe.load()), budgets.loadMs, 'Cold load');
    offline = true;
    await context.setOffline(true);
    report.offlineDuringGeneration = true;
    await checkpoint('loaded-offline');
    for (const scene of scenes) {
      await checkpoint(`writing-${scene.id}`);
      const result = await bounded(page.evaluate(messages => globalThis.strongerWriterProbe.write(messages), scene.messages), budgets.writeMs, scene.id);
      report.outputs.push({ ...scene, ...result });
      await checkpoint(`completed-${scene.id}`);
      console.log(JSON.stringify({ id: scene.id, ...result }));
    }
    await checkpoint('offline-cache-restore');
    report.restore = await bounded(page.evaluate(async () => { await globalThis.strongerWriterProbe.dispose(); return globalThis.strongerWriterProbe.load(true); }), budgets.restoreMs, 'Disposed-worker offline cache restore');
    await bounded(page.evaluate(() => globalThis.strongerWriterProbe.dispose()), 3000, 'Dispose');
    report.complete = true;
  } catch (error) { report.error = error.stack || String(error); console.error(report.error); }
  finally {
    clearTimeout(watchdog);
    if (browser) { await bounded(browser.close(), budgets.cleanupMs, 'Browser cleanup').then(() => { report.browserClosed = true; }, error => { report.cleanupError = error.message; }); }
    if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); report.serverClosed = true; }
    report.protectedInputsUnchanged = (await Promise.all(protectedInputs.map(async input => await fileHash(resolve(repo, input.path)) === input.sha256))).every(Boolean);
    report.finishedAt = new Date().toISOString(); report.totalMs = Date.now() - started;
    await checkpoint(report.complete ? 'complete' : 'stopped');
    console.log(JSON.stringify({ complete: report.complete, outputs: report.outputs.length, browserClosed: report.browserClosed, serverClosed: report.serverClosed, totalMs: report.totalMs, report: reportPath }));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, stage] = process.argv.slice(2);
  if (!['--stage', '--run'].includes(mode) || !stage || process.argv.length !== 4) throw new Error('Usage: node run-stronger-writer.mjs (--stage | --run) EXISTING_TASK_TEMP_DIR');
  if (mode === '--stage') await stageArtifacts(resolve(stage)); else await run(resolve(stage));
}
