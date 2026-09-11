import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, campaignDirector, upgradeWorldState } from "../src/core/simulation";
import { canonicalStringify } from "../src/core/canonical";
import type { WorldState } from "../src/core/types";
import { selectDungeonLairEncounter } from "../src/depth/dungeon-lair";
import { projectDungeonGuardianScene, projectDungeonLairMark } from "../src/ui/dungeon-guardian-view";
import { projectDungeonPerspectiveView } from "../src/ui/dungeon-perspective-view";
import { projectCombatEnemyFormation } from "../src/render/combat-roster-layout";
import { dungeonLairCampaignId, naturalDungeonGuardianJourneyFixture } from "./dungeon-lair-fixtures";

async function installFixture(page: Page, fixture: WorldState): Promise<void> {
  await page.addInitScript(state => {
    const key = `the-grind-2:campaign:${state.campaignId}`;
    if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, JSON.stringify(state));
    sessionStorage.setItem("the-grind-2:activeCampaignId", state.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${state.campaignId}`, String(Date.now() + 3_600_000));
    localStorage.setItem("the-grind-2:play-mode:v1", '{"schemaVersion":1,"mode":"deterministic"}');
    localStorage.setItem("the-grind-2:adventure-speed:v1", '{"schemaVersion":1,"speed":1}');
    localStorage.setItem("the-grind-2:stage-focus:v1", "panels");
    // The actual menu selection persists across reload; default remains 2D.
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
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Guardian turn did not settle within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const raw = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (raw === null || tick !== undefined && JSON.parse(raw).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; button.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(raw);
    }, 20);
    if (tick !== undefined) button.click();
  }), { id: dungeonLairCampaignId, tick: afterTick });
}

async function choosePerspective(page: Page, perspective: "map" | "first-person"): Promise<void> {
  await page.locator("#game-menu-button").click();
  await page.locator("#dungeon-perspective-select").selectOption(perspective);
  await page.locator("#game-menu-close").click();
}

function priorStories(world: WorldState): string {
  const state = world.depth;
  return canonicalStringify({ repartee: state.repartee, witness: state.reparteeWitness, memory: state.reparteeCallback,
    lesson: state.usefulReply, challenge: state.roomChallenge, bell: state.bellExpedition, bellMemory: state.bellMemory,
    reunion: state.companionReunion, credit: state.companionCredit, smithy: state.smithyJob, inn: state.innBluff,
    gate: state.pennywiseGate, companions: state.companions });
}

async function proveStatus(page: Page, world: WorldState): Promise<void> {
  const source = world.chronicle.at(-1)!;
  const shown = await page.evaluate(eventId => {
    document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="journal"]')!.click();
    document.querySelector<HTMLButtonElement>("#journal-status-button")!.click();
    document.querySelector<HTMLButtonElement>("#journal-status-refresh")!.click();
    const rows = [...document.querySelectorAll<HTMLElement>("#journal-status-list > li")];
    const row = rows.find(entry => entry.dataset.source === "chronicle" && entry.dataset.eventId === eventId)!;
    row.querySelector<HTMLDetailsElement>("details")!.open = true;
    return { count: rows.filter(entry => entry.dataset.source === "chronicle" && entry.dataset.eventId === eventId).length, text: row.textContent };
  }, source.id);
  expect(shown.count).toBe(1);
  for (const text of [source.commandId, source.action, source.consequence]) expect(shown.text).toContain(text);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click());
}

async function proveGeometry(page: Page, battle: boolean): Promise<void> {
  const enemy = projectCombatEnemyFormation(1)[0]!;
  await expect.poll(() => page.evaluate(({ isBattle, enemyX, enemyY }) => {
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
    const points = isBattle ? [[74, 114], [74, 139], [enemyX, enemyY - 25], [enemyX, enemyY]]
      : [[64, 50], [256, 50], [160, 98], [64, 145], [256, 145]];
    const actorsClear = points.every(([px = 0, py = 0]) => document.elementFromPoint(host.left + x + px * scale, host.top + y + py * scale) === canvas);
    let captionFits = true;
    if (!isBattle) {
      const bounds = JSON.parse(stage.dataset.dungeonCaptionBounds ?? "null") as { title: number[] | null; detail: number[] | null } | null;
      const rail = (stage.dataset.dungeonCaptionRail ?? "").split(",").map(Number), [cx = 0, cy = 0, cw = 0, ch = 0] = rail;
      captionFits = bounds?.title != null && bounds.detail != null && rail.length === 4 && cy + ch < 32
        && Number(stage.dataset.dungeonCaptionTitleSize) >= 12 - 0.001 && Number(stage.dataset.dungeonCaptionDetailSize) >= 11 - 0.001
        && [bounds.title, bounds.detail].every(([tx = 0, ty = 0, tw = 0, th = 0]) => tw > 0 && th > 0
          && tx >= cx && ty >= cy && tx + tw <= cx + cw + 0.01 && ty + th <= cy + ch + 0.01)
        && bounds.title[1]! + bounds.title[3]! <= bounds.detail[1]! + 0.01;
    }
    return { wide: room.right - room.left >= (innerWidth <= 760 ? 200 : 350),
      inViewport: room.left >= -1 && room.top >= -1 && room.right <= innerWidth + 1 && room.bottom <= innerHeight + 1,
      unobscured, actorsClear, captionFits, pageFits: document.documentElement.scrollWidth <= innerWidth + 1 };
  }, { isBattle: battle, enemyX: enemy.x, enemyY: enemy.y }), { timeout: 8_000 }).toEqual({
    wide: true, inViewport: true, unobscured: true, actorsClear: true, captionFits: true, pageFits: true });
}

async function proveGuardian(page: Page, world: WorldState): Promise<void> {
  const scene = projectDungeonGuardianScene(world)!, encounter = world.depth.dungeon!.lair!.encounter!;
  expect(scene).not.toBeNull();
  await expect.poll(() => page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset })), { timeout: 8_000 })
    .toMatchObject({ dungeonGuardianPhase: scene.phase, dungeonGuardianCommand: world.chronicle.at(-1)!.commandId,
      dungeonGuardianDungeon: encounter.dungeonId, dungeonGuardianCell: encounter.cellId, dungeonGuardianCombat: encounter.combatId,
      dungeonGuardianId: encounter.guardian.id, dungeonGuardianName: encounter.guardian.name });
  const stage = await page.locator("#stage").evaluate(node => ({ ...(node as HTMLElement).dataset }));
  if (scene.phase === "entered") {
    expect(stage.dungeonLairMark).toBe(JSON.stringify(projectDungeonLairMark(world.depth.dungeon!)));
    expect(stage.dungeonCaptionTitle).toBe("THE ROOM IS TAKEN");
    expect(stage.dungeonCaptionDetail).toBe(stage.dungeonCaptionLayout === "compact"
      ? "I HAD HOPED: FORMER LAIR" : "The map said lair. I had hoped it meant former lair.");
  } else {
    const combat = world.depth.combat ?? encounter.resolution!.combat;
    expect(stage.combatId).toBe(encounter.combatId); expect(stage.combatThreatRating).toBe("dungeon-bound");
    expect(stage.dungeonGuardianVisual).toBe("native-stone-chamber");
    const roster = JSON.parse(stage.combatRoster!) as { id: string; health: number; maxHealth: number; mana: number; maxMana: number }[];
    expect(roster).toHaveLength(2);
    for (const unit of combat.combatants) expect(roster.find(entry => entry.id === unit.id)).toMatchObject({
      health: unit.health, maxHealth: unit.maxHealth, mana: unit.mana, maxMana: unit.maxMana });
    if (encounter.resolution !== null) expect(stage.combatOutcome).toBe(encounter.resolution.outcome);
  }
  await expect(page.locator("#repartee-caption")).toBeHidden();
  await proveGeometry(page, scene.phase !== "entered");
}

test("an actual entered lair admits one guardian, retains its real defeat, and recovers without replaying the encounter", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const journey = naturalDungeonGuardianJourneyFixture();
  const { before, arrived, started, turns, resolved, next } = journey;
  const encounter = resolved.depth.dungeon!.lair!.encounter!, resolution = encounter.resolution!;
  const errors: string[] = [], inference: string[] = [], external: string[] = [], startedAt = Date.now();
  const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("worker", worker => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
  page.on("request", request => {
    if (modelUrl.test(request.url())) inference.push(request.url());
    if (new URL(request.url()).origin !== new URL(testInfo.project.use.baseURL!).origin) external.push(request.url());
  });
  const milestone = (message: string): void => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map(part => [part.type, part.value]));
    console.log(`[${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${parts.timeZoneName}] Dungeon lair +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${message}`);
  };
  const capture = async (name: string): Promise<void> => {
    if (process.env.TG2_VISUAL_CAPTURE !== "1") return;
    const path = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path, timeout: 8_000 });
    await testInfo.attach(name, { path, contentType: "image/png" });
  };
  try {
    expect([before.tick, arrived.tick, started.tick, resolved.tick, next.tick]).toEqual([104, 105, 106, 108, 109]);
    expect(before.depth.dungeon!.visitedCellIds).not.toContain(encounter.cellId);
    expect(projectDungeonLairMark(before.depth.dungeon!)).toBeNull();
    expect(projectDungeonPerspectiveView(before)!.guardian).toBeNull();
    expect(arrived.depth.dungeon!.visitedCellIds).toContain(encounter.cellId);
    expect(arrived.hero.experience - before.hero.experience).toBe(4); // Existing first-room exploration XP, not guardian reward.
    expect(arrived.depth.hero.resources).toEqual(before.depth.hero.resources);
    expect(arrived.chronicle.at(-1)?.commandId).toBe(`${arrived.campaignId}:${encounter.arrival.sourceCommandId}`);
    const selected = selectDungeonLairEncounter(arrived.depth)!;
    expect(campaignDirector(arrived).candidates[0]?.command).toEqual({ type: "start-dungeon-guardian",
      dungeonId: encounter.dungeonId, cellId: encounter.cellId, encounterId: encounter.combatId });
    expect(selected.enemyCount).toBe(1);
    expect(started.chronicle.at(-1)?.commandId).toBe(`${started.campaignId}:${encounter.started!.sourceCommandId}`);
    expect(started.hero.experience - arrived.hero.experience).toBe(8); // Existing ordinary battle-entry XP.
    expect(started.depth.hero.resources).toEqual(arrived.depth.hero.resources);
    expect(started.depth.combat!.combatants.map(unit => unit.id)).toEqual([arrived.hero.id, encounter.guardian.id]);
    expect(resolution.outcome).toBe("defeat"); // Actual fixed journey, not a forced or substituted victory.
    expect(turns).toHaveLength(2);
    expect(turns[0]!.hero.experience - started.hero.experience).toBe(8); // Actual hero ability action.
    expect(resolved.hero.experience).toBe(turns[0]!.hero.experience); // Enemy action gives no hero-action XP.
    expect(resolved.depth.hero.resources.health).toBe(0);
    expect(resolved.depth.hero.resources.mana).toBe(21);
    expect(resolved.depth.hero.gold).toBe(arrived.depth.hero.gold);
    expect(resolved.depth.hero.inventory).toEqual(arrived.depth.hero.inventory);
    expect(resolved.depth.quest).toEqual(arrived.depth.quest);
    expect(resolved.depth.completedCombats.filter(combat => combat.id === encounter.combatId)).toEqual([resolution.combat]);
    expect(projectDungeonLairMark(resolved.depth.dungeon!)!.status).toBe("unbeaten");
    expect(selectDungeonLairEncounter(resolved.depth)).toBeNull();
    for (const state of [before, arrived, started, ...turns, next]) {
      expect(upgradeWorldState(JSON.parse(canonicalStringify(state)))).toEqual(state);
      expect(priorStories(state)).toBe(priorStories(before));
    }
    for (const state of [started, ...turns]) {
      expect(state.depth.dungeon!.currentCellId).toBe(encounter.cellId);
      expect(state.depth.dungeon!.visitedCellIds).toEqual(arrived.depth.dungeon!.visitedCellIds);
      expect(state.depth.dungeon!.turns).toBe(arrived.depth.dungeon!.turns);
    }
    // Explicit old-save compatibility boundary: an absent optional field stays
    // absent after the same legal move. This is not another natural campaign.
    const legacy = JSON.parse(JSON.stringify(before)) as WorldState;
    delete legacy.depth.dungeon!.lair;
    expect(upgradeWorldState(JSON.parse(canonicalStringify(legacy)))).toEqual(legacy);
    expect(advanceWorld(legacy).depth.dungeon).not.toHaveProperty("lair");

    await installFixture(page, before);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    // Fast fixture playback, not a claim about normal eight-second dwell time.
    await page.goto("./?fast", { timeout: 25_000 });
    expect(JSON.parse(await pausedSave(page))).toEqual(before);
    expect(await page.locator("#stage").getAttribute("data-dungeon-lair-mark")).toBe("null");
    const arrivedRaw = await pausedSave(page, before.tick);
    expect(JSON.parse(arrivedRaw)).toEqual(arrived);
    await proveGuardian(page, arrived); await capture("dungeon-lair-entered-1280");
    await choosePerspective(page, "first-person");
    await page.setViewportSize({ width: 320, height: 568 });
    await expect(page.locator("#stage")).toHaveAttribute("data-dungeon-perspective", "first-person");
    await expect(page.locator("#stage")).toHaveAttribute("data-dungeon-perspective-guardian", JSON.stringify(projectDungeonLairMark(arrived.depth.dungeon!)));
    await proveGuardian(page, arrived); await capture("dungeon-lair-entered-first-person-320");
    expect(await pausedSave(page)).toBe(arrivedRaw);
    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(arrivedRaw);
    await expect(page.locator("#stage")).toHaveAttribute("data-dungeon-perspective", "first-person");
    await proveGuardian(page, arrived);
    milestone("T105 genuine first lair entry, 2D/first-person public mark and exact reload; no unseen guardian revealed");

    expect(JSON.parse(await pausedSave(page, arrived.tick))).toEqual(started);
    await proveGuardian(page, started);
    await page.setViewportSize({ width: 1280, height: 800 });
    await proveGuardian(page, started);
    await proveStatus(page, arrived); await proveStatus(page, started);
    let previous = started, resultRaw = "";
    for (const state of turns) {
      resultRaw = await pausedSave(page, previous.tick);
      expect(JSON.parse(resultRaw)).toEqual(state);
      await proveGuardian(page, state);
      previous = state;
    }
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await proveGuardian(page, resolved); await capture("dungeon-lair-defeat-320-focus");
    expect(await pausedSave(page)).toBe(resultRaw);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await proveStatus(page, resolved);
    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(resultRaw);
    await proveGuardian(page, resolved);
    milestone(`T108 actual ${resolution.outcome}, no victory gold/loot, one saved terminal source, same room and unchanged earlier stories`);

    expect(campaignDirector(resolved).candidates[0]?.command.type).toBe("wait");
    const nextRaw = await pausedSave(page, resolved.tick);
    expect(JSON.parse(nextRaw)).toEqual(next);
    expect(next.depth.dungeon!.currentCellId).toBe(next.depth.dungeon!.entryCellId);
    expect(next.depth.hero.resources.health).toBe(11);
    expect(next.depth.hero.resources.mana).toBe(next.depth.hero.resources.maxMana);
    expect(next.hero.experience - resolved.hero.experience).toBe(1); // Existing ordinary recovery, not repeated battle XP.
    expect(next.depth.hero.inventory).toEqual(resolved.depth.hero.inventory);
    expect(next.depth.hero.gold).toBe(resolved.depth.hero.gold);
    expect(next.depth.dungeon!.lair).toEqual(resolved.depth.dungeon!.lair);
    expect(next.depth.completedCombats.filter(combat => combat.id === encounter.combatId)).toEqual([resolution.combat]);
    expect(projectDungeonGuardianScene(next)).toBeNull();
    expect(projectDungeonPerspectiveView(next)).toBeNull(); // Recovery is a camp, not an invented first-person room.
    expect(selectDungeonLairEncounter(next.depth)).toBeNull();
    await expect(page.locator("#stage")).not.toHaveAttribute("data-dungeon-guardian-command");
    await proveStatus(page, resolved);
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone("T109 ordinary defeat recovery at the entrance; retained unbeaten history, no repeated encounter, no runtime/model/external requests");
  } finally {
    await testInfo.attach("Dungeon lair actual source diagnostics", { body: JSON.stringify({ errors, inference, external,
      ticks: [before.tick, arrived.tick, started.tick, resolved.tick, next.tick], combatCommands: turns.length,
      guardian: encounter.guardian, arrival: encounter.arrival, started: encounter.started,
      terminal: { sourceCommandId: resolution.sourceCommandId, tick: resolution.tick, outcome: resolution.outcome },
      resourcesBefore: arrived.depth.hero.resources, resourcesAfter: resolved.depth.hero.resources,
      goldBefore: arrived.depth.hero.gold, goldAfter: resolved.depth.hero.gold, elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
