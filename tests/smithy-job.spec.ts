import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { selectSmithyJob, selectSmithyJobVenue } from "../src/depth/smithy-job";
import { projectSmithyJobScene } from "../src/ui/smithy-job-view";
import { commitLegalSmithyStroke, naturalSmithyJobBeforeAdmissionFixture, naturalSmithyJobFixture, smithyJobCampaignId } from "./smithy-job-fixtures";

async function installFixture(page: Page, fixture: WorldState): Promise<void> {
  await page.addInitScript(state => {
    const key = `the-grind-2:campaign:${state.campaignId}`;
    if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, JSON.stringify(state));
    sessionStorage.setItem("the-grind-2:activeCampaignId", state.campaignId);
    const resumeDebtKey = "the-grind-2:test-smithy-resume-debt";
    const resumeWithDebt = sessionStorage.getItem(resumeDebtKey) === "60s";
    sessionStorage.removeItem(resumeDebtKey);
    localStorage.setItem(`the-grind-2:last-active:${state.campaignId}`, String(Date.now() + (resumeWithDebt ? -60_000 : 3_600_000)));
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
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Smithy turn did not settle within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (raw === null || tick !== undefined && JSON.parse(raw).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; button.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(raw);
    }, 20);
    if (tick !== undefined) button.click();
  }), { id: smithyJobCampaignId, tick: afterTick });
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

function expectOnlyJobCost(before: WorldState, after: WorldState, manaSpent: number, goldEarned: number): void {
  expect(after.depth.hero).toEqual({ ...before.depth.hero, gold: before.depth.hero.gold + goldEarned,
    resources: { ...before.depth.hero.resources, mana: before.depth.hero.resources.mana - manaSpent } });
  expect(after.hero).toEqual({ ...before.hero, gold: before.hero.gold + goldEarned });
  for (const key of ["atlas", "towns", "companions", "quest", "completedQuests", "pendingQuestReward", "completedCombats", "completedCounterDuels",
    "repartee", "reparteeWitness", "reparteeCallback", "usefulReply", "roomChallenge", "bellExpedition", "bellMemory",
    "companionReunion", "companionCredit", "dungeon", "pennywiseGate"] as const) expect(after.depth[key]).toEqual(before.depth[key]);
}

async function proveWorkshopGeometry(page: Page): Promise<void> {
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
    const [hx = 0, hy = 0] = (stage.dataset.smithyHeroPosition ?? "").split(",").map(Number);
    const [rx = 0, ry = 0] = (stage.dataset.smithyResidentPosition ?? "").split(",").map(Number);
    const [ax = 0, ay = 0] = (stage.dataset.smithyAnvilPosition ?? "").split(",").map(Number);
    const actorsClear = [[hx, hy - 30], [hx, hy], [rx, ry - 30], [rx, ry], [ax, ay - 12]].every(([px = 0, py = 0]) =>
      document.elementFromPoint(host.left + x + px * scale, host.top + y + py * scale) === canvas);
    const bounds = JSON.parse(stage.dataset.dungeonCaptionBounds ?? "null") as { title: number[] | null; detail: number[] | null } | null;
    const rail = (stage.dataset.dungeonCaptionRail ?? "").split(",").map(Number), [cx = 0, cy = 0, cw = 0, ch = 0] = rail;
    const captionFits = bounds !== null && bounds.title !== null && bounds.detail !== null && rail.length === 4
      && cy + ch < 32 && [bounds.title, bounds.detail].every(([tx = 0, ty = 0, tw = 0, th = 0]) =>
        tw > 0 && th > 0 && tx >= cx && ty >= cy && tx + tw <= cx + cw + 0.01 && ty + th <= cy + ch + 0.01)
      && bounds.title[1]! + bounds.title[3]! <= bounds.detail[1]! + 0.01;
    return { wide: room.right - room.left >= (innerWidth <= 760 ? 200 : 350),
      inViewport: room.left >= -1 && room.top >= -1 && room.right <= innerWidth + 1 && room.bottom <= innerHeight + 1,
      unobscured, actorsClear, captionFits, captionSized: Number(stage.dataset.dungeonCaptionTitleSize) >= 12 - 0.001
        && Number(stage.dataset.dungeonCaptionDetailSize) >= 11 - 0.001, pageFits: document.documentElement.scrollWidth <= innerWidth + 1 };
  }), { timeout: 8_000 }).toEqual({ wide: true, inViewport: true, unobscured: true, actorsClear: true,
    captionFits: true, captionSized: true, pageFits: true });
}

async function proveSmithy(page: Page, world: WorldState): Promise<void> {
  const scene = projectSmithyJobScene(world)!;
  expect(scene).not.toBeNull();
  await expect.poll(() => page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset })), { timeout: 8_000 })
    .toMatchObject({ smithyPhase: scene.phase, smithyCommand: scene.commandId, smithyJob: scene.jobId,
      smithyHero: scene.heroId, smithyResident: scene.residentId, smithyBuilding: scene.smithId,
      smithyStroke: `${scene.strokeCount}/2`, smithyShape: scene.shape,
      smithyMana: `${scene.manaBefore}/${scene.manaSpent}/${scene.manaAfter}`,
      smithyGold: `${scene.goldBefore}/${scene.goldEarned}/${scene.goldAfter}`,
      smithyHeroPosition: "128,130", smithyResidentPosition: "232,130", smithyAnvilPosition: "176,136",
      smithyVisual: "native-admitted-workshop-v1", dungeonCaptionTitle: scene.headline });
  const stage = await page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset }));
  expect(stage.dungeonCaptionDetail).toBe(stage.dungeonCaptionLayout === "compact" ? scene.compactDetail : scene.detail);
  await expect.poll(() => page.locator("#watch-hero-mana").evaluate(node => (node as HTMLProgressElement).value))
    .toBe(world.depth.hero.resources.mana);
  await expect(page.locator("#repartee-caption")).toBeHidden();
  await proveWorkshopGeometry(page);
}

test("an earned workshop job spends actual MP, resolves a straight or bent nail once, and preserves its exact sources", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const before = naturalSmithyJobBeforeAdmissionFixture(), ready = naturalSmithyJobFixture();
  const first = advanceWorld(ready), result = advanceWorld(first), bent = commitLegalSmithyStroke(first, "drive"), job = ready.depth.smithyJob!;
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
    expect(advanceWorld(before)).toEqual(ready); expect(before.depth).not.toHaveProperty("smithyJob");
    expect(upgradeWorldState(JSON.parse(JSON.stringify(before)))).toEqual(before);
    expect(before.chronicle.at(-1)?.commandType).toBe("buy-disarming-kit");
    const town = before.depth.towns[job.locationId]!, smith = town.buildings.find(building => building.id === job.smithId)!;
    const host = town.residents.find(resident => resident.id === job.residentId)!;
    expect(smith.kind).toBe("smithy"); expect(smith.residentIds).toContain(host.id); expect(host.homeBuildingId).toBe(smith.id);
    expect(job).toMatchObject({ residentName: host.name, residentRole: host.role, presenceRule: "admitted-together-v1" });
    expect(host.role).toBe("healer"); // Actual host, not a fabricated smith profession.
    expect([...before.depth.companions.active, ...before.depth.companions.former].some(companion => companion.identity.residentId === host.id)).toBe(false);
    expectOnlyJobCost(before, ready, 0, 0); expectOnlyJobCost(ready, first, 1, 0); expectOnlyJobCost(first, result, 0, 2);
    expect(result.depth.smithyJob!.strokes.map(stroke => stroke.stroke)).toEqual(["drive", "tap"]);
    expect(result.depth.smithyJob!.completion).toMatchObject({ shape: "straight", points: 3, goldBefore: 7, goldEarned: 2, goldAfter: 9 });
    expectOnlyJobCost(first, bent, 1, 0);
    expect(bent.depth.smithyJob!.completion).toMatchObject({ shape: "bent", points: 4, goldEarned: 0, line: "Excellent. A corner nail." });
    for (const [a, b, shape, mana, wage] of [["tap", "tap", "unfinished", 0, 0], ["tap", "drive", "straight", 1, 2],
      ["drive", "tap", "straight", 1, 2], ["drive", "drive", "bent", 2, 0]] as const) {
      const alternateFirst = commitLegalSmithyStroke(ready, a), alternateResult = commitLegalSmithyStroke(alternateFirst, b);
      expectOnlyJobCost(ready, alternateResult, mana, wage); expect(alternateResult.depth.smithyJob!.completion!.shape).toBe(shape);
      expect(upgradeWorldState(JSON.parse(JSON.stringify(alternateResult)))).toEqual(alternateResult);
    }
    for (const world of [ready, first, result, bent]) {
      expect(upgradeWorldState(JSON.parse(JSON.stringify(world)))).toEqual(world);
      const receipt = world.depth.smithyJob!.completion ?? world.depth.smithyJob!.strokes.at(-1) ?? world.depth.smithyJob!.admission;
      expect(world.chronicle.at(-1)?.commandId).toBe(`${world.campaignId}:${receipt.sourceCommandId}`);
    }

    await installFixture(page, before);
    await page.emulateMedia({ reducedMotion: "reduce" }); await page.setViewportSize({ width: 1280, height: 800 });
    // Actual earned first-town checkpoint; explicitly fixture-fast playback,
    // not a normal dwell or unattended background-soak claim.
    await page.goto("./?fast", { timeout: 25_000 }); expect(JSON.parse(await pausedSave(page))).toEqual(before);
    const readyRaw = await pausedSave(page, before.tick); expect(JSON.parse(readyRaw)).toEqual(ready);
    await proveSmithy(page, ready); await capture("smithy-job-admission-1280");
    await page.reload({ timeout: 25_000 }); expect(await pausedSave(page)).toBe(readyRaw);
    await proveSmithy(page, ready);
    const firstRaw = await pausedSave(page, ready.tick); expect(JSON.parse(firstRaw)).toEqual(first);
    await page.setViewportSize({ width: 320, height: 568 });
    await proveSmithy(page, first); await capture("smithy-job-drive-320");
    await page.reload({ timeout: 25_000 }); expect(await pausedSave(page)).toBe(firstRaw);
    const resultRaw = await pausedSave(page, first.tick); expect(JSON.parse(resultRaw)).toEqual(result);
    await proveSmithy(page, result);
    await page.setViewportSize({ width: 1280, height: 800 });
    await proveStatus(page, ready); await proveStatus(page, first); await proveStatus(page, result);
    expect(await pausedSave(page)).toBe(resultRaw);
    // Exercise actual startup catch-up eligibility on this existing result
    // reload. A synthetic 60-second checkpoint debt needs no wall-clock wait.
    await page.evaluate(() => sessionStorage.setItem("the-grind-2:test-smithy-resume-debt", "60s"));
    await page.reload({ timeout: 25_000 }); expect(await pausedSave(page)).toBe(resultRaw);
    await proveSmithy(page, result);
    const next = advanceWorld(result);
    expect(next.chronicle.at(-1)?.commandType).toBe("start-inn-bluff");
    expect(JSON.parse(await pausedSave(page, result.tick))).toEqual(next);
    expect(next.depth.smithyJob).toEqual(result.depth.smithyJob);
    expect(next.depth.hero.gold).toBe(result.depth.hero.gold);
    expect(selectSmithyJob(next.depth)).toBeNull(); expect(selectSmithyJobVenue(next.depth)).toBeNull();
    expect(projectSmithyJobScene(next)).toBeNull();
    await expect(page.locator("#stage")).not.toHaveAttribute("data-smithy-phase");

    // Separate explicit legal second-drive branch, committed through the real
    // rules engine using the same earned first stroke. This is not Aster's
    // natural choice, and no personality/resource/outcome field was staged.
    await page.evaluate(world => sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world)), bent);
    await page.setViewportSize({ width: 320, height: 568 }); await page.reload({ timeout: 25_000 });
    const bentRaw = await pausedSave(page); expect(JSON.parse(bentRaw)).toEqual(bent);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await proveSmithy(page, bent); await capture("smithy-job-corner-nail-320-focus");
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await page.setViewportSize({ width: 1280, height: 800 });
    await proveStatus(page, first); await proveStatus(page, bent);
    expect(await pausedSave(page)).toBe(bentRaw);
    await page.reload({ timeout: 25_000 }); expect(await pausedSave(page)).toBe(bentRaw);
    const bentNext = advanceWorld(bent);
    expect(JSON.parse(await pausedSave(page, bent.tick))).toEqual(bentNext);
    expect(bentNext.depth.smithyJob).toEqual(bent.depth.smithyJob); expect(bentNext.depth.hero.gold).toBe(bent.depth.hero.gold);
    expect(selectSmithyJob(bentNext.depth)).toBeNull(); expect(selectSmithyJobVenue(bentNext.depth)).toBeNull();
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
  } finally {
    await testInfo.attach("smithy-job-evidence", { body: JSON.stringify({
      fixture: "Uninterrupted real first-town job and natural straight nail; separately authored legal second drive creates the bent branch",
      admissionTick: ready.tick, firstTick: first.tick, resultTick: result.tick,
      naturalJob: result.depth.smithyJob, bentJob: bent.depth.smithyJob,
      elapsedMs: Date.now() - startedAt, errors, inference, external }, null, 2), contentType: "application/json" });
  }
});
