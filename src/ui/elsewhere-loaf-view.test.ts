import { beforeAll, describe, expect, it } from "vitest";
import { canonicalStringify } from "../core/canonical";
import type { WorldState } from "../core/types";
import { naturalExperimentalLoafFixture, type ExperimentalLoafJourney } from "../../tests/experimental-loaf-fixtures";
import { cutawayRegistry, projectCutawayCandidates, resolveCutawayCandidate } from "../render/cutaway-registry";
import { elsewhereLoafTitle, isElsewhereLoafPacket, projectElsewhereLoafPacket, projectElsewhereLoafTransition } from "./elsewhere-loaf-view";

describe("source-bound Elsewhere baker presentation", () => {
  let journey: ExperimentalLoafJourney;
  beforeAll(() => { journey = naturalExperimentalLoafFixture(); });

  it("shows only actual admitted dough and style, never the committed private roll or future outcome", () => {
    const { before, admitted } = journey, receipt = admitted.depth.elsewhereLoaf!;
    expect(projectElsewhereLoafPacket(before, "admission")).toBeNull();
    const packet = projectElsewhereLoafTransition(before, admitted, admitted.chronicle.at(-1)!)!;
    expect(packet).toMatchObject({ phase: "admission", residentId: receipt.residentId, companionName: "Ada Fen", role: "baker",
      joinedTick: receipt.joinedTick, locationId: receipt.locationId, locationName: "Elderwatch", innName: receipt.innName,
      heroLocationId: admitted.depth.atlas.currentLocationId, product: "dough", doughQuantity: 1, productQuantity: 0,
      line: receipt.admission.line, style: receipt.admission.style,
      sourceCommandId: admitted.chronicle.at(-1)!.commandId, eventId: `${admitted.campaignId}:${receipt.admission.eventId}` });
    expect(packet.heroLocationId).not.toBe(packet.locationId);
    expect(packet.residentId).not.toBe(admitted.hero.id);
    expect(packet.eventId).not.toBe(admitted.chronicle.at(-1)!.id);
    for (const key of ["ovenRoll", "outcome", "completion", "hero", "seed"]) expect(packet).not.toHaveProperty(key);
    expect(isElsewhereLoafPacket(packet)).toBe(true);
    expect(Object.isFrozen(packet)).toBe(true);
    expect(projectElsewhereLoafPacket(admitted, "completion")).toBeNull();
  });

  it("reveals exactly the committed loaf on its separate actual source and never repeats the transition", () => {
    const { admitted, completed, next } = journey, receipt = completed.depth.elsewhereLoaf!;
    const packet = projectElsewhereLoafTransition(admitted, completed, completed.chronicle.at(-1)!)!;
    expect(packet).toMatchObject({ phase: "completion", product: receipt.completion!.outcome, outcome: receipt.completion!.outcome,
      doughQuantity: 0, productQuantity: 1, line: receipt.completion!.line,
      sourceCommandId: completed.chronicle.at(-1)!.commandId,
      eventId: `${completed.campaignId}:${receipt.completion!.eventId}` });
    expect(packet).not.toHaveProperty("ovenRoll");
    expect(projectElsewhereLoafTransition(completed, next, next.chronicle.at(-1)!)).toBeNull();
    expect(projectElsewhereLoafTransition(completed, completed, completed.chronicle.at(-1)!)).toBeNull();
    expect(next.depth.elsewhereLoaf).toEqual(receipt);
  });

  it("keeps the independent event and hero command distinct in the existing bounded cutaway registry", () => {
    const { before, admitted } = journey, original = canonicalStringify(admitted);
    const source = admitted.chronicle.at(-1)!;
    const candidates = projectCutawayCandidates(before, admitted, source).filter(entry => entry.recipeKey === "elsewhere-loaf@1");
    expect(candidates).toHaveLength(1);
    const candidate = candidates[0]!;
    expect(candidate.staticEnvelope.eventId).toBe(candidate.packet.eventId);
    expect(candidate.staticEnvelope.action).toBe(admitted.depth.elsewhereLoaf!.admission.line);
    expect(candidate.staticEnvelope.action).not.toBe(source.action);
    expect(resolveCutawayCandidate(cutawayRegistry, candidate)).toMatchObject({ mode: "animate", reason: "registered" });
    expect(canonicalStringify(admitted)).toBe(original);
    expect(admitted.scene).toMatchObject({ mode: source.mode, action: source.action, consequence: source.consequence });
  });

  it("rejects foreign sources and any private field smuggled into an otherwise valid public packet", () => {
    const { before, admitted } = journey, source = admitted.chronicle.at(-1)!;
    const packet = projectElsewhereLoafPacket(admitted, "admission")!;
    expect(isElsewhereLoafPacket({ ...packet, ovenRoll: 6 })).toBe(false);
    expect(isElsewhereLoafPacket({ ...packet, outcome: "unexpected-delight" })).toBe(false);
    expect(isElsewhereLoafPacket({ ...packet, sourceCommandId: "foreign:source" })).toBe(false);
    expect(projectElsewhereLoafTransition(before, admitted, { ...source, commandId: `${source.commandId}:other` })).toBeNull();
    expect(projectElsewhereLoafPacket({ ...admitted, campaignId: "foreign-campaign" }, "admission")).toBeNull();
    expect(projectElsewhereLoafPacket({ ...admitted, hero: { ...admitted.hero, id: "another-hero" } }, "admission")).toBeNull();
  });

  it("retains exact public facts after reload and labels older playback as Earlier, elsewhere", () => {
    const { admitted, next } = journey;
    const packet = projectElsewhereLoafPacket(admitted, "admission")!;
    expect(projectElsewhereLoafPacket(JSON.parse(canonicalStringify(admitted)) as WorldState, "admission")).toEqual(packet);
    expect(projectElsewhereLoafPacket(next, "admission")).toEqual(packet);
    expect(elsewhereLoafTitle(packet, admitted.tick)).toBe("Elsewhere · Elderwatch");
    expect(elsewhereLoafTitle(packet, next.tick)).toBe("Earlier, elsewhere · Elderwatch");
  });
});
