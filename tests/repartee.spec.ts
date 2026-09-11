import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, campaignDirector, createWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { reparteeBook, reparteeChallenges, reparteeResponses } from "../src/depth/repartee";

const campaignId = "campaign:browser-repartee";

async function pauseOnReady(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    let pauseRequested = false;
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Ready adventure did not pause within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const app = document.querySelector<HTMLElement>("#app")!;
      if (!pauseRequested && app.dataset.presentationPaused !== "true") {
        pauseRequested = true; document.querySelector<HTMLButtonElement>("#pause-button")!.click();
      }
      if (app.dataset.presentationPaused !== "true") return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve();
    }, 20);
  }));
}

async function snapshot(page: Page, afterTick?: number) {
  return page.evaluate(async ({ id, tick }) => {
    if (tick !== undefined) await new Promise<void>((resolve, reject) => {
      const app = document.querySelector<HTMLElement>("#app")!;
      const pause = document.querySelector<HTMLButtonElement>("#pause-button")!;
      let pauseRequested = false;
      const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Automatic flyting turn did not settle within 20 seconds")); }, 20_000);
      const poll = window.setInterval(() => {
        const saved = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
        if (saved === null || JSON.parse(saved).tick <= tick) return;
        if (!pauseRequested && app.dataset.presentationPaused !== "true") { pauseRequested = true; pause.click(); }
        if (app.dataset.presentationPaused !== "true" || Number(app.dataset.simulationTick) <= tick) return;
        window.clearInterval(poll); window.clearTimeout(timeout); resolve();
      }, 20);
      pause.click();
    });
    return { stage: { ...document.querySelector<HTMLElement>("#stage")!.dataset },
      saved: sessionStorage.getItem(`the-grind-2:campaign:${id}`),
      paused: document.querySelector<HTMLElement>("#app")!.dataset.presentationPaused };
  }, { id: campaignId, tick: afterTick });
}

async function automaticStep(page: Page, before: WorldState, command: string) {
  expect(campaignDirector(before).candidates[0]?.command.type).toBe(command);
  const view = await snapshot(page, before.tick);
  const after = JSON.parse(view.saved!) as WorldState;
  expect(after).toEqual(advanceWorld(before));
  expect(after.chronicle.at(-1)?.commandType).toBe(command);
  return { after, view };
}

async function exactReload(page: Page, saved: string): Promise<void> {
  await page.reload({ timeout: 25_000 });
  await pauseOnReady(page);
  expect((await snapshot(page)).saved).toBe(saved);
  expect(upgradeWorldState(JSON.parse(saved))).toEqual(JSON.parse(saved));
}

function naturalReadingFixture(): WorldState {
  let world = createWorld("browser-dungeon-search:8", campaignId);
  // One bounded replay of a known seed, not a seed sweep or invented book,
  // level, venue, resident, transcript, or reward. Browser resumes this save.
  for (let steps = 0; steps < 384; steps += 1) {
    if (campaignDirector(world).candidates[0]?.command.type === "read-book") return world;
    world = advanceWorld(world);
  }
  throw new Error("Known seed did not reach a first eligible reading within 384 canonical turns");
}

test("a real town book opens learned replies, then a three-round flyting contest saves its exact transcript", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const startedAt = Date.now();
  const milestone = (label: string): void => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    console.log(`[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}] Books & Flyting +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${label}`);
  };
  const errors: string[] = [], inference: string[] = [], external: string[] = [];
  const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("worker", (worker) => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
  page.on("request", (request) => {
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
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const caption = document.querySelector<HTMLElement>("#repartee-caption")!;
      const rows = [];
      for (const row of caption.querySelectorAll<HTMLElement>("h2, .repartee-call, .repartee-reply, .repartee-marks, .repartee-note")) {
        if (row.getClientRects().length === 0) continue;
        row.scrollIntoView({ block: "nearest", inline: "nearest" });
        // Geometry reads synchronously flush the static, reduced-motion caption.
        // Do not wait two extra frames per row on a device under CI load.
        const box = row.getBoundingClientRect(), clip = caption.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        rows.push({ text: row.textContent, fontSize: parseFloat(getComputedStyle(row).fontSize),
          contained: box.top >= clip.top + caption.clientTop - 1 && box.bottom <= clip.top + caption.clientTop + caption.clientHeight + 1
            && box.left >= clip.left + caption.clientLeft - 1 && box.right <= clip.right + 1,
          unobscured: hit !== null && (hit === row || row.contains(hit)) });
      }
      return { hidden: caption.hidden, data: { ...caption.dataset }, rows,
        noteVisible: (caption.querySelector(".repartee-note")?.getClientRects().length ?? 0) > 0,
        fits: document.documentElement.scrollWidth <= innerWidth + 1,
        staleCombat: !document.querySelector<HTMLElement>("#battle-turn-strip")!.hidden };
    });
    expect(proof.hidden).toBe(false);
    expect(proof.data).toMatchObject({ phase, command: state.chronicle.at(-1)!.commandId, book: reparteeBook.id, hero: state.hero.id });
    expect(proof.fits).toBe(true);
    expect(proof.staleCombat).toBe(false);
    if (phase === "reading" || phase === "result") expect(proof.noteVisible).toBe(true);
    expect(proof.rows.length).toBeGreaterThanOrEqual(3);
    for (const row of proof.rows) {
      expect(row.contained, row.text ?? "caption row").toBe(true);
      expect(row.unobscured, row.text ?? "caption row").toBe(true);
      expect(row.fontSize).toBeGreaterThanOrEqual(11);
    }
  };
  try {
    const fixture = naturalReadingFixture();
    expect(fixture.depth.repartee).toEqual({ schemaVersion: 1, reading: null, active: null, completed: null });
    expect(reparteeResponses(fixture.depth.repartee).some((response) => response.classification === "direct")).toBe(false);
    await page.addInitScript((saved) => {
      const key = `the-grind-2:campaign:${saved.campaignId}`;
      if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, JSON.stringify(saved));
      sessionStorage.setItem("the-grind-2:activeCampaignId", saved.campaignId);
      localStorage.setItem(`the-grind-2:last-active:${saved.campaignId}`, String(Date.now() + 3_600_000));
      localStorage.setItem("the-grind-2:play-mode:v1", '{"schemaVersion":1,"mode":"deterministic"}');
      localStorage.setItem("the-grind-2:adventure-speed:v1", '{"schemaVersion":1,"speed":1}');
      localStorage.setItem("the-grind-2:stage-focus:v1", "panels");
      // Use the real pause control before the first 250ms fast-fixture beat,
      // including reloads. No state or transcript is changed by this harness.
      const pause = window.setInterval(() => {
        if (document.documentElement?.dataset.ready !== "true") return;
        const app = document.querySelector<HTMLElement>("#app");
        const button = document.querySelector<HTMLButtonElement>("#pause-button");
        if (app === null || button === null) return;
        if (app.dataset.presentationPaused !== "true") button.click();
        window.clearInterval(pause);
      }, 20);
    }, fixture);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    // Existing fast mode bypasses presentation dwell, not canonical rules.
    await page.goto("./?fast", { timeout: 25_000 });
    await pauseOnReady(page);
    expect(JSON.parse((await snapshot(page)).saved!)).toEqual(fixture);
    const read = await automaticStep(page, fixture, "read-book");
    const reading = read.after.depth.repartee.reading!;
    expect(reading.addedEntryIds).toEqual(reparteeBook.entryIds);
    expect(reading.addedFrameIds).toEqual(reparteeBook.frameIds);
    expect(`${read.after.campaignId}:${reading.sourceCommandId}`).toBe(read.after.chronicle.at(-1)!.commandId);
    expect(read.after.depth.hero.resources).toEqual(fixture.depth.hero.resources);
    expect(read.after.depth.hero.experience).toBe(fixture.depth.hero.experience);
    expect(read.after.depth.hero.gold).toBe(fixture.depth.hero.gold);
    expect(read.after.depth.towns[reading.locationId]!.reputation).toBe(fixture.depth.towns[reading.locationId]!.reputation);
    expect(reparteeResponses(read.after.depth.repartee).some((response) => response.classification === "direct")).toBe(true);
    await proveCaption(read.after, "reading");
    await capture("repartee-reading-1280");
    await exactReload(page, read.view.saved!);
    milestone(`natural T${fixture.tick} handoff; actual reading unlocked 12 expressions and two frames, exact reload retained them`);
    let { after: state, view } = await automaticStep(page, read.after, "start-repartee");
    const duel = state.depth.repartee.active!;
    const town = state.depth.towns[duel.locationId]!;
    const building = town.buildings.find((entry) => entry.id === duel.buildingId)!;
    const resident = town.residents.find((entry) => entry.id === duel.residentId)!;
    expect(["hall", "inn"]).toContain(building.kind);
    expect(building.residentIds).toContain(resident.id);
    expect(duel.readingSourceCommandId).toBe(reading.sourceCommandId);
    await proveCaption(state, "challenge");
    for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
      ({ after: state, view } = await automaticStep(page, state, "repartee-action"));
      const round = (state.depth.repartee.active ?? state.depth.repartee.completed)!.rounds.at(-1)!;
      expect(round.roundIndex).toBe(roundIndex);
      expect(round.call).toBe(reparteeChallenges[roundIndex]!.text);
      expect(`${state.campaignId}:${round.sourceCommandId}`).toBe(state.chronicle.at(-1)!.commandId);
      expect(state.depth.hero.resources).toEqual(fixture.depth.hero.resources);
      expect(state.depth.hero.experience).toBe(fixture.depth.hero.experience);
      expect(state.depth.hero.gold).toBe(fixture.depth.hero.gold);
      if (roundIndex === 0) await exactReload(page, view.saved!);
      await proveCaption(state, roundIndex === 2 ? "result" : "round");
      milestone(`recorded reply ${roundIndex + 1}: ${round.classification}, momentum ${round.momentum}; exact caption and save matched`);
    }
    const result = state.depth.repartee.completed!;
    expect(state.depth.repartee.active).toBeNull();
    expect(result.rounds).toHaveLength(3);
    expect(`${state.campaignId}:${result.completionCommandId}`).toBe(state.chronicle.at(-1)!.commandId);
    expect(new Set(result.rounds.map((round) => round.reply)).size).toBe(3);
    expect(result.reputationAward).toBe(result.outcome === "victory" ? Math.min(1, 100 - result.reputationBefore) : 0);
    expect(state.depth.towns[result.locationId]!.reputation).toBe(result.reputationAfter);
    expect(result.reputationAfter - result.reputationBefore).toBe(result.reputationAward);
    for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      await proveCaption(state, "result");
      expect((await snapshot(page)).saved).toBe(view.saved);
      await capture(`repartee-result-${viewport.width}`);
    }
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await proveCaption(state, "result");
    await capture("repartee-result-320-focus");
    expect((await snapshot(page)).saved).toBe(view.saved);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    const journal = await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="journal"]')!.click();
      const panel = document.querySelector<HTMLDetailsElement>("#journal-repartee")!;
      panel.open = true;
      const transcript = [...panel.querySelectorAll<HTMLElement>('ol[aria-label="Exact flyting transcript"] > li')].map((row) => ({
        command: row.dataset.command, call: row.querySelector(".repartee-call")!.textContent,
        reply: row.querySelector(".repartee-reply")!.textContent,
      }));
      const result = { text: panel.textContent, transcript, entries: panel.querySelectorAll("[data-entry]").length };
      document.querySelector<HTMLButtonElement>("#journal-status-button")!.click();
      document.querySelector<HTMLButtonElement>("#journal-status-refresh")!.click();
      return { ...result, statusRows: [...document.querySelectorAll<HTMLElement>('#journal-status-list [data-source="chronicle"]')].map((row) => ({
        event: row.dataset.eventId, action: row.querySelector(".journal-status-action")!.textContent,
        consequence: row.querySelector(".journal-status-consequence")!.textContent,
      })) };
    });
    expect(journal.entries).toBe(12);
    expect(journal.text).toContain(reading.sourceCommandId);
    expect(journal.transcript).toEqual(result.rounds.map((round) => ({ command: round.sourceCommandId,
      call: `${resident.name}: ${round.call}`, reply: `${state.hero.name}: ${round.reply}` })));
    for (const source of state.chronicle.filter((entry) => ["read-book", "start-repartee", "repartee-action"].includes(entry.commandType ?? ""))) {
      expect(journal.statusRows).toContainEqual({ event: source.id, action: source.action, consequence: source.consequence });
    }
    await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click());
    await exactReload(page, view.saved!);
    expect(JSON.parse((await snapshot(page)).saved!).depth.repartee.completed).toEqual(result);
    expect(campaignDirector(state).candidates.every((candidate) => !["read-book", "start-repartee", "repartee-action"].includes(candidate.command.type))).toBe(true);
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone(`three autonomous replies, ${result.outcome}, reputation +${result.reputationAward}; desktop/mobile/focus, Journal sources and exact result reload passed`);
  } finally {
    milestone(`browser diagnostics: ${errors.length} errors, ${inference.length} inference, ${external.length} external requests`);
    await testInfo.attach("Books & Flyting diagnostics", { body: JSON.stringify({ errors, inference, external, elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
