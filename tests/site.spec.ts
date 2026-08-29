import { expect, test } from "@playwright/test";

test("plays, pauses, creates, and reloads an autonomous campaign", async ({ page }) => {
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
    depthSchemaVersion: 3,
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
  await expect(stage).toHaveAttribute("data-combat-event", /.+/, { timeout: 60_000 });
  await page.locator("#pause-button").click({ force: true });
  await page.waitForTimeout(100);
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
