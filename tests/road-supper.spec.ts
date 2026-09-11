import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, campaignDirector, upgradeWorldState } from "../src/core/simulation";
import { canonicalStringify } from "../src/core/canonical";
import type { WorldState } from "../src/core/types";
import { createRoadRations, roadRationId } from "../src/depth/road-rations";
import { projectRoadSupperCombat, projectRoadSupperScene } from "../src/ui/road-supper-view";
import { projectCombatEnemyFormation } from "../src/render/combat-roster-layout";
import { naturalRoadSupperJourneyFixture, roadSupperCampaignId } from "./road-supper-fixtures";

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
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Road Supper turn did not settle within20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (raw === null || tick !== undefined && JSON.parse(raw).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; button.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(raw);
    }, 20);
    if (tick !== undefined) button.click();
  }), { id: roadSupperCampaignId, tick: afterTick });
}

function priorStories(world: WorldState): string {
  const state = world.depth;
  return canonicalStringify({ repartee: state.repartee, witness: state.reparteeWitness, memory: state.reparteeCallback,
    lesson: state.usefulReply, challenge: state.roomChallenge, bell: state.bellExpedition, bellMemory: state.bellMemory,
    reunion: state.companionReunion, credit: state.companionCredit, smithy: state.smithyJob, inn: state.innBluff,
    gate: state.pennywiseGate, companions: state.companions });
}

async function proveStatus(page: Page, world: WorldState): Promise<void> {
  const source = world.chronicle.at(-1)!;
  const shown = await page.evaluate(eventId => {
    document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="journal"]')!.click();
    document.querySelector<HTMLButtonElement>("#journal-status-button")!.click();
    document.querySelector<HTMLButtonElement>("#journal-status-refresh")!.click();
    const rows = [...document.querySelectorAll<HTMLElement>("#journal-status-list > li")];
    const row = rows.find(entry => entry.dataset.source === "chronicle" && entry.dataset.eventId === eventId)!;
    row.querySelector<HTMLDetailsElement>("details")!.open = true;
    return { count: rows.filter(entry => entry.dataset.source === "chronicle" && entry.dataset.eventId === eventId).length, text: row.textContent };
  }, source.id);
  expect(shown.count).toBe(1);
  for (const text of [source.commandId, source.action, source.consequence]) expect(shown.text).toContain(text);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click());
}

async function proveGeometry(page: Page, battleEnemies = 0): Promise<void> {
  const points = battleEnemies === 0 ? [[124, 109], [124, 139], [172, 135], [211, 132]]
    : [[74, 114], [74, 139], ...projectCombatEnemyFormation(battleEnemies).flatMap(enemy => [[enemy.x, enemy.y - 25], [enemy.x, enemy.y]])];
  await expect.poll(() => page.evaluate(({ actorPoints, battle }) => {
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
    const actorsClear = actorPoints.every(([px = 0, py = 0]) => document.elementFromPoint(host.left + x + px * scale, host.top + y + py * scale) === canvas);
    let captionFits = true;
    if (!battle) {
      const bounds = JSON.parse(stage.dataset.dungeonCaptionBounds ?? "null") as { title: number[] | null; detail: number[] | null } | null;
      const rail = (stage.dataset.dungeonCaptionRail ?? "").split(",").map(Number), [cx = 0, cy = 0, cw = 0, ch = 0] = rail;
      captionFits = bounds?.title != null && bounds.detail != null && rail.length === 4 && cy + ch < 32
        && Number(stage.dataset.dungeonCaptionTitleSize) >= 12 - 0.001 && Number(stage.dataset.dungeonCaptionDetailSize) >= 11 - 0.001
        && [bounds.title, bounds.detail].every(([tx = 0, ty = 0, tw = 0, th = 0]) => tw > 0 && th > 0
          && tx >= cx && ty >= cy && tx + tw <= cx + cw + 0.01 && ty + th <= cy + ch + 0.01)
        && bounds.title[1]! + bounds.title[3]! <= bounds.detail[1]! + 0.01;
    }
    return { wide: room.right - room.left >= (innerWidth <= 760 ? 200 : 350),
      inViewport: room.left >= -1 && room.top >= -1 && room.right <= innerWidth + 1 && room.bottom <= innerHeight + 1,
      unobscured, actorsClear, captionFits, pageFits: document.documentElement.scrollWidth <= innerWidth + 1 };
  }, { actorPoints: points, battle: battleEnemies > 0 }), { timeout: 8_000 }).toEqual({
    wide: true, inViewport: true, unobscured: true, actorsClear: true, captionFits: true, pageFits: true });
}

async function proveSupperScene(page: Page, world: WorldState): Promise<void> {
  const scene = projectRoadSupperScene(world)!;
  expect(scene).not.toBeNull();
  await expect.poll(() => page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset })), { timeout: 8_000 })
    .toMatchObject({ supperPhase: scene.phase, supperCommand: scene.commandId, supperHero: scene.heroId,
      supperLocation: scene.locationId, supperQuantity: `${scene.quantityBefore}/${scene.quantityAfter}`,
      supperGold: `${scene.goldBefore}/${scene.goldAfter}`, supperHeroPosition: "124,139", dungeonCaptionTitle: scene.headline });
  const data = await page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset }));
  expect(data.dungeonCaptionDetail).toBe(data.dungeonCaptionLayout === "compact" ? scene.compactDetail : scene.detail);
  if (scene.phase === "purchase") {
    expect(data.supperMarket).toBe(scene.marketId); expect(data).not.toHaveProperty("supperEncounter");
    expect(data).not.toHaveProperty("supperBowlPosition");
  } else {
    expect(data.supperEncounter).toBe(scene.encounterId); expect(data).not.toHaveProperty("supperMarket");
    expect(data.supperBowlPosition).toBe("172,135"); expect(data.supperSteamProgress).toBe("1.000");
    expect(await page.locator("#stage-focus-narrator").evaluate(node => getComputedStyle(node, "::before").content)).toBe("none");
  }
  await expect(page.locator("#repartee-caption")).toBeHidden();
  await proveGeometry(page);
}

async function proveSupperBattle(page: Page, world: WorldState): Promise<void> {
  const combat = world.depth.combat ?? world.depth.roadSupper!.terminal!.combat;
  const view = projectRoadSupperCombat(combat)!;
  expect(view).not.toBeNull();
  await expect.poll(() => page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset })), { timeout: 8_000 })
    .toMatchObject({ combatId: combat.id, combatSupperPhase: view.phase,
      combatSupperSource: `${world.campaignId}:${view.mealSourceCommandId}` });
  const data = await page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset }));
  if (view.phase === "spent") {
    expect(data.combatSupperEvent).toBe(view.damageEventId);
    expect(data.combatSupperPrevented).toBe(String(view.prevented));
    expect(data.combatSupperGuarded).toBe(String(view.guarded));
    if (combat.supper!.spent!.turn === combat.turn) {
      expect(data.combatQuickReceipt).toContain(`SUPPER USED · ${view.prevented} DMG PREVENTED`);
    }
  } else {
    expect(data).not.toHaveProperty("combatSupperEvent");
    expect(data).not.toHaveProperty("combatSupperPrevented");
  }
  const roster = JSON.parse(data.combatRoster!) as { id: string; health: number; maxHealth: number; mana: number; maxMana: number }[];
  expect(roster).toHaveLength(combat.combatants.length);
  for (const unit of combat.combatants) expect(roster.find(entry => entry.id === unit.id)).toMatchObject({
    health: unit.health, maxHealth: unit.maxHealth, mana: unit.mana, maxMana: unit.maxMana });
  expect(data).not.toHaveProperty("supperCommand"); // The preparation tableau never covers a fight.
  await proveGeometry(page, combat.combatants.filter(unit => unit.side === "enemies").length);
}

test("actual bought rations become one road supper, one source-bound preparation hit, and a retained ordinary battle result", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const { beforePurchase, purchased, beforeMeal, meal, started, turns, resolved, next } = naturalRoadSupperJourneyFixture();
  const story = resolved.depth.roadSupper!, purchase = story.purchase, preparation = story.meal!, terminal = story.terminal!;
  const combat = terminal.combat, spent = combat.supper!.spent;
  const errors: string[] = [], inference: string[] = [], external: string[] = [], startedAt = Date.now();
  const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("worker", worker => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
  page.on("request", request => {
    if (modelUrl.test(request.url())) inference.push(request.url());
    if (new URL(request.url()).origin !== new URL(testInfo.project.use.baseURL!).origin) external.push(request.url());
  });
  const milestone = (message: string): void => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map(part => [part.type, part.value]));
    console.log(`[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}] Road Supper +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${message}`);
  };
  const capture = async (name: string): Promise<void> => {
    if (process.env.TG2_VISUAL_CAPTURE !== "1") return;
    const path = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path, timeout: 8_000 });
    await testInfo.attach(name, { path, contentType: "image/png" });
  };
  try {
    expect([beforePurchase.tick, purchased.tick, beforeMeal.tick, meal.tick, started.tick, resolved.tick, next.tick])
      .toEqual([59, 60, 61, 62, 63, 65, 66]);
    expect(beforePurchase.chronicle.at(-1)?.commandType).toBe("train-ability");
    expect(beforePurchase.depth).not.toHaveProperty("roadSupper");
    expect(Object.values(beforePurchase.depth.towns).filter(town => town.visits > 0).length).toBeGreaterThanOrEqual(2);
    const town = beforePurchase.depth.towns[purchase.locationId]!, market = town.buildings.find(building => building.id === purchase.marketId)!;
    expect(market.kind).toBe("market");
    expect(town.districts.some(district => district.id === market.districtId && district.buildingIds.includes(market.id))).toBe(true);
    expect(purchased.chronicle.at(-1)?.commandId).toBe(`${purchased.campaignId}:${purchase.sourceCommandId}`);
    expect(purchased.depth.hero).toEqual({ ...beforePurchase.depth.hero, gold: beforePurchase.depth.hero.gold - 2,
      inventory: [...beforePurchase.depth.hero.inventory, createRoadRations(beforePurchase.hero.id)] });
    expect(purchased.hero).toEqual({ ...beforePurchase.hero, gold: beforePurchase.hero.gold - 2 });
    expect(purchase).toMatchObject({ quantityBefore: 0, quantityAfter: 2, goldSpent: 2, unitPrice: 1 });
    expect(beforeMeal.depth.hero.inventory.find(item => item.id === roadRationId(beforeMeal.hero.id))?.quantity).toBe(2);
    expect(meal.depth.hero).toEqual({ ...beforeMeal.depth.hero,
      inventory: beforeMeal.depth.hero.inventory.filter(item => item.id !== roadRationId(beforeMeal.hero.id)) });
    expect(meal.hero).toEqual(beforeMeal.hero);
    expect(meal.chronicle.at(-1)?.commandId).toBe(`${meal.campaignId}:${preparation.sourceCommandId}`);
    expect(preparation).toMatchObject({ quantityBefore: 2, quantityAfter: 0 });
    expect(preparation.route).toEqual(beforeMeal.depth.atlas.route);
    expect(meal.depth.atlas).toEqual(beforeMeal.depth.atlas);
    expect(meal.depth.quest).toEqual(beforeMeal.depth.quest);
    expect(meal.depth.pendingQuestReward).toEqual(beforeMeal.depth.pendingQuestReward);
    expect(campaignDirector(meal).candidates[0]?.command).toEqual({ type: "start-combat",
      encounterId: preparation.encounterId, enemyCount: preparation.enemyCount });
    expect(started.depth.combat!.id).toBe(preparation.encounterId);
    expect(started.depth.combat!.supper).toMatchObject({ heroId: meal.hero.id,
      mealSourceCommandId: preparation.sourceCommandId, mealTick: meal.tick, spent: null });
    expect(started.depth.combat!.combatants.every(unit => unit.statuses.every(status => status.kind !== "guarding"))).toBe(true);
    expect(spent, "The actual journey must demonstrate a real first incoming hit, not an invented meal payoff").not.toBeNull();
    const hit = combat.eventStream.events.find(event => event.id === spent!.damageEventId)!;
    expect(hit.kind).toBe("damage");
    if (hit.kind !== "damage") throw new Error("Meal source does not name a damage event");
    expect(hit.supper).toEqual(spent);
    expect(spent!.damageAfter).toBe(spent!.guarded ? spent!.damageBefore : Math.max(1, Math.floor(spent!.damageBefore * 0.75)));
    expect(spent!.prevented).toBe(Math.min(hit.healthBefore, spent!.damageBefore) - Math.min(hit.healthBefore, spent!.damageAfter));
    expect(hit.amount).toBe(Math.min(hit.healthBefore, spent!.damageAfter));
    // The real first hit still exceeds Aster's health. Do not turn a17-point
    // raw reduction into a fabricated17HP save or substitute a victory.
    expect(spent).toMatchObject({ damageBefore: 65, damageAfter: 48, healthBefore: 42, prevented: 0, guarded: false });
    expect(combat.outcome).toBe("defeat");
    expect(resolved.depth.hero.resources).toMatchObject({ health: 0, mana: 19 });
    expect(resolved.depth.hero.gold).toBe(meal.depth.hero.gold);
    expect(resolved.depth.hero.inventory).toEqual(meal.depth.hero.inventory);
    expect([meal.hero.experience, started.hero.experience, turns[0]!.hero.experience, resolved.hero.experience, next.hero.experience])
      .toEqual([45, 53, 61, 61, 62]); // Only existing battle entry/hero action/recovery XP.
    expect(combat.eventStream.events.filter(event => event.kind === "damage" && event.supper !== undefined)).toHaveLength(1);
    expect(resolved.chronicle.at(-1)?.commandId).toBe(`${resolved.campaignId}:${terminal.sourceCommandId}`);
    for (const state of [beforePurchase, purchased, beforeMeal, meal, started, ...turns, next]) {
      expect(upgradeWorldState(JSON.parse(canonicalStringify(state)))).toEqual(state);
      expect(priorStories(state)).toBe(priorStories(beforePurchase));
    }
    expect(next.depth.roadSupper).toEqual(story);
    expect(next.depth.completedCombats.filter(entry => entry.id === combat.id)).toEqual([combat]);
    expect(next.depth.hero.inventory.some(item => item.id === roadRationId(next.hero.id))).toBe(false);
    expect(next.depth.hero.resources).toMatchObject({ health: 11, mana: 24 });
    expect(next.depth.hero.gold).toBe(resolved.depth.hero.gold);
    expect(projectRoadSupperScene(next)).toBeNull();

    await installFixture(page, beforePurchase);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    // Fast fixture playback, not a claim about normal camp dwell duration.
    await page.goto("./?fast", { timeout: 25_000 });
    expect(JSON.parse(await pausedSave(page))).toEqual(beforePurchase);
    const purchaseRaw = await pausedSave(page, beforePurchase.tick);
    expect(JSON.parse(purchaseRaw)).toEqual(purchased);
    await proveSupperScene(page, purchased); await capture("road-supper-purchase-1280");
    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(purchaseRaw);
    await proveSupperScene(page, purchased);
    await proveStatus(page, purchased);
    milestone(`T${purchased.tick} actual market purchase: two owned rations, exactly2gold, no replay on reload`);

    let current = purchased;
    while (current.tick < beforeMeal.tick) {
      const expected = advanceWorld(current);
      expect(JSON.parse(await pausedSave(page, current.tick))).toEqual(expected);
      current = expected;
    }
    expect(current).toEqual(beforeMeal);
    const mealRaw = await pausedSave(page, beforeMeal.tick);
    expect(JSON.parse(mealRaw)).toEqual(meal);
    await page.setViewportSize({ width: 320, height: 568 });
    await proveSupperScene(page, meal); await capture("road-supper-camp-320");
    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(mealRaw);
    await proveSupperScene(page, meal);
    await proveStatus(page, meal);
    milestone(`T${meal.tick} actual route camp consumes2→0; HP/MP/XP/gold and route unchanged; exact saved meal source`);

    const startedRaw = await pausedSave(page, meal.tick);
    expect(JSON.parse(startedRaw)).toEqual(started);
    // Existing earned-level presentation owns this entry beat (45 + 8 = 53).
    // Use its real outcome button, as in site.spec.ts, while keeping play paused.
    const earnedLevel = page.locator("#level-up-cutaway");
    await expect(earnedLevel).toBeVisible();
    expect(await earnedLevel.evaluate(node => ({ kind: (node as HTMLElement).dataset.montageKind,
      event: (node as HTMLElement).dataset.eventId,
      threshold: node.querySelector("#level-up-cutaway-threshold")?.textContent,
      level: node.querySelector("#level-up-cutaway-level")?.textContent })))
      .toEqual({ kind: "level", event: started.chronicle.at(-1)!.id,
        threshold: "45 + 8 = 53 XP · threshold 48", level: "LEVEL 2 → 3" });
    await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "true");
    await expect(page.locator("#level-up-cutaway-outcome")).toHaveText("Show level");
    await page.locator("#level-up-cutaway-outcome").press("Enter");
    await expect(page.locator("#app")).toHaveAttribute("data-presentation-busy", "false");
    await expect(earnedLevel).toHaveAttribute("data-active", "false");
    await expect(earnedLevel).toHaveAttribute("data-phase", "final");
    await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "true");
    expect(await pausedSave(page)).toBe(startedRaw);
    // Its final pose owns the paused beat. Existing site acceptance reloads
    // the exact save to inspect the restored battle without replaying the award.
    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(startedRaw);
    await expect(earnedLevel).toBeHidden();
    await proveSupperBattle(page, started);
    let previous = started, terminalRaw = "", capturedHit = false;
    for (const state of turns) {
      terminalRaw = await pausedSave(page, previous.tick);
      expect(JSON.parse(terminalRaw)).toEqual(state);
      const actualCombat = state.depth.combat ?? state.depth.roadSupper!.terminal!.combat;
      if (!capturedHit && actualCombat.supper!.spent !== null) {
        await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
        await proveSupperBattle(page, state); await capture("road-supper-first-hit-320-focus");
        expect(await pausedSave(page)).toBe(terminalRaw);
        await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
        await proveStatus(page, state);
        capturedHit = true;
      }
      previous = state;
    }
    expect(capturedHit).toBe(true);
    await proveSupperBattle(page, resolved);
    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(terminalRaw);
    await proveSupperBattle(page, resolved);
    await proveStatus(page, purchased); await proveStatus(page, meal); await proveStatus(page, resolved);
    milestone(`Actual ${combat.outcome}: one source-bound hit consumed preparation; ${spent!.prevented} actualHP prevented, no invented victory`);

    expect(JSON.parse(await pausedSave(page, resolved.tick))).toEqual(next);
    expect(next.chronicle.at(-1)?.commandType).not.toBe("buy-road-rations");
    expect(next.chronicle.at(-1)?.commandType).not.toBe("prepare-road-supper");
    await expect(page.locator("#stage")).not.toHaveAttribute("data-supper-command");
    await expect(page.locator("#stage")).not.toHaveAttribute("data-combat-supper-source");
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone("Ordinary continuation retains one purchase/meal/battle receipt; no runtime error, model or external request");
  } finally {
    await testInfo.attach("Road Supper actual source diagnostics", { body: JSON.stringify({ errors, inference, external,
      ticks: [beforePurchase.tick, purchased.tick, beforeMeal.tick, meal.tick, started.tick, resolved.tick, next.tick],
      purchase, preparation, spent, outcome: combat.outcome, elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
