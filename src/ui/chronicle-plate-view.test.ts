import { describe, expect, it } from "vitest";
import { captureChroniclePlateRecipe } from "./chronicle-plate";
import { chroniclePlatePagesForContext, holdChroniclePlateReading } from "./chronicle-plate-view";

function page(campaignId: string, sourceTick: number) {
  const recipe = captureChroniclePlateRecipe({
    schemaVersion: 1, kind: "town-visit", templateId: "town-landmarks@1", campaignId, sourceTick,
    sourceEventId: `${campaignId}:${sourceTick}`,
    town: { id: "town:ford", locationId: "ford", name: "Greyford", specialty: "Milling" },
    visit: { before: 0, after: 1 }, reputation: { before: 0, after: 1 },
    landmarks: [{ id: "ford:inn", name: "The Badger Inn", kind: "inn", districtId: "ford:district" }],
  });
  if (recipe === null) throw new Error("The view fixture must be a valid captured recipe");
  return recipe;
}

describe("Chronicle Plates reading policy", () => {
  it("shows only the current hero's recorded past, retaining the archive's captured order", () => {
    const latest = page("hero:one", 12);
    const earlier = page("hero:one", 5);
    const entries = Object.freeze([page("hero:two", 1), page("hero:one", 20), latest, earlier]);
    const result = chroniclePlatePagesForContext(entries, { campaignId: "hero:one", currentTick: 12 });
    expect(result).toEqual([latest, earlier]);
    expect(result[0]).toBe(latest);
    expect(entries).toHaveLength(4);
    expect(chroniclePlatePagesForContext(entries, { campaignId: "hero:one", currentTick: 4 })).toEqual([]);
  });

  it("does not expose pages when the current tick is invalid or the hero has none", () => {
    const entries = [page("hero:one", 1)];
    for (const currentTick of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5]) {
      expect(chroniclePlatePagesForContext(entries, { campaignId: "hero:one", currentTick })).toEqual([]);
    }
    expect(chroniclePlatePagesForContext(entries, { campaignId: "hero:two", currentTick: 100 })).toEqual([]);
  });

  it("holds both empty and populated reading lists when new pages arrive while open", () => {
    const context = { campaignId: "hero:one", currentTick: 20 };
    expect(holdChroniclePlateReading([], context, true, false)).toBe(true);
    expect(holdChroniclePlateReading([page("hero:one", 5)], context, true, false)).toBe(true);
    expect(holdChroniclePlateReading([page("hero:one", 5)], context, false, false)).toBe(false);
  });

  it("immediately releases the old snapshot on campaign change or a rewind into its future", () => {
    const shown = [page("hero:one", 12), page("hero:one", 5)];
    expect(holdChroniclePlateReading(shown, { campaignId: "hero:two", currentTick: 100 }, true, true)).toBe(false);
    expect(holdChroniclePlateReading([], { campaignId: "hero:two", currentTick: 100 }, true, true)).toBe(false);
    expect(holdChroniclePlateReading(shown, { campaignId: "hero:one", currentTick: 8 }, true, false)).toBe(false);
    expect(chroniclePlatePagesForContext(shown, { campaignId: "hero:one", currentTick: 8 })).toEqual([shown[1]]);
  });
});
