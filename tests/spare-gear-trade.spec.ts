import { expect, test, type Page } from "@playwright/test";
import { canonicalStringify } from "../src/core/canonical";
import { advanceWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { projectSpareGearTradeScene } from "../src/ui/spare-gear-trade-view";
import { naturalSpareGearTradeFixture } from "./spare-gear-trade-fixtures";

const spareGearTradeCampaignId = "campaign:browser-repartee-memory";

async function installDurableFixture(page: Page, world: WorldState): Promise<void> {
  // Existing IndexedDB save seam, not a staged battle. Restore the actual T60
  // checkpoint without inventing an item, sale or inventory change.
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
  }), spareGearTradeCampaignId);
}

async function pausedSave(page: Page, afterTick?: number): Promise<string> {
  return page.evaluate(({ id, tick }) => new Promise<string>((resolve, reject) => {
    const app = document.querySelector<HTMLElement>("#app")!, button = document.querySelector<HTMLButtonElement>("#pause-button")!;
    let requested = false;
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Spare-gear trade turn did not settle within20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (raw === null || tick !== undefined && JSON.parse(raw).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; button.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(raw);
    }, 20);
    if (tick !== undefined) button.click();
  }), { id: spareGearTradeCampaignId, tick: afterTick });
}


async function proveSaleGeometry(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>("#stage")!, canvas = stage.querySelector("canvas")!, host = stage.getBoundingClientRect();
    const [scale = 0, x = 0, y = 0] = (stage.dataset.sceneLayout ?? "").split(",").map(Number);
    const room = { left: host.left + x + 44 * scale, top: host.top + y + 32 * scale,
      right: host.left + x + 276 * scale, bottom: host.top + y + 156 * scale };
    const clear = ["#topbar", "#view-toolbar", "#stage-focus-ribbon", "#stage-focus-controls", "#hero-hud", "#chronicle"].every(selector => {
      const node = document.querySelector<HTMLElement>(selector);
      if (node === null || node.hidden || getComputedStyle(node).display === "none") return true;
      const box = node.getBoundingClientRect();
      return box.width === 0 || box.height === 0 || room.right <= box.left + 0.5 || room.left >= box.right - 0.5
        || room.bottom <= box.top + 0.5 || room.top >= box.bottom - 0.5;
    });
    const actorsAndPropsClear = [[124, 109], [124, 139], [211, 112], [161, 130]].every(([px = 0, py = 0]) =>
      document.elementFromPoint(host.left + x + px * scale, host.top + y + py * scale) === canvas);
    const bounds = JSON.parse(stage.dataset.dungeonCaptionBounds ?? "null") as { title: number[] | null; detail: number[] | null } | null;
    const rail = (stage.dataset.dungeonCaptionRail ?? "").split(",").map(Number), [cx = 0, cy = 0, cw = 0, ch = 0] = rail;
    const captionFits = bounds?.title != null && bounds.detail != null && rail.length === 4 && cy + ch < 32
      && Number(stage.dataset.dungeonCaptionTitleSize) >= 12 - 0.001 && Number(stage.dataset.dungeonCaptionDetailSize) >= 11 - 0.001
      && [bounds.title, bounds.detail].every(([tx = 0, ty = 0, tw = 0, th = 0]) => tw > 0 && th > 0
        && tx >= cx && ty >= cy && tx + tw <= cx + cw + 0.01 && ty + th <= cy + ch + 0.01)
      && bounds.title[1]! + bounds.title[3]! <= bounds.detail[1]! + 0.01;
    return { clear, actorsAndPropsClear, captionFits, wide: room.right - room.left >= (innerWidth <= 760 ? 200 : 350),
      inViewport: room.left >= -1 && room.top >= -1 && room.right <= innerWidth + 1 && room.bottom <= innerHeight + 1,
      pageFits: document.documentElement.scrollWidth <= innerWidth + 1 };
  }), { timeout: 8_000 }).toEqual({ clear: true, actorsAndPropsClear: true, captionFits: true, wide: true, inViewport: true, pageFits: true });
}

async function proveSale(page: Page, world: WorldState): Promise<void> {
  const receipt = world.depth.spareGearTrade!, scene = projectSpareGearTradeScene(world)!;
  expect(scene).not.toBeNull();
  await expect(page.locator("#stage")).toHaveAttribute("data-spare-gear-command", world.chronicle.at(-1)!.commandId);
  const data = await page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset }));
  expect(data).toMatchObject({ spareGearPhase: "sold", spareGearCommand: world.chronicle.at(-1)!.commandId,
    spareGearHero: world.hero.id, spareGearLocation: receipt.locationId, spareGearMarket: receipt.marketId,
    spareGearItem: receipt.soldItem.id, spareGearKeptWeapon: receipt.keptWeapon.id, spareGearQuantity: "1/0",
    spareGearGold: "18/19", spareGearHeroPosition: "124,139", spareGearItemPosition: "211,112", spareGearCoinPosition: "161,130",
    spareGearSilhouette: scene.appearance.silhouette,
    spareGearVisual: "actual-market|actual-sold-weapon|one-gold|kept-equipment|no-merchant",
    dungeonCaptionTitle: scene.headline });
  expect(data.dungeonCaptionDetail).toBe(data.dungeonCaptionLayout === "compact" ? scene.compactDetail : scene.detail);
  expect(data).not.toHaveProperty("supperCommand"); expect(data).not.toHaveProperty("supperBowlPosition");
  await expect(page.locator("#repartee-caption")).toBeHidden();
  await proveSaleGeometry(page);
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

test("one actual spare leaves the pack while its worn weapon and earned history remain intact", async ({ page }, testInfo) => {
  test.setTimeout(100_000);
  const startedAt = Date.now(), { before, sold, next } = naturalSpareGearTradeFixture(), receipt = sold.depth.spareGearTrade!;
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
    console.log("[" + p.year + "-" + p.month + "-" + p.day + " " + p.hour + ":" + p.minute + ":" + p.second + " " + p.timeZoneName + "] Spare gear +" + ((Date.now() - startedAt) / 1000).toFixed(1) + "s: " + message);
  };
  const capture = async (name: string): Promise<void> => {
    if (process.env.TG2_VISUAL_CAPTURE !== "1") return;
    const path = testInfo.outputPath(name + ".png");
    await page.screenshot({ path, timeout: 8_000 });
    await testInfo.attach(name, { path, contentType: "image/png" });
  };
  try {
    expect([before.tick, sold.tick, next.tick]).toEqual([60, 61, 62]);
    expect(before.depth).not.toHaveProperty("spareGearTrade");
    expect(receipt).toMatchObject({ quantityBefore: 1, quantitySold: 1, quantityAfter: 0, goldBefore: 18, goldEarned: 1, goldAfter: 19 });
    expect(receipt.soldItem).toEqual(before.depth.hero.inventory.find(item => item.id === "loot:encounter:route:location:8>location:0:0"));
    expect(receipt.soldItem.name).toBe("Ashen Spear");
    expect(receipt.keptWeapon).toEqual(before.depth.hero.inventory.find(item => item.id === before.depth.hero.equipment.weapon));
    expect(receipt.keptWeapon.name).toBe("Roadworn Blade");
    expect(sold.depth.hero).toEqual({ ...before.depth.hero, gold: before.depth.hero.gold + 1,
      inventory: before.depth.hero.inventory.filter(item => item.id !== receipt.soldItem.id) });
    expect(sold.hero).toEqual({ ...before.hero, gold: before.hero.gold + 1 });
    for (const key of ["atlas", "quest", "pendingQuestReward", "companions", "completedCombats", "roadSupper", "repartee",
      "reparteeWitness", "reparteeCallback", "usefulReply", "roomChallenge", "bellExpedition", "bellMemory",
      "companionReunion", "companionCredit", "smithyJob", "innBluff", "pennywiseGate"] as const) {
      expect(sold.depth[key]).toEqual(before.depth[key]);
    }
    expect(sold.chronicle.at(-1)!.commandId).toBe(sold.campaignId + ":" + receipt.sourceCommandId);
    expect(next.chronicle.at(-1)!.commandType).toBe("plan-route");
    expect(next.depth.spareGearTrade).toEqual(receipt);
    expect(projectSpareGearTradeScene(next)).toBeNull();
    for (const state of [before, sold, next]) expect(canonicalStringify(upgradeWorldState(JSON.parse(canonicalStringify(state))))).toBe(canonicalStringify(state));
    expect(advanceWorld(before)).toEqual(sold); expect(advanceWorld(sold)).toEqual(next);

    await installDurableFixture(page, before);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./?fast", { timeout: 25_000 });
    const beforeRaw = await pausedSave(page);
    expect(JSON.parse(beforeRaw)).toEqual(before);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(before));
    await page.locator('#view-toolbar [data-view="inventory"]').click();
    await expect(page.locator('.inventory-item[data-item-id="' + receipt.soldItem.id + '"]')).toHaveCount(1);
    await expect(page.locator('.inventory-item[data-item-id="' + receipt.keptWeapon.id + '"]')).toHaveAttribute("data-equipped", "true");
    expect(await pausedSave(page)).toBe(beforeRaw);
    await page.locator('#view-toolbar [data-view="watch"]').click();

    const soldRaw = await pausedSave(page, before.tick);
    expect(JSON.parse(soldRaw)).toEqual(sold);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(sold));
    await proveSale(page, sold); await capture("spare-gear-sale-1280");
    await proveStatus(page, sold);
    await page.locator('#view-toolbar [data-view="inventory"]').click();
    await expect(page.locator('.inventory-item[data-item-id="' + receipt.soldItem.id + '"]')).toHaveCount(0);
    const worn = page.locator('.inventory-item[data-item-id="' + receipt.keptWeapon.id + '"]');
    await expect(worn).toHaveAttribute("data-equipped", "true");
    await expect(worn.locator(".item-mastery")).toContainText("Use Mastery L2 / 10");
    await expect(worn.locator(".item-mastery")).toContainText("latest use T35");
    expect(await pausedSave(page)).toBe(soldRaw);
    await page.locator('#view-toolbar [data-view="watch"]').click();
    await page.setViewportSize({ width: 320, height: 568 });
    await proveSale(page, sold); await capture("spare-gear-sale-320");
    await page.locator("#stage-focus-button").click();
    await expect(page.locator("#app")).toHaveAttribute("data-chrome-mode", "focus");
    await proveSale(page, sold); await capture("spare-gear-sale-320-focus");
    expect(await pausedSave(page)).toBe(soldRaw);
    await page.keyboard.press("Escape");
    await expect(page.locator("#app")).toHaveAttribute("data-chrome-mode", "panels");
    milestone("actual spare sold once for1gold; exact worn mastery retained across read-only Inventory and three Watch layouts");

    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(soldRaw);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(sold));
    await proveSale(page, sold); await proveStatus(page, sold);
    expect(JSON.parse(await pausedSave(page, sold.tick))).toEqual(next);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(next));
    await expect(page.locator("#stage")).not.toHaveAttribute("data-spare-gear-command");
    await proveStatus(page, sold);
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone("exact reload does not repay the sale; ordinary route resumes and the original sale source remains in Status");
  } finally {
    await testInfo.attach("Spare gear actual source diagnostics", { body: JSON.stringify({ errors, inference, external,
      ticks: [before.tick, sold.tick, next.tick], receipt, elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
