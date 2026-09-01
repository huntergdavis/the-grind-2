import { describe, expect, it } from "vitest";
import type { BattleSpoilsComparisonPacketV1 } from "../ui/battle-spoils";
import {
  battleSpoilsDurationSeconds,
  projectBattleSpoilsCutawayFrame,
} from "./battle-spoils-cutaway";

const packet = {} as BattleSpoilsComparisonPacketV1;

describe("battle spoils cutaway choreography", () => {
  it("visits every semantic phase in order", () => {
    const phases = [0, 1.2, 2.5, 3.6, 4.8, 5.3]
      .map((elapsed) => projectBattleSpoilsCutawayFrame(packet, elapsed, false).phase);
    expect(phases).toEqual(["found", "compare", "exchange", "consequence", "final", "settled"]);
  });

  it("ends with both items, consequences, and hero fully legible", () => {
    const frame = projectBattleSpoilsCutawayFrame(packet, battleSpoilsDurationSeconds, false);
    expect(frame).toMatchObject({
      oldItemAlpha: 0.65,
      newItemAlpha: 1,
      arrowAlpha: 1,
      comparisonAlpha: 1,
      resourceAlpha: 1,
      heroAlpha: 1,
    });
  });

  it("makes reduced motion and Show Outcome the same complete static tableau", () => {
    expect(projectBattleSpoilsCutawayFrame(packet, 0, true)).toEqual(
      projectBattleSpoilsCutawayFrame(packet, 0, false, true),
    );
    expect(projectBattleSpoilsCutawayFrame(packet, 0, true).phase).toBe("static");
  });

  it("keeps every alpha bounded and every coordinate finite", () => {
    for (let elapsed = -1; elapsed <= 7; elapsed += 0.1) {
      const frame = projectBattleSpoilsCutawayFrame(packet, elapsed, false);
      for (const alpha of [frame.oldItemAlpha, frame.newItemAlpha, frame.arrowAlpha, frame.comparisonAlpha, frame.resourceAlpha, frame.heroAlpha]) {
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThanOrEqual(1);
      }
      for (const coordinate of [frame.oldItemX, frame.oldItemY, frame.newItemX, frame.newItemY]) {
        expect(Number.isFinite(coordinate)).toBe(true);
      }
    }
  });
});
