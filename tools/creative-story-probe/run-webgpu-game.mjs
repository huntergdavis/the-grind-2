import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { createReadStream, writeFileSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webgpuV1, webgpuV1Flags } from './webgpu-v1-config.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '../..');
const dist = resolve(repo, 'dist');
const profile = resolve(repo, '.narrator-t5-rebuild/creative-probe/webllm-v1/candidate-browser-profile');
const origin = 'http://127.0.0.1:19877';
const appBase = '/the-grind-2/';
const modeKey = 'the-grind-2:play-mode:v1';
const journalKey = 'the-grind-2:narrative-journal:v1';
const workDeadlineMs = 455_000;
const cleanupDeadlineMs = 25_000;
const timestamp = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', timeZoneName: 'short' }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `[${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${parts.timeZoneName}]`;
};
const log = (value) => console.log(`${timestamp()} ${typeof value === 'string' ? value : JSON.stringify(value)}`);
const timed = (promise, ms, label) => new Promise((accept, decline) => {
  const timer = setTimeout(() => decline(new Error(`${label} exceeded ${ms / 1000}s`)), ms);
  Promise.resolve(promise).then(accept, decline).finally(() => clearTimeout(timer));
});
const sha = (value) => createHash('sha256').update(value).digest('hex');
const safeUrl = (value) => { const parsed = new URL(value); return parsed.origin + parsed.pathname; };
const mime = (file) => ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
})[extname(file)] ?? 'application/octet-stream';

export async function runWebgpuGame(args = process.argv.slice(2)) {
  const argument = (name) => args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
  const entry = argument('entry'), expectedSha = argument('sha256'), version = argument('version');
  const resumeOffName = argument('resume-off');
  const resumeName = argument('resume') ?? resumeOffName;
  assert(!(argument('resume') && resumeOffName), 'Choose only one continuation kind');
  const resumeOff = resumeOffName !== undefined;
  assert(args.includes('--run') && args.length === (resumeName === undefined ? 4 : 5) && new Set(args).size === args.length
    && /^index-[A-Za-z0-9_-]+\.js$/u.test(entry ?? '') && /^[a-f0-9]{64}$/u.test(expectedSha ?? '')
    && /^\d+\.\d+\.\d+$/u.test(version ?? '')
    && (resumeName === undefined || /^webgpu-game-report-[A-Za-z0-9-]+\.json$/u.test(resumeName)),
  'Usage: node tools/creative-story-probe/run-webgpu-game.mjs --run --entry=index-HASH.js --sha256=HEX --version=VERSION [--resume=REPORT.json | --resume-off=REPORT.json]');
  const priorBytes = resumeName === undefined ? null : await readFile(resolve(root, resumeName));
  const prior = priorBytes === null ? null : JSON.parse(priorBytes.toString('utf8'));
  if (prior !== null) {
    assert(prior.build?.version === version && prior.build?.entry === entry && prior.build?.actualSha === expectedSha
      && prior.build?.expectedSha === expectedSha && prior.build?.appBase === appBase, 'Resume must use the identical prior build');
    assert(prior.phase === (resumeOff ? 'cancel-second-real-write' : 'automatic-cache-only-reload') && prior.complete === false
      && prior.cleanup?.contextClosed === true && prior.cleanup?.browserClosed === true
      && prior.cleanup?.serverClosed === true && prior.cleanup?.creativeWorkersClosed === true,
    'Resume requires the closed prior journey stopped at cache-only reload');
    assert(Array.isArray(prior.checks) && prior.checks.length >= (resumeOff ? 20 : 18) && prior.checks.every((item) => item.passed === true)
      && prior.checks.some((item) => item.name === (resumeOff
        ? 'Off occurs while actual prose generation is still pending' : 'Journal renders the exact accepted story and LLM attribution')),
    'Resume requires prior passed consent, real prose, presentation and journal evidence');
    assert(prior.blockedRequests?.length === 0 && prior.errors?.length === 1
      && prior.errors[0].phase === (resumeOff ? 'cancel-second-real-write' : 'automatic-cache-only-reload')
      && prior.errors[0].message.includes(resumeOff ? "locator('#narrator-close')" : "locator('#stage-pause-button')"),
    'Resume only the reviewed harness-control failure');
    const passage = prior.firstPassage;
    assert(passage?.origin === 'model' && typeof passage.text === 'string' && passage.text.trim().length > 0
      && typeof passage.campaignId === 'string' && typeof passage.sourceEventId === 'string'
      && Number.isSafeInteger(passage.sourceTick) && passage.sourceTick >= 0
      && Number.isFinite(passage.presentedAtMs), 'Resume requires the actual previously presented model passage');
    assert(prior.profile?.directory === profile && prior.profile?.preserved === true, 'Resume profile must be the same owned profile');
  }
  let ancestor = null, ancestorBytes = null;
  if (resumeOff) {
    const name = prior.linkedEvidence?.file;
    assert(/^webgpu-game-report-[A-Za-z0-9-]+\.json$/u.test(name ?? ''), 'Off continuation needs the original actual-story receipt link');
    ancestorBytes = await readFile(resolve(root, name));
    assert(sha(ancestorBytes) === prior.linkedEvidence.sha256, 'Original actual-story receipt hash changed');
    ancestor = JSON.parse(ancestorBytes.toString('utf8'));
    assert(ancestor.build?.actualSha === expectedSha && ancestor.build?.version === version
      && ancestor.build?.entry === entry && ancestor.cleanup?.browserClosed === true && ancestor.cleanup?.serverClosed === true
      && ancestor.checks?.some((item) => item.name === 'Journal renders the exact accepted story and LLM attribution' && item.passed === true)
      && JSON.stringify(ancestor.firstPassage) === JSON.stringify(prior.firstPassage), 'Original actual-story proof does not match');
    const pending = prior.workerEvents?.filter((event) => event.type === 'sent' && event.message?.type === 'write').at(-1);
    assert(pending && prior.workerEvents.some((event) => event.type === 'terminated' && event.workerId === pending.workerId)
      && !prior.workerEvents.some((event) => event.type === 'received' && event.workerId === pending.workerId
        && event.message?.id === pending.message.id && event.message?.type === 'result'), 'Prior real pending writer was not terminated before completion');
    assert(prior.snapshots?.some((item) => item.label === 'before-off-during-write' && item.phase === 'writing'
      && item.campaignId === prior.firstPassage.campaignId && Array.isArray(item.journal)), 'Missing pre-Off journal baseline');
  }
  const runWorkDeadlineMs = resumeOff ? 90_000 : workDeadlineMs;
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const reportPath = resolve(root, `webgpu-game-report-${runId}.json`);
  const started = Date.now();
  const report = {
    startedAt: new Date().toISOString(), phase: 'preflight', complete: false,
    purpose: prior === null
      ? 'One real production application journey; no fake writer, supplied prose, clock shifts, build or model download.'
      : resumeOff ? 'Final No LLM return and history checks linked to two prior actual-worker receipts; no GPU model activation or regenerated prose.'
        : 'Remaining real-application checks linked to the prior actual-story receipt; not a new full journey or regenerated first story.',
    ...(prior === null ? {} : { linkedEvidence: { file: resumeName, sha256: sha(priorBytes),
      priorPassedChecks: prior.checks.map((item) => item.name), priorStoppedPhase: prior.phase,
      reason: resumeOff ? 'Prior worker was canceled; validate persisted No LLM and unchanged history without another model load.'
        : 'Harness now chooses the visible pause/resume control. Production build and sources must remain identical.',
      ...(ancestor === null ? {} : { originalStoryFile: prior.linkedEvidence.file, originalStorySha256: sha(ancestorBytes) }) } }),
    workDeadlineMs: runWorkDeadlineMs, cleanupDeadlineMs, identity: webgpuV1, flags: resumeOff ? [] : webgpuV1Flags,
    profile: { directory: profile, kind: 'Owned isolated probe profile, never a real user profile', preserved: true },
    build: { version, entry, expectedSha, appBase }, checks: [], snapshots: [], workerEvents: [], workerUrls: [],
    requests: [], blockedRequests: [], errors: [], screenshots: [],
    cleanup: { contextClosed: false, browserClosed: false, serverClosed: false, creativeWorkersClosed: false },
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  let context, page, server, cancelled = false, phaseOrdinal = 0;
  let writes = Promise.resolve();
  const checkpoint = () => {
    const text = JSON.stringify(report, null, 2) + '\n';
    writes = writes.then(() => writeFile(reportPath, text));
    return writes;
  };
  const guard = () => { if (cancelled) throw new Error('Journey deadline reached'); };
  const phase = async (name) => { guard(); report.phase = name; phaseOrdinal += 1; log(name); await checkpoint(); };
  const check = (name, passed, details) => {
    report.checks.push({ name, passed: Boolean(passed), ...(details === undefined ? {} : { details }) });
    assert(passed, name);
  };
  const activeCreativeWorkers = new Set();
  const eventCount = (type, messageType) => report.workerEvents.filter((event) => event.type === type
    && (messageType === undefined || event.message?.type === messageType)).length;
  const inspect = async (label) => {
    const snapshot = await page.evaluate((key) => {
      const campaignId = sessionStorage.getItem('the-grind-2:activeCampaignId');
      const saved = campaignId === null ? null : sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
      const world = saved === null ? null : JSON.parse(saved);
      return { campaignId, saved, tick: Number(document.querySelector('#app')?.getAttribute('data-simulation-tick')),
        phase: document.querySelector('#app')?.getAttribute('data-creative-story-state'),
        mode: document.querySelector('#app')?.getAttribute('data-play-mode'),
        paused: [...document.querySelectorAll('#stage-pause-button, #pause-button')]
          .find((element) => element.getClientRects().length > 0)?.textContent,
        scene: world?.scene, heroName: world?.hero?.name, entry: world?.chronicle?.at(-1),
        journal: JSON.parse(localStorage.getItem(key) ?? '{"entries":[]}').entries };
    }, journalKey);
    const { saved, ...publicSnapshot } = snapshot;
    const row = { label, elapsedMs: Date.now() - started, ...publicSnapshot,
      saveBytes: saved?.length ?? 0, saveSha256: saved === null ? null : sha(saved) };
    report.snapshots.push(row); await checkpoint(); return row;
  };
  const wait = async (fn, value, timeout, label) => {
    guard();
    await page.waitForFunction(fn, value, { timeout, polling: 200 }).catch((error) => {
      throw new Error(`${label}: ${error.message}`);
    });
    guard();
  };
  const click = async (selector) => {
    const target = page.locator(selector);
    await target.evaluate((element) => element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }));
    await target.click({ timeout: 10_000 });
  };
  const setPaused = async (paused) => {
    const selector = await page.locator('#stage-pause-button').isVisible() ? '#stage-pause-button' : '#pause-button';
    assert(await page.locator(selector).isVisible(), 'A real visible pause/resume control must be available');
    const expected = paused ? 'Resume' : 'Pause';
    if ((await page.locator(selector).textContent())?.trim() !== expected) await click(selector);
    await wait(({ selector, expected }) => document.querySelector(selector)?.textContent?.trim() === expected,
      { selector, expected }, 10_000, paused ? 'User pause' : 'User resume');
  };
  const pause = () => setPaused(true);
  const openOptions = async () => {
    const trigger = await page.locator('#stage-menu-button').isVisible() ? '#stage-menu-button' : '#game-menu-button';
    await click(trigger); await click('#narrator-button');
    await page.locator('#narrator-dialog').waitFor({ state: 'visible', timeout: 10_000 });
  };
  const closeOptions = async () => {
    // The production dialog's native cancel handler closes it; no force-click or CSS mutation.
    if (await page.locator('#narrator-dialog').evaluate((dialog) => dialog.open)) await page.keyboard.press('Escape');
    await page.locator('#narrator-dialog').waitFor({ state: 'hidden', timeout: 10_000 });
  };
  const shot = async (kind, width, height) => {
    await page.setViewportSize({ width, height });
    const path = resolve(root, `webgpu-game-${runId}-${kind}-${width}.png`);
    await page.screenshot({ path }); report.screenshots.push({ kind, width, height, path });
  };

  const execute = async () => {
    await stat(profile); // Never silently create a different empty model profile.
    const index = await readFile(resolve(dist, 'index.html'), 'utf8');
    const versionRecord = JSON.parse(await readFile(resolve(dist, 'version.json'), 'utf8'));
    const entryBytes = await readFile(resolve(dist, 'assets', entry));
    check('Frozen built application version matches', versionRecord.version === version, versionRecord);
    check('Frozen entry is referenced by dist/index.html', index.includes(entry));
    report.build.actualSha = sha(entryBytes);
    check('Frozen entry SHA256 matches', report.build.actualSha === expectedSha);
    report.sources = await Promise.all(['src/narrator/creative-story.ts', 'src/narrator/creative-writer.worker.ts',
      'src/narrator/creative-writer-client.ts', 'src/narrator/creative-writer-cache.ts', 'src/main.ts',
      'src/narrator/creative-writer-conversation.ts', 'src/narrator/creative-writer-model.ts',
      'tools/creative-story-probe/run-webgpu-game.mjs'].map(async (file) => {
      const bytes = await readFile(resolve(repo, file)); return { file, bytes: bytes.length, sha256: sha(bytes) };
    }));
    if (prior !== null) for (const source of report.sources.filter((item) => item.file.startsWith('src/'))) {
      const earlier = prior.sources?.find((item) => item.file === source.file);
      check(`Production source matches linked receipt: ${source.file}`, earlier?.sha256 === source.sha256 && earlier?.bytes === source.bytes);
      if (ancestor !== null) check(`Production source matches original story: ${source.file}`,
        ancestor.sources?.find((item) => item.file === source.file)?.sha256 === source.sha256);
    }
    server = createServer((request, response) => {
      const pathname = new URL(request.url, origin).pathname;
      response.setHeader('Cache-Control', 'no-store');
      if (pathname === '/__journey-setup') {
        response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Owned journey setup</title>'); return;
      }
      if (!pathname.startsWith(appBase)) { response.writeHead(404).end(); return; }
      const relativePath = pathname.slice(appBase.length);
      const file = resolve(dist, relativePath === '' ? 'index.html' : relativePath);
      if (!file.startsWith(dist + '/')) { response.writeHead(403).end(); return; }
      response.setHeader('Content-Type', mime(file));
      createReadStream(file).on('error', () => { if (!response.headersSent) response.writeHead(404); response.end(); }).pipe(response);
    });
    await new Promise((accept, decline) => { server.once('error', decline); server.listen(19877, '127.0.0.1', accept); });
    await phase('owned-profile-start');
    context = await chromium.launchPersistentContext(profile, { headless: true, args: resumeOff ? [] : [...webgpuV1Flags],
      viewport: { width: 960, height: 640 }, reducedMotion: 'reduce', serviceWorkers: 'block', timeout: 20_000 });
    report.browser = context.browser()?.version();
    context.on('request', (request) => report.requests.push({ elapsedMs: Date.now() - started, phase: report.phase,
      type: request.resourceType(), method: request.method(), url: safeUrl(request.url()) }));
    await context.route('**/*', async (route) => {
      const request = route.request();
      if (new URL(request.url()).origin === origin && ['GET', 'HEAD'].includes(request.method())) return route.continue();
      report.blockedRequests.push({ elapsedMs: Date.now() - started, phase: report.phase,
        method: request.method(), url: safeUrl(request.url()) });
      return route.abort('blockedbyclient');
    });
    page = context.pages()[0] ?? await context.newPage();
    page.on('pageerror', (error) => report.errors.push({ type: 'pageerror', message: error.message }));
    page.on('worker', (worker) => {
      const item = { url: safeUrl(worker.url()), elapsedMs: Date.now() - started, phase: report.phase, closed: false };
      report.workerUrls.push(item); worker.on('close', () => { item.closed = true; });
    });
    await page.exposeBinding('__reportGameJourney', (_source, event) => {
      const recorded = { elapsedMs: Date.now() - started, phase: report.phase, ...event };
      report.workerEvents.push(recorded);
      if (event.type === 'created') activeCreativeWorkers.add(event.workerId);
      if (event.type === 'terminated') activeCreativeWorkers.delete(event.workerId);
      if (event.type === 'received' && event.message?.type === 'result') log({ actualModelResult: event.message.text });
      void checkpoint();
    });
    await page.addInitScript(() => {
      const documentId = crypto.randomUUID();
      const audit = { documentId, events: [], created: 0 };
      Object.assign(window, { __realWriterJourney: audit });
      const publicMoment = () => {
        try {
          const id = sessionStorage.getItem('the-grind-2:activeCampaignId');
          const saved = JSON.parse(sessionStorage.getItem(`the-grind-2:campaign:${id}`) ?? 'null');
          return { tick: Number(document.querySelector('#app')?.getAttribute('data-simulation-tick')),
            campaignId: id, scene: saved?.scene, entry: saved?.chronicle?.at(-1), heroName: saved?.hero?.name };
        } catch { return null; }
      };
      const emit = (event) => {
        const copy = { documentId, ...event }; audit.events.push(copy);
        void window.__reportGameJourney(copy).catch(() => undefined);
      };
      const NativeWorker = window.Worker;
      window.Worker = new Proxy(NativeWorker, {
        construct(target, args) {
          const worker = Reflect.construct(target, args);
          if (args[1]?.name !== 'the-grind-2:creative-writer') return worker;
          const workerId = `${documentId}:${++audit.created}`;
          emit({ type: 'created', workerId, url: String(args[0]) });
          worker.addEventListener('message', (event) => emit({ type: 'received', workerId,
            message: event.data, moment: publicMoment() }));
          const send = worker.postMessage.bind(worker);
          worker.postMessage = (...parameters) => {
            emit({ type: 'sent', workerId, message: parameters[0], moment: publicMoment() });
            return send(...parameters);
          };
          const terminate = worker.terminate.bind(worker);
          worker.terminate = () => { emit({ type: 'terminated', workerId }); return terminate(); };
          return worker;
        },
      });
    });
    await page.goto(origin + '/__journey-setup', { waitUntil: 'load', timeout: 15_000 });
    report.storageBefore = await page.evaluate(({ key, resuming }) => {
      const previousMode = localStorage.getItem(key);
      // Only consent preference in this exact owned profile changes. Never clear saves, journals or model caches.
      if (!resuming) localStorage.removeItem(key);
      return { previousMode, changedKey: resuming ? null : key, preservedLocalKeys: Object.keys(localStorage),
        cacheNames: [] };
    }, { key: modeKey, resuming: prior !== null });
    report.storageBefore.cacheNames = await page.evaluate(() => caches.keys());
    check('Owned profile already contains candidate model cache', report.storageBefore.cacheNames.includes('webllm/model'));
    let prose, archivedBeforeReload;
    if (prior !== null) {
      check(resumeOff ? 'Off continuation verifies the actual remembered No LLM preference'
        : 'Resume preserves the actual remembered LLM consent',
      JSON.parse(report.storageBefore.previousMode ?? 'null')?.mode === (resumeOff ? 'deterministic' : 'llm'));
      report.resumeStorage = await page.evaluate(async ({ passage, journalKey }) => {
        const entries = JSON.parse(localStorage.getItem(journalKey) ?? '{"entries":[]}').entries;
        const found = entries.find((item) => item.campaignId === passage.campaignId && item.sourceEventId === passage.sourceEventId);
        const databases = await indexedDB.databases();
        if (!databases.some((database) => database.name === 'the-grind-2')) throw new Error('Prior campaign database is missing');
        const database = await new Promise((accept, decline) => {
          const request = indexedDB.open('the-grind-2', 2);
          request.onsuccess = () => accept(request.result); request.onerror = () => decline(request.error);
        });
        try {
          const transaction = database.transaction(['settings', 'campaigns'], 'readonly');
          const read = (request) => new Promise((accept, decline) => {
            request.onsuccess = () => accept(request.result); request.onerror = () => decline(request.error);
          });
          const [activeCampaignId, world] = await Promise.all([
            read(transaction.objectStore('settings').get('activeCampaignId')),
            read(transaction.objectStore('campaigns').get(passage.campaignId)),
          ]);
          return { activeCampaignId, savedCampaignId: world?.campaignId, savedTick: world?.tick,
            exactPassageRetained: JSON.stringify(found) === JSON.stringify(passage), journal: entries };
        } finally { database.close(); }
      }, { passage: prior.firstPassage, journalKey });
      check('Resume finds the unchanged actual passage in the real journal', report.resumeStorage.exactPassageRetained);
      check('Resume finds the same saved active campaign', report.resumeStorage.activeCampaignId === prior.firstPassage.campaignId
        && report.resumeStorage.savedCampaignId === prior.firstPassage.campaignId
        && Number.isSafeInteger(report.resumeStorage.savedTick) && report.resumeStorage.savedTick >= prior.firstPassage.sourceTick);
      prose = prior.firstPassage.text;
      report.firstPassage = prior.firstPassage;
      archivedBeforeReload = { campaignId: prior.firstPassage.campaignId };
      if (resumeOff) check('Persisted journal is unchanged since the canceled real write',
        JSON.stringify(report.resumeStorage.journal) === JSON.stringify(prior.snapshots.find((item) => item.label === 'before-off-during-write').journal));
    } else {
    await phase('fresh-consent');
    await page.goto(origin + appBase, { waitUntil: 'load', timeout: 20_000 });
    await wait(() => document.documentElement.dataset.ready === 'true', undefined, 30_000, 'Application ready');
    check('Actual application reports the frozen version', await page.locator('html').getAttribute('data-app-version') === version);
    await page.locator('#play-start-dialog').waitFor({ state: 'visible', timeout: 15_000 });
    check('No creative worker before explicit consent', eventCount('created') === 0);
    check('Fresh consent detects the complete saved model', (await page.locator('#play-start-cache').textContent())?.includes('No download needed'));
    const before = await inspect('before-consent');
    await click('#play-start-llm');
    await phase('first-background-write');
    await wait(() => window.__realWriterJourney.events.some((event) => event.type === 'sent' && event.message?.type === 'write'),
      undefined, 180_000, 'First real model write');
    const during = await inspect('while-first-model-write');
    check('Explicit consent starts exactly one creative worker', eventCount('created') === 1);
    const loadMessages = report.workerEvents.filter((event) => event.type === 'sent' && event.message?.type === 'load');
    check('Fresh consent was explicit, not a forged restore', loadMessages.length === 1 && loadMessages[0].message.cacheOnly !== true);
    await page.locator('#narrative-intermission').waitFor({ state: 'visible', timeout: 150_000 });
    await click('#narrative-intermission-hold');
    check('Actual model prose, not authored recovery, reached the scroll', await page.locator('#narrative-intermission').getAttribute('data-story-origin') === 'model');
    prose = (await page.locator('#narrative-intermission-prose').textContent())?.trim();
    check('Intermission contains actual completed prose', typeof prose === 'string' && prose.length > 0);
    const presented = await inspect('first-model-story-presented');
    report.firstPassage = presented.journal.find((item) => item.campaignId === presented.campaignId && item.text === prose && item.origin === 'model');
    check('Exact actual model passage is archived and marked presented', report.firstPassage?.presentedAtMs !== null && report.firstPassage !== undefined);
    const result = report.workerEvents.find((event) => event.type === 'received' && event.message?.type === 'result');
    check('The accepted prose is a prefix of a real worker result', typeof result?.message.text === 'string'
      && result.message.text.replace(/\s+/gu, ' ').trim().startsWith(prose.replace(/\s+/gu, ' ').trim()));
    check('Same actual campaign progressed while model writing ran', presented.campaignId === before.campaignId
      && result?.moment?.tick > during.tick && presented.tick > report.firstPassage.sourceTick,
    { beforeTick: before.tick, writingTick: during.tick, resultTick: result?.moment?.tick, presentationTick: presented.tick });
    check('Safe intermission is not over a battle', presented.scene.mode !== 'battle'
      && await page.locator('#stage').getAttribute('data-encounter-engine') === null);
    for (const [width, height] of [[960, 640], [320, 568]]) {
      await shot('scroll', width, height);
      check(`Scroll fits ${width}px`, await page.locator('#narrative-intermission').evaluate((element) => {
        const box = element.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0 && box.bottom <= innerHeight + 1
          && document.documentElement.scrollWidth <= innerWidth + 1;
      }));
    }
    await click('#narrative-intermission-hold');
    await pause();
    await phase('actual-journal-reading');
    if (!(await page.locator('[data-view="journal"]').isVisible())) await click('#stage-focus-button');
    await click('[data-view="journal"]'); await click('#journal-narratives-button');
    const journalText = await page.locator('#journal-narrative-list').textContent();
    check('Journal renders the exact accepted story and LLM attribution', journalText.includes(prose) && journalText.includes('LLM'));
    await shot('journal', 320, 568);
    await click('[data-view="watch"]');
    await page.setViewportSize({ width: 960, height: 640 });
    archivedBeforeReload = await inspect('before-cache-restore-reload');
    }
    if (!resumeOff) {
    const workersBeforeReload = eventCount('created');
    await phase('automatic-cache-only-reload');
    if (prior === null) await page.reload({ waitUntil: 'load', timeout: 20_000 });
    else await page.goto(origin + appBase, { waitUntil: 'load', timeout: 20_000 });
    await wait(() => document.documentElement.dataset.ready === 'true', undefined, 30_000, 'Reloaded application ready');
    await pause();
    await wait(() => document.querySelector('#app')?.getAttribute('data-creative-story-state') === 'ready',
      undefined, 180_000, 'Automatic cached model restore');
    check('Remembered LLM skips the choice dialog', !(await page.locator('#play-start-dialog').isVisible()));
    check('Reload creates exactly one new creative worker', eventCount('created') === workersBeforeReload + 1);
    const restoredLoad = report.workerEvents.filter((event) => event.type === 'sent' && event.message?.type === 'load').at(-1);
    check('Production startup requests cache-only restoration', restoredLoad?.message.cacheOnly === true);
    const afterReload = await inspect('after-cache-only-restore');
    check('Reload retains the same campaign and exact archived model prose', afterReload.campaignId === archivedBeforeReload.campaignId
      && afterReload.journal.some((item) => item.sourceEventId === report.firstPassage.sourceEventId
        && item.campaignId === report.firstPassage.campaignId && item.text === prose && item.origin === 'model'));
    await phase('cancel-second-real-write');
    const writesBeforeResume = eventCount('sent', 'write');
    await setPaused(false);
    await wait(() => window.__realWriterJourney.events.some((event) => event.type === 'sent' && event.message?.type === 'write'),
      undefined, 60_000, 'Second real model write');
    check('The restored worker starts the next real write', eventCount('sent', 'write') === writesBeforeResume + 1);
    const canceledRequest = report.workerEvents.filter((event) => event.type === 'sent' && event.message?.type === 'write').at(-1);
    await openOptions();
    const beforeOff = await inspect('before-off-during-write');
    check('Off occurs while actual prose generation is still pending', beforeOff.phase === 'writing'
      && !report.workerEvents.some((event) => event.type === 'received' && event.workerId === canceledRequest.workerId
        && event.message?.id === canceledRequest.message.id && ['result', 'error'].includes(event.message?.type)));
    await page.locator('#play-mode-select').selectOption('deterministic');
    await wait(() => document.querySelector('#app')?.getAttribute('data-creative-story-state') === 'off', undefined, 10_000, 'Off cancels writer');
    await closeOptions();
    const offTick = (await inspect('immediately-after-off')).tick;
    await wait((previousTick) => Number(document.querySelector('#app')?.getAttribute('data-simulation-tick')) > previousTick,
      offTick, 30_000, 'Adventure continues without LLM');
    const afterOff = await inspect('off-after-real-adventure-step');
    check('Off terminates the canceled worker', report.workerEvents.some((event) => event.type === 'terminated' && event.workerId === canceledRequest.workerId));
    check('Canceled output never reaches the archive', JSON.stringify(afterOff.journal) === JSON.stringify(beforeOff.journal));
    check('Off cannot leave a narrative intermission open', !(await page.locator('#narrative-intermission').isVisible()));
    const workersBeforeNoLlm = eventCount('created'), writesBeforeNoLlm = eventCount('sent', 'write');
    await phase('no-llm-reload');
    await page.reload({ waitUntil: 'load', timeout: 20_000 });
    await wait(() => document.documentElement.dataset.ready === 'true', undefined, 30_000, 'No LLM reload ready');
    const deterministic = await inspect('no-llm-after-reload');
    await wait((previousTick) => Number(document.querySelector('#app')?.getAttribute('data-simulation-tick')) > previousTick,
      deterministic.tick, 30_000, 'No LLM reload advances');
    check('No LLM reload creates no creative worker or model write', eventCount('created') === workersBeforeNoLlm
      && eventCount('sent', 'write') === writesBeforeNoLlm && deterministic.mode === 'deterministic');
    check('No LLM reload retains actual model story history', deterministic.journal.some((item) => item.text === prose && item.origin === 'model'));
    } else {
      await phase('linked-no-llm-return');
      check('No creative worker was created during preserved-state validation', eventCount('created') === 0);
      await page.goto(origin + appBase, { waitUntil: 'load', timeout: 20_000 });
      await wait(() => document.documentElement.dataset.ready === 'true', undefined, 30_000, 'Preserved No LLM application ready');
      const returned = await inspect('linked-no-llm-return');
      check('Actual application still reports the frozen version', await page.locator('html').getAttribute('data-app-version') === version);
      check('Remembered No LLM bypasses consent and model activation', returned.mode === 'deterministic'
        && !(await page.locator('#play-start-dialog').isVisible()) && eventCount('created') === 0);
      check('The same actual campaign and exact prior model prose survive return', returned.campaignId === report.firstPassage.campaignId
        && JSON.stringify(returned.journal) === JSON.stringify(report.resumeStorage.journal));
      await wait((previousTick) => Number(document.querySelector('#app')?.getAttribute('data-simulation-tick')) > previousTick,
        returned.tick, 30_000, 'No LLM adventure advances after return');
      const advanced = await inspect('linked-no-llm-advanced');
      check('No LLM advances without a creative worker, load, direction or write', advanced.tick > returned.tick
        && eventCount('created') === 0 && eventCount('sent') === 0);
      check('No canceled output appeared later in the journal', JSON.stringify(advanced.journal) === JSON.stringify(report.resumeStorage.journal));
      check('No LLM leaves narrative presentation closed', !(await page.locator('#narrative-intermission').isVisible()));
      await phase('linked-no-llm-reload');
      await page.reload({ waitUntil: 'load', timeout: 20_000 });
      await wait(() => document.documentElement.dataset.ready === 'true', undefined, 30_000, 'No LLM reload ready');
      const reloaded = await inspect('linked-no-llm-reloaded');
      await wait((previousTick) => Number(document.querySelector('#app')?.getAttribute('data-simulation-tick')) > previousTick,
        reloaded.tick, 30_000, 'No LLM reload advances');
      check('Actual No LLM reload advances with no creative worker or model call', reloaded.mode === 'deterministic'
        && eventCount('created') === 0 && eventCount('sent') === 0);
      check('Actual No LLM reload retains the exact journal', JSON.stringify(reloaded.journal) === JSON.stringify(report.resumeStorage.journal));
    }
    check('No external download or inference request was attempted', report.blockedRequests.length === 0
      && report.requests.every((request) => new URL(request.url).origin === origin));
    check('No application JavaScript error occurred', report.errors.length === 0);
    for (const source of report.sources) check(`Source unchanged: ${source.file}`, sha(await readFile(resolve(repo, source.file))) === source.sha256);
    check('Built entry unchanged throughout journey', sha(await readFile(resolve(dist, 'assets', entry))) === expectedSha);
    if (prior !== null) check('Linked prior receipt remains unchanged', sha(await readFile(resolve(root, resumeName))) === sha(priorBytes));
    if (ancestor !== null) check('Original actual-story receipt remains unchanged',
      sha(await readFile(resolve(root, prior.linkedEvidence.file))) === sha(ancestorBytes));
    report.complete = true; await phase('journey-passed');
  };

  const heartbeat = setInterval(() => log({ phase: report.phase, elapsedMs: Date.now() - started,
    checks: report.checks.length, actualWrites: eventCount('sent', 'write') }), 30_000);
  try { await timed(execute(), runWorkDeadlineMs, 'Entire actual application journey'); }
  catch (error) {
    cancelled = true; report.complete = false;
    report.errors.push({ phase: report.phase, message: String(error) }); process.exitCode = 1;
  } finally {
    cancelled = true; clearInterval(heartbeat);
    const cleanupWatchdog = setTimeout(() => {
      report.complete = false; report.phase = 'cleanup-watchdog'; report.elapsedMs = Date.now() - started;
      report.errors.push({ phase: 'cleanup', message: 'Owned cleanup exceeded25s; Playwright process exit hooks terminate only owned browser groups. Closure unconfirmed.' });
      try { writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n'); }
      finally { log({ reportPath, cleanup: report.cleanup }); process.exit(1); }
    }, cleanupDeadlineMs);
    if (context) {
      await timed(context.close(), 15_000, 'Owned browser cleanup').then(() => {
        report.cleanup.contextClosed = report.cleanup.browserClosed = true;
        report.cleanup.creativeWorkersClosed = true; activeCreativeWorkers.clear();
      }).catch((error) => report.errors.push({ phase: 'cleanup', message: String(error) }));
    } else report.cleanup.contextClosed = report.cleanup.browserClosed = report.cleanup.creativeWorkersClosed = true;
    if (server) {
      server.closeAllConnections();
      await timed(new Promise((accept) => server.close(accept)), 5_000, 'Owned server cleanup')
        .then(() => { report.cleanup.serverClosed = true; })
        .catch((error) => report.errors.push({ phase: 'cleanup', message: String(error) }));
    } else report.cleanup.serverClosed = true;
    if (!Object.values(report.cleanup).every(Boolean)) { report.complete = false; process.exitCode = 1; }
    report.elapsedMs = Date.now() - started; report.phaseCount = phaseOrdinal;
    await checkpoint(); log({ reportPath, complete: report.complete, checks: report.checks.length,
      actualWrites: eventCount('sent', 'write'), screenshots: report.screenshots, cleanup: report.cleanup });
    clearTimeout(cleanupWatchdog);
    if (!report.cleanup.browserClosed) process.exit(1);
  }
  return reportPath;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runWebgpuGame().catch((error) => { log(String(error)); process.exitCode = 1; });
}
