import { describe, expect, it } from "vitest";
import { createCombat } from "../depth";
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
  const atJunction: WorldState = {
    ...initial,
    depth: {
      ...initial.depth,
      atlas: { ...initial.depth.atlas, currentLocationId: "location:1" },
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

  it("lets curiosity and courage choose different legal routes from the same facts", () => {
    const { world, curiousId, courageousId } = routeChoiceWorld();
    const curious = { ...world, hero: { ...world.hero, values: ["curiosity", "loyalty"] as const } };
    const courageous = { ...world, hero: { ...world.hero, values: ["courage", "loyalty"] as const } };
    const curiousChoice = actorPolicy(curious, campaignDirector(curious));
    const courageousChoice = actorPolicy(courageous, campaignDirector(courageous));
    expect(curiousChoice.command).toEqual({ type: "plan-route", destinationId: curiousId });
    expect(courageousChoice.command).toEqual({ type: "plan-route", destinationId: courageousId });
    expect(curiousChoice.trace.reasonCode).toBe("explore-unknown");
    expect(courageousChoice.trace.reasonCode).toBe("meet-danger");
  });

  it("never fabricates an ally motive for a solo loyal hero", () => {
    const { world } = routeChoiceWorld();
    const loyal = { ...world, hero: { ...world.hero, values: ["loyalty"] as const } };
    const choice = actorPolicy(loyal, campaignDirector(loyal));
    expect(`${choice.rationale} ${choice.trace.reasons.join(" ")}`).not.toMatch(/ally|companion|friend/i);
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
