import { expect, test } from "@playwright/test";
import { advanceWorld, createWorld, upgradeWorldState } from "../src/core/simulation";
import { createForwardMotionState } from "../src/core/forward-motion";
import { projectCounterDuelHabit } from "../src/depth/counter-duel";
import { resolveCombatTurn } from "../src/depth/combat";
import { projectCombatRoster } from "../src/depth/combat-roster";
import { canUnlockDungeonGate, chooseDungeonMove, generateDungeon, moveDungeon, projectDungeonMoveKnowledge } from "../src/depth/dungeon";
import { advanceDepth, stepDepth } from "../src/depth/state";
import { generateTown, visitTown } from "../src/depth/towns";
import type { DungeonState } from "../src/depth/types";
import { projectLatestCombatTurn } from "../src/render/combat-choreography";
import { readFileSync } from "node:fs";

const appVersion = (JSON.parse(readFileSync(new URL("../public/version.json", import.meta.url), "utf8")) as { version: string }).version;

test("keeps one Shared Road Oath companion consistent across combat, Journal, responsive layouts, and farewell", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });

  const base = createWorld("browser-shared-road", "campaign:browser-shared-road");
  const originId = base.depth.atlas.currentLocationId;
  const current = base.depth.atlas.locations.find(
    (location) => location.kind === "town" && location.id !== originId,
  );
  if (current === undefined) throw new Error("Browser Shared Road fixture needs another town");
  const town = visitTown(generateTown(base.seed, current.id));
  const eligible = upgradeWorldState({
    ...base,
    scene: { ...base.scene, mode: "town" as const, location: town.name },
    forwardMotion: createForwardMotionState(current.id, base.tick),
    depth: {
      ...base.depth,
      atlas: {
        ...base.depth.atlas,
        currentLocationId: current.id,
        discoveredLocationIds: [originId, current.id],
        route: null,
      },
      towns: { ...base.depth.towns, [current.id]: town },
    },
  });
  const joined = advanceWorld(eligible);
  const companion = joined.depth.companions.active[0];
  if (companion === undefined) throw new Error("Browser Shared Road fixture did not recruit");
  const routed = advanceWorld(joined);
  const battleDepth = stepDepth(routed.depth, {
    type: "start-combat",
    encounterId: "encounter:browser-shared-road",
    enemyCount: 1,
  });
  const battle = upgradeWorldState({
    ...routed,
    tick: battleDepth.tick,
    hero: {
      ...routed.hero,
      health: battleDepth.hero.resources.health,
      maxHealth: battleDepth.hero.resources.maxHealth,
    },
    scene: {
      ...routed.scene,
      mode: "battle" as const,
      headline: `${companion.identity.name} joins the formation.`,
      action: "The road companion becomes a separate tactical ally.",
      consequence: "Identity, health, turn order, and allegiance remain canonical.",
      sensoryIntensity: 3 as const,
    },
    lifecycle: {
      ...routed.lifecycle,
      simulationTick: battleDepth.tick,
      worldClockMinutes: routed.lifecycle.worldClockMinutes + 15,
    },
    depth: battleDepth,
  });
  const routedCompanion = routed.depth.companions.active[0];
  if (routedCompanion === undefined) throw new Error("Browser Shared Road routed fixture lost its companion");
  const injured = upgradeWorldState({
    ...routed,
    scene: {
      ...routed.scene,
      mode: "travel" as const,
      headline: `${companion.identity.name} is carried onward.`,
      action: "The oath survives a grave injury.",
      consequence: `Evacuation continues toward ${companion.destination.name}.`,
      sensoryIntensity: 2 as const,
    },
    depth: {
      ...routed.depth,
      companions: {
        ...routed.depth.companions,
        active: [{
          ...routedCompanion,
          resources: { ...routedCompanion.resources, health: 0 },
          injury: "fallen" as const,
        }],
      },
    },
  });

  let departed = joined;
  for (let step = 0; step < 96 && departed.depth.companions.former.length === 0; step += 1) {
    departed = advanceWorld(departed);
  }
  if (departed.depth.companions.former.length !== 1) throw new Error("Browser Shared Road fixture did not finish");
  departed = upgradeWorldState(JSON.parse(JSON.stringify(departed)));

  await page.addInitScript(({ battleWorld, injuredWorld, departedWorld }) => {
    const phase = localStorage.getItem("the-grind-2:test-companion-phase");
    const world = phase === "departed"
      ? departedWorld
      : phase === "injured"
        ? injuredWorld
        : battleWorld;
    sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world));
    sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, { battleWorld: battle, injuredWorld: injured, departedWorld: departed });
  await page.goto("./");
  await page.waitForFunction(() => {
    if (document.documentElement.dataset.ready !== "true") return false;
    const app = document.querySelector<HTMLElement>("#app");
    const button = document.querySelector<HTMLButtonElement>("#pause-button");
    if (app === null || button === null) return false;
    if (app.dataset.presentationPaused !== "true") button.click();
    return app.dataset.presentationPaused === "true";
  }, undefined, { polling: 20, timeout: 20_000 });

  const card = page.locator("#companion-card");
  const stage = page.locator("#stage");
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-companion-id", companion.identity.residentId);
  await expect(card).toHaveAttribute(
    "data-health",
    `${companion.resources.health}/${companion.combat.maxHealth}`,
  );
  await expect(page.locator("#companion-name")).toHaveText(companion.identity.name);
  await expect(page.locator("#companion-role")).toHaveText(companion.identity.role);
  await expect(stage).toHaveAttribute("data-companion-id", companion.identity.residentId);
  await expect(stage).toHaveAttribute("data-companion-status", "travelling");

  const heroes = page.locator('#battle-roster .battle-unit[data-side="heroes"]');
  await expect(heroes).toHaveCount(2);
  const companionUnit = page.locator(`#battle-roster .battle-unit[data-unit-id="${companion.identity.residentId}"]`);
  await expect(companionUnit).toBeVisible();
  await expect(companionUnit.locator(".battle-unit-name")).toHaveText(companion.identity.name);
  await expect(companionUnit).toHaveAttribute(
    "data-health",
    `${companion.resources.health}/${companion.combat.maxHealth}`,
  );

  await page.locator('.view-button[data-view="journal"]').click();
  const activeRecord = page.locator("#journal-companion-active .journal-companion-record");
  await expect(activeRecord).toBeVisible();
  await expect(activeRecord).toHaveAttribute("data-companion-id", companion.identity.residentId);
  await expect(activeRecord).toContainText(companion.destination.name);
  await expect(activeRecord).toContainText(`HP ${companion.resources.health}/${companion.combat.maxHealth}`);
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.locator('.view-button[data-view="watch"]').click();
    await page.screenshot({ path: "/tmp/the-grind-2-shared-road.png", fullPage: true });
    await page.locator('.view-button[data-view="journal"]').click();
  }

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.locator('.view-button[data-view="watch"]').click();
    await expect(card).toBeVisible();
    const cardBounds = await card.boundingBox();
    await page.locator('.view-button[data-view="journal"]').click();
    await expect(activeRecord).toBeVisible();
    const recordBounds = await activeRecord.boundingBox();
    expect(cardBounds).not.toBeNull();
    expect(recordBounds).not.toBeNull();
    expect(cardBounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((cardBounds?.x ?? 0) + (cardBounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
    expect(recordBounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((recordBounds?.x ?? 0) + (recordBounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('.view-button[data-view="watch"]').click();
  await page.addStyleTag({ content: "#stage canvas { display: none !important; }" });
  await expect(page.locator("#stage canvas")).toBeHidden();
  await expect(card).toBeVisible();
  await page.locator('.view-button[data-view="journal"]').click();
  await expect(activeRecord).toBeVisible();

  await page.evaluate(() => localStorage.setItem("the-grind-2:test-companion-phase", "injured"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    if (document.documentElement.dataset.ready !== "true") return false;
    const app = document.querySelector<HTMLElement>("#app");
    const button = document.querySelector<HTMLButtonElement>("#pause-button");
    if (app === null || button === null) return false;
    if (app.dataset.presentationPaused !== "true") button.click();
    return app.dataset.presentationPaused === "true";
  }, undefined, { polling: 20, timeout: 20_000 });
  await expect(page.locator("#companion-card")).toBeVisible();
  await expect(page.locator("#companion-card")).toHaveAttribute("data-status", "injured");
  await expect(page.locator("#companion-card")).toHaveAttribute("data-injured", "true");
  await expect(page.locator("#companion-card")).toHaveAttribute("data-health", `0/${companion.combat.maxHealth}`);
  await expect(page.locator("#companion-purpose")).toHaveText(`Injured en route to ${companion.destination.name}`);
  await expect(page.locator("#stage")).toHaveAttribute("data-companion-status", "injured");

  await page.evaluate(() => localStorage.setItem("the-grind-2:test-companion-phase", "departed"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    if (document.documentElement.dataset.ready !== "true") return false;
    const app = document.querySelector<HTMLElement>("#app");
    const button = document.querySelector<HTMLButtonElement>("#pause-button");
    if (app === null || button === null) return false;
    if (app.dataset.presentationPaused !== "true") button.click();
    return app.dataset.presentationPaused === "true";
  }, undefined, { polling: 20, timeout: 20_000 });
  await expect(page.locator("#companion-card")).toBeHidden();
  await expect(page.locator("#stage")).not.toHaveAttribute("data-companion-id", /.+/);
  await page.locator('.view-button[data-view="journal"]').click();
  await expect(page.locator("#journal-companion-active")).toBeHidden();
  const former = page.locator("#journal-companion-former .journal-companion-record");
  await expect(former).toHaveCount(1);
  await expect(former).toHaveAttribute("data-companion-id", companion.identity.residentId);
  await expect(former).toContainText(companion.destination.name);
  await expect(former).toContainText(/Oath fulfilled|Journey ended by injury/);
  expect(errors).toEqual([]);
});

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
    /^(planning|companion-oath|explore-unseen|avoid-immediate-reverse|only-open-road|least-recent|counter-duel|dungeon-(?:disarm|shrine|sighted-key|complete|completed|explore|hazard|retrace|return-to-gate|unlock-gate|cross-gate))$/,
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
    depthSchemaVersion: 9,
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
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const base = createWorld("browser-tactical-combat", "campaign:browser-tactical-combat");
  let depth = stepDepth(base.depth, { type: "start-combat", encounterId: "encounter:browser-tactical-combat", enemyCount: 1 });
  if (depth.combat === null) throw new Error("Tactical-combat fixture failed to start");
  const heroUnit = depth.combat.combatants.find((combatant) => combatant.side === "heroes");
  const enemyUnit = depth.combat.combatants.find((combatant) => combatant.side === "enemies");
  if (heroUnit === undefined || enemyUnit === undefined) throw new Error("Tactical-combat fixture lacks combatants");
  const ability = {
    id: "ability:browser:ember-bind",
    name: "Ember Bind",
    kind: "spell" as const,
    effect: "burning" as const,
    level: 1,
    experience: 0,
    uses: 0,
    manaCost: 2,
    potency: 4,
    sourceMonsterId: null,
  };
  const stagedCombat = {
    ...depth.combat,
    activeIndex: 0,
    turnOrder: [heroUnit.id, enemyUnit.id],
    combatants: depth.combat.combatants.map((combatant) => combatant.id === heroUnit.id
      ? {
          ...combatant,
          health: Math.max(2, combatant.health),
          mana: Math.max(ability.manaCost, combatant.mana),
          maxMana: Math.max(ability.manaCost, combatant.maxMana),
          statuses: [{ kind: "poisoned" as const, duration: 2, potency: 1 }],
          abilities: [...combatant.abilities, ability],
        }
      : { ...combatant, health: 1 }),
  };
  const resolvedCombat = resolveCombatTurn(stagedCombat, {
    actorId: heroUnit.id,
    type: "ability",
    targetId: enemyUnit.id,
    abilityId: ability.id,
  }, depth.seed);
  if (resolvedCombat.outcome !== "victory") throw new Error("Tactical-combat fixture did not reach victory");
  const resolvedHero = resolvedCombat.combatants.find((combatant) => combatant.id === heroUnit.id);
  if (resolvedHero === undefined) throw new Error("Tactical-combat fixture lost its hero");
  depth = {
    ...depth,
    combat: null,
    completedCombats: [...depth.completedCombats, resolvedCombat],
    hero: {
      ...depth.hero,
      resources: {
        ...depth.hero.resources,
        health: resolvedHero.health,
        mana: resolvedHero.mana,
      },
    },
  };
  const fixture = {
    ...base,
    tick: depth.tick,
    hero: { ...base.hero, health: depth.hero.resources.health },
    depth,
    scene: {
      ...base.scene,
      mode: "battle" as const,
      headline: "A tactical battle resolves one canonical action.",
      action: "The canonical terminal turn resolves.",
      consequence: "The battle ends in victory",
      sensoryIntensity: 3 as const,
    },
    lifecycle: {
      ...base.lifecycle,
      simulationTick: depth.tick,
      worldClockMinutes: depth.tick * 15,
    },
  };
  const summary = projectLatestCombatTurn(resolvedCombat);
  const rosterProjection = projectCombatRoster(resolvedCombat);
  if (summary === null) throw new Error("Tactical-combat fixture has no canonical turn summary");
  if (rosterProjection === null) throw new Error("Tactical-combat fixture has no canonical roster projection");
  expect(() => upgradeWorldState(fixture)).not.toThrow();
  await page.addInitScript((world) => {
    const key = `the-grind-2:campaign:${world.campaignId}`;
    if (sessionStorage.getItem(key) !== null) return;
    sessionStorage.setItem(key, JSON.stringify(world));
    sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, fixture);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", {
    timeout: 15_000,
  });
  const stage = page.locator("#stage");
  await expect(stage).toHaveAttribute("data-reduced-motion", "true");
  await page.waitForFunction(() => {
    const stageElement = document.querySelector<HTMLElement>("#stage");
    const pauseButton = document.querySelector<HTMLButtonElement>("#pause-button");
    if (document.documentElement.dataset.ready !== "true" || stageElement === null || pauseButton === null) return false;
    if (pauseButton.textContent !== "Resume") pauseButton.click();
    return pauseButton.textContent === "Resume";
  }, undefined, { polling: 20, timeout: 15_000 });
  await expect(stage).toHaveAttribute("data-encounter-engine", "rpg-combat");
  await expect(stage).toHaveAttribute("data-combat-event", summary.id);
  const strip = page.locator("#battle-turn-strip");
  await expect(strip).toBeVisible();
  await expect(strip).toHaveText(`Turn ${summary.turn} · ${summary.text}`);
  await expect(strip).toHaveAttribute("data-combat-id", resolvedCombat.id);
  await expect(strip).toHaveAttribute("data-turn", String(summary.turn));
  await expect(strip).toHaveAttribute("data-actor", summary.actorId);
  await expect(strip).toHaveAttribute("data-target", summary.targetId ?? "none");
  await expect(strip).toHaveAttribute("data-action", summary.action);
  await expect(strip).toHaveAttribute("data-interrupted", String(summary.intentInterrupted));
  await expect(stage).toHaveAttribute("data-combat-interrupted", String(summary.intentInterrupted));
  if (summary.abilityId !== null) await expect(strip).toHaveAttribute("data-ability", summary.abilityId);
  if (summary.mana !== null) {
    await expect(strip).toHaveAttribute("data-mana-before", String(summary.mana.manaBefore));
    await expect(strip).toHaveAttribute("data-mana-spent", String(summary.mana.amount));
    await expect(strip).toHaveAttribute("data-mana-after", String(summary.mana.manaAfter));
    await expect(stage).toHaveAttribute("data-combat-mana-delta", `${summary.mana.manaBefore}:${summary.mana.amount}:${summary.mana.manaAfter}`);
  }
  if (summary.damage !== null) {
    await expect(strip).toHaveAttribute("data-health-before", String(summary.damage.healthBefore));
    await expect(strip).toHaveAttribute("data-damage", String(summary.damage.amount));
    await expect(strip).toHaveAttribute("data-health-after", String(summary.damage.healthAfter));
    await expect(stage).toHaveAttribute("data-combat-health-delta", `${summary.damage.healthBefore}:${summary.damage.amount}:${summary.damage.healthAfter}`);
  }
  const expectedStatuses = summary.statusEvents.map((event) => `${event.kind}:${event.status}`).join(",");
  const expectedStatusDurations = summary.statusEvents.map((event) =>
    `${event.status}:${event.kind === "status-applied" ? event.durationBefore ?? 0 : event.durationBefore}->${event.durationAfter}`
  ).join(",");
  await expect(strip).toHaveAttribute("data-statuses", expectedStatuses);
  await expect(strip).toHaveAttribute("data-status-durations", expectedStatusDurations);
  await expect(stage).toHaveAttribute("data-combat-statuses", expectedStatuses);
  await expect(stage).toHaveAttribute("data-combat-status-durations", expectedStatusDurations);
  await expect(strip).toHaveAttribute("data-defeated", enemyUnit.id);
  await expect(strip).toHaveAttribute("data-outcome", "victory");
  await expect(stage).toHaveAttribute("data-combat-defeated", enemyUnit.id);
  await expect(stage).toHaveAttribute("data-combat-outcome", "victory");
  await expect(stage).toHaveAttribute("data-combat-active-unit", "none");
  await expect(stage).not.toHaveAttribute("data-dungeon-alert-text-resolution", /.+/);
  await expect(stage).not.toHaveAttribute("data-dungeon-alert-banner-resolution", /.+/);
  const overview = page.locator("#battle-overview");
  const roster = page.locator("#battle-roster");
  const upcoming = page.locator("#battle-upcoming");
  await expect(overview).toBeVisible();
  await expect(overview).toHaveAttribute("data-combat-id", resolvedCombat.id);
  await expect(overview).toHaveAttribute("data-active-unit", "none");
  await expect(roster.locator(".battle-unit")).toHaveCount(2);
  await expect(roster.locator(`[data-unit-id="${heroUnit.id}"]`)).toContainText(`HP ${resolvedHero.health}/${resolvedHero.maxHealth}`);
  await expect(roster.locator(`[data-unit-id="${enemyUnit.id}"]`)).toHaveAttribute("data-living", "false");
  await expect(roster.locator(`[data-unit-id="${enemyUnit.id}"]`)).toContainText("Defeated this turn");
  await expect(upcoming.locator("li")).toHaveCount(0);
  expect(JSON.parse(await stage.getAttribute("data-combat-upcoming") ?? "null")).toEqual([]);
  expect(JSON.parse(await stage.getAttribute("data-combat-roster") ?? "null")).toEqual(
    rosterProjection.units.map((unit) => ({
      id: unit.id,
      side: unit.side,
      alive: unit.alive,
      health: unit.health,
      maxHealth: unit.maxHealth,
      mana: unit.mana,
      maxMana: unit.maxMana,
    })),
  );
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
  const parity = await page.evaluate(() => {
    const stageElement = document.querySelector<HTMLElement>("#stage");
    const stripElement = document.querySelector<HTMLElement>("#battle-turn-strip");
    return {
      stage: [stageElement?.dataset.combatActor, stageElement?.dataset.combatTarget, stageElement?.dataset.combatAction],
      strip: [stripElement?.dataset.actor, stripElement?.dataset.target, stripElement?.dataset.action],
    };
  });
  expect(parity.stage).toEqual(parity.strip);
  const frozenStrip = await strip.evaluate((element) => ({ text: element.textContent, data: { ...element.dataset } }));
  await page.waitForTimeout(350);
  await expect(stage).toHaveAttribute("data-combat-event", frozen.event ?? "");
  await expect(stage).toHaveAttribute("data-combat-phase", frozen.phase ?? "");
  expect(await strip.evaluate((element) => ({ text: element.textContent, data: { ...element.dataset } }))).toEqual(frozenStrip);
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(strip).toBeVisible();
    await expect(overview).toBeVisible();
    const bounds = await strip.boundingBox();
    const overviewBounds = await overview.boundingBox();
    expect(bounds).not.toBeNull();
    expect(overviewBounds).not.toBeNull();
    expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
    if (viewport.height <= 390) {
      expect(bounds?.y ?? -1).toBeGreaterThanOrEqual(0);
      expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(viewport.height + 1);
    }
    expect(overviewBounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((overviewBounds?.x ?? 0) + (overviewBounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
    await expect(strip).toHaveText(`Turn ${summary.turn} · ${summary.text}`);
  }
  await page.addStyleTag({ content: "#stage canvas { display: none !important; }" });
  await expect(page.locator("#stage canvas")).toBeHidden();
  await expect(strip).toBeVisible();
  await expect(overview).toBeVisible();
  await expect(roster.locator(".battle-unit")).toHaveCount(2);
  await expect(strip).toHaveText(`Turn ${summary.turn} · ${summary.text}`);
  await expect(page.locator("#scene-action")).not.toBeEmpty();
  await expect(page.locator("#scene-consequence")).toHaveText("The battle ends in victory");
  expect(errors).toEqual([]);
});

test("presents a six-unit tactical roster and next-three living turns", async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });

  const base = createWorld("browser-combat-roster", "campaign:browser-combat-roster");
  const started = stepDepth(base.depth, { type: "start-combat", encounterId: "encounter:browser-combat-roster", enemyCount: 5 });
  if (started.combat === null) throw new Error("Six-unit roster fixture failed to start");
  const hero = started.combat.combatants.find((unit) => unit.side === "heroes");
  const enemies = started.combat.combatants.filter((unit) => unit.side === "enemies");
  const target = enemies[0];
  const afflicted = enemies[1];
  if (hero === undefined || target === undefined || afflicted === undefined || enemies.length !== 5) {
    throw new Error("Six-unit roster fixture lacks combatants");
  }
  const stagedCombat = {
    ...started.combat,
    activeIndex: started.combat.turnOrder.indexOf(hero.id),
    combatants: started.combat.combatants.map((unit) => unit.id === target.id
      ? { ...unit, health: 1 }
      : unit.id === afflicted.id
        ? { ...unit, statuses: [{ kind: "weakened" as const, duration: 2, potency: 3 }] }
        : unit),
  };
  const resolvedCombat = resolveCombatTurn(stagedCombat, {
    actorId: hero.id,
    type: "attack",
    targetId: target.id,
    abilityId: null,
  }, started.seed);
  if (resolvedCombat.outcome !== "ongoing") throw new Error("Six-unit roster fixture ended unexpectedly");
  const projection = projectCombatRoster(resolvedCombat);
  if (projection === null || projection.units.length !== 6 || projection.upcomingTurns.length !== 3) {
    throw new Error("Six-unit roster projection is incomplete");
  }
  const depth = { ...started, combat: resolvedCombat };
  const fixture = {
    ...base,
    tick: depth.tick,
    depth,
    scene: {
      ...base.scene,
      mode: "battle" as const,
      headline: "Six combatants hold a readable formation.",
      action: "The latest target falls while the living turn order advances.",
      consequence: "Every resource, status, target, defeat, and next actor remains visible.",
      sensoryIntensity: 3 as const,
    },
    lifecycle: {
      ...base.lifecycle,
      simulationTick: depth.tick,
      worldClockMinutes: depth.tick * 15,
    },
  };
  expect(() => upgradeWorldState(fixture)).not.toThrow();
  await page.addInitScript((world) => {
    sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world));
    sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, fixture);
  await page.goto("./");
  await page.waitForFunction(() => {
    if (document.documentElement.dataset.ready !== "true") return false;
    const app = document.querySelector<HTMLElement>("#app");
    const button = document.querySelector<HTMLButtonElement>("#pause-button");
    if (app === null || button === null) return false;
    if (app.dataset.presentationPaused !== "true") button.click();
    return app.dataset.presentationPaused === "true";
  }, undefined, { polling: 20, timeout: 20_000 });

  const stage = page.locator("#stage");
  const overview = page.locator("#battle-overview");
  const roster = page.locator("#battle-roster");
  const upcoming = page.locator("#battle-upcoming");
  await expect(stage).toHaveAttribute("data-encounter-engine", "rpg-combat");
  await expect(stage).toHaveAttribute("data-combat-focus-target", target.id);
  await expect(stage).toHaveAttribute("data-combat-focus-kind", "action-target");
  await expect(stage).toHaveAttribute("data-combat-active-unit", projection.activeUnitId ?? "none");
  await expect(stage).not.toHaveAttribute("data-dungeon-alert-text-resolution", /.+/);
  await expect(stage).not.toHaveAttribute("data-dungeon-alert-banner-resolution", /.+/);
  await expect(overview).toBeVisible();
  await expect(overview).toHaveAttribute("data-active-unit", projection.activeUnitId ?? "none");
  await expect(overview).toHaveAttribute("data-focus-target", target.id);
  await expect(overview).toHaveAttribute("data-upcoming", projection.upcomingTurns.map((turn) => turn.unitId).join(","));
  await expect(roster.locator(".battle-unit")).toHaveCount(6);
  expect(await roster.locator(".battle-unit").evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.unitId))).toEqual(
    projection.units.map((unit) => unit.id),
  );
  for (const unit of projection.units) {
    const row = roster.locator(`[data-unit-id="${unit.id}"]`);
    await expect(row).toHaveAttribute("data-living", String(unit.alive));
    await expect(row).toHaveAttribute("data-health", `${unit.health}/${unit.maxHealth}`);
    await expect(row).toHaveAttribute("data-mana", `${unit.mana}/${unit.maxMana}`);
    await expect(row).toContainText(`HP ${unit.health}/${unit.maxHealth} · MP ${unit.mana}/${unit.maxMana}`);
    await expect(row.locator("progress")).toHaveCount(2);
  }
  await expect(roster.locator(`[data-unit-id="${target.id}"]`)).toContainText("Target");
  await expect(roster.locator(`[data-unit-id="${target.id}"]`)).toContainText("Defeated this turn");
  await expect(roster.locator(`[data-unit-id="${afflicted.id}"]`)).toContainText("Weakened 2t · potency 3");
  if (projection.activeUnitId !== null) {
    await expect(roster.locator(`[data-unit-id="${projection.activeUnitId}"]`)).toContainText("Next");
  }
  await expect(upcoming.locator("li")).toHaveCount(3);
  for (const turn of projection.upcomingTurns) {
    await expect(upcoming.locator(`[data-slot="${turn.slot}"]`)).toHaveText(`${turn.slot} · ${turn.unitName}`);
  }
  expect(JSON.parse(await stage.getAttribute("data-combat-upcoming") ?? "null")).toEqual(
    projection.upcomingTurns.map((turn) => turn.unitId),
  );
  expect(JSON.parse(await stage.getAttribute("data-combat-roster-statuses") ?? "null")).toEqual(
    projection.units.map((unit) => ({ id: unit.id, statuses: unit.statuses })),
  );

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(overview).toBeVisible();
    const bounds = await overview.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
    expect(await overview.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }
  await page.addStyleTag({ content: "#stage canvas { display: none !important; }" });
  await expect(page.locator("#stage canvas")).toBeHidden();
  await expect(overview).toBeVisible();
  await expect(roster.locator(".battle-unit")).toHaveCount(6);
  await expect(upcoming.locator("li")).toHaveCount(3);
  expect(errors).toEqual([]);
});

test("stages and resumes a responsive autonomous Pattern Duel", async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });

  const base = createWorld("browser-counter-duel", "campaign:browser-counter-duel");
  const command = { type: "start-counter-duel", encounterId: "encounter:browser-counter-duel" } as const;
  const preview = stepDepth(base.depth, command);
  const speciesId = preview.counterDuel?.opponentSpeciesId;
  const observed = preview.hero.monsterLore.find((entry) => entry.monsterId === speciesId);
  if (speciesId === undefined || observed === undefined) throw new Error("Browser field-note fixture has no species");
  const preparedDepth = {
    ...base.depth,
    hero: { ...base.depth.hero, monsterLore: [{ ...observed, encounters: 2 }] },
  };
  const depth = stepDepth(preparedDepth, command);
  if (depth.counterDuel === null) throw new Error("Browser field-note fixture has no active duel");
  const habit = projectCounterDuelHabit(depth.counterDuel, depth.hero.monsterLore);
  if (habit.status !== "established") throw new Error("Browser field-note fixture did not cross the third encounter");
  const fixture = {
    ...base,
    tick: depth.tick,
    depth,
    scene: {
      ...base.scene,
      mode: "battle" as const,
      headline: `Pattern Duel: ${depth.counterDuel?.opponentName ?? "a rival"} declares the three answers.`,
      action: `The rival shows a public tell. Field note completed: ${habit.label}.`,
      consequence: `Live evidence and field note remain separate; ${habit.label}, but no committed stance is revealed.`,
      sensoryIntensity: 3 as const,
    },
    lifecycle: {
      ...base.lifecycle,
      simulationTick: depth.tick,
      worldClockMinutes: 15,
    },
  };
  expect(() => upgradeWorldState(fixture)).not.toThrow();
  await page.addInitScript((world) => {
    const key = `the-grind-2:campaign:${world.campaignId}`;
    if (sessionStorage.getItem(key) !== null) return;
    sessionStorage.setItem(key, JSON.stringify(world));
    sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, fixture);

  await page.goto("./?fast");
  await page.waitForFunction(() => {
    if (document.documentElement.dataset.ready !== "true") return false;
    const app = document.querySelector<HTMLElement>("#app");
    const button = document.querySelector<HTMLButtonElement>("#pause-button");
    if (app === null || button === null) return false;
    if (app.dataset.presentationPaused !== "true") button.click();
    return app.dataset.presentationPaused === "true";
  }, undefined, { polling: 20, timeout: 30_000 });

  const stage = page.locator("#stage");
  const pause = page.locator("#pause-button");
  const traversal = page.locator("#traversal-progress-text");
  const directive = page.locator("#traversal-directive");
  await expect(stage).toHaveAttribute("data-scene-mode", "battle");
  await expect(stage).toHaveAttribute("data-encounter-engine", "counter-triangle");
  await expect(page.locator("#battle-turn-strip")).toBeHidden();
  await expect(page.locator("#battle-turn-strip")).toBeEmpty();
  await expect(page.locator("#battle-overview")).toBeHidden();
  await expect(page.locator("#battle-roster")).toBeEmpty();
  await expect(page.locator("#battle-upcoming")).toBeEmpty();
  await expect(stage).not.toHaveAttribute("data-combat-event", /.+/);
  await expect(stage).not.toHaveAttribute("data-combat-status-durations", /.+/);
  await expect(stage).not.toHaveAttribute("data-combat-outcome", /.+/);
  await expect(stage).not.toHaveAttribute("data-combat-roster", /.+/);
  await expect(stage).not.toHaveAttribute("data-combat-upcoming", /.+/);
  await expect(stage).not.toHaveAttribute("data-combat-active-unit", /.+/);
  await expect(stage).not.toHaveAttribute("data-combat-focus-target", /.+/);
  await expect(stage).toHaveAttribute("data-counter-duel-id", "encounter:browser-counter-duel");
  await expect(stage).toHaveAttribute("data-counter-duel-outcome", "ongoing");
  await expect(stage).toHaveAttribute("data-reduced-motion", "true");
  await expect(stage).toHaveAttribute("data-counter-duel-phase", "tell");
  await expect(stage).toHaveAttribute("data-counter-duel-habit", habit.preferredStance);
  await expect(stage).toHaveAttribute("data-counter-duel-habit-progress", "3/3");
  await expect(traversal).toHaveAttribute("data-encounter-engine", "counter-triangle");
  await expect(traversal).toHaveAttribute("data-counter-duel-habit", habit.preferredStance);
  await expect(traversal).toHaveAttribute("data-counter-duel-habit-progress", "3/3");
  await expect(traversal).toContainText(/0–0/);
  await expect(traversal).toContainText(habit.label);
  await expect(directive).toHaveAttribute("data-reason", "counter-duel");
  await expect(directive).toContainText(/Live tell · (Rush|Ward|Feint) · Field note · favors (Rush|Ward|Feint)/);
  await expect(page.locator("#scene-headline")).toContainText("Pattern Duel");
  await expect(page.locator("#scene-action")).toContainText("Field note completed");

  const toolbar = page.locator("#view-toolbar");
  await toolbar.locator("[data-view=codex]").click();
  const codexHabit = page.locator(`#codex-grid .codex-monster[data-monster-id="${speciesId}"] .codex-habit`);
  await expect(codexHabit).toHaveAttribute("data-status", "established");
  await expect(codexHabit).toHaveAttribute("data-stance", habit.preferredStance);
  await expect(codexHabit).toContainText(habit.label);
  await expect(codexHabit).toContainText("habit, not intent");
  await toolbar.locator("[data-view=watch]").click();

  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await expect(stage).toHaveAttribute("data-encounter-engine", "counter-triangle");
    await expect(stage).toHaveAttribute("data-counter-duel-habit", habit.preferredStance);
    await expect(stage).toHaveAttribute("data-scene-layout", /\d+\.\d{4},-?\d+\.\d{4},-?\d+\.\d{4}/);
    const bounds = await stage.evaluate((element) => {
      const host = element.getBoundingClientRect();
      const canvas = element.querySelector("canvas")?.getBoundingClientRect();
      return canvas === undefined ? null : {
        inside: canvas.left >= host.left - 1 && canvas.right <= host.right + 1 && canvas.top >= host.top - 1 && canvas.bottom <= host.bottom + 1,
      };
    });
    expect(bounds?.inside).toBe(true);
  }

  await pause.click({ force: true });
  await page.waitForFunction(() => {
    const stageElement = document.querySelector<HTMLElement>("#stage");
    const button = document.querySelector<HTMLButtonElement>("#pause-button");
    if (stageElement?.dataset.counterDuelPrediction === undefined || button === null) return false;
    if (button.textContent !== "Resume") button.click();
    return button.textContent === "Resume";
  }, undefined, { polling: 20, timeout: 15_000 });
  await expect(stage).toHaveAttribute("data-counter-duel-phase", "static");
  await expect(stage).toHaveAttribute("data-counter-duel-prediction", /^(rush|ward|feint)$/);
  await expect(stage).toHaveAttribute("data-counter-duel-hero-stance", /^(rush|ward|feint)$/);
  await expect(stage).toHaveAttribute("data-counter-duel-opponent-stance", /^(rush|ward|feint)$/);
  await expect(stage).toHaveAttribute("data-counter-duel-result", /^(hero|opponent|tie)$/);
  const savedRound = await page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    const source = campaignId === null ? null : sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    if (source === null) return null;
    const world = JSON.parse(source) as Record<string, any>;
    return { round: world.depth.counterDuel?.round, history: world.depth.counterDuel?.history?.length };
  });
  expect(savedRound?.history).toBe(1);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    if (document.documentElement.dataset.ready !== "true") return false;
    const app = document.querySelector<HTMLElement>("#app");
    const button = document.querySelector<HTMLButtonElement>("#pause-button");
    if (app === null || button === null) return false;
    if (app.dataset.presentationPaused !== "true") button.click();
    return app.dataset.presentationPaused === "true";
  }, undefined, { polling: 20, timeout: 30_000 });
  await expect(stage).toHaveAttribute("data-encounter-engine", "counter-triangle");
  await expect(stage).toHaveAttribute("data-counter-duel-habit", habit.preferredStance);
  const reloadedRound = await page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    const source = campaignId === null ? null : sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    if (source === null) return null;
    const world = JSON.parse(source) as Record<string, any>;
    return { round: world.depth.counterDuel?.round, history: world.depth.counterDuel?.history?.length };
  });
  expect(reloadedRound).toEqual(savedRound);

  await pause.click({ force: true });
  await page.waitForFunction(() => {
    const stageElement = document.querySelector<HTMLElement>("#stage");
    const button = document.querySelector<HTMLButtonElement>("#pause-button");
    if (stageElement === null || button === null || stageElement.dataset.counterDuelOutcome === "ongoing") return false;
    if (button.textContent !== "Resume") button.click();
    return button.textContent === "Resume";
  }, undefined, { polling: 20, timeout: 30_000 });
  await expect(stage).toHaveAttribute("data-counter-duel-outcome", /^(victory|defeat|draw)$/);
  await expect(stage).toHaveAttribute("data-counter-duel-score", /^\d-\d$/);
  await expect(directive).toContainText("Resolved");
  expect(errors).toEqual([]);
});

test("redacts an unconfirmed Pattern Duel habit from every browser projection", async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const base = createWorld("browser-counter-unconfirmed", "campaign:browser-counter-unconfirmed");
  const command = { type: "start-counter-duel", encounterId: "encounter:browser-counter-unconfirmed" } as const;
  const preview = stepDepth(base.depth, command);
  const speciesId = preview.counterDuel?.opponentSpeciesId;
  const observed = preview.hero.monsterLore.find((entry) => entry.monsterId === speciesId);
  if (speciesId === undefined || observed === undefined) throw new Error("Unconfirmed browser fixture has no species");
  const depth = stepDepth({
    ...base.depth,
    hero: { ...base.depth.hero, monsterLore: [{ ...observed, encounters: 1 }] },
  }, command);
  const fixture = {
    ...base,
    tick: depth.tick,
    depth,
    scene: {
      ...base.scene,
      mode: "battle" as const,
      headline: "Pattern Duel: behavior still under study.",
      action: "The live tell is visible; the species habit remains unconfirmed.",
      consequence: "Two of three encounters are recorded; no stance has been inferred.",
      sensoryIntensity: 3 as const,
    },
    lifecycle: { ...base.lifecycle, simulationTick: depth.tick, worldClockMinutes: 15 },
  };
  expect(() => upgradeWorldState(fixture)).not.toThrow();
  expect(depth.log.at(-1)?.message).toContain("Habit unconfirmed · 2/3 encounters");
  expect(depth.log.at(-1)?.message).not.toContain("often favor");
  await page.addInitScript((world) => {
    sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world));
    sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, fixture);
  await page.goto("./?fast");
  await page.waitForFunction(() => {
    if (document.documentElement.dataset.ready !== "true") return false;
    const app = document.querySelector<HTMLElement>("#app");
    const button = document.querySelector<HTMLButtonElement>("#pause-button");
    if (app === null || button === null) return false;
    if (app.dataset.presentationPaused !== "true") button.click();
    return app.dataset.presentationPaused === "true";
  }, undefined, { polling: 20, timeout: 30_000 });

  const stage = page.locator("#stage");
  const traversal = page.locator("#traversal-progress-text");
  await expect(stage).toHaveAttribute("data-counter-duel-habit", "unconfirmed");
  await expect(stage).toHaveAttribute("data-counter-duel-habit-progress", "2/3");
  await expect(traversal).toHaveAttribute("data-counter-duel-habit", "unconfirmed");
  await expect(traversal).toHaveAttribute("data-counter-duel-habit-progress", "2/3");
  await expect(traversal).toContainText("Habit unconfirmed · 2/3 encounters");
  await expect(page.locator("#traversal-directive")).toContainText("Habit unconfirmed 2/3");
  await page.locator("#view-toolbar [data-view=codex]").click();
  const codexHabit = page.locator(`#codex-grid .codex-monster[data-monster-id="${speciesId}"] .codex-habit`);
  await expect(codexHabit).toHaveAttribute("data-status", "unconfirmed");
  await expect(codexHabit).not.toHaveAttribute("data-stance", /.+/);
  await expect(codexHabit).toContainText("2/3 encounters recorded; no stance inferred");
  await expect(codexHabit).not.toContainText("often favor");
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

test("shows the Wayfinder Key return, stationary unlock, and next-tick shortcut crossing", async ({ page }) => {
  test.setTimeout(180_000);
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

  const base = createWorld("browser-wayfinder", "campaign:browser-wayfinder");
  let generated: DungeonState | null = null;
  for (let index = 0; index < 32 && generated === null; index += 1) {
    const candidate = generateDungeon(base.depth.seed, `dungeon:browser-wayfinder:${index}`, 7, 7);
    if (
      candidate.keyGate?.shortcutCellId !== candidate.exitCellId
      && !projectDungeonMoveKnowledge(candidate).some((move) => move.sightedWayfinderKey)
    ) generated = candidate;
  }
  if (generated === null) throw new Error("Browser Wayfinder fixture found no non-exit shortcut");
  let sighted: DungeonState = {
    ...generated,
    cells: generated.cells.map((cell) => cell.feature === "trap" ? { ...cell, feature: "empty" as const } : cell),
    traps: [],
  };
  let hidden = sighted;
  for (let turn = 0; turn < sighted.cells.length * 2; turn += 1) {
    if (projectDungeonMoveKnowledge(sighted).some((move) => move.sightedWayfinderKey)) break;
    hidden = sighted;
    const direction = chooseDungeonMove(sighted, base.depth.seed, turn);
    if (direction === null) throw new Error("Browser Wayfinder fixture cannot reach its key");
    sighted = moveDungeon(sighted, direction);
    if (sighted.keyGate?.phase !== "uncollected") break;
  }
  const sightedMove = projectDungeonMoveKnowledge(sighted).find((move) => move.sightedWayfinderKey);
  if (sightedMove === undefined) throw new Error("Browser Wayfinder fixture did not stop before collection");
  let returning = moveDungeon(sighted, sightedMove.direction);
  const gate = returning.keyGate;
  if (gate === null || gate.phase !== "carried") throw new Error("Browser Wayfinder fixture did not collect its key");
  let atGate = returning;
  for (let turn = 0; turn < atGate.cells.length && !canUnlockDungeonGate(atGate); turn += 1) {
    const direction = chooseDungeonMove(atGate, base.depth.seed, turn);
    if (direction === null) throw new Error("Browser Wayfinder fixture cannot return to its gate");
    atGate = moveDungeon(atGate, direction);
  }
  if (!canUnlockDungeonGate(atGate)) throw new Error("Browser Wayfinder fixture did not reach its gate");
  const dungeonWorld = (dungeon: DungeonState) => ({
    ...base,
    depth: { ...base.depth, dungeon },
    scene: {
      ...base.scene,
      mode: "dungeon" as const,
      location: dungeon.name,
      headline: `${dungeon.name}: the Wayfinder mechanism waits.`,
      action: `${base.hero.name} follows the mapped amber route.`,
      consequence: dungeon.traversalLog.at(-1) ?? "The maze remains unsolved.",
      sensoryIntensity: 2 as const,
    },
  });
  const hiddenWorld = dungeonWorld(hidden);
  const sightedWorld = dungeonWorld(sighted);
  const collectedWorld = advanceWorld(sightedWorld);
  const returningWorld = dungeonWorld(returning);
  const atGateWorld = dungeonWorld(atGate);
  const unlockedWorld = advanceWorld(atGateWorld);
  const crossedWorld = advanceWorld(unlockedWorld);
  expect(() => upgradeWorldState(hiddenWorld)).not.toThrow();
  expect(collectedWorld.depth.dungeon?.currentCellId).toBe(gate.keyCellId);
  expect(collectedWorld.depth.dungeon?.keyGate?.phase).toBe("carried");
  expect(() => upgradeWorldState(sightedWorld)).not.toThrow();
  expect(() => upgradeWorldState(collectedWorld)).not.toThrow();
  expect(() => upgradeWorldState(returningWorld)).not.toThrow();
  expect(() => upgradeWorldState(atGateWorld)).not.toThrow();
  expect(() => upgradeWorldState(unlockedWorld)).not.toThrow();
  expect(() => upgradeWorldState(crossedWorld)).not.toThrow();

  await page.goto("./?fast");
  await pauseOnReady();
  const stage = page.locator("#stage");
  const traversal = page.locator("#traversal-progress-text");
  const directive = page.locator("#traversal-directive");
  const stageFixture = async (fixture: typeof returningWorld) => {
    await page.evaluate((value) => sessionStorage.setItem("the-grind-2:test-fixture", JSON.stringify(value)), fixture);
    await page.reload({ waitUntil: "domcontentloaded" });
    await pauseOnReady();
    await expect(page.locator("#hero-name")).toHaveText(fixture.depth.hero.name, { timeout: 15_000 });
    await expect(stage).toHaveAttribute("data-scene-mode", "dungeon");
  };

  await stageFixture(hiddenWorld);
  await expect(stage).not.toHaveAttribute("data-dungeon-visible-objective", /.+/);
  await expect(stage).not.toHaveAttribute("data-dungeon-visible-objective-direction", /.+/);
  await expect(directive).not.toHaveAttribute("data-visible-objective", /.+/);
  await expect(directive).not.toContainText("Key sighted");

  await stageFixture(sightedWorld);
  await expect(stage).toHaveAttribute("data-reduced-motion", "true");
  await expect(stage).toHaveAttribute("data-dungeon-key-status", "sighted");
  await expect(stage).toHaveAttribute("data-dungeon-visible-objective", "wayfinder-key");
  await expect(stage).toHaveAttribute("data-dungeon-visible-objective-direction", sightedMove.direction);
  await expect(directive).toHaveAttribute("data-visible-objective", "wayfinder-key");
  await expect(directive).toHaveAttribute("data-visible-objective-direction", sightedMove.direction);
  await expect(directive).toHaveAttribute("data-frontier-cell", gate.keyCellId);
  await expect(directive).toHaveText(`Key sighted · entering ${sightedMove.direction}`);
  await expect(directive).toHaveAttribute("title", new RegExp(`visible Wayfinder Key.+${sightedMove.direction} chamber`, "i"));
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(stage).toHaveAttribute("data-dungeon-visible-objective-direction", sightedMove.direction);
    await expect(directive).toHaveText(`Key sighted · entering ${sightedMove.direction}`);
    const bounds = await stage.evaluate((element) => {
      const host = element.getBoundingClientRect();
      const canvas = element.querySelector("canvas")?.getBoundingClientRect();
      return canvas === undefined ? null : {
        inside: canvas.left >= host.left - 1 && canvas.right <= host.right + 1 && canvas.top >= host.top - 1 && canvas.bottom <= host.bottom + 1,
      };
    });
    expect(bounds?.inside).toBe(true);
  }

  await stageFixture(collectedWorld);
  await expect(stage).toHaveAttribute("data-dungeon-key-status", "carried");
  await expect(stage).toHaveAttribute("data-dungeon-gate-status", "locked");
  await expect(stage).toHaveAttribute("data-dungeon-traversal-mode", "return-to-gate");
  await expect(stage).toHaveAttribute("data-dungeon-breadcrumb-length", /[1-9]\d*/);
  await expect(stage).not.toHaveAttribute("data-dungeon-key-cell", /.+/);
  await expect(stage).not.toHaveAttribute("data-dungeon-gate-cell", /.+/);
  await expect(stage).not.toHaveAttribute("data-dungeon-visible-objective", /.+/);
  await expect(directive).not.toHaveAttribute("data-visible-objective", /.+/);
  await expect(traversal).toHaveAttribute("data-dungeon-key", "carried");
  await expect(traversal).toHaveAttribute("data-dungeon-gate", "locked");
  await expect(traversal).toContainText("Key carried · gate locked");
  await expect(directive).toContainText("Key carried · returning");

  await stageFixture(atGateWorld);
  await expect(stage).toHaveAttribute("data-dungeon-hero-cell", gate.unlockCellId);
  await expect(stage).toHaveAttribute("data-dungeon-traversal-mode", "unlock-gate");
  await expect(stage).toHaveAttribute("data-dungeon-next-directions", "");
  await expect(directive).toHaveText("Unlocking · Wayfinder Gate · stationary key-turn");

  await stageFixture(unlockedWorld);
  await expect(stage).toHaveAttribute("data-dungeon-key-status", "used");
  await expect(stage).toHaveAttribute("data-dungeon-gate-status", "open");
  await expect(stage).toHaveAttribute("data-dungeon-hero-cell", gate.unlockCellId);
  await expect(stage).toHaveAttribute("data-dungeon-traversal-mode", "cross-gate");
  await expect(directive).toContainText("Shortcut open · crossing");
  await expect(page.locator("#scene-headline")).toContainText("sealed shortcut opens");

  await stageFixture(crossedWorld);
  await expect(stage).toHaveAttribute("data-dungeon-key-status", "used");
  await expect(stage).toHaveAttribute("data-dungeon-gate-status", "open");
  await expect(stage).toHaveAttribute("data-dungeon-hero-cell", gate.shortcutCellId);
  await expect(page.locator("#scene-headline")).toContainText("maze folds shorter");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(stage).toHaveAttribute("data-scene-layout", /\d+\.\d{4},-?\d+\.\d{4},-?\d+\.\d{4}/);
  await expect(stage).toHaveAttribute("data-dungeon-hero-cell", gate.shortcutCellId);
  expect(errors).toEqual([]);
});

test("awakens one restorative shrine with exact responsive Canvas and DOM parity", async ({ page }) => {
  test.setTimeout(120_000);
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

  const base = createWorld("browser-restorative-shrine", "campaign:browser-restorative-shrine");
  const id = "dungeon:browser-restorative-shrine";
  const entry = `${id}:cell:1,1`;
  const shrine = `${id}:cell:2,1`;
  const dungeon: DungeonState = {
    layoutVersion: 1,
    keyGate: null,
    latestShrineUse: null,
    id,
    name: "Moonwell Reliquary",
    width: 3,
    height: 3,
    cells: [
      { id: `${id}:cell:0,0`, x: 0, y: 0, exits: ["east", "south"], feature: "empty" },
      { id: `${id}:cell:1,0`, x: 1, y: 0, exits: ["east", "south", "west"], feature: "empty" },
      { id: `${id}:cell:2,0`, x: 2, y: 0, exits: ["south", "west"], feature: "empty" },
      { id: `${id}:cell:0,1`, x: 0, y: 1, exits: ["north", "east", "south"], feature: "empty" },
      { id: entry, x: 1, y: 1, exits: ["north", "east", "south", "west"], feature: "empty" },
      { id: shrine, x: 2, y: 1, exits: ["north", "south", "west"], feature: "shrine" },
      { id: `${id}:cell:0,2`, x: 0, y: 2, exits: ["north", "east"], feature: "empty" },
      { id: `${id}:cell:1,2`, x: 1, y: 2, exits: ["north", "east", "west"], feature: "empty" },
      { id: `${id}:cell:2,2`, x: 2, y: 2, exits: ["north", "west"], feature: "empty" },
    ],
    entryCellId: entry,
    exitCellId: shrine,
    currentCellId: entry,
    visitedCellIds: [entry],
    discoveredCellIds: [
      `${id}:cell:0,0`, `${id}:cell:1,0`, `${id}:cell:2,0`,
      `${id}:cell:0,1`, entry, shrine,
      `${id}:cell:0,2`, `${id}:cell:1,2`, `${id}:cell:2,2`,
    ],
    traps: [],
    traversalLog: ["A cyan rune waits beyond the final passage."],
    turns: 0,
    completed: false,
  };
  const healthBefore = Math.max(0, base.depth.hero.resources.maxHealth - 10);
  const manaBefore = Math.max(0, base.depth.hero.resources.maxMana - 7);
  const before = {
    ...base,
    hero: { ...base.hero, health: healthBefore },
    depth: {
      ...base.depth,
      hero: {
        ...base.depth.hero,
        resources: { ...base.depth.hero.resources, health: healthBefore, mana: manaBefore },
      },
      dungeon,
    },
  };
  const fixture = advanceWorld(before);
  const use = fixture.depth.dungeon?.latestShrineUse;
  if (use === null || use === undefined) throw new Error("Browser shrine fixture did not awaken");
  const summary = `HP ${use.healthBefore}→${use.healthAfter} (+${use.healthRestored}) · MP ${use.manaBefore}→${use.manaAfter} (+${use.manaRestored})`;
  const expectedText = `SHRINE AWAKENS · ${summary}`;
  expect(fixture.depth.dungeon?.completed).toBe(true);
  expect(() => upgradeWorldState(JSON.parse(JSON.stringify(fixture)))).not.toThrow();

  await page.goto("./");
  await pauseOnReady();
  await page.evaluate((world) => sessionStorage.setItem("the-grind-2:test-fixture", JSON.stringify(world)), fixture);
  await page.reload({ waitUntil: "domcontentloaded" });
  await pauseOnReady();

  const stage = page.locator("#stage");
  const traversal = page.locator("#traversal-progress-text");
  const directive = page.locator("#traversal-directive");
  await expect(stage).toHaveAttribute("data-scene-mode", "dungeon");
  await expect(stage).toHaveAttribute("data-reduced-motion", "true");
  await expect(stage).toHaveAttribute("data-dungeon-shrine-state", "restored");
  await expect(stage).toHaveAttribute("data-dungeon-shrine-cell", shrine);
  await expect(stage).toHaveAttribute("data-dungeon-shrine-health", `${use.healthBefore}/${use.healthRestored}/${use.healthAfter}`);
  await expect(stage).toHaveAttribute("data-dungeon-shrine-mana", `${use.manaBefore}/${use.manaRestored}/${use.manaAfter}`);
  await expect(traversal).toHaveText(expectedText);
  await expect(directive).toHaveText(expectedText);
  await expect(directive).toHaveAttribute("data-reason", "dungeon-shrine");
  await expect(directive).toHaveAttribute("data-shrine-state", "restored");
  await expect(directive).toHaveAttribute("data-shrine-cell", shrine);
  await expect(directive).toHaveAttribute("data-shrine-health", `${use.healthBefore}/${use.healthRestored}/${use.healthAfter}`);
  await expect(directive).toHaveAttribute("data-shrine-mana", `${use.manaBefore}/${use.manaRestored}/${use.manaAfter}`);
  await expect(page.locator("#scene-action")).toHaveText(expectedText);
  await expect(page.locator("#scene-consequence")).toContainText(summary);

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(directive).toHaveText(expectedText);
    await expect.poll(() => page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#stage")?.getBoundingClientRect();
      const canvas = document.querySelector<HTMLCanvasElement>("#stage canvas")?.getBoundingClientRect();
      const card = document.querySelector<HTMLElement>(".traversal-card")?.getBoundingClientRect();
      return host === undefined || canvas === undefined || card === undefined ? null : {
        canvasInside: canvas.left >= host.left - 1 && canvas.right <= host.right + 1 && canvas.top >= host.top - 1 && canvas.bottom <= host.bottom + 1,
        cardInside: card.left >= -1 && card.right <= window.innerWidth + 1 && card.top >= -1 && card.bottom <= window.innerHeight + 1,
      };
    }), { timeout: 5_000 }).toEqual({ canvasInside: true, cardInside: true });
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await pauseOnReady();
  await expect(stage).toHaveAttribute("data-dungeon-shrine-health", `${use.healthBefore}/${use.healthRestored}/${use.healthAfter}`);
  await expect(directive).toHaveText(expectedText);
  await page.addStyleTag({ content: "#stage canvas { display: none !important; }" });
  await expect(page.locator("#stage canvas")).toBeHidden();
  await expect(traversal).toHaveText(expectedText);
  await expect(directive).toHaveText(expectedText);
  await expect(page.locator("#scene-action")).toHaveText(expectedText);

  await page.locator("#pause-button").click({ force: true });
  await expect(stage).not.toHaveAttribute("data-dungeon-shrine-state", /.+/, { timeout: 15_000 });
  await expect(traversal).not.toHaveAttribute("data-shrine-state", /.+/);
  await expect(directive).not.toHaveAttribute("data-shrine-state", /.+/);
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
      layoutVersion: 1,
      keyGate: null,
      latestShrineUse: null,
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
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(stage).toHaveAttribute("data-dungeon-alert-label", "TRAP DETECTED");
  const dpiContract = await stage.evaluate((element) => {
    const canvas = element.querySelector("canvas");
    const rendererResolution = Number(element.dataset.rendererResolution);
    const sceneScale = Number(element.dataset.sceneLayout?.split(",")[0]);
    return {
      rendererResolution,
      sceneScale,
      textResolution: Number(element.dataset.dungeonAlertTextResolution),
      bannerResolution: Number(element.dataset.dungeonAlertBannerResolution),
      detailResolution: Number(element.dataset.dungeonAlertDetailResolution),
      canvasDensity: canvas === null || canvas.clientWidth === 0 ? 0 : canvas.width / canvas.clientWidth,
    };
  });
  expect(dpiContract.sceneScale).toBe(6);
  const expectedTextResolution = Math.min(12, Math.max(1, Math.ceil(dpiContract.rendererResolution * dpiContract.sceneScale)));
  expect(dpiContract.textResolution).toBe(expectedTextResolution);
  expect(dpiContract.bannerResolution).toBe(expectedTextResolution);
  expect(dpiContract.detailResolution).toBe(expectedTextResolution);
  expect(dpiContract.textResolution).toBeGreaterThan(dpiContract.rendererResolution);
  expect(dpiContract.canvasDensity).toBeCloseTo(dpiContract.rendererResolution, 1);
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
