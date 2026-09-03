import { expect, test, type Page } from "@playwright/test";
import {
  cutawayRegistry,
  type ProductionCutawayRecipeKey,
} from "../src/render/cutaway-registry";

const minimumReadableTextPx = 11;
const recipeCases = cutawayRegistry.recipes.map((recipe) => ({
  key: recipe.key as ProductionCutawayRecipeKey,
  rootId: recipe.domEquivalentId,
  truthCueIds: [...recipe.truthCueIds],
}));

const realJourneyByRecipe: Readonly<Record<ProductionCutawayRecipeKey, string>> = {
  "trap-resolution@1": "hides, detects, and disarms a typed dungeon trap",
  "companion-farewell@1": "keeps one Shared Road Oath companion consistent across combat, Journal, responsive layouts, and farewell",
  "hero-level-up@1": "presents one truthful responsive earned-level montage after persistence",
  "hero-level-up@2": "seals the exact earned Level 1000 Hall record after atomic persistence",
  "hero-growth-allocation@1": "presents one truthful responsive growth-allocation montage after persistence",
  "field-note-resolution@1": "celebrates one exact multi-species Field Note crossing without inventing power",
  "field-note-resolution@2": "shows the exact public Pattern Duel signal taking priority over a completed Field Note",
  "ability-resonance@1": "presents one exact Level-20 ability resonance after persistence with responsive DOM and Canvas parity",
  "weapon-memory@1": "presents the forty-fifth weapon mark once from a real retained-weapon combat",
  "battle-spoils@1": "compares deterministic battle spoils after a real auto-equip",
  "town-itinerary@1": "walks one real town itinerary to an established resident's home",
};

const productionLengthFact = "T999999 · The weathered Moonclock Observatory record preserves exact source campaign:typography-audit:999999 · POWER 123→127 (+4) · HP 87→63 (−24) · no reward, refill, branch, or hidden intent claimed.";
const productionLengthEvent = "hero-growth-allocation@1 · event campaign:typography-audit:999999 · exact persisted consequence available without the Canvas scene";

interface AuditCondition {
  readonly label: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly textScalePercent: number;
}

const conditions: readonly AuditCondition[] = [
  { label: "phone", viewport: { width: 320, height: 568 }, textScalePercent: 100 },
  { label: "tall phone", viewport: { width: 390, height: 844 }, textScalePercent: 100 },
  { label: "short landscape", viewport: { width: 844, height: 390 }, textScalePercent: 100 },
  { label: "desktop", viewport: { width: 1280, height: 800 }, textScalePercent: 100 },
  { label: "phone at 200% text", viewport: { width: 320, height: 568 }, textScalePercent: 200 },
];

async function readyPausedPage(page: Page): Promise<void> {
  await page.goto("./?fast", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
  await page.evaluate(() => {
    const app = document.querySelector<HTMLElement>("#app");
    const pause = document.querySelector<HTMLButtonElement>("#pause-button");
    if (app?.dataset.presentationPaused !== "true") pause?.click();
  });
  await expect(page.locator("#app")).toHaveAttribute("data-presentation-paused", "true");
  await page.addStyleTag({ content: "#stage canvas { visibility: hidden !important; }" });
}

async function presentTypographyFixture(
  page: Page,
  recipe: (typeof recipeCases)[number],
  textScalePercent: number,
): Promise<void> {
  await page.evaluate(({ recipe, textScalePercent, productionLengthFact, productionLengthEvent }) => {
    document.documentElement.style.fontSize = `${textScalePercent}%`;
    for (const root of document.querySelectorAll<HTMLElement>(".trap-cutaway")) {
      root.hidden = true;
      root.removeAttribute("data-active");
      root.removeAttribute("data-emphasis");
      root.removeAttribute("data-montage-kind");
      root.removeAttribute("data-packet-version");
    }

    const root = document.querySelector<HTMLElement>(`#${recipe.rootId}`);
    if (root === null) throw new Error(`Missing production cutaway root ${recipe.rootId}`);
    root.hidden = false;
    root.dataset.active = "true";
    root.dataset.phase = "final";
    root.scrollTop = 0;
    root.scrollLeft = 0;

    const selection = root.querySelector<HTMLElement>("#level-up-cutaway-selection-step");
    const candidates = root.querySelector<HTMLOListElement>("#level-up-cutaway-candidates");
    const hallSeal = root.querySelector<HTMLElement>("#level-up-cutaway-hall-seal");
    const liveTell = root.querySelector<HTMLElement>("#field-note-cutaway-live-tell");
    const notes = root.querySelector<HTMLOListElement>("#field-note-cutaway-notes");
    if (selection !== null) selection.hidden = true;
    if (candidates !== null) candidates.replaceChildren();
    if (hallSeal !== null) hallSeal.hidden = true;
    if (liveTell !== null) liveTell.hidden = true;
    if (notes !== null) notes.replaceChildren();

    if (recipe.key === "hero-level-up@2" && hallSeal !== null) {
      root.dataset.emphasis = "maximum";
      hallSeal.hidden = false;
    }
    if (recipe.key === "hero-growth-allocation@1" && selection !== null && candidates !== null) {
      root.dataset.montageKind = "growth";
      selection.hidden = false;
      for (const [index, label] of ["Field Temper", "Road Rhythm", "Inner Pattern"].entries()) {
        const item = document.createElement("li");
        item.dataset.selected = String(index === 1);
        const title = document.createElement("strong");
        title.textContent = label;
        const detail = document.createElement("small");
        detail.textContent = `Recorded option ${index + 1} · ${productionLengthFact}`;
        item.append(title, detail);
        candidates.append(item);
      }
    }
    if (recipe.key === "field-note-resolution@2" && liveTell !== null) {
      root.dataset.packetVersion = "2";
      liveTell.hidden = false;
    }
    if (recipe.key === "field-note-resolution@1") root.dataset.packetVersion = "1";

    for (const truthCueId of recipe.truthCueIds) {
      const cue = root.querySelector<HTMLElement>(`#${truthCueId}`);
      if (cue === null) throw new Error(`${recipe.key} is missing truth cue ${truthCueId}`);
      if (cue instanceof HTMLOListElement || cue instanceof HTMLUListElement) {
        if (cue.childElementCount === 0) {
          const item = document.createElement("li");
          item.textContent = productionLengthFact;
          cue.append(item);
        }
      } else if (cue.textContent?.trim().length === 0) {
        cue.textContent = productionLengthFact;
      }
    }

    const event = root.querySelector<HTMLElement>("small[id$='-cutaway-event']");
    if (event !== null) event.textContent = `${recipe.key} · ${productionLengthEvent}`;
    const outcomes = [...root.querySelectorAll<HTMLButtonElement>("button[id$='-cutaway-outcome']")];
    if (outcomes.length !== 1) throw new Error(`${recipe.key} must expose exactly one outcome button`);
    for (const outcome of outcomes) {
      outcome.hidden = false;
      outcome.disabled = false;
      outcome.textContent = "Continue with this exact recorded consequence";
    }
    for (const item of root.querySelectorAll<HTMLElement>("li")) {
      item.dataset.reached = "true";
      item.dataset.current = "true";
    }
    for (const element of root.querySelectorAll<HTMLElement>("*") ) {
      if (element.childElementCount === 0
        && element.textContent?.trim().length === 0
        && element.getAttribute("aria-hidden") !== "true"
        && !element.classList.contains("sr-only")) {
        element.textContent = productionLengthFact;
      }
    }
  }, { recipe, textScalePercent, productionLengthFact, productionLengthEvent });
}

async function auditRecipe(page: Page, recipe: (typeof recipeCases)[number], condition: AuditCondition): Promise<void> {
  await presentTypographyFixture(page, recipe, condition.textScalePercent);
  const audit = await page.locator(`#${recipe.rootId}`).evaluate((root, { minimumPx, truthCueIds }) => {
    const rootBounds = root.getBoundingClientRect();
    const rootStyle = getComputedStyle(root);
    const directTextElements = [root, ...root.querySelectorAll<HTMLElement>("*")].filter((element) => {
      if (element.closest(".sr-only, [aria-hidden='true']") !== null) return false;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      if (element.getClientRects().length === 0) return false;
      return [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim().length !== 0);
    });
    const facts = directTextElements.map((element) => ({
      id: element.id || element.tagName.toLowerCase(),
      fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
    }));
    const horizontalOverflows = [root, ...root.querySelectorAll<HTMLElement>("*")]
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
      })
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => ({
        id: element.id || element.className || element.tagName.toLowerCase(),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
    const truthCues = truthCueIds.map((truthCueId) => {
      const cue = root.querySelector<HTMLElement>(`#${truthCueId}`);
      if (cue === null) return { id: truthCueId, exists: false };
      const style = getComputedStyle(cue);
      const bounds = cue.getBoundingClientRect();
      const cueTop = root.scrollTop + bounds.top - rootBounds.top;
      const cueBottom = root.scrollTop + bounds.bottom - rootBounds.top;
      const cueTextElements = [cue, ...cue.querySelectorAll<HTMLElement>("*")].filter((element) => {
        if (element.closest(".sr-only, [aria-hidden='true']") !== null) return false;
        const elementStyle = getComputedStyle(element);
        if (elementStyle.display === "none" || elementStyle.visibility === "hidden" || Number(elementStyle.opacity) === 0) return false;
        if (element.getClientRects().length === 0) return false;
        return [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim().length !== 0);
      });
      return {
        id: truthCueId,
        exists: true,
        visible: style.display !== "none"
          && style.visibility !== "hidden"
          && Number(style.opacity) !== 0
          && cue.getClientRects().length > 0,
        nonEmpty: cue.textContent?.trim().length !== 0,
        horizontallyContained: bounds.left >= rootBounds.left - 1 && bounds.right <= rootBounds.right + 1,
        verticallyReachable: cueTop >= -1 && cueBottom <= root.scrollHeight + 1,
        textCount: cueTextElements.length,
        tooSmallText: cueTextElements
          .map((element) => ({
            id: element.id || element.tagName.toLowerCase(),
            fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
          }))
          .filter((fact) => fact.fontSize + 0.01 < minimumPx),
      };
    });
    const visibleOutcomes = [...root.querySelectorAll<HTMLElement>("button[id$='-cutaway-outcome']")]
      .filter((button) => {
        const style = getComputedStyle(button);
        return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
      });
    return {
      pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      rootContained: rootBounds.left >= -1
        && rootBounds.right <= innerWidth + 1
        && rootBounds.top >= -1
        && rootBounds.bottom <= innerHeight + 1,
      horizontalContentFits: root.scrollWidth <= root.clientWidth + 1,
      contentAccessible: root.scrollHeight <= root.clientHeight + 1
        || ["auto", "scroll"].includes(rootStyle.overflowY),
      horizontalFactsContained: facts.every((fact) => fact.left >= rootBounds.left - 1 && fact.right <= rootBounds.right + 1),
      horizontalOverflows,
      truthCues,
      visibleFactCount: facts.length,
      tooSmall: facts.filter((fact) => fact.fontSize + 0.01 < minimumPx),
      visibleOutcomeCount: visibleOutcomes.length,
      buttonHeights: visibleOutcomes.map((button) => button.getBoundingClientRect().height),
    };
  }, { minimumPx: minimumReadableTextPx, truthCueIds: recipe.truthCueIds });

  const context = JSON.stringify({ recipe: recipe.key, condition: condition.label, audit });
  expect(audit.pageFits, context).toBe(true);
  expect(audit.rootContained, context).toBe(true);
  expect(audit.horizontalContentFits, context).toBe(true);
  expect(audit.contentAccessible, context).toBe(true);
  expect(audit.horizontalFactsContained, context).toBe(true);
  expect(audit.horizontalOverflows, context).toEqual([]);
  expect(audit.truthCues, context).toHaveLength(recipe.truthCueIds.length);
  expect(audit.truthCues.every((cue) => cue.exists), context).toBe(true);
  expect(audit.truthCues.every((cue) => "visible" in cue && cue.visible), context).toBe(true);
  expect(audit.truthCues.every((cue) => "nonEmpty" in cue && cue.nonEmpty), context).toBe(true);
  expect(audit.truthCues.every((cue) => "horizontallyContained" in cue && cue.horizontallyContained), context).toBe(true);
  expect(audit.truthCues.every((cue) => "verticallyReachable" in cue && cue.verticallyReachable), context).toBe(true);
  expect(audit.truthCues.every((cue) => "textCount" in cue && cue.textCount > 0), context).toBe(true);
  expect(audit.truthCues.flatMap((cue) => "tooSmallText" in cue ? cue.tooSmallText : []), context).toEqual([]);
  expect(audit.tooSmall, context).toEqual([]);
  expect(audit.visibleOutcomeCount, context).toBe(1);
  expect(audit.buttonHeights).toHaveLength(1);
  expect(audit.buttonHeights.every((height) => height >= 44), context).toBe(true);
}

test("keeps every registered semantic cutaway readable and reachable", async ({ page }) => {
  test.setTimeout(120_000);
  expect(recipeCases).toHaveLength(11);
  expect(new Set(recipeCases.map((recipe) => recipe.rootId)).size).toBe(8);
  expect(Object.keys(realJourneyByRecipe).sort()).toEqual(recipeCases.map((recipe) => recipe.key).sort());
  expect(Object.values(realJourneyByRecipe).every((journey) => journey.length > 0)).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await readyPausedPage(page);

  for (const condition of conditions) {
    await page.setViewportSize(condition.viewport);
    for (const recipe of recipeCases) await auditRecipe(page, recipe, condition);
  }

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
    for (const root of document.querySelectorAll<HTMLElement>(".trap-cutaway")) root.hidden = true;
  });
  await expect(page.locator(".trap-cutaway:visible")).toHaveCount(0);
});

test("keeps the semantic typography floor at DPR2", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4174/the-grind-2/",
    deviceScaleFactor: 2,
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await readyPausedPage(page);
    const condition: AuditCondition = {
      label: "desktop DPR2",
      viewport: { width: 1280, height: 800 },
      textScalePercent: 100,
    };
    for (const recipe of recipeCases) await auditRecipe(page, recipe, condition);
    expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
  } finally {
    await context.close();
  }
});
