import { build } from 'vite';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyStagedArtifacts } from './run-context-fit.mjs';
import { stoppingBudgets, transformStoppingWorker, selectStoppingFixture, digest,
  stoppingReportName, compareStoppingOutputs } from './sentence-stopping-contract.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '../..');
const staged = resolve(repo, '.narrator-t5-rebuild/creative-probe/model');
const files = ['config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'];
const mime = (file) => ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
  '.html': 'text/html', '.json': 'application/json' })[extname(file)] || 'application/octet-stream';

export async function runSentenceStopping(args = process.argv.slice(2)) {
  if (args.length !== 1 || args[0] !== '--run') throw new Error('Explicit --run required; no model downloads are supported');
  const started = Date.now();
  const reportPath = resolve(root, stoppingReportName());
  const report = { capturedAt: new Date(started).toISOString(), complete: false,
    experiment: 'one-fixed-order-matched-sentence-stopping-check', budgetsMs: stoppingBudgets,
    phase: 'preflight', baseline: null, candidate: null, errors: [], requests: [], blockedRequests: [],
    productionClient: true, toolsOnlyTokenInstrumentation: true, dtype: 'q8', wasmThreads: 1,
    maxNewTokens: 64, doSample: false, repetitionPenalty: 1.08,
    outputTokenDefinition: 'Actual generated token suffix length, including EOS or stopping lookahead when present; not estimated from text.',
    interpretation: 'Identical archived messages and generation settings; baseline removes only stopping_criteria. Baseline-first order and cold versus restored workers confound timing. This is not general prose-quality or speed A/B evidence.',
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  let checkpointWrites = Promise.resolve();
  const checkpoint = () => { const json = JSON.stringify(report, null, 2) + '\n';
    checkpointWrites = checkpointWrites.then(() => writeFile(reportPath, json)); return checkpointWrites; };
  const protectedInputs = new Map();
  let browser;
  let server;
  let expired = false;
  let watchdog;
  const ensureActive = () => { if (expired) throw new Error('Sentence stopping work deadline expired'); };
  const execute = async () => {
    for (const name of ['src/narrator/creative-writer.worker.ts', 'src/narrator/creative-writer-client.ts',
      'src/narrator/creative-story.ts', 'src/narrator/creative-story-sentences.ts',
      'src/narrator/story-seeds.json', 'tools/creative-story-probe/report.json',
      'tools/creative-story-probe/viewpoint-report.json', 'tools/creative-story-probe/run-sentence-stopping.mjs',
      'tools/creative-story-probe/sentence-stopping-contract.mjs', 'tools/creative-story-probe/sentence-stopping-probe.js',
      'tools/creative-story-probe/sentence-stopping.html', 'tools/creative-story-probe/run-context-fit.mjs']) {
      protectedInputs.set(name, await readFile(resolve(repo, name)));
    }
    report.inputSha256 = Object.fromEntries([...protectedInputs].map(([name, bytes]) => [name, digest(bytes)]));
    const manifest = JSON.parse(protectedInputs.get('tools/creative-story-probe/report.json'));
    if (manifest.modelId !== 'onnx-community/SmolLM2-135M-Instruct-ONNX-MHA'
      || manifest.revision !== '5b6682c7c9df18f004bfb7e635cba3f3d98537d8') throw new Error('Pinned model identity changed');
    report.modelId = manifest.modelId;
    report.revision = manifest.revision;
    report.fixture = selectStoppingFixture(JSON.parse(protectedInputs.get('tools/creative-story-probe/viewpoint-report.json')));
    const workerSource = protectedInputs.get('src/narrator/creative-writer.worker.ts').toString('utf8');
    report.transformedWorkerSha256 = Object.fromEntries(['baseline', 'candidate'].map((variant) =>
      [variant, digest(transformStoppingWorker(workerSource, variant))]));
    report.artifacts = await verifyStagedArtifacts(staged, manifest.artifacts);
    if (report.artifacts.reduce((total, artifact) => total + artifact.bytes, 0) !== 139_538_098) {
      throw new Error('Pinned artifact footprint changed');
    }
    ensureActive();
    report.phase = 'build';
    const dist = await mkdtemp(resolve(repo, '.narrator-t5-rebuild/creative-probe/sentence-stopping-dist-'));
    report.dist = dist;
    for (const variant of ['baseline', 'candidate']) {
      let transformed = 0;
      await build({ configFile: false, root, base: `/${variant}/`, publicDir: false, logLevel: 'warn',
        worker: { format: 'es', rollupOptions: { output: { inlineDynamicImports: true } },
          plugins: () => [{ name: 'isolated-sentence-stopping', enforce: 'pre',
          transform(source, id) {
            if (id.split('?')[0] !== resolve(repo, 'src/narrator/creative-writer.worker.ts')) return null;
            transformed += 1;
            return { code: transformStoppingWorker(source, variant), map: null };
          } }] },
        build: { outDir: resolve(dist, variant), emptyOutDir: false, target: 'es2022',
          rollupOptions: { input: resolve(root, 'sentence-stopping.html') } },
      });
      if (transformed < 1) throw new Error('Worker transform was not applied');
      ensureActive();
    }
    server = createServer((request, response) => {
      const path = new URL(request.url, 'http://localhost').pathname;
      const isModel = path.startsWith('/model/');
      const name = path.slice('/model/'.length);
      if (isModel && !files.includes(name)) { response.writeHead(403).end(); return; }
      const file = isModel ? resolve(staged, name) : resolve(dist, path.slice(1));
      if (!(isModel ? file.startsWith(staged + '/') : file.startsWith(dist + '/'))) { response.writeHead(403).end(); return; }
      response.setHeader('Content-Type', mime(file));
      response.setHeader('Access-Control-Allow-Origin', '*');
      const stream = createReadStream(file);
      stream.on('error', () => { if (!response.headersSent) response.writeHead(404); response.end(); });
      stream.pipe(response);
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const origin = `http://127.0.0.1:${server.address().port}`;
    ensureActive();
    browser = await chromium.launch({ headless: true });
    if (expired) await browser.close();
    ensureActive();
    report.browser = await browser.version();
    const context = await browser.newContext();
    context.on('request', (request) => report.requests.push({ phase: report.phase, url: request.url() }));
    const pages = {};
    let allowedWorkerUrl = null;
    const prefix = `/${manifest.modelId}/resolve/${manifest.revision}/`;
    report.phase = 'cold';
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      const record = { phase: report.phase, url: url.href };
      if (report.phase === 'cold') {
        if (url.origin === origin) return route.continue();
        if (url.hostname === 'huggingface.co' && url.pathname.startsWith(prefix)) {
          const name = url.pathname.slice(prefix.length);
          if (files.includes(name)) return route.fulfill({ status: 307,
            headers: { location: `${origin}/model/${name}`, 'access-control-allow-origin': '*' } });
        }
      }
      if (report.phase === 'candidate-bootstrap' && url.href === allowedWorkerUrl) return route.continue();
      report.blockedRequests.push(record);
      return route.abort();
    });
    for (const variant of ['baseline', 'candidate']) {
      const page = await context.newPage();
      pages[variant] = page;
      page.on('pageerror', (error) => report.errors.push({ phase: report.phase, kind: 'pageerror', message: error.message }));
      page.on('crash', () => report.errors.push({ phase: report.phase, kind: 'crash', message: `${variant} crashed` }));
      await page.goto(`${origin}/${variant}/sentence-stopping.html`, { timeout: 20_000 });
      await page.waitForFunction(() => !!globalThis.sentenceStoppingProbe, undefined, { timeout: 10_000 });
      const identity = await page.evaluate(() => globalThis.sentenceStoppingProbe.identity);
      if (identity.modelId !== manifest.modelId || identity.revision !== manifest.revision
        || identity.inferenceTimeoutMs !== stoppingBudgets.write) throw new Error('Built production identity/deadline mismatch');
      if (await page.evaluate(() => crossOriginIsolated)) throw new Error('Expected nonisolated single-thread browser');
    }
    report.initiallyCached = await pages.baseline.evaluate(() => globalThis.sentenceStoppingProbe.cached());
    if (report.initiallyCached) throw new Error('Expected a fresh browser profile');
    await pages.baseline.evaluate(() => globalThis.sentenceStoppingProbe.boot());
    report.cold = await pages.baseline.evaluate(() => globalThis.sentenceStoppingProbe.load(false));
    if (!report.cold.cached) throw new Error('Cold load did not leave complete model/runtime cache');
    ensureActive();
    await context.setOffline(true);
    report.phase = 'baseline-generation';
    await checkpoint();
    console.log(JSON.stringify({ phase: report.phase, cold: report.cold.loadMs }));
    report.baseline = await pages.baseline.evaluate((messages) => globalThis.sentenceStoppingProbe.write(messages), report.fixture.messages);
    report.baselineDisposed = await pages.baseline.evaluate(() => globalThis.sentenceStoppingProbe.dispose());
    await checkpoint();
    ensureActive();
    if (report.baseline.status !== 'completed') throw new Error('Baseline failed; no retry or candidate write');
    // Only local worker JavaScript bootstrap is permitted between offline phases.
    report.phase = 'candidate-bootstrap';
    allowedWorkerUrl = await pages.candidate.evaluate(() => globalThis.sentenceStoppingProbe.workerUrl);
    await context.setOffline(false);
    await pages.candidate.evaluate(() => globalThis.sentenceStoppingProbe.boot());
    await context.setOffline(true);
    report.phase = 'candidate-cache-restore';
    report.restored = await pages.candidate.evaluate(() => globalThis.sentenceStoppingProbe.load(true));
    ensureActive();
    report.phase = 'candidate-generation';
    await checkpoint();
    console.log(JSON.stringify({ phase: report.phase, restored: report.restored.loadMs }));
    report.candidate = await pages.candidate.evaluate((messages) => globalThis.sentenceStoppingProbe.write(messages), report.fixture.messages);
    report.candidateDisposed = await pages.candidate.evaluate(() => globalThis.sentenceStoppingProbe.dispose());
    report.comparison = compareStoppingOutputs(report.baseline, report.candidate);
    if (!report.comparison.bothCompleted) throw new Error('Candidate failed; no retry');
    for (const output of [report.baseline, report.candidate]) {
      if (!Number.isSafeInteger(output.outputTokens) || output.outputTokens < 1 || output.outputTokens > 64
        || !Number.isSafeInteger(output.inputTokens) || output.inputTokens < 1) throw new Error('Missing actual token instrumentation');
    }
    if (report.baseline.inputTokens !== report.candidate.inputTokens) throw new Error('Matched prompt token counts differ');
    report.offlineRequests = report.requests.filter(({ phase }) => phase.endsWith('-generation') || phase === 'candidate-cache-restore');
    if (report.offlineRequests.length || report.blockedRequests.length || report.errors.length) throw new Error('Unexpected network/browser error');
    report.complete = true;
    report.phase = 'complete';
  };
  try {
    await Promise.race([execute(), new Promise((_, decline) => {
      watchdog = setTimeout(() => { expired = true; decline(new Error('290second work watchdog expired')); }, stoppingBudgets.work);
    })]);
  } catch (error) {
    report.errors.push({ phase: report.phase, message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  } finally {
    clearTimeout(watchdog);
    const cleanupWatchdog = setTimeout(() => process.exit(1), stoppingBudgets.cleanup);
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
      report.errors.push({ phase: 'cleanup', message: 'Protected source changed during the comparison' });
      process.exitCode = 1;
    }
    report.offlineRequests = report.requests.filter(({ phase }) => phase.endsWith('-generation') || phase === 'candidate-cache-restore');
    report.comparison ??= compareStoppingOutputs(report.baseline, report.candidate);
    report.finishedAt = new Date().toISOString();
    report.elapsedMs = Date.now() - started;
    await checkpoint();
    clearTimeout(cleanupWatchdog);
    console.log(`Sentence stopping report: ${reportPath}`);
  }
  return { reportPath, report };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runSentenceStopping();
