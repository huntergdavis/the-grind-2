import { build } from 'vite';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '../..');
const artifactNames = ['config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'];
const totalDeadlineMs = 900_000;
const phaseDeadlines = { staging: 180_000, build: 60_000, coldLoad: 190_000, generation: 100_000, restore: 190_000 };
const mime = (file) => ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.json': 'application/json' })[extname(file)] || 'application/octet-stream';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function validateCandidate(value) {
  if (!value || value.schemaVersion !== 1 || !/^[\w.-]+\/[\w.-]+$/.test(value.modelId)
    || !/^[a-f0-9]{40}$/.test(value.revision) || !Array.isArray(value.artifacts)
    || value.artifacts.length !== artifactNames.length) throw new Error('Invalid pinned candidate manifest');
  const prefix = `https://huggingface.co/${value.modelId}/resolve/${value.revision}/`;
  const names = new Set();
  for (const artifact of value.artifacts) {
    if (!artifact || !artifactNames.includes(artifact.name) || names.has(artifact.name)
      || !Number.isSafeInteger(artifact.bytes) || artifact.bytes <= 0
      || !/^[a-f0-9]{64}$/.test(artifact.sha256)
      || artifact.sourceUrl !== prefix + artifact.name) throw new Error('Invalid artifact identity, size, digest, or pinned source');
    names.add(artifact.name);
  }
  return value;
}

export function substituteIdentity(code, previous, candidate) {
  for (const value of [previous.modelId, previous.revision]) {
    if (code.split(value).length !== 2) throw new Error('Expected exactly one production identity literal per module');
  }
  return code.replace(previous.modelId, candidate.modelId).replace(previous.revision, candidate.revision);
}

async function fileIdentity(file) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(file)) { bytes += chunk.length; hash.update(chunk); }
  return { bytes, sha256: hash.digest('hex') };
}

async function verifyArtifact(file, artifact) {
  try {
    if ((await stat(file)).size !== artifact.bytes) return false;
    return (await fileIdentity(file)).sha256 === artifact.sha256;
  } catch { return false; }
}

async function stageArtifact(directory, artifact, signal) {
  const file = resolve(directory, artifact.name);
  if (await verifyArtifact(file, artifact)) return { ...artifact, reused: true };
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.partial-${randomUUID()}`;
  try {
    const response = await fetch(artifact.sourceUrl, { signal });
    if (!response.ok || !response.body) throw new Error(`Artifact ${artifact.name}: HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: 'wx' }), { signal });
    if (!(await verifyArtifact(temporary, artifact))) throw new Error(`Artifact ${artifact.name}: size or SHA-256 mismatch`);
    await rename(temporary, file);
    return { ...artifact, reused: false };
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export async function runCandidate(arguments_ = process.argv.slice(2)) {
  const argument = (flag) => {
    const index = arguments_.indexOf(flag);
    return index < 0 ? undefined : arguments_[index + 1];
  };
  const manifestPath = argument('--candidate');
  const prepareOnly = arguments_.includes('--prepare');
  if (!manifestPath || prepareOnly === arguments_.includes('--run')) {
    throw new Error('Usage: node tools/creative-story-probe/run-candidate.mjs --candidate FILE (--prepare | --run) [--skip-restore]');
  }
  const reportPath = resolve(root, `candidate-${prepareOnly ? 'preparation' : 'report'}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.json`);
  const startedAtMs = Date.now();
  const report = {
    capturedAt: new Date().toISOString(), complete: false, prepareOnly, phase: 'manifest',
    productionWorkerWithBuildTimeIdentitySubstitution: true,
    productionSourceUnmodified: null, syntheticPublicFixtures: true,
    baselineReport: 'tools/creative-story-probe/viewpoint-report.json',
    totalDeadlineMs, phaseDeadlines,
    execution: { device: 'wasm', dtype: 'q8', wasmThreads: 1, maxNewTokens: 64, doSample: false, repetitionPenalty: 1.08, loadTimeoutMs: 180_000, inferenceTimeoutMs: 90_000 },
    transforms: [], artifacts: [], attemptedRequests: [], blockedRequests: [], outputs: [], errors: [],
    restore: { status: 'not-run' },
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
  const cancellation = new AbortController();
  const sources = new Map();
  const timed = (promise, milliseconds, label) => new Promise((accept, decline) => {
    const timer = setTimeout(() => decline(new Error(`${label} exceeded ${milliseconds / 1000}s`)), milliseconds);
    Promise.resolve(promise).then(accept, decline).finally(() => clearTimeout(timer));
  });
  const execute = async () => {
    const candidate = validateCandidate(JSON.parse(await readFile(resolve(manifestPath), 'utf8')));
    report.candidate = candidate;
    const baselineBytes = await readFile(resolve(root, 'viewpoint-report.json'));
    const baseline = JSON.parse(baselineBytes.toString('utf8'));
    if (baseline.outputs?.length !== 3 || baseline.outputs.some((row) => !Array.isArray(row.messages) || !row.facts)) {
      throw new Error('Expected the exact three historical viewpoint inputs');
    }
    report.baselineSha256 = digest(baselineBytes);
    const clientPath = resolve(repo, 'src/narrator/creative-writer-client.ts');
    const workerPath = resolve(repo, 'src/narrator/creative-writer.worker.ts');
    for (const file of [clientPath, workerPath]) sources.set(file, await readFile(file, 'utf8'));
    const previous = {
      modelId: sources.get(clientPath).match(/export const creativeWriterModelId = "([^"]+)";/)?.[1],
      revision: sources.get(clientPath).match(/export const creativeWriterModelRevision = "([^"]+)";/)?.[1],
    };
    if (!previous.modelId || !previous.revision) throw new Error('Production identity not found');
    for (const contract of [/wasm\.numThreads = 1;/, /device: "wasm", dtype: "q8"/, /max_new_tokens: 64, do_sample: false, repetition_penalty: 1\.08/]) {
      if (!contract.test(sources.get(workerPath))) throw new Error('Production generation contract changed; review the probe before comparison');
    }
    report.previousProductionIdentity = previous;
    const directory = resolve(repo, '.narrator-t5-rebuild/creative-probe', `candidate-${candidate.revision}`);
    const staged = resolve(directory, 'model');
    await mkdir(directory, { recursive: true });
    if (!prepareOnly) {
      report.phase = 'staging';
      await checkpoint();
      const signal = AbortSignal.any([cancellation.signal, AbortSignal.timeout(phaseDeadlines.staging)]);
      await timed(Promise.all(candidate.artifacts.map(async (artifact) => {
        const verified = await stageArtifact(staged, artifact, signal);
        report.artifacts.push({ ...verified, verification: 'local byte length and streamed SHA-256 match pinned manifest' });
        console.log(JSON.stringify({ phase: 'staging', artifact: artifact.name, bytes: artifact.bytes, reused: verified.reused }));
        await checkpoint();
      })), phaseDeadlines.staging + 1_000, 'Artifact staging');
      report.artifactBytes = report.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0);
    }
    report.phase = 'build';
    await checkpoint();
    const dist = await mkdtemp(resolve(directory, 'dist-'));
    const identityPlugin = () => ({
      name: 'candidate-identity-only', enforce: 'pre',
      transform(code, id) {
        const file = id.split('?')[0];
        if (!sources.has(file)) return null;
        const transformed = substituteIdentity(code, previous, candidate);
        if (!report.transforms.some((row) => row.file === file)) report.transforms.push({
          file, sourceSha256: digest(sources.get(file)), transformedSha256: digest(transformed),
          substitutions: [{ from: previous.modelId, to: candidate.modelId }, { from: previous.revision, to: candidate.revision }],
        });
        return { code: transformed, map: null };
      },
    });
    await timed(build({ configFile: false, root, publicDir: false, logLevel: 'warn', plugins: [identityPlugin()],
      worker: { format: 'es', plugins: () => [identityPlugin()] },
      build: { outDir: dist, emptyOutDir: false, target: 'es2022', rollupOptions: { input: resolve(root, 'candidate.html') } },
    }), phaseDeadlines.build, 'Candidate build');
    if (report.transforms.length !== 2) throw new Error('Both production client and worker must receive identity-only substitution');
    report.dist = dist;
    await checkpoint();
    if (prepareOnly) { report.complete = true; report.phase = 'prepared'; return; }
    server = createServer((request, response) => {
      const path = new URL(request.url, 'http://localhost').pathname;
      const file = path.startsWith('/model/') ? resolve(staged, path.slice(7)) : resolve(dist, path === '/' ? 'candidate.html' : path.slice(1));
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
    report.phase = 'cold';
    browser = await chromium.launch({ headless: true });
    report.browser = await browser.version();
    const context = await browser.newContext();
    const page = await context.newPage();
    const prefix = `/${candidate.modelId}/resolve/${candidate.revision}/`;
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      report.attemptedRequests.push({ phase: report.phase, url: url.href });
      if (url.origin === origin) {
        if (report.phase === 'cold') return route.continue();
        if (report.phase === 'restore' && /^\/assets\/creative-writer\.worker-[\w-]+\.js$/.test(url.pathname)) {
          return route.fulfill({ path: resolve(dist, url.pathname.slice(1)), contentType: 'text/javascript' });
        }
      } else if (report.phase === 'cold' && url.hostname === 'huggingface.co' && url.pathname.startsWith(prefix)) {
        const name = url.pathname.slice(prefix.length);
        if (artifactNames.includes(name)) return route.fulfill({ status: 307, headers: {
          location: `${origin}/model/${name}`, 'access-control-allow-origin': '*',
        } });
      }
      report.blockedRequests.push({ phase: report.phase, url: url.href });
      return route.abort();
    });
    page.on('pageerror', (error) => report.errors.push({ phase: report.phase, kind: 'pageerror', message: error.message }));
    page.on('crash', () => report.errors.push({ phase: report.phase, kind: 'crash', message: 'Candidate page crashed' }));
    page.on('console', (message) => {
      if (message.type() === 'error') report.errors.push({ phase: report.phase, kind: 'console', message: message.text().slice(0, 2_000) });
    });
    await page.goto(origin, { timeout: 30_000 });
    await page.waitForFunction(() => !!globalThis.creativeCandidateProbe, undefined, { timeout: 30_000 });
    const identity = await page.evaluate(() => globalThis.creativeCandidateProbe.identity);
    if (identity.modelId !== candidate.modelId || identity.revision !== candidate.revision
      || identity.loadTimeoutMs !== 180_000 || identity.inferenceTimeoutMs !== 90_000) throw new Error('Built client identity or deadline mismatch');
    report.builtIdentity = identity;
    report.crossOriginIsolated = await page.evaluate(() => crossOriginIsolated);
    if (report.crossOriginIsolated) throw new Error('Expected production-like non-isolated one-thread browser');
    report.initiallyCached = await page.evaluate(() => globalThis.creativeCandidateProbe.cached());
    await checkpoint();
    console.log(JSON.stringify({ phase: 'cold', modelId: candidate.modelId, revision: candidate.revision }));
    report.cold = await timed(page.evaluate(() => globalThis.creativeCandidateProbe.load()), phaseDeadlines.coldLoad, 'Candidate load');
    console.log(JSON.stringify({ phase: 'cold', ...report.cold }));
    await checkpoint();
    await context.setOffline(true);
    report.phase = 'generation';
    report.offlineDuringGeneration = true;
    for (let index = 0; index < baseline.outputs.length; index++) {
      const fixture = baseline.outputs[index];
      report.pendingCase = { index, id: fixture.id, facts: fixture.facts, messages: fixture.messages };
      await checkpoint();
      console.log(JSON.stringify({ phase: 'generation', index, id: fixture.id }));
      const row = await timed(page.evaluate((index) => globalThis.creativeCandidateProbe.write(index), index), phaseDeadlines.generation, `Candidate write ${fixture.id}`);
      if (JSON.stringify(row.messages) !== JSON.stringify(fixture.messages)
        || JSON.stringify(row.facts) !== JSON.stringify(fixture.facts)) throw new Error('Historical comparison input changed');
      report.outputs.push(row);
      delete report.pendingCase;
      console.log(JSON.stringify({ phase: 'generation', id: row.id, generationMs: row.generationMs, raw: row.raw, cleaned: row.cleaned }));
      report.generationRequests = report.attemptedRequests.filter((request) => request.phase === 'generation');
      await checkpoint();
      if (report.generationRequests.length > 0) throw new Error('Generation attempted a network request');
    }
    await page.evaluate(() => globalThis.creativeCandidateProbe.dispose());
    const remainingMs = totalDeadlineMs - (Date.now() - startedAtMs);
    if (!arguments_.includes('--skip-restore') && remainingMs > phaseDeadlines.restore + 10_000) {
      report.phase = 'restore';
      report.restore = { status: 'running' };
      report.restoreBootstrapException = 'Only the already-built same-origin worker JavaScript module is fulfilled from disk; no model/runtime requests are allowed.';
      await checkpoint();
      const restored = await timed(page.evaluate(() => globalThis.creativeCandidateProbe.load()), phaseDeadlines.restore, 'Offline candidate cache restore');
      report.restore = { status: 'complete', offline: true, ...restored };
      const requests = report.attemptedRequests.filter((request) => request.phase === 'restore');
      if (requests.some((request) => !/^\/assets\/creative-writer\.worker-[\w-]+\.js$/.test(new URL(request.url).pathname))) {
        throw new Error('Offline restoration attempted a model or runtime request');
      }
      console.log(JSON.stringify({ phase: 'restore', ...report.restore }));
      await page.evaluate(() => globalThis.creativeCandidateProbe.dispose());
    } else report.restore = { status: 'skipped', reason: arguments_.includes('--skip-restore') ? 'explicit skip' : 'remaining bounded time is insufficient' };
    report.phase = 'complete';
    report.complete = true;
  };
  try {
    await Promise.race([execute(), new Promise((_, decline) => {
      watchdog = setTimeout(() => { cancellation.abort(); decline(new Error('Total candidate watchdog expired')); }, totalDeadlineMs);
    })]);
  } catch (error) {
    report.errors.push({ phase: report.phase, message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  } finally {
    // A timed-out browser/build must not turn a bounded probe into an orphaned process.
    const cleanupWatchdog = setTimeout(() => process.exit(1), 15_000);
    cleanupWatchdog.unref();
    clearTimeout(watchdog);
    cancellation.abort();
    await timed(browser?.close(), 10_000, 'Browser cleanup').catch((error) => report.errors.push({ phase: 'cleanup', message: error.message }));
    server?.closeAllConnections();
    if (server) await new Promise((done) => server.close(done));
    report.productionSourceUnmodified = (await Promise.all([...sources].map(async ([file, code]) => (await readFile(file, 'utf8')) === code))).every(Boolean);
    report.finishedAt = new Date().toISOString();
    report.generationRequests = report.attemptedRequests.filter((request) => request.phase === 'generation');
    await checkpoint();
    console.log(`Candidate report: ${reportPath}`);
  }
  return { reportPath, report };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCandidate();
}
