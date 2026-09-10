import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, createWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";

const studySelector = '.codex-monster[data-monster-id="copperhorn"] .codex-field-research';
const combatId = "encounter:route:location:0>location:8";
const applicationId = `${combatId}:2:3`;
const firstTickId = `${combatId}:3:1`;
const expiryId = `${combatId}:5:1`;

async function pauseOnReady(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    let pauseRequested = false;
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("The ready adventure did not pause within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const app = document.querySelector<HTMLElement>("#app")!;
      if (!pauseRequested && app.dataset.presentationPaused !== "true") {
        pauseRequested = true;
        document.querySelector<HTMLButtonElement>("#pause-button")!.click();
      }
      if (app.dataset.presentationPaused !== "true") return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve();
    }, 20);
  }));
}

async function automaticStep(page: Page, before: WorldState): Promise<WorldState> {
  const raw = await page.evaluate(({ campaignId, tick }) => new Promise<string>((resolve, reject) => {
    const app = document.querySelector<HTMLElement>("#app")!;
    const pause = document.querySelector<HTMLButtonElement>("#pause-button")!;
    let pauseRequested = false;
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("The automatic research turn did not settle within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      const saved = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
      if (saved === null || JSON.parse(saved).tick <= tick) return;
      // Pause is acknowledged after an in-flight save. Never toggle it twice.
      if (!pauseRequested && app.dataset.presentationPaused !== "true") { pauseRequested = true; pause.click(); }
      if (app.dataset.presentationPaused !== "true" || Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(saved);
    }, 20);
    pause.click();
  }), { campaignId: before.campaignId, tick: before.tick });
  const after = JSON.parse(raw) as WorldState;
  expect(after).toEqual(advanceWorld(before));
  return after;
}

async function snapshot(page: Page, campaignId: string) {
  return page.locator(studySelector).evaluate((element, id) => {
    const meter = element.querySelector<HTMLProgressElement>(".codex-research-progress")!;
    const details = element.querySelector<HTMLDetailsElement>(".codex-research-evidence")!;
    const row = (selector: string) => {
      const record = element.querySelector<HTMLElement>(selector);
      return record === null ? null : { ...record.dataset, text: record.textContent };
    };
    return { title: element.querySelector("h4")!.textContent, taskId: (element as HTMLElement).dataset.taskId,
      progress: (element as HTMLElement).dataset.progress,
      meter: { value: meter.value, max: meter.max, label: meter.getAttribute("aria-label") },
      clue: element.querySelector(".codex-research-clue")?.textContent ?? null,
      application: row(".codex-research-application"), firstTick: row(".codex-research-first-tick"), aftereffect: row(".codex-research-aftereffect"),
      disclosure: { open: details.open, focused: details.querySelector("summary") === document.activeElement },
      saved: sessionStorage.getItem(`the-grind-2:campaign:${id}`) };
  }, campaignId);
}

test("a naturally surviving Copperhorn burn teaches the final fading tick through two distinct observations", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const startedAt = Date.now();
  const milestone = (label: string): void => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    console.log(`[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}] Copperhorn research +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${label}`);
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
    // Found by bounded autoplay under v153. This regenerates the entire real
    // history; no hero/enemy stats, order, abilities, commands or lore are edited.
    let fixture = createWorld("golden:27", "campaign:27");
    for (let turn = 0; turn < 85; turn++) fixture = advanceWorld(fixture);
    expect(fixture.tick).toBe(85);
    expect(fixture.depth.combat).toMatchObject({ id: combatId, turn: 1, outcome: "ongoing" });
    expect(fixture.depth.fieldResearch.copperhorn).toEqual({ taskId: "copperhorn:final-ember@1", application: null, firstTick: null, aftereffect: null });
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
    await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="codex"]')!.click());
    const initial = await snapshot(page, fixture.campaignId);
    expect(initial).toMatchObject({ title: "Study Final Ember", taskId: "copperhorn:final-ember@1", progress: "0/2",
      meter: { value: 0, max: 2, label: "Copperhorn field research 0 of 2" }, clue: null,
      application: null, firstTick: null, aftereffect: null, disclosure: { open: false } });
    expect(JSON.parse(initial.saved!)).toEqual(fixture);
    const summary = page.locator(`${studySelector} .codex-research-evidence > summary`);
    await summary.focus();
    await page.keyboard.press("Enter");
    milestone("unaltered natural T85 checkpoint loaded; native two-observation study starts empty");
    const applied = await automaticStep(page, fixture);
    expect(applied.tick).toBe(86);
    expect(applied.depth.fieldResearch.copperhorn.application).toMatchObject({ sourceEventId: applicationId,
      sourceTick: 86, sourceTurn: 2, combatId, abilityId: "secret:copperhorn:bellmetal-charge",
      actorId: `${combatId}:enemy:0`, targetId: fixture.depth.hero.id, potency: 2, duration: 2, targetHealthAfter: 30 });
    expect(applied.depth.hero.experience).toBe(fixture.depth.hero.experience);
    const applicationView = await snapshot(page, fixture.campaignId);
    expect(applicationView).toMatchObject({ progress: "1/2", meter: { value: 1, max: 2, label: "Copperhorn field research 1 of 2" },
      clue: null, firstTick: null, aftereffect: null, disclosure: { open: true, focused: true },
      application: { sourceEvent: applicationId, sourceTick: "86", sourceTurn: "2", combatId,
        targetId: fixture.depth.hero.id, abilityId: "secret:copperhorn:bellmetal-charge", potency: "2", duration: "2", targetHealthAfter: "30" } });
    milestone("actual Bellmetal Charge records its living-target application, 0/2→1/2");

    const firstBurn = await automaticStep(page, applied);
    expect(firstBurn.tick).toBe(87);
    expect(firstBurn.depth.fieldResearch.copperhorn.firstTick).toMatchObject({ sourceEventId: firstTickId,
      sourceTick: 87, sourceTurn: 3, applicationEventId: applicationId, targetId: fixture.depth.hero.id,
      potency: 2, durationBefore: 2, durationAfter: 1, healthBefore: 30, amount: 2, healthAfter: 28 });
    expect(firstBurn.depth.hero.experience - applied.depth.hero.experience).toBe(8); // Ordinary Springbolt action XP, not research XP.
    const firstView = await snapshot(page, fixture.campaignId);
    expect(firstView).toMatchObject({ progress: "1/2", clue: null, aftereffect: null, disclosure: { open: true, focused: true },
      firstTick: { sourceEvent: firstTickId, sourceTick: "87", sourceTurn: "3", applicationEvent: applicationId,
        combatId, targetId: fixture.depth.hero.id, potency: "2", durationBefore: "2", durationAfter: "1",
        healthBefore: "30", amount: "2", healthAfter: "28" } });
    expect(firstView.firstTick?.text).toContain("Supporting evidence, not another progress mark.");
    const guarded = await automaticStep(page, firstBurn);
    expect(guarded.tick).toBe(88);
    expect(guarded.depth.combat?.log.at(-1)).toMatchObject({ action: "guard", actorId: `${combatId}:enemy:0` });
    expect(guarded.depth.fieldResearch.copperhorn).toEqual(firstBurn.depth.fieldResearch.copperhorn);
    expect(guarded.depth.hero.experience).toBe(firstBurn.depth.hero.experience);
    expect(await snapshot(page, fixture.campaignId)).toMatchObject({ progress: "1/2", clue: null, aftereffect: null,
      application: applicationView.application, firstTick: firstView.firstTick, disclosure: { open: true, focused: true } });
    milestone("real first burn and enemy Guard preserve the same source at 1/2; neither grants another mark");
    const completed = await automaticStep(page, guarded);
    expect(completed.tick).toBe(89);
    const final = completed.depth.fieldResearch.copperhorn.aftereffect!;
    expect(final).toMatchObject({ sourceEventId: expiryId, sourceTick: 89, sourceTurn: 5, combatId,
      applicationEventId: applicationId, firstTickEventId: firstTickId, intentEventId: `${combatId}:5:0`,
      targetId: fixture.depth.hero.id, potency: 2, durationBefore: 1, durationAfter: 0, healthBefore: 28, amount: 2, healthAfter: 26 });
    const finished = completed.depth.completedCombats.find((entry) => entry.id === combatId)!;
    expect(finished.eventStream.events.find((event) => event.id === expiryId)).toMatchObject({ kind: "status-expired",
      status: "burning", healthBefore: 28, amount: 2, healthAfter: 26, durationBefore: 1, durationAfter: 0 });
    expect(finished.eventStream.events.find((event) => event.id === final.intentEventId)).toMatchObject({ kind: "intent", action: "attack", actorId: fixture.depth.hero.id });
    expect(finished.combatants.find((unit) => unit.id === fixture.depth.hero.id)).toMatchObject({ power: 22, health: 26 });
    expect(finished.outcome).toBe("victory");
    expect(completed.depth.hero.experience - guarded.depth.hero.experience).toBe(8); // Ordinary basic-action XP.
    expect(completed.depth.hero.attributes).toEqual(fixture.depth.hero.attributes);
    expect(completed.depth.hero.abilities.map((ability) => ability.id)).toEqual(fixture.depth.hero.abilities.map((ability) => ability.id));
    expect(completed.depth.towns).toEqual(fixture.depth.towns);
    expect(completed.depth.companions).toEqual(fixture.depth.companions);
    expect(completed.depth.fieldResearch.inkcap).toEqual(fixture.depth.fieldResearch.inkcap);
    expect(completed.depth.fieldResearch.moonhowl).toEqual(fixture.depth.fieldResearch.moonhowl);
    expect(upgradeWorldState(JSON.parse(JSON.stringify(completed)))).toEqual(completed);
    const completeView = await snapshot(page, fixture.campaignId);
    expect(completeView).toMatchObject({ progress: "2/2", meter: { value: 2, max: 2, label: "Copperhorn field research 2 of 2" },
      clue: "Bellmetal Charge inflicts burning; its final fading turn still damages the hero before action resolution.",
      application: applicationView.application, firstTick: firstView.firstTick, disclosure: { open: true, focused: true },
      aftereffect: { sourceEvent: expiryId, sourceTick: "89", sourceTurn: "5", combatId,
        applicationEvent: applicationId, firstTickEvent: firstTickId, intentEvent: `${combatId}:5:0`,
        targetId: fixture.depth.hero.id, potency: "2", durationBefore: "1", durationAfter: "0", healthBefore: "28", amount: "2", healthAfter: "26" } });
    expect(completeView.aftereffect?.text).toContain("28→26");
    expect(completeView.aftereffect?.text).toContain("1→0");
    expect(JSON.parse(completeView.saved!)).toEqual(completed);
    milestone("actual final ember deals HP28→26 before the winning strike; linked second observation completes 2/2");
    for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      await page.locator(`${studySelector} .codex-research-aftereffect`).scrollIntoViewIfNeeded();
      const layout = await page.locator(studySelector).evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const screen = document.querySelector<HTMLElement>("#inspection-screen")!;
        const rows = [...element.querySelectorAll<HTMLElement>(".codex-research-application, .codex-research-first-tick, .codex-research-aftereffect")];
        return { fits: document.documentElement.scrollWidth <= innerWidth + 1,
          left: bounds.left, right: bounds.right, width: innerWidth,
          rowsFit: rows.every((row) => { const rect = row.getBoundingClientRect(); return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1; }),
          contentReachable: screen.scrollHeight <= screen.clientHeight + 1 || ["auto", "scroll"].includes(getComputedStyle(screen).overflowY) };
      });
      expect(layout).toMatchObject({ fits: true, rowsFit: true, contentReachable: true });
      expect(layout.left).toBeGreaterThanOrEqual(-1);
      expect(layout.right).toBeLessThanOrEqual(layout.width + 1);
      expect((await snapshot(page, fixture.campaignId)).saved).toBe(completeView.saved);
      if (process.env.TG2_VISUAL_CAPTURE === "1") {
        const path = testInfo.outputPath(`copperhorn-research-${viewport.width}.png`);
        await page.screenshot({ path, timeout: 8_000 });
        await testInfo.attach(`Copperhorn final ember ${viewport.width}`, { path, contentType: "image/png" });
      }
      milestone(`${viewport.width}px source-linked final-ember evidence is readable and scroll-accessible without changing the save`);
    }
    await page.reload({ timeout: 25_000 });
    await pauseOnReady(page);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="codex"]')!.click());
    const resumed = await snapshot(page, fixture.campaignId);
    expect(resumed.saved).toBe(completeView.saved);
    expect(resumed).toMatchObject({ progress: "2/2", clue: completeView.clue,
      application: completeView.application, firstTick: completeView.firstTick, aftereffect: completeView.aftereffect });
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone("actual reload retains all three source facts as exactly two observations; all assertions passed");
  } finally {
    milestone(`browser diagnostics: ${errors.length} errors, ${inference.length} inference, ${external.length} external requests`);
    await testInfo.attach("Copperhorn research browser diagnostics", { body: JSON.stringify({ errors, inference, external, elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
