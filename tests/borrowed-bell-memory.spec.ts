import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, campaignDirector, upgradeWorldState } from "../src/core/simulation";
import { borrowedBellMemoryCampaignId, naturalBorrowedBellMemoryFixture } from "./borrowed-bell-memory-fixtures";

async function pausedSave(page: Page, afterTick?: number): Promise<string> {
  return page.evaluate(async ({ id, tick }) => new Promise<string>((resolve, reject) => {
    const app = document.querySelector<HTMLElement>("#app")!, button = document.querySelector<HTMLButtonElement>("#pause-button")!;
    let requested = false;
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Delivery memory did not settle and pause within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const saved = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (saved === null || tick !== undefined && JSON.parse(saved).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; button.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(saved);
    }, 20);
    if (tick !== undefined) button.click();
  }), { id: borrowedBellMemoryCampaignId, tick: afterTick });
}

test("an earned roadside recovery remembers the delivered bell once before the same waiting encounter", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const ready = naturalBorrowedBellMemoryFixture(), expected = advanceWorld(ready), memory = expected.depth.bellMemory!;
  if (memory.rest.kind !== "roadside") throw new Error("The natural acceptance journey must use its actual roadside recovery");
  const rest = memory.rest, route = rest.route;
  const name = (id: string): string => ready.depth.atlas.locations.find(location => location.id === id)!.name;
  const routeName = `${name(route.path[route.legIndex]!)} → ${name(route.path[route.legIndex + 1]!)}`;
  const errors: string[] = [], inference: string[] = [], external: string[] = [], startedAt = Date.now();
  const milestone = (message: string): void => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map(part => [part.type, part.value]));
    console.log(`[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}] Delivery memory +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${message}`);
  };
  const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("worker", worker => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
  page.on("request", request => {
    if (modelUrl.test(request.url())) inference.push(request.url());
    if (new URL(request.url()).origin !== new URL(testInfo.project.use.baseURL!).origin) external.push(request.url());
  });
  const capture = async (label: string): Promise<void> => {
    if (process.env.TG2_VISUAL_CAPTURE !== "1") return;
    const path = testInfo.outputPath(`${label}.png`);
    await page.screenshot({ path, timeout: 8_000 });
    await testInfo.attach(label, { path, contentType: "image/png" });
  };
  const proveMemory = async (): Promise<void> => {
    await expect.poll(async () => page.evaluate(() => {
      const caption = document.querySelector<HTMLElement>("#bell-caption")!, stage = document.querySelector<HTMLElement>("#stage")!;
      const visible = (node: HTMLElement): boolean => !node.hidden && getComputedStyle(node).display !== "none" && node.getBoundingClientRect().width > 0;
      return { caption: { ...caption.dataset }, stage: { ...stage.dataset }, visible: visible(caption),
        title: caption.querySelector("h2")?.textContent, narrative: caption.querySelector(".bell-narrative")?.textContent,
        note: caption.querySelector(".bell-note")?.textContent,
        inventedBoard: ["cell", "turn", "roll", "outcome", "inn"].some(key => key in caption.dataset)
          || ["bellCell", "bellTurn", "bellRoll", "bellPath", "bellOutcome", "bellKnownEffects", "bellMemoryInn"].some(key => key in stage.dataset),
        extraRows: caption.querySelectorAll(".bell-choice, .bell-deadline").length,
        staleBattle: visible(document.querySelector<HTMLElement>("#battle-turn-strip")!),
        staleRepartee: visible(document.querySelector<HTMLElement>("#repartee-caption")!) };
    }), { timeout: 8_000 }).toMatchObject({
      caption: { phase: "memory", command: `${expected.campaignId}:${memory.sourceCommandId}`, memorySource: memory.evidenceSourceCommandId,
        location: rest.locationId, restKind: "roadside", hero: memory.heroId },
      stage: { bellPhase: "memory", bellMemorySource: memory.evidenceSourceCommandId, bellMemoryLocation: rest.locationId,
        bellMemoryRestKind: "roadside", bellCarried: "false", bellVisual: expect.stringContaining("actual-roadside-camp") },
      visible: true, title: `Roadside camp · ${routeName}`, narrative: `${ready.depth.hero.name}: “${memory.line}”`,
      note: `Camp recovery: HP ${rest.healthBefore} → ${rest.healthAfter} · MP ${rest.manaBefore} → ${rest.manaAfter} · gold ${rest.goldAfter}, unchanged.`,
      inventedBoard: false, extraRows: 0, staleBattle: false, staleRepartee: false,
    });
    await expect.poll(async () => page.evaluate(() => {
      const caption = document.querySelector<HTMLElement>("#bell-caption")!, stage = document.querySelector<HTMLElement>("#stage")!;
      const canvas = stage.querySelector("canvas")!, host = stage.getBoundingClientRect();
      const layout = (stage.dataset.sceneLayout ?? "").split(",").map(Number), safe = (stage.dataset.bellSafeRect ?? "").split(",").map(Number);
      if (layout.length !== 3 || safe.length !== 4 || [...layout, ...safe].some(value => !Number.isFinite(value))) return null;
      const [scale = 0, x = 0, y = 0] = layout, [left = 0, top = 0, right = 0, bottom = 0] = safe;
      const scene = { left: host.left + x, top: host.top + y, right: host.left + x + 320 * scale, bottom: host.top + y + 180 * scale };
      const clear = [".topbar", ".view-toolbar", "#stage-focus-ribbon", "#stage-focus-controls", "#bell-caption"].every(selector => {
        const node = document.querySelector<HTMLElement>(selector);
        if (node === null || node.hidden || getComputedStyle(node).display === "none") return true;
        const box = node.getBoundingClientRect();
        return box.width === 0 || box.height === 0 || scene.right <= box.left + 0.5 || scene.left >= box.right - 0.5
          || scene.bottom <= box.top + 0.5 || scene.top >= box.bottom - 0.5;
      });
      const actorsClear = [[124, 125], [182, 73]].every(([px = 0, py = 0]) =>
        document.elementFromPoint(host.left + x + px * scale, host.top + y + py * scale) === canvas);
      const rows = [...caption.querySelectorAll<HTMLElement>("h2, .bell-narrative, .bell-note")].map(row => {
        row.scrollIntoView({ block: "nearest", inline: "nearest" });
        const box = row.getBoundingClientRect(), clip = caption.getBoundingClientRect(), hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return parseFloat(getComputedStyle(row).fontSize) >= 11 && box.top >= clip.top - 1 && box.bottom <= clip.bottom + 1
          && box.left >= clip.left - 1 && box.right <= clip.right + 1 && hit !== null && (hit === row || row.contains(hit));
      });
      return { adequateStage: scale * 320 >= (innerWidth <= 760 ? Math.min(280, innerWidth - 32) : 380) - 1,
        safeStage: scale > 0 && x >= left - 1 && y >= top - 1 && x + scale * 320 <= right + 1 && y + scale * 180 <= bottom + 1,
        inViewport: scene.left >= -1 && scene.top >= -1 && scene.right <= innerWidth + 1 && scene.bottom <= innerHeight + 1,
        clear, actorsClear, readableRows: rows.length === 3 && rows.every(Boolean), pageFits: document.documentElement.scrollWidth <= innerWidth + 1 };
    }), { timeout: 8_000 }).toEqual({ adequateStage: true, safeStage: true, inViewport: true,
      clear: true, actorsClear: true, readableRows: true, pageFits: true });
  };
  try {
    await page.addInitScript(state => {
      const key = `the-grind-2:campaign:${state.campaignId}`;
      if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, JSON.stringify(state));
      sessionStorage.setItem("the-grind-2:activeCampaignId", state.campaignId);
      const resumingMemory = JSON.parse(sessionStorage.getItem(key)!).depth.bellMemory !== null;
      localStorage.setItem(`the-grind-2:last-active:${state.campaignId}`, String(Date.now() + (resumingMemory ? -60_000 : 3_600_000)));
      localStorage.setItem("the-grind-2:play-mode:v1", '{"schemaVersion":1,"mode":"deterministic"}');
      localStorage.setItem("the-grind-2:adventure-speed:v1", '{"schemaVersion":1,"speed":1}');
      localStorage.setItem("the-grind-2:stage-focus:v1", "panels");
      const pause = window.setInterval(() => {
        if (document.documentElement?.dataset.ready !== "true") return;
        const app = document.querySelector<HTMLElement>("#app"), button = document.querySelector<HTMLButtonElement>("#pause-button");
        if (app === null || button === null) return;
        if (app.dataset.presentationPaused !== "true") button.click();
        window.clearInterval(pause);
      }, 20);
    }, ready);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./?fast", { timeout: 25_000 });
    expect(JSON.parse(await pausedSave(page))).toEqual(ready);
    const saved = await pausedSave(page, ready.tick);
    expect(JSON.parse(saved)).toEqual(expected);
    expect(expected.depth.hero.gold).toBe(ready.depth.hero.gold);
    expect(expected.depth.hero.experience).toBe(ready.depth.hero.experience);
    expect(expected.depth.atlas.route).toEqual(ready.depth.atlas.route);
    expect(expected.depth.companions).toEqual(ready.depth.companions);
    milestone(`actual T${ready.tick} roadside recovery speaks at T${expected.tick} using the retained T${memory.evidenceTick} delivery`);
    await proveMemory(); await capture("bell-memory-1280");
    await page.setViewportSize({ width: 320, height: 568 });
    await proveMemory(); await capture("bell-memory-320");
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await proveMemory(); await capture("bell-memory-320-focus");
    expect(await pausedSave(page)).toBe(saved);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    const journal = await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="journal"]')!.click();
      const panel = document.querySelector<HTMLDetailsElement>("#journal-bell")!; panel.open = true;
      const memory = panel.querySelector<HTMLDetailsElement>(".bell-memory")!; memory.open = true;
      return { data: { ...memory.dataset }, line: memory.querySelector(".bell-memory-line")!.textContent, text: memory.textContent,
        count: panel.querySelectorAll(".bell-memory").length };
    });
    expect(journal.data).toEqual({ command: memory.sourceCommandId, evidence: memory.evidenceSourceCommandId, location: rest.locationId, restKind: "roadside" });
    expect(journal.count).toBe(1);
    expect(journal.line).toBe(memory.line);
    expect(journal.text).toContain(routeName);
    expect(journal.text).toContain(memory.completionSourceCommandId);
    expect(journal.text).toContain(rest.encounterId);
    expect(journal.text).toContain("No new delivery bonus or relationship change");
    await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click());
    // A real stale checkpoint must not skip this scene into its waiting encounter.
    await page.goto("./", { timeout: 25_000 });
    expect(await pausedSave(page)).toBe(saved);
    expect(upgradeWorldState(JSON.parse(saved))).toEqual(expected);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#pause-button")!.click());
    await page.waitForTimeout(1_100);
    expect(await pausedSave(page)).toBe(saved);
    await proveMemory();
    milestone("exact Journal and normal-speed resume survive 60 seconds of stale checkpoint debt");
    await page.goto("./?fast", { timeout: 25_000 });
    expect(await pausedSave(page)).toBe(saved);
    expect(campaignDirector(expected).candidates[0]?.command).toMatchObject({ type: "start-combat", encounterId: rest.encounterId });
    const continued = JSON.parse(await pausedSave(page, expected.tick));
    expect(continued).toEqual(advanceWorld(expected));
    expect(continued.depth.bellMemory).toEqual(memory);
    expect(continued.depth.bellExpedition).toEqual(expected.depth.bellExpedition);
    expect(continued.depth.hero.gold).toBe(expected.depth.hero.gold);
    expect(continued.depth.hero.experience).toBe(expected.depth.hero.experience + 8);
    await expect(page.locator("#bell-caption")).toBeHidden();
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone("one memory, exact recovery, desktop/mobile/Focus, no repeated bonus and the same waiting encounter passed");
  } finally {
    await testInfo.attach("Delivery memory diagnostics", { body: JSON.stringify({ errors, inference, external,
      elapsedMs: Date.now() - startedAt, memory }, null, 2), contentType: "application/json" });
  }
});
