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

test("a later automatic road oath shows a distinct companion and retains the first journey across reload", async ({ page }, testInfo) => {
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
    const activeRecord = page.locator("#journal-companion-active .journal-companion-record");
    await expect(activeRecord).toHaveCount(1);
    await expect(activeRecord).toHaveAttribute("data-companion-id", companion.identity.residentId);
    await expect(activeRecord).toContainText(companion.identity.name);
    await expect(activeRecord).toContainText(companion.destination.name);
    await expect(activeRecord).toContainText(`joined T${companion.joinedTick}`);
    const formerRecord = page.locator("#journal-companion-former .journal-companion-record");
    await expect(formerRecord).toHaveCount(1);
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

  for (const view of ["watch", "journal"] as const) {
    await toolbar.locator(`[data-view="${view}"]`).click();
    const content = page.locator(view === "watch" ? "#stage-focus-ribbon" : ".journal-companions");
    await content.scrollIntoViewIfNeeded();
    const bounds = await content.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    if (process.env.TG2_VISUAL_CAPTURE === "1") {
      const path = testInfo.outputPath(`recurring-companions-${view}-320.png`);
      await page.screenshot({ path, timeout: 8_000 });
      await testInfo.attach(`Recurring companions ${view} at 320px`, { path, contentType: "image/png" });
    }
  }
  await expect(page.locator("#app")).toHaveAttribute("data-play-mode", "deterministic");
  await expect(page.locator("#app")).toHaveAttribute("data-creative-story-state", "off");
  expect(JSON.parse(await savedCampaign(page, fixture.campaignId))).toEqual(joined);
  expect(inference).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});
