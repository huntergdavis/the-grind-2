import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, campaignDirector, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { roomChallengeClaim, roomChallengeResponses } from "../src/depth/room-challenge";
import { naturalRoomChallengeFixture, roomChallengeCampaignId } from "./room-challenge-fixtures";

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
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Room challenge turn did not settle within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const saved = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (saved === null || tick !== undefined && JSON.parse(saved).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; button.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(saved);
    }, 20);
    if (tick !== undefined) button.click();
  }), { id: roomChallengeCampaignId, tick: afterTick });
}

function priorStory(world: WorldState): string {
  return JSON.stringify({ repartee: world.depth.repartee, witness: world.depth.reparteeWitness,
    callback: world.depth.reparteeCallback, lesson: world.depth.usefulReply,
    bell: world.depth.bellExpedition, bellMemory: world.depth.bellMemory });
}

function expectUnchangedStoryAndResources(before: WorldState, after: WorldState): void {
  expect(priorStory(after)).toBe(priorStory(before));
  expect(after.depth.hero).toEqual(before.depth.hero);
  expect(after.hero).toEqual(before.hero);
  expect(after.depth.quest).toEqual(before.depth.quest);
  expect(after.depth.companions).toEqual(before.depth.companions);
  expect(after.depth.completedQuests).toEqual(before.depth.completedQuests);
  expect(after.depth.pendingQuestReward).toEqual(before.depth.pendingQuestReward);
}

async function proveChallenge(page: Page, world: WorldState): Promise<void> {
  const challenge = world.depth.roomChallenge!, result = challenge.result;
  const source = result?.sourceCommandId ?? challenge.sourceCommandId;
  const signed = result === null ? null : result.delta > 0 ? `+${result.delta}` : String(result.delta);
  const note = result === null ? "One answer. Victory: +1 town reputation, capped at 100."
    : `Town reputation ${result.reputationBefore} → ${result.reputationAfter} · ${result.reputationAward === 1 ? "+1, once only." : result.outcome === "victory" ? "already at the cap." : "no award."}`;
  await expect.poll(async () => page.evaluate(() => {
    const caption = document.querySelector<HTMLElement>("#repartee-caption")!, stage = document.querySelector<HTMLElement>("#stage")!;
    return { hidden: caption.hidden, data: { ...caption.dataset }, stage: { ...stage.dataset },
      title: caption.querySelector("h2")?.textContent, resultMarker: caption.querySelector<HTMLElement>("[data-result-marker]")?.dataset.resultMarker ?? null,
      markers: caption.querySelectorAll("[data-result-marker]").length,
      call: caption.querySelector(".repartee-call")?.textContent, reply: caption.querySelector(".repartee-reply")?.textContent ?? null,
      note: caption.querySelector(".repartee-note")?.textContent, extraMarks: caption.querySelectorAll(".repartee-marks").length,
      score: caption.dataset.score ?? null, stageScore: stage.dataset.reparteeScore ?? null,
      noOldScoreOrWitness: ["round", "momentum", "witness", "reaction", "regard", "encore"].every(key => !(key in caption.dataset)) };
  }), { timeout: 8_000 }).toMatchObject({ hidden: false,
    data: { phase: result === null ? "room-challenge" : "room-result", command: `${world.campaignId}:${source}`,
      challenge: challenge.encounterId, classification: result?.classification ?? "pending", outcome: result?.outcome ?? "pending",
      ...(result === null ? {} : { score: String(result.delta) }) },
    stage: { reparteePhase: result === null ? "room-challenge" : "room-result", reparteeCommand: `${world.campaignId}:${source}`,
      reparteeChallenge: challenge.encounterId, reparteeResultMarks: result === null ? "0" : "1",
      reparteeHero: world.hero.id, reparteeResident: challenge.residentId, reparteeHeroPosition: "92,139", reparteeResidentPosition: "232,139" },
    title: result === null ? "Let the room answer" : `${result.outcome[0]!.toUpperCase()}${result.outcome.slice(1)} · ${signed} counter`,
    resultMarker: result === null ? null : String(result.delta), markers: result === null ? 0 : 1,
    call: `${challenge.residentName}: ${challenge.claim}`, reply: result === null ? null : `${world.hero.name}: ${result.reply}`,
    note, extraMarks: 0, score: result === null ? null : String(result.delta),
    stageScore: result === null ? null : String(result.delta), noOldScoreOrWitness: true,
  });
  await proveGeometry(page, result !== null);
}

async function proveGeometry(page: Page, answered: boolean): Promise<void> {
  await expect.poll(async () => page.evaluate(hasAnswer => {
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
    const actorsClear = [[92, 108], [232, 108]].every(([px = 0, py = 0]) =>
      document.elementFromPoint(host.left + x + px * scale, host.top + y + py * scale) === canvas);
    const rows = [...caption.querySelectorAll<HTMLElement>("h2, .repartee-call, .repartee-reply, .repartee-note")].map(row => {
      row.scrollIntoView({ block: "nearest", inline: "nearest" });
      const box = row.getBoundingClientRect(), clip = caption.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return parseFloat(getComputedStyle(row).fontSize) >= 11 && box.top >= clip.top - 1 && box.bottom <= clip.bottom + 1
        && box.left >= clip.left - 1 && box.right <= clip.right + 1 && hit !== null && (hit === row || row.contains(hit));
    });
    return { adequateStage: scale * 320 >= (innerWidth <= 760 ? Math.min(280, innerWidth - 32) : 380) - 1,
      safeStage: scale > 0 && x >= left - 1 && y >= top - 1 && x + scale * 320 <= right + 1 && y + scale * 180 <= bottom + 1,
      inViewport: scene.left >= -1 && scene.top >= -1 && scene.right <= innerWidth + 1 && scene.bottom <= innerHeight + 1,
      clear, actorsClear, readableRows: rows.length === (hasAnswer ? 4 : 3) && rows.every(Boolean),
      pageFits: document.documentElement.scrollWidth <= innerWidth + 1 };
  }, answered), { timeout: 8_000 }).toEqual({ adequateStage: true, safeStage: true, inViewport: true,
    clear: true, actorsClear: true, readableRows: true, pageFits: true });
}

async function proveJournal(page: Page, world: WorldState): Promise<void> {
  const challenge = world.depth.roomChallenge!, result = challenge.result!;
  const journal = await page.evaluate(encounterId => {
    document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="journal"]')!.click();
    const panel = document.querySelector<HTMLDetailsElement>("#journal-repartee")!; panel.open = true;
    const section = [...panel.querySelectorAll<HTMLElement>("[data-room-challenge]")].find(node => node.dataset.roomChallenge === encounterId)!;
    section.querySelector<HTMLElement>("summary")!.click();
    for (const details of section.querySelectorAll<HTMLDetailsElement>("details")) if (!details.open) details.querySelector<HTMLElement>("summary")!.click();
    return { text: section.textContent, data: { ...section.dataset },
      startSource: section.querySelector<HTMLElement>("[data-start-source]")?.dataset.startSource,
      answerSource: section.querySelector<HTMLElement>("[data-answer-source]")?.dataset.answerSource,
      choices: [...section.querySelectorAll<HTMLElement>("[data-response]")].map(node => ({ id: node.dataset.response, text: node.textContent })) };
  }, challenge.encounterId);
  expect(journal.data).toMatchObject({ roomChallenge: challenge.encounterId });
  expect(journal.startSource).toBe(challenge.sourceCommandId);
  expect(journal.answerSource).toBe(result.sourceCommandId);
  for (const text of [challenge.readingSourceCommandId, challenge.lessonSourceCommandId, challenge.bellSourceCommandId,
    challenge.sourceCommandId, result.sourceCommandId, challenge.frameId, challenge.residentName, challenge.claim, result.reply, result.explanation]) {
    expect(journal.text).toContain(text);
  }
  expect(journal.text).toContain(world.depth.atlas.locations.find(location => location.id === challenge.locationId)!.name);
  expect(journal.choices.map(choice => choice.id)).toEqual(roomChallengeResponses(world.depth).map(choice => choice.id));
  expect(journal.choices.find(choice => choice.id === result.responseId)?.text).toContain(result.reply);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click());
}

test("known answers meet one real post-delivery challenge with exact scoring and no repeated reputation award", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const ready = naturalRoomChallengeFixture(), started = advanceWorld(ready), answered = advanceWorld(started);
  const challenge = answered.depth.roomChallenge!, result = challenge.result!, town = ready.depth.towns[challenge.locationId]!;
  const errors: string[] = [], inference: string[] = [], external: string[] = [], startedAt = Date.now();
  const milestone = (message: string): void => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map(part => [part.type, part.value]));
    console.log(`[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}] Room challenge +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${message}`);
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
    expect(ready.depth.roomChallenge).toBeNull();
    expect(ready.depth.companions.active).toHaveLength(0);
    expect(ready.depth.usefulReply!.reply).not.toBeNull();
    expect(ready.depth.bellExpedition!.completion).not.toBeNull();
    expect(campaignDirector(ready).candidates[0]?.command.type).toBe("start-room-challenge");
    const learned = roomChallengeResponses(ready.depth).find(response => response.classification === "direct")!;
    expect(learned).toMatchObject({ expressionId: ready.depth.usefulReply!.reading.expressionId, frameId: ready.depth.usefulReply!.reading.frameId });
    await installFixture(page, ready);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./?fast", { timeout: 25_000 });
    expect(JSON.parse(await pausedSave(page))).toEqual(ready);
    const startRaw = await pausedSave(page, ready.tick);
    expect(JSON.parse(startRaw)).toEqual(started);
    expect(started.chronicle.at(-1)?.commandType).toBe("start-room-challenge");
    expect(started.depth.roomChallenge!.result).toBeNull();
    expect(challenge.startedTick).toBeGreaterThan(ready.depth.bellExpedition!.completion!.tick);
    expect(challenge).toMatchObject({ claimId: roomChallengeClaim.id, claim: roomChallengeClaim.text,
      readingSourceCommandId: ready.depth.usefulReply!.reading.sourceCommandId,
      lessonSourceCommandId: ready.depth.usefulReply!.reply!.sourceCommandId,
      bellSourceCommandId: ready.depth.bellExpedition!.completion!.sourceCommandId, reputationBefore: town.reputation });
    expectUnchangedStoryAndResources(ready, started);
    expect(started.depth.towns).toEqual(ready.depth.towns);
    await proveChallenge(page, started); await capture("room-challenge-1280");
    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(startRaw);
    expect(upgradeWorldState(JSON.parse(startRaw))).toEqual(started);
    await proveChallenge(page, started);
    milestone(`real T${started.tick} public claim and declared stakes survive exact reload without replaying prior learning or delivery`);

    const answerRaw = await pausedSave(page, started.tick);
    expect(JSON.parse(answerRaw)).toEqual(answered);
    expect(answered.chronicle.at(-1)?.commandType).toBe("answer-room-challenge");
    const selected = roomChallengeResponses(started.depth).find(response => response.id === result.responseId)!;
    expect(result).toMatchObject({ reply: selected.text, classification: selected.classification, delta: selected.delta,
      reputationBefore: town.reputation, reputationAfter: town.reputation + result.reputationAward });
    expect(result.outcome).toBe(result.delta > 0 ? "victory" : result.delta < 0 ? "defeat" : "draw");
    expect(result.reputationAward).toBe(result.outcome === "victory" ? Math.min(1, 100 - town.reputation) : 0);
    expectUnchangedStoryAndResources(ready, answered);
    expect(answered.depth.towns).toEqual({ ...ready.depth.towns, [challenge.locationId]: { ...town, reputation: result.reputationAfter } });
    await page.setViewportSize({ width: 320, height: 568 });
    await proveChallenge(page, answered); await capture("room-result-320");
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await proveChallenge(page, answered); await capture("room-result-320-focus");
    expect(await pausedSave(page)).toBe(answerRaw);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await proveJournal(page, answered);
    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(answerRaw);
    expect(upgradeWorldState(JSON.parse(answerRaw))).toEqual(answered);
    await proveChallenge(page, answered);
    milestone(`real ${result.outcome} keeps one semantic mark and exact town reputation ${town.reputation}→${result.reputationAfter}; Journal retains every source`);

    expect(campaignDirector(answered).candidates.every(candidate => !["start-room-challenge", "answer-room-challenge"].includes(candidate.command.type))).toBe(true);
    const continued = JSON.parse(await pausedSave(page, answered.tick)) as WorldState;
    expect(continued).toEqual(advanceWorld(answered));
    expect(continued.depth.roomChallenge).toEqual(challenge);
    expect(priorStory(continued)).toBe(priorStory(ready));
    expect(["start-room-challenge", "answer-room-challenge"]).not.toContain(continued.chronicle.at(-1)?.commandType);
    await expect(page.locator("#repartee-caption")).toBeHidden();
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone(`one ordinary ${continued.chronicle.at(-1)?.commandType} continues; no repeated challenge, model, external request, or runtime error`);
  } finally {
    await testInfo.attach("Room challenge diagnostics", { body: JSON.stringify({ errors, inference, external,
      readyTick: ready.tick, startedTick: started.tick, answerTick: answered.tick, outcome: result.outcome,
      reputationAward: result.reputationAward, elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
