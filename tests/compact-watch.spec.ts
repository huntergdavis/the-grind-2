import { expect, test, type Page } from "@playwright/test";
import { createForwardMotionState } from "../src/core/forward-motion";
import { advanceWorld, createWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { stepDepth } from "../src/depth/state";
import { generateTown, visitTown } from "../src/depth/towns";
import { projectParty } from "../src/ui/party-projection";

function soloDuelWorld(): WorldState {
  const base = createWorld("browser-focus-information-duel", "campaign:compact-watch-duel");
  const depth = stepDepth(base.depth, { type: "start-counter-duel", encounterId: "encounter:compact-watch-duel" });
  return upgradeWorldState(advanceWorld(upgradeWorldState({ ...base, tick: depth.tick, depth,
    hero: { ...base.hero, health: depth.hero.resources.health },
    scene: { ...base.scene, mode: "battle", headline: "A roadside encounter begins.",
      action: "The participants prepare a legal exchange.", consequence: "No final outcome has resolved.", sensoryIntensity: 3 },
    lifecycle: { ...base.lifecycle, simulationTick: depth.tick, worldClockMinutes: depth.tick * 15 },
  })));
}

function injuredCompanionWorld(): WorldState {
  // Reuse the real recruitment route from the Shared Road browser fixture.
  const base = createWorld("browser-shared-road", "campaign:compact-watch-party");
  const origin = base.depth.atlas.currentLocationId;
  const destination = base.depth.atlas.locations.find((place) => place.kind === "town" && place.id !== origin);
  if (destination === undefined) throw new Error("Compact Watch fixture needs another town");
  const town = visitTown(generateTown(base.seed, destination.id));
  const joined = advanceWorld(upgradeWorldState({
    ...base,
    scene: { ...base.scene, mode: "town", location: town.name },
    forwardMotion: createForwardMotionState(destination.id, base.tick),
    depth: {
      ...base.depth,
      atlas: { ...base.depth.atlas, currentLocationId: destination.id,
        discoveredLocationIds: [origin, destination.id], route: null },
      towns: { ...base.depth.towns, [destination.id]: town },
    },
  }));
  const routed = advanceWorld(joined);
  const companion = routed.depth.companions.active[0];
  if (companion === undefined) throw new Error("Canonical recruitment did not provide a companion");
  // Saved-state fixture, not a claim that this encounter caused the injury.
  return upgradeWorldState({ ...routed, depth: { ...routed.depth,
    companions: { ...routed.depth.companions, active: [{ ...companion,
      injury: "fallen", resources: { ...companion.resources, health: 0 } }] },
  } });
}

async function savedWorld(page: Page, campaignId: string): Promise<WorldState> {
  return page.evaluate((id) => {
    const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
    if (raw === null) throw new Error("Expected canonical campaign mirror");
    return JSON.parse(raw) as WorldState;
  }, campaignId);
}

async function verifyResource(page: Page, id: string, value: number, maximum: number): Promise<void> {
  await expect(page.locator(id)).toBeVisible();
  expect(await page.locator(id).evaluate((node) => {
    const meter = node as HTMLProgressElement;
    return { value: meter.value, max: meter.max, label: meter.getAttribute("aria-label") };
  })).toEqual({ value, max: Math.max(1, maximum), label: expect.stringContaining(`${value} of ${maximum}`) });
  await expect(page.locator(`${id}-text`)).toContainText(`${value}/${maximum}`);
}

test("compact Watch keeps truthful portrait vitals and deliberate details without changing paused play", async ({ context }, testInfo) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  const inference: string[] = [];
  const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;
  context.on("request", (request) => { if (modelUrl.test(request.url())) inference.push(request.url()); });

  for (const [kind, fixture] of [
    ["solo", soloDuelWorld()],
    ["injured", injuredCompanionWorld()],
  ] as const) {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("worker", (worker) => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript((world) => {
      const key = `the-grind-2:campaign:${world.campaignId}`;
      sessionStorage.setItem(key, JSON.stringify(world));
      sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
      localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 3_600_000));
      localStorage.setItem("the-grind-2:play-mode:v1", '{"schemaVersion":1,"mode":"deterministic"}');
      localStorage.setItem("the-grind-2:adventure-speed:v1", '{"schemaVersion":1,"speed":1}');
      localStorage.setItem("the-grind-2:stage-focus:v1", "panels");
    }, fixture);
    try {
      await page.goto("./", { timeout: 25_000 });
      await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
      await page.locator("#pause-button").click();
      await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "true");
      const before = await savedWorld(page, fixture.campaignId);
      const companion = projectParty(before.depth).active;
      if (kind === "injured") expect(companion?.status).toMatch(/injured/u);
      if (kind === "solo") {
        await expect(page.locator("#stage")).toHaveAttribute("data-encounter-engine", "counter-triangle");
        await expect(page.locator("#stage")).toHaveAttribute("data-stage-information-visibility", "hidden");
        await expect(page.locator("#stage")).toHaveAttribute("data-stage-information-visible-group-count", "0");
      }

      for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
        await page.setViewportSize(viewport);
        const ribbon = page.locator("#stage-focus-ribbon");
        await expect(ribbon).toBeVisible();
        await expect(page.locator("#watch-hero-portrait")).toBeVisible();
        await expect(page.locator("#stage-focus-hero")).toContainText(before.depth.hero.name);
        await verifyResource(page, "#watch-hero-health", before.depth.hero.resources.health, before.depth.hero.resources.maxHealth);
        await verifyResource(page, "#watch-hero-mana", before.depth.hero.resources.mana, before.depth.hero.resources.maxMana);
        if (companion === null) {
          await expect(page.locator("#watch-companion-card")).toBeHidden();
        } else {
          await expect(page.locator("#watch-companion-portrait")).toBeVisible();
          await expect(page.locator("#watch-companion-card")).toContainText(companion.name);
          await expect(page.locator("#watch-companion-status")).toContainText(/injured/iu);
          await verifyResource(page, "#watch-companion-health", companion.health, companion.maxHealth);
          await expect(page.locator("#watch-companion-card")).not.toContainText(/dead|\bMP\b/iu);
        }
        await expect(page.locator("#hero-hud")).toBeHidden();
        await expect(page.locator("#mini-map")).toBeHidden();
        const bounds = await page.evaluate(() => {
          const ribbon = document.querySelector("#stage-focus-ribbon")!.getBoundingClientRect();
          const stage = document.querySelector("#stage")!.getBoundingClientRect();
          const details = document.querySelector("#watch-character-details")!.getBoundingClientRect();
          return { left: ribbon.left, right: ribbon.right, bottom: ribbon.bottom, top: ribbon.top,
            stageBottom: stage.bottom, width: innerWidth, height: innerHeight,
            documentWidth: document.documentElement.scrollWidth,
            detailsWidth: details.width, detailsHeight: details.height };
        });
        expect(bounds.left).toBeGreaterThanOrEqual(0);
        expect(bounds.right).toBeLessThanOrEqual(bounds.width);
        expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);
        expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.width);
        expect(bounds.stageBottom).toBeLessThanOrEqual(bounds.top + 1);
        expect(bounds.detailsWidth).toBeGreaterThanOrEqual(44);
        expect(bounds.detailsHeight).toBeGreaterThanOrEqual(44);
        await page.screenshot({ path: testInfo.outputPath(`compact-watch-${kind}-${viewport.width}.png`), timeout: 8_000 });

        await page.locator("#watch-character-details").click();
        await expect(page.locator("#adventure-view")).toBeVisible();
        await expect(page.locator('.view-button[data-view="adventure"]')).toBeFocused();
        await expect(page.locator("#hero-hud")).toBeVisible();
        await expect(ribbon).toBeHidden();
        const attributes = page.locator("#character-attributes");
        await expect(attributes).not.toHaveAttribute("open", "");
        await expect(page.locator("#stat-strength")).toBeHidden();
        await attributes.locator("summary").click();
        await expect(page.locator("#stat-strength")).toBeVisible();
        await expect(page.locator("#stat-strength")).toHaveText(String(before.depth.hero.attributes.strength));
        await expect(page.locator("#equipment-list, #ability-list, #gear-summary, #ability-summary")).toHaveCount(0);
        await attributes.locator("summary").click();
        await page.keyboard.press("Escape");
        await expect(page.locator("#adventure-view")).toBeHidden();
        await expect(ribbon).toBeVisible();
        await expect(page.locator('.view-button[data-view="watch"]')).toBeFocused();

        // Character is a shortcut to the ordinary Adventure tab.
        await page.locator("#watch-character-details").click();
        await expect(page.locator("#adventure-view")).toBeVisible();
        await page.locator('.view-button[data-view="inventory"]').click();
        await expect(page.locator("#inventory-view")).toBeVisible();
        for (const [slot, id] of Object.entries(before.depth.hero.equipment)) {
          if (id === null) continue;
          const item = before.depth.hero.inventory.find((candidate) => candidate.id === id);
          if (item === undefined) throw new Error(`Equipped ${slot} is missing from canonical inventory`);
          const card = page.locator(`.inventory-item[data-item-id="${id}"]`);
          await expect(card).toBeVisible();
          await expect(card).toHaveAttribute("data-equipped", "true");
          await expect(card).toHaveAttribute("data-rarity", item.rarity);
          await expect(card.locator("h3")).toHaveText(item.name);
          await expect(card.locator(".item-equipped")).toHaveText(`Equipped · ${slot}`);
        }
        await page.locator('.view-button[data-view="spellbook"]').click();
        await expect(page.locator("#spellbook-view")).toBeVisible();
        await expect(page.locator("#spellbook-grid .spellbook-ability")).toHaveCount(before.depth.hero.abilities.length);
        for (const ability of before.depth.hero.abilities) {
          const card = page.locator(`.spellbook-ability[data-ability-id="${ability.id}"]`);
          await expect(card.locator("h3")).toHaveText(ability.name);
          await expect(card.locator(".spellbook-level strong")).toHaveText(String(ability.level));
        }
        await page.keyboard.press("Escape");
        await expect(page.locator("#inspection-screen")).toBeHidden();
        await expect(page.locator('.view-button[data-view="watch"]')).toBeFocused();

        const focus = page.locator("#stage-focus-button");
        await focus.focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#app")).toHaveAttribute("data-chrome-mode", "focus");
        await expect(focus).toBeFocused();
        await expect(ribbon).toBeVisible();
        await expect(page.locator("#topbar")).toBeHidden();
        await focus.press("Enter");
        await expect(page.locator("#app")).toHaveAttribute("data-chrome-mode", "panels");
        await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "true");
        const after = await savedWorld(page, fixture.campaignId);
        expect({ tick: after.tick, hero: after.depth.hero, companions: after.depth.companions })
          .toEqual({ tick: before.tick, hero: before.depth.hero, companions: before.depth.companions });
      }
    } catch (error) {
      await testInfo.attach(`compact-watch-${kind}-focus`, { contentType: "application/json", body: JSON.stringify(await page.evaluate(() => ({
        active: document.activeElement?.id,
        dialogs: Array.from(document.querySelectorAll("dialog[open]")).map((node) => node.id),
        chrome: document.querySelector<HTMLElement>("#app")?.dataset.chromeMode,
      })).catch(() => ({ pageUnavailable: true }))) });
      await page.screenshot({ path: testInfo.outputPath(`compact-watch-${kind}-failure.png`), timeout: 5_000 }).catch(() => undefined);
      throw error;
    } finally {
      await page.close();
    }
  }
  expect(errors).toEqual([]);
  expect(inference).toEqual([]);
});
