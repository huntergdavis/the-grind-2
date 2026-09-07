import { chromium } from '@playwright/test';
import { attachWorkerProfiler, summarizeWorkerProfile } from './worker-profile.mjs';

const started = Date.now();
let browser, profiler;
const watchdog = setTimeout(() => { void browser?.close(); }, 15000);
try {
  browser = await chromium.launch({ headless: true, timeout: 5000 });
  const page = await browser.newPage();
  await page.evaluate(() => {
    globalThis.profileFixture = new Worker(URL.createObjectURL(new Blob([
      'function fixtureCpuWork(){ const end=performance.now()+400; let n=0; while(performance.now()<end) n+=Math.sqrt(n+1); return n; } onmessage=()=>postMessage(fixtureCpuWork());',
    ], { type: 'text/javascript' })));
  });
  const worker = page.workers()[0] ?? await page.waitForEvent('worker', { timeout: 2000 });
  profiler = await attachWorkerProfiler(browser, worker.url());
  await profiler.start();
  await page.evaluate(() => new Promise(resolve => { profileFixture.onmessage = resolve; profileFixture.postMessage('work'); }));
  const profile = await profiler.stop();
  const summary = summarizeWorkerProfile(profile);
  if (!summary.topFrames.some(frame => frame.functionName === 'fixtureCpuWork' && frame.samples > 0)) throw new Error('Worker CPU samples did not resolve the fixture work function');
  console.log(JSON.stringify({ viable: true, modelLoaded: false, targetType: profiler.target.type, summary }));
} finally {
  await profiler?.close(); await browser?.close(); clearTimeout(watchdog);
  console.log(JSON.stringify({ browserClosed: true, totalMs: Date.now() - started }));
}
