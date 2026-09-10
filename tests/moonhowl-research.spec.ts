import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, createWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { stepDepth } from "../src/depth/state";

const researchSelector = '.codex-monster[data-monster-id="lantern-wolf"] .codex-field-research';

function moonhowlBattle(): WorldState {
  // The seed and route come from the bounded natural-encounter lookup. Only
  // hero HP/MP and actor order are staged; the rated Wolf and ability are exact.
  const base = createWorld("browser-moonhowl-research:39", "campaign:browser-moonhowl-research");
  const origin = base.depth.atlas.currentLocationId;
  const edge = base.depth.atlas.edges.find((entry) => (entry.from === origin && entry.to === "location:5")
    || (entry.to === origin && entry.from === "location:5"));
  if (edge === undefined) throw new Error("The canonical starting town needs an adjacent road");
  const routed = stepDepth(base.depth, { type: "plan-route", destinationId: edge.from === origin ? edge.to : edge.from });
  if (routed.atlas.route === null) throw new Error("Expected the canonical route");
  const started = stepDepth(routed, { type: "start-combat",
    encounterId: `encounter:route:${routed.atlas.route.path.join(">")}`, enemyCount: 1 });
  const combat = started.combat;
  const enemy = combat?.combatants.find((unit) => unit.side === "enemies");
  if (combat === null || enemy?.speciesId !== "lantern-wolf") throw new Error("The natural rated encounter must contain its Lantern Wolf");
  const depth = { ...started,
    hero: { ...started.hero, resources: { ...started.hero.resources, health: started.hero.resources.maxHealth, mana: 0 } },
    combat: { ...combat, activeIndex: 0, turnOrder: [enemy.id, started.hero.id],
      combatants: combat.combatants.map((unit) => unit.id === started.hero.id ? { ...unit, health: unit.maxHealth, mana: 0 } : unit) },
  };
  // Match the real save transport: JSON represents generated terrain -0 as 0.
  // Keep full save equality rather than ignoring terrain or other state fields.
  return upgradeWorldState(JSON.parse(JSON.stringify({ ...base, tick: depth.tick, depth,
    hero: { ...base.hero, health: depth.hero.resources.health },
    lifecycle: { ...base.lifecycle, simulationTick: depth.tick, worldClockMinutes: depth.tick * 15 },
    scene: { ...base.scene, mode: "battle", headline: "A Lantern Wolf stalks the road." },
  })));
}

async function pauseOnReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    if (document.documentElement.dataset.ready !== "true") return false;
    const app = document.querySelector<HTMLElement>("#app")!;
    if (app.dataset.presentationPaused !== "true") document.querySelector<HTMLButtonElement>("#pause-button")!.click();
    return app.dataset.presentationPaused === "true";
  }, undefined, { polling: 20, timeout: 20_000 });
}

async function automaticStep(page: Page, before: WorldState): Promise<WorldState> {
  // Install observation before Resume: a second browser protocol roundtrip can
  // otherwise allow two fast combat turns before the test begins watching.
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
      // The app acknowledges Pause only after an in-flight save finishes.
      // Repeated clicks during that wait would toggle the requested pause off.
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

async function snapshot(page: Page, campaignId: string) {
  return page.locator(researchSelector).evaluate((element, id) => {
    const meter = element.querySelector<HTMLProgressElement>(".codex-research-progress")!;
    const details = element.querySelector<HTMLDetailsElement>(".codex-research-evidence")!;
    const receipt = (selector: string) => {
      const row = element.querySelector<HTMLElement>(selector);
      return row === null ? null : { ...row.dataset, text: row.textContent };
    };
    return { taskId: (element as HTMLElement).dataset.taskId, progress: (element as HTMLElement).dataset.progress,
      meter: { value: meter.value, max: meter.max, label: meter.getAttribute("aria-label") },
      clue: element.querySelector(".codex-research-clue")?.textContent ?? null,
      application: receipt(".codex-research-application"), aftereffect: receipt(".codex-research-aftereffect"),
      disclosure: { open: details.open, summary: details.querySelector("summary")!.textContent },
      text: element.textContent, saved: sessionStorage.getItem(`the-grind-2:campaign:${id}`),
    };
  }, campaignId);
}

test("a natural Lantern Wolf teaches two sourced Moonhowl observations without granting power", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const startedAt = Date.now();
  const milestone = (label: string): void => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    console.log(`[${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${parts.timeZoneName}] Moonhowl research +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${label}`);
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
  try {
    const fixture = moonhowlBattle();
    const enemy = fixture.depth.combat!.combatants.find((unit) => unit.side === "enemies")!;
    const hero = fixture.depth.combat!.combatants.find((unit) => unit.id === fixture.hero.id)!;
    expect(fixture.depth.combat!.threat.rating).toBe("place-bound");
    expect(enemy.abilities[0]).toMatchObject({ id: "secret:lantern-wolf:moonhowl", effect: "weaken", potency: 4 });
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
    await page.locator('#view-toolbar [data-view="codex"]').click();
    const initial = await snapshot(page, fixture.campaignId);
    expect(initial).toMatchObject({ taskId: "lantern-wolf:moonhowl@1", progress: "0/2", clue: null,
      meter: { value: 0, max: 2, label: "Lantern Wolf field research 0 of 2" }, application: null, aftereffect: null });
    expect(JSON.parse(initial.saved!)).toEqual(fixture);
    milestone("natural rated Wolf loaded; Moonhowl study begins at 0/2");

    const applied = await automaticStep(page, fixture);
    const application = applied.depth.fieldResearch.moonhowl.application;
    if (application === null) throw new Error("The actual Moonhowl must record its sourced application");
    expect(application).toMatchObject({ speciesId: "lantern-wolf", abilityId: "secret:lantern-wolf:moonhowl",
      actorId: enemy.id, targetId: hero.id, potency: 3, duration: 2, sourceTick: applied.tick, sourceTurn: 1, targetHealthAfter: 17 });
    const appliedEvent = applied.depth.combat!.eventStream.events.find((event) => event.id === application.sourceEventId);
    expect(appliedEvent).toMatchObject({ kind: "status-applied", status: "weakened", actorId: enemy.id,
      targetId: hero.id, potencyAfter: 3, durationAfter: 2 });
    expect(applied.hero.experience).toBe(fixture.hero.experience);
    expect(await snapshot(page, fixture.campaignId)).toMatchObject({ progress: "1/2", clue: null,
      application: { sourceEvent: application.sourceEventId, sourceTick: String(applied.tick), sourceTurn: "1",
        combatId: application.combatId, targetId: hero.id, abilityId: application.abilityId,
        potency: "3", duration: "2", targetHealthAfter: String(application.targetHealthAfter) }, aftereffect: null });
    const summary = page.locator(`${researchSelector} .codex-research-evidence > summary`);
    await summary.focus();
    await page.keyboard.press("Enter");
    milestone("actual Moonhowl applies weakness; native evidence opened at 1/2");

    const completed = await automaticStep(page, applied);
    const aftereffect = completed.depth.fieldResearch.moonhowl.aftereffect;
    if (aftereffect === null) throw new Error("The actual weakened Strike must record its joined aftereffect");
    const combat = completed.depth.combat!;
    expect(aftereffect).toMatchObject({ combatId: application.combatId, applicationEventId: application.sourceEventId,
      sourceTick: completed.tick, sourceTurn: 2, targetId: hero.id, potency: 3, durationBefore: 2, durationAfter: 1,
      healthBefore: applied.hero.health, amount: 0, healthAfter: applied.hero.health, action: "attack", abilityId: null,
      strikeTargetId: enemy.id, targetHealthBefore: 46, damage: 13, targetHealthAfter: 33 });
    expect(combat.eventStream.events.find((event) => event.id === aftereffect.sourceEventId)).toMatchObject({
      kind: "status-tick", status: "weakened", actorId: hero.id, targetId: hero.id, potency: 3,
      durationBefore: 2, durationAfter: 1, amount: 0 });
    expect(combat.eventStream.events.find((event) => event.id === aftereffect.intentEventId)).toMatchObject({
      kind: "intent", actorId: hero.id, targetId: enemy.id, action: "attack", abilityId: null });
    expect(combat.eventStream.events.find((event) => event.id === aftereffect.damageEventId)).toMatchObject({
      kind: "damage", actorId: hero.id, targetId: enemy.id, abilityId: null,
      healthBefore: aftereffect.targetHealthBefore, amount: aftereffect.damage, healthAfter: aftereffect.targetHealthAfter });
    expect(completed.hero.health).toBe(applied.hero.health);
    expect(completed.hero.experience).toBe(fixture.hero.experience + 8); // Existing ordinary-Strike XP, not a research reward.
    expect(combat.combatants.find((unit) => unit.id === hero.id)?.power).toBe(hero.power);
    expect(completed.depth.hero.attributes).toEqual(fixture.depth.hero.attributes);
    expect(completed.depth.hero.abilities).toEqual(fixture.depth.hero.abilities);
    expect(completed.depth.hero.gold).toBe(fixture.depth.hero.gold);
    expect(completed.depth.discoveries).toEqual(fixture.depth.discoveries);
    expect(completed.depth.fieldResearch.inkcap).toEqual(fixture.depth.fieldResearch.inkcap);
    expect(upgradeWorldState(JSON.parse(JSON.stringify(completed)))).toEqual(completed);
    const shown = await snapshot(page, fixture.campaignId);
    expect(shown).toMatchObject({ progress: "2/2", meter: { value: 2, max: 2, label: "Lantern Wolf field research 2 of 2" },
      disclosure: { open: true, summary: "Observed evidence" },
      aftereffect: { sourceEvent: aftereffect.sourceEventId, sourceTick: String(completed.tick), sourceTurn: "2",
        combatId: application.combatId, targetId: hero.id, applicationEvent: application.sourceEventId,
        potency: "3", durationBefore: "2", durationAfter: "1", healthBefore: String(aftereffect.healthBefore), amount: "0",
        healthAfter: String(aftereffect.healthAfter), intentEvent: aftereffect.intentEventId, damageEvent: aftereffect.damageEventId,
        strikeTargetId: enemy.id, strikeAction: "attack", strikeAbilityId: "",
        targetHealthBefore: String(aftereffect.targetHealthBefore), damage: String(aftereffect.damage), targetHealthAfter: String(aftereffect.targetHealthAfter) } });
    expect(shown.clue).toBe("Moonhowl weakens the hero; while it lingers, the hero strikes with reduced raw power. Weakening itself does not drain health.");
    expect(shown.aftereffect?.text).toContain("Hero HP");
    expect(shown.aftereffect?.text).toContain("Foe HP");
    expect(shown.text).toContain("Field research only. This study grants no ability or combat bonus.");
    milestone("actual weakened Strike joins status, intent and damage; 2/2 with no research power or bonus XP");

    const research = page.locator(researchSelector);
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
        const path = testInfo.outputPath(`moonhowl-research-${viewport.width}.png`);
        await page.screenshot({ path, timeout: 8_000 });
        await testInfo.attach(`Moonhowl research ${viewport.width}`, { path, contentType: "image/png" });
      }
      milestone(`${viewport.width}px Moonhowl evidence captured`);
    }
    expect((await snapshot(page, fixture.campaignId)).saved).toBe(shown.saved);
    await page.reload({ timeout: 25_000 });
    await pauseOnReady(page);
    await page.locator('#view-toolbar [data-view="codex"]').click();
    const reloaded = await snapshot(page, fixture.campaignId);
    expect(reloaded.saved).toBe(shown.saved);
    expect(reloaded).toMatchObject({ progress: "2/2", application: shown.application, aftereffect: shown.aftereffect, clue: shown.clue });
    expect(errors).toEqual([]);
    expect(inference).toEqual([]);
    expect(external).toEqual([]);
    milestone("actual reload preserves exact observed evidence and canonical save; all assertions passed");
  } finally {
    milestone(`browser diagnostics: ${errors.length} errors, ${inference.length} inference, ${external.length} external requests`);
    await testInfo.attach("Moonhowl browser diagnostics", { body: JSON.stringify({ errors, inference, external, elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
