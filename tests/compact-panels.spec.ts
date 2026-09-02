import { expect, test } from "@playwright/test";

const preferenceKey = "the-grind-2:stage-focus:v1";

async function waitUntilReady(page: import("@playwright/test").Page): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
}

async function savedCampaign(page: import("@playwright/test").Page): Promise<string | null> {
  return page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    return campaignId === null ? null : sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
  });
}

async function expectFullWatchPanels(page: import("@playwright/test").Page): Promise<void> {
  const drawer = page.locator("#stage-panels-drawer");
  for (const selector of [
    "#vitals-title",
    "#hero-health-bar",
    "#hero-mana-bar",
    "#hero-xp-bar",
    "#hero-growth-summary",
    "#gear-summary",
    "#ability-summary",
    "#quest-summary",
    "#quest-objectives",
    ".traversal-card",
    ".ability-card",
    ".equipment-card",
    ".log-card",
    "#scene-location",
    "#scene-headline",
    "#scene-action",
    ".chronicle .decision-row",
  ]) {
    const fact = drawer.locator(selector);
    const rendered = await fact.evaluate((element) => {
      element.scrollIntoView({ block: "nearest" });
      let ancestor: Element | null = element;
      let hiddenBy: string | null = null;
      while (ancestor !== null) {
        const style = getComputedStyle(ancestor);
        if (style.display === "none" || style.visibility === "hidden") {
          hiddenBy = ancestor.id === "" ? ancestor.className : `#${ancestor.id}`;
          break;
        }
        ancestor = ancestor.parentElement;
      }
      return { hiddenBy, rectangles: element.getClientRects().length };
    });
    expect(rendered.hiddenBy, `${selector} must not inherit compact suppression`).toBeNull();
    expect(rendered.rectangles, `${selector} must have rendered geometry`).toBeGreaterThan(0);
    await expect(fact).toBeVisible({ timeout: 2_000 });
  }

  const objectiveVisibility = await drawer.locator("#quest-objectives > li").evaluateAll((objectives) =>
    objectives.map((objective) => getComputedStyle(objective).display !== "none" && objective.getClientRects().length > 0),
  );
  expect(objectiveVisibility.length).toBeGreaterThan(0);
  expect(objectiveVisibility.every(Boolean)).toBe(true);
}

async function expectDrawerControlTargets(page: import("@playwright/test").Page): Promise<void> {
  const controlBounds = await page.locator("#stage-panels-drawer button, #stage-panels-drawer select").evaluateAll((controls) =>
    controls.flatMap((control) => {
      const bounds = control.getBoundingClientRect();
      return bounds.width === 0 || bounds.height === 0 ? [] : [{ width: bounds.width, height: bounds.height }];
    }),
  );
  expect(controlBounds.length).toBeGreaterThan(0);
  expect(controlBounds.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
}

test("opens one runtime-only panel drawer without interrupting the adventure", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((key) => localStorage.removeItem(key), preferenceKey);
  await page.goto("./?fast");
  await waitUntilReady(page);

  const app = page.locator("#app");
  const drawer = page.locator("#stage-panels-drawer");
  const content = page.locator("#stage-panels-content");
  const panels = page.locator("#stage-panels-button");
  const close = page.locator("#stage-panels-close");
  const initialTick = Number(await app.getAttribute("data-simulation-tick"));

  await panels.click();
  await expect(drawer).toBeVisible();
  await expect(app).toHaveAttribute("data-compact-panels-open", "true");
  await expect(app).toHaveAttribute("data-chrome-mode", "focus");
  await expect(panels).toHaveAttribute("aria-expanded", "true");
  await expect(close).toBeFocused();
  await expectFullWatchPanels(page);
  await expectDrawerControlTargets(page);
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBeNull();

  const hosted = await page.evaluate(() => {
    const contentNode = document.querySelector("#stage-panels-content");
    const ids = ["topbar", "view-toolbar", "spectator-inbox", "map-inspector", "inspection-screen", "hero-hud", "chronicle"];
    return ids.every((id) => document.querySelector(`#${id}`)?.parentElement === contentNode);
  });
  expect(hosted).toBe(true);

  for (let index = 0; index < 18; index += 1) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => {
      const active = document.activeElement;
      return active !== null && document.querySelector("#stage-panels-drawer")?.contains(active) === true;
    })).toBe(true);
  }
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => document.querySelector("#stage-panels-drawer")?.contains(document.activeElement) === true)).toBe(true);
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();

  await page.waitForFunction((tick) => Number(document.querySelector("#app")?.getAttribute("data-simulation-tick")) > tick, initialTick, { timeout: 20_000 });
  await page.locator("#pause-button").click();
  await expect(app).toHaveAttribute("data-presentation-paused", "true", { timeout: 20_000 });
  const beforeInspection = await savedCampaign(page);
  expect(beforeInspection).not.toBeNull();

  const views = {
    map: "#map-inspector",
    inventory: "#inventory-view",
    journal: "#journal-view",
    codex: "#codex-view",
    spellbook: "#spellbook-view",
    hall: "#hall-view",
  } as const;
  for (const [view, selector] of Object.entries(views)) {
    await page.locator(`.view-button[data-view="${view}"]`).click();
    await expect(app).toHaveAttribute("data-active-view", view);
    await expect(drawer.locator(selector)).toBeVisible();
    await expect(drawer).toBeVisible();
  }

  await page.locator('.view-button[data-view="journal"]').click();
  const rememberedScroll = await content.evaluate((element) => {
    const maximum = element.scrollHeight - element.clientHeight;
    element.scrollTop = Math.min(220, maximum);
    return element.scrollTop;
  });
  expect(rememberedScroll).toBeGreaterThan(0);
  await page.locator('.view-button[data-view="inventory"]').click();
  await page.locator('.view-button[data-view="journal"]').click();
  await page.waitForFunction((expected) => {
    const element = document.querySelector<HTMLElement>("#stage-panels-content");
    return element !== null && Math.abs(element.scrollTop - expected) <= 1;
  }, rememberedScroll);

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(app).not.toHaveAttribute("data-compact-panels-open", /.+/);
  await expect(app).toHaveAttribute("data-active-view", "watch");
  await expect(app).toHaveAttribute("data-chrome-mode", "focus");
  await expect(panels).toHaveAttribute("aria-expanded", "false");
  await expect(panels).toBeFocused();
  expect(await savedCampaign(page)).toBe(beforeInspection);
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBeNull();
});

test("contains zoomed compact panels and restores exact nodes when desktop returns", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript((key) => localStorage.removeItem(key), preferenceKey);
  await page.goto("./?fast");
  await waitUntilReady(page);

  const app = page.locator("#app");
  const drawer = page.locator("#stage-panels-drawer");
  await page.locator("#stage-panels-button").click();
  await expect(drawer).toBeVisible();
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: "/tmp/the-grind-2-compact-panels-320.png", fullPage: true });
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await expectFullWatchPanels(page);
  await expectDrawerControlTargets(page);

  const phone = await page.evaluate(() => {
    const dialog = document.querySelector("#stage-panels-drawer")?.getBoundingClientRect();
    const close = document.querySelector("#stage-panels-close")?.getBoundingClientRect();
    const content = document.querySelector<HTMLElement>("#stage-panels-content");
    return dialog === undefined || close === undefined || content === null ? null : {
      left: dialog.left,
      right: dialog.right,
      top: dialog.top,
      bottom: dialog.bottom,
      closeWidth: close.width,
      closeHeight: close.height,
      overflowY: getComputedStyle(content).overflowY,
    };
  });
  expect(phone).not.toBeNull();
  expect(phone?.left).toBeGreaterThanOrEqual(0);
  expect(phone?.right).toBeLessThanOrEqual(320);
  expect(phone?.top).toBeGreaterThanOrEqual(0);
  expect(phone?.bottom).toBeLessThanOrEqual(568);
  expect(phone?.closeWidth).toBeGreaterThanOrEqual(44);
  expect(phone?.closeHeight).toBeGreaterThanOrEqual(44);
  expect(phone?.overflowY).toBe("auto");

  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(drawer).toBeVisible();
  await expectFullWatchPanels(page);
  await expectDrawerControlTargets(page);
  const landscape = await drawer.boundingBox();
  expect(landscape).not.toBeNull();
  expect(landscape?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((landscape?.x ?? 0) + (landscape?.width ?? 0)).toBeLessThanOrEqual(844);
  expect((landscape?.y ?? 0) + (landscape?.height ?? 0)).toBeLessThanOrEqual(390);
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: "/tmp/the-grind-2-compact-panels-844.png", fullPage: true });
  }

  await page.setViewportSize({ width: 768, height: 540 });
  await expect(drawer).toBeVisible();
  await expectFullWatchPanels(page);
  const shortTablet = await drawer.boundingBox();
  expect(shortTablet).not.toBeNull();
  expect(shortTablet?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((shortTablet?.x ?? 0) + (shortTablet?.width ?? 0)).toBeLessThanOrEqual(768);
  expect((shortTablet?.y ?? 0) + (shortTablet?.height ?? 0)).toBeLessThanOrEqual(540);

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(drawer).toBeVisible();
  const tablet = await drawer.boundingBox();
  expect(tablet).not.toBeNull();
  expect(tablet?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((tablet?.x ?? 0) + (tablet?.width ?? 0)).toBeLessThanOrEqual(768);
  expect((tablet?.y ?? 0) + (tablet?.height ?? 0)).toBeLessThanOrEqual(1024);
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: "/tmp/the-grind-2-compact-panels-768.png", fullPage: true });
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(drawer).toBeHidden();
  await expect(app).toHaveAttribute("data-chrome-mode", "panels");
  await expect(page.locator("#topbar")).toBeVisible();
  await expect(page.locator('.view-button[data-view="watch"]')).toBeFocused();
  expect(await page.evaluate(() => {
    const appNode = document.querySelector("#app");
    const ids = ["topbar", "view-toolbar", "spectator-inbox", "map-inspector", "inspection-screen", "hero-hud", "chronicle"];
    return ids.every((id) => document.querySelector(`#${id}`)?.parentElement === appNode);
  })).toBe(true);
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBeNull();
});
