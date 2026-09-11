import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, campaignDirector, createWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { reparteeWitnessPreference } from "../src/depth/repartee-witness";

const campaignId = "campaign:browser-repartee-witness";

function naturalEncoreFixture(): WorldState {
  let world = createWorld("shared-road-lifecycle", campaignId);
  // One bounded known-seed replay. No staged level, location, companion, reading,
  // old transcript, declared preference or witness reaction enters this save.
  for (let turn = 0; turn < 384; turn++) {
    if (world.depth.repartee.completed !== null && world.depth.companions.active.length === 1
      && campaignDirector(world).candidates[0]?.command.type === "start-repartee") return world;
    world = advanceWorld(world);
  }
  throw new Error("Known campaign did not offer a real witnessed encore within 384 turns");
}

async function pausedSave(page: Page, afterTick?: number): Promise<string> {
  return page.evaluate(async ({ id, tick }) => new Promise<string>((resolve, reject) => {
    const app = document.querySelector<HTMLElement>("#app")!;
    const pause = document.querySelector<HTMLButtonElement>("#pause-button")!;
    let requested = false;
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Witness story did not settle and pause within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const saved = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (saved === null || tick !== undefined && JSON.parse(saved).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; pause.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(saved);
    }, 20);
    if (tick !== undefined) pause.click();
  }), { id: campaignId, tick: afterTick });
}

async function automaticStep(page: Page, before: WorldState, command: string): Promise<{ state: WorldState; saved: string }> {
  expect(campaignDirector(before).candidates[0]?.command.type).toBe(command);
  const saved = await pausedSave(page, before.tick), state = JSON.parse(saved) as WorldState;
  expect(state).toEqual(advanceWorld(before));
  expect(state.chronicle.at(-1)?.commandType).toBe(command);
  return { state, saved };
}

async function exactReload(page: Page, saved: string): Promise<void> {
  await page.reload({ timeout: 25_000 });
  expect(await pausedSave(page)).toBe(saved);
  expect(upgradeWorldState(JSON.parse(saved))).toEqual(JSON.parse(saved));
}

test("an actual road companion witnesses a flyting encore and keeps one exact cause-bound opinion", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const startedAt = Date.now(), errors: string[] = [], inference: string[] = [], external: string[] = [];
  const milestone = (message: string): void => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map(part => [part.type, part.value]));
    console.log(`[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}] Witness encore +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${message}`);
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
  const proveCaption = async (state: WorldState, phase: string): Promise<void> => {
    const proof = await page.evaluate(async () => {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const caption = document.querySelector<HTMLElement>("#repartee-caption")!, rows = [];
      for (const row of caption.querySelectorAll<HTMLElement>("h2, .repartee-call, .repartee-reply, .repartee-marks, .repartee-note, .repartee-witness")) {
        if (row.getClientRects().length === 0) continue;
        row.scrollIntoView({ block: "nearest", inline: "nearest" });
        const box = row.getBoundingClientRect(), clip = caption.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        rows.push({ text: row.textContent, font: parseFloat(getComputedStyle(row).fontSize),
          contained: box.top >= clip.top + caption.clientTop - 1 && box.bottom <= clip.top + caption.clientTop + caption.clientHeight + 1
            && box.left >= clip.left + caption.clientLeft - 1 && box.right <= clip.right + 1,
          unobscured: hit !== null && (hit === row || row.contains(hit)) });
      }
      return { hidden: caption.hidden, caption: { ...caption.dataset }, stage: { ...document.querySelector<HTMLElement>("#stage")!.dataset },
        witness: caption.querySelector(".repartee-witness")?.textContent, rows,
        fits: document.documentElement.scrollWidth <= innerWidth + 1,
        staleCombat: !document.querySelector<HTMLElement>("#battle-turn-strip")!.hidden };
    });
    const preference = state.depth.reparteeWitness.preference!, reaction = state.depth.reparteeWitness.reaction;
    expect(proof.hidden).toBe(false);
    expect(proof.caption).toMatchObject({ phase, command: state.chronicle.at(-1)!.commandId,
      witness: preference.witnessId, encore: "true", regard: reaction === null ? "unestablished" : String(reaction.regardAfter) });
    expect(proof.stage).toMatchObject({ reparteeWitness: preference.witnessId,
      reparteeWitnessPose: reaction?.pose ?? "watching" });
    expect(proof.witness).toContain(state.depth.companions.active[0]!.identity.name);
    expect(proof.witness).toContain(reaction?.line ?? reparteeWitnessPreference(preference.preferenceId).label.toLocaleLowerCase());
    expect(proof.fits).toBe(true); expect(proof.staleCombat).toBe(false);
    expect(proof.rows.length).toBeGreaterThanOrEqual(4);
    for (const row of proof.rows) {
      expect(row.contained, row.text ?? "caption row").toBe(true);
      expect(row.unobscured, row.text ?? "caption row").toBe(true);
      expect(row.font).toBeGreaterThanOrEqual(11);
    }
    // The canvas element can fill the screen while its actual 320×180 scene is
    // tiny or hidden beneath navigation. Check the rendered scene transform,
    // not merely text clipping or the host/canvas bounding box.
    await expect.poll(async () => page.evaluate(commandId => {
      const stage = document.querySelector<HTMLElement>("#stage")!;
      const canvas = stage.querySelector("canvas")!;
      const layout = (stage.dataset.sceneLayout ?? "").split(",").map(Number);
      const safe = (stage.dataset.reparteeSafeRect ?? "").split(",").map(Number);
      if (layout.length !== 3 || safe.length !== 4 || [...layout, ...safe].some(value => !Number.isFinite(value))) return null;
      const [scale = 0, x = 0, y = 0] = layout;
      const [left = 0, top = 0, right = 0, bottom = 0] = safe;
      const host = stage.getBoundingClientRect(), canvasRect = canvas.getBoundingClientRect();
      const scene = { left: host.left + x, top: host.top + y,
        right: host.left + x + 320 * scale, bottom: host.top + y + 180 * scale };
      const overlaps = [".topbar", ".view-toolbar", "#stage-focus-ribbon", "#stage-focus-controls", "#repartee-caption"]
        .filter(selector => {
          const panel = document.querySelector<HTMLElement>(selector);
          if (panel === null || panel.hidden) return false;
          const style = getComputedStyle(panel), bounds = panel.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && bounds.width > 0 && bounds.height > 0
            && scene.left < bounds.right - 0.5 && scene.right > bounds.left + 0.5
            && scene.top < bounds.bottom - 0.5 && scene.bottom > bounds.top + 0.5;
        });
      // Witness, hero and rival head/torso points from the three-person scene.
      // Each must hit the canvas itself, not an overlaid menu or caption.
      const actorsClear = [[43, 115], [111, 108], [242, 108]].every(([actorX = 0, actorY = 0]) =>
        document.elementFromPoint(host.left + x + actorX * scale, host.top + y + actorY * scale) === canvas);
      const minimumWidth = innerWidth <= 760 ? Math.min(280, innerWidth - 32) : 380;
      return {
        commandBound: stage.dataset.reparteeCommand === commandId,
        adequateScene: 320 * scale >= minimumWidth - 1,
        insideSafeArea: scale > 0 && x >= left - 1 && y >= top - 1
          && x + 320 * scale <= right + 1 && y + 180 * scale <= bottom + 1,
        insideViewport: scene.left >= -1 && scene.top >= -1 && scene.right <= innerWidth + 1 && scene.bottom <= innerHeight + 1,
        insideCanvas: scene.left >= canvasRect.left - 1 && scene.top >= canvasRect.top - 1
          && scene.right <= canvasRect.right + 1 && scene.bottom <= canvasRect.bottom + 1,
        actorsClear, overlaps,
      };
    }, state.chronicle.at(-1)!.commandId), { timeout: 8_000,
      message: "Witness, hero and rival need a readable rendered stage clear of navigation and narration in both normal and Focus layouts" }).toMatchObject({
      commandBound: true, adequateScene: true, insideSafeArea: true, insideViewport: true,
      insideCanvas: true, actorsClear: true, overlaps: [],
    });
  };
  try {
    const ready = naturalEncoreFixture(), original = ready.depth.repartee;
    milestone(`natural T${ready.tick} ready; actual book and solo contest precede actual ${ready.depth.companions.active[0]!.identity.name} recruitment`);
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
    let { state, saved } = await automaticStep(page, ready, "start-repartee");
    expect(state.depth.reparteeWitness.firstContest).toEqual(original);
    expect(state.depth.repartee.reading).toEqual(original.reading);
    expect(state.depth.reparteeWitness.reaction).toBeNull();
    await proveCaption(state, "challenge");
    await capture("witness-declaration-1280");
    await exactReload(page, saved);
    for (let round = 0; round < 3; round++) {
      ({ state, saved } = await automaticStep(page, state, "repartee-action"));
      expect(state.depth.hero).toEqual(ready.depth.hero);
      expect(state.depth.companions).toEqual(ready.depth.companions);
      expect(state.depth.reparteeWitness.firstContest).toEqual(original);
      await proveCaption(state, round === 2 ? "result" : "round");
      if (round === 0) await exactReload(page, saved);
      milestone(`reply ${round + 1} committed with exact unchanged hero/bond and archived original transcript`);
    }
    const reaction = state.depth.reparteeWitness.reaction!, result = state.depth.repartee.completed!;
    expect(reaction.completionCommandId).toBe(result.completionCommandId);
    expect(reaction.regardBefore).toBeNull();
    expect(result.rounds).toContainEqual(reaction.evidence);
    await capture("witness-result-1280");
    await page.setViewportSize({ width: 320, height: 568 });
    await proveCaption(state, "result");
    await capture("witness-result-320");
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await proveCaption(state, "result");
    await capture("witness-result-320-focus");
    expect(await pausedSave(page)).toBe(saved);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    const journal = await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="journal"]')!.click();
      const panel = document.querySelector<HTMLDetailsElement>("#journal-repartee")!; panel.open = true;
      return { text: panel.textContent, reaction: { ...panel.querySelector<HTMLElement>("[data-witness-reaction]")!.dataset },
        transcripts: [...panel.querySelectorAll<HTMLOListElement>('ol[aria-label="Exact flyting transcript"]')].map(list => ({
          encounter: list.dataset.encounter, contest: list.dataset.contest,
          rows: [...list.querySelectorAll<HTMLElement>(":scope > li")].map(row => ({ command: row.dataset.command,
            call: row.querySelector(".repartee-call")!.textContent, reply: row.querySelector(".repartee-reply")!.textContent })),
        })) };
    });
    expect(journal.reaction).toMatchObject({ witnessReaction: reaction.reactionId, witness: reaction.witnessId,
      command: reaction.completionCommandId, regard: String(reaction.regardAfter) });
    expect(journal.text).toContain(reaction.line);
    expect(journal.text).toContain(reaction.evidence!.sourceCommandId);
    expect(journal.transcripts).toEqual([original.completed!, result].map((duel, index) => ({
      encounter: duel.encounterId, contest: index === 0 ? "original" : "encore",
      rows: duel.rounds.map(round => ({ command: round.sourceCommandId,
        call: `${state.depth.towns[duel.locationId]!.residents.find(resident => resident.id === duel.residentId)!.name}: ${round.call}`,
        reply: `${state.hero.name}: ${round.reply}` })),
    })));
    await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click());
    await exactReload(page, saved);
    const routed = await automaticStep(page, state, "plan-route");
    expect(routed.state.depth.reparteeWitness).toEqual(state.depth.reparteeWitness);
    expect(routed.state.depth.atlas.route?.destinationId).toBe(ready.depth.companions.active[0]!.destination.locationId);
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone(`${result.outcome}; ${reaction.reactionId}, regard ${reaction.regardAfter}; three-person stage, exact Journal/reloads and original oath route passed`);
  } finally {
    await testInfo.attach("Witness encore diagnostics", { body: JSON.stringify({ errors, inference, external,
      elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
