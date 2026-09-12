import { expect, test, type Page } from "@playwright/test";
import { canonicalHash, canonicalStringify } from "../src/core/canonical";
import { advanceWorld, campaignDirector, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { projectCompanionReunionScene } from "../src/ui/companion-reunion-view";
import { naturalReunionWitnessMemoryFixture, releasedCompanionReunionFixture, reunionWitnessMemoryCampaignId } from "./reunion-witness-memory-fixtures";

async function installDurableFixture(page: Page, world: WorldState): Promise<void> {
  // Existing IndexedDB save seam. Restore the actual unchanged T85 arrival;
  // no witness, quotation, route, health or relationship is staged.
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
  await page.addInitScript(campaignId => {
    localStorage.setItem(`the-grind-2:last-active:${campaignId}`, String(Date.now() + 3_600_000));
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
  }), reunionWitnessMemoryCampaignId);
}

async function pausedSave(page: Page, afterTick?: number): Promise<string> {
  return page.evaluate(({ id, tick }) => new Promise<string>((resolve, reject) => {
    const app = document.querySelector<HTMLElement>("#app")!, button = document.querySelector<HTMLButtonElement>("#pause-button")!;
    let requested = false;
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Witness-memory turn did not settle within20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (raw === null || tick !== undefined && JSON.parse(raw).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; button.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(raw);
    }, 20);
    if (tick !== undefined) button.click();
  }), { id: reunionWitnessMemoryCampaignId, tick: afterTick });
}
function olderStories(world: WorldState): string {
  return JSON.stringify({ repartee: world.depth.repartee, witness: world.depth.reparteeWitness,
    callback: world.depth.reparteeCallback, lesson: world.depth.usefulReply, challenge: world.depth.roomChallenge,
    bell: world.depth.bellExpedition, bellMemory: world.depth.bellMemory });
}

async function proveReunion(page: Page, world: WorldState): Promise<void> {
  const reunion = world.depth.companionReunion!, completed = reunion.completed!;
  const location = world.depth.atlas.locations.find(entry => entry.id === reunion.locationId)!;
  await expect.poll(async () => page.evaluate(() => {
    const caption = document.querySelector<HTMLElement>("#repartee-caption")!, stage = document.querySelector<HTMLElement>("#stage")!;
    return { hidden: caption.hidden, caption: { ...caption.dataset }, stage: { ...stage.dataset },
      title: caption.querySelector("h2")?.textContent, note: caption.querySelector(".repartee-note")?.textContent,
      lines: [...caption.querySelectorAll<HTMLElement>(".reunion-line")].map(line => ({ speaker: line.dataset.speaker, text: line.textContent })),
      noContest: ["book", "round", "momentum", "outcome", "witness", "reaction", "regard", "score", "encore"].every(key => !(key in caption.dataset)),
      marks: caption.querySelectorAll(".repartee-marks, [data-result-marker]").length,
      noActiveCompanion: document.querySelector<HTMLElement>("#stage-focus-ribbon")?.dataset.partySize === "1" };
  }), { timeout: 8_000 }).toMatchObject({ hidden: false,
    caption: { phase: "reunion", command: `${world.campaignId}:${completed.sourceCommandId}`,
      reunion: completed.sourceCommandId, companion: reunion.residentId, location: reunion.locationId },
    stage: { reparteePhase: "reunion", reunionId: completed.sourceCommandId,
      reunionCommand: `${world.campaignId}:${completed.sourceCommandId}`, reunionCompanion: reunion.residentId,
      reunionLocation: reunion.locationId, reunionHeroPosition: "102,144", reunionCompanionPosition: "222,144" },
    title: `${completed.memory === undefined ? "A familiar face" : "An old line returns"} · ${location.name}`,
    note: completed.memory === undefined ? "Two roads cross again." : "Some words travel with you.",
    lines: [{ speaker: reunion.heroId, text: `${world.hero.name}: ${completed.heroLine}` },
      { speaker: reunion.residentId, text: `${reunion.companionName}: ${completed.companionLine}` }],
    noContest: true, marks: 0, noActiveCompanion: true,
  });
  await expect.poll(async () => page.evaluate(() => {
    const caption = document.querySelector<HTMLElement>("#repartee-caption")!, stage = document.querySelector<HTMLElement>("#stage")!;
    const canvas = stage.querySelector("canvas")!, host = stage.getBoundingClientRect();
    const layout = (stage.dataset.sceneLayout ?? "").split(",").map(Number), safe = (stage.dataset.reparteeSafeRect ?? "").split(",").map(Number);
    if (layout.length !== 3 || safe.length !== 4 || [...layout, ...safe].some(value => !Number.isFinite(value))) return null;
    const [scale = 0, x = 0, y = 0] = layout, [left = 0, top = 0, right = 0, bottom = 0] = safe;
    const scene = { left: host.left + x, top: host.top + y, right: host.left + x + 320 * scale, bottom: host.top + y + 180 * scale };
    const clear = [".topbar", "#view-toolbar", "#stage-focus-ribbon", "#stage-focus-controls", "#repartee-caption"].every(selector => {
      const node = document.querySelector<HTMLElement>(selector);
      if (node === null || node.hidden || getComputedStyle(node).display === "none") return true;
      const box = node.getBoundingClientRect();
      return box.width === 0 || box.height === 0 || scene.right <= box.left + 0.5 || scene.left >= box.right - 0.5
        || scene.bottom <= box.top + 0.5 || scene.top >= box.bottom - 0.5;
    });
    const actorsClear = [[102, 110], [222, 110]].every(([px = 0, py = 0]) =>
      document.elementFromPoint(host.left + x + px * scale, host.top + y + py * scale) === canvas);
    const hasReport = caption.dataset.ovenReport !== undefined;
    const compactReport = hasReport && (innerWidth <= 600 || document.querySelector<HTMLElement>("#app")?.dataset.chromeMode === "focus");
    const note = caption.querySelector<HTMLElement>(".repartee-note")!;
    const rows = [...caption.querySelectorAll<HTMLElement>("h2, .reunion-line, .reunion-oven-report, .repartee-note")]
      .filter(row => !row.matches(".repartee-note") || !compactReport).map(row => {
      row.scrollIntoView({ block: "nearest", inline: "nearest" });
      const box = row.getBoundingClientRect(), clip = caption.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return parseFloat(getComputedStyle(row).fontSize) >= 11 && box.top >= clip.top - 1 && box.bottom <= clip.bottom + 1
        && box.left >= clip.left - 1 && box.right <= clip.right + 1 && hit !== null && (hit === row || row.contains(hit));
    });
    return { adequateStage: scale * 320 >= (innerWidth <= 760 ? Math.min(280, innerWidth - 32) : 380) - 1,
      safeStage: scale > 0 && x >= left - 1 && y >= top - 1 && x + scale * 320 <= right + 1 && y + scale * 180 <= bottom + 1,
      inViewport: scene.left >= -1 && scene.top >= -1 && scene.right <= innerWidth + 1 && scene.bottom <= innerHeight + 1,
      clear, actorsClear, readableRows: rows.length === (hasReport ? compactReport ? 4 : 5 : 4) && rows.every(Boolean)
        && (!compactReport || getComputedStyle(note).display === "none")
        && caption.querySelectorAll(".reunion-oven-report").length === (hasReport ? 1 : 0),
      pageFits: document.documentElement.scrollWidth <= innerWidth + 1 };
  }), { timeout: 8_000 }).toEqual({ adequateStage: true, safeStage: true, inViewport: true,
    clear: true, actorsClear: true, readableRows: true, pageFits: true });
}

async function proveCompanyJournal(page: Page, world: WorldState): Promise<void> {
  const reunion = world.depth.companionReunion!, completed = reunion.completed!, memory = completed.memory!;
  const journal = await page.evaluate(({ residentId, source }) => {
    document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="journal"]')!.click();
    document.querySelector<HTMLButtonElement>("#journal-company-button")!.click();
    document.querySelector<HTMLDetailsElement>("#journal-companion-history")!.open = true;
    const former = [...document.querySelectorAll<HTMLElement>("#journal-companion-former [data-companion-id]")]
      .find(node => node.dataset.companionId === residentId)!;
    const record = [...former.querySelectorAll<HTMLDetailsElement>("[data-companion-reunion]")]
      .find(node => node.dataset.companionReunion === source)!;
    record.open = true;
    return { data: { ...record.dataset }, text: record.textContent,
      visible: !record.hidden && getComputedStyle(record).display !== "none" && record.getBoundingClientRect().height > 0,
      lines: [...record.querySelectorAll<HTMLElement>("[data-speaker]")].map(line => ({ speaker: line.dataset.speaker, text: line.textContent })),
      records: former.querySelectorAll("[data-companion-reunion]").length, formerText: former.textContent };
  }, { residentId: reunion.residentId, source: completed.sourceCommandId });
  expect(journal).toMatchObject({ visible: true, records: 1,
    data: { campaign: world.campaignId, companionReunion: completed.sourceCommandId, command: completed.sourceCommandId,
      companion: reunion.residentId, joinedTick: String(reunion.joinedTick), location: reunion.locationId, arrivalSource: reunion.arrival.sourceCommandId,
      memoryRule: memory.rulesVersion, memoryReaction: memory.sourceReactionCommandId,
      memoryEvidence: memory.evidenceSourceCommandId, memoryRegard: String(memory.regardAfter) },
    lines: [{ speaker: reunion.heroId, text: `${world.hero.name}: ${completed.heroLine}` },
      { speaker: reunion.residentId, text: `${reunion.companionName}: ${completed.companionLine}` },
      ...(completed.ovenReport === undefined ? [] : [{ speaker: reunion.residentId, text: `${reunion.companionName}: ${completed.ovenReport.line}` }])] });
  for (const text of [completed.sourceCommandId, reunion.arrival.sourceCommandId, reunion.residentId,
    `joined T${reunion.joinedTick}`, `farewell T${reunion.departureTick}`, reunion.arrival.route.path.join(" → "),
    `committed travel distance ${reunion.arrival.distance}`, "former companion remains a former companion", "bond, regard and resources unchanged"]) expect(journal.text).toContain(text);
  for (const text of [memory.rememberedReply, memory.quote, memory.sourceReactionCommandId,
    memory.evidenceSourceCommandId, memory.encounterId, memory.witnessId, memory.heroId,
    `Reaction ${memory.sourceReactionId} at T${memory.sourceReactionTick}`,
    `round index ${memory.evidenceRoundIndex}`, `regard ${memory.regardAfter}`,
    `Original contest outcome: ${memory.outcome}`, "No new contest, regard or reward."]) expect(journal.text).toContain(text);
  expect(journal.formerText).toContain(reunion.companionName);
  expect(journal.text).toContain(world.depth.atlas.locations.find(location => location.id === reunion.locationId)!.name);
  expect(journal.text).toContain(world.depth.atlas.locations.find(location => location.id === reunion.arrival.sourceLocationId)!.name);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click());
}

test("the same former companion remembers an exact witnessed line without changing the old opinion", async ({ page }, testInfo) => {
  test.setTimeout(100_000);
  const startedAt = Date.now(), { before, completed: world, next } = naturalReunionWitnessMemoryFixture();
  const reunion = world.depth.companionReunion!, completed = reunion.completed!, memory = completed.memory!;
  const reaction = before.depth.reparteeWitness.reaction!, evidence = reaction.evidence!;
  const errors: string[] = [], inference: string[] = [], external: string[] = [];
  const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("worker", worker => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
  page.on("request", request => {
    if (modelUrl.test(request.url())) inference.push(request.url());
    if (new URL(request.url()).origin !== new URL(testInfo.project.use.baseURL!).origin) external.push(request.url());
  });
  const milestone = (message: string): void => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map(part => [part.type, part.value]));
    console.log("[" + p.year + "-" + p.month + "-" + p.day + " " + p.hour + ":" + p.minute + ":" + p.second + " " + p.timeZoneName
      + "] Reunion memory +" + ((Date.now() - startedAt) / 1000).toFixed(1) + "s: " + message);
  };
  const capture = async (name: string): Promise<void> => {
    if (process.env.TG2_VISUAL_CAPTURE !== "1") return;
    const path = testInfo.outputPath(name + ".png");
    await page.screenshot({ path, timeout: 8_000 });
    await testInfo.attach(name, { path, contentType: "image/png" });
  };
  try {
    expect([before.tick, world.tick, next.tick]).toEqual([85, 86, 87]);
    expect(canonicalHash(before)).toBe("8de0bf9b87c9e26c");
    expect(before.chronicle.at(-1)!.commandId).toBe(before.campaignId + ":" + reunion.arrival.sourceCommandId);
    expect(reunion.arrival).toMatchObject({ tick: 85, sourceCommandId: "depth:85:travel:9", sourceLocationId: "location:10", distance: 9 });
    expect(reunion).toMatchObject({ companionName: "Ada Fen", joinedTick: 28, departureTick: 45, locationId: "location:0" });
    expect(memory).toEqual({ schemaVersion: 1, rulesVersion: "reunion-witness-memory-v1",
      heroId: reunion.heroId, witnessId: reaction.witnessId, joinedTick: reaction.joinedTick,
      encounterId: reaction.encounterId, sourceReactionCommandId: reaction.completionCommandId,
      sourceReactionTick: reaction.completedTick, sourceReactionId: reaction.reactionId,
      evidenceSourceCommandId: evidence.sourceCommandId, evidenceRoundIndex: evidence.roundIndex,
      rememberedReply: evidence.reply, quote: "I will accept being called cautious.",
      pose: reaction.pose, outcome: reaction.outcome, regardAfter: reaction.regardAfter });
    expect(memory).toMatchObject({ witnessId: reunion.residentId, sourceReactionTick: 32,
      sourceReactionId: "unmoved", pose: "quiet", outcome: "draw", regardAfter: 0 });
    expect(memory.rememberedReply).toBe("I will accept being called cautious. I do not need your applause badly enough to perform a foolish dare.");
    expect(completed.heroLine).toBe("I brought an old line back with me: “I will accept being called cautious.”");
    expect(completed.companionLine).toBe("It is exactly as I remember. I am still not sure what to make of it.");
    expect(before.depth.reparteeCallback).toMatchObject({ tick: 44, sourceReactionTick: 32,
      witnessId: reunion.residentId, joinedTick: 28, rememberedReply: memory.rememberedReply });
    expect(world.depth.hero).toEqual(before.depth.hero);
    expect(world.hero).toEqual(before.hero);
    for (const key of ["atlas", "towns", "companions", "quest", "completedQuests", "pendingQuestReward", "completedCombats",
      "repartee", "reparteeWitness", "reparteeCallback", "usefulReply", "roomChallenge", "bellExpedition", "bellMemory",
      "companionCredit", "smithyJob", "innBluff", "pennywiseGate", "roadSupper", "spareGearTrade"] as const) {
      expect(world.depth[key]).toEqual(before.depth[key]);
    }
    expect(olderStories(world)).toBe(olderStories(before));
    expect(world.chronicle.at(-1)!.commandId).toBe(world.campaignId + ":" + completed.sourceCommandId);
    expect(advanceWorld(before)).toEqual(world); expect(advanceWorld(world)).toEqual(next);
    for (const state of [before, world, next]) expect(canonicalStringify(upgradeWorldState(JSON.parse(canonicalStringify(state))))).toBe(canonicalStringify(state));
    const old = releasedCompanionReunionFixture();
    expect(canonicalHash(old)).toBe("d9cce50f7bc14aa8");
    expect(old.depth.companionReunion!.completed).not.toHaveProperty("memory");
    expect(projectCompanionReunionScene(old)!.title).toBe("A familiar face · Elderwatch");

    await installDurableFixture(page, before);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    // Fixture-fast playback of the actual arrival save, not a normal-dwell timing claim.
    await page.goto("./?fast", { timeout: 25_000 });
    const beforeRaw = await pausedSave(page);
    expect(JSON.parse(beforeRaw)).toEqual(before);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(before));
    await expect(page.locator("#repartee-caption")).toBeHidden();
    const completedRaw = await pausedSave(page, before.tick);
    expect(JSON.parse(completedRaw)).toEqual(world);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(world));
    await proveReunion(page, world); await capture("reunion-memory-1280");
    await proveCompanyJournal(page, world);
    await page.setViewportSize({ width: 320, height: 568 });
    await proveReunion(page, world); await capture("reunion-memory-320");
    await page.locator("#stage-focus-button").click();
    await expect(page.locator("#app")).toHaveAttribute("data-chrome-mode", "focus");
    await proveReunion(page, world); await capture("reunion-memory-320-focus");
    expect(await pausedSave(page)).toBe(completedRaw);
    await page.keyboard.press("Escape");
    await expect(page.locator("#app")).toHaveAttribute("data-chrome-mode", "panels");
    milestone("actual Ada remembers the exact T32 line; neutral opinion, T44 callback and former oath stay unchanged");

    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(completedRaw);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(world));
    await proveReunion(page, world); await proveCompanyJournal(page, world);
    expect(campaignDirector(world).candidates.every(candidate => candidate.command.type !== "reunite-companion")).toBe(true);
    expect(JSON.parse(await pausedSave(page, world.tick))).toEqual(next);
    expect(canonicalStringify(await durableSave(page))).toBe(canonicalStringify(next));
    expect(next.depth.companionReunion).toEqual(reunion);
    expect(next.depth.companions.former).toEqual(world.depth.companions.former);
    expect(next.depth.reparteeWitness).toEqual(before.depth.reparteeWitness);
    expect(next.depth.reparteeCallback).toEqual(before.depth.reparteeCallback);
    await expect(page.locator("#repartee-caption")).toBeHidden();
    await proveCompanyJournal(page, next);
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone("exact reload keeps one reunion; ordinary next command clears Watch while Company retains all original sources");
  } finally {
    await testInfo.attach("Reunion memory actual source diagnostics", { body: JSON.stringify({ errors, inference, external,
      ticks: [before.tick, world.tick, next.tick], commandId: completed.sourceCommandId,
      nextCommand: next.chronicle.at(-1)!.commandType, memory, elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
