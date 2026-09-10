import { expect, test, type Page } from "@playwright/test";
import { createForwardMotionState } from "../src/core/forward-motion";
import { advanceWorld, createWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { dungeonTrapAt, projectDungeonSearchExits, resolveDungeonTrapCheck } from "../src/depth/dungeon";
import { effectiveAttribute, heroMechanicalLevel } from "../src/depth/rpg";
import { selectDungeonEntryPlan, stepDepth } from "../src/depth/state";
import { dungeonFramingViewRect, projectDungeonFraming } from "../src/render/dungeon-framing";

function publicFrame(world: WorldState) {
  const dungeon = world.depth.dungeon!;
  const known = new Set(dungeon.discoveredCellIds);
  const frame = projectDungeonFraming(dungeon.cells.filter((cell) => known.has(cell.id)).map(({ x, y }) => ({ x, y })));
  if (frame === null) throw new Error("The canonical dungeon must have public rooms to frame");
  return frame;
}

function expectFrame(stage: Record<string, string | undefined>, world: WorldState): void {
  const frame = publicFrame(world);
  expect(stage).toMatchObject({ dungeonFraming: "discovered-rooms", dungeonFrameCellSize: String(frame.cellSize),
    dungeonFrameOffset: `${frame.offsetX},${frame.offsetY}`,
    dungeonFrameBounds: `${frame.bounds.minX},${frame.bounds.minY},${frame.bounds.maxX},${frame.bounds.maxY}`,
    dungeonFrameRooms: String(frame.roomCount) });
}

function captionMetrics(stage: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(stage).filter(([key]) => key.startsWith("dungeonCaption")));
}

function expectReadableCaption(stage: Record<string, string | undefined>, phase: "search" | "disarm"): void {
  expect(["wide", "compact"]).toContain(stage.dungeonCaptionLayout);
  expect(stage.dungeonCaptionTitle).toBe(phase === "search" ? "TRAP MARKED" : "TRAP SPRUNG");
  const compact = stage.dungeonCaptionLayout === "compact";
  expect(stage.dungeonCaptionDetail).toBe(phase === "search"
    ? compact ? "1 MARKED · STILL ARMED" : "1 TRAP MARKED · STILL ARMED"
    : compact ? "ECHO RUNE · SPENT" : "ECHO RUNE · NO LONGER ARMED");
  // These are actual CSS font sizes and measured Pixi text bounds, not a
  // screenshot-scale assumption or the helper's nominal line-height alone.
  expect(Number(stage.dungeonCaptionTitleSize)).toBeGreaterThanOrEqual(12 - 0.000001);
  expect(Number(stage.dungeonCaptionDetailSize)).toBeGreaterThanOrEqual(11 - 0.000001);
  const [railX, railY, railWidth, railHeight] = stage.dungeonCaptionRail!.split(",").map(Number);
  expect(railY + railHeight).toBeLessThan(dungeonFramingViewRect.y);
  expect(railX).toBeGreaterThanOrEqual(0);
  expect(railX + railWidth).toBeLessThanOrEqual(320);
  const bounds = JSON.parse(stage.dungeonCaptionBounds!) as {
    title: [number, number, number, number] | null; detail: [number, number, number, number] | null;
  };
  expect(bounds.title).not.toBeNull();
  expect(bounds.detail).not.toBeNull();
  for (const [x, y, width, height] of [bounds.title!, bounds.detail!]) {
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    expect(x).toBeGreaterThanOrEqual(railX);
    expect(y).toBeGreaterThanOrEqual(railY);
    expect(x + width).toBeLessThanOrEqual(railX + railWidth + 0.01);
    expect(y + height).toBeLessThanOrEqual(railY + railHeight + 0.01);
  }
  expect(bounds.title![1] + bounds.title![3]).toBeLessThanOrEqual(bounds.detail![1] + 0.01);
}

async function pauseOnReady(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    let pauseRequested = false;
    const timeout = window.setTimeout(() => {
      window.clearInterval(poll);
      reject(new Error("The ready adventure did not pause within 20 seconds"));
    }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const app = document.querySelector<HTMLElement>("#app")!;
      if (!pauseRequested && app.dataset.presentationPaused !== "true") {
        pauseRequested = true;
        document.querySelector<HTMLButtonElement>("#pause-button")!.click();
      }
      if (app.dataset.presentationPaused !== "true") return;
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      resolve();
    }, 20);
  }));
}

function cautiousDungeon(): WorldState {
  // The bounded lookup found this naturally generated one-exit entry. Only the
  // starting atlas location and hero HP are staged; no rooms, trap difficulties,
  // attributes, rolls, or search receipts are manufactured.
  const base = createWorld("browser-dungeon-search:8", "campaign:browser-dungeon-search");
  const locationId = "location:3";
  const located = { ...base.depth, atlas: { ...base.depth.atlas, currentLocationId: locationId,
    discoveredLocationIds: [...new Set([...base.depth.atlas.discoveredLocationIds, locationId])] } };
  const plan = selectDungeonEntryPlan(located);
  if (plan === null) throw new Error("Expected the real atlas dungeon's canonical entry plan");
  const entered = stepDepth(located, { type: "enter-dungeon", dungeonId: plan.dungeonId, width: plan.width, height: plan.height });
  const depth = { ...entered, hero: { ...entered.hero, resources: { ...entered.hero.resources,
    health: Math.floor(entered.hero.resources.maxHealth / 2) } } };
  return upgradeWorldState({ ...base, tick: depth.tick, depth,
    hero: { ...base.hero, health: depth.hero.resources.health, gold: depth.hero.gold, experience: depth.hero.experience },
    forwardMotion: createForwardMotionState(locationId, depth.tick),
    lifecycle: { ...base.lifecycle, simulationTick: depth.tick, worldClockMinutes: depth.tick * 15 },
    scene: { ...base.scene, mode: "dungeon", headline: "The cautious hero studies the passage." },
  });
}

async function automaticStep(page: Page, before: WorldState): Promise<WorldState> {
  const raw = await page.evaluate(({ campaignId, tick }) => new Promise<string>((resolve, reject) => {
    const app = document.querySelector<HTMLElement>("#app")!;
    const pause = document.querySelector<HTMLButtonElement>("#pause-button")!;
    let pauseRequested = false;
    const timeout = window.setTimeout(() => {
      window.clearInterval(poll);
      reject(new Error("The actual automatic adventure step did not settle within 20 seconds"));
    }, 20_000);
    const poll = window.setInterval(() => {
      const saved = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
      if (saved === null || JSON.parse(saved).tick <= tick) return;
      // Pausing while a turn is settling is asynchronous. Request it once;
      // repeated clicks before its acknowledgment would resume the adventure.
      if (!pauseRequested && app.dataset.presentationPaused !== "true") {
        pauseRequested = true;
        pause.click();
      }
      if (app.dataset.presentationPaused !== "true" || Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      resolve(saved);
    }, 20);
    pause.click();
  }), { campaignId: before.campaignId, tick: before.tick });
  const after = JSON.parse(raw) as WorldState;
  expect(after).toEqual(advanceWorld(before));
  return after;
}

async function presentation(page: Page, campaignId: string) {
  return page.evaluate((id) => ({
    stage: { ...document.querySelector<HTMLElement>("#stage")!.dataset },
    traversal: { ...document.querySelector<HTMLElement>("#traversal-progress-text")!.dataset },
    directive: { ...document.querySelector<HTMLElement>("#traversal-directive")!.dataset,
      text: document.querySelector("#traversal-directive")!.textContent,
      title: document.querySelector<HTMLElement>("#traversal-directive")!.title },
    saved: sessionStorage.getItem(`the-grind-2:campaign:${id}`),
  }), campaignId);
}

test("a cautious hero searches a natural hidden trap before a separate entry and disarm attempt", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const startedAt = Date.now();
  const milestone = (label: string): void => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    console.log(`[${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${parts.timeZoneName}] Dungeon search +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${label}`);
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
    const fixture = cautiousDungeon();
    const dungeon = fixture.depth.dungeon!;
    const targetId = "dungeon:location:3:cell:0,1";
    expect(projectDungeonSearchExits(dungeon)).toEqual([{ direction: "south", cellId: targetId }]);
    expect(dungeonTrapAt(dungeon, targetId)).toMatchObject({ kind: "rune-ward", phase: "hidden", detectDifficulty: 11, disarmDifficulty: 12 });
    const baseline = resolveDungeonTrapCheck(dungeon, targetId, "detect", {
      agility: effectiveAttribute(fixture.depth.hero, "agility"), intellect: effectiveAttribute(fixture.depth.hero, "intellect"),
      spirit: effectiveAttribute(fixture.depth.hero, "spirit"), level: heroMechanicalLevel(fixture.hero.level),
    }, fixture.seed);
    expect(baseline).toMatchObject({ skill: 10, roll: 0, total: 10, difficulty: 11, success: false });
    await page.addInitScript((saved) => {
      const key = `the-grind-2:campaign:${saved.campaignId}`;
      // Reload the actually persisted result, never replace it with the fixture.
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
    const initial = await presentation(page, fixture.campaignId);
    expect(JSON.parse(initial.saved!)).toEqual(fixture);
    expect(initial.stage.dungeonHeroCell).toBe(dungeon.currentCellId);
    expect(initial.stage.dungeonSearch).toBeUndefined();
    expect(initial.traversal.trapsArmed).toBe("0");
    expectFrame(initial.stage, fixture);
    expect(publicFrame(fixture)).toMatchObject({ cellSize: 40, roomCount: 2, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 1 } });
    expect(initial.stage.dungeonHeroScale).toBe("0.8");
    milestone("canonical hidden trap loaded; no public hazard marker or search credit");

    const searched = await automaticStep(page, fixture);
    const receipt = searched.depth.dungeon!.search!.latestReceipt!;
    const source = searched.chronicle.at(-1)!;
    expect(source.commandType).toBe("search-dungeon");
    expect(receipt).toMatchObject({ dungeonId: dungeon.id, cellId: dungeon.currentCellId, tick: searched.tick, bonus: 2,
      discoveries: [{ cellId: targetId, kind: "rune-ward", skill: baseline.skill, roll: baseline.roll, total: baseline.total + 2, difficulty: baseline.difficulty }] });
    expect(searched.depth.dungeon!.currentCellId).toBe(dungeon.currentCellId);
    expect(searched.depth.dungeon!.turns).toBe(dungeon.turns + 1);
    expect(searched.depth.dungeon!.visitedCellIds).toEqual(dungeon.visitedCellIds);
    expect(searched.depth.hero).toEqual(fixture.depth.hero);
    expect(searched.depth.quest).toEqual(fixture.depth.quest);
    expect(searched.hero.experience).toBe(fixture.hero.experience);
    expect(dungeonTrapAt(searched.depth.dungeon!, targetId)?.phase).toBe("detected");
    expect(upgradeWorldState(JSON.parse(JSON.stringify(searched)))).toEqual(searched);
    const shown = await presentation(page, fixture.campaignId);
    expectFrame(shown.stage, searched);
    expect(publicFrame(searched)).toEqual(publicFrame(fixture));
    expect(shown.stage).toMatchObject({ dungeonSearch: "marked", dungeonSearchCell: dungeon.currentCellId,
      dungeonSearchTick: String(searched.tick), dungeonSearchEvent: source.id, dungeonSearchExits: "south",
      dungeonSearchDiscoveries: targetId, dungeonSearchResult: source.consequence,
      dungeonSearchVisual: "stationary-hero|public-exit-inspection", dungeonTraversalMode: "search",
      dungeonHeroCell: dungeon.currentCellId, dungeonNextDirections: "", dungeonBreadcrumbLength: "0" });
    expect(shown.traversal.trapsArmed).toBe("1");
    expect(shown.directive).toMatchObject({ reason: "dungeon-search", directions: "", routeLength: "0",
      text: "TRAP MARKED · 1 TRAP MARKED · STILL ARMED", title: source.consequence });
    milestone("actual search spends one turn: same roll +2 marks trap, no movement, HP or XP");

    const captureFrame = async (phase: "search" | "disarm", world: WorldState): Promise<Record<string, string | undefined>> => {
      let desktop: Record<string, string | undefined> = {};
      for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
        await page.setViewportSize(viewport);
        await page.locator("#stage").scrollIntoViewIfNeeded();
        const layout = await page.evaluate(() => ({
          fits: document.documentElement.scrollWidth <= innerWidth + 1,
          stage: { ...document.querySelector<HTMLElement>("#stage")!.dataset },
        }));
        expect(layout.fits).toBe(true);
        expectFrame(layout.stage, world);
        expectReadableCaption(layout.stage, phase);
        if (viewport.width === 320) expect(layout.stage.dungeonCaptionLayout).toBe("compact");
        else desktop = layout.stage;
        if (phase === "search") {
          expect(layout.stage.dungeonFrameCellSize).toBe("40");
          expect(layout.stage.dungeonHeroScale).toBe("0.8");
        } else {
          expect(layout.stage.dungeonAlertPlacement).toBe("reserved-top-rail");
          expect(layout.stage.dungeonTrapResult).toBe(world.scene.consequence);
        }
        if (process.env.TG2_VISUAL_CAPTURE === "1") {
          const path = testInfo.outputPath(`dungeon-${phase}-${viewport.width}.png`);
          await page.screenshot({ path, timeout: 8_000 });
          await testInfo.attach(`Dungeon ${phase} ${viewport.width}`, { path, contentType: "image/png" });
        }
        milestone(`${viewport.width}px ${phase} caption readable and contained above the public rooms; frame captured`);
      }
      return desktop;
    };
    const desktopSearch = await captureFrame("search", searched);
    await page.setViewportSize({ width: 1280, height: 800 });
    // Chrome reserves its responsive height before the canvas observer settles.
    // Await the original camera scale; retain exact metric and save assertions.
    await page.waitForFunction((expected) => document.querySelector<HTMLElement>("#stage")!.dataset.sceneLayout === expected,
      desktopSearch.sceneLayout, { polling: "raf", timeout: 5_000 });
    const resizedBack = await presentation(page, fixture.campaignId);
    expect(resizedBack.saved).toBe(shown.saved);
    expectFrame(resizedBack.stage, searched);
    expect(captionMetrics(resizedBack.stage)).toEqual(captionMetrics(desktopSearch));
    await page.reload({ timeout: 25_000 });
    await pauseOnReady(page);
    await page.waitForFunction((expected) => document.querySelector<HTMLElement>("#stage")!.dataset.sceneLayout === expected,
      desktopSearch.sceneLayout, { polling: "raf", timeout: 5_000 });
    const reloaded = await presentation(page, fixture.campaignId);
    expect(reloaded.saved).toBe(shown.saved);
    expectFrame(reloaded.stage, searched);
    expect(reloaded.stage.dungeonSearchEvent).toBe(source.id);
    expect(captionMetrics(reloaded.stage)).toEqual(captionMetrics(desktopSearch));
    milestone("paused resize back and actual persisted reload keep the exact caption, public camera and save");
    const entered = await automaticStep(page, searched);
    expect(entered.chronicle.at(-1)?.commandType).toBe("move-dungeon");
    expect(entered.depth.dungeon!.currentCellId).toBe(targetId);
    expect(dungeonTrapAt(entered.depth.dungeon!, targetId)?.phase).toBe("detected");
    expect(entered.hero.health).toBe(searched.hero.health);
    expect(entered.depth.dungeon!.search).toEqual(searched.depth.dungeon!.search);
    const enteredView = await presentation(page, fixture.campaignId);
    expect(enteredView.stage.dungeonSearch).toBeUndefined();
    expect(enteredView.stage.dungeonHeroCell).toBe(targetId);
    expect(enteredView.stage.dungeonTrap).toBe("armed");
    expectFrame(enteredView.stage, entered);
    expect(publicFrame(entered).roomCount).toBeGreaterThan(publicFrame(searched).roomCount);
    expect(publicFrame(entered).bounds).not.toEqual(publicFrame(searched).bounds);
    expect(enteredView.stage.dungeonAlertPlacement).toBe("reserved-top-rail");
    milestone("next automatic action enters the marked room; trap remains armed");

    const resolved = await automaticStep(page, entered);
    expect(resolved.chronicle.at(-1)?.commandType).toBe("disarm-dungeon-trap");
    expect(resolved.depth.dungeon!.currentCellId).toBe(targetId);
    // This natural check fails: finding a trap is not a free disarm or immunity.
    expect(dungeonTrapAt(resolved.depth.dungeon!, targetId)?.phase).toBe("triggered");
    expect(resolved.hero.health).toBe(entered.hero.health - 4);
    expect(resolved.hero.experience).toBe(entered.hero.experience);
    expect(resolved.depth.dungeon!.search).toEqual(searched.depth.dungeon!.search);
    expect(upgradeWorldState(JSON.parse(JSON.stringify(resolved)))).toEqual(resolved);
    const resolvedSave = (await presentation(page, fixture.campaignId)).saved;
    const history = await page.evaluate((eventId) => {
      // Use the real existing outcome control, then the read-only Status tab.
      const outcome = document.querySelector<HTMLButtonElement>("#trap-cutaway-outcome")!;
      if (!outcome.hidden && !outcome.disabled) outcome.click();
      document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="journal"]')!.click();
      document.querySelector<HTMLButtonElement>("#journal-status-button")!.click();
      document.querySelector<HTMLButtonElement>("#journal-status-refresh")!.click();
      const row = [...document.querySelectorAll<HTMLElement>('#journal-status-list [data-source="chronicle"]')]
        .find((entry) => entry.dataset.eventId === eventId);
      return { source: row?.dataset.source, eventId: row?.dataset.eventId,
        consequence: row?.querySelector(".journal-status-consequence")?.textContent };
    }, resolved.chronicle.at(-1)!.id);
    expect(history).toEqual({ source: "chronicle", eventId: resolved.chronicle.at(-1)!.id, consequence: resolved.scene.consequence });
    await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click());
    expect((await presentation(page, fixture.campaignId)).saved).toBe(resolvedSave);
    await captureFrame("disarm", resolved);
    expect((await presentation(page, fixture.campaignId)).saved).toBe(resolvedSave);
    expect(errors).toEqual([]);
    expect(inference).toEqual([]);
    expect(external).toEqual([]);
    milestone("separate disarm attempt resolves its own damage; archive remains exact; all assertions passed");
  } finally {
    milestone(`browser diagnostics: ${errors.length} errors, ${inference.length} inference, ${external.length} external requests`);
    await testInfo.attach("Dungeon search browser diagnostics", {
      body: JSON.stringify({ errors, inference, external, elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json",
    });
  }
});
