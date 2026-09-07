import { expect as baseExpect, test, type Page } from "@playwright/test";
import { createWorld } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { derivedStats } from "../src/depth";
import { projectHeroExperience } from "../src/ui/hero-progression";
import { projectInventoryView, projectSpellbookView } from "../src/ui/view-projection";

const expect = baseExpect.configure({ timeout: 15_000 });

async function savedWorld(page: Page, campaignId: string): Promise<WorldState> {
  return page.evaluate((id) => JSON.parse(sessionStorage.getItem(`the-grind-2:campaign:${id}`)!) as WorldState, campaignId);
}

test("Character keeps readiness and disclosed attributes while Inventory and Skills own the details", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  const inference: string[] = [];
  const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (modelUrl.test(request.url())) inference.push(request.url()); });
  page.on("worker", (worker) => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
  const fixture = createWorld("character-details", "campaign:character-details");
  await page.addInitScript((world) => {
    sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world));
    sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 3_600_000));
    localStorage.setItem("the-grind-2:play-mode:v1", '{"schemaVersion":1,"mode":"deterministic"}');
    localStorage.setItem("the-grind-2:stage-focus:v1", "panels");
  }, fixture);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("./", { timeout: 25_000 });
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  await page.locator("#pause-button").click();
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  const before = await savedWorld(page, fixture.campaignId);
  const hero = before.depth.hero;
  const combat = derivedStats(hero);
  await page.locator("#watch-character-details").click();
  const drawer = page.locator("#stage-panels-drawer");
  await expect(drawer).toBeVisible();
  await expect(page.locator("#gear-summary, #ability-summary, #ability-list, #equipment-list, .ability-card, .equipment-card")).toHaveCount(0);
  await expect(page.locator("#hero-xp-text")).toHaveText(projectHeroExperience(hero).text);
  await expect(page.locator("#stat-power")).toHaveText(String(combat.power));
  await expect(page.locator("#stat-armor")).toHaveText(String(combat.armor));
  await expect(page.locator("#stat-initiative")).toHaveText(String(combat.initiative));
  const attributes = page.locator("#character-attributes");
  const summary = attributes.locator("summary");
  await expect(attributes).not.toHaveAttribute("open");
  await expect(page.locator("#stat-strength")).toBeHidden();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(attributes).toHaveAttribute("open");
  for (const [name, value] of Object.entries(hero.attributes)) {
    await expect(page.locator(`#stat-${name}`)).toHaveText(String(value));
    await expect(page.locator(`#stat-${name}`)).toBeVisible();
  }
  await page.keyboard.press("Enter");
  await expect(attributes).not.toHaveAttribute("open");
  await expect(summary).toBeFocused();
  for (const [width, height, fontSize] of [[1280, 800, "100%"], [320, 568, "100%"], [320, 568, "200%"]] as const) {
    await page.setViewportSize({ width, height });
    if (!await drawer.isVisible()) await page.locator("#watch-character-details").click();
    await expect(drawer).toBeVisible();
    await page.evaluate((size) => { document.documentElement.style.fontSize = size; }, fontSize);
    await summary.scrollIntoViewIfNeeded();
    const layout = await drawer.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const content = element.querySelector<HTMLElement>("#stage-panels-content")!;
      const attributes = element.querySelector<HTMLElement>("#character-attributes")!.getBoundingClientRect();
      const summary = element.querySelector<HTMLElement>("#character-attributes > summary")!.getBoundingClientRect();
      const navigation = element.querySelector<HTMLElement>("#view-toolbar")!.getBoundingClientRect();
      const headingChildren = [...element.querySelectorAll<HTMLElement>("#stage-panels-title, #stage-panels-close")];
      return { fits: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
        contentFits: content.scrollWidth <= content.clientWidth + 1,
        pageFits: document.documentElement.scrollWidth <= innerWidth + 1,
        attributesFit: attributes.left >= box.left && attributes.right <= box.right,
        targetFits: summary.width >= 44 && summary.height >= 44,
        headingFits: headingChildren.every((child) => {
          const bounds = child.getBoundingClientRect();
          return bounds.left >= box.left && bounds.right <= box.right && bounds.top >= box.top
            && bounds.bottom <= box.bottom && child.scrollWidth <= child.clientWidth + 1;
        }),
        navigationHeight: navigation.height,
        overflowingContent: [...content.querySelectorAll<HTMLElement>("*")]
          .filter((child) => !child.closest("#view-toolbar") && child.getBoundingClientRect().width > 0
            && child.getBoundingClientRect().right > content.getBoundingClientRect().right + 1)
          .map((child) => ({ element: child.id || child.className || child.tagName,
            right: child.getBoundingClientRect().right, width: child.clientWidth, scrollWidth: child.scrollWidth })) };
    });
    expect(layout, JSON.stringify({ width, fontSize, layout })).toMatchObject({ fits: true, contentFits: true, pageFits: true, attributesFit: true, targetFits: true, headingFits: true });
    if (width === 320) expect(layout.navigationHeight).toBeLessThanOrEqual(fontSize === "200%" ? 120 : 66);
    if (fontSize === "100%") await page.locator(".vital-card").evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
    await page.screenshot({ path: testInfo.outputPath(`character-${width}-${fontSize.replace("%", "")}.png`), timeout: 8_000 });
    await summary.click();
    await expect(page.locator("#stat-strength")).toBeVisible();
    expect(await attributes.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await summary.click();
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = "100%"; });

  await drawer.locator('[data-view="inventory"]').click();
  await expect(page.locator("#inventory-view")).toBeVisible();
  const inventory = projectInventoryView(before);
  const equipment = await page.locator("#inventory-grid .inventory-item").evaluateAll((items) => items.map((node) => {
    const item = node as HTMLElement;
    return { id: item.dataset.itemId, name: item.querySelector("h3")!.textContent,
      rarity: item.dataset.rarity, equipped: item.dataset.equipped,
      slot: item.querySelector(".item-equipped")!.textContent };
  }));
  expect(equipment).toEqual(inventory.items.map((item) => ({ id: item.id, name: item.name, rarity: item.rarity,
    equipped: String(item.equippedSlot !== null), slot: item.equippedSlot === null ? "Carried" : `Equipped · ${item.equippedSlot}` })));
  expect(equipment.length).toBeGreaterThan(0);
  await drawer.locator('[data-view="spellbook"]').click();
  await expect(page.locator("#spellbook-view")).toBeVisible();
  const spellbook = projectSpellbookView(before);
  const abilities = await page.locator("#spellbook-grid .spellbook-ability").evaluateAll((cards) => cards.map((node) => {
    const card = node as HTMLElement;
    const meter = card.querySelector<HTMLProgressElement>("progress");
    return { id: card.dataset.abilityId, name: card.querySelector("h3")!.textContent,
      level: Number(card.querySelector(".spellbook-level strong")!.textContent),
      meter: meter === null ? null : { value: meter.value, max: meter.max } };
  }));
  expect(abilities).toEqual(spellbook.abilities.map((ability) => ({ id: ability.id, name: ability.name,
    level: ability.level, meter: ability.mastered ? null : { value: ability.masteryCurrent, max: Math.max(1, ability.masterySpan) } })));
  expect(abilities.length).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(page.locator("#watch-character-details")).toBeFocused();
  await expect(page.locator("#stage-focus-ribbon")).toBeVisible();
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  expect(await savedWorld(page, fixture.campaignId)).toEqual(before);
  expect(inference).toEqual([]);
  expect(errors).toEqual([]);
});
