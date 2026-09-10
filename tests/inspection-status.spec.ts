import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, createWorld } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";

async function pauseOnReady(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    let pauseRequested = false;
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("The ready adventure did not pause within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const app = document.querySelector<HTMLElement>("#app")!;
      if (!pauseRequested && app.dataset.presentationPaused !== "true") {
        pauseRequested = true;
        document.querySelector<HTMLButtonElement>("#pause-button")!.click();
      }
      if (app.dataset.presentationPaused !== "true") return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve();
    }, 20);
  }));
}

async function automaticStep(page: Page, before: WorldState): Promise<WorldState> {
  const raw = await page.evaluate(({ campaignId, tick }) => new Promise<string>((resolve, reject) => {
    const app = document.querySelector<HTMLElement>("#app")!;
    const pause = document.querySelector<HTMLButtonElement>("#pause-button")!;
    let pauseRequested = false;
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("The automatic finisher did not settle within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      const saved = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
      if (saved === null || JSON.parse(saved).tick <= tick) return;
      // A pending pause must not be toggled off before its acknowledgment.
      if (!pauseRequested && app.dataset.presentationPaused !== "true") { pauseRequested = true; pause.click(); }
      if (app.dataset.presentationPaused !== "true" || Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(saved);
    }, 20);
    pause.click();
  }), { campaignId: before.campaignId, tick: before.tick });
  const after = JSON.parse(raw) as WorldState;
  expect(after).toEqual(advanceWorld(before));
  return after;
}

type Inspection = "inventory" | "map";

async function mapGeometry(page: Page) {
  return page.evaluate(() => {
    const map = document.querySelector<HTMLElement>("#map-inspector")!;
    const app = document.querySelector<HTMLElement>("#app")!;
    const toolbar = document.querySelector<HTMLElement>("#view-toolbar")!;
    const rect = (element: HTMLElement) => {
      const { top, right, bottom, left, width, height } = element.getBoundingClientRect();
      return { top, right, bottom, left, width, height };
    };
    return { map: rect(map), toolbar: rect(toolbar), app: rect(app),
      inspectionTop: Number.parseFloat(getComputedStyle(app).getPropertyValue("--inspection-viewport-top")),
      bottomInset: Number.parseFloat(getComputedStyle(map).bottom),
      overflowY: getComputedStyle(map).overflowY, scrollTop: map.scrollTop,
      scrollHeight: map.scrollHeight, clientHeight: map.clientHeight,
      viewportHeight: innerHeight, pageScrollY: scrollY,
      open: document.querySelector<HTMLDetailsElement>("#map-gazetteer")!.open };
  });
}

function expectCollapsedMapClearance(layout: Awaited<ReturnType<typeof mapGeometry>>): void {
  expect(layout.open).toBe(false);
  expect(layout.map.top).toBeGreaterThanOrEqual(layout.toolbar.bottom - 1);
  expect(layout.map.top).toBeGreaterThanOrEqual(layout.app.top + layout.inspectionTop - 1);
  expect(layout.map.bottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
  expect(layout.map.top - layout.toolbar.bottom).toBeGreaterThan(1);
  const available = layout.app.height - layout.inspectionTop - layout.bottomInset;
  expect(layout.map.height).toBeLessThanOrEqual(available * 0.65 + 1);
  expect(layout.map.top - (layout.app.top + layout.inspectionTop)).toBeGreaterThanOrEqual(available * 0.35 - 1);
  expect(layout.overflowY).toBe("auto");
  expect(layout.pageScrollY).toBe(0);
}

async function mapReachability(page: Page) {
  return page.evaluate(() => {
    const map = document.querySelector<HTMLElement>("#map-inspector")!;
    const targets = ["#map-current-place", "#map-route", "#map-discovery",
      '#map-hero-activity [data-activity-field="notice"]', "#map-gazetteer > summary", ":scope > .view-close"];
    const beforeScroll = scrollY;
    const reached = targets.map((selector) => {
      const element = map.querySelector<HTMLElement>(selector)!;
      element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      const bounds = map.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const card = element.closest<HTMLElement>(".hero-activity")?.getBoundingClientRect();
      return { selector, text: element.textContent, visible: !element.hidden && rect.height > 0,
        inside: rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1,
        insideCard: card === undefined || rect.top >= card.top - 1 && rect.bottom <= card.bottom + 1,
        belowToolbar: rect.top >= document.querySelector("#view-toolbar")!.getBoundingClientRect().bottom - 1 };
    });
    map.scrollTop = 0;
    return { reached, beforeScroll, afterScroll: scrollY, scrollHeight: map.scrollHeight, clientHeight: map.clientHeight };
  });
}

async function inspect(page: Page, view: Inspection, campaignId: string) {
  return page.evaluate(({ selectedView, id }) => {
    document.querySelector<HTMLButtonElement>(`#view-toolbar [data-view="${selectedView}"]`)!.click();
    const host = document.querySelector<HTMLElement>(selectedView === "map" ? "#map-hero-activity" : "#screen-hero-activity")!;
    const notice = host.querySelector<HTMLElement>('[data-activity-field="notice"]')!;
    return { view: host.dataset.view, tick: host.dataset.activityTick, pose: host.dataset.pose, notice: notice.textContent,
      hidden: notice.hidden, scene: host.querySelector('[data-activity-field="scene"]')!.textContent,
      kicker: document.querySelector("#inspection-screen .inspection-heading .view-kicker")!.textContent,
      announcement: document.querySelector("#view-announcement")!.textContent,
      paused: document.querySelector<HTMLElement>("#app")!.dataset.presentationPaused,
      saved: sessionStorage.getItem(`the-grind-2:campaign:${id}`) };
  }, { selectedView: view, id: campaignId });
}

test("inspection hints distinguish paused battle, immediate resume, and the actual settled victory", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const startedAt = Date.now();
  const milestone = (label: string): void => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    console.log(`[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}] Inspection status +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${label}`);
  };
  const errors: string[] = [], inference: string[] = [], external: string[] = [];
  const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("worker", (worker) => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
  page.on("request", (request) => {
    if (modelUrl.test(request.url())) inference.push(request.url());
    if (new URL(request.url()).origin !== new URL(testInfo.project.use.baseURL!).origin) external.push(request.url());
  });
  try {
    // The same entirely natural v151 witness: route, rated battle, Horizon Step,
    // then the enemy's own Guard. No state, stats, abilities or receipts edited.
    let fixture = createWorld("golden:1", "campaign:1");
    for (let turn = 0; turn < 4; turn++) fixture = advanceWorld(fixture);
    expect(fixture.depth.combat?.outcome).toBe("ongoing");
    expect(fixture.depth.combat?.log.at(-1)?.action).toBe("guard");
    await page.addInitScript((saved) => {
      const key = `the-grind-2:campaign:${saved.campaignId}`;
      if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, JSON.stringify(saved));
      sessionStorage.setItem("the-grind-2:activeCampaignId", saved.campaignId);
      localStorage.setItem(`the-grind-2:last-active:${saved.campaignId}`, String(Date.now() + 3_600_000));
      localStorage.setItem("the-grind-2:play-mode:v1", '{"schemaVersion":1,"mode":"deterministic"}');
      localStorage.setItem("the-grind-2:adventure-speed:v1", '{"schemaVersion":1,"speed":1}');
      localStorage.setItem("the-grind-2:stage-focus:v1", "panels");
    }, fixture);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./", { timeout: 25_000 });
    await pauseOnReady(page);
    const pausedInventory = await inspect(page, "inventory", fixture.campaignId);
    expect(JSON.parse(pausedInventory.saved!)).toEqual(fixture);
    expect(pausedInventory).toMatchObject({ view: "inventory", tick: "4", paused: "true", hidden: false });
    expect(pausedInventory.notice).toBe("Battle paused — return to Watch.");
    expect(pausedInventory.kicker).toBe("A closer look at the adventure");
    expect(pausedInventory.announcement).toBe("Inventory view. Return to Watch for the adventure.");
    const pausedMap = await inspect(page, "map", fixture.campaignId);
    expect(pausedMap.notice).toBe(pausedInventory.notice);
    expect(pausedMap.announcement).toBe("Map view. Return to Watch for the adventure.");
    expect(pausedMap.saved).toBe(pausedInventory.saved);

    // Native clicks and snapshots share one JS turn. The UI must acknowledge
    // Resume and Pause without needing or inventing a canonical game action.
    const toggled = await page.evaluate((campaignId) => {
      const app = document.querySelector<HTMLElement>("#app")!;
      const pause = document.querySelector<HTMLButtonElement>("#pause-button")!;
      const notice = () => document.querySelector<HTMLElement>('#map-hero-activity [data-activity-field="notice"]')!.textContent;
      const saved = () => sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
      pause.click();
      const running = { notice: notice(), paused: app.dataset.presentationPaused, saved: saved(), tick: app.dataset.simulationTick };
      pause.click();
      return { running, paused: { notice: notice(), paused: app.dataset.presentationPaused, saved: saved(), tick: app.dataset.simulationTick } };
    }, fixture.campaignId);
    expect(toggled.running).toMatchObject({ paused: "false", saved: pausedInventory.saved, tick: "4" });
    expect(toggled.running.notice).toBe("Battle continues off-screen — return to Watch.");
    expect(toggled.paused).toMatchObject({ notice: pausedInventory.notice, paused: "true", saved: pausedInventory.saved, tick: "4" });
    milestone("Inventory and Map distinguish pause/resume immediately with the exact T4 save unchanged");

    const after = await automaticStep(page, fixture);
    expect(after.depth.combat).toBeNull();
    expect(after.depth.completedCombats.at(-1)?.outcome).toBe("victory");
    expect(after.chronicle.at(-1)?.action).toContain("Victory");
    const terminal = await inspect(page, "inventory", fixture.campaignId);
    expect(terminal).toMatchObject({ view: "inventory", tick: "5", pose: "examine", paused: "true", hidden: false });
    expect(terminal.notice).toBe("Battle won · paused — return to Watch.");
    expect(terminal.notice).not.toContain("continues");
    expect(terminal.scene).toContain(after.chronicle.at(-1)!.action);
    expect(JSON.parse(terminal.saved!)).toEqual(after);
    const terminalToggle = await page.evaluate((campaignId) => {
      const pause = document.querySelector<HTMLButtonElement>("#pause-button")!;
      const notice = () => document.querySelector<HTMLElement>('#screen-hero-activity [data-activity-field="notice"]')!.textContent;
      pause.click();
      const running = { notice: notice(), saved: sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`) };
      pause.click();
      return { running, paused: notice(), saved: sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`) };
    }, fixture.campaignId);
    expect(terminalToggle).toEqual({ running: { notice: "Battle won — return to Watch.", saved: terminal.saved },
      paused: terminal.notice, saved: terminal.saved });
    milestone("actual automatic victory is labeled complete and paused, never as a continuing battle");

    let desktopMap: Awaited<ReturnType<typeof mapGeometry>> | undefined;
    for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      for (const view of ["inventory", "map"] as const) {
        const shown = await inspect(page, view, fixture.campaignId);
        expect(shown.notice).toBe(terminal.notice);
        expect(shown.saved).toBe(terminal.saved);
        const host = page.locator(view === "map" ? "#map-hero-activity" : "#screen-hero-activity");
        // The Map owns its scrollport. Scrolling the entire hero card into view
        // can instead move the page/chrome when that card is taller than it.
        if (view === "inventory") await host.scrollIntoViewIfNeeded();
        else {
          await page.waitForFunction(() => {
            const app = document.querySelector<HTMLElement>("#app")!;
            const toolbar = document.querySelector("#view-toolbar")!.getBoundingClientRect();
            return Math.abs(app.getBoundingClientRect().top
              + Number.parseFloat(getComputedStyle(app).getPropertyValue("--inspection-viewport-top")) - toolbar.bottom) <= 1;
          }, undefined, { polling: "raf", timeout: 5_000 });
          const geometry = await mapGeometry(page);
          if (viewport.width === 320) {
            expectCollapsedMapClearance(geometry);
            const reachable = await mapReachability(page);
            expect(reachable.beforeScroll).toBe(0);
            expect(reachable.afterScroll).toBe(0);
            expect(reachable.scrollHeight).toBeGreaterThan(reachable.clientHeight);
            for (const target of reachable.reached) expect(target, target.selector).toMatchObject({
              visible: true, inside: true, insideCard: true, belowToolbar: true,
            });
          } else desktopMap = geometry;
        }
        const layout = await host.evaluate((element) => {
          const notice = element.querySelector<HTMLElement>('[data-activity-field="notice"]')!;
          const box = notice.getBoundingClientRect();
          return { fits: document.documentElement.scrollWidth <= innerWidth + 1,
            visible: !notice.hidden && box.width > 0 && box.height > 0, left: box.left, right: box.right, viewport: innerWidth };
        });
        expect(layout).toMatchObject({ fits: true, visible: true });
        expect(layout.left).toBeGreaterThanOrEqual(-1);
        expect(layout.right).toBeLessThanOrEqual(layout.viewport + 1);
        if (process.env.TG2_VISUAL_CAPTURE === "1") {
          const path = testInfo.outputPath(`inspection-status-${view}-${viewport.width}.png`);
          await page.screenshot({ path, timeout: 8_000 });
          await testInfo.attach(`Inspection status ${view} ${viewport.width}`, { path, contentType: "image/png" });
        }
      }
      milestone(`${viewport.width}px status stays truthful; Map metadata and notice remain reachable below navigation without save mutation`);
    }
    const collapsed = await mapGeometry(page);
    expectCollapsedMapClearance(collapsed);
    const summary = page.locator("#map-gazetteer > summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#map-gazetteer")).toHaveJSProperty("open", true);
    const opened = await page.evaluate(() => {
      const map = document.querySelector<HTMLElement>("#map-inspector")!;
      const app = document.querySelector<HTMLElement>("#app")!;
      map.scrollTop = map.scrollHeight;
      const box = map.getBoundingClientRect();
      const close = map.querySelector<HTMLElement>(":scope > .view-close")!;
      const button = close.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: box.height, viewportHeight: innerHeight,
        expectedTop: app.getBoundingClientRect().top + Number.parseFloat(getComputedStyle(app).getPropertyValue("--inspection-viewport-top")),
        stickyReturn: getComputedStyle(close).position, buttonTop: button.top, buttonBottom: button.bottom,
        heroHidden: getComputedStyle(document.querySelector("#map-hero-activity")!).display === "none", pageScrollY: scrollY };
    });
    expect(opened.top).toBeCloseTo(opened.expectedTop, 0);
    expect(opened.bottom).toBeCloseTo(opened.viewportHeight, 0);
    expect(opened.height).toBeGreaterThan(collapsed.map.height);
    expect(opened).toMatchObject({ stickyReturn: "sticky", heroHidden: true, pageScrollY: 0 });
    expect(opened.buttonTop).toBeGreaterThanOrEqual(opened.top - 1);
    expect(opened.buttonBottom).toBeLessThanOrEqual(opened.bottom + 1);
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#map-gazetteer")).toHaveJSProperty("open", false);
    await expect(summary).toBeFocused();
    const closed = await mapGeometry(page);
    expectCollapsedMapClearance(closed);
    expect(closed.map).toEqual(collapsed.map);
    await page.setViewportSize({ width: 320, height: 480 });
    expectCollapsedMapClearance(await mapGeometry(page));
    milestone("native gazetteer opens full-height with sticky Return, closes with summary focus, and the 480px-tall Map stays bounded");
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForFunction((expected) => {
      const map = document.querySelector("#map-inspector")!.getBoundingClientRect();
      const toolbar = document.querySelector("#view-toolbar")!.getBoundingClientRect();
      return Math.abs(map.top - expected.map.top) < 0.01 && Math.abs(map.height - expected.map.height) < 0.01
        && Math.abs(toolbar.bottom - expected.toolbar.bottom) < 0.01;
    }, desktopMap!, { polling: "raf", timeout: 5_000 });
    const returned = await mapGeometry(page);
    expect(returned.map).toEqual(desktopMap!.map);
    expect(returned.toolbar).toEqual(desktopMap!.toolbar);
    expect(returned.pageScrollY).toBe(0);
    expect((await inspect(page, "map", fixture.campaignId)).saved).toBe(terminal.saved);
    milestone("paused 1280→320→1280 roundtrip restores exact Map/navigation geometry and canonical save");
    await page.reload({ timeout: 25_000 });
    await pauseOnReady(page);
    const reloaded = await inspect(page, "inventory", fixture.campaignId);
    expect(reloaded.saved).toBe(terminal.saved);
    expect(reloaded.notice).toBe(terminal.notice);
    expect(reloaded.paused).toBe("true");
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone("actual reload preserves truthful terminal status and exact canonical save; all assertions passed");
  } finally {
    milestone(`browser diagnostics: ${errors.length} errors, ${inference.length} inference, ${external.length} external requests`);
    await testInfo.attach("Inspection status browser diagnostics", { body: JSON.stringify({ errors, inference, external, elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
