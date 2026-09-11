import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, campaignDirector, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { companionReunionCampaignId, naturalCompanionReunionArrivalFixture, naturalCompanionReunionFixture } from "./companion-reunion-fixtures";

async function installFixture(page: Page, fixture: WorldState): Promise<void> {
  await page.addInitScript(state => {
    const key = `the-grind-2:campaign:${state.campaignId}`;
    if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, JSON.stringify(state));
    sessionStorage.setItem("the-grind-2:activeCampaignId", state.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${state.campaignId}`, String(Date.now() + 3_600_000));
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
  }, fixture);
}

async function pausedSave(page: Page, afterTick?: number): Promise<string> {
  return page.evaluate(({ id, tick }) => new Promise<string>((resolve, reject) => {
    const app = document.querySelector<HTMLElement>("#app")!, button = document.querySelector<HTMLButtonElement>("#pause-button")!;
    let requested = false;
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Reunion turn did not settle within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (raw === null || tick !== undefined && JSON.parse(raw).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; button.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(raw);
    }, 20);
    if (tick !== undefined) button.click();
  }), { id: companionReunionCampaignId, tick: afterTick });
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
    title: `A familiar face · ${location.name}`, note: "Two roads cross again.",
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
    const rows = [...caption.querySelectorAll<HTMLElement>("h2, .reunion-line, .repartee-note")].map(row => {
      row.scrollIntoView({ block: "nearest", inline: "nearest" });
      const box = row.getBoundingClientRect(), clip = caption.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return parseFloat(getComputedStyle(row).fontSize) >= 11 && box.top >= clip.top - 1 && box.bottom <= clip.bottom + 1
        && box.left >= clip.left - 1 && box.right <= clip.right + 1 && hit !== null && (hit === row || row.contains(hit));
    });
    return { adequateStage: scale * 320 >= (innerWidth <= 760 ? Math.min(280, innerWidth - 32) : 380) - 1,
      safeStage: scale > 0 && x >= left - 1 && y >= top - 1 && x + scale * 320 <= right + 1 && y + scale * 180 <= bottom + 1,
      inViewport: scene.left >= -1 && scene.top >= -1 && scene.right <= innerWidth + 1 && scene.bottom <= innerHeight + 1,
      clear, actorsClear, readableRows: rows.length === 4 && rows.every(Boolean), pageFits: document.documentElement.scrollWidth <= innerWidth + 1 };
  }), { timeout: 8_000 }).toEqual({ adequateStage: true, safeStage: true, inViewport: true,
    clear: true, actorsClear: true, readableRows: true, pageFits: true });
}

async function proveCompanyJournal(page: Page, world: WorldState): Promise<void> {
  const reunion = world.depth.companionReunion!, completed = reunion.completed!;
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
      companion: reunion.residentId, joinedTick: String(reunion.joinedTick), location: reunion.locationId, arrivalSource: reunion.arrival.sourceCommandId },
    lines: [{ speaker: reunion.heroId, text: `${world.hero.name}: ${completed.heroLine}` },
      { speaker: reunion.residentId, text: `${reunion.companionName}: ${completed.companionLine}` }] });
  for (const text of [completed.sourceCommandId, reunion.arrival.sourceCommandId, reunion.residentId,
    `joined T${reunion.joinedTick}`, `farewell T${reunion.departureTick}`, reunion.arrival.route.path.join(" → "),
    `committed travel distance ${reunion.arrival.distance}`, "former companion remains a former companion", "bond, regard and resources unchanged"]) expect(journal.text).toContain(text);
  expect(journal.formerText).toContain(reunion.companionName);
  expect(journal.text).toContain(world.depth.atlas.locations.find(location => location.id === reunion.locationId)!.name);
  expect(journal.text).toContain(world.depth.atlas.locations.find(location => location.id === reunion.arrival.sourceLocationId)!.name);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click());
}

test("a genuine return meets one former companion without reopening the oath or inventing a shared victory", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const beforeArrival = naturalCompanionReunionArrivalFixture(), arrived = advanceWorld(beforeArrival);
  const ready = naturalCompanionReunionFixture(), expected = advanceWorld(ready);
  const reunion = expected.depth.companionReunion!, completed = reunion.completed!;
  const former = ready.depth.companions.former.find(companion => companion.identity.residentId === reunion.residentId
    && companion.joinedTick === reunion.joinedTick)!;
  const errors: string[] = [], inference: string[] = [], external: string[] = [], startedAt = Date.now();
  const milestone = (message: string): void => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map(part => [part.type, part.value]));
    console.log(`[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}] Companion reunion +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${message}`);
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
  try {
    expect(beforeArrival.depth.companionReunion).toBeNull();
    expect(beforeArrival.forwardMotion.activeDirective?.reason).toBe("companion-return");
    expect(arrived.chronicle.at(-1)?.commandType).toBe("travel");
    expect(arrived.depth.atlas.route).toBeNull();
    expect(beforeArrival.depth.atlas.currentLocationId).not.toBe(arrived.depth.atlas.currentLocationId);
    expect(reunion.arrival).toMatchObject({ tick: arrived.tick, route: beforeArrival.depth.atlas.route,
      sourceLocationId: beforeArrival.depth.atlas.currentLocationId,
      sourceCommandId: `depth:${arrived.tick}:travel:${reunion.arrival.distance}` });
    expect(arrived.chronicle.at(-1)?.commandId).toBe(`${arrived.campaignId}:${reunion.arrival.sourceCommandId}`);
    expect(reunion.locationId).toBe(beforeArrival.depth.atlas.route!.destinationId);
    expect(reunion.locationId).toBe(former.departure.locationId);
    expect(reunion.locationId).toBe(former.destination.locationId);
    expect(reunion.arrival.tick).toBeGreaterThan(former.departure.tick);
    expect(reunion.sharedVictories).toBe(former.victories);
    expect(former).toMatchObject({ injury: "none", departure: { outcome: "fulfilled" } });
    expect(former.resources.health).toBeGreaterThan(0);
    expect(ready.depth.companions.active).toEqual([]);
    expect(ready.depth.companionReunion!.completed).toBeNull();
    expect(campaignDirector(ready).candidates[0]?.command).toEqual({ type: "reunite-companion",
      residentId: reunion.residentId, joinedTick: reunion.joinedTick, arrivalTick: reunion.arrival.tick });

    await installFixture(page, beforeArrival);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    // Explicit fixture-fast mode: this is not a new timing measurement of normal spoken-scene dwell.
    await page.goto("./?fast", { timeout: 25_000 });
    expect(JSON.parse(await pausedSave(page))).toEqual(beforeArrival);
    const arrivalRaw = await pausedSave(page, beforeArrival.tick);
    expect(JSON.parse(arrivalRaw)).toEqual(arrived);
    await expect(page.locator("#repartee-caption")).toBeHidden();
    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(arrivalRaw);
    expect(upgradeWorldState(JSON.parse(arrivalRaw))).toEqual(arrived);
    await expect(page.locator("#repartee-caption")).toBeHidden();
    milestone(`actual route arrives at T${arrived.tick}; exact pending arrival survives reload without an invented exchange`);

    let current = arrived;
    expect(ready.tick - arrived.tick).toBeLessThanOrEqual(4);
    while (current.tick < ready.tick) {
      const raw = await pausedSave(page, current.tick);
      current = advanceWorld(current);
      expect(JSON.parse(raw)).toEqual(current);
      expect(current.depth.companionReunion!.completed).toBeNull();
    }
    expect(current).toEqual(ready);
    const reunionRaw = await pausedSave(page, ready.tick);
    expect(JSON.parse(reunionRaw)).toEqual(expected);
    expect(expected.chronicle.at(-1)).toMatchObject({ commandType: "reunite-companion", mode: "chronicle",
      tick: expected.tick, commandId: `${expected.campaignId}:${completed.sourceCommandId}` });
    expect(expected.depth.companionReunion!.arrival).toEqual(arrived.depth.companionReunion!.arrival);
    expect(expected.depth.companions).toEqual(ready.depth.companions);
    expect(expected.depth.companions.active).toEqual([]);
    expect(expected.depth.hero).toEqual(ready.depth.hero);
    expect(expected.hero).toEqual(ready.hero);
    expect(expected.depth.towns).toEqual(ready.depth.towns);
    expect(expected.depth.quest).toEqual(ready.depth.quest);
    expect(expected.depth.completedQuests).toEqual(ready.depth.completedQuests);
    expect(expected.depth.pendingQuestReward).toEqual(ready.depth.pendingQuestReward);
    expect(olderStories(expected)).toBe(olderStories(ready));
    await proveReunion(page, expected); await capture("companion-reunion-1280");
    await page.setViewportSize({ width: 320, height: 568 });
    await proveReunion(page, expected); await capture("companion-reunion-320");
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await proveReunion(page, expected); await capture("companion-reunion-320-focus");
    expect(await pausedSave(page)).toBe(reunionRaw);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await proveCompanyJournal(page, expected);
    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(reunionRaw);
    expect(upgradeWorldState(JSON.parse(reunionRaw))).toEqual(expected);
    await proveReunion(page, expected);
    milestone(`T${expected.tick} reunites the actual pair; both spoken lines and Company sources survive reload without a new oath or reward`);

    expect(campaignDirector(expected).candidates.every(candidate => candidate.command.type !== "reunite-companion")).toBe(true);
    const continued = JSON.parse(await pausedSave(page, expected.tick)) as WorldState;
    expect(continued).toEqual(advanceWorld(expected));
    expect(continued.depth.companionReunion).toEqual(reunion);
    expect(continued.depth.companions.former).toEqual(expected.depth.companions.former);
    expect(continued.chronicle.at(-1)?.commandType).not.toBe("reunite-companion");
    await expect(page.locator("#repartee-caption")).toBeHidden();
    await proveCompanyJournal(page, continued);
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone(`ordinary ${continued.chronicle.at(-1)?.commandType} resumes with one historical reunion; no runtime errors, models or external requests`);
  } finally {
    await testInfo.attach("Companion reunion diagnostics", { body: JSON.stringify({ errors, inference, external,
      beforeArrivalTick: beforeArrival.tick, arrivalTick: arrived.tick, readyTick: ready.tick, reunionTick: expected.tick,
      route: reunion.arrival.route, departureTick: reunion.departureTick, residentId: reunion.residentId,
      elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
