import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, createWorld } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { projectAtlasBattleMemory } from "../src/ui/atlas-battle-memory";

async function pauseOnReady(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    let pauseRequested = false;
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Ready adventure did not pause within 20 seconds")); }, 20_000);
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
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Automatic atlas turn did not settle within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      const saved = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
      if (saved === null || JSON.parse(saved).tick <= tick) return;
      // Request the pending pause once; repeated clicks would resume again.
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

async function memorySnapshot(page: Page, campaignId: string, view?: "map" | "watch") {
  return page.evaluate(async ({ id, view }) => {
    if (view !== undefined) document.querySelector<HTMLButtonElement>(`#view-toolbar [data-view="${view}"]`)!.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const stage = document.querySelector<HTMLElement>("#stage")!;
    const history = document.querySelector<HTMLDetailsElement>("#gazetteer-entry .gazetteer-battle-memory");
    return {
      activeView: document.querySelector<HTMLElement>("#app")!.dataset.activeView,
      sceneMode: stage.dataset.sceneMode,
      count: stage.getAttribute("data-atlas-battle-memory-count"),
      edges: stage.getAttribute("data-atlas-battle-memory-edges"),
      projection: stage.getAttribute("data-atlas-battle-memory-projection"),
      selectedPlace: document.querySelector<HTMLSelectElement>("#gazetteer-place")!.value,
      districts: [...document.querySelectorAll<HTMLElement>("#gazetteer-entry .gazetteer-district")].map((district) => ({
        id: district.dataset.districtId, open: district.querySelector<HTMLDetailsElement>("details")!.open })),
      history: history === null ? null : { open: history.open,
        focused: history.querySelector("summary") === document.activeElement,
        summary: history.querySelector("summary")!.textContent, note: history.querySelector("small")!.textContent,
        rows: [...history.querySelectorAll<HTMLElement>("li")].map((row) => ({ ...row.dataset,
          road: row.querySelector("strong")!.textContent, label: row.querySelector("span")!.textContent })) },
      saved: sessionStorage.getItem(`the-grind-2:campaign:${id}`),
    };
  }, { id: campaignId, view });
}

async function captureLayout(page: Page, campaignId: string, expanded: boolean) {
  return page.evaluate(async ({ id, expanded }) => {
    const map = document.querySelector<HTMLElement>("#map-inspector")!;
    const gazetteer = document.querySelector<HTMLDetailsElement>("#map-gazetteer")!;
    if (gazetteer.open !== expanded) gazetteer.querySelector<HTMLElement>(":scope > summary")!.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const toolbar = document.querySelector<HTMLElement>("#view-toolbar")!;
    const returnButton = map.querySelector<HTMLElement>(":scope > .view-close")!;
    const overview = map.querySelector<HTMLElement>(".map-overview")!;
    const scrollHost = expanded && getComputedStyle(overview).overflowY === "auto" ? overview : map;
    const history = document.querySelector<HTMLDetailsElement>("#gazetteer-entry .gazetteer-battle-memory")!;
    const targets = expanded ? [history.querySelector("summary")!, history.querySelector("small")!, ...history.querySelectorAll("li")]
      : [gazetteer.querySelector(":scope > summary")!];
    const reached = targets.map((target) => {
      scrollHost.scrollTop += target.getBoundingClientRect().top - Math.max(scrollHost.getBoundingClientRect().top + 12, toolbar.getBoundingClientRect().bottom + 2);
      const rect = target.getBoundingClientRect(), host = scrollHost.getBoundingClientRect();
      const button = returnButton.getBoundingClientRect();
      const returnOverlaps = expanded && rect.left < button.right && rect.right > button.left
        && rect.top < button.bottom && rect.bottom > button.top;
      const hit = document.elementFromPoint(rect.left + Math.min(4, rect.width / 2), rect.top + Math.min(4, rect.height / 2));
      return rect.left >= host.left - 1 && rect.right <= host.right + 1
        && rect.top >= Math.max(host.top, toolbar.getBoundingClientRect().bottom) - 1 && rect.bottom <= host.bottom + 1
        && !returnOverlaps && hit !== null && target.contains(hit);
    });
    if (expanded) scrollHost.scrollTop += history.getBoundingClientRect().top - Math.max(scrollHost.getBoundingClientRect().top + 12, toolbar.getBoundingClientRect().bottom + 2);
    else map.scrollTop = 0;
    const rect = map.getBoundingClientRect();
    const summary = history.querySelector("summary")!.getBoundingClientRect();
    const button = returnButton.getBoundingClientRect();
    const summaryCovered = expanded && summary.left < button.right && summary.right > button.left
      && summary.top < button.bottom && summary.bottom > button.top;
    return { reached, horizontalFit: document.documentElement.scrollWidth <= innerWidth + 1,
      top: rect.top, bottom: rect.bottom, toolbarBottom: toolbar.getBoundingClientRect().bottom,
      viewportHeight: innerHeight, pageScrollY: scrollY, expanded: gazetteer.open,
      historyOpen: history.open, summaryCovered, paused: document.querySelector<HTMLElement>("#app")!.dataset.presentationPaused,
      saved: sessionStorage.getItem(`the-grind-2:campaign:${id}`) };
  }, { id: campaignId, expanded });
}

test("recorded road battles appear only on the known Map and its read-only place dossier", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const startedAt = Date.now();
  const milestone = (label: string): void => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    console.log(`[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}] Atlas battle memory +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${label}`);
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
    // Real autonomous history only. Wait for known road endpoints and a natural
    // route-planning scene so Watch cleanup is tested even while it draws an atlas.
    let fixture = createWorld("golden:1", "campaign:1");
    let firstMemoryTick: number | null = null;
    for (let turn = 0; turn < 200; turn++) {
      fixture = advanceWorld(fixture);
      if (projectAtlasBattleMemory(fixture.depth).length > 0) {
        firstMemoryTick ??= fixture.tick;
        if (fixture.scene.mode === "atlas") break;
      }
    }
    const memories = projectAtlasBattleMemory(fixture.depth);
    expect(memories.length).toBeGreaterThan(0);
    expect(memories.length).toBeLessThanOrEqual(4);
    expect(firstMemoryTick).toBe(12);
    expect(fixture.tick).toBe(15);
    expect(fixture.scene.mode).toBe("atlas");
    const memory = memories[0]!;
    expect(memory).toMatchObject({ edgeId: "location:0~location:8", fromLocationId: "location:0", destinationLocationId: "location:8",
      fromName: "Cinderreach", destinationName: "Ambervale", combatId: "encounter:route:location:0>location:8",
      outcome: "victory", speciesNames: ["River Wyrmling"], position: { terrainX: 311, terrainY: 113 } });
    const completed = fixture.depth.completedCombats.find((entry) => entry.id === memory.combatId)!;
    expect(completed.outcome).toBe(memory.outcome);
    expect(fixture.depth.atlas.discoveredLocationIds).toEqual(expect.arrayContaining([memory.fromLocationId, memory.destinationLocationId]));
    const sourceBefore = JSON.stringify(completed);
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
    const watch = await memorySnapshot(page, fixture.campaignId, "watch");
    expect(watch).toMatchObject({ activeView: "watch", sceneMode: "atlas", count: null, edges: null, projection: null });
    expect(JSON.parse(watch.saved!)).toEqual(fixture);
    const map = await memorySnapshot(page, fixture.campaignId, "map");
    expect(map).toMatchObject({ activeView: "map", sceneMode: "atlas", count: String(memories.length),
      edges: JSON.stringify(memories.map((record) => record.edgeId)), projection: "atlas-battle-memory-v1", saved: watch.saved });
    const summary = page.locator("#map-gazetteer > summary");
    await summary.focus(); await page.keyboard.press("Enter");
    await page.locator("#gazetteer-place").selectOption(memory.fromLocationId);
    const closed = await memorySnapshot(page, fixture.campaignId);
    const expectedRows = memories.filter((record) => record.fromLocationId === memory.fromLocationId || record.destinationLocationId === memory.fromLocationId)
      .map((record) => ({ edgeId: record.edgeId, combatId: record.combatId, outcome: record.outcome,
        road: `${record.fromName} — ${record.destinationName}`, label: `${record.speciesNames.join(", ")} · ${record.outcome}` }));
    expect(closed.history).toMatchObject({ open: false, summary: `◇ Recorded road battles (${expectedRows.length})`,
      note: "Historical road records—not current danger or a creature's present position.", rows: expectedRows });
    expect(closed.saved).toBe(watch.saved);
    const district = closed.districts[0]!;
    expect(district).toMatchObject({ open: false });
    await page.locator(`#gazetteer-entry [data-district-id="${district.id}"] > details > summary`).focus();
    await page.keyboard.press("Enter");
    const historySummary = page.locator("#gazetteer-entry .gazetteer-battle-memory > summary");
    await historySummary.focus(); await page.keyboard.press("Enter");
    milestone(`natural first memory at T${firstMemoryTick}; real atlas checkpoint T${fixture.tick} shows exact completed road source only in Map`);
    const advanced = await automaticStep(page, fixture);
    const after = await memorySnapshot(page, fixture.campaignId);
    expect(after).toMatchObject({ selectedPlace: memory.fromLocationId, history: { open: true, focused: true, rows: expectedRows } });
    expect(after.districts.find((entry) => entry.id === district.id)).toMatchObject({ open: true });
    expect(JSON.parse(after.saved!)).toEqual(advanced);
    expect(JSON.stringify(advanced.depth.completedCombats.find((entry) => entry.id === memory.combatId))).toBe(sourceBefore);
    expect(projectAtlasBattleMemory(advanced.depth)).toEqual(memories);
    milestone("one real autoplay turn preserves the historical source, selected endpoint, and native disclosure focus");
    for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      for (const expanded of [false, true]) {
        const layout = await captureLayout(page, fixture.campaignId, expanded);
        expect(layout).toMatchObject({ horizontalFit: true, pageScrollY: 0, expanded, historyOpen: true, summaryCovered: false, paused: "true", saved: after.saved });
        expect(layout.reached.every(Boolean)).toBe(true);
        expect(layout.top).toBeGreaterThanOrEqual(layout.toolbarBottom - 1);
        expect(layout.bottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
        if (process.env.TG2_VISUAL_CAPTURE === "1") {
          const label = expanded ? "record" : "map";
          const path = testInfo.outputPath(`atlas-battle-memory-${viewport.width}-${label}.png`);
          await page.screenshot({ path, timeout: 8_000 });
          await testInfo.attach(`Recorded road battle ${viewport.width} ${label}`, { path, contentType: "image/png" });
        }
      }
      milestone(`${viewport.width}px road glyph and source-labelled native history are reachable without changing the paused save`);
    }
    await page.locator("#map-inspector > .view-close").click();
    expect(await memorySnapshot(page, fixture.campaignId)).toMatchObject({ activeView: "watch", count: null, edges: null, projection: null, saved: after.saved });
    await page.reload({ timeout: 25_000 });
    await pauseOnReady(page);
    const restored = await memorySnapshot(page, fixture.campaignId, "map");
    expect(restored).toMatchObject({ count: String(memories.length), edges: map.edges, projection: map.projection, saved: after.saved });
    await page.evaluate(() => {
      const details = document.querySelector<HTMLDetailsElement>("#map-gazetteer")!;
      if (!details.open) details.querySelector<HTMLElement>(":scope > summary")!.click();
    });
    await page.locator("#gazetteer-place").selectOption(memory.fromLocationId);
    const retained = await memorySnapshot(page, fixture.campaignId);
    expect(retained.history).toMatchObject({ rows: expectedRows, note: closed.history!.note });
    expect(retained.saved).toBe(after.saved);
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone("actual reload derives the same bounded road history from the exact canonical save; all assertions passed");
  } finally {
    milestone(`browser diagnostics: ${errors.length} errors, ${inference.length} inference, ${external.length} external requests`);
    await testInfo.attach("Atlas battle memory diagnostics", { body: JSON.stringify({ errors, inference, external, elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
