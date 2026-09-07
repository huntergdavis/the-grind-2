import { expect, test, type Page } from "@playwright/test";
import { advanceWorld, createWorld } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { projectStatusHistory } from "../src/ui/status-history";
import { narrativeJournalKey } from "../src/ui/narrative-journal";

async function savedWorld(page: Page, campaignId: string): Promise<WorldState> {
  return page.evaluate((id) => JSON.parse(sessionStorage.getItem(`the-grind-2:campaign:${id}`)!) as WorldState, campaignId);
}

test("shared Status keeps canonical sources distinct and reading still while the adventure continues", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const mark = (phase: string) => {
    const now = new Date();
    const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Los_Angeles", dateStyle: "short", timeStyle: "medium" }).format(now);
    const zone = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", timeZoneName: "short" }).formatToParts(now).find((part) => part.type === "timeZoneName")!.value;
    console.log(`[${stamp} ${zone}] Status proof: ${phase}`);
  };
  const errors: string[] = [];
  const inference: string[] = [];
  const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (modelUrl.test(request.url())) inference.push(request.url()); });
  page.on("worker", (worker) => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
  let fixture = createWorld("browser-status-history", "campaign:status-history");
  for (let step = 0; step < 6; step += 1) fixture = advanceWorld(fixture);
  const imagined = "An imagined worry belongs in the story archive, not the factual status log.";
  await page.addInitScript(({ world, journalKey, prose }) => {
    if (sessionStorage.getItem("status-proof-seeded") !== null) return;
    sessionStorage.setItem("status-proof-seeded", "true");
    sessionStorage.setItem(`the-grind-2:campaign:${world.campaignId}`, JSON.stringify(world));
    sessionStorage.setItem("the-grind-2:activeCampaignId", world.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${world.campaignId}`, String(Date.now() + 3_600_000));
    localStorage.setItem("the-grind-2:play-mode:v1", '{"schemaVersion":1,"mode":"deterministic"}');
    localStorage.setItem("the-grind-2:adventure-speed:v1", '{"schemaVersion":1,"speed":1}');
    localStorage.setItem("the-grind-2:stage-focus:v1", "panels");
    localStorage.setItem(journalKey, JSON.stringify({ schemaVersion: 1, entries: [{
      sourceEventId: "imagined:status-proof", campaignId: world.campaignId, sourceTick: world.tick,
      readyAtMs: Date.now(), text: prose, location: world.scene.location, headline: "An imagined thought",
      origin: "model", presentedAtMs: null,
    }] }));
  }, { world: fixture, journalKey: narrativeJournalKey, prose: imagined });
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Most assertions exercise DOM controls; reserve the large software-rendered
  // surface for its actual desktop layout capture rather than every interaction.
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("./", { timeout: 25_000 });
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await page.locator("#pause-button").click();
  await expect(page.locator("#pause-button")).toHaveText("Resume", { timeout: 15_000 });
  const before = await savedWorld(page, fixture.campaignId);
  mark("booted and paused");
  const expected = projectStatusHistory(before);
  await page.locator("#watch-character-details").click();
  await page.locator("#open-status-log").click();
  await expect(page.locator("#stage-panels-drawer")).toBeHidden();
  await expect(page.locator("#journal-status-button")).toBeFocused();
  const list = page.locator("#journal-status-list");
  await expect(list.locator(":scope > li[data-event-id]")).toHaveCount(expected.length);
  expect(await list.locator(":scope > li").evaluateAll((rows) => rows.map((node) => {
    const row = node as HTMLElement;
    return { id: row.dataset.eventId, tick: Number(row.dataset.tick), source: row.dataset.source };
  }))).toEqual(expected.map((entry) => ({ id: entry.eventId, tick: entry.tick, source: entry.source })));
  const latestChronicle = expected.find((entry) => entry.source === "chronicle")!;
  const chronicle = list.locator('[data-source="chronicle"]').first();
  await expect(chronicle).toContainText(latestChronicle.action);
  await chronicle.locator("summary").click();
  await expect(chronicle).toContainText(latestChronicle.decision.rationale);
  await expect(chronicle).toContainText(latestChronicle.eventId);
  await expect(list).not.toContainText(imagined);
  await expect(page.locator("#event-log, #journal-entry-list")).toHaveCount(0);
  mark("source identity, rationale and shortcut focus passed");

  for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    await page.locator("#journal-status-button").scrollIntoViewIfNeeded();
    const bounds = await page.evaluate(() => {
      const article = document.querySelector("#journal-status")!.getBoundingClientRect();
      const buttons = [...document.querySelectorAll(".journal-sections button")].map((button) => button.getBoundingClientRect());
      return { documentWidth: document.documentElement.scrollWidth, width: innerWidth, left: article.left, right: article.right,
        navigationHeight: document.querySelector("#view-toolbar")!.getBoundingClientRect().height,
        buttons: buttons.map((button) => ({ width: button.width, height: button.height })) };
    });
    expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.width);
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.width);
    if (viewport.width === 320) expect(bounds.navigationHeight).toBeLessThanOrEqual(66);
    await expect(page.locator("#screen-hero-activity")).toBeHidden();
    for (const button of bounds.buttons) { expect(button.width).toBeGreaterThanOrEqual(44); expect(button.height).toBeGreaterThanOrEqual(44); }
    await page.screenshot({ path: testInfo.outputPath(`status-history-${viewport.width}.png`), timeout: 8_000 });
    mark(`layout ${viewport.width} passed`);
  }
  await page.locator("#journal-narratives-button").click();
  await expect(page.locator("#journal-status")).toBeHidden();
  await expect(page.locator("#journal-narrative-list")).toContainText(imagined);
  await page.locator("#journal-adventure-button").click();
  await expect(page.locator(".journal-quests")).toBeVisible();
  await expect(page.locator("#journal-narratives")).toBeHidden();
  await page.locator("#journal-status-button").click();
  expect(await savedWorld(page, fixture.campaignId)).toEqual(before);
  mark("section separation and unchanged paused state passed");
  const snapshotTick = await page.locator("#journal-status").getAttribute("data-snapshot-tick");
  const frozenRows = await list.innerText();
  await page.locator("#pause-button").click();
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "false");
  mark("resumed for snapshot check");
  await expect(page.locator("#journal-status-refresh")).toBeEnabled({ timeout: 20_000 });
  await page.locator("#pause-button").click();
  await expect(page.locator("#pause-button")).toHaveText("Resume", { timeout: 15_000 });
  await expect(page.locator("#journal-status")).toHaveAttribute("data-snapshot-tick", snapshotTick!);
  expect(await list.innerText()).toBe(frozenRows);
  await expect(chronicle.locator("details")).toHaveAttribute("open", "");
  const after = await savedWorld(page, fixture.campaignId);
  expect(after.tick).toBeGreaterThan(before.tick);
  await page.locator("#journal-status-refresh").click();
  await expect(page.locator("#journal-status")).toHaveAttribute("data-snapshot-tick", String(after.tick));
  await expect(page.locator("#journal-status-refresh")).toBeDisabled();
  await expect(page.locator("#journal-status-refresh")).toBeFocused();
  expect(await savedWorld(page, fixture.campaignId)).toEqual(after);
  await page.locator('[data-view="watch"]').click();
  await expect(page.locator("#stage-focus-ribbon")).toBeVisible();
  await expect(page.locator("#journal-status")).toBeHidden();
  expect(errors).toEqual([]);
  expect(inference).toEqual([]);
  mark("live refresh and clean Watch return passed without inference");
});
