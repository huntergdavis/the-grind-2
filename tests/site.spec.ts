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
  await expect(page.locator("#equipment-list li[data-rarity=\"common\"]")).not.toHaveCount(0);
  await expect(page.locator("#event-log li")).not.toHaveCount(0);
  const firstCampaign = await page.locator("#campaign-select").inputValue();
  const firstScene = await page.locator("#scene-headline").innerText();

  await expect(page.locator("#scene-headline")).not.toHaveText(firstScene, {
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
      depthSchemaVersion: saved.depth.schemaVersion,
      atlasLocations: saved.depth.atlas.locations.length,
      towns: Object.keys(saved.depth.towns).length,
      inventoryItems: saved.depth.hero.inventory.length,
      questObjectives: saved.depth.quest.objectives.length,
      subquests: saved.depth.quest.subquests.length,
    };
  });
  expect(savedLifecycle).toMatchObject({
    schemaVersion: 4,
    policyVersion: 1,
    depthSchemaVersion: 2,
  });
  expect(savedLifecycle?.simulationTick).toBe(savedLifecycle?.tick);
  expect(savedLifecycle?.atlasLocations).toBeGreaterThanOrEqual(4);
  expect(savedLifecycle?.towns).toBeGreaterThanOrEqual(1);
  expect(savedLifecycle?.inventoryItems).toBeGreaterThanOrEqual(2);
  expect(savedLifecycle?.questObjectives).toBeGreaterThanOrEqual(1);
  expect(savedLifecycle?.subquests).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});
