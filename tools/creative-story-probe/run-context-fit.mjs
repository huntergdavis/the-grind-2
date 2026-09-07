import { build } from 'vite';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, dirname, extname, relative } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createContextFitCases } from './context-fit-cases.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '../..');
const staged = resolve(repo, '.narrator-t5-rebuild/creative-probe/model');
const totalDeadlineMs = 300_000;
const artifactNames = ['config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const mime = (file) => ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.json': 'application/json' })[extname(file)] || 'application/octet-stream';

export function contextFitReportName(now = new Date(), uuid = randomUUID()) {
  return `context-fit-report-${now.toISOString().replace(/[:.]/g, '-')}-${uuid}.json`;
}

export function exemplarReportName(now = new Date(), uuid = randomUUID()) {
  return `exemplar-report-${now.toISOString().replace(/[:.]/g, '-')}-${uuid}.json`;
}

export function comparePriorContextFitCases(cases, prior) {
  if (!prior.complete || prior.outputs?.length !== cases.length) throw new Error('Expected a completed prior context-fit experiment');
  const fields = ['id', 'mode', 'focus', 'facts', 'viewpoint', 'identity', 'attempt', 'seed'];
  return cases.map((fixture, index) => {
    const previous = prior.outputs[index];
    for (const field of fields) {
      if (!isDeepStrictEqual(fixture[field], previous[field])) throw new Error(`Prior comparison changed ${field}: ${fixture.id}`);
    }
    return {
      id: fixture.id, sameFactsViewpointFocusIdentityAndSeed: true,
      priorPromptSha256: digest(JSON.stringify(previous.messages)),
      currentPromptSha256: digest(JSON.stringify(fixture.messages)),
      promptChanged: !isDeepStrictEqual(previous.messages, fixture.messages),
    };
  });
}

export async function verifyStagedArtifacts(directory, artifacts) {
  if (artifacts?.length !== artifactNames.length
    || new Set(artifacts.map((artifact) => artifact.name)).size !== artifactNames.length) {
    throw new Error('Expected exactly five distinct pinned artifact records');
  }
  const verified = [];
  for (const artifact of artifacts) {
    if (!artifactNames.includes(artifact.name) || !Number.isSafeInteger(artifact.bytes) || artifact.bytes <= 0
      || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error('Invalid staged artifact metadata');
    const file = resolve(directory, artifact.name);
    if ((await stat(file)).size !== artifact.bytes) throw new Error(`Staged byte mismatch: ${artifact.name}; no downloads allowed`);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    if (hash.digest('hex') !== artifact.sha256) throw new Error(`Staged SHA-256 mismatch: ${artifact.name}; no downloads allowed`);
    verified.push({ ...artifact, reused: true, verification: 'Local byte length and streamed SHA-256 match the pinned historical manifest' });
  }
  return verified;
}

export async function runContextFit(arguments_ = process.argv.slice(2)) {
  const exemplars = arguments_.length === 2 && arguments_[1] === '--exemplars';
  if (arguments_[0] !== '--run' || !(arguments_.length === 1
    || exemplars
    || (arguments_.length === 3 && arguments_[1] === '--prior-report' && arguments_[2]))) {
    throw new Error('Explicit execution required: node tools/creative-story-probe/run-context-fit.mjs --run [--prior-report FILE | --exemplars]');
  }
  const reportPath = resolve(root, exemplars ? exemplarReportName() : contextFitReportName());
  const report = {
    capturedAt: new Date().toISOString(), complete: false, phase: 'preflight',
    productionWorker: true, productionIdentityUnchanged: true, syntheticPublicFixtures: true,
    comparison: 'Historical samples used explicit probe seed choices and a probe-specific identity; this run uses current context selection and the production controller identity. This is not a controlled paired A/B or a general quality evaluation.',
    baselineReport: 'tools/creative-story-probe/viewpoint-report.json',
    totalDeadlineMs, noArtifactDownloads: true,
    execution: { device: 'wasm', dtype: 'q8', wasmThreads: 1, maxNewTokens: 64, doSample: false, repetitionPenalty: 1.08, inferenceTimeoutMs: 90_000 },
    attemptedRequests: [], blockedRequests: [], outputs: [], errors: [],
    ...(exemplars ? {
      experiment: 'two-short-authored-demonstrations-in-system-only',
      productionPromptBuilderUnchanged: true, productionUserMessagesUnchanged: true,
      comparison: 'Historical screening comparison, NOT a fresh paired A/B. The three exact context-fit scenes and selected seeds are reused. Only this probe appends two authored examples to the current production system message; user messages remain byte-identical. Production client/worker cache-only branches changed since the historical report, but generation settings did not. Three examples cannot establish general prose quality.',
    } : {}),
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  let writes = Promise.resolve();
  const checkpoint = () => {
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    writes = writes.then(() => writeFile(reportPath, serialized));
    return writes;
  };
  let browser;
  let server;
  let watchdog;
  let expired = false;
  let prior;
  let historicalExemplarBaseline;
  const protectedInputs = new Map();
  const ensureActive = () => { if (expired) throw new Error('Context-fit probe deadline expired'); };
  const execute = async () => {
    const manifestBytes = await readFile(resolve(root, 'report.json'));
    const baselineBytes = await readFile(resolve(root, 'viewpoint-report.json'));
    const manifest = JSON.parse(manifestBytes);
    const baseline = JSON.parse(baselineBytes);
    createContextFitCases(baseline);
    if (manifest.modelId !== 'onnx-community/SmolLM2-135M-Instruct-ONNX-MHA'
      || manifest.revision !== '5b6682c7c9df18f004bfb7e635cba3f3d98537d8') throw new Error('Unexpected baseline model identity');
    report.modelId = manifest.modelId;
    report.revision = manifest.revision;
    report.baselineSha256 = digest(baselineBytes);
    report.artifactManifestSha256 = digest(manifestBytes);
    for (const relative of [
      'src/narrator/creative-writer-client.ts', 'src/narrator/creative-writer.worker.ts',
      'src/narrator/creative-story.ts', 'src/narrator/story-seeds.json',
      'tools/creative-story-probe/report.json', 'tools/creative-story-probe/viewpoint-report.json',
    ]) protectedInputs.set(relative, await readFile(resolve(repo, relative)));
    const worker = protectedInputs.get('src/narrator/creative-writer.worker.ts').toString('utf8');
    for (const contract of [/wasm\.numThreads = 1;/, /device: "wasm", dtype: "q8"/, /max_new_tokens: 64, do_sample: false, repetition_penalty: 1\.08/]) {
      if (!contract.test(worker)) throw new Error('Production generation settings changed; review this probe');
    }
    report.inputSha256 = Object.fromEntries([...protectedInputs].map(([name, bytes]) => [name, digest(bytes)]));
    if (exemplars) {
      const name = 'tools/creative-story-probe/context-fit-report-2026-09-07T00-37-03-923Z-d0521c53-3063-4750-b32c-e523137be3cf.json';
      const bytes = await readFile(resolve(repo, name));
      historicalExemplarBaseline = JSON.parse(bytes);
      if (historicalExemplarBaseline.modelId !== manifest.modelId || historicalExemplarBaseline.revision !== manifest.revision
        || !isDeepStrictEqual(historicalExemplarBaseline.execution, report.execution)) {
        throw new Error('Historical exemplar baseline model or generation settings differ');
      }
      protectedInputs.set(name, bytes);
      for (const name of ['tools/creative-story-probe/exemplar-messages.mjs', 'tools/creative-story-probe/context-fit-probe.js', 'tools/creative-story-probe/context-fit-cases.mjs']) {
        const bytes = await readFile(resolve(repo, name));
        protectedInputs.set(name, bytes);
        report.inputSha256[name] = digest(bytes);
      }
      report.historicalExperiment = {
        report: name, sha256: digest(bytes), capturedAt: historicalExemplarBaseline.capturedAt,
        comparisonKind: 'historical-not-fresh-paired', sameModelAndGenerationSettings: true,
        sourceDifferences: Object.keys(historicalExemplarBaseline.inputSha256).filter((name) =>
          report.inputSha256[name] !== historicalExemplarBaseline.inputSha256[name]),
        outputs: historicalExemplarBaseline.outputs.map(({ id, seedId, messages, raw, cleaned, generationMs }) =>
          ({ id, seedId, messages, raw, cleaned, generationMs })),
      };
    }
    if (arguments_[2]) {
      const path = resolve(arguments_[2]);
      if (dirname(path) !== root || !/^context-fit-report-.*\.json$/.test(path.slice(root.length + 1))) {
        throw new Error('Prior report must be an existing context-fit report in this tool directory');
      }
      const bytes = await readFile(path);
      prior = JSON.parse(bytes);
      if (prior.modelId !== manifest.modelId || prior.revision !== manifest.revision
        || !isDeepStrictEqual(prior.execution, report.execution)) throw new Error('Prior model/runtime settings differ');
      for (const name of ['src/narrator/creative-writer-client.ts', 'src/narrator/creative-writer.worker.ts', 'src/narrator/story-seeds.json']) {
        if (prior.inputSha256?.[name] !== report.inputSha256[name]) throw new Error(`Prior comparison changed protected source: ${name}`);
      }
      protectedInputs.set(relative(repo, path), bytes);
      report.priorExperiment = {
        report: relative(repo, path), sha256: digest(bytes), capturedAt: prior.capturedAt,
        inputSha256: prior.inputSha256, sameModelRuntimeAndSeedLibrary: true,
        outputs: prior.outputs.map(({ id, seedId, messages, raw, cleaned, generationMs }) => ({ id, seedId, messages, raw, cleaned, generationMs })),
      };
      report.comparison = 'Follow-up to the referenced context-fit experiment with identical synthetic facts, viewpoints, foci, controller identities, selected seeds, model, and runtime. Prompt order/final instruction and observed-output text hygiene changed; compare raw and cleaned results separately. Three examples do not establish general quality.';
    }
    report.artifacts = await verifyStagedArtifacts(staged, manifest.artifacts);
    report.artifactBytes = report.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0);
    if (report.artifactBytes !== 139_538_098) throw new Error('Unexpected staged model footprint');
    ensureActive();
    report.phase = 'build';
    await checkpoint();
    const dist = await mkdtemp(resolve(repo, '.narrator-t5-rebuild/creative-probe/context-fit-dist-'));
    report.dist = dist;
    await build({ configFile: false, root, publicDir: false, logLevel: 'warn', worker: { format: 'es' },
      build: { outDir: dist, emptyOutDir: false, target: 'es2022', rollupOptions: { input: resolve(root, 'context-fit.html') } },
    });
    ensureActive();
    server = createServer((request, response) => {
      const path = new URL(request.url, 'http://localhost').pathname;
      const isModel = path.startsWith('/model/');
      const name = path.slice('/model/'.length);
      if (isModel && !artifactNames.includes(name)) { response.writeHead(403).end(); return; }
      const file = isModel ? resolve(staged, name) : resolve(dist, path === '/' ? 'context-fit.html' : path.slice(1));
      if (![dist, staged].some((base) => file.startsWith(`${base}/`))) { response.writeHead(403).end(); return; }
      response.setHeader('Content-Type', mime(file));
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Cache-Control', 'public, max-age=3600');
      const stream = createReadStream(file);
      stream.on('error', () => { if (!response.headersSent) response.writeHead(404); response.end(); });
      stream.pipe(response);
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    if (expired) await browser.close();
    ensureActive();
    report.browser = await browser.version();
    const context = await browser.newContext();
    const page = await context.newPage();
    report.phase = 'cold';
    const prefix = `/${manifest.modelId}/resolve/${manifest.revision}/`;
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      report.attemptedRequests.push({ phase: report.phase, url: url.href });
      if (report.phase === 'cold') {
        if (url.origin === origin) return route.continue();
        if (url.hostname === 'huggingface.co' && url.pathname.startsWith(prefix)) {
          const name = url.pathname.slice(prefix.length);
          if (artifactNames.includes(name)) return route.fulfill({ status: 307, headers: {
            location: `${origin}/model/${name}`, 'access-control-allow-origin': '*',
          } });
        }
      }
      report.blockedRequests.push({ phase: report.phase, url: url.href });
      return route.abort();
    });
    page.on('pageerror', (error) => report.errors.push({ phase: report.phase, kind: 'pageerror', message: error.message }));
    page.on('crash', () => report.errors.push({ phase: report.phase, kind: 'crash', message: 'Context-fit page crashed' }));
    await page.goto(exemplars ? `${origin}/?exemplars=1` : origin, { timeout: 30_000 });
    await page.waitForFunction(() => !!globalThis.creativeContextFitProbe, undefined, { timeout: 30_000 });
    report.builtIdentity = await page.evaluate(() => globalThis.creativeContextFitProbe.identity);
    if (report.builtIdentity.modelId !== manifest.modelId || report.builtIdentity.revision !== manifest.revision
      || report.builtIdentity.inferenceTimeoutMs !== 90_000) throw new Error('Built production identity/deadline mismatch');
    report.crossOriginIsolated = await page.evaluate(() => crossOriginIsolated);
    if (report.crossOriginIsolated) throw new Error('Expected the production-like non-isolated single-thread browser');
    report.cases = await page.evaluate(() => globalThis.creativeContextFitProbe.cases);
    if (prior) report.priorCaseComparison = comparePriorContextFitCases(report.cases, prior);
    if (historicalExemplarBaseline) {
      report.historicalCaseComparison = comparePriorContextFitCases(report.cases, historicalExemplarBaseline);
      for (const fixture of report.cases) {
        if (!fixture.systemOnlyDemonstrations || !isDeepStrictEqual(fixture.messages[1], fixture.productionMessages[1])
          || fixture.messages[0].content === fixture.productionMessages[0].content) throw new Error('Exemplar prompt isolation failed');
      }
      report.productionUserMessagesUnchanged = true;
    }
    report.initiallyCached = await page.evaluate(() => globalThis.creativeContextFitProbe.cached());
    await checkpoint();
    console.log(JSON.stringify({ phase: 'cold', modelId: manifest.modelId, artifactBytes: report.artifactBytes }));
    report.cold = await page.evaluate(() => globalThis.creativeContextFitProbe.load());
    ensureActive();
    console.log(JSON.stringify({ phase: 'cold', ...report.cold }));
    await context.setOffline(true);
    report.phase = 'generation';
    report.offlineDuringGeneration = true;
    for (let index = 0; index < report.cases.length; index++) {
      report.pendingCase = report.cases[index];
      await checkpoint();
      console.log(JSON.stringify({ phase: 'generation', id: report.pendingCase.id, seedId: report.pendingCase.seedId, relationshipFit: report.pendingCase.relationshipFit }));
      const row = await page.evaluate((index) => globalThis.creativeContextFitProbe.write(index), index);
      ensureActive();
      report.outputs.push(row);
      delete report.pendingCase;
      report.generationRequests = report.attemptedRequests.filter((request) => request.phase === 'generation');
      await checkpoint();
      console.log(JSON.stringify({ id: row.id, seedId: row.seedId, relationshipFit: row.relationshipFit, raw: row.raw, cleaned: row.cleaned, generationMs: row.generationMs }));
      if (report.generationRequests.length > 0) throw new Error('Generation attempted a network request');
    }
    await page.evaluate(() => globalThis.creativeContextFitProbe.dispose());
    report.phase = 'complete';
    report.complete = true;
  };
  try {
    await Promise.race([execute(), new Promise((_, decline) => {
      watchdog = setTimeout(() => { expired = true; decline(new Error('Context-fit five-minute watchdog expired')); }, totalDeadlineMs);
    })]);
  } catch (error) {
    report.errors.push({ phase: report.phase, message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  } finally {
    const cleanupWatchdog = setTimeout(() => process.exit(1), 15_000);
    cleanupWatchdog.unref();
    clearTimeout(watchdog);
    await browser?.close();
    report.browserClosed = browser !== undefined;
    server?.closeAllConnections();
    if (server) await new Promise((done) => server.close(done));
    report.protectedInputsUnchanged = (await Promise.all([...protectedInputs].map(async ([relative, bytes]) =>
      (await readFile(resolve(repo, relative))).equals(bytes)))).every(Boolean);
    report.generationRequests = report.attemptedRequests.filter((request) => request.phase === 'generation');
    report.finishedAt = new Date().toISOString();
    await checkpoint();
    clearTimeout(cleanupWatchdog);
    console.log(`Context-fit report: ${reportPath}`);
  }
  return { reportPath, report };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runContextFit();
