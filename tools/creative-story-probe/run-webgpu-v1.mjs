import { build } from 'vite';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { createReadStream, writeFileSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { webgpuV1, webgpuV1Flags } from './webgpu-v1-config.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '../..');
const stage = resolve(repo, '.narrator-t5-rebuild/creative-probe/webllm-v1');
const profile = resolve(stage, 'candidate-browser-profile');
const runtime = resolve(stage, 'node_modules/@mlc-ai/web-llm');
const timestamp = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', timeZoneName: 'short' }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}]`;
};
const log = (value) => console.log(`${timestamp()} ${typeof value === 'string' ? value : JSON.stringify(value)}`);
const timed = (promise, ms, label) => new Promise((accept, decline) => {
  const timer = setTimeout(() => decline(new Error(`${label} exceeded ${ms / 1000}s`)), ms);
  Promise.resolve(promise).then(accept, decline).finally(() => clearTimeout(timer));
});
const mime = (file) => ({ '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' })[extname(file)] ?? 'application/octet-stream';
const safeUrl = (url) => { const value = new URL(url); return value.origin + value.pathname; };

async function run() {
  const args = process.argv.slice(2);
  const productionScenes = args.includes('--production-scenes');
  const productionSolo = args.includes('--production-solo');
  const replayFarewell = args.includes('--replay-farewell');
  const replaySequence = args.includes('--replay-sequence');
  const replay = replayFarewell || replaySequence;
  const productionMode = productionScenes || productionSolo || replay;
  if (!args.includes('--run') || new Set(args).size !== args.length
    || [productionScenes, productionSolo, replayFarewell, replaySequence].filter(Boolean).length > 1
    || args.some((arg) => !['--run', '--production-scenes', '--production-solo', '--replay-farewell', '--replay-sequence'].includes(arg))) {
    throw new Error('Usage: node tools/creative-story-probe/run-webgpu-v1.mjs --run [--production-scenes | --production-solo | --replay-farewell | --replay-sequence]');
  }
  const plannedScenes = replaySequence ? 3 : productionSolo || replayFarewell ? 1 : productionScenes ? 4 : 2;
  const totalDeadlineMs = productionScenes ? 900_000 : webgpuV1.totalDeadlineMs;
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const reportPath = resolve(root, `webgpu-v1-report-${runId}.json`);
  const dist = resolve(stage, `dist-${runId}`);
  const report = { startedAt: new Date().toISOString(), phase: 'preflight', complete: false,
    mode: replaySequence ? 'recorded-sequence-diagnostic-cache-only' : replayFarewell ? 'recorded-farewell-diagnostic-cache-only' : productionSolo ? 'production-solo-cache-only' : productionScenes ? 'production-scenes-cache-only' : 'shared-emotional-scenes',
    writerPath: productionMode ? 'production-client-and-worker' : 'exploratory-proxy-engine',
    plannedScenes, totalDeadlineMs, isolatedSolo: productionSolo,
    cacheOnlyRestore: productionMode,
    ...(replay ? { replay: { receipt: 'webgpu-v1-report-2026-09-08T09-35-34-796Z-bca127e5.json', scenes: replaySequence ? [1, 2, 3] : [3],
      lifecycle: replaySequence ? 'same-worker-recorded-request-order-fixed-history' : 'fresh-worker-exact-messages-not-original-sequence' }, diagnostics: [] } : {}),
    identity: webgpuV1, args: webgpuV1Flags, sources: [], requests: [], blockedRequests: [],
    progress: [], generatedChunks: [], inputs: [], outputs: [], approvals: [], errors: [],
    quality: 'Candidate only. Human literary assessment is required; completed inference is not production approval.',
    profile: { directory: profile, kind: 'owned persistent probe cache, never a real user profile', preserved: true },
    cleanup: { workerTerminated: false, contextClosed: false, browserClosed: false, serverClosed: false } };
  const started = Date.now();
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  let writes = Promise.resolve();
  const checkpoint = () => { const text = JSON.stringify(report, null, 2) + '\n';
    writes = writes.then(() => writeFile(reportPath, text)); return writes; };
  let context, page, server, input, cancelled = false, online = !productionMode, lineWaiter;
  const commandQueue = [];
  const nextCommand = () => commandQueue.length ? Promise.resolve(commandQueue.shift()) : new Promise((accept) => { lineWaiter = accept; });
  const guard = () => { if (cancelled) throw new Error('Probe deadline reached'); };
  const execute = async () => {
    const pkg = JSON.parse(await readFile(resolve(runtime, 'package.json'), 'utf8'));
    if (pkg.version !== webgpuV1.runtimeVersion) throw new Error('Staged WebLLM version does not match the pinned probe');
    if (productionMode) {
      const installedRuntime = resolve(repo, 'node_modules/@mlc-ai/web-llm');
      const installedPackage = JSON.parse(await readFile(resolve(installedRuntime, 'package.json'), 'utf8'));
      const stagedBytes = await readFile(resolve(runtime, 'lib/index.js'));
      const installedBytes = await readFile(resolve(installedRuntime, 'lib/index.js'));
      if (installedPackage.version !== pkg.version || !stagedBytes.equals(installedBytes)) {
        throw new Error('Production and staged runtime bytes must match');
      }
    }
    for (const file of ['webgpu-v1-config.mjs', 'webgpu-v1-probe.js', 'webgpu-v1-worker.js', 'webgpu-v1-cases.mjs', 'run-webgpu-v1.mjs',
      'emotional-scene-messages.mjs', 'successive-story-cases.mjs', '../../src/narrator/creative-story.ts',
      '../../src/narrator/creative-writer-conversation.ts',
      '../../src/narrator/creative-continuity.ts',
      '../../src/narrator/creative-writer-client.ts', '../../src/narrator/creative-writer.worker.ts',
      '../../src/narrator/creative-writer-model.ts', '../../src/narrator/creative-writer-cache.ts',
      '../../src/narrator/creative-direction-logits.ts', '../../src/narrator/creative-story-sentences.ts',
      '../../src/narrator/creative-writer-diagnostics.ts', 'webgpu-v1-report-2026-09-08T09-35-34-796Z-bca127e5.json',
      '../../src/ui/narrative-journal.ts', '../../src/ui/narrative-continuity.ts', '../../src/narrator/story-character-anchor.ts',
      resolve(repo, 'node_modules/@mlc-ai/web-llm/lib/index.js'), resolve(repo, 'node_modules/@mlc-ai/web-llm/package.json'),
      resolve(runtime, 'lib/index.js'), resolve(runtime, 'package.json')]) {
      const bytes = await readFile(resolve(root, file));
      report.sources.push({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    report.profile.preexisting = await stat(profile).then(() => true, () => false);
    if (productionMode && !report.profile.preexisting) throw new Error('Production scene proof requires the existing owned cached-model profile');
    await mkdir(profile, { recursive: true });
    report.phase = 'build'; await checkpoint();
    await timed(build({ configFile: false, root, publicDir: false, logLevel: 'silent',
      define: { 'import.meta.env.VITE_CREATIVE_WRITER_DIAGNOSTICS': JSON.stringify(replay ? '1' : '0') },
      resolve: { alias: { '@tg2-webllm-v1': resolve(runtime, 'lib/index.js') } }, worker: { format: 'es' },
      build: { outDir: dist, emptyOutDir: false, target: 'es2022', rollupOptions: { input: resolve(root, 'webgpu-v1.html') } },
    }), 60_000, 'Probe build');
    guard();
    server = createServer((request, response) => {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      const file = resolve(dist, pathname === '/' ? 'webgpu-v1.html' : pathname.slice(1));
      if (!file.startsWith(dist + '/')) { response.writeHead(403).end(); return; }
      response.setHeader('Content-Type', mime(file));
      createReadStream(file).on('error', () => { if (!response.headersSent) response.writeHead(404); response.end(); }).pipe(response);
    });
    // A stable, exclusively bound local origin lets this owned profile reuse its CacheStorage.
    await new Promise((accept, decline) => { server.once('error', decline); server.listen(19877, '127.0.0.1', accept); });
    const origin = 'http://127.0.0.1:19877';
    context = await chromium.launchPersistentContext(profile, { headless: true, args: [...webgpuV1Flags], timeout: 15_000 });
    report.browser = context.browser()?.version();
    context.on('request', (request) => report.requests.push({ elapsedMs: Date.now() - started, phase: report.phase,
      method: request.method(), resourceType: request.resourceType(), url: safeUrl(request.url()) }));
    context.on('requestfailed', (request) => report.errors.push({ type: 'requestfailed', url: safeUrl(request.url()), error: request.failure()?.errorText }));
    await context.route('**/*', async (route) => {
      const request = route.request(); const url = new URL(request.url());
      const artifact = url.href.startsWith(webgpuV1.modelUrl) || url.href === webgpuV1.modelLib
        || url.href.startsWith(`https://huggingface.co/api/resolve-cache/models/mlc-ai/${webgpuV1.modelId}/${webgpuV1.modelRevision}/`)
        || url.hostname.endsWith('.hf.co') || url.hostname.endsWith('.huggingface.co');
      if (['GET', 'HEAD'].includes(request.method()) && (url.origin === origin || (online && artifact))) return route.continue();
      report.blockedRequests.push({ elapsedMs: Date.now() - started, phase: report.phase, method: request.method(), url: safeUrl(request.url()) });
      return route.abort('blockedbyclient');
    });
    page = context.pages()[0] ?? await context.newPage();
    page.on('pageerror', (error) => report.errors.push({ type: 'pageerror', message: String(error).slice(0, 1000) }));
    page.on('console', (message) => {
      const text = message.text();
      if (replay && text.startsWith('TG2_WRITER_NUMERICS ') && text.length < 40_000 && report.diagnostics.length < plannedScenes) {
        try { report.diagnostics.push(JSON.parse(text.slice('TG2_WRITER_NUMERICS '.length))); }
        catch { report.errors.push({ type: 'invalid-diagnostics' }); }
      } else if (message.type() === 'error') report.errors.push({ type: 'console-error', message: text.slice(0, 1000) });
    });
    await page.exposeFunction('reportWebgpuV1Event', async (event) => {
      if (event.type === 'load-progress') {
        report.progress.push({ elapsedMs: Date.now() - started, ...event });
        log({ phase: report.phase, ...event });
      } else if (event.type === 'generated-text') report.generatedChunks.push(event);
      else report.errors.push(event);
      await checkpoint();
    });
    await page.goto(origin + (replaySequence ? '/?replay-sequence=1' : replayFarewell ? '/?replay-farewell=1' : productionSolo ? '/?production-solo=1' : productionScenes ? '/?production-scenes=1' : '/'),
      { waitUntil: 'load', timeout: 15_000 });
    report.cacheBeforeLoad = await page.evaluate(() => globalThis.webgpuV1Probe.cacheInventory());
    report.capability = await page.evaluate(async () => {
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error('No WebGPU adapter');
      const info = adapter.info;
      return { vendor: info.vendor, architecture: info.architecture, device: info.device,
        description: info.description, isFallbackAdapter: info.isFallbackAdapter,
        features: [...adapter.features], maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize };
    });
    if (report.capability.isFallbackAdapter || !report.capability.features.includes('shader-f16')) throw new Error('This candidate requires a nonfallback shader-f16 adapter');
    report.phase = 'load'; await checkpoint();
    report.load = await timed(page.evaluate(() => globalThis.webgpuV1Probe.load()), webgpuV1.loadDeadlineMs, 'GPU model load');
    guard();
    online = false; await context.setOffline(true); report.offlineAfterLoad = true;
    input = createInterface({ input: process.stdin });
    input.on('line', (line) => { if (lineWaiter) { const accept = lineWaiter; lineWaiter = undefined; accept(line.trim()); } else commandQueue.push(line.trim()); });
    input.on('close', () => { if (lineWaiter) { lineWaiter('quit'); lineWaiter = undefined; } else commandQueue.push('quit'); });
    for (let index = 0; index < plannedScenes; index += 1) {
      guard(); report.phase = `scene-${index + 1}`;
      const fixture = await page.evaluate((value) => globalThis.webgpuV1Probe.prepare(value), index);
      report.inputs.push(fixture); await checkpoint();
      const writeStarted = Date.now();
      const result = await timed(page.evaluate((value) => globalThis.webgpuV1Probe.write(value), index), webgpuV1.generationDeadlineMs, 'GPU scene')
        .catch((error) => ({ ...fixture, status: 'failed', error: String(error), cleaned: null,
          raw: productionMode ? null : report.generatedChunks.filter((chunk) => chunk.index === index).map((chunk) => chunk.text).join(''),
          usage: null, firstTokenMs: null, finishReason: null,
          generationMs: Date.now() - writeStarted, partialOutputAvailable: !productionMode, partialOutputOnly: !productionMode }));
      report.outputs.push(result); await checkpoint(); log({ phase: report.phase, result, reportPath });
      if (result.status !== 'completed') throw new Error(result.error ?? 'GPU generation failed');
      report.phase = 'human-review'; await checkpoint();
      log(index < plannedScenes - 1
        ? `Paused after scene ${index + 1}. Enter next to approve exactly one more scene, or quit to stop.`
        : `Paused after scene ${index + 1}. Enter quit to finish; no further scene is authorized.`);
      let command;
      const allowedCommands = productionSolo || replayFarewell ? ['quit'] : ['next', 'quit'];
      do { command = await nextCommand(); if (!allowedCommands.includes(command)) log(productionSolo || replayFarewell ? 'Expected quit; this one-scene check has no next scene.' : 'Expected next or quit.'); } while (!allowedCommands.includes(command));
      guard();
      report.approvals.push({ afterScene: index + 1, command, at: new Date().toISOString() });
      if (command === 'quit' || index === plannedScenes - 1) break;
    }
    guard(); report.complete = true; report.phase = 'closed-after-human-review';
  };
  try { await timed(execute(), totalDeadlineMs, 'Entire GPU probe'); }
  catch (error) { cancelled = true; report.errors.push({ phase: report.phase, message: String(error) }); process.exitCode = 1; }
  finally {
    // Playwright's installed process launcher registers an exit hook that kills
    // only browser process groups created by this Node process. Never use a broad pkill.
    const cleanupWatchdog = setTimeout(() => {
      report.complete = false; report.phase = 'cleanup-watchdog';
      report.cleanup.forcedProcessExit = true; report.elapsedMs = Date.now() - started;
      report.errors.push({ phase: 'cleanup', message: 'Owned cleanup exceeded 25s; exiting through Playwright child-process exit hooks. Closure not confirmed.' });
      try { writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n'); }
      finally { log({ reportPath, complete: false, cleanup: report.cleanup }); process.exit(1); }
    }, 25_000);
    cancelled = true; input?.close();
    if (page && !page.isClosed()) report.cleanup.workerTerminated = await timed(page.evaluate(() => globalThis.webgpuV1Probe?.dispose().workerTerminated ?? false), 3_000, 'Worker termination').catch(() => false);
    if (context) {
      try { await timed(context.close(), 10_000, 'Browser context cleanup'); report.cleanup.contextClosed = true; report.cleanup.browserClosed = true; }
      catch (error) {
        report.errors.push({ phase: 'cleanup', message: String(error) });
        const browser = context.browser();
        if (browser) await timed(browser.close(), 5_000, 'Browser fallback cleanup').then(() => {
          report.cleanup.contextClosed = true; report.cleanup.browserClosed = true;
        }).catch((failure) => report.errors.push({ phase: 'cleanup', message: String(failure) }));
      }
    } else report.cleanup.contextClosed = report.cleanup.browserClosed = true;
    if (server) {
      server.closeAllConnections();
      await timed(new Promise((accept) => server.close(accept)), 5_000, 'Local server cleanup')
        .then(() => { report.cleanup.serverClosed = true; })
        .catch((error) => report.errors.push({ phase: 'cleanup', message: String(error) }));
    } else report.cleanup.serverClosed = true;
    if (!Object.values(report.cleanup).every((value) => value === true)) {
      report.complete = false; process.exitCode = 1;
      report.errors.push({ phase: 'cleanup', message: 'One or more owned resources did not confirm closure.' });
    }
    report.elapsedMs = Date.now() - started;
    await checkpoint(); log({ reportPath, phase: report.phase, complete: report.complete, outputs: report.outputs.length, cleanup: report.cleanup });
    if (!report.cleanup.browserClosed) process.exit(1);
    clearTimeout(cleanupWatchdog);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => { log(String(error)); process.exitCode = 1; });
}
