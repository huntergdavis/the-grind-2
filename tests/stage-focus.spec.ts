import { expect, test } from "@playwright/test";

const preferenceKey = "the-grind-2:stage-focus:v1";

async function waitUntilReady(page: import("@playwright/test").Page): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
  if (await page.locator("#app").getAttribute("data-play-mode") === "choose") {
    await page.locator("#play-start-deterministic").click();
    await expect(page.locator("#play-start-dialog")).toBeHidden();
  }
}

async function openMenu(page: import("@playwright/test").Page): Promise<void> {
  const focused = await page.locator("#app").getAttribute("data-chrome-mode") === "focus"
    && await page.locator("#app").getAttribute("data-active-view") === "watch";
  await page.locator(focused ? "#stage-menu-button" : "#game-menu-button").click();
  await expect(page.locator("#game-menu")).toBeVisible();
}

test("adapts an unoverridden Watch view between Panels and Stage Focus", async ({ page }) => {
  await page.addInitScript((key) => {
    if (sessionStorage.getItem("the-grind-2:stage-focus-test-initialized") !== null) return;
    localStorage.removeItem(key);
    sessionStorage.setItem("the-grind-2:stage-focus-test-initialized", "true");
  }, preferenceKey);
  await page.goto("./?fast");
  await waitUntilReady(page);

  const app = page.locator("#app");
  await expect(app).toHaveAttribute("data-chrome-mode", "panels");
  await expect(app).toHaveAttribute("data-chrome-preference", "responsive");
  await expect(page.locator("#topbar")).toBeVisible();
  await expect(page.locator("#stage-focus-ribbon")).toBeVisible();
  await expect(page.locator("#hero-hud")).toBeHidden();
  await page.locator("#pause-button").focus();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(app).toHaveAttribute("data-chrome-mode", "focus");
  await expect(page.locator("#stage-focus-controls")).toBeVisible();
  await expect(page.locator("#stage-focus-ribbon")).toBeVisible();
  await expect(page.locator("#topbar")).toBeHidden();
  await expect(page.locator("#stage-menu-button")).toBeFocused();
  await expect(page.locator("#stage-menu-button")).not.toHaveAttribute("aria-pressed", /.+/);
  await expect(page.locator("#stage-menu-button")).toHaveAttribute("aria-haspopup", "dialog");
  await expect(page.locator("#stage-menu-button")).toHaveAttribute("aria-controls", "game-menu");

  const compact = await page.evaluate(() => {
    const bounds = (selector: string): DOMRect | null => document.querySelector(selector)?.getBoundingClientRect() ?? null;
    const stage = bounds("#stage");
    const canvas = bounds("#stage canvas");
    const panels = bounds("#stage-menu-button");
    const pause = bounds("#stage-pause-button");
    const ribbon = bounds("#stage-focus-ribbon");
    const controls = bounds("#stage-focus-controls");
    return {
      viewport: [innerWidth, innerHeight],
      stage: stage === null ? null : [stage.left, stage.top, stage.width, stage.height],
      canvas: canvas === null ? null : [canvas.left, canvas.top, canvas.width, canvas.height],
      panels: panels === null ? null : [panels.width, panels.height],
      pause: pause === null ? null : [pause.width, pause.height],
      stageTop: stage?.top ?? -1,
      stageBottom: stage?.bottom ?? Infinity,
      ribbonTop: ribbon?.top ?? -1,
      controlsBottom: controls?.bottom ?? Infinity,
      pageFits: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
    };
  });
  expect(compact.stage?.[0]).toBe(0);
  expect(compact.stage?.[2]).toBe(compact.viewport[0]);
  expect(compact.stage?.[3]).toBeGreaterThan(0);
  expect(compact.stageTop).toBeGreaterThanOrEqual(compact.controlsBottom);
  expect(compact.stageBottom).toBeLessThanOrEqual(compact.ribbonTop);
  expect(compact.canvas).toEqual(compact.stage);
  expect(compact.panels?.[0]).toBeGreaterThanOrEqual(44);
  expect(compact.panels?.[1]).toBeGreaterThanOrEqual(44);
  expect(compact.pause?.[0]).toBeGreaterThanOrEqual(44);
  expect(compact.pause?.[1]).toBeGreaterThanOrEqual(44);
  expect(compact.pageFits).toBe(true);

  for (const tablet of [
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(tablet);
    await expect(app).toHaveAttribute("data-chrome-mode", "focus");
    await expect(page.locator("#stage")).toBeVisible();
    await expect(page.locator("#topbar")).toBeHidden();
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(app).toHaveAttribute("data-chrome-mode", "panels");
  await expect(page.locator("#topbar")).toBeVisible();

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(app).toHaveAttribute("data-chrome-mode", "focus");
  const landscape = await page.evaluate(() => {
    const stage = document.querySelector("#stage")?.getBoundingClientRect();
    const ribbon = document.querySelector("#stage-focus-ribbon")?.getBoundingClientRect();
    const controls = document.querySelector("#stage-focus-controls")?.getBoundingClientRect();
    return stage === undefined || ribbon === undefined || controls === undefined ? null : {
      stageBottom: stage.bottom,
      ribbonTop: ribbon.top,
      controlsRight: controls.right,
      controlsBottom: controls.bottom,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    };
  });
  expect(landscape).not.toBeNull();
  expect(landscape?.stageBottom).toBeLessThanOrEqual(landscape?.ribbonTop ?? 0);
  expect(landscape?.controlsRight).toBeLessThanOrEqual(landscape?.viewportWidth ?? 0);
  expect(landscape?.controlsBottom).toBeLessThanOrEqual(landscape?.viewportHeight ?? 0);
});

test("keeps Stage Focus truthful, escapable, persistent, and presentation-only", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript((key) => {
    if (sessionStorage.getItem("the-grind-2:stage-focus-test-initialized") !== null) return;
    localStorage.removeItem(key);
    sessionStorage.setItem("the-grind-2:stage-focus-test-initialized", "true");
  }, preferenceKey);
  await page.goto("./?fast");
  await waitUntilReady(page);

  const app = page.locator("#app");
  await expect(app).toHaveAttribute("data-chrome-mode", "focus");
  await expect(page.locator("#stage-focus-hero")).not.toHaveText("");
  await expect(page.locator("#stage-focus-resources")).not.toHaveText("");
  await expect(page.locator("#stage-focus-quest")).not.toHaveText("");
  await expect(page.locator("#stage-focus-headline")).not.toHaveText("");
  await expect(page.locator("#watch-hero-health-text")).toBeVisible();
  await expect(page.locator("#watch-hero-mana-text")).toBeVisible();

  const parity = await page.evaluate(() => {
    const text = (selector: string): string => document.querySelector(selector)?.textContent ?? "";
    return {
      hero: text("#stage-focus-hero"),
      heroName: text("#hero-name"),
      heroLevel: text("#hero-level"),
      heroRole: text("#watch-hero-role"),
      visibleHealth: text("#watch-hero-health-text"),
      visibleMana: text("#watch-hero-mana-text"),
      resources: text("#stage-focus-resources"),
      health: text("#hero-health-text").replaceAll(" ", ""),
      mana: text("#hero-mana-text").replaceAll(" ", ""),
      objective: text("#stage-focus-objective"),
      objectiveProgress: text("#stage-focus-objective-progress"),
      firstObjective: text("#quest-objectives li[data-complete='false']"),
      headline: text("#stage-focus-headline"),
      location: text("#scene-location"),
      sceneHeadline: text("#scene-headline"),
      action: text("#stage-focus-action"),
      sceneAction: text("#scene-action"),
      traversal: text("#traversal-directive"),
      consequence: text("#scene-consequence"),
      chronicle: {
        live: document.querySelector("#chronicle")?.getAttribute("aria-live"),
        atomic: document.querySelector("#chronicle")?.getAttribute("aria-atomic"),
      },
      chronicleLive: {
        live: document.querySelector("#chronicle-live")?.getAttribute("aria-live"),
        atomic: document.querySelector("#chronicle-live")?.getAttribute("aria-atomic"),
      },
    };
  });
  expect(parity.hero).toBe(parity.heroName);
  expect(parity.heroRole).toBe(`Hero · L${parity.heroLevel.match(/Level (\d+)/u)?.[1]}`);
  expect(parity.resources).toBe(`HP ${parity.health} · MP ${parity.mana}`);
  expect(parity.visibleHealth).toBe(`HP ${parity.health}`);
  expect(parity.visibleMana).toBe(`MP ${parity.mana}`);
  if (parity.firstObjective.length > 0) {
    expect(parity.firstObjective).toContain(parity.objective);
    expect(parity.firstObjective).toContain(parity.objectiveProgress);
  } else {
    expect(parity.objective).toBe("All current objectives complete");
    expect(parity.objectiveProgress).toBe("DONE");
  }
  expect(parity.headline).toBe(`${parity.location} · ${parity.sceneHeadline}`);
  for (const exactFact of [parity.sceneAction, parity.traversal, parity.consequence].filter(Boolean)) {
    expect(parity.action).toContain(exactFact);
  }
  expect(parity.chronicle).toEqual({ live: null, atomic: null });
  expect(parity.chronicleLive).toEqual({ live: "polite", atomic: "true" });

  await page.locator("#stage-focus-hero").evaluate((element) => {
    element.textContent = "Alexandria of the Seventh Forgotten Watchtower";
  });
  const nameLayout = await page.evaluate(() => {
    const name = document.querySelector("#stage-focus-hero")?.getBoundingClientRect();
    const card = document.querySelector("#watch-hero-card")?.getBoundingClientRect();
    return name === undefined || card === undefined ? null : {
      nameLeft: name.left,
      nameRight: name.right,
      cardLeft: card.left,
      cardRight: card.right,
      visible: name.width > 0 && name.height > 0,
    };
  });
  expect(nameLayout).not.toBeNull();
  expect(nameLayout?.visible).toBe(true);
  expect(nameLayout?.nameLeft).toBeGreaterThanOrEqual(nameLayout?.cardLeft ?? 0);
  expect(nameLayout?.nameRight).toBeLessThanOrEqual(nameLayout?.cardRight ?? 0);

  const initialTick = await page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    const raw = campaignId === null ? null : sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    return raw === null ? -1 : (JSON.parse(raw) as { tick: number }).tick;
  });
  await page.waitForFunction((tick) => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    const raw = campaignId === null ? null : sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    return raw !== null && (JSON.parse(raw) as { tick: number }).tick > tick;
  }, initialTick, { timeout: 15_000 });

  await page.locator("#stage-pause-button").click();
  await expect(app).toHaveAttribute("data-presentation-paused", "true");
  const campaignBefore = await page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    return campaignId === null ? null : sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
  });
  await openMenu(page);
  await page.locator("#stage-panels-button").click();
  await expect(page.locator("#stage-panels-drawer")).toBeVisible();
  await expect(app).toHaveAttribute("data-chrome-mode", "focus");
  await expect(page.locator("#stage-panels-close")).toBeFocused();
  expect(await page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    return campaignId === null ? null : sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
  })).toBe(campaignBefore);

  await page.keyboard.press("Escape");
  await expect(page.locator("#stage-panels-drawer")).toBeHidden();
  await expect(page.locator("#stage-menu-button")).toBeFocused();
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBeNull();

  await page.keyboard.press("Escape");
  await expect(app).toHaveAttribute("data-chrome-mode", "panels");
  await expect(page.locator("#game-menu-button")).toBeFocused();
  await expect(page.locator("#view-toolbar")).toBeHidden();
  await expect(page.locator("#stage-focus-ribbon")).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe("panels");

  await page.locator("#watch-character-details").click();
  await expect(page.locator("#stage-panels-drawer")).toBeVisible();
  await expect(page.locator("#hero-hud")).toBeVisible();
  await page.locator('#stage-panels-drawer .view-button[data-view="map"]').click();
  await expect(app).toHaveAttribute("data-active-view", "map");
  await page.locator("#stage-focus-button").click();
  await expect(app).toHaveAttribute("data-active-view", "watch");
  await expect(app).toHaveAttribute("data-chrome-mode", "focus");
  await expect(page.locator("#stage-focus-button")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(app).toHaveAttribute("data-chrome-mode", "panels");
  await expect(page.locator("#game-menu-button")).toBeFocused();

  await page.locator("#stage-focus-button").click();
  await expect(app).toHaveAttribute("data-chrome-mode", "focus");
  await expect(page.locator("#stage-focus-button")).toBeFocused();
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe("focus");

  await page.reload();
  await waitUntilReady(page);
  await expect(app).toHaveAttribute("data-chrome-mode", "focus");
  await expect(app).toHaveAttribute("data-chrome-preference", "explicit");
  await expect(page.locator("#stage-focus-controls")).toBeVisible();
});
