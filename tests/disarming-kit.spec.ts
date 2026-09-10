import { expect, test, type Page } from "@playwright/test";
import { createForwardMotionState } from "../src/core/forward-motion";
import { advanceWorld, campaignDirector, createWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { dungeonTrapAt, resolveDungeonTrapCheck } from "../src/depth/dungeon";
import { effectiveAttribute, heroMechanicalLevel } from "../src/depth/rpg";
import { selectDungeonEntryPlan, stepDepth } from "../src/depth/state";
import { selectDisarmingKitPurchase } from "../src/depth/town-disarming-kit";

const campaignId = "campaign:browser-dungeon-search";
const targetId = "dungeon:location:3:cell:0,1";

async function pauseOnReady(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    let pauseRequested = false;
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Ready adventure did not pause within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const app = document.querySelector<HTMLElement>("#app")!;
      if (!pauseRequested && app.dataset.presentationPaused !== "true") {
        pauseRequested = true; document.querySelector<HTMLButtonElement>("#pause-button")!.click();
      }
      if (app.dataset.presentationPaused !== "true") return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve();
    }, 20);
  }));
}

async function snapshot(page: Page, afterTick?: number) {
  return page.evaluate(async ({ id, tick }) => {
    if (tick !== undefined) await new Promise<void>((resolve, reject) => {
      const app = document.querySelector<HTMLElement>("#app")!;
      const pause = document.querySelector<HTMLButtonElement>("#pause-button")!;
      let pauseRequested = false;
      const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Automatic kit turn did not settle within 20 seconds")); }, 20_000);
      const poll = window.setInterval(() => {
        const saved = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
        if (saved === null || JSON.parse(saved).tick <= tick) return;
        if (!pauseRequested && app.dataset.presentationPaused !== "true") { pauseRequested = true; pause.click(); }
        if (app.dataset.presentationPaused !== "true" || Number(app.dataset.simulationTick) <= tick) return;
        window.clearInterval(poll); window.clearTimeout(timeout); resolve();
      }, 20);
      pause.click();
    });
    return { stage: { ...document.querySelector<HTMLElement>("#stage")!.dataset },
      saved: sessionStorage.getItem(`the-grind-2:campaign:${id}`),
      paused: document.querySelector<HTMLElement>("#app")!.dataset.presentationPaused };
  }, { id: campaignId, tick: afterTick });
}

async function automaticStep(page: Page, before: WorldState) {
  const view = await snapshot(page, before.tick);
  const after = JSON.parse(view.saved!) as WorldState;
  expect(after).toEqual(advanceWorld(before));
  return { after, view };
}

function stagedDungeonArrival(purchased: WorldState): WorldState {
  // Explicit fixture handoff, not a claim that the hero naturally traveled here:
  // preserve the actual browser-bought inventory and purchase receipt verbatim;
  // stage only atlas location/discovery and half HP, then use real dungeon entry.
  const locationId = "location:3";
  const located = { ...purchased.depth, atlas: { ...purchased.depth.atlas, currentLocationId: locationId,
    discoveredLocationIds: [...new Set([...purchased.depth.atlas.discoveredLocationIds, locationId])] } };
  const plan = selectDungeonEntryPlan(located);
  if (plan === null) throw new Error("The known generated dungeon must have its canonical entry plan");
  const entered = stepDepth(located, { type: "enter-dungeon", dungeonId: plan.dungeonId, width: plan.width, height: plan.height });
  const depth = { ...entered, hero: { ...entered.hero, resources: { ...entered.hero.resources,
    health: Math.floor(entered.hero.resources.maxHealth / 2) } } };
  return upgradeWorldState({ ...purchased, tick: depth.tick, depth,
    hero: { ...purchased.hero, health: depth.hero.resources.health, gold: depth.hero.gold, experience: depth.hero.experience },
    forwardMotion: createForwardMotionState(locationId, depth.tick),
    lifecycle: { ...purchased.lifecycle, simulationTick: depth.tick, worldClockMinutes: depth.tick * 15 },
    scene: { ...purchased.scene, mode: "dungeon", headline: "The cautious hero studies the passage." },
  });
}

test("a real smithy purchase supplies one same-roll disarm attempt without inventing the kit", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const startedAt = Date.now();
  const milestone = (label: string): void => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    console.log(`[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}] Disarming kit +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${label}`);
  };
  const errors: string[] = [], inference: string[] = [], external: string[] = [];
  const capture = async (name: string, label: string): Promise<void> => {
    if (process.env.TG2_VISUAL_CAPTURE !== "1") return;
    const path = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path, timeout: 8_000 });
    await testInfo.attach(label, { path, contentType: "image/png" });
  };
  const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("worker", (worker) => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
  page.on("request", (request) => {
    if (modelUrl.test(request.url())) inference.push(request.url());
    if (new URL(request.url()).origin !== new URL(testInfo.project.use.baseURL!).origin) external.push(request.url());
  });
  try {
    const fixture = createWorld("browser-dungeon-search:8", campaignId);
    const itemId = `${fixture.depth.hero.id}:item:disarming-kit`;
    const plan = selectDisarmingKitPurchase(fixture.depth)!;
    expect(plan).toMatchObject({ townName: "Oakcross", locationId: "location:0", smithId: "town:location:0:district:0:building:0",
      smithName: "The Heron Smithy", itemId, goldBefore: 12, goldSpent: 5, goldAfter: 7, quantityBefore: 0, quantityAfter: 1 });
    expect(campaignDirector(fixture).candidates.map((candidate) => candidate.command)).toEqual([{ type: "buy-disarming-kit", smithId: plan.smithId }]);
    await page.addInitScript((saved) => {
      const key = `the-grind-2:campaign:${saved.campaignId}`;
      if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, JSON.stringify(saved));
      sessionStorage.setItem("the-grind-2:activeCampaignId", saved.campaignId);
      localStorage.setItem(`the-grind-2:last-active:${saved.campaignId}`, String(Date.now() + 3_600_000));
      localStorage.setItem("the-grind-2:play-mode:v1", '{"schemaVersion":1,"mode":"deterministic"}');
      localStorage.setItem("the-grind-2:adventure-speed:v1", '{"schemaVersion":1,"speed":1}');
      localStorage.setItem("the-grind-2:stage-focus:v1", "panels");
    }, fixture);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./", { timeout: 25_000 });
    await pauseOnReady(page);
    expect(JSON.parse((await snapshot(page)).saved!)).toEqual(fixture);
    const { after: purchased, view: purchaseView } = await automaticStep(page, fixture);
    expect(purchased.depth.latestDisarmingKitPurchase).toEqual({ ...plan, schemaVersion: 1, tick: purchased.depth.tick });
    expect(purchased.depth.hero.inventory.find((item) => item.id === itemId)).toMatchObject({ id: itemId, name: "Disarming Kit", quantity: 1,
      dungeonTool: { schemaVersion: 1, kind: "disarming-kit", bonus: 2 } });
    expect(purchased.depth.hero.inventory.filter((item) => item.id !== itemId)).toEqual(fixture.depth.hero.inventory);
    expect(purchased.depth.hero.gold).toBe(7);
    expect(purchased.depth.hero.experience).toBe(fixture.depth.hero.experience);
    expect(purchased.depth.hero.resources).toEqual(fixture.depth.hero.resources);
    expect(purchased.depth.quest).toEqual(fixture.depth.quest);
    expect(purchased.depth.towns).toEqual(fixture.depth.towns);
    expect(purchased.chronicle.at(-1)?.commandType).toBe("buy-disarming-kit");
    expect(purchaseView.stage).toMatchObject({ disarmingKitPurchaseActive: "true", disarmingKitPurchaseBuilding: plan.smithId,
      disarmingKitPurchaseReceipt: purchased.scene.consequence,
      disarmingKitPurchaseVisual: "recorded-smithy|anvil-sign|toolbag|five-coins|equipped-hero" });
    await capture("disarming-kit-purchase-1280", "Actual recorded-smithy purchase");
    const inventory = await page.evaluate(({ id, itemId }) => {
      document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="inventory"]')!.click();
      const item = [...document.querySelectorAll<HTMLElement>(".inventory-item")].find((row) => row.dataset.itemId === itemId)!;
      item.scrollIntoView({ block: "center", inline: "nearest" });
      return { name: item.querySelector("h3")!.textContent, quantity: item.querySelector("header span")!.textContent,
        effect: item.querySelector(".item-modifiers")!.textContent, saved: sessionStorage.getItem(`the-grind-2:campaign:${id}`) };
    }, { id: campaignId, itemId });
    expect(inventory).toEqual({ name: "Disarming Kit", quantity: "×1", effect: "+2 to one disarm attempt · consumed on success or failure", saved: purchaseView.saved });
    await capture("disarming-kit-inventory-1280", "Actual purchased kit in Inventory");
    milestone("actual automatic purchase at recorded Heron Smithy spends 5 gold and adds exactly one documented kit");

    const staged = stagedDungeonArrival(purchased);
    expect(staged.depth.hero.inventory).toEqual(purchased.depth.hero.inventory);
    expect(staged.depth.latestDisarmingKitPurchase).toEqual(purchased.depth.latestDisarmingKitPurchase);
    expect(staged.depth.hero.gold).toBe(7);
    expect(staged.depth.hero.attributes).toEqual(purchased.depth.hero.attributes);
    expect(staged.chronicle).toEqual(purchased.chronicle);
    await page.evaluate((saved) => {
      // Approved fixture handoff only: never fabricate or duplicate the purchased kit.
      sessionStorage.setItem(`the-grind-2:campaign:${saved.campaignId}`, JSON.stringify(saved));
    }, staged);
    await page.reload({ timeout: 25_000 });
    await pauseOnReady(page);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click());
    expect(JSON.parse((await snapshot(page)).saved!)).toEqual(staged);
    const { after: searched } = await automaticStep(page, staged);
    expect(searched.chronicle.at(-1)?.commandType).toBe("search-dungeon");
    expect(dungeonTrapAt(searched.depth.dungeon!, targetId)?.phase).toBe("detected");
    expect(searched.depth.hero.inventory).toEqual(purchased.depth.hero.inventory);
    expect(searched.depth.dungeon!.latestDisarmKitUse).toBeNull();
    const { after: entered } = await automaticStep(page, searched);
    expect(entered.chronicle.at(-1)?.commandType).toBe("move-dungeon");
    expect(entered.depth.dungeon!.currentCellId).toBe(targetId);
    const baseline = resolveDungeonTrapCheck(entered.depth.dungeon!, targetId, "disarm", {
      agility: effectiveAttribute(entered.depth.hero, "agility"), intellect: effectiveAttribute(entered.depth.hero, "intellect"),
      spirit: effectiveAttribute(entered.depth.hero, "spirit"), level: heroMechanicalLevel(entered.hero.level),
    }, entered.seed);
    expect(baseline).toMatchObject({ attribute: "intellect", skill: 11, roll: 0, total: 11, difficulty: 12, success: false });
    milestone("explicit dungeon-arrival handoff preserved the purchased kit; real search and entry did not consume it");
    const { after: resolved, view: resolvedView } = await automaticStep(page, entered);
    expect(resolved.chronicle.at(-1)?.commandType).toBe("disarm-dungeon-trap");
    expect(resolved.depth.dungeon!.latestDisarmKitUse).toMatchObject({ schemaVersion: 1, dungeonId: entered.depth.dungeon!.id,
      cellId: targetId, tick: resolved.depth.tick, itemId, quantityBefore: 1, quantityAfter: 0, bonus: 2,
      kind: "rune-ward", attribute: baseline.attribute, skill: baseline.skill, roll: baseline.roll,
      baseTotal: baseline.total, total: baseline.total + 2, difficulty: baseline.difficulty, success: true });
    expect(dungeonTrapAt(resolved.depth.dungeon!, targetId)?.phase).toBe("disarmed");
    expect(resolved.depth.hero.inventory.find((item) => item.id === itemId)?.quantity ?? 0).toBe(0);
    expect(resolved.depth.hero.inventory.filter((item) => item.id !== itemId)).toEqual(purchased.depth.hero.inventory.filter((item) => item.id !== itemId));
    expect(resolved.depth.hero.gold).toBe(7);
    expect(resolved.depth.hero.resources).toEqual(entered.depth.hero.resources);
    expect(resolved.depth.hero.experience).toBe(entered.depth.hero.experience);
    expect(resolved.depth.quest).toEqual(entered.depth.quest);
    expect(resolved.depth.latestDisarmingKitPurchase).toEqual(purchased.depth.latestDisarmingKitPurchase);
    expect(upgradeWorldState(JSON.parse(JSON.stringify(resolved)))).toEqual(resolved);
    milestone("same roll0 plus kit2 changes 11<12 into13≥12; one kit consumed, no HP loss or extra XP");
    // Capture the actual held cutaway before a view change cancels it. The later
    // ordinary dungeon rail deliberately does not replay the KIT arithmetic.
    for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      const layout = await page.evaluate(async () => {
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const cutaway = document.querySelector<HTMLElement>("#trap-cutaway")!;
        const stage = document.querySelector<HTMLElement>("#stage")!;
        const canvas = stage.querySelector("canvas")!.getBoundingClientRect();
        const [scale, , y] = stage.dataset.sceneLayout!.split(",").map(Number);
        const toolbar = document.querySelector("#view-toolbar")!.getBoundingClientRect();
        return { fits: document.documentElement.scrollWidth <= innerWidth + 1, stage: { ...document.querySelector<HTMLElement>("#stage")!.dataset },
          cutaway: { hidden: cutaway.hidden, ...cutaway.dataset },
          // Canvas fills its host; transformed title content, not the empty
          // canvas background, must clear the fixed navigation.
          header: { titleTop: canvas.top + y + 9 * scale, mechanismTop: canvas.top + y + 19 * scale, toolbarBottom: toolbar.bottom },
          check: document.querySelector("#trap-cutaway-check")!.textContent,
          consequence: document.querySelector("#trap-cutaway-consequence")!.textContent };
      });
      expect(layout.fits).toBe(true);
      expect(layout.cutaway).toMatchObject({ hidden: false, active: "true", eventId: resolved.chronicle.at(-1)!.id });
      expect(["static", "final"]).toContain(layout.cutaway.phase);
      expect(layout.check).toBe("intellect · 11 + 0 + 2 KIT = 13 vs 12");
      expect(layout.consequence).toContain("Disarming Kit 1 → 0 (consumed)");
      expect(layout.stage).toMatchObject({ cutawayEvent: resolved.chronicle.at(-1)!.id,
        cutawayCheck: "intellect:11+0+2kit=13:12", cutawayToolItem: itemId, cutawayToolQuantity: "1→0" });
      if (viewport.width === 1280) {
        expect(layout.header.titleTop).toBeGreaterThanOrEqual(layout.header.toolbarBottom);
        expect(layout.header.mechanismTop).toBeGreaterThanOrEqual(layout.header.toolbarBottom);
      }
      expect(layout.stage.disarmingKitPurchaseActive).toBeUndefined();
      expect((await snapshot(page)).saved).toBe(resolvedView.saved);
      await capture(`disarming-kit-${viewport.width}`, `One-use disarming kit ${viewport.width}`);
      if (viewport.width === 320) {
        const proofRows = await page.evaluate(async () => {
          const panel = document.querySelector<HTMLElement>("#trap-cutaway")!;
          const rows = [];
          for (const id of ["trap-cutaway-check", "trap-cutaway-consequence"]) {
            const target = document.getElementById(id)!;
            const row = target.closest("li")!;
            row.scrollIntoView({ block: "center", inline: "nearest" });
            await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            const box = row.getBoundingClientRect(), text = target.getBoundingClientRect(), clip = panel.getBoundingClientRect();
            const hit = document.elementFromPoint(text.x + text.width / 2, text.y + text.height / 2);
            const toolbarBottom = document.querySelector("#view-toolbar")!.getBoundingClientRect().bottom;
            rows.push({ id, text: target.textContent, fontSize: parseFloat(getComputedStyle(target).fontSize),
              contained: box.top >= Math.max(clip.top + panel.clientTop, toolbarBottom) - 1
                && box.bottom <= clip.top + panel.clientTop + panel.clientHeight + 1
                && box.left >= clip.left + panel.clientLeft - 1 && box.right <= clip.right + 1,
              unobscured: hit !== null && (hit === target || target.contains(hit)) });
          }
          return rows;
        });
        expect(proofRows).toHaveLength(2);
        for (const row of proofRows) {
          expect(row.contained).toBe(true);
          expect(row.unobscured).toBe(true);
          expect(row.fontSize).toBeGreaterThanOrEqual(11);
        }
        expect(proofRows[0]!.text).toContain("+ 2 KIT");
        expect(proofRows[1]!.text).toContain("Disarming Kit 1 → 0 (consumed)");
        expect((await snapshot(page)).saved).toBe(resolvedView.saved);
        await capture("disarming-kit-320-proof", "Readable mobile kit-consumption proof");
      }
      milestone(`${viewport.width}px assisted trap result retains the exact purchase and use evidence`);
    }
    const proof = await page.evaluate((eventId) => {
      const outcome = document.querySelector<HTMLButtonElement>("#trap-cutaway-outcome")!;
      if (!outcome.hidden && !outcome.disabled) outcome.click();
      document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="journal"]')!.click();
      document.querySelector<HTMLButtonElement>("#journal-status-button")!.click();
      document.querySelector<HTMLButtonElement>("#journal-status-refresh")!.click();
      const row = [...document.querySelectorAll<HTMLElement>('#journal-status-list [data-source="chronicle"]')].find((entry) => entry.dataset.eventId === eventId);
      document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click();
      return { eventId: row?.dataset.eventId, archived: row?.querySelector(".journal-status-consequence")?.textContent,
        stage: { ...document.querySelector<HTMLElement>("#stage")!.dataset } };
    }, resolved.chronicle.at(-1)!.id);
    expect(proof).toMatchObject({ eventId: resolved.chronicle.at(-1)!.id, archived: resolved.scene.consequence,
      stage: { dungeonHeroCell: targetId, dungeonTrapResult: resolved.scene.consequence, dungeonAlertPlacement: "reserved-top-rail" } });
    expect(proof.stage.cutawayToolItem).toBeUndefined();
    expect((await snapshot(page)).saved).toBe(resolvedView.saved);
    await page.reload({ timeout: 25_000 });
    await pauseOnReady(page);
    expect((await snapshot(page)).saved).toBe(resolvedView.saved);
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone("actual reload retains quantity0 and both real receipts; all assertions passed");
  } finally {
    milestone(`browser diagnostics: ${errors.length} errors, ${inference.length} inference, ${external.length} external requests`);
    await testInfo.attach("Disarming kit diagnostics", { body: JSON.stringify({ errors, inference, external, elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
