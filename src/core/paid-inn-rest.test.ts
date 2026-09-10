import { describe, expect, it } from "vitest";
import { completeQuestWithFacts } from "../../tests/quest-fixtures";
import { emberTonicId } from "../depth/rpg";
import { selectPaidInnRest } from "../depth/town-rest";
import { generateTown, visitTown } from "../depth/towns";
import { projectPaidInnRestScene } from "../render/paid-inn-rest";
import { actorPolicy } from "./actor-policy";
import { createForwardMotionState } from "./forward-motion";
import { advanceWorld, campaignDirector, createWorld, upgradeWorldState } from "./simulation";
import type { WorldState } from "./types";

function lowMana(world: WorldState): WorldState {
  const resources = {
    ...world.depth.hero.resources,
    health: world.depth.hero.resources.maxHealth - 1,
    mana: Math.floor(world.depth.hero.resources.maxMana / 3),
  };
  return upgradeWorldState({
    ...world,
    hero: { ...world.hero, health: resources.health },
    depth: { ...world.depth, hero: { ...world.depth.hero, resources } },
  });
}

function innWorld(): WorldState {
  // Real generated Raincross, its visited town record, and The Badger Inn.
  return lowMana(createWorld("paid-inn-rest", "campaign:paid-inn-rest"));
}

describe("autonomous paid inn rest world integration", () => {
  it("spends five gold once, restores HP and MP, and records the same zero-XP town stop after JSON resume", () => {
    const before = innWorld();
    const serialized = JSON.stringify(before);
    const plan = selectPaidInnRest(before.depth);
    expect(plan).toMatchObject({
      locationId: "location:0",
      townName: "Raincross",
      innId: "town:location:0:district:0:building:2",
      innName: "The Badger Inn",
      goldBefore: 12, goldSpent: 5, goldAfter: 7,
      healthBefore: 44, healthAfter: 45, manaBefore: 6, manaAfter: 20,
    });
    if (plan === null) throw new Error("The real inn fixture must be eligible");
    const opportunity = campaignDirector(before);
    const choice = actorPolicy(before, opportunity);
    const commandId = `${before.campaignId}:depth:${before.tick + 1}:town:${plan.locationId}:inn-rest:${plan.innId}`;
    expect(opportunity.mode).toBe("town");
    expect(opportunity.candidates).toHaveLength(1);
    expect(choice.command).toEqual({ type: "wait" });
    expect(choice.commandId).toBe(commandId);
    expect(choice.rationale).toContain("The Badger Inn restores depleted mana before the road for 5 gold");
    expect(choice.trace.selected).toMatchObject({
      commandId,
      actionLabel: "rests at an inn",
      targetLabel: "The Badger Inn · gold 12→7 · MP 6→20",
    });

    const after = advanceWorld(before);
    expect(after.tick).toBe(before.tick + 1);
    expect(after.hero.gold).toBe(7);
    expect(after.depth.hero.gold).toBe(7);
    expect(after.hero.health).toBe(45);
    expect(after.depth.hero.resources).toEqual({ ...before.depth.hero.resources, health: 45, mana: 20 });
    expect(after.hero.experience).toBe(before.hero.experience);
    expect(after.depth.hero.experience).toBe(before.depth.hero.experience);
    expect(after.depth.hero.inventory).toEqual(before.depth.hero.inventory);
    expect(after.depth.quest).toEqual(before.depth.quest);
    expect(after.depth.completedQuests).toEqual(before.depth.completedQuests);
    expect(after.depth.pendingQuestReward).toEqual(before.depth.pendingQuestReward);
    expect(after.depth.towns).toEqual(before.depth.towns);
    expect(after.depth.companions).toEqual(before.depth.companions);
    const scene = {
      mode: "town",
      location: "Raincross",
      headline: "The Badger Inn: a room before the road.",
      action: `${before.hero.name} pays 5 gold for rest at The Badger Inn in Raincross.`,
      consequence: "HP 44→45 · MP 6→20 · gold 12→7 (−5) · Fully rested · no XP or items gained",
      sensoryIntensity: 0,
    };
    expect(after.scene).toMatchObject(scene);
    expect(after.chronicle.at(-1)).toMatchObject({ ...scene, tick: after.tick, commandId, commandType: "wait", decisionTrace: choice.trace });
    expect(projectPaidInnRestScene(after)).toEqual({ innId: plan.innId, innName: plan.innName, receipt: scene.consequence });
    const entry = after.chronicle.at(-1);
    if (entry === undefined) throw new Error("The completed stay must have a Chronicle receipt");
    for (const invalidEntry of [
      { ...entry, tick: entry.tick - 1 },
      { ...entry, commandId: `${after.campaignId}:depth:${after.depth.tick}:wait` },
      { ...entry, commandId: commandId.replace(plan.innId, "missing-building") },
    ]) {
      expect(projectPaidInnRestScene({ ...after, chronicle: [...after.chronicle.slice(0, -1), invalidEntry] })).toBeNull();
    }
    expect(after.depth.log.at(-1)?.message).toBe("Paid inn rest at The Badger Inn, Raincross: gold 12→7 (-5) · HP 44→45 (+1) · MP 6→20 (+14). Fully rested; no items or rewards gained.");
    expect(JSON.stringify(before)).toBe(serialized);
    expect(advanceWorld(upgradeWorldState(JSON.parse(serialized)))).toEqual(after);
    expect(upgradeWorldState(JSON.parse(JSON.stringify(after)))).toEqual(after);

    expect(selectPaidInnRest(after.depth)).toBeNull();
    expect(campaignDirector(after).candidates.every((candidate) => !candidate.id.includes(":inn-rest:"))).toBe(true);
    const next = advanceWorld(after);
    // A separate smith purchase may follow recovery; the inn never charges twice.
    expect(next.chronicle.at(-1)?.commandType).toBe("buy-disarming-kit");
    expect(next.hero.gold).toBe(2);
    expect(next.depth.latestDisarmingKitPurchase).toMatchObject({ goldBefore: 7, goldSpent: 5, goldAfter: 2 });
    expect(next.depth.hero.resources).toEqual(after.depth.hero.resources);
    expect(next.hero.experience).toBe(after.hero.experience);
    expect(next.chronicle.at(-1)?.commandId).not.toContain(":inn-rest:");
    expect(projectPaidInnRestScene(next)).toBeNull();
  });

  it("renews emergency tonics first and only then spends the remaining inn fare", () => {
    const base = innWorld();
    const itemId = emberTonicId(base.depth.hero.id);
    const before = upgradeWorldState({
      ...base,
      hero: { ...base.hero, gold: 20 },
      depth: { ...base.depth, hero: {
        ...base.depth.hero,
        gold: 20,
        inventory: base.depth.hero.inventory.map((item) => item.id === itemId ? { ...item, quantity: 1 } : item),
      } },
    });
    expect(selectPaidInnRest(before.depth)).not.toBeNull();
    expect(actorPolicy(before, campaignDirector(before)).command).toEqual({ type: "restock-tonic", itemId });
    const stocked = advanceWorld(before);
    expect(stocked.hero.gold).toBe(10);
    expect(stocked.depth.hero.inventory.find((item) => item.id === itemId)?.quantity).toBe(3);
    expect(stocked.depth.hero.resources).toEqual(before.depth.hero.resources);
    expect(stocked.chronicle.at(-1)?.commandType).toBe("restock-tonic");
    expect(selectPaidInnRest(stocked.depth)).not.toBeNull();
    const rested = advanceWorld(stocked);
    expect(rested.hero.gold).toBe(5);
    expect(rested.hero.experience).toBe(before.hero.experience);
    expect(rested.depth.hero.inventory).toEqual(stocked.depth.hero.inventory);
    expect(rested.chronicle.at(-1)?.commandId).toContain(":inn-rest:");
  });

  it("keeps an actual companion's promised route ahead of an otherwise affordable low-mana stay", () => {
    // Reuse the canonical Shared Road Oath world fixture: generate a second town
    // and let the normal autonomous command recruit its actual resident.
    const base = createWorld("paid-inn-rest", "campaign:paid-inn-oath");
    const originId = base.depth.atlas.currentLocationId;
    const current = base.depth.atlas.locations.find((location) => location.kind === "town" && location.id !== originId
      && generateTown(base.seed, location.id).buildings.some((building) => building.kind === "inn"));
    if (current === undefined) throw new Error("The oath fixture needs a second town");
    const town = visitTown(generateTown(base.seed, current.id));
    expect(town.buildings.some((building) => building.kind === "inn")).toBe(true);
    const eligible = upgradeWorldState({
      ...base,
      scene: { ...base.scene, mode: "town", location: town.name },
      forwardMotion: createForwardMotionState(current.id, base.tick),
      depth: { ...base.depth,
        atlas: { ...base.depth.atlas, currentLocationId: current.id, discoveredLocationIds: [originId, current.id], route: null },
        towns: { ...base.depth.towns, [current.id]: town },
      },
    });
    expect(campaignDirector(eligible).candidates[0]?.command.type).toBe("recruit-companion");
    const joined = lowMana(advanceWorld(eligible));
    const companion = joined.depth.companions.active[0];
    if (companion === undefined) throw new Error("The normal command must recruit the named resident");
    expect(selectPaidInnRest(joined.depth)).toBeNull();
    const opportunity = campaignDirector(joined);
    expect(opportunity.forwardMotionReason).toBe("companion-oath");
    expect(actorPolicy(joined, opportunity).command).toEqual({ type: "plan-route", destinationId: companion.destination.locationId });
    const travelling = advanceWorld(joined);
    expect(travelling.hero.gold).toBe(joined.hero.gold);
    expect(travelling.depth.hero.resources.mana).toBe(joined.depth.hero.resources.mana);
    expect(travelling.chronicle.at(-1)?.commandType).toBe("plan-route");
  });

  it("settles a completed quest and its pending reward before considering town rest", () => {
    const base = innWorld();
    const ready = upgradeWorldState({ ...base, depth: { ...base.depth, quest: completeQuestWithFacts(base.depth.quest) } });
    expect(campaignDirector(ready).candidates[0]?.command.type).toBe("fulfill-quest");
    const fulfilled = advanceWorld(ready);
    expect(fulfilled.chronicle.at(-1)?.commandType).toBe("fulfill-quest");
    expect(fulfilled.hero.gold).toBe(ready.hero.gold);
    expect(fulfilled.depth.pendingQuestReward).not.toBeNull();
    expect(selectPaidInnRest(fulfilled.depth)).toBeNull();
    expect(campaignDirector(fulfilled).candidates[0]?.command.type).toBe("apply-quest-reward");
    const rewarded = advanceWorld(fulfilled);
    expect(rewarded.chronicle.at(-1)?.commandType).toBe("apply-quest-reward");
    expect(rewarded.depth.pendingQuestReward).toBeNull();
    expect(rewarded.depth.hero.resources.mana).toBe(base.depth.hero.resources.mana);
  });
});
