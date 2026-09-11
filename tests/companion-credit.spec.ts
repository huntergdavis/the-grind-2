import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, campaignDirector, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { projectCompanionCreditScene } from "../src/ui/companion-credit-view";
import { companionCreditBeforeVictoryFixture, companionCreditCampaignId,
  companionCreditFarewellFixture, companionCreditTownBoundaryFixture } from "./companion-credit-fixtures";

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
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Credit turn did not settle within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (raw === null || tick !== undefined && JSON.parse(raw).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; button.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(raw);
    }, 20);
    if (tick !== undefined) button.click();
  }), { id: companionCreditCampaignId, tick: afterTick });
}

function priorStories(world: WorldState): string {
  return JSON.stringify({ repartee: world.depth.repartee, witness: world.depth.reparteeWitness,
    callback: world.depth.reparteeCallback, lesson: world.depth.usefulReply, challenge: world.depth.roomChallenge,
    bell: world.depth.bellExpedition, bellMemory: world.depth.bellMemory, reunion: world.depth.companionReunion });
}

async function proveCreditScene(page: Page, world: WorldState): Promise<void> {
  const scene = projectCompanionCreditScene(world)!;
  expect(scene).not.toBeNull();
  const credit = world.depth.companionCredit!, exchange = credit.exchange!;
  const signed = exchange.regardDelta > 0 ? "+1" : "-1";
  const lines = scene.phase === "credit" ? [
    { speaker: credit.heroId, text: `${world.hero.name}: ${exchange.heroLine}` },
    { speaker: credit.residentId, text: `${credit.companionName}: ${exchange.companionLine}` },
  ] : [{ speaker: credit.residentId, text: `${credit.companionName}: ${credit.farewell!.line}` }];
  await expect.poll(() => page.evaluate(() => {
    const caption = document.querySelector<HTMLElement>("#repartee-caption")!, stage = document.querySelector<HTMLElement>("#stage")!;
    return { hidden: caption.hidden, caption: { ...caption.dataset }, stage: { ...stage.dataset },
      title: caption.querySelector("h2")?.textContent, note: caption.querySelector(".repartee-note")?.textContent,
      lines: [...caption.querySelectorAll<HTMLElement>(".credit-line")].map(line => ({ speaker: line.dataset.speaker, text: line.textContent })),
      marks: caption.querySelectorAll(".repartee-marks, [data-result-marker]").length,
      noContest: ["book", "round", "momentum", "outcome", "witness", "reaction", "regard", "score", "encore"].every(key => !(key in caption.dataset)) };
  }), { timeout: 15_000 }).toMatchObject({ hidden: false,
    caption: { phase: scene.phase, command: scene.commandId, credit: exchange.sourceCommandId,
      companion: credit.residentId, location: world.depth.atlas.currentLocationId, choice: exchange.choice, creditRegard: signed },
    stage: { creditPhase: scene.phase, creditCommand: scene.commandId, creditCompanion: credit.residentId,
      creditLocation: world.depth.atlas.currentLocationId, creditChoice: exchange.choice, creditRegard: signed,
      creditEvidence: credit.evidence.damageEventId, creditHeroPosition: "102,144", creditCompanionPosition: "222,144" },
    title: scene.title, note: scene.consequence, lines, marks: 0, noContest: true });
  await expect.poll(() => page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>("#stage")!, caption = document.querySelector<HTMLElement>("#repartee-caption")!;
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
    const rows = [...caption.querySelectorAll<HTMLElement>("h2, .credit-line, .repartee-note")].map(row => {
      row.scrollIntoView({ block: "nearest", inline: "nearest" });
      const box = row.getBoundingClientRect(), clip = caption.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return parseFloat(getComputedStyle(row).fontSize) >= 11 && box.top >= clip.top - 1 && box.bottom <= clip.bottom + 1
        && box.left >= clip.left - 1 && box.right <= clip.right + 1 && hit !== null && (hit === row || row.contains(hit));
    });
    return { adequateStage: scale * 320 >= (innerWidth <= 760 ? Math.min(280, innerWidth - 32) : 380) - 1,
      safeStage: scale > 0 && x >= left - 1 && y >= top - 1 && x + scale * 320 <= right + 1 && y + scale * 180 <= bottom + 1,
      inViewport: scene.left >= -1 && scene.top >= -1 && scene.right <= innerWidth + 1 && scene.bottom <= innerHeight + 1,
      clear, actorsClear, readableRows: rows.length >= 3 && rows.every(Boolean), pageFits: document.documentElement.scrollWidth <= innerWidth + 1 };
  }), { timeout: 8_000 }).toEqual({ adequateStage: true, safeStage: true, inViewport: true,
    clear: true, actorsClear: true, readableRows: true, pageFits: true });
}

async function proveCompanyRecord(page: Page, world: WorldState): Promise<void> {
  const credit = world.depth.companionCredit!, exchange = credit.exchange!;
  const result = await page.evaluate(({ source, former }) => {
    document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="journal"]')!.click();
    document.querySelector<HTMLButtonElement>("#journal-company-button")!.click();
    document.querySelector<HTMLDetailsElement>("#journal-companion-history")!.open = true;
    const container = document.querySelector<HTMLElement>(former ? "#journal-companion-former" : "#journal-companion-active")!;
    const record = [...container.querySelectorAll<HTMLDetailsElement>("[data-companion-credit]")].find(node => node.dataset.companionCredit === source)!;
    record.open = true;
    return { count: document.querySelectorAll("[data-companion-credit]").length, data: { ...record.dataset },
      text: record.textContent, sources: [...record.querySelectorAll(".journal-credit-source")].map(node => node.textContent).join("\n"),
      visible: record.getBoundingClientRect().height > 0 && !record.hidden,
      lines: [...record.querySelectorAll<HTMLElement>(".credit-line")].map(line => ({ speaker: line.dataset.speaker, text: line.textContent })) };
  }, { source: exchange.sourceCommandId, former: credit.farewell !== null });
  expect(result).toMatchObject({ count: 1, visible: true, data: { campaign: world.campaignId,
    companionCredit: exchange.sourceCommandId, companion: credit.residentId, joinedTick: String(credit.joinedTick),
    choice: exchange.choice, regard: exchange.regardDelta > 0 ? "+1" : "-1" } });
  for (const source of [credit.evidence.combat.id, credit.evidence.damageEventId, credit.evidence.outcomeEventId,
    credit.evidence.sourceCommandId, exchange.sourceCommandId, ...(credit.farewell === null ? [] : [credit.farewell.sourceCommandId])]) expect(result.sources).toContain(source);
  expect(result.text).toContain("fair-credit-v1");
  expect(result.text).toContain("not combat bond or a cumulative relationship score");
  expect(result.lines).toEqual([
    { speaker: credit.heroId, text: `${world.hero.name}: ${exchange.heroLine}` },
    { speaker: credit.residentId, text: `${credit.companionName}: ${exchange.companionLine}` },
    ...(credit.farewell === null ? [] : [{ speaker: credit.residentId, text: `${credit.companionName}: ${credit.farewell.line}` }]),
  ]);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click());
}

test("a staged-town start earns a real companion assist, one credit exchange and a later actual farewell", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const beforeVictory = companionCreditBeforeVictoryFixture(), ready = companionCreditTownBoundaryFixture();
  const expected = advanceWorld(ready), credit = expected.depth.companionCredit!, exchange = credit.exchange!;
  const farewellReady = companionCreditFarewellFixture(), departed = advanceWorld(farewellReady);
  const errors: string[] = [], inference: string[] = [], external: string[] = [], startedAt = Date.now();
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
    expect(advanceWorld(beforeVictory)).toEqual(ready);
    expect(ready.depth.companionCredit!.exchange).toBeNull();
    expect(credit.preference).toBe("fair-credit-v1");
    const damage = credit.evidence.combat.eventStream.events.find(event => event.id === credit.evidence.damageEventId)!;
    expect(damage).toMatchObject({ kind: "damage", actorId: credit.residentId, amount: 13, healthBefore: 14, healthAfter: 1 });
    expect(credit.evidence.combat.combatants.find(unit => unit.id === damage.targetId)?.side).toBe("enemies");
    expect(credit.evidence.combat.eventStream.events.find(event => event.id === credit.evidence.outcomeEventId)).toMatchObject({ kind: "outcome", outcome: "victory" });
    expect(ready.chronicle.at(-1)?.commandId).toBe(`${ready.campaignId}:${credit.evidence.sourceCommandId}`);
    expect(exchange).toMatchObject({ choice: "acknowledge", regardDelta: 1, tick: ready.tick + 1 });
    expect(expected.depth.hero).toEqual(ready.depth.hero); expect(expected.hero).toEqual(ready.hero);
    for (const key of ["atlas", "companions", "completedCombats", "quest", "completedQuests", "pendingQuestReward", "towns"] as const) expect(expected.depth[key]).toEqual(ready.depth[key]);
    expect(priorStories(expected)).toBe(priorStories(ready));
    expect(expected.chronicle.at(-1)).toMatchObject({ commandType: "share-companion-credit", mode: "chronicle", commandId: `${expected.campaignId}:${exchange.sourceCommandId}` });
    await installFixture(page, beforeVictory);
    await page.emulateMedia({ reducedMotion: "reduce" }); await page.setViewportSize({ width: 1280, height: 800 });
    // Explicit fixture-fast playback; not an uninterrupted natural start or a normal-time dwell measurement.
    await page.goto("./?fast", { timeout: 25_000 }); expect(JSON.parse(await pausedSave(page))).toEqual(beforeVictory);
    const victoryRaw = await pausedSave(page, beforeVictory.tick); expect(JSON.parse(victoryRaw)).toEqual(ready);
    await page.reload({ timeout: 25_000 }); expect(await pausedSave(page)).toBe(victoryRaw);
    const exchangeRaw = await pausedSave(page, ready.tick); expect(JSON.parse(exchangeRaw)).toEqual(expected);
    await proveCreditScene(page, expected); await capture("companion-credit-1280");
    await page.setViewportSize({ width: 320, height: 568 }); await proveCreditScene(page, expected); await capture("companion-credit-320");
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await proveCreditScene(page, expected); await capture("companion-credit-320-focus");
    expect(await pausedSave(page)).toBe(exchangeRaw);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await proveCompanyRecord(page, expected);
    await page.reload({ timeout: 25_000 }); expect(await pausedSave(page)).toBe(exchangeRaw);
    expect(upgradeWorldState(JSON.parse(exchangeRaw))).toEqual(expected); await proveCreditScene(page, expected);
    const next = advanceWorld(expected); expect(campaignDirector(expected).candidates[0]?.command.type).toBe("travel");
    expect(JSON.parse(await pausedSave(page, expected.tick))).toEqual(next);
    expect(next.depth.companionCredit).toEqual(expected.depth.companionCredit);
    expect(projectCompanionCreditScene(next)).toBeNull();

    // Separate earned checkpoint: all intervening road commands ran in the
    // fixture, within the approved 96-command continuation; no teleport/roster edit.
    expect(farewellReady.depth.companionCredit!.exchange).toEqual(exchange);
    expect(farewellReady.depth.atlas.route).toBeNull();
    expect(farewellReady.depth.companions.active[0]).toMatchObject({ phase: "arrived", injury: "none" });
    expect(farewellReady.depth.atlas.currentLocationId).toBe(credit.evidence.companion.destination.locationId);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(state => sessionStorage.setItem(`the-grind-2:campaign:${state.campaignId}`, JSON.stringify(state)), farewellReady);
    await page.reload({ timeout: 25_000 }); expect(JSON.parse(await pausedSave(page))).toEqual(farewellReady);
    const farewellRaw = await pausedSave(page, farewellReady.tick); expect(JSON.parse(farewellRaw)).toEqual(departed);
    expect(departed.depth.companionCredit!.exchange).toEqual(exchange);
    expect(departed.depth.companionCredit!.evidence).toEqual(credit.evidence);
    expect(departed.depth.companionCredit!.farewell).toMatchObject({ tick: departed.tick,
      sourceCommandId: `depth:${departed.tick}:companion:farewell:${credit.residentId}` });
    expect(departed.depth.hero).toEqual(farewellReady.depth.hero); expect(departed.hero).toEqual(farewellReady.hero);
    expect(departed.depth.companions.active).toEqual([]);
    expect(departed.depth.companions.former.find(companion => companion.identity.residentId === credit.residentId)?.departure.outcome).toBe("fulfilled");
    // Pause also freezes the existing farewell cutaway. Finish that view-only
    // presentation before asserting the queued credit callback; do not advance a turn.
    await expect(page.locator("#farewell-cutaway")).toBeVisible();
    await page.locator("#farewell-cutaway-outcome").click();
    expect(await pausedSave(page)).toBe(farewellRaw);
    await proveCreditScene(page, departed); await proveCompanyRecord(page, departed);
    await page.reload({ timeout: 25_000 }); expect(await pausedSave(page)).toBe(farewellRaw);
    expect(upgradeWorldState(JSON.parse(farewellRaw))).toEqual(departed);
    const continued = advanceWorld(departed);
    expect(JSON.parse(await pausedSave(page, departed.tick))).toEqual(continued);
    expect(continued.depth.companionCredit).toEqual(departed.depth.companionCredit);
    expect(projectCompanionCreditScene(continued)).toBeNull();
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
  } finally {
    await testInfo.attach("companion-credit-evidence", { body: JSON.stringify({
      fixtureBoundary: "Second visited town only; later recruitment, combat and road commands are real",
      victoryTick: ready.tick, exchangeTick: expected.tick, farewellTick: departed.tick,
      exchange, elapsedMs: Date.now() - startedAt, errors, inference, external }, null, 2), contentType: "application/json" });
  }
});
