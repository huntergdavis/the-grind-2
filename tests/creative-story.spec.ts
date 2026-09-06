import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, createWorld } from "../src/core/simulation";
import {
  creativeWriterCacheName,
  creativeWriterModelId,
  creativeWriterModelRevision,
} from "../src/narrator/creative-writer-client";
import { projectStoryBeatJobV1 } from "../src/narrator/story-beat";

// These checks exercise the real UI/controller/client with a test-only worker.
// They deliberately provide no evidence about model quality or inference speed.
async function openIdleGame(page: Page): Promise<void> {
  let world = createWorld("creative-story-browser", "campaign:creative-story-browser");
  for (let count = 0; count < 200; count++) {
    world = advanceWorld(world);
    const entry = world.chronicle.at(-1);
    if (world.scene.mode === "travel" && world.pendingAttention.length === 0
      && projectStoryBeatJobV1(world.campaignId, world.scene, entry, entry?.id) !== null) break;
  }
  if (world.scene.mode !== "travel") throw new Error("Creative story fixture needs an idle travel scene");
  await page.addInitScript((saved) => {
    sessionStorage.setItem(`the-grind-2:campaign:${saved.campaignId}`, JSON.stringify(saved));
    sessionStorage.setItem("the-grind-2:activeCampaignId", saved.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${saved.campaignId}`, String(Date.now() + 60_000));
    localStorage.setItem("the-grind-2:stage-focus:v1", "panels");
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 8 });
    Object.defineProperty(navigator, "deviceMemory", { value: 8 });
    const state = {
      workers: 0, loads: 0, writes: 0, terminations: 0,
      pending: null as null | { id: number; worker: EventTarget },
      complete(text: string) {
        if (this.pending === null) throw new Error("No creative write pending");
        this.pending.worker.dispatchEvent(new MessageEvent("message", {
          data: { type: "result", id: this.pending.id, text },
        }));
        this.pending = null;
      },
    };
    Object.assign(window, { __creativeStorySmoke: state });
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, {
      construct(target, args) {
        if ((args[1] as WorkerOptions | undefined)?.name !== "the-grind-2:creative-writer") {
          return Reflect.construct(target, args);
        }
        state.workers += 1;
        return new class extends EventTarget {
          postMessage(message: { id: number; type: string }) {
            if (message.type === "load") {
              state.loads += 1;
              queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", {
                data: { type: "ready", id: message.id },
              })));
            } else {
              state.writes += 1;
              state.pending = { id: message.id, worker: this };
            }
          }
          terminate() { state.terminations += 1; }
        }();
      },
    });
  }, world);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await page.waitForFunction(() => {
    if (document.documentElement.dataset.ready !== "true") return false;
    const app = document.querySelector<HTMLElement>("#app");
    if (app?.dataset.presentationPaused !== "true") {
      document.querySelector<HTMLButtonElement>("#pause-button")?.click();
    }
    return app?.dataset.presentationPaused === "true";
  }, undefined, { polling: 20, timeout: 20_000 });
  await expect(page.locator("#stage")).toHaveAttribute("data-scene-mode", "travel");
}

async function workerCounts(page: Page) {
  return page.evaluate(() => {
    const state = (window as unknown as { __creativeStorySmoke: {
      workers: number; loads: number; writes: number; terminations: number;
    } }).__creativeStorySmoke;
    return { workers: state.workers, loads: state.loads, writes: state.writes, terminations: state.terminations };
  });
}

async function finishWrite(page: Page, text: string) {
  await page.evaluate((output) => {
    (window as unknown as { __creativeStorySmoke: { complete(text: string): void } })
      .__creativeStorySmoke.complete(output);
  }, text);
}

async function visibleProseHeight(page: Page): Promise<number> {
  return page.locator("#creative-story-text").evaluate((element) => {
    const prose = element.getBoundingClientRect();
    const control = element.closest<HTMLElement>("#creative-story-control")!.getBoundingClientRect();
    const chronicle = element.closest<HTMLElement>("#chronicle")!.getBoundingClientRect();
    return Math.min(prose.bottom, control.bottom, chronicle.bottom, window.innerHeight)
      - Math.max(prose.top, control.top, chronicle.top, 0);
  });
}

test("creative writer requires activation, repeats after settlement, and cancels cleanly", async ({ page }) => {
  // Software-rendered desktop Chromium needs this budget for real pointer actions.
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openIdleGame(page);
  expect(await workerCounts(page)).toMatchObject({ workers: 0, writes: 0 });
  await expect(page.locator("#creative-story-control")).toBeHidden();
  await page.locator("#narrator-button").click();
  await expect(page.locator("#creative-load")).toHaveText("Download & try creative writer");
  expect(await workerCounts(page)).toMatchObject({ workers: 0 });
  await page.locator("#creative-load").click();
  await expect(page.locator("#creative-status")).toContainText("Ready");
  await page.locator("#narrator-close").click();
  const control = page.locator("#creative-story-control");
  const write = page.locator("#creative-story-write");
  const prose = page.locator("#creative-story-text");
  await expect(control).toBeVisible();
  const source = await page.locator("#creative-story-source").innerText();
  expect(source.length).toBeGreaterThan(10);
  const samples = [
    "A ribbon caught on the branch trembled like a question the road would not answer.",
    "Dust settled into the empty footprints, keeping its own account of the passing company.",
  ];
  for (const [index, sample] of samples.entries()) {
    await write.click();
    await expect(write).toBeDisabled();
    await expect(page.locator("#creative-story-cancel")).toBeVisible();
    await expect.poll(async () => (await workerCounts(page)).writes).toBe(index + 1);
    await finishWrite(page, sample);
    await expect(prose).toHaveText(sample);
    await expect.poll(() => visibleProseHeight(page), { timeout: 20_000 }).toBeGreaterThan(15);
    await expect(write).toBeEnabled();
    await expect(write).toHaveText("Try another idea");
    await expect(page.locator("#creative-story-source")).toHaveText(source);
    await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "true");
  }
  await write.click();
  await expect.poll(async () => (await workerCounts(page)).writes).toBe(3);
  await page.locator("#creative-story-cancel").click();
  await expect(control).toBeHidden();
  expect(await workerCounts(page)).toEqual({ workers: 1, loads: 1, writes: 3, terminations: 1 });
  await finishWrite(page, "A canceled reply must never return to the Chronicle.");
  await expect(control).toBeHidden();
  await expect(prose).toHaveText("");
  expect(errors).toEqual([]);
});

test("creative writer reveals completed prose inside the compact Chronicle", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openIdleGame(page);
  await page.locator("#narrator-button").click();
  await page.locator("#creative-load").click();
  await expect(page.locator("#creative-status")).toContainText("Ready");
  await page.locator("#narrator-close").click();
  await page.locator("#creative-story-write").click();
  await expect.poll(async () => (await workerCounts(page)).writes).toBe(1);
  // Measured output reused only as a UI fixture; this test does not run the model.
  const sample = "The Eastern Bank is reached safely, and the traveler has left the island without leaving any copper coins behind. She is now free to travel freely, but she must be certain of her destination before she leaves.";
  await finishWrite(page, sample);
  await expect(page.locator("#creative-story-text")).toHaveText(sample);
  await expect.poll(() => visibleProseHeight(page)).toBeGreaterThan(15);
  await expect(page.locator("#creative-story-control")).toHaveAttribute("tabindex", "0");
  if (process.env.TG2_VISUAL_CAPTURE === "1") {
    await page.screenshot({ path: "/tmp/the-grind-2-creative-story-320-revealed.png", fullPage: true });
  }
});

test("complete browser cache offers Use saved model before creating a worker", async ({ page }) => {
  await openIdleGame(page);
  const modelRoot = `https://huggingface.co/${creativeWriterModelId}/resolve/${creativeWriterModelRevision}/`;
  const urls = [
    ...["config.json", "generation_config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"]
      .map((file) => modelRoot + file),
    "https://the-grind-2.invalid/creative-writer-runtime/ort-wasm-simd-threaded.asyncify.mjs",
    "https://the-grind-2.invalid/creative-writer-runtime/ort-wasm-simd-threaded.asyncify.wasm",
  ];
  // Tiny cache fixtures test UI discovery only; the live model probe verifies bytes.
  await page.evaluate(async ({ name, urls }) => {
    const cache = await caches.open(name);
    await Promise.all(urls.map((url) => cache.put(url, new Response("fixture"))));
  }, { name: creativeWriterCacheName, urls });
  await page.locator("#narrator-button").click();
  await expect(page.locator("#creative-load")).toHaveText("Use saved model");
  await expect(page.locator("#creative-status")).toContainText("without downloading");
  expect(await workerCounts(page)).toMatchObject({ workers: 0 });
  await page.locator("#creative-load").click();
  await expect(page.locator("#creative-status")).toContainText("Ready");
  expect(await workerCounts(page)).toMatchObject({ workers: 1, loads: 1 });
  await page.locator("#creative-stop").click();
  await expect(page.locator("#creative-load")).toHaveText("Use saved model");
});

for (const viewport of [{ width: 320, height: 568 }, { width: 1280, height: 800 }]) {
  test(`creative scene stays scroll-bounded and suppressed over combat at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openIdleGame(page);
    await page.evaluate(() => {
      const control = document.querySelector<HTMLElement>("#creative-story-control")!;
      const text = document.querySelector<HTMLElement>("#creative-story-text")!;
      control.hidden = false;
      text.hidden = false;
      // First two complete sentences from tools/creative-story-probe/report.json,
      // outputs[0]. This is a layout fixture, not inference through this UI test.
      text.textContent = "Mara's eyes widened as she gazed out at the shimmering blue waters of the eastern bank. The river was a deep blue, with a few wispy patches of green that seemed to shift and change color in the fading light.";
      document.querySelector<HTMLElement>("#creative-story-source")!.textContent =
        "Greyford · Mara crossed the river · Paid the ferryman her last copper coin and reached the eastern bank safely";
      document.querySelector<HTMLElement>("#creative-story-status")!.textContent =
        "Local model prose · creative interpretation, not the game record";
      document.querySelector<HTMLElement>("#app")!.dataset.presentationBusy = "false";
    });
    const control = page.locator("#creative-story-control");
    await expect(control).toBeVisible();
    await control.scrollIntoViewIfNeeded();
    if (process.env.TG2_VISUAL_CAPTURE === "1") {
      await page.screenshot({ path: `/tmp/the-grind-2-creative-story-${viewport.width}.png`, fullPage: true });
    }
    await page.locator("#creative-story-text").evaluate((element) => {
      element.textContent = `${element.textContent} `.repeat(5);
    });
    const layout = await control.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const chronicle = element.closest<HTMLElement>("#chronicle")!.getBoundingClientRect();
      const source = element.querySelector<HTMLElement>("#creative-story-source")!.getBoundingClientRect();
      const prose = element.querySelector<HTMLElement>("#creative-story-text")!.getBoundingClientRect();
      return {
        height: box.height,
        scrolls: element.scrollHeight > element.clientHeight,
        horizontalFit: element.scrollWidth <= element.clientWidth + 1,
        insideChronicle: box.left >= chronicle.left - 1 && box.right <= chronicle.right + 1,
        sourceSeparate: source.bottom <= prose.top + 1,
        pageFits: document.documentElement.scrollWidth <= window.innerWidth + 1,
      };
    });
    expect(layout).toMatchObject({ scrolls: true, horizontalFit: true, insideChronicle: true, sourceSeparate: true, pageFits: true });
    expect(layout.height).toBeLessThanOrEqual(Math.min(240, viewport.height * 0.35) + 2);
    await page.locator("#stage").evaluate((element) => { (element as HTMLElement).dataset.sceneMode = "battle"; });
    await expect(control).toBeHidden();
    await page.locator("#stage").evaluate((element) => { (element as HTMLElement).dataset.sceneMode = "travel"; });
    await expect(control).toBeVisible();
    await page.locator("#app").evaluate((element) => { (element as HTMLElement).dataset.presentationBusy = "true"; });
    await expect(control).toBeHidden();
    await page.locator("#app").evaluate((element) => {
      (element as HTMLElement).dataset.presentationBusy = "false";
      (element as HTMLElement).dataset.chromeMode = "focus";
    });
    await expect(control).toBeHidden();
  });
}
