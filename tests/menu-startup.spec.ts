import { expect as baseExpect, test, type Locator, type Page } from "@playwright/test";
import {
  creativeWriterCacheName,
  creativeWriterModelId,
  creativeWriterModelRevision,
} from "../src/narrator/creative-writer-client";
import { playModePreferenceKey } from "../src/ui/play-mode-preferences";

const expect = baseExpect.configure({ timeout: 20_000 });
test.describe.configure({ timeout: 150_000 });

type StartupSmoke = {
  workers: number;
  loads: boolean[];
  writes: number;
  terminations: number;
  failedLoadsLeft: number;
};

// The production application and startup coordinator run unchanged. Only creative
// inference is replaced; tiny cache entries below prove discovery, not model quality.
async function installWorkerFixture(page: Page, failedLoads = 0) {
  const modelRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on("request", (request) => {
    if (/huggingface|local-narrator|creative-writer|SmolLM|ort-wasm/iu.test(request.url())) modelRequests.push(request.url());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript((failedLoadsLeft) => {
    const state: StartupSmoke = { workers: 0, loads: [], writes: 0, terminations: 0, failedLoadsLeft };
    Object.assign(window, { __menuStartupSmoke: state });
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 8 });
    Object.defineProperty(navigator, "deviceMemory", { value: 8 });
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, {
      construct(target, args) {
        if ((args[1] as WorkerOptions | undefined)?.name !== "the-grind-2:creative-writer") {
          return Reflect.construct(target, args);
        }
        state.workers += 1;
        return new class extends EventTarget {
          postMessage(message: { type: string; id: number; cacheOnly?: boolean }) {
            if (message.type === "load") {
              state.loads.push(message.cacheOnly === true);
              const failed = state.failedLoadsLeft > 0;
              if (failed) state.failedLoadsLeft -= 1;
              queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", {
                data: { type: failed ? "error" : "ready", id: message.id },
              })));
            } else if (message.type === "direct") {
              queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", {
                data: { type: "direction", id: message.id, choice: "1" },
              })));
            } else if (message.type === "write") {
              // Hold the draft so no synthetic prose intermission interrupts menu checks.
              state.writes += 1;
            }
          }
          terminate() { state.terminations += 1; }
        }();
      },
    });
  }, failedLoads);
  await page.emulateMedia({ reducedMotion: "reduce" });
  return { modelRequests, pageErrors };
}

async function counts(page: Page) {
  return page.evaluate(() => {
    const state = (window as unknown as { __menuStartupSmoke: StartupSmoke }).__menuStartupSmoke;
    return { workers: state.workers, loads: state.loads, writes: state.writes, terminations: state.terminations };
  });
}

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 30_000 });
}

async function freshGame(page: Page): Promise<void> {
  await page.goto("./?fast");
  await ready(page);
  await expect(page.locator("#play-start-dialog")).toBeVisible();
}

async function openMenu(page: Page): Promise<void> {
  const trigger = await page.locator("#stage-menu-button").isVisible()
    ? page.locator("#stage-menu-button") : page.locator("#game-menu-button");
  await trigger.click();
  await expect(page.locator("#game-menu")).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
}

async function openOptions(page: Page): Promise<void> {
  await openMenu(page);
  await page.locator("#narrator-button").click();
  await expect(page.locator("#game-menu")).toBeHidden();
  await expect(page.locator("#narrator-dialog")).toBeVisible();
  await expect(page.locator("#narrator-advanced")).toHaveJSProperty("open", false);
}

async function expectBoundedDialog(page: Page, dialog: Locator): Promise<void> {
  expect(await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.left >= 0 && box.top >= 0 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1
      && element.scrollWidth <= element.clientWidth + 1
      && document.documentElement.scrollWidth <= innerWidth + 1;
  })).toBe(true);
  const controls = dialog.locator("button:visible, select:visible, summary:visible");
  for (let index = 0; index < await controls.count(); index++) {
    expect(await controls.nth(index).evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  }
  await expect(page.locator("#narrative-intermission")).toBeHidden();
}

async function capture(page: Page, name: string): Promise<void> {
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: `/tmp/the-grind-2-${name}.png` });
  }
}

async function seedCompleteCache(page: Page): Promise<void> {
  const root = `https://huggingface.co/${creativeWriterModelId}/resolve/${creativeWriterModelRevision}/`;
  const urls = [
    ...["config.json", "generation_config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"]
      .map((file) => root + file),
    "https://the-grind-2.invalid/creative-writer-runtime/ort-wasm-simd-threaded.asyncify.mjs",
    "https://the-grind-2.invalid/creative-writer-runtime/ort-wasm-simd-threaded.asyncify.wasm",
  ];
  await page.evaluate(async ({ name, urls }) => {
    const cache = await caches.open(name);
    await Promise.all(urls.map((url) => cache.put(url, new Response("startup cache-discovery fixture"))));
  }, { name: creativeWriterCacheName, urls });
}

test("fresh startup offers two clear choices and No LLM keeps desktop and mobile menus model-free", async ({ page }) => {
  const traffic = await installWorkerFixture(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await freshGame(page);
  const welcome = page.locator("#play-start-dialog");
  await expect(welcome.getByRole("button")).toHaveCount(2);
  await expect(welcome.getByRole("button", { name: "Play with LLM", exact: true })).toBeVisible();
  await expect(welcome.getByRole("button", { name: "Play without LLM", exact: true })).toBeVisible();
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "true");
  expect(await counts(page)).toEqual({ workers: 0, loads: [], writes: 0, terminations: 0 });
  await expectBoundedDialog(page, welcome);
  await capture(page, "play-start-1280");
  await page.setViewportSize({ width: 320, height: 568 });
  await expectBoundedDialog(page, welcome);
  await capture(page, "play-start-320");
  await page.locator("#play-start-deterministic").click();
  await expect(welcome).toBeHidden();
  await expect(page.locator("#app")).toHaveAttribute("data-play-mode", "deterministic");
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "false");
  await openMenu(page);
  await expectBoundedDialog(page, page.locator("#game-menu"));
  await capture(page, "game-menu-320");
  await expect(page.locator("#narrator-button")).toHaveText("Options");
  await page.locator("#narrator-button").click();
  await expect(page.locator("#narrator-dialog")).toBeVisible();
  await expect(page.locator("#narrator-advanced")).toHaveJSProperty("open", false);
  await expect(page.locator("#play-mode-select")).toHaveValue("deterministic");
  await expect(page.locator("#play-mode-retry")).toBeHidden();
  await expect(page.locator("#play-mode-disclosure")).toContainText("165 MB");
  await expectBoundedDialog(page, page.locator("#narrator-dialog"));
  await capture(page, "game-options-320");
  await page.setViewportSize({ width: 1280, height: 800 });
  await expectBoundedDialog(page, page.locator("#narrator-dialog"));
  await capture(page, "game-options-1280");
  await page.locator("#narrator-close").click();
  await expect(page.locator("#narrator-dialog")).toBeHidden();
  expect(await counts(page)).toEqual({ workers: 0, loads: [], writes: 0, terminations: 0 });
  expect(traffic).toEqual({ modelRequests: [], pageErrors: [] });
});

test("remembered No LLM skips startup on reload while a new hero reprompts without losing manual pause", async ({ page }) => {
  const traffic = await installWorkerFixture(page);
  await page.setViewportSize({ width: 960, height: 640 });
  await freshGame(page);
  await page.locator("#play-start-deterministic").click();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), playModePreferenceKey))
    .toEqual({ schemaVersion: 1, mode: "deterministic" });
  await page.reload();
  await ready(page);
  await expect(page.locator("#app")).toHaveAttribute("data-play-mode", "deterministic");
  await expect(page.locator("#play-start-dialog")).toBeHidden();
  await page.locator("#stage-pause-button").click();
  await expect(page.locator("#stage-pause-button")).toHaveText("Resume");
  const oldCampaign = await page.evaluate(() => sessionStorage.getItem("the-grind-2:activeCampaignId"));
  await openMenu(page);
  await page.locator("#new-button").click();
  await expect(page.locator("#play-start-dialog")).toBeVisible();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("the-grind-2:activeCampaignId"))).not.toBe(oldCampaign);
  await page.locator("#play-start-deterministic").click();
  await expect(page.locator("#play-start-dialog")).toBeHidden();
  await expect(page.locator("#stage-pause-button")).toHaveText("Resume");
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "true");
  const pausedTick = await page.locator("#app").getAttribute("data-simulation-tick");
  await page.waitForTimeout(300);
  await expect(page.locator("#app")).toHaveAttribute("data-simulation-tick", pausedTick!);
  expect(await counts(page)).toEqual({ workers: 0, loads: [], writes: 0, terminations: 0 });
  expect(traffic).toEqual({ modelRequests: [], pageErrors: [] });
});

test("explicit LLM play starts writing automatically and a remembered complete cache restores cache-only", async ({ page }) => {
  const traffic = await installWorkerFixture(page);
  await page.setViewportSize({ width: 960, height: 640 });
  await freshGame(page);
  expect((await counts(page)).workers).toBe(0);
  await page.locator("#play-start-llm").click();
  await expect(page.locator("#play-start-dialog")).toBeHidden();
  await expect(page.locator("#app")).toHaveAttribute("data-play-mode", "llm");
  await expect.poll(async () => (await counts(page)).writes).toBe(1);
  expect(await counts(page)).toMatchObject({ workers: 1, loads: [false], writes: 1 });
  await expect(page.locator("#creative-story-write")).toHaveCount(0);
  await seedCompleteCache(page);
  await page.reload();
  await ready(page);
  await expect(page.locator("#app")).toHaveAttribute("data-play-mode", "llm");
  await expect(page.locator("#play-start-dialog")).toBeHidden();
  await expect.poll(async () => (await counts(page)).loads).toEqual([true]);
  await expect.poll(async () => (await counts(page)).writes).toBe(1);
  expect((await counts(page)).workers).toBe(1);
  await openOptions(page);
  await expect(page.locator("#play-mode-select")).toHaveValue("llm");
  await expect(page.locator("#play-mode-status")).toContainText("written on this device");
  await page.locator("#narrator-close").click();
  await page.evaluate((name) => caches.delete(name), creativeWriterCacheName);
  await page.reload();
  await ready(page);
  await expect(page.locator("#play-start-dialog")).toBeVisible();
  await expect(page.locator("#play-start-cache")).toContainText("First use downloads");
  expect(await counts(page)).toEqual({ workers: 0, loads: [], writes: 0, terminations: 0 });
  await page.locator("#play-start-deterministic").click();
  expect(traffic).toEqual({ modelRequests: [], pageErrors: [] });
});

test("a failed LLM load can be retried from the simple Options panel", async ({ page }) => {
  const traffic = await installWorkerFixture(page, 1);
  await page.setViewportSize({ width: 320, height: 568 });
  await freshGame(page);
  await page.locator("#play-start-llm").click();
  await expect(page.locator("#app")).toHaveAttribute("data-creative-story-state", "failed");
  await openOptions(page);
  await expect(page.locator("#play-mode-status")).toContainText("LLM is not running");
  await expect(page.locator("#play-mode-retry")).toBeVisible();
  await expectBoundedDialog(page, page.locator("#narrator-dialog"));
  await page.locator("#play-mode-retry").click();
  await expect(page.locator("#play-mode-retry")).toBeHidden();
  await expect(page.locator("#play-mode-status")).toContainText("written on this device");
  expect(await counts(page)).toMatchObject({ workers: 2, loads: [false, false] });
  await page.locator("#narrator-close").click();
  await expect.poll(async () => (await counts(page)).writes).toBe(1);
  await openOptions(page);
  await page.locator("#play-mode-select").selectOption("deterministic");
  await expect(page.locator("#app")).toHaveAttribute("data-creative-story-state", "off");
  await expect(page.locator("#play-mode-select")).toHaveValue("deterministic");
  await expect(page.locator("#play-mode-retry")).toBeHidden();
  expect(traffic).toEqual({ modelRequests: [], pageErrors: [] });
});
