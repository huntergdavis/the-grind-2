import { describe, expect, it } from "vitest";
import { canonicalHash } from "../core/canonical";
import type { ChampionInduction } from "../core/types";
import { maximumHallChampionCards, projectHallOfChampions } from "./hall-of-champions";

function champion(index: number, qualification: ChampionInduction["qualification"] = "earned"): ChampionInduction {
  const content = {
    schemaVersion: 1 as const,
    sourceCampaignId: `campaign:${index}`,
    heroId: `hero:${index}`,
    heroName: `Champion ${String(index).padStart(2, "0")}`,
    className: "Ranger",
    level: 1_000,
    experience: 11_976_012 + index,
    recordedTick: index,
    qualification,
    sourceCommandId: qualification === "earned" ? `command:${index}` : null,
    sourceCommandType: qualification === "earned" ? "wait" as const : "unknown-released-save" as const,
    totalCompletedQuests: index,
    equipment: [],
    abilities: [],
  };
  const contentHash = canonicalHash(content);
  return { ...content, id: `champion:${contentHash}`, contentHash };
}

describe("Hall of Champions projection", () => {
  it("sorts a bounded immutable gallery with exact earned and adopted totals", () => {
    const records = Array.from({ length: maximumHallChampionCards + 3 }, (_, index) =>
      champion(index, index % 4 === 0 ? "adopted" : "earned")
    );
    const before = JSON.stringify(records);
    const projection = projectHallOfChampions([...records].reverse());

    expect(projection.totalCount).toBe(67);
    expect(projection.champions).toHaveLength(maximumHallChampionCards);
    expect(projection.hiddenCount).toBe(3);
    expect(projection.earnedCount + projection.adoptedCount).toBe(projection.totalCount);
    expect(projection.champions[0]?.recordedTick).toBe(66);
    expect(JSON.stringify(records)).toBe(before);
  });

  it("deduplicates exact records and fails closed for malformed snapshots", () => {
    const valid = champion(1);
    const malformed = { ...champion(2), heroName: "Changed without a new hash" };
    expect(projectHallOfChampions([valid, structuredClone(valid), malformed])).toMatchObject({
      totalCount: 1,
      hiddenCount: 0,
      champions: [valid],
    });
  });
});
