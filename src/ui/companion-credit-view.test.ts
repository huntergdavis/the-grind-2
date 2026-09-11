import { beforeAll, describe, expect, it } from "vitest";
import { companionCreditBeforeVictoryFixture, companionCreditFarewellFixture, companionCreditTownBoundaryFixture } from "../../tests/companion-credit-fixtures";
import { actorPolicy, advanceWorld, campaignDirector, rulesEngine } from "../core/simulation";
import type { WorldState } from "../core/types";
import type { CompanionCreditChoice } from "../depth/companion-credit";
import { projectCompanionCreditHistory, projectCompanionCreditScene } from "./companion-credit-view";
import { projectCompanionFarewell } from "./companion-farewell";
import { projectRecordedFarewell } from "./recorded-farewell";
import { projectReparteeScene } from "./repartee-view";

/** A legal alternative to the autonomous choice, not an invented combat or personality. */
function choose(world: WorldState, choice: CompanionCreditChoice): WorldState {
  const opportunity = campaignDirector(world);
  const selected = opportunity.candidates.find((entry) => entry.command.type === "share-companion-credit" && entry.command.choice === choice)!;
  return rulesEngine(world, opportunity, {
    ...actorPolicy(world, opportunity), command: selected.command, commandId: `${world.campaignId}:${selected.id}`,
    action: selected.label, rationale: "Explicit presentation check of this legal credit choice.",
    consideredCommandIds: opportunity.candidates.map((entry) => `${world.campaignId}:${entry.id}`),
  });
}

describe("share the credit presentation", () => {
  let beforeVictory: WorldState, ready: WorldState, exchanged: WorldState, beforeFarewell: WorldState, departed: WorldState;
  beforeAll(() => {
    // Only the old fixture's initial visited-town boundary is staged. Every
    // contribution, victory, exchange, road leg and farewell below is earned.
    beforeVictory = companionCreditBeforeVictoryFixture();
    ready = companionCreditTownBoundaryFixture();
    exchanged = advanceWorld(ready);
    beforeFarewell = companionCreditFarewellFixture();
    departed = advanceWorld(beforeFarewell);
  });

  it("does not speak on behalf of an ongoing battle or a pending earned record", () => {
    expect(beforeVictory.depth.combat?.outcome).toBe("ongoing");
    expect(ready.depth.companionCredit!.exchange).toBeNull();
    expect(projectCompanionCreditScene(beforeVictory)).toBeNull();
    expect(projectCompanionCreditScene(ready)).toBeNull();
  });

  it.each(["acknowledge", "claim-credit"] as const)("shows the exact %s exchange beside the actual road, without a new battle reward", (choice) => {
    const world = choose(ready, choice), credit = world.depth.companionCredit!, exchange = credit.exchange!;
    const scene = projectCompanionCreditScene(world)!;
    expect(scene).toMatchObject({ phase: "credit", creditId: exchange.sourceCommandId,
      commandId: `${world.campaignId}:${exchange.sourceCommandId}`, tick: world.tick,
      heroId: credit.heroId, companion: { id: credit.residentId, name: credit.companionName, joinedTick: credit.joinedTick },
      venue: "road", locationId: credit.locationId, evidenceId: credit.evidence.damageEventId,
      choice, regardDelta: choice === "acknowledge" ? 1 : -1,
      call: exchange.heroLine, reply: exchange.companionLine,
      bookId: null, buildingId: null, residentId: null, witness: null, outcome: null, marks: [], momentum: null,
    });
    expect(scene.locationName).toContain(" → ");
    expect(projectReparteeScene(world)).toEqual(scene);
    expect(world.depth.hero).toEqual(ready.depth.hero);
    expect(world.depth.companions).toEqual(ready.depth.companions);
    expect(world.depth.atlas).toEqual(ready.depth.atlas);
    expect(world.depth.quest).toEqual(ready.depth.quest);
    expect(world.depth.reparteeWitness).toEqual(ready.depth.reparteeWitness);
  });

  it("retains the actual contributor's positive damage rather than treating a victory count as evidence", () => {
    const credit = exchanged.depth.companionCredit!;
    const damage = credit.evidence.combat.eventStream.events.find((entry) => entry.id === credit.evidence.damageEventId)!;
    expect(damage).toMatchObject({ kind: "damage", actorId: credit.residentId, amount: 13, healthBefore: 14, healthAfter: 1 });
    expect(credit.evidence.combat.outcome).toBe("victory");
    const changed = { ...exchanged, depth: { ...exchanged.depth, companionCredit: { ...credit,
      evidence: { ...credit.evidence, damageEventId: credit.evidence.outcomeEventId },
    } } };
    expect(projectCompanionCreditScene(changed)).toBeNull();
  });

  it("shows the later exact remembered line at the earned healthy farewell, with no invented hero answer", () => {
    expect(projectCompanionCreditScene(beforeFarewell)).toBeNull();
    const credit = departed.depth.companionCredit!, farewell = credit.farewell!;
    const location = departed.depth.atlas.locations.find((entry) => entry.id === departed.depth.atlas.currentLocationId)!;
    const scene = projectCompanionCreditScene(departed)!;
    expect(scene).toMatchObject({ phase: "credit-farewell", creditId: credit.exchange!.sourceCommandId,
      commandId: `${departed.campaignId}:${farewell.sourceCommandId}`, tick: farewell.tick,
      companion: { id: credit.residentId, name: credit.companionName },
      venue: "threshold", locationId: location.id, locationName: location.name,
      title: `Parting words · ${location.name}`, call: "", reply: farewell.line,
      consequence: "The road ends; the words remain.", marks: [], momentum: null,
    });
    expect(projectReparteeScene(departed)).toEqual(scene);
    expect(departed.depth.companions.active).toEqual([]);
    expect(projectCompanionFarewell(beforeFarewell, departed, departed.chronicle.at(-1)!)).not.toBeNull();
    expect(projectRecordedFarewell(beforeFarewell, departed)).not.toBeNull();
  });

  it("reconstructs exact saved scenes without mutating either source", () => {
    for (const world of [exchanged, departed]) {
      const saved = JSON.stringify(world), scene = projectCompanionCreditScene(world)!;
      expect(Object.isFrozen(scene)).toBe(true);
      expect(Object.isFrozen(scene.companion)).toBe(true);
      expect(projectCompanionCreditScene(JSON.parse(saved))).toEqual(scene);
      expect(JSON.stringify(world)).toBe(saved);
    }
  });

  it("rejects foreign, stale, wrong-command and absent or injured speaker sources", () => {
    for (const world of [exchanged, departed]) {
      const source = world.chronicle.at(-1)!;
      const withSource = (change: Partial<typeof source>): WorldState => ({ ...world,
        chronicle: [...world.chronicle.slice(0, -1), { ...source, ...change }],
      });
      expect(projectCompanionCreditScene(withSource({ commandId: `foreign:${source.commandId}` }))).toBeNull();
      expect(projectCompanionCreditScene(withSource({ tick: world.tick - 1 }))).toBeNull();
      expect(projectCompanionCreditScene(withSource({ commandType: "travel" }))).toBeNull();
      expect(projectCompanionCreditScene({ ...world, scene: { ...world.scene, mode: "battle" } })).toBeNull();
      expect(projectCompanionCreditScene({ ...world, depth: { ...world.depth,
        companions: { ...world.depth.companions, active: [], former: [] },
      } })).toBeNull();
    }
    const active = exchanged.depth.companions.active[0]!;
    expect(projectCompanionCreditScene({ ...exchanged, depth: { ...exchanged.depth,
      companions: { ...exchanged.depth.companions, active: [{ ...active, injury: "wounded" }] },
    } })).toBeNull();
    const former = departed.depth.companions.former.at(-1)!;
    expect(projectCompanionCreditScene({ ...departed, depth: { ...departed.depth,
      companions: { ...departed.depth.companions, former: [{ ...former, injury: "fallen", resources: { ...former.resources, health: 0 } }] },
    } })).toBeNull();
  });

  it("retains the conduct and farewell history without replaying either stage after ordinary continuation", () => {
    for (const world of [exchanged, departed]) {
      const after = advanceWorld(world);
      expect(after.depth.companionCredit).toEqual(world.depth.companionCredit);
      expect(projectCompanionCreditScene(after)).toBeNull();
    }
  });

  it("keeps one exact Company history after the old roster entry is pruned, without summoning that companion", () => {
    // Explicit history-retention boundary after a real departure, not another
    // staged reunion or claim that this small journey naturally pruned a roster.
    const after = advanceWorld(departed), credit = after.depth.companionCredit!;
    const pruned = { ...after, depth: { ...after.depth,
      companions: { ...after.depth.companions, active: [], former: [] },
    } };
    expect(projectCompanionCreditHistory(pruned, credit.residentId, credit.joinedTick)).toEqual(credit);
    expect(projectCompanionCreditHistory(pruned, credit.residentId, credit.joinedTick + 1)).toBeNull();
    expect(projectCompanionCreditHistory(pruned, "not-this-contributor", credit.joinedTick)).toBeNull();
    expect(projectCompanionCreditScene(pruned)).toBeNull();
  });
});
