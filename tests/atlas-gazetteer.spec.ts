import { expect as baseExpect, test, type Page } from "@playwright/test";
import { createForwardMotionState } from "../src/core/forward-motion";
import { createWorld, upgradeWorldState } from "../src/core/simulation";
import { generateTown, visitTown } from "../src/depth/towns";

const expect = baseExpect.configure({ timeout: 15_000 });

async function savedCampaign(page: Page, campaignId: string): Promise<string> {
  return page.evaluate((id) => {
    const saved = sessionStorage.getItem(`the-grind-2:campaign:${id}`);
    if (saved === null) throw new Error("Gazetteer proof needs the canonical campaign mirror");
    return saved;
  }, campaignId);
}

test("Map gazetteer browses only recorded known places without changing paused play or crowding Watch", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  const inference: string[] = [];
  const externalRequests: string[] = [];
  const modelUrl = /huggingface|SmolLM|creative-writer|local-narrator|ort-wasm/iu;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("worker", (worker) => { if (modelUrl.test(worker.url())) inference.push(worker.url()); });
  page.on("request", (request) => {
    if (modelUrl.test(request.url())) inference.push(request.url());
    if (new URL(request.url()).origin !== new URL(testInfo.project.use.baseURL!).origin) externalRequests.push(request.url());
  });

  const base = createWorld("browser-atlas-gazetteer", "campaign:browser-atlas-gazetteer");
  const [current, unvisited] = base.depth.atlas.locations.filter((location) => location.kind === "town");
  if (current === undefined || unvisited === undefined) throw new Error("Gazetteer fixture requires two distinct towns");
  const visitedTown = visitTown(generateTown(base.seed, current.id));
  const unvisitedTown = generateTown(base.seed, unvisited.id);
  // These are recorded seeded settlement rosters, not evidence that the hero
  // personally met every resident. An existing visits=0 roster must stay private.
  const fixture = upgradeWorldState({
    ...base,
    scene: { ...base.scene, mode: "town", location: visitedTown.name },
    forwardMotion: createForwardMotionState(current.id, base.tick),
    depth: { ...base.depth,
      atlas: { ...base.depth.atlas, currentLocationId: current.id,
        discoveredLocationIds: [current.id, unvisited.id], route: null },
      towns: { [current.id]: visitedTown, [unvisited.id]: unvisitedTown },
    },
  });
  const hiddenPlaces = fixture.depth.atlas.locations.filter((location) =>
    !fixture.depth.atlas.discoveredLocationIds.includes(location.id));
  expect(hiddenPlaces.length).toBeGreaterThan(0);
  expect(unvisitedTown.visits).toBe(0);

  await page.addInitScript((saved) => {
    sessionStorage.setItem(`the-grind-2:campaign:${saved.campaignId}`, JSON.stringify(saved));
    sessionStorage.setItem("the-grind-2:activeCampaignId", saved.campaignId);
    localStorage.setItem(`the-grind-2:last-active:${saved.campaignId}`, String(Date.now() + 3_600_000));
    localStorage.setItem("the-grind-2:play-mode:v1", '{"schemaVersion":1,"mode":"deterministic"}');
    localStorage.setItem("the-grind-2:adventure-speed:v1", '{"schemaVersion":1,"speed":1}');
    localStorage.setItem("the-grind-2:stage-focus:v1", "panels");
  }, fixture);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./", { timeout: 25_000 });
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  await page.locator("#pause-button").click();
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  const before = await savedCampaign(page, fixture.campaignId);
  const app = page.locator("#app");
  const toolbar = page.locator("#view-toolbar");
  const map = page.locator("#map-inspector");
  const gazetteer = page.locator("#map-gazetteer");
  const summary = gazetteer.locator(":scope > summary");
  const places = page.locator("#gazetteer-place");
  const entry = page.locator("#gazetteer-entry");
  await expect(toolbar.locator("[data-view]")).toHaveCount(8);
  await expect(app).toHaveAttribute("data-active-view", "watch");
  await expect(gazetteer).toBeHidden();
  await toolbar.locator('[data-view="map"]').click();
  await expect(map).toBeVisible();
  await expect(gazetteer).toHaveJSProperty("open", false);
  await expect(summary).toHaveText("Browse known places");
  await expect(page.locator("#map-hero-activity")).toBeVisible();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(gazetteer).toHaveJSProperty("open", true);
  await expect(places).toBeVisible();
  await expect(page.locator("#map-hero-activity")).toBeHidden();
  const optionIds = await places.locator("option").evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value));
  expect([...optionIds].sort()).toEqual([current.id, unvisited.id].sort());
  for (const hidden of hiddenPlaces) expect(optionIds).not.toContain(hidden.id);
  await places.selectOption(current.id);
  await expect(entry).toContainText(current.name);
  await expect(entry).toContainText(visitedTown.name);
  await expect(entry).toContainText(visitedTown.specialty);
  const district = [...visitedTown.districts].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))[0]!;
  const building = visitedTown.buildings.find((candidate) => candidate.districtId === district.id)!;
  const resident = visitedTown.residents.find((candidate) => candidate.homeBuildingId === building.id)!;
  const districtDetails = entry.locator(`[data-district-id="${district.id}"] > details`);
  await expect(districtDetails).toHaveJSProperty("open", false);
  await expect(districtDetails.locator("summary")).toHaveText(`${district.name} · ${district.character}`);
  await districtDetails.locator("summary").focus();
  await page.keyboard.press("Enter");
  const buildingRow = districtDetails.locator(`[data-building-id="${building.id}"]`);
  await expect(buildingRow.locator(":scope > strong")).toHaveText(building.name);
  await expect(buildingRow.locator(":scope > small")).toHaveText(building.kind);
  const residentRow = buildingRow.locator(`[data-resident-id="${resident.id}"]`);
  await expect(residentRow).toBeVisible();
  await expect(residentRow).toHaveText(`${resident.name} · ${resident.role} · ${resident.disposition}`);
  await expect(entry).toContainText("Recorded settlement roster, not a list of personal meetings or current sightings.");
  await expect(entry).not.toContainText(/residents (?:met|encountered)|recent sightings/iu);

  // Exercise the native select's keyboard behavior, not only selectOption.
  await places.focus();
  await page.keyboard.press("Home");
  for (let index = 0; index < optionIds.indexOf(unvisited.id); index += 1) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  await expect(places).toHaveValue(unvisited.id);
  await expect(entry).toContainText(unvisited.name);
  await expect(entry).toContainText("Not yet visited. Local notes will appear after the hero visits.");
  await expect(entry.locator("[data-district-id], [data-building-id], [data-resident-id]")).toHaveCount(0);
  const unvisitedText = await entry.innerText();
  for (const hiddenResident of unvisitedTown.residents) expect(unvisitedText).not.toContain(hiddenResident.name);
  expect(unvisitedText).not.toContain(unvisitedTown.specialty);
  await toolbar.locator('[data-view="inventory"]').click();
  await expect(map).toBeHidden();
  await toolbar.locator('[data-view="map"]').click();
  await expect(gazetteer).toHaveJSProperty("open", true);
  await expect(places).toHaveValue(unvisited.id);
  expect(await savedCampaign(page, fixture.campaignId)).toBe(before);
  await places.selectOption(current.id);
  await districtDetails.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(districtDetails).toHaveJSProperty("open", true);

  for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    await map.evaluate((element) => { element.scrollTop = 0; });
    await expect(places).toHaveValue(current.id);
    await expect(page.locator("#map-hero-activity")).toBeHidden();
    expect(await map.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const navigation = document.querySelector("#view-toolbar")!.getBoundingClientRect();
      const select = element.querySelector("#gazetteer-place")!.getBoundingClientRect();
      const toggle = element.querySelector("#map-gazetteer > summary")!.getBoundingClientRect();
      return { belowToolbar: box.top >= navigation.bottom - 1,
        fillsAvailableMap: box.height >= (innerHeight - navigation.bottom) * 0.7,
        fits: box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0 && box.bottom <= innerHeight + 1,
        contentFits: element.scrollWidth <= element.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1,
        selectFits: select.height >= 44 && select.left >= box.left && select.right <= box.right,
        toggleFits: toggle.height >= 44 && toggle.left >= box.left && toggle.right <= box.right };
    })).toEqual({ belowToolbar: true, fillsAvailableMap: true, fits: true, contentFits: true, selectFits: true, toggleFits: true });
    if (process.env.TG2_VISUAL_CAPTURE === "1") {
      const capture = testInfo.outputPath(`atlas-gazetteer-${viewport.width}.png`);
      await page.screenshot({ path: capture });
      await testInfo.attach(`atlas gazetteer ${viewport.width}`, { path: capture, contentType: "image/png" });
    }
  }
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(gazetteer).toHaveJSProperty("open", false);
  await expect(places).toBeHidden();
  await expect(page.locator("#map-hero-activity")).toBeVisible();
  await toolbar.locator('[data-view="watch"]').click();
  await expect(app).toHaveAttribute("data-active-view", "watch");
  await expect(map).toBeHidden();
  await expect(page.locator("#watch-character-details")).toBeVisible();
  await expect(app).toHaveAttribute("data-play-mode", "deterministic");
  await expect(app).toHaveAttribute("data-creative-story-state", "off");
  await expect(page.locator("#pause-button")).toHaveText("Resume");
  expect(await savedCampaign(page, fixture.campaignId)).toBe(before);
  expect(inference).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});
