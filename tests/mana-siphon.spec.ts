import { expect, test, type Page } from "@playwright/test";
import { createForwardMotionState } from "../src/core/forward-motion";
import { advanceWorld, campaignDirector, createWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { dungeonTrapAt, projectDungeonTraps, resolveDungeonTrap, resolveDungeonTrapCheck } from "../src/depth/dungeon";
import { effectiveAttribute, heroMechanicalLevel } from "../src/depth/rpg";
import { selectDungeonEntryPlan, stepDepth } from "../src/depth/state";

const campaignId = "campaign:browser-dungeon-search";
const targetId = "dungeon:location:3:cell:0,1";

function enteredManaDungeon(): WorldState {
  const initial = createWorld("browser-dungeon-search:8", campaignId);
  const locationId = "location:3";
  // Explicit fixture location handoff, not uninterrupted natural travel. Real
  // entry generates the dungeon; no trap, check, item, HP, or MP is fabricated.
  const located = { ...initial.depth, atlas: { ...initial.depth.atlas, currentLocationId: locationId,
    discoveredLocationIds: [...new Set([...initial.depth.atlas.discoveredLocationIds, locationId])] } };
  const plan = selectDungeonEntryPlan(located);
  if (plan === null) throw new Error("Expected the existing seed8 location3 dungeon entry plan");
  const depth = stepDepth(located, { type: "enter-dungeon", dungeonId: plan.dungeonId, width: plan.width, height: plan.height });
  expect(depth.hero.resources).toEqual(initial.depth.hero.resources);
  expect(depth.hero.inventory).toEqual(initial.depth.hero.inventory);
  return upgradeWorldState({ ...initial, tick: depth.tick, depth,
    hero: { ...initial.hero, health: depth.hero.resources.health, gold: depth.hero.gold, experience: depth.hero.experience },
    forwardMotion: createForwardMotionState(locationId, depth.tick),
    lifecycle: { ...initial.lifecycle, simulationTick: depth.tick, worldClockMinutes: depth.tick * 15 },
    scene: { ...initial.scene, mode: "dungeon", headline: "The hero enters the generated maze." } });
}

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
      const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Automatic siphon turn did not settle within 20 seconds")); }, 20_000);
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

test("a generated mana siphon drains MP once without harming HP and leaves readable recorded proof", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const startedAt = Date.now();
  const milestone = (label: string): void => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    console.log(`[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}] Mana siphon +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${label}`);
  };
  const errors: string[] = [], inference: string[] = [], external: string[] = [];
  const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("worker", (worker) => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
  page.on("request", (request) => {
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
    const fixture = enteredManaDungeon();
    expect(fixture.depth.dungeon).toMatchObject({ layoutVersion: 2, trapRulesVersion: 2, width: 7, height: 7 });
    expect(fixture.depth.hero.resources).toEqual({ health: 45, maxHealth: 45, mana: 26, maxMana: 26 });
    expect(dungeonTrapAt(fixture.depth.dungeon!, targetId)).toMatchObject({ kind: "mana-siphon", phase: "hidden", detectDifficulty: 11, disarmDifficulty: 12 });
    expect(projectDungeonTraps(fixture.depth.dungeon!)).not.toContainEqual(expect.objectContaining({ cellId: targetId }));
    expect(campaignDirector(fixture).candidates.map((candidate) => candidate.command)).toEqual([{ type: "move-dungeon", direction: "south" }]);
    expect(resolveDungeonTrapCheck(fixture.depth.dungeon!, targetId, "detect", {
      agility: effectiveAttribute(fixture.depth.hero, "agility"), intellect: effectiveAttribute(fixture.depth.hero, "intellect"),
      spirit: effectiveAttribute(fixture.depth.hero, "spirit"), level: heroMechanicalLevel(fixture.hero.level),
    }, fixture.seed)).toMatchObject({ attribute: "spirit", skill: 10, roll: 0, total: 10, difficulty: 11, success: false });
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
    const resolvedView = await snapshot(page, fixture.tick);
    const resolved = JSON.parse(resolvedView.saved!) as WorldState;
    expect(resolved).toEqual(advanceWorld(fixture));
    expect(resolved.chronicle.at(-1)?.commandType).toBe("move-dungeon");
    expect(resolved.depth.dungeon!.currentCellId).toBe(targetId);
    expect(dungeonTrapAt(resolved.depth.dungeon!, targetId)?.phase).toBe("triggered");
    expect(resolved.depth.hero.resources).toEqual({ health: 45, maxHealth: 45, mana: 19, maxMana: 26 });
    expect(resolved.depth.hero.inventory).toEqual(fixture.depth.hero.inventory);
    expect(resolved.depth.hero.gold).toBe(fixture.depth.hero.gold);
    // A first room visit already grants 4 XP; the siphon adds no extra reward.
    expect(resolved.depth.dungeon!.visitedCellIds).toHaveLength(fixture.depth.dungeon!.visitedCellIds.length + 1);
    expect(resolved.depth.hero.experience).toBe(fixture.depth.hero.experience + 4);
    expect(resolved.depth.quest).toEqual(fixture.depth.quest);
    expect(projectDungeonTraps(resolved.depth.dungeon!)).toContainEqual(expect.objectContaining({ cellId: targetId, kind: "mana-siphon", status: "triggered", current: true }));
    // The canonical frontier does not permit immediate north backtracking.
    // Check the actual spent resolver, without claiming an autonomous revisit.
    for (const firstVisit of [false, true]) expect(resolveDungeonTrap(resolved.depth.dungeon!, targetId, firstVisit, 45, 45, 19, 26)).toBeNull();
    expect(upgradeWorldState(JSON.parse(JSON.stringify(resolved)))).toEqual(resolved);
    milestone("actual sole south move failed spirit 10+0 vs11: MP26→19, HP45 unchanged, trap spent");

    for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      const proof = await page.evaluate(async () => {
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const stage = document.querySelector<HTMLElement>("#stage")!;
        const panel = document.querySelector<HTMLElement>("#trap-cutaway")!;
        const canvas = stage.querySelector("canvas")!.getBoundingClientRect();
        const [scale, , y] = stage.dataset.sceneLayout!.split(",").map(Number);
        const toolbarBottom = document.querySelector("#view-toolbar")!.getBoundingClientRect().bottom;
        const rows = [];
        for (const id of ["trap-cutaway-check", "trap-cutaway-consequence"]) {
          const target = document.getElementById(id)!;
          const row = target.closest("li")!;
          row.scrollIntoView({ block: "center", inline: "nearest" });
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          const box = row.getBoundingClientRect(), text = target.getBoundingClientRect(), clip = panel.getBoundingClientRect();
          const hit = document.elementFromPoint(text.x + text.width / 2, text.y + text.height / 2);
          rows.push({ id, text: target.textContent, fontSize: parseFloat(getComputedStyle(target).fontSize),
            contained: box.top >= Math.max(clip.top + panel.clientTop, toolbarBottom) - 1
              && box.bottom <= clip.top + panel.clientTop + panel.clientHeight + 1
              && box.left >= clip.left + panel.clientLeft - 1 && box.right <= clip.right + 1,
            unobscured: hit !== null && (hit === target || target.contains(hit)) });
        }
        return { stage: { ...stage.dataset }, panel: { hidden: panel.hidden, ...panel.dataset }, rows,
          titleTop: canvas.top + y + 9 * scale, toolbarBottom, fits: document.documentElement.scrollWidth <= innerWidth + 1 };
      });
      expect(proof.fits).toBe(true);
      expect(proof.panel).toMatchObject({ hidden: false, active: "true", eventId: resolved.chronicle.at(-1)!.id });
      expect(["static", "final"]).toContain(proof.panel.phase);
      expect(proof.stage).toMatchObject({ cutawayEvent: resolved.chronicle.at(-1)!.id, cutawayKind: "mana-siphon",
        cutawayStage: "detect", cutawayCheck: "spirit:10+0=10:11", cutawayMana: "26:7:19:26", cutawayResource: "mana", cutawayHealth: "45:0:45:45" });
      expect(proof.stage.cutawayToolItem).toBeUndefined();
      expect(proof.rows[0]!.text).toBe("spirit · 10 + 0 = 10 vs 11");
      expect(proof.rows[1]!.text).toBe("MP 26 → 19 (−7) · HP 45 → 45 (unchanged)");
      for (const row of proof.rows) {
        expect(row.contained).toBe(true); expect(row.unobscured).toBe(true); expect(row.fontSize).toBeGreaterThanOrEqual(11);
      }
      if (viewport.width === 1280) expect(proof.titleTop).toBeGreaterThanOrEqual(proof.toolbarBottom);
      expect((await snapshot(page)).saved).toBe(resolvedView.saved);
      await capture(`mana-siphon-${viewport.width}`);
      milestone(`${viewport.width}px native spirit/MP proof is readable, unobscured, and leaves the exact save unchanged`);
    }
    const journal = await page.evaluate((eventId) => {
      document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="journal"]')!.click();
      document.querySelector<HTMLButtonElement>("#journal-status-button")!.click();
      document.querySelector<HTMLButtonElement>("#journal-status-refresh")!.click();
      const row = [...document.querySelectorAll<HTMLElement>('#journal-status-list [data-source="chronicle"]')].find((entry) => entry.dataset.eventId === eventId);
      document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click();
      return { eventId: row?.dataset.eventId, consequence: row?.querySelector(".journal-status-consequence")?.textContent,
        stage: { ...document.querySelector<HTMLElement>("#stage")!.dataset } };
    }, resolved.chronicle.at(-1)!.id);
    expect(journal).toMatchObject({ eventId: resolved.chronicle.at(-1)!.id, consequence: resolved.scene.consequence,
      stage: { dungeonHeroCell: targetId, dungeonTrap: "triggered", dungeonTrapKind: "mana-siphon",
        dungeonTrapResult: resolved.scene.consequence, dungeonAlertPlacement: "reserved-top-rail" } });
    expect(journal.stage.cutawayMana).toBeUndefined();
    expect((await snapshot(page)).saved).toBe(resolvedView.saved);
    await capture("mana-siphon-320-spent");
    await page.reload({ timeout: 25_000 });
    await pauseOnReady(page);
    const reloaded = await snapshot(page);
    expect(reloaded.saved).toBe(resolvedView.saved);
    expect(JSON.parse(reloaded.saved!).depth.hero.resources).toEqual({ health: 45, maxHealth: 45, mana: 19, maxMana: 26 });
    expect(reloaded.stage.dungeonTrap).toBe("triggered");
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone("exact Status source and actual reload retain spent state/MP19 without another drain; all assertions passed");
  } finally {
    milestone(`browser diagnostics: ${errors.length} errors, ${inference.length} inference, ${external.length} external requests`);
    await testInfo.attach("Mana siphon diagnostics", { body: JSON.stringify({ errors, inference, external, elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
