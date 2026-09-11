import { beforeAll, describe, expect, it } from "vitest";
import { commitLegalInnBluffChoice, naturalInnBluffBeforeAdmissionFixture, naturalInnBluffFixture } from "../../tests/inn-bluff-fixtures";
import { advanceWorld } from "../core/simulation";
import type { WorldState } from "../core/types";
import { innBluffClaim, innBluffTellText } from "../depth/inn-bluff";
import { projectInnBluffScene } from "./inn-bluff-view";
import { projectStatusHistory } from "./status-history";

describe("the inn bluff's public-only source-bound scene", () => {
  let before: WorldState, admitted: WorldState, challenged: WorldState, declined: WorldState;
  beforeAll(() => {
    before = naturalInnBluffBeforeAdmissionFixture(); admitted = naturalInnBluffFixture();
    challenged = commitLegalInnBluffChoice(admitted, "challenge"); declined = commitLegalInnBluffChoice(admitted, "decline");
  });

  it("requires actual admission and omits every private face/outcome field before the reveal", () => {
    expect(projectInnBluffScene(before)).toBeNull();
    const scene = projectInnBluffScene(admitted)!;
    expect(scene).toMatchObject({ phase: "admission", heroId: admitted.hero.id, residentName: "Cato Ash", residentRole: "scholar",
      innName: "The Candle Inn", locationName: "Elderwatch", commandId: admitted.chronicle.at(-1)!.commandId,
      claim: innBluffClaim, tell: admitted.depth.innBluff!.admission.tell,
      tellText: innBluffTellText(admitted.depth.innBluff!.admission.tell), goldBefore: 9, goldSpent: 0, goldReturned: 0, goldAfter: 9 });
    expect(admitted.depth.innBluff!.presenceRule).toBe("admitted-together-v1");
    for (const field of ["face", "revealedFace", "outcome", "resolution", "admission", "choice", "line", "seed", "truth", "fidelity"])
      expect(scene).not.toHaveProperty(field);
    expect(Object.values(scene).every(value => typeof value !== "object")).toBe(true);
    expect(scene.headline).toBe("THE CUP CLAIMS 4+");
  });

  it("reveals the committed die after either real choice and records only its actual wager delta", () => {
    const face = admitted.depth.innBluff!.admission.face;
    for (const [world, choice] of [[challenged, "challenge"], [declined, "decline"]] as const) {
      const result = world.depth.innBluff!.resolution!, scene = projectInnBluffScene(world)!;
      const returned = choice === "challenge" && face < 4 ? 2 : 0, spent = choice === "challenge" ? 1 : 0;
      expect(scene).toMatchObject({ phase: "result", choice, revealedFace: face,
        outcome: choice === "decline" ? "declined" : face < 4 ? "exposed-bluff" : "honest-claim",
        goldBefore: 9, goldSpent: spent, goldReturned: returned, goldAfter: 9 - spent + returned,
        detail: result.line, line: result.line, commandId: `${world.campaignId}:${result.sourceCommandId}` });
      expect(world.depth.hero.gold).toBe(9 - spent + returned);
      expect(world.depth.hero.resources).toEqual(admitted.depth.hero.resources);
      expect(world.depth.hero.inventory).toEqual(admitted.depth.hero.inventory);
      expect(world.depth.hero.experience).toBe(admitted.depth.hero.experience);
      expect(world.depth.innBluff!.admission).toEqual(admitted.depth.innBluff!.admission);
    }
  });

  it("reconstructs exact immutable views and rejects foreign, stale, relocated or changed-balance sources", () => {
    for (const world of [admitted, challenged, declined]) {
      const saved = JSON.stringify(world), scene = projectInnBluffScene(world), source = world.chronicle.at(-1)!;
      expect(scene).not.toBeNull(); expect(Object.isFrozen(scene)).toBe(true);
      expect(projectInnBluffScene(JSON.parse(saved))).toEqual(scene);
      expect(JSON.stringify(world)).toBe(saved);
      for (const change of [{ commandId: `foreign:${source.commandId}` }, { tick: world.tick - 1 },
        { commandType: "wait" as const }, { mode: "travel" as const }]) {
        expect(projectInnBluffScene({ ...world, chronicle: [...world.chronicle.slice(0, -1), { ...source, ...change }] })).toBeNull();
      }
      expect(projectInnBluffScene({ ...world, campaignId: "foreign" })).toBeNull();
      expect(projectInnBluffScene({ ...world, hero: { ...world.hero, id: "absent-hero" } })).toBeNull();
      expect(projectInnBluffScene({ ...world, depth: { ...world.depth, hero: { ...world.depth.hero, gold: world.depth.hero.gold + 1 } } })).toBeNull();
      expect(projectInnBluffScene({ ...world, depth: { ...world.depth, atlas: { ...world.depth.atlas, currentLocationId: "location:8" } } })).toBeNull();
    }
  });

  it("retains the actual job/history and exact Status sources while allowing ordinary onward play", () => {
    for (const world of [admitted, challenged, declined]) {
      expect(world.depth.smithyJob).toEqual(before.depth.smithyJob);
      expect(world.depth.towns).toEqual(before.depth.towns);
      expect(world.depth.companions).toEqual(before.depth.companions);
      expect(world.depth.quest).toEqual(before.depth.quest);
      const source = world.chronicle.at(-1)!;
      const row = projectStatusHistory(world).find(entry => entry.source === "chronicle" && entry.eventId === source.id);
      if (row?.source !== "chronicle") throw new Error("Missing inn-bluff Status source");
      expect(row.decision.commandId).toBe(source.commandId); expect(row.consequence).toBe(source.consequence);
    }
    const after = advanceWorld(challenged);
    expect(projectInnBluffScene(after)).toBeNull();
    expect(after.depth.innBluff).toEqual(challenged.depth.innBluff);
    expect(after.depth.hero.gold).toBe(challenged.depth.hero.gold);
    expect(after.chronicle.at(-1)!.commandType).not.toBe("resolve-inn-bluff");
  });
});
