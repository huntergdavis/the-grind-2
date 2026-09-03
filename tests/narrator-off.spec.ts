import { expect, test } from "@playwright/test";

test("keeps the low-end mobile game responsive with AI off and no external inference traffic", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.hostname !== "127.0.0.1") externalRequests.push(request.url());
  });

  await page.goto("./?fast");
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 20_000 });
  const app = page.locator("#app");
  await expect(app).toHaveAttribute("data-chrome-mode", "focus");
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
  expect(externalRequests).toEqual([]);
});
