import { expect, test, type Page } from "@playwright/test";
import { canonicalStringify } from "../src/core/canonical";
import { advanceWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { projectCombatEnemyFormation } from "../src/render/combat-roster-layout";
import { projectCombatAftermathScene, projectCombatAftermathEntry } from "../src/ui/combat-aftermath";
import { projectCombatControlScene, projectCombatControlEntry } from "../src/ui/combat-control-recap";
import { naturalCombatControlFixture, combatControlCampaignId } from "./combat-control-fixtures";

async function installDurableFixture(page: Page, world: WorldState): Promise<void> {
  // Existing IndexedDB seam: restore the source-executed actual T276,
  // without inventing a status, target, health value or ending.
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
  }), combatControlCampaignId);
}

async function pausedSave(page: Page, afterTick?: number): Promise<string> {
  return page.evaluate(({ id, tick }) => new Promise<string>((resolve, reject) => {
    const app = document.querySelector<HTMLElement>("#app")!, button = document.querySelector<HTMLButtonElement>("#pause-button")!;
    let requested = false;
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Control recap turn did not settle within20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (raw === null || tick !== undefined && JSON.parse(raw).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; button.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(raw);
    }, 20);
    if (tick !== undefined) button.click();
  }), { id: combatControlCampaignId, tick: afterTick });
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


async function proveRoster(page: Page, world: WorldState): Promise<void> {
  const combat = world.depth.combat ?? world.depth.completedCombats.at(-1)!;
  await expect.poll(() => page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset }))).toMatchObject({
    combatId: combat.id, combatTurn: String(combat.turn), combatRosterSurface: "native-hud" });
  const data = await page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset }));
  const roster = JSON.parse(data.combatRoster!) as { id: string; health: number; maxHealth: number; mana: number; maxMana: number }[];
  expect(roster).toHaveLength(combat.combatants.length);
  for (const unit of combat.combatants) expect(roster.find(entry => entry.id === unit.id)).toMatchObject({
    health: unit.health, maxHealth: unit.maxHealth, mana: unit.mana, maxMana: unit.maxMana });
  await proveBattleGeometry(page, combat.combatants.filter(unit => unit.side === "enemies").length);
}

async function proveControlWatch(page: Page, world: WorldState): Promise<void> {
  const recap = projectCombatControlScene(world)!;
  expect(recap).not.toBeNull();
  const headline = page.locator("#stage-focus-headline");
  await expect(headline).toHaveText(recap.compactDetail);
  await expect(headline).toHaveAttribute("title", recap.detail);
  await expect.poll(() => headline.evaluate(node => ({ ...(node as HTMLElement).dataset }))).toMatchObject({
    controlCommand: recap.commandId, controlCombat: recap.combatId,
    controlApplicationTurn: String(recap.applicationTurn), controlRetaliationTurn: String(recap.retaliationTurn) });
  await expect(headline).not.toHaveAttribute("data-aftermath-command");
  expect(recap.detail).not.toMatch(/saved|prevented|would have|decisive|victory/iu);
  await proveRoster(page, world);
}

async function proveTerminalWatch(page: Page, world: WorldState): Promise<void> {
  const recap = projectCombatAftermathScene(world)!;
  expect(recap).not.toBeNull();
  const headline = page.locator("#stage-focus-headline");
  await expect(headline).toHaveText(recap.compactDetail);
  await expect(headline).toHaveAttribute("title", recap.headline + ": " + recap.detail);
  await expect(headline).toHaveAttribute("data-aftermath-command", recap.commandId);
  const data = await headline.evaluate(node => ({ ...(node as HTMLElement).dataset }));
  for (const key of ["controlCommand", "controlCombat", "controlApplicationTurn", "controlRetaliationTurn"]) expect(data).not.toHaveProperty(key);
  await proveRoster(page, world);
}

async function proveStatus(page: Page, current: WorldState, sources: WorldState[]): Promise<void> {
  const unchangedRaw = await pausedSave(page), entries = sources.map(world => world.chronicle.at(-1)!);
  const rows = await page.evaluate(ids => {
    document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="journal"]')!.click();
    document.querySelector<HTMLButtonElement>("#journal-status-button")!.click();
    document.querySelector<HTMLButtonElement>("#journal-status-refresh")!.click();
    const allRows = [...document.querySelectorAll<HTMLElement>("#journal-status-list > li")];
    return ids.map(id => {
      const matching = allRows.filter(row => row.dataset.source === "chronicle" && row.dataset.eventId === id);
      const row = matching[0]!;
      const read = (selector: string) => {
        const note = row.querySelector<HTMLDetailsElement>(selector);
        if (note === null) return null;
        const collapsed = !note.open;
        note.querySelector<HTMLElement>(":scope > summary")!.click();
        return { collapsed, opened: note.open, data: { ...note.dataset }, summary: note.querySelector("summary")!.textContent,
          detail: note.querySelector(".journal-status-action")!.textContent, text: note.textContent };
      };
      return { id, count: matching.length, control: read(".journal-status-control"),
        aftermath: read(".journal-status-aftermath"), text: row.textContent };
    });
  }, entries.map(entry => entry.id));
  for (const [index, entry] of entries.entries()) {
    const row = rows[index]!, control = projectCombatControlEntry(current, entry), aftermath = projectCombatAftermathEntry(current, entry);
    expect(row.count).toBe(1);
    for (const text of [entry.commandId, entry.action, entry.consequence]) expect(row.text).toContain(text);
    if (control === null) expect(row.control).toBeNull();
    else {
      expect(row.control).toMatchObject({ collapsed: true, opened: true, summary: "A weakened answer", detail: control.detail,
        data: { controlCommand: control.commandId, controlCombat: control.combatId, controlTick: String(control.tick),
          applicationTurn: String(control.applicationTurn), retaliationTurn: String(control.retaliationTurn),
          hero: control.heroId, enemy: control.enemyId } });
      expect(JSON.parse(row.control!.data.controlEvents!)).toEqual(control.sourceEventIds);
      for (const source of [control.commandId, ...control.sourceEventIds]) expect(row.control!.text).toContain(source);
      expect(row.control!.detail).not.toMatch(/saved|prevented|would have|decisive/iu);
    }
    if (aftermath === null) expect(row.aftermath).toBeNull();
    else {
      expect(row.aftermath).toMatchObject({ collapsed: true, opened: true, summary: "Last exchange", detail: aftermath.detail,
        data: { aftermathCommand: aftermath.commandId, aftermathCombat: aftermath.combatId, aftermathTick: String(aftermath.tick) } });
      expect(JSON.parse(row.aftermath!.data.aftermathEvents!)).toEqual(aftermath.sourceEventIds);
      for (const source of [aftermath.commandId, ...aftermath.sourceEventIds]) expect(row.aftermath!.text).toContain(source);
    }
  }
  expect(await pausedSave(page)).toBe(unchangedRaw);
  await page.locator('#view-toolbar [data-view="watch"]').click();
}

test("the actual weakened reply is readable without rewriting the later defeat or inventing historical evidence", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const startedAt = Date.now(), journey = naturalCombatControlFixture();
  const { applied, retaliated, terminal, next } = journey;
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
    console.log("[" + p.year + "-" + p.month + "-" + p.day + " " + p.hour + ":" + p.minute + ":" + p.second + " " + p.timeZoneName
      + "] Control recap +" + ((Date.now() - startedAt) / 1000).toFixed(1) + "s: " + message);
  };
  const capture = async (name: string): Promise<void> => {
    if (process.env.TG2_VISUAL_CAPTURE !== "1") return;
    const path = testInfo.outputPath(name + ".png");
    await page.screenshot({ path, timeout: 8_000 });
    await testInfo.attach(name, { path, contentType: "image/png" });
  };
  try {
    expect([applied.tick, retaliated.tick, terminal.tick, next.tick]).toEqual([276, 277, 278, 279]);
    expect(advanceWorld(applied)).toEqual(retaliated); expect(advanceWorld(retaliated)).toEqual(terminal); expect(advanceWorld(terminal)).toEqual(next);
    expect(journey.applicationEvent).toMatchObject({ actorId: applied.hero.id, targetId: journey.retaliationEvent.actorId,
      abilityId: "technique:turning-check", status: "weakened", durationAfter: 2 });
    expect(journey.retaliationEvent).toMatchObject({ amount: 21, healthBefore: 42, healthAfter: 21 });
    const control = projectCombatControlScene(retaliated)!;
    expect(control).not.toBeNull();
    expect(control.sourceEventIds).toEqual(expect.arrayContaining([journey.applicationEvent.id, journey.statusTickEvent.id, journey.retaliationEvent.id]));
    expect(control.compactDetail).toBe("Turning Check → weakened Moonhowl · 21 HP lost");
    expect(control.detail).toContain("Lantern Wolf 2");
    const last = projectCombatAftermathScene(terminal)!;
    expect(last.detail).toContain("Lantern Wolf 1");
    expect(last.detail).toContain("Aster Rook fell");
    expect(terminal.depth.completedCombats.at(-1)!.outcome).toBe("defeat");
    expect([terminal.depth.hero.resources.health, next.depth.hero.resources.health]).toEqual([0, 11]);
    expect(projectCombatControlScene(applied)).toBeNull();
    expect(projectCombatControlScene(terminal)).toBeNull(); expect(projectCombatControlScene(next)).toBeNull();
    expect(projectCombatControlEntry(terminal, terminal.chronicle.at(-1)!)).not.toBeNull();
    expect(projectCombatControlEntry(next, retaliated.chronicle.at(-1)!)).toBeNull();
    expect(projectCombatControlEntry(next, terminal.chronicle.at(-1)!)).toBeNull();
    expect(projectCombatAftermathEntry(next, terminal.chronicle.at(-1)!)).toBeNull();
    for (const state of [applied, retaliated, terminal, next])
      expect(canonicalStringify(upgradeWorldState(JSON.parse(canonicalStringify(state))))).toBe(canonicalStringify(state));

    await installDurableFixture(page, applied);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./?fast", { timeout: 25_000 });
    expect(JSON.parse(await pausedSave(page))).toEqual(applied);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(applied));
    await expect(page.locator("#level-up-cutaway")).toBeHidden();
    await expect(page.locator("#stage-focus-headline")).not.toHaveAttribute("data-control-command");
    const replyRaw = await pausedSave(page, applied.tick);
    expect(JSON.parse(replyRaw)).toEqual(retaliated);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(retaliated));
    await proveControlWatch(page, retaliated); await capture("combat-control-reply-1280");
    await proveStatus(page, retaliated, [retaliated]);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.locator("#stage-focus-button").click();
    await expect(page.locator("#app")).toHaveAttribute("data-chrome-mode", "focus");
    await proveControlWatch(page, retaliated); await capture("combat-control-reply-320-focus");
    expect(await pausedSave(page)).toBe(replyRaw);
    await page.keyboard.press("Escape");
    await expect(page.locator("#app")).toHaveAttribute("data-chrome-mode", "panels");
    milestone("actual277control reply visible on desktop and320Focus; exact source note and read-only views preserve whole save");

    const terminalRaw = await pausedSave(page, retaliated.tick);
    expect(JSON.parse(terminalRaw)).toEqual(terminal);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(terminal));
    await proveTerminalWatch(page, terminal); await capture("combat-control-terminal-320");
    await proveStatus(page, terminal, [retaliated, terminal]);
    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(terminalRaw);
    await proveTerminalWatch(page, terminal);
    await proveStatus(page, terminal, [retaliated, terminal]);
    milestone("actual278defeat and originalLast exchange unchanged; separatecontrol evidence shares only exact current terminal source; reloadexact");

    expect(JSON.parse(await pausedSave(page, terminal.tick))).toEqual(next);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(next));
    const headline = page.locator("#stage-focus-headline");
    const data = await headline.evaluate(node => ({ ...(node as HTMLElement).dataset }));
    for (const key of ["controlCommand", "controlCombat", "controlApplicationTurn", "controlRetaliationTurn", "aftermathCommand", "aftermathCombat", "aftermathTick"])
      expect(data).not.toHaveProperty(key);
    await expect(headline).not.toHaveAttribute("title");
    await proveStatus(page, next, [retaliated, terminal]);
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone("ordinary279recovery clears unsupported generic historical recaps but preserves canonical action/source facts; zeroerrors/external/models");
  } finally {
    await testInfo.attach("Control recap actual source diagnostics", { body: JSON.stringify({ errors, inference, external,
      ticks: [applied.tick, retaliated.tick, terminal.tick, next.tick], application: journey.applicationEvent,
      status: journey.statusTickEvent, retaliation: journey.retaliationEvent, control: projectCombatControlScene(retaliated),
      lastExchange: projectCombatAftermathScene(terminal), historicalControlAfterRecovery: projectCombatControlEntry(next, terminal.chronicle.at(-1)!),
      elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
