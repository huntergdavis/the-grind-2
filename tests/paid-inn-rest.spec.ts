import { expect as baseExpect, test, type Page } from "@playwright/test";
import { advanceWorld, campaignDirector, createWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { selectPaidInnRest } from "../src/depth/town-rest";

const expect = baseExpect.configure({ timeout: 15_000 });

async function savedCampaign(page: Page, campaignId: string): Promise<string> {
  return page.evaluate((id) => {
    const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
    if (raw === null) throw new Error("Expected the canonical paid-rest campaign mirror");
    return raw;
  }, campaignId);
}

test("an automatic paid inn stay restores real resources once and keeps its receipt visible through reload", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
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

  // Reuse core/paid-inn-rest.test.ts's real Raincross and recorded Badger Inn.
  // Low resources are an explicit saved fixture, not a claimed prior battle.
  const base = createWorld("paid-inn-rest", "campaign:paid-inn-rest");
  const resources = { ...base.depth.hero.resources,
    health: base.depth.hero.resources.maxHealth - 1,
    mana: Math.floor(base.depth.hero.resources.maxMana / 3) };
  const fixture = upgradeWorldState({ ...base,
    hero: { ...base.hero, health: resources.health },
    depth: { ...base.depth, hero: { ...base.depth.hero, resources } },
  });
  const plan = selectPaidInnRest(fixture.depth);
  expect(plan).toMatchObject({ locationId: "location:0", townName: "Raincross",
    innId: "town:location:0:district:0:building:2", innName: "The Badger Inn",
    goldBefore: 12, goldSpent: 5, goldAfter: 7,
    healthBefore: 44, healthAfter: 45, manaBefore: 6, manaAfter: 20 });
  if (plan === null) throw new Error("The canonical paid-rest fixture must be eligible");
  expect(campaignDirector(fixture).candidates.map((candidate) => candidate.command)).toEqual([{ type: "wait" }]);
  const expected = advanceWorld(fixture);
  const commandId = `${fixture.campaignId}:depth:${expected.depth.tick}:town:${plan.locationId}:inn-rest:${plan.innId}`;
  const receipt = "HP 44→45 · MP 6→20 · gold 12→7 (−5) · Fully rested · no XP or items gained";

  await page.addInitScript((saved) => {
    const key = `the-grind-2:campaign:${saved.campaignId}`;
    // Preserve the actual browser result when this same page reloads.
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
  await page.waitForFunction(({ campaignId, commandId }) => {
    if (document.documentElement.dataset.ready !== "true") return false;
    const raw = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    if (raw === null || JSON.parse(raw).chronicle.at(-1)?.commandId !== commandId) return false;
    const app = document.querySelector<HTMLElement>("#app")!;
    if (app.dataset.presentationPaused !== "true") document.querySelector<HTMLButtonElement>("#pause-button")!.click();
    return app.dataset.presentationPaused === "true";
  }, { campaignId: fixture.campaignId, commandId }, { polling: 20, timeout: 20_000 });
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  const saved = await savedCampaign(page, fixture.campaignId);
  const rested = JSON.parse(saved) as WorldState;
  expect(rested.tick).toBe(fixture.tick + 1);
  expect(rested.hero.gold).toBe(fixture.hero.gold - 5);
  expect(rested.hero.experience).toBe(fixture.hero.experience);
  expect(rested.depth.hero).toEqual({ ...fixture.depth.hero, gold: 7,
    resources: { ...fixture.depth.hero.resources, health: 45, mana: 20 } });
  expect(rested.depth.towns).toEqual(fixture.depth.towns);
  expect(rested.depth.quest).toEqual(fixture.depth.quest);
  expect(rested.depth.companions).toEqual(fixture.depth.companions);
  expect(rested.scene).toMatchObject({ mode: "town", location: plan.townName,
    headline: "The Badger Inn: a room before the road.",
    action: `${fixture.hero.name} pays 5 gold for rest at The Badger Inn in Raincross.`, consequence: receipt });
  const event = rested.chronicle.at(-1)!;
  expect(event).toMatchObject({ tick: rested.tick, commandId, commandType: "wait", mode: "town", consequence: receipt });
  expect(event.decisionTrace?.selected).toMatchObject({ actionLabel: "rests at an inn",
    targetLabel: "The Badger Inn · gold 12→7 · MP 6→20" });
  expect(rested.chronicle).toHaveLength(fixture.chronicle.length + 1);
  expect(upgradeWorldState(JSON.parse(saved))).toEqual(rested);
  expect(selectPaidInnRest(rested.depth)).toBeNull();

  const app = page.locator("#app");
  const stage = page.locator("#stage");
  const toolbar = page.locator("#view-toolbar");
  async function verifyInnPresentation(): Promise<void> {
    await expect(stage).toHaveAttribute("data-scene-mode", "town");
    await expect(stage).toHaveAttribute("data-inn-rest-active", "true");
    await expect(stage).toHaveAttribute("data-inn-rest-building", plan!.innId);
    await expect(stage).toHaveAttribute("data-inn-rest-receipt", receipt);
    await expect(stage).toHaveAttribute("data-inn-rest-visual", "recorded-inn|warm-window|bed-sign|five-coins|resting-hero");
    await expect(stage.locator("canvas")).toBeVisible();
    for (const [resource, value, max] of [["health", 45, 45], ["mana", 20, 20]] as const) {
      const meter = page.locator(`#watch-hero-${resource}`);
      await expect(meter).toBeVisible();
      await expect(meter).toHaveAttribute("aria-label", `${fixture.hero.name} ${resource} ${value} of ${max}`);
      expect(await meter.evaluate((element) => ({ value: (element as HTMLProgressElement).value,
        max: (element as HTMLProgressElement).max }))).toEqual({ value, max });
    }
    await expect(page.locator("#watch-companion-card")).toBeHidden();
  }
  await verifyInnPresentation();
  await toolbar.locator('[data-view="journal"]').click();
  await page.locator("#journal-status-button").click();
  const chronicle = page.locator(`#journal-status-list [data-source="chronicle"][data-event-id="${event.id}"]`);
  await expect(chronicle.locator("h3")).toHaveText(rested.scene.headline);
  await expect(chronicle.locator(".journal-status-action")).toHaveText(rested.scene.action);
  await expect(chronicle.locator(".journal-status-consequence")).toHaveText(receipt);
  await chronicle.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(chronicle.locator(".journal-status-choice")).toHaveText(
    `Computer choice · ${fixture.hero.name} → rests at an inn → The Badger Inn · gold 12→7 · MP 6→20`);
  await expect(chronicle.locator(".journal-status-receipt")).toContainText(commandId);
  const mechanicalReceipt = rested.depth.log.at(-1)!;
  await expect(page.locator(`#journal-status-list [data-source="mechanics"][data-event-id="${mechanicalReceipt.id}"]`))
    .toContainText("Paid inn rest at The Badger Inn, Raincross: gold 12→7 (-5) · HP 44→45 (+1) · MP 6→20 (+14). Fully rested; no items or rewards gained.");
  await toolbar.locator('[data-view="watch"]').click();

  for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    await page.locator("#stage-focus-button").focus();
    await page.keyboard.press("Enter");
    await expect(app).toHaveAttribute("data-chrome-mode", "focus");
    await expect(page.locator("#hero-hud")).toBeHidden();
    await expect(page.locator("#mini-map")).toBeHidden();
    await verifyInnPresentation();
    const bounds = await stage.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    if (process.env.TG2_VISUAL_CAPTURE === "1") {
      const path = testInfo.outputPath(`paid-inn-rest-focus-${viewport.width}.png`);
      await page.screenshot({ path, timeout: 8_000 });
      await testInfo.attach(`Paid inn rest Focus ${viewport.width}`, { path, contentType: "image/png" });
    }
    await page.keyboard.press("Escape");
    await expect(app).toHaveAttribute("data-chrome-mode", "panels");
  }
  expect(await savedCampaign(page, fixture.campaignId)).toBe(saved);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    if (document.documentElement.dataset.ready !== "true") return false;
    const app = document.querySelector<HTMLElement>("#app")!;
    if (app.dataset.presentationPaused !== "true") document.querySelector<HTMLButtonElement>("#pause-button")!.click();
    return app.dataset.presentationPaused === "true";
  }, undefined, { polling: 20, timeout: 20_000 });
  await verifyInnPresentation();
  expect(JSON.parse(await savedCampaign(page, fixture.campaignId))).toEqual(rested);

  // Intentionally resume for one ordinary command: a full hero must not pay
  // again, and the old paid-stop artwork/receipt must not leak into that scene.
  const expectedNext = advanceWorld(rested);
  expect(expectedNext.chronicle.at(-1)?.commandId).not.toContain(":inn-rest:");
  await page.locator("#pause-button").click();
  await page.waitForFunction(({ campaignId, tick }) => {
    const raw = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    if (raw === null || JSON.parse(raw).tick <= tick) return false;
    const app = document.querySelector<HTMLElement>("#app")!;
    if (app.dataset.presentationPaused !== "true") document.querySelector<HTMLButtonElement>("#pause-button")!.click();
    return app.dataset.presentationPaused === "true";
  }, { campaignId: fixture.campaignId, tick: rested.tick }, { polling: 20, timeout: 15_000 });
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  const next = JSON.parse(await savedCampaign(page, fixture.campaignId)) as WorldState;
  expect(next.tick).toBe(rested.tick + 1);
  expect(next.hero.gold).toBe(rested.hero.gold);
  expect(next.chronicle.at(-1)?.commandId).toBe(expectedNext.chronicle.at(-1)?.commandId);
  expect(next.chronicle.filter((entry) => entry.commandId?.includes(":inn-rest:"))).toHaveLength(1);
  for (const attribute of ["active", "building", "receipt", "visual"]) {
    await expect(stage).not.toHaveAttribute(`data-inn-rest-${attribute}`, /.+/);
  }
  await expect(app).toHaveAttribute("data-play-mode", "deterministic");
  await expect(app).toHaveAttribute("data-creative-story-state", "off");
  expect(inference).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});
