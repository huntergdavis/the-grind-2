import { expect, test, type Page } from "@playwright/test";
import { canonicalStringify } from "../src/core/canonical";
import { advanceWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { projectCombatEnemyFormation } from "../src/render/combat-roster-layout";
import { projectCombatAftermathScene, projectCombatAftermathEntry } from "../src/ui/combat-aftermath";
import { releasedCombatAftermathFixture, aftermathCampaignId } from "./combat-aftermath-fixtures";

async function installDurableFixture(page: Page, world: WorldState): Promise<void> {
  // Existing IndexedDB save seam, not a staged battle. Restore the exact
  // released v176 T64 checkpoint, not a fresh v177 campaign claim.
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
  }), aftermathCampaignId);
}

async function pausedSave(page: Page, afterTick?: number): Promise<string> {
  return page.evaluate(({ id, tick }) => new Promise<string>((resolve, reject) => {
    const app = document.querySelector<HTMLElement>("#app")!, button = document.querySelector<HTMLButtonElement>("#pause-button")!;
    let requested = false;
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Last exchange turn did not settle within20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (raw === null || tick !== undefined && JSON.parse(raw).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; button.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(raw);
    }, 20);
    if (tick !== undefined) button.click();
  }), { id: aftermathCampaignId, tick: afterTick });
}

async function proveBattleGeometry(page: Page, enemyCount: number): Promise<void> {
  const points = [[74, 114], [74, 139], ...projectCombatEnemyFormation(enemyCount).flatMap(enemy => [[enemy.x, enemy.y - 25], [enemy.x, enemy.y]])];
  await expect.poll(() => page.evaluate(actorPoints => {
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
    const ribbon = document.querySelector<HTMLElement>("#stage-focus-ribbon")!, box = ribbon.getBoundingClientRect();
    const headline = document.querySelector<HTMLElement>("#stage-focus-headline")!, headlineBox = headline.getBoundingClientRect();
    return { actorsClear, unobscured, wide: room.right - room.left >= (innerWidth <= 760 ? 200 : 350),
      inViewport: room.left >= -1 && room.top >= -1 && room.right <= innerWidth + 1 && room.bottom <= innerHeight + 1,
      ribbonFits: box.left >= 0 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1 && room.bottom <= box.top + 1,
      headlineFits: headlineBox.left >= box.left && headlineBox.right <= box.right + 1 && headlineBox.bottom <= box.bottom + 1
        && headline.scrollWidth <= headline.clientWidth + 1 && headline.scrollHeight <= headline.clientHeight + 1
        && Number.parseFloat(getComputedStyle(headline).fontSize) >= 12,
      pageFits: document.documentElement.scrollWidth <= innerWidth + 1 };
  }, points), { timeout: 8_000 }).toEqual({ actorsClear: true, unobscured: true, wide: true,
    inViewport: true, ribbonFits: true, headlineFits: true, pageFits: true });
}

async function proveWatchRecap(page: Page, world: WorldState): Promise<void> {
  const recap = projectCombatAftermathScene(world);
  expect(recap).not.toBeNull();
  const headline = page.locator("#stage-focus-headline");
  await expect(headline).toHaveAttribute("data-aftermath-command", recap!.commandId);
  await expect(headline).toHaveAttribute("title", `${recap!.headline}: ${recap!.detail}`);
  expect(await headline.evaluate(node => ({ text: node.textContent, command: (node as HTMLElement).dataset.aftermathCommand,
    combat: (node as HTMLElement).dataset.aftermathCombat, tick: (node as HTMLElement).dataset.aftermathTick })))
    .toEqual({ text: recap!.compactDetail, command: recap!.commandId, combat: recap!.combatId, tick: String(recap!.tick) });
  const combat = world.depth.roadSupper!.terminal!.combat;
  const data = await page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset }));
  expect(data.combatId).toBe(combat.id);
  expect(data.combatSupperPrevented).toBe("0");
  expect(data.combatSupperEvent).toBe(combat.supper!.spent!.damageEventId);
  expect(data.combatQuickReceipt).toContain("SUPPER USED · 0 DMG PREVENTED");
  const roster = JSON.parse(data.combatRoster!) as { id: string; health: number }[];
  expect(roster.find(unit => unit.id === world.hero.id)?.health).toBe(0);
  await proveBattleGeometry(page, combat.combatants.filter(unit => unit.side === "enemies").length);
}

async function proveStatusRecap(page: Page, current: WorldState, terminal: WorldState): Promise<void> {
  const source = terminal.chronicle.at(-1)!, recap = projectCombatAftermathEntry(current, source);
  expect(recap).not.toBeNull();
  const note = await page.evaluate(eventId => {
    document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="journal"]')!.click();
    document.querySelector<HTMLButtonElement>("#journal-status-button")!.click();
    document.querySelector<HTMLButtonElement>("#journal-status-refresh")!.click();
    const rows = [...document.querySelectorAll<HTMLElement>("#journal-status-list > li")];
    const row = rows.find(entry => entry.dataset.source === "chronicle" && entry.dataset.eventId === eventId)!;
    const details = row.querySelector<HTMLDetailsElement>("details.journal-status-aftermath")!;
    const collapsed = !details.open;
    details.querySelector<HTMLElement>(":scope > summary")!.click();
    return { count: rows.filter(entry => entry.dataset.source === "chronicle" && entry.dataset.eventId === eventId).length,
      collapsed, opened: details.open, summary: details.querySelector("summary")?.textContent, text: details.textContent,
      command: details.dataset.aftermathCommand, combat: details.dataset.aftermathCombat,
      tick: details.dataset.aftermathTick, events: JSON.parse(details.dataset.aftermathEvents!),
      rowText: row.textContent };
  }, source.id);
  expect(note).toMatchObject({ count: 1, collapsed: true, opened: true, summary: "Last exchange" });
  expect(note).toMatchObject({ command: recap!.commandId, combat: recap!.combatId,
    tick: String(recap!.tick), events: recap!.sourceEventIds });
  for (const text of [recap!.detail, source.commandId, ...recap!.sourceEventIds]) expect(note.text).toContain(text);
  expect(note.rowText).toContain(source.action); expect(note.rowText).toContain(source.consequence);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click());
}

test("the released save's actual last exchange survives reload and remains in Status after ordinary recovery", async ({ page }, testInfo) => {
  test.setTimeout(100_000);
  const startedAt = Date.now(), journey = releasedCombatAftermathFixture();
  const before = journey.before, terminal = journey.resolved, next = journey.next;
  const combat = terminal.depth.roadSupper!.terminal!.combat, source = terminal.chronicle.at(-1)!;
  const heroDamage = [...combat.eventStream.events].reverse().find(event => event.kind === "damage" && event.actorId === before.hero.id);
  const finalDamage = combat.eventStream.events.find(event => event.kind === "damage" && event.id === combat.supper!.spent!.damageEventId);
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
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map(part => [part.type, part.value]));
    console.log(`[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}] Last exchange +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${message}`);
  };
  const capture = async (name: string): Promise<void> => {
    if (process.env.TG2_VISUAL_CAPTURE !== "1") return;
    const path = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path, timeout: 8_000 });
    await testInfo.attach(name, { path, contentType: "image/png" });
  };
  try {
    expect([before.tick, terminal.tick, next.tick]).toEqual([64, 65, 66]);
    expect(advanceWorld(before)).toEqual(terminal); expect(advanceWorld(terminal)).toEqual(next);
    expect(heroDamage?.kind).toBe("damage"); expect(finalDamage?.kind).toBe("damage");
    if (heroDamage?.kind !== "damage" || finalDamage?.kind !== "damage") throw new Error("The actual retained exchange needs both direct damage events");
    expect(heroDamage.targetId).not.toBe(finalDamage.actorId);
    expect(heroDamage.amount).toBeGreaterThan(0);
    expect(finalDamage).toMatchObject({ targetId: before.hero.id, healthBefore: 42, healthAfter: 0, amount: 42 });
    expect(finalDamage.supper).toMatchObject({ damageBefore: 65, damageAfter: 48, prevented: 0 });
    expect(combat.outcome).toBe("defeat");
    expect(source.commandId).toBe(`${terminal.campaignId}:${terminal.depth.roadSupper!.terminal!.sourceCommandId}`);
    const recap = projectCombatAftermathScene(terminal)!;
    expect(recap).not.toBeNull();
    expect(recap.sourceEventIds).toEqual(expect.arrayContaining([heroDamage.id, finalDamage.id]));
    for (const id of [before.hero.id, heroDamage.targetId, finalDamage.actorId]) {
      expect(recap.detail).toContain(combat.combatants.find(unit => unit.id === id)!.name);
    }
    expect(projectCombatAftermathScene(before)).toBeNull(); expect(projectCombatAftermathScene(next)).toBeNull();
    expect(projectCombatAftermathEntry(next, source)).toEqual(recap);
    for (const state of [before, terminal, next]) expect(canonicalStringify(upgradeWorldState(JSON.parse(canonicalStringify(state))))).toBe(canonicalStringify(state));

    await installDurableFixture(page, before);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./?fast", { timeout: 25_000 });
    expect(JSON.parse(await pausedSave(page))).toEqual(before);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(before));
    await expect(page.locator("#level-up-cutaway")).toBeHidden();
    await expect(page.locator("#stage-focus-headline")).not.toHaveAttribute("data-aftermath-command");
    milestone("exact released v176 T64 restored from IndexedDB; no staged result or repeated level intermission");

    const terminalRaw = await pausedSave(page, before.tick);
    expect(JSON.parse(terminalRaw)).toEqual(terminal);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(terminal));
    await proveWatchRecap(page, terminal); await capture("last-exchange-1280");
    await proveStatusRecap(page, terminal, terminal);
    await page.setViewportSize({ width: 320, height: 568 });
    await proveWatchRecap(page, terminal); await capture("last-exchange-320");
    await page.locator("#stage-focus-button").click();
    await expect(page.locator("#app")).toHaveAttribute("data-chrome-mode", "focus");
    await proveWatchRecap(page, terminal); await capture("last-exchange-320-focus");
    expect(await pausedSave(page)).toBe(terminalRaw);
    await page.keyboard.press("Escape");
    await expect(page.locator("#app")).toHaveAttribute("data-chrome-mode", "panels");
    milestone("actual fatal exchange and distinct preceding target visible at desktop,320px,and Focus; zero HP saved preserved");

    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(terminalRaw);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(terminal));
    await proveWatchRecap(page, terminal); await proveStatusRecap(page, terminal, terminal);
    expect(JSON.parse(await pausedSave(page, terminal.tick))).toEqual(next);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(next));
    await expect(page.locator("#stage-focus-headline")).not.toHaveAttribute("data-aftermath-command");
    const cleared = await page.locator("#stage-focus-headline").evaluate(node => ({ ...(node as HTMLElement).dataset }));
    expect(cleared).not.toHaveProperty("aftermathCombat"); expect(cleared).not.toHaveProperty("aftermathTick");
    await expect(page.locator("#stage-focus-headline")).not.toHaveAttribute("title");
    await proveStatusRecap(page, next, terminal);
    expect(next.depth.roadSupper).toEqual(terminal.depth.roadSupper);
    expect(next.depth.hero.resources).toMatchObject({ health: 11, mana: 24 });
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone("exact terminal reload and ordinary T66 recovery; Watch cleared while original source note remains in Status");
  } finally {
    await testInfo.attach("Last exchange actual source diagnostics", { body: JSON.stringify({ errors, inference, external,
      ticks: [before.tick, terminal.tick, next.tick], commandId: source.commandId, heroDamage, finalDamage,
      outcome: combat.outcome, elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
