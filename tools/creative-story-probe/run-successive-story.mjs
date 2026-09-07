import { build } from 'vite';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyStagedArtifacts } from './run-context-fit.mjs';
import { digest } from './sentence-stopping-contract.mjs';
import { successiveStoryBudgets as budgets, instrumentSuccessiveStoryWorker,
  successiveStoryReportName } from './successive-story-contract.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '../..');
const staged = resolve(repo, '.narrator-t5-rebuild/creative-probe/model');
const artifactNames = ['config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'];
const mime = (file) => ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
  '.html': 'text/html', '.json': 'application/json' })[extname(file)] || 'application/octet-stream';

export async function runSuccessiveStory(args = process.argv.slice(2)) {
  if (args.length !== 1 || args[0] !== '--run') throw new Error('Explicit --run required; no artifact downloads or retries are supported');
  const started = Date.now();
  const reportPath = resolve(root, successiveStoryReportName());
  const report = { capturedAt: new Date(started).toISOString(), complete: false, phase: 'preflight', budgetsMs: budgets,
    experiment: 'one-two-scene-generated-journal-continuity-chain', outputs: [], errors: [], events: [],
    requests: [], blockedRequests: [], servedArtifacts: [], runtimeWorkers: [], runtimeWorkerCount: 0, productionClient: true,
    toolsOnlyObservationInstrumentation: true, wasmThreads: 1, dtype: 'q8', maxNewTokens: 64,
    doSample: false, repetitionPenalty: 1.08, maximumInputTokens: 1024,
    qualityVerdict: 'Not graded: requires independent reading of actual prose; accepted codec output is not a quality pass.',
    interpretation: 'Two synthetic successive public scenes, not recorded gameplay and not a controlled A/B. First actual accepted model output is recorded by the production journal and selected by its continuity helper. No authored fallback, direction decision, model download, or retry.',
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  let writes = Promise.resolve();
  const checkpoint = () => { const json = JSON.stringify(report, null, 2) + '\n';
    writes = writes.then(() => writeFile(reportPath, json)); return writes; };
  const protectedInputs = new Map();
  let browser;
  let server;
  let watchdog;
  let heartbeat;
  let expired = false;
  const active = () => { if (expired) throw new Error('Successive story work deadline expired'); };
  const execute = async () => {
    for (const name of ['src/narrator/creative-writer.worker.ts', 'src/narrator/creative-writer-client.ts',
      'src/narrator/creative-story.ts', 'src/narrator/creative-story-sentences.ts', 'src/narrator/creative-continuity.ts',
      'src/narrator/creative-direction-logits.ts', 'src/narrator/story-seeds.json',
      'src/ui/narrative-journal.ts', 'src/ui/narrative-continuity.ts',
      'tools/creative-story-probe/report.json', 'tools/creative-story-probe/run-context-fit.mjs',
      'tools/creative-story-probe/sentence-stopping-contract.mjs', 'tools/creative-story-probe/run-successive-story.mjs',
      'tools/creative-story-probe/successive-story-contract.mjs', 'tools/creative-story-probe/successive-story-cases.mjs',
      'tools/creative-story-probe/successive-story-probe.js', 'tools/creative-story-probe/successive-story.html']) {
      protectedInputs.set(name, await readFile(resolve(repo, name)));
    }
    report.inputSha256 = Object.fromEntries([...protectedInputs].map(([name, bytes]) => [name, digest(bytes)]));
    const manifest = JSON.parse(protectedInputs.get('tools/creative-story-probe/report.json'));
    if (manifest.modelId !== 'onnx-community/SmolLM2-135M-Instruct-ONNX-MHA'
      || manifest.revision !== '5b6682c7c9df18f004bfb7e635cba3f3d98537d8') throw new Error('Pinned model identity changed');
    report.modelId = manifest.modelId;
    report.revision = manifest.revision;
    report.artifacts = await verifyStagedArtifacts(staged, manifest.artifacts);
    if (report.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0) !== 139_538_098) throw new Error('Pinned footprint changed');
    active();
    report.phase = 'build';
    await checkpoint();
    const dist = await mkdtemp(resolve(repo, '.narrator-t5-rebuild/creative-probe/successive-story-dist-'));
    let transformed = 0;
    await build({ configFile: false, root, base: '/', publicDir: false, logLevel: 'warn',
      worker: { format: 'es', rollupOptions: { output: { inlineDynamicImports: true } },
        plugins: () => [{ name: 'successive-story-observations', enforce: 'pre', transform(source, id) {
          if (id.split('?')[0] !== resolve(repo, 'src/narrator/creative-writer.worker.ts')) return null;
          transformed += 1;
          const code = instrumentSuccessiveStoryWorker(source);
          report.instrumentedWorkerSha256 = digest(code);
          return { code, map: null };
        } }] },
      build: { outDir: dist, emptyOutDir: false, target: 'es2022',
        rollupOptions: { input: resolve(root, 'successive-story.html') } },
    });
    report.observedTransformCount = transformed;
    if (transformed < 1) throw new Error('Production worker observation transform was not applied');
    report.builtAssets = await Promise.all((await readdir(resolve(dist, 'assets'))).map(async (name) => {
      const bytes = await readFile(resolve(dist, 'assets', name));
      return { name: `assets/${name}`, bytes: bytes.length, sha256: digest(bytes) };
    }));
    active();
    server = createServer(async (request, response) => {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      const model = pathname.startsWith('/model/');
      const name = pathname.slice('/model/'.length);
      if (model && !artifactNames.includes(name)) { response.writeHead(403).end(); return; }
      const directory = model ? staged : dist;
      const file = resolve(directory, model ? name : pathname.slice(1));
      if (!file.startsWith(directory + '/')) { response.writeHead(403).end(); return; }
      try {
        const size = (await stat(file)).size;
        response.setHeader('Content-Type', mime(file));
        response.setHeader('Content-Length', size);
        report.servedArtifacts.push({ phase: report.phase, path: model ? `/model/${name}` : relative(dist, file), bytes: size });
        createReadStream(file).on('error', () => response.destroy()).pipe(response);
      } catch { response.writeHead(404).end(); }
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    active();
    report.browser = await browser.version();
    const context = await browser.newContext();
    context.on('request', (request) => report.requests.push({ phase: report.phase, url: request.url() }));
    report.phase = 'prime-local-cache';
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (report.phase === 'prime-local-cache' && url.origin === origin) return route.continue();
      report.blockedRequests.push({ phase: report.phase, url: url.href });
      return route.abort();
    });
    const page = await context.newPage();
    page.on('worker', (worker) => {
      report.runtimeWorkers.push({ phase: report.phase, url: worker.url() });
      report.runtimeWorkerCount = report.runtimeWorkers.length;
    });
    page.on('pageerror', (error) => report.errors.push({ phase: report.phase, message: error.message }));
    await page.exposeFunction('reportProbeEvent', async (event) => {
      report.events.push({ phase: report.phase, elapsedMs: Date.now() - started, ...event });
      await checkpoint();
      console.log(JSON.stringify({ phase: report.phase, event }));
    });
    await page.goto(`${origin}/successive-story.html`, { timeout: 20_000 });
    await page.waitForFunction(() => !!globalThis.successiveStoryProbe, undefined, { timeout: 10_000 });
    const identity = await page.evaluate(() => globalThis.successiveStoryProbe.identity);
    if (identity.modelId !== manifest.modelId || identity.revision !== manifest.revision
      || identity.inferenceTimeoutMs !== budgets.write || await page.evaluate(() => crossOriginIsolated)) throw new Error('Production identity/thread/deadline mismatch');
    report.primed = await page.evaluate((artifacts) => globalThis.successiveStoryProbe.prime(artifacts), report.artifacts);
    if (!report.primed.cached) throw new Error('Local cache priming incomplete');
    await page.evaluate(() => globalThis.successiveStoryProbe.boot());
    if (report.runtimeWorkerCount !== 1) throw new Error('Expected exactly one actual browser worker');
    await context.setOffline(true);
    report.phase = 'offline-cache-restore';
    await checkpoint();
    report.loaded = await page.evaluate(() => globalThis.successiveStoryProbe.load());
    active();
    for (let index = 0; index < 2; index += 1) {
      report.phase = `offline-story-${index + 1}`;
      const fixture = await page.evaluate((ordinal) => globalThis.successiveStoryProbe.prepare(ordinal), index);
      report.pending = fixture;
      await checkpoint();
      console.log(JSON.stringify({ phase: report.phase, id: fixture.id, memory: fixture.continuity }));
      const output = await page.evaluate((ordinal) => globalThis.successiveStoryProbe.write(ordinal), index);
      report.outputs.push(output);
      report.pending = null;
      await checkpoint();
      console.log(JSON.stringify({ phase: report.phase, raw: output.raw, cleaned: output.cleaned,
        generationMs: output.generationMs, inputTokens: output.inputTokens, outputTokens: output.outputTokens }));
      active();
      if (output.status !== 'completed') throw new Error('Write failed; no retry or later story');
      if (!Number.isSafeInteger(output.inputTokens) || output.inputTokens < 1 || output.inputTokens > 1024
        || !Number.isSafeInteger(output.outputTokens) || output.outputTokens < 1 || output.outputTokens > 64) throw new Error('Missing or invalid actual token observations');
      if (!output.acceptedNewStory || !output.archived) {
        report.chainStopped = output.exactMemoryRepeat ? 'Exact recalled prose would be rejected by the production controller; no new story archived'
          : 'Model output rejected or not archived; no authored substitute';
        break;
      }
    }
    report.disposed = await page.evaluate(() => globalThis.successiveStoryProbe.dispose());
    if (report.runtimeWorkerCount !== 1) throw new Error('Unexpected additional runtime worker');
    report.offlineRequests = report.requests.filter(({ phase }) => phase.startsWith('offline-'));
    if (report.offlineRequests.length || report.blockedRequests.length || report.errors.length) throw new Error('Unexpected network/browser errors');
    report.complete = true;
    report.chainCompleted = report.outputs.length === 2 && report.outputs.every((output) => output.cleaned !== null && output.archived);
    report.phase = 'complete';
  };
  try {
    heartbeat = setInterval(() => console.log(JSON.stringify({ phase: report.phase, elapsedMs: Date.now() - started, completedWrites: report.outputs.length })), 30_000);
    await Promise.race([execute(), new Promise((_, decline) => {
      watchdog = setTimeout(() => { expired = true; decline(new Error('235second work watchdog expired')); }, budgets.work);
    })]);
  } catch (error) {
    report.errors.push({ phase: report.phase, message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  } finally {
    clearTimeout(watchdog);
    clearInterval(heartbeat);
    await checkpoint();
    const cleanupWatchdog = setTimeout(() => process.exit(1), budgets.cleanup);
    cleanupWatchdog.unref();
    await browser?.close();
    report.browserClosed = browser !== undefined;
    server?.closeAllConnections();
    if (server) await new Promise((done) => server.close(done));
    report.serverClosed = server !== undefined;
    report.protectedInputsUnchanged = (await Promise.all([...protectedInputs].map(async ([name, bytes]) =>
      (await readFile(resolve(repo, name))).equals(bytes)))).every(Boolean);
    if (!report.protectedInputsUnchanged) {
      report.complete = false;
      report.errors.push({ phase: 'cleanup', message: 'Protected production/probe source changed during proof' });
      process.exitCode = 1;
    }
    report.offlineRequests = report.requests.filter(({ phase }) => phase.startsWith('offline-'));
    report.finishedAt = new Date().toISOString();
    report.elapsedMs = Date.now() - started;
    await checkpoint();
    clearTimeout(cleanupWatchdog);
    console.log(`Successive story report: ${reportPath}`);
  }
  return { reportPath, report };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runSuccessiveStory();
