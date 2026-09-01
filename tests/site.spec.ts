import { expect, test } from "@playwright/test";
import { advanceWorld, createWorld, upgradeWorldState } from "../src/core/simulation";
import { createChampionInduction } from "../src/core/champions";
import { createCampaignLegacyState } from "../src/core/legends";
import { createForwardMotionState } from "../src/core/forward-motion";
import { createHeroGrowthState } from "../src/core/hero-growth";
import { projectCounterDuelHabit } from "../src/depth/counter-duel";
import { resolveCombatTurn } from "../src/depth/combat";
import { projectCombatRoster } from "../src/depth/combat-roster";
import { canUnlockDungeonGate, chooseDungeonMove, generateDungeon, moveDungeon, projectDungeonMoveKnowledge } from "../src/depth/dungeon";
import { projectSuccessorQuestLead } from "../src/depth/quest-lead";
import { applyWeaponUseMastery, describeCompletedQuestReward, describeWeaponUseReceipt, heroExperienceFloor, heroLevelForExperience, heroMasteryForExperience, maximumHeroLevel, questObjectiveRuleLabel } from "../src/depth/rpg";
import { describeEncounterThreat, encounterThreatBand } from "../src/depth/threat";
import { advanceDepth, stepDepth } from "../src/depth/state";
import { generateTown, visitTown } from "../src/depth/towns";
import type { DepthState, DungeonState } from "../src/depth/types";
import { completeQuestWithFacts } from "./quest-fixtures";
import { projectLatestCombatTurn } from "../src/render/combat-choreography";
import { projectFamiliarWeaponForm } from "../src/render/weapon-form";
import { projectHeroGrowthAllocation } from "../src/ui/hero-growth-allocation";
import { readFileSync } from "node:fs";

function startCanonicalRouteCombat(input: DepthState, enemyCount: number): DepthState {
  let routed = input;
  if (routed.atlas.route === null) {
    const destinationId = routed.atlas.edges.find((edge) => edge.from === routed.atlas.currentLocationId)?.to
      ?? routed.atlas.edges.find((edge) => edge.to === routed.atlas.currentLocationId)?.from;
    if (destinationId === undefined) throw new Error("Browser combat fixture has no neighboring route");
    routed = stepDepth(routed, { type: "plan-route", destinationId });
  }
  if (routed.atlas.route === null) throw new Error("Browser combat fixture has no active route");
  return stepDepth(routed, {
    type: "start-combat",
    encounterId: `encounter:route:${routed.atlas.route.path.join(">")}`,
    enemyCount,
  });
}

test("presents one mortal Hall mentor with separate appearance, meeting, belief, and owned-art facts", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });

  const source = heroExperienceBrowserFixture(
    "browser-mentor-source",
    "campaign:browser-mentor-source",
    12 * (maximumHeroLevel - 1) ** 2,
  );
  if (source.championInduction === null) throw new Error("Browser mentor fixture needs a Champion");
  const seed = "browser-mortal-mentor";
  const base = createWorld(seed, "campaign:browser-mortal-mentor", createCampaignLegacyState(seed, [source.championInduction]));
  let presented = base;
  for (let step = 0; step < 600 && presented.legacyManifestations.appearances.length === 0; step += 1) {
    presented = advanceWorld(presented);
  }
  const appearance = presented.legacyManifestations.appearances[0];
  const meeting = presented.legacyManifestations.meetings[0];
  const recognition = presented.legacyManifestations.recognitions[0];
  const lesson = presented.legacyManifestations.lessons[0];
  const legend = presented.legacy.cards[0];
  if (appearance === undefined || meeting === undefined || recognition === undefined || lesson === undefined || legend === undefined) {
    throw new Error("Browser mentor fixture did not resolve every fact");
  }

  await page.addInitScript(({ world, champion }) => {
    sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world));
    sessionStorage.setItem(`the-grind-2:champion:${champion.id}`, JSON.stringify(champion));
    sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, { world: presented, champion: source.championInduction });
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
  await expect(stage).toHaveAttribute("data-scene-mode", "chronicle");
  await expect(stage).toHaveAttribute("data-legacy-manifestation-id", appearance.id);
  await expect(stage).toHaveAttribute("data-legacy-manifestation-kind", "mortal-mentor");
  await expect(stage).toHaveAttribute("data-legacy-legend-id", legend.id);
  await expect(stage).toHaveAttribute("data-legacy-meeting-id", meeting.id);
  await expect(stage).toHaveAttribute("data-legacy-recognition-id", recognition.id);
  await expect(stage).toHaveAttribute("data-legacy-belief", recognition.belief);
  await expect(stage).toHaveAttribute("data-legacy-lesson-id", lesson.id);
  await expect(stage).toHaveAttribute("data-legacy-lesson-ability", lesson.abilityId);
  await expect(stage).toHaveAttribute("data-legacy-imported-power", "false");
  await expect(stage).toHaveAttribute("data-legacy-hero-position", "88/150");
  await expect(stage).toHaveAttribute("data-legacy-mentor-position", "232/150");
  await expect(page.locator("#scene-headline")).toHaveText(`Mortal Mentor: ${legend.heroName}`);
  await expect(page.locator("#scene-action")).toContainText("Appearance");
  await expect(page.locator("#scene-action")).toContainText("Meeting");
  await expect(page.locator("#scene-action")).toContainText(lesson.abilityName);
  await expect(page.locator("#scene-consequence")).toContainText("Recognition");
  await expect(page.locator("#scene-consequence")).toContainText("Belief");
  await expect(page.locator("#scene-consequence")).toContainText(/no power transferred/i);
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: "/tmp/the-grind-2-mortal-mentor-desktop.png", fullPage: true });
  }

  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(() => {
      const chronicle = document.querySelector(".chronicle")?.getBoundingClientRect();
      const consequence = document.querySelector("#scene-consequence")?.getBoundingClientRect();
      return chronicle !== undefined && consequence !== undefined &&
        consequence.top >= chronicle.top && consequence.bottom <= chronicle.bottom;
    }, undefined, { polling: "raf", timeout: 10_000 });
    const containment = await page.evaluate(() => {
      const pageBounds = document.documentElement.getBoundingClientRect();
      const stageBounds = document.querySelector("#stage")?.getBoundingClientRect();
      const chronicleBounds = document.querySelector(".chronicle")?.getBoundingClientRect();
      const headlineBounds = document.querySelector("#scene-headline")?.getBoundingClientRect();
      const actionBounds = document.querySelector("#scene-action")?.getBoundingClientRect();
      const factsBounds = document.querySelector(".chronicle dl")?.getBoundingClientRect();
      const consequenceBounds = document.querySelector("#scene-consequence")?.getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        width: document.documentElement.clientWidth,
        stage: stageBounds === undefined ? false : stageBounds.left >= pageBounds.left && stageBounds.right <= pageBounds.right,
        chronicle: chronicleBounds === undefined ? false : chronicleBounds.left >= pageBounds.left && chronicleBounds.right <= pageBounds.right,
        facts: chronicleBounds === undefined || consequenceBounds === undefined
          ? false
          : consequenceBounds.top >= chronicleBounds.top && consequenceBounds.bottom <= chronicleBounds.bottom,
        chronicleBounds: chronicleBounds === undefined ? null : { top: chronicleBounds.top, bottom: chronicleBounds.bottom, height: chronicleBounds.height },
        headlineBounds: headlineBounds === undefined ? null : { top: headlineBounds.top, bottom: headlineBounds.bottom, height: headlineBounds.height },
        actionBounds: actionBounds === undefined ? null : { top: actionBounds.top, bottom: actionBounds.bottom, height: actionBounds.height },
        factsBounds: factsBounds === undefined ? null : { top: factsBounds.top, bottom: factsBounds.bottom, height: factsBounds.height },
        consequenceBounds: consequenceBounds === undefined ? null : { top: consequenceBounds.top, bottom: consequenceBounds.bottom, height: consequenceBounds.height },
      };
    });
    expect(containment.scrollWidth).toBeLessThanOrEqual(containment.width);
    expect(containment.stage).toBe(true);
    expect(containment.chronicle).toBe(true);
    expect(containment.facts, JSON.stringify({ viewport, containment })).toBe(true);
    if (process.env.TG2_VISUAL_CAPTURE === "1" && viewport.width === 320) {
      await page.screenshot({ path: "/tmp/the-grind-2-mortal-mentor-mobile.png", fullPage: true });
    }
  }

  await page.locator("#stage canvas").evaluate((canvas) => { (canvas as HTMLElement).style.visibility = "hidden"; });
  await expect(page.locator("#scene-action")).toContainText("Meeting");
  await expect(page.locator("#scene-consequence")).toContainText(/no power transferred/i);
  await page.locator('#view-toolbar [data-view="hall"]').click();
  const legacyCard = page.locator(`.hall-legacy-card[data-legend-id="${legend.id}"]`);
  await expect(legacyCard).toHaveAttribute("data-selected", "true");
  await expect(legacyCard).toHaveAttribute("data-appeared", "true");
  await expect(legacyCard).toHaveAttribute("data-met", "true");
  await expect(legacyCard).toHaveAttribute("data-recognized", "true");
  await expect(legacyCard).toHaveAttribute("data-practiced", "true");
  await expect(legacyCard).toHaveAttribute("data-imported-power", "false");
  await expect(legacyCard).toContainText(`Appeared T${appearance.tick}`);
  await expect(legacyCard).toContainText(lesson.abilityName);
  await expect(page.locator("#hall-legacy-summary")).toContainText("1 selected · 1 appeared · 0 still eligible");
  await expect(page.locator(`.hall-champion[data-champion-id="${source.championInduction.id}"] .hall-qualification`)).toHaveText("Appeared in this tale");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 20_000 });
  await expect(stage).toHaveAttribute("data-legacy-manifestation-id", appearance.id);
  await expect(page.locator("#scene-consequence")).toContainText(/no power transferred/i);
  expect(errors).toEqual([]);
});

test("carries one mortal mentor promise through return farewell and permanent memory", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });

  const source = heroExperienceBrowserFixture(
    "mentor-arc-source",
    "campaign:mentor-arc-source",
    12 * (maximumHeroLevel - 1) ** 2,
  );
  if (source.championInduction === null) throw new Error("Mentor relationship fixture needs a Champion");
  const seed = "autonomous-mentor-arc";
  let presented = createWorld(
    seed,
    "campaign:autonomous-mentor-arc",
    createCampaignLegacyState(seed, [source.championInduction]),
  );
  let promisePresented: typeof presented | null = null;
  let returnPresented: typeof presented | null = null;
  for (let step = 0; step < 12_000 && presented.legacyManifestations.mentorArc?.memoryFact == null; step += 1) {
    presented = advanceWorld(presented);
    if (presented.legacyManifestations.mentorArc?.promiseFact?.tick === presented.tick) promisePresented = presented;
    if (presented.legacyManifestations.mentorArc?.returnFact?.tick === presented.tick) returnPresented = presented;
  }
  const arc = presented.legacyManifestations.mentorArc;
  const legend = arc === null ? undefined : presented.legacy.cards.find((candidate) => candidate.id === arc.legendId);
  if (
    promisePresented === null || returnPresented === null ||
    arc === null || legend === undefined || arc.promiseFact === null || arc.returnFact === null ||
    arc.farewellFact === null || arc.memoryFact === null
  ) {
    throw new Error(`Autonomous mentor relationship did not reach its permanent farewell memory: ${JSON.stringify({
      tick: presented.tick,
      totalCompletedQuests: presented.depth.totalCompletedQuests,
      questStatus: presented.depth.quest.status,
      townVisits: Object.values(presented.depth.towns).reduce((total, town) => total + town.visits, 0),
      locationId: presented.depth.atlas.currentLocationId,
      route: presented.depth.atlas.route?.destinationId ?? null,
      hasArc: arc !== null,
      hasPromise: arc?.promiseFact != null,
      hasReturn: arc?.returnFact != null,
      hasFarewell: arc?.farewellFact != null,
      recentCommands: presented.chronicle.slice(-8).map((entry) => entry.commandType),
    })}`);
  }
  expect(arc.promiseFact.completedQuestBaseline).toBeLessThan(arc.returnFact.completedQuestCount);
  expect(arc.promiseFact.importedPower).toBe(false);
  expect(arc.returnFact.importedPower).toBe(false);
  expect(arc.farewellFact.importedPower).toBe(false);
  expect(arc.memoryFact.importedPower).toBe(false);
  expect(arc.memoryFact.memory).toBe("kept-road-promise");
  expect(arc.farewellFact.tick).toBe(presented.tick);
  const promiseArc = promisePresented.legacyManifestations.mentorArc;
  const returnArc = returnPresented.legacyManifestations.mentorArc;
  if (promiseArc?.promiseFact === null || promiseArc?.promiseFact === undefined || returnArc?.returnFact === null || returnArc?.returnFact === undefined) {
    throw new Error("Mentor relationship snapshots lost their phase facts");
  }

  await page.addInitScript(({ worlds, champion }) => {
    const phase = localStorage.getItem("the-grind-2:test-mentor-phase");
    const world = phase === "return" ? worlds.return : phase === "farewell" ? worlds.farewell : worlds.promise;
    sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world));
    sessionStorage.setItem(`the-grind-2:champion:${champion.id}`, JSON.stringify(champion));
    sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, { worlds: { promise: promisePresented, return: returnPresented, farewell: presented }, champion: source.championInduction });
  await page.goto("./");
  const pauseAtCurrentBeat = async () => {
    await page.waitForFunction(() => {
      if (document.documentElement.dataset.ready !== "true") return false;
      const app = document.querySelector<HTMLElement>("#app");
      const button = document.querySelector<HTMLButtonElement>("#pause-button");
      if (app === null || button === null) return false;
      if (app.dataset.presentationPaused !== "true") button.click();
      return app.dataset.presentationPaused === "true";
    }, undefined, { polling: 20, timeout: 20_000 });
  };
  await pauseAtCurrentBeat();
  const loadPhase = async (phase: "promise" | "return" | "farewell") => {
    await page.evaluate((selectedPhase) => localStorage.setItem("the-grind-2:test-mentor-phase", selectedPhase), phase);
    await page.reload({ waitUntil: "domcontentloaded" });
    await pauseAtCurrentBeat();
  };

  const stage = page.locator("#stage");
  const assertResponsiveTableau = async (phase: "promise" | "return" | "farewell") => {
    for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await expect.poll(() => page.evaluate(() => {
        const stageBounds = document.querySelector("#stage")?.getBoundingClientRect();
        const canvas = document.querySelector("#stage canvas")?.getBoundingClientRect();
        const chronicle = document.querySelector(".chronicle")?.getBoundingClientRect();
        const consequence = document.querySelector("#scene-consequence")?.getBoundingClientRect();
        return stageBounds === undefined || canvas === undefined || chronicle === undefined || consequence === undefined ? null : {
          page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
          canvas: canvas.left >= stageBounds.left - 1 && canvas.right <= stageBounds.right + 1 && canvas.top >= stageBounds.top - 1 && canvas.bottom <= stageBounds.bottom + 1,
          fact: consequence.left >= chronicle.left - 1 && consequence.right <= chronicle.right + 1 && consequence.bottom <= chronicle.bottom + 1,
        };
      }), { timeout: 5_000 }).toEqual({ page: true, canvas: true, fact: true });
      if (viewport.width === 320) {
        await expect(stage).toHaveAttribute("data-scene-layout", "0.5200,76.8000,168.0000");
      }
      if (process.env.TG2_VISUAL_CAPTURE === "1" && viewport.width === 320) {
        await page.screenshot({ path: `/tmp/the-grind-2-mentor-${phase}-mobile.png`, fullPage: true });
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  };

  await expect(stage).toHaveAttribute("data-scene-mode", "chronicle");
  await expect(stage).toHaveAttribute("data-legacy-relationship-phase", "promise");
  await expect(stage).toHaveAttribute("data-legacy-relationship-fact-id", promiseArc.promiseFact.id);
  await expect(stage).toHaveAttribute("data-legacy-relationship-promise-id", promiseArc.promiseFact.id);
  await expect(stage).not.toHaveAttribute("data-legacy-relationship-return-id", /.+/);
  await expect(stage).not.toHaveAttribute("data-legacy-relationship-farewell-id", /.+/);
  await expect(stage).not.toHaveAttribute("data-legacy-relationship-memory-id", /.+/);
  await expect(stage).toHaveAttribute("data-legacy-relationship-truth", "PROMISE ONLY · NO REWARD · NO POWER TRANSFERRED");
  await expect(page.locator("#scene-headline")).toHaveText(`A Road Promised: ${legend.heroName}`);
  await expect(page.locator("#scene-consequence")).toContainText(/no reward · no power transferred/i);
  await expect(page.locator("#scene-consequence")).not.toContainText(/memory/i);
  await assertResponsiveTableau("promise");
  await page.locator("#stage canvas").evaluate((canvas) => { (canvas as HTMLElement).style.visibility = "hidden"; });
  await expect(page.locator("#scene-headline")).toHaveText(`A Road Promised: ${legend.heroName}`);
  await expect(page.locator("#scene-consequence")).not.toContainText(/memory/i);

  await loadPhase("return");
  await expect(stage).toHaveAttribute("data-scene-mode", "chronicle");
  await expect(stage).toHaveAttribute("data-legacy-relationship-phase", "return");
  await expect(stage).toHaveAttribute("data-legacy-relationship-fact-id", returnArc.returnFact.id);
  await expect(stage).toHaveAttribute("data-legacy-relationship-promise-id", promiseArc.promiseFact.id);
  await expect(stage).toHaveAttribute("data-legacy-relationship-return-id", returnArc.returnFact.id);
  await expect(stage).not.toHaveAttribute("data-legacy-relationship-farewell-id", /.+/);
  await expect(stage).not.toHaveAttribute("data-legacy-relationship-memory-id", /.+/);
  await expect(stage).toHaveAttribute("data-legacy-relationship-truth", "RETURN ONLY · NO REWARD · NO POWER TRANSFERRED");
  await expect(page.locator("#scene-headline")).toHaveText(`Promise Kept: ${legend.heroName}`);
  await expect(page.locator("#scene-consequence")).toContainText(/no reward · no power transferred/i);
  await expect(page.locator("#scene-consequence")).not.toContainText(/memory/i);
  await assertResponsiveTableau("return");
  await page.locator("#stage canvas").evaluate((canvas) => { (canvas as HTMLElement).style.visibility = "hidden"; });
  await expect(page.locator("#scene-headline")).toHaveText(`Promise Kept: ${legend.heroName}`);
  await expect(page.locator("#scene-consequence")).not.toContainText(/memory/i);

  await loadPhase("farewell");
  await expect(stage).toHaveAttribute("data-scene-mode", "chronicle");
  await expect(stage).toHaveAttribute("data-legacy-manifestation-id", arc.appearanceId);
  await expect(stage).toHaveAttribute("data-legacy-legend-id", legend.id);
  await expect(stage).toHaveAttribute("data-legacy-meeting-id", arc.meetingId);
  await expect(stage).toHaveAttribute("data-legacy-relationship-phase", "farewell");
  await expect(stage).toHaveAttribute("data-legacy-relationship-fact-id", arc.farewellFact.id);
  await expect(stage).toHaveAttribute("data-legacy-relationship-promise-id", arc.promiseFact.id);
  await expect(stage).toHaveAttribute("data-legacy-relationship-return-id", arc.returnFact.id);
  await expect(stage).toHaveAttribute("data-legacy-relationship-farewell-id", arc.farewellFact.id);
  await expect(stage).toHaveAttribute("data-legacy-relationship-memory-id", arc.memoryFact.id);
  await expect(stage).toHaveAttribute("data-legacy-relationship-truth", "MEMORY KEPT · NO REWARD · NO POWER TRANSFERRED");
  await expect(stage).toHaveAttribute("data-legacy-relationship-schedule", `${arc.farewellFact.townVisitOrdinal}/${arc.farewellFact.scheduledTownVisit}`);
  await expect(stage).toHaveAttribute("data-legacy-imported-power", "false");
  await expect(page.locator("#scene-headline")).toHaveText(`Roads Part: ${legend.heroName}`);
  await expect(page.locator("#scene-action")).toContainText(presented.hero.name);
  await expect(page.locator("#scene-action")).toContainText(legend.heroName);
  await expect(page.locator("#scene-consequence")).toContainText("kept-road-promise");
  await expect(page.locator("#scene-consequence")).toContainText(/no reward · no power transferred/i);
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: "/tmp/the-grind-2-mentor-farewell-desktop.png", fullPage: true });
  }

  await assertResponsiveTableau("farewell");

  await page.locator("#stage canvas").evaluate((canvas) => { (canvas as HTMLElement).style.visibility = "hidden"; });
  await expect(page.locator("#scene-headline")).toHaveText(`Roads Part: ${legend.heroName}`);
  await expect(page.locator("#scene-consequence")).toContainText("kept-road-promise");
  await page.locator('.view-button[data-view="journal"]').click();
  const memory = page.locator(`#journal-mentor-list .journal-mentor-record[data-legend-id="${legend.id}"]`);
  await expect(memory).toHaveAttribute("data-phase", "farewell");
  await expect(memory).toHaveAttribute("data-memory", "kept-road-promise");
  await expect(memory).toHaveAttribute("data-imported-power", "false");
  await expect(memory).toHaveAttribute("data-mechanical-effect", "none");
  await expect(memory).toContainText("Roads parted as friends");
  await expect(memory).toContainText("no reward or power");
  await expect(page.locator("#journal-mentor-summary")).toContainText("kept promise remains in memory");

  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await memory.scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate(() => {
      const screen = document.querySelector("#inspection-screen")?.getBoundingClientRect();
      const record = document.querySelector("#journal-mentor-list .journal-mentor-record")?.getBoundingClientRect();
      return screen === undefined || record === undefined ? null : {
        page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        memory: record.left >= screen.left - 1 && record.right <= screen.right + 1,
      };
    }), { timeout: 5_000 }).toEqual({ page: true, memory: true });
  }

  await page.locator('.view-button[data-view="hall"]').click();
  const legacyCard = page.locator(`.hall-legacy-card[data-legend-id="${legend.id}"]`);
  await expect(legacyCard).toHaveAttribute("data-mentor-phase", "farewell");
  await expect(legacyCard).toHaveAttribute("data-promised", "true");
  await expect(legacyCard).toHaveAttribute("data-returned", "true");
  await expect(legacyCard).toHaveAttribute("data-farewelled", "true");
  await expect(legacyCard).toHaveAttribute("data-memory", "kept-road-promise");
  await expect(legacyCard).toContainText(`Roads parted T${arc.farewellFact.tick}`);
  await expect(legacyCard).toContainText("no reward or power");
  await expect(page.locator("#hall-legacy-summary")).toContainText("1 mentor memory kept");

  await page.reload({ waitUntil: "domcontentloaded" });
  await pauseAtCurrentBeat();
  await expect(stage).toHaveAttribute("data-legacy-relationship-phase", "farewell");
  await expect(stage).toHaveAttribute("data-legacy-relationship-memory-id", arc.memoryFact.id);
  await expect(page.locator("#scene-consequence")).toContainText("kept-road-promise");
  expect(errors).toEqual([]);
});

const appVersion = (JSON.parse(readFileSync(new URL("../public/version.json", import.meta.url), "utf8")) as { version: string }).version;

test("loads a world-v5 envelope around current depth from IndexedDB", async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  const current = heroExperienceBrowserFixture(
    "browser-world-five-current-depth",
    "campaign:browser-world-five-current-depth",
    30_000,
  );
  const persisted = structuredClone(current) as Record<string, any>;
  persisted.schemaVersion = 5;
  delete persisted.championInduction;
  delete persisted.legacy;
  delete persisted.legacyManifestations;

  await page.goto("./version.json");
  await page.evaluate(async (world) => {
    sessionStorage.clear();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("the-grind-2");
      request.addEventListener("success", () => resolve(), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("the-grind-2", 2);
      request.addEventListener("upgradeneeded", () => {
        request.result.createObjectStore("campaigns", { keyPath: "campaignId" });
        request.result.createObjectStore("settings");
        request.result.createObjectStore("champions", { keyPath: "id" });
      }, { once: true });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["campaigns", "settings"], "readwrite");
      transaction.objectStore("campaigns").put(world);
      transaction.objectStore("settings").put(world.campaignId, "activeCampaignId");
      transaction.addEventListener("complete", () => resolve(), { once: true });
      transaction.addEventListener("error", () => reject(transaction.error), { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    });
    database.close();
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, persisted);

  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await expect(page.locator("#hero-name")).toHaveText(current.hero.name);
  await expect(page.locator("#hero-level")).toContainText("Level 51");
  const mirror = await page.evaluate((campaignId) => {
    const source = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    return source === null ? null : JSON.parse(source) as { schemaVersion: number; depth: { schemaVersion: number } };
  }, current.campaignId);
  expect(mirror).toMatchObject({ schemaVersion: 9, depth: { schemaVersion: 17 } });
  expect(errors).toEqual([]);
});

function readyQuestBrowserFixture(seed: string, campaignId: string) {
  const world = createWorld(seed, campaignId);
  const quest = completeQuestWithFacts(world.depth.quest);
  if (quest.status !== "ready-to-fulfill") throw new Error("Browser quest fixture did not become ready");
  return upgradeWorldState({ ...world, depth: { ...world.depth, quest } });
}

function cappedOverflowRewardBrowserFixture(seed: string, campaignId: string) {
  const ready = readyQuestBrowserFixture(seed, campaignId);
  const inventory = [...ready.depth.hero.inventory];
  for (let index = inventory.length; index < 32; index += 1) {
    inventory.push({ id: `browser-overflow:${index}`, name: `Packed Browser Supply ${index}`, kind: "consumable" as const, slot: null, rarity: "common" as const, quantity: 1, modifiers: {}, restorative: null, useMastery: null });
  }
  const packed = upgradeWorldState({
    ...ready,
    hero: { ...ready.hero, gold: Number.MAX_SAFE_INTEGER },
    depth: { ...ready.depth, hero: { ...ready.depth.hero, gold: Number.MAX_SAFE_INTEGER, inventory } },
  });
  return advanceWorld(advanceWorld(packed));
}

function heroExperienceBrowserFixture(seed: string, campaignId: string, experience: number) {
  const world = createWorld(seed, campaignId);
  const level = heroLevelForExperience(experience);
  const depthHero = { ...world.depth.hero, experience, level };
  let staged = {
    ...world,
    hero: { ...world.hero, experience, level, mastery: heroMasteryForExperience(experience) },
    depth: { ...world.depth, hero: depthHero, heroGrowth: createHeroGrowthState(depthHero) },
  };
  if (level === maximumHeroLevel) {
    staged = {
      ...staged,
      championInduction: createChampionInduction(staged, "earned", {
        id: "browser:test-fixture-champion",
        type: "wait",
      }),
    };
  }
  return upgradeWorldState(staged);
}

function detectedTrapBrowserFixture(seed: string, campaignId: string) {
  const world = createWorld(seed, campaignId);
  const hero = {
    ...world.depth.hero,
    attributes: { ...world.depth.hero.attributes, agility: 20 },
  };
  const id = `dungeon:${campaignId}`;
  const trap = `${id}:cell:0,0`;
  const entry = `${id}:cell:1,0`;
  const east = `${id}:cell:2,0`;
  const eastMiddle = `${id}:cell:2,1`;
  const middle = `${id}:cell:1,1`;
  const westMiddle = `${id}:cell:0,1`;
  const westBottom = `${id}:cell:0,2`;
  const middleBottom = `${id}:cell:1,2`;
  const exit = `${id}:cell:2,2`;
  return upgradeWorldState({
    ...world,
    scene: {
      ...world.scene,
      mode: "dungeon" as const,
      location: "Proof Vault",
      headline: "A whisper-wire bars the chamber.",
      action: "The mechanism waits for one canonical disarm attempt.",
      consequence: "No outcome has resolved yet.",
      sensoryIntensity: 2 as const,
    },
    depth: {
      ...world.depth,
      hero,
      heroGrowth: createHeroGrowthState(hero),
      dungeon: {
        layoutVersion: 1 as const,
        keyGate: null,
        latestShrineUse: null,
        id,
        name: "Proof Vault",
        width: 3,
        height: 3,
        cells: [
          { id: trap, x: 0, y: 0, exits: ["east"], feature: "trap" },
          { id: entry, x: 1, y: 0, exits: ["east", "west"], feature: "empty" },
          { id: east, x: 2, y: 0, exits: ["south", "west"], feature: "empty" },
          { id: westMiddle, x: 0, y: 1, exits: ["east", "south"], feature: "empty" },
          { id: middle, x: 1, y: 1, exits: ["east", "west"], feature: "empty" },
          { id: eastMiddle, x: 2, y: 1, exits: ["north", "west"], feature: "empty" },
          { id: westBottom, x: 0, y: 2, exits: ["north", "east"], feature: "empty" },
          { id: middleBottom, x: 1, y: 2, exits: ["east", "west"], feature: "empty" },
          { id: exit, x: 2, y: 2, exits: ["west"], feature: "shrine" },
        ],
        entryCellId: entry,
        exitCellId: exit,
        currentCellId: trap,
        visitedCellIds: [entry, trap],
        discoveredCellIds: [entry, trap, east],
        traps: [{ cellId: trap, kind: "tripwire" as const, detectDifficulty: 10, disarmDifficulty: 11, phase: "detected" as const }],
        traversalLog: ["The whisper-wire is marked."],
        turns: 1,
        completed: false,
      },
    },
  });
}

test("shows one truthful Turning Point across HUD Journal and responsive Canvas-hidden layouts", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });

  const threshold = 12 * 9 ** 2;
  const before = heroExperienceBrowserFixture("browser-turning-point", "campaign:browser-turning-point", threshold - 1);
  const fixture = advanceWorld(before);
  const record = fixture.depth.heroGrowth.records[0];
  if (record === undefined) throw new Error("Browser Turning Point fixture did not settle Level 10");
  const selected = record.candidates.find((candidate) => candidate.packageId === record.selectedPackageId);
  if (selected === undefined) throw new Error("Browser Turning Point fixture lost its selected candidate");

  await page.addInitScript((world) => {
    sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world));
    sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, fixture);
  await page.goto("./");
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { polling: 20, timeout: 20_000 });
  await page.waitForFunction(() => {
    const app = document.querySelector<HTMLElement>("#app");
    const button = document.querySelector<HTMLButtonElement>("#pause-button");
    if (app === null || button === null) return false;
    if (app.dataset.presentationPaused !== "true") button.click();
    return app.dataset.presentationPaused === "true";
  });

  await expect(page.locator("#hero-mana-text")).toHaveText(`${fixture.depth.hero.resources.mana} / ${fixture.depth.hero.resources.maxMana}`);
  for (const [id, value] of [
    ["#stat-strength", fixture.depth.hero.attributes.strength],
    ["#stat-agility", fixture.depth.hero.attributes.agility],
    ["#stat-vitality", fixture.depth.hero.attributes.vitality],
    ["#stat-intellect", fixture.depth.hero.attributes.intellect],
    ["#stat-spirit", fixture.depth.hero.attributes.spirit],
    ["#stat-luck", fixture.depth.hero.attributes.luck],
  ] as const) await expect(page.locator(id)).toHaveText(String(value));
  await expect(page.locator("#hero-growth-summary")).toContainText(`TURNING POINT ${record.checkpointLevel}`);
  await expect(page.locator("#hero-growth-summary")).toContainText(selected.label.toUpperCase());

  await page.locator('.view-button[data-view="journal"]').click();
  const checkpoint = page.locator(`#journal-growth-checkpoints [data-checkpoint="${record.checkpointLevel}"]`);
  const growthCard = page.locator(`#journal-growth-records [data-record-id="${record.id}"]`);
  await expect(checkpoint).toHaveAttribute("data-state", "settled");
  await expect(checkpoint).toContainText("✓");
  await expect(checkpoint).toContainText("SETTLED");
  await expect(page.locator("#journal-growth-attributes > div")).toHaveCount(6);
  await expect(growthCard).toContainText("CHOSEN");
  await expect(growthCard).toContainText(record.rationale);
  await expect(growthCard).toContainText("HP");
  await expect(growthCard).toContainText("MP");
  await expect(growthCard).toContainText("STAYS");

  for (const viewport of [
    { width: 320, height: 568, columns: 3 },
    { width: 390, height: 844, columns: 3 },
    { width: 844, height: 390, columns: 6 },
  ]) {
    await page.setViewportSize(viewport);
    await page.locator('.view-button[data-view="watch"]').click();
    await expect(page.locator(".vital-card")).toBeVisible();
    expect(await page.locator(".stat-grid").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(viewport.columns);
    await page.locator('.view-button[data-view="journal"]').click();
    await growthCard.scrollIntoViewIfNeeded();
    const bounds = await growthCard.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
    expect(await growthCard.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }

  await page.addStyleTag({ content: "#stage canvas { display: none !important; }" });
  await expect(page.locator("#stage canvas")).toBeHidden();
  await expect(growthCard).toContainText("CHOSEN");
  if (process.env.TG2_VISUAL_CAPTURE === "1") await page.screenshot({ path: "/tmp/the-grind-2-turning-point.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("keeps one Shared Road Oath companion consistent across combat, Journal, responsive layouts, and farewell", async ({ page }) => {
  test.setTimeout(180_000);
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
  const battleDepth = startCanonicalRouteCombat(routed.depth, 1);
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

  let arrived: typeof joined | null = null;
  let departed = joined;
  for (let step = 0; step < 96 && departed.depth.companions.former.length === 0; step += 1) {
    const before = departed;
    departed = advanceWorld(before);
    if (departed.depth.companions.former.length > 0) arrived = before;
  }
  if (departed.depth.companions.former.length !== 1 || arrived === null) throw new Error("Browser Shared Road fixture did not finish");
  arrived = upgradeWorldState(JSON.parse(JSON.stringify(arrived)));
  departed = upgradeWorldState(JSON.parse(JSON.stringify(departed)));
  const formerCompanion = departed.depth.companions.former[0];
  if (formerCompanion === undefined) throw new Error("Browser Shared Road fixture lost its former companion");

  await page.addInitScript(({ battleWorld, injuredWorld, arrivedWorld }) => {
    const phase = localStorage.getItem("the-grind-2:test-companion-phase");
    if (phase === "saved") {
      const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
      if (campaignId !== null) localStorage.setItem(`the-grind-2:last-active:${campaignId}`, String(Date.now() + 60_000));
      return;
    }
    const world = phase === "arrived"
      ? arrivedWorld
      : phase === "injured"
        ? injuredWorld
        : battleWorld;
    sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world));
    sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, { battleWorld: battle, injuredWorld: injured, arrivedWorld: arrived });
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

  await page.evaluate(() => localStorage.setItem("the-grind-2:test-companion-phase", "arrived"));
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
  const beforeFarewellSave = await page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    const source = campaignId === null ? null : sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    if (source === null) return null;
    const saved = JSON.parse(source) as { depth: { companions: { active: unknown[]; former: unknown[] } } };
    return { active: saved.depth.companions.active.length, former: saved.depth.companions.former.length };
  });
  expect(beforeFarewellSave).toEqual({ active: 1, former: 0 });
  await page.locator("#pause-button").click();
  const farewell = page.locator("#farewell-cutaway");
  await expect(farewell).toBeVisible({ timeout: 12_000 });
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-busy", "true");
  await page.locator("#pause-button").click();
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "true");
  await expect(farewell).toHaveAttribute("data-companion-id", companion.identity.residentId);
  await expect(farewell).toHaveAttribute("data-profession", companion.identity.role);
  await expect(farewell).toHaveAttribute("data-outcome", formerCompanion.outcome);
  await expect(page.locator("#farewell-cutaway-title")).toHaveText(`${companion.identity.name} · ${companion.identity.role}`);
  await expect(page.locator("#farewell-cutaway-promise")).toContainText(companion.destination.name);
  await expect(page.locator("#farewell-cutaway-journey")).toContainText(`bond ${formerCompanion.bond}`);
  await expect(page.locator("#farewell-cutaway-arrival")).toContainText(`HP ${formerCompanion.resources.health}/${formerCompanion.combat.maxHealth}`);
  await expect(page.locator("#farewell-cutaway-departure")).toHaveText(`${companion.identity.name} leaves with ${companion.identity.role} tools`);
  await expect(page.locator("#farewell-cutaway-progress")).toContainText("No item changes hands");
  await expect(page.locator("#stage")).toHaveAttribute("data-cutaway-kind", "companion-farewell");
  await expect(page.locator("#stage")).toHaveAttribute("data-farewell-companion", companion.identity.residentId);
  await expect(page.locator("#stage")).toHaveAttribute("data-farewell-prop", `${companion.identity.role}-tools`);
  await expect(page.locator("#stage")).toHaveAttribute("data-farewell-no-item-transfer", "true");
  const savedDuringFarewell = await page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    const source = campaignId === null ? null : sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    if (source === null) return null;
    const saved = JSON.parse(source) as { depth: { companions: { active: unknown[]; former: Array<{ identity: { residentId: string } }> } } };
    return {
      active: saved.depth.companions.active.length,
      former: saved.depth.companions.former.map((record) => record.identity.residentId),
    };
  });
  expect(savedDuringFarewell).toEqual({ active: 0, former: [companion.identity.residentId] });

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    const farewellBounds = await farewell.boundingBox();
    expect(farewellBounds).not.toBeNull();
    expect(farewellBounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((farewellBounds?.x ?? 0) + (farewellBounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
    await expect(page.locator("#stage canvas")).toBeVisible();
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: "/tmp/the-grind-2-farewell.png", fullPage: true });
  }
  await page.addStyleTag({ content: "#stage canvas { display: none !important; }" });
  await expect(page.locator("#stage canvas")).toBeHidden();
  await expect(farewell).toBeVisible();
  await page.locator("#farewell-cutaway-outcome").focus();
  await page.locator("#farewell-cutaway-outcome").press("Enter");
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-busy", "false");
  await expect(page.locator('.view-button[data-view="watch"]')).toBeFocused();

  await page.evaluate(() => localStorage.setItem("the-grind-2:test-companion-phase", "saved"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { polling: 20, timeout: 20_000 });
  await expect(page.locator("#farewell-cutaway")).toBeHidden();
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
  await page.waitForTimeout(600);
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
    schemaVersion: 9,
    policyVersion: 2,
    depthSchemaVersion: 17,
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
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const base = createWorld("browser-tactical-combat", "campaign:browser-tactical-combat");
  let depth = startCanonicalRouteCombat(base.depth, 1);
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
    itemId: null,
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
  if (resolvedCombat.threat.rating !== "place-bound") throw new Error("Tactical-combat fixture has no place-bound threat");
  const expectedThreat = describeEncounterThreat(resolvedCombat.threat);
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
  await expect(stage).toHaveAttribute("data-combat-threat-rating", "place-bound");
  await expect(stage).toHaveAttribute("data-combat-threat-score", String(resolvedCombat.threat.encounterScore));
  await expect(stage).toHaveAttribute("data-combat-threat-band", resolvedCombat.threat.band);
  await expect(stage).toHaveAttribute("data-combat-threat-equation", expectedThreat);
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
  const threat = page.locator("#battle-threat");
  const roster = page.locator("#battle-roster");
  const upcoming = page.locator("#battle-upcoming");
  await expect(overview).toBeVisible();
  await expect(threat).toBeVisible();
  await expect(threat).toHaveText(expectedThreat);
  await expect(threat).toHaveAttribute("data-rating", "place-bound");
  await expect(threat).toHaveAttribute("data-score", String(resolvedCombat.threat.encounterScore));
  await expect(threat).toHaveAttribute("data-band", resolvedCombat.threat.band);
  await expect(threat).toHaveAttribute("data-pattern", resolvedCombat.threat.band);
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
    await expect(threat).toBeVisible();
    const bounds = await strip.boundingBox();
    const overviewBounds = await overview.boundingBox();
    const threatBounds = await threat.boundingBox();
    expect(bounds).not.toBeNull();
    expect(overviewBounds).not.toBeNull();
    expect(threatBounds).not.toBeNull();
    expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
    if (viewport.height <= 390) {
      expect(bounds?.y ?? -1).toBeGreaterThanOrEqual(0);
      expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(viewport.height + 1);
    }
    expect(overviewBounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((overviewBounds?.x ?? 0) + (overviewBounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
    expect((threatBounds?.x ?? 0) + (threatBounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
    await expect(strip).toHaveText(`Turn ${summary.turn} · ${summary.text}`);
  }
  await page.addStyleTag({ content: "#stage canvas { display: none !important; }" });
  await expect(page.locator("#stage canvas")).toBeHidden();
  await expect(strip).toBeVisible();
  await expect(overview).toBeVisible();
  await expect(threat).toBeVisible();
  await expect(threat).toHaveText(expectedThreat);
  await expect(roster.locator(".battle-unit")).toHaveCount(2);
  await expect(strip).toHaveText(`Turn ${summary.turn} · ${summary.text}`);
  await expect(page.locator("#scene-action")).not.toBeEmpty();
  await expect(page.locator("#scene-consequence")).toHaveText("The battle ends in victory");

  if (depth.atlas.route === null) throw new Error("Tactical-combat fixture lost its route");
  const nextLocationId = depth.atlas.route.path[depth.atlas.route.legIndex + 1];
  const nextLocation = depth.atlas.locations.find((location) => location.id === nextLocationId);
  if (nextLocation === undefined) throw new Error("Tactical-combat fixture has no next route location");
  const travelDepth = {
    ...depth,
    atlas: {
      ...depth.atlas,
      discoveredLocationIds: [...new Set([...depth.atlas.discoveredLocationIds, nextLocation.id])],
    },
  };
  const travelFixture = upgradeWorldState({
    ...fixture,
    depth: travelDepth,
    scene: {
      ...fixture.scene,
      mode: "travel" as const,
      headline: "A known road declares its danger.",
      action: "The route and its risk remain visible.",
      consequence: "Place danger is knowledge, not hero scaling.",
    },
  });
  await page.evaluate((world) => {
    sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world));
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, travelFixture);
  await page.reload();
  await page.waitForFunction(() => {
    if (document.documentElement.dataset.ready !== "true") return false;
    const button = document.querySelector<HTMLButtonElement>("#pause-button");
    if (button === null) return false;
    if (button.textContent !== "Resume") button.click();
    return button.textContent === "Resume";
  }, undefined, { polling: 20, timeout: 15_000 });
  const knownBand = encounterThreatBand(nextLocation.danger);
  await expect(stage).toHaveAttribute("data-scene-mode", "travel");
  await expect(stage).toHaveAttribute("data-travel-place-danger", String(nextLocation.danger));
  await expect(stage).toHaveAttribute("data-travel-threat-band", knownBand);
  await expect(page.locator("#traversal-progress-text")).toContainText(`known place danger ${nextLocation.danger}`);
  await page.locator('[data-view="map"]').click({ force: true });
  await expect(stage).toHaveAttribute("data-atlas-next-danger", String(nextLocation.danger));
  await expect(stage).toHaveAttribute("data-atlas-next-threat-band", knownBand);
  await expect(page.locator("#map-route")).toContainText(`Known place danger ${nextLocation.danger}`);
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const mapRouteBounds = await page.locator("#map-route").boundingBox();
    expect(mapRouteBounds).not.toBeNull();
    expect((mapRouteBounds?.x ?? 0) + (mapRouteBounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
  }
  await page.addStyleTag({ content: "#stage canvas { display: none !important; }" });
  await expect(page.locator("#map-route")).toContainText(`Known place danger ${nextLocation.danger}`);
  expect(errors).toEqual([]);
});

test("shows one exact autonomous restorative turn across battle HUD and inventory", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });

  const base = createWorld("browser-restorative-combat", "campaign:browser-restorative-combat");
  const started = startCanonicalRouteCombat(base.depth, 1);
  const combat = started.combat;
  if (combat === null) throw new Error("Restorative browser fixture failed to start combat");
  const hero = combat.combatants.find((unit) => unit.id === started.hero.id);
  const enemy = combat.combatants.find((unit) => unit.side === "enemies");
  const tonic = started.hero.inventory.find((item) => item.restorative !== null);
  if (hero === undefined || enemy === undefined || tonic === undefined) throw new Error("Restorative browser fixture is incomplete");
  const healthBefore = Math.floor(hero.maxHealth / 3);
  const staged: DepthState = {
    ...started,
    hero: { ...started.hero, resources: { ...started.hero.resources, health: healthBefore } },
    combat: {
      ...combat,
      round: 64,
      turn: 127,
      activeIndex: 0,
      turnOrder: [hero.id, enemy.id],
      combatants: combat.combatants.map((unit) => unit.id === hero.id ? { ...unit, health: healthBefore } : { ...unit, health: Math.max(2, unit.health) }),
      eventStream: { schemaVersion: 2, firstRecordedTurn: 128, events: [] },
      log: [],
    },
  };
  const depth = stepDepth(staged, {
    type: "combat-action",
    action: { actorId: hero.id, type: "item", targetId: hero.id, abilityId: null, itemId: tonic.id },
  });
  const resolved = depth.completedCombats.at(-1);
  if (resolved === undefined || resolved.outcome !== "stalemate") throw new Error("Restorative browser fixture did not settle");
  const summary = projectLatestCombatTurn(resolved);
  if (summary?.restorative === null || summary === null) throw new Error("Restorative browser fixture lacks its atomic summary");
  const use = summary.restorative;
  const fixture = upgradeWorldState({
    ...base,
    tick: depth.tick,
    hero: {
      ...base.hero,
      level: depth.hero.level,
      experience: depth.hero.experience,
      health: depth.hero.resources.health,
      maxHealth: depth.hero.resources.maxHealth,
      gold: depth.hero.gold,
    },
    depth,
    scene: {
      ...base.scene,
      mode: "battle" as const,
      headline: "A finite supply turns danger into another chance.",
      action: resolved.log.at(-1)?.message ?? "The restorative resolves.",
      consequence: "One normal combat turn and one tonic are spent.",
      sensoryIntensity: 2 as const,
    },
    lifecycle: {
      ...base.lifecycle,
      simulationTick: depth.tick,
      worldClockMinutes: depth.tick * 15,
    },
  });
  await page.addInitScript((world) => {
    sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world));
    sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, fixture);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
  await page.waitForFunction(() => {
    const button = document.querySelector<HTMLButtonElement>("#pause-button");
    if (button === null) return false;
    if (button.textContent !== "Resume") button.click();
    return button.textContent === "Resume";
  }, undefined, { polling: 20, timeout: 15_000 });

  const stage = page.locator("#stage");
  const strip = page.locator("#battle-turn-strip");
  await expect(stage).toHaveAttribute("data-reduced-motion", "true");
  await expect(stage).toHaveAttribute("data-combat-action", "item");
  await expect(stage).toHaveAttribute("data-combat-focus-kind", "self-effect");
  await expect(stage).toHaveAttribute("data-combat-item", use.itemId);
  await expect(stage).toHaveAttribute("data-combat-quantity-delta", `${use.quantityBefore}:${use.quantityAfter}`);
  await expect(stage).toHaveAttribute("data-combat-healing-delta", `${use.healthBefore}:${use.amount}:${use.healthAfter}`);
  await expect(strip).toHaveAttribute("role", "status");
  await expect(strip).toHaveAttribute("aria-live", "polite");
  await expect(strip).toHaveAttribute("data-action", "item");
  await expect(strip).toHaveAttribute("data-item", use.itemId);
  await expect(strip).toHaveAttribute("data-quantity-before", String(use.quantityBefore));
  await expect(strip).toHaveAttribute("data-quantity-after", String(use.quantityAfter));
  await expect(strip).toHaveAttribute("data-restorative-health-before", String(use.healthBefore));
  await expect(strip).toHaveAttribute("data-health-restored", String(use.amount));
  await expect(strip).toHaveAttribute("data-restorative-health-after", String(use.healthAfter));
  await expect(strip).toContainText(`${use.itemName} ×${use.quantityBefore}→×${use.quantityAfter} · HP ${use.healthBefore}→${use.healthAfter} (+${use.amount})`);
  await expect(page.locator("#hero-health-text")).toHaveText(`${use.healthAfter} / ${use.maxHealth}`);
  await expect(page.locator("#scene-action")).toHaveText(`${use.itemName} ×${use.quantityBefore}→×${use.quantityAfter} · HP ${use.healthBefore}→${use.healthAfter} (+${use.amount})`);

  await page.locator('[data-view="inventory"]').click({ force: true });
  const inventoryItem = page.locator(`.inventory-item[data-item-id="${use.itemId}"]`);
  await expect(inventoryItem).toBeVisible();
  await expect(inventoryItem.locator("header span")).toHaveText(`×${use.quantityAfter}`);
  await expect(inventoryItem.locator(".item-modifiers")).toContainText("Combat self-use · restores ¼ max HP");
  await page.locator('[data-view="watch"]').click({ force: true });

  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await expect(strip).toBeVisible();
    const bounds = await strip.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
  }
  await page.addStyleTag({ content: "#stage canvas { display: none !important; }" });
  await expect(page.locator("#stage canvas")).toBeHidden();
  await expect(strip).toContainText(`${use.itemName} ×${use.quantityBefore}→×${use.quantityAfter}`);
  await expect(page.locator("#hero-health-text")).toHaveText(`${use.healthAfter} / ${use.maxHealth}`);
  expect(errors).toEqual([]);
});

test("shows one start-bound Weapon Use Mastery award before stronger loot auto-equips", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });

  const base = createWorld("mastery-preloot-5", "campaign:browser-weapon-use");
  const started = startCanonicalRouteCombat(base.depth, 1);
  const combat = started.combat;
  const boundWeaponId = started.hero.equipment.weapon;
  if (combat === null || combat.weaponUse.tracking !== "tracked" || boundWeaponId === null) throw new Error("Browser mastery fixture has no bound weapon");
  const heroIndex = combat.turnOrder.indexOf(started.hero.id);
  const enemy = combat.combatants.find((entry) => entry.side === "enemies");
  if (heroIndex < 0 || enemy === undefined) throw new Error("Browser mastery fixture has no combatants");
  const staged: DepthState = {
    ...started,
    combat: {
      ...combat,
      activeIndex: heroIndex,
      combatants: combat.combatants.map((entry) => entry.id === started.hero.id
        ? { ...entry, power: 999 }
        : entry.id === enemy.id ? { ...entry, health: 1 } : entry),
    },
  };
  const depth = stepDepth(staged, {
    type: "combat-action",
    action: { actorId: started.hero.id, type: "attack", targetId: enemy.id, abilityId: null, itemId: null },
  });
  const usedWeapon = depth.hero.inventory.find((item) => item.id === boundWeaponId);
  const receipt = usedWeapon?.useMastery?.receipts.at(-1);
  const droppedWeapon = depth.hero.inventory.find((item) => item.id === `loot:${combat.id}:0`);
  if (usedWeapon === undefined || receipt === undefined || droppedWeapon === undefined) throw new Error("Browser mastery fixture did not settle both weapons");
  const receiptText = describeWeaponUseReceipt(usedWeapon.name, receipt);
  const fixture = upgradeWorldState({
    ...base,
    tick: depth.tick,
    hero: {
      ...base.hero,
      level: depth.hero.level,
      experience: depth.hero.experience,
      health: depth.hero.resources.health,
      maxHealth: depth.hero.resources.maxHealth,
      gold: depth.hero.gold,
    },
    depth,
    scene: {
      ...base.scene,
      mode: "battle" as const,
      headline: `${usedWeapon.name} reaches Use Level ${receipt.levelAfter}.`,
      action: `The battle ends in ${receipt.outcome}.`,
      consequence: receiptText,
      sensoryIntensity: 2 as const,
    },
    lifecycle: {
      ...base.lifecycle,
      simulationTick: depth.tick,
      worldClockMinutes: depth.tick * 15,
    },
  });
  await page.addInitScript((world) => {
    sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world));
    sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, fixture);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
  await page.waitForFunction(() => {
    const button = document.querySelector<HTMLButtonElement>("#pause-button");
    if (button === null) return false;
    if (button.textContent !== "Resume") button.click();
    return button.textContent === "Resume";
  }, undefined, { polling: 20, timeout: 15_000 });

  const stage = page.locator("#stage");
  await expect(stage).toHaveAttribute("data-reduced-motion", "true");
  await expect(stage).toHaveAttribute("data-weapon-use-item", usedWeapon.id);
  await expect(stage).toHaveAttribute("data-weapon-use-combat", receipt.combatId);
  await expect(stage).toHaveAttribute("data-weapon-use-contribution", `${receipt.basicStrikes}:${receipt.damage}`);
  await expect(stage).toHaveAttribute("data-weapon-use-experience", `${receipt.experienceBefore}:${receipt.experienceAfter}`);
  await expect(stage).toHaveAttribute("data-weapon-use-level", `${receipt.levelBefore}:${receipt.levelAfter}`);
  await expect(stage).toHaveAttribute("data-weapon-use-stat-bonus", "0");
  await expect(page.locator("#scene-headline")).toHaveText(`${usedWeapon.name} reaches Use Level ${receipt.levelAfter}.`);
  await expect(page.locator("#scene-consequence")).toHaveText(receiptText);
  await expect(page.locator("#gear-summary")).toContainText(`${droppedWeapon.name} · Use L1`);

  await page.locator('[data-view="inventory"]').click({ force: true });
  const usedCard = page.locator(`.inventory-item[data-item-id="${usedWeapon.id}"]`);
  const droppedCard = page.locator(`.inventory-item[data-item-id="${droppedWeapon.id}"]`);
  await expect(usedCard.locator(".item-mastery")).toContainText("Use Mastery L2 / 10 · 1 / 3 toward L3 · no combat bonus");
  await expect(usedCard.locator(".item-mastery")).toContainText(`latest use T${receipt.resolvedTick} · victory`);
  await expect(usedCard.locator(".item-mastery")).toHaveAttribute("data-source-combat", combat.id);
  await expect(droppedCard).toHaveAttribute("data-equipped", "true");
  await expect(droppedCard.locator(".item-mastery")).toContainText("Use Mastery L1 / 10 · 0 / 1 toward L2 · no combat bonus · no effective use recorded");

  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    const containment = await usedCard.evaluate((card) => {
      const bounds = card.getBoundingClientRect();
      return { page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1, left: bounds.left, right: bounds.right, width: document.documentElement.clientWidth };
    });
    expect(containment.page).toBe(true);
    expect(containment.left).toBeGreaterThanOrEqual(-1);
    expect(containment.right).toBeLessThanOrEqual(containment.width + 1);
  }
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: "/tmp/the-grind-2-weapon-use-inventory.png", fullPage: true });
  }
  await page.locator('[data-view="watch"]').click({ force: true });
  await page.addStyleTag({ content: "#stage canvas { display: none !important; }" });
  await expect(stage.locator("canvas")).toBeHidden();
  await expect(page.locator("#scene-consequence")).toHaveText(receiptText);
  await expect(page.locator("#gear-summary")).toContainText(`${droppedWeapon.name} · Use L1`);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
  await expect(stage).toHaveAttribute("data-weapon-use-item", usedWeapon.id);
  await page.locator('[data-view="inventory"]').click({ force: true });
  await expect(page.locator(`.inventory-item[data-item-id="${usedWeapon.id}"] .item-mastery`)).toContainText("Use Mastery L2 / 10");
  expect(errors).toEqual([]);
});

test("shows a Level-4 Familiar Form with exact terminal weapon provenance", async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });

  const base = createWorld("mastery-preloot-5", "campaign:browser-familiar-form");
  const originalWeaponId = base.depth.hero.equipment.weapon;
  const originalWeapon = base.depth.hero.inventory.find((item) => item.id === originalWeaponId);
  if (originalWeaponId === null || originalWeapon === undefined) throw new Error("Familiar Form fixture has no weapon");
  let masteredWeapon = originalWeapon;
  for (let index = 0; index < 6; index += 1) {
    masteredWeapon = applyWeaponUseMastery(masteredWeapon, {
      id: `combat:browser-familiar-history:${index}`,
      outcome: "victory",
      weaponUse: {
        schemaVersion: 1,
        tracking: "tracked",
        rulesVersion: "weapon-effective-use-v1",
        heroId: base.depth.hero.id,
        weaponId: originalWeaponId,
        basicStrikes: 1,
        damage: 4,
      },
    }, index + 1).item;
  }
  const prepared: DepthState = {
    ...base.depth,
    tick: 10,
    hero: {
      ...base.depth.hero,
      inventory: base.depth.hero.inventory.map((item) => item.id === originalWeaponId ? masteredWeapon : item),
    },
  };
  const started = startCanonicalRouteCombat(prepared, 1);
  const combat = started.combat;
  if (combat === null || combat.weaponUse.tracking !== "tracked") throw new Error("Familiar Form combat did not start tracked");
  const heroIndex = combat.turnOrder.indexOf(started.hero.id);
  const enemy = combat.combatants.find((entry) => entry.side === "enemies");
  if (heroIndex < 0 || enemy === undefined) throw new Error("Familiar Form fixture has no combatants");
  const staged: DepthState = {
    ...started,
    combat: {
      ...combat,
      activeIndex: heroIndex,
      combatants: combat.combatants.map((entry) => entry.id === started.hero.id
        ? { ...entry, power: 999 }
        : entry.id === enemy.id ? { ...entry, health: 1 } : entry),
    },
  };
  const depth = stepDepth(staged, {
    type: "combat-action",
    action: { actorId: started.hero.id, type: "attack", targetId: enemy.id, abilityId: null, itemId: null },
  });
  const usedWeapon = depth.hero.inventory.find((item) => item.id === originalWeaponId);
  const droppedWeapon = depth.hero.inventory.find((item) => item.id === `loot:${combat.id}:0`);
  const currentReceipt = usedWeapon?.useMastery?.receipts.find((receipt) => receipt.combatId === combat.id);
  const unlockReceipt = usedWeapon?.useMastery?.receipts[5];
  const familiarForm = usedWeapon === undefined ? null : projectFamiliarWeaponForm(usedWeapon);
  if (usedWeapon === undefined || droppedWeapon === undefined || currentReceipt === undefined || unlockReceipt === undefined || familiarForm === null) {
    throw new Error("Familiar Form fixture did not settle mastery and loot");
  }
  expect(depth.hero.equipment.weapon).toBe(droppedWeapon.id);
  expect(currentReceipt.levelBefore).toBe(4);
  const fixture = upgradeWorldState({
    ...base,
    tick: depth.tick,
    hero: {
      ...base.hero,
      level: depth.hero.level,
      experience: depth.hero.experience,
      health: depth.hero.resources.health,
      maxHealth: depth.hero.resources.maxHealth,
      gold: depth.hero.gold,
    },
    depth,
    scene: {
      ...base.scene,
      mode: "battle" as const,
      headline: "A practiced hand finishes the battle.",
      action: `The battle ends in ${currentReceipt.outcome}.`,
      consequence: describeWeaponUseReceipt(usedWeapon.name, currentReceipt),
      sensoryIntensity: 2 as const,
    },
    lifecycle: {
      ...base.lifecycle,
      simulationTick: depth.tick,
      worldClockMinutes: depth.tick * 15,
    },
  });
  await page.addInitScript((world) => {
    sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world));
    sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, fixture);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
  await page.waitForFunction(() => {
    const button = document.querySelector<HTMLButtonElement>("#pause-button");
    if (button === null) return false;
    if (button.textContent !== "Resume") button.click();
    return button.textContent === "Resume";
  }, undefined, { polling: 20, timeout: 15_000 });

  const stage = page.locator("#stage");
  const strip = page.locator("#battle-turn-strip");
  await expect(stage).toHaveAttribute("data-reduced-motion", "true");
  await expect(stage).toHaveAttribute("data-combat-phase", "terminal-tableau");
  await expect(stage).toHaveAttribute("data-weapon-form-id", familiarForm.formId);
  await expect(stage).toHaveAttribute("data-weapon-form-weapon", usedWeapon.id);
  await expect(stage).toHaveAttribute("data-weapon-form-silhouette", familiarForm.silhouette);
  await expect(stage).toHaveAttribute("data-weapon-form-level", "4");
  await expect(stage).toHaveAttribute("data-weapon-form-unlock-receipt", unlockReceipt.id);
  await expect(stage).toHaveAttribute("data-weapon-form-source-combat", combat.id);
  await expect(stage).toHaveAttribute("data-weapon-form-terminal", "true");
  await expect(stage).toHaveAttribute("data-weapon-form-bonus", "0");
  await expect(stage).toHaveAttribute("data-weapon-form-copy", `Resolved with ${usedWeapon.name} · Use L4 · Familiar Form: ${familiarForm.formName} · no combat bonus`);
  await expect(strip).toContainText(`Resolved with ${usedWeapon.name} · Use L4 · Familiar Form: ${familiarForm.formName} · no combat bonus`);
  await expect(strip).toHaveAttribute("data-weapon-form-id", familiarForm.formId);
  await expect(strip).toHaveAttribute("data-weapon-form-unlock-receipt", unlockReceipt.id);
  await expect(page.locator("#gear-summary")).toContainText(`${droppedWeapon.name} · Use L1`);

  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    const containment = await strip.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1, left: bounds.left, right: bounds.right, width: document.documentElement.clientWidth };
    });
    expect(containment.page).toBe(true);
    expect(containment.left).toBeGreaterThanOrEqual(-1);
    expect(containment.right).toBeLessThanOrEqual(containment.width + 1);
  }
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: "/tmp/the-grind-2-familiar-form.png", fullPage: true });
  }

  await page.locator('[data-view="inventory"]').click({ force: true });
  const usedCard = page.locator(`.inventory-item[data-item-id="${usedWeapon.id}"]`);
  await expect(usedCard).toHaveAttribute("data-weapon-form-id", familiarForm.formId);
  await expect(usedCard).toHaveAttribute("data-weapon-form-bonus", "0");
  await expect(usedCard.locator(".item-mastery")).toContainText(`Familiar Form · ${familiarForm.formName} · unlocked at Use L4 · visual handling only · no combat bonus`);
  await page.locator('[data-view="map"]').click({ force: true });
  await expect(stage).not.toHaveAttribute("data-weapon-form-id", familiarForm.formId);
  await page.locator('[data-view="watch"]').click({ force: true });
  await expect(stage).toHaveAttribute("data-weapon-form-id", familiarForm.formId);
  await expect(stage).toHaveAttribute("data-combat-phase", "terminal-tableau");
  await page.addStyleTag({ content: "#stage canvas { display: none !important; }" });
  await expect(stage.locator("canvas")).toBeHidden();
  await expect(strip).toContainText(`Familiar Form: ${familiarForm.formName}`);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
  await expect(stage).toHaveAttribute("data-combat-phase", "terminal-tableau");
  await expect(stage).toHaveAttribute("data-weapon-form-weapon", usedWeapon.id);
  await expect(stage).toHaveAttribute("data-weapon-form-unlock-receipt", unlockReceipt.id);
  expect(errors).toEqual([]);
});

test("presents the forty-fifth weapon mark once from a real retained-weapon combat", async ({ page }) => {
  test.setTimeout(210_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "no-preference" });

  const base = createWorld("mastery-preloot-5", "campaign:browser-weapon-memory");
  const originalWeaponId = base.depth.hero.equipment.weapon;
  const originalWeapon = base.depth.hero.inventory.find((item) => item.id === originalWeaponId);
  if (originalWeaponId === null || originalWeapon === undefined) throw new Error("Weapon-memory fixture has no equipped weapon");
  let rememberedWeapon = originalWeapon;
  for (let index = 0; index < 44; index += 1) {
    const outcome = (["victory", "defeat", "stalemate"] as const)[index % 3] ?? "victory";
    rememberedWeapon = applyWeaponUseMastery(rememberedWeapon, {
      id: `combat:browser-weapon-memory-history:${index}`,
      outcome,
      weaponUse: {
        schemaVersion: 1,
        tracking: "tracked",
        rulesVersion: "weapon-effective-use-v1",
        heroId: base.depth.hero.id,
        weaponId: originalWeaponId,
        basicStrikes: 1 + (index % 3),
        damage: index === 12 ? 240 : 5 + index,
      },
    }, index + 1).item;
  }
  if (rememberedWeapon.useMastery?.experience !== 44 || rememberedWeapon.useMastery.level !== 9) {
    throw new Error("Weapon-memory fixture did not reach L9 / 44 XP");
  }
  const prepared: DepthState = {
    ...base.depth,
    tick: 100,
    hero: {
      ...base.depth.hero,
      inventory: base.depth.hero.inventory.map((item) => item.id === originalWeaponId ? rememberedWeapon : item),
    },
  };
  const started = startCanonicalRouteCombat(prepared, 1);
  const combat = started.combat;
  if (combat === null || combat.weaponUse.tracking !== "tracked") throw new Error("Weapon-memory combat did not bind the retained weapon");
  const heroIndex = combat.turnOrder.indexOf(started.hero.id);
  const enemy = combat.combatants.find((entry) => entry.side === "enemies");
  if (heroIndex < 0 || enemy === undefined) throw new Error("Weapon-memory fixture has no combatants");
  const stagedDepth: DepthState = {
    ...started,
    combat: {
      ...combat,
      activeIndex: heroIndex,
      combatants: combat.combatants.map((entry) => entry.id === started.hero.id
        ? { ...entry, power: 100, health: entry.maxHealth, mana: 0, abilities: [] }
        : entry.id === enemy.id ? { ...entry, health: 1 } : entry),
    },
  };
  const before = upgradeWorldState({
    ...base,
    tick: stagedDepth.tick,
    hero: {
      ...base.hero,
      level: stagedDepth.hero.level,
      experience: stagedDepth.hero.experience,
      health: stagedDepth.hero.resources.health,
      maxHealth: stagedDepth.hero.resources.maxHealth,
      gold: stagedDepth.hero.gold,
    },
    depth: stagedDepth,
    lifecycle: {
      ...base.lifecycle,
      simulationTick: stagedDepth.tick,
      worldClockMinutes: stagedDepth.tick * 15,
    },
  });
  const expected = advanceWorld(before);
  const source = expected.chronicle.at(-1);
  const masteredWeapon = expected.depth.hero.inventory.find((item) => item.id === originalWeaponId);
  const finalReceipt = masteredWeapon?.useMastery?.receipts.at(-1);
  const firstReceipt = masteredWeapon?.useMastery?.receipts[0];
  const unlockReceipt = masteredWeapon?.useMastery?.receipts[5];
  const strongestReceipt = masteredWeapon?.useMastery?.receipts.reduce((strongest, receipt) =>
    receipt.damage > strongest.damage ? receipt : strongest);
  const equippedAfter = expected.depth.hero.equipment.weapon;
  const equippedWeapon = expected.depth.hero.inventory.find((item) => item.id === equippedAfter);
  const familiarForm = masteredWeapon === undefined ? null : projectFamiliarWeaponForm(masteredWeapon);
  if (
    source?.commandType !== "combat-action" || expected.depth.combat !== null ||
    masteredWeapon?.useMastery?.experience !== 45 || masteredWeapon.useMastery.level !== 10 ||
    finalReceipt === undefined || firstReceipt === undefined || unlockReceipt === undefined || strongestReceipt === undefined ||
    finalReceipt.combatId !== combat.id || finalReceipt.resolvedTick !== expected.tick ||
    equippedAfter === null || equippedAfter === originalWeaponId || equippedWeapon === undefined || familiarForm === null
  ) {
    throw new Error(`Weapon-memory live fixture did not resolve canonically: ${JSON.stringify({
      commandType: source?.commandType,
      combatActive: expected.depth.combat !== null,
      experience: masteredWeapon?.useMastery?.experience,
      level: masteredWeapon?.useMastery?.level,
      finalCombatId: finalReceipt?.combatId,
      expectedCombatId: combat.id,
      equippedAfter,
      originalWeaponId,
    })}`);
  }
  const outcomeCounts = masteredWeapon.useMastery.receipts.reduce((counts, receipt) => ({
    ...counts,
    [receipt.outcome]: counts[receipt.outcome] + 1,
  }), { victory: 0, defeat: 0, stalemate: 0 });
  const totalBasicStrikes = masteredWeapon.useMastery.receipts.reduce((total, receipt) => total + receipt.basicStrikes, 0);
  const totalDamage = masteredWeapon.useMastery.receipts.reduce((total, receipt) => total + receipt.damage, 0);

  await page.addInitScript((world) => {
    const key = `the-grind-2:campaign:${world.campaignId}`;
    if (sessionStorage.getItem(key) === null) {
      sessionStorage.setItem(key, JSON.stringify(world));
      sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    }
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, before);
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 20_000 });
  const app = page.locator("#app");
  const stage = page.locator("#stage");
  const pause = page.locator("#pause-button");
  await pause.click();
  await expect(app).toHaveAttribute("data-presentation-paused", "true");
  await pause.click();
  await expect(app).toHaveAttribute("data-presentation-busy", "true", { timeout: 12_000 });
  await pause.click();
  await expect(app).toHaveAttribute("data-presentation-paused", "true");

  const cutaway = page.locator("#weapon-memory-cutaway");
  await expect(cutaway).toBeVisible();
  await expect(cutaway).toHaveAttribute("data-active", "true");
  await expect(cutaway).toHaveAttribute("data-weapon-id", originalWeaponId);
  await expect(cutaway).toHaveAttribute("data-first-receipt", firstReceipt.id);
  await expect(cutaway).toHaveAttribute("data-strongest-receipt", strongestReceipt.id);
  await expect(cutaway).toHaveAttribute("data-final-receipt", finalReceipt.id);
  await expect(cutaway).toHaveAttribute("data-form-receipt", unlockReceipt.id);
  await expect(cutaway).toHaveAttribute("data-outcomes", `${outcomeCounts.victory}:${outcomeCounts.defeat}:${outcomeCounts.stalemate}`);
  await expect(cutaway).toHaveAttribute("data-contribution", `${totalBasicStrikes}:${totalDamage}`);
  await expect(cutaway).toHaveAttribute("data-equipped-after", "false");
  await expect(cutaway).toHaveAttribute("data-equipped-weapon-after", equippedAfter);
  await expect(cutaway).toHaveAttribute("data-mechanical-bonus", "0");
  await expect(stage).toHaveAttribute("data-cutaway-kind", "weapon-memory");
  await expect(stage).toHaveAttribute("data-cutaway-active", "true");
  await expect(stage).toHaveAttribute("data-weapon-memory-weapon", originalWeaponId);
  await expect(stage).toHaveAttribute("data-weapon-memory-experience", "44:45:45");
  await expect(stage).toHaveAttribute("data-weapon-memory-level", "9:10:10");
  await expect(stage).toHaveAttribute("data-weapon-memory-receipts", "45");
  await expect(stage).toHaveAttribute("data-weapon-memory-bonus", "0");
  await expect(page.locator("#weapon-memory-cutaway-title")).toHaveText(`${expected.depth.hero.name} · ${masteredWeapon.name}`);
  await expect(page.locator("#weapon-memory-cutaway-first")).toContainText(`T${firstReceipt.resolvedTick}`);
  await expect(page.locator("#weapon-memory-cutaway-strongest")).toContainText(`${strongestReceipt.damage} damage`);
  await expect(page.locator("#weapon-memory-cutaway-form")).toContainText(familiarForm.formName);
  await expect(page.locator("#weapon-memory-cutaway-final")).toContainText("use XP 44→45 · Use Level 9→10");
  await expect(page.locator("#weapon-memory-cutaway-progress")).toHaveText(`USE MASTERY 10 / 10 · 45 RECORDED ENCOUNTERS · NO COMBAT BONUS · Mastered with ${masteredWeapon.name}; now carrying ${equippedWeapon.name}.`);
  await expect(page.locator("#gear-summary")).toContainText(`${equippedWeapon.name} · Use L1`);

  const persisted = await page.evaluate((campaignId) => {
    const source = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    if (source === null) return null;
    return JSON.parse(source) as { depth: { hero: { inventory: Array<{ id: string; useMastery: null | { experience: number; level: number; receipts: unknown[] } }> } } };
  }, before.campaignId);
  const persistedWeapon = persisted?.depth.hero.inventory.find((item) => item.id === originalWeaponId);
  expect(persistedWeapon?.useMastery).toMatchObject({ experience: 45, level: 10 });
  expect(persistedWeapon?.useMastery?.receipts).toHaveLength(45);

  await page.setViewportSize({ width: 1920, height: 1080 });
  const dpi = await stage.evaluate((element) => ({
    rendererResolution: Number(element.dataset.rendererResolution),
    sceneScale: Number(element.dataset.sceneLayout?.split(",")[0]),
    textResolution: Number(element.dataset.weaponMemoryTextResolution),
  }));
  expect(dpi.textResolution).toBe(Math.min(12, Math.max(1, Math.ceil(dpi.rendererResolution * dpi.sceneScale))));
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    const portrait = viewport.width <= 760 && viewport.height > 520;
    if (portrait) {
      await expect(stage).toHaveAttribute("data-weapon-memory-portrait-stage", "reserved");
      await expect(page.locator("#view-toolbar")).toBeHidden();
    } else {
      await expect(stage).toHaveAttribute("data-weapon-memory-wide-stage", "below-chrome");
    }
    const containment = await cutaway.evaluate((root) => {
      const bounds = root.getBoundingClientRect();
      const children = [...root.querySelectorAll<HTMLElement>("header, [data-weapon-memory-step], #weapon-memory-cutaway-progress, #weapon-memory-cutaway-outcome")].filter((element) => !element.hidden);
      const stage = document.querySelector<HTMLElement>("#stage");
      const [scale = 0, , y = 0] = (stage?.dataset.sceneLayout ?? "").split(",").map(Number);
      return {
        page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        height: bounds.height,
        width: document.documentElement.clientWidth,
        sceneBottom: y + 180 * scale,
        children: children.every((element) => {
          const child = element.getBoundingClientRect();
          return child.left >= bounds.left - 1 && child.right <= bounds.right + 1 && child.top >= bounds.top - 1 && child.bottom <= bounds.bottom + 1;
        }),
      };
    });
    expect(containment.page).toBe(true);
    expect(containment.left).toBeGreaterThanOrEqual(-1);
    expect(containment.right).toBeLessThanOrEqual(containment.width + 1);
    if (portrait) {
      expect(containment.top).toBeGreaterThanOrEqual(viewport.height * 0.46);
      expect(containment.height).toBeLessThanOrEqual(viewport.height * 0.52 + 1);
      expect(containment.sceneBottom).toBeLessThanOrEqual(containment.top + 1);
    } else {
      expect(containment.children, JSON.stringify({ viewport, containment })).toBe(true);
    }
    if (process.env.TG2_VISUAL_CAPTURE === "1" && viewport.width === 320) {
      await page.screenshot({ path: "/tmp/the-grind-2-weapon-memory-mobile.png", fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: "/tmp/the-grind-2-weapon-memory.png", fullPage: true });
  }
  await pause.click();
  await expect(app).toHaveAttribute("data-presentation-paused", "false");
  await expect(stage).toHaveAttribute("data-cutaway-active", "false", { timeout: 15_000 });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(stage).toHaveAttribute("data-weapon-memory-wide-stage", "below-chrome");
  const settledLayout = await stage.getAttribute("data-scene-layout");
  const [settledScale = 0, settledX = 0, settledY = 0] = (settledLayout ?? "").split(",").map(Number);
  expect(settledScale).toBeLessThanOrEqual(3.4);
  expect(settledX).toBeGreaterThan(0);
  expect(settledY).toBeGreaterThanOrEqual(108);
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: "/tmp/the-grind-2-weapon-memory-settled.png", fullPage: true });
  }

  await page.locator('[data-view="inventory"]').click({ force: true });
  await expect(app).toHaveAttribute("data-presentation-busy", "false");
  await expect(cutaway).toBeHidden();
  await expect(stage).not.toHaveAttribute("data-cutaway-event", /.+/);
  await expect(page.locator(`.inventory-item[data-item-id="${originalWeaponId}"] .item-mastery`)).toContainText("Use Mastery L10 / 10 · 45 / 45 XP · mastery cap");
  await page.locator('[data-view="watch"]').click({ force: true });
  await expect(cutaway).toBeHidden();
  await expect(stage).not.toHaveAttribute("data-cutaway-event", /.+/);

  const browserContext = page.context();
  const reducedUrl = page.url();
  await page.close();
  const reducedPage = await browserContext.newPage();
  reducedPage.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  reducedPage.on("pageerror", (error) => errors.push(error.message));
  await reducedPage.emulateMedia({ reducedMotion: "reduce" });
  await reducedPage.addInitScript((world) => {
    sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world));
    sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, before);
  await reducedPage.goto(reducedUrl, { waitUntil: "domcontentloaded" });
  await reducedPage.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 20_000 });
  const reducedApp = reducedPage.locator("#app");
  const reducedStage = reducedPage.locator("#stage");
  const reducedPause = reducedPage.locator("#pause-button");
  const reducedCutaway = reducedPage.locator("#weapon-memory-cutaway");
  await reducedPause.click();
  await expect(reducedApp).toHaveAttribute("data-presentation-paused", "true");
  await reducedPause.click();
  await reducedPage.waitForFunction(() => {
    const app = document.querySelector<HTMLElement>("#app");
    const button = document.querySelector<HTMLButtonElement>("#pause-button");
    if (app?.dataset.presentationBusy !== "true" || button === null) return false;
    if (app.dataset.presentationPaused !== "true") button.click();
    return app.dataset.presentationPaused === "true";
  }, undefined, { polling: 20, timeout: 12_000 });
  await expect(reducedApp).toHaveAttribute("data-presentation-busy", "true");
  await expect(reducedStage).toHaveAttribute("data-reduced-motion", "true");
  await expect(reducedStage).toHaveAttribute("data-cutaway-kind", "weapon-memory");
  await expect(reducedStage).toHaveAttribute("data-cutaway-phase", "static");
  await expect(reducedCutaway).toBeVisible();
  await expect(reducedCutaway).toHaveAttribute("data-active", "true");
  await expect(reducedCutaway).toHaveAttribute("data-phase", "static");
  await expect(reducedPage.locator("#weapon-memory-cutaway-sequence > li[data-reached=\"true\"]")).toHaveCount(6);
  await expect(reducedPage.locator("#weapon-memory-cutaway-road")).toContainText("45/45 recorded encounters");
  await expect(reducedPage.locator("#weapon-memory-cutaway-progress")).toContainText("NO COMBAT BONUS");
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await reducedPage.screenshot({ path: "/tmp/the-grind-2-weapon-memory-reduced.png", fullPage: true });
  }
  await reducedPage.addStyleTag({ content: "#stage canvas { display: none !important; }" });
  await expect(reducedStage.locator("canvas")).toBeHidden();
  await expect(reducedPage.locator("#weapon-memory-cutaway-first")).toContainText(`T${firstReceipt.resolvedTick}`);
  await expect(reducedPage.locator("#weapon-memory-cutaway-strongest")).toContainText(`${strongestReceipt.damage} damage`);
  await expect(reducedPage.locator("#weapon-memory-cutaway-final")).toContainText("use XP 44→45 · Use Level 9→10");
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await reducedPage.screenshot({ path: "/tmp/the-grind-2-weapon-memory-reduced-dom.png", fullPage: true });
  }
  await reducedPage.locator("#weapon-memory-cutaway-outcome").focus();
  await reducedPage.locator("#weapon-memory-cutaway-outcome").press("Enter");
  await expect(reducedApp).toHaveAttribute("data-presentation-busy", "false");
  await expect(reducedPage.locator('.view-button[data-view="watch"]')).toBeFocused();
  await expect(reducedPage.locator("#weapon-memory-cutaway-announcement")).toContainText("Use Mastery 10 of 10 across 45 recorded encounters");

  await reducedPage.reload({ waitUntil: "domcontentloaded" });
  await reducedPage.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 20_000 });
  await expect(reducedPage.locator("#weapon-memory-cutaway")).toBeHidden();
  await expect(reducedPage.locator("#stage")).not.toHaveAttribute("data-cutaway-event", /.+/);
  await reducedPage.close();
  expect(errors).toEqual([]);
});

test("presents a six-unit tactical roster and next-three living turns", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });

  const base = createWorld("browser-combat-roster", "campaign:browser-combat-roster");
  const started = startCanonicalRouteCombat(base.depth, 5);
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
    itemId: null,
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

  const pauseAtStableBoundary = async () => page.waitForFunction(() => {
    if (document.documentElement.dataset.ready !== "true") return false;
    const app = document.querySelector<HTMLElement>("#app");
    const button = document.querySelector<HTMLButtonElement>("#pause-button");
    if (app === null || button === null) return false;
    if (app.dataset.presentationPaused === "true") return true;
    if (button.textContent === "Pause") button.click();
    return false;
  }, undefined, { polling: 20, timeout: 30_000 });

  await page.goto("./?fast");
  await pauseAtStableBoundary();

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
    await expect.poll(async () => stage.evaluate((element) => {
      const host = element.getBoundingClientRect();
      const canvas = element.querySelector("canvas")?.getBoundingClientRect();
      return canvas !== undefined
        && canvas.left >= host.left - 1
        && canvas.right <= host.right + 1
        && canvas.top >= host.top - 1
        && canvas.bottom <= host.bottom + 1;
    })).toBe(true);
  }

  await pause.click({ force: true });
  await page.waitForFunction(() => {
    const stageElement = document.querySelector<HTMLElement>("#stage");
    return stageElement?.dataset.counterDuelPrediction !== undefined;
  }, undefined, { polling: 20, timeout: 15_000 });
  await pauseAtStableBoundary();
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
  expect(savedRound?.history).toBeGreaterThanOrEqual(1);
  expect(savedRound?.round).toBe((savedRound?.history ?? -1) + 1);

  await page.reload({ waitUntil: "domcontentloaded" });
  await pauseAtStableBoundary();
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
    return stageElement !== null && stageElement.dataset.counterDuelOutcome !== "ongoing";
  }, undefined, { polling: 20, timeout: 30_000 });
  await pauseAtStableBoundary();
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
  await expect(stage).toHaveAttribute("data-travel-road-topology", "single-ribbon");
  await expect(stage).toHaveAttribute("data-travel-road-flow", "static");
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
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: "/tmp/the-grind-2-travel-road.png", fullPage: true });
  }
});

test("opens seven read-only inspection views while autoplay continues", async ({ page }) => {
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
  const hall = toolbar.locator("[data-view=hall]");
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
  await expect(hall).toBeFocused();
  await hall.press("Enter");
  await expect(app).toHaveAttribute("data-active-view", "hall");
  await expect(page.locator("#hall-view")).toBeVisible();
  await expect(page.locator("#inspection-title")).toHaveText("Hall of Champions");
  await expect(page.locator("#hall-total")).toHaveText("0");
  await expect(page.locator("#hall-grid .hall-empty")).toContainText("first name will be carved");
  await expect(page.locator("#hall-grid button, #hall-grid input, #hall-grid select")).toHaveCount(0);
  await expect(screenHeroActivity).toHaveAttribute("data-view", "hall");
  await hall.press("ArrowRight");
  await expect(watch).toBeFocused();
  await watch.press("ArrowLeft");
  await expect(hall).toBeFocused();
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
  expect(mobileLayout.rowCount).toBe(3);
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
  await expect(page.locator("#hall-view")).toBeHidden();
  expect(errors).toEqual([]);
});

test("archives one Level 1000 hero atomically and presents a live responsive Hall", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  const saved = heroExperienceBrowserFixture(
    "browser-hall-champion",
    "campaign:browser-hall-champion",
    12 * (maximumHeroLevel - 1) ** 2,
  );
  const champion = saved.championInduction;
  if (champion === null) throw new Error("Browser Hall fixture did not create an induction");
  await page.addInitScript((world) => {
    if (sessionStorage.getItem("the-grind-2:activeCampaignId") !== null) return;
    sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world));
    sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, saved);

  await page.goto("./?fast");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  const app = page.locator("#app");
  const hallButton = page.locator('#view-toolbar [data-view="hall"]');
  await hallButton.click();
  await expect(app).toHaveAttribute("data-active-view", "hall");
  await expect(page.locator("#hall-total")).toHaveText("1", { timeout: 15_000 });
  await expect(page.locator("#hall-earned")).toHaveText("1");
  await expect(page.locator("#hall-adopted")).toHaveText("0");
  const card = page.locator(`#hall-grid [data-champion-id="${champion.id}"]`);
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute("data-qualification", "earned");
  await expect(card).toContainText(champion.heroName);
  await expect(card).toContainText("Level 1000");
  await expect(card).toContainText("Eternal campaign not retired");
  await expect(page.locator("#screen-hero-activity")).toHaveAttribute("data-view", "hall");
  await expect(page.locator("#hall-grid button, #hall-grid input, #hall-grid select")).toHaveCount(0);
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: "/tmp/the-grind-2-hall-desktop.png", fullPage: true });
  }

  const storage = await page.evaluate(async ({ campaignId, championId }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("the-grind-2");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const transaction = database.transaction(["campaigns", "champions"], "readonly");
    const requestValue = <T,>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const [campaign, archived, all] = await Promise.all([
      requestValue(transaction.objectStore("campaigns").get(campaignId)),
      requestValue(transaction.objectStore("champions").get(championId)),
      requestValue(transaction.objectStore("champions").getAll()),
    ]);
    const stores = [...database.objectStoreNames];
    const version = database.version;
    database.close();
    return {
      version,
      stores,
      campaign,
      archived,
      championCount: all.length,
      sessionMirror: sessionStorage.getItem(`the-grind-2:champion:${championId}`),
    };
  }, { campaignId: saved.campaignId, championId: champion.id });
  expect(storage.version).toBe(2);
  expect(storage.stores).toContain("champions");
  expect(storage.championCount).toBe(1);
  expect(storage.archived).toEqual(champion);
  expect((storage.campaign as typeof saved).championInduction).toEqual(champion);
  expect(JSON.parse(storage.sessionMirror ?? "null")).toEqual(champion);

  const tickBefore = await app.getAttribute("data-simulation-tick");
  await expect(app).not.toHaveAttribute("data-simulation-tick", tickBefore ?? "0", { timeout: 15_000 });
  await expect(app).toHaveAttribute("data-active-view", "hall");
  await expect(card).toHaveCount(1);

  await page.setViewportSize({ width: 390, height: 844 });
  const portrait = await page.evaluate(() => {
    const toolbar = document.querySelector("#view-toolbar")?.getBoundingClientRect();
    const heading = document.querySelector(".inspection-heading")?.getBoundingClientRect();
    const cards = [...document.querySelectorAll<HTMLElement>(".hall-champion")].map((element) => element.getBoundingClientRect());
    return {
      toolbarBottom: toolbar?.bottom ?? Number.POSITIVE_INFINITY,
      headingTop: heading?.top ?? 0,
      widestRight: Math.max(0, ...cards.map((bounds) => bounds.right)),
      minimumCardLeft: Math.min(Number.POSITIVE_INFINITY, ...cards.map((bounds) => bounds.left)),
    };
  });
  expect(portrait.headingTop).toBeGreaterThanOrEqual(portrait.toolbarBottom);
  expect(portrait.widestRight).toBeLessThanOrEqual(390);
  expect(portrait.minimumCardLeft).toBeGreaterThanOrEqual(0);
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect(app).toHaveAttribute("data-active-view", "hall");
    await expect(page.locator("#hall-view")).toBeVisible();
    const containment = await page.evaluate(() => {
      const cards = [...document.querySelectorAll<HTMLElement>(".hall-champion")]
        .map((element) => element.getBoundingClientRect());
      const viewportWidth = document.documentElement.clientWidth;
      return {
        viewportWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        widestRight: Math.max(0, ...cards.map((bounds) => bounds.right)),
        minimumLeft: Math.min(Number.POSITIVE_INFINITY, ...cards.map((bounds) => bounds.left)),
      };
    });
    expect(containment.documentScrollWidth).toBeLessThanOrEqual(containment.viewportWidth);
    expect(containment.widestRight).toBeLessThanOrEqual(containment.viewportWidth);
    expect(containment.minimumLeft).toBeGreaterThanOrEqual(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addStyleTag({ content: "#stage canvas { display: none !important; }" });
  await expect(page.locator("#hall-view")).toBeVisible();
  await expect(card).toBeVisible();
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: "/tmp/the-grind-2-hall-mobile.png", fullPage: true });
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await page.locator('#view-toolbar [data-view="hall"]').click();
  await expect(page.locator("#hall-total")).toHaveText("1");
  await expect(page.locator(`#hall-grid [data-champion-id="${champion.id}"]`)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("upgrades Hall storage and atomically retries an immutable champion collision", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  const threshold = 12 * (maximumHeroLevel - 1) ** 2;
  const before = heroExperienceBrowserFixture(
    "browser-hall-rollback",
    "campaign:browser-hall-rollback",
    threshold - 1,
  );
  const expected = advanceWorld(before);
  const champion = expected.championInduction;
  if (champion === null) throw new Error("Rollback fixture did not cross the Champion threshold");
  const collision = { ...champion, heroName: `${champion.heroName} Corrupted` };

  await page.goto("./version.json");
  await page.evaluate(async ({ world }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("the-grind-2");
      request.addEventListener("success", () => resolve(), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("the-grind-2", 1);
      request.addEventListener("upgradeneeded", () => {
        request.result.createObjectStore("campaigns", { keyPath: "campaignId" });
        request.result.createObjectStore("settings");
      }, { once: true });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["campaigns", "settings"], "readwrite");
      transaction.objectStore("campaigns").put(world);
      transaction.objectStore("settings").put(world.campaignId, "activeCampaignId");
      transaction.objectStore("settings").put("preserved", "upgrade-sentinel");
      transaction.addEventListener("complete", () => resolve(), { once: true });
      transaction.addEventListener("error", () => reject(transaction.error), { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    });
    database.close();
  }, { world: before });

  await page.goto("./");
  await page.waitForFunction(() => {
    if (document.documentElement.dataset.ready !== "true") return false;
    const app = document.querySelector<HTMLElement>("#app");
    const button = document.querySelector<HTMLButtonElement>("#pause-button");
    if (app === null || button === null) return false;
    if (app.dataset.presentationPaused !== "true") button.click();
    return app.dataset.presentationPaused === "true";
  }, undefined, { polling: 20, timeout: 20_000 });

  const upgraded = await page.evaluate(async (campaignId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("the-grind-2");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const transaction = database.transaction(["campaigns", "settings", "champions"], "readonly");
    const result = <T,>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const [campaign, active, sentinel, champions] = await Promise.all([
      result(transaction.objectStore("campaigns").get(campaignId)),
      result(transaction.objectStore("settings").get("activeCampaignId")),
      result(transaction.objectStore("settings").get("upgrade-sentinel")),
      result(transaction.objectStore("champions").getAll()),
    ]);
    const version = database.version;
    const stores = [...database.objectStoreNames];
    database.close();
    return { version, stores, campaign, active, sentinel, champions };
  }, before.campaignId);
  expect(upgraded).toMatchObject({
    version: 2,
    active: before.campaignId,
    sentinel: "preserved",
    champions: [],
  });
  expect(upgraded.stores).toEqual(["campaigns", "champions", "settings"]);
  expect(upgraded.campaign).toEqual(before);

  await page.evaluate(async (fault) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("the-grind-2");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("champions", "readwrite");
      transaction.objectStore("champions").add(fault);
      transaction.addEventListener("complete", () => resolve(), { once: true });
      transaction.addEventListener("error", () => reject(transaction.error), { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    });
    database.close();
  }, collision);

  await page.locator("#pause-button").click();
  await page.waitForFunction(() => {
    const app = document.querySelector<HTMLElement>("#app");
    const button = document.querySelector<HTMLButtonElement>("#pause-button");
    if (app?.dataset.runtimeStatus !== "recovering" || button === null) return false;
    if (app.dataset.presentationPaused !== "true") button.click();
    return app.dataset.presentationPaused === "true";
  }, undefined, { polling: 20, timeout: 15_000 });

  const rolledBack = await page.evaluate(async ({ campaignId, championId }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("the-grind-2");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const transaction = database.transaction(["campaigns", "champions"], "readonly");
    const result = <T,>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const [campaign, archived] = await Promise.all([
      result(transaction.objectStore("campaigns").get(campaignId)),
      result(transaction.objectStore("champions").get(championId)),
    ]);
    database.close();
    return {
      campaign,
      archived,
      campaignMirror: sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`),
      championMirror: sessionStorage.getItem(`the-grind-2:champion:${championId}`),
    };
  }, { campaignId: before.campaignId, championId: champion.id });
  expect(rolledBack.campaign).toEqual(before);
  expect(rolledBack.archived).toEqual(collision);
  expect(JSON.parse(rolledBack.campaignMirror ?? "null")).toEqual(before);
  expect(rolledBack.championMirror).toBeNull();

  await page.evaluate(async (championId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("the-grind-2");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("champions", "readwrite");
      transaction.objectStore("champions").delete(championId);
      transaction.addEventListener("complete", () => resolve(), { once: true });
      transaction.addEventListener("error", () => reject(transaction.error), { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    });
    database.close();
  }, champion.id);
  await page.locator("#pause-button").click();
  await page.waitForFunction((championId) =>
    sessionStorage.getItem(`the-grind-2:champion:${championId}`) !== null,
  champion.id, { polling: 20, timeout: 15_000 });
  await page.locator("#pause-button").click();

  const retried = await page.evaluate(async ({ campaignId, championId }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("the-grind-2");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const transaction = database.transaction(["campaigns", "champions"], "readonly");
    const result = <T,>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const [campaign, archived, all] = await Promise.all([
      result(transaction.objectStore("campaigns").get(campaignId)),
      result(transaction.objectStore("champions").get(championId)),
      result(transaction.objectStore("champions").getAll()),
    ]);
    database.close();
    return {
      campaign,
      archived,
      championCount: all.length,
      campaignMirror: sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`),
      championMirror: sessionStorage.getItem(`the-grind-2:champion:${championId}`),
    };
  }, { campaignId: before.campaignId, championId: champion.id });
  expect(retried.campaign).toMatchObject({
    campaignId: expected.campaignId,
    championInduction: champion,
  });
  expect((retried.campaign as typeof expected).tick).toBeGreaterThanOrEqual(expected.tick);
  expect(retried.archived).toEqual(champion);
  expect(retried.championCount).toBe(1);
  expect(JSON.parse(retried.campaignMirror ?? "null")).toEqual(retried.campaign);
  expect(JSON.parse(retried.championMirror ?? "null")).toEqual(champion);
  expect(errors).toEqual([]);
});

test("admits three immutable Hall legends only when a campaign is created", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  const threshold = 12 * (maximumHeroLevel - 1) ** 2;
  const records = Array.from({ length: 6 }, (_, index) => {
    const world = heroExperienceBrowserFixture(
      `browser-legacy-source:${index}`,
      `campaign:browser-legacy-source:${index}`,
      threshold,
    );
    if (world.championInduction === null) throw new Error("Browser legacy source lacks a Champion record");
    return world.championInduction;
  });
  const later = heroExperienceBrowserFixture(
    "browser-legacy-source:later",
    "campaign:browser-legacy-source:later",
    threshold,
  ).championInduction;
  if (later === null) throw new Error("Later browser legacy source lacks a Champion record");

  await page.goto("./version.json");
  await page.evaluate(async (champions) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("the-grind-2");
      request.addEventListener("success", () => resolve(), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("the-grind-2", 2);
      request.addEventListener("upgradeneeded", () => {
        request.result.createObjectStore("campaigns", { keyPath: "campaignId" });
        request.result.createObjectStore("settings");
        request.result.createObjectStore("champions", { keyPath: "id" });
      }, { once: true });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("champions", "readwrite");
      for (const champion of champions) transaction.objectStore("champions").add(champion);
      transaction.addEventListener("complete", () => resolve(), { once: true });
      transaction.addEventListener("error", () => reject(transaction.error), { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    });
    database.close();
  }, records);

  await page.goto("./");
  await page.waitForFunction(() => {
    if (document.documentElement.dataset.ready !== "true") return false;
    const app = document.querySelector<HTMLElement>("#app");
    const button = document.querySelector<HTMLButtonElement>("#pause-button");
    if (app === null || button === null) return false;
    if (app.dataset.presentationPaused !== "true") button.click();
    return app.dataset.presentationPaused === "true";
  }, undefined, { polling: 20, timeout: 20_000 });
  const app = page.locator("#app");
  const firstCampaignId = await page.locator("#campaign-select").inputValue();
  const firstLegacy = await page.evaluate((campaignId) => {
    const source = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    if (source === null) return null;
    return (JSON.parse(source) as { legacy: unknown }).legacy;
  }, firstCampaignId);
  expect(firstLegacy).toMatchObject({ schemaVersion: 1, selectorVersion: 1 });
  expect((firstLegacy as { cards: unknown[] }).cards).toHaveLength(3);
  const firstLegacyJson = JSON.stringify(firstLegacy);

  await page.locator('#view-toolbar [data-view="hall"]').click();
  await expect(app).toHaveAttribute("data-active-view", "hall");
  await expect(page.locator("#hall-admitted")).toHaveText("3");
  await expect(page.locator("#hall-legacy-grid .hall-legacy-card")).toHaveCount(3);
  await expect(page.locator("#hall-legacy-summary")).toContainText("No stats, gear, gold, quests, or powers were imported");
  await expect(page.locator('#hall-grid .hall-champion[data-campaign-legacy="true"]')).toHaveCount(3);
  await expect(page.locator("#hall-legacy-grid button, #hall-legacy-grid input, #hall-legacy-grid select")).toHaveCount(0);
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: "/tmp/the-grind-2-legends-desktop.png", fullPage: true });
  }
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect(app).toHaveAttribute("data-active-view", "hall");
    const containment = await page.evaluate(() => {
      const cards = [...document.querySelectorAll<HTMLElement>(".hall-legacy-card")]
        .map((element) => element.getBoundingClientRect());
      return {
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        right: Math.max(0, ...cards.map((bounds) => bounds.right)),
        left: Math.min(Number.POSITIVE_INFINITY, ...cards.map((bounds) => bounds.left)),
      };
    });
    expect(containment.scrollWidth).toBeLessThanOrEqual(containment.width);
    expect(containment.right).toBeLessThanOrEqual(containment.width);
    expect(containment.left).toBeGreaterThanOrEqual(0);
    if (process.env.TG2_VISUAL_CAPTURE === "1" && viewport.width === 320) {
      await page.screenshot({ path: "/tmp/the-grind-2-legends-mobile.png", fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const tickBefore = await app.getAttribute("data-simulation-tick");
  await page.locator("#pause-button").click();
  await expect(app).not.toHaveAttribute("data-simulation-tick", tickBefore ?? "0", { timeout: 10_000 });
  await expect(app).toHaveAttribute("data-active-view", "hall");
  await page.locator("#pause-button").click();

  await page.evaluate(async (champion) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("the-grind-2");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("champions", "readwrite");
      transaction.objectStore("champions").add(champion);
      transaction.addEventListener("complete", () => resolve(), { once: true });
      transaction.addEventListener("error", () => reject(transaction.error), { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    });
    database.close();
  }, later);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    if (document.documentElement.dataset.ready !== "true") return false;
    const app = document.querySelector<HTMLElement>("#app");
    const button = document.querySelector<HTMLButtonElement>("#pause-button");
    if (app === null || button === null) return false;
    if (app.dataset.presentationPaused !== "true") button.click();
    return app.dataset.presentationPaused === "true";
  }, undefined, { polling: 20, timeout: 20_000 });
  await page.locator('#view-toolbar [data-view="hall"]').click();
  await expect(page.locator("#hall-total")).toHaveText("7");
  await expect(page.locator("#hall-admitted")).toHaveText("3");
  const reloadedLegacy = await page.evaluate((campaignId) => {
    const source = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    return source === null ? null : (JSON.parse(source) as { legacy: unknown }).legacy;
  }, firstCampaignId);
  expect(JSON.stringify(reloadedLegacy)).toBe(firstLegacyJson);

  await page.locator("#new-button").click();
  await expect(page.locator("#campaign-select")).not.toHaveValue(firstCampaignId, { timeout: 15_000 });
  const secondCampaignId = await page.locator("#campaign-select").inputValue();
  const second = await page.evaluate((campaignId) => {
    const source = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    if (source === null) return null;
    const world = JSON.parse(source) as {
      hero: { level: number };
      legacy: { cards: Array<Record<string, unknown>> };
    };
    return { heroLevel: world.hero.level, cards: world.legacy.cards };
  }, secondCampaignId);
  expect(second?.heroLevel).toBe(1);
  expect(second?.cards).toHaveLength(3);
  for (const card of second?.cards ?? []) {
    expect(records.some((record) => record.id === card.sourceChampionId) || later.id === card.sourceChampionId).toBe(true);
    expect(card).not.toHaveProperty("experience");
    expect(card).not.toHaveProperty("equipment");
    expect(card).not.toHaveProperty("gold");
  }
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

test("fully rests before a mandatory road encounter with exact responsive Canvas and DOM parity", async ({ page }) => {
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

  const base = createWorld("browser-critical-roadside-rest", "campaign:browser-critical-roadside-rest");
  const originId = base.depth.atlas.currentLocationId;
  const current = base.depth.atlas.locations.find((location) => location.kind === "town" && location.id !== originId);
  if (current === undefined) throw new Error("Browser recovery fixture needs another town");
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
  const routed = advanceWorld(joined);
  const companion = routed.depth.companions.active[0];
  if (routed.depth.atlas.route === null || companion === undefined) {
    throw new Error("Browser recovery fixture did not establish a Shared Road route");
  }
  const healthBefore = Math.floor(routed.depth.hero.resources.maxHealth / 2);
  const manaBefore = 0;
  const depleteHero = (world: typeof routed) => upgradeWorldState({
      ...world,
      hero: { ...world.hero, health: healthBefore },
      depth: {
        ...world.depth,
        hero: {
          ...world.depth.hero,
          resources: { ...world.depth.hero.resources, health: healthBefore, mana: manaBefore },
        },
      },
  });
  const depleted = depleteHero(routed);
  const fixture = advanceWorld(depleted);
  const injuredRouted = upgradeWorldState({
    ...routed,
    depth: {
      ...routed.depth,
      companions: {
        ...routed.depth.companions,
        active: [{
          ...companion,
          resources: { ...companion.resources, health: 0 },
          injury: "fallen" as const,
        }],
      },
    },
  });
  const injuredFixture = advanceWorld(depleteHero(injuredRouted));
  const resources = fixture.depth.hero.resources;
  const exactRecovery = `HP ${healthBefore}→${resources.maxHealth} (+${resources.maxHealth - healthBefore}) · MP ${manaBefore}→${resources.maxMana} (+${resources.maxMana - manaBefore})`;
  expect(fixture.scene.mode).toBe("camp");
  expect(fixture.scene.action).toContain(exactRecovery);
  expect(fixture.hero.experience).toBe(depleted.hero.experience);
  expect(injuredFixture.scene.mode).toBe("camp");
  expect(() => upgradeWorldState(JSON.parse(JSON.stringify(fixture)))).not.toThrow();

  await page.goto("./");
  await pauseOnReady();
  await page.evaluate((world) => sessionStorage.setItem("the-grind-2:test-fixture", JSON.stringify(world)), fixture);
  await page.reload({ waitUntil: "domcontentloaded" });
  await pauseOnReady();

  const stage = page.locator("#stage");
  await expect(stage).toHaveAttribute("data-scene-mode", "camp");
  await expect(stage).toHaveAttribute("data-reduced-motion", "true");
  await expect(stage).toHaveAttribute("data-camp-recovery", "ready-for-road");
  await expect(stage).toHaveAttribute("data-camp-resources", `${resources.maxHealth}/${resources.maxHealth}/${resources.maxMana}/${resources.maxMana}`);
  await expect(stage).toHaveAttribute("data-camp-hero-position", "224/151");
  await expect(stage).toHaveAttribute("data-camp-companion-position", "190/153");
  await expect(stage).toHaveAttribute("data-companion-id", companion.identity.residentId);
  await expect(stage).toHaveAttribute("data-companion-status", "travelling");
  await expect(page.locator("#scene-headline")).toHaveText("A wise camp turns survival into readiness.");
  await expect(page.locator("#scene-action")).toContainText(exactRecovery);
  await expect(page.locator("#scene-consequence")).toContainText("the same encounter still waits");
  await expect(page.locator("#event-log")).toContainText(exactRecovery);

  const viewports = [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 },
  ];
  const expectPartyClear = async () => {
    await expect.poll(() => page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>("#stage");
      const chronicle = document.querySelector<HTMLElement>(".chronicle")?.getBoundingClientRect();
      const hud = document.querySelector<HTMLElement>(".hero-hud")?.getBoundingClientRect();
      if (stage === null || chronicle === undefined || hud === undefined) return null;
      const values = (stage.dataset.sceneLayout ?? "").split(",").map(Number);
      const [scale, offsetX, offsetY] = values;
      if (![scale, offsetX, offsetY].every(Number.isFinite)) return null;
      const actorRect = (x: number, y: number) => ({
        left: offsetX! + (x - 16) * scale!,
        right: offsetX! + (x + 16) * scale!,
        top: offsetY! + (y - 36) * scale!,
        bottom: offsetY! + (y + 4) * scale!,
      });
      const overlaps = (left: ReturnType<typeof actorRect>, right: DOMRect) => !(
        left.right <= right.left || left.left >= right.right || left.bottom <= right.top || left.top >= right.bottom
      );
      const hero = actorRect(Number(stage.dataset.campHeroPosition?.split("/")[0]), Number(stage.dataset.campHeroPosition?.split("/")[1]));
      const companion = actorRect(Number(stage.dataset.campCompanionPosition?.split("/")[0]), Number(stage.dataset.campCompanionPosition?.split("/")[1]));
      const heroClear = !overlaps(hero, chronicle) && !overlaps(hero, hud);
      const companionClear = !overlaps(companion, chronicle) && !overlaps(companion, hud);
      return heroClear && companionClear ? "clear" : JSON.stringify({
        viewport: [innerWidth, innerHeight],
        layout: values,
        hero,
        companion,
        chronicle: { left: chronicle.left, right: chronicle.right, top: chronicle.top, bottom: chronicle.bottom },
        hud: { left: hud.left, right: hud.right, top: hud.top, bottom: hud.bottom },
      });
    }), { timeout: 5_000 }).toBe("clear");
  };
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(stage).toHaveAttribute("data-camp-recovery", "ready-for-road");
    await expectPartyClear();
    await expect.poll(() => page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#stage")?.getBoundingClientRect();
      const canvas = document.querySelector<HTMLCanvasElement>("#stage canvas")?.getBoundingClientRect();
      return host === undefined || canvas === undefined ? null : {
        canvasInside: canvas.left >= host.left - 1 && canvas.right <= host.right + 1 && canvas.top >= host.top - 1 && canvas.bottom <= host.bottom + 1,
      };
    }), { timeout: 5_000 }).toEqual({ canvasInside: true });
  }
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: "/tmp/the-grind-2-critical-roadside-rest.png", fullPage: true });
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await pauseOnReady();
  await expect(stage).toHaveAttribute("data-camp-resources", `${resources.maxHealth}/${resources.maxHealth}/${resources.maxMana}/${resources.maxMana}`);
  await expect(page.locator("#scene-action")).toContainText(exactRecovery);
  await page.evaluate((world) => sessionStorage.setItem("the-grind-2:test-fixture", JSON.stringify(world)), injuredFixture);
  await page.reload({ waitUntil: "domcontentloaded" });
  await pauseOnReady();
  await expect(stage).toHaveAttribute("data-companion-status", "injured");
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(stage).toHaveAttribute("data-camp-recovery", "ready-for-road");
    await expectPartyClear();
  }
  await page.addStyleTag({ content: "#stage canvas { display: none !important; }" });
  await expect(page.locator("#stage canvas")).toBeHidden();
  await expect(page.locator("#scene-action")).toContainText(exactRecovery);
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
  test.setTimeout(360_000);
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
    world.depth.heroGrowth.baselineAttributes = { ...world.depth.hero.attributes };
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
  const cutaway = page.locator("#trap-cutaway");
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-busy", "true");
  await expect(cutaway).toBeVisible();
  await expect(cutaway).toHaveAttribute("data-active", "true");
  await expect(cutaway).toHaveAttribute("data-outcome", "disarmed");
  await expect(cutaway).toHaveAttribute("data-stage", "disarm");
  await expect(cutaway).toHaveAttribute("data-shot", /^(wide-profile|hero-closeup|mechanism-closeup)$/);
  await expect(cutaway).toHaveAttribute("data-flavor", "none");
  await expect(stage).toHaveAttribute("data-cutaway-active", "true");
  await expect(stage).toHaveAttribute("data-cutaway-stage", "disarm");
  await expect(stage).toHaveAttribute("data-cutaway-outcome", "disarmed");
  await expect(stage).toHaveAttribute("data-cutaway-phase", "static");
  await expect(stage).toHaveAttribute("data-cutaway-check", /^agility:\d+\+\d+=\d+:11$/);
  await expect(stage).toHaveAttribute("data-cutaway-health", new RegExp(`^${healthBefore}:0:${healthBefore}:\\d+$`));
  await expect(stage).toHaveAttribute("data-cutaway-exit", "true");
  await expect(stage).toHaveAttribute("data-cutaway-quest-delta", "1");
  await expect(stage).toHaveAttribute("data-cutaway-flavor", "none");
  await expect(stage).toHaveAttribute("data-cutaway-flourish", "none");
  await expect(stage).toHaveAttribute("data-cutaway-shot", await cutaway.getAttribute("data-shot") ?? "missing");
  await expect(page.locator("#trap-cutaway-title")).toContainText("whisper-wire");
  await expect(page.locator("#trap-cutaway-check")).toContainText(/agility · \d+ \+ \d+ = \d+ vs 11/);
  await expect(page.locator("#trap-cutaway-result")).toHaveText("DISARMED · detected → disarmed");
  await expect(page.locator("#trap-cutaway-consequence")).toHaveText(`HP ${healthBefore} → ${healthBefore} (no damage)`);
  await expect(page.locator("#trap-cutaway-progress")).toContainText("Exit reached · Cross-maze quest +1");
  await expect(page.locator("#trap-cutaway-sequence > li")).toHaveCount(5);
  const persistedBeforeSpectacle = await page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    const source = campaignId === null ? null : sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    if (source === null) return null;
    const world = JSON.parse(source);
    return {
      eventId: world.chronicle?.at(-1)?.id,
      phase: world.depth?.dungeon?.traps?.[0]?.phase,
      completed: world.depth?.dungeon?.completed,
    };
  });
  expect(persistedBeforeSpectacle).toEqual({
    eventId: await stage.getAttribute("data-cutaway-event"),
    phase: "disarmed",
    completed: true,
  });
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    const bounds = await cutaway.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
    await expect(page.locator("#trap-cutaway-sequence > li")).toHaveCount(5);
  }
  const canvasHiddenStyle = await page.addStyleTag({ content: "#stage canvas { display: none !important; }" });
  await expect(page.locator("#stage canvas")).toBeHidden();
  await expect(cutaway).toBeVisible();
  await expect(page.locator("#trap-cutaway-result")).toHaveText("DISARMED · detected → disarmed");
  await canvasHiddenStyle.evaluate((element) => element.remove());
  await page.locator("#trap-cutaway-outcome").click();
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-busy", "false");
  await expect(cutaway).toHaveAttribute("data-active", "false");
  await expect(page.locator("#trap-cutaway-outcome")).toBeHidden();
  await expect(page.locator("#trap-cutaway-announcement")).toHaveText(/DISARMED\. HP \d+ to \d+\. Dungeon exit reached\./);
  await expect(page.locator('[data-view="watch"]')).toBeFocused();
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
  const persistedPresentationKeys = await page.evaluate(() => [...Object.keys(sessionStorage), ...Object.keys(localStorage)]
    .filter((key) => /cutaway|fatigue/i.test(key)));
  expect(persistedPresentationKeys).toEqual([]);
  await page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    if (campaignId !== null) localStorage.setItem(`the-grind-2:last-active:${campaignId}`, String(Date.now() + 60_000));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await pauseOnReady();
  await expect(page.locator("#trap-cutaway")).toBeHidden();
  await expect(page.locator("#trap-cutaway")).not.toHaveAttribute("data-shot", /.+/);
  await expect(page.locator("#trap-cutaway")).not.toHaveAttribute("data-flavor", /.+/);
  await expect(page.locator("#stage")).not.toHaveAttribute("data-cutaway-event", /.+/);
  expect(errors).toEqual([]);
});

test("pauses, settles, and resets a normal-motion trap cutaway across campaigns", async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const fixture = detectedTrapBrowserFixture("browser-cutaway-motion", "campaign:browser-cutaway-motion");
  await page.addInitScript((world) => {
    sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world));
    sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, fixture);
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
  const app = page.locator("#app");
  const pause = page.locator("#pause-button");
  if (await app.getAttribute("data-presentation-busy") !== "true") {
    await pause.click();
    await expect(app).toHaveAttribute("data-presentation-paused", "true");
    if (await app.getAttribute("data-presentation-busy") !== "true") {
      await expect(page.locator("#stage")).toHaveAttribute("data-dungeon-trap", "armed");
      await pause.click();
      await expect(app).toHaveAttribute("data-presentation-busy", "true", { timeout: 12_000 });
    }
  }
  if (await app.getAttribute("data-presentation-paused") !== "true") await pause.click();
  await expect(app).toHaveAttribute("data-presentation-paused", "true");
  await expect(app).toHaveAttribute("data-presentation-busy", "true");
  await expect(page.locator("#stage")).toHaveAttribute("data-cutaway-active", "true");
  await expect(page.locator("#stage")).toHaveAttribute("data-cutaway-flavor", "wire-curl");
  await expect(page.locator("#stage")).toHaveAttribute("data-cutaway-flourish", "present");
  const frozenPhase = await page.locator("#stage").getAttribute("data-cutaway-phase");
  await page.waitForTimeout(1_100);
  await expect(page.locator("#stage")).toHaveAttribute("data-cutaway-phase", frozenPhase ?? "command");
  const mapButton = page.locator('#view-toolbar [data-view="map"]');
  await mapButton.click();
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-busy", "false");
  await expect(page.locator("#trap-cutaway")).toBeHidden();
  await expect(page.locator("#stage")).not.toHaveAttribute("data-cutaway-event", /.+/);
  await expect(page.locator("#stage")).toHaveAttribute("data-renderer-listener-count", "3");
  await expect(mapButton).toBeFocused();
  const priorCampaign = await page.locator("#campaign-select").inputValue();
  await page.locator("#new-button").click();
  await expect(page.locator("#campaign-select")).not.toHaveValue(priorCampaign, { timeout: 15_000 });
  await expect(page.locator("#trap-cutaway")).not.toHaveAttribute("data-shot", /.+/);
  await expect(page.locator("#trap-cutaway")).not.toHaveAttribute("data-flavor", /.+/);
  const resetTick = Number(await app.getAttribute("data-simulation-tick"));
  if (await app.getAttribute("data-presentation-paused") === "true") await pause.click();
  await expect(app).toHaveAttribute("data-presentation-paused", "false");
  await expect.poll(async () => Number(await app.getAttribute("data-simulation-tick")), {
    timeout: 12_000,
  }).toBeGreaterThan(resetTick);
  expect(errors).toEqual([]);
});

test("presents one truthful responsive earned-level montage after persistence", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const fixture = heroExperienceBrowserFixture(
    "browser-level-up-montage",
    "campaign:browser-level-up-montage",
    11,
  );
  await page.addInitScript((world) => {
    const key = `the-grind-2:campaign:${world.campaignId}`;
    if (sessionStorage.getItem(key) === null) {
      sessionStorage.setItem(key, JSON.stringify(world));
      sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    }
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, fixture);
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 20_000 });
  const app = page.locator("#app");
  const stage = page.locator("#stage");
  const pause = page.locator("#pause-button");
  await pause.click();
  await expect(app).toHaveAttribute("data-presentation-paused", "true");
  await pause.click();
  await expect(app).toHaveAttribute("data-presentation-busy", "true", { timeout: 12_000 });
  await pause.click();
  await expect(app).toHaveAttribute("data-presentation-paused", "true");

  const cutaway = page.locator("#level-up-cutaway");
  await expect(cutaway).toBeVisible();
  await expect(cutaway).toHaveAttribute("data-active", "true");
  await expect(cutaway).toHaveAttribute("data-emphasis", "standard");
  await expect(cutaway).toHaveAttribute("data-progression-band", "adventurer");
  await expect(stage).toHaveAttribute("data-cutaway-kind", "hero-level-up");
  await expect(stage).toHaveAttribute("data-cutaway-active", "true");
  await expect(stage).toHaveAttribute("data-level-up-level", "1:2:1");
  await expect(stage).toHaveAttribute("data-level-up-experience", "11:1:12");
  await expect(stage).toHaveAttribute("data-level-up-thresholds", "2:2:1");
  await expect(stage).toHaveAttribute("data-level-up-mechanical", "1:2");
  await expect(stage).toHaveAttribute("data-level-up-level-effect", "1:0:0:0:0");
  await expect(stage).toHaveAttribute("data-level-up-concurrent-effect", "0:0:0:0:0");
  await expect(stage).toHaveAttribute("data-level-up-source", "command-award");
  await expect(stage).toHaveAttribute("data-level-up-next-requirement", "48");
  await expect(page.locator("#level-up-cutaway-title")).toHaveText(`${fixture.hero.name} · Level 2`);
  await expect(page.locator("#level-up-cutaway-source")).toContainText("+1 XP");
  await expect(page.locator("#level-up-cutaway-threshold")).toHaveText("11 + 1 = 12 XP · threshold 12");
  await expect(page.locator("#level-up-cutaway-level")).toHaveText("LEVEL 1 → 2");
  await expect(page.locator("#level-up-cutaway-mechanics")).toHaveText("Level effect: Power +1");
  await expect(page.locator("#level-up-cutaway-tableau")).toContainText(`Mastery ${fixture.hero.mastery}`);
  await expect(page.locator("#level-up-cutaway-progress")).toContainText("Level 3 at 48 XP");
  await expect(page.locator("#level-up-cutaway-sequence > li:not([hidden])")).toHaveCount(5);
  await expect(page.locator("#level-up-cutaway-selection-step")).toBeHidden();

  const persisted = await page.evaluate((campaignId) => {
    const source = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    if (source === null) return null;
    const world = JSON.parse(source) as { hero: { experience: number; level: number }; depth: { hero: { experience: number; level: number } } };
    return { hero: world.hero, depth: { experience: world.depth.hero.experience, level: world.depth.hero.level } };
  }, fixture.campaignId);
  expect(persisted).toEqual({
    hero: expect.objectContaining({ experience: 12, level: 2 }),
    depth: { experience: 12, level: 2 },
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  const dpi = await stage.evaluate((element) => ({
    rendererResolution: Number(element.dataset.rendererResolution),
    sceneScale: Number(element.dataset.sceneLayout?.split(",")[0]),
    textResolution: Number(element.dataset.levelUpTextResolution),
  }));
  expect(dpi.textResolution).toBe(Math.min(12, Math.max(1, Math.ceil(dpi.rendererResolution * dpi.sceneScale))));
  expect(dpi.textResolution).toBeGreaterThanOrEqual(dpi.rendererResolution);

  const responsiveViewports = [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ];
  for (const viewport of responsiveViewports) {
    await page.setViewportSize(viewport);
    const bounds = await cutaway.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
    await expect(stage.locator("canvas")).toBeVisible();
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: "/tmp/the-grind-2-level-up.png", fullPage: true });
  }
  await page.addStyleTag({ content: "#stage canvas { display: none !important; }" });
  await expect(stage.locator("canvas")).toBeHidden();
  for (const viewport of responsiveViewports) {
    await page.setViewportSize(viewport);
    await expect.poll(() => cutaway.evaluate((root) => {
      const rootBounds = root.getBoundingClientRect();
      const steps = [...root.querySelectorAll<HTMLElement>("[data-level-step]:not([hidden])")];
      const header = root.querySelector<HTMLElement>("header");
      const outcome = root.querySelector<HTMLElement>("#level-up-cutaway-outcome");
      const inside = (element: HTMLElement | null): boolean => {
        if (element === null) return false;
        const bounds = element.getBoundingClientRect();
        return bounds.left >= rootBounds.left - 1
          && bounds.right <= rootBounds.right + 1
          && bounds.top >= rootBounds.top - 1
          && bounds.bottom <= rootBounds.bottom + 1;
      };
      return {
        page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        header: inside(header),
        outcome: inside(outcome),
        steps: steps.every((step) => {
          const bounds = step.getBoundingClientRect();
          const value = step.querySelector<HTMLElement>("span");
          return bounds.left >= rootBounds.left - 1
            && bounds.right <= rootBounds.right + 1
            && bounds.top >= rootBounds.top - 1
            && bounds.bottom <= rootBounds.bottom + 1
            && value !== null
            && value.scrollWidth <= value.clientWidth + 1;
        }),
      };
    }), { timeout: 5_000 }).toEqual({ page: true, header: true, outcome: true, steps: true });
    if (process.env.TG2_VISUAL_CAPTURE === "1" && viewport.width === 320) {
      await page.screenshot({ path: "/tmp/the-grind-2-level-up-mobile-dom.png", fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(cutaway).toBeVisible();
  await page.locator("#level-up-cutaway-outcome").focus();
  await page.locator("#level-up-cutaway-outcome").press("Enter");
  await expect(app).toHaveAttribute("data-presentation-busy", "false");
  await expect(page.locator('.view-button[data-view="watch"]')).toBeFocused();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 20_000 });
  await expect(page.locator("#level-up-cutaway")).toBeHidden();
  await expect(stage).not.toHaveAttribute("data-cutaway-event", /.+/);
  expect(errors).toEqual([]);
});

test("presents one truthful responsive growth-allocation montage after persistence", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "no-preference" });

  const threshold = heroExperienceFloor(10);
  const fixture = heroExperienceBrowserFixture(
    "browser-growth-allocation-montage",
    "campaign:browser-growth-allocation-montage",
    threshold - 1,
  );
  const expectedWorld = advanceWorld(fixture);
  const source = expectedWorld.chronicle.at(-1);
  if (source === undefined) throw new Error("Growth allocation browser fixture has no source event");
  const packet = projectHeroGrowthAllocation(fixture, expectedWorld, source);
  if (packet === null) throw new Error("Growth allocation browser fixture has no truthful packet");
  const selection = packet.selections[0];
  if (selection === undefined) throw new Error("Growth allocation browser fixture has no selection");
  const deltaValues = (delta: typeof packet.totalDerivedDelta): string =>
    [delta.power, delta.armor, delta.initiative, delta.maxHealth, delta.maxMana].join(":");

  await page.addInitScript((world) => {
    const key = `the-grind-2:campaign:${world.campaignId}`;
    if (sessionStorage.getItem(key) === null) {
      sessionStorage.setItem(key, JSON.stringify(world));
      sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    }
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, fixture);
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 20_000 });
  const app = page.locator("#app");
  const stage = page.locator("#stage");
  const pause = page.locator("#pause-button");
  await pause.click();
  await expect(app).toHaveAttribute("data-presentation-paused", "true");
  await pause.click();
  await expect(app).toHaveAttribute("data-presentation-busy", "true", { timeout: 12_000 });
  await pause.click();
  await expect(app).toHaveAttribute("data-presentation-paused", "true");

  const cutaway = page.locator("#level-up-cutaway");
  const candidates = page.locator("#level-up-cutaway-candidates > li");
  const heroHud = page.locator(".hero-hud");
  await expect(cutaway).toBeVisible();
  await expect(cutaway).toHaveAttribute("data-active", "true");
  await expect(cutaway).toHaveAttribute("data-montage-kind", "growth");
  await expect(cutaway).toHaveAttribute("data-emphasis", "milestone");
  await expect(page.locator("#level-up-cutaway-title")).toHaveText(`${packet.heroName} · Level 10 · Turning Point 1 of 3`);
  await expect(page.locator("#level-up-cutaway-selection-step")).toBeVisible();
  await expect(page.locator("#level-up-cutaway-selection")).toContainText(`${selection.selectedCandidate.label} became the path forward`);
  await expect(page.locator("#level-up-cutaway-selection")).toContainText(selection.record.rationale);
  await expect(candidates).toHaveCount(selection.record.candidates.length);
  await expect(page.locator('#level-up-cutaway-candidates > li[data-selected="true"]')).toHaveCount(1);
  await expect(page.locator('#level-up-cutaway-candidates > li[data-selected="false"]')).toHaveCount(selection.record.candidates.length - 1);
  await expect(page.locator("#level-up-cutaway-candidates button, #level-up-cutaway-candidates input, #level-up-cutaway-candidates select, #level-up-cutaway-candidates [tabindex]")).toHaveCount(0);
  await expect(page.locator("#level-up-cutaway-mechanics")).toContainText("STR");
  await expect(page.locator("#level-up-cutaway-mechanics")).toContainText("LCK");
  await expect(page.locator("#level-up-cutaway-mechanics")).toContainText("Growth:");
  await expect(page.locator("#level-up-cutaway-mechanics")).toContainText("Level:");
  await expect(page.locator("#level-up-cutaway-mechanics")).toContainText("Other same beat:");
  await expect(page.locator("#level-up-cutaway-mechanics")).toContainText("Total:");
  await expect(page.locator("#level-up-cutaway-progress")).toContainText("NO HEAL");
  await expect(page.locator("#level-up-cutaway-progress")).toContainText("NO REFILL");
  await expect(page.locator("#level-up-cutaway-progress")).toContainText(`Turning Point ${selection.turningPointOrdinal} of 3`);

  await expect(stage).toHaveAttribute("data-cutaway-kind", "hero-growth-allocation");
  await expect(stage).toHaveAttribute("data-cutaway-active", "true");
  await expect(stage).toHaveAttribute("data-growth-allocation-id", packet.applicationId);
  await expect(stage).toHaveAttribute("data-growth-allocation-timing", packet.applicationTiming);
  await expect(stage).toHaveAttribute("data-growth-allocation-records", selection.record.id);
  await expect(stage).toHaveAttribute("data-growth-allocation-checkpoints", "10");
  await expect(stage).toHaveAttribute("data-growth-allocation-selected", `L10:${selection.selectedCandidate.packageId}`);
  await expect(stage).toHaveAttribute("data-growth-allocation-rationale", `${selection.record.id}:${selection.record.rationale}`);
  await expect(stage).toHaveAttribute("data-growth-allocation-derived-total", deltaValues(packet.totalDerivedDelta));
  await expect(stage).toHaveAttribute("data-growth-allocation-derived-level", deltaValues(packet.levelOnlyDerivedDelta));
  await expect(stage).toHaveAttribute("data-growth-allocation-derived-growth", deltaValues(packet.growthDerivedDelta));
  await expect(stage).toHaveAttribute("data-growth-allocation-derived-other", deltaValues(packet.otherSameBeatDerivedDelta));
  await expect(stage).toHaveAttribute("data-growth-allocation-marker-labels", /^(STR|AGI|VIT|INT|SPI|LCK):(STR|AGI|VIT|INT|SPI|LCK)$/);

  await expect(heroHud).toBeVisible();
  await expect(page.locator("#hero-health-text")).toHaveText(`${expectedWorld.depth.hero.resources.health} / ${expectedWorld.depth.hero.resources.maxHealth}`);
  await expect(page.locator("#hero-mana-text")).toHaveText(`${expectedWorld.depth.hero.resources.mana} / ${expectedWorld.depth.hero.resources.maxMana}`);
  for (const [id, value] of [
    ["#stat-strength", expectedWorld.depth.hero.attributes.strength],
    ["#stat-agility", expectedWorld.depth.hero.attributes.agility],
    ["#stat-vitality", expectedWorld.depth.hero.attributes.vitality],
    ["#stat-intellect", expectedWorld.depth.hero.attributes.intellect],
    ["#stat-spirit", expectedWorld.depth.hero.attributes.spirit],
    ["#stat-luck", expectedWorld.depth.hero.attributes.luck],
  ] as const) await expect(page.locator(id)).toHaveText(String(value));

  const persisted = await page.evaluate((campaignId) => {
    const raw = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    if (raw === null) return null;
    const world = JSON.parse(raw) as {
      hero: { experience: number; level: number };
      depth: { heroGrowth: { records: { id: string; tick: number }[] } };
    };
    return {
      hero: world.hero,
      records: world.depth.heroGrowth.records.map((record) => ({ id: record.id, tick: record.tick })),
    };
  }, fixture.campaignId);
  expect(persisted).toEqual({
    hero: expect.objectContaining({ experience: threshold, level: 10 }),
    records: [{ id: selection.record.id, tick: expectedWorld.tick }],
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  const dpi = await stage.evaluate((element) => ({
    rendererResolution: Number(element.dataset.rendererResolution),
    sceneScale: Number(element.dataset.sceneLayout?.split(",")[0]),
    textResolution: Number(element.dataset.levelUpTextResolution),
  }));
  expect(dpi.textResolution).toBe(Math.min(12, Math.max(1, Math.ceil(dpi.rendererResolution * dpi.sceneScale))));
  expect(dpi.textResolution).toBeGreaterThanOrEqual(dpi.rendererResolution);

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    const layout = await page.evaluate(() => {
      const cutawayBounds = document.querySelector<HTMLElement>("#level-up-cutaway")?.getBoundingClientRect();
      const hudBounds = document.querySelector<HTMLElement>(".hero-hud")?.getBoundingClientRect();
      const identityBounds = document.querySelector<HTMLElement>(".topbar > div:first-child")?.getBoundingClientRect();
      const controlsBounds = document.querySelector<HTMLElement>(".topbar .controls")?.getBoundingClientRect();
      const toolbarBounds = document.querySelector<HTMLElement>("#view-toolbar")?.getBoundingClientRect();
      const stage = document.querySelector<HTMLElement>("#stage");
      const canvas = stage?.querySelector<HTMLCanvasElement>("canvas");
      const designHeroBounds = stage?.dataset.growthAllocationHeroBounds?.split(":").map(Number);
      const sceneLayout = stage?.dataset.sceneLayout?.split(",").map(Number);
      if (cutawayBounds === undefined || hudBounds === undefined || identityBounds === undefined || controlsBounds === undefined
        || toolbarBounds === undefined || stage === null || canvas === null
        || designHeroBounds?.length !== 4 || sceneLayout?.length !== 3) return null;
      const [heroX, heroY, heroWidth, heroHeight] = designHeroBounds as [number, number, number, number];
      const [sceneScale, sceneX, sceneY] = sceneLayout as [number, number, number];
      const canvasStyle = getComputedStyle(canvas);
      const matrix = canvasStyle.transform === "none"
        ? new DOMMatrixReadOnly()
        : new DOMMatrixReadOnly(canvasStyle.transform);
      const [originX = 0, originY = 0] = canvasStyle.transformOrigin.split(" ").map(Number.parseFloat);
      const transformPoint = (x: number, y: number) => {
        const relativeX = x - originX;
        const relativeY = y - originY;
        return {
          x: originX + matrix.a * relativeX + matrix.c * relativeY + matrix.e,
          y: originY + matrix.b * relativeX + matrix.d * relativeY + matrix.f,
        };
      };
      const worldLeft = sceneX + heroX * sceneScale;
      const worldTop = sceneY + heroY * sceneScale;
      const worldRight = worldLeft + heroWidth * sceneScale;
      const worldBottom = worldTop + heroHeight * sceneScale;
      const heroCorners = [
        transformPoint(worldLeft, worldTop),
        transformPoint(worldRight, worldTop),
        transformPoint(worldLeft, worldBottom),
        transformPoint(worldRight, worldBottom),
      ];
      const heroBounds = {
        left: Math.min(...heroCorners.map((point) => point.x)),
        right: Math.max(...heroCorners.map((point) => point.x)),
        top: Math.min(...heroCorners.map((point) => point.y)),
        bottom: Math.max(...heroCorners.map((point) => point.y)),
      };
      const overlapArea = (left: Pick<DOMRect, "left" | "right" | "top" | "bottom">, right: Pick<DOMRect, "left" | "right" | "top" | "bottom">) =>
        Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left) - 1)
          * Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) - 1);
      const buttons = [...document.querySelectorAll<HTMLElement>("#view-toolbar .view-button")]
        .map((button) => button.getBoundingClientRect());
      return {
        left: cutawayBounds.left,
        right: cutawayBounds.right,
        topbarToolbarOverlap: overlapArea(identityBounds, toolbarBounds) + overlapArea(controlsBounds, toolbarBounds),
        toolbarHudOverlap: overlapArea(toolbarBounds, hudBounds),
        toolbarCutawayOverlap: overlapArea(toolbarBounds, cutawayBounds),
        hudCutawayOverlap: overlapArea(hudBounds, cutawayBounds),
        actorHudOverlap: overlapArea(heroBounds, hudBounds),
        actorCutawayOverlap: overlapArea(heroBounds, cutawayBounds),
        minimumToolbarButtonHeight: Math.min(...buttons.map((bounds) => bounds.height)),
        toolbarButtonsReachable: [...document.querySelectorAll<HTMLElement>("#view-toolbar .view-button")]
          .every((button) => {
            const bounds = button.getBoundingClientRect();
            const target = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
            return target === button || (target instanceof Node && button.contains(target));
          }),
        outcomeReachable: (() => {
          const button = document.querySelector<HTMLElement>("#level-up-cutaway-outcome");
          if (button === null) return false;
          const bounds = button.getBoundingClientRect();
          return bounds.width > 0 && bounds.height > 0
            && bounds.left >= cutawayBounds.left - 1 && bounds.right <= cutawayBounds.right + 1
            && bounds.top >= cutawayBounds.top - 1 && bounds.bottom <= cutawayBounds.bottom + 1;
        })(),
        actorWithinViewport: heroBounds.left >= -1 && heroBounds.right <= innerWidth + 1
          && heroBounds.top >= -1 && heroBounds.bottom <= innerHeight + 1,
        pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        candidatesFit: document.querySelector<HTMLElement>("#level-up-cutaway-candidates")!.scrollWidth
          <= document.querySelector<HTMLElement>("#level-up-cutaway-candidates")!.clientWidth + 1,
      };
    });
    expect(layout).not.toBeNull();
    expect(layout?.left ?? -1).toBeGreaterThanOrEqual(0);
    expect(layout?.right ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(viewport.width + 1);
    expect(layout?.topbarToolbarOverlap).toBe(0);
    expect(layout?.toolbarHudOverlap).toBe(0);
    expect(layout?.toolbarCutawayOverlap).toBe(0);
    expect(layout?.hudCutawayOverlap).toBe(0);
    expect(layout?.actorHudOverlap).toBe(0);
    expect(layout?.actorCutawayOverlap).toBe(0);
    expect(layout?.actorWithinViewport).toBe(true);
    expect(layout?.toolbarButtonsReachable).toBe(true);
    expect(layout?.outcomeReachable, `${viewport.width}×${viewport.height} outcome bounds`).toBe(true);
    if (viewport.width <= 760) expect(layout?.minimumToolbarButtonHeight).toBeGreaterThanOrEqual(44);
    expect(layout?.pageFits).toBe(true);
    expect(layout?.candidatesFit).toBe(true);
    await expect(heroHud).toBeVisible();
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: "/tmp/the-grind-2-growth-allocation.png", fullPage: true });
  }
  await page.addStyleTag({ content: "#stage canvas { display: none !important; }" });
  await expect(stage.locator("canvas")).toBeHidden();
  await expect(page.locator("#level-up-cutaway-selection")).toContainText(selection.record.rationale);
  await expect(page.locator('#level-up-cutaway-candidates > li[data-selected="true"]')).toContainText(selection.selectedCandidate.label);
  await expect(page.locator("#level-up-cutaway-progress")).toContainText("NO REFILL");
  await expect(heroHud).toBeVisible();

  await page.locator("#level-up-cutaway-outcome").focus();
  await page.locator("#level-up-cutaway-outcome").press("Enter");
  await expect(app).toHaveAttribute("data-presentation-busy", "false");
  await expect(page.locator('.view-button[data-view="watch"]')).toBeFocused();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 20_000 });
  await expect(page.locator("#level-up-cutaway")).toBeHidden();
  await expect(stage).not.toHaveAttribute("data-cutaway-event", /.+/);
  expect(errors).toEqual([]);
});

test("presents the persisted growth allocation as a complete reduced-motion tableau", async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });

  const threshold = heroExperienceFloor(10);
  const fixture = heroExperienceBrowserFixture(
    "browser-growth-allocation-reduced",
    "campaign:browser-growth-allocation-reduced",
    threshold - 1,
  );
  const expectedWorld = advanceWorld(fixture);
  const source = expectedWorld.chronicle.at(-1);
  if (source === undefined) throw new Error("Reduced growth fixture has no source event");
  const packet = projectHeroGrowthAllocation(fixture, expectedWorld, source);
  const selection = packet?.selections[0];
  if (packet === null || selection === undefined) throw new Error("Reduced growth fixture has no allocation packet");

  await page.addInitScript((world) => {
    sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world));
    sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, fixture);
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 20_000 });
  const app = page.locator("#app");
  const stage = page.locator("#stage");
  const pause = page.locator("#pause-button");
  await pause.click();
  await expect(app).toHaveAttribute("data-presentation-paused", "true");
  await page.evaluate(() => document.querySelector<HTMLButtonElement>("#pause-button")?.click());
  await page.waitForFunction(() => {
    const app = document.querySelector<HTMLElement>("#app");
    const cutaway = document.querySelector<HTMLElement>("#level-up-cutaway");
    const stage = document.querySelector<HTMLElement>("#stage");
    return app?.dataset.presentationBusy === "true"
      && cutaway?.dataset.phase === "static"
      && stage?.dataset.cutawayPhase === "static";
  }, undefined, { polling: 10, timeout: 12_000 });
  await page.evaluate(() => document.querySelector<HTMLButtonElement>("#pause-button")?.click());
  await expect(app).toHaveAttribute("data-presentation-paused", "true");

  const cutaway = page.locator("#level-up-cutaway");
  await expect(cutaway).toBeVisible();
  await expect(cutaway).toHaveAttribute("data-montage-kind", "growth");
  await expect(cutaway).toHaveAttribute("data-phase", "static");
  await expect(stage).toHaveAttribute("data-cutaway-kind", "hero-growth-allocation");
  await expect(stage).toHaveAttribute("data-cutaway-phase", "static");
  await expect(stage).toHaveAttribute("data-growth-allocation-active-record", selection.record.id);
  await expect(page.locator('#level-up-cutaway-candidates > li[data-selected="true"]')).toContainText(selection.selectedCandidate.label);
  await expect(page.locator("#level-up-cutaway-mechanics")).toContainText("Total:");
  await expect(page.locator("#level-up-cutaway-progress")).toContainText("NO HEAL");
  await expect(page.locator("#level-up-cutaway-progress")).toContainText("NO REFILL");
  await expect(page.locator("#level-up-cutaway-tableau")).toContainText(selection.selectedCandidate.label);
  await expect(page.locator(".hero-hud")).toBeVisible();

  await page.locator("#level-up-cutaway-outcome").focus();
  await page.locator("#level-up-cutaway-outcome").press("Enter");
  await expect(app).toHaveAttribute("data-presentation-busy", "false");
  await expect(page.locator('.view-button[data-view="watch"]')).toBeFocused();
  await expect(page.locator("#level-up-cutaway-announcement")).toContainText("Turning Point 1 of 3");
  await expect(page.locator("#level-up-cutaway-announcement")).toContainText("did not refill");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 20_000 });
  await expect(page.locator("#level-up-cutaway")).toBeHidden();
  await expect(stage).not.toHaveAttribute("data-cutaway-event", /.+/);
  expect(errors).toEqual([]);
});

test("presents a zero-health rune failure without a comic flourish", async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const base = detectedTrapBrowserFixture("browser-cutaway-rune-failure", "campaign:browser-cutaway-rune-failure");
  if (base.depth.dungeon === null) throw new Error("Rune cutaway fixture needs a dungeon");
  const hero = {
    ...base.depth.hero,
    attributes: { ...base.depth.hero.attributes, intellect: 0 },
    resources: { ...base.depth.hero.resources, health: 1 },
  };
  const fixture = upgradeWorldState({
    ...base,
    hero: { ...base.hero, health: 1 },
    depth: {
      ...base.depth,
      hero,
      heroGrowth: createHeroGrowthState(hero),
      dungeon: {
        ...base.depth.dungeon,
        traps: base.depth.dungeon.traps.map((trap) => ({
          ...trap,
          kind: "rune-ward" as const,
          disarmDifficulty: 16,
        })),
      },
    },
  });
  await page.addInitScript((world) => {
    sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world));
    sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, fixture);
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
  const app = page.locator("#app");
  const stage = page.locator("#stage");
  const outcomeButton = page.locator("#trap-cutaway-outcome");
  await expect(app).toHaveAttribute("data-presentation-busy", "true", { timeout: 12_000 });
  await expect(stage).toHaveAttribute("data-cutaway-active", "true");
  await page.locator("#pause-button").click();
  await expect(app).toHaveAttribute("data-presentation-paused", "true");
  await outcomeButton.focus();
  await expect(outcomeButton).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(app).toHaveAttribute("data-presentation-busy", "false");
  await expect(page.locator('[data-view="watch"]')).toBeFocused();
  await expect(page.locator("#trap-cutaway")).toBeVisible();
  await expect(page.locator("#trap-cutaway")).toHaveAttribute("data-outcome", "sprung");
  await expect(page.locator("#trap-cutaway")).toHaveAttribute("data-flavor", "none");
  await expect(page.locator("#trap-cutaway")).toHaveAttribute("data-shot", /^(wide-profile|hero-closeup|mechanism-closeup)$/);
  await expect(stage).toHaveAttribute("data-cutaway-active", "false");
  await expect(stage).toHaveAttribute("data-cutaway-phase", "final");
  await expect(stage).toHaveAttribute("data-cutaway-hero-pose", "kneeling");
  await expect(stage).toHaveAttribute("data-cutaway-kind", "rune-ward");
  await expect(stage).toHaveAttribute("data-cutaway-outcome", "sprung");
  await expect(stage).toHaveAttribute("data-cutaway-flavor", "none");
  await expect(stage).toHaveAttribute("data-cutaway-flourish", "none");
  await expect(stage).toHaveAttribute("data-cutaway-shot", await page.locator("#trap-cutaway").getAttribute("data-shot") ?? "missing");
  await expect(stage).toHaveAttribute("data-cutaway-check", /^intellect:\d+\+\d+=\d+:16$/);
  await expect(stage).toHaveAttribute("data-cutaway-health", `1:1:0:${fixture.depth.hero.resources.maxHealth}`);
  await expect(stage).toHaveAttribute("data-cutaway-exit", "false");
  await expect(stage).toHaveAttribute("data-cutaway-quest-delta", "0");
  await expect(page.locator("#trap-cutaway-title")).toContainText("echo rune");
  await expect(page.locator("#trap-cutaway-result")).toHaveText("SPRUNG · detected → triggered");
  await expect(page.locator("#trap-cutaway-consequence")).toHaveText("HP 1 → 0 (−1)");
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("#stage canvas")?.getBoundingClientRect();
    const transcript = document.querySelector("#trap-cutaway")?.getBoundingClientRect();
    return canvas !== undefined && transcript !== undefined && canvas.width < 500 && transcript.left > 490;
  });
  const composition = await page.evaluate(() => {
    const canvas = document.querySelector("#stage canvas")?.getBoundingClientRect();
    const transcript = document.querySelector("#trap-cutaway")?.getBoundingClientRect();
    return canvas === undefined || transcript === undefined
      ? null
      : { canvasRight: canvas.right, transcriptLeft: transcript.left };
  });
  expect(composition).not.toBeNull();
  expect(composition!.canvasRight).toBeLessThanOrEqual(composition!.transcriptLeft + 1);
  await expect(page.locator("#trap-cutaway-sequence > li")).toHaveCount(5);
  await expect(page.locator("#trap-cutaway-announcement")).toHaveText("SPRUNG. HP 1 to 0. The maze continues.");
  expect(errors).toEqual([]);
});

test("never presents a trap result when saving the resolved world fails", async ({ page }) => {
  test.setTimeout(45_000);
  const fixture = detectedTrapBrowserFixture("browser-cutaway-save-failure", "campaign:browser-cutaway-save-failure");
  await page.addInitScript((world) => {
    const original = Storage.prototype.setItem;
    original.call(sessionStorage, `the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world));
    original.call(sessionStorage, "the-grind-2:activeCampaignId", world.campaignId);
    original.call(localStorage, `the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
    Storage.prototype.setItem = function (key: string, value: string): void {
      if (key === `the-grind-2:campaign:${world.campaignId}`) {
        const tick = (JSON.parse(value) as { tick?: number }).tick ?? 0;
        if (tick > world.tick) throw new DOMException("forced save failure", "QuotaExceededError");
      }
      original.call(this, key, value);
    };
  }, fixture);
  await page.goto("./?fast", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
  await expect(page.locator("#app")).toHaveAttribute("data-runtime-status", "recovering", { timeout: 10_000 });
  await page.locator("#pause-button").click();
  await expect(page.locator("#stage")).toHaveAttribute("data-dungeon-trap", "armed");
  await expect(page.locator("#trap-cutaway")).toBeHidden();
  await expect(page.locator("#stage")).not.toHaveAttribute("data-cutaway-event", /.+/);
  const persisted = await page.evaluate((campaignId) => {
    const source = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    if (source === null) return null;
    const world = JSON.parse(source);
    return { tick: world.tick, phase: world.depth?.dungeon?.traps?.[0]?.phase };
  }, fixture.campaignId);
  expect(persisted).toEqual({ tick: fixture.tick, phase: "detected" });
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

test("fulfills, rewards, and admits one exact saved successor quest", async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });

  const fixture = readyQuestBrowserFixture("browser-quest-fulfillment", "campaign:browser-quest-fulfillment");
  const expectedFulfilled = advanceWorld(fixture);
  const expectedRewarded = advanceWorld(expectedFulfilled);
  const expectedAdmitted = advanceWorld(expectedRewarded);
  const expectedLead = projectSuccessorQuestLead(expectedAdmitted.seed, expectedAdmitted.depth.atlas, expectedAdmitted.depth.quest);
  if (expectedLead === null) throw new Error("Browser fixture has no successor quest lead");
  const pendingCompletion = expectedFulfilled.depth.completedQuests.at(-1);
  const appliedCompletion = expectedRewarded.depth.completedQuests.at(-1);
  if (pendingCompletion === undefined || pendingCompletion.reward.status !== "pending") throw new Error("Browser fixture has no pending reward");
  if (appliedCompletion === undefined || appliedCompletion.reward.status !== "applied") throw new Error("Browser fixture has no applied reward");
  const expectedObjectiveIds = [
    ...fixture.depth.quest.objectives.map((objective) => objective.id),
    ...fixture.depth.quest.subquests.flatMap((subquest) => subquest.objectives.map((objective) => objective.id)),
  ];
  await page.addInitScript((world) => {
    const campaignKey = `the-grind-2:campaign:${world.campaignId}`;
    if (sessionStorage.getItem(campaignKey) === null) {
      sessionStorage.setItem(campaignKey, JSON.stringify(world));
      sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    }
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 60_000));
  }, expectedFulfilled);

  await page.goto("./", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const pauseButton = document.querySelector<HTMLButtonElement>("#pause-button");
    if (document.documentElement.dataset.ready !== "true" || pauseButton === null) return false;
    if (pauseButton.textContent !== "Resume") pauseButton.click();
    return pauseButton.textContent === "Resume";
  }, undefined, { polling: 20, timeout: 20_000 });
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "true");
  await expect(page.locator("#scene-headline")).toHaveText(`Quest Fulfilled: ${fixture.depth.quest.title}`);

  const fulfilledTick = fixture.tick + 1;
  await expect(page.locator("#stage")).toHaveAttribute("data-scene-mode", "chronicle");
  await expect(page.locator("#scene-action")).toHaveText(
    `${fixture.hero.name} closes the final page after ${expectedObjectiveIds.length} completed objectives.`,
  );
  await expect(page.locator("#scene-consequence")).toHaveText(
    `Completion #1 recorded at T${fulfilledTick} · ${describeCompletedQuestReward(pendingCompletion)}`,
  );
  await expect(page.locator("#quest-title")).toHaveText(`${fixture.depth.quest.title} · Fulfilled`);
  await expect(page.locator("#quest-title")).toHaveAttribute("data-status", "fulfilled");
  await expect(page.locator("#quest-summary")).toHaveText(
    `Fulfilled at T${fulfilledTick} · ${expectedObjectiveIds.length} objectives complete · ${describeCompletedQuestReward(pendingCompletion)}`,
  );
  await expect(page.locator("#event-log li").first()).toContainText("QUEST FULFILLED");

  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => {
      const horizontallyInside = (child: Element | null, parent: Element | null): boolean => {
        if (child === null || parent === null) return false;
        const childBounds = child.getBoundingClientRect();
        const parentBounds = parent.getBoundingClientRect();
        return childBounds.left >= parentBounds.left - 1 && childBounds.right <= parentBounds.right + 1;
      };
      const chronicle = document.querySelector(".chronicle");
      const questCard = document.querySelector(".quest-card");
      const questSummary = document.querySelector("#quest-summary");
      const consequence = document.querySelector("#scene-consequence");
      const chronicleBounds = chronicle?.getBoundingClientRect();
      const consequenceBounds = consequence?.getBoundingClientRect();
      const chronicleStyle = chronicle === null ? null : getComputedStyle(chronicle);
      return {
        checks: {
          page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
          headline: horizontallyInside(document.querySelector("#scene-headline"), chronicle),
          action: horizontallyInside(document.querySelector("#scene-action"), chronicle),
          consequence: horizontallyInside(consequence, chronicle),
          questTitle: horizontallyInside(document.querySelector("#quest-title"), questCard),
          questSummary: questSummary !== null && (getComputedStyle(questSummary).display === "none" || horizontallyInside(questSummary, questCard)),
        },
        debug: {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          mobileMedia: matchMedia("(max-width: 760px)").matches,
          chronicleStyle: chronicleStyle === null ? null : { left: chronicleStyle.left, width: chronicleStyle.width, padding: chronicleStyle.padding },
          chronicle: chronicleBounds === undefined ? null : { left: chronicleBounds.left, right: chronicleBounds.right, width: chronicleBounds.width },
          consequence: consequenceBounds === undefined ? null : { left: consequenceBounds.left, right: consequenceBounds.right, width: consequenceBounds.width },
        },
      };
    }), { timeout: 5_000 }).toMatchObject({
      checks: {
        page: true,
        headline: true,
        action: true,
        consequence: true,
        questTitle: true,
        questSummary: true,
      },
    });
  }

  await page.locator('.view-button[data-view="journal"]').click();
  const mainQuest = page.locator(`#journal-quest-list .journal-quest[data-quest-id="${fixture.depth.quest.id}"]`);
  await expect(mainQuest).toHaveAttribute("data-status", "fulfilled");
  await expect(mainQuest.locator("h3")).toHaveText(`${fixture.depth.quest.title} · Fulfilled`);
  await expect(mainQuest.locator('li[data-status="complete"]')).toHaveCount(fixture.depth.quest.objectives.length);
  await expect(page.locator("#journal-summary")).toHaveText(
    `Fulfilled at T${fulfilledTick} · ${expectedObjectiveIds.length} objectives complete · ${describeCompletedQuestReward(pendingCompletion)}`,
  );
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await mainQuest.scrollIntoViewIfNeeded();
    const journalContainment = await page.evaluate(() => {
      const screen = document.querySelector("#inspection-screen");
      const summary = document.querySelector("#journal-summary");
      const quest = document.querySelector("#journal-quest-list .journal-quest[data-status=\"fulfilled\"]");
      if (screen === null || summary === null || quest === null) return null;
      const screenBounds = screen.getBoundingClientRect();
      const summaryBounds = summary.getBoundingClientRect();
      const questBounds = quest.getBoundingClientRect();
      return {
        page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        summary: summaryBounds.left >= screenBounds.left - 1 && summaryBounds.right <= screenBounds.right + 1,
        quest: questBounds.left >= screenBounds.left - 1 && questBounds.right <= screenBounds.right + 1,
      };
    });
    expect(journalContainment).toEqual({ page: true, summary: true, quest: true });
  }

  await page.locator('.view-button[data-view="watch"]').click();
  await page.locator("#pause-button").click({ force: true });
  await expect(page.locator("#scene-headline")).toHaveText(`Quest Reward: ${fixture.depth.quest.title}`, { timeout: 15_000 });
  await page.locator("#pause-button").click({ force: true });
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "true");

  const { grant, receipt } = appliedCompletion.reward;
  await expect(page.locator("#stage")).toHaveAttribute("data-scene-mode", "chronicle");
  await expect(page.locator("#stage")).toHaveAttribute("data-quest-reward-id", grant.id);
  await expect(page.locator("#stage")).toHaveAttribute("data-quest-reward-experience", `${receipt.experienceBefore}/${receipt.experienceDelta}/${receipt.experienceAfter}`);
  await expect(page.locator("#stage")).toHaveAttribute("data-quest-reward-gold", `${receipt.goldBefore}/${receipt.goldDelta}/${receipt.goldAfter}`);
  await expect(page.locator("#stage")).toHaveAttribute("data-quest-reward-item", `${grant.item.id}/${grant.item.name}`);
  await expect(page.locator("#stage")).toHaveAttribute("data-quest-reward-conversion", `0/${grant.itemConversionGold}`);
  await expect(page.locator("#stage")).toHaveAttribute("data-quest-reward-disposition", receipt.itemDisposition);
  await expect(page.locator("#stage")).toHaveAttribute("data-quest-reward-level", `${receipt.levelBefore}/${receipt.levelAfter}`);
  await expect(page.locator("#scene-action")).toHaveText(`${fixture.hero.name} receives the promised reward from the Chronicle.`);
  await expect(page.locator("#scene-consequence")).toHaveText(describeCompletedQuestReward(appliedCompletion));
  await expect(page.locator("#hero-level")).toHaveText(`${expectedRewarded.depth.hero.className} · Level ${receipt.levelAfter} · ${receipt.goldAfter}g`);
  await expect(page.locator("#quest-summary")).toHaveText(
    `Fulfilled at T${fulfilledTick} · ${expectedObjectiveIds.length} objectives complete · ${describeCompletedQuestReward(appliedCompletion)}`,
  );
  await expect(page.locator("#event-log li").first()).toContainText("QUEST REWARD");

  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => {
      const stage = document.querySelector("#stage")?.getBoundingClientRect();
      const canvas = document.querySelector("#stage canvas")?.getBoundingClientRect();
      return stage === undefined || canvas === undefined ? null : {
        page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        canvas: canvas.left >= stage.left - 1 && canvas.right <= stage.right + 1 && canvas.top >= stage.top - 1 && canvas.bottom <= stage.bottom + 1,
      };
    }), { timeout: 5_000 }).toEqual({ page: true, canvas: true });
  }

  await page.locator('.view-button[data-view="journal"]').click();
  await expect(page.locator("#journal-summary")).toHaveText(
    `Fulfilled at T${fulfilledTick} · ${expectedObjectiveIds.length} objectives complete · ${describeCompletedQuestReward(appliedCompletion)}`,
  );
  await page.locator('.view-button[data-view="inventory"]').click();
  await expect(page.locator(`#inventory-grid [data-item-id="${grant.item.id}"]`)).toContainText(grant.item.name);

  const saved = await page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    const source = campaignId === null ? null : sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    return source === null ? null : JSON.parse(source);
  });
  expect(saved).not.toBeNull();
  expect(saved.depth.quest.status).toBe("fulfilled");
  expect(saved.depth.totalCompletedQuests).toBe(1);
  expect(saved.depth.completedQuests).toEqual([appliedCompletion]);
  expect(saved.depth.pendingQuestReward).toBeNull();
  expect(saved.hero.experience).toBe(receipt.experienceAfter);
  expect(saved.hero.gold).toBe(receipt.goldAfter);
  expect(saved.depth.hero.inventory).toContainEqual(grant.item);

  await page.locator('.view-button[data-view="watch"]').click();
  await page.locator("#pause-button").click({ force: true });
  await expect(page.locator("#scene-headline")).toHaveText(`New Quest: ${expectedAdmitted.depth.quest.title}`, { timeout: 15_000 });
  await page.locator("#pause-button").click({ force: true });
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "true");

  const admittedQuest = expectedAdmitted.depth.quest;
  const admittedObjectiveCount = admittedQuest.objectives.length + admittedQuest.subquests.flatMap((subquest) => subquest.objectives).length;
  await expect(page.locator("#stage")).toHaveAttribute("data-quest-admission-id", admittedQuest.instanceId);
  await expect(page.locator("#stage")).toHaveAttribute("data-quest-admission-predecessor", appliedCompletion.id);
  await expect(page.locator("#stage")).toHaveAttribute("data-quest-admission-ordinal", String(admittedQuest.ordinal));
  await expect(page.locator("#stage")).toHaveAttribute("data-quest-admission-tick", String(admittedQuest.admittedTick));
  await expect(page.locator("#stage")).toHaveAttribute("data-quest-admission-objectives", `${admittedQuest.objectives.length}/${admittedQuest.subquests.length}/${admittedObjectiveCount}`);
  await expect(page.locator("#app")).toHaveAttribute("data-quest-instance-id", admittedQuest.instanceId);
  await expect(page.locator("#app")).toHaveAttribute("data-quest-ordinal", String(admittedQuest.ordinal));
  await expect(page.locator("#app")).toHaveAttribute("data-quest-admitted-tick", String(admittedQuest.admittedTick));
  await expect(page.locator("#app")).toHaveAttribute("data-quest-lead-id", expectedLead.id);
  await expect(page.locator("#app")).toHaveAttribute("data-quest-lead-location", expectedLead.locationId);
  await expect(page.locator("#app")).toHaveAttribute("data-quest-lead-phase", expectedLead.phase);
  await expect(page.locator("#stage")).toHaveAttribute("data-quest-lead-id", expectedLead.id);
  await expect(page.locator("#stage")).toHaveAttribute("data-quest-lead-location", expectedLead.locationId);
  await expect(page.locator("#stage")).toHaveAttribute("data-quest-lead-phase", expectedLead.phase);
  await expect(page.locator("#scene-action")).toHaveText(`${fixture.hero.name} turns the page after ${appliedCompletion.title} and begins ${admittedQuest.title}.`);
  await expect(page.locator("#scene-consequence")).toHaveText(`Chapter 2 admitted at T${admittedQuest.admittedTick} · Lead revealed: ${expectedLead.locationName} · quest route not planned`);
  await page.locator("#stage canvas").evaluate((canvas) => { canvas.style.visibility = "hidden"; });
  await expect(page.locator("#scene-headline")).toHaveText(`New Quest: ${admittedQuest.title}`);
  await expect(page.locator("#scene-action")).toContainText(appliedCompletion.title);
  await expect(page.locator("#scene-consequence")).toContainText(`Chapter 2 admitted at T${admittedQuest.admittedTick}`);
  await page.locator("#stage canvas").evaluate((canvas) => { canvas.style.visibility = ""; });
  await expect(page.locator("#quest-title")).toHaveText(`${admittedQuest.title} · Active`);
  await expect(page.locator("#quest-title")).toHaveAttribute("data-status", "active");
  await expect(page.locator("#quest-summary")).toHaveText(admittedQuest.summary);
  await expect(page.locator("#quest-lead")).toContainText(expectedLead.locationName);
  await expect(page.locator("#quest-lead")).toContainText(expectedLead.phase === "at-lead" ? "At lead" : expectedLead.phase === "routed" ? "Route planned" : "Unrouted");
  const miniLead = page.locator(`.mini-map-site[data-site-id="${expectedLead.locationId}"]`);
  await expect(miniLead).toHaveAttribute("data-lead", "true");
  await expect(miniLead).toHaveAttribute("data-destination", "false");
  await expect(page.locator('.mini-map-road[data-selected="true"]')).toHaveCount(0);
  await expect(page.locator("#mini-map-route")).toContainText(expectedLead.locationName);
  await expect(page.locator("#quest-objectives li")).toHaveCount(Math.min(4, admittedObjectiveCount));
  const admittedObjectiveText = [
    ...admittedQuest.objectives.map((objective) => `Main: ${objective.description} ${objective.current}/${objective.target}`),
    ...admittedQuest.subquests.flatMap((subquest) => subquest.objectives.map((objective) => `${subquest.title}: ${objective.description} ${objective.current}/${objective.target}`)),
  ].slice(0, 4);
  await expect(page.locator("#quest-objectives li")).toHaveText(admittedObjectiveText);
  const admittedObjectives = [
    ...admittedQuest.objectives,
    ...admittedQuest.subquests.flatMap((subquest) => subquest.objectives),
  ].slice(0, 4);
  for (const [index, objective] of admittedObjectives.entries()) {
    const row = page.locator("#quest-objectives li").nth(index);
    const ruleLabel = questObjectiveRuleLabel(objective.rule);
    await expect(row).toHaveAttribute("data-rule-label", ruleLabel);
    await expect(row).toHaveAttribute("aria-label", new RegExp(`^${ruleLabel}:`));
  }
  await expect(page.locator("#event-log li").first()).toContainText("NEW QUEST");

  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const containment = await page.evaluate(() => {
      const inside = (child: Element | null, parent: Element | null): boolean => {
        if (child === null || parent === null) return false;
        const childBounds = child.getBoundingClientRect();
        const parentBounds = parent.getBoundingClientRect();
        return childBounds.left >= parentBounds.left - 1 && childBounds.right <= parentBounds.right + 1;
      };
      return {
        page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        headline: inside(document.querySelector("#scene-headline"), document.querySelector(".chronicle")),
        quest: inside(document.querySelector("#quest-title"), document.querySelector(".quest-card")),
        lead: inside(document.querySelector("#quest-lead"), document.querySelector(".quest-card")),
      };
    });
    expect(containment).toEqual({ page: true, headline: true, quest: true, lead: true });
  }

  await page.setViewportSize({ width: 320, height: 568 });
  await page.locator("#companion-card").evaluate((element) => { (element as HTMLElement).hidden = false; });
  await page.locator("#stage canvas").evaluate((canvas) => { canvas.style.visibility = "hidden"; });
  await expect(page.locator("#quest-summary")).toBeHidden();
  await expect(page.locator("#quest-lead")).toBeVisible();
  await expect(page.locator("#quest-lead")).toContainText(expectedLead.locationName);
  expect(await page.evaluate(() => {
    const lead = document.querySelector("#quest-lead")?.getBoundingClientRect();
    const card = document.querySelector(".quest-card")?.getBoundingClientRect();
    return lead !== undefined && card !== undefined && lead.left >= card.left - 1 && lead.right <= card.right + 1;
  })).toBe(true);
  await page.locator("#stage canvas").evaluate((canvas) => { canvas.style.visibility = ""; });
  await page.locator("#companion-card").evaluate((element) => { (element as HTMLElement).hidden = true; });

  await page.locator('.view-button[data-view="map"]').click();
  await expect(page.locator("#map-route")).toHaveText("No route planned");
  await expect(page.locator("#map-quest-lead")).toContainText(expectedLead.locationName);
  await expect(page.locator("#stage")).toHaveAttribute("data-quest-lead-id", expectedLead.id);

  await page.locator('.view-button[data-view="journal"]').click();
  const journalObjectives = page.locator("#journal-quest-list .journal-quest li");
  await expect(journalObjectives).toHaveCount(admittedObjectives.length);
  for (const [index, objective] of admittedObjectives.entries()) {
    const row = journalObjectives.nth(index);
    const ruleLabel = questObjectiveRuleLabel(objective.rule);
    await expect(row).toHaveAttribute("data-rule-label", ruleLabel);
    await expect(row).toHaveAttribute("aria-label", new RegExp(`^${ruleLabel}:`));
  }
  await expect(page.locator("#journal-quest-lead")).toContainText(expectedLead.locationName);
  const activeQuest = page.locator(`#journal-quest-list .journal-quest[data-quest-id="${admittedQuest.id}"]`);
  await expect(activeQuest).toHaveAttribute("data-status", "active");
  await expect(activeQuest.locator("h3")).toHaveText(`${admittedQuest.title} · Active`);
  const completedChapter = page.locator(`#journal-completed-list [data-completion-id="${appliedCompletion.id}"]`);
  await expect(completedChapter).toContainText(`Chapter 1 · ${appliedCompletion.title}`);
  await expect(completedChapter).toContainText(describeCompletedQuestReward(appliedCompletion));

  await page.addInitScript(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await expect(page.locator("#app")).toHaveAttribute("data-quest-instance-id", admittedQuest.instanceId);
  await expect(page.locator("#app")).toHaveAttribute("data-quest-lead-id", expectedLead.id);
  await expect(page.locator("#app")).toHaveAttribute("data-quest-lead-location", expectedLead.locationId);
  await expect(page.locator("#app")).toHaveAttribute("data-quest-lead-phase", expectedLead.phase);
  await expect(page.locator("#quest-title")).toHaveText(`${admittedQuest.title} · Active`);
  await expect(page.locator("#quest-lead")).toContainText(expectedLead.locationName);
  const admittedSaved = await page.evaluate(() => {
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
    const source = campaignId === null ? null : sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
    return source === null ? null : JSON.parse(source);
  });
  expect(admittedSaved.depth.quest).toEqual(admittedQuest);
  expect(admittedSaved.depth.completedQuests).toEqual([appliedCompletion]);
  expect(admittedSaved.hero).toEqual(expectedAdmitted.hero);
  expect(errors).toEqual([]);
});

test("renders a fully capped inventory-overflow quest reward without inventing credit", async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });

  const world = cappedOverflowRewardBrowserFixture("browser-reward-overflow", "campaign:browser-reward-overflow");
  const completion = world.depth.completedQuests.at(-1);
  if (completion === undefined || completion.reward.status !== "applied") throw new Error("Overflow browser fixture has no applied reward");
  const { grant, receipt } = completion.reward;
  expect(grant.itemDisposition).toBe("converted-to-gold");
  expect(receipt.itemConversionGold).toBe(0);
  expect(receipt.goldDelta).toBe(0);

  await page.addInitScript((saved) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    sessionStorage.setItem(`the-grind-2:campaign:${saved.campaignId}`, JSON.stringify(saved));
    sessionStorage.setItem("the-grind-2:activeCampaignId", saved.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${saved.campaignId}`, String(Date.now() + 60_000));
  }, world);
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "true");

  await expect(page.locator("#scene-headline")).toHaveText(`Quest Reward: ${completion.title}`);
  await expect(page.locator("#scene-consequence")).toHaveText(describeCompletedQuestReward(completion));
  await expect(page.locator("#scene-consequence")).toContainText(`${grant.itemConversionGold} gold value capped (+0 credited)`);
  await expect(page.locator("#stage")).toHaveAttribute("data-quest-reward-disposition", "converted-to-gold");
  await expect(page.locator("#stage")).toHaveAttribute("data-quest-reward-gold", `${receipt.goldBefore}/0/${receipt.goldAfter}`);
  await expect(page.locator("#stage")).toHaveAttribute("data-quest-reward-item", `${grant.item.id}/${grant.item.name}`);
  await expect(page.locator("#stage")).toHaveAttribute("data-quest-reward-conversion", `0/${grant.itemConversionGold}`);
  await expect(page.locator("#hero-level")).toContainText(`${Number.MAX_SAFE_INTEGER}g`);

  await page.locator('.view-button[data-view="journal"]').click();
  await expect(page.locator("#journal-summary")).toContainText(`${grant.itemConversionGold} gold value capped (+0 credited)`);
  await page.locator('.view-button[data-view="inventory"]').click();
  await expect(page.locator("#inventory-stacks")).toHaveText("32");
  await expect(page.locator(`#inventory-grid [data-item-id="${grant.item.id}"]`)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("renders inclusive hero level progress and a truthful maximum state", async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });

  const campaignId = "campaign:browser-hero-level";
  const exactThreshold = heroExperienceBrowserFixture("browser-hero-level", campaignId, 12);
  await page.addInitScript((saved) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    const staged = sessionStorage.getItem("the-grind-2:test-fixture");
    if (staged !== null) {
      const replacement = JSON.parse(staged) as { campaignId: string };
      sessionStorage.setItem(`the-grind-2:campaign:${replacement.campaignId}`, staged);
      sessionStorage.setItem("the-grind-2:activeCampaignId", replacement.campaignId);
      localStorage.setItem(`the-grind-2:last-active:${replacement.campaignId}`, String(Date.now() + 60_000));
      sessionStorage.removeItem("the-grind-2:test-fixture");
      return;
    }
    if (sessionStorage.getItem("the-grind-2:activeCampaignId") !== null) return;
    sessionStorage.setItem(`the-grind-2:campaign:${saved.campaignId}`, JSON.stringify(saved));
    sessionStorage.setItem("the-grind-2:activeCampaignId", saved.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${saved.campaignId}`, String(Date.now() + 60_000));
  }, exactThreshold);
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "true");
  await expect(page.locator("#hero-level")).toContainText("Level 2");
  await expect(page.locator("#hero-xp-text")).toHaveText("12 / 48");
  await expect(page.locator("#hero-xp-text")).toHaveAttribute("data-level-state", "progressing");
  await expect(page.locator("#hero-xp-bar")).toHaveAttribute("max", "36");
  await expect(page.locator("#hero-xp-bar")).toHaveAttribute("value", "0");
  await expect(page.locator("#hero-xp-bar")).toHaveAttribute("aria-label", "Hero level 2; 12 total experience; 36 experience to level 3");

  const level50Experience = 12 * 49 ** 2;
  const level50 = heroExperienceBrowserFixture("browser-hero-level", campaignId, level50Experience);
  await page.evaluate((saved) => {
    sessionStorage.setItem("the-grind-2:test-fixture", JSON.stringify(saved));
  }, level50);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await expect(page.locator("#hero-level")).toContainText("Level 50");
  await expect(page.locator("#hero-xp-text")).toHaveText("28812 / 30000");
  await expect(page.locator("#hero-xp-text")).toHaveAttribute("data-level-state", "progressing");
  await expect(page.locator("#hero-xp-bar")).toHaveAttribute("max", "1188");
  await expect(page.locator("#hero-xp-bar")).toHaveAttribute("value", "0");
  await expect(page.locator("#hero-xp-bar")).toHaveAttribute("aria-label", "Hero level 50; 28812 total experience; 1188 experience to level 51");

  const cappedExperience = 12 * (maximumHeroLevel - 1) ** 2 + 1;
  const capped = heroExperienceBrowserFixture("browser-hero-level", campaignId, cappedExperience);
  await page.evaluate((saved) => {
    sessionStorage.setItem("the-grind-2:test-fixture", JSON.stringify(saved));
  }, capped);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await expect(page.locator("#hero-level")).toContainText(`Level ${maximumHeroLevel}`);
  await expect(page.locator("#hero-xp-text")).toHaveText(`MAX LEVEL · ${cappedExperience} total XP`);
  await expect(page.locator("#hero-xp-text")).toHaveAttribute("data-level-state", "maximum");
  await expect(page.locator("#hero-xp-bar")).toHaveAttribute("data-level-state", "maximum");
  await expect(page.locator("#hero-xp-bar")).toHaveAttribute("max", "1");
  await expect(page.locator("#hero-xp-bar")).toHaveAttribute("value", "1");
  await expect(page.locator("#hero-xp-bar")).toHaveAttribute("aria-label", `Maximum hero level ${maximumHeroLevel}; ${cappedExperience} total experience`);
  expect(errors).toEqual([]);
});

test.describe("automatic deployment reload", () => {
  test.use({ serviceWorkers: "block" });

  test("saves the campaign and reloads once when a newer deployment persists", async ({ page }) => {
    const errors: string[] = [];
    let versionRequests = 0;
    let mainNavigations = 0;
    let releaseFirstManifest: (() => Promise<void>) | undefined;
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) mainNavigations += 1;
    });
    await page.route("**/version.json?check=*", async (route) => {
      versionRequests += 1;
      const response = {
        contentType: "application/json",
        headers: { "cache-control": "no-store" },
        body: JSON.stringify({ version: "9.9.9" }),
      } as const;
      if (versionRequests === 1) {
        await new Promise<void>((resolve, reject) => {
          releaseFirstManifest = async () => {
            try {
              await route.fulfill(response);
              resolve();
            } catch (error) {
              reject(error);
            }
          };
        });
        return;
      }
      await route.fulfill(response);
    });

    await page.goto("./?fast", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
    await expect.poll(() => releaseFirstManifest).toBeDefined();
    const beforeUpdate = await page.evaluate(() => {
      const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId");
      if (campaignId === null) return null;
      const source = sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`);
      if (source === null) return null;
      return { campaignId, tick: (JSON.parse(source) as { tick: number }).tick };
    });
    expect(beforeUpdate).not.toBeNull();
    await releaseFirstManifest?.();
    await expect.poll(() => versionRequests, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
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
