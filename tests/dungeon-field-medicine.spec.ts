import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, campaignDirector, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { emberTonicId, restorativeHealthAmount } from "../src/depth/rpg";
import { projectDungeonFraming } from "../src/render/dungeon-framing";
import { projectDungeonFieldMedicineScene } from "../src/ui/dungeon-field-medicine-view";
import { dungeonFieldMedicineCampaignId, naturalDungeonFieldMedicineFixture } from "./dungeon-field-medicine-fixtures";

async function installFixture(page: Page, fixture: WorldState): Promise<void> {
  await page.addInitScript(state => {
    const key = `the-grind-2:campaign:${state.campaignId}`;
    if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, JSON.stringify(state));
    sessionStorage.setItem("the-grind-2:activeCampaignId", state.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${state.campaignId}`, String(Date.now() + 3_600_000));
    localStorage.setItem("the-grind-2:play-mode:v1", '{"schemaVersion":1,"mode":"deterministic"}');
    localStorage.setItem("the-grind-2:adventure-speed:v1", '{"schemaVersion":1,"speed":1}');
    localStorage.setItem("the-grind-2:stage-focus:v1", "panels");
    localStorage.setItem("the-grind-2:dungeon-perspective:v1", '{"schemaVersion":1,"perspective":"map"}');
    const pause = window.setInterval(() => {
      if (document.documentElement?.dataset.ready !== "true") return;
      const app = document.querySelector<HTMLElement>("#app"), button = document.querySelector<HTMLButtonElement>("#pause-button");
      if (app === null || button === null) return;
      if (app.dataset.presentationPaused !== "true") button.click();
      window.clearInterval(pause);
    }, 20);
  }, fixture);
}

async function pausedSave(page: Page, afterTick?: number): Promise<string> {
  return page.evaluate(({ id, tick }) => new Promise<string>((resolve, reject) => {
    const app = document.querySelector<HTMLElement>("#app")!, button = document.querySelector<HTMLButtonElement>("#pause-button")!;
    let requested = false;
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Medicine turn did not settle within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (raw === null || tick !== undefined && JSON.parse(raw).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; button.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(raw);
    }, 20);
    if (tick !== undefined) button.click();
  }), { id: dungeonFieldMedicineCampaignId, tick: afterTick });
}

function priorStories(world: WorldState): string {
  return JSON.stringify({ repartee: world.depth.repartee, witness: world.depth.reparteeWitness,
    callback: world.depth.reparteeCallback, lesson: world.depth.usefulReply, challenge: world.depth.roomChallenge,
    bell: world.depth.bellExpedition, bellMemory: world.depth.bellMemory, reunion: world.depth.companionReunion });
}

async function proveMedicine(page: Page, world: WorldState): Promise<void> {
  const dungeon = world.depth.dungeon!, use = dungeon.latestFieldMedicineUse!, scene = projectDungeonFieldMedicineScene(world)!;
  const known = new Set(dungeon.discoveredCellIds);
  const frame = projectDungeonFraming(dungeon.cells.filter(cell => known.has(cell.id)).map(({ x, y }) => ({ x, y })))!;
  await expect.poll(async () => page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>("#stage")!, health = document.querySelector<HTMLProgressElement>("#watch-hero-health")!;
    return { stage: { ...stage.dataset }, health: { value: health.value, max: health.max },
      healthText: document.querySelector("#watch-hero-health-text")?.textContent,
      storyPanelHidden: document.querySelector<HTMLElement>("#repartee-caption")!.hidden };
  }), { timeout: 8_000 }).toMatchObject({ stage: {
    dungeonMedicineCommand: `${world.campaignId}:${use.sourceCommandId}`, dungeonMedicineDungeon: dungeon.id,
    dungeonMedicineCell: use.cellId, dungeonMedicineItem: use.itemId,
    dungeonMedicineHealth: `${use.healthBefore}/${use.amount}/${use.healthAfter}`,
    dungeonMedicineQuantity: `${use.quantityBefore}/${use.quantityAfter}`, dungeonHeroCell: dungeon.currentCellId,
    dungeonMedicinePerspective: "map", dungeonMedicineVisual: "stationary-hero|held-tonic-vial|actual-hp-recovery",
    dungeonTraversalMode: "field-medicine", dungeonBreadcrumbLength: "0", dungeonNextDirections: "",
    dungeonCaptionTitle: scene.headline, dungeonFraming: "discovered-rooms", dungeonFrameRooms: String(frame.roomCount),
    dungeonFrameCellSize: String(frame.cellSize), dungeonFrameOffset: `${frame.offsetX},${frame.offsetY}`,
    dungeonFrameBounds: `${frame.bounds.minX},${frame.bounds.minY},${frame.bounds.maxX},${frame.bounds.maxY}`,
  }, health: { value: use.healthAfter, max: use.maxHealth }, healthText: `HP ${use.healthAfter}/${use.maxHealth}`, storyPanelHidden: true });
  await proveViewport(page);
  const stage = await page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset }));
  expect(["wide", "compact"]).toContain(stage.dungeonCaptionLayout);
  expect(stage.dungeonCaptionDetail).toBe(stage.dungeonCaptionLayout === "compact" ? scene.compactDetail : scene.detail);
  expect(stage.dungeonSearch).toBeUndefined();
  expect(Number(stage.dungeonCaptionTitleSize)).toBeGreaterThanOrEqual(12 - 0.001);
  expect(Number(stage.dungeonCaptionDetailSize)).toBeGreaterThanOrEqual(11 - 0.001);
  const [railX = 0, railY = 0, railWidth = 0, railHeight = 0] = stage.dungeonCaptionRail!.split(",").map(Number);
  expect(railY + railHeight).toBeLessThan(32);
  const bounds = JSON.parse(stage.dungeonCaptionBounds!) as { title: number[] | null; detail: number[] | null };
  expect(bounds.title).not.toBeNull(); expect(bounds.detail).not.toBeNull();
  for (const [x = 0, y = 0, width = 0, height = 0] of [bounds.title!, bounds.detail!]) {
    expect(width).toBeGreaterThan(0); expect(height).toBeGreaterThan(0);
    expect(x).toBeGreaterThanOrEqual(railX); expect(y).toBeGreaterThanOrEqual(railY);
    expect(x + width).toBeLessThanOrEqual(railX + railWidth + 0.01);
    expect(y + height).toBeLessThanOrEqual(railY + railHeight + 0.01);
  }
  expect(bounds.title![1]! + bounds.title![3]!).toBeLessThanOrEqual(bounds.detail![1]! + 0.01);
}

async function proveViewport(page: Page): Promise<void> {
  await expect.poll(async () => page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>("#stage")!, canvas = stage.querySelector("canvas")!, host = stage.getBoundingClientRect();
    const layout = (stage.dataset.sceneLayout ?? "").split(",").map(Number);
    if (layout.length !== 3 || layout.some(value => !Number.isFinite(value))) return null;
    const [scale = 0, x = 0, y = 0] = layout;
    const room = { left: host.left + x + 44 * scale, top: host.top + y + 32 * scale,
      right: host.left + x + 276 * scale, bottom: host.top + y + 156 * scale };
    const unobscured = ["#topbar", "#view-toolbar", "#stage-focus-ribbon", "#stage-focus-controls", "#hero-hud", "#chronicle"].every(selector => {
      const node = document.querySelector<HTMLElement>(selector);
      if (node === null || node.hidden || getComputedStyle(node).display === "none") return true;
      const box = node.getBoundingClientRect();
      return box.width === 0 || box.height === 0 || room.right <= box.left + 0.5 || room.left >= box.right - 0.5
        || room.bottom <= box.top + 0.5 || room.top >= box.bottom - 0.5;
    });
    const roomClear = [[64, 50], [256, 50], [160, 98], [64, 145], [256, 145]].every(([px = 0, py = 0]) =>
      document.elementFromPoint(host.left + x + px * scale, host.top + y + py * scale) === canvas);
    const cue = (stage.dataset.dungeonMedicineCuePosition ?? "").split(",").map(Number), [cx = 0, cy = 0] = cue;
    const cueVisible = cue.length === 2 && cue.every(Number.isFinite) && cx >= 44 && cx <= 276 && cy >= 32 && cy <= 156
      && document.elementFromPoint(host.left + x + cx * scale, host.top + y + cy * scale) === canvas;
    return { roomWideEnough: room.right - room.left >= (innerWidth <= 760 ? 200 : 350),
      inViewport: room.left >= -1 && room.top >= -1 && room.right <= innerWidth + 1 && room.bottom <= innerHeight + 1,
      unobscured, roomClear, cueVisible, captionSized: Number(stage.dataset.dungeonCaptionTitleSize) >= 12 - 0.001
        && Number(stage.dataset.dungeonCaptionDetailSize) >= 11 - 0.001,
      pageFits: document.documentElement.scrollWidth <= innerWidth + 1 };
  }), { timeout: 8_000 }).toEqual({ roomWideEnough: true, inViewport: true, unobscured: true,
    roomClear: true, cueVisible: true, captionSized: true, pageFits: true });
}

async function proveStatus(page: Page, world: WorldState): Promise<void> {
  const source = world.chronicle.at(-1)!, mechanic = world.depth.log.at(-1)!;
  const shown = await page.evaluate(({ eventId, mechanicalId }) => {
    document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="journal"]')!.click();
    document.querySelector<HTMLButtonElement>("#journal-status-button")!.click();
    document.querySelector<HTMLButtonElement>("#journal-status-refresh")!.click();
    const rows = [...document.querySelectorAll<HTMLElement>("#journal-status-list > li")];
    const chronicle = rows.find(row => row.dataset.source === "chronicle" && row.dataset.eventId === eventId)!;
    const mechanical = rows.find(row => row.dataset.source === "mechanics" && row.dataset.eventId === mechanicalId)!;
    chronicle.querySelector<HTMLDetailsElement>("details")!.open = true;
    return { chronicle: chronicle.textContent, mechanics: mechanical.textContent, count: rows.filter(row => row.dataset.eventId === eventId).length };
  }, { eventId: source.id, mechanicalId: mechanic.id });
  expect(shown.count).toBe(1);
  for (const text of [source.commandId, source.action, source.consequence]) expect(shown.chronicle).toContain(text);
  expect(shown.mechanics).toContain(mechanic.message);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click());
}

test("an actually wounded dungeon explorer drinks one owned tonic, stays in place, and continues without replaying the dose", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const ready = naturalDungeonFieldMedicineFixture(), expected = advanceWorld(ready);
  const dungeon = ready.depth.dungeon!, use = expected.depth.dungeon!.latestFieldMedicineUse!;
  const item = ready.depth.hero.inventory.find(entry => entry.id === emberTonicId(ready.depth.hero.id))!;
  const errors: string[] = [], inference: string[] = [], external: string[] = [], startedAt = Date.now();
  const milestone = (message: string): void => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map(part => [part.type, part.value]));
    console.log(`[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}] Dungeon medicine +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${message}`);
  };
  const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("worker", worker => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
  page.on("request", request => {
    if (modelUrl.test(request.url())) inference.push(request.url());
    if (new URL(request.url()).origin !== new URL(testInfo.project.use.baseURL!).origin) external.push(request.url());
  });
  const capture = async (name: string): Promise<void> => {
    if (process.env.TG2_VISUAL_CAPTURE !== "1") return;
    const path = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path, timeout: 8_000 });
    await testInfo.attach(name, { path, contentType: "image/png" });
  };
  try {
    expect(ready.depth.hero.resources.health).toBeGreaterThan(0);
    expect(ready.depth.hero.resources.health * 2).toBeLessThanOrEqual(ready.depth.hero.resources.maxHealth);
    expect(ready.depth.companions.active).toEqual([]);
    expect(campaignDirector(ready).candidates[0]?.command).toEqual({ type: "use-dungeon-tonic",
      dungeonId: dungeon.id, cellId: dungeon.currentCellId, itemId: item.id });
    const amount = Math.min(ready.depth.hero.resources.maxHealth - ready.depth.hero.resources.health,
      restorativeHealthAmount(item, ready.depth.hero.resources.maxHealth));
    expect(use).toMatchObject({ heroId: ready.depth.hero.id, dungeonId: dungeon.id, cellId: dungeon.currentCellId,
      itemId: item.id, healthBefore: ready.depth.hero.resources.health, healthAfter: ready.depth.hero.resources.health + amount,
      amount, quantityBefore: item.quantity, quantityAfter: item.quantity - 1, tick: ready.tick + 1 });
    expect(use.sourceCommandId).toBe(`depth:${expected.tick}:dungeon:${dungeon.id}:tonic:${dungeon.currentCellId}:${item.id}`);
    expect(expected.depth.dungeon).toEqual({ ...dungeon, latestFieldMedicineUse: use });
    const inventory = item.quantity === 1 ? ready.depth.hero.inventory.filter(entry => entry.id !== item.id)
      : ready.depth.hero.inventory.map(entry => entry.id === item.id ? { ...entry, quantity: item.quantity - 1 } : entry);
    expect(expected.depth.hero).toEqual({ ...ready.depth.hero, inventory,
      resources: { ...ready.depth.hero.resources, health: use.healthAfter } });
    expect(expected.hero).toEqual({ ...ready.hero, health: use.healthAfter });
    expect(expected.depth.atlas).toEqual(ready.depth.atlas);
    expect(expected.depth.quest).toEqual(ready.depth.quest);
    expect(expected.depth.pendingQuestReward).toEqual(ready.depth.pendingQuestReward);
    expect(expected.depth.completedQuests).toEqual(ready.depth.completedQuests);
    expect(expected.depth.companions).toEqual(ready.depth.companions);
    expect(priorStories(expected)).toBe(priorStories(ready));
    await installFixture(page, ready);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./?fast", { timeout: 25_000 });
    expect(JSON.parse(await pausedSave(page))).toEqual(ready);
    const doseRaw = await pausedSave(page, ready.tick);
    expect(JSON.parse(doseRaw)).toEqual(expected);
    expect(expected.chronicle.at(-1)).toMatchObject({ commandType: "use-dungeon-tonic", mode: "dungeon",
      commandId: `${expected.campaignId}:${use.sourceCommandId}`, tick: expected.tick });
    await proveMedicine(page, expected); await capture("dungeon-medicine-1280");
    await page.setViewportSize({ width: 320, height: 568 });
    await proveMedicine(page, expected); await capture("dungeon-medicine-320");
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await proveMedicine(page, expected); await capture("dungeon-medicine-320-focus");
    expect(await pausedSave(page)).toBe(doseRaw);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await proveStatus(page, expected);
    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(doseRaw);
    expect(upgradeWorldState(JSON.parse(doseRaw))).toEqual(expected);
    await proveMedicine(page, expected);
    milestone(`actual T${expected.tick} dose keeps cell ${use.cellId}, HP ${use.healthBefore}→${use.healthAfter}, tonic ${use.quantityBefore}→${use.quantityAfter}; exact reload repeats nothing`);

    expect(campaignDirector(expected).candidates[0]?.command.type).toBe("move-dungeon");
    const continued = JSON.parse(await pausedSave(page, expected.tick)) as WorldState;
    expect(continued).toEqual(advanceWorld(expected));
    expect(continued.chronicle.at(-1)?.commandType).toBe("move-dungeon");
    expect(continued.depth.dungeon!.currentCellId).not.toBe(use.cellId);
    expect(continued.depth.dungeon!.latestFieldMedicineUse).toEqual(use);
    expect(continued.depth.hero.inventory.find(entry => entry.id === item.id)?.quantity ?? 0).toBe(use.quantityAfter);
    expect(projectDungeonFieldMedicineScene(continued)).toBeNull();
    expect(upgradeWorldState(JSON.parse(JSON.stringify(continued)))).toEqual(continued);
    await expect(page.locator("#stage")).not.toHaveAttribute("data-dungeon-medicine-command");
    await proveStatus(page, expected);
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone("ordinary movement follows the dose; retained Status receipt, no repeat consumption, runtime error, model or external request");
  } finally {
    await testInfo.attach("Dungeon medicine diagnostics", { body: JSON.stringify({ errors, inference, external,
      readyTick: ready.tick, use, elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
