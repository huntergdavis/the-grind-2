import { describe, expect, it } from "vitest";
import { neighboringLocationIds } from "../depth/atlas";
import {
  counterToStance,
  counterDuelOpponentStancePool,
  createCombat,
  createCounterDuel,
  generateDungeon,
  mazeCellId,
  monsterDefinitions,
  projectCounterDuelSpeciesHabit,
  resolveCounterDuelRound,
} from "../depth";
import { actorInstinctProfiles, actorPolicy } from "./actor-policy";
import { campaignDirector, createWorld, rulesEngine } from "./simulation";
import type { WorldState } from "./types";

function combatWorld(enemyCount: number, enemyHealth: number): WorldState {
  const base = createWorld(`instinct-combat:${enemyCount}`, `campaign:combat:${enemyCount}`);
  const created = createCombat(base.seed, base.depth.hero, `encounter:instinct:${enemyCount}`, enemyCount);
  const heroIndex = created.turnOrder.indexOf(base.hero.id);
  if (heroIndex < 0) throw new Error("Hero is absent from combat turn order");
  const combat = {
    ...created,
    activeIndex: heroIndex,
    combatants: created.combatants.map((combatant) => combatant.side === "heroes"
      ? { ...combatant, health: 1 }
      : { ...combatant, health: enemyHealth }),
  };
  return {
    ...base,
    hero: { ...base.hero, health: 1 },
    depth: {
      ...base.depth,
      hero: {
        ...base.depth.hero,
        resources: { ...base.depth.hero.resources, health: 1 },
      },
      combat,
    },
  };
}

function routeChoiceWorld(): { world: WorldState; curiousId: string; courageousId: string } {
  const initial = createWorld("instinct-routes", "campaign:routes");
  const junction = initial.depth.atlas.locations.find(
    (location) => neighboringLocationIds(initial.depth.atlas, location.id).length >= 2,
  );
  if (junction === undefined) throw new Error("Route fixture needs a junction");
  const atJunction: WorldState = {
    ...initial,
    depth: {
      ...initial.depth,
      atlas: { ...initial.depth.atlas, currentLocationId: junction.id },
    },
  };
  const destinations = campaignDirector(atJunction).candidates.flatMap((candidate) =>
    candidate.command.type === "plan-route" ? [candidate.command.destinationId] : [],
  );
  const curiousId = destinations[0];
  const courageousId = destinations[1];
  if (curiousId === undefined || courageousId === undefined) throw new Error("Route fixture needs two destinations");
  const locations = atJunction.depth.atlas.locations.map((location) => ({
    ...location,
    danger: location.id === courageousId ? 9 : 1,
  }));
  return {
    curiousId,
    courageousId,
    world: {
      ...atJunction,
      depth: {
        ...atJunction.depth,
        atlas: {
          ...atJunction.depth.atlas,
          locations,
          discoveredLocationIds: locations
            .map((location) => location.id)
            .filter((locationId) => locationId !== curiousId),
        },
      },
    },
  };
}

describe("Visible Instinct actor profiles", () => {
  it("makes identical dungeon decisions for an empty passage and a hidden trap", () => {
    const base = createWorld("policy-hidden-trap", "campaign:policy-hidden-trap");
    const generated = generateDungeon(base.seed, "dungeon:policy-hidden", 3, 3);
    const current = generated.cells.find((cell) => cell.id === generated.currentCellId);
    const direction = current?.exits[0];
    if (current === undefined || direction === undefined) throw new Error("Hidden-trap policy fixture has no passage");
    const change: readonly [number, number] = direction === "north" ? [0, -1] : direction === "east" ? [1, 0] : direction === "south" ? [0, 1] : [-1, 0];
    const targetId = mazeCellId(generated.id, current.x + change[0], current.y + change[1]);
    const emptyDungeon = {
      ...generated,
      cells: generated.cells.map((cell) => ({ ...cell, feature: "empty" as const })),
      traps: [],
    };
    const hiddenDungeon = {
      ...emptyDungeon,
      cells: emptyDungeon.cells.map((cell) => cell.id === targetId ? { ...cell, feature: "trap" as const } : cell),
      traps: [{ cellId: targetId, kind: "tripwire" as const, detectDifficulty: 14, disarmDifficulty: 16, phase: "hidden" as const }],
    };
    const emptyWorld: WorldState = { ...base, depth: { ...base.depth, dungeon: emptyDungeon } };
    const hiddenWorld: WorldState = { ...base, depth: { ...base.depth, dungeon: hiddenDungeon } };
    const emptyOpportunity = campaignDirector(emptyWorld);
    const hiddenOpportunity = campaignDirector(hiddenWorld);

    expect(hiddenOpportunity.candidates).toEqual(emptyOpportunity.candidates);
    expect(actorPolicy(hiddenWorld, hiddenOpportunity)).toEqual(actorPolicy(emptyWorld, emptyOpportunity));
  });

  it("keeps three frozen profiles within rule and condition caps", () => {
    expect(Object.keys(actorInstinctProfiles)).toEqual(["road", "ordinaryCombat", "direCombat"]);
    for (const profile of Object.values(actorInstinctProfiles)) {
      expect(Object.isFrozen(profile)).toBe(true);
      expect(Object.isFrozen(profile.rules)).toBe(true);
      expect(profile.rules.length).toBeGreaterThan(0);
      expect(profile.rules.length).toBeLessThanOrEqual(8);
      expect(profile.rules.every((rule) => Object.isFrozen(rule) && rule.conditions.length <= 2)).toBe(true);
      expect(profile.rules.at(-1)?.selector).toBe("any");
    }
  });

  it("guards in a dire multi-enemy fight but takes a bounded battle-ending finish", () => {
    const dangerous = combatWorld(2, 99);
    const survival = actorPolicy(dangerous, campaignDirector(dangerous));
    expect(survival.trace.context).toBe("direCombat");
    expect(survival.trace.reasonCode).toBe("survive-danger");
    expect(survival.trace.matchedRuleId).toBe("dire.guard");
    expect(survival.command).toMatchObject({ type: "combat-action", action: { type: "guard" } });

    const finishable = combatWorld(1, 1);
    const finish = actorPolicy(finishable, campaignDirector(finishable));
    expect(finish.trace.context).toBe("direCombat");
    expect(finish.trace.reasonCode).toBe("finish-safely");
    expect(finish.trace.matchedRuleId).toBe("dire.safe-finish");
    expect(finish.command).toMatchObject({ type: "combat-action" });
    if (finish.command.type !== "combat-action") throw new Error("Expected combat choice");
    expect(finish.command.action.type).not.toBe("guard");
  });

  it("lets forward motion outrank personality while preserving the visible instinct", () => {
    const { world, curiousId, courageousId } = routeChoiceWorld();
    const curious = { ...world, hero: { ...world.hero, values: ["curiosity", "loyalty"] as const } };
    const courageous = { ...world, hero: { ...world.hero, values: ["courage", "loyalty"] as const } };
    const curiousChoice = actorPolicy(curious, campaignDirector(curious));
    const courageousChoice = actorPolicy(courageous, campaignDirector(courageous));
    expect(curiousChoice.command).toEqual({ type: "plan-route", destinationId: curiousId });
    expect(courageousChoice.command).toEqual({ type: "plan-route", destinationId: curiousId });
    expect(curiousChoice.trace.reasonCode).toBe("explore-unknown");
    expect(courageousChoice.trace.reasonCode).toBe("continue-purposefully");
    expect(curiousChoice.trace.forwardMotionReason).toBe("explore-unseen");
    expect(courageousChoice.trace.forwardMotionReason).toBe("explore-unseen");
    expect(courageousId).not.toBe(curiousId);
  });

  it("never fabricates an ally motive for a solo loyal hero", () => {
    const { world } = routeChoiceWorld();
    const loyal = { ...world, hero: { ...world.hero, values: ["loyalty"] as const } };
    const choice = actorPolicy(loyal, campaignDirector(loyal));
    expect(`${choice.rationale} ${choice.trace.reasons.join(" ")}`).not.toMatch(/ally|companion|friend/i);
  });

  it("chooses among three Pattern Duel reads using only public tells and revealed rounds", () => {
    const base = createWorld("policy-counter-duel", "campaign:policy-counter-duel");
    const counterDuel = createCounterDuel(base.seed, "encounter:policy-counter", base.hero.id, base.hero.maxHealth);
    const world: WorldState = { ...base, depth: { ...base.depth, counterDuel } };
    const opportunity = campaignDirector(world);
    const choice = actorPolicy(world, opportunity);
    expect(opportunity.mode).toBe("battle");
    expect(opportunity.candidates).toHaveLength(3);
    expect(opportunity.candidates.every((candidate) => candidate.command.type === "counter-duel-action")).toBe(true);
    expect(choice.command.type).toBe("counter-duel-action");
    expect(choice.trace.considered).toHaveLength(3);
    expect(choice.trace.reasons[0]).toContain("derived answer");
    expect(JSON.stringify({ candidates: opportunity.candidates, trace: choice.trace })).not.toContain("opponentStance");
  });

  it("keeps valid tells ahead of lore and improves paired reads only when a tell is impossible", () => {
    const template = createWorld("policy-habit-template", "campaign:policy-habit-template");
    let validTellFixtures = 0;
    let impossibleTellFixtures = 0;
    let strictlyBetter = 0;

    for (let index = 0; index < 512; index += 1) {
      const seed = `policy-habit:${index}`;
      let counterDuel = createCounterDuel(seed, `encounter:policy-habit:${index}`, template.hero.id, template.hero.maxHealth);
      const habit = projectCounterDuelSpeciesHabit(counterDuel.opponentSpeciesId, 3);
      const definition = monsterDefinitions.find((entry) => entry.id === counterDuel.opponentSpeciesId);
      if (habit?.status !== "established" || definition === undefined) continue;
      const lore = {
        monsterId: definition.id,
        monsterName: definition.name,
        encounters: 3,
        victories: 0,
        insight: 0,
        requiredInsight: 3,
        secretTechniqueId: definition.secret.id,
        secretTechniqueName: definition.secret.name,
        learned: false,
      };
      const worldWithLore = (encounters: number): WorldState => ({
        ...template,
        seed,
        hero: { ...template.hero, values: [] },
        depth: {
          ...template.depth,
          counterDuel,
          hero: { ...template.depth.hero, monsterLore: [{ ...lore, encounters }] },
        },
      });

      if (counterDuel.tell.suggestedStance !== habit.preferredStance) {
        const known = worldWithLore(3);
        const choice = actorPolicy(known, campaignDirector(known));
        expect(choice.command).toEqual({
          type: "counter-duel-action",
          prediction: counterDuel.tell.suggestedStance,
        });
        validTellFixtures += 1;
      }

      for (let round = 0; round < 2; round += 1) {
        const probe = resolveCounterDuelRound(counterDuel, "rush", seed);
        const actual = probe.history.at(-1)?.opponentStance;
        if (actual === undefined) throw new Error("Pattern Duel probe did not reveal a stance");
        counterDuel = resolveCounterDuelRound(counterDuel, counterToStance(counterToStance(actual)), seed);
      }
      const last = counterDuel.history.at(-1)?.opponentStance;
      const previous = counterDuel.history.at(-2)?.opponentStance;
      if (
        last === undefined ||
        last !== previous ||
        counterDuel.tell.suggestedStance !== last ||
        habit.preferredStance === last
      ) continue;

      const unknown = worldWithLore(2);
      const known = worldWithLore(3);
      const unknownOpportunity = campaignDirector(unknown);
      const knownOpportunity = campaignDirector(known);
      const unknownChoice = actorPolicy(unknown, unknownOpportunity);
      const knownChoice = actorPolicy(known, knownOpportunity);
      if (unknownChoice.command.type !== "counter-duel-action" || knownChoice.command.type !== "counter-duel-action") {
        throw new Error("Expected paired Pattern Duel choices");
      }
      const unknownPrediction = unknownChoice.command.prediction;
      const knownPrediction = knownChoice.command.prediction;
      const pool = counterDuelOpponentStancePool(counterDuel.opponentSpeciesId, last);
      const unknownWeight = pool.filter((stance) => stance === unknownPrediction).length;
      const knownWeight = pool.filter((stance) => stance === knownPrediction).length;
      expect(knownWeight).toBeGreaterThanOrEqual(unknownWeight);
      strictlyBetter += Number(knownWeight > unknownWeight);
      impossibleTellFixtures += 1;
      expect(knownOpportunity.candidates).toEqual(unknownOpportunity.candidates);
      expect(knownChoice.command.prediction).toBe(habit.preferredStance);
      expect(knownChoice.trace.reasons[0]).toMatch(/two repeats make the live .* tell impossible.*field note says .*often favor/i);
      expect(JSON.stringify({ candidates: knownOpportunity.candidates, trace: knownChoice.trace })).not.toContain("opponentStance");
    }

    expect(validTellFixtures).toBeGreaterThan(0);
    expect(impossibleTellFixtures).toBeGreaterThan(0);
    expect(strictlyBetter).toBeGreaterThan(0);
  });

  it("retains bounded actor-action-target traces and resolves the selected command regardless of presentation text", () => {
    const { world } = routeChoiceWorld();
    const opportunity = campaignDirector(world);
    const choice = actorPolicy(world, opportunity);
    expect(choice.trace.actorId).toBe(world.hero.id);
    expect(choice.trace.profileId).toBe(choice.trace.context);
    expect(choice.trace.considered.length).toBeGreaterThanOrEqual(1);
    expect(choice.trace.considered.length).toBeLessThanOrEqual(4);
    expect(choice.trace.considered).toContainEqual(choice.trace.selected);
    expect(choice.trace.reasons.length).toBeGreaterThanOrEqual(1);
    expect(choice.trace.reasons.length).toBeLessThanOrEqual(3);
    expect(choice.trace.selected.actionLabel.length).toBeGreaterThan(0);
    expect(choice.trace.selected.targetLabel?.length).toBeGreaterThan(0);

    const normal = rulesEngine(world, opportunity, choice);
    const rewrittenPresentation = rulesEngine(world, opportunity, {
      ...choice,
      rationale: "A renderer-only sentence that carries no authority.",
      trace: { ...choice.trace, reasons: ["A renderer-only reason."] },
    });
    expect(rewrittenPresentation.depth).toEqual(normal.depth);
    expect(rewrittenPresentation.tick).toBe(normal.tick);
  });
});
