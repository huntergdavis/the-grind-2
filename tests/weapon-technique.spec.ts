import { expect, test, type Page } from "@playwright/test";
import { canonicalStringify } from "../src/core/canonical";
import { advanceWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { projectCombatEnemyFormation } from "../src/render/combat-roster-layout";
import { naturalWeaponTechniquePayoffFixture, turningCheckId, weaponTechniqueCampaignId } from "./weapon-technique-fixtures";

async function installDurableFixture(page: Page, world: WorldState): Promise<void> {
  // Restore the actual earned T58 checkpoint; no item, battle or training is staged.
  await page.goto("./version.json", { timeout: 20_000 });
  await page.evaluate(async state => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("the-grind-2", 2);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("campaigns", { keyPath: "campaignId" });
        request.result.createObjectStore("settings");
        request.result.createObjectStore("champions", { keyPath: "id" });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["campaigns", "settings"], "readwrite");
      transaction.objectStore("campaigns").put(state);
      transaction.objectStore("settings").put(state.campaignId, "activeCampaignId");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, world);
  await page.addInitScript(campaignId => {
    localStorage.setItem(`the-grind-2:last-active:${campaignId}`, String(Date.now() + 3_600_000));
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
  }, world.campaignId);
}

async function durableSave(page: Page): Promise<WorldState> {
  return page.evaluate(id => new Promise<WorldState>((resolve, reject) => {
    const request = indexedDB.open("the-grind-2", 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result, transaction = database.transaction("campaigns", "readonly");
      const saved = transaction.objectStore("campaigns").get(id);
      transaction.oncomplete = () => { database.close(); resolve(saved.result as WorldState); };
      transaction.onerror = () => { database.close(); reject(transaction.error); };
    };
  }), weaponTechniqueCampaignId);
}

async function pausedSave(page: Page, afterTick?: number): Promise<string> {
  return page.evaluate(({ id, tick }) => new Promise<string>((resolve, reject) => {
    const app = document.querySelector<HTMLElement>("#app")!, button = document.querySelector<HTMLButtonElement>("#pause-button")!;
    let requested = false;
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Weapon technique turn did not settle within20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (raw === null || tick !== undefined && JSON.parse(raw).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; button.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(raw);
    }, 20);
    if (tick !== undefined) button.click();
  }), { id: weaponTechniqueCampaignId, tick: afterTick });
}



async function resumeEarnedCheckpoint(page: Page, world: WorldState): Promise<void> {
  await page.evaluate(async state => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("the-grind-2", 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("campaigns", "readwrite");
      transaction.objectStore("campaigns").put(state);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
    sessionStorage.setItem(`the-grind-2:campaign:${state.campaignId}`, JSON.stringify(state));
  }, world);
  await page.reload({ timeout: 25_000 });
  expect(JSON.parse(await pausedSave(page))).toEqual(world);
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

async function proveGeometry(page: Page, world: WorldState, training = false): Promise<void> {
  const enemies = world.depth.combat?.combatants.filter(unit => unit.side === "enemies").length ?? 0;
  const actorPoints = training ? [[139, 117], [139, 145], [225, 112]]
    : [[74, 114], [74, 139], ...projectCombatEnemyFormation(enemies).flatMap(enemy => [[enemy.x, enemy.y - 25], [enemy.x, enemy.y]])];
  await expect.poll(() => page.evaluate(({ points, lesson }) => {
    const stage = document.querySelector<HTMLElement>("#stage")!, canvas = stage.querySelector("canvas")!, host = stage.getBoundingClientRect();
    const [scale = 0, x = 0, y = 0] = (stage.dataset.sceneLayout ?? "").split(",").map(Number);
    const room = { left: host.left + x + 44 * scale, top: host.top + y + 32 * scale,
      right: host.left + x + 276 * scale, bottom: host.top + y + 156 * scale };
    const unobscured = ["#topbar", "#view-toolbar", "#stage-focus-ribbon", "#stage-focus-controls", "#hero-hud", "#chronicle"].every(selector => {
      const node = document.querySelector<HTMLElement>(selector);
      if (node === null || node.hidden || getComputedStyle(node).display === "none") return true;
      const box = node.getBoundingClientRect();
      return box.width === 0 || box.height === 0 || room.right <= box.left + .5 || room.left >= box.right - .5
        || room.bottom <= box.top + .5 || room.top >= box.bottom - .5;
    });
    const actualPoints = [...points];
    if (lesson) {
      const glyph = (stage.dataset.techniqueGlyphPosition ?? "").split(",").map(Number);
      if (glyph.length === 2 && glyph.every(Number.isFinite)) actualPoints.push(glyph);
      else return { missingActualGlyph: true };
    }
    const actorsClear = actualPoints.every(([px = 0, py = 0]) =>
      document.elementFromPoint(host.left + x + px * scale, host.top + y + py * scale) === canvas);
    const headline = document.querySelector<HTMLElement>("#stage-focus-headline")!, box = headline.getBoundingClientRect();
    const headlineFits = !lesson || box.width > 0 && box.height > 0 && box.left >= -1 && box.right <= innerWidth + 1
      && Number.parseFloat(getComputedStyle(headline).fontSize) >= 12 && headline.scrollWidth <= headline.clientWidth + 1;
    return { wide: room.right - room.left >= (innerWidth <= 760 ? 200 : 350),
      inViewport: room.left >= -1 && room.top >= -1 && room.right <= innerWidth + 1 && room.bottom <= innerHeight + 1,
      unobscured, actorsClear, headlineFits, pageFits: document.documentElement.scrollWidth <= innerWidth + 1 };
  }, { points: actorPoints, lesson: training }), { timeout: 8_000 }).toEqual({
    wide: true, inViewport: true, unobscured: true, actorsClear: true, headlineFits: true, pageFits: true });
}

async function proveLesson(page: Page, world: WorldState): Promise<void> {
  const receipt = world.depth.weaponTechniqueCertification!;
  await expect(page.locator("#stage-focus-headline")).toHaveText("Turning Check · learned from the blade");
  await expect(page.locator("#stage-focus-headline")).toHaveAttribute("data-technique-command", world.chronicle.at(-1)!.commandId);
  await expect.poll(() => page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset }))).toMatchObject({
    techniqueCommand: world.chronicle.at(-1)!.commandId, techniqueAbility: turningCheckId,
    techniqueWeapon: receipt.weapon.id, techniqueUseReceipt: receipt.sourceUseReceipt.id,
    techniqueEffect: "weaken", techniqueHeroPosition: "139,145", techniqueDummyPosition: "225,112",
    techniqueVisual: "actual-equipped-weapon|practice-dummy|certified-weaken-glyph" });
  // #stage-focus-action is intentionally hidden legacy compatibility markup.
  // Visible cost/effect/permanence are proved in the real Skills card below.
  await proveGeometry(page, world, true);
}

async function proveSkills(page: Page, world: WorldState): Promise<void> {
  const receipt = world.depth.weaponTechniqueCertification!, originalRaw = await pausedSave(page);
  await page.locator('#view-toolbar [data-view="spellbook"]').click();
  const card = page.locator('#spellbook-grid .spellbook-ability[data-ability-id="' + turningCheckId + '"]');
  await expect(card).toHaveCount(1);
  await expect(card.locator(".spellbook-effect")).toHaveText("Half damage · Weakened (2)");
  const source = card.locator("details.spellbook-weapon-technique");
  await expect(source).toHaveAttribute("data-learning-source", receipt.sourceCommandId);
  await expect(source).toHaveAttribute("data-use-receipt", receipt.sourceUseReceipt.id);
  await expect(source).toHaveAttribute("data-damage-rule", "weapon-check-half-v1");
  await source.evaluate(node => { (node as HTMLDetailsElement).open = true; });
  for (const text of ["Learned from Roadworn Blade", "Permanently learned", "Changing weapons does not remove", "2 MP",
    "half direct damage after armor and before Guard", "softening the next retaliation", "1 basic strike, 14 damage",
    receipt.weapon.id, receipt.sourceCommandId, receipt.sourceUseReceipt.id, receipt.sourceUseReceipt.combatId])
    await expect(source).toContainText(text);
  expect(await pausedSave(page)).toBe(originalRaw);
  await page.locator('#view-toolbar [data-view="watch"]').click();
}

async function proveBattle(page: Page, world: WorldState): Promise<void> {
  const combat = world.depth.combat!;
  await expect.poll(() => page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset }))).toMatchObject({
    combatId: combat.id, combatTurn: String(combat.turn), combatRosterSurface: "native-hud" });
  const data = await page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset }));
  const roster = JSON.parse(data.combatRoster!) as { id: string; health: number; maxHealth: number; mana: number; maxMana: number }[];
  expect(roster).toHaveLength(combat.combatants.length);
  for (const unit of combat.combatants) expect(roster.find(entry => entry.id === unit.id)).toMatchObject({
    health: unit.health, maxHealth: unit.maxHealth, mana: unit.mana, maxMana: unit.maxMana });
  expect(data).not.toHaveProperty("techniqueCommand");
  await expect(page.locator("#stage-focus-headline")).not.toHaveAttribute("data-technique-command");
  await proveGeometry(page, world);
}

test("an earned blade technique stays learned and softens a real surviving enemy's retaliation", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const startedAt = Date.now(), journey = naturalWeaponTechniquePayoffFixture();
  const { before, learned, next, beforeApplication, applied, beforeRetaliation, retaliated } = journey;
  const onward = advanceWorld(retaliated), receipt = learned.depth.weaponTechniqueCertification!;
  const errors: string[] = [], inference: string[] = [], external: string[] = [];
  const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("worker", worker => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
  page.on("request", request => {
    if (modelUrl.test(request.url())) inference.push(request.url());
    if (new URL(request.url()).origin !== new URL(testInfo.project.use.baseURL!).origin) external.push(request.url());
  });
  const milestone = (message: string): void => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map(part => [part.type, part.value]));
    console.log("[" + parts.year + "-" + parts.month + "-" + parts.day + " " + parts.hour + ":" + parts.minute + ":" + parts.second + " " + parts.timeZoneName
      + "] Technique +" + ((Date.now() - startedAt) / 1000).toFixed(1) + "s: " + message);
  };
  const capture = async (name: string): Promise<void> => {
    if (process.env.TG2_VISUAL_CAPTURE !== "1") return;
    const path = testInfo.outputPath(name + ".png");
    await page.screenshot({ path, timeout: 8_000 });
    await testInfo.attach(name, { path, contentType: "image/png" });
  };
  try {
    expect([before.tick, learned.tick, next.tick, beforeApplication.tick, applied.tick, retaliated.tick]).toEqual([58, 59, 60, 275, 276, 277]);
    expect(journey.firstAttempt.targetSurvived).toBe(false); // T77 is a lethal use, not the control payoff.
    expect(beforeRetaliation).toEqual(applied);
    expect(receipt.ability).toMatchObject({ damageRule: "weapon-check-half-v1", manaCost: 2, potency: 2, experience: 0, uses: 0 });
    expect([journey.retaliationEvent.amount, journey.damageWithoutTechnique, journey.damagePrevented]).toEqual([21, 23, 2]);
    expect([beforeApplication.depth.hero.resources.mana, applied.depth.hero.resources.mana]).toEqual([25, 23]);
    expect([beforeRetaliation.depth.hero.resources.health, retaliated.depth.hero.resources.health]).toEqual([42, 21]);
    expect(beforeApplication.depth.hero.equipment.weapon).not.toBe(receipt.weapon.id); // Actual later equipment, not a staged swap.
    expect(applied.depth.weaponTechniqueCertification).toEqual(receipt);
    expect(retaliated.depth.weaponTechniqueCertification).toEqual(receipt);
    expect(applied.depth.combat!.combatants.find(unit => unit.id === journey.applicationEvent.targetId)!.health).toBe(15);
    expect([beforeApplication.hero.level, applied.hero.level]).toEqual([beforeApplication.hero.level, beforeApplication.hero.level]);
    for (const world of [before, learned, next, beforeApplication, applied, retaliated, onward])
      expect(canonicalStringify(upgradeWorldState(JSON.parse(canonicalStringify(world))))).toBe(canonicalStringify(world));

    await installDurableFixture(page, before);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./?fast", { timeout: 25_000 });
    expect(JSON.parse(await pausedSave(page))).toEqual(before);
    const learnedRaw = await pausedSave(page, before.tick);
    expect(JSON.parse(learnedRaw)).toEqual(learned);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(learned));
    await proveLesson(page, learned); await capture("weapon-technique-learning-1280");
    await proveSkills(page, learned); await proveStatus(page, learned);
    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(learnedRaw);
    await proveLesson(page, learned);
    expect(JSON.parse(await pausedSave(page, learned.tick))).toEqual(next);
    await expect(page.locator("#stage")).not.toHaveAttribute("data-technique-command");
    milestone("actual T59 lesson, unchanged old mastery/resources, one existing hero XP, exact reload and ordinary T60 rations");

    // Resume the SAME source-executed campaign at its earned T275 boundary.
    // The intervening turns and real weapon replacement are not browser playback.
    await resumeEarnedCheckpoint(page, beforeApplication);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(beforeApplication));
    await page.setViewportSize({ width: 320, height: 568 });
    const appliedRaw = await pausedSave(page, beforeApplication.tick);
    expect(JSON.parse(appliedRaw)).toEqual(applied);
    await expect(page.locator("#level-up-cutaway")).toBeHidden();
    await proveBattle(page, applied);
    await expect(page.locator("#stage")).toHaveAttribute("data-combat-statuses", /status-applied:weakened/);
    await capture("weapon-technique-applied-320");
    await proveStatus(page, applied);
    expect(await pausedSave(page)).toBe(appliedRaw);
    const retaliationRaw = await pausedSave(page, applied.tick);
    expect(JSON.parse(retaliationRaw)).toEqual(retaliated);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(retaliated));
    await page.locator("#stage-focus-button").click();
    await expect(page.locator("#app")).toHaveAttribute("data-chrome-mode", "focus");
    await proveBattle(page, retaliated);
    await expect(page.locator("#stage")).toHaveAttribute("data-combat-statuses", /status-tick:weakened/);
    await capture("weapon-technique-retaliation-320-focus");
    await page.keyboard.press("Escape");
    await proveStatus(page, retaliated); await proveSkills(page, retaliated);
    milestone("earned T276 target survives; real T277 retaliation costs21HP instead of same-hit23; no forced policy or target");

    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(retaliationRaw);
    await proveBattle(page, retaliated);
    expect(JSON.parse(await pausedSave(page, retaliated.tick))).toEqual(onward);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(onward));
    expect(onward.depth.weaponTechniqueCertification).toEqual(receipt);
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone("exact combat reload and actual ordinary continuation; permanent source receipt retained; zero errors/external/model requests");
  } finally {
    await testInfo.attach("Weapon technique source diagnostics", { body: JSON.stringify({ errors, inference, external,
      ticks: [before.tick, learned.tick, next.tick, beforeApplication.tick, applied.tick, retaliated.tick, onward.tick],
      receipt, application: journey.applicationEvent, status: journey.statusTickEvent, retaliation: journey.retaliationEvent,
      damageWithoutTechnique: journey.damageWithoutTechnique, damagePrevented: journey.damagePrevented,
      elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
