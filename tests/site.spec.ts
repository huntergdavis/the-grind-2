import { expect, test } from "@playwright/test";

test("plays, pauses, creates, and reloads an autonomous campaign", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("./?fast");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", {
    timeout: 15_000,
  });
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator("#hero-name")).not.toHaveText("Generating hero…");
  const firstHero = await page.locator("#hero-name").innerText();
  const firstScene = await page.locator("#scene-headline").innerText();

  await expect(page.locator("#scene-headline")).not.toHaveText(firstScene, {
    timeout: 15_000,
  });

  await page.locator("#pause-button").click({ force: true });
  const pausedScene = await page.locator("#scene-headline").innerText();
  await page.waitForTimeout(600);
  await expect(page.locator("#scene-headline")).toHaveText(pausedScene);
  await page.locator("#pause-button").press("Enter");

  await page.locator("#new-button").click({ force: true });
  await expect(page.locator("#hero-name")).not.toHaveText(firstHero);
  const secondHero = await page.locator("#hero-name").innerText();
  await expect(page.locator("#campaign-select option")).toHaveCount(2);

  await page.reload();
  await expect(page.locator("#hero-name")).toHaveText(secondHero);
  await expect(page.locator("canvas")).toBeVisible();
  expect(errors).toEqual([]);
});
