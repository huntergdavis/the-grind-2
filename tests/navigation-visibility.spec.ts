import { expect as baseExpect, test, type Page } from "@playwright/test";
import { advanceWorld, createWorld } from "../src/core/simulation";

const expect = baseExpect.configure({ timeout: 10_000 });

async function tabIsFullyVisible(page: Page, view: string): Promise<boolean> {
  return page.locator("#view-toolbar").evaluate((toolbar, name) => {
    const tab = toolbar.querySelector<HTMLElement>(`[data-view="${name}"]`)!;
    const bounds = toolbar.getBoundingClientRect();
    const button = tab.getBoundingClientRect();
    const left = bounds.left + toolbar.clientLeft;
    const top = bounds.top + toolbar.clientTop;
    return button.width > 0 && button.height >= 44 && bounds.left >= 0 && bounds.right <= innerWidth + 1
      && button.left >= left - 1 && button.right <= left + toolbar.clientWidth + 1
      && button.top >= top - 1 && button.bottom <= top + toolbar.clientHeight + 1;
  }, view);
}

async function savedCampaign(page: Page, campaignId: string): Promise<string> {
  return page.evaluate((id) => {
    const saved = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
    if (saved === null) throw new Error("Navigation proof requires the canonical campaign mirror");
    return saved;
  }, campaignId);
}

test("horizontal navigation reveals shortcut and keyboard tabs without moving the reader or undoing manual scrolling", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  const inference: string[] = [];
  const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (modelUrl.test(request.url())) inference.push(request.url()); });
  page.on("worker", (worker) => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
  const mark = (phase: string) => {
    const now = new Date();
    const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Los_Angeles", dateStyle: "short", timeStyle: "medium" }).format(now);
    const zone = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", timeZoneName: "short" }).formatToParts(now).find((part) => part.type === "timeZoneName")!.value;
    console.log(`[${stamp} ${zone}] Navigation visibility: ${phase}`);
  };
  let world = createWorld("navigation-visibility", "campaign:navigation-visibility");
  for (let step = 0; step < 6; step += 1) world = advanceWorld(world);
  await page.addInitScript((saved) => {
    sessionStorage.setItem(`the-grind-2:campaign:${saved.campaignId}`, JSON.stringify(saved));
    sessionStorage.setItem("the-grind-2:activeCampaignId", saved.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${saved.campaignId}`, String(Date.now() + 3_600_000));
    localStorage.setItem("the-grind-2:play-mode:v1", '{"schemaVersion":1,"mode":"deterministic"}');
    localStorage.setItem("the-grind-2:adventure-speed:v1", '{"schemaVersion":1,"speed":1}');
    localStorage.setItem("the-grind-2:stage-focus:v1", "panels");
  }, world);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("./", { timeout: 25_000 });
  const app = page.locator("#app");
  const toolbar = page.locator("#view-toolbar");
  const screen = page.locator("#inspection-screen");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await expect(app).toHaveAttribute("data-play-mode", "deterministic");
  await page.locator("#pause-button").click();
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  const before = await savedCampaign(page, world.campaignId);
  await expect(toolbar.locator("[data-view]")).toHaveCount(8);
  await page.locator("#watch-character-details").click();
  await expect(app).toHaveAttribute("data-active-view", "adventure");
  await expect(toolbar.locator('[data-view="adventure"]')).toBeFocused();
  await expect.poll(() => tabIsFullyVisible(page, "adventure")).toBe(true);
  await page.locator("#open-status-log").click();
  await expect(app).toHaveAttribute("data-active-view", "journal");
  await expect(page.locator("#journal-status-button")).toBeFocused();
  await expect.poll(() => tabIsFullyVisible(page, "journal")).toBe(true);
  await expect.poll(() => screen.evaluate((element) => element.scrollTop)).toBe(0);
  mark("320px Character/Status shortcuts reveal their tab without stealing Status focus");

  // Focusing this already-visible tab enters the real toolbar keyboard handler.
  // No tab click or scrollIntoView is allowed to conceal a missing reveal.
  await toolbar.locator('[data-view="journal"]').focus();
  for (const [key, view] of [["ArrowRight", "codex"], ["End", "hall"], ["ArrowLeft", "spellbook"], ["Home", "watch"], ["ArrowRight", "adventure"]] as const) {
    const previous = await app.getAttribute("data-active-view");
    await page.keyboard.press(key);
    await expect(toolbar.locator(`[data-view="${view}"]`)).toBeFocused();
    await expect.poll(() => tabIsFullyVisible(page, view), { message: `${key} reveals the entire focused ${view} tab` }).toBe(true);
    await expect(app).toHaveAttribute("data-active-view", previous!);
    await page.keyboard.press("Enter");
    await expect(app).toHaveAttribute("data-active-view", view);
    await expect(toolbar.locator(`[data-view="${view}"]`)).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => tabIsFullyVisible(page, view)).toBe(true);
  }
  // A shortcut can run while its old Adventure tab still owns focus. Unlike
  // the native pointer path above, invoking the control must not first move
  // focus away and accidentally hide a retained-old-tab reveal bug.
  await expect(toolbar.locator('[data-view="adventure"]')).toBeFocused();
  await page.locator("#open-status-log").evaluate((button: HTMLButtonElement) => button.click());
  await expect(app).toHaveAttribute("data-active-view", "journal");
  await expect(page.locator("#journal-status-button")).toBeFocused();
  await expect.poll(() => tabIsFullyVisible(page, "journal")).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(() => tabIsFullyVisible(page, "journal")).toBe(true);
  await expect(page.locator("#journal-status-button")).toBeFocused();
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: testInfo.outputPath("navigation-journal-1280.png"), timeout: 8_000 });
  }
  // Keep a nonzero reading offset. Text reflow can change its exact pixel value
  // through native scroll anchoring; navigation must not reset this owner.
  const readingScroll = await screen.evaluate((element) => {
    element.scrollTop = 32;
    return element.scrollTop;
  });
  expect(readingScroll).toBe(32);
  await page.setViewportSize({ width: 320, height: 568 });
  await expect.poll(() => tabIsFullyVisible(page, "journal")).toBe(true);
  await expect(page.locator("#journal-status-button")).toBeFocused();
  const resizedScroll = await screen.evaluate((element) => element.scrollTop);
  expect(resizedScroll).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await savedCampaign(page, world.campaignId)).toBe(before);
  mark("native Arrow/Home/End activation and desktop-to-phone resize retain the reading owner, focus, and paused save");
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: testInfo.outputPath("navigation-journal-320.png"), timeout: 8_000 });
  }

  await toolbar.locator('[data-view="journal"]').evaluate((button: HTMLButtonElement) => button.focus({ preventScroll: true }));
  await page.keyboard.press("End");
  await expect.poll(() => tabIsFullyVisible(page, "hall")).toBe(true);
  expect(await screen.evaluate((element) => element.scrollTop)).toBe(resizedScroll);
  await toolbar.hover();
  await page.mouse.wheel(-1_000, 0);
  await expect.poll(() => toolbar.evaluate((element) => element.scrollLeft)).toBe(0);
  expect(await tabIsFullyVisible(page, "hall")).toBe(false);
  await page.keyboard.press("End");
  await expect(toolbar.locator('[data-view="hall"]')).toBeFocused();
  await expect.poll(() => tabIsFullyVisible(page, "hall")).toBe(true);
  await expect(app).toHaveAttribute("data-active-view", "journal");
  expect(await screen.evaluate((element) => element.scrollTop)).toBe(resizedScroll);
  mark("repeated End reveals the focused tab without activating it or moving the reader");

  await page.locator("#pause-button").click();
  await expect(app).toHaveAttribute("data-presentation-paused", "false");
  // Deliberately scroll away with native horizontal wheel input. Normal play
  // must not continuously force the active Journal tab back into view.
  await toolbar.hover();
  await page.mouse.wheel(-1_000, 0);
  await expect.poll(() => toolbar.evaluate((element) => element.scrollLeft)).toBe(0);
  expect(await tabIsFullyVisible(page, "journal")).toBe(false);
  const beforeLiveTick = Number(await app.getAttribute("data-simulation-tick"));
  await expect.poll(async () => Number(await app.getAttribute("data-simulation-tick")), { timeout: 20_000 }).toBeGreaterThan(beforeLiveTick);
  expect(await toolbar.evaluate((element) => element.scrollLeft)).toBe(0);
  await expect(app).toHaveAttribute("data-active-view", "journal");
  await page.locator("#pause-button").click();
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  const afterLive = await savedCampaign(page, world.campaignId);
  await toolbar.hover();
  await page.mouse.wheel(1_000, 0);
  await expect.poll(() => toolbar.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(await tabIsFullyVisible(page, "watch")).toBe(false);
  await page.locator("#stage-focus-button").click();
  await expect(app).toHaveAttribute("data-chrome-mode", "focus");
  await expect(app).toHaveAttribute("data-active-view", "watch");
  await expect(toolbar).toBeHidden();
  await expect(page.locator("#stage-focus-button")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(app).toHaveAttribute("data-chrome-mode", "panels");
  await expect(toolbar).toBeVisible();
  await expect.poll(() => tabIsFullyVisible(page, "watch")).toBe(true);
  await expect(page.locator("#stage-focus-button")).toBeFocused();
  expect(await savedCampaign(page, world.campaignId)).toBe(afterLive);
  await expect(app).toHaveAttribute("data-play-mode", "deterministic");
  await expect(app).toHaveAttribute("data-creative-story-state", "off");
  expect(errors).toEqual([]);
  expect(inference).toEqual([]);
  mark("live ticks respect manual horizontal scrolling; Focus restores a visible Watch tab without inference");
});
