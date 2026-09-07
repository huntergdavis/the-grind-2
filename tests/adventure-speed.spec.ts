import { expect as baseExpect, test, type Page } from "@playwright/test";

const expect = baseExpect.configure({ timeout: 15_000 });
const speedKey = "the-grind-2:adventure-speed:v1";
const playModeKey = "the-grind-2:play-mode:v1";
type IntervalReceipt = { id: number; delay: number; cleared: boolean; fires: number };
type SpeedProbe = { intervals: IntervalReceipt[]; modelWorkers: string[] };

async function click(page: Page, selector: string): Promise<void> {
  await page.locator(selector).first().evaluate((element: HTMLElement) => element.click());
}

async function openMenu(page: Page): Promise<void> {
  await click(page, "#stage-menu-button:visible, #game-menu-button:visible");
  await expect(page.locator("#game-menu")).toBeVisible();
}

async function intervals(page: Page): Promise<IntervalReceipt[]> {
  return page.evaluate(() => (window as unknown as { __adventureSpeedProbe: SpeedProbe }).__adventureSpeedProbe.intervals);
}

test("adventure speed replaces its real timer, respects Pause, and persists without LLM startup", async ({ page }) => {
  test.setTimeout(120_000);
  const modelRequests: string[] = [];
  const pageErrors: string[] = [];
  const isModel = (url: string) => /huggingface|SmolLM|ort-wasm|(?:creative-writer|local-narrator|narrator)\.worker-/iu.test(url);
  page.on("request", (request) => { if (isModel(request.url())) modelRequests.push(request.url()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/*", (route) => isModel(route.request().url()) ? route.abort() : route.continue());
  await page.addInitScript(() => {
    const state: SpeedProbe = { intervals: [], modelWorkers: [] };
    Object.assign(window, { __adventureSpeedProbe: state });
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 8 });
    Object.defineProperty(navigator, "deviceMemory", { value: 8 });
    // Observe native calls only: no fake clock, callback omission, or simulation replacement.
    const nativeSet = window.setInterval.bind(window);
    const nativeClear = window.clearInterval.bind(window);
    window.setInterval = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      const receipt: IntervalReceipt = { id: 0, delay: Number(delay), cleared: false, fires: 0 };
      const wrapped = typeof handler === "function" ? (...callbackArgs: unknown[]) => {
        receipt.fires += 1;
        return Reflect.apply(handler, window, callbackArgs);
      } : handler;
      receipt.id = nativeSet(wrapped, delay, ...args);
      state.intervals.push(receipt);
      return receipt.id;
    }) as typeof window.setInterval;
    window.clearInterval = ((id?: number) => {
      const receipt = state.intervals.find((entry) => entry.id === id);
      if (receipt) receipt.cleared = true;
      nativeClear(id);
    }) as typeof window.clearInterval;
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, {
      construct(target, args) {
        const name = (args[1] as WorkerOptions | undefined)?.name ?? "";
        if (/creative-writer|narrator/u.test(name)) state.modelWorkers.push(name);
        return Reflect.construct(target, args);
      },
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 960, height: 640 });
  await page.goto("./", { waitUntil: "domcontentloaded" }); // Intentionally NOT ?fast.
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
  const app = page.locator("#app");
  await expect(app).toHaveAttribute("data-adventure-speed", "1");
  await expect(app).toHaveAttribute("data-adventure-step-ms", "4800");
  const original = (await intervals(page)).filter((entry) => entry.delay === 4_800 && !entry.cleared);
  expect(original).toHaveLength(1);
  await click(page, "#play-start-deterministic");
  await expect(page.locator("#play-start-dialog")).toBeHidden();
  await click(page, "#stage-pause-button:visible, #pause-button:visible");
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  const pausedTick = Number(await app.getAttribute("data-simulation-tick"));
  await openMenu(page);
  const select = page.locator("#adventure-speed-select");
  await expect(select).toHaveValue("1");
  expect(await select.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value)))
    .toEqual(["1", "2", "5", "10", "25", "50", "100"]);
  await select.selectOption("100");
  await expect(app).toHaveAttribute("data-adventure-speed", "100");
  await expect(app).toHaveAttribute("data-adventure-step-ms", "48");
  const atHundred = await intervals(page);
  expect(atHundred.find((entry) => entry.id === original[0]!.id)?.cleared).toBe(true);
  expect(atHundred.filter((entry) => entry.delay === 4_800 && !entry.cleared)).toEqual([]);
  const accelerated = atHundred.filter((entry) => entry.delay === 48 && !entry.cleared);
  expect(accelerated).toHaveLength(1);
  await expect.poll(async () => (await intervals(page)).find((entry) => entry.id === accelerated[0]!.id)?.fires ?? 0).toBeGreaterThanOrEqual(3);
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  await expect(app).toHaveAttribute("data-simulation-tick", String(pausedTick));
  await click(page, "#game-menu-close");
  await click(page, "#stage-pause-button:visible, #pause-button:visible");
  await expect.poll(async () => Number(await app.getAttribute("data-simulation-tick"))).toBeGreaterThan(pausedTick);
  const advancedTick = Number(await app.getAttribute("data-simulation-tick"));
  await click(page, "#stage-pause-button:visible, #pause-button:visible");
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  await openMenu(page);
  await select.selectOption("2");
  await expect(app).toHaveAttribute("data-adventure-speed", "2");
  await expect(app).toHaveAttribute("data-adventure-step-ms", "2400");
  const atTwo = await intervals(page);
  expect(atTwo.find((entry) => entry.id === accelerated[0]!.id)?.cleared).toBe(true);
  expect(atTwo.filter((entry) => entry.delay === 48 && !entry.cleared)).toEqual([]);
  expect(atTwo.filter((entry) => entry.delay === 2_400 && !entry.cleared)).toHaveLength(1);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), speedKey)).toEqual({ schemaVersion: 1, speed: 2 });
  await expect(page.locator("#adventure-speed-status")).toContainText("story reading and cutscenes keep their own pace");
  for (const viewport of [{ width: 960, height: 640 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    await select.scrollIntoViewIfNeeded();
    expect(await select.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const dialog = element.closest("dialog")!;
      const bounds = dialog.getBoundingClientRect();
      return box.height >= 44 && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
        && bounds.left >= 0 && bounds.right <= innerWidth + 1 && bounds.top >= 0 && bounds.bottom <= innerHeight + 1
        && dialog.scrollWidth <= dialog.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1
        && [...dialog.querySelectorAll("button, select")].every((control) => control.getBoundingClientRect().height >= 44);
    })).toBe(true);
    if (process.env.TG2_VISUAL_CAPTURE === "1") await page.screenshot({ path: `/tmp/the-grind-2-speed-${viewport.width}.png` });
  }
  const beforeReloadWorkers = await page.evaluate(() =>
    (window as unknown as { __adventureSpeedProbe: SpeedProbe }).__adventureSpeedProbe.modelWorkers);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
  await expect(page.locator("#play-start-dialog")).toBeHidden();
  await expect(app).toHaveAttribute("data-adventure-speed", "2");
  await expect(app).toHaveAttribute("data-adventure-step-ms", "2400");
  await expect(app).toHaveAttribute("data-play-mode", "deterministic");
  await expect(app).toHaveAttribute("data-creative-story-state", "off");
  await expect(select).toHaveValue("2");
  expect((await intervals(page)).filter((entry) => entry.delay === 2_400 && !entry.cleared)).toHaveLength(1);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), playModeKey)).toEqual({ schemaVersion: 1, mode: "deterministic" });
  expect(beforeReloadWorkers).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __adventureSpeedProbe: SpeedProbe }).__adventureSpeedProbe.modelWorkers)).toEqual([]);
  expect(modelRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
  await test.info().attach("adventure-speed-proof", {
    body: JSON.stringify({ original, accelerated, atTwo, pausedTick, advancedTick, restoredSpeed: 2,
      modelRequests, pageErrors, modelWorkers: beforeReloadWorkers }, null, 2), contentType: "application/json",
  });
});
