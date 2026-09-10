import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, createWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { projectCombatActionForecast } from "../src/core/combat-action-forecast";
import { legalCombatActions } from "../src/depth/combat";

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
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("The automatic finisher did not settle within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      const saved = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
      if (saved === null || JSON.parse(saved).tick <= tick) return;
      // A pending pause must not be toggled back off before its acknowledgment.
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

test("a natural guarded finisher favors the sufficient weapon strike and records its first effective use", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const startedAt = Date.now();
  const milestone = (label: string): void => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    console.log(`[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}] Efficient finisher +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${label}`);
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
    // This is the exact natural opening of golden seed 1: route, rated battle,
    // Horizon Step, then the foe's own Guard. No stats, abilities, turn order,
    // inventory or mastery receipts are fabricated or edited for the fixture.
    let fixture = createWorld("golden:1", "campaign:1");
    for (let turn = 0; turn < 4; turn++) fixture = advanceWorld(fixture);
    const combat = fixture.depth.combat!;
    const weapon = fixture.depth.hero.inventory.find((item) => item.id === fixture.depth.hero.equipment.weapon)!;
    const target = combat.combatants.find((unit) => unit.side === "enemies" && unit.health > 0)!;
    expect(fixture.tick).toBe(4);
    expect(combat.threat.rating).toBe("place-bound");
    expect(combat.log.at(-1)).toMatchObject({ action: "guard", actorId: target.id });
    expect(target).toMatchObject({ health: 4, statuses: [{ kind: "guarding", duration: 1, potency: 50 }] });
    expect(weapon.useMastery).toMatchObject({ level: 1, experience: 0, receipts: [] });
    const choices = legalCombatActions(combat);
    const attack = choices.find((action) => action.type === "attack" && action.targetId === target.id)!;
    const technique = choices.find((action) => action.type === "ability" && action.abilityId === "technique:horizon-step")!;
    const attackForecast = projectCombatActionForecast(combat, attack);
    const techniqueForecast = projectCombatActionForecast(combat, technique);
    expect(attackForecast.minimumDamage).toBeGreaterThanOrEqual(target.health);
    expect(attackForecast.minimumDamage).toBeLessThan(techniqueForecast.minimumDamage);

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
    const save = () => page.evaluate((id) => sessionStorage.getItem(`the-grind-2:campaign:${id}`), fixture.campaignId);
    expect(JSON.parse((await save())!)).toEqual(fixture);
    milestone("unmodified natural Guard checkpoint loaded; weapon has no recorded use");

    const after = await automaticStep(page, fixture);
    const source = after.chronicle.at(-1)!;
    const finished = after.depth.completedCombats.find((entry) => entry.id === combat.id)!;
    const finalEvents = finished.eventStream.events.filter((event) => event.turn === finished.turn);
    expect(finalEvents.find((event) => event.kind === "intent")).toMatchObject({ actorId: fixture.depth.hero.id, action: "attack", targetId: target.id, abilityId: null });
    expect(finalEvents.find((event) => event.kind === "damage")).toMatchObject({ actorId: fixture.depth.hero.id, targetId: target.id, healthBefore: 4, amount: 4, healthAfter: 0, guarded: true });
    expect(finished.outcome).toBe("victory");
    expect(finalEvents.some((event) => event.kind === "mana-spent")).toBe(false);
    expect(after.depth.hero.resources.mana).toBe(fixture.depth.hero.resources.mana);
    for (const ability of fixture.depth.hero.abilities) expect(after.depth.hero.abilities.find((entry) => entry.id === ability.id)).toEqual(ability);
    const mastered = after.depth.hero.inventory.find((item) => item.id === weapon.id)!;
    expect(mastered.modifiers).toEqual(weapon.modifiers);
    expect(mastered.useMastery).toMatchObject({ level: 2, experience: 1, receipts: [{
      id: `${combat.id}:weapon-use:${weapon.id}`, combatId: combat.id, weaponId: weapon.id,
      resolvedTick: after.tick, outcome: "victory", basicStrikes: 1, damage: 4,
      experienceBefore: 0, experienceAfter: 1, levelBefore: 1, levelAfter: 2,
    }] });
    expect(mastered.useMastery!.receipts).toHaveLength(1);
    expect(source.decisionTrace?.selected.actionLabel).toBe("attacks");
    expect(source.decisionTrace?.selected.targetLabel).toBe(`${target.name} · Guard · 4 damage`);
    expect(source.rationale).toContain("preferring lower mana cost and then less guaranteed overkill");
    expect(upgradeWorldState(JSON.parse(JSON.stringify(after)))).toEqual(after);
    const exactSave = await save();
    milestone("actual autonomous guarded strike wins; first exact receipt raises Use Mastery L1→L2 without a power bonus");

    const inspectInventory = () => page.evaluate((weaponId) => {
      document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="inventory"]')!.click();
      const card = [...document.querySelectorAll<HTMLElement>(".inventory-item")].find((item) => item.dataset.itemId === weaponId)!;
      const mastery = card.querySelector<HTMLElement>(".item-mastery")!;
      return { name: card.querySelector("h3")!.textContent, equipped: card.dataset.equipped,
        form: card.dataset.weaponFormId, copy: mastery.textContent, source: mastery.dataset.sourceCombat };
    }, weapon.id);
    const expectedInventory = { name: weapon.name, equipped: "true", form: undefined,
      copy: "Use Mastery L2 / 10 · 1 / 3 toward L3 · no combat bonus · latest use T5 · victory", source: combat.id };
    expect(await inspectInventory()).toEqual(expectedInventory);
    const history = await page.evaluate((eventId) => {
      document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="journal"]')!.click();
      document.querySelector<HTMLButtonElement>("#journal-status-button")!.click();
      document.querySelector<HTMLButtonElement>("#journal-status-refresh")!.click();
      const row = [...document.querySelectorAll<HTMLElement>('#journal-status-list [data-source="chronicle"]')].find((item) => item.dataset.eventId === eventId)!;
      const details = row.querySelector<HTMLDetailsElement>(".journal-status-decision")!;
      details.querySelector<HTMLElement>("summary")!.click();
      return { eventId: row.dataset.eventId, tick: row.dataset.tick, action: row.querySelector(".journal-status-action")!.textContent,
        consequence: row.querySelector(".journal-status-consequence")!.textContent, open: details.open,
        choice: details.querySelector(".journal-status-choice")!.textContent, reason: details.textContent };
    }, source.id);
    expect(history).toMatchObject({ eventId: source.id, tick: String(after.tick), action: source.action, consequence: source.consequence, open: true });
    expect(history.choice).toBe(`Computer choice · ${fixture.hero.name} → attacks → ${target.name} · Guard · 4 damage`);
    expect(history.reason).toContain(source.rationale);
    expect(await save()).toBe(exactSave);

    for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click());
      await expect(page.locator("#stage")).toHaveAttribute("data-combat-outcome", "victory");
      const scene = await page.evaluate(() => ({ fits: document.documentElement.scrollWidth <= innerWidth + 1,
        stage: { ...document.querySelector<HTMLElement>("#stage")!.dataset }, ribbon: document.querySelector("#battle-turn-strip")!.textContent }));
      expect(scene.fits).toBe(true);
      // Pausing preserves the current ordinary cue phase. The terminal-tableau
      // marker belongs to the later L4 Familiar Form, not this L1→L2 receipt.
      expect(scene.stage).toMatchObject({ combatAction: "attack", combatOutcome: "victory",
        weaponUseLevel: "1:2", weaponUseExperience: "0:1", weaponUseStatBonus: "0", reducedMotion: "true" });
      expect(scene.stage.weaponFormId).toBeUndefined(); // Use L2 is not the later Familiar Form unlock.
      if (process.env.TG2_VISUAL_CAPTURE === "1") {
        const path = testInfo.outputPath(`efficient-finisher-watch-${viewport.width}.png`);
        await page.screenshot({ path, timeout: 8_000 });
        await testInfo.attach(`Natural finisher Watch ${viewport.width}`, { path, contentType: "image/png" });
      }
      expect(await inspectInventory()).toEqual(expectedInventory);
      await page.locator(`.inventory-item[data-item-id="${weapon.id}"]`).scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (process.env.TG2_VISUAL_CAPTURE === "1") {
        const path = testInfo.outputPath(`efficient-finisher-mastery-${viewport.width}.png`);
        await page.screenshot({ path, timeout: 8_000 });
        await testInfo.attach(`Natural finisher mastery ${viewport.width}`, { path, contentType: "image/png" });
      }
      expect(await save()).toBe(exactSave);
      milestone(`${viewport.width}px actual guarded finish and source-bound mastery are readable without overflow`);
    }
    await page.reload({ timeout: 25_000 });
    await pauseOnReady(page);
    expect(await save()).toBe(exactSave);
    expect(await inspectInventory()).toEqual(expectedInventory);
    expect(await save()).toBe(exactSave);
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone("actual reload retains the single receipt; read-only panels leave the canonical save unchanged; all assertions passed");
  } finally {
    milestone(`browser diagnostics: ${errors.length} errors, ${inference.length} inference, ${external.length} external requests`);
    await testInfo.attach("Efficient finisher browser diagnostics", { body: JSON.stringify({ errors, inference, external, elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
