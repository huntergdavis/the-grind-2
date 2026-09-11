import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, campaignDirector, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { advanceRoute, edgeBetween, orientedEdgePath } from "../src/depth/atlas";
import { pennywiseGateChoices, selectPennywiseGate } from "../src/depth/pennywise-gate";
import { projectPennywiseGateScene } from "../src/ui/pennywise-gate-view";
import { naturalPennywiseGateApproachFixture, naturalPennywiseGateFixture, pennywiseGateCampaignId, pennywiseGateLegalLiftFixture } from "./pennywise-gate-fixtures";

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
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Gate turn did not settle within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (raw === null || tick !== undefined && JSON.parse(raw).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; button.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(raw);
    }, 20);
    if (tick !== undefined) button.click();
  }), { id: pennywiseGateCampaignId, tick: afterTick });
}

async function proveGate(page: Page, world: WorldState): Promise<void> {
  const scene = projectPennywiseGateScene(world)!;
  expect(scene).not.toBeNull();
  await expect.poll(() => page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset })), { timeout: 8_000 })
    .toMatchObject({ gatePhase: scene.phase, gateCommand: scene.commandId, gateId: scene.gateId, gateHero: scene.heroId,
      gateEdge: scene.edgeId, gateNearPoint: String(scene.nearPointIndex), gateFarPoint: String(scene.farPointIndex),
      gateGold: `${scene.goldBefore}/${scene.goldSpent}/${scene.goldAfter}`, gateDistance: `${scene.distanceBefore}/${scene.distanceAfter}`,
      travelRoadTopology: "gate-close-up", travelRoadFlow: "static", dungeonCaptionTitle: scene.headline });
  const stage = await page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset }));
  expect(stage.dungeonCaptionDetail).toBe(stage.dungeonCaptionLayout === "compact" ? scene.compactDetail : scene.detail);
  expect(stage.gateVisual).toContain("honor-box"); expect(stage.gateVisual).not.toMatch(/ferry|river|water|companion/u);
  if (scene.phase === "lifting") expect(stage.gateVisual).toContain("stationary-lift");
  await expect(page.locator("#repartee-caption")).toBeHidden();
  await expect.poll(() => page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>("#stage")!, canvas = stage.querySelector("canvas")!, host = stage.getBoundingClientRect();
    const [scale = 0, x = 0, y = 0] = (stage.dataset.sceneLayout ?? "").split(",").map(Number);
    const room = { left: host.left + x + 44 * scale, top: host.top + y + 32 * scale,
      right: host.left + x + 276 * scale, bottom: host.top + y + 156 * scale };
    const unobscured = ["#topbar", "#view-toolbar", "#stage-focus-ribbon", "#stage-focus-controls", "#hero-hud", "#chronicle"].every(selector => {
      const node = document.querySelector<HTMLElement>(selector);
      if (node === null || node.hidden || getComputedStyle(node).display === "none") return true;
      const box = node.getBoundingClientRect();
      return box.width === 0 || box.height === 0 || room.right <= box.left + 0.5 || room.left >= box.right - 0.5
        || room.bottom <= box.top + 0.5 || room.top >= box.bottom - 0.5;
    });
    const [hx = 0, hy = 0] = (stage.dataset.gateHeroPosition ?? "").split(",").map(Number);
    const [bx = 0, by = 0] = (stage.dataset.gateBarrierPosition ?? "").split(",").map(Number);
    const actorClear = [[hx, hy - 22], [hx, hy], [bx, by - 10], [93, 120]].every(([px = 0, py = 0]) =>
      document.elementFromPoint(host.left + x + px * scale, host.top + y + py * scale) === canvas);
    const bounds = JSON.parse(stage.dataset.dungeonCaptionBounds ?? "null") as { title: number[] | null; detail: number[] | null } | null;
    const rail = (stage.dataset.dungeonCaptionRail ?? "").split(",").map(Number), [rx = 0, ry = 0, rw = 0, rh = 0] = rail;
    const captionFits = bounds !== null && bounds.title !== null && bounds.detail !== null && rail.length === 4
      && ry + rh < 32 && [bounds.title, bounds.detail].every(([tx = 0, ty = 0, tw = 0, th = 0]) =>
        tw > 0 && th > 0 && tx >= rx && ty >= ry && tx + tw <= rx + rw + 0.01 && ty + th <= ry + rh + 0.01)
      && bounds.title[1]! + bounds.title[3]! <= bounds.detail[1]! + 0.01;
    return { wide: room.right - room.left >= (innerWidth <= 760 ? 200 : 350),
      inViewport: room.left >= -1 && room.top >= -1 && room.right <= innerWidth + 1 && room.bottom <= innerHeight + 1,
      unobscured, actorClear, captionFits, captionSized: Number(stage.dataset.dungeonCaptionTitleSize) >= 12 - 0.001
        && Number(stage.dataset.dungeonCaptionDetailSize) >= 11 - 0.001, pageFits: document.documentElement.scrollWidth <= innerWidth + 1 };
  }), { timeout: 8_000 }).toEqual({ wide: true, inViewport: true, unobscured: true, actorClear: true,
    captionFits: true, captionSized: true, pageFits: true });
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
  expect(result.count).toBe(1); expect(result.text).toContain(source.commandId);
  expect(result.text).toContain(source.action); expect(result.text).toContain(source.consequence);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click());
}

function expectUnchangedExceptGold(before: WorldState, after: WorldState, goldSpent: number): void {
  expect(after.depth.hero).toEqual({ ...before.depth.hero, gold: before.depth.hero.gold - goldSpent });
  expect(after.hero).toEqual({ ...before.hero, gold: before.hero.gold - goldSpent });
  for (const key of ["companions", "quest", "completedQuests", "pendingQuestReward", "completedCombats", "completedCounterDuels",
    "repartee", "reparteeWitness", "reparteeCallback", "usefulReply", "roomChallenge", "bellExpedition", "bellMemory",
    "companionReunion", "companionCredit", "dungeon"] as const) expect(after.depth[key]).toEqual(before.depth[key]);
  expect(after.depth.atlas.locations).toEqual(before.depth.atlas.locations);
  expect(after.depth.atlas.terrain).toEqual(before.depth.atlas.terrain);
  expect(after.depth.atlas.edges).toEqual(before.depth.atlas.edges);
  expect(after.depth.atlas.discoveredLocationIds).toEqual(before.depth.atlas.discoveredLocationIds);
  expect(after.depth.atlas.currentLocationId).toBe(before.depth.atlas.currentLocationId);
}

test("a real road gate offers paid passage or a legal stationary lift, with exact receipts and ordinary continuation", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const before = naturalPennywiseGateApproachFixture(), ready = naturalPennywiseGateFixture();
  const paid = advanceWorld(ready), lifted = pennywiseGateLegalLiftFixture(), passed = advanceWorld(lifted);
  const gate = ready.depth.pennywiseGate!, errors: string[] = [], inference: string[] = [], external: string[] = [], startedAt = Date.now();
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
    expect(advanceWorld(before)).toEqual(ready);
    expect(before.depth).not.toHaveProperty("pennywiseGate");
    expect(upgradeWorldState(JSON.parse(JSON.stringify(before)))).toEqual(before);
    expect(gate.arrival).toMatchObject({ tick: ready.tick, sourceCommandId: `depth:${ready.tick}:travel:8`, distance: 8,
      routeBefore: before.depth.atlas.route, routeAtGate: ready.depth.atlas.route });
    expect(ready.depth.hero).toEqual({ ...before.depth.hero, experience: before.depth.hero.experience + 1 });
    const edge = edgeBetween(ready.depth.atlas, gate.site.fromLocationId, gate.site.toLocationId)!;
    const path = orientedEdgePath(edge, gate.site.fromLocationId);
    expect(gate.site).toMatchObject({ edgeId: edge.id, nearPointIndex: path.pointIndices[1], farPointIndex: path.pointIndices[2],
      nearProgress: path.distances[1], farProgress: path.distances[2] });
    expect(gate.site.farProgress).toBeLessThan(path.distances.at(-1)!);
    expect(ready.depth.atlas.terrain).toEqual(before.depth.atlas.terrain);
    expect(pennywiseGateChoices(ready.depth).map(choice => choice.choice)).toEqual(["pay", "lift"]);
    expect(paid.depth.pennywiseGate!.choice!.kind).toBe("pay");
    expect(paid.depth.pennywiseGate!.completion).toMatchObject({ distance: 7, goldBefore: ready.depth.hero.gold,
      goldSpent: 2, goldAfter: ready.depth.hero.gold - 2 });
    expectUnchangedExceptGold(ready, paid, 2);
    expect(lifted.depth.pennywiseGate!.choice!.kind).toBe("lift");
    expect(lifted.depth.pennywiseGate!.completion).toBeNull();
    expect(lifted.depth.atlas).toEqual(ready.depth.atlas); expectUnchangedExceptGold(ready, lifted, 0);
    expect(campaignDirector(lifted).candidates[0]?.command.type).toBe("pass-pennywise-gate");
    expectUnchangedExceptGold(lifted, passed, 0);
    expect(passed.depth.atlas).toEqual(paid.depth.atlas);
    expect(passed.depth.atlas).toEqual(advanceRoute(ready.depth.atlas, 7));
    for (const world of [ready, paid, lifted, passed]) {
      expect(upgradeWorldState(JSON.parse(JSON.stringify(world)))).toEqual(world);
      const receipt = world.depth.pennywiseGate!, source = receipt.completion ?? receipt.choice ?? receipt.arrival;
      expect(world.chronicle.at(-1)?.commandId).toBe(`${world.campaignId}:${source.sourceCommandId}`);
    }

    await installFixture(page, before);
    await page.emulateMedia({ reducedMotion: "reduce" }); await page.setViewportSize({ width: 1280, height: 800 });
    // Earned uninterrupted checkpoint and explicit fixture-fast playback;
    // this is not a normal-time dwell or background-soak claim.
    await page.goto("./?fast", { timeout: 25_000 }); expect(JSON.parse(await pausedSave(page))).toEqual(before);
    const readyRaw = await pausedSave(page, before.tick); expect(JSON.parse(readyRaw)).toEqual(ready);
    await proveGate(page, ready); await capture("pennywise-gate-approach-1280");
    await page.reload({ timeout: 25_000 }); expect(await pausedSave(page)).toBe(readyRaw);
    await proveGate(page, ready);
    const paidRaw = await pausedSave(page, ready.tick); expect(JSON.parse(paidRaw)).toEqual(paid);
    await proveGate(page, paid); await proveStatus(page, ready); await proveStatus(page, paid);
    expect(selectPennywiseGate(paid.depth)).toBeNull();
    const paidNext = advanceWorld(paid);
    expect(paidNext.chronicle.at(-1)?.commandType).toBe("travel");
    expect(JSON.parse(await pausedSave(page, paid.tick))).toEqual(paidNext);
    expect(paidNext.depth.pennywiseGate).toEqual(paid.depth.pennywiseGate);
    expect(paidNext.depth.hero.gold).toBe(paid.depth.hero.gold);
    await expect(page.locator("#stage")).not.toHaveAttribute("data-gate-phase");

    // Separate authored legal branch at the SAME earned gate. The source
    // helper commits the offered lift through rulesEngine; no resources,
    // personality, geography or prior story are edited to force this choice.
    await page.evaluate(world => sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world)), lifted);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.reload({ timeout: 25_000 });
    const liftedRaw = await pausedSave(page); expect(JSON.parse(liftedRaw)).toEqual(lifted);
    await proveGate(page, lifted); await capture("pennywise-gate-lifting-320");
    await page.reload({ timeout: 25_000 }); expect(await pausedSave(page)).toBe(liftedRaw);
    await proveGate(page, lifted);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    const passedRaw = await pausedSave(page, lifted.tick); expect(JSON.parse(passedRaw)).toEqual(passed);
    await proveGate(page, passed); await capture("pennywise-gate-free-passage-320-focus");
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await page.setViewportSize({ width: 1280, height: 800 });
    await proveStatus(page, ready); await proveStatus(page, lifted); await proveStatus(page, passed);
    expect(await pausedSave(page)).toBe(passedRaw);
    await page.reload({ timeout: 25_000 }); expect(await pausedSave(page)).toBe(passedRaw);
    const next = advanceWorld(passed);
    expect(next.chronicle.at(-1)?.commandType).toBe("travel");
    expect(JSON.parse(await pausedSave(page, passed.tick))).toEqual(next);
    expect(next.depth.pennywiseGate).toEqual(passed.depth.pennywiseGate);
    expect(next.depth.hero.gold).toBe(passed.depth.hero.gold);
    expect(selectPennywiseGate(next.depth)).toBeNull(); expect(projectPennywiseGateScene(next)).toBeNull();
    await expect(page.locator("#stage")).not.toHaveAttribute("data-gate-phase");
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
  } finally {
    await testInfo.attach("pennywise-gate-evidence", { body: JSON.stringify({
      fixture: "Uninterrupted first road, natural paid branch; separate legal lift command at the same earned gate, no state staging",
      approachTick: ready.tick, paidTick: paid.tick, liftTick: lifted.tick, passTick: passed.tick,
      arrival: gate.arrival, paid: paid.depth.pennywiseGate, free: passed.depth.pennywiseGate,
      elapsedMs: Date.now() - startedAt, errors, inference, external }, null, 2), contentType: "application/json" });
  }
});
