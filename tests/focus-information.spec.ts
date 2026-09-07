import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, createWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { stepDepth } from "../src/depth/state";
import type { DepthState } from "../src/depth/types";

const focusPreferenceKey = "the-grind-2:stage-focus:v1";
const modelRequest = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;

function encounterWorld(base: WorldState, depth: DepthState): WorldState {
  const started = upgradeWorldState({ ...base, tick: depth.tick, depth,
    hero: { ...base.hero, health: depth.hero.resources.health },
    scene: { ...base.scene, mode: "battle", headline: "A roadside encounter begins.",
      action: "The participants prepare a legal exchange.", consequence: "No final outcome has resolved.", sensoryIntensity: 3 },
    lifecycle: { ...base.lifecycle, simulationTick: depth.tick, worldClockMinutes: depth.tick * 15 },
  });
  // The displayed action and its Chronicle source come from an actual world reducer step.
  return upgradeWorldState(advanceWorld(started));
}

function battleFixture(): WorldState {
  const base = createWorld("browser-focus-information-combat", "campaign:focus-information-combat");
  const destinationId = base.depth.atlas.edges.find((edge) => edge.from === base.depth.atlas.currentLocationId)?.to
    ?? base.depth.atlas.edges.find((edge) => edge.to === base.depth.atlas.currentLocationId)?.from;
  if (destinationId === undefined) throw new Error("Focus battle fixture has no legal road");
  const routed = stepDepth(base.depth, { type: "plan-route", destinationId });
  if (routed.atlas.route === null) throw new Error("Focus battle fixture has no route");
  const depth = stepDepth(routed, { type: "start-combat", enemyCount: 3,
    encounterId: `encounter:route:${routed.atlas.route.path.join(">")}` });
  const world = encounterWorld(base, depth);
  if (world.depth.combat?.outcome !== "ongoing" || world.scene.mode !== "battle") {
    throw new Error("Focus battle fixture must retain an active canonical battle");
  }
  return world;
}

function duelFixture(): WorldState {
  const base = createWorld("browser-focus-information-duel", "campaign:focus-information-duel");
  const depth = stepDepth(base.depth, { type: "start-counter-duel", encounterId: "encounter:focus-information-duel" });
  const world = encounterWorld(base, depth);
  if (world.depth.counterDuel?.outcome !== "ongoing" || world.scene.mode !== "battle") {
    throw new Error("Focus duel fixture must retain an active canonical exchange");
  }
  return world;
}

async function pauseReadyPage(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await expect(page.locator("#app")).toHaveAttribute("data-play-mode", "deterministic");
  const focus = await page.locator("#app").getAttribute("data-chrome-mode") === "focus";
  await page.locator(focus ? "#stage-pause-button" : "#pause-button").click();
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "true");
}

async function stableEncounter(page: Page, campaignId: string) {
  return page.evaluate((id) => {
    const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
    if (raw === null) throw new Error("Canonical campaign mirror is unavailable");
    const world = JSON.parse(raw) as { tick: number; scene: { eventId?: string }; depth: { hero: { resources: unknown } } };
    const stage = document.querySelector<HTMLElement>("#stage");
    if (stage === null) throw new Error("Actual renderer host is missing");
    const fields = ["combatId", "combatEvent", "combatTurn", "combatHealthDelta", "combatRoster", "combatRosterStatuses",
      "combatActiveUnit", "combatActor", "combatTarget", "counterDuelId", "counterDuelRound", "counterDuelScore",
      "counterDuelPhase", "counterDuelHeroStance", "counterDuelOpponentStance", "counterDuelResult"];
    return { tick: world.tick, resources: world.depth.hero.resources,
      metadata: Object.fromEntries(fields.map((field) => [field, stage.dataset[field] ?? null])) };
  }, campaignId);
}

test("Focus hides battle and Pattern Duel information without changing paused encounters", async ({ context }, testInfo) => {
  test.setTimeout(150_000);
  const requests: string[] = [];
  const modelWorkers: string[] = [];
  const errors: string[] = [];
  context.on("request", (request) => { if (modelRequest.test(request.url())) requests.push(request.url()); });

  for (const [kind, world] of [["battle", battleFixture()], ["duel", duelFixture()]] as const) {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("worker", (worker) => { if (modelRequest.test(worker.url())) modelWorkers.push(worker.url()); });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(({ saved, preferenceKey }) => {
      const key = `the-grind-2:campaign:${saved.campaignId}`;
      if (sessionStorage.getItem(key) !== null) return;
      sessionStorage.setItem(key, JSON.stringify(saved));
      sessionStorage.setItem("the-grind-2:activeCampaignId", saved.campaignId);
      localStorage.setItem(`the-grind-2:last-active:${saved.campaignId}`, String(Date.now() + 3_600_000));
      localStorage.setItem("the-grind-2:play-mode:v1", '{"schemaVersion":1,"mode":"deterministic"}');
      localStorage.setItem("the-grind-2:adventure-speed:v1", '{"schemaVersion":1,"speed":1}');
      localStorage.setItem(preferenceKey, "panels");
    }, { saved: world, preferenceKey: focusPreferenceKey });
    try {
      await page.goto("./", { timeout: 25_000 });
      await pauseReadyPage(page);
      const app = page.locator("#app");
      const stage = page.locator("#stage");
      const button = page.locator("#stage-focus-button");
      const originalButton = await button.elementHandle();
      if (originalButton === null) throw new Error("Top-level Focus button is missing");
      await expect(stage).toHaveAttribute("data-encounter-engine", kind === "battle" ? "rpg-combat" : "counter-triangle");
      await expect(app).toHaveAttribute("data-watch-layout", "portraits");
      await expect(stage).toHaveAttribute("data-stage-information-visibility", "hidden");
      const groupCount = Number(await stage.getAttribute("data-stage-information-group-count"));
      expect(groupCount).toBeGreaterThanOrEqual(kind === "battle" ? 1 : 5);
      expect(groupCount).toBeLessThanOrEqual(kind === "battle" ? 1 : 7);
      await expect(stage).toHaveAttribute("data-stage-information-visible-group-count", "0");
      await expect(page.locator("#topbar-controls > #stage-focus-button")).toBeVisible();
      await expect(page.locator("#stage-focus-ribbon")).toBeVisible();
      await expect(page.locator("#hero-hud")).toBeHidden();
      await expect(button).toHaveAttribute("aria-pressed", "false");
      const before = await stableEncounter(page, world.campaignId);
      if (kind === "battle") {
        const roster = JSON.parse(before.metadata.combatRoster ?? "null") as { id: string; health: number; maxHealth: number }[];
        expect(roster).toHaveLength(world.depth.combat!.combatants.length);
        for (const unit of world.depth.combat!.combatants) {
          expect(roster.find((row) => row.id === unit.id)).toMatchObject({ health: unit.health, maxHealth: unit.maxHealth });
        }
        expect(before.metadata.combatEvent).toBeTruthy();
      } else {
        expect(before.metadata.counterDuelId).toBe(world.depth.counterDuel!.id);
        expect(before.metadata.counterDuelScore).toBe(`${world.depth.counterDuel!.heroScore}-${world.depth.counterDuel!.opponentScore}`);
      }

      await button.focus();
      await page.keyboard.press("Enter");
      await expect(app).toHaveAttribute("data-chrome-mode", "focus");
      await expect(page.locator("#stage-focus-controls > #stage-focus-button")).toBeVisible();
      await expect(button).toBeFocused();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      expect(await originalButton.evaluate((node) => node === document.querySelector("#stage-focus-button"))).toBe(true);
      expect(await page.evaluate((key) => localStorage.getItem(key), focusPreferenceKey)).toBe("focus");

      for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
        await page.setViewportSize(viewport);
        await expect(stage).toHaveAttribute("data-stage-information-visibility", "hidden");
        await expect(stage).toHaveAttribute("data-stage-information-group-count", String(groupCount));
        await expect(stage).toHaveAttribute("data-stage-information-visible-group-count", "0");
        await expect(page.locator("#stage canvas")).toBeVisible();
        await expect(page.locator(".hero-hud")).toBeHidden();
        await expect(page.locator("#topbar")).toBeHidden();
        await expect(page.locator("#view-toolbar")).toBeHidden();
        await expect(page.locator("#game-menu")).toBeHidden();
        await expect(page.locator("#adventure-view")).toBeHidden();
        await expect(page.locator("#stage-focus-ribbon")).toBeVisible();
        expect(await page.locator("#chronicle-live").evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width <= 1 && rect.height <= 1
            && node.getAttribute("aria-live") === "polite" && node.getAttribute("aria-atomic") === "true";
        })).toBe(true);
        expect(await stableEncounter(page, world.campaignId)).toEqual(before);
        await expect(app).toHaveAttribute("data-presentation-paused", "true");
        const capture = testInfo.outputPath(`focus-information-${kind}-${viewport.width}x${viewport.height}.png`);
        await page.screenshot({ path: capture, fullPage: true });
        await testInfo.attach(`${kind} Focus ${viewport.width}`, { path: capture, contentType: "image/png" });
      }

      await button.focus();
      await page.keyboard.press("Space");
      await expect(app).toHaveAttribute("data-chrome-mode", "panels");
      await expect(page.locator("#topbar-controls > #stage-focus-button")).toBeVisible();
      await expect(button).toBeFocused();
      await expect(button).toHaveAttribute("aria-pressed", "false");
      await expect(stage).toHaveAttribute("data-stage-information-visibility", "hidden");
      await expect(stage).toHaveAttribute("data-stage-information-visible-group-count", "0");
      expect(await originalButton.evaluate((node) => node === document.querySelector("#stage-focus-button"))).toBe(true);
      expect(await stableEncounter(page, world.campaignId)).toEqual(before);
      expect(await page.evaluate((key) => localStorage.getItem(key), focusPreferenceKey)).toBe("panels");

      await page.keyboard.press("Enter");
      await expect(app).toHaveAttribute("data-chrome-mode", "focus");
      if (kind === "battle") {
        await page.locator("#watch-character-details").focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#adventure-view")).toBeVisible();
        await expect(page.locator('.view-button[data-view="adventure"]')).toBeFocused();
        const inventory = page.locator('.view-button[data-view="inventory"]');
        await inventory.evaluate((node) => node.scrollIntoView({ block: "center" }));
        await inventory.focus();
        await page.keyboard.press("Enter");
        await expect(app).toHaveAttribute("data-active-view", "inventory");
        await expect(page.locator("#topbar-controls > #stage-focus-button")).toBeVisible();
        await button.evaluate((node) => node.scrollIntoView({ block: "center" }));
        await button.focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#inspection-screen")).toBeHidden();
        await expect(app).toHaveAttribute("data-active-view", "watch");
        await expect(button).toBeFocused();
        await expect(page.locator("#spectator-inbox")).toBeHidden();
        expect(await stableEncounter(page, world.campaignId)).toEqual(before);
      }
      await expect(app).toHaveAttribute("data-chrome-mode", "focus");
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("#stage-focus-controls > #stage-focus-button")).toBeVisible();
      await expect(stage).toHaveAttribute("data-stage-information-visibility", "hidden");
      await expect(stage).toHaveAttribute("data-stage-information-visible-group-count", "0");
      expect(await page.evaluate((key) => localStorage.getItem(key), focusPreferenceKey)).toBe("focus");
    } finally {
      await page.close();
    }
  }
  expect(requests).toEqual([]);
  expect(modelWorkers).toEqual([]);
  expect(errors).toEqual([]);
});
