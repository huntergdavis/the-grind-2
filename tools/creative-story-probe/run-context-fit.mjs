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
import { createCounterbalancedChoiceCases, counterbalanceMomentMessages } from './counterbalanced-choice-cases.mjs';
import { withValueVoiceHint } from './value-voice-cases.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '../..');
const staged = resolve(repo, '.narrator-t5-rebuild/creative-probe/model');
const defaultTotalDeadlineMs = 300_000;
const artifactNames = ['config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const mime = (file) => ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.json': 'application/json' })[extname(file)] || 'application/octet-stream';

export function contextFitReportName(now = new Date(), uuid = randomUUID()) {
  return `context-fit-report-${now.toISOString().replace(/[:.]/g, '-')}-${uuid}.json`;
}

export function exemplarReportName(now = new Date(), uuid = randomUUID()) {
  return `exemplar-report-${now.toISOString().replace(/[:.]/g, '-')}-${uuid}.json`;
}

export function directionReportName(now = new Date(), uuid = randomUUID()) {
  return `direction-report-${now.toISOString().replace(/[:.]/g, '-')}-${uuid}.json`;
}

export function directionCooldownReportName(now = new Date(), uuid = randomUUID()) {
  return `direction-cooldown-report-${now.toISOString().replace(/[:.]/g, '-')}-${uuid}.json`;
}

export function momentChoiceReportName(now = new Date(), uuid = randomUUID()) {
  return `moment-choice-report-${now.toISOString().replace(/[:.]/g, '-')}-${uuid}.json`;
}

export function firstVictoryChoiceReportName(now = new Date(), uuid = randomUUID()) {
  return `first-victory-choice-report-${now.toISOString().replace(/[:.]/g, '-')}-${uuid}.json`;
}

export function storyDuetReportName(now = new Date(), uuid = randomUUID()) {
  return `story-duet-report-${now.toISOString().replace(/[:.]/g, '-')}-${uuid}.json`;
}

export function counterbalancedChoiceReportName(now = new Date(), uuid = randomUUID()) {
  return `counterbalanced-choice-report-${now.toISOString().replace(/[:.]/g, '-')}-${uuid}.json`;
}

export function valueVoiceReportName(now = new Date(), uuid = randomUUID()) {
  return `value-voice-report-${now.toISOString().replace(/[:.]/g, '-')}-${uuid}.json`;
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
  const duetMode = arguments_.length === 2 && arguments_[1] === '--story-duet';
  const valueVoice = arguments_.length === 2 && arguments_[1] === '--value-voice';
  const counterbalancedChoice = arguments_.length === 2 && arguments_[1] === '--counterbalanced-choice';
  const directionCooldown = arguments_.length === 2 && arguments_[1] === '--direction-cooldown';
  const firstVictoryChoice = arguments_.length === 2 && arguments_[1] === '--first-victory-choice';
  const momentChoice = counterbalancedChoice || firstVictoryChoice || (arguments_.length === 2 && arguments_[1] === '--moment-choice');
  const direction = directionCooldown || (arguments_.length === 2 && arguments_[1] === '--direction');
  if (arguments_[0] !== '--run' || !(arguments_.length === 1
    || exemplars || direction || momentChoice || duetMode || valueVoice
    || (arguments_.length === 3 && arguments_[1] === '--prior-report' && arguments_[2]))) {
    throw new Error('Explicit execution required: node tools/creative-story-probe/run-context-fit.mjs --run [--prior-report FILE | --exemplars | --direction | --direction-cooldown | --moment-choice | --first-victory-choice | --story-duet | --counterbalanced-choice | --value-voice]');
  }
  const shortDecisionProbe = directionCooldown || momentChoice;
  const totalDeadlineMs = duetMode || counterbalancedChoice || valueVoice ? 240_000 : shortDecisionProbe ? 180_000 : defaultTotalDeadlineMs;
  const cleanupDeadlineMs = shortDecisionProbe || duetMode || valueVoice ? 5_000 : 15_000;
  const workDeadlineMs = shortDecisionProbe || duetMode || valueVoice ? totalDeadlineMs - cleanupDeadlineMs : totalDeadlineMs;
  const reportPath = resolve(root, valueVoice ? valueVoiceReportName() : counterbalancedChoice ? counterbalancedChoiceReportName() : duetMode ? storyDuetReportName() : firstVictoryChoice ? firstVictoryChoiceReportName() : momentChoice ? momentChoiceReportName() : directionCooldown ? directionCooldownReportName()
    : direction ? directionReportName() : exemplars ? exemplarReportName() : contextFitReportName());
  const report = {
    capturedAt: new Date().toISOString(), complete: false, phase: 'preflight',
    productionWorker: true, productionIdentityUnchanged: true, syntheticPublicFixtures: true,
    comparison: 'Historical samples used explicit probe seed choices and a probe-specific identity; this run uses current context selection and the production controller identity. This is not a controlled paired A/B or a general quality evaluation.',
    baselineReport: 'tools/creative-story-probe/viewpoint-report.json',
    totalDeadlineMs, ...(shortDecisionProbe || duetMode || valueVoice ? { workDeadlineMs, cleanupDeadlineMs } : {}), noArtifactDownloads: true,
    execution: { device: 'wasm', dtype: 'q8', wasmThreads: 1, maxNewTokens: 64, doSample: false, repetitionPenalty: 1.08, inferenceTimeoutMs: 90_000 },
    attemptedRequests: [], blockedRequests: [], outputs: [], errors: [],
    ...(exemplars ? {
      experiment: 'two-short-authored-demonstrations-in-system-only',
      productionPromptBuilderUnchanged: true, productionUserMessagesUnchanged: true,
      comparison: 'Historical screening comparison, NOT a fresh paired A/B. The three exact context-fit scenes and selected seeds are reused. Only this probe appends two authored examples to the current production system message; user messages remain byte-identical. Production client/worker cache-only branches changed since the historical report, but generation settings did not. Three examples cannot establish general prose quality.',
    } : {}),
    ...(direction ? {
      experiment: 'production-one-token-stage-direction-then-ordinary-prose',
      comparison: 'Three fixed synthetic public scenes, with identical production option ordering. Real model logits choose a label among three compatible host-authored visual treatments; this is not unconstrained prose generation or a claim of broad decision quality. No retry for variation. One ordinary prose write follows on the same worker only when at least95seconds remain.',
      directionExecution: { device: 'wasm', dtype: 'q8', wasmThreads: 1, maxNewTokens: 1, maximumInputTokens: 512,
        doSample: false, repetitionPenalty: 1, timeoutMs: 30_000, modelScoredClosedLabels: ['1', '2', '3'],
        eligibleLabelsPerDecision: directionCooldown ? 2 : 3 },
    } : {}),
    ...(directionCooldown ? {
      experiment: 'host-stage-cooldown-with-real-two-eligible-label-model-selection',
      comparison: 'Distinct host eligibility experiment following the preserved all-labels1/1/1 run. The fixed three synthetic scenes explicitly exclude1,2,3 respectively through the production prompt and worker mask. Any variety is caused by host eligibility plus model choice among two preserved scores, NOT a claim of improved model reasoning or spontaneous diversity. No prose run, no retry for variety, no observed gameplay history is implied by these synthetic previous-stage fixtures.',
      eligibilityExclusions: ['1', '2', '3'],
    } : {}),
    ...(momentChoice ? {
      experiment: 'real-two-public-moment-choice-on-existing-worker',
      comparison: 'Two fixed synthetic public pairs. Label1 is the current scene, label2 the same recorded companion farewell; label3 is excluded by the existing worker. This probes actual model choice, not TTL/queue gameplay eligibility or improved prose quality. No second model, new runtime, prose write, or retry for preferred choices.',
      momentExecution: { device: 'wasm', dtype: 'q8', wasmThreads: 1, maxNewTokens: 1, maximumInputTokens: 512,
        doSample: false, repetitionPenalty: 1, timeoutMs: 30_000, eligibleLabels: ['1', '2'], excludedLabel: '3' },
    } : {}),
    ...(firstVictoryChoice ? {
      experiment: 'real-current-versus-first-shared-victory-choice',
      comparison: 'Two fixed synthetic public pairs: current scene versus recorded first shared victory, with one healthy and one injured companion source. Actual model selection on unchanged client/worker settings, not a paired A/B, live eligibility proof, or prose-quality improvement. Earlier farewell results stay immutable. No second model, download, prose, or retry.',
      milestoneKind: 'first-shared-victory',
    } : {}),
    ...(duetMode ? {
      experiment: 'candidate-role-bound-two-voice-first-victory-prose',
      comparison: 'Two fixed healthy/injured public first-victory fixtures through the unchanged production client.write/worker/model/settings. Candidate duet builder and strict parser are exercised directly; the application controller has not enabled model duets. Not a paired A/B or automatic literary-quality approval. No stage/source decision, retry, or artifact download.',
      candidatePromptNotEnabledInApplication: true, literaryQualityNotAutomated: true,
      roleFormat: ['HERO: one complete first-person thought', 'COMPANION: a different complete first-person thought'],
    } : {}),
    ...(counterbalancedChoice ? {
      experiment: 'four-fixed-counterbalanced-public-moment-choices',
      comparison: 'Two existing synthetic public pairs (farewell and healthy first victory), each current-first then exact reversed order and numeric labels. Production builder untouched; tools-only transformation preserves all snippets and fixed instruction bytes. Four observations cannot establish universal positional bias or narrative quality. Independent of the user-selected Shared road priority policy. No prose, retry, or artifact download.',
      productionPromptBuilderUnchanged: true,
      toolsOnlyPromptTransformation: 'Reverse the two complete candidate sections and numeric labels only',
      fixedCaseOrder: ['farewell-current-first', 'farewell-milestone-first', 'healthy-first-victory-current-first', 'healthy-first-victory-milestone-first'],
    } : {}),
    ...(valueVoice ? {
      experiment: 'candidate-recorded-value-plus-one-focus-hint',
      comparison: 'Same healthy first-victory public source, active companion, seed, identity, attempt and inner-life focus; source data differs only in hero.values (curiosity versus mercy). The tools-only candidate maps that value to one replacement focus hint. This compares value plus hint together, not value alone or an untreated baseline. Independent of authored value-shaped duets; cleaner acceptance is not model-quality approval or automatic promotion.',
      productionPromptBuilderUnchanged: true, candidatePromptNotEnabledInApplication: true,
      toolsOnlyPromptTransformation: 'Replace the single generic focus instruction; keep system, public facts, seed image and final ordinary two-sentence directive unchanged',
      fixedValues: ['curiosity', 'mercy'], humanQualityReviewRequired: true,
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
    if (valueVoice) {
      for (const name of ['tools/creative-story-probe/value-voice-cases.mjs', 'tools/creative-story-probe/context-fit-probe.js',
        'tools/creative-story-probe/context-fit-cases.mjs', 'tools/creative-story-probe/moment-choice-cases.mjs',
        'tools/creative-story-probe/first-victory-choice-cases.mjs']) {
        const bytes = await readFile(resolve(repo, name));
        protectedInputs.set(name, bytes);
        report.inputSha256[name] = digest(bytes);
      }
    }
    if (duetMode) {
      for (const name of ['src/narrator/story-duet.ts', 'tools/creative-story-probe/story-duet-cases.mjs',
        'tools/creative-story-probe/context-fit-probe.js', 'tools/creative-story-probe/first-victory-choice-cases.mjs',
        'tools/creative-story-probe/moment-choice-cases.mjs', 'tools/creative-story-probe/context-fit-cases.mjs']) {
        const bytes = await readFile(resolve(repo, name));
        protectedInputs.set(name, bytes);
        report.inputSha256[name] = digest(bytes);
      }
    }
    if (direction || momentChoice) {
      for (const name of ['src/narrator/creative-direction.ts', 'src/narrator/creative-direction-logits.ts',
        'tools/creative-story-probe/context-fit-probe.js', 'tools/creative-story-probe/context-fit-cases.mjs']) {
        const bytes = await readFile(resolve(repo, name));
        protectedInputs.set(name, bytes);
        report.inputSha256[name] = digest(bytes);
      }
      if (momentChoice) {
        for (const name of ['src/narrator/creative-moment.ts', 'tools/creative-story-probe/moment-choice-cases.mjs']) {
          const bytes = await readFile(resolve(repo, name));
          protectedInputs.set(name, bytes);
          report.inputSha256[name] = digest(bytes);
        }
        if (counterbalancedChoice) {
          for (const name of ['tools/creative-story-probe/counterbalanced-choice-cases.mjs',
            'tools/creative-story-probe/first-victory-choice-cases.mjs',
            'tools/creative-story-probe/moment-choice-report-2026-09-07T07-27-48-716Z-03c8f499-c936-484a-9131-0787b21b4858.json',
            'tools/creative-story-probe/first-victory-choice-report-2026-09-07T08-21-59-952Z-a3595ba3-44be-4721-86c0-22f0e144a8c3.json']) {
            const bytes = await readFile(resolve(repo, name));
            protectedInputs.set(name, bytes);
            report.inputSha256[name] = digest(bytes);
          }
        }
        if (firstVictoryChoice) {
          for (const name of ['tools/creative-story-probe/first-victory-choice-cases.mjs',
            'tools/creative-story-probe/moment-choice-report-2026-09-07T07-27-48-716Z-03c8f499-c936-484a-9131-0787b21b4858.json']) {
            const bytes = await readFile(resolve(repo, name));
            protectedInputs.set(name, bytes);
            report.inputSha256[name] = digest(bytes);
            if (name.endsWith('.json')) {
              const historical = JSON.parse(bytes);
              report.priorMomentExperiment = { report: name, sha256: digest(bytes),
                choices: historical.outputs.map(({ id, choice, generationMs }) => ({ id, choice, generationMs })),
                comparisonKind: 'Different public milestone sources, not a paired quality comparison' };
            }
          }
        }
      }
      if (directionCooldown) {
        const name = 'tools/creative-story-probe/direction-report-2026-09-07T05-55-47-024Z-bb86104d-bd07-4bee-9102-3d18264f850c.json';
        const bytes = await readFile(resolve(repo, name));
        const baseline = JSON.parse(bytes);
        protectedInputs.set(name, bytes);
        report.priorDirectionExperiment = { report: name, sha256: digest(bytes),
          choices: baseline.outputs.map(({ id, choice, generationMs }) => ({ id, choice, generationMs })),
          comparisonKind: 'Host eligibility changed; not an unconstrained model-quality improvement' };
      }
      for (const contract of [/max_new_tokens: 1, do_sample: false, repetition_penalty: 1,/, /inputLength > 512/,
        /logits_processor: processors/]) {
        if (!contract.test(worker)) throw new Error('Production direction settings changed; review this probe');
      }
    }
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
    await page.goto(valueVoice ? `${origin}/?value-voice=1` : counterbalancedChoice ? `${origin}/?counterbalanced-choice=1` : duetMode ? `${origin}/?story-duet=1` : firstVictoryChoice ? `${origin}/?first-victory-choice=1` : momentChoice ? `${origin}/?moment-choice=1` : directionCooldown ? `${origin}/?direction-cooldown=1`
      : direction ? `${origin}/?direction=1` : exemplars ? `${origin}/?exemplars=1` : origin, { timeout: 30_000 });
    await page.waitForFunction(() => !!globalThis.creativeContextFitProbe, undefined, { timeout: 30_000 });
    report.builtIdentity = await page.evaluate(() => globalThis.creativeContextFitProbe.identity);
    if (report.builtIdentity.modelId !== manifest.modelId || report.builtIdentity.revision !== manifest.revision
      || report.builtIdentity.inferenceTimeoutMs !== 90_000) throw new Error('Built production identity/deadline mismatch');
    if (direction && report.builtIdentity.directionTimeoutMs !== 30_000) throw new Error('Built direction deadline mismatch');
    if (momentChoice && report.builtIdentity.momentTimeoutMs !== 30_000) throw new Error('Built moment-choice deadline mismatch');
    report.crossOriginIsolated = await page.evaluate(() => crossOriginIsolated);
    if (report.crossOriginIsolated) throw new Error('Expected the production-like non-isolated single-thread browser');
    report.cases = await page.evaluate(() => globalThis.creativeContextFitProbe.cases);
    if (valueVoice) {
      if (!isDeepStrictEqual(report.cases.map(({ value }) => value), ['curiosity', 'mercy'])) throw new Error('Expected exactly the two fixed values');
      for (const field of ['job', 'seed', 'identity', 'attempt', 'mode', 'focus']) {
        if (!isDeepStrictEqual(report.cases[0][field], report.cases[1][field])) throw new Error(`Value comparison changed ${field}`);
      }
      if (!isDeepStrictEqual(report.cases[0].viewpoint.companion, report.cases[1].viewpoint.companion)
        || report.cases[0].viewpoint.hero.name !== report.cases[1].viewpoint.hero.name) throw new Error('Value comparison changed people');
      for (const fixture of report.cases) {
        if (!isDeepStrictEqual(fixture.viewpoint.hero.values, [fixture.value])
          || !isDeepStrictEqual(fixture.messages, withValueVoiceHint(fixture.productionMessages, fixture.value,
            fixture.viewpoint.hero.name, fixture.viewpoint.companion.name))) throw new Error('Value hint isolation failed');
      }
      report.promptSizes = report.cases.map(({ id, messages }) => ({ id,
        characters: messages.reduce((sum, message) => sum + message.content.length, 0),
        utf8Bytes: messages.reduce((sum, message) => sum + Buffer.byteLength(message.content), 0),
        exactTokenCount: null, tokenLimitEnforcedByProductionWorker: 1_024 }));
    }
    if (duetMode && (!isDeepStrictEqual(report.cases.map(({ packet }) => packet?.condition), ['healthy', 'injured'])
      || report.cases.some(({ job, packet, focus, messages }) => focus !== 'shared-road'
        || packet.kind !== 'first-shared-victory' || job.eventId !== packet.eventId || job.tick !== packet.tick
        || !Array.isArray(messages)))) throw new Error('Expected exactly the two bound healthy/injured duet fixtures');
    if (directionCooldown && !isDeepStrictEqual(report.cases.map(({ excludedChoice }) => excludedChoice), ['1', '2', '3'])) {
      throw new Error('Cooldown probe requires the exact fixed exclusion order');
    }
    if (momentChoice && !counterbalancedChoice && (report.cases.length !== 2 || report.cases.some(({ excludedChoice, momentMessages }) =>
      excludedChoice !== '3' || !Array.isArray(momentMessages)))) throw new Error('Expected exactly two fixed moment-choice pairs');
    if (counterbalancedChoice) {
      const expected = createCounterbalancedChoiceCases(baseline);
      if (report.cases.length !== 4) throw new Error('Expected exactly four counterbalanced cases');
      for (const [index, fixture] of report.cases.entries()) {
        for (const field of ['id', 'pairId', 'order', 'milestoneKind', 'currentJob', 'milestoneJob', 'choices', 'excludedChoice']) {
          if (!isDeepStrictEqual(fixture[field], expected[index][field])) throw new Error(`Counterbalanced fixture changed ${field}`);
        }
        if (!isDeepStrictEqual(fixture.momentMessages, counterbalanceMomentMessages(fixture.productionMomentMessages, fixture.order))) {
          throw new Error('Counterbalanced transformation changed more than section order and labels');
        }
      }
    }
    if (firstVictoryChoice && (!isDeepStrictEqual(report.cases.map(({ companionStatus }) => companionStatus), ['healthy', 'injured'])
      || report.cases.some(({ milestoneKind, momentMessages }) => milestoneKind !== 'first-shared-victory'
        || !momentMessages[1].content.includes('2 Recorded first shared victory')))) {
      throw new Error('Expected the exact healthy/injured first-victory sources and production labels');
    }
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
      const row = momentChoice ? await page.evaluate((index) => globalThis.creativeContextFitProbe.chooseMoment(index), index)
        : direction
        ? await page.evaluate((index) => globalThis.creativeContextFitProbe.direct(index), index)
        : await page.evaluate((index) => globalThis.creativeContextFitProbe.write(index), index);
      ensureActive();
      report.outputs.push(row);
      delete report.pendingCase;
      report.generationRequests = report.attemptedRequests.filter((request) => request.phase === 'generation');
      await checkpoint();
      console.log(JSON.stringify({ id: row.id, seedId: row.seedId, relationshipFit: row.relationshipFit,
        ...(direction || momentChoice ? { choice: row.choice } : { raw: row.raw, cleaned: row.cleaned }),
        ...(counterbalancedChoice ? { order: row.order, semanticChoice: row.semanticChoice } : {}),
        ...(directionCooldown || momentChoice ? { excludedChoice: row.excludedChoice, eligible: row.eligible } : {}), generationMs: row.generationMs }));
      if (report.generationRequests.length > 0) throw new Error('Generation attempted a network request');
      if ((directionCooldown || momentChoice) && !row.eligible) throw new Error('Decision did not return a valid eligible label');
      if (counterbalancedChoice && row.semanticChoice !== row.choices[row.choice]) throw new Error('Numeric-to-semantic choice mismatch');
    }
    if (momentChoice) {
      report.momentChoicesComplete = true;
      report.distinctValidChoices = [...new Set(report.outputs.map(({ choice }) => choice))];
      report.postDecisionProse = { skipped: true, reason: 'Moment-choice-only proof; no prose run authorized' };
    }
    if (duetMode) {
      report.duetWritesComplete = true;
      report.structurallyAcceptedDuets = report.outputs.filter(({ duet }) => duet !== null).length;
      report.humanQualityReviewRequired = true;
    }
    if (direction) {
      report.directionChoicesComplete = true;
      report.distinctValidChoices = [...new Set(report.outputs.map(({ choice }) => choice).filter((choice) => ['1', '2', '3'].includes(choice)))];
      report.observedChoiceVariation = report.distinctValidChoices.length >= 2;
      const remainingMs = totalDeadlineMs - (Date.now() - Date.parse(report.capturedAt));
      if (directionCooldown) {
        report.postDirectionProse = { skipped: true, reason: 'Separate cooldown-only experiment; prior unchanged-prose proof is preserved' };
      } else if (remainingMs >= 95_000) {
        report.pendingOperation = 'ordinary-prose-after-three-directions';
        await checkpoint();
        console.log(JSON.stringify({ phase: 'generation', operation: report.pendingOperation, remainingMs }));
        report.postDirectionProse = await page.evaluate(() => globalThis.creativeContextFitProbe.write(0));
        ensureActive();
        delete report.pendingOperation;
        report.generationRequests = report.attemptedRequests.filter((request) => request.phase === 'generation');
        await checkpoint();
        console.log(JSON.stringify({ operation: 'ordinary-prose-after-three-directions', raw: report.postDirectionProse.raw,
          cleaned: report.postDirectionProse.cleaned, generationMs: report.postDirectionProse.generationMs }));
        if (report.generationRequests.length > 0) throw new Error('Prose attempted a network request');
      } else {
        report.postDirectionProse = { skipped: true, reason: 'Fewer than95seconds remain in the fixed300second total budget', remainingMs };
      }
    }
    await page.evaluate(() => globalThis.creativeContextFitProbe.dispose());
    report.phase = 'complete';
    report.complete = true;
  };
  try {
    await Promise.race([execute(), new Promise((_, decline) => {
      watchdog = setTimeout(() => { expired = true; decline(new Error(duetMode
        ? 'Story duet235second work watchdog expired' : valueVoice
          ? 'Value voice235second work watchdog expired' : counterbalancedChoice
          ? 'Counterbalanced choice235second work watchdog expired' : shortDecisionProbe
          ? 'Short decision175second work watchdog expired' : 'Context-fit five-minute watchdog expired')); }, workDeadlineMs);
    })]);
  } catch (error) {
    report.errors.push({ phase: report.phase, message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  } finally {
    const cleanupWatchdog = setTimeout(() => process.exit(1), cleanupDeadlineMs);
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
