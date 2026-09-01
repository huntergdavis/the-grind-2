import { describe, expect, it } from "vitest";
import { createCombat, isValidCombatState } from "./combat";
import { edgeBetween, planRoute, advanceRoute } from "./atlas";
import { createHero, createQuest, heroExperienceFloor, maximumHeroLevel } from "./rpg";
import { projectSuccessorQuestLead } from "./quest-lead";
import { createDepthState, depthCommandCandidates, projectRouteEncounterThreatContext, stepDepth, unresolvedRouteEncounterId, upgradeDepthState } from "./state";
import {
  createEncounterThreatProfile,
  createLegacyUnratedThreat,
  encounterThreatBand,
  encounterThreatScore,
  isValidEncounterThreatProvenance,
  isValidEncounterThreatProfile,
  mechanicalTierForThreatScore,
  speciesThreatBias,
  type EncounterThreatContext,
} from "./threat";

const neutralContext: EncounterThreatContext = {
  edgeId: "location:0~location:1",
  fromLocationId: "location:0",
  destinationLocationId: "location:1",
  placeDanger: 5,
  questLeadId: null,
  questInstanceId: null,
  questModifier: 0,
};

describe("honest place-bound encounter threat", () => {
  it("maps all ten scores monotonically into named bands and mechanical tiers", () => {
    const tiers = Array.from({ length: 10 }, (_, index) => mechanicalTierForThreatScore(index + 1));
    expect(tiers).toEqual([1, 6, 12, 17, 23, 28, 34, 39, 45, 50]);
    expect(Array.from({ length: 10 }, (_, index) => encounterThreatBand(index + 1))).toEqual([
      "minor", "minor", "guarded", "guarded", "perilous", "perilous", "dire", "dire", "extreme", "extreme",
    ]);
    expect(tiers.every((tier, index) => index === 0 || tier > tiers[index - 1]!)).toBe(true);
  });

  it("applies only the frozen species and exact quest-lead factors with clamping", () => {
    expect(speciesThreatBias("lantern-wolf")).toBe(-1);
    expect(speciesThreatBias("river-wyrmling")).toBe(0);
    expect(speciesThreatBias("inkcap-mimic")).toBe(0);
    expect(speciesThreatBias("mossback-brute")).toBe(1);
    expect(speciesThreatBias("copperhorn")).toBe(1);
    expect(encounterThreatScore(1, 0, -1)).toBe(1);
    expect(encounterThreatScore(5, 0, 1)).toBe(6);
    expect(encounterThreatScore(5, 1, 1)).toBe(7);
    expect(encounterThreatScore(10, 1, 1)).toBe(10);
    expect(() => speciesThreatBias("invented-monster")).toThrow("Unknown tactical species");
  });

  it("builds identical enemies at hero Levels 1, 50, and 1000", () => {
    const seed = "place-bound-level-independence";
    const base = createHero(seed, "hero:threat", "Nera Vale");
    const heroAt = (level: number) => ({ ...base, level, experience: heroExperienceFloor(level) });
    const enemyTruth = (level: number) => createCombat(seed, heroAt(level), "encounter:threat", 2, [], neutralContext)
      .combatants
      .filter((combatant) => combatant.side === "enemies")
      .map(({ id, name, health, maxHealth, mana, maxMana, power, armor, initiative, speciesId, abilities }) => ({
        id, name, health, maxHealth, mana, maxMana, power, armor, initiative, speciesId, abilities,
      }));
    expect(enemyTruth(1)).toEqual(enemyTruth(50));
    expect(enemyTruth(1)).toEqual(enemyTruth(maximumHeroLevel));
  });

  it("rejects altered factors, bands, and tier-derived enemy statistics", () => {
    const hero = createHero("threat-validation", "hero:validation", "Ilya Quill");
    const combat = createCombat("threat-validation", hero, "encounter:validation", 2, [], neutralContext);
    expect(combat.threat.rating).toBe("place-bound");
    expect(isValidCombatState(combat)).toBe(true);
    if (combat.threat.rating !== "place-bound") throw new Error("Threat fixture is unrated");
    const badFactor = {
      ...combat,
      threat: {
        ...combat.threat,
        factors: combat.threat.factors.map((factor, index) => index === 0 ? { ...factor, score: factor.score + 1 } : factor),
      },
    };
    expect(isValidEncounterThreatProfile(badFactor.threat, badFactor.combatants)).toBe(false);
    expect(isValidCombatState({ ...combat, threat: { ...combat.threat, band: "extreme" } })).toBe(false);
    expect(isValidCombatState({ ...combat, threat: { ...combat.threat, factors: [...combat.threat.factors].reverse() } })).toBe(false);
    expect(isValidCombatState({
      ...combat,
      combatants: combat.combatants.map((combatant) => combatant.side === "enemies"
        ? { ...combatant, maxHealth: combatant.maxHealth + 2, health: combatant.health + 2 }
        : combatant),
    })).toBe(false);
    expect(isValidCombatState({
      ...combat,
      combatants: combat.combatants.map((combatant) => combatant.side === "enemies"
        ? { ...combatant, abilities: combatant.abilities.map((ability) => ({ ...ability, potency: ability.potency + 1 })) }
        : combatant),
    })).toBe(false);
  });

  it("rejects fully consistent active-route, quest, factor-order, and legacy-rating forgeries", () => {
    const seed = "active-threat-forgery";
    const base = createDepthState(seed, "hero:active-threat-forgery", "Nera Flint");
    const route = depthCommandCandidates(base).find((candidate) => candidate.command.type === "plan-route");
    if (route?.command.type !== "plan-route") throw new Error("Threat forgery fixture needs a route");
    const routed = stepDepth(base, route.command);
    const encounterId = unresolvedRouteEncounterId(routed);
    if (encounterId === null) throw new Error("Threat forgery fixture needs an encounter");
    const active = stepDepth(routed, { type: "start-combat", encounterId, enemyCount: 2 });
    const combat = active.combat;
    if (combat?.threat.rating !== "place-bound") throw new Error("Threat forgery fixture needs a rated combat");
    const ratedThreat = combat.threat;
    expect(upgradeDepthState(structuredClone(active), active.seed, active.hero.id, active.hero.name)).toEqual(active);

    const context = projectRouteEncounterThreatContext(routed);
    const reversedDestination = routed.atlas.locations.find((location) => location.id === context.fromLocationId);
    if (reversedDestination === undefined) throw new Error("Threat forgery fixture lost its route origin");
    const reversedContext: EncounterThreatContext = {
      ...context,
      fromLocationId: context.destinationLocationId,
      destinationLocationId: context.fromLocationId,
      placeDanger: reversedDestination.danger,
      questLeadId: null,
      questInstanceId: null,
      questModifier: 0,
    };
    const reversedCombat = createCombat(seed, routed.hero, encounterId, 2, [], reversedContext);
    expect(isValidCombatState(reversedCombat)).toBe(true);
    expect(isValidEncounterThreatProvenance(reversedCombat.threat, routed.atlas)).toBe(true);
    expect(() => upgradeDepthState(
      { ...active, combat: reversedCombat },
      active.seed,
      active.hero.id,
      active.hero.name,
    )).toThrow("schema invariants");

    const forgedQuestContext: EncounterThreatContext = context.questModifier === 0
      ? { ...context, questLeadId: "lead:forged", questInstanceId: "quest:forged", questModifier: 1 }
      : { ...context, questLeadId: null, questInstanceId: null, questModifier: 0 };
    const forgedQuestCombat = createCombat(seed, routed.hero, encounterId, 2, [], forgedQuestContext);
    expect(isValidCombatState(forgedQuestCombat)).toBe(true);
    expect(() => upgradeDepthState(
      { ...active, combat: forgedQuestCombat },
      active.seed,
      active.hero.id,
      active.hero.name,
    )).toThrow("schema invariants");

    expect(() => upgradeDepthState({
      ...active,
      combat: { ...combat, threat: { ...ratedThreat, factors: [...ratedThreat.factors].reverse() } },
    }, active.seed, active.hero.id, active.hero.name)).toThrow("schema invariants");
    expect(() => upgradeDepthState({
      ...active,
      combat: { ...combat, threat: createLegacyUnratedThreat() },
    }, active.seed, active.hero.id, active.hero.name)).toThrow("schema invariants");
  });

  it("projects canonical oriented route provenance and marks only the final lead leg", () => {
    const seed = "threat-route-provenance";
    const base = createDepthState(seed, "hero:route-threat", "Mira Rook");
    const quest = createQuest(seed, 1, base.tick + 1);
    const questState = { ...base, quest };
    const lead = projectSuccessorQuestLead(seed, questState.atlas, quest);
    if (lead === null) throw new Error("Threat route fixture has no successor lead");
    let atlas = planRoute(questState.atlas, lead.locationId);
    while (atlas.route !== null && atlas.route.legIndex < atlas.route.path.length - 2) {
      const from = atlas.route.path[atlas.route.legIndex]!;
      const to = atlas.route.path[atlas.route.legIndex + 1]!;
      const edge = edgeBetween(atlas, from, to);
      atlas = advanceRoute(atlas, edge.distance - atlas.route.legProgress);
    }
    const routed = { ...questState, atlas };
    const context = projectRouteEncounterThreatContext(routed);
    const destination = atlas.locations.find((location) => location.id === context.destinationLocationId);
    expect(destination).toBeDefined();
    expect(context.placeDanger).toBe(destination?.danger);
    expect(context.edgeId).toBe(edgeBetween(atlas, context.fromLocationId, context.destinationLocationId).id);
    expect(context).toMatchObject({ questLeadId: lead.id, questInstanceId: lead.questInstanceId, questModifier: 1 });
    const profile = createEncounterThreatProfile(context, [{ combatantId: "enemy:0", speciesId: "lantern-wolf" }]);
    expect(isValidEncounterThreatProvenance(profile, atlas)).toBe(true);
    if (profile.rating !== "place-bound") throw new Error("Route threat profile is unrated");
    const forgedDanger = profile.placeDanger === 10 ? 9 : profile.placeDanger + 1;
    expect(isValidEncounterThreatProvenance({ ...profile, placeDanger: forgedDanger }, atlas)).toBe(false);
  });
});
