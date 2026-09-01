import { describe, expect, it } from "vitest";
import type { TownItineraryPacketV1 } from "../ui/town-itinerary";
import {
  projectTownItineraryCutawayFrame,
  townItineraryDurationSeconds,
} from "./town-itinerary-cutaway";

const packet = {} as TownItineraryPacketV1;

describe("town itinerary cutaway choreography", () => {
  it("visits every semantic phase in order", () => {
    const phases = [0, 1.3, 2.5, 4.7, 5.7, 6.5]
      .map((elapsed) => projectTownItineraryCutawayFrame(packet, elapsed, false).phase);
    expect(phases).toEqual(["arrival", "district", "route", "encounter", "consequence", "settled"]);
  });

  it("moves the hero monotonically to the resident's building and retains every truth layer", () => {
    let priorX = -Infinity;
    for (let elapsed = 0; elapsed <= townItineraryDurationSeconds; elapsed += 0.1) {
      const frame = projectTownItineraryCutawayFrame(packet, elapsed, false);
      expect(frame.heroX).toBeGreaterThanOrEqual(priorX);
      priorX = frame.heroX;
    }
    expect(projectTownItineraryCutawayFrame(packet, townItineraryDurationSeconds, false)).toMatchObject({
      heroX: 207,
      routeProgress: 1,
      districtAlpha: 1,
      routeAlpha: 1,
      buildingHighlightAlpha: 1,
      residentAlpha: 1,
      consequenceAlpha: 1,
    });
  });

  it("makes reduced motion and Show Outcome the same complete tableau", () => {
    expect(projectTownItineraryCutawayFrame(packet, 0, true)).toEqual(
      projectTownItineraryCutawayFrame(packet, 0, false, true),
    );
    expect(projectTownItineraryCutawayFrame(packet, 0, true).phase).toBe("static");
  });

  it("keeps all values finite and alphas bounded", () => {
    for (let elapsed = -1; elapsed <= 8; elapsed += 0.1) {
      const frame = projectTownItineraryCutawayFrame(packet, elapsed, false);
      for (const alpha of [frame.routeProgress, frame.districtAlpha, frame.routeAlpha, frame.buildingHighlightAlpha, frame.residentAlpha, frame.consequenceAlpha]) {
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThanOrEqual(1);
      }
      expect(Number.isFinite(frame.heroX)).toBe(true);
      expect(Number.isFinite(frame.heroY)).toBe(true);
    }
  });
});
