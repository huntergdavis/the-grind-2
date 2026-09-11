import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, upgradeWorldState } from "../src/core/simulation";
import { canonicalStringify } from "../src/core/canonical";
import type { WorldState } from "../src/core/types";
import { innBluffClaim, projectInnBluffDecision, selectInnBluff, selectInnBluffVenue } from "../src/depth/inn-bluff";
import { projectInnBluffScene } from "../src/ui/inn-bluff-view";
import { commitLegalInnBluffChoice, innBluffCampaignId, naturalInnBluffBeforeAdmissionFixture, naturalInnBluffFixture } from "./inn-bluff-fixtures";

async function installFixture(page: Page, fixture: WorldState): Promise<void> {
  await page.addInitScript(state => {
    const key = `the-grind-2:campaign:${state.campaignId}`;
    if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, JSON.stringify(state));
    sessionStorage.setItem("the-grind-2:activeCampaignId", state.campaignId);
    const debtKey = "the-grind-2:test-inn-bluff-resume-debt", debt = sessionStorage.getItem(debtKey) === "60s";
    sessionStorage.removeItem(debtKey);
    localStorage.setItem(`the-grind-2:last-active:${state.campaignId}`, String(Date.now() + (debt ? -60_000 : 3_600_000)));
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
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Inn turn did not settle within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (raw === null || tick !== undefined && JSON.parse(raw).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; button.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(raw);
    }, 20);
    if (tick !== undefined) button.click();
  }), { id: innBluffCampaignId, tick: afterTick });
}

function expectOnlyWagerGold(before: WorldState, after: WorldState, delta: number): void {
  expect(after.depth.hero).toEqual({ ...before.depth.hero, gold: before.depth.hero.gold + delta });
  expect(after.hero).toEqual({ ...before.hero, gold: before.hero.gold + delta });
  for (const key of ["atlas", "towns", "companions", "quest", "completedQuests", "pendingQuestReward", "completedCombats", "completedCounterDuels",
    "repartee", "reparteeWitness", "reparteeCallback", "usefulReply", "roomChallenge", "bellExpedition", "bellMemory",
    "companionReunion", "companionCredit", "dungeon", "pennywiseGate", "smithyJob"] as const) {
    expect(canonicalStringify({ value: after.depth[key] })).toBe(canonicalStringify({ value: before.depth[key] }));
  }
}

function expectCoveredPacket(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    expect(key).not.toMatch(/^(face|revealedFace|outcome|resolution|admission|fidelity|truth|seed)$/u);
    expectCoveredPacket(child);
  }
}

async function proveStatus(page: Page, world: WorldState): Promise<void> {
  const source = world.chronicle.at(-1)!;
  const result = await page.evaluate(eventId => {
    document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="journal"]')!.click();
    document.querySelector<HTMLButtonElement>("#journal-status-button")!.click();
    document.querySelector<HTMLButtonElement>("#journal-status-refresh")!.click();
    const rows = [...document.querySelectorAll<HTMLElement>("#journal-status-list > li")];
    const row = rows.find(entry => entry.dataset.source === "chronicle" && entry.dataset.eventId === eventId)!;
    row.querySelector<HTMLDetailsElement>("details")!.open = true;
    return { count: rows.filter(entry => entry.dataset.source === "chronicle" && entry.dataset.eventId === eventId).length, text: row.textContent };
  }, source.id);
  expect(result.count).toBe(1); expect(result.text).toContain(source.commandId);
  expect(result.text).toContain(source.action); expect(result.text).toContain(source.consequence);
  const bluff = world.depth.innBluff!;
  if (bluff.resolution === null) {
    expect(result.text).not.toMatch(/(?:die (?:shows|reveals)|revealed face|actual face|exposed-bluff|honest-claim)/iu);
    expect(result.text).not.toContain("The cup had been speaking above its means.");
    expect(result.text).not.toContain("My suspicion was free. The explanation was not.");
  } else expect(result.text).toContain(bluff.resolution.line);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click());
}

async function proveInnGeometry(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>("#stage")!, canvas = stage.querySelector("canvas")!, host = stage.getBoundingClientRect();
    const [scale = 0, x = 0, y = 0] = (stage.dataset.sceneLayout ?? "").split(",").map(Number);
    const room = { left: host.left + x + 44 * scale, top: host.top + y + 32 * scale,
      right: host.left + x + 276 * scale, bottom: host.top + y + 156 * scale };
    const unobscured = ["#topbar", "#view-toolbar", "#stage-focus-ribbon", "#stage-focus-controls", "#hero-hud", "#chronicle"].every(selector => {
      const node = document.querySelector<HTMLElement>(selector);
      if (node === null || node.hidden || getComputedStyle(node).display === "none") return true;
      const box = node.getBoundingClientRect();
      return box.width === 0 || box.height === 0 || room.right <= box.left + 0.5 || room.left >= box.right - 0.5
        || room.bottom <= box.top + 0.5 || room.top >= box.bottom - 0.5;
    });
    const [hx = 0, hy = 0] = (stage.dataset.bluffHeroPosition ?? "").split(",").map(Number);
    const [rx = 0, ry = 0] = (stage.dataset.bluffResidentPosition ?? "").split(",").map(Number);
    const [cupX = 0, cupY = 0] = (stage.dataset.bluffCupPosition ?? "").split(",").map(Number);
    const reveal = Number(stage.dataset.bluffRevealProgress ?? 0);
    const actorsClear = [[hx, hy - 30], [hx, hy], [rx, ry - 30], [rx, ry],
      [cupX + 33 * reveal, cupY - 22 * Math.sin(Math.PI * reveal) - 8], [176, 116]].every(([px = 0, py = 0]) =>
      document.elementFromPoint(host.left + x + px * scale, host.top + y + py * scale) === canvas);
    const bounds = JSON.parse(stage.dataset.dungeonCaptionBounds ?? "null") as { title: number[] | null; detail: number[] | null } | null;
    const rail = (stage.dataset.dungeonCaptionRail ?? "").split(",").map(Number), [cx = 0, cy = 0, cw = 0, ch = 0] = rail;
    const captionFits = bounds !== null && bounds.title !== null && bounds.detail !== null && rail.length === 4
      && cy + ch < 32 && [bounds.title, bounds.detail].every(([tx = 0, ty = 0, tw = 0, th = 0]) =>
        tw > 0 && th > 0 && tx >= cx && ty >= cy && tx + tw <= cx + cw + 0.01 && ty + th <= cy + ch + 0.01)
      && bounds.title[1]! + bounds.title[3]! <= bounds.detail[1]! + 0.01;
    return { wide: room.right - room.left >= (innerWidth <= 760 ? 200 : 350),
      inViewport: room.left >= -1 && room.top >= -1 && room.right <= innerWidth + 1 && room.bottom <= innerHeight + 1,
      unobscured, actorsClear, captionFits, captionSized: Number(stage.dataset.dungeonCaptionTitleSize) >= 12 - 0.001
        && Number(stage.dataset.dungeonCaptionDetailSize) >= 11 - 0.001, pageFits: document.documentElement.scrollWidth <= innerWidth + 1 };
  }), { timeout: 8_000 }).toEqual({ wide: true, inViewport: true, unobscured: true, actorsClear: true,
    captionFits: true, captionSized: true, pageFits: true });
}

async function proveInn(page: Page, world: WorldState): Promise<void> {
  const scene = projectInnBluffScene(world)!;
  expect(scene).not.toBeNull();
  await expect.poll(() => page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset })), { timeout: 8_000 })
    .toMatchObject({ bluffPhase: scene.phase, bluffCommand: scene.commandId, bluffEncounter: scene.bluffId,
      bluffHero: scene.heroId, bluffResident: scene.residentId, bluffInn: scene.innId, bluffTell: scene.tell,
      bluffGold: `${scene.goldBefore}/${scene.goldSpent}/${scene.goldReturned}/${scene.goldAfter}`,
      bluffHeroPosition: "128,130", bluffResidentPosition: "232,130", bluffVisual: "native-admitted-cup-v1",
      dungeonCaptionTitle: scene.headline });
  const stage = await page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset }));
  expect(stage.dungeonCaptionDetail).toBe(stage.dungeonCaptionLayout === "compact" ? scene.compactDetail : scene.detail);
  if (scene.phase === "admission") {
    expectCoveredPacket(scene); expect(stage).not.toHaveProperty("bluffFace"); expect(stage).not.toHaveProperty("bluffOutcome");
    expect(stage.bluffCupPosition).toBe("176,113");
    const publicDom = await page.locator("#stage").evaluate(node => node.outerHTML);
    expect(publicDom).not.toMatch(/data-bluff-(?:face|outcome|truth|fidelity|seed)=/u);
  } else {
    expect(stage.bluffFace).toBe(String(scene.revealedFace)); expect(stage.bluffOutcome).toBe(scene.outcome);
    expect(stage.bluffCupPosition).toBe("176,113"); // Source anchor; the reveal moves the cup, not the table.
    expect(stage.bluffRevealProgress).toBe("1.000");
  }
  await expect(page.locator("#repartee-caption")).toBeHidden();
  await proveInnGeometry(page);
}

test("an earned inn cup conceals its die, preserves the natural decline, and settles a legal challenge once", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const before = naturalInnBluffBeforeAdmissionFixture(), ready = naturalInnBluffFixture(), result = advanceWorld(ready);
  const challenged = commitLegalInnBluffChoice(ready, "challenge"), bluff = ready.depth.innBluff!;
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
    expect(advanceWorld(before)).toEqual(ready); expect(before.depth).not.toHaveProperty("innBluff");
    expect(before.depth.smithyJob!.completion!.shape).toBe("straight");
    const town = before.depth.towns[bluff.locationId]!, inn = town.buildings.find(building => building.id === bluff.innId)!;
    const host = town.residents.find(resident => resident.id === bluff.residentId)!;
    expect(inn.kind).toBe("inn"); expect(inn.residentIds).toContain(host.id); expect(host.homeBuildingId).toBe(inn.id);
    expect(town.districts.find(district => district.id === inn.districtId)!.buildingIds).toContain(inn.id);
    expect(bluff).toMatchObject({ residentName: host.name, residentRole: host.role, presenceRule: "admitted-together-v1" });
    expect(host.role).toBe("scholar");
    expect([...before.depth.companions.active, ...before.depth.companions.former].some(companion => companion.identity.residentId === host.id)).toBe(false);
    const decision = projectInnBluffDecision(ready.depth)!;
    expect(decision).not.toBeNull(); expectCoveredPacket(decision); expect(decision.claim).toBe(innBluffClaim);
    expect(decision.tellAccuracy).toBe("two-in-three");
    expect(decision.choices.map(choice => [choice.choice, choice.goldCost])).toEqual([["challenge", 1], ["decline", 0]]);
    expectOnlyWagerGold(before, ready, 0);
    expect(result.depth.innBluff!.resolution).toMatchObject({ choice: "decline", outcome: "declined", revealedFace: 5,
      goldSpent: 0, goldReturned: 0, goldBefore: 9, goldAfter: 9 });
    expect(bluff.admission.tell).toBe("steady");
    expectOnlyWagerGold(ready, result, 0);
    const paid = challenged.depth.innBluff!.resolution!;
    expect(paid.choice).toBe("challenge"); expect(paid.revealedFace).toBe(bluff.admission.face);
    expect(paid.goldSpent).toBe(1); expect(paid.goldReturned).toBe(paid.revealedFace < 4 ? 2 : 0);
    expectOnlyWagerGold(ready, challenged, paid.goldReturned - paid.goldSpent);
    expect(challenged.depth.innBluff!.admission).toEqual(bluff.admission);
    expect(paid).toMatchObject({ choice: "challenge", outcome: "honest-claim", revealedFace: 5,
      goldSpent: 1, goldReturned: 0, goldBefore: 9, goldAfter: 8 });
    for (const world of [before, ready, result, challenged]) {
      expect(upgradeWorldState(JSON.parse(canonicalStringify(world)))).toEqual(world);
      if (world.depth.innBluff != null) {
        const receipt = world.depth.innBluff.resolution ?? world.depth.innBluff.admission;
        expect(world.chronicle.at(-1)?.commandId).toBe(`${world.campaignId}:${receipt.sourceCommandId}`);
      }
    }
    await installFixture(page, before); await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    // Actual earned checkpoint, fixture-fast playback: not a normal dwell or
    // unattended background-soak claim. No die/HP/gold/host field is staged.
    await page.goto("./?fast", { timeout: 25_000 }); expect(JSON.parse(await pausedSave(page))).toEqual(before);
    const readyRaw = await pausedSave(page, before.tick); expect(JSON.parse(readyRaw)).toEqual(ready);
    await proveInn(page, ready); await capture("inn-bluff-covered-cup-1280"); await proveStatus(page, ready);
    await page.reload({ timeout: 25_000 }); expect(await pausedSave(page)).toBe(readyRaw); await proveInn(page, ready);
    const resultRaw = await pausedSave(page, ready.tick); expect(JSON.parse(resultRaw)).toEqual(result);
    await page.setViewportSize({ width: 320, height: 568 });
    await proveInn(page, result); await capture("inn-bluff-revealed-die-320");
    await page.setViewportSize({ width: 1280, height: 800 }); await proveStatus(page, ready); await proveStatus(page, result);
    expect(await pausedSave(page)).toBe(resultRaw);
    // Existing result reload, synthetic debt only: no real sixty-second wait.
    await page.evaluate(() => sessionStorage.setItem("the-grind-2:test-inn-bluff-resume-debt", "60s"));
    await page.reload({ timeout: 25_000 }); expect(await pausedSave(page)).toBe(resultRaw); await proveInn(page, result);
    const next = advanceWorld(result);
    expect(next.chronicle.at(-1)?.commandType).toBe("plan-route");
    expect(JSON.parse(await pausedSave(page, result.tick))).toEqual(next);
    expect(next.depth.innBluff).toEqual(result.depth.innBluff); expect(next.depth.hero.gold).toBe(result.depth.hero.gold);
    expect(selectInnBluff(next.depth)).toBeNull(); expect(selectInnBluffVenue(next.depth)).toBeNull();
    expect(projectInnBluffScene(next)).toBeNull(); await expect(page.locator("#stage")).not.toHaveAttribute("data-bluff-phase");

    // Separate legal challenge of the SAME actual five, not another natural
    // outcome or a forced face. The winning challenge belongs to focused
    // rules tests; this browser scenario never swaps the hidden die.
    await page.evaluate(world => sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world)), challenged);
    await page.setViewportSize({ width: 320, height: 568 }); await page.reload({ timeout: 25_000 });
    const challengedRaw = await pausedSave(page); expect(JSON.parse(challengedRaw)).toEqual(challenged);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await proveInn(page, challenged); await capture("inn-bluff-costly-challenge-320-focus");
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await page.setViewportSize({ width: 1280, height: 800 }); await proveStatus(page, challenged);
    await page.reload({ timeout: 25_000 }); expect(await pausedSave(page)).toBe(challengedRaw);
    const challengedNext = advanceWorld(challenged);
    expect(JSON.parse(await pausedSave(page, challenged.tick))).toEqual(challengedNext);
    expect(challengedNext.depth.innBluff).toEqual(challenged.depth.innBluff); expect(challengedNext.depth.hero.gold).toBe(challenged.depth.hero.gold);
    expect(selectInnBluff(challengedNext.depth)).toBeNull(); expect(selectInnBluffVenue(challengedNext.depth)).toBeNull();
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
  } finally {
    await testInfo.attach("inn-bluff-evidence", { body: JSON.stringify({
      fixture: "Uninterrupted first-town inn with natural decline; separately authored legal challenge of the same concealed five",
      admissionTick: ready.tick, resolutionTick: result.tick, actualBluff: result.depth.innBluff,
      challengedBluff: challenged.depth.innBluff, elapsedMs: Date.now() - startedAt, errors, inference, external }, null, 2), contentType: "application/json" });
  }
});
