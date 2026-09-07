import { expect, test, type Page } from "@playwright/test";

const preferenceKey = "the-grind-2:stage-focus:v1";

async function waitUntilReady(page: Page): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
  await page.locator("#play-start-deterministic").click();
  await expect(page.locator("#play-start-dialog")).toBeHidden();
}

async function savedCampaign(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    return campaignId === null ? null : sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
  });
}

async function expectFullAdventure(page: Page): Promise<void> {
  const adventure = page.locator("#adventure-view");
  for (const selector of [
    "#vitals-title", "#hero-health-bar", "#hero-mana-bar", "#hero-xp-bar",
    "#hero-growth-summary", ".derived-stat-strip", "#character-attributes > summary",
    "#quest-summary", "#quest-objectives", ".traversal-card", "#open-status-log",
    "#scene-location", "#scene-headline", "#scene-action", ".chronicle .decision-row",
  ]) {
    const fact = adventure.locator(selector);
    await fact.scrollIntoViewIfNeeded();
    await expect(fact, `${selector} remains readable in Adventure`).toBeVisible();
  }
  await expect(adventure.locator("#equipment-list, #ability-list, #gear-summary, #ability-summary")).toHaveCount(0);
  const attributes = adventure.locator("#character-attributes");
  await expect(attributes).not.toHaveAttribute("open");
  await expect(attributes.locator(".stat-grid")).toBeHidden();
  await attributes.locator("summary").click();
  await expect(attributes.locator(".stat-grid")).toBeVisible();
  await expect(attributes.locator(".stat-grid dd")).toHaveCount(6);
  await attributes.locator("summary").click();
  const objectives = await adventure.locator("#quest-objectives > li").evaluateAll((items) =>
    items.map((item) => getComputedStyle(item).display !== "none" && item.getClientRects().length > 0));
  expect(objectives.length).toBeGreaterThan(0);
  expect(objectives.every(Boolean)).toBe(true);
}

async function expectControlTargets(page: Page): Promise<void> {
  const controls = await page.locator("#adventure-view button, #adventure-view select, #adventure-view summary, #view-toolbar button, #inspection-screen [data-close-view]")
    .evaluateAll((items) => items.flatMap((item) => {
      const bounds = item.getBoundingClientRect();
      return bounds.width === 0 || bounds.height === 0 ? [] : [{ width: bounds.width, height: bounds.height }];
    }));
  expect(controls.length).toBeGreaterThanOrEqual(8);
  expect(controls.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
}

test("Adventure is a normal tab without interrupting play or changing saved preferences", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((key) => localStorage.removeItem(key), preferenceKey);
  await page.goto("./?fast");
  await waitUntilReady(page);
  const app = page.locator("#app");
  const adventure = page.locator("#adventure-view");
  const content = page.locator("#inspection-screen");
  const tab = page.locator('.view-button[data-view="adventure"]');
  const initialTick = Number(await app.getAttribute("data-simulation-tick"));
  await page.locator("#watch-character-details").click();
  await expect(app).toHaveAttribute("data-active-view", "adventure");
  await expect(adventure).toBeVisible();
  await expect(tab).toHaveAttribute("aria-pressed", "true");
  await expect(tab).toBeFocused();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("#view-toolbar .view-button")).toHaveCount(8);
  await expectFullAdventure(page);
  await expectControlTargets(page);
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBeNull();
  expect(await adventure.evaluate((element) => ["hero-hud", "chronicle"].every((id) => document.querySelector(`#${id}`)?.parentElement === element))).toBe(true);

  // The normal roving toolbar replaces a dialog's keyboard trap.
  await tab.focus();
  await tab.press("End");
  await expect(page.locator('.view-button[data-view="hall"]')).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.locator('.view-button[data-view="watch"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(app).toHaveAttribute("data-active-view", "watch");
  await page.locator("#watch-character-details").click();
  await expect(adventure).toBeVisible();
  await page.waitForFunction((tick) => Number(document.querySelector("#app")?.getAttribute("data-simulation-tick")) > tick,
    initialTick, { timeout: 20_000 });
  await page.locator("#pause-button").click();
  await expect(app).toHaveAttribute("data-presentation-paused", "true", { timeout: 20_000 });
  const beforeInspection = await savedCampaign(page);
  expect(beforeInspection).not.toBeNull();
  for (const [view, selector] of Object.entries({
    map: "#map-inspector", inventory: "#inventory-view", journal: "#journal-view",
    codex: "#codex-view", spellbook: "#spellbook-view", hall: "#hall-view", adventure: "#adventure-view",
  })) {
    await page.locator(`.view-button[data-view="${view}"]`).click();
    await expect(app).toHaveAttribute("data-active-view", view);
    await expect(page.locator(selector)).toBeVisible();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
  }
  await page.locator('.view-button[data-view="journal"]').click();
  const rememberedScroll = await content.evaluate((element) => {
    element.scrollTop = Math.min(220, element.scrollHeight - element.clientHeight);
    return element.scrollTop;
  });
  expect(rememberedScroll).toBeGreaterThan(0);
  await page.locator('.view-button[data-view="inventory"]').click();
  await page.locator('.view-button[data-view="journal"]').click();
  await expect.poll(async () => content.evaluate((element) => element.scrollTop)).toBe(rememberedScroll);
  await page.keyboard.press("Escape");
  await expect(content).toBeHidden();
  await expect(app).toHaveAttribute("data-active-view", "watch");
  await expect(app).toHaveAttribute("data-chrome-mode", "focus");
  await expect(page.locator("#stage-focus-ribbon")).toBeVisible();
  expect(await savedCampaign(page)).toBe(beforeInspection);
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBeNull();
});

test("Adventure remains selected and readable across text zoom and responsive layouts", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript((key) => localStorage.removeItem(key), preferenceKey);
  await page.goto("./?fast");
  await waitUntilReady(page);
  await page.locator("#watch-character-details").click();
  const app = page.locator("#app");
  const adventure = page.locator("#adventure-view");
  const content = page.locator("#inspection-screen");
  const originalHud = await page.locator("#hero-hud").elementHandle();
  if (originalHud === null) throw new Error("Adventure needs the canonical character node");
  for (const [width, height, textSize] of [
    [320, 568, "200%"], [844, 390, "100%"], [768, 540, "100%"],
    [768, 1024, "100%"], [1280, 800, "100%"],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate((size) => { document.documentElement.style.fontSize = size; }, textSize);
    await expect(app).toHaveAttribute("data-active-view", "adventure");
    await expect(adventure).toBeVisible();
    await expectFullAdventure(page);
    await expectControlTargets(page);
    const layout = await content.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { fits: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
        contentFits: element.scrollWidth <= element.clientWidth + 1,
        pageFits: document.documentElement.scrollWidth <= innerWidth + 1,
        overflowY: getComputedStyle(element).overflowY };
    });
    expect(layout).toEqual({ fits: true, contentFits: true, pageFits: true, overflowY: "auto" });
    expect(await originalHud.evaluate((node) => node === document.querySelector("#hero-hud")
      && node.parentElement === document.querySelector("#adventure-view"))).toBe(true);
    if (process.env.TG2_VISUAL_CAPTURE === "1") {
      await page.screenshot({ path: `/tmp/the-grind-2-adventure-${width}-${height}-${textSize.replace("%", "")}.png`, fullPage: true });
    }
  }
  await page.locator('.view-button[data-view="watch"]').click();
  await expect(adventure).toBeHidden();
  await expect(app).toHaveAttribute("data-chrome-mode", "panels");
  await expect(page.locator("#view-toolbar")).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBeNull();
});
