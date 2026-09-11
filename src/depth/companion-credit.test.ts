import { beforeAll, describe, expect, it } from "vitest";
import { companionCreditBeforeVictoryFixture, companionCreditFarewellFixture, companionCreditTownBoundaryFixture } from "../../tests/companion-credit-fixtures";
import { naturalReparteeMemoryFixture } from "../../tests/repartee-memory-fixtures";
import { actorPolicy } from "../core/actor-policy";
import { canonicalStringify } from "../core/canonical";
import { advanceWorld, campaignDirector, catchUpWorld, upgradeWorldState } from "../core/simulation";
import type { HeroValue, WorldState } from "../core/types";
import { captureCompanionCredit, companionCreditChoices, companionCreditCommandId, companionCreditFarewellLine, isValidCampaignCompanionCredit, selectCompanionCredit } from "./companion-credit";
import { depthCommandCandidates, stepDepth, upgradeDepthState } from "./state";
import type { DepthCommand, DepthState } from "./types";

function reload(depth: DepthState): DepthState {
  return upgradeDepthState(JSON.parse(canonicalStringify(depth)), depth.seed, depth.hero.id, depth.hero.name);
}
function facts(depth: DepthState) {
  const { tick: _tick, log: _log, companionCredit: _credit, ...unchanged } = depth;
  return unchanged;
}
function responseCommand(depth: DepthState, choice: "acknowledge" | "claim-credit") {
  const credit = depth.companionCredit!;
  return { type: "share-companion-credit", residentId: credit.residentId, joinedTick: credit.joinedTick,
    combatId: credit.evidence.combat.id, choice } as const;
}

describe("Share the credit: one actual contributor, two honest consequences", () => {
  let ready: WorldState, completed: WorldState;
  beforeAll(() => {
    // Existing second-town boundary only; the ensuing recruitment, damage,
    // victory and exchange are actual commands, not staged combat outcomes.
    ready = companionCreditTownBoundaryFixture();
    completed = advanceWorld(ready);
  });

  it("captures actual positive companion damage only on the winning command", () => {
    const before = companionCreditBeforeVictoryFixture(), credit = ready.depth.companionCredit!;
    expect(before.depth.companionCredit).toBeNull();
    expect(advanceWorld(before)).toEqual(ready);
    expect(credit.exchange).toBeNull();
    expect(credit.evidence.tick).toBe(ready.tick);
    expect(credit.evidence.combat).toEqual(ready.depth.completedCombats.at(-1));
    expect(credit.evidence.combat).not.toBe(ready.depth.completedCombats.at(-1));
    expect(credit.evidence.companion).toEqual(ready.depth.companions.active[0]);
    expect(credit.evidence.combat.eventStream.events.find((event) => event.id === credit.evidence.damageEventId))
      .toMatchObject({ kind: "damage", actorId: credit.residentId, amount: 13, healthBefore: 14, healthAfter: 1 });
    expect(credit.evidence.combat.eventStream.events.at(-1)).toMatchObject({ id: credit.evidence.outcomeEventId, kind: "outcome", outcome: "victory" });
    expect(ready.chronicle.at(-1)).toMatchObject({ commandType: "combat-action", commandId: `${ready.campaignId}:${credit.evidence.sourceCommandId}` });
    expect(ready.depth.atlas.route).not.toBeNull();
    expect(reload(ready.depth)).toEqual(ready.depth);
    // The separate uninterrupted natural fixture has a one-hit hero victory
    // before any companion damage. General participation is NOT an assist.
    const noAssist = naturalReparteeMemoryFixture();
    expect(noAssist.depth.companionCredit).toBeNull();
    expect(selectCompanionCredit(noAssist.depth)).toBeNull();
    const winningCommand = campaignDirector(before).candidates[0]!.command;
    expect(winningCommand.type).toBe("combat-action");
    if (winningCommand.type !== "combat-action") throw new Error("Expected the winning combat action");
    expect(captureCompanionCredit(ready.depth, ready.depth, winningCommand)).toEqual(credit);
  });

  it("both choices retain exact dialogue and opposite directional regard without changing any reward or bond", () => {
    for (const response of companionCreditChoices(ready.depth)) {
      const command = responseCommand(ready.depth, response.choice), after = stepDepth(ready.depth, command);
      expect(after.companionCredit!.exchange).toEqual({ ...response, sourceCommandId: companionCreditCommandId(after.tick, command), tick: after.tick });
      expect(facts(after)).toEqual(facts(ready.depth));
      expect(after.companionCredit!.evidence).toEqual(ready.depth.companionCredit!.evidence);
      expect(reload(after)).toEqual(after);
      expect(selectCompanionCredit(after)).toBeNull();
      expect(() => stepDepth(after, command)).toThrow();
    }
    expect(companionCreditChoices(ready.depth).map((response) => response.regardDelta)).toEqual([1, -1]);
    expect(completed.hero).toEqual(ready.hero);
    expect(completed.depth.companionCredit!.exchange!.choice).toBe("acknowledge");
    expect(completed.chronicle.at(-1)?.commandId).toBe(`${completed.campaignId}:${completed.depth.companionCredit!.exchange!.sourceCommandId}`);
    expect(completed.scene.location).toBe(ready.depth.atlas.locations.find((location) => location.id === ready.depth.companionCredit!.locationId)!.name);
    expect(campaignDirector(completed).candidates[0]!.command.type).toBe("travel");
    expect(upgradeWorldState(JSON.parse(canonicalStringify(completed)))).toEqual(completed);
    expect(advanceWorld(completed).depth.companionCredit).toEqual(completed.depth.companionCredit);
  });

  it("uses declared values to choose, without inventing a different reaction or a foreign command", () => {
    const opportunity = campaignDirector(ready);
    for (const [value, choice] of [["loyalty", "acknowledge"], ["mercy", "acknowledge"], ["curiosity", "acknowledge"], ["courage", "claim-credit"]] as const) {
      const policy = actorPolicy({ ...ready, hero: { ...ready.hero, values: [value as HeroValue] } }, opportunity);
      expect(policy.command).toMatchObject({ type: "share-companion-credit", choice });
      expect(stepDepth(ready.depth, policy.command).companionCredit!.exchange!.regardDelta).toBe(choice === "acknowledge" ? 1 : -1);
    }
    const original = opportunity.candidates[0]!;
    const foreign = { ...original, command: { ...responseCommand(ready.depth, "acknowledge"), residentId: "foreign" } };
    expect(actorPolicy(ready, { ...opportunity, candidates: [foreign, opportunity.candidates[1]!] }).command)
      .toMatchObject({ type: "share-companion-credit", choice: "claim-credit" });
    expect(() => stepDepth(ready.depth, foreign.command)).toThrow();
    expect(() => stepDepth(ready.depth, { ...original.command, choice: "invented" } as unknown as DepthCommand)).toThrow();
  });

  it("defers to recovery and settlement, and never lets an absent or injured person speak", () => {
    const depth = ready.depth, active = depth.companions.active[0]!;
    const absent = { ...depth, tick: depth.tick + 1, companions: { ...depth.companions, active: [] } };
    const downed = { ...depth, tick: depth.tick + 1, companions: { ...depth.companions, active: [{ ...active,
      injury: "fallen" as const, resources: { ...active.resources, health: 0 } }] } };
    const defeated = { ...depth, hero: { ...depth.hero, resources: { ...depth.hero.resources, health: 0 } } };
    for (const blocked of [absent, downed, defeated,
      { ...depth, quest: { ...depth.quest, status: "ready-to-fulfill" as const } },
      { ...depth, combat: companionCreditBeforeVictoryFixture().depth.combat },
      { ...depth, atlas: { ...depth.atlas, currentLocationId: depth.companionCredit!.evidence.companion.destination.locationId } },
    ]) expect(selectCompanionCredit(blocked)).toBeNull();
    expect(depthCommandCandidates(defeated)[0]!.command).toEqual({ type: "wait" });
    expect(depthCommandCandidates({ ...depth, quest: { ...depth.quest, status: "ready-to-fulfill" } })[0]!.command.type).toBe("fulfill-quest");
  });

  it("rejects source, evidence, preference and dialogue tampering while old absent saves stay inert", () => {
    const depth = completed.depth, credit = depth.companionCredit!, evidence = credit.evidence, exchange = credit.exchange!;
    for (const invalid of [undefined, {}, { ...credit, schemaVersion: 2 }, { ...credit, extra: true },
      { ...credit, preference: "always-applaud" }, { ...credit, residentId: "foreign" }, { ...credit, joinedTick: credit.joinedTick + 1 },
      { ...credit, heroId: "foreign" }, { ...credit, evidence: { ...evidence, damageEventId: evidence.outcomeEventId } },
      { ...credit, evidence: { ...evidence, outcomeEventId: evidence.damageEventId } },
      { ...credit, evidence: { ...evidence, sourceCommandId: "invented" } },
      { ...credit, evidence: { ...evidence, tick: credit.joinedTick } },
      { ...credit, exchange: { ...exchange, sourceCommandId: "invented" } },
      { ...credit, exchange: { ...exchange, tick: evidence.tick } },
      { ...credit, exchange: { ...exchange, regardDelta: 5 } },
      { ...credit, exchange: { ...exchange, companionLine: "Take another reward." } },
    ]) {
      const bad = { ...depth, companionCredit: invalid } as unknown as DepthState;
      expect(isValidCampaignCompanionCredit(bad)).toBe(false);
      expect(() => upgradeDepthState(bad, bad.seed, bad.hero.id, bad.hero.name)).toThrow();
    }
    const { companionCredit: _credit, ...legacy } = depth;
    expect(isValidCampaignCompanionCredit(legacy)).toBe(true);
    expect(reload(legacy)).toEqual(legacy);
    expect(selectCompanionCredit(legacy)).toBeNull();
  });

  it("requires the archived story to match its full retained battle at capture and later ticks", () => {
    for (const world of [ready, completed]) {
      const credit = world.depth.companionCredit!, battle = credit.evidence.combat;
      const damage = battle.eventStream.events.find((event) => event.id === credit.evidence.damageEventId)!;
      const inventedBattle = { ...battle, combatants: battle.combatants.map((actor) =>
        actor.id === damage.targetId ? { ...actor, name: "An invented dragon" } : actor) };
      const invented = { ...world.depth, companionCredit: { ...credit,
        evidence: { ...credit.evidence, combat: inventedBattle }, exchange: credit.exchange === null ? null : {
          ...credit.exchange, heroLine: "You landed that hit on An invented dragon. I will not tell this story without you.",
        } } };
      expect(world.depth.completedCombats.find((source) => source.id === battle.id)).toEqual(battle);
      expect(isValidCampaignCompanionCredit(invented)).toBe(false);
      expect(selectCompanionCredit(invented)).toBeNull();
      expect(() => reload(invented)).toThrow();
      // Object field order alone is not a different battle or a corrupt save.
      const reordered = { ...world.depth, companionCredit: { ...credit, evidence: { ...credit.evidence,
        combat: Object.fromEntries(Object.entries(battle).reverse()) as unknown as typeof battle } } };
      expect(isValidCampaignCompanionCredit(reordered)).toBe(true);
      expect(reload(reordered).companionCredit).toEqual(credit);
    }
  });

  it("captures the variation only at the actual healthy farewell and retains it after bounded source eviction", () => {
    const before = companionCreditFarewellFixture(), after = advanceWorld(before), credit = after.depth.companionCredit!;
    expect(before.depth.companionCredit!.farewell).toBeNull();
    expect(campaignDirector(before).candidates[0]!.command.type).toBe("farewell-companion");
    expect(credit.farewell).toEqual({ sourceCommandId: `depth:${after.tick}:companion:farewell:${credit.residentId}`,
      tick: after.tick, line: companionCreditFarewellLine("acknowledge") });
    expect(after.depth.log.at(-1)!.message).toContain("The companions exchange farewells.");
    expect(after.scene.consequence).not.toContain(credit.farewell!.line);
    expect(reload(after.depth)).toEqual(after.depth);
    // Explicit bounded-retention/history boundary, not invented later actions.
    // A future roster, inventory, HP or weapon must not rewrite the old exchange.
    const later = { ...after.depth, tick: after.tick + 1,
      completedCombats: after.depth.completedCombats.filter((battle) => battle.id !== credit.evidence.combat.id),
      legacyUnratedCombatIds: after.depth.legacyUnratedCombatIds.filter((id) => id !== credit.evidence.combat.id),
      companions: { ...after.depth.companions, former: after.depth.companions.former.filter((former) =>
        former.identity.residentId !== credit.residentId || former.joinedTick !== credit.joinedTick) } };
    expect(isValidCampaignCompanionCredit(later)).toBe(true);
    expect(reload(later).companionCredit).toEqual(credit);
    expect(selectCompanionCredit(later)).toBeNull();
    expect(isValidCampaignCompanionCredit({ ...later, companionCredit: { ...credit, farewell: { ...credit.farewell!, line: "Fabricated applause" } } })).toBe(false);
  });

  it("stops hidden catch-up before the actual exchange and farewell with exact once-only pending sources", () => {
    for (const before of [ready, companionCreditFarewellFixture()]) {
      const request = { id: `credit:${before.tick}`, observedAtMs: 100_000 + before.tick, elapsedMs: 48_000, requestedTicks: 10 };
      const stopped = catchUpWorld(before, request);
      expect(stopped.tick).toBe(before.tick);
      expect(stopped.depth).toEqual(before.depth);
      expect(stopped.pendingAttention.at(-1)?.commandType).toBe(campaignDirector(before).candidates[0]!.command.type);
      expect(stopped.lifecycle.wallClockJournal.at(-1)?.appliedTicks).toBe(0);
      expect(catchUpWorld(stopped, request)).toBe(stopped);
      expect(upgradeWorldState(JSON.parse(canonicalStringify(stopped)))).toEqual(stopped);
    }
  });
});
