import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, campaignDirector, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { projectBellBoard } from "../src/depth/borrowed-bell";
import { naturalBorrowedBellFixture, borrowedBellCampaignId } from "./borrowed-bell-fixtures";

async function pausedSave(page: Page, afterTick?: number): Promise<string> {
  return page.evaluate(async ({ id, tick }) => new Promise<string>((resolve, reject) => {
    const app = document.querySelector<HTMLElement>("#app")!, button = document.querySelector<HTMLButtonElement>("#pause-button")!;
    let requested = false;
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Bell turn did not settle and pause within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const saved = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (saved === null || tick !== undefined && JSON.parse(saved).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; button.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(saved);
    }, 20);
    if (tick !== undefined) button.click();
  }), { id: borrowedBellCampaignId, tick: afterTick });
}

test("a real farewell opens a finite delivery board with committed dice and one honest reward", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const ready = naturalBorrowedBellFixture(), errors: string[] = [], inference: string[] = [], external: string[] = [];
  let current = ready, saved = "";
  const startedAt = Date.now();
  const milestone = (message: string): void => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map(part => [part.type, part.value]));
    console.log(`[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}] Borrowed Bell +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${message}`);
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
  const proveBoard = async (state: WorldState): Promise<void> => {
    const board = state.depth.bellExpedition!, move = board.turns.at(-1), pending = board.pendingRoll;
    const phase = board.completion !== null ? "result" : pending !== null ? "roll" : move === undefined ? "admission" : "move";
    const known = projectBellBoard(board).cells.map(cell => ({ id: cell.id, disclosure: cell.disclosure, text: cell.effectText }));
    expect(known.filter(cell => [3, 6].includes(cell.id)).every(cell => cell.disclosure === "unrevealed")).toBe(true);
    // One coherent DOM observation retains all assertions without sixteen IPC
    // round-trips per board beat on software-rendered CI browsers.
    await expect.poll(async () => page.evaluate(() => {
      const caption = document.querySelector<HTMLElement>("#bell-caption")!, stage = document.querySelector<HTMLElement>("#stage")!;
      const visible = (node: HTMLElement): boolean => !node.hidden && getComputedStyle(node).display !== "none" && node.getBoundingClientRect().width > 0;
      return { caption: { ...caption.dataset }, stage: { ...stage.dataset }, visible: visible(caption),
        staleBattle: visible(document.querySelector<HTMLElement>("#battle-turn-strip")!),
        staleRepartee: visible(document.querySelector<HTMLElement>("#repartee-caption")!),
        narrative: caption.querySelector(".bell-narrative")?.textContent,
        choice: caption.querySelector(".bell-choice")?.textContent, note: caption.querySelector(".bell-note")?.textContent };
    }), { timeout: 8_000 }).toMatchObject({
      caption: { phase, command: state.chronicle.at(-1)!.commandId, cell: String(board.currentCell), roll: String(pending?.value ?? move?.roll.value ?? "unrolled") },
      stage: { bellPhase: phase, bellCommand: state.chronicle.at(-1)!.commandId,
        bellPath: (pending === null && move !== undefined ? move.path : [board.currentCell]).join(","), bellKnownEffects: JSON.stringify(known) },
      visible: true, staleBattle: false, staleRepartee: false,
      ...(pending !== null ? { narrative: expect.stringContaining(`The die shows ${pending.value}`) } : {}),
      ...(phase === "move" || phase === "result" ? { narrative: move!.landing.text, choice: expect.stringContaining(move!.path.join(" → ")),
        note: `MP ${move!.manaBefore} → ${board.mana} · gold ${move!.goldBefore} → ${board.gold}. HP unchanged.` } : {}),
    });
    await expect.poll(async () => page.evaluate(() => {
      const caption = document.querySelector<HTMLElement>("#bell-caption")!, stage = document.querySelector<HTMLElement>("#stage")!;
      const canvas = stage.querySelector("canvas")!, host = stage.getBoundingClientRect();
      const layout = (stage.dataset.sceneLayout ?? "").split(",").map(Number), safe = (stage.dataset.bellSafeRect ?? "").split(",").map(Number);
      const hero = (stage.dataset.bellHeroPosition ?? "").split(",").map(Number);
      if (layout.length !== 3 || safe.length !== 4 || hero.length !== 2 || [...layout, ...safe, ...hero].some(value => !Number.isFinite(value))) return null;
      const [scale = 0, x = 0, y = 0] = layout, [left = 0, top = 0, right = 0, bottom = 0] = safe;
      const scene = { left: host.left + x, top: host.top + y, right: host.left + x + 320 * scale, bottom: host.top + y + 180 * scale };
      const clear = [".topbar", ".view-toolbar", "#stage-focus-ribbon", "#stage-focus-controls", "#bell-caption"].every(selector => {
        const node = document.querySelector<HTMLElement>(selector);
        if (node === null || node.hidden || getComputedStyle(node).display === "none") return true;
        const box = node.getBoundingClientRect();
        return box.width === 0 || box.height === 0 || scene.right <= box.left + 0.5 || scene.left >= box.right - 0.5
          || scene.bottom <= box.top + 0.5 || scene.top >= box.bottom - 0.5;
      });
      // The actual pawn and committed die must be on unobscured canvas, not behind a caption or toolbar.
      const boardClear = [[hero[0]!, hero[1]! - 12], [33, 29]].every(([px = 0, py = 0]) =>
        document.elementFromPoint(host.left + x + px * scale, host.top + y + py * scale) === canvas);
      const rows = [...caption.querySelectorAll<HTMLElement>("h2, .bell-narrative, .bell-choice, .bell-deadline, .bell-note")].map(row => {
        row.scrollIntoView({ block: "nearest", inline: "nearest" });
        const box = row.getBoundingClientRect(), clip = caption.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return parseFloat(getComputedStyle(row).fontSize) >= 11 && box.top >= clip.top - 1 && box.bottom <= clip.bottom + 1
          && box.left >= clip.left - 1 && box.right <= clip.right + 1 && hit !== null && (hit === row || row.contains(hit));
      });
      return { adequateStage: scale * 320 >= (innerWidth <= 760 ? Math.min(280, innerWidth - 32) : 380) - 1,
        safeStage: scale > 0 && x >= left - 1 && y >= top - 1 && x + scale * 320 <= right + 1 && y + scale * 180 <= bottom + 1,
        inViewport: scene.left >= -1 && scene.top >= -1 && scene.right <= innerWidth + 1 && scene.bottom <= innerHeight + 1,
        clear, boardClear, readableRows: rows.length === 5 && rows.every(Boolean), pageFits: document.documentElement.scrollWidth <= innerWidth + 1 };
    }), { timeout: 8_000, message: "The delivery board, die, pawn and exact receipt need readable, unobscured normal and Focus layouts" }).toEqual({
      adequateStage: true, safeStage: true, inViewport: true, clear: true, boardClear: true, readableRows: true, pageFits: true,
    });
  };
  const advance = async (): Promise<void> => {
    const before = current;
    current = advanceWorld(before);
    saved = await pausedSave(page, before.tick);
    expect(JSON.parse(saved)).toEqual(current);
    expect(current.depth.hero.resources.health).toBe(ready.depth.hero.resources.health);
    expect(current.depth.hero.experience).toBe(ready.depth.hero.experience);
    expect(current.depth.quest).toEqual(ready.depth.quest);
    expect(current.depth.companions).toEqual(ready.depth.companions);
  };
  const resumeWithDebt = async (): Promise<void> => {
    // Init below gives every existing board a real stale checkpoint. Exercise the
    // normal 8-second foreground hold, not ?fast, then return to the short harness.
    await page.goto("./", { timeout: 25_000 });
    expect(await pausedSave(page)).toBe(saved);
    expect(upgradeWorldState(JSON.parse(saved))).toEqual(current);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#pause-button")!.click());
    await page.waitForTimeout(1_100);
    expect(await pausedSave(page)).toBe(saved);
    await proveBoard(current);
    await page.goto("./?fast", { timeout: 25_000 });
    expect(await pausedSave(page)).toBe(saved);
    milestone(`T${current.tick} exact save survives 60-second checkpoint debt and normal-speed visible resume`);
  };
  try {
    await page.addInitScript(state => {
      const key = `the-grind-2:campaign:${state.campaignId}`;
      if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, JSON.stringify(state));
      sessionStorage.setItem("the-grind-2:activeCampaignId", state.campaignId);
      const resumingBoard = JSON.parse(sessionStorage.getItem(key)!).depth.bellExpedition !== null;
      localStorage.setItem(`the-grind-2:last-active:${state.campaignId}`, String(Date.now() + (resumingBoard ? -60_000 : 3_600_000)));
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
    await advance(); await proveBoard(current);
    milestone(`real T${ready.tick} farewell opens T${current.tick} admission`);
    for (let beat = 0; beat < 16 && current.depth.bellExpedition!.completion === null; beat++) {
      await advance(); await proveBoard(current);
      const board = current.depth.bellExpedition!;
      if (board.pendingRoll?.turn === 2) {
        await expect(page.locator("#bell-caption .bell-choice")).toContainText("Fork: Shortcut Toll / Inspection");
        await capture("bell-fork-roll-1280");
        await resumeWithDebt();
        await proveBoard(current);
        await page.setViewportSize({ width: 320, height: 568 });
        await proveBoard(current); await capture("bell-fork-roll-320");
      }
      if (board.pendingRoll === null && board.currentCell === 2) {
        expect(current.depth.hero.resources.mana).toBe(ready.depth.hero.resources.mana - 1);
        await capture("bell-toll-320");
      }
    }
    const board = current.depth.bellExpedition!;
    expect(board.completion).toMatchObject({ outcome: "delivered", turn: 4, cell: 8, bonusGold: 3 });
    expect(board.turns.map(turn => turn.roll.value)).toEqual([1, 1, 3, 2]);
    expect(board.turns.map(turn => turn.path)).toEqual([[0, 1], [1, 2], [2, 4], [4, 7, 8]]);
    expect(current.depth.hero.gold).toBe(ready.depth.hero.gold + 3);
    await capture("bell-result-320");
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await proveBoard(current); await capture("bell-result-320-focus");
    expect(await pausedSave(page)).toBe(saved);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await page.setViewportSize({ width: 1280, height: 800 });
    await proveBoard(current); await capture("bell-result-1280");
    const journal = await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="journal"]')!.click();
      const panel = document.querySelector<HTMLDetailsElement>("#journal-bell")!; panel.open = true;
      return { turns: [...panel.querySelectorAll<HTMLElement>('ol[aria-label="Exact Borrowed Bell turns"] > li')].map(node => ({
        data: { ...node.dataset }, roll: node.querySelector<HTMLElement>(".bell-roll")!.dataset.command,
        landing: node.querySelector(".bell-landing")!.textContent })),
        result: { ...panel.querySelector<HTMLElement>(".bell-result")!.dataset }, text: panel.textContent };
    });
    expect(journal.turns).toEqual(board.turns.map(turn => ({ data: { command: turn.sourceCommandId, turn: String(turn.turn), path: turn.path.join(","), pace: turn.pace },
      roll: turn.roll.sourceCommandId, landing: `Landed on ${turn.landedCell}: ${turn.landing.text}` })));
    expect(journal.result).toEqual({ command: board.completion!.sourceCommandId, outcome: "delivered" });
    expect(journal.text).toContain("delivery bonus 3 gold, once only");
    expect(journal.text).toContain("not completion of an unrelated dungeon or quest");
    await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click());
    await resumeWithDebt();
    await proveBoard(current);
    expect(campaignDirector(current).candidates[0]?.command.type).toBe("plan-route");
    const continued = JSON.parse(await pausedSave(page, current.tick));
    expect(continued).toEqual(advanceWorld(current));
    expect(continued.depth.bellExpedition).toEqual(board);
    expect(continued.depth.hero.gold).toBe(current.depth.hero.gold);
    await expect(page.locator("#bell-caption")).toBeHidden();
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone("four real rolls, exact reloads, mobile/Focus geometry, source-bound Journal and once-only +3 gold passed");
  } finally {
    await testInfo.attach("Borrowed Bell diagnostics", { body: JSON.stringify({ errors, inference, external,
      elapsedMs: Date.now() - startedAt, tick: current.tick, board: current.depth.bellExpedition }, null, 2), contentType: "application/json" });
  }
});
