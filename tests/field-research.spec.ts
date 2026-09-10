import { expect as baseExpect, test, type Page } from "@playwright/test";
import { advanceWorld, createWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { stepDepth } from "../src/depth/state";

const expect = baseExpect.configure({ timeout: 15_000 });
const researchSelector = '.codex-monster[data-monster-id="inkcap-mimic"] .codex-field-research';

function inkcapBattle(): WorldState {
  // Bounded fixture lookup found this first seed and its natural rated Inkcap.
  // Only the hero's starting HP/MP and actor order are staged. The generated
  // enemy, its rated stats, and False Treasure ability remain unmodified.
  const base = createWorld("browser-field-research:0", "campaign:browser-field-research");
  const origin = base.depth.atlas.currentLocationId;
  const edge = base.depth.atlas.edges.find((entry) => entry.from === origin || entry.to === origin);
  if (edge === undefined) throw new Error("The recorded starting town needs an adjacent road");
  const routed = stepDepth(base.depth, { type: "plan-route", destinationId: edge.from === origin ? edge.to : edge.from });
  if (routed.atlas.route === null) throw new Error("Expected the canonical route");
  const started = stepDepth(routed, { type: "start-combat",
    encounterId: `encounter:route:${routed.atlas.route.path.join(">")}`, enemyCount: 1 });
  const combat = started.combat;
  const enemy = combat?.combatants.find((unit) => unit.side === "enemies");
  if (combat === null || enemy?.speciesId !== "inkcap-mimic") throw new Error("The canonical encounter must produce its natural Inkcap");
  const depth = { ...started,
    hero: { ...started.hero, resources: { ...started.hero.resources, health: started.hero.resources.maxHealth, mana: 0 } },
    combat: { ...combat, activeIndex: 0, turnOrder: [enemy.id, started.hero.id],
      combatants: combat.combatants.map((unit) => unit.id === started.hero.id ? { ...unit, health: unit.maxHealth, mana: 0 } : unit) },
  };
  return upgradeWorldState({ ...base, tick: depth.tick, depth,
    hero: { ...base.hero, health: depth.hero.resources.health },
    lifecycle: { ...base.lifecycle, simulationTick: depth.tick, worldClockMinutes: depth.tick * 15 },
    scene: { ...base.scene, mode: "battle", headline: "A strange chest waits on the road." },
  });
}

async function savedCampaign(page: Page, campaignId: string): Promise<string> {
  return page.evaluate((id) => {
    const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
    if (raw === null) throw new Error("Expected the canonical field-research campaign mirror");
    return raw;
  }, campaignId);
}

async function automaticStep(page: Page, before: WorldState): Promise<WorldState> {
  const raw = await page.evaluate(({ campaignId, tick }) => new Promise<string>((resolve, reject) => {
    const app = document.querySelector<HTMLElement>("#app")!;
    const pause = document.querySelector<HTMLButtonElement>("#pause-button")!;
    let pauseRequested = false;
    const timeout = window.setTimeout(() => {
      window.clearInterval(poll);
      reject(new Error("The actual automatic combat step did not settle within 20 seconds"));
    }, 20_000);
    const poll = window.setInterval(() => {
      const saved = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
      if (saved === null || JSON.parse(saved).tick <= tick) return;
      // Pause acknowledgement is deferred while saving; do not toggle it off.
      if (!pauseRequested && app.dataset.presentationPaused !== "true") {
        pauseRequested = true;
        pause.click();
      }
      if (app.dataset.presentationPaused !== "true" || Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      resolve(saved);
    }, 20);
    pause.click();
  }), { campaignId: before.campaignId, tick: before.tick });
  const after = JSON.parse(raw) as WorldState;
  expect(after).toEqual(advanceWorld(before));
  return after;
}

async function researchSnapshot(page: Page) {
  return page.locator(researchSelector).evaluate((element) => {
    const meter = element.querySelector<HTMLProgressElement>(".codex-research-progress")!;
    const receipt = (selector: string) => {
      const row = element.querySelector<HTMLElement>(selector);
      return row === null ? null : { ...row.dataset, text: row.textContent };
    };
    const details = element.querySelector<HTMLDetailsElement>(".codex-research-evidence")!;
    return { taskId: (element as HTMLElement).dataset.taskId, progress: (element as HTMLElement).dataset.progress,
      meter: { value: meter.value, max: meter.max, label: meter.getAttribute("aria-label") },
      clue: element.querySelector(".codex-research-clue")?.textContent ?? null,
      application: receipt(".codex-research-application"), aftereffect: receipt(".codex-research-aftereffect"),
      disclosure: { open: details.open, summary: details.querySelector("summary")!.textContent },
      text: element.textContent,
    };
  });
}

test("a natural Inkcap encounter completes two distinct Codex observations without granting power", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const startedAt = Date.now();
  const milestone = (label: string): void => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    console.log(`[${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${parts.timeZoneName}] Field research +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${label}`);
  };
  const errors: string[] = [];
  const inference: string[] = [];
  const external: string[] = [];
  const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("worker", (worker) => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
  page.on("request", (request) => {
    if (modelUrl.test(request.url())) inference.push(request.url());
    if (new URL(request.url()).origin !== new URL(testInfo.project.use.baseURL!).origin) external.push(request.url());
  });
  try {
    const fixture = inkcapBattle();
    const enemy = fixture.depth.combat!.combatants.find((unit) => unit.side === "enemies")!;
    expect(fixture.depth.combat!.threat.rating).toBe("place-bound");
    expect(enemy.abilities[0]).toMatchObject({ id: "secret:inkcap-mimic:false-treasure", level: 6, effect: "poison" });
    await page.addInitScript((saved) => {
      sessionStorage.setItem(`the-grind-2:campaign:${saved.campaignId}`, JSON.stringify(saved));
      sessionStorage.setItem("the-grind-2:activeCampaignId", saved.campaignId);
      localStorage.setItem(`the-grind-2:last-active:${saved.campaignId}`, String(Date.now() + 3_600_000));
      localStorage.setItem("the-grind-2:play-mode:v1", '{"schemaVersion":1,"mode":"deterministic"}');
      localStorage.setItem("the-grind-2:adventure-speed:v1", '{"schemaVersion":1,"speed":1}');
      localStorage.setItem("the-grind-2:stage-focus:v1", "panels");
    }, fixture);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./", { timeout: 25_000 });
    await page.waitForFunction(() => {
      if (document.documentElement.dataset.ready !== "true") return false;
      const app = document.querySelector<HTMLElement>("#app")!;
      if (app.dataset.presentationPaused !== "true") document.querySelector<HTMLButtonElement>("#pause-button")!.click();
      return app.dataset.presentationPaused === "true";
    }, undefined, { polling: 20, timeout: 20_000 });
    await page.locator('#view-toolbar [data-view="codex"]').click();
    const research = page.locator(researchSelector);
    await expect(research).toHaveAttribute("data-progress", "0/2");
    expect(await researchSnapshot(page)).toMatchObject({ taskId: "inkcap:false-treasure@1", progress: "0/2",
      meter: { value: 0, max: 2, label: "Inkcap Mimic field research 0 of 2" }, clue: null,
      application: null, aftereffect: null,
      disclosure: { open: false, summary: "Observed evidence" } });
    milestone("real rated encounter ready; Codex shows 0/2");

    const applied = await automaticStep(page, fixture);
    const application = applied.depth.fieldResearch.inkcap.application;
    if (application === null) throw new Error("Actual False Treasure must record its application");
    const sourceApplication = applied.depth.combat!.eventStream.events.find((event) => event.id === application.sourceEventId);
    expect(sourceApplication).toMatchObject({ kind: "status-applied", actorId: enemy.id, targetId: fixture.hero.id,
      abilityId: "secret:inkcap-mimic:false-treasure", status: "poisoned", potencyAfter: 2, durationAfter: 3 });
    expect(application).toMatchObject({ combatId: fixture.depth.combat!.id, sourceTick: applied.tick,
      sourceTurn: 1, actorId: enemy.id, targetId: fixture.hero.id, potency: 2, duration: 3, targetHealthAfter: 5 });
    await expect(research).toHaveAttribute("data-progress", "1/2");
    expect(await researchSnapshot(page)).toMatchObject({ progress: "1/2",
      meter: { value: 1, max: 2, label: "Inkcap Mimic field research 1 of 2" }, clue: null,
      application: { sourceEvent: application.sourceEventId, sourceTick: String(applied.tick), sourceTurn: "1",
        combatId: application.combatId, targetId: fixture.hero.id, abilityId: application.abilityId,
        potency: "2", duration: "3", targetHealthAfter: "5" }, aftereffect: null });
    const summary = research.locator(".codex-research-evidence > summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(research.locator("details")).toHaveJSProperty("open", true);
    milestone("actual False Treasure application recorded; Codex shows 1/2");

    const completed = await automaticStep(page, applied);
    const aftereffect = completed.depth.fieldResearch.inkcap.aftereffect;
    if (aftereffect === null) throw new Error("The actual hero turn must record the sourced poison tick");
    const sourceTick = completed.depth.combat!.eventStream.events.find((event) => event.id === aftereffect.sourceEventId);
    expect(sourceTick).toMatchObject({ kind: "status-tick", actorId: fixture.hero.id, targetId: fixture.hero.id,
      status: "poisoned", potency: 2, durationBefore: 3, durationAfter: 2, healthBefore: 5, amount: 2, healthAfter: 3 });
    expect(aftereffect).toMatchObject({ combatId: application.combatId, applicationEventId: application.sourceEventId,
      sourceTick: completed.tick, sourceTurn: 2, targetId: fixture.hero.id,
      potency: 2, durationBefore: 3, durationAfter: 2, healthBefore: 5, amount: 2, healthAfter: 3 });
    await expect(research).toHaveAttribute("data-progress", "2/2");
    const shown = await researchSnapshot(page);
    expect(shown).toMatchObject({ progress: "2/2", meter: { value: 2, max: 2, label: "Inkcap Mimic field research 2 of 2" },
      disclosure: { open: true, summary: "Observed evidence" },
      aftereffect: { sourceEvent: aftereffect.sourceEventId, sourceTick: String(completed.tick), sourceTurn: "2",
        combatId: application.combatId, applicationEvent: application.sourceEventId, targetId: fixture.hero.id,
        healthBefore: "5", amount: "2", healthAfter: "3" } });
    expect(shown.clue).toBe("False Treasure inflicts poison; its lingering harm occurs before the victim acts.");
    expect(shown.aftereffect?.text).toContain("5→3");
    expect(shown.text).toContain("Field research only. This study grants no ability or combat bonus.");
    // The actual next action is emergency restoration, after poison damage.
    // Research must retain that 5→3 receipt, not substitute the later healed HP.
    expect(completed.depth.combat!.eventStream.events.find((event) => event.turn === 2 && event.kind === "intent"))
      .toMatchObject({ action: "item", actorId: fixture.hero.id, targetId: fixture.hero.id });
    expect(completed.hero.health).toBe(14);
    // Existing simulation.ts awards 0 for enemy actions and hero item actions;
    // ordinary non-item hero actions still award their normal 8 XP elsewhere.
    expect(completed.hero.experience).toBe(fixture.hero.experience);
    expect(completed.depth.hero.abilities).toEqual(fixture.depth.hero.abilities);
    expect(completed.depth.hero.attributes).toEqual(fixture.depth.hero.attributes);
    expect(completed.depth.hero.gold).toBe(fixture.depth.hero.gold);
    expect(completed.depth.discoveries).toEqual(fixture.depth.discoveries);
    expect(completed.depth.secretDiscoveryOutcomes).toEqual(fixture.depth.secretDiscoveryOutcomes);
    expect(completed.depth.secretDiscoveryAdmissions).toEqual(fixture.depth.secretDiscoveryAdmissions);
    expect(completed.depth.combat!.combatants.find((unit) => unit.id === fixture.hero.id)?.power)
      .toBe(fixture.depth.combat!.combatants.find((unit) => unit.id === fixture.hero.id)?.power);
    expect(upgradeWorldState(JSON.parse(JSON.stringify(completed)))).toEqual(completed);
    milestone("sourced poison tick recorded; Codex shows 2/2 without power or ability grants");

    const pausedSave = await savedCampaign(page, fixture.campaignId);
    for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      await research.scrollIntoViewIfNeeded();
      const layout = await research.evaluate((element) => ({
        fits: element.scrollWidth <= element.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1,
        nativeDisclosure: element.querySelector(".codex-research-evidence")?.tagName,
        targetHeight: element.querySelector("summary")!.getBoundingClientRect().height,
      }));
      expect(layout).toMatchObject({ fits: true, nativeDisclosure: "DETAILS" });
      expect(layout.targetHeight).toBeGreaterThanOrEqual(44);
      if (process.env.TG2_VISUAL_CAPTURE === "1") {
        const path = testInfo.outputPath(`field-research-${viewport.width}.png`);
        await page.screenshot({ path, timeout: 8_000 });
        await testInfo.attach(`Field research ${viewport.width}`, { path, contentType: "image/png" });
      }
      milestone(`${viewport.width}px research layout checked`);
    }
    expect(await savedCampaign(page, fixture.campaignId)).toBe(pausedSave);
    expect(errors).toEqual([]);
    expect(inference).toEqual([]);
    expect(external).toEqual([]);
    milestone("all assertions passed");
  } finally {
    milestone(`browser diagnostics: ${errors.length} errors, ${inference.length} inference, ${external.length} external requests`);
    await testInfo.attach("Field research browser diagnostics", {
      body: JSON.stringify({ errors, inference, external, elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json",
    });
  }
});
