import { expect, test } from "@playwright/test";
import { upgradeWorldState } from "../src/core/simulation";
import { readFileSync } from "node:fs";

const appVersion = (JSON.parse(readFileSync(new URL("../public/version.json", import.meta.url), "utf8")) as { version: string }).version;

test("plays, pauses, creates, and reloads an autonomous campaign", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("./?fast");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", {
    timeout: 15_000,
  });
  await expect(page.locator("canvas")).toBeVisible();
  const app = page.locator("#app");
  await expect(page.locator("#hero-name")).not.toHaveText("Generating hero…");
  await expect(page.locator("#hero-health-text")).not.toHaveText("—");
  await expect(page.locator("#hero-xp-text")).not.toHaveText("—");
  await expect(page.locator("#quest-title")).not.toHaveText("Awaiting a calling…");
  await expect(page.locator("#quest-objectives li")).not.toHaveCount(0);
  await expect(page.locator("#equipment-list li")).toHaveCount(6);
  await expect(page.locator("#gear-summary")).not.toHaveText("Weapon and armor pending…");
  await expect(page.locator("#ability-summary")).not.toHaveText("Abilities awakening…");
  await expect(page.locator("#ability-list li")).toHaveCount(2);
  await expect(page.locator("#ability-list progress")).toHaveCount(2);
  await expect(page.locator("#equipment-list li[data-rarity=\"common\"]")).not.toHaveCount(0);
  await expect(page.locator("#event-log li")).not.toHaveCount(0);
  const traversalDirective = page.locator("#traversal-directive");
  await expect(traversalDirective).not.toBeEmpty();
  await expect(traversalDirective).toHaveAttribute(
    "data-reason",
    /^(planning|explore-unseen|avoid-immediate-reverse|only-open-road|least-recent)$/,
  );
  await expect(page.locator("#stage")).toHaveAttribute("data-scene-layout", /.+/);
  const firstCampaign = await page.locator("#campaign-select").inputValue();
  const decision = page.locator("#scene-decision");
  await expect(decision).not.toBeEmpty();
  await expect(decision).toHaveAttribute("data-command-id", /.+:depth:\d+:.+/);
  await expect(decision).toHaveAttribute("data-profile-id", /^(road|ordinaryCombat|direCombat)$/);
  await expect(decision).toHaveAttribute("data-rule-id", /.+/);
  await expect(decision).toHaveAttribute("data-reason-code", /.+/);
  await expect(decision).toContainText("→");
  const firstCommandId = await decision.getAttribute("data-command-id");
  await expect(decision).not.toHaveAttribute("data-command-id", firstCommandId ?? "pending", {
    timeout: 15_000,
  });

  await page.locator("#pause-button").click({ force: true });
  await expect(app).toHaveAttribute("data-presentation-paused", "true");
  const pausedScene = await page.locator("#scene-headline").innerText();
  await page.waitForTimeout(600);
  await expect(page.locator("#scene-headline")).toHaveText(pausedScene);
  await page.locator("#pause-button").press("Enter");

  await page.locator("#new-button").click({ force: true });
  await expect(page.locator("#campaign-select")).not.toHaveValue(firstCampaign, {
    timeout: 15_000,
  });
  const secondHero = await page.locator("#hero-name").innerText();
  const secondCampaign = await page.locator("#campaign-select").inputValue();
  await expect(page.locator("#campaign-select option")).toHaveCount(2);

  await page.setViewportSize({ width: 375, height: 667 });
  await expect(page.locator("#stage")).toHaveAttribute(
    "data-scene-layout",
    "1.1719,0.0000,228.0313",
  );
  await expect(traversalDirective).toBeVisible();
  const mobileLayout = await page.evaluate(() => ({
    directiveBottom: document.querySelector("#traversal-directive")?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
    chronicleTop: document.querySelector(".chronicle")?.getBoundingClientRect().top ?? 0,
  }));
  expect(mobileLayout.directiveBottom).toBeLessThan(mobileLayout.chronicleTop);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", {
    timeout: 15_000,
  });
  await expect(page.locator("#hero-name")).toHaveText(secondHero);
  await expect(page.locator("#campaign-select")).toHaveValue(secondCampaign);
  await expect(page.locator("canvas")).toBeVisible();
  const savedLifecycle = await page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    if (campaignId === null) return undefined;
    const source = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    if (source === null) return undefined;
    const saved = JSON.parse(source) as {
      schemaVersion: number;
      tick: number;
      lifecycle: { policyVersion: number; simulationTick: number };
      forwardMotion: { recentLocationIds: string[]; recentLegs: unknown[]; decisionsSinceProgress: number };
      depth: {
        schemaVersion: number;
        atlas: { locations: unknown[] };
        towns: Record<string, unknown>;
        hero: { inventory: unknown[] };
        quest: { objectives: unknown[]; subquests: unknown[] };
      };
    };
    return {
      schemaVersion: saved.schemaVersion,
      tick: saved.tick,
      policyVersion: saved.lifecycle.policyVersion,
      simulationTick: saved.lifecycle.simulationTick,
      recentLocations: saved.forwardMotion.recentLocationIds.length,
      recentLegs: saved.forwardMotion.recentLegs.length,
      decisionsSinceProgress: saved.forwardMotion.decisionsSinceProgress,
      depthSchemaVersion: saved.depth.schemaVersion,
      atlasLocations: saved.depth.atlas.locations.length,
      towns: Object.keys(saved.depth.towns).length,
      inventoryItems: saved.depth.hero.inventory.length,
      questObjectives: saved.depth.quest.objectives.length,
      subquests: saved.depth.quest.subquests.length,
    };
  });
  expect(savedLifecycle).toMatchObject({
    schemaVersion: 5,
    policyVersion: 2,
    depthSchemaVersion: 4,
  });
  expect(savedLifecycle?.simulationTick).toBe(savedLifecycle?.tick);
  expect(savedLifecycle?.recentLocations).toBeGreaterThanOrEqual(1);
  expect(savedLifecycle?.recentLocations).toBeLessThanOrEqual(8);
  expect(savedLifecycle?.recentLegs).toBeLessThanOrEqual(8);
  expect(savedLifecycle?.decisionsSinceProgress).toBeLessThanOrEqual(8);
  expect(savedLifecycle?.atlasLocations).toBeGreaterThanOrEqual(4);
  expect(savedLifecycle?.towns).toBeGreaterThanOrEqual(1);
  expect(savedLifecycle?.inventoryItems).toBeGreaterThanOrEqual(2);
  expect(savedLifecycle?.questObjectives).toBeGreaterThanOrEqual(1);
  expect(savedLifecycle?.subquests).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("stages resolved combat actors and targets without motion when requested", async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?fast");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", {
    timeout: 15_000,
  });
  const stage = page.locator("#stage");
  await expect(stage).toHaveAttribute("data-reduced-motion", "true");
  await page.waitForFunction(() => {
    const stageElement = document.querySelector<HTMLElement>("#stage");
    const pauseButton = document.querySelector<HTMLButtonElement>("#pause-button");
    if (stageElement?.dataset.combatEvent === undefined || pauseButton === null) return false;
    pauseButton.click();
    return pauseButton.textContent === "Resume" && stageElement.dataset.combatEvent !== undefined;
  }, undefined, { timeout: 60_000 });
  const frozen = await stage.evaluate((element) => ({
    event: element.dataset.combatEvent,
    actor: element.dataset.combatActor,
    target: element.dataset.combatTarget,
    action: element.dataset.combatAction,
    phase: element.dataset.combatPhase,
  }));
  expect(frozen.event).toBeTruthy();
  expect(frozen.actor).toBeTruthy();
  expect(frozen.target).toBeTruthy();
  expect(["attack", "ability", "guard"]).toContain(frozen.action);
  expect(frozen.phase).toBeTruthy();
  await page.waitForTimeout(350);
  await expect(stage).toHaveAttribute("data-combat-event", frozen.event ?? "");
  await expect(stage).toHaveAttribute("data-combat-phase", frozen.phase ?? "");
  await expect(page.locator("#scene-action")).not.toBeEmpty();
  await expect(page.locator("#scene-consequence")).toContainText(/Next:|battle ends/);
});

test("renders one canonical travel corridor consistently across desktop and portrait", async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?fast");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
  const stage = page.locator("#stage");
  await expect(stage).toHaveAttribute("data-scene-mode", "travel", { timeout: 60_000 });
  await page.locator("#pause-button").click({ force: true });
  await expect(stage).toHaveAttribute("data-travel-edge", /.+/);
  await expect(stage).toHaveAttribute("data-travel-direction", /.+:.+/);
  await expect(stage).toHaveAttribute("data-travel-biome", /^(ocean|coast|grassland|forest|rainforest|desert|tundra|mountain|snow|marsh)$/);
  await expect(stage).toHaveAttribute("data-travel-terrain", /^(road|trail|pass|river)$/);
  await expect(stage).toHaveAttribute("data-travel-slope", /^(ascending|level|descending)$/);
  await expect(stage).toHaveAttribute("data-travel-crossing", /^(none|ahead|crossing|behind)$/);
  const snapshot = await stage.evaluate((element) => ({ ...element.dataset }));
  const traversal = page.locator("#traversal-progress-text");
  await expect(traversal).toHaveAttribute("data-biome", snapshot.travelBiome ?? "missing");
  await expect(traversal).toHaveAttribute("data-terrain", snapshot.travelTerrain ?? "missing");
  await expect(traversal).toHaveAttribute("data-slope", snapshot.travelSlope ?? "missing");
  await expect(traversal).toContainText("left");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(stage).toHaveAttribute("data-travel-edge", snapshot.travelEdge ?? "missing");
  await expect(stage).toHaveAttribute("data-travel-progress", snapshot.travelProgress ?? "missing");
  await expect(stage).toHaveAttribute("data-reduced-motion", "true");
  await expect(traversal).toBeVisible();
});

test("opens read-only map inventory journal codex and spellbook views while autoplay continues", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./?fast");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
  const app = page.locator("#app");
  const stage = page.locator("#stage");
  const toolbar = page.locator("#view-toolbar");
  const watch = toolbar.locator("[data-view=watch]");
  const map = toolbar.locator("[data-view=map]");
  const inventory = toolbar.locator("[data-view=inventory]");
  const journal = toolbar.locator("[data-view=journal]");
  const codex = toolbar.locator("[data-view=codex]");
  const spellbook = toolbar.locator("[data-view=spellbook]");
  await expect(app).toHaveAttribute("data-active-view", "watch");
  await expect(stage).toHaveAttribute("data-view-mode", "live");
  await expect(toolbar.locator("[tabindex=\"0\"]")).toHaveCount(1);
  await expect(watch).toHaveAttribute("aria-pressed", "true");

  await codex.click();
  await expect(app).toHaveAttribute("data-active-view", "codex");
  await expect(codex).toBeFocused();
  await expect(page.locator("#codex-grid .codex-monster")).not.toHaveCount(0, { timeout: 60_000 });
  await expect(codex).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(watch).toBeFocused();

  await page.locator("#pause-button").click({ force: true });
  await expect(app).toHaveAttribute("data-presentation-paused", "true");
  await page.waitForTimeout(350);
  const savedBeforeViews = await page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    return campaignId === null ? null : sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
  });
  expect(savedBeforeViews).not.toBeNull();
  const saved = JSON.parse(savedBeforeViews ?? "{}") as {
    depth: {
      hero: {
        inventory: unknown[];
        abilities: {
          id: string;
          name: string;
          kind: "spell" | "technique" | "secret";
          effect: string;
          level: number;
          experience: number;
          uses: number;
          manaCost: number;
          potency: number;
        }[];
        monsterLore: {
          monsterId: string;
          secretTechniqueId: string;
          secretTechniqueName: string;
          learned: boolean;
        }[];
      };
      quest: { subquests: unknown[] };
    };
  };

  await watch.focus();
  await watch.press("ArrowRight");
  await expect(map).toBeFocused();
  await expect(map).toHaveAttribute("aria-pressed", "false");
  await map.press("Enter");
  await expect(app).toHaveAttribute("data-active-view", "map");
  await expect(stage).toHaveAttribute("data-view-mode", "map");
  await expect(stage).toHaveAttribute("data-scene-mode", "atlas");
  await expect(page.locator("#map-inspector")).toBeVisible();
  await expect(page.locator("#map-discovery")).toContainText("mapped sites reached");
  const mapHeroActivity = page.locator("#map-hero-activity");
  await expect(mapHeroActivity).toBeVisible();
  await expect(mapHeroActivity).toHaveAttribute("data-view", "map");
  await expect(mapHeroActivity).toHaveAttribute("data-live-scene-mode", /.+/);
  await expect(mapHeroActivity.locator("[data-activity-field=label]")).not.toBeEmpty();
  await expect(mapHeroActivity.locator(".hero-puppet-shell")).toHaveCSS("animation-play-state", "paused");

  await map.press("ArrowRight");
  await expect(inventory).toBeFocused();
  await inventory.press("Enter");
  await expect(app).toHaveAttribute("data-active-view", "inventory");
  await expect(page.locator("#inventory-view")).toBeVisible();
  await expect(page.locator("#journal-view")).toBeHidden();
  await expect(page.locator("#inventory-grid .inventory-item")).toHaveCount(saved.depth.hero.inventory.length);
  await expect(page.locator("#inventory-grid button, #inventory-grid input, #inventory-grid select")).toHaveCount(0);
  const screenHeroActivity = page.locator("#screen-hero-activity");
  await expect(screenHeroActivity).toBeVisible();
  await expect(screenHeroActivity).toHaveAttribute("data-view", "inventory");
  await expect(screenHeroActivity).toHaveAttribute("data-subject-id", /.+/);

  await journal.click();
  await expect(app).toHaveAttribute("data-active-view", "journal");
  await expect(page.locator("#journal-view")).toBeVisible();
  await expect(page.locator("#inventory-view")).toBeHidden();
  await expect(page.locator("#journal-quest-list .journal-quest")).toHaveCount(1 + saved.depth.quest.subquests.length);
  await expect(page.locator(".journal-history h2")).toHaveText("Recent Chronicle");
  await expect(screenHeroActivity).toHaveAttribute("data-view", "journal");

  await journal.press("ArrowRight");
  await expect(codex).toBeFocused();
  await codex.press("Enter");
  await expect(app).toHaveAttribute("data-active-view", "codex");
  await expect(page.locator("#codex-view")).toBeVisible();
  await expect(page.locator("#journal-view")).toBeHidden();
  await expect(page.locator("#inventory-view")).toBeHidden();
  await expect(page.locator("#inspection-title")).toHaveText("Monster Codex");
  await expect(page.locator("#codex-grid .codex-monster")).toHaveCount(saved.depth.hero.monsterLore.length);
  await expect(page.locator("#codex-grid button, #codex-grid input, #codex-grid select")).toHaveCount(0);
  await expect(screenHeroActivity).toHaveAttribute("data-view", "codex");
  for (const lore of saved.depth.hero.monsterLore.filter((entry) => !entry.learned)) {
    const dossier = page.locator(`#codex-grid [data-monster-id="${lore.monsterId}"]`);
    await expect(dossier).not.toContainText(lore.secretTechniqueName);
    const markup = await dossier.evaluate((element) => element.outerHTML);
    expect(markup).not.toContain(lore.secretTechniqueId);
    expect(markup).not.toContain(lore.secretTechniqueName);
  }
  await codex.press("ArrowRight");
  await expect(spellbook).toBeFocused();
  await spellbook.press("Enter");
  await expect(app).toHaveAttribute("data-active-view", "spellbook");
  await expect(page.locator("#spellbook-view")).toBeVisible();
  await expect(page.locator("#codex-view")).toBeHidden();
  await expect(page.locator("#inspection-title")).toHaveText("Spellbook & Mastery");
  await expect(page.locator("#spellbook-grid .spellbook-ability")).toHaveCount(saved.depth.hero.abilities.length);
  await expect(page.locator("#spellbook-grid button, #spellbook-grid input, #spellbook-grid select")).toHaveCount(0);
  await expect(screenHeroActivity).toHaveAttribute("data-view", "spellbook");
  for (const ability of saved.depth.hero.abilities) {
    const card = page.locator(`#spellbook-grid [data-ability-id="${ability.id}"]`);
    await expect(card).toContainText(ability.name);
    await expect(card).toContainText(String(ability.level));
    await expect(card).toContainText(String(ability.uses));
    await expect(card).toContainText(String(ability.manaCost));
    await expect(card).toContainText(String(ability.potency));
  }
  const spellbookMarkup = await page.locator("#spellbook-view").evaluate((element) => element.outerHTML);
  for (const lore of saved.depth.hero.monsterLore.filter((entry) => !entry.learned)) {
    expect(spellbookMarkup).not.toContain(lore.secretTechniqueId);
    expect(spellbookMarkup).not.toContain(lore.secretTechniqueName);
  }
  await spellbook.press("ArrowRight");
  await expect(watch).toBeFocused();
  await watch.press("ArrowLeft");
  await expect(spellbook).toBeFocused();
  const savedAfterViews = await page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    return campaignId === null ? null : sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
  });
  expect(savedAfterViews).toBe(savedBeforeViews);

  await page.keyboard.press("Escape");
  await expect(app).toHaveAttribute("data-active-view", "watch");
  await expect(watch).toBeFocused();
  await expect(stage).toHaveAttribute("data-view-mode", "live");

  await page.locator("#pause-button").click({ force: true });
  await expect(app).toHaveAttribute("data-presentation-paused", "false");
  await spellbook.click();
  const commandId = await page.locator("#scene-decision").getAttribute("data-command-id");
  const activityTick = await screenHeroActivity.getAttribute("data-activity-tick");
  await expect(page.locator("#scene-decision")).not.toHaveAttribute("data-command-id", commandId ?? "pending", { timeout: 15_000 });
  await expect(screenHeroActivity).not.toHaveAttribute("data-activity-tick", activityTick ?? "pending", { timeout: 15_000 });
  await expect(app).toHaveAttribute("data-runtime-status", "running");
  await expect(app).toHaveAttribute("data-active-view", "spellbook");
  await expect(spellbook).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLayout = await page.evaluate(() => {
    const toolbarBounds = document.querySelector("#view-toolbar")?.getBoundingClientRect();
    const buttons = [...document.querySelectorAll<HTMLElement>(".view-button")];
    const buttonBounds = buttons.map((button) => button.getBoundingClientRect());
    return {
      toolbarLeft: toolbarBounds?.left ?? 0,
      toolbarRight: toolbarBounds?.right ?? Number.POSITIVE_INFINITY,
      toolbarScrollWidth: document.querySelector<HTMLElement>("#view-toolbar")?.scrollWidth ?? Number.POSITIVE_INFINITY,
      toolbarClientWidth: document.querySelector<HTMLElement>("#view-toolbar")?.clientWidth ?? 0,
      minimumButtonLeft: Math.min(...buttonBounds.map((bounds) => bounds.left)),
      maximumButtonRight: Math.max(...buttonBounds.map((bounds) => bounds.right)),
      rowCount: new Set(buttonBounds.map((bounds) => Math.round(bounds.top))).size,
      minimumButtonHeight: Math.min(...buttonBounds.map((bounds) => bounds.height)),
    };
  });
  expect(mobileLayout.toolbarRight).toBeLessThanOrEqual(390);
  expect(mobileLayout.toolbarScrollWidth).toBeLessThanOrEqual(mobileLayout.toolbarClientWidth);
  expect(mobileLayout.minimumButtonLeft).toBeGreaterThanOrEqual(mobileLayout.toolbarLeft);
  expect(mobileLayout.maximumButtonRight).toBeLessThanOrEqual(mobileLayout.toolbarRight);
  expect(mobileLayout.rowCount).toBe(2);
  expect(mobileLayout.minimumButtonHeight).toBeGreaterThanOrEqual(44);
  await spellbook.click();
  const portraitSafeArea = await page.evaluate(() => {
    const toolbarBounds = document.querySelector("#view-toolbar")?.getBoundingClientRect();
    const headingBounds = document.querySelector(".inspection-heading")?.getBoundingClientRect();
    const spellbookBounds = document.querySelector("#spellbook-view")?.getBoundingClientRect();
    const closeBounds = document.querySelector<HTMLElement>(".inspection-screen .view-close")?.getBoundingClientRect();
    return {
      toolbarBottom: toolbarBounds?.bottom ?? Number.POSITIVE_INFINITY,
      headingTop: headingBounds?.top ?? 0,
      spellbookRight: spellbookBounds?.right ?? Number.POSITIVE_INFINITY,
      closeHeight: closeBounds?.height ?? 0,
      overflowY: getComputedStyle(document.querySelector("#inspection-screen") as HTMLElement).overflowY,
      heroActivityRight: document.querySelector("#screen-hero-activity")?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
    };
  });
  expect(portraitSafeArea.headingTop).toBeGreaterThanOrEqual(portraitSafeArea.toolbarBottom);
  expect(portraitSafeArea.spellbookRight).toBeLessThanOrEqual(390);
  expect(portraitSafeArea.closeHeight).toBeGreaterThanOrEqual(44);
  expect(portraitSafeArea.overflowY).toBe("auto");
  expect(portraitSafeArea.heroActivityRight).toBeLessThanOrEqual(390);

  await page.setViewportSize({ width: 320, height: 568 });
  const narrowLayout = await page.evaluate(() => {
    const toolbarBounds = document.querySelector("#view-toolbar")?.getBoundingClientRect();
    const buttons = [...document.querySelectorAll<HTMLElement>(".view-button")];
    const cards = [...document.querySelectorAll<HTMLElement>(".spellbook-ability")];
    const buttonBounds = buttons.map((button) => button.getBoundingClientRect());
    return {
      toolbarRight: toolbarBounds?.right ?? Number.POSITIVE_INFINITY,
      toolbarScrollWidth: document.querySelector<HTMLElement>("#view-toolbar")?.scrollWidth ?? Number.POSITIVE_INFINITY,
      toolbarClientWidth: document.querySelector<HTMLElement>("#view-toolbar")?.clientWidth ?? 0,
      maximumButtonRight: Math.max(...buttonBounds.map((bounds) => bounds.right)),
      minimumButtonHeight: Math.min(...buttonBounds.map((bounds) => bounds.height)),
      widestCardRight: Math.max(0, ...cards.map((card) => card.getBoundingClientRect().right)),
      heroActivityRight: document.querySelector("#screen-hero-activity")?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
    };
  });
  expect(narrowLayout.toolbarRight).toBeLessThanOrEqual(320);
  expect(narrowLayout.toolbarScrollWidth).toBeLessThanOrEqual(narrowLayout.toolbarClientWidth);
  expect(narrowLayout.maximumButtonRight).toBeLessThanOrEqual(narrowLayout.toolbarRight);
  expect(narrowLayout.minimumButtonHeight).toBeGreaterThanOrEqual(44);
  expect(narrowLayout.widestCardRight).toBeLessThanOrEqual(320);
  expect(narrowLayout.heroActivityRight).toBeLessThanOrEqual(320);

  await page.setViewportSize({ width: 844, height: 390 });
  await spellbook.click();
  const landscapeSafeArea = await page.evaluate(() => {
    const screen = document.querySelector<HTMLElement>("#inspection-screen");
    const closeBounds = document.querySelector<HTMLElement>(".inspection-screen .view-close")?.getBoundingClientRect();
    const spellbookBounds = document.querySelector<HTMLElement>("#spellbook-view")?.getBoundingClientRect();
    return {
      clientHeight: screen?.clientHeight ?? 0,
      scrollHeight: screen?.scrollHeight ?? 0,
      closeRight: closeBounds?.right ?? Number.POSITIVE_INFINITY,
      closeTop: closeBounds?.top ?? Number.POSITIVE_INFINITY,
      closeHeight: closeBounds?.height ?? 0,
      spellbookRight: spellbookBounds?.right ?? Number.POSITIVE_INFINITY,
    };
  });
  expect(landscapeSafeArea.scrollHeight).toBeGreaterThan(landscapeSafeArea.clientHeight);
  expect(landscapeSafeArea.closeRight).toBeLessThanOrEqual(844);
  expect(landscapeSafeArea.closeTop).toBeLessThan(390);
  expect(landscapeSafeArea.closeHeight).toBeGreaterThanOrEqual(44);
  expect(landscapeSafeArea.spellbookRight).toBeLessThanOrEqual(844);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
  await expect(page.locator("#app")).toHaveAttribute("data-active-view", "watch");
  await expect(page.locator("#inventory-view")).toBeHidden();
  await expect(page.locator("#codex-view")).toBeHidden();
  await expect(page.locator("#spellbook-view")).toBeHidden();
  expect(errors).toEqual([]);
});

test("keeps a truthful clickable mini-map in watch mode when space permits", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./?fast");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
  const app = page.locator("#app");
  const miniMap = page.locator("#mini-map");
  const mapButton = page.locator("#view-toolbar [data-view=map]");

  await expect(app).toHaveAttribute("data-active-view", "watch");
  await expect(miniMap).toBeVisible();
  await expect(miniMap).toHaveAttribute("aria-label", /Mini map.+Open full map\./);
  await expect(miniMap.locator(".mini-map-coast")).not.toHaveCount(0);
  await expect(miniMap.locator(".mini-map-site")).not.toHaveCount(0);
  await expect(miniMap.locator("[data-party-marker=true]")).toHaveCount(1);
  await expect(page.locator("#mini-map-place")).not.toBeEmpty();
  await expect(page.locator("#mini-map-route")).not.toBeEmpty();

  await miniMap.click();
  await expect(app).toHaveAttribute("data-active-view", "map");
  await expect(mapButton).toBeFocused();
  await expect(page.locator("#map-inspector")).toBeVisible();
  await expect(miniMap).toBeHidden();

  await page.keyboard.press("Escape");
  await expect(app).toHaveAttribute("data-active-view", "watch");
  await expect(miniMap).toBeVisible();
  await miniMap.focus();
  await miniMap.press("Space");
  await expect(app).toHaveAttribute("data-active-view", "map");
  await expect(mapButton).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(app).toHaveAttribute("data-active-view", "watch");
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(miniMap).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(miniMap).toBeHidden();
  expect(errors).toEqual([]);
});

test("hides, detects, and disarms a typed dungeon trap", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const staged = sessionStorage.getItem("the-grind-2:test-fixture");
    if (staged === null) return;
    const world = JSON.parse(staged) as { campaignId: string };
    sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, staged);
    sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
    sessionStorage.removeItem("the-grind-2:test-fixture");
  });
  const pauseOnReady = async () => {
    await page.waitForFunction(() => {
      if (document.documentElement.dataset.ready !== "true") return false;
      const app = document.querySelector<HTMLElement>("#app");
      const button = document.querySelector<HTMLButtonElement>("#pause-button");
      if (app === null || button === null) return false;
      if (app.dataset.presentationPaused !== "true") button.click();
      return app.dataset.presentationPaused === "true";
    }, undefined, { polling: 25, timeout: 30_000 });
  };
  await page.goto("./?fast");
  await pauseOnReady();
  await page.waitForTimeout(500);
  const stage = page.locator("#stage");
  const pause = page.locator("#pause-button");
  const traversal = page.locator("#traversal-progress-text");
  const seeded = await page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    if (campaignId === null) return null;
    const key = `the-grind-2:campaign:${campaignId}`;
    const source = sessionStorage.getItem(key);
    if (source === null) return null;
    const world = JSON.parse(source) as Record<string, any>;
    const id = "dungeon:browser-trap";
    const northWest = `${id}:cell:0,0`;
    const entry = `${id}:cell:1,0`;
    const east = `${id}:cell:2,0`;
    const eastMiddle = `${id}:cell:2,1`;
    const middle = `${id}:cell:1,1`;
    const westMiddle = `${id}:cell:0,1`;
    const westBottom = `${id}:cell:0,2`;
    const middleBottom = `${id}:cell:1,2`;
    const exit = `${id}:cell:2,2`;
    world.depth.dungeon = {
      id,
      name: "Clockroot Vault",
      width: 3,
      height: 3,
      cells: [
        { id: northWest, x: 0, y: 0, exits: ["east", "south"], feature: "empty" },
        { id: entry, x: 1, y: 0, exits: ["east", "west"], feature: "empty" },
        { id: east, x: 2, y: 0, exits: ["south", "west"], feature: "empty" },
        { id: westMiddle, x: 0, y: 1, exits: ["north", "east", "south"], feature: "empty" },
        { id: middle, x: 1, y: 1, exits: ["east", "west"], feature: "empty" },
        { id: eastMiddle, x: 2, y: 1, exits: ["north", "west"], feature: "empty" },
        { id: westBottom, x: 0, y: 2, exits: ["north", "east"], feature: "empty" },
        { id: middleBottom, x: 1, y: 2, exits: ["east", "west"], feature: "empty" },
        { id: exit, x: 2, y: 2, exits: ["west"], feature: "trap" },
      ],
      entryCellId: entry,
      exitCellId: exit,
      currentCellId: westBottom,
      visitedCellIds: [northWest, entry, east, eastMiddle, middle, westMiddle, westBottom, middleBottom],
      discoveredCellIds: [northWest, entry, east, westMiddle, middle, eastMiddle, westBottom, middleBottom, exit],
      traps: [{ cellId: exit, kind: "tripwire", detectDifficulty: 10, disarmDifficulty: 11, phase: "hidden" }],
      traversalLog: ["Returned from the far stair."],
      turns: 2,
      completed: false,
    };
    world.depth.hero.attributes = { ...world.depth.hero.attributes, intellect: 20, agility: 20 };
    world.scene = {
      ...world.scene,
      mode: "dungeon",
      location: "Clockroot Vault",
      headline: "Clockroot Vault: passage 3.",
      action: "The mapped way east returns to the frontier before the guarded far stair.",
      consequence: "The maze remains unsolved.",
      sensoryIntensity: 1,
    };
    sessionStorage.setItem("the-grind-2:test-fixture", JSON.stringify(world));
    return world;
  });
  expect(seeded).not.toBeNull();
  expect(() => upgradeWorldState(seeded)).not.toThrow();
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await pauseOnReady();
  await expect(page.locator("#hero-name")).toHaveText(seeded?.depth?.hero?.name ?? "missing", { timeout: 15_000 });
  const loadedDungeonId = await page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    const source = campaignId === null ? null : sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    return source === null ? null : JSON.parse(source).depth?.dungeon?.id ?? null;
  });
  expect(loadedDungeonId).toBe("dungeon:browser-trap");
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "true");
  await expect(stage).toHaveAttribute("data-scene-mode", "dungeon");
  await expect(stage).toHaveAttribute("data-dungeon-trap", "none");
  await expect(stage).toHaveAttribute("data-dungeon-traversal-mode", "retrace");
  await expect(stage).toHaveAttribute("data-dungeon-breadcrumb-length", "1");
  await expect(stage).toHaveAttribute("data-dungeon-frontier-cell", "dungeon:browser-trap:cell:1,2");
  await expect(stage).toHaveAttribute("data-dungeon-next-directions", "east");
  await expect(stage).toHaveAttribute("data-dungeon-hero-cell", "dungeon:browser-trap:cell:0,2");
  await expect(stage).toHaveAttribute("data-reduced-motion", "true");
  await expect(traversal).toHaveAttribute("data-traps-armed", "0");
  await expect(traversal).toHaveAttribute("data-traps-disarmed", "0");
  await expect(traversal).toHaveAttribute("data-traps-triggered", "0");
  await expect(traversal).toHaveAttribute("data-traps-spent", "0");
  await expect(traversal).toContainText("No marked traps");
  const directive = page.locator("#traversal-directive");
  await expect(directive).toHaveText("Retracing east · 1 room to frontier");
  await expect(directive).toHaveAttribute("data-directions", "east");
  await expect(directive).toHaveAttribute("data-frontier-cell", "dungeon:browser-trap:cell:1,2");
  await expect(directive).toHaveAttribute("data-route-length", "1");
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect(stage).toHaveAttribute("data-dungeon-breadcrumb-length", "1");
    await expect(stage).toHaveAttribute("data-dungeon-hero-cell", "dungeon:browser-trap:cell:0,2");
    await expect(stage).toHaveAttribute("data-scene-layout", /\d+\.\d{4},-?\d+\.\d{4},-?\d+\.\d{4}/);
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  const exploreSeeded = await page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    if (campaignId === null) return null;
    const key = `the-grind-2:campaign:${campaignId}`;
    const source = sessionStorage.getItem(key);
    if (source === null) return null;
    const world = JSON.parse(source) as Record<string, any>;
    const id = "dungeon:browser-trap";
    world.depth.dungeon.currentCellId = `${id}:cell:1,2`;
    world.depth.dungeon.traversalLog = ["The mapped return reaches the frontier."];
    world.depth.dungeon.turns += 1;
    world.scene = {
      ...world.scene,
      mode: "dungeon",
      location: "Clockroot Vault",
      headline: "Clockroot Vault: the frontier opens east.",
      action: "The far stair and its marked hazard wait through the eastern passage.",
      consequence: "One unexplored room remains.",
      sensoryIntensity: 1,
    };
    sessionStorage.setItem("the-grind-2:test-fixture", JSON.stringify(world));
    return world;
  });
  expect(exploreSeeded).not.toBeNull();
  expect(() => upgradeWorldState(exploreSeeded)).not.toThrow();
  await page.reload({ waitUntil: "domcontentloaded" });
  await pauseOnReady();
  await expect(page.locator("#hero-name")).toHaveText(seeded?.depth?.hero?.name ?? "missing", { timeout: 15_000 });
  await expect(stage).toHaveAttribute("data-dungeon-traversal-mode", "explore");
  await expect(stage).toHaveAttribute("data-dungeon-breadcrumb-length", "0");
  await expect(stage).toHaveAttribute("data-dungeon-frontier-cell", "dungeon:browser-trap:cell:1,2");
  await expect(stage).toHaveAttribute("data-dungeon-next-directions", "east");
  await expect(stage).toHaveAttribute("data-dungeon-hero-cell", "dungeon:browser-trap:cell:1,2");
  await expect(stage).toHaveAttribute("data-dungeon-trap", "none");
  await expect(stage).not.toHaveAttribute("data-dungeon-trap-kind", /.+/);
  await expect(directive).toHaveText("Exploring · east passage");
  await expect(directive).toHaveAttribute("data-route-length", "0");

  const detectedSeeded = await page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    if (campaignId === null) return null;
    const key = `the-grind-2:campaign:${campaignId}`;
    const source = sessionStorage.getItem(key);
    if (source === null) return null;
    const world = JSON.parse(source) as Record<string, any>;
    const id = "dungeon:browser-trap";
    const exit = `${id}:cell:2,2`;
    world.depth.dungeon.currentCellId = exit;
    world.depth.dungeon.visitedCellIds = [...new Set([...world.depth.dungeon.visitedCellIds, exit])];
    world.depth.dungeon.traps[0].phase = "detected";
    world.depth.dungeon.traversalLog = [
      `${world.depth.hero.name} spots a whisper-wire before it springs — intellect 20 meets concealment 10. It must be disarmed.`,
    ];
    world.depth.dungeon.turns += 1;
    world.scene = {
      ...world.scene,
      mode: "dungeon",
      location: "Clockroot Vault",
      headline: "Clockroot Vault: a whisper-wire is revealed!",
      action: `${world.depth.hero.name} spots the mechanism before it springs.`,
      consequence: "The marked trap must be disarmed before the maze can continue.",
      sensoryIntensity: 2,
    };
    sessionStorage.setItem("the-grind-2:test-fixture", JSON.stringify(world));
    return world;
  });
  expect(detectedSeeded).not.toBeNull();
  expect(() => upgradeWorldState(detectedSeeded)).not.toThrow();
  await page.reload({ waitUntil: "domcontentloaded" });
  await pauseOnReady();
  await expect(page.locator("#hero-name")).toHaveText(seeded?.depth?.hero?.name ?? "missing", { timeout: 15_000 });
  await expect(stage).toHaveAttribute("data-dungeon-trap", "armed");
  await expect(stage).toHaveAttribute("data-dungeon-trap-cell", "dungeon:browser-trap:cell:2,2");
  await expect(stage).toHaveAttribute("data-dungeon-trap-kind", "tripwire");
  await expect(stage).toHaveAttribute("data-dungeon-trap-result", "The marked trap must be disarmed before the maze can continue.");
  await expect(stage).toHaveAttribute("data-dungeon-traversal-mode", "hazard");
  await expect(stage).toHaveAttribute("data-dungeon-hero-cell", "dungeon:browser-trap:cell:2,2");
  await expect(traversal).toHaveAttribute("data-traps-armed", "1");
  await expect(traversal).toHaveAttribute("data-traps-disarmed", "0");
  await expect(page.locator("#traversal-directive")).toHaveText("Disarming · whisper-wire · agility vs 11");
  const healthBefore = detectedSeeded?.depth?.hero?.resources?.health;

  await pause.click({ force: true });
  await expect(stage).toHaveAttribute("data-dungeon-trap", "disarmed", { timeout: 10_000 });
  await pause.click({ force: true });
  await expect(stage).toHaveAttribute("data-dungeon-trap-cell", "dungeon:browser-trap:cell:2,2");
  await expect(stage).toHaveAttribute("data-dungeon-trap-kind", "tripwire");
  await expect(stage).toHaveAttribute("data-dungeon-trap-result", /marked trap is disarmed.*far stair is reached/i);
  await expect(stage).toHaveAttribute("data-dungeon-traversal-mode", "complete");
  await expect(stage).toHaveAttribute("data-dungeon-breadcrumb-length", "0");
  await expect(stage).toHaveAttribute("data-dungeon-next-directions", "");
  await expect(stage).not.toHaveAttribute("data-dungeon-frontier-cell", /.+/);
  await expect(stage).toHaveAttribute("data-dungeon-hero-cell", "dungeon:browser-trap:cell:2,2");
  await expect(traversal).toHaveAttribute("data-traps-armed", "0");
  await expect(traversal).toHaveAttribute("data-traps-disarmed", "1");
  await expect(traversal).toHaveAttribute("data-traps-triggered", "0");
  await expect(traversal).toHaveAttribute("data-traps-spent", "1");
  await expect(traversal).toContainText("9/9 rooms");
  await expect(page.locator("#traversal-directive")).toHaveText("Cleared · far stair reached");
  await expect(page.locator("#scene-headline")).toHaveText("Clockroot Vault: the passage is made safe.");
  await expect(page.locator("#scene-consequence")).toContainText("far stair");
  const healthAfter = await page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    const source = campaignId === null ? null : sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    return source === null ? null : JSON.parse(source).depth?.hero?.resources?.health ?? null;
  });
  expect(healthAfter).toBe(healthBefore);
  expect(errors).toEqual([]);
});

test("summarizes significant off-view moments without interrupting autoplay", async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./?fast");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
  const app = page.locator("#app");
  const toolbar = page.locator("#view-toolbar");
  const watch = toolbar.locator("[data-view=watch]");
  const map = toolbar.locator("[data-view=map]");
  const badge = page.locator("#watch-badge");
  const inbox = page.locator("#spectator-inbox");
  const moments = page.locator("#spectator-inbox-list .spectator-moment");

  await map.click();
  await expect(map).toBeFocused();
  await expect(badge).toBeVisible({ timeout: 60_000 });
  await expect(watch).toHaveAttribute("aria-label", /Watch, \d+ unseen adventure highlights?/);
  await expect(map).toBeFocused();
  await expect(inbox).toBeHidden();

  await page.locator("#pause-button").click({ force: true });
  await page.waitForTimeout(350);
  const savedBeforeRecap = await page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    return campaignId === null ? null : sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
  });
  expect(savedBeforeRecap).not.toBeNull();
  await page.keyboard.press("Escape");
  await expect(app).toHaveAttribute("data-active-view", "watch");
  await expect(watch).toBeFocused();
  await expect(badge).toBeHidden();
  await expect(watch).toHaveAttribute("aria-label", "Watch");
  await expect(inbox).toBeVisible();
  await expect(moments).not.toHaveCount(0);
  expect(await moments.count()).toBeLessThanOrEqual(8);
  await expect(moments.first()).toHaveAttribute("data-kind", /^(battle|discovery|dungeon|arrival|quest|growth|item)$/);
  const savedAfterRecap = await page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    return campaignId === null ? null : sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
  });
  expect(savedAfterRecap).toBe(savedBeforeRecap);

  await page.locator("#pause-button").click({ force: true });
  const commandId = await page.locator("#scene-decision").getAttribute("data-command-id");
  await expect(page.locator("#scene-decision")).not.toHaveAttribute("data-command-id", commandId ?? "pending", { timeout: 15_000 });
  await expect(inbox).toBeVisible();
  await page.locator("#pause-button").click({ force: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const portrait = await page.evaluate(() => {
    const toolbar = document.querySelector<HTMLElement>("#view-toolbar")?.getBoundingClientRect();
    const recap = document.querySelector<HTMLElement>("#spectator-inbox")?.getBoundingClientRect();
    const close = document.querySelector<HTMLElement>("#spectator-inbox-close")?.getBoundingClientRect();
    const list = document.querySelector<HTMLElement>("#spectator-inbox-list");
    return {
      toolbarBottom: toolbar?.bottom ?? Number.POSITIVE_INFINITY,
      recapTop: recap?.top ?? 0,
      recapRight: recap?.right ?? Number.POSITIVE_INFINITY,
      recapBottom: recap?.bottom ?? Number.POSITIVE_INFINITY,
      closeHeight: close?.height ?? 0,
      overflowY: list === null ? "missing" : getComputedStyle(list).overflowY,
    };
  });
  expect(portrait.recapTop).toBeGreaterThanOrEqual(portrait.toolbarBottom);
  expect(portrait.recapRight).toBeLessThanOrEqual(390);
  expect(portrait.recapBottom).toBeLessThanOrEqual(844);
  expect(portrait.closeHeight).toBeGreaterThanOrEqual(44);
  expect(portrait.overflowY).toBe("auto");

  await page.setViewportSize({ width: 844, height: 390 });
  const landscape = await page.evaluate(() => {
    const recap = document.querySelector<HTMLElement>("#spectator-inbox")?.getBoundingClientRect();
    const toolbar = document.querySelector<HTMLElement>("#view-toolbar")?.getBoundingClientRect();
    const close = document.querySelector<HTMLElement>("#spectator-inbox-close")?.getBoundingClientRect();
    return {
      top: recap?.top ?? 0,
      right: recap?.right ?? Number.POSITIVE_INFINITY,
      bottom: recap?.bottom ?? Number.POSITIVE_INFINITY,
      toolbarBottom: toolbar?.bottom ?? Number.POSITIVE_INFINITY,
      closeHeight: close?.height ?? 0,
    };
  });
  expect(landscape.top).toBeGreaterThanOrEqual(landscape.toolbarBottom);
  expect(landscape.right).toBeLessThanOrEqual(844);
  expect(landscape.bottom).toBeLessThanOrEqual(390);
  expect(landscape.closeHeight).toBeGreaterThanOrEqual(44);

  await page.locator("#spectator-inbox-close").click();
  await expect(inbox).toBeHidden();
  await expect(watch).toBeFocused();
  await map.click();
  await watch.click();
  await expect(inbox).toBeHidden();
  await expect(badge).toBeHidden();
  expect(errors).toEqual([]);
});

test.describe("automatic deployment reload", () => {
  test.use({ serviceWorkers: "block" });

  test("saves the campaign and reloads once when a newer deployment persists", async ({ page }) => {
    const errors: string[] = [];
    let versionRequests = 0;
    let mainNavigations = 0;
    let releaseFirstManifest: (() => void) | undefined;
    const firstManifestGate = new Promise<void>((resolve) => {
      releaseFirstManifest = resolve;
    });
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) mainNavigations += 1;
    });
    await page.route("**/version.json?check=*", async (route) => {
      versionRequests += 1;
      if (versionRequests === 1) await firstManifestGate;
      await route.fulfill({
        contentType: "application/json",
        headers: { "cache-control": "no-store" },
        body: JSON.stringify({ version: "9.9.9" }),
      });
    });

    await page.goto("./?fast", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
    const beforeUpdate = await page.evaluate(() => {
      const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
      if (campaignId === null) return null;
      const source = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
      if (source === null) return null;
      return { campaignId, tick: (JSON.parse(source) as { tick: number }).tick };
    });
    expect(beforeUpdate).not.toBeNull();
    releaseFirstManifest?.();
    await expect.poll(() => versionRequests, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    await expect.poll(() => mainNavigations).toBeGreaterThanOrEqual(2);
    await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
    await expect(page.locator("html")).toHaveAttribute("data-app-version", appVersion);
    await expect(page.locator("html")).toHaveAttribute("data-update-status", "error");
    await expect(page.locator("#update-status")).toBeHidden();
    const afterUpdate = await page.evaluate(() => {
      const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
      if (campaignId === null) return null;
      const source = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
      if (source === null) return null;
      const attempt = sessionStorage.getItem("the-grind-2:update-attempt");
      return {
        campaignId,
        tick: (JSON.parse(source) as { tick: number }).tick,
        targetVersion: attempt === null
          ? null
          : (JSON.parse(attempt) as { targetVersion: string }).targetVersion,
      };
    });
    expect(afterUpdate?.campaignId).toBe(beforeUpdate?.campaignId);
    expect(afterUpdate?.tick).toBeGreaterThanOrEqual(beforeUpdate?.tick ?? 0);
    expect(afterUpdate?.targetVersion).toBe("9.9.9");
    await page.waitForTimeout(750);
    expect(mainNavigations).toBe(2);
    expect(versionRequests).toBe(2);
    expect(errors).toEqual([]);
  });
});

test("activates the production service worker and versioned cache", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./?fast");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
  await expect.poll(async () => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active?.state ?? null;
  }), { timeout: 15_000 }).toBe("activated");
  const cacheNames = await page.evaluate(() => caches.keys());
  expect(cacheNames).toContain(`the-grind-2:assets:v${appVersion}`);
  expect(errors).toEqual([]);
});
