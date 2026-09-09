import { expect as baseExpect, test, type Page } from "@playwright/test";
import { actorPolicy } from "../src/core/actor-policy";
import { advanceWorld, campaignDirector, createWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { createCombat, resolveCombatTurn } from "../src/depth/combat";
import { projectLatestCombatTurn } from "../src/depth/combat-turn";

const expect = baseExpect.configure({ timeout: 15_000 });

function guardedEmergency(): WorldState {
  // Explicit saved combat setup matching core/read-the-guard.test.ts, not a
  // claim that a preceding autoplay journey produced these exact resources.
  const base = createWorld("read-the-guard", "campaign:read-the-guard");
  const created = createCombat(base.seed, base.depth.hero, "encounter:read-the-guard", 1);
  const enemy = created.combatants.find((unit) => unit.side === "enemies");
  if (enemy === undefined) throw new Error("The guard fixture needs its real enemy");
  const guarded = resolveCombatTurn({ ...created,
    activeIndex: created.turnOrder.indexOf(enemy.id),
    combatants: created.combatants.map((unit) => unit.side === "heroes"
      ? { ...unit, health: 1, mana: 0, power: 10, abilities: [], statuses: [] }
      : { ...unit, health: 9, armor: 2, statuses: [] }),
  }, { actorId: enemy.id, type: "guard", targetId: null, abilityId: null, itemId: null }, base.seed);
  const summary = projectLatestCombatTurn(guarded);
  if (summary?.action !== "guard") throw new Error("The prior Guard must be a real resolved combat event");
  if (guarded.turnOrder[guarded.activeIndex] !== base.hero.id) throw new Error("The hero must act after the real enemy Guard");
  return upgradeWorldState({ ...base,
    hero: { ...base.hero, health: 1 },
    depth: { ...base.depth,
      hero: { ...base.depth.hero, resources: { ...base.depth.hero.resources, health: 1, mana: 0 } },
      // Isolated createCombat has no route-bound threat context. Its required
      // legacy-unrated receipt is explicit, not evidence of route sampling.
      legacyUnratedCombatIds: [guarded.id],
      combat: guarded,
    },
    scene: { ...base.scene, mode: "battle", headline: `${enemy.name} raises Guard.`,
      action: summary.text, consequence: "Guarding is applied for one turn.", sensoryIntensity: 2 },
  });
}

async function savedCampaign(page: Page, campaignId: string): Promise<string> {
  return page.evaluate((id) => {
    const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
    if (raw === null) throw new Error("Expected the canonical guarded-combat mirror");
    return raw;
  }, campaignId);
}

async function pauseWhenReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    if (document.documentElement.dataset.ready !== "true") return false;
    const app = document.querySelector<HTMLElement>("#app")!;
    if (app.dataset.presentationPaused !== "true") document.querySelector<HTMLButtonElement>("#pause-button")!.click();
    return app.dataset.presentationPaused === "true";
  }, undefined, { polling: 20, timeout: 20_000 });
  await expect(page.locator("#pause-button")).toHaveText("Resume");
}

test("a critical hero reads real enemy Guard and restores instead of claiming an unsafe finish", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  const inference: string[] = [];
  const externalRequests: string[] = [];
  const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("requestfailed", (request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on("worker", (worker) => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
  page.on("request", (request) => {
    if (modelUrl.test(request.url())) inference.push(request.url());
    if (new URL(request.url()).origin !== new URL(testInfo.project.use.baseURL!).origin) externalRequests.push(request.url());
  });
  const fixture = guardedEmergency();
  const combat = fixture.depth.combat!;
  const enemy = combat.combatants.find((unit) => unit.side === "enemies")!;
  const tonic = fixture.depth.hero.inventory.find((item) => item.restorative !== null)!;
  expect(combat.eventStream.events).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "intent", actorId: enemy.id, action: "guard" }),
    expect.objectContaining({ kind: "status-applied", actorId: enemy.id, targetId: enemy.id,
      status: "guarding", durationAfter: 1, potencyAfter: 50 }),
  ]));
  expect(enemy.health).toBe(9);
  expect(enemy.statuses).toEqual([{ kind: "guarding", duration: 1, potency: 50 }]);
  const choice = actorPolicy(fixture, campaignDirector(fixture));
  expect(choice.trace.matchedRuleId).toBe("dire.restore");
  expect(choice.command).toMatchObject({ type: "combat-action", action: { type: "item", itemId: tonic.id } });
  const expected = advanceWorld(fixture);
  const summary = projectLatestCombatTurn(expected.depth.combat!);
  if (summary?.restorative == null) throw new Error("The expected automatic choice must have an exact tonic receipt");
  const use = summary.restorative;
  expect(use.healthBefore).toBe(1);
  expect(use.healthAfter).toBeGreaterThan(1);
  expect(use.quantityAfter).toBe(use.quantityBefore - 1);

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
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("./", { timeout: 25_000 });
  await pauseWhenReady(page);
  expect(JSON.parse(await savedCampaign(page, fixture.campaignId))).toEqual(fixture);
  const app = page.locator("#app");
  const stage = page.locator("#stage");
  const toolbar = page.locator("#view-toolbar");
  await expect(stage).toHaveAttribute("data-combat-action", "guard");
  await expect(stage).toHaveAttribute("data-combat-actor", enemy.id);
  await expect(stage).toHaveAttribute("data-combat-statuses", "status-applied:guarding");

  // The browser now chooses the real hero action; no command is injected.
  await page.locator("#pause-button").click();
  await page.waitForFunction(({ campaignId, tick }) => {
    const raw = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    if (raw === null || JSON.parse(raw).tick <= tick) return false;
    const app = document.querySelector<HTMLElement>("#app")!;
    if (app.dataset.presentationPaused !== "true") document.querySelector<HTMLButtonElement>("#pause-button")!.click();
    return app.dataset.presentationPaused === "true";
  }, { campaignId: fixture.campaignId, tick: fixture.tick }, { polling: 20, timeout: 15_000 });
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  const saved = await savedCampaign(page, fixture.campaignId);
  const restored = JSON.parse(saved) as WorldState;
  expect(restored.tick).toBe(fixture.tick + 1);
  expect(restored.depth).toEqual(expected.depth);
  expect(restored.hero.experience).toBe(fixture.hero.experience);
  expect(restored.depth.companions.active).toEqual([]);
  expect(restored.depth.combat?.outcome).toBe("ongoing");
  expect(restored.depth.combat?.combatants.find((unit) => unit.id === enemy.id)).toEqual(enemy);
  expect(restored.depth.combat?.eventStream.events.slice(0, combat.eventStream.events.length)).toEqual(combat.eventStream.events);
  expect(restored.depth.hero.inventory.find((item) => item.id === tonic.id)?.quantity).toBe(use.quantityAfter);
  const event = restored.chronicle.at(-1)!;
  expect(event).toMatchObject({ commandId: choice.commandId, commandType: "combat-action", mode: "battle",
    decisionTrace: { matchedRuleId: "dire.restore", selected: { actionLabel: `uses ${tonic.name}`, targetLabel: "self · emergency HP ≤ ⅓" } } });
  expect(event.rationale).toContain(`${enemy.name}'s Guard prevents a guaranteed finish;`);
  expect(event.decisionTrace?.considered).toEqual(expect.arrayContaining([
    expect.objectContaining({ actionLabel: "attacks", targetLabel: `${enemy.name} · Guard · 4–6 damage` }),
  ]));

  async function verifyRestorativePresentation(): Promise<void> {
    await expect(stage).toHaveAttribute("data-scene-mode", "battle");
    await expect(stage).toHaveAttribute("data-combat-action", "item");
    await expect(stage).toHaveAttribute("data-combat-focus-kind", "self-effect");
    await expect(stage).toHaveAttribute("data-combat-item", tonic.id);
    await expect(stage).toHaveAttribute("data-combat-quantity-delta", `${use.quantityBefore}:${use.quantityAfter}`);
    await expect(stage).toHaveAttribute("data-combat-healing-delta", `${use.healthBefore}:${use.amount}:${use.healthAfter}`);
    await expect(stage).not.toHaveAttribute("data-combat-health-delta", /.+/);
    const projected = await stage.evaluate((element) => ({
      roster: JSON.parse((element as HTMLElement).dataset.combatRoster!),
      statuses: JSON.parse((element as HTMLElement).dataset.combatRosterStatuses!),
    }));
    expect(projected.roster).toEqual(expect.arrayContaining([expect.objectContaining({ id: enemy.id, health: 9, alive: true })]));
    expect(projected.statuses).toEqual(expect.arrayContaining([{ id: enemy.id, statuses: enemy.statuses }]));
    await expect(page.locator("#watch-hero-health-text")).toHaveText(`HP ${use.healthAfter}/${use.maxHealth}`);
    await expect(page.locator("#watch-companion-card")).toBeHidden();
    await expect(page.locator("#battle-turn-strip")).toContainText(
      `${use.itemName} ×${use.quantityBefore}→×${use.quantityAfter} · HP ${use.healthBefore}→${use.healthAfter} (+${use.amount})`);
  }
  await verifyRestorativePresentation();
  await toolbar.locator('[data-view="journal"]').click();
  await page.locator("#journal-status-button").click();
  const row = page.locator(`#journal-status-list [data-source="chronicle"][data-event-id="${event.id}"]`);
  await expect(row.locator(".journal-status-action")).toHaveText(restored.scene.action);
  await expect(row.locator(".journal-status-consequence")).toHaveText(restored.scene.consequence);
  await row.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(row).toContainText(event.rationale);
  await expect(row.locator(".journal-status-choice")).toContainText(`uses ${tonic.name} → self · emergency HP ≤ ⅓`);
  await expect(row.locator(".journal-status-receipt")).toContainText(choice.commandId);

  for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    await toolbar.locator('[data-view="watch"]').click();
    await page.locator("#stage-focus-button").focus();
    await page.keyboard.press("Enter");
    await expect(app).toHaveAttribute("data-chrome-mode", "focus");
    await verifyRestorativePresentation();
    await expect(page.locator("#hero-hud")).toBeHidden();
    if (process.env.TG2_VISUAL_CAPTURE === "1") {
      const path = testInfo.outputPath(`read-the-guard-focus-${viewport.width}.png`);
      await page.screenshot({ path, timeout: 8_000 });
      await testInfo.attach(`Read the Guard Focus ${viewport.width}`, { path, contentType: "image/png" });
    }
    await page.keyboard.press("Escape");
    await toolbar.locator('[data-view="journal"]').click();
    await expect(page.locator("#journal-status-button")).toHaveAttribute("aria-pressed", "true");
    await row.scrollIntoViewIfNeeded();
    const bounds = await row.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    if (process.env.TG2_VISUAL_CAPTURE === "1") {
      const path = testInfo.outputPath(`read-the-guard-status-${viewport.width}.png`);
      await page.screenshot({ path, timeout: 8_000 });
      await testInfo.attach(`Read the Guard Status ${viewport.width}`, { path, contentType: "image/png" });
    }
  }
  expect(await savedCampaign(page, fixture.campaignId)).toBe(saved);
  expect(upgradeWorldState(JSON.parse(saved))).toEqual(restored);
  await page.reload({ waitUntil: "domcontentloaded" });
  await pauseWhenReady(page);
  await verifyRestorativePresentation();
  expect(JSON.parse(await savedCampaign(page, fixture.campaignId))).toEqual(restored);
  await expect(app).toHaveAttribute("data-play-mode", "deterministic");
  await expect(app).toHaveAttribute("data-creative-story-state", "off");
  expect(inference).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});
