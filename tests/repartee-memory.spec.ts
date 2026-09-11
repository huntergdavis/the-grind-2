import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, campaignDirector, upgradeWorldState } from "../src/core/simulation";
import { naturalReparteeMemoryFixture, reparteeMemoryCampaignId } from "./repartee-memory-fixtures";

async function pausedSave(page: Page, afterTick?: number): Promise<string> {
  return page.evaluate(async ({ id, tick }) => new Promise<string>((resolve, reject) => {
    const app = document.querySelector<HTMLElement>("#app")!, button = document.querySelector<HTMLButtonElement>("#pause-button")!;
    let requested = false;
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Memory turn did not settle and pause within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const saved = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (saved === null || tick !== undefined && JSON.parse(saved).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; button.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(saved);
    }, 20);
    if (tick !== undefined) button.click();
  }), { id: reparteeMemoryCampaignId, tick: afterTick });
}

test("a healthy arrival recalls the actual joke once, then the companion bids farewell", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const ready = naturalReparteeMemoryFixture(), expected = advanceWorld(ready);
  const destinationName = ready.depth.companions.active[0]!.destination.name;
  const callback = expected.depth.reparteeCallback!, errors: string[] = [], inference: string[] = [], external: string[] = [];
  const startedAt = Date.now();
  const milestone = (message: string): void => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map(part => [part.type, part.value]));
    console.log(`[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}] Shared memory +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${message}`);
  };
  const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("worker", worker => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
  page.on("request", request => {
    if (modelUrl.test(request.url())) inference.push(request.url());
    if (new URL(request.url()).origin !== new URL(testInfo.project.use.baseURL!).origin) external.push(request.url());
  });
  const capture = async (name: string): Promise<void> => {
    if (process.env.TG2_VISUAL_CAPTURE !== "1") return;
    const path = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path, timeout: 8_000 });
    await testInfo.attach(name, { path, contentType: "image/png" });
  };
  const proveMemory = async (): Promise<void> => {
    const caption = page.locator("#repartee-caption");
    await expect(caption.locator("h2")).toHaveText(`After the road · ${destinationName}`);
    await expect(caption).toHaveAttribute("data-phase", "memory");
    await expect(caption).toHaveAttribute("data-command", `${expected.campaignId}:${callback.sourceCommandId}`);
    await expect(caption).toHaveAttribute("data-memory-source", callback.sourceReactionCommandId);
    await expect(caption).toHaveAttribute("data-memory-location", callback.restLocationId);
    await expect(caption).toHaveAttribute("data-outcome", "not-a-contest");
    await expect(caption.locator(".repartee-witness")).toHaveText(`${callback.witnessName}: ${callback.line}`);
    await expect(caption.locator(".repartee-call, .repartee-reply, .repartee-marks")).toHaveCount(0);
    await expect(page.locator("#battle-turn-strip")).toBeHidden();
    await expect(page.locator("#stage")).toHaveAttribute("data-repartee-resident", "none");
    await expect.poll(async () => page.evaluate(() => {
      const caption = document.querySelector<HTMLElement>("#repartee-caption")!, stage = document.querySelector<HTMLElement>("#stage")!;
      const canvas = stage.querySelector("canvas")!, host = stage.getBoundingClientRect();
      const layout = (stage.dataset.sceneLayout ?? "").split(",").map(Number), safe = (stage.dataset.reparteeSafeRect ?? "").split(",").map(Number);
      if (layout.length !== 3 || safe.length !== 4 || [...layout, ...safe].some(value => !Number.isFinite(value))) return null;
      const [scale = 0, x = 0, y = 0] = layout, [left = 0, top = 0, right = 0, bottom = 0] = safe;
      const scene = { left: host.left + x, top: host.top + y, right: host.left + x + 320 * scale, bottom: host.top + y + 180 * scale };
      const clear = [".topbar", ".view-toolbar", "#stage-focus-ribbon", "#stage-focus-controls", "#repartee-caption"].every(selector => {
        const node = document.querySelector<HTMLElement>(selector);
        if (node === null || node.hidden || getComputedStyle(node).display === "none") return true;
        const box = node.getBoundingClientRect();
        return box.width === 0 || box.height === 0 || scene.right <= box.left + 0.5 || scene.left >= box.right - 0.5
          || scene.bottom <= box.top + 0.5 || scene.top >= box.bottom - 0.5;
      });
      const actorsClear = [[102, 110], [222, 110]].every(([actorX = 0, actorY = 0]) =>
        document.elementFromPoint(host.left + x + actorX * scale, host.top + y + actorY * scale) === canvas);
      const rows = [...caption.querySelectorAll<HTMLElement>("h2, .repartee-witness, .repartee-note")].map(row => {
        row.scrollIntoView({ block: "nearest", inline: "nearest" });
        const box = row.getBoundingClientRect(), clip = caption.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return parseFloat(getComputedStyle(row).fontSize) >= 11 && box.top >= clip.top - 1 && box.bottom <= clip.bottom + 1
          && box.left >= clip.left - 1 && box.right <= clip.right + 1 && hit !== null && (hit === row || row.contains(hit));
      });
      return { adequateStage: scale * 320 >= (innerWidth <= 760 ? Math.min(280, innerWidth - 32) : 380) - 1,
        safeStage: scale > 0 && x >= left - 1 && y >= top - 1 && x + scale * 320 <= right + 1 && y + scale * 180 <= bottom + 1,
        inViewport: scene.left >= -1 && scene.top >= -1 && scene.right <= innerWidth + 1 && scene.bottom <= innerHeight + 1,
        clear, actorsClear, readableRows: rows.length === 3 && rows.every(Boolean), pageFits: document.documentElement.scrollWidth <= innerWidth + 1 };
    }), { timeout: 8_000, message: "The quiet memory needs two readable actors, clear controls, and readable words in normal and Focus layouts" }).toEqual({
      adequateStage: true, safeStage: true, inViewport: true, clear: true, actorsClear: true, readableRows: true, pageFits: true,
    });
  };
  try {
    await page.addInitScript(saved => {
      const key = `the-grind-2:campaign:${saved.campaignId}`;
      if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, JSON.stringify(saved));
      sessionStorage.setItem("the-grind-2:activeCampaignId", saved.campaignId);
      localStorage.setItem(`the-grind-2:last-active:${saved.campaignId}`, String(Date.now() + 3_600_000));
      localStorage.setItem("the-grind-2:play-mode:v1", '{"schemaVersion":1,"mode":"deterministic"}');
      localStorage.setItem("the-grind-2:adventure-speed:v1", '{"schemaVersion":1,"speed":1}');
      localStorage.setItem("the-grind-2:stage-focus:v1", "panels");
      const pause = window.setInterval(() => {
        if (document.documentElement?.dataset.ready !== "true") return;
        const app = document.querySelector<HTMLElement>("#app"), button = document.querySelector<HTMLButtonElement>("#pause-button");
        if (app === null || button === null) return;
        if (app.dataset.presentationPaused !== "true") button.click();
        window.clearInterval(pause);
      }, 20);
    }, ready);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./?fast", { timeout: 25_000 });
    expect(JSON.parse(await pausedSave(page))).toEqual(ready);
    const saved = await pausedSave(page, ready.tick);
    expect(JSON.parse(saved)).toEqual(expected);
    expect(expected.depth.hero).toEqual(ready.depth.hero);
    expect(expected.depth.companions).toEqual(ready.depth.companions);
    expect(expected.depth.reparteeWitness).toEqual(ready.depth.reparteeWitness);
    milestone(`actual T${ready.tick} arrival produced T${expected.tick} memory of the exact T${callback.sourceReactionTick} reaction`);
    await proveMemory(); await capture("memory-1280");
    await page.setViewportSize({ width: 320, height: 568 });
    await proveMemory(); await capture("memory-320");
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await proveMemory(); await capture("memory-320-focus");
    expect(await pausedSave(page)).toBe(saved);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    const journal = await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="journal"]')!.click();
      const panel = document.querySelector<HTMLDetailsElement>("#journal-repartee")!; panel.open = true;
      const memory = panel.querySelector<HTMLElement>("[data-witness-memory]")!;
      return { data: { ...memory.dataset }, text: memory.textContent, all: panel.textContent };
    });
    expect(journal.data).toMatchObject({ witnessMemory: callback.sourceReactionId, command: callback.sourceCommandId,
      witness: callback.witnessId, memorySource: callback.sourceReactionCommandId, evidence: callback.evidenceSourceCommandId, location: callback.restLocationId });
    expect(journal.text).toBe(`${callback.witnessName}: ${callback.line}`);
    expect(journal.all).toContain(`Remembered at ${destinationName}`);
    expect(journal.all).toContain(callback.rememberedReply);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click());
    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(saved);
    expect(upgradeWorldState(JSON.parse(saved))).toEqual(expected);
    await proveMemory();
    expect(campaignDirector(expected).candidates[0]?.command.type).toBe("farewell-companion");
    const departed = JSON.parse(await pausedSave(page, expected.tick));
    expect(departed).toEqual(advanceWorld(expected));
    expect(departed.depth.reparteeCallback).toEqual(callback);
    expect(departed.depth.reparteeWitness).toEqual(expected.depth.reparteeWitness);
    expect(departed.depth.companions.active).toHaveLength(0);
    await expect(page.locator("#repartee-caption")).toBeHidden();
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone("desktop/mobile/Focus stage geometry, exact Journal/reload, unchanged rewards, and one normal farewell passed");
  } finally {
    await testInfo.attach("Shared memory diagnostics", { body: JSON.stringify({ errors, inference, external,
      elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
