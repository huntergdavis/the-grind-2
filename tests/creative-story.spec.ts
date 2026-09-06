import { expect as baseExpect, test, type Page } from "@playwright/test";
import { advanceWorld, createWorld } from "../src/core/simulation";
import {
  creativeWriterCacheName,
  creativeWriterModelId,
  creativeWriterModelRevision,
} from "../src/narrator/creative-writer-client";
import { projectStoryBeatJobV1 } from "../src/narrator/story-beat";
import { projectParty } from "../src/ui/party-projection";
import { storytellingPreferenceKey } from "../src/ui/storytelling-preferences";

// Software-rendered Chromium can take several seconds to settle a real simulation step.
const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 120_000 });

// Real saved worlds, UI, controller, and client; only model inference is replaced.
// These tests make no claims about model quality or real inference latency.
const shortPassage = "A ribbon caught on the branch trembled like a question the road would not answer.";
const longPassage = "The arch's presence was like a whispered secret that Mara had never heard before, a promise folded into the stone and carried through the patient years by rain, by dust, by the quiet feet of travelers who had passed without looking up, and she wondered whether her own curiosity was courage or merely another way of delaying the road ahead. Her mind was already on the other side, but now she felt a sense of trepidation, as though every weathered mark concealed a familiar voice and every breath of wind invited her to remember a hope she had left unnamed, while the long shadows stretched across the grass and the unanswered silence settled gently between the things she wanted and the things she feared.";

type SmokeState = {
  workers: number;
  loads: number;
  writes: number;
  terminations: number;
  heroName: string;
  companionName: string | null;
  hidden: boolean;
  wallClockOffsetMs: number;
  prompts: { role: string; content: string }[][];
  requests: { id: number; worker: EventTarget; completed: boolean }[];
  complete(text: string, ordinal?: number): void;
  setHidden(value: boolean): void;
};

function savedScene(mode: "travel" | "battle", needsCompanion = false) {
  let world = createWorld("creative-story-browser", "campaign:creative-story-browser");
  for (let count = 0; count < 400; count++) {
    world = advanceWorld(world);
    const entry = world.chronicle.at(-1);
    if (world.scene.mode === mode && world.pendingAttention.length === 0
      && (!needsCompanion || projectParty(world.depth).active !== null)
      && projectStoryBeatJobV1(world.campaignId, world.scene, entry, entry?.id) !== null
      && (mode !== "battle" || advanceWorld(advanceWorld(world)).scene.mode === "battle")) return world;
  }
  throw new Error(`Creative story fixture needs an admitted ${mode} scene`);
}

async function openGame(page: Page, mode: "travel" | "battle" = "travel", needsCompanion = false): Promise<void> {
  // Keep full 320/1280 layout coverage below; lifecycle tests need less software rasterization.
  if (page.viewportSize()?.width === 1440) await page.setViewportSize({ width: 960, height: 640 });
  const world = savedScene(mode, needsCompanion);
  await page.addInitScript(({ saved, companionName }) => {
    sessionStorage.setItem(`the-grind-2:campaign:${saved.campaignId}`, JSON.stringify(saved));
    sessionStorage.setItem("the-grind-2:activeCampaignId", saved.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${saved.campaignId}`, String(Date.now() + 60_000));
    localStorage.setItem("the-grind-2:stage-focus:v1", "panels");
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 8 });
    Object.defineProperty(navigator, "deviceMemory", { value: 8 });
    const state: SmokeState = {
      workers: 0, loads: 0, writes: 0, terminations: 0,
      heroName: saved.hero.name, companionName, hidden: true, wallClockOffsetMs: 0, prompts: [], requests: [],
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
            } else if (message.type === "write") {
              state.writes += 1;
              state.prompts.push(message.messages ?? []);
              state.requests.push({ id: message.id, worker: this, completed: false });
            }
          }
          terminate() { state.terminations += 1; }
        }();
      },
    });
  }, { saved: world, companionName: projectParty(world.depth).active?.name ?? null });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?fast");
  await settleGameBoot(page, mode);
}

async function settleGameBoot(page: Page, mode: "travel" | "battle"): Promise<void> {
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
  await expect(page.locator(selector)).toBeEnabled();
  await page.locator(selector).evaluate((button: HTMLButtonElement) => button.click());
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

async function expectIntermission(page: Page, text = shortPassage, hold = false): Promise<void> {
  await expect(page.locator("#narrative-intermission")).toBeVisible({ timeout: 30_000 });
  if (hold) await clickControl(page, "#narrative-intermission-hold");
  await expect(page.locator("#narrative-intermission-prose")).toHaveText(text);
  await expect(page.locator("#narrative-intermission-accessible-prose")).toHaveText(text);
  await expect(page.locator("#narrative-intermission-caption")).toContainText("An earlier moment");
  await expect(page.locator("#narrative-intermission-attribution")).toHaveText("Local storyteller · imagined interpretation");
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
    .toEqual({ schemaVersion: 1, focus: "scene", rhythm: "rare" });
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
    .toHaveText("Shared road is remembered. Inner life until a companion joins.");
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
        controlsFit: selects.length === 2 && selects.every((select) => {
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
    .toEqual({ schemaVersion: 1, focus: "inner-life", rhythm: "balanced" });
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

test("a real battle holds completed prose until combat and its presentation have cleared", async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page, "battle");
  await activate(page);
  await expect(page.locator("#stage")).toHaveAttribute("data-scene-mode", "battle");
  await finishWrite(page);
  await expect(page.locator("#app")).toHaveAttribute("data-creative-story-state", "ready");
  await expect(page.locator("#narrative-intermission")).toBeHidden();
  await expectIntermission(page);
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-busy", "false");
  await expect(page.locator("#stage")).not.toHaveAttribute("data-encounter-engine");
  await page.keyboard.press("Escape");
  await expect(page.locator("#narrative-intermission")).toBeHidden();
  await expect(page.locator("#pause-button")).toHaveText("Pause");
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
