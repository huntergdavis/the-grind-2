import { expect as baseExpect, test, type Page } from "@playwright/test";
import { createForwardMotionState } from "../src/core/forward-motion";
import { advanceWorld, campaignDirector, createWorld, upgradeWorldState } from "../src/core/simulation";
import type { HeroValue, SceneMode, WorldState } from "../src/core/types";
import { stepDepth, unresolvedRouteEncounterId } from "../src/depth/state";
import { generateTown, visitTown } from "../src/depth/towns";
import {
  creativeWriterCacheName,
  creativeWriterModelId,
  creativeWriterModelRevision,
} from "../src/narrator/creative-writer-client";
import { projectStoryBeatJobV1 } from "../src/narrator/story-beat";
import { createFirstSharedVictoryVignette } from "../src/narrator/first-shared-victory";
import seedLibrary from "../src/narrator/story-seeds.json" with { type: "json" };
import { projectParty } from "../src/ui/party-projection";
import { projectFarewellRemembrance } from "../src/ui/farewell-remembrance";
import { projectFirstSharedVictory } from "../src/ui/first-shared-victory";
import { playModePreferenceKey } from "../src/ui/play-mode-preferences";
import { storytellingPreferenceKey } from "../src/ui/storytelling-preferences";

// Software-rendered Chromium can take several seconds to settle a real simulation step.
const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 120_000 });

// Real saved worlds, UI, controller, and client; only model inference is replaced.
// These tests make no claims about model quality or real inference latency.
const shortPassage = "A ribbon caught on the branch trembled like a question the road would not answer.";
// Reviewed original story-voice.ts wording. Keep these literal: importing the
// production duet parser pulls browser JSON modules into Playwright's Node loader.
const healthyValueThoughts: Record<HeroValue, readonly string[]> = {
  curiosity: ["I want to understand this unfamiliar relief without pinning it down too quickly.",
    "I wonder how much of my excitement is discovery, and how much is simply not being alone."],
  loyalty: ["I want this trust to matter without making it a debt between us.",
    "I hope standing together can leave us both enough room to doubt."],
  mercy: ["I want to enjoy this relief without letting victory make gentleness feel foolish.",
    "I hope there is room for kindness inside the pride I feel."],
  courage: ["I want to welcome this pride without mistaking it for the end of fear.",
    "I hope I can be brave without needing my doubts to disappear."],
};
// Exact companion line observed in the same canonical fixture before hero-value
// personalization. No companion trait is inferred or substituted in this slice.
const unchangedVictoryCompanionThought = "I hope I can belong here without becoming someone braver than I am.";
const farewellValueReflections: Record<HeroValue, (hero: string, companion: string) => readonly string[]> = {
  curiosity: (hero, companion) => [
    `${companion} was leaving wounded but alive, and ${hero} wondered how to live with questions that concern alone could not answer.`,
    `As ${companion} left wounded but alive, ${hero} wanted to understand the unease without turning another person's pain into a puzzle.`],
  loyalty: (hero, companion) => [
    `${companion} was leaving wounded but alive; ${hero} hoped that caring could survive a goodbye without becoming a demand to stay.`,
    `With ${companion} departing wounded but alive, ${hero} felt how difficult it was to value an oath without treating it as a tether.`],
  mercy: (hero, companion) => [
    `${companion} was leaving wounded but alive, and ${hero} hoped concern could make room for dignity instead of shrinking into pity.`,
    `As ${companion} left wounded but alive, ${hero} wanted tenderness to remain possible without pretending it could set everything right.`],
  courage: (hero, companion) => [
    `${companion} was leaving wounded but alive; ${hero} wondered whether courage might mean admitting the fear that relief had not erased.`,
    `With ${companion} departing wounded but alive, ${hero} hoped to face the uncertainty without dressing it up as confidence.`],
};
const longPassage = "The arch's presence was like a whispered secret that Mara had never heard before, a promise folded into the stone and carried through the patient years by rain, by dust, by the quiet feet of travelers who had passed without looking up, and she wondered whether her own curiosity was courage or merely another way of delaying the road ahead. Her mind was already on the other side, but now she felt a sense of trepidation, as though every weathered mark concealed a familiar voice and every breath of wind invited her to remember a hope she had left unnamed, while the long shadows stretched across the grass and the unanswered silence settled gently between the things she wanted and the things she feared.";

type SmokeState = {
  workers: number;
  loads: number;
  writes: number;
  directions: number;
  directionChoice: "1" | "2" | "3";
  directionPrompts: { role: string; content: string }[][];
  moments: number;
  momentChoice: "1" | "2";
  momentPrompts: { role: string; content: string }[][];
  momentCurrentScenes: { tick: number; headline: string }[];
  writeCurrentScenes: { tick: number; scene: WorldState["scene"]; entry: WorldState["chronicle"][number] | undefined; activeCompanions: number }[];
  terminations: number;
  heroName: string;
  companionName: string | null;
  hidden: boolean;
  wallClockOffsetMs: number;
  prompts: { role: string; content: string }[][];
  requests: { id: number; worker: EventTarget; completed: boolean }[];
  autoReplies: Record<number, string>;
  complete(text: string, ordinal?: number): void;
  setHidden(value: boolean): void;
};

type CompanionFixtureCondition = "healthy" | "injured";

function savedScene(mode: "travel" | "battle", needsCompanion = false, companionCondition?: CompanionFixtureCondition) {
  let world = createWorld("creative-story-browser", "campaign:creative-story-browser");
  for (let count = 0; count < 400; count++) {
    world = advanceWorld(world);
    const entry = world.chronicle.at(-1);
    if (world.scene.mode === mode && world.pendingAttention.length === 0
      && (!(needsCompanion || companionCondition !== undefined) || projectParty(world.depth).active !== null)
      && projectStoryBeatJobV1(world.campaignId, world.scene, entry, entry?.id) !== null
      && (mode !== "battle" || advanceWorld(advanceWorld(world)).scene.mode === "battle")) {
      if (companionCondition === undefined) return world;
      const companion = world.depth.companions.active[0]!;
      // Saved-state fixture only, not proof that combat caused an injury or recovery.
      return upgradeWorldState({
        ...world,
        depth: {
          ...world.depth,
          companions: {
            ...world.depth.companions,
            active: [{
              ...companion,
              injury: companionCondition === "injured" ? "fallen" : "none",
              resources: {
                ...companion.resources,
                health: companionCondition === "injured" ? 0 : companion.combat.maxHealth,
              },
            }],
          },
        },
      });
    }
  }
  throw new Error(`Creative story fixture needs an admitted ${mode} scene`);
}

function savedFarewellScene() {
  // Same canonical short journey as farewell-remembrance.test.ts: the real T1
  // oath remains in the 32-entry Chronicle when the next step commits farewell T19.
  const seed = "remembrance-short-1";
  const base = createWorld(seed, `campaign:${seed}`);
  const originId = base.depth.atlas.currentLocationId;
  const current = base.depth.atlas.locations.find((location) => location.kind === "town" && location.id !== originId);
  if (current === undefined) throw new Error("Farewell browser fixture needs another town");
  const town = visitTown(generateTown(seed, current.id));
  let before = upgradeWorldState({
    ...base,
    scene: { ...base.scene, mode: "town", location: town.name },
    forwardMotion: createForwardMotionState(current.id, base.tick),
    depth: {
      ...base.depth,
      atlas: { ...base.depth.atlas, currentLocationId: current.id, discoveredLocationIds: [originId, current.id], route: null },
      towns: { ...base.depth.towns, [current.id]: town },
    },
  });
  for (let step = 0; step < 96; step++) {
    if (campaignDirector(before).candidates[0]?.command.type === "farewell-companion") break;
    before = advanceWorld(before);
  }
  const active = before.depth.companions.active[0];
  if (active === undefined || active.phase !== "arrived") throw new Error("Farewell browser companion did not arrive");
  // Valid saved condition, not proof that a fight caused this injury. The farewell
  // itself is committed by the real running application after this before-state loads.
  before = upgradeWorldState({
    ...before,
    depth: { ...before.depth, companions: { ...before.depth.companions,
      active: [{ ...active, injury: "fallen", resources: { ...active.resources, health: 0 } }],
    } },
  });
  const after = advanceWorld(before);
  const remembrance = projectFarewellRemembrance(before, after);
  if (remembrance === null) throw new Error("Farewell browser fixture must retain its genuine oath");
  return { before, remembrance };
}

function savedFirstVictoryScene() {
  // Same validated pre-winning-blow fixture as first-shared-victory.test.ts.
  // Setup chooses saved health/turn order, not a fake victory or participation.
  const seed = "shared-road-party-experience";
  const initial = createWorld(seed, `campaign:${seed}`);
  const origin = initial.depth.atlas.currentLocationId;
  const location = initial.depth.atlas.locations.find((entry) => entry.kind === "town" && entry.id !== origin)!;
  const town = visitTown(generateTown(seed, location.id));
  const eligible = upgradeWorldState({
    ...initial, scene: { ...initial.scene, mode: "town", location: town.name },
    forwardMotion: createForwardMotionState(location.id, initial.tick),
    depth: { ...initial.depth, atlas: { ...initial.depth.atlas, currentLocationId: location.id,
      discoveredLocationIds: [origin, location.id], route: null }, towns: { ...initial.depth.towns, [location.id]: town } },
  });
  const routed = advanceWorld(advanceWorld(eligible));
  const encounterId = unresolvedRouteEncounterId(routed.depth);
  if (encounterId === null) throw new Error("First-victory browser fixture needs a route encounter");
  const depth = stepDepth(routed.depth, { type: "start-combat", encounterId, enemyCount: 1 });
  const combat = depth.combat;
  const companion = depth.companions.active[0];
  if (combat === null || companion === undefined || companion.victories !== 0) throw new Error("First-victory browser fixture needs a new combat participant");
  const health = companion.combat.maxHealth;
  const before = upgradeWorldState({
    ...routed, tick: depth.tick,
    hero: { ...routed.hero, health: depth.hero.resources.health, maxHealth: depth.hero.resources.maxHealth },
    scene: { ...routed.scene, mode: "battle", headline: "The first shared battle nears its end.",
      action: "The hero faces the final enemy.", consequence: "The next combat action will be resolved.", sensoryIntensity: 3 },
    lifecycle: { ...routed.lifecycle, simulationTick: depth.tick, worldClockMinutes: routed.lifecycle.worldClockMinutes + 15 },
    depth: { ...depth, companions: { ...depth.companions, active: [{ ...companion,
      injury: "none", resources: { ...companion.resources, health } }] },
    combat: { ...combat, activeIndex: combat.turnOrder.indexOf(depth.hero.id), combatants: combat.combatants.map((entry) =>
      entry.id === companion.identity.residentId ? { ...entry, health }
        : entry.side === "enemies" ? { ...entry, health: 1 } : entry) } },
  });
  const packet = projectFirstSharedVictory(before, advanceWorld(before));
  if (packet === null) throw new Error("First-victory browser fixture must have a canonical winning step");
  return { before, packet };
}

async function openGame(
  page: Page,
  mode: "travel" | "battle" = "travel",
  needsCompanion = false,
  companionCondition?: CompanionFixtureCondition,
): Promise<void> {
  await openSavedGame(page, savedScene(mode, needsCompanion, companionCondition));
}

async function openSavedGame(page: Page, world: WorldState): Promise<void> {
  // Keep full 320/1280 layout coverage below; lifecycle tests need less software rasterization.
  if (page.viewportSize()?.width === 1440) await page.setViewportSize({ width: 960, height: 640 });
  await page.addInitScript(({ saved, companionName, playModeKey }) => {
    sessionStorage.setItem(`the-grind-2:campaign:${saved.campaignId}`, JSON.stringify(saved));
    sessionStorage.setItem("the-grind-2:activeCampaignId", saved.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${saved.campaignId}`, String(Date.now() + 60_000));
    localStorage.setItem("the-grind-2:stage-focus:v1", "panels");
    // These saved-world tests begin with a remembered, explicit No LLM choice.
    // Fresh welcome and remembered LLM restoration have their own startup tests.
    if (localStorage.getItem(playModeKey) === null) {
      localStorage.setItem(playModeKey, JSON.stringify({ schemaVersion: 1, mode: "deterministic" }));
    }
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 8 });
    Object.defineProperty(navigator, "deviceMemory", { value: 8 });
    const state: SmokeState = {
      workers: 0, loads: 0, writes: 0, directions: 0, directionChoice: "1", directionPrompts: [], terminations: 0,
      moments: 0, momentChoice: "2", momentPrompts: [], momentCurrentScenes: [], writeCurrentScenes: [],
      heroName: saved.hero.name, companionName, hidden: true, wallClockOffsetMs: 0, prompts: [], requests: [], autoReplies: {},
      complete(this: SmokeState, text: string, ordinal = this.requests.findIndex((request) => !request.completed)) {
        const request = this.requests[ordinal];
        if (!request || request.completed) throw new Error("No creative write pending");
        request.completed = true;
        // Deliver even after terminate: the real client must reject stale messages.
        request.worker.dispatchEvent(new MessageEvent("message", {
          data: { type: "result", id: request.id, text },
        }));
      },
      setHidden(value) {
        this.hidden = value;
        document.dispatchEvent(new Event("visibilitychange"));
      },
    };
    const realNow = Date.now.bind(Date);
    // Install before the production director captures Date.now; real timers keep running.
    Date.now = () => realNow() + state.wallClockOffsetMs;
    Object.assign(window, { __creativeStorySmoke: state });
    // Browser-environment visibility fixture, not a game-state or production test hook.
    Object.defineProperty(document, "hidden", { configurable: true, get: () => state.hidden });
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, {
      construct(target, args) {
        if ((args[1] as WorkerOptions | undefined)?.name !== "the-grind-2:creative-writer") {
          return Reflect.construct(target, args);
        }
        state.workers += 1;
        return new class extends EventTarget {
          postMessage(message: { id: number; type: string; messages?: { role: string; content: string }[] }) {
            if (message.type === "load") {
              state.loads += 1;
              queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", {
                data: { type: "ready", id: message.id },
              })));
            } else if (message.type === "direct") {
              // chooseMoment shares the direct transport; stage exclusion alone
              // cannot distinguish its two-candidate task from a stage choice.
              const choosingMoment = message.messages?.some(({ role, content }) => role === "system"
                && content.startsWith("Choose which recorded moment would make the more compelling brief fantasy intermission.")) === true;
              if (choosingMoment) {
                state.moments += 1;
                state.momentPrompts.push(message.messages ?? []);
                const current = JSON.parse(sessionStorage.getItem(`the-grind-2:campaign:${saved.campaignId}`)!) as WorldState;
                state.momentCurrentScenes.push({ tick: current.tick, headline: current.scene.headline });
              } else {
                state.directions += 1;
                state.directionPrompts.push(message.messages ?? []);
              }
              const choice = choosingMoment ? state.momentChoice : state.directionChoice;
              queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", {
                data: { type: "direction", id: message.id, choice },
              })));
            } else if (message.type === "write") {
              const ordinal = state.requests.length;
              state.writes += 1;
              state.prompts.push(message.messages ?? []);
              const current = JSON.parse(sessionStorage.getItem(`the-grind-2:campaign:${saved.campaignId}`)!) as WorldState;
              state.writeCurrentScenes.push({ tick: current.tick, scene: current.scene,
                entry: current.chronicle.at(-1), activeCompanions: current.depth.companions.active.length });
              state.requests.push({ id: message.id, worker: this, completed: false });
              const reply = state.autoReplies[ordinal];
              if (reply !== undefined) {
                delete state.autoReplies[ordinal];
                queueMicrotask(() => state.complete(reply, ordinal));
              }
            }
          }
          terminate() { state.terminations += 1; }
        }();
      },
    });
  }, { saved: world, companionName: projectParty(world.depth).active?.name ?? null, playModeKey: playModePreferenceKey });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?fast");
  await settleGameBoot(page, world.scene.mode);
}

async function settleGameBoot(page: Page, mode: SceneMode): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 20_000 });
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>("#pause-button")!;
    if (button.textContent === "Pause") button.click();
    // Initial persistence replaced the saved future checkpoint; this visibility change
    // ends fixture bootstrapping, not a real interval spent away from the game.
    const campaignId = sessionStorage.getItem("the-grind-2:activeCampaignId")!;
    localStorage.setItem(`the-grind-2:last-active:${campaignId}`, String(Date.now() + 60_000));
    (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke.setHidden(false);
  });
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  await expect(page.locator("#stage")).toHaveAttribute("data-scene-mode", mode);
}

// Invoke actual controls without software-rendered canvas pointer hit-test delays.
async function clickControl(page: Page, selector: string): Promise<void> {
  if (selector === "#narrator-button" || selector === "#new-button") {
    const menu = await page.locator("#stage-menu-button").isVisible()
      ? page.locator("#stage-menu-button") : page.locator("#game-menu-button");
    await expect(menu).toBeVisible();
    await menu.evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.locator("#game-menu")).toBeVisible();
    if (process.env.TG2_VISUAL_CAPTURE === "1" && page.viewportSize()?.width === 1280) {
      await page.screenshot({ path: "/tmp/the-grind-2-game-menu-1280.png" });
    }
  }
  await expect(page.locator(selector)).toBeEnabled();
  await page.locator(selector).evaluate((button: HTMLButtonElement) => button.click());
  if (selector === "#narrator-button") {
    await expect(page.locator("#narrator-dialog")).toBeVisible();
    if (!await page.locator("#narrator-advanced").evaluate((details: HTMLDetailsElement) => details.open)) {
      await page.locator("#narrator-advanced > summary").evaluate((summary: HTMLElement) => summary.click());
    }
  } else if (selector === "#new-button") {
    await expect(page.locator("#play-start-dialog")).toBeVisible();
    await page.locator("#play-start-deterministic").evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.locator("#play-start-dialog")).toBeHidden();
  }
}

async function workerCounts(page: Page) {
  return page.evaluate(() => {
    const state = (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke;
    return { workers: state.workers, loads: state.loads, writes: state.writes, terminations: state.terminations };
  });
}

async function finishWrite(page: Page, text = shortPassage, ordinal?: number): Promise<void> {
  await page.evaluate(({ output, ordinal }) => {
    (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke.complete(output, ordinal);
  }, { output: text, ordinal });
}

async function tick(page: Page): Promise<number> {
  return Number(await page.locator("#app").getAttribute("data-simulation-tick"));
}

async function expectNextTick(page: Page, previous?: number): Promise<void> {
  const threshold = previous ?? await tick(page);
  await expect.poll(() => tick(page), { timeout: 20_000 }).toBeGreaterThan(threshold);
}

async function activate(page: Page): Promise<void> {
  await clickControl(page, "#narrator-button");
  await clickControl(page, "#creative-load");
  await expect(page.locator("#app")).toHaveAttribute("data-creative-story-state", "ready");
  // Settings plus explicit loading cannot start a story while the user is paused.
  expect(await workerCounts(page)).toMatchObject({ workers: 1, loads: 1, writes: 0 });
  await clickControl(page, "#narrator-close");
  await clickControl(page, "#pause-button");
  await expect.poll(async () => (await workerCounts(page)).writes).toBe(1);
}

async function expectIntermission(
  page: Page,
  text: string | null = shortPassage,
  hold = false,
  origin: "model" | "authored" = "model",
): Promise<void> {
  await expect(page.locator("#narrative-intermission")).toBeVisible({ timeout: 30_000 });
  if (hold) await clickControl(page, "#narrative-intermission-hold");
  const expectedText = text ?? await page.locator("#narrative-intermission-prose").innerText();
  expect(expectedText.length).toBeGreaterThan(0);
  await expect(page.locator("#narrative-intermission-prose")).toHaveText(expectedText);
  await expect(page.locator("#narrative-intermission-accessible-prose")).toHaveText(expectedText);
  await expect(page.locator("#narrative-intermission-caption")).toHaveText(/^(?:An earlier moment|A farewell revisited|First victory together)(?: · .+)?$/u);
  await expect(page.locator("#narrative-intermission-attribution")).toHaveText(origin === "authored"
    ? "Authored interlude · imagined interpretation" : "Local storyteller · imagined interpretation");
  await expect(page.locator("#narrative-intermission")).toHaveAttribute("data-story-origin", origin);
  await expect(page.locator("#app")).toHaveAttribute("data-narrative-intermission", "true");
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "true");
  // Reading pauses presentation, not the user's Pause preference.
  await expect(page.locator("#pause-button")).toHaveText("Pause");
  await expect(page.locator("#stage")).not.toHaveAttribute("data-scene-mode", "battle");
}

test("off makes no model requests and a saved model needs explicit activation", async ({ page }) => {
  const modelRequests: string[] = [];
  page.on("request", (request) => {
    if (/huggingface|creative-writer|SmolLM|ort-wasm/iu.test(request.url())) modelRequests.push(request.url());
  });
  await openGame(page);
  await expect(page.locator("#creative-story-write")).toHaveCount(0);
  await expect(page.locator("#creative-story-control")).toHaveCount(0);
  await clickControl(page, "#pause-button");
  await expectNextTick(page);
  await clickControl(page, "#pause-button");
  expect(await workerCounts(page)).toMatchObject({ workers: 0, loads: 0, writes: 0 });
  expect(modelRequests).toEqual([]);
  const modelRoot = `https://huggingface.co/${creativeWriterModelId}/resolve/${creativeWriterModelRevision}/`;
  const urls = [
    ...["config.json", "generation_config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"]
      .map((file) => modelRoot + file),
    "https://the-grind-2.invalid/creative-writer-runtime/ort-wasm-simd-threaded.asyncify.mjs",
    "https://the-grind-2.invalid/creative-writer-runtime/ort-wasm-simd-threaded.asyncify.wasm",
  ];
  // Tiny fixtures test discovery only; the separate real-model probe verified cached bytes.
  await page.evaluate(async ({ name, urls }) => {
    const cache = await caches.open(name);
    await Promise.all(urls.map((url) => cache.put(url, new Response("fixture"))));
  }, { name: creativeWriterCacheName, urls });
  await clickControl(page, "#narrator-button");
  await expect(page.locator("#creative-load")).toHaveText("Use saved model");
  await expect(page.locator("#creative-status")).toContainText("without downloading");
  expect(await workerCounts(page)).toMatchObject({ workers: 0 });
  const focus = page.getByRole("combobox", { name: "Story focus", exact: true });
  await expect(focus).toHaveValue("inner-life");
  await expect(page.locator("#creative-story-focus-relationship")).toHaveJSProperty("disabled", true);
  await focus.selectOption("scene");
  await expect(focus).toHaveValue("scene");
  await clickControl(page, "#creative-load");
  await expect(page.locator("#creative-status")).toContainText("stories appear between scenes");
  expect(await workerCounts(page)).toMatchObject({ workers: 1, loads: 1, writes: 0 });
  await clickControl(page, "#creative-stop");
  await expect(page.locator("#creative-load")).toHaveText("Use saved model");
  expect(await workerCounts(page)).toMatchObject({ terminations: 1 });
});

test("remembered focus and rhythm survive reload while off, including solo fallback and compact settings", async ({ page }) => {
  const modelRequests: string[] = [];
  page.on("request", (request) => {
    if (/huggingface|creative-writer|SmolLM|ort-wasm/iu.test(request.url())) modelRequests.push(request.url());
  });
  await openGame(page);
  await clickControl(page, "#narrator-button");
  const focus = page.getByRole("combobox", { name: "Story focus", exact: true });
  const rhythm = page.getByRole("combobox", { name: "Story rhythm", exact: true });
  await focus.selectOption("scene");
  await rhythm.selectOption("rare");
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storytellingPreferenceKey))
    .toEqual({ schemaVersion: 1, focus: "scene", rhythm: "rare", draftRecovery: "vignette" });
  expect(await workerCounts(page)).toEqual({ workers: 0, loads: 0, writes: 0, terminations: 0 });

  await page.reload();
  await settleGameBoot(page, "travel");
  await clickControl(page, "#narrator-button");
  await expect(focus).toHaveValue("scene");
  await expect(rhythm).toHaveValue("rare");
  await expect(page.locator("#app")).toHaveAttribute("data-creative-story-state", "off");
  expect(await workerCounts(page)).toEqual({ workers: 0, loads: 0, writes: 0, terminations: 0 });

  // A preference from an earlier shared road is valid even in a new solo campaign.
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, focus: "shared-road", rhythm: "quiet" }));
  }, storytellingPreferenceKey);
  await page.reload();
  await settleGameBoot(page, "travel");
  await clickControl(page, "#narrator-button");
  await expect(focus).toHaveValue("shared-road");
  await expect(rhythm).toHaveValue("quiet");
  await expect(page.locator("#creative-story-focus-relationship")).toHaveJSProperty("disabled", true);
  await expect(page.locator("#creative-story-focus-availability"))
    .toHaveText("Shared road is remembered. Solo scenes use Inner life; captured companion moments can still take priority.");
  await expect(page.locator("#creative-story-rhythm-note")).toContainText("minimum gaps");
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storytellingPreferenceKey))
    .toEqual({ schemaVersion: 1, focus: "shared-road", rhythm: "quiet" });

  for (const viewport of [{ width: 320, height: 568 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.locator(".creative-story-preferences").evaluate((controls) => controls.scrollIntoView({ block: "center" }));
    const layout = await page.locator("#narrator-dialog").evaluate((dialog) => {
      const bounds = dialog.getBoundingClientRect();
      const shell = dialog.querySelector<HTMLElement>(".narrator-dialog-shell")!;
      const selects = [...dialog.querySelectorAll<HTMLSelectElement>(".creative-story-preference select")];
      return {
        fits: bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight,
        pageFits: document.documentElement.scrollWidth <= innerWidth + 1,
        shellFits: shell.scrollWidth <= shell.clientWidth + 1,
        controlsFit: selects.length === 3 && selects.every((select) => {
          const box = select.getBoundingClientRect();
          return box.height >= 44 && box.left >= bounds.left && box.right <= bounds.right
            && box.top >= bounds.top && box.bottom <= bounds.bottom;
        }),
      };
    });
    expect(layout).toEqual({ fits: true, pageFits: true, shellFits: true, controlsFit: true });
    if (process.env.TG2_VISUAL_CAPTURE === "1") {
      await page.screenshot({ path: `/tmp/the-grind-2-storytelling-settings-${viewport.width}.png`, fullPage: true });
    }
  }
  expect(await workerCounts(page)).toEqual({ workers: 0, loads: 0, writes: 0, terminations: 0 });
  expect(modelRequests).toEqual([]);
});

test("remembered rhythm controls automatic cadence and changing back to Regular keeps the previous anchor", async ({ page }) => {
  test.setTimeout(180_000);
  await openGame(page);
  await clickControl(page, "#narrator-button");
  const rhythm = page.getByRole("combobox", { name: "Story rhythm", exact: true });
  await rhythm.selectOption("quiet");
  await clickControl(page, "#narrator-close");
  await activate(page);
  await finishWrite(page);
  await expectIntermission(page, shortPassage, true);
  await clickControl(page, "#narrative-intermission-skip");

  const advanceCadence = async (milliseconds: number): Promise<void> => {
    const previous = await tick(page);
    await page.evaluate((amount) => {
      (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke.wallClockOffsetMs += amount;
    }, milliseconds);
    await expectNextTick(page, previous);
  };
  // Quiet must not reuse the old 90-second default, but becomes eligible after 180 seconds.
  await advanceCadence(95_000);
  expect(await workerCounts(page)).toMatchObject({ workers: 1, loads: 1, writes: 1 });
  await advanceCadence(100_000);
  await expect.poll(async () => (await workerCounts(page)).writes).toBe(2);
  const second = "The dust held a quiet memory of the company, although the road had already turned away.";
  await finishWrite(page, second, 1);
  await expectIntermission(page, second, true);
  await clickControl(page, "#narrative-intermission-skip");

  await clickControl(page, "#narrator-button");
  await rhythm.selectOption("rare");
  await clickControl(page, "#narrator-close");
  await advanceCadence(195_000);
  // Rare still waits at a point where Quiet would already allow another request.
  expect(await workerCounts(page)).toMatchObject({ workers: 1, loads: 1, writes: 2 });
  await expect(page.locator("#narrative-intermission")).toBeHidden();
  await clickControl(page, "#narrator-button");
  await rhythm.selectOption("balanced");
  await clickControl(page, "#narrator-close");
  // Recalculate from the last actual story, not a fresh 90-second delay after this change.
  await expect.poll(async () => (await workerCounts(page)).writes, { timeout: 20_000 }).toBe(3);
  const third = "A weathered sign leaned toward the path as if it, too, wanted to hear what came next.";
  await finishWrite(page, third, 2);
  await expectIntermission(page, third, true);
  expect(await workerCounts(page)).toEqual({ workers: 1, loads: 1, writes: 3, terminations: 0 });
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storytellingPreferenceKey))
    .toEqual({ schemaVersion: 1, focus: "inner-life", rhythm: "balanced", draftRecovery: "vignette" });
  await clickControl(page, "#narrative-intermission-skip");
});

test("a long Hold starts the next scroll's minimum gap at close", async ({ page }) => {
  await openGame(page);
  await activate(page);
  await finishWrite(page);
  await expectIntermission(page, shortPassage, true);
  const readingTick = await tick(page);
  await page.evaluate(() => {
    (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke.wallClockOffsetMs += 100_000;
  });
  await expect(page.locator("#narrative-intermission")).toBeVisible();
  expect(await tick(page)).toBe(readingTick);
  expect(await workerCounts(page)).toMatchObject({ writes: 1 });
  await clickControl(page, "#narrative-intermission-skip");

  // Generation is already eligible from the older presentation anchor. Display is not:
  // closing a long-held scroll must still buy the player a fresh gap before another scroll.
  await expect.poll(async () => (await workerCounts(page)).writes, { timeout: 20_000 }).toBe(2);
  const second = "Beyond the last bend, a pale stone held the warmth of an afternoon the traveler had almost forgotten.";
  await finishWrite(page, second, 1);
  await expect(page.locator("#app")).toHaveAttribute("data-creative-story-state", "ready");
  await expectNextTick(page);
  await expect(page.locator("#narrative-intermission")).toBeHidden();
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "false");
  const previous = await tick(page);
  await page.evaluate(() => {
    (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke.wallClockOffsetMs += 95_000;
  });
  await expectNextTick(page, previous);
  await expectIntermission(page, second, true);
  expect(await workerCounts(page)).toEqual({ workers: 1, loads: 1, writes: 2, terminations: 0 });
  await clickControl(page, "#narrative-intermission-skip");
});

test("automatic writing lets play advance, waits for user Resume, and Hold preserves that preference", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openGame(page);
  await activate(page);
  await expectNextTick(page);
  await expect(page.locator("#app")).toHaveAttribute("data-creative-story-state", "writing");
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "false");
  expect(await page.evaluate(() => {
    const state = (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke;
    return state.prompts[0]?.some(({ content }) => content.includes(`Viewpoint: ${state.heroName}.`));
  })).toBe(true);
  await clickControl(page, "#pause-button");
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  await finishWrite(page);
  await expect(page.locator("#app")).toHaveAttribute("data-creative-story-state", "ready");
  await expect(page.locator("#narrative-intermission")).toBeHidden();
  const pausedTick = await tick(page);
  await clickControl(page, "#pause-button");
  await expectIntermission(page, shortPassage, true);
  await expect(page.locator("#narrative-intermission-hold")).toHaveText("Continue");
  const readingTick = await tick(page);
  expect(readingTick).toBeGreaterThanOrEqual(pausedTick);
  // Short prose would auto-close after 12 seconds without Hold.
  // This fixed wait measures the actual auto-dismiss deadline, not UI readiness.
  await page.waitForTimeout(12_500);
  await expect(page.locator("#narrative-intermission")).toBeVisible();
  expect(await tick(page)).toBe(readingTick);
  await clickControl(page, "#narrative-intermission-hold");
  await expect(page.locator("#narrative-intermission")).toBeHidden();
  await expect(page.locator("#pause-button")).toHaveText("Pause");
  await expectNextTick(page, readingTick);
  expect(await workerCounts(page)).toMatchObject({ workers: 1, writes: 1, terminations: 0 });
  expect(errors).toEqual([]);
});

test("Shared road can be selected in settings before the first automatic generation", async ({ page }) => {
  await openGame(page, "travel", true);
  await clickControl(page, "#narrator-button");
  const focus = page.getByRole("combobox", { name: "Story focus", exact: true });
  await expect(page.locator("#creative-story-focus-relationship")).toHaveJSProperty("disabled", false);
  await focus.selectOption("shared-road");
  await expect(focus).toHaveValue("shared-road");
  await clickControl(page, "#creative-load");
  await expect(page.locator("#app")).toHaveAttribute("data-creative-story-state", "ready");
  expect(await workerCounts(page)).toMatchObject({ writes: 0 });
  await clickControl(page, "#narrator-close");
  await clickControl(page, "#pause-button");
  await expect.poll(async () => (await workerCounts(page)).writes).toBe(1);
  expect(await page.evaluate(() => {
    const state = (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke;
    const prompt = state.prompts[0]?.map(({ content }) => content).join("\n") ?? "";
    return state.companionName !== null && prompt.includes(`Present companion: ${state.companionName},`)
      && prompt.includes("\nImage:") && !prompt.includes("Writing idea:");
  })).toBe(true);
});

test("Last story reopens the presented authored passage held, preserves pause, and survives No LLM", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  const modelRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/huggingface|SmolLM|ort-wasm/iu.test(request.url())) modelRequests.push(request.url());
  });
  await page.setViewportSize({ width: 960, height: 640 });
  await openGame(page, "travel", true, "injured");
  const menuButton = () => page.locator("#stage-menu-button:visible, #game-menu-button:visible").first();
  const openMenu = async (): Promise<void> => {
    await menuButton().evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.locator("#game-menu")).toBeVisible();
  };
  await openMenu();
  await expect(page.locator("#last-story-button")).toBeVisible();
  await expect(page.locator("#last-story-button")).toBeDisabled();
  expect(await workerCounts(page)).toMatchObject({ workers: 0, loads: 0, writes: 0 });
  await clickControl(page, "#game-menu-close");

  await clickControl(page, "#narrator-button");
  await page.getByRole("combobox", { name: "Story focus", exact: true }).selectOption("shared-road");
  await clickControl(page, "#narrator-close");
  await activate(page);
  // Only inference is faked. The real controller selects and labels this authored recovery.
  await finishWrite(page, "<p>Rejected Last story fixture.</p>");
  await expectIntermission(page, null, true, "authored");
  const dialog = page.locator("#narrative-intermission");
  const capturePassage = () => dialog.evaluate((element) => ({
    prose: element.querySelector("#narrative-intermission-prose")!.textContent,
    accessible: element.querySelector("#narrative-intermission-accessible-prose")!.textContent,
    caption: element.querySelector("#narrative-intermission-caption")!.textContent,
    attribution: element.querySelector("#narrative-intermission-attribution")!.textContent,
    source: element.querySelector("#narrative-intermission-source")!.textContent,
    sourceHidden: (element.querySelector("#narrative-intermission-source") as HTMLElement).hidden,
    origin: element.getAttribute("data-story-origin"),
    tone: element.getAttribute("data-inspiration-tone"),
  }));
  const presented = await capturePassage();
  expect(presented).toMatchObject({
    origin: "authored", tone: "care", sourceHidden: false,
    attribution: "Authored interlude · imagined interpretation",
  });
  expect(presented.source).toContain("Recorded moment");
  // Keep the already-safe scene fixed using real controls in one browser task;
  // separate automation round trips could otherwise let play enter a fight.
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>("#narrative-intermission-skip")!.click();
    document.querySelector<HTMLButtonElement>("#pause-button")!.click();
  });
  await expect(dialog).toBeHidden();
  await expect(page.locator("#pause-button")).toHaveText("Resume");

  const replay = async (): Promise<void> => {
    await openMenu();
    await expect(page.locator("#last-story-button")).toBeEnabled();
    await clickControl(page, "#last-story-button");
    await expect(page.locator("#game-menu")).toBeHidden();
    await expect(dialog).toBeVisible();
    await expect(page.locator("#narrative-intermission-hold")).toHaveText("Continue");
    await expect(page.locator("#narrative-intermission-source")).toHaveJSProperty("open", false);
    expect(await capturePassage()).toEqual(presented);
    await expect(page.locator("#pause-button")).toHaveText("Resume");
    await expect(page.locator("#app")).toHaveAttribute("data-narrative-intermission", "true");
    await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "true");
    expect(await dialog.evaluate((element) => [...element.querySelectorAll(".narrative-intermission-word")]
      .every((word) => word.getAttribute("data-visible") === "true" && getComputedStyle(word).opacity === "1"))).toBe(true);
  };
  await replay();
  // Replay availability also proves any step already finishing at Pause has settled.
  const pausedTick = await tick(page);
  for (const viewport of [{ width: 960, height: 640 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    const layout = await dialog.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const reading = element.querySelector<HTMLElement>("#narrative-intermission-reading")!;
      return {
        dialogFits: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
        pageFits: document.documentElement.scrollWidth <= innerWidth + 1,
        textFits: reading.scrollWidth <= reading.clientWidth + 1,
        buttonsFit: [...element.querySelectorAll("button")].every((button) => {
          const rect = button.getBoundingClientRect();
          return rect.height >= 44 && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
        }),
      };
    });
    expect(layout).toEqual({ dialogFits: true, pageFits: true, textFits: true, buttonsFit: true });
    if (process.env.TG2_VISUAL_CAPTURE === "1") {
      await page.screenshot({ path: `/tmp/the-grind-2-last-story-${viewport.width}.png` });
    }
  }
  await clickControl(page, "#narrative-intermission-hold");
  await expect(dialog).toBeHidden();
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  await expect(menuButton()).toBeFocused();
  expect(await tick(page)).toBe(pausedTick);
  expect(await workerCounts(page)).toMatchObject({ workers: 1, loads: 1, writes: 1 });

  await openMenu();
  await page.locator("#last-story-button").evaluate((button) => button.scrollIntoView({ block: "nearest" }));
  const menuLayout = await page.locator("#game-menu").evaluate((element) => {
    const box = element.getBoundingClientRect();
    const button = element.querySelector<HTMLButtonElement>("#last-story-button")!;
    const rect = button.getBoundingClientRect();
    return {
      fits: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
      pageFits: document.documentElement.scrollWidth <= innerWidth + 1,
      actionFits: rect.height >= 44 && rect.left >= box.left && rect.right <= box.right
        && rect.top >= box.top && rect.bottom <= box.bottom,
      enabled: !button.disabled,
    };
  });
  expect(menuLayout).toEqual({ fits: true, pageFits: true, actionFits: true, enabled: true });
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: "/tmp/the-grind-2-last-story-menu-320.png" });
  }
  await page.locator("#narrator-button").evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#narrator-dialog")).toBeVisible();
  await page.locator("#play-mode-select").selectOption("deterministic");
  await expect(page.locator("#app")).toHaveAttribute("data-creative-story-state", "off");
  await clickControl(page, "#narrator-close");
  const stopped = await workerCounts(page);
  expect(stopped).toEqual({ workers: 1, loads: 1, writes: 1, terminations: 1 });
  await replay();
  await clickControl(page, "#narrative-intermission-hold");
  await expect(dialog).toBeHidden();
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  expect(await tick(page)).toBe(pausedTick);
  expect(await workerCounts(page)).toEqual(stopped);
  expect(modelRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("authored recovery labels a rejected completed draft and restores the model label on the next story", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openGame(page, "travel", true, "injured");
  await clickControl(page, "#narrator-button");
  const recovery = page.getByRole("combobox", { name: "If a draft fails", exact: true });
  await expect(recovery).toHaveValue("vignette");
  await page.getByRole("combobox", { name: "Story focus", exact: true }).selectOption("shared-road");
  await clickControl(page, "#narrator-close");
  await activate(page);
  await expect(page.locator("#creative-story-draft-recovery")).toBeDisabled();
  const names = await page.evaluate(() => {
    const state = (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke;
    return { hero: state.heroName, companion: state.companionName };
  });
  // Completed but unusable model output; production code chooses the authored interlude.
  await finishWrite(page, "<p>Rejected draft.</p>");
  await expectIntermission(page, null, true, "authored");
  await expect(page.locator("#creative-story-draft-recovery")).toBeEnabled();
  const dialog = page.locator("#narrative-intermission");
  const prose = page.locator("#narrative-intermission-prose");
  await expect(prose).toContainText(names.hero);
  expect(names.companion).not.toBeNull();
  await expect(prose).toContainText(names.companion!);
  await expect(prose).not.toContainText("Rejected draft");
  await expect(dialog).toHaveAttribute("data-inspiration-tone", "care");
  for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    const layout = await dialog.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const reading = element.querySelector<HTMLElement>("#narrative-intermission-reading")!;
      const prose = element.querySelector<HTMLElement>("#narrative-intermission-prose")!;
      const style = getComputedStyle(prose);
      return {
        fits: bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight,
        pageFits: document.documentElement.scrollWidth <= innerWidth + 1,
        readingFits: reading.scrollWidth <= reading.clientWidth + 1,
        proseColor: style.color,
        fontSize: Number.parseFloat(style.fontSize),
        buttonsFit: [...element.querySelectorAll<HTMLButtonElement>("button")].every((button) => {
          const box = button.getBoundingClientRect();
          return box.height >= 44 && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
        }),
        wordsVisible: [...prose.querySelectorAll(".narrative-intermission-word")]
          .every((word) => getComputedStyle(word).opacity === "1"),
        entryAnimation: getComputedStyle(element).animationName,
      };
    });
    expect(layout).toMatchObject({
      fits: true, pageFits: true, readingFits: true, buttonsFit: true,
      wordsVisible: true, entryAnimation: "none", proseColor: "rgb(101, 29, 36)",
    });
    expect(layout.fontSize).toBeGreaterThanOrEqual(19);
    if (process.env.TG2_VISUAL_CAPTURE === "1") {
      await page.screenshot({ path: `/tmp/the-grind-2-authored-interlude-${viewport.width}.png`, fullPage: true });
    }
  }
  await clickControl(page, "#narrative-intermission-skip");
  await expect(dialog).toBeHidden();
  await expect(dialog).toHaveAttribute("data-story-origin", "model");
  await expect(page.locator("#narrative-intermission-attribution"))
    .toHaveText("Local storyteller · imagined interpretation");
  const previous = await tick(page);
  await page.evaluate(() => {
    (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke.wallClockOffsetMs += 100_000;
  });
  await expectNextTick(page, previous);
  await expect.poll(async () => (await workerCounts(page)).writes, { timeout: 20_000 }).toBe(2);
  const accepted = `${names.hero} felt hope settle beside ${names.companion}, although neither road nor heart offered certainty.`;
  await finishWrite(page, accepted, 1);
  await expectIntermission(page, accepted, true, "model");
  await clickControl(page, "#narrative-intermission-skip");
  expect(await workerCounts(page)).toMatchObject({ workers: 1, writes: 2, terminations: 0 });
});

for (const duetCase of [false, true]) {
test(duetCase
  ? "authored first shared victory duet uses a recorded hero value and keeps the companion unchanged through Last story"
  : "authored first shared victory follows the real winning blow and Last story preserves its public record", async ({ page }) => {
  test.setTimeout(240_000);
  const { before, packet } = savedFirstVictoryScene();
  const modelRequests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (/huggingface|SmolLM|ort-wasm/iu.test(request.url())) modelRequests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  expect(before.depth.companions.active[0]?.victories).toBe(0);
  expect(before.depth.combat?.combatants.some((unit) => unit.id === packet.companionId && unit.side === "heroes")).toBe(true);
  await openSavedGame(page, before);
  if (duetCase) {
    await clickControl(page, "#narrator-button");
    await page.getByRole("combobox", { name: "Story focus", exact: true }).selectOption("shared-road");
    await expect(page.getByRole("combobox", { name: "Story focus", exact: true })).toHaveValue("shared-road");
    await clickControl(page, "#narrator-close");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() => {
      const dialog = document.querySelector<HTMLDialogElement>("#narrative-intermission")!;
      const observer = new MutationObserver(() => {
        const labels = [...dialog.querySelectorAll<HTMLElement>(".narrative-intermission-voice-label")];
        if (!dialog.open || labels.length !== 2) return;
        observer.disconnect();
        const words = [...dialog.querySelectorAll<HTMLElement>(".narrative-intermission-word")];
        Object.assign(window, { __duetRevealProbe: {
          total: words.length, visible: words.filter((word) => word.dataset.visible === "true").length,
          labelCount: labels.length, labelsStatic: labels.every((label) => getComputedStyle(label).opacity === "1"
            && label.querySelector(".narrative-intermission-word") === null),
          reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        } });
      });
      observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
    });
  }
  await page.evaluate(({ campaignId, combatId, companionId, eventId }) => {
    const observer = new MutationObserver(() => {
      const world = JSON.parse(sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`)!) as WorldState;
      const source = world.chronicle.find((entry) => entry.id === eventId);
      const combat = world.depth.completedCombats.find((entry) => entry.id === combatId);
      if (source === undefined || combat === undefined) return;
      observer.disconnect();
      Object.assign(window, { __firstSharedVictoryTransition: {
        tick: source.tick, headline: source.headline, commandType: source.commandType,
        outcome: combat.outcome, participant: combat.combatants.some((unit) => unit.id === companionId && unit.side === "heroes"),
        victories: world.depth.companions.active.find((entry) => entry.identity.residentId === companionId)?.victories,
        heroValues: [...world.hero.values],
      } });
    });
    observer.observe(document.querySelector("#app")!, { attributes: true, attributeFilter: ["data-simulation-tick"] });
  }, packet);
  await activate(page);
  const firstPrompt = await page.evaluate(() =>
    (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke.prompts[0]!
      .map(({ content }) => content).join("\n"));
  const victoryWasFirst = firstPrompt.includes(packet.battle.headline);
  // The real scheduler may capture the initial battle or its just-committed
  // victory first. Both paths must bind the eventual rejected draft to victory.
  await finishWrite(page, victoryWasFirst ? "<p>Rejected victory draft.</p>" : shortPassage, 0);
  await expect(page.locator("#narrative-intermission")).toBeVisible({ timeout: 60_000 });
  if (!victoryWasFirst) {
    await expectIntermission(page, shortPassage, true, "model");
    await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>("#pause-button")!.click();
      document.querySelector<HTMLButtonElement>("#narrative-intermission-skip")!.click();
    });
    await expect(page.locator("#pause-button")).toHaveText("Resume");
    await page.evaluate(() => {
      const state = (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke;
      // Shift only the wall-clock cadence WHILE genuinely paused. Actual Resume
      // resets the watchdog anchor; no combat or presentation gate is bypassed.
      state.wallClockOffsetMs += 100_000;
      state.momentChoice = "2";
      state.directionChoice = "2";
      state.autoReplies[1] = "<p>Rejected victory draft.</p>";
    });
    await clickControl(page, "#pause-button");
    await expect.poll(async () => (await workerCounts(page)).writes, { timeout: 30_000 }).toBe(2);
  }
  const dialog = page.locator("#narrative-intermission");
  const source = page.locator("#narrative-intermission-source");
  const voices = dialog.locator(".narrative-intermission-voice");
  const voiceInspiration = page.locator("#narrative-intermission-voice-inspiration");
  if (duetCase) {
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    await clickControl(page, "#narrative-intermission-hold");
    await expect(dialog).toHaveAttribute("data-story-origin", "authored");
    await expect(page.locator("#narrative-intermission-attribution")).toHaveText("Authored interlude · imagined interpretation");
    await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "true");
    await expect(page.locator("#pause-button")).toHaveText("Pause");
    const reveal = await page.evaluate(() => (window as unknown as {
      __duetRevealProbe: { total: number; visible: number; labelCount: number; labelsStatic: boolean; reducedMotion: boolean };
    }).__duetRevealProbe);
    expect(reveal).toMatchObject({ labelCount: 2, labelsStatic: true, reducedMotion: false });
    expect(reveal.total).toBeGreaterThan(0);
    expect(reveal.visible).toBeLessThan(reveal.total);
  } else {
    await expectIntermission(page, null, true, "authored");
    await expect(voices).toHaveCount(0);
  }
  const readProse = async () => duetCase
    ? (await dialog.locator(".narrative-intermission-voice-thought").allTextContents()).join("\n\n")
    : page.locator("#narrative-intermission-prose").innerText();
  const prose = await readProse();
  // Assert actual checked-in authored prose, never a fake successful LLM output.
  let voiceValue: HeroValue | null = null;
  let voiceNote: string | null = null;
  if (duetCase) {
    voiceNote = await voiceInspiration.textContent();
    const match = /^Hero voice inspired by recorded (curiosity|loyalty|mercy|courage)\.$/u.exec(voiceNote ?? "");
    expect(match).not.toBeNull();
    voiceValue = match![1] as HeroValue;
    expect(before.hero.values).toContain(voiceValue);
    const thoughts = await dialog.locator(".narrative-intermission-voice-thought").allTextContents();
    expect(healthyValueThoughts[voiceValue]).toContain(thoughts[0]);
    expect(thoughts[1]).toBe(unchangedVictoryCompanionThought);
    await expect(voiceInspiration).toBeHidden();
  } else {
    const authoredOptions = [0, 1, 2].map((attempt) =>
      createFirstSharedVictoryVignette(packet, "inner-life", "browser-library-membership", attempt)!.text);
    expect(authoredOptions).toContain(prose);
    await expect(voiceInspiration).toBeEmpty();
  }
  const expectedLabels = [`Hero · ${packet.heroName}`, `Companion · ${packet.companionName}`];
  const assertVoices = async () => {
    await expect(voices).toHaveCount(2);
    await expect(voices.nth(0)).toHaveAttribute("data-voice-role", "hero");
    await expect(voices.nth(1)).toHaveAttribute("data-voice-role", "companion");
    await expect(dialog.locator(".narrative-intermission-voice-label")).toHaveText(expectedLabels);
    const thoughts = await dialog.locator(".narrative-intermission-voice-thought").allTextContents();
    expect(thoughts[0]).not.toBe(thoughts[1]);
    for (const thought of thoughts) expect(thought).toMatch(/\b(?:I|me|my|myself)\b/u);
    await expect(page.locator("#narrative-intermission-accessible-prose"))
      .toHaveText(thoughts.map((thought, index) => `${expectedLabels[index]}\n${thought}`).join("\n\n"));
  };
  if (duetCase) await assertVoices();
  else {
    expect(prose).toContain(packet.heroName);
    expect(prose).toContain(packet.companionName);
  }
  const writtenPrompt = await page.evaluate(() =>
    (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke.prompts.at(-1)!
      .map(({ content }) => content).join("\n"));
  expect(writtenPrompt).toContain(packet.battle.headline);
  expect(writtenPrompt).toContain(packet.companionName);
  const committed = await page.evaluate(() => (window as unknown as {
    __firstSharedVictoryTransition?: { tick: number; headline: string; commandType: string; outcome: string; participant: boolean; victories: number; heroValues: HeroValue[] };
  }).__firstSharedVictoryTransition);
  expect(committed).toEqual({ tick: packet.tick, commandType: "combat-action", headline: packet.battle.headline,
    outcome: "victory", participant: true, victories: 1, heroValues: before.hero.values });
  if (duetCase) expect(committed!.heroValues).toContain(voiceValue);
  await expect(page.locator("#narrative-intermission-caption")).toHaveText(`First victory together · ${packet.battle.location}`);
  await expect(dialog).toHaveAttribute("data-inspiration-tone", packet.condition === "healthy" ? "trust" : "care");
  await expect(source).toHaveJSProperty("open", false);
  await source.locator("summary").evaluate((summary: HTMLElement) => summary.click());
  await expect(source.locator(".narrative-intermission-record")).toHaveCount(1);
  await expect(source).toContainText(`First shared victory · T${packet.tick}`);
  await expect(source).toContainText(packet.battle.location);
  await expect(source.locator(".narrative-intermission-record-headline")).toHaveText(packet.battle.headline);
  await expect(source).not.toContainText("Earlier oath");
  if (duetCase) {
    await expect(voiceInspiration).toBeVisible();
    await expect(voiceInspiration).toHaveText(voiceNote!);
  }
  const beforeReplay = await workerCounts(page);
  const decisionsBeforeReplay = await page.evaluate(() => {
    const state = (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke;
    return { moments: state.moments, directions: state.directions };
  });
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>("#pause-button")!.click();
    document.querySelector<HTMLButtonElement>("#narrative-intermission-skip")!.click();
  });
  await expect(dialog).toBeHidden();
  await expect(page.locator("#narrative-intermission-source-records")).toBeEmpty();
  await expect(voiceInspiration).toBeEmpty();
  if (duetCase) {
    await expect(voices).toHaveCount(0);
    await expect(page.locator("#narrative-intermission-accessible-prose")).toBeEmpty();
  }
  const menu = await page.locator("#stage-menu-button").isVisible() ? "#stage-menu-button" : "#game-menu-button";
  await clickControl(page, menu);
  await clickControl(page, "#last-story-button");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#narrative-intermission-hold")).toHaveText("Continue");
  expect(await readProse()).toBe(prose);
  if (duetCase) await assertVoices();
  else await expect(page.locator("#narrative-intermission-prose")).toHaveText(prose);
  await expect(page.locator("#narrative-intermission-attribution")).toHaveText("Authored interlude · imagined interpretation");
  await expect(page.locator("#narrative-intermission-caption")).toHaveText(`First victory together · ${packet.battle.location}`);
  await expect(source).toHaveJSProperty("open", false);
  if (duetCase) {
    await expect(voiceInspiration).toHaveText(voiceNote!);
    await expect(voiceInspiration).toBeHidden();
  }
  for (const viewport of [{ width: 960, height: 640 }, { width: 320, height: 568 }]) {
    if (duetCase) await page.emulateMedia({ reducedMotion: viewport.width === 320 ? "reduce" : "no-preference" });
    await page.setViewportSize(viewport);
    await page.locator("#narrative-intermission-reading").evaluate((reading) => { reading.scrollTop = 0; });
    if (process.env.TG2_VISUAL_CAPTURE === "1") {
      await page.screenshot({ path: `/tmp/the-grind-2-${duetCase ? "hero-value-duet" : "first-victory"}-${viewport.width}.png` });
    }
    await source.locator("summary").evaluate((summary: HTMLElement) => summary.click());
    await expect(source.locator(".narrative-intermission-record-headline")).toHaveText(packet.battle.headline);
    await source.locator(".narrative-intermission-record-headline").scrollIntoViewIfNeeded();
    if (duetCase) {
      await expect(voiceInspiration).toBeVisible();
      await expect(voiceInspiration).toHaveText(voiceNote!);
      if (process.env.TG2_VISUAL_CAPTURE === "1") {
        await page.screenshot({ path: `/tmp/the-grind-2-hero-value-duet-source-${viewport.width}.png` });
      }
    }
    expect(await dialog.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const reading = element.querySelector<HTMLElement>(".narrative-intermission-reading")!;
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
        && document.documentElement.scrollWidth <= innerWidth + 1 && reading.scrollWidth <= reading.clientWidth + 1
        && [...element.querySelectorAll("button")].every((button) => {
          const rect = button.getBoundingClientRect();
          return rect.height >= 44 && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
        });
    })).toBe(true);
    if (duetCase) {
      expect(await dialog.evaluate((element) => {
        const thoughts = [...element.querySelectorAll<HTMLElement>(".narrative-intermission-voice-thought")];
        return getComputedStyle(element).animationName === "none"
          && thoughts.every((thought) => getComputedStyle(thought).color === "rgb(101, 29, 36)")
          && [...element.querySelectorAll<HTMLElement>(".narrative-intermission-word")]
            .every((word) => word.dataset.visible === "true" && getComputedStyle(word).opacity === "1");
      })).toBe(true);
    }
    await source.locator("summary").evaluate((summary: HTMLElement) => summary.click());
  }
  expect(await workerCounts(page)).toEqual(beforeReplay);
  expect(beforeReplay).toEqual({ workers: 1, loads: 1, writes: victoryWasFirst ? 1 : 2, terminations: 0 });
  expect(await page.evaluate(() => {
    const state = (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke;
    return { moments: state.moments, directions: state.directions };
  })).toEqual(decisionsBeforeReplay);
  await clickControl(page, "#narrative-intermission-hold");
  await expect(dialog).toBeHidden();
  await expect(page.locator("#narrative-intermission-source-records")).toBeEmpty();
  await expect(voiceInspiration).toBeEmpty();
  if (duetCase) await expect(voices).toHaveCount(0);
  await expect(page.locator("#narrative-intermission-caption")).toHaveText("An earlier moment");
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  expect(modelRequests).toEqual([]);
  expect(errors).toEqual([]);
  await test.info().attach(duetCase ? "first-victory-duet-proof" : "first-victory-proof", {
    body: JSON.stringify({ duetCase, victoryWasFirst, workers: beforeReplay, decisions: decisionsBeforeReplay,
      committed, voiceValue, voiceNote, caption: `First victory together · ${packet.battle.location}`,
      tone: packet.condition === "healthy" ? "trust" : "care", prose, modelRequests, errors }, null, 2),
    contentType: "application/json",
  });
});
}

for (const focusPriority of [false, true]) {
test(focusPriority
  ? "Shared road prioritizes a captured farewell over a newer solo scene without a moment-choice call"
  : "local DM picks a recorded farewell over a newer current scene and Last story retains the choice", async ({ page }) => {
  test.setTimeout(240_000);
  const { before, remembrance } = savedFarewellScene();
  const modelRequests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (/huggingface|SmolLM|ort-wasm/iu.test(request.url())) modelRequests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  expect([before.tick, remembrance.farewell.tick]).toEqual([18, 19]);
  await openSavedGame(page, before);
  if (focusPriority) {
    await clickControl(page, "#narrator-button");
    await page.getByRole("combobox", { name: "Story focus", exact: true }).selectOption("shared-road");
    await expect(page.locator("#creative-story-focus-availability")).toHaveText(
      "Shared road prioritizes companion milestones. First victories can pair imagined voices; character stats stay unchanged.");
    await clickControl(page, "#narrator-close");
    await page.evaluate(() => {
      // This unused model answer would select the current scene if called.
      (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke.momentChoice = "1";
    });
  }
  await page.evaluate(({ minimumTick, output }) => {
    const app = document.querySelector<HTMLElement>("#app")!;
    const state = (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke;
    const observer = new MutationObserver(() => {
      if (Number(app.dataset.simulationTick) < minimumTick || !state.requests[0] || state.requests[0].completed) return;
      observer.disconnect();
      // Resolve only fake inference after the REAL application commits a newer
      // scene. T19 versus T19 would not prove a meaningful two-candidate choice.
      state.complete(output, 0);
    });
    observer.observe(app, { attributes: true, attributeFilter: ["data-simulation-tick"] });
  }, { minimumTick: remembrance.farewell.tick + 1, output: shortPassage });
  await activate(page);
  await expect(page.locator("#narrative-intermission")).toBeVisible({ timeout: 60_000 });
  await expectIntermission(page, shortPassage, true);
  expect(await tick(page)).toBeGreaterThan(remembrance.farewell.tick);
  expect(await page.evaluate(({ campaignId, eventId }) => {
    const saved = JSON.parse(sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`)!) as WorldState;
    return saved.chronicle.some((entry) => entry.id === eventId);
  }, remembrance)).toBe(true);
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>("#pause-button")!.click();
    document.querySelector<HTMLButtonElement>("#narrative-intermission-skip")!.click();
  });
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  if (focusPriority) {
    await expect(page.locator("#creative-story-focus")).toHaveValue("shared-road");
    await expect(page.locator("#creative-story-focus-relationship")).toHaveJSProperty("disabled", true);
    await expect(page.locator("#creative-story-focus-availability")).toHaveText(
      "Shared road is remembered. Solo scenes use Inner life; captured companion moments can still take priority.");
  }
  const farewellProse = `${remembrance.heroName} watched ${remembrance.companionName} leave alive but wounded, grateful for their company and uncertain how far concern could follow.`;
  await page.evaluate(({ output, focusPriority }) => {
    const state = (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke;
    // Existing cadence-only fixture: shift while actually paused, then use the
    // real Resume control to reset the runtime watchdog's advance anchor.
    state.wallClockOffsetMs += 100_000;
    state.momentChoice = focusPriority ? "1" : "2";
    state.directionChoice = "2";
    state.autoReplies[1] = output;
  }, { output: farewellProse, focusPriority });
  await clickControl(page, "#pause-button");
  await expect.poll(async () => (await workerCounts(page)).writes, { timeout: 30_000 }).toBe(2);
  await expect(page.locator("#narrative-intermission")).toBeVisible({ timeout: 60_000 });
  await expectIntermission(page, farewellProse, true);
  const selection = await page.evaluate((preferenceKey) => {
    const state = (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke;
    return { moments: state.moments, directions: state.directions, current: state.momentCurrentScenes[0],
      currentAtWrite: state.writeCurrentScenes[1], unusedMomentChoice: state.momentChoice,
      storedFocus: JSON.parse(localStorage.getItem(preferenceKey) ?? "null")?.focus,
      choicePrompt: state.momentPrompts[0]?.map(({ content }) => content).join("\n"),
      prosePrompt: state.prompts[1]?.map(({ content }) => content).join("\n") };
  }, storytellingPreferenceKey);
  expect(selection.moments).toBe(focusPriority ? 0 : 1);
  expect(selection.directions).toBe(2);
  const current = focusPriority ? { tick: selection.currentAtWrite!.tick, headline: selection.currentAtWrite!.scene.headline }
    : selection.current!;
  expect(current.tick).toBeGreaterThan(remembrance.farewell.tick);
  expect(current.headline).not.toBe(remembrance.farewell.headline);
  if (focusPriority) {
    const snapshot = selection.currentAtWrite!;
    const currentJob = projectStoryBeatJobV1(remembrance.campaignId, snapshot.scene, snapshot.entry, snapshot.entry?.id);
    expect(currentJob).not.toBeNull();
    expect(currentJob!.tick).toBeGreaterThan(remembrance.farewell.tick);
    expect(currentJob!.eventId).not.toBe(remembrance.eventId);
    expect(snapshot.activeCompanions).toBe(0);
    expect(selection.storedFocus).toBe("shared-road");
    expect(selection.unusedMomentChoice).toBe("1");
    expect(selection.choicePrompt).toBeUndefined();
  } else {
    expect(selection.choicePrompt).toContain("1 Current public scene");
    expect(selection.choicePrompt).toContain("2 Recorded companion farewell");
    expect(selection.choicePrompt).toContain(remembrance.farewell.headline.slice(0, 30));
  }
  expect(selection.prosePrompt).toContain(remembrance.farewell.headline);
  expect(selection.prosePrompt).not.toContain(current.headline);
  expect(selection.prosePrompt).not.toContain(remembrance.oath.headline);
  const dialog = page.locator("#narrative-intermission");
  const source = page.locator("#narrative-intermission-source");
  const explanation = page.locator("#narrative-intermission-moment-selection");
  const expectedExplanation = focusPriority ? "Shared road focus prioritized this companion moment."
    : "Local DM chose this recorded farewell.";
  const expectedCaption = `A farewell revisited · ${remembrance.farewell.location}`;
  await expect(page.locator("#narrative-intermission-caption")).toHaveText(expectedCaption);
  await expect(dialog).toHaveAttribute("data-story-stage", "orrery");
  await expect(source).toHaveJSProperty("open", false);
  await expect(explanation).toBeHidden();
  await source.locator("summary").evaluate((summary: HTMLElement) => summary.click());
  await expect(explanation).toHaveText(expectedExplanation);
  await expect(explanation).toBeVisible();
  await expect(source.locator(".narrative-intermission-record")).toHaveCount(1);
  await expect(source.locator(".narrative-intermission-record-headline")).toHaveText(remembrance.farewell.headline);
  await expect(source).not.toContainText("Earlier oath");

  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>("#pause-button")!.click();
    document.querySelector<HTMLButtonElement>("#narrative-intermission-skip")!.click();
  });
  await expect(dialog).toBeHidden();
  await expect(explanation).toBeEmpty();
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  const menu = await page.locator("#stage-menu-button").isVisible() ? "#stage-menu-button" : "#game-menu-button";
  await clickControl(page, menu);
  await clickControl(page, "#last-story-button");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#narrative-intermission-caption")).toHaveText(expectedCaption);
  await expect(page.locator("#narrative-intermission-prose")).toHaveText(farewellProse);
  await expect(page.locator("#narrative-intermission-attribution")).toHaveText("Local storyteller · imagined interpretation");
  await expect(page.locator("#narrative-intermission-direction")).toHaveText("Local DM staging · Impossible Orrery");
  await expect(page.locator("#narrative-intermission-hold")).toHaveText("Continue");
  await expect(source).toHaveJSProperty("open", false);
  for (const viewport of [{ width: 960, height: 640 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    await page.locator("#narrative-intermission-reading").evaluate((reading) => { reading.scrollTop = 0; });
    if (process.env.TG2_VISUAL_CAPTURE === "1") {
      await page.screenshot({ path: `/tmp/the-grind-2-${focusPriority ? "shared-road-priority" : "dm-farewell-choice"}-${viewport.width}.png` });
    }
    await source.locator("summary").evaluate((summary: HTMLElement) => summary.click());
    await expect(explanation).toHaveText(expectedExplanation);
    await source.locator(".narrative-intermission-record-headline").scrollIntoViewIfNeeded();
    if (focusPriority && process.env.TG2_VISUAL_CAPTURE === "1") {
      await page.screenshot({ path: `/tmp/the-grind-2-shared-road-priority-source-${viewport.width}.png` });
    }
    expect(await dialog.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const reading = element.querySelector<HTMLElement>(".narrative-intermission-reading")!;
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
        && document.documentElement.scrollWidth <= innerWidth + 1 && reading.scrollWidth <= reading.clientWidth + 1
        && [...element.querySelectorAll("button")].every((button) => {
          const rect = button.getBoundingClientRect();
          return rect.height >= 44 && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
        });
    })).toBe(true);
    await source.locator("summary").evaluate((summary: HTMLElement) => summary.click());
  }
  expect(await workerCounts(page)).toEqual({ workers: 1, loads: 1, writes: 2, terminations: 0 });
  expect(await page.evaluate(() => {
    const state = (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke;
    return { moments: state.moments, directions: state.directions };
  })).toEqual({ moments: focusPriority ? 0 : 1, directions: 2 });
  await clickControl(page, "#narrative-intermission-hold");
  await expect(dialog).toBeHidden();
  await expect(explanation).toBeEmpty();
  await expect(page.locator("#narrative-intermission-caption")).toHaveText("An earlier moment");
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  expect(modelRequests).toEqual([]);
  expect(errors).toEqual([]);
  if (focusPriority) await test.info().attach("shared-road-priority-proof", {
    body: JSON.stringify({ current, currentAtWrite: selection.currentAtWrite, milestone: remembrance.farewell,
      storedFocus: selection.storedFocus, unusedMomentChoice: selection.unusedMomentChoice,
      moments: selection.moments, directions: selection.directions, workers: await workerCounts(page),
      caption: expectedCaption, explanation: expectedExplanation, modelRequests, errors }, null, 2),
    contentType: "application/json",
  });
});
}

test("authored farewell remembrance uses a recorded hero value and Last story preserves both public records", async ({ page }) => {
  test.setTimeout(240_000);
  const { before, remembrance } = savedFarewellScene();
  const modelRequests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (/huggingface|SmolLM|ort-wasm/iu.test(request.url())) modelRequests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  expect([before.tick, remembrance.oath.tick, remembrance.farewell.tick]).toEqual([18, 1, 19]);
  await page.setViewportSize({ width: 960, height: 640 });
  await openSavedGame(page, before);
  await clickControl(page, "#narrator-button");
  await page.getByRole("combobox", { name: "Story focus", exact: true }).selectOption("shared-road");
  await clickControl(page, "#narrator-close");
  await page.evaluate(({ campaignId, eventId, minimumTick, output }) => {
    const app = document.querySelector<HTMLElement>("#app")!;
    const state = (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke;
    const observer = new MutationObserver(() => {
      const world = JSON.parse(sessionStorage.getItem(`the-grind-2:campaign:${campaignId}`)!) as WorldState;
      const entry = world.chronicle.find((record) => record.id === eventId);
      if (entry && !("__farewellVoiceTransition" in window)) {
        Object.assign(window, { __farewellVoiceTransition: {
          tick: entry.tick, eventId: entry.id, headline: entry.headline,
          heroName: world.hero.name, heroValues: [...world.hero.values], activeCompanions: world.depth.companions.active.length,
        } });
      }
      if (world.tick < minimumTick || !state.requests[0] || state.requests[0].completed) return;
      observer.disconnect();
      // Finish only mock inference after the real farewell AND a newer solo scene.
      state.complete(output, 0);
    });
    observer.observe(app, { attributes: true, attributeFilter: ["data-simulation-tick"] });
  }, { campaignId: remembrance.campaignId, eventId: remembrance.eventId,
    minimumTick: remembrance.tick + 1, output: shortPassage });
  await activate(page);
  // The ordinary T18 request is already in flight: the milestone must wait for
  // that passage and the normal cadence, not interrupt it or grow a story queue.
  await expect(page.locator("#narrative-intermission")).toBeVisible({ timeout: 60_000 });
  await expectIntermission(page, shortPassage, true, "model");
  expect(await tick(page)).toBeGreaterThan(remembrance.tick);
  await expect(page.locator("#narrative-intermission-source-label")).toHaveText("Recorded moment");
  await page.evaluate(() => {
    // Actual public controls, in one task: no simulation interval may run between
    // closing this held passage and applying the user's Pause preference.
    document.querySelector<HTMLButtonElement>("#pause-button")!.click();
    document.querySelector<HTMLButtonElement>("#narrative-intermission-skip")!.click();
  });
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  await expect(page.locator("#creative-story-focus")).toHaveValue("shared-road");
  await expect(page.locator("#creative-story-focus-relationship")).toHaveJSProperty("disabled", true);
  await expect(page.locator("#creative-story-focus-availability")).toHaveText(
    "Shared road is remembered. Solo scenes use Inner life; captured companion moments can still take priority.");
  await page.evaluate(() => {
    const state = (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke;
    state.wallClockOffsetMs += 100_000;
    state.momentChoice = "1"; // Unused: captured Shared road must keep its companion milestone.
    // Complete only the second mock inference promptly, without a browser-tool
    // round trip allowing the fast simulation to enter its next unrelated duel.
    state.autoReplies[1] = "<p>Rejected farewell draft.</p>";
  });
  // Resume resets the real runtime watchdog's last-advance anchor after the
  // artificial clock change. Combat and safe-boundary rules remain in force.
  await clickControl(page, "#pause-button");
  await expect.poll(async () => (await workerCounts(page)).writes, { timeout: 30_000 }).toBe(2);
  const prompt = await page.evaluate(() =>
    (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke.prompts[1]!
      .map(({ content }) => content).join("\n"));
  expect(prompt).toContain(remembrance.farewell.headline);
  expect(prompt).not.toContain(remembrance.oath.headline);
  // Only the completed rejected draft is mocked. The fallback text, selection,
  // capture, two public records, and display are the real production implementation.
  await expect(page.locator("#narrative-intermission")).toBeVisible({ timeout: 60_000 });
  await expectIntermission(page, null, true, "authored");
  const dialog = page.locator("#narrative-intermission");
  const prose = page.locator("#narrative-intermission-prose");
  const source = page.locator("#narrative-intermission-source");
  const records = page.locator("#narrative-intermission-source-records .narrative-intermission-record");
  const voiceInspiration = page.locator("#narrative-intermission-voice-inspiration");
  const passage = await prose.innerText();
  const note = await voiceInspiration.textContent();
  const match = /^Hero voice inspired by recorded (curiosity|loyalty|mercy|courage)\.$/u.exec(note ?? "");
  expect(match).not.toBeNull();
  const voiceValue = match![1] as HeroValue;
  expect(before.hero.values).toContain(voiceValue);
  const openings = [
    `${remembrance.heroName} remembered the oath with ${remembrance.companionName} at ${remembrance.oath.location}, and how different those words felt beside this wounded farewell.`,
    `The oath at ${remembrance.oath.location} returned to ${remembrance.heroName} as ${remembrance.companionName} left, wounded but alive.`,
    `${remembrance.heroName} thought of the road promised with ${remembrance.companionName} at ${remembrance.oath.location}, now set beside a farewell neither relief nor worry could simplify.`,
  ];
  expect(openings.flatMap((opening) => farewellValueReflections[voiceValue](remembrance.heroName, remembrance.companionName)
    .map((reflection) => `${opening} ${reflection}`))).toContain(passage);
  const committed = await page.evaluate(() => (window as unknown as {
    __farewellVoiceTransition: { tick: number; eventId: string; headline: string; heroName: string; heroValues: HeroValue[]; activeCompanions: number };
  }).__farewellVoiceTransition);
  expect(committed).toEqual({ tick: remembrance.tick, eventId: remembrance.eventId, headline: remembrance.farewell.headline,
    heroName: remembrance.heroName, heroValues: before.hero.values, activeCompanions: 0 });
  expect(committed.heroValues).toContain(voiceValue);
  await expect(dialog.locator(".narrative-intermission-voice")).toHaveCount(0);
  await expect(prose).toContainText(remembrance.heroName);
  await expect(prose).toContainText(remembrance.companionName);
  await expect(prose).toContainText(remembrance.oath.location);
  await expect(prose).not.toContainText("Rejected farewell draft");
  await expect(dialog).toHaveAttribute("data-inspiration-tone", "care");
  const caption = `A farewell revisited · ${remembrance.farewell.location}`;
  await expect(page.locator("#narrative-intermission-caption")).toHaveText(caption);
  await expect(source).toHaveJSProperty("open", false);
  await expect(voiceInspiration).toBeHidden();
  await expect(source.locator("summary")).toHaveText("Recorded moments");
  await expect(records).toHaveCount(2);
  for (const [index, record] of [remembrance.farewell, remembrance.oath].entries()) {
    await expect(records.nth(index).locator(".narrative-intermission-record-label"))
      .toHaveText(`${index === 0 ? "Farewell" : "Earlier oath"} · T${record.tick}`);
    await expect(records.nth(index).locator(".narrative-intermission-record-location")).toHaveText(record.location);
    await expect(records.nth(index).locator(".narrative-intermission-record-headline")).toHaveText(record.headline);
  }
  const beforeReplay = await workerCounts(page);
  const decisions = await page.evaluate((preferenceKey) => {
    const state = (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke;
    return { moments: state.moments, directions: state.directions, current: state.writeCurrentScenes[1],
      focus: JSON.parse(localStorage.getItem(preferenceKey)!).focus };
  }, storytellingPreferenceKey);
  expect(beforeReplay).toEqual({ workers: 1, loads: 1, writes: 2, terminations: 0 });
  expect(decisions).toMatchObject({ moments: 0, directions: 2, focus: "shared-road", current: { activeCompanions: 0 } });
  expect(decisions.current!.tick).toBeGreaterThan(remembrance.tick);
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>("#pause-button")!.click();
    document.querySelector<HTMLButtonElement>("#narrative-intermission-skip")!.click();
  });
  await expect(voiceInspiration).toBeEmpty();
  await expect(records).toHaveCount(0);
  const menu = await page.locator("#stage-menu-button").isVisible() ? "#stage-menu-button" : "#game-menu-button";
  await clickControl(page, menu);
  await clickControl(page, "#last-story-button");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#narrative-intermission-hold")).toHaveText("Continue");
  await expect(prose).toHaveText(passage);
  await expect(page.locator("#narrative-intermission-caption")).toHaveText(caption);
  await expect(page.locator("#narrative-intermission-attribution")).toHaveText("Authored interlude · imagined interpretation");
  await expect(voiceInspiration).toHaveText(note!);
  await expect(records).toHaveCount(2);
  await expect(source).toHaveJSProperty("open", false);
  for (const viewport of [{ width: 960, height: 640 }, { width: 320, height: 568 }]) {
    await page.emulateMedia({ reducedMotion: viewport.width === 320 ? "reduce" : "no-preference" });
    await page.setViewportSize(viewport);
    await source.evaluate((details: HTMLDetailsElement) => { details.open = false; });
    await page.locator("#narrative-intermission-reading").evaluate((element) => { element.scrollTop = 0; });
    if (process.env.TG2_VISUAL_CAPTURE === "1") {
      await page.screenshot({ path: `/tmp/the-grind-2-farewell-value-${viewport.width}.png` });
    }
    await source.locator("summary").evaluate((summary: HTMLElement) => summary.click());
    await expect(source).toHaveJSProperty("open", true);
    await expect(voiceInspiration).toBeVisible();
    await expect(voiceInspiration).toHaveText(note!);
    await records.last().scrollIntoViewIfNeeded();
    expect(await dialog.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const reading = element.querySelector<HTMLElement>(".narrative-intermission-reading")!;
      const prose = element.querySelector<HTMLElement>(".narrative-intermission-prose")!;
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
        && document.documentElement.scrollWidth <= innerWidth + 1
        && reading.scrollWidth <= reading.clientWidth + 1
        && getComputedStyle(prose).color === "rgb(101, 29, 36)"
        && getComputedStyle(element).animationName === "none"
        && [...element.querySelectorAll("button")].every((button) => {
          const bounds = button.getBoundingClientRect();
          return bounds.height >= 44 && bounds.left >= 0 && bounds.right <= innerWidth
            && bounds.top >= 0 && bounds.bottom <= innerHeight;
        });
    })).toBe(true);
    if (process.env.TG2_VISUAL_CAPTURE === "1") {
      await page.screenshot({ path: `/tmp/the-grind-2-farewell-value-source-${viewport.width}.png` });
    }
  }
  await clickControl(page, "#narrative-intermission-skip");
  await expect(source).toBeHidden();
  await expect(source).toHaveJSProperty("open", false);
  await expect(source.locator("summary")).toHaveText("Recorded moment");
  await expect(records).toHaveCount(0);
  await expect(voiceInspiration).toBeEmpty();
  await expect(dialog).toHaveAttribute("data-story-origin", "model");
  await expect(page.locator("#narrative-intermission-attribution"))
    .toHaveText("Local storyteller · imagined interpretation");
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  expect(await workerCounts(page)).toEqual(beforeReplay);
  expect(await page.evaluate(() => {
    const state = (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke;
    return { moments: state.moments, directions: state.directions };
  })).toEqual({ moments: decisions.moments, directions: decisions.directions });
  expect(modelRequests).toEqual([]);
  expect(errors).toEqual([]);
  await test.info().attach("farewell-hero-value-proof", {
    body: JSON.stringify({ committed, voiceValue, note, passage, caption, tone: "care", oath: remembrance.oath,
      farewell: remembrance.farewell, workers: beforeReplay, decisions, modelRequests, errors }, null, 2),
    contentType: "application/json",
  });
});

test("authored recovery opt-out persists while off and leaves rejected completed drafts quiet", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openGame(page);
  await clickControl(page, "#narrator-button");
  const recovery = page.getByRole("combobox", { name: "If a draft fails", exact: true });
  await recovery.selectOption("quiet");
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storytellingPreferenceKey))
    .toEqual({ schemaVersion: 1, focus: "inner-life", rhythm: "balanced", draftRecovery: "quiet" });
  expect(await workerCounts(page)).toEqual({ workers: 0, loads: 0, writes: 0, terminations: 0 });
  await page.reload();
  await settleGameBoot(page, "travel");
  await clickControl(page, "#narrator-button");
  await expect(recovery).toHaveValue("quiet");
  await expect(page.locator("#app")).toHaveAttribute("data-creative-story-state", "off");
  await expect(page.locator("#creative-story-draft-recovery-note")).toContainText("Inner life and Shared road only");
  await recovery.scrollIntoViewIfNeeded();
  expect(await recovery.evaluate((select) => {
    const box = select.getBoundingClientRect();
    return box.height >= 44 && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
      && document.documentElement.scrollWidth <= innerWidth + 1;
  })).toBe(true);
  expect(await workerCounts(page)).toEqual({ workers: 0, loads: 0, writes: 0, terminations: 0 });
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: "/tmp/the-grind-2-authored-interlude-optout-320.png", fullPage: true });
  }
  await clickControl(page, "#narrator-close");
  await activate(page);
  await expect(page.locator("#creative-story-draft-recovery")).toBeDisabled();
  await finishWrite(page, "<p>Rejected draft.</p>");
  await expect(page.locator("#app")).toHaveAttribute("data-creative-story-state", "ready");
  await expectNextTick(page);
  await expect(page.locator("#narrative-intermission")).toBeHidden();
  await expect(page.locator("#narrative-intermission")).toHaveAttribute("data-story-origin", "model");
  const previous = await tick(page);
  await page.evaluate(() => {
    (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke.wallClockOffsetMs += 30_000;
  });
  await expectNextTick(page, previous);
  await expect(page.locator("#narrative-intermission")).toBeHidden();
  expect(await workerCounts(page)).toMatchObject({ workers: 1, writes: 1, terminations: 0 });
});

for (const fixture of [
  { condition: "healthy", tone: "trust", width: 1280, height: 800 },
  { condition: "injured", tone: "care", width: 320, height: 568 },
] as const) {
  test(`emotion-fit ${fixture.condition} companion selects ${fixture.tone} inspiration and parchment at ${fixture.width}px`, async ({ page }) => {
    await page.setViewportSize({ width: fixture.width, height: fixture.height });
    await openGame(page, "travel", true, fixture.condition);
    await clickControl(page, "#narrator-button");
    await page.getByRole("combobox", { name: "Story focus", exact: true }).selectOption("shared-road");
    await clickControl(page, "#narrator-close");
    await activate(page);
    const prompt = await page.evaluate(() => {
      const state = (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke;
      return state.prompts[0]?.find(({ role }) => role === "user")?.content ?? "";
    });
    const selectedImage = prompt.match(/\nImage: ([^\n]+)/u)?.[1];
    expect(selectedImage).toBeDefined();
    const selectedSeed = seedLibrary.seeds.find((seed) =>
      seed.image.replace(/^[^.!?]+?\s+as\s+/u, "") === selectedImage,
    );
    expect(selectedSeed).toBeDefined();
    expect(selectedSeed?.relationshipFit).toBe(fixture.tone);
    expect(selectedSeed?.requires ?? []).toEqual([]);
    expect(prompt).toContain(fixture.condition === "injured" ? "injured while travelling" : "travelling together");

    // Existing authored text exercises display plumbing, not generated emotion or factual quality.
    await finishWrite(page, longPassage);
    await expectIntermission(page, longPassage, true);
    const dialog = page.locator("#narrative-intermission");
    await expect(dialog).toHaveAttribute("data-inspiration-tone", fixture.tone);
    const layout = await dialog.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const reading = element.querySelector<HTMLElement>("#narrative-intermission-reading")!;
      const prose = element.querySelector<HTMLElement>("#narrative-intermission-prose")!;
      const style = getComputedStyle(prose);
      return {
        fits: bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight,
        pageFits: document.documentElement.scrollWidth <= innerWidth + 1,
        readingFits: reading.scrollWidth <= reading.clientWidth + 1,
        scrolls: reading.scrollHeight > reading.clientHeight,
        proseColor: style.color,
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
        buttonsFit: [...element.querySelectorAll<HTMLButtonElement>("button")].every((button) => {
          const box = button.getBoundingClientRect();
          return box.height >= 44 && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
        }),
        wordsVisible: [...prose.querySelectorAll(".narrative-intermission-word")]
          .every((word) => getComputedStyle(word).opacity === "1"),
      };
    });
    expect(layout).toMatchObject({
      fits: true, pageFits: true, readingFits: true, buttonsFit: true,
      wordsVisible: true, proseColor: "rgb(101, 29, 36)",
    });
    expect(layout.fontSize).toBeGreaterThanOrEqual(19);
    expect(layout.lineHeight).toBeGreaterThanOrEqual(layout.fontSize * 1.4);
    if (fixture.width === 320) expect(layout.scrolls).toBe(true);
    if (process.env.TG2_VISUAL_CAPTURE === "1") {
      await page.screenshot({ path: `/tmp/the-grind-2-emotion-fit-${fixture.tone}-${fixture.width}.png`, fullPage: true });
    }
    await clickControl(page, "#narrative-intermission-skip");
    await expect(dialog).toBeHidden();
    await expect(dialog).toHaveAttribute("data-inspiration-tone", "neutral");
    expect(await workerCounts(page)).toMatchObject({ workers: 1, writes: 1, terminations: 0 });
  });
}

test("a completed passage waits behind settings and Skip resumes without another writing click", async ({ page }) => {
  await openGame(page);
  await activate(page);
  await clickControl(page, "#narrator-button");
  const previous = await tick(page);
  await finishWrite(page);
  await expect(page.locator("#app")).toHaveAttribute("data-creative-story-state", "ready");
  await expectNextTick(page, previous);
  await expect(page.locator("#narrator-dialog")).toBeVisible();
  await expect(page.locator("#narrative-intermission")).toBeHidden();
  await clickControl(page, "#narrator-close");
  await expectIntermission(page);
  const readingTick = await tick(page);
  await clickControl(page, "#narrative-intermission-skip");
  await expect(page.locator("#narrative-intermission")).toBeHidden();
  await expectNextTick(page, readingTick);
  expect(await workerCounts(page)).toMatchObject({ writes: 1, terminations: 0 });
});

test("a later automatic story reuses the loaded writer after the reading cadence", async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page);
  await activate(page);
  await finishWrite(page);
  await expectIntermission(page);
  await clickControl(page, "#narrative-intermission-skip");
  const firstTick = await tick(page);
  await expectNextTick(page, firstTick);
  expect(await workerCounts(page)).toMatchObject({ workers: 1, loads: 1, writes: 1 });
  // Advance only the wall-clock cadence; timers and real simulation keep running normally.
  await page.evaluate(() => {
    (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke.wallClockOffsetMs += 91_000;
  });
  await expectNextTick(page);
  await expect.poll(async () => (await workerCounts(page)).writes, { timeout: 20_000 }).toBe(2);
  const second = "Dust settled into the empty footprints, keeping its own account of the passing company.";
  await finishWrite(page, second, 1);
  await expectIntermission(page, second);
  expect(await workerCounts(page)).toEqual({ workers: 1, loads: 1, writes: 2, terminations: 0 });
  await clickControl(page, "#narrative-intermission-skip");
  await expect(page.locator("#narrative-intermission")).toBeHidden();
});

test("local DM choice stages the Orrery and Last story keeps it without another direction call", async ({ page }) => {
  test.setTimeout(180_000);
  await openGame(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => {
    (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke.directionChoice = "2";
    const dialog = document.querySelector<HTMLDialogElement>("#narrative-intermission")!;
    const observer = new MutationObserver(() => {
      if (!dialog.open) return;
      observer.disconnect();
      Object.assign(window, { __dmStageEntrance: {
        stage: dialog.dataset.storyStage,
        animations: [...dialog.querySelectorAll(".narrative-intermission-tableau > span")]
          .map((span) => ({ name: getComputedStyle(span).animationName,
            iterations: getComputedStyle(span).animationIterationCount })),
      } });
    });
    observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
  });
  await activate(page);
  await finishWrite(page);
  await expectIntermission(page, shortPassage, true);
  const dialog = page.locator("#narrative-intermission");
  await expect(dialog).toHaveAttribute("data-story-stage", "orrery");
  await expect(dialog).toHaveAttribute("data-direction-origin", "model");
  await expect(page.locator("#narrative-intermission-direction"))
    .toHaveText("Local DM staging · Impossible Orrery");
  await expect(page.locator("#narrative-intermission-tableau")).toHaveAttribute("aria-hidden", "true");
  expect(await page.evaluate(() =>
    (window as unknown as { __dmStageEntrance: unknown }).__dmStageEntrance))
    .toEqual({ stage: "orrery", animations: Array.from({ length: 3 }, () => ({ name: "narrative-orbit-assemble", iterations: "1" })) });
  const directionCalls = await page.evaluate(() => {
    const state = (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke;
    return { count: state.directions, prompt: state.directionPrompts[0]?.map(({ content }) => content).join("\n") };
  });
  expect(directionCalls.count).toBe(1);
  expect(directionCalls.prompt).toContain("Impossible Orrery");

  // Hold owns the simulation pause; add the user's independent Pause preference
  // before closing so the replay checks cannot race into an unrelated encounter.
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>("#pause-button")!.click();
    document.querySelector<HTMLButtonElement>("#narrative-intermission-skip")!.click();
  });
  await expect(dialog).toBeHidden();
  await expect(dialog).toHaveAttribute("data-story-stage", "parchment");
  await expect(dialog).toHaveAttribute("data-direction-origin", "default");
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  const pausedTick = await tick(page);
  const menu = await page.locator("#stage-menu-button").isVisible() ? "#stage-menu-button" : "#game-menu-button";
  await clickControl(page, menu);
  await clickControl(page, "#last-story-button");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-story-stage", "orrery");
  await expect(dialog).toHaveAttribute("data-stage-still", "true");
  await expect(page.locator("#narrative-intermission-hold")).toHaveText("Continue");
  await expect(page.locator("#narrative-intermission-prose")).toHaveText(shortPassage);
  await expect(page.locator("#narrative-intermission-source")).not.toHaveAttribute("open", "");
  expect(await workerCounts(page)).toEqual({ workers: 1, loads: 1, writes: 1, terminations: 0 });
  expect(await page.evaluate(() =>
    (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke.directions)).toBe(1);

  for (const stage of ["orrery", "moth-court"] as const) {
    if (stage === "moth-court") {
      // CSS/component fixture ONLY: the real controller-selected stage above was
      // Orrery. Reuse its three decorative spans to inspect the second layout;
      // this mutation is not evidence that a model chose Moth Court.
      await dialog.evaluate((element) => {
        (element as HTMLElement).dataset.storyStage = "moth-court";
        element.querySelector("#narrative-intermission-direction")!.textContent = "Local DM staging · Moth Court";
      });
      await page.emulateMedia({ reducedMotion: "reduce" });
    }
    for (const viewport of [{ width: 960, height: 640 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      const layout = await dialog.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const reading = element.querySelector<HTMLElement>(".narrative-intermission-reading")!;
        const tableau = element.querySelector<HTMLElement>(".narrative-intermission-tableau")!;
        const picture = tableau.getBoundingClientRect();
        const content = reading.getBoundingClientRect();
        return {
          fits: bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight,
          pageFits: document.documentElement.scrollWidth <= innerWidth + 1,
          textFits: reading.scrollWidth <= reading.clientWidth + 1,
          pictureFits: picture.height <= (innerWidth <= 420 ? 48 : 96) && picture.bottom <= content.top,
          controlsFit: [...element.querySelectorAll("button")].every((button) => {
            const box = button.getBoundingClientRect();
            return box.height >= 44 && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
          }),
          still: [...tableau.children].every((span) => getComputedStyle(span).animationName === "none"),
          proseColor: getComputedStyle(element.querySelector(".narrative-intermission-prose")!).color,
        };
      });
      expect(layout).toEqual({ fits: true, pageFits: true, textFits: true, pictureFits: true,
        controlsFit: true, still: true, proseColor: "rgb(101, 29, 36)" });
      if (process.env.TG2_VISUAL_CAPTURE === "1") {
        await page.screenshot({ path: `/tmp/the-grind-2-dm-${stage}-${viewport.width}.png` });
      }
    }
  }
  await clickControl(page, "#narrative-intermission-hold");
  await expect(dialog).toBeHidden();
  await expect(dialog).toHaveAttribute("data-story-stage", "parchment");
  await expect(page.locator("#narrative-intermission-tableau")).toBeHidden();
  await expect(page.locator("#narrative-intermission-direction")).toBeEmpty();
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  expect(await tick(page)).toBe(pausedTick);
});

test("normal-motion parchment reveals its words and automatically resumes play", async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator("#narrative-intermission").evaluate((dialog) => {
    new MutationObserver(() => {
      if (!(dialog as HTMLDialogElement).open) return;
      const words = [...dialog.querySelectorAll<HTMLElement>(".narrative-intermission-word")];
      const host = window as unknown as { __creativeRevealSnapshot?: { total: number; visible: number; animation: string } };
      host.__creativeRevealSnapshot ??= {
        total: words.length,
        visible: words.filter((word) => word.dataset.visible === "true").length,
        animation: getComputedStyle(dialog).animationName,
      };
    }).observe(dialog, { attributes: true, attributeFilter: ["open"] });
  });
  await activate(page);
  await finishWrite(page);
  await expectIntermission(page);
  const initialReveal = await page.evaluate(() =>
    (window as unknown as { __creativeRevealSnapshot: { total: number; visible: number; animation: string } }).__creativeRevealSnapshot);
  expect(initialReveal.total).toBeGreaterThan(0);
  expect(initialReveal.visible).toBeLessThan(initialReveal.total);
  expect(initialReveal.animation).toBe("narrative-parchment-arrive");
  await expect.poll(() => page.locator("#narrative-intermission-prose").evaluate((prose) =>
    [...prose.querySelectorAll<HTMLElement>(".narrative-intermission-word")].every((word) => word.dataset.visible === "true")),
  { timeout: 8_000 }).toBe(true);
  const readingTick = await tick(page);
  await expect(page.locator("#narrative-intermission")).toBeHidden({ timeout: 18_000 });
  await expectNextTick(page, readingTick);
  await expect(page.locator("#pause-button")).toHaveText("Pause");
  expect(await workerCounts(page)).toMatchObject({ workers: 1, writes: 1 });
});

test("opening Recorded moment near the deadline holds the story until Continue, even after collapsing", async ({ page }) => {
  test.setTimeout(180_000);
  await openGame(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator("#narrative-intermission").evaluate((dialog) => {
    const host = window as unknown as {
      __recordedMomentReading?: { openedAt: number; expandedAt: number; tick: number };
    };
    const observer = new MutationObserver(() => {
      if (!(dialog as HTMLDialogElement).open) return;
      observer.disconnect();
      const reading = {
        openedAt: performance.now(), expandedAt: 0,
        tick: Number(document.querySelector<HTMLElement>("#app")!.dataset.simulationTick),
      };
      host.__recordedMomentReading = reading;
      // This short passage normally closes after 12 seconds. Activate the real
      // disclosure near that deadline, with no fake clock or simulation changes.
      window.setTimeout(() => {
        reading.expandedAt = performance.now();
        dialog.querySelector<HTMLElement>("#narrative-intermission-source-label")!.click();
      }, 10_000);
    });
    observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
  });
  await activate(page);
  await finishWrite(page);
  await expectIntermission(page);
  const dialog = page.locator("#narrative-intermission");
  const source = page.locator("#narrative-intermission-source");
  const hold = page.locator("#narrative-intermission-hold");
  await expect(hold).toHaveText("Continue", { timeout: 15_000 });
  await expect(source).toHaveAttribute("open", "");
  await expect(dialog.locator(".narrative-intermission-reading-status"))
    .toHaveText("Take your time · continue when ready");
  // Pass the original automatic-close deadline while reading the public record.
  await page.waitForTimeout(3_000);
  const reading = await page.evaluate(() => {
    const record = (window as unknown as {
      __recordedMomentReading: { openedAt: number; expandedAt: number; tick: number };
    }).__recordedMomentReading;
    return { ...record, elapsed: performance.now() - record.openedAt };
  });
  expect(reading.expandedAt - reading.openedAt).toBeGreaterThanOrEqual(9_900);
  expect(reading.elapsed).toBeGreaterThan(12_000);
  await expect(dialog).toBeVisible();
  expect(await tick(page)).toBe(reading.tick);
  expect(await dialog.locator(".narrative-intermission-word").evaluateAll((words) =>
    words.every((word) => (word as HTMLElement).dataset.visible === "true"))).toBe(true);

  await source.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(source).not.toHaveAttribute("open", "");
  await expect(hold).toHaveText("Continue");
  await page.keyboard.press("Enter");
  await expect(source).toHaveAttribute("open", "");
  await expect(hold).toHaveText("Continue");
  await page.keyboard.press("Space");
  await expect(source).not.toHaveAttribute("open", "");
  await expect(hold).toHaveText("Continue");
  await page.keyboard.press("Enter");
  await expect(source).toHaveAttribute("open", "");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "true");
  await expect(page.locator("#pause-button")).toHaveText("Pause");
  expect(await workerCounts(page)).toMatchObject({ workers: 1, loads: 1, writes: 1 });
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: "/tmp/the-grind-2-recorded-moment-hold-960.png" });
    await page.setViewportSize({ width: 320, height: 568 });
    await expect(dialog).toBeVisible();
    await expect(hold).toHaveText("Continue");
    await page.screenshot({ path: "/tmp/the-grind-2-recorded-moment-hold-320.png" });
  }
  await clickControl(page, "#narrative-intermission-hold");
  await expect(dialog).toBeHidden();
  await expectNextTick(page, reading.tick);
  await expect(page.locator("#pause-button")).toHaveText("Pause");
});

test("a real battle holds a finished two-sentence story until combat and its presentation have cleared", async ({ page }) => {
  test.setTimeout(120_000);
  const passage = `${shortPassage} Relief was real, but it had not persuaded her worry to leave.`;
  const modelRequests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => { if (/huggingface|SmolLM|ort-wasm/iu.test(request.url())) modelRequests.push(request.url()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 960, height: 640 });
  await openGame(page, "battle");
  await activate(page);
  await expect(page.locator("#stage")).toHaveAttribute("data-scene-mode", "battle");
  // Mock the finished worker result including its conservative lexical lookahead;
  // the separate real-model probe verifies where inference actually stops.
  await finishWrite(page, `${passage} The`);
  await expect(page.locator("#app")).toHaveAttribute("data-creative-story-state", "ready");
  await expect(page.locator("#narrative-intermission")).toBeHidden();
  await expectIntermission(page, passage, true);
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-busy", "false");
  await expect(page.locator("#stage")).not.toHaveAttribute("data-encounter-engine");
  for (const viewport of [{ width: 960, height: 640 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    const fits = await page.locator("#narrative-intermission").evaluate((dialog) => {
      const bounds = dialog.getBoundingClientRect();
      const reading = dialog.querySelector<HTMLElement>("#narrative-intermission-reading")!;
      return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight
        && reading.scrollWidth <= reading.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1
        && [...dialog.querySelectorAll("button")].every((button) => button.getBoundingClientRect().height >= 44);
    });
    expect(fits).toBe(true);
    if (process.env.TG2_VISUAL_CAPTURE === "1") await page.screenshot({ path: `/tmp/the-grind-2-finished-story-${viewport.width}.png` });
  }
  await page.keyboard.press("Escape");
  await expect(page.locator("#narrative-intermission")).toBeHidden();
  await expect(page.locator("#pause-button")).toHaveText("Pause");
  expect(await workerCounts(page)).toMatchObject({ workers: 1, loads: 1, writes: 1 });
  expect(modelRequests).toEqual([]);
  expect(errors).toEqual([]);
});

for (const interruption of ["hidden", "campaign", "off", "view"] as const) {
  test(`${interruption} invalidates a pending passage and ignores its late reply`, async ({ page }) => {
    await openGame(page);
    await activate(page);
    if (interruption === "hidden") {
      await page.evaluate(() => {
        (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke.setHidden(true);
      });
      await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "true");
    } else if (interruption === "campaign") {
      const previousCampaign = await page.evaluate(() => sessionStorage.getItem("the-grind-2:activeCampaignId"));
      await clickControl(page, "#new-button");
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem("the-grind-2:activeCampaignId"))).not.toBe(previousCampaign);
    } else if (interruption === "off") {
      await clickControl(page, "#narrator-button");
      await clickControl(page, "#creative-stop");
      await expect(page.locator("#app")).toHaveAttribute("data-creative-story-state", "off");
      await clickControl(page, "#narrator-close");
    } else {
      await clickControl(page, '.view-button[data-view="journal"]');
    }
    await finishWrite(page, "A vanished promise must never return to this road.", 0);
    if (interruption === "hidden") {
      await page.evaluate(() => {
        (window as unknown as { __creativeStorySmoke: SmokeState }).__creativeStorySmoke.setHidden(false);
      });
    } else if (interruption === "view") {
      await clickControl(page, '.view-button[data-view="watch"]');
    }
    await expectNextTick(page);
    await expect(page.locator("#narrative-intermission")).toBeHidden();
    await expect(page.locator("#narrative-intermission-prose")).not.toContainText("A vanished promise");
    expect((await workerCounts(page)).terminations).toBe(interruption === "off" ? 1 : 0);
  });
}

for (const viewport of [{ width: 320, height: 568 }, { width: 1280, height: 800 }]) {
  test(`automatic parchment is readable and scroll-bounded at ${viewport.width}px with reduced motion`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openGame(page);
    await activate(page);
    await finishWrite(page, longPassage);
    await expectIntermission(page, longPassage, true);
    const layout = await page.locator("#narrative-intermission").evaluate((dialog) => {
      const bounds = dialog.getBoundingClientRect();
      const reading = dialog.querySelector<HTMLElement>("#narrative-intermission-reading")!;
      const prose = dialog.querySelector<HTMLElement>("#narrative-intermission-prose")!;
      const style = getComputedStyle(prose);
      const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("button")];
      return {
        fits: bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight,
        pageFits: document.documentElement.scrollWidth <= innerWidth + 1,
        readingFits: reading.scrollWidth <= reading.clientWidth + 1,
        scrolls: reading.scrollHeight > reading.clientHeight,
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
        buttonsFit: buttons.every((button) => {
          const box = button.getBoundingClientRect();
          return box.height >= 44 && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
        }),
        wordsVisible: [...prose.querySelectorAll(".narrative-intermission-word")]
          .every((word) => getComputedStyle(word).opacity === "1"),
        entryAnimation: getComputedStyle(dialog).animationName,
      };
    });
    expect(layout).toMatchObject({ fits: true, pageFits: true, readingFits: true, buttonsFit: true, wordsVisible: true, entryAnimation: "none" });
    expect(layout.fontSize).toBeGreaterThanOrEqual(19);
    expect(layout.lineHeight).toBeGreaterThanOrEqual(layout.fontSize * 1.4);
    if (viewport.width === 320) expect(layout.scrolls).toBe(true);
    if (process.env.TG2_VISUAL_CAPTURE === "1") {
      await page.screenshot({ path: `/tmp/the-grind-2-narrative-intermission-${viewport.width}-top.png`, fullPage: true });
    }
    await page.locator("#narrative-intermission-reading").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(page.locator("#narrative-intermission-skip")).toBeVisible();
    if (process.env.TG2_VISUAL_CAPTURE === "1") {
      await page.screenshot({ path: `/tmp/the-grind-2-narrative-intermission-${viewport.width}.png`, fullPage: true });
    }
    await clickControl(page, "#narrative-intermission-skip");
    await expect(page.locator("#narrative-intermission")).toBeHidden();
  });
}
