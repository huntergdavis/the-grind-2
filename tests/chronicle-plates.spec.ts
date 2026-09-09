import { expect as baseExpect, test, type Page } from "@playwright/test";
import { createForwardMotionState } from "../src/core/forward-motion";
import { advanceWorld, createWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { projectTownChroniclePlate, type ChroniclePlateRecipeV1 } from "../src/ui/chronicle-plate";
import { chroniclePlateArchiveKey } from "../src/ui/chronicle-plate-archive";
import { projectTownItinerary } from "../src/ui/town-itinerary";

const expect = baseExpect.configure({ timeout: 15_000 });

function firstTownFixture(campaignId: string): WorldState {
  // The existing real town-itinerary journey uses this same saved-arrival seam:
  // a known town is not yet visited, so the next actual director action visits it.
  // No page, narrative, or presentation completion is inserted into storage.
  const base = createWorld("browser-town-itinerary", campaignId);
  const location = base.depth.atlas.locations.find((candidate) => candidate.kind === "town");
  if (location === undefined) throw new Error("Chronicle Plates fixture needs a town");
  return upgradeWorldState({
    ...base,
    scene: { ...base.scene, mode: "town", location: location.name },
    forwardMotion: createForwardMotionState(location.id, base.tick),
    pendingAttention: [],
    depth: {
      ...base.depth,
      atlas: { ...base.depth.atlas, currentLocationId: location.id, route: null,
        discoveredLocationIds: [...new Set([...base.depth.atlas.discoveredLocationIds, location.id])] },
      towns: Object.fromEntries(Object.entries(base.depth.towns).filter(([id]) => id !== location.id)),
      combat: null,
      counterDuel: null,
    },
  });
}

async function savedCampaign(page: Page, campaignId: string): Promise<string> {
  return page.evaluate((id) => {
    const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
    if (raw === null) throw new Error("Expected the canonical campaign mirror");
    return raw;
  }, campaignId);
}

async function archivedPages(page: Page): Promise<ChroniclePlateRecipeV1[]> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw === null ? [] : JSON.parse(raw).entries;
  }, chroniclePlateArchiveKey);
}

async function durableCampaign(page: Page, campaignId: string): Promise<WorldState> {
  return page.evaluate((id) => new Promise<WorldState>((resolve, reject) => {
    const request = indexedDB.open("the-grind-2", 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("campaigns", "readonly");
      const saved = transaction.objectStore("campaigns").get(id);
      saved.onerror = () => reject(saved.error);
      transaction.oncomplete = () => { database.close(); resolve(saved.result as WorldState); };
      transaction.onerror = () => { database.close(); reject(transaction.error); };
    };
  }), campaignId);
}

async function pauseReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    if (document.documentElement.dataset.ready !== "true") return false;
    const app = document.querySelector<HTMLElement>("#app")!;
    if (app.dataset.presentationPaused !== "true") document.querySelector<HTMLButtonElement>("#pause-button")!.click();
    return app.dataset.presentationPaused === "true";
  }, undefined, { polling: 20, timeout: 20_000 });
}

async function advanceOneAndPause(page: Page, before: WorldState): Promise<WorldState> {
  await page.locator("#pause-button").click();
  await page.waitForFunction(({ campaignId, tick }) => {
    const raw = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    if (raw === null || JSON.parse(raw).tick <= tick) return false;
    const app = document.querySelector<HTMLElement>("#app")!;
    if (app.dataset.presentationPaused !== "true") document.querySelector<HTMLButtonElement>("#pause-button")!.click();
    return app.dataset.presentationPaused === "true";
  }, { campaignId: before.campaignId, tick: before.tick }, { polling: 20, timeout: 20_000 });
  const after = JSON.parse(await savedCampaign(page, before.campaignId)) as WorldState;
  expect(after.tick).toBe(before.tick + 1);
  expect(after).toEqual(advanceWorld(before));
  expect(await durableCampaign(page, before.campaignId)).toEqual(after);
  return after;
}

test("a saved autonomous town visit adds one truthful illustrated page without moving the open scrapbook", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  const inference: string[] = [];
  const externalRequests: string[] = [];
  const startedAt = Date.now();
  const milestone = (label: string): void => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short",
    }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    console.log(`[${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${parts.timeZoneName}] Chronicle Plates +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${label}`);
  };
  const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("worker", (worker) => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
  page.on("request", (request) => {
    if (modelUrl.test(request.url())) inference.push(request.url());
    if (new URL(request.url()).origin !== new URL(testInfo.project.use.baseURL!).origin) externalRequests.push(request.url());
  });
  try {
  milestone("preparing the existing saved-arrival fixtures");
  const fixture = firstTownFixture("campaign:browser-chronicle-plates");
  const otherFixture = firstTownFixture("campaign:browser-chronicle-plates-other");
  expect(advanceWorld(fixture).chronicle.at(-1)?.commandType).toBe("visit-town");
  milestone("fixtures ready; opening the built game");
  await page.addInitScript((worlds) => {
    for (const world of worlds) {
      const key = `the-grind-2:campaign:${world.campaignId}`;
      if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, JSON.stringify(world));
      localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 3_600_000));
    }
    if (sessionStorage.getItem("the-grind-2:activeCampaignId") === null) {
      sessionStorage.setItem("the-grind-2:activeCampaignId", worlds[0]!.campaignId);
    }
    localStorage.setItem("the-grind-2:play-mode:v1", '{"schemaVersion":1,"mode":"deterministic"}');
    localStorage.setItem("the-grind-2:adventure-speed:v1", '{"schemaVersion":1,"speed":1}');
    localStorage.setItem("the-grind-2:stage-focus:v1", "panels");
  }, [fixture, otherFixture]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./", { timeout: 25_000 });
  await pauseReady(page);
  milestone("initial game ready and paused");
  expect(JSON.parse(await savedCampaign(page, fixture.campaignId))).toEqual(fixture);
  const app = page.locator("#app");
  const toolbar = page.locator("#view-toolbar");
  const pages = page.locator("#journal-chronicle-plates");
  const summary = pages.locator(":scope > summary");
  const list = page.locator("#chronicle-plate-list");
  const refresh = page.locator("#chronicle-plate-refresh");
  await expect(toolbar.locator("[data-view]")).toHaveCount(8);
  await expect(pages).toBeHidden();
  await toolbar.locator('[data-view="journal"]').click();
  await page.locator("#journal-adventure-button").click();
  await expect(pages).toHaveJSProperty("open", false);
  await expect(summary).toHaveText("Pages from the Road");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(pages).toHaveJSProperty("open", true);
  await expect(list.locator("li[data-source-event]")).toHaveCount(0);
  const emptyList = await list.innerHTML();
  const visited = await advanceOneAndPause(page, fixture);
  milestone("actual first town visit saved in IndexedDB and session mirror");
  const source = visited.chronicle.at(-1)!;
  expect(source.commandType).toBe("visit-town");
  const itinerary = projectTownItinerary(fixture, visited, source);
  if (itinerary === null) throw new Error("The actual durable visit needs its canonical itinerary packet");
  const recipe = projectTownChroniclePlate(itinerary, { campaignId: visited.campaignId, currentTick: visited.tick });
  if (recipe === null) throw new Error("The actual durable visit needs its landmark recipe");
  await expect(refresh).toHaveText("Latest pages");
  await expect(pages).toHaveAttribute("data-pending-pages", "true");
  expect(await archivedPages(page)).toEqual([recipe]);
  await expect(pages).toHaveJSProperty("open", true);
  expect(await list.innerHTML()).toBe(emptyList);
  await refresh.focus();
  await page.keyboard.press("Enter");
  await expect(summary).toBeFocused();
  await expect(pages).toHaveAttribute("data-pending-pages", "false");
  const card = list.locator(`li[data-source-event="${source.id}"][data-campaign="${visited.campaignId}"]`);
  await expect(card).toHaveCount(1);
  await expect(list.locator("li[data-source-event]")).toHaveCount(1);
  const town = visited.depth.towns[visited.depth.atlas.currentLocationId]!;
  // Read settled static DOM once: the assertions below retain the exact same
  // identity, wording, landmark-kind, and no-raster/no-animation contracts.
  const presented = await card.evaluate((element) => {
    const svg = element.querySelector("svg")!;
    return {
      sourceTick: element.getAttribute("data-source-tick"),
      town: element.querySelector("h3")!.textContent,
      text: element.textContent!,
      html: element.innerHTML,
      svg: { hidden: svg.getAttribute("aria-hidden"), focusable: svg.getAttribute("focusable") },
      forbiddenVisuals: element.querySelectorAll("canvas, img, svg image, svg animate, svg animateTransform").length,
      landmarks: Array.from(element.querySelectorAll<HTMLElement>(".chronicle-plate-landmarks li")).map((row) => ({
        id: row.dataset.landmarkId, kind: row.dataset.landmarkKind,
        name: row.querySelector("strong")!.textContent, kindLabel: row.querySelector("span")!.textContent,
      })),
      visualLandmarks: Array.from(svg.querySelectorAll<SVGGElement>("g[data-landmark-id]")).map((group) => ({
        id: group.dataset.landmarkId, kind: group.dataset.landmarkKind,
      })),
    };
  });
  expect(presented.sourceTick).toBe(String(visited.tick));
  expect(presented.town).toBe(town.name);
  expect(presented.text).toContain(`Town visits ${recipe.visit.before}→${recipe.visit.after}`);
  expect(presented.text).toContain(`Reputation ${recipe.reputation.before}→${recipe.reputation.after}`);
  for (const landmark of recipe.landmarks) {
    expect(town.buildings.find((building) => building.id === landmark.id)).toMatchObject(landmark);
    expect(presented.text).toContain(landmark.name);
    expect(presented.text).toContain(landmark.kind);
  }
  expect(presented.landmarks).toEqual(recipe.landmarks.map((landmark) => ({
    id: landmark.id, kind: landmark.kind, name: landmark.name, kindLabel: landmark.kind,
  })));
  expect(presented.visualLandmarks).toEqual(recipe.landmarks.map(({ id, kind }) => ({ id, kind })));
  expect(presented.text).toContain("Illustrated reconstruction");
  expect(presented.svg).toEqual({ hidden: "true", focusable: "false" });
  expect(presented.forbiddenVisuals).toBe(0);
  const firstPage = presented.html;
  const saved = await savedCampaign(page, visited.campaignId);
  milestone("exact source recipe, caption and all landmark identities verified");

  for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    await summary.scrollIntoViewIfNeeded();
    const layout = await page.evaluate(() => {
      const journal = document.querySelector<HTMLElement>("#journal-view")!;
      const summary = document.querySelector<HTMLElement>("#journal-chronicle-plates > summary")!;
      const svg = document.querySelector<SVGSVGElement>("#chronicle-plate-list svg")!;
      const bounds = svg.getBoundingClientRect();
      const style = getComputedStyle(svg);
      return { journalFits: journal.scrollWidth <= journal.clientWidth + 1,
        documentFits: document.documentElement.scrollWidth <= innerWidth + 1,
        summaryHeight: summary.getBoundingClientRect().height,
        svgVisible: bounds.width > 0 && bounds.height > 0 && style.display !== "none" && style.visibility !== "hidden" };
    });
    expect(layout.journalFits).toBe(true);
    expect(layout.documentFits).toBe(true);
    expect(layout.summaryHeight).toBeGreaterThanOrEqual(44);
    expect(layout.svgVisible).toBe(true);
    if (process.env.TG2_VISUAL_CAPTURE === "1") {
      await card.scrollIntoViewIfNeeded();
      const path = testInfo.outputPath(`chronicle-plates-${viewport.width}.png`);
      await page.screenshot({ path, timeout: 8_000 });
      await testInfo.attach(`Chronicle Plates ${viewport.width}`, { path, contentType: "image/png" });
    }
    milestone(`${viewport.width}px layout complete${process.env.TG2_VISUAL_CAPTURE === "1" ? "; card captured" : "; reviewed capture reused"}`);
  }
  expect(await savedCampaign(page, visited.campaignId)).toBe(saved);
  expect(await durableCampaign(page, visited.campaignId)).toEqual(visited);
  const later = await advanceOneAndPause(page, visited);
  expect(later.chronicle.at(-1)?.commandType).not.toBe("visit-town");
  expect(await card.innerHTML()).toBe(firstPage);
  await expect(list.locator("li[data-source-event]")).toHaveCount(1);
  expect(await archivedPages(page)).toEqual([recipe]);
  milestone("later actual command preserved the exact old page; reloading");

  await page.reload({ waitUntil: "domcontentloaded" });
  await pauseReady(page);
  milestone("reload ready and paused");
  expect(JSON.parse(await savedCampaign(page, fixture.campaignId))).toEqual(later);
  await toolbar.locator('[data-view="journal"]').click();
  await page.locator("#journal-adventure-button").click();
  await expect(pages).toHaveJSProperty("open", false);
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(list.locator("li[data-source-event]")).toHaveCount(1);
  expect(await card.innerHTML()).toBe(firstPage);
  expect(await archivedPages(page)).toEqual([recipe]);
  milestone("reload retained exactly one unchanged page; checking current-hero filter");

  // The other saved hero has not visited yet. Switching must hide the actual
  // page above, even though this seed gives both heroes the same town names.
  await page.locator("#game-menu-button").click();
  await page.locator("#campaign-select").selectOption(otherFixture.campaignId);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("the-grind-2:activeCampaignId"))).toBe(otherFixture.campaignId);
  await expect(list.locator(`li[data-campaign="${fixture.campaignId}"]`)).toHaveCount(0);
  await expect(list.locator("li[data-source-event]")).toHaveCount(0);
  expect(JSON.parse(await savedCampaign(page, otherFixture.campaignId))).toEqual(otherFixture);
  expect(await archivedPages(page)).toEqual([recipe]);
  milestone("other hero correctly shows no pages");
  await page.locator("#game-menu-button").click();
  // Normal saves replace the init fixture's future checkpoint. Reapply that
  // existing offline-isolation seam before returning: time spent inspecting
  // another hero must not add an unrelated catch-up event to this paused test.
  await page.evaluate((campaignId) => {
    localStorage.setItem(`the-grind-2:last-active:${campaignId}`, String(Date.now() + 3_600_000));
  }, fixture.campaignId);
  await page.locator("#campaign-select").selectOption(fixture.campaignId);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("the-grind-2:activeCampaignId"))).toBe(fixture.campaignId);
  if (!(await pages.evaluate((element) => (element as HTMLDetailsElement).open))) await summary.click();
  await expect(list.locator("li[data-source-event]")).toHaveCount(1);
  expect(await card.innerHTML()).toBe(firstPage);
  expect(JSON.parse(await savedCampaign(page, fixture.campaignId))).toEqual(later);
  expect(await durableCampaign(page, fixture.campaignId)).toEqual(later);
  expect(await archivedPages(page)).toEqual([recipe]);
  await toolbar.locator('[data-view="watch"]').click();
  await expect(pages).toBeHidden();
  await expect(app).toHaveAttribute("data-play-mode", "deterministic");
  await expect(app).toHaveAttribute("data-creative-story-state", "off");
  expect(inference).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
  milestone("all assertions passed");
  } finally {
    milestone(`browser diagnostics: ${errors.length} errors, ${inference.length} inference requests/workers, ${externalRequests.length} external requests`);
    await testInfo.attach("Chronicle Plates browser diagnostics", {
      body: JSON.stringify({ errors, inference, externalRequests, elapsedMs: Date.now() - startedAt }, null, 2),
      contentType: "application/json",
    });
  }
});
