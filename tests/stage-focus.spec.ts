import { expect, test } from "@playwright/test";

const preferenceKey = "the-grind-2:stage-focus:v1";

async function waitUntilReady(page: import("@playwright/test").Page): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
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
  await page.locator("#pause-button").focus();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(app).toHaveAttribute("data-chrome-mode", "focus");
  await expect(page.locator("#stage-focus-controls")).toBeVisible();
  await expect(page.locator("#stage-focus-ribbon")).toBeVisible();
  await expect(page.locator("#topbar")).toBeHidden();
  await expect(page.locator("#stage-panels-button")).toBeFocused();
  await expect(page.locator("#stage-panels-button")).not.toHaveAttribute("aria-pressed", /.+/);
  await expect(page.locator("#stage-panels-button")).toHaveAttribute("aria-expanded", "false");

  const compact = await page.evaluate(() => {
    const bounds = (selector: string): DOMRect | null => document.querySelector(selector)?.getBoundingClientRect() ?? null;
    const stage = bounds("#stage");
    const canvas = bounds("#stage canvas");
    const panels = bounds("#stage-panels-button");
    const pause = bounds("#stage-pause-button");
    return {
      viewport: [innerWidth, innerHeight],
      stage: stage === null ? null : [stage.left, stage.top, stage.width, stage.height],
      canvas: canvas === null ? null : [canvas.left, canvas.top, canvas.width, canvas.height],
      panels: panels === null ? null : [panels.width, panels.height],
      pause: pause === null ? null : [pause.width, pause.height],
      pageFits: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
    };
  });
  expect(compact.stage).toEqual([0, 0, compact.viewport[0], compact.viewport[1]]);
  expect(compact.canvas).toEqual([0, 0, compact.viewport[0], compact.viewport[1]]);
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

  const parity = await page.evaluate(() => {
    const text = (selector: string): string => document.querySelector(selector)?.textContent ?? "";
    return {
      hero: text("#stage-focus-hero"),
      heroName: text("#hero-name"),
      heroLevel: text("#hero-level"),
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
      chronicleLive: document.querySelector("#chronicle")?.getAttribute("aria-live"),
    };
  });
  expect(parity.hero).toContain(parity.heroName);
  expect(parity.hero).toContain(parity.heroLevel.split(" · ").slice(0, 2).join(" · "));
  expect(parity.resources).toBe(`HP ${parity.health} · MP ${parity.mana}`);
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
  expect(parity.chronicleLive).toBe("polite");

  await page.locator("#stage-focus-objective").evaluate((element) => {
    element.textContent = `${element.textContent ?? "Objective"} across the impossibly long western reaches beyond the seventh forgotten watchtower`;
  });
  const objectiveLayout = await page.evaluate(() => {
    const progress = document.querySelector("#stage-focus-objective-progress")?.getBoundingClientRect();
    const line = document.querySelector(".stage-focus-objective-line")?.getBoundingClientRect();
    return progress === undefined || line === undefined ? null : {
      progressLeft: progress.left,
      progressRight: progress.right,
      lineLeft: line.left,
      lineRight: line.right,
      visible: progress.width > 0 && progress.height > 0,
    };
  });
  expect(objectiveLayout).not.toBeNull();
  expect(objectiveLayout?.visible).toBe(true);
  expect(objectiveLayout?.progressLeft).toBeGreaterThanOrEqual(objectiveLayout?.lineLeft ?? 0);
  expect(objectiveLayout?.progressRight).toBeLessThanOrEqual(objectiveLayout?.lineRight ?? 0);

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
  await expect(page.locator("#stage-panels-button")).toBeFocused();
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBeNull();

  await page.keyboard.press("Escape");
  await expect(app).toHaveAttribute("data-chrome-mode", "panels");
  await expect(page.locator("#stage-focus-button")).toBeFocused();
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe("panels");

  await page.locator('.view-button[data-view="map"]').click();
  await expect(app).toHaveAttribute("data-active-view", "map");
  await page.locator("#stage-focus-button").click();
  await expect(app).toHaveAttribute("data-active-view", "watch");
  await expect(app).toHaveAttribute("data-chrome-mode", "focus");
  await expect(page.locator("#stage-panels-button")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(app).toHaveAttribute("data-chrome-mode", "panels");
  await expect(page.locator("#stage-focus-button")).toBeFocused();

  await page.locator("#stage-focus-button").click();
  await expect(app).toHaveAttribute("data-chrome-mode", "focus");
  await expect(page.locator("#stage-panels-button")).toBeFocused();
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe("focus");

  await page.reload();
  await waitUntilReady(page);
  await expect(app).toHaveAttribute("data-chrome-mode", "focus");
  await expect(app).toHaveAttribute("data-chrome-preference", "explicit");
  await expect(page.locator("#stage-focus-controls")).toBeVisible();
});
