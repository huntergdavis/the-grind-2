import type { WorldState } from "../core/types";
import { isValidCombatState } from "../depth/combat";
import { isValidCampaignRoadSupper } from "../depth/road-supper";
import type { CombatState } from "../depth/types";

export interface RoadSupperScene {
  readonly phase: "purchase" | "prepared";
  readonly commandId: string;
  readonly tick: number;
  readonly heroId: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly marketId: string | null;
  readonly marketName: string | null;
  readonly encounterId: string | null;
  readonly routeLabel: string | null;
  readonly itemId: string;
  readonly itemName: string;
  readonly quantityBefore: number;
  readonly quantityAfter: number;
  readonly goldBefore: number;
  readonly goldAfter: number;
  readonly headline: string;
  readonly detail: string;
  readonly compactDetail: string;
}

/** A stored shopping list or meal never replays a purchase/camp over another current command. */
export function projectRoadSupperScene(world: WorldState): RoadSupperScene | null {
  const state = world.depth, story = state.roadSupper, source = world.chronicle.at(-1);
  if (story == null || !isValidCampaignRoadSupper(state) || source == null || source.tick !== world.tick || world.tick !== state.tick
    || world.hero.id !== state.hero.id || state.hero.resources.health <= 0 || state.companions.active.length !== 0
    || state.combat !== null || state.counterDuel !== null) return null;
  const purchase = story.purchase, meal = story.meal;
  const phase = source.commandType === "buy-road-rations" ? "purchase"
    : source.commandType === "prepare-road-supper" ? "prepared" : null;
  if (phase === null) return null;
  const receipt = phase === "purchase" ? purchase : meal;
  const mode = phase === "purchase" ? "town" : "camp";
  if (receipt === null || receipt.tick !== world.tick || source.commandId !== `${world.campaignId}:${receipt.sourceCommandId}`
    || world.scene.mode !== mode || source.mode !== mode || receipt.heroId !== state.hero.id
    || receipt.locationId !== state.atlas.currentLocationId) return null;
  const location = state.atlas.locations.find(entry => entry.id === receipt.locationId);
  if (location === undefined) return null;
  const market = phase === "purchase" ? state.towns[receipt.locationId]?.buildings.find(building => building.id === purchase.marketId && building.kind === "market") : undefined;
  if (phase === "purchase" && (location.kind !== "town" || market === undefined || market.name !== purchase.marketName)) return null;
  const route = phase === "prepared" ? meal?.route : null;
  const from = route == null ? null : state.atlas.locations.find(entry => entry.id === route.path[route.legIndex]);
  const to = route == null ? null : state.atlas.locations.find(entry => entry.id === route.path[route.legIndex + 1]);
  if (phase === "prepared" && (from == null || to == null)) return null;
  return Object.freeze({ phase, commandId: source.commandId, tick: world.tick, heroId: state.hero.id,
    locationId: location.id, locationName: location.name, marketId: market?.id ?? null, marketName: market?.name ?? null,
    encounterId: phase === "prepared" ? meal!.encounterId : null,
    routeLabel: from == null || to == null ? null : `${from.name} → ${to.name}`,
    itemId: receipt.itemId, itemName: receipt.itemName, quantityBefore: receipt.quantityBefore, quantityAfter: receipt.quantityAfter,
    goldBefore: phase === "purchase" ? purchase.goldBefore : state.hero.gold,
    goldAfter: phase === "purchase" ? purchase.goldAfter : state.hero.gold,
    headline: phase === "purchase" ? "ROAD RATIONS · 2 GOLD" : "ROAD SUPPER · PREPARED",
    detail: phase === "purchase" ? `${market!.name} · rations ${purchase.quantityBefore}→${purchase.quantityAfter}` : meal!.line,
    compactDetail: phase === "purchase" ? `RATIONS ${purchase.quantityBefore}→${purchase.quantityAfter} · GOLD ${purchase.goldBefore}→${purchase.goldAfter}`
      : "RATIONS 2→0 · FIRST HIT −25%",
  });
}

export interface RoadSupperCombatView {
  readonly phase: "ready" | "spent" | "expired";
  readonly combatId: string;
  readonly heroId: string;
  readonly mealSourceCommandId: string;
  readonly mealTick: number;
  readonly damageEventId: string | null;
  readonly prevented: number | null;
  readonly guarded: boolean;
  readonly label: string;
}

/** No fake Guard status: its ordinary 50% rule and expiry differ from this one-use preparation. */
export function projectRoadSupperCombat(combat: CombatState): RoadSupperCombatView | null {
  const supper = combat.supper;
  if (supper === undefined || !isValidCombatState(combat)) return null;
  const spent = supper.spent, phase = spent !== null ? "spent" : combat.outcome === "ongoing" ? "ready" : "expired";
  return Object.freeze({ phase, combatId: combat.id, heroId: supper.heroId,
    mealSourceCommandId: supper.mealSourceCommandId, mealTick: supper.mealTick,
    damageEventId: spent?.damageEventId ?? null, prevented: spent?.prevented ?? null, guarded: spent?.guarded ?? false,
    label: phase === "ready" ? "SUPPER 25% · ONE HIT" : phase === "expired" ? "SUPPER EXPIRED UNUSED"
      : spent!.turn !== combat.turn ? "" : spent!.guarded ? "SUPPER USED · GUARD STRONGER" : `SUPPER USED · ${spent!.prevented} DMG PREVENTED`,
  });
}
