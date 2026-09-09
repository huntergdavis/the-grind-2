import { expect as baseExpect, test, type Page } from "@playwright/test";
import { createForwardMotionState } from "../src/core/forward-motion";
import { advanceWorld, createWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { projectLatestCombatTurn } from "../src/depth/combat-turn";
import { stepDepth } from "../src/depth/state";
import { generateTown, visitTown } from "../src/depth/towns";
import type { DepthState } from "../src/depth/types";

const expect = baseExpect.configure({ timeout: 15_000 });

function millerRouteBattle(): WorldState {
  // The existing Shared Road browser fixture supplies a recorded town roster.
  // Its Miller profession, turn order and empty enemy mana are explicit setup,
  // not a claim that autoplay sampled them. Rated enemy stats/ability stay intact.
  const base = createWorld("browser-shared-road", "campaign:browser-millrace");
  const originId = base.depth.atlas.currentLocationId;
  const current = base.depth.atlas.locations.find((location) => location.kind === "town" && location.id !== originId);
  if (current === undefined) throw new Error("Millrace fixture needs another recorded town");
  const generated = visitTown(generateTown(base.seed, current.id));
  const town = { ...generated, residents: generated.residents.map((resident) => ({ ...resident, role: "miller" })) };
  const eligible = upgradeWorldState({ ...base,
    scene: { ...base.scene, mode: "town", location: town.name },
    forwardMotion: createForwardMotionState(current.id, base.tick),
    depth: { ...base.depth, towns: { ...base.depth.towns, [current.id]: town },
      atlas: { ...base.depth.atlas, currentLocationId: current.id, discoveredLocationIds: [originId, current.id], route: null } },
  });
  const joined = advanceWorld(eligible);
  const companion = joined.depth.companions.active[0];
  if (companion?.combatKit?.kitId !== "miller-roadcraft") throw new Error("Real recruitment must supply the Miller kit");
  const routed = advanceWorld(joined);
  let depth = routed.depth;
  if (depth.atlas.route === null) {
    const destinationId = depth.atlas.edges.find((edge) => edge.from === depth.atlas.currentLocationId)?.to
      ?? depth.atlas.edges.find((edge) => edge.to === depth.atlas.currentLocationId)?.from;
    if (destinationId === undefined) throw new Error("Fixture needs an adjacent canonical route");
    depth = stepDepth(depth, { type: "plan-route", destinationId });
  }
  if (depth.atlas.route === null) throw new Error("Fixture needs a route-bound encounter");
  const started = stepDepth(depth, { type: "start-combat", encounterId: `encounter:route:${depth.atlas.route.path.join(">")}`, enemyCount: 1 });
  const combat = started.combat;
  const enemy = combat?.combatants.find((unit) => unit.side === "enemies");
  if (combat == null || enemy === undefined) throw new Error("Canonical route combat did not start");
  const staged: DepthState = { ...started,
    hero: { ...started.hero, resources: { ...started.hero.resources, health: started.hero.resources.maxHealth } },
    combat: { ...combat, activeIndex: 0, turnOrder: [companion.identity.residentId, enemy.id, started.hero.id],
      combatants: combat.combatants.map((unit) => unit.id === enemy.id
        ? { ...unit, mana: 0 }
        : unit.id === started.hero.id ? { ...unit, health: unit.maxHealth } : unit) },
  };
  return upgradeWorldState({ ...routed, tick: staged.tick, depth: staged,
    hero: { ...routed.hero, health: staged.hero.resources.health, maxHealth: staged.hero.resources.maxHealth },
    lifecycle: { ...routed.lifecycle, simulationTick: staged.tick, worldClockMinutes: staged.tick * 15 },
    scene: { ...routed.scene, mode: "battle", headline: "The shared road meets an armed foe." },
  });
}

async function savedCampaign(page: Page, campaignId: string): Promise<string> {
  return page.evaluate((id) => {
    const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
    if (raw === null) throw new Error("Expected the canonical campaign mirror");
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
}

async function automaticStep(page: Page, before: WorldState): Promise<WorldState> {
  const focused = await page.locator("#app").getAttribute("data-chrome-mode") === "focus";
  await page.locator(focused ? "#stage-pause-button" : "#pause-button").click();
  await page.waitForFunction(({ campaignId, tick }) => {
    const raw = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    if (raw === null || JSON.parse(raw).tick <= tick) return false;
    const app = document.querySelector<HTMLElement>("#app")!;
    if (app.dataset.presentationPaused !== "true") document.querySelector<HTMLButtonElement>("#pause-button")!.click();
    return app.dataset.presentationPaused === "true";
  }, { campaignId: before.campaignId, tick: before.tick }, { polling: 20, timeout: 15_000 });
  const actual = JSON.parse(await savedCampaign(page, before.campaignId)) as WorldState;
  expect(actual.tick).toBe(before.tick + 1);
  expect(actual.depth).toEqual(advanceWorld(before).depth);
  return actual;
}

test("a real Miller Drag earns one opening and the autonomous hero spends one equipped Millrace strike", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  const inference: string[] = [];
  const external: string[] = [];
  const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("requestfailed", (request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on("worker", (worker) => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
  page.on("request", (request) => {
    if (modelUrl.test(request.url())) inference.push(request.url());
    if (new URL(request.url()).origin !== new URL(testInfo.project.use.baseURL!).origin) external.push(request.url());
  });
  const fixture = millerRouteBattle();
  const companion = fixture.depth.companions.active[0]!;
  const enemy = fixture.depth.combat!.combatants.find((unit) => unit.side === "enemies")!;
  expect(fixture.depth.combat!.threat.rating).toBe("place-bound");
  expect(upgradeWorldState(JSON.parse(JSON.stringify(fixture)))).toEqual(fixture);
  expect(projectLatestCombatTurn(advanceWorld(fixture).depth.combat!)?.companionAction?.companionActionId).toBe("millstone-drag");

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
  const stage = page.locator("#stage");
  const app = page.locator("#app");
  const toolbar = page.locator("#view-toolbar");
  await expect(page.locator("#shared-opening-pip")).toHaveCount(0);
  const dragged = await automaticStep(page, fixture);
  await expect(stage).toHaveAttribute("data-combat-companion-action", "millstone-drag");
  await expect(page.locator("#shared-opening-pip")).toHaveCount(0);
  const armed = await automaticStep(page, dragged);
  const earn = projectLatestCombatTurn(armed.depth.combat!)?.sharedOpening;
  if (earn?.kind !== "shared-opening-earned") throw new Error("Actual affected enemy strike must earn the opening");
  expect(earn).toMatchObject({ companionId: companion.identity.residentId, heroId: fixture.hero.id, targetId: enemy.id, openingBefore: 0, openingAfter: 1 });
  expect(earn.affectedActionEventId).not.toBe(earn.sourceEventId);
  const armedSave = await savedCampaign(page, fixture.campaignId);
  await expect(page.locator("#shared-opening-pip")).toBeVisible();
  await expect(page.locator("#shared-opening-pip")).toHaveText("◆ Shared Opening 1/1");
  await expect(stage).toHaveAttribute("data-shared-opening", "1/1");
  await expect(stage).toHaveAttribute("data-shared-opening-source", earn.sourceEventId);
  await expect(stage).toHaveAttribute("data-shared-opening-affected-action", earn.affectedActionEventId);
  await page.locator("#stage-focus-button").click();
  await expect(app).toHaveAttribute("data-chrome-mode", "focus");
  await expect(page.locator("#shared-opening-pip")).toBeVisible();
  if (process.env.TG2_VISUAL_CAPTURE === "1") await page.screenshot({ path: testInfo.outputPath("millrace-earned-320.png"), timeout: 8_000 });
  expect(await savedCampaign(page, fixture.campaignId)).toBe(armedSave);
  await page.reload({ waitUntil: "domcontentloaded" });
  await pauseWhenReady(page);
  expect(JSON.parse(await savedCampaign(page, fixture.campaignId))).toEqual(armed);
  await expect(page.locator("#shared-opening-pip")).toBeVisible();

  const spent = await automaticStep(page, armed);
  const summary = projectLatestCombatTurn(spent.depth.combat!)!;
  const spend = summary.sharedOpening;
  if (spend?.kind !== "shared-opening-spent" || summary.damage === null) throw new Error("Actual hero choice must spend the witnessed opening");
  expect(spend).toMatchObject({ earnedEventId: earn.id, sourceEventId: earn.sourceEventId, affectedActionEventId: earn.affectedActionEventId,
    companionId: companion.identity.residentId, heroId: fixture.hero.id, targetId: enemy.id, openingBefore: 1, openingAfter: 0, armorReduction: Math.floor(enemy.armor / 5) });
  const packet = spent.depth.combat!.eventStream.events.filter((event) => event.turn === summary.turn);
  expect(packet.filter((event) => event.kind === "damage")).toHaveLength(1);
  expect(packet.filter((event) => event.kind === "shared-opening-spent")).toHaveLength(1);
  expect(packet.some((event) => event.kind === "mana-spent" || event.kind === "restorative-used" || event.kind === "companion-action-resolved")).toBe(false);
  expect(spent.depth.combat!.weaponUse).toMatchObject({ tracking: "tracked", weaponId: fixture.depth.hero.equipment.weapon, basicStrikes: 1, damage: summary.damage.amount });
  expect(spent.depth.hero.resources.mana).toBe(armed.depth.hero.resources.mana);
  expect(spent.depth.hero.inventory).toEqual(armed.depth.hero.inventory);
  expect(spent.depth.hero.abilities).toEqual(armed.depth.hero.abilities);
  expect(spent.depth.companions).toEqual(armed.depth.companions);
  expect(spent.chronicle.at(-1)?.decisionTrace?.matchedRuleId).toBe("opening.millrace-reversal");
  await testInfo.attach("Millrace canonical receipts", { contentType: "application/json", body: JSON.stringify({
    campaignId: fixture.campaignId, combatId: spent.depth.combat!.id,
    hero: fixture.hero.name, companion: companion.identity.name, enemy: enemy.name,
    earned: earn, spent: spend, damage: summary.damage, weaponUse: spent.depth.combat!.weaponUse,
    chronicle: spent.chronicle.at(-1),
  }, null, 2) });
  const spentSave = await savedCampaign(page, fixture.campaignId);
  const exactActors = JSON.stringify([enemy.id, companion.identity.residentId, fixture.hero.id]);

  async function verifySpent(): Promise<void> {
    await expect(page.locator("#shared-opening-pip")).toHaveCount(0);
    await expect(stage).toHaveAttribute("data-combat-action", "joint-action");
    await expect(stage).toHaveAttribute("data-combat-phase", "joint-tableau");
    await expect(stage).toHaveAttribute("data-millrace-phase", "spent");
    await expect(stage).toHaveAttribute("data-millrace-actors", exactActors);
    await expect(stage).toHaveAttribute("data-millrace-visual", "miller-brace|millstone-line|one-equipped-strike");
    await expect(stage).toHaveAttribute("data-millrace-weapon", fixture.depth.hero.equipment.weapon!);
    await expect(stage).toHaveAttribute("data-millrace-armor-reduction", String(Math.floor(enemy.armor / 5)));
    await expect(stage).toHaveAttribute("data-combat-health-delta", `${summary.damage!.healthBefore}:${summary.damage!.amount}:${summary.damage!.healthAfter}`);
    await expect(page.locator("#stage-focus-headline")).toContainText(`${companion.identity.name} braces; ${fixture.hero.name} strikes ${enemy.name} once`);
    await expect(page.locator("#stage-focus-headline")).toContainText("Opening 1→0");
    await expect(page.locator("#battle-turn-strip")).toContainText(summary.text);
    await expect(page.locator("#battle-turn-strip")).toHaveAttribute("data-shared-opening-source", earn!.sourceEventId);
  }

  for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    if (await app.getAttribute("data-active-view") !== "watch") await toolbar.locator('[data-view="watch"]').click();
    if (await app.getAttribute("data-chrome-mode") !== "focus") await page.locator("#stage-focus-button").click();
    await verifySpent();
    const ribbon = await page.locator("#stage-focus-ribbon").boundingBox();
    expect(ribbon).not.toBeNull();
    expect(ribbon!.x).toBeGreaterThanOrEqual(0);
    expect(ribbon!.x + ribbon!.width).toBeLessThanOrEqual(viewport.width);
    expect(ribbon!.y + ribbon!.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    if (process.env.TG2_VISUAL_CAPTURE === "1") {
      const path = testInfo.outputPath(`millrace-spent-${viewport.width}.png`);
      await page.screenshot({ path, timeout: 8_000 });
      await testInfo.attach(`Millrace Reversal ${viewport.width}`, { path, contentType: "image/png" });
    }
  }
  // The same Watch facts remain usable without the Canvas. Full attribution is
  // also in the existing Adventure receipt and Chronicle/Status, not a new panel.
  await page.setViewportSize({ width: 320, height: 568 });
  await stage.locator("canvas").evaluateAll((canvases) => canvases.forEach((canvas) => { (canvas as HTMLElement).style.visibility = "hidden"; }));
  await expect(page.locator("#stage-focus-headline")).toBeVisible();
  await verifySpent();
  await page.keyboard.press("Escape");
  await toolbar.locator('[data-view="adventure"]').click();
  await expect(page.locator("#battle-turn-strip")).toBeVisible();
  await expect(page.locator("#battle-turn-strip")).toContainText(`armor penalty ${spend.armorReduction} · 0 MP · 0 items`);
  await toolbar.locator('[data-view="journal"]').click();
  await page.locator("#journal-status-button").click();
  const latest = spent.chronicle.at(-1)!;
  const row = page.locator(`#journal-status-list [data-source="chronicle"][data-event-id="${latest.id}"]`);
  await expect(row.locator(".journal-status-action")).toHaveText(spent.scene.action);
  await expect(row.locator(".journal-status-consequence")).toHaveText(spent.scene.consequence);
  expect(await savedCampaign(page, fixture.campaignId)).toBe(spentSave);
  expect(upgradeWorldState(JSON.parse(spentSave))).toEqual(spent);
  await page.reload({ waitUntil: "domcontentloaded" });
  await pauseWhenReady(page);
  await verifySpent();
  expect(JSON.parse(await savedCampaign(page, fixture.campaignId))).toEqual(spent);
  const next = await automaticStep(page, spent);
  expect(projectLatestCombatTurn(next.depth.combat!)?.sharedOpening?.kind).not.toBe("shared-opening-spent");
  await expect(stage).not.toHaveAttribute("data-millrace-phase", /.+/);
  await expect(stage).not.toHaveAttribute("data-millrace-actors", /.+/);
  await expect(page.locator("#shared-opening-pip")).toHaveCount(0);
  await expect(app).toHaveAttribute("data-play-mode", "deterministic");
  await expect(app).toHaveAttribute("data-creative-story-state", "off");
  expect(inference).toEqual([]);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
