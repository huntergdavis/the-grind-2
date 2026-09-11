import { expect, test, type Page } from "@playwright/test";
import { actorPolicy } from "../src/core/actor-policy";
import { canonicalHash } from "../src/core/canonical";
import { advanceWorld, campaignDirector, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { dungeonTrapAt } from "../src/depth/dungeon";
import type { MazeDirection } from "../src/depth/types";
import { projectDungeonPerspectiveView } from "../src/ui/dungeon-perspective-view";
import { dungeonPerspectiveCampaignId, dungeonPerspectiveFixture } from "./dungeon-perspective-fixtures";

const optionalChunk = /\/assets\/dungeon-perspective-[^/]+\.js(?:\?.*)?$/u;
const preferenceKey = "the-grind-2:dungeon-perspective:v1";
const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;

async function installFixture(page: Page, fixture: WorldState): Promise<void> {
  await page.addInitScript(state => {
    const key = `the-grind-2:campaign:${state.campaignId}`;
    if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, JSON.stringify(state));
    sessionStorage.setItem("the-grind-2:activeCampaignId", state.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${state.campaignId}`, String(Date.now() + 3_600_000));
    localStorage.setItem("the-grind-2:play-mode:v1", '{"schemaVersion":1,"mode":"deterministic"}');
    localStorage.setItem("the-grind-2:adventure-speed:v1", '{"schemaVersion":1,"speed":1}');
    localStorage.setItem("the-grind-2:stage-focus:v1", "panels");
    // Do not set the perspective preference: prove the real default and retain
    // the user's actual menu selection across reloads.
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
  return page.evaluate(async ({ id, tick }) => new Promise<string>((resolve, reject) => {
    const app = document.querySelector<HTMLElement>("#app")!, button = document.querySelector<HTMLButtonElement>("#pause-button")!;
    let requested = false;
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Dungeon turn did not settle and pause within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const saved = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (saved === null || tick !== undefined && JSON.parse(saved).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; button.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(saved);
    }, 20);
    if (tick !== undefined) button.click();
  }), { id: dungeonPerspectiveCampaignId, tick: afterTick });
}

async function choosePerspective(page: Page, perspective: "map" | "first-person"): Promise<void> {
  await page.locator("#game-menu-button").click();
  await page.locator("#dungeon-perspective-select").selectOption(perspective);
  await page.locator("#game-menu-close").click();
}

async function snapshot(page: Page) {
  return page.evaluate(({ id, key }) => ({
    stage: { ...document.querySelector<HTMLElement>("#stage")!.dataset },
    requested: document.querySelector<HTMLElement>("#app")!.dataset.dungeonPerspective,
    preference: localStorage.getItem(key), select: document.querySelector<HTMLSelectElement>("#dungeon-perspective-select")!.value,
    status: document.querySelector("#dungeon-perspective-status")!.textContent,
    saved: sessionStorage.getItem(`the-grind-2:campaign:${id}`),
  }), { id: dungeonPerspectiveCampaignId, key: preferenceKey });
}

function hashes(world: WorldState) {
  return { campaign: canonicalHash(world), choice: canonicalHash(actorPolicy(world, campaignDirector(world))) };
}

function expectUnchanged(raw: string | null, previousRaw: string, world: WorldState): void {
  expect(raw).toBe(previousRaw);
  expect(hashes(JSON.parse(raw!))).toEqual(hashes(world));
}

async function proveFirstPerson(page: Page, world: WorldState, facing: MazeDirection): Promise<void> {
  const packet = projectDungeonPerspectiveView(world, facing)!;
  expect(packet).not.toBeNull();
  await expect.poll(async () => snapshot(page), { timeout: 8_000 }).toMatchObject({
    requested: "first-person", select: "first-person",
    preference: JSON.stringify({ schemaVersion: 1, perspective: "first-person" }),
    stage: { dungeonPerspectiveRequested: "first-person", dungeonPerspective: "first-person", dungeonPerspectiveStatus: "ready",
      dungeonPerspectiveFacing: facing, dungeonPerspectiveCell: packet.currentCellId,
      dungeonPerspectiveExits: JSON.stringify(packet.exits), dungeonPerspectiveCurrentTrap: JSON.stringify(packet.currentTrap),
      dungeonPerspectiveViewport: "44,32,232,124", dungeonFraming: "first-person-room", dungeonFrameRooms: "1",
      dungeonHeroCell: packet.currentCellId,
      ...(packet.sourceCommandId === null ? {} : { dungeonPerspectiveCommand: packet.sourceCommandId }) },
  });
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
    let captionReadable = true;
    if (stage.dataset.dungeonSearch === "marked") {
      const rail = (stage.dataset.dungeonCaptionRail ?? "").split(",").map(Number);
      const bounds = JSON.parse(stage.dataset.dungeonCaptionBounds ?? "null") as { title: number[] | null; detail: number[] | null } | null;
      captionReadable = Number(stage.dataset.dungeonCaptionTitleSize) >= 12 - 0.001 && Number(stage.dataset.dungeonCaptionDetailSize) >= 11 - 0.001
        && rail.length === 4 && rail[1]! + rail[3]! < 32 && bounds?.title != null && bounds?.detail != null
        && [bounds.title, bounds.detail].every(([bx = 0, by = 0, width = 0, height = 0]) => width > 0 && height > 0
          && bx >= rail[0]! && by >= rail[1]! && bx + width <= rail[0]! + rail[2]! + 0.01 && by + height <= rail[1]! + rail[3]! + 0.01);
    }
    return { roomWideEnough: room.right - room.left >= (innerWidth <= 760 ? 200 : 350),
      inViewport: room.left >= -1 && room.top >= -1 && room.right <= innerWidth + 1 && room.bottom <= innerHeight + 1,
      unobscured, roomClear, captionReadable, pageFits: document.documentElement.scrollWidth <= innerWidth + 1,
      noMapGeometry: ["dungeonFrameCellSize", "dungeonFrameOffset", "dungeonFrameBounds"].every(key => !(key in stage.dataset)) };
  }), { timeout: 8_000 }).toEqual({ roomWideEnough: true, inViewport: true, unobscured: true, roomClear: true,
    captionReadable: true, pageFits: true, noMapGeometry: true });
}

test("the optional room perspective keeps identical saves and follows only real search and movement", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const fixture = dungeonPerspectiveFixture(), targetId = "dungeon:location:3:cell:0,1";
  const errors: string[] = [], inference: string[] = [], external: string[] = [], modules: string[] = [];
  const startedAt = Date.now();
  const milestone = (message: string): void => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map(part => [part.type, part.value]));
    console.log(`[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}] Dungeon perspective +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${message}`);
  };
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("worker", worker => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
  page.on("request", request => {
    if (optionalChunk.test(request.url())) modules.push(request.url());
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
    expect(dungeonTrapAt(fixture.depth.dungeon!, targetId)?.phase).toBe("hidden");
    expect(projectDungeonPerspectiveView(fixture)!.exits.every(exit => exit.trap === null)).toBe(true);
    await installFixture(page, fixture);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./?fast", { timeout: 25_000 });
    const initial = await pausedSave(page);
    expect(JSON.parse(initial)).toEqual(fixture);
    await expect.poll(async () => snapshot(page)).toMatchObject({ select: "map", requested: "map", preference: null,
      stage: { dungeonPerspective: "map", dungeonPerspectiveRequested: "map", dungeonFraming: "discovered-rooms" } });
    expect(modules).toEqual([]);
    await choosePerspective(page, "first-person");
    await proveFirstPerson(page, fixture, "north");
    expectUnchanged((await snapshot(page)).saved, initial, fixture);
    expect(modules).toHaveLength(1);
    await capture("dungeon-perspective-1280");
    await choosePerspective(page, "map");
    await expect.poll(async () => snapshot(page)).toMatchObject({ stage: { dungeonPerspective: "map", dungeonFraming: "discovered-rooms" } });
    expectUnchanged((await snapshot(page)).saved, initial, fixture);
    await choosePerspective(page, "first-person");
    await proveFirstPerson(page, fixture, "north");
    expectUnchanged((await snapshot(page)).saved, initial, fixture);
    expect(modules).toHaveLength(1);
    milestone("default 2D makes no optional request; paused toggles preserve exact campaign and selected-command hashes");

    const searchedRaw = await pausedSave(page, fixture.tick), searched = JSON.parse(searchedRaw) as WorldState;
    expect(searched).toEqual(advanceWorld(fixture));
    expect(searched.chronicle.at(-1)?.commandType).toBe("search-dungeon");
    expect(searched.depth.dungeon!.currentCellId).toBe(fixture.depth.dungeon!.currentCellId);
    expect(searched.depth.dungeon!.visitedCellIds).toEqual(fixture.depth.dungeon!.visitedCellIds);
    expect(searched.depth.hero).toEqual(fixture.depth.hero);
    expect(searched.depth.quest).toEqual(fixture.depth.quest);
    expect(dungeonTrapAt(searched.depth.dungeon!, targetId)?.phase).toBe("detected");
    expect(projectDungeonPerspectiveView(searched)!.exits.find(exit => exit.destinationCellId === targetId)?.trap)
      .toEqual({ kind: dungeonTrapAt(searched.depth.dungeon!, targetId)!.kind, status: "armed" });
    await page.setViewportSize({ width: 320, height: 568 });
    await proveFirstPerson(page, searched, "north");
    await capture("dungeon-perspective-search-320");
    expectUnchanged((await snapshot(page)).saved, searchedRaw, searched);
    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(searchedRaw);
    expect(upgradeWorldState(JSON.parse(searchedRaw))).toEqual(searched);
    await proveFirstPerson(page, searched, "north");
    milestone("real stationary search reveals the trap without turning; preference and exact receipt survive reload");

    const movedRaw = await pausedSave(page, searched.tick), moved = JSON.parse(movedRaw) as WorldState;
    expect(moved).toEqual(advanceWorld(searched));
    expect(moved.chronicle.at(-1)?.commandType).toBe("move-dungeon");
    expect(moved.depth.dungeon!.currentCellId).toBe(targetId);
    expect(moved.depth.dungeon!.search).toEqual(searched.depth.dungeon!.search);
    expect(moved.depth.hero.resources.health).toBe(searched.depth.hero.resources.health);
    expect(dungeonTrapAt(moved.depth.dungeon!, targetId)?.phase).toBe("detected");
    await proveFirstPerson(page, moved, "south");
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await proveFirstPerson(page, moved, "south");
    await capture("dungeon-perspective-move-320-focus");
    expectUnchanged((await snapshot(page)).saved, movedRaw, moved);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await choosePerspective(page, "map");
    expectUnchanged((await snapshot(page)).saved, movedRaw, moved);
    await choosePerspective(page, "first-person");
    await proveFirstPerson(page, moved, "south");
    expectUnchanged((await snapshot(page)).saved, movedRaw, moved);
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone("only the real southward step turns the room; armed trap, Focus, resources and 2D return stay honest");
  } finally {
    await testInfo.attach("Dungeon perspective diagnostics", { body: JSON.stringify({ errors, inference, external, modules,
      initialHashes: hashes(fixture), elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});

test("one failed optional module load falls back to the same playable 2D dungeon without automatic retries", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const fixture = dungeonPerspectiveFixture(), errors: string[] = [], external: string[] = [], inference: string[] = [];
  const consoleErrors: { text: string; url: string }[] = [];
  let attempts = 0;
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push({ text: message.text(), url: message.location().url }); });
  page.on("request", request => {
    if (modelUrl.test(request.url())) inference.push(request.url());
    if (new URL(request.url()).origin !== new URL(testInfo.project.use.baseURL!).origin) external.push(request.url());
  });
  await page.route(optionalChunk, async route => { attempts++; await route.abort("failed"); });
  try {
    await installFixture(page, fixture);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("./?fast", { timeout: 25_000 });
    const before = await pausedSave(page);
    expect(JSON.parse(before)).toEqual(fixture);
    expect(attempts).toBe(0);
    await choosePerspective(page, "first-person");
    await expect.poll(async () => snapshot(page), { timeout: 8_000 }).toMatchObject({
      requested: "first-person", status: expect.stringContaining("Preview unavailable; using 2D"),
      stage: { dungeonPerspective: "map", dungeonPerspectiveStatus: "failed", dungeonFraming: "discovered-rooms" },
    });
    expectUnchanged((await snapshot(page)).saved, before, fixture);
    expect(attempts).toBe(1);
    const searched = JSON.parse(await pausedSave(page, fixture.tick)) as WorldState;
    expect(searched).toEqual(advanceWorld(fixture));
    expect(searched.chronicle.at(-1)?.commandType).toBe("search-dungeon");
    await expect.poll(async () => snapshot(page)).toMatchObject({ stage: {
      dungeonPerspective: "map", dungeonPerspectiveStatus: "failed", dungeonSearch: "marked", dungeonFraming: "discovered-rooms",
    } });
    expect(attempts).toBe(1); // Normal redraws and a real new turn do not request the failed chunk again.
    expect(errors).toEqual([]); expect(external).toEqual([]); expect(inference).toEqual([]);
    expect(consoleErrors.filter(error => !(optionalChunk.test(error.url) && /Failed to load resource|net::ERR_FAILED/u.test(error.text)))).toEqual([]);
  } finally {
    await testInfo.attach("Optional perspective failure diagnostics", { body: JSON.stringify({ attempts, errors, external, inference, consoleErrors }, null, 2), contentType: "application/json" });
  }
});
