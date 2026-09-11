import { expect, test, type Page } from "@playwright/test";
import { canonicalHash, canonicalStringify } from "../src/core/canonical";
import { upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { projectElsewhereLoafPacket, type ElsewhereLoafPacket } from "../src/ui/elsewhere-loaf-view";
import { experimentalLoafCampaignId, naturalExperimentalLoafFixture } from "./experimental-loaf-fixtures";

async function installDurableFixture(page: Page, world: WorldState): Promise<void> {
  // The actual uninterrupted T72 campaign checkpoint. Nothing is supplied to
  // the baker and no hero location, command, resource or outcome is staged.
  await page.goto("./version.json", { timeout: 20_000 });
  await page.evaluate(async state => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("the-grind-2", 2);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("campaigns", { keyPath: "campaignId" });
        request.result.createObjectStore("settings");
        request.result.createObjectStore("champions", { keyPath: "id" });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["campaigns", "settings"], "readwrite");
      transaction.objectStore("campaigns").put(state);
      transaction.objectStore("settings").put(state.campaignId, "activeCampaignId");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, world);
  await page.addInitScript(id => {
    localStorage.setItem(`the-grind-2:last-active:${id}`, String(Date.now() + 3_600_000));
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
  }, world.campaignId);
}

async function durableSave(page: Page): Promise<WorldState> {
  return page.evaluate(id => new Promise<WorldState>((resolve, reject) => {
    const request = indexedDB.open("the-grind-2", 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result, transaction = database.transaction("campaigns", "readonly");
      const saved = transaction.objectStore("campaigns").get(id);
      transaction.oncomplete = () => { database.close(); resolve(saved.result as WorldState); };
      transaction.onerror = () => { database.close(); reject(transaction.error); };
    };
  }), experimentalLoafCampaignId);
}

async function pausedSave(page: Page, afterTick?: number): Promise<string> {
  return page.evaluate(({ id, tick }) => new Promise<string>((resolve, reject) => {
    const app = document.querySelector<HTMLElement>("#app")!, button = document.querySelector<HTMLButtonElement>("#pause-button")!;
    let requested = false;
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Experimental Loaf turn did not settle within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (raw === null || tick !== undefined && JSON.parse(raw).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; button.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(raw);
    }, 20);
    if (tick !== undefined) button.click();
  }), { id: experimentalLoafCampaignId, tick: afterTick });
}

async function proveLoaf(page: Page, packet: ElsewhereLoafPacket, heroMode: string): Promise<void> {
  await expect.poll(async () => page.evaluate(() => {
    const caption = document.querySelector<HTMLElement>("#elsewhere-loaf-cutaway")!, stage = document.querySelector<HTMLElement>("#stage")!;
    return { hidden: caption.hidden, caption: { ...caption.dataset }, stage: { ...stage.dataset },
      title: document.querySelector("#elsewhere-loaf-title")?.textContent,
      actor: document.querySelector("#elsewhere-loaf-actor")?.textContent,
      line: document.querySelector("#elsewhere-loaf-line")?.textContent,
      supply: document.querySelector("#elsewhere-loaf-supply")?.textContent,
      continue: document.querySelector("#elsewhere-loaf-outcome")?.textContent,
      privateKeys: Object.keys({ ...stage.dataset, ...caption.dataset }).filter(key => /ovenRoll|private|future/i.test(key)) };
  }), { timeout: 8_000 }).toMatchObject({ hidden: false,
    caption: { active: "true", event: packet.eventId, source: packet.sourceCommandId,
      phase: packet.phase, actor: packet.residentId, location: packet.locationId },
    stage: { elsewhereLoafEvent: packet.eventId, elsewhereLoafCommand: packet.sourceCommandId,
      elsewhereLoafPhase: packet.phase, elsewhereLoafActor: packet.residentId, elsewhereLoafLocation: packet.locationId,
      elsewhereLoafInn: packet.innId, elsewhereLoafDough: String(packet.doughQuantity),
      elsewhereLoafProduct: packet.product, elsewhereLoafQuantity: String(packet.productQuantity),
      elsewhereLoafActorPosition: "148,136", elsewhereLoafHeroPresent: "false", liveSceneMode: heroMode,
      elsewhereLoafGesture: packet.phase === "admission" ? "knead" : "admire",
      elsewhereLoafVisual: `actual-former-baker|admitted-inn-worksite|${packet.product}|no-hero|no-hero-reward` },
    title: `Elsewhere · ${packet.locationName}`, actor: `${packet.companionName} · ${packet.innName}`,
    line: packet.line, continue: "Continue", privateKeys: [],
    supply: packet.phase === "admission" ? "Inn-supplied dough: 1 · A steady recipe" : "Trial dough: 1→0 · One loaf. The hero is elsewhere." });
  await expect.poll(async () => page.evaluate(() => {
    const caption = document.querySelector<HTMLElement>("#elsewhere-loaf-cutaway")!, stage = document.querySelector<HTMLElement>("#stage")!;
    const canvas = stage.querySelector("canvas")!, host = stage.getBoundingClientRect();
    const layout = (stage.dataset.sceneLayout ?? "").split(",").map(Number), safe = (stage.dataset.elsewhereLoafSafeRect ?? "").split(",").map(Number);
    if (layout.length !== 3 || safe.length !== 4 || [...layout, ...safe].some(value => !Number.isFinite(value))) return null;
    const [scale = 0, x = 0, y = 0] = layout, [left = 0, top = 0, right = 0, bottom = 0] = safe;
    // These values come from the live Pixi hand transform and food bounds,
    // not a declared "kneading" or "contact" label. The reduced-motion
    // admission must place the actual hand inside the visible dough ellipse.
    const hand = (stage.dataset.elsewhereLoafHandPosition ?? "").split(",").map(Number);
    const product = (stage.dataset.elsewhereLoafProductPosition ?? "").split(",").map(Number);
    const bounds = (stage.dataset.elsewhereLoafProductBounds ?? "").split(",").map(Number);
    if (hand.length !== 2 || product.length !== 2 || bounds.length !== 4
        || [...hand, ...product, ...bounds].some(value => !Number.isFinite(value))) return null;
    const [handX = 0, handY = 0] = hand, [productX = 0, productY = 0] = product;
    const [minX = 0, minY = 0, maxX = 0, maxY = 0] = bounds;
    const radiusX = (maxX - minX) / 2, radiusY = (maxY - minY) / 2;
    const contact = stage.dataset.elsewhereLoafPhase !== "admission" || radiusX > 0 && radiusY > 0
      && ((handX - productX) / radiusX) ** 2 + ((handY - productY) / radiusY) ** 2 <= 1;
    const handClear = document.elementFromPoint(host.left + x + handX * scale, host.top + y + handY * scale) === canvas;
    const scene = { left: host.left + x, top: host.top + y, right: host.left + x + 320 * scale, bottom: host.top + y + 180 * scale };
    const clear = [".topbar", "#view-toolbar", "#stage-focus-ribbon", "#stage-focus-controls", "#elsewhere-loaf-cutaway"].every(selector => {
      const node = document.querySelector<HTMLElement>(selector);
      if (node === null || node.hidden || getComputedStyle(node).display === "none") return true;
      const box = node.getBoundingClientRect();
      return box.width === 0 || box.height === 0 || scene.right <= box.left + 0.5 || scene.left >= box.right - 0.5
        || scene.bottom <= box.top + 0.5 || scene.top >= box.bottom - 0.5;
    });
    const propsClear = [[148, 105], [176, 123], [230, 115]].every(([px = 0, py = 0]) =>
      document.elementFromPoint(host.left + x + px * scale, host.top + y + py * scale) === canvas);
    const rows = [...caption.querySelectorAll<HTMLElement>("#elsewhere-loaf-title, #elsewhere-loaf-actor, #elsewhere-loaf-line, #elsewhere-loaf-supply, #elsewhere-loaf-outcome")].map(row => {
      const box = row.getBoundingClientRect(), clip = caption.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return parseFloat(getComputedStyle(row).fontSize) >= 11 && box.top >= clip.top - 1 && box.bottom <= clip.bottom + 1
        && box.left >= clip.left - 1 && box.right <= clip.right + 1 && hit !== null && (hit === row || row.contains(hit));
    });
    return { adequateStage: scale * 320 >= (innerWidth <= 760 ? Math.min(280, innerWidth - 32) : 380) - 1,
      safeStage: scale > 0 && x >= left - 1 && y >= top - 1 && x + scale * 320 <= right + 1 && y + scale * 180 <= bottom + 1,
      inViewport: scene.left >= -1 && scene.top >= -1 && scene.right <= innerWidth + 1 && scene.bottom <= innerHeight + 1,
      clear, propsClear, contact, handClear, readableRows: rows.length === 5 && rows.every(Boolean), pageFits: document.documentElement.scrollWidth <= innerWidth + 1 };
  }), { timeout: 8_000 }).toEqual({ adequateStage: true, safeStage: true, inViewport: true,
    clear: true, propsClear: true, contact: true, handClear: true, readableRows: true, pageFits: true });
}

async function proveCompany(page: Page, world: WorldState): Promise<void> {
  const loaf = world.depth.elsewhereLoaf!;
  const journal = await page.evaluate(residentId => {
    document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="journal"]')!.click();
    document.querySelector<HTMLButtonElement>("#journal-company-button")!.click();
    document.querySelector<HTMLDetailsElement>("#journal-companion-history")!.open = true;
    const former = [...document.querySelectorAll<HTMLElement>("#journal-companion-former [data-companion-id]")]
      .find(node => node.dataset.companionId === residentId)!;
    const record = former.querySelector<HTMLDetailsElement>("details[data-elsewhere-loaf]")!;
    record.open = true;
    return { data: { ...record.dataset }, text: record.textContent,
      visible: !record.hidden && getComputedStyle(record).display !== "none" && record.getBoundingClientRect().height > 0,
      lines: [...record.querySelectorAll<HTMLElement>("[data-loaf-phase]")].map(line => ({ phase: line.dataset.loafPhase, text: line.textContent })),
      records: former.querySelectorAll("details[data-elsewhere-loaf]").length };
  }, loaf.residentId);
  expect(journal).toMatchObject({ visible: true, records: 1,
    data: { elsewhereLoaf: loaf.id, campaign: world.campaignId, companion: loaf.residentId, joinedTick: String(loaf.joinedTick),
      admissionEvent: loaf.admission.eventId, admissionSource: loaf.admission.triggerCommandId,
      ...(loaf.completion === null ? {} : { completionEvent: loaf.completion.eventId, completionSource: loaf.completion.triggerCommandId }) },
    lines: [{ phase: "admission", text: `${loaf.companionName}: ${loaf.admission.line}` },
      ...(loaf.completion === null ? [] : [{ phase: "completion", text: `${loaf.companionName}: ${loaf.completion.line}` }])] });
  for (const text of [loaf.innName, "Elderwatch", loaf.admission.eventId, loaf.admission.triggerCommandId,
    "Oath joined T28; farewell T45", "not learned by the absent hero", "no hero food, resources or reward"])
    expect(journal.text).toContain(text);
  if (loaf.completion !== null) {
    for (const text of [loaf.completion.eventId, loaf.completion.triggerCommandId, "1→0; one plain-loaf"]) expect(journal.text).toContain(text);
  } else {
    expect(journal.data).not.toHaveProperty("completionEvent");
    expect(journal.text).toContain("1 remaining; not yet baked");
    expect(journal.text).not.toMatch(/ovenRoll|plain-loaf|bricklike-loaf|unexpected-delight/u);
  }
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click());
}

test("an actual former baker finishes one inn-supplied loaf while the hero continues elsewhere", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const startedAt = Date.now(), { before, admitted, completed, next } = naturalExperimentalLoafFixture();
  const admission = projectElsewhereLoafPacket(admitted, "admission")!, completion = projectElsewhereLoafPacket(completed, "completion")!;
  const errors: string[] = [], inference: string[] = [], external: string[] = [];
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
    const path = testInfo.outputPath(name + ".png");
    await page.screenshot({ path, timeout: 8_000 });
    await testInfo.attach(name, { path, contentType: "image/png" });
  };
  const milestone = (message: string): void => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map(part => [part.type, part.value]));
    console.log(`[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}] Experimental Loaf +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${message}`);
  };
  try {
    expect([before, admitted, completed, next].map(world => [world.tick, canonicalHash(world)]))
      .toEqual([[72, "13656f8eed409523"], [73, "7b4e8a9a1dc2ea42"], [74, "95940f1f61a29b47"], [75, "81089edaf8c0eeee"]]);
    expect(admission).not.toHaveProperty("ovenRoll"); expect(admission).not.toHaveProperty("outcome");
    expect(admission).not.toHaveProperty("completion"); expect(admission.product).toBe("dough");
    expect(completion).toMatchObject({ product: "plain-loaf", outcome: "plain-loaf", doughQuantity: 0, productQuantity: 1 });
    for (const world of [before, admitted, completed, next]) {
      expect(canonicalStringify(upgradeWorldState(JSON.parse(canonicalStringify(world))))).toBe(canonicalStringify(world));
      expect(world.depth.hero.resources).toMatchObject({ health: 37, mana: 22 });
      expect(world.depth.hero.gold).toBe(19);
    }
    expect(completed.depth.hero.inventory).toEqual(admitted.depth.hero.inventory);
    expect(completed.depth.companions).toEqual(before.depth.companions);
    expect([admitted, completed, next].map(world => world.chronicle.at(-1)!.commandType))
      .toEqual(["travel", "plan-route", "prepare-road-supper"]);
    expect([admitted.hero.experience, completed.hero.experience, next.hero.experience]).toEqual([51, 52, 52]);

    await installDurableFixture(page, before);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    // Fixture-fast presentation; no claim that a normal six-second animation
    // ran. The browser executes each actual hero action, then pauses its camera.
    await page.goto("./?fast", { timeout: 25_000 });
    expect(JSON.parse(await pausedSave(page))).toEqual(before);
    const admittedRaw = await pausedSave(page, before.tick);
    expect(JSON.parse(admittedRaw)).toEqual(admitted);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(admitted));
    await proveLoaf(page, admission, "travel"); await capture("experimental-loaf-admission-1280");
    await page.locator("#elsewhere-loaf-outcome").click();
    await expect(page.locator("#elsewhere-loaf-cutaway")).toBeHidden();
    expect(await pausedSave(page)).toBe(admittedRaw);
    await proveCompany(page, admitted);
    milestone("actual T73 hero arrival also seats Ada at the known inn; dough only, no future result disclosed");

    const completedRaw = await pausedSave(page, admitted.tick);
    expect(JSON.parse(completedRaw)).toEqual(completed);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(completed));
    await page.setViewportSize({ width: 320, height: 568 });
    await proveLoaf(page, completion, "atlas"); await capture("experimental-loaf-completed-320");
    await page.locator("#stage-focus-button").click();
    await expect(page.locator("#app")).toHaveAttribute("data-chrome-mode", "focus");
    await proveLoaf(page, completion, "atlas"); await capture("experimental-loaf-completed-320-focus");
    expect(await pausedSave(page)).toBe(completedRaw);
    await page.keyboard.press("Escape");
    await page.locator("#elsewhere-loaf-outcome").click();
    await expect(page.locator("#elsewhere-loaf-cutaway")).toBeHidden();
    expect(await pausedSave(page)).toBe(completedRaw);
    await proveCompany(page, completed);
    milestone("actual T74 route planning remains canonical; Ada consumes one inn dough and finishes one plain loaf");

    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(completedRaw);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(completed));
    await expect(page.locator("#elsewhere-loaf-cutaway")).toBeHidden();
    await proveCompany(page, completed);
    expect(JSON.parse(await pausedSave(page, completed.tick))).toEqual(next);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(next));
    await expect(page.locator("#elsewhere-loaf-cutaway")).toBeHidden();
    await expect(page.locator("#stage")).not.toHaveAttribute("data-elsewhere-loaf-event", /.+/);
    expect(next.depth.elsewhereLoaf).toEqual(completed.depth.elsewhereLoaf);
    await proveCompany(page, next);
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone("exact acknowledged reload; ordinary T75 supper, one retained NPC attempt, no hero reward, errors or model/external requests");
  } finally {
    await testInfo.attach("Experimental Loaf actual source diagnostics", { body: JSON.stringify({ errors, inference, external,
      ticks: [before.tick, admitted.tick, completed.tick, next.tick], admission, completion,
      heroSources: [admitted, completed, next].map(world => world.chronicle.at(-1)!.commandId),
      elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
