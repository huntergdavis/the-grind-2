import { expect, test } from "@playwright/test";

test("keeps the low-end mobile game responsive with AI off and no external inference traffic", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const externalRequests: string[] = [];
  const narratorRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.hostname !== "127.0.0.1") externalRequests.push(request.url());
    if (/local-narrator|ort-wasm|the-grind-2-narrator/iu.test(url.href)) {
      narratorRequests.push(request.url());
    }
  });

  await page.goto("./?fast");
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 20_000 });
  const app = page.locator("#app");
  await expect(app).toHaveAttribute("data-chrome-mode", "focus");
  await expect(page.locator("#narrator-button")).toHaveText("Narrator · Off");
  await expect(page.locator("#narrator-line")).toBeHidden();
  const stageFocusNarrator = page.locator("#stage-focus-narrator");
  await expect(stageFocusNarrator).not.toHaveAttribute("data-source");
  const compactProvenance = await stageFocusNarrator.evaluate((element) => {
    element.hidden = false;
    element.textContent = "The rain remembers every passing boot.";
    element.dataset.source = "model";
    const model = getComputedStyle(element, "::before").content;
    const width = element.getBoundingClientRect().width;
    const parentWidth = element.parentElement?.getBoundingClientRect().width ?? 0;
    element.dataset.source = "deterministic";
    const fallback = getComputedStyle(element, "::before").content;
    element.hidden = true;
    element.textContent = "";
    delete element.dataset.source;
    return { model, fallback, width, parentWidth };
  });
  expect(compactProvenance).toMatchObject({
    model: '"AI · EXP"',
    fallback: '"SAFE"',
  });
  expect(compactProvenance.width).toBeLessThanOrEqual(compactProvenance.parentWidth + 1);
  await expect(stageFocusNarrator).toBeHidden();
  await expect(stageFocusNarrator).not.toHaveAttribute("data-source");
  const initialTick = Number(await app.getAttribute("data-simulation-tick"));
  expect(initialTick).toBeGreaterThanOrEqual(0);
  await page.waitForFunction(
    (tick) => Number(document.querySelector("#app")?.getAttribute("data-simulation-tick")) > tick,
    initialTick,
    { timeout: 20_000 },
  );

  await page.locator("#stage-pause-button").click();
  await expect(app).toHaveAttribute("data-presentation-paused", "true");
  await page.locator("#stage-pause-button").click();
  await expect(app).toHaveAttribute("data-presentation-paused", "false");

  await page.locator("#stage-panels-button").click();
  const narratorButton = page.locator("#narrator-button");
  await expect(narratorButton).toBeVisible();
  expect(await page.locator(".controls").evaluate((controls) =>
    controls.scrollWidth <= controls.clientWidth + 1)).toBe(true);
  await narratorButton.click();
  await expect(page.locator("#narrator-dialog")).toBeVisible();
  await expect(page.locator("#narrator-disclosure")).toContainText("Experimental / Unrated");
  await expect(page.locator("#narrator-disclosure")).toContainText("No server inference is used");
  expect(await page.locator("#narrator-download").evaluate((button) =>
    button.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await page.locator("#narrator-close").click();
  await expect(page.locator("#narrator-dialog")).toBeHidden();

  expect(externalRequests).toEqual([]);
  expect(narratorRequests).toEqual([]);
});
