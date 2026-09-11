import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, campaignDirector, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { isDungeonPassageOpen, projectDungeonWayfinding, selectDungeonSecretPassage } from "../src/depth/dungeon";
import type { MazeDirection } from "../src/depth/types";
import { projectDungeonPerspectiveView } from "../src/ui/dungeon-perspective-view";
import { projectDungeonSecretPassageScene } from "../src/ui/dungeon-secret-passage-view";
import { dungeonSecretPassageCampaignId, releasedDungeonSecretPassageBeforeClueFixture,
  releasedDungeonSecretPassageFixture } from "./dungeon-secret-passage-fixtures";

async function installFixture(page: Page, fixture: WorldState): Promise<void> {
  await page.addInitScript(state => {
    const key = `the-grind-2:campaign:${state.campaignId}`;
    if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, JSON.stringify(state));
    sessionStorage.setItem("the-grind-2:activeCampaignId", state.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${state.campaignId}`, String(Date.now() + 3_600_000));
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
  }, fixture);
}

async function pausedSave(page: Page, afterTick?: number): Promise<string> {
  return page.evaluate(({ id, tick }) => new Promise<string>((resolve, reject) => {
    const app = document.querySelector<HTMLElement>("#app")!, button = document.querySelector<HTMLButtonElement>("#pause-button")!;
    let requested = false;
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Passage turn did not settle within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (raw === null || tick !== undefined && JSON.parse(raw).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; button.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(raw);
    }, 20);
    if (tick !== undefined) button.click();
  }), { id: dungeonSecretPassageCampaignId, tick: afterTick });
}

async function choosePerspective(page: Page, perspective: "map" | "first-person"): Promise<void> {
  await page.locator("#game-menu-button").click();
  await page.locator("#dungeon-perspective-select").selectOption(perspective);
  await page.locator("#game-menu-close").click();
  await expect(page.locator("#stage")).toHaveAttribute("data-dungeon-perspective", perspective);
}

function priorStories(world: WorldState): string {
  return JSON.stringify({ repartee: world.depth.repartee, witness: world.depth.reparteeWitness,
    callback: world.depth.reparteeCallback, lesson: world.depth.usefulReply, challenge: world.depth.roomChallenge,
    bell: world.depth.bellExpedition, bellMemory: world.depth.bellMemory,
    reunion: world.depth.companionReunion, credit: world.depth.companionCredit });
}

async function proveViewport(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => {
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
    const bounds = JSON.parse(stage.dataset.dungeonCaptionBounds ?? "null") as { title: number[] | null; detail: number[] | null } | null;
    const rail = (stage.dataset.dungeonCaptionRail ?? "").split(",").map(Number), [rx = 0, ry = 0, rw = 0, rh = 0] = rail;
    const captionFits = bounds !== null && bounds.title !== null && bounds.detail !== null && rail.length === 4
      && ry + rh < 32 && [bounds.title, bounds.detail].every(([tx = 0, ty = 0, tw = 0, th = 0]) =>
        tw > 0 && th > 0 && tx >= rx && ty >= ry && tx + tw <= rx + rw + 0.01 && ty + th <= ry + rh + 0.01)
      && bounds.title[1]! + bounds.title[3]! <= bounds.detail[1]! + 0.01;
    return { roomWideEnough: room.right - room.left >= (innerWidth <= 760 ? 200 : 350),
      inViewport: room.left >= -1 && room.top >= -1 && room.right <= innerWidth + 1 && room.bottom <= innerHeight + 1,
      unobscured, roomClear, captionFits, captionSized: Number(stage.dataset.dungeonCaptionTitleSize) >= 12 - 0.001
        && Number(stage.dataset.dungeonCaptionDetailSize) >= 11 - 0.001,
      pageFits: document.documentElement.scrollWidth <= innerWidth + 1 };
  }), { timeout: 8_000 }).toEqual({ roomWideEnough: true, inViewport: true, unobscured: true,
    roomClear: true, captionFits: true, captionSized: true, pageFits: true });
}

async function provePassage(page: Page, world: WorldState, perspective: "map" | "first-person", facing: MazeDirection = "north"): Promise<void> {
  const scene = projectDungeonSecretPassageScene(world)!;
  expect(scene).not.toBeNull();
  await expect.poll(() => page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset })), { timeout: 8_000 })
    .toMatchObject({ dungeonPerspective: perspective, dungeonHeroCell: scene.cellId, dungeonPassagePhase: scene.phase,
      dungeonPassageCommand: scene.commandId, dungeonPassageDirection: scene.direction, dungeonPassageCell: scene.cellId,
      dungeonCaptionTitle: scene.headline });
  const stage = await page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset }));
  expect(["wide", "compact"]).toContain(stage.dungeonCaptionLayout);
  expect(stage.dungeonCaptionDetail).toBe(stage.dungeonCaptionLayout === "compact" ? scene.compactDetail : scene.detail);
  if (scene.connection === null) {
    expect(stage.dungeonPassageFrom).toBeUndefined(); expect(stage.dungeonPassageTo).toBeUndefined();
    expect(stage.dungeonPassageOpeningSource).toBeUndefined();
  } else {
    expect(stage).toMatchObject({ dungeonPassageFrom: scene.connection.fromCellId,
      dungeonPassageTo: scene.connection.toCellId, dungeonPassageOpeningSource: scene.connection.openingSourceCommandId });
  }
  if (perspective === "first-person") {
    const packet = projectDungeonPerspectiveView(world, facing)!;
    await expect.poll(() => page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset })), { timeout: 8_000 })
      .toMatchObject({ dungeonPerspectiveFacing: facing, dungeonPerspectiveCell: packet.currentCellId,
        dungeonPerspectiveExits: JSON.stringify(packet.exits), dungeonPerspectivePassage: JSON.stringify(packet.secretPassage) });
    if (scene.phase === "draught") {
      expect(Object.keys(packet.secretPassage!).sort()).toEqual(["direction", "phase", "relative"]);
      expect(packet.secretPassage).toMatchObject({ phase: "draught", direction: scene.direction });
      expect(packet.exits.some(exit => exit.direction === scene.direction)).toBe(false);
    } else expect(packet.secretPassage).toMatchObject({ phase: "open" });
  }
  if (scene.phase === "opened") {
    expect(stage.dungeonBreadcrumbLength).toBe("0");
    expect(stage.dungeonPassageVisual).toContain("stationary");
  }
  await expect(page.locator("#repartee-caption")).toBeHidden();
  await proveViewport(page);
}

async function proveStatus(page: Page, world: WorldState): Promise<void> {
  const source = world.chronicle.at(-1)!;
  const result = await page.evaluate(eventId => {
    document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="journal"]')!.click();
    document.querySelector<HTMLButtonElement>("#journal-status-button")!.click();
    document.querySelector<HTMLButtonElement>("#journal-status-refresh")!.click();
    const rows = [...document.querySelectorAll<HTMLElement>("#journal-status-list > li")];
    const row = rows.find(entry => entry.dataset.source === "chronicle" && entry.dataset.eventId === eventId)!;
    row.querySelector<HTMLDetailsElement>("details")!.open = true;
    return { count: rows.filter(entry => entry.dataset.source === "chronicle" && entry.dataset.eventId === eventId).length, text: row.textContent };
  }, source.id);
  expect(result.count).toBe(1);
  expect(result.text).toContain(source.commandId); expect(result.text).toContain(source.action); expect(result.text).toContain(source.consequence);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click());
}

test("a released v171 save opens its real stationary shortcut, then normal movement crosses it in both perspectives", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const beforeClue = releasedDungeonSecretPassageBeforeClueFixture(), ready = releasedDungeonSecretPassageFixture();
  const opened = advanceWorld(ready), crossed = advanceWorld(opened), dungeon = ready.depth.dungeon!;
  const clue = dungeon.secretPassage!.clue!, opening = opened.depth.dungeon!.secretPassage!.opened!;
  const errors: string[] = [], inference: string[] = [], external: string[] = [], startedAt = Date.now();
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
    expect(advanceWorld(beforeClue)).toEqual(ready);
    expect(beforeClue.depth.dungeon!.secretPassage!.clue).toBeNull();
    expect(clue.revealedTick).toBe(ready.tick);
    expect(ready.chronicle.at(-1)?.commandId).toBe(`${ready.campaignId}:${clue.revealSourceCommandId}`);
    expect(dungeon.keyGate!.phase).toBe("open");
    expect(dungeon.visitedCellIds).toContain(dungeon.keyGate!.shortcutCellId);
    expect(dungeon.visitedCellIds).toEqual(expect.arrayContaining([clue.fromCellId, clue.toCellId]));
    expect(clue.knownRouteCellIds.length).toBeGreaterThan(3);
    expect(isDungeonPassageOpen(dungeon, clue.fromCellId, clue.toCellId)).toBe(false);
    expect(campaignDirector(ready).candidates[0]?.command).toEqual({ type: "open-dungeon-passage",
      dungeonId: dungeon.id, fromCellId: clue.fromCellId, toCellId: clue.toCellId });
    expect(opened.chronicle.at(-1)).toMatchObject({ commandType: "open-dungeon-passage", mode: "dungeon",
      commandId: `${opened.campaignId}:${opening.sourceCommandId}` });
    expect(opened.depth.dungeon!.currentCellId).toBe(dungeon.currentCellId);
    expect(opened.depth.dungeon!.turns).toBe(dungeon.turns + 1);
    for (const key of ["cells", "visitedCellIds", "discoveredCellIds", "traps", "keyGate", "latestShrineUse", "latestFieldMedicineUse", "search"] as const) expect(opened.depth.dungeon![key]).toEqual(dungeon[key]);
    expect(opened.depth.hero).toEqual(ready.depth.hero); expect(opened.hero).toEqual(ready.hero);
    for (const key of ["atlas", "quest", "completedQuests", "pendingQuestReward", "companions", "completedCombats"] as const) expect(opened.depth[key]).toEqual(ready.depth[key]);
    expect(priorStories(opened)).toBe(priorStories(ready));
    expect(isDungeonPassageOpen(opened.depth.dungeon!, clue.fromCellId, clue.toCellId)).toBe(true);
    expect(isDungeonPassageOpen(opened.depth.dungeon!, clue.toCellId, clue.fromCellId)).toBe(true);
    expect(selectDungeonSecretPassage(opened.depth.dungeon!)).toBeNull();
    expect(projectDungeonWayfinding(opened.depth.dungeon!).roomsToFrontier).toBeLessThan(projectDungeonWayfinding(dungeon).roomsToFrontier);
    expect(campaignDirector(opened).candidates[0]?.command).toEqual({ type: "move-dungeon", direction: clue.direction });
    expect(crossed.depth.dungeon!.currentCellId).toBe(clue.toCellId);
    expect(crossed.depth.dungeon!.visitedCellIds).toEqual(dungeon.visitedCellIds);
    expect(crossed.depth.hero).toEqual(opened.depth.hero); expect(crossed.hero).toEqual(opened.hero);
    expect(crossed.depth.dungeon!.secretPassage).toEqual(opened.depth.dungeon!.secretPassage);
    // Explicit old-save compatibility boundary only: no passage record means
    // no inferred clue/opening, while the already-earned maze stays identical.
    const legacy = structuredClone(beforeClue), { secretPassage: _passage, ...legacyDungeon } = legacy.depth.dungeon!;
    legacy.depth.dungeon = legacyDungeon;
    const reloadedLegacy = upgradeWorldState(JSON.parse(JSON.stringify(legacy)));
    expect(reloadedLegacy.depth.dungeon!.secretPassage).toBeUndefined();
    expect(selectDungeonSecretPassage(reloadedLegacy.depth.dungeon!)).toBeNull();

    await installFixture(page, beforeClue);
    await page.emulateMedia({ reducedMotion: "reduce" }); await page.setViewportSize({ width: 1280, height: 800 });
    // Exact released v171 checkpoint, not fresh-current reachability. Explicit
    // fixture-fast playback; no normal dwell or background-soak claim.
    await page.goto("./?fast", { timeout: 25_000 }); expect(JSON.parse(await pausedSave(page))).toEqual(beforeClue);
    const cueRaw = await pausedSave(page, beforeClue.tick); expect(JSON.parse(cueRaw)).toEqual(ready);
    await provePassage(page, ready, "map"); await capture("dungeon-passage-draught-1280");
    await choosePerspective(page, "first-person"); await provePassage(page, ready, "first-person");
    expect(await pausedSave(page)).toBe(cueRaw);
    await page.reload({ timeout: 25_000 }); expect(await pausedSave(page)).toBe(cueRaw);
    expect(upgradeWorldState(JSON.parse(cueRaw))).toEqual(ready);
    await provePassage(page, ready, "first-person");
    const openedRaw = await pausedSave(page, ready.tick); expect(JSON.parse(openedRaw)).toEqual(opened);
    await provePassage(page, opened, "first-person");
    await choosePerspective(page, "map"); await page.setViewportSize({ width: 320, height: 568 });
    await provePassage(page, opened, "map"); await capture("dungeon-passage-opened-320");
    expect(await pausedSave(page)).toBe(openedRaw);
    await choosePerspective(page, "first-person");
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await provePassage(page, opened, "first-person");
    const crossedRaw = await pausedSave(page, opened.tick); expect(JSON.parse(crossedRaw)).toEqual(crossed);
    await provePassage(page, crossed, "first-person", clue.direction); await capture("dungeon-passage-crossed-320-focus");
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await page.setViewportSize({ width: 1280, height: 800 });
    await proveStatus(page, ready); await proveStatus(page, opened); await proveStatus(page, crossed);
    expect(await pausedSave(page)).toBe(crossedRaw);
    await page.reload({ timeout: 25_000 }); expect(await pausedSave(page)).toBe(crossedRaw);
    expect(upgradeWorldState(JSON.parse(crossedRaw))).toEqual(crossed);
    const next = advanceWorld(crossed);
    expect(JSON.parse(await pausedSave(page, crossed.tick))).toEqual(next);
    expect(next.depth.dungeon!.secretPassage).toEqual(opened.depth.dungeon!.secretPassage);
    expect(selectDungeonSecretPassage(next.depth.dungeon!)).toBeNull();
    expect(projectDungeonSecretPassageScene(next)).toBeNull();
    await expect(page.locator("#stage")).not.toHaveAttribute("data-dungeon-passage-phase");
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
  } finally {
    await testInfo.attach("dungeon-passage-evidence", { body: JSON.stringify({ fixture: "Exact released v171 pre-clue save; current upgrade and actual cue/open/cross commands, not fresh-current reachability; no staged room, health, gate, visit or outcome",
      cueTick: ready.tick, openedTick: opened.tick, crossedTick: crossed.tick, clue, opening,
      elapsedMs: Date.now() - startedAt, errors, inference, external }, null, 2), contentType: "application/json" });
  }
});
