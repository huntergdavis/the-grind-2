import { actorPolicy, advanceWorld, campaignDirector, createWorld } from "../src/core/simulation";
import { canonicalHash } from "../src/core/canonical";
import type { WorldState } from "../src/core/types";

export const roadSupperCampaignId = "campaign:browser-repartee-memory";
let purchase: { beforePurchase: WorldState; purchased: WorldState } | undefined;
let supper: { beforeMeal: WorldState; meal: WorldState } | undefined;

/** Uninterrupted actual campaign, not supplied food or a staged market. The
 * unchanged-v174 proof reached the later, two-visited-town boundary at T58
 * (hash e823e5bde8f2a9f6), before ordinary T59 training. This fixture preserves
 * that anchor and gives the actual policy up to T96 to buy its first rations.
 */
function purchaseJourney(): { beforePurchase: WorldState; purchased: WorldState } {
  if (purchase !== undefined) return purchase;
  let world = createWorld("shared-road-playful:7", roadSupperCampaignId), baselineSeen = false;
  while (world.tick < 96) {
    if (world.tick === 58) {
      if (canonicalHash(world) !== "e823e5bde8f2a9f6") throw new Error("Road Supper changed the earned pre-feature T58 baseline");
      baselineSeen = true;
    }
    const choice = actorPolicy(world, campaignDirector(world));
    const next = advanceWorld(world);
    if (choice.command.type === "buy-road-rations") {
      if (!baselineSeen || next.chronicle.at(-1)?.commandType !== "buy-road-rations") throw new Error("Ration purchase did not preserve its ordinary source boundary");
      purchase = { beforePurchase: world, purchased: next }; return purchase;
    }
    world = next;
  }
  throw new Error("The actual Road Supper journey did not purchase rations by T96");
}

function mealJourney(): { beforeMeal: WorldState; meal: WorldState } {
  if (supper !== undefined) return supper;
  let world = purchaseJourney().purchased;
  while (world.tick < 96) {
    const choice = actorPolicy(world, campaignDirector(world));
    const next = advanceWorld(world);
    if (choice.command.type === "prepare-road-supper") {
      if (next.chronicle.at(-1)?.commandType !== "prepare-road-supper") throw new Error("The actual camp did not retain its preparation command");
      supper = { beforeMeal: world, meal: next }; return supper;
    }
    world = next;
  }
  throw new Error("The actual purchased supplies did not reach a Road Supper by T96");
}

export function naturalRoadSupperBeforePurchaseFixture(): WorldState { return purchaseJourney().beforePurchase; }
export function naturalRoadSupperPurchasedFixture(): WorldState { return purchaseJourney().purchased; }
export function naturalRoadSupperBeforeMealFixture(): WorldState { return mealJourney().beforeMeal; }
export function naturalRoadSupperMealFixture(): WorldState { return mealJourney().meal; }

export interface NaturalRoadSupperJourney {
  beforePurchase: WorldState;
  purchased: WorldState;
  beforeMeal: WorldState;
  meal: WorldState;
  started: WorldState;
  turns: readonly WorldState[];
  resolved: WorldState;
  next: WorldState;
}
let fought: NaturalRoadSupperJourney | undefined;

/** One actual route battle, including a loss if that is what happens. No hero,
 * enemy, inventory, status, roll or result edits. At most32 combat commands;
 * the terminal archive and next ordinary command are retained unchanged.
 */
export function naturalRoadSupperJourneyFixture(): NaturalRoadSupperJourney {
  if (fought !== undefined) return fought;
  const prepared = mealJourney(), started = advanceWorld(prepared.meal);
  if (started.chronicle.at(-1)?.commandType !== "start-combat" || started.depth.combat === null) {
    throw new Error("Road Supper did not lead directly into its actual road battle");
  }
  let world = started;
  const turns: WorldState[] = [];
  while (world.depth.combat !== null && turns.length < 32) {
    world = advanceWorld(world);
    if (world.chronicle.at(-1)?.commandType !== "combat-action") throw new Error("Supper battle progression invented a non-combat command");
    turns.push(world);
  }
  if (world.depth.combat !== null || turns.length === 0) throw new Error("Actual supper battle did not settle within32 combat commands");
  fought = { ...purchaseJourney(), ...prepared, started, turns, resolved: world, next: advanceWorld(world) };
  return fought;
}
