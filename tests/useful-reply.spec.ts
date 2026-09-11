import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, campaignDirector, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { usefulReplyBook, usefulReplyCall, usefulReplyResponses } from "../src/depth/useful-reply";
import { naturalUsefulReplyFixture, usefulReplyCampaignId } from "./useful-reply-fixtures";

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
    const timeout = window.setTimeout(() => { window.clearInterval(poll); reject(new Error("Useful-reply turn did not settle within 20 seconds")); }, 20_000);
    const poll = window.setInterval(() => {
      if (document.documentElement.dataset.ready !== "true") return;
      const saved = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
      if (saved === null || tick !== undefined && JSON.parse(saved).tick <= tick) return;
      if (!requested && app.dataset.presentationPaused !== "true") { requested = true; button.click(); }
      if (app.dataset.presentationPaused !== "true" || tick !== undefined && Number(app.dataset.simulationTick) <= tick) return;
      window.clearInterval(poll); window.clearTimeout(timeout); resolve(saved);
    }, 20);
    if (tick !== undefined) button.click();
  }), { id: usefulReplyCampaignId, tick: afterTick });
}

function oldHistory(world: WorldState): string {
  return JSON.stringify({ repartee: world.depth.repartee, witness: world.depth.reparteeWitness, callback: world.depth.reparteeCallback });
}

function expectNoPracticeRewards(before: WorldState, after: WorldState): void {
  expect(after.depth.hero).toEqual(before.depth.hero);
  expect(after.depth.quest).toEqual(before.depth.quest);
  expect(after.depth.towns).toEqual(before.depth.towns);
  expect(after.depth.companions).toEqual(before.depth.companions);
  expect(after.hero.experience).toBe(before.hero.experience);
  expect(oldHistory(after)).toBe(oldHistory(before));
}

async function proveLesson(page: Page, world: WorldState): Promise<void> {
  const lesson = world.depth.usefulReply!, reading = lesson.reply === null;
  const phase = reading ? "lesson-reading" : "lesson-practice";
  const source = reading ? lesson.reading.sourceCommandId : lesson.reply!.sourceCommandId;
  await expect.poll(async () => page.evaluate(() => {
    const caption = document.querySelector<HTMLElement>("#repartee-caption")!, stage = document.querySelector<HTMLElement>("#stage")!;
    return { hidden: caption.hidden, data: { ...caption.dataset }, stage: { ...stage.dataset },
      title: caption.querySelector("h2")?.textContent, call: caption.querySelector(".repartee-call")?.textContent,
      reply: caption.querySelector(".repartee-reply")?.textContent ?? null, note: caption.querySelector(".repartee-note")?.textContent,
      marks: caption.querySelectorAll(".repartee-marks").length,
      noScoreOrWitness: ["round", "momentum", "outcome", "witness", "regard"].every(key => !(key in caption.dataset)) };
  }), { timeout: 8_000 }).toMatchObject({ hidden: false,
    data: { phase, command: `${world.campaignId}:${source}`, book: usefulReplyBook.id, lesson: lesson.lessonId, readingSource: lesson.reading.sourceCommandId,
      classification: reading ? "learned" : lesson.reply!.classification },
    stage: { reparteePhase: phase, reparteeCommand: `${world.campaignId}:${source}`, reparteeBook: usefulReplyBook.id,
      reparteeLesson: lesson.lessonId, reparteeHero: world.hero.id, reparteeResident: reading ? "none" : lesson.residentId },
    title: reading ? usefulReplyBook.title : "Practice · unscored",
    call: reading ? `“${usefulReplyBook.excerpt}”` : `${lesson.residentName}: ${lesson.reply!.call}`,
    reply: reading ? null : `${world.hero.name}: ${lesson.reply!.reply}`,
    note: reading ? "One constructive reply learned · practice is unscored." : "Constructive · leadership means helping others.",
    marks: 0, noScoreOrWitness: true,
  });
  await expect.poll(async () => page.evaluate(isReading => {
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
    const actorsClear = (isReading ? [[122, 108], [176, 119]] : [[92, 108], [232, 108]]).every(([px = 0, py = 0]) =>
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
      clear, actorsClear, readableRows: rows.length === (isReading ? 3 : 4) && rows.every(Boolean),
      pageFits: document.documentElement.scrollWidth <= innerWidth + 1 };
  }, reading), { timeout: 8_000 }).toEqual({ adequateStage: true, safeStage: true, inViewport: true,
    clear: true, actorsClear: true, readableRows: true, pageFits: true });
}

async function proveLessonJournal(page: Page, world: WorldState): Promise<void> {
  const lesson = world.depth.usefulReply!, reply = lesson.reply!;
  const journal = await page.evaluate(lessonId => {
    document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="journal"]')!.click();
    const panel = document.querySelector<HTMLDetailsElement>("#journal-repartee")!; panel.open = true;
    const section = [...panel.querySelectorAll<HTMLElement>("[data-useful-lesson]")].find(node => node.dataset.usefulLesson === lessonId)!;
    section.querySelector<HTMLElement>("summary")!.click();
    for (const details of section.querySelectorAll<HTMLDetailsElement>("details")) {
      if (!details.open) details.querySelector<HTMLElement>("summary")!.click();
    }
    return { text: section.textContent, data: { ...section.dataset },
      readingSource: section.querySelector<HTMLElement>("[data-reading-source]")?.dataset.readingSource,
      replySource: section.querySelector<HTMLElement>("[data-reply-source]")?.dataset.replySource,
      sources: [...section.querySelectorAll(".journal-repartee-source")].map(node => node.textContent),
      choices: [...section.querySelectorAll<HTMLElement>("[data-response]")].map(node => ({ id: node.dataset.response, text: node.textContent })) };
  }, lesson.lessonId);
  expect(journal.data).toMatchObject({ usefulLesson: lesson.lessonId });
  expect(journal.readingSource).toBe(lesson.reading.sourceCommandId);
  expect(journal.replySource).toBe(reply.sourceCommandId);
  expect(journal.sources.join("\n")).toContain(lesson.reading.sourceCommandId);
  expect(journal.sources.join("\n")).toContain(reply.sourceCommandId);
  for (const text of [usefulReplyBook.title, usefulReplyBook.excerpt, usefulReplyBook.expression, usefulReplyBook.frameId,
    lesson.residentName, reply.call, reply.reply, reply.explanation]) expect(journal.text).toContain(text);
  expect(journal.choices.map(choice => choice.id)).toEqual(usefulReplyResponses(lesson).map(choice => choice.id));
  expect(journal.choices.find(choice => choice.id === reply.responseId)?.text).toContain(reply.reply);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#view-toolbar [data-view="watch"]')!.click());
}

test("a real public book unlocks one useful reply, preserves its sources, and ends its unscored lesson", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const ready = naturalUsefulReplyFixture(), reading = advanceWorld(ready), practiced = advanceWorld(reading);
  const lesson = practiced.depth.usefulReply!, reply = lesson.reply!;
  const errors: string[] = [], inference: string[] = [], external: string[] = [], startedAt = Date.now();
  const milestone = (message: string): void => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date()).map(part => [part.type, part.value]));
    console.log(`[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}] Useful reply +${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${message}`);
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
    expect(ready.depth.usefulReply).toBeNull();
    expect(ready.depth.companions.active).toHaveLength(0);
    expect(ready.depth.reparteeCallback).not.toBeNull();
    expect(usefulReplyResponses(null).map(response => response.classification)).not.toContain("constructive");
    expect(usefulReplyResponses(null).some(response => response.expressionId === usefulReplyBook.expressionId)).toBe(false);
    expect(campaignDirector(ready).candidates[0]?.command.type).toBe("read-useful-book");
    await installFixture(page, ready);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./?fast", { timeout: 25_000 });
    expect(JSON.parse(await pausedSave(page))).toEqual(ready);
    const readingRaw = await pausedSave(page, ready.tick);
    expect(JSON.parse(readingRaw)).toEqual(reading);
    expect(reading.chronicle.at(-1)?.commandType).toBe("read-useful-book");
    expect(reading.depth.usefulReply!.reply).toBeNull();
    expect(reading.depth.usefulReply!.reading).toMatchObject({ bookId: usefulReplyBook.id,
      expressionId: usefulReplyBook.expressionId, frameId: usefulReplyBook.frameId, tick: reading.tick });
    const learned = usefulReplyResponses(reading.depth.usefulReply).filter(response => response.classification === "constructive");
    expect(learned).toHaveLength(1);
    expect(learned[0]).toMatchObject({ id: reply.responseId, expressionId: usefulReplyBook.expressionId, frameId: usefulReplyBook.frameId });
    expectNoPracticeRewards(ready, reading);
    await proveLesson(page, reading); await capture("useful-reply-reading-1280");
    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(readingRaw);
    expect(upgradeWorldState(JSON.parse(readingRaw))).toEqual(reading);
    await proveLesson(page, reading);
    milestone(`actual T${reading.tick} reading unlocked the new expression/frame; exact reading save survived reload`);

    const practiceRaw = await pausedSave(page, reading.tick);
    expect(JSON.parse(practiceRaw)).toEqual(practiced);
    expect(practiced.chronicle.at(-1)?.commandType).toBe("practice-useful-reply");
    expect(reply).toMatchObject({ classification: "constructive", callId: usefulReplyCall.id, call: usefulReplyCall.text,
      readingSourceCommandId: lesson.reading.sourceCommandId, tick: practiced.tick });
    expect(reply.reply).toBe(learned[0]!.text);
    expectNoPracticeRewards(ready, practiced);
    await page.setViewportSize({ width: 320, height: 568 });
    await proveLesson(page, practiced); await capture("useful-reply-practice-320");
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await proveLesson(page, practiced); await capture("useful-reply-practice-320-focus");
    expect(await pausedSave(page)).toBe(practiceRaw);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#stage-focus-button")!.click());
    await proveLessonJournal(page, practiced);
    await page.reload({ timeout: 25_000 });
    expect(await pausedSave(page)).toBe(practiceRaw);
    expect(upgradeWorldState(JSON.parse(practiceRaw))).toEqual(practiced);
    await proveLesson(page, practiced);
    milestone(`T${practiced.tick} demonstrated the learned reply; both Journal sources and old F1/F2 bytes remain exact`);

    expect(campaignDirector(practiced).candidates.every(candidate => !["read-useful-book", "practice-useful-reply"].includes(candidate.command.type))).toBe(true);
    const followed = JSON.parse(await pausedSave(page, practiced.tick)) as WorldState;
    expect(followed).toEqual(advanceWorld(practiced));
    expect(followed.depth.usefulReply).toEqual(lesson);
    expect(oldHistory(followed)).toBe(oldHistory(ready));
    expect(["read-useful-book", "practice-useful-reply"]).not.toContain(followed.chronicle.at(-1)?.commandType);
    await expect(page.locator("#repartee-caption")).toBeHidden();
    expect(errors).toEqual([]); expect(inference).toEqual([]); expect(external).toEqual([]);
    milestone(`one ordinary ${followed.chronicle.at(-1)?.commandType} resumes; no repeat lesson, model, external request, or runtime error`);
  } finally {
    await testInfo.attach("Useful reply acceptance diagnostics", { body: JSON.stringify({ errors, inference, external,
      readyTick: ready.tick, readingTick: reading.tick, replyTick: practiced.tick, elapsedMs: Date.now() - startedAt }, null, 2), contentType: "application/json" });
  }
});
