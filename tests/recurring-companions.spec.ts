import { expect as baseExpect, test, type Page } from "@playwright/test";
import { createForwardMotionState } from "../src/core/forward-motion";
import { advanceWorld, campaignDirector, createWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { heroMasteryForExperience } from "../src/depth/rpg";
import { depthCommandCandidates, stepDepth, upgradeDepthState } from "../src/depth/state";
import { generateTown, visitTown } from "../src/depth/towns";
import type { DepthState } from "../src/depth/types";

const expect = baseExpect.configure({ timeout: 15_000 });

function readyForAnotherOath(): WorldState {
  // Reuse the canonical first journey from recurring-companions.test.ts:
  // recruitment, owned route, real travel reducers, then a separate farewell.
  const base = createWorld("recurring-shared-road", "campaign:browser-recurring-shared-road");
  const originId = base.depth.atlas.currentLocationId;
  const current = base.depth.atlas.locations.find((place) => place.kind === "town" && place.id !== originId);
  if (current === undefined) throw new Error("Recurring-road browser fixture needs two towns");
  let depth: DepthState = { ...base.depth,
    atlas: { ...base.depth.atlas, currentLocationId: current.id,
      discoveredLocationIds: [originId, current.id], route: null },
    towns: { ...base.depth.towns, [current.id]: visitTown(generateTown(base.seed, current.id)) },
  };
  const recruit = depthCommandCandidates(depth)[0]?.command;
  if (recruit?.type !== "recruit-companion") throw new Error("The first oath must remain eligible");
  depth = stepDepth(depth, recruit);
  const route = depthCommandCandidates(depth)[0]?.command;
  if (route?.type !== "plan-route") throw new Error("The first companion must own the route");
  depth = stepDepth(depth, route);
  for (let index = 0; index < 32 && depth.atlas.route !== null; index += 1) {
    depth = stepDepth(depth, { type: "travel", distance: 10_000 });
  }
  if (depth.atlas.route !== null) throw new Error("The first journey did not arrive");
  const farewell = depthCommandCandidates(depth)[0]?.command;
  if (farewell?.type !== "farewell-companion") throw new Error("Arrival must produce a separate farewell");
  depth = stepDepth(depth, farewell);
  const former = depth.companions.former[0];
  if (former === undefined) throw new Error("The completed oath must remain recorded");

  // This is an explicitly advanced/relocated save, not twelve autoplay turns.
  // The browser itself will execute the next automatic recruitment command.
  const locationId = former.identity.originLocationId;
  const ready = { ...depth, tick: former.departure.tick + 12,
    atlas: { ...depth.atlas, currentLocationId: locationId, route: null },
    towns: { ...depth.towns,
      [locationId]: depth.towns[locationId] ?? visitTown(generateTown(base.seed, locationId)) },
  };
  depth = upgradeDepthState(JSON.parse(JSON.stringify(ready)), ready.seed, ready.hero.id, ready.hero.name);
  return upgradeWorldState({ ...base, tick: depth.tick, depth,
    hero: { ...base.hero, level: depth.hero.level, experience: depth.hero.experience,
      mastery: heroMasteryForExperience(depth.hero.experience), health: depth.hero.resources.health,
      maxHealth: depth.hero.resources.maxHealth, gold: depth.hero.gold },
    scene: { ...base.scene, mode: "town", location: depth.towns[locationId]!.name },
    lifecycle: { ...base.lifecycle, simulationTick: depth.tick, worldClockMinutes: depth.tick * 15 },
    forwardMotion: createForwardMotionState(locationId, depth.tick),
  });
}

async function savedCampaign(page: Page, campaignId: string): Promise<string> {
  return page.evaluate((id) => {
    const saved = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
    if (saved === null) throw new Error("Expected the canonical campaign mirror");
    return saved;
  }, campaignId);
}

test("a later automatic road oath keeps current Company separate from recorded history across reload", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  const inference: string[] = [];
  const externalRequests: string[] = [];
  const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("worker", (worker) => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
  page.on("request", (request) => {
    if (modelUrl.test(request.url())) inference.push(request.url());
    if (new URL(request.url()).origin !== new URL(testInfo.project.use.baseURL!).origin) externalRequests.push(request.url());
  });
  const fixture = readyForAnotherOath();
  const former = fixture.depth.companions.former[0]!;
  expect(fixture.depth.companions.active).toEqual([]);
  expect(fixture.depth.companions.former).toHaveLength(1);
  expect(fixture.tick - former.departure.tick).toBe(12);
  expect(fixture.depth.atlas.currentLocationId).not.toBe(former.departure.locationId);
  const command = campaignDirector(fixture).candidates[0]?.command;
  if (command?.type !== "recruit-companion") throw new Error("The next automatic command must recruit again");
  const expected = advanceWorld(fixture);
  const companion = expected.depth.companions.active[0]!;
  expect(companion.identity.residentId).not.toBe(former.identity.residentId);

  await page.addInitScript((saved) => {
    const key = `the-grind-2:campaign:${saved.campaignId}`;
    // Do not replace the actual browser-produced save on the reload below.
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
  await page.waitForFunction(({ id, residentId }) => {
    if (document.documentElement.dataset.ready !== "true") return false;
    const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
    if (raw === null || JSON.parse(raw).depth.companions.active[0]?.identity.residentId !== residentId) return false;
    const app = document.querySelector<HTMLElement>("#app")!;
    if (app.dataset.presentationPaused !== "true") document.querySelector<HTMLButtonElement>("#pause-button")!.click();
    return app.dataset.presentationPaused === "true";
  }, { id: fixture.campaignId, residentId: companion.identity.residentId }, { polling: 20, timeout: 20_000 });
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  const saved = await savedCampaign(page, fixture.campaignId);
  const joined = JSON.parse(saved) as WorldState;
  expect(joined.tick).toBe(fixture.tick + 1);
  expect(joined.chronicle.at(-1)?.commandType).toBe("recruit-companion");
  expect(joined.depth.companions).toEqual(expected.depth.companions);
  expect(joined.depth.companions.former).toEqual(fixture.depth.companions.former);
  expect(upgradeWorldState(JSON.parse(saved))).toEqual(joined);

  const toolbar = page.locator("#view-toolbar");
  const companyButton = page.locator("#journal-company-button");
  const companionHistory = page.locator("#journal-companion-history");
  async function verifyVisibleHistory(): Promise<void> {
    await toolbar.locator('[data-view="watch"]').click();
    await expect(page.locator("#stage-focus-ribbon")).toHaveAttribute("data-party-size", "2");
    await expect(page.locator("#watch-companion-portrait")).toBeVisible();
    await expect(page.locator("#watch-companion-portrait")).toHaveAttribute("data-character-id", companion.identity.residentId);
    await expect(page.locator("#stage-focus-companion")).toHaveText(companion.identity.name);
    await expect(page.locator("#watch-companion-status")).toHaveText("Travelling");
    await expect(page.locator("#watch-companion-health-text")).toHaveText(`HP ${companion.resources.health}/${companion.combat.maxHealth}`);
    await expect(page.locator("#watch-companion-health")).toHaveAttribute("aria-label",
      `${companion.identity.name} health ${companion.resources.health} of ${companion.combat.maxHealth}`);
    expect(await page.locator("#watch-companion-health").evaluate((bar) => ({
      value: (bar as HTMLProgressElement).value, max: (bar as HTMLProgressElement).max,
    }))).toEqual({ value: companion.resources.health, max: companion.combat.maxHealth });
    await expect(page.locator("#watch-companion-card")).not.toContainText(/\bMP\b|dead/iu);
    await expect(page.locator("#watch-companion-card")).not.toContainText(former.identity.name);

    await toolbar.locator('[data-view="journal"]').click();
    await expect(page.locator(".journal-sections button")).toHaveCount(4);
    await expect(companyButton).toHaveText("Company");
    for (const section of ["adventure", "status", "narratives"] as const) {
      await page.locator(`#journal-${section}-button`).click();
      await expect(page.locator(".journal-companions")).toBeHidden();
      await expect(page.locator(".journal-mentors")).toBeHidden();
    }
    await companyButton.focus();
    await page.keyboard.press("Enter");
    await expect(companyButton).toHaveAttribute("aria-pressed", "true");
    await expect(companyButton).toBeFocused();
    await expect(page.locator(".journal-companions")).toHaveAttribute("data-journal-section", "company");
    await expect(page.locator(".journal-mentors")).toHaveAttribute("data-journal-section", "company");
    const activeRecord = page.locator("#journal-companion-active .journal-companion-record");
    await expect(activeRecord).toHaveCount(1);
    await expect(activeRecord).toBeVisible();
    await expect(activeRecord).toHaveAttribute("data-companion-id", companion.identity.residentId);
    await expect(activeRecord.locator(".company-portrait")).toHaveAttribute("data-character-id", companion.identity.residentId);
    await expect(activeRecord).toContainText(companion.identity.name);
    await expect(activeRecord).toContainText(companion.destination.name);
    await expect(activeRecord).toContainText(`joined T${companion.joinedTick}`);
    await expect(activeRecord).toContainText(`${companion.victories} victories together`);
    await expect(activeRecord).toContainText(`HP ${companion.resources.health}/${companion.combat.maxHealth}`);
    await expect(activeRecord).toContainText(`Bond ${companion.bond}/100`);
    const currentDetails = activeRecord.locator("details");
    await expect(currentDetails).toHaveJSProperty("open", false);
    await currentDetails.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    await expect(currentDetails.locator("small").filter({ hasText: `joined T${companion.joinedTick}` })).toBeVisible();
    await expect(currentDetails).toContainText("Bond records shared travel and victories, not a private feeling.");
    await page.keyboard.press("Enter");
    await expect(currentDetails).toHaveJSProperty("open", false);
    for (const [id, resource, value, max] of [
      ["company-health", "health", companion.resources.health, companion.combat.maxHealth],
      ["company-bond", "bond", companion.bond, 100],
    ] as const) {
      const meter = page.locator(`#${id}`);
      await expect(meter).toBeVisible();
      await expect(meter).toHaveAttribute("aria-label", `${companion.identity.name} ${resource} ${value} of ${max}`);
      expect(await meter.evaluate((bar) => ({
        value: (bar as HTMLProgressElement).value, max: (bar as HTMLProgressElement).max,
      }))).toEqual({ value, max });
    }
    const meterFills = await page.evaluate(() => {
      // Chromium returns the host track for getComputedStyle's WebKit progress
      // pseudo argument. Check supported computed colors and the loaded fill
      // rule instead; the screenshots also show the actual rendered meters.
      const bondFillRules = [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules])
        .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule
          && rule.selectorText === "#company-bond::-webkit-progress-value")
        .map((rule) => rule.style.backgroundImage);
      return {
        healthColor: getComputedStyle(document.getElementById("company-health")!).color,
        bondColor: getComputedStyle(document.getElementById("company-bond")!).color,
        bondFillRules,
      };
    });
    await testInfo.attach("Company computed meter fills", {
      body: JSON.stringify(meterFills), contentType: "application/json",
    });
    expect(meterFills.healthColor).toBe("rgb(239, 111, 108)");
    expect(meterFills.bondColor).toBe("rgb(133, 187, 170)");
    expect(meterFills.bondFillRules).toContain("linear-gradient(90deg, rgb(75, 136, 117), rgb(133, 187, 170))");
    await expect(companionHistory).toHaveJSProperty("open", false);
    await expect(page.locator("#journal-mentor-history")).toHaveJSProperty("open", false);
    const formerRecord = page.locator("#journal-companion-former .journal-companion-record");
    await expect(formerRecord).toHaveCount(1);
    await expect(formerRecord).toBeHidden();
    await companionHistory.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    await expect(companionHistory).toHaveJSProperty("open", true);
    await expect(formerRecord).toBeVisible();
    await expect(formerRecord).toHaveAttribute("data-companion-id", former.identity.residentId);
    await expect(formerRecord).toHaveAttribute("data-outcome", former.departure.outcome);
    await expect(formerRecord).toContainText(former.identity.name);
    await expect(formerRecord).toContainText(`Oath fulfilled at ${former.destination.name}`);
    await expect(formerRecord).toContainText(`${former.victories} victories together · bond ${former.bond}`);
    await expect(formerRecord).toContainText(`T${former.joinedTick}–T${former.departure.tick}`);

    await toolbar.locator('[data-view="map"]').click();
    await expect(page.locator("#map-party")).toHaveText(`Party of two with ${companion.identity.name}, travelling.`);
    await expect(page.locator("#map-party")).toHaveAttribute("data-formation", "paired");
    await expect(page.locator("#map-party")).toHaveAttribute("data-companion-id", companion.identity.residentId);
    await expect(page.locator("#stage")).toHaveAttribute("data-atlas-party-size", "2");
    await expect(page.locator("#stage")).toHaveAttribute("data-atlas-party-formation", "paired");
    await expect(page.locator("#stage")).toHaveAttribute("data-atlas-party-companion", companion.identity.residentId);
    await expect(page.locator("#map-party")).not.toContainText(former.identity.name);
    await toolbar.locator('[data-view="journal"]').click();
    await expect(companyButton).toHaveAttribute("aria-pressed", "true");
    await expect(companionHistory).toHaveJSProperty("open", true);
    await expect(activeRecord).toBeVisible();
    await expect(formerRecord).toBeVisible();
    await page.locator("#journal-adventure-button").click();
    await expect(activeRecord).toBeHidden();
    await expect(formerRecord).toBeHidden();
    await companyButton.focus();
    await page.keyboard.press("Enter");
    await expect(companionHistory).toHaveJSProperty("open", true);
    await expect(formerRecord).toBeVisible();
  }
  await verifyVisibleHistory();
  expect(await savedCampaign(page, fixture.campaignId)).toBe(saved);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    if (document.documentElement.dataset.ready !== "true") return false;
    const app = document.querySelector<HTMLElement>("#app")!;
    if (app.dataset.presentationPaused !== "true") document.querySelector<HTMLButtonElement>("#pause-button")!.click();
    return app.dataset.presentationPaused === "true";
  }, undefined, { polling: 20, timeout: 20_000 });
  await verifyVisibleHistory();
  expect(JSON.parse(await savedCampaign(page, fixture.campaignId))).toEqual(joined);

  for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    for (const view of ["watch", "journal"] as const) {
      await toolbar.locator(`[data-view="${view}"]`).click();
      const content = page.locator(view === "watch" ? "#stage-focus-ribbon" : ".journal-companions");
      await content.scrollIntoViewIfNeeded();
      if (view === "journal") {
        await expect(companyButton).toHaveAttribute("aria-pressed", "true");
        await expect(companionHistory).toHaveJSProperty("open", true);
        await expect(page.locator("#company-health, #company-bond")).toHaveCount(2);
      }
      const bounds = await content.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      if (process.env.TG2_VISUAL_CAPTURE === "1") {
        const label = view === "journal" ? "company" : view;
        const path = testInfo.outputPath(`recurring-companions-${label}-${viewport.width}.png`);
        await page.screenshot({ path, timeout: 8_000 });
        await testInfo.attach(`Recurring companions ${label} at ${viewport.width}px`, { path, contentType: "image/png" });
      }
    }
  }
  await expect(page.locator("#app")).toHaveAttribute("data-play-mode", "deterministic");
  await expect(page.locator("#app")).toHaveAttribute("data-creative-story-state", "off");
  expect(JSON.parse(await savedCampaign(page, fixture.campaignId))).toEqual(joined);

  // All save-immutability checks and captures above were paused. This separate
  // phase intentionally allows one real automatic step to refresh Company.
  await toolbar.locator('[data-view="journal"]').click();
  await companyButton.click();
  const liveDetails = page.locator("#journal-companion-active details");
  const liveSummary = liveDetails.locator(":scope > summary");
  await expect(liveDetails).toHaveJSProperty("open", false);
  await liveSummary.focus();
  await page.keyboard.press("Enter");
  await expect(liveDetails).toHaveJSProperty("open", true);
  const oldSummary = await liveSummary.elementHandle();
  expect(oldSummary).not.toBeNull();
  // Resume and focus in the same browser task, before the worker can reply.
  await liveSummary.evaluate((summary) => {
    document.querySelector<HTMLButtonElement>("#pause-button")!.click();
    (summary as HTMLElement).focus();
  });
  await page.waitForFunction(({ id, tick }) => {
    const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
    return raw !== null && JSON.parse(raw).tick > tick;
  }, { id: fixture.campaignId, tick: joined.tick }, { polling: 20, timeout: 15_000 });
  await expect.poll(() => oldSummary!.evaluate((summary) => summary.isConnected)).toBe(false);
  await expect(liveSummary).toBeFocused();
  await expect(liveDetails).toHaveJSProperty("open", true);
  await page.locator("#pause-button").click();
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  const refreshed = JSON.parse(await savedCampaign(page, fixture.campaignId)) as WorldState;
  expect(refreshed.tick).toBe(joined.tick + 1);
  expect(refreshed.depth.companions.active[0]?.identity).toEqual(companion.identity);
  expect(refreshed.depth.companions.former).toEqual(joined.depth.companions.former);
  expect(inference).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});
