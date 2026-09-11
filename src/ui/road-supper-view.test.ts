import { beforeAll, describe, expect, it } from "vitest";
import { naturalRoadSupperJourneyFixture, type NaturalRoadSupperJourney } from "../../tests/road-supper-fixtures";
import { isCanonicalRoadRations } from "../depth/road-rations";
import { projectRoadSupperCombat, projectRoadSupperScene } from "./road-supper-view";
import { projectStatusHistory } from "./status-history";
import { projectInventoryView } from "./view-projection";

describe("real market supplies become one quiet Road Supper", () => {
  let journey: NaturalRoadSupperJourney;
  beforeAll(() => { journey = naturalRoadSupperJourneyFixture(); }, 20_000);

  it("shows the actual market purchase and canonical owned supplies, not a fabricated vendor", () => {
    const { beforePurchase, purchased } = journey, receipt = purchased.depth.roadSupper!.purchase;
    expect(projectRoadSupperScene(beforePurchase)).toBeNull();
    expect(projectRoadSupperScene(purchased)).toMatchObject({ phase: "purchase", heroId: purchased.hero.id,
      marketId: receipt.marketId, marketName: receipt.marketName, itemId: receipt.itemId,
      quantityBefore: 0, quantityAfter: 2, goldBefore: receipt.goldBefore, goldAfter: receipt.goldBefore - 2,
      locationName: purchased.depth.atlas.locations.find(location => location.id === receipt.locationId)!.name,
      commandId: `${purchased.campaignId}:${receipt.sourceCommandId}`, encounterId: null, routeLabel: null });
    expect(projectRoadSupperScene(purchased)).not.toHaveProperty("residentId");
    const ration = purchased.depth.hero.inventory.find(item => item.id === receipt.itemId)!;
    expect(isCanonicalRoadRations(ration, purchased.hero.id)).toBe(true);
    expect(projectInventoryView(purchased).items.find(item => item.id === ration.id)?.food).toContain("Two rations prepare Road Supper");
  });

  it("consumes two real rations at the actual waiting route without healing or an invented inn", () => {
    const { beforeMeal, meal } = journey, receipt = meal.depth.roadSupper!.meal!, route = receipt.route;
    expect(projectRoadSupperScene(beforeMeal)).toBeNull();
    expect(projectRoadSupperScene(meal)).toMatchObject({ phase: "prepared", marketId: null, marketName: null,
      encounterId: receipt.encounterId, quantityBefore: 2, quantityAfter: 0, detail: receipt.line,
      goldBefore: beforeMeal.depth.hero.gold, goldAfter: beforeMeal.depth.hero.gold,
      commandId: `${meal.campaignId}:${receipt.sourceCommandId}` });
    const names = route.path.slice(route.legIndex, route.legIndex + 2)
      .map(id => meal.depth.atlas.locations.find(location => location.id === id)!.name);
    expect(projectRoadSupperScene(meal)!.routeLabel).toBe(names.join(" → "));
    expect(meal.depth.hero.inventory.some(item => item.id === receipt.itemId)).toBe(false);
    expect(meal.depth.hero.resources).toEqual(beforeMeal.depth.hero.resources);
    expect(meal.depth.hero.experience).toBe(beforeMeal.depth.hero.experience);
    expect(meal.depth.companions).toEqual(beforeMeal.depth.companions);
    expect(meal.depth.atlas.route).toEqual(beforeMeal.depth.atlas.route);
  });

  it("shows ready protection and only the actual first consumed incoming-hit receipt", () => {
    const { started, turns } = journey, combat = started.depth.combat!;
    expect(projectRoadSupperScene(started)).toBeNull();
    expect(projectRoadSupperCombat(combat)).toMatchObject({ phase: "ready", combatId: combat.id,
      mealSourceCommandId: journey.meal.depth.roadSupper!.meal!.sourceCommandId, prevented: null,
      damageEventId: null, label: "SUPPER 25% · ONE HIT" });
    const used = turns.find(world => (world.depth.combat ?? world.depth.roadSupper?.terminal?.combat)?.supper?.spent != null)!;
    expect(used).toBeDefined();
    const usedCombat = used.depth.combat ?? used.depth.roadSupper!.terminal!.combat, receipt = usedCombat.supper!.spent!;
    expect(projectRoadSupperCombat(usedCombat)).toMatchObject({ phase: "spent", damageEventId: receipt.damageEventId,
      prevented: receipt.prevented, guarded: receipt.guarded });
    expect(usedCombat.eventStream.events.filter(event => event.kind === "damage" && event.supper !== undefined)).toHaveLength(1);
    expect(receipt.prevented).toBe(Math.min(receipt.healthBefore, receipt.damageBefore) - Math.min(receipt.healthBefore, receipt.damageAfter));
    for (const world of turns) {
      const actual = world.depth.combat ?? world.depth.roadSupper!.terminal!.combat;
      if (actual.supper!.spent !== null && actual.turn > actual.supper!.spent.turn) expect(projectRoadSupperCombat(actual)!.label).toBe("");
    }
  });

  it("round-trips immutable current views and rejects stale, foreign or wrong-scene receipts", () => {
    for (const world of [journey.purchased, journey.meal]) {
      const json = JSON.stringify(world), source = world.chronicle.at(-1)!, view = projectRoadSupperScene(world);
      expect(view).not.toBeNull(); expect(Object.isFrozen(view)).toBe(true);
      expect(projectRoadSupperScene(JSON.parse(json))).toEqual(view);
      expect(JSON.stringify(world)).toBe(json);
      for (const change of [{ commandId: `foreign:${source.commandId}` }, { tick: world.tick - 1 },
        { commandType: "wait" as const }, { mode: "battle" as const }]) {
        expect(projectRoadSupperScene({ ...world, chronicle: [...world.chronicle.slice(0, -1), { ...source, ...change }] })).toBeNull();
      }
      expect(projectRoadSupperScene({ ...world, campaignId: "foreign" })).toBeNull();
      expect(projectRoadSupperScene({ ...world, hero: { ...world.hero, id: "another-hero" } })).toBeNull();
      expect(projectRoadSupperScene({ ...world, scene: { ...world.scene, mode: "battle" } })).toBeNull();
    }
  });

  it("keeps exact purchase and meal sources in existing Status without replaying them after battle", () => {
    for (const world of [journey.purchased, journey.meal]) {
      const source = world.chronicle.at(-1)!;
      const row = projectStatusHistory(world).find(entry => entry.source === "chronicle" && entry.eventId === source.id);
      if (row?.source !== "chronicle") throw new Error("Actual supper event missing from Status");
      expect(row.decision.commandId).toBe(source.commandId);
      expect(row.decision.commandType).toBe(source.commandType);
      expect(row.consequence).toBe(source.consequence);
    }
    expect(projectRoadSupperScene(journey.resolved)).toBeNull();
    expect(projectRoadSupperScene(journey.next)).toBeNull();
    expect(journey.next.depth.roadSupper).toEqual(journey.resolved.depth.roadSupper);
  });

  it("leaves earlier encounters and legacy absence without an invented preparation", () => {
    expect(journey.beforePurchase.depth.completedCombats.length).toBeGreaterThan(0);
    for (const combat of journey.beforePurchase.depth.completedCombats) expect(projectRoadSupperCombat(combat)).toBeNull();
    for (const key of ["repartee", "reparteeWitness", "reparteeCallback", "bellExpedition", "bellMemory", "usefulReply", "roomChallenge"] as const) {
      expect(journey.purchased.depth[key]).toEqual(journey.beforePurchase.depth[key]);
      expect(journey.meal.depth[key]).toEqual(journey.beforeMeal.depth[key]);
    }
  });
});
