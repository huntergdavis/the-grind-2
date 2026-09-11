import { describe, expect, it } from "vitest";
import { commitLegalInnBluffChoice, naturalInnBluffBeforeAdmissionFixture, naturalInnBluffFixture } from "../../tests/inn-bluff-fixtures";
import { innBluffClaim, innBluffTellText, projectInnBluffDecision, selectInnBluff, selectInnBluffVenue } from "../depth/inn-bluff";
import { canonicalHash, canonicalStringify } from "./canonical";
import { actorPolicy, advanceWorld, campaignDirector, upgradeWorldState } from "./simulation";
import type { WorldState } from "./types";

function reload(world: WorldState): WorldState { return upgradeWorldState(JSON.parse(canonicalStringify(world))); }
function onlyBluffGoldChanges(before: WorldState, after: WorldState, delta: number): void {
  expect(after.depth).toEqual({ ...before.depth, tick: before.tick + 1, log: after.depth.log,
    innBluff: after.depth.innBluff, hero: { ...before.depth.hero, gold: before.depth.hero.gold + delta } });
  expect(after.hero).toEqual({ ...before.hero, gold: before.hero.gold + delta });
}

describe("one actual inn claim, a fallible tell and an honest reveal", () => {
  it("preserves the unchanged pre-inn journey and resolves the actual autonomous choice before moving on", () => {
    const before = naturalInnBluffBeforeAdmissionFixture(), ready = naturalInnBluffFixture();
    expect(canonicalHash(before)).toBe("63f2927459e83ca1");
    expect(before.tick).toBe(4); expect(before.depth).not.toHaveProperty("innBluff");
    expect(before.depth.smithyJob?.completion?.shape).toBe("straight");
    expect(advanceWorld(before)).toEqual(ready); onlyBluffGoldChanges(before, ready, 0);
    const bluff = ready.depth.innBluff!;
    expect(bluff).toMatchObject({ heroId: ready.hero.id, residentName: "Cato Ash", residentRole: "scholar",
      innName: "The Candle Inn", presenceRule: "admitted-together-v1", admission: { tick: 5, goldBefore: 9 }, resolution: null });
    const decision = actorPolicy(ready, campaignDirector(ready)), result = advanceWorld(ready), receipt = result.depth.innBluff!.resolution!;
    expect(decision.command.type).toBe("resolve-inn-bluff");
    if (decision.command.type !== "resolve-inn-bluff") throw new Error("Expected the actual inn decision");
    expect(receipt.choice).toBe(decision.command.choice);
    expect(receipt.revealedFace).toBe(bluff.admission.face);
    const delta = receipt.choice === "decline" ? 0 : receipt.revealedFace < 4 ? 1 : -1;
    onlyBluffGoldChanges(ready, result, delta);
    expect(result.chronicle.at(-1)?.commandId).toBe(`${result.campaignId}:${receipt.sourceCommandId}`);
    expect(result.scene.action).toContain(`${receipt.revealedFace}`);
    expect(result.scene.action).toContain(receipt.line);
    const next = advanceWorld(result);
    expect(next.chronicle.at(-1)?.commandType).toBe("plan-route");
    expect(next.depth.innBluff).toEqual(result.depth.innBluff);
    expect(next.hero.gold).toBe(result.hero.gold);
    expect(selectInnBluff(next.depth)).toBeNull(); expect(selectInnBluffVenue(next.depth)).toBeNull();
    for (const world of [before, ready, result, next]) expect(reload(world)).toEqual(world);
  });

  it("offers challenge and decline on the same committed cup, never rerolls or rewards other mechanics", () => {
    const ready = naturalInnBluffFixture(), bluff = ready.depth.innBluff!;
    for (const choice of ["challenge", "decline"] as const) {
      const result = commitLegalInnBluffChoice(ready, choice), receipt = result.depth.innBluff!.resolution!;
      const bluffWasFalse = bluff.admission.face < 4;
      expect(receipt).toMatchObject({ tick: ready.tick + 1, choice, revealedFace: bluff.admission.face,
        outcome: choice === "decline" ? "declined" : bluffWasFalse ? "exposed-bluff" : "honest-claim",
        goldBefore: 9, goldSpent: choice === "challenge" ? 1 : 0,
        goldReturned: choice === "challenge" && bluffWasFalse ? 2 : 0,
        goldAfter: 9 + (choice === "decline" ? 0 : bluffWasFalse ? 1 : -1) });
      onlyBluffGoldChanges(ready, result, receipt.goldAfter - receipt.goldBefore);
      expect(result.depth.innBluff!.admission).toEqual(bluff.admission);
      expect(reload(result)).toEqual(result);
      expect(campaignDirector(result).candidates.some(candidate => ["start-inn-bluff", "resolve-inn-bluff"].includes(candidate.command.type))).toBe(false);
      expect(advanceWorld(result).depth.innBluff).toEqual(result.depth.innBluff);
    }
  });

  it("keeps the covered face out of the public scene, candidates and personality-based explanation", () => {
    const ready = naturalInnBluffFixture(), view = projectInnBluffDecision(ready.depth)!;
    const opportunity = campaignDirector(ready), choice = actorPolicy(ready, opportunity);
    expect(ready.scene.action).toBe(`${ready.hero.name} sits down with ${view.residentName}. “${innBluffClaim}” ${innBluffTellText(view.tell)}`);
    expect(view).not.toHaveProperty("face"); expect(view).not.toHaveProperty("resolution"); expect(view).not.toHaveProperty("seed");
    expect(view.choices.map(option => option.choice)).toEqual(["challenge", "decline"]);
    expect(JSON.stringify({ view, scene: ready.scene, source: ready.chronicle.at(-1), log: ready.depth.log.at(-1),
      candidates: opportunity.candidates, rationale: choice.rationale, trace: choice.trace }))
      .not.toMatch(/revealedFace|cup-face|tell-fidelity|goldReturned|exposed-bluff|honest-claim/iu);
    // Explicit personality fixture: nothing about the hidden commitment changes.
    const adventurous = reload({ ...ready, hero: { ...ready.hero, values: ["curiosity", "courage"] } });
    const adventurousChoice = actorPolicy(adventurous, campaignDirector(adventurous));
    expect(adventurous.depth.innBluff).toEqual(ready.depth.innBluff);
    expect(adventurousChoice.command).toMatchObject({ type: "resolve-inn-bluff", choice: "challenge" });
    expect(adventurousChoice.rationale).toContain("uncertainty");
    expect(reload(advanceWorld(adventurous))).toEqual(advanceWorld(adventurous));
  });
});
