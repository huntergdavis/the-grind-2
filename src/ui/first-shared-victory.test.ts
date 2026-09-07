import { describe, expect, it } from "vitest";
import { canonicalStringify } from "../core/canonical";
import { createForwardMotionState } from "../core/forward-motion";
import { advanceWorld, createWorld, upgradeWorldState } from "../core/simulation";
import type { WorldState } from "../core/types";
import { stepDepth, unresolvedRouteEncounterId } from "../depth/state";
import { generateTown, visitTown } from "../depth/towns";
import { projectFirstSharedVictory } from "./first-shared-victory";

/** Validated fixture setup, then the real actor policy and combat reducer deliver the final blow. */
export function firstSharedVictoryFixture(condition: "healthy" | "injured" = "healthy") {
  const seed = "shared-road-party-experience";
  const initial = createWorld(seed, `campaign:${seed}`);
  const origin = initial.depth.atlas.currentLocationId;
  const location = initial.depth.atlas.locations.find((entry) => entry.kind === "town" && entry.id !== origin)!;
  const town = visitTown(generateTown(seed, location.id));
  const eligible = upgradeWorldState({
    ...initial, scene: { ...initial.scene, mode: "town", location: town.name },
    forwardMotion: createForwardMotionState(location.id, initial.tick),
    depth: { ...initial.depth, atlas: { ...initial.depth.atlas, currentLocationId: location.id,
      discoveredLocationIds: [origin, location.id], route: null }, towns: { ...initial.depth.towns, [location.id]: town } },
  });
  const routed = advanceWorld(advanceWorld(eligible));
  const encounterId = unresolvedRouteEncounterId(routed.depth);
  if (encounterId === null) throw new Error("First-victory fixture needs an unresolved route encounter");
  const depth = stepDepth(routed.depth, { type: "start-combat", encounterId, enemyCount: 1 });
  const combat = depth.combat;
  const companion = depth.companions.active[0];
  if (combat === null || companion === undefined || companion.victories !== 0) throw new Error("First-victory fixture needs its new active combat participant");
  const health = condition === "injured" ? 0 : companion.combat.maxHealth;
  const before = upgradeWorldState({
    ...routed, tick: depth.tick,
    hero: { ...routed.hero, health: depth.hero.resources.health, maxHealth: depth.hero.resources.maxHealth },
    scene: { ...routed.scene, mode: "battle", headline: "The first shared battle nears its end.",
      action: "The hero faces the final enemy.", consequence: "The next combat action will be resolved.", sensoryIntensity: 3 },
    lifecycle: { ...routed.lifecycle, simulationTick: depth.tick, worldClockMinutes: routed.lifecycle.worldClockMinutes + 15 },
    depth: { ...depth, companions: { ...depth.companions, active: [{ ...companion,
      injury: condition === "injured" ? "fallen" : "none", resources: { ...companion.resources, health } }] },
    combat: { ...combat, activeIndex: combat.turnOrder.indexOf(depth.hero.id), combatants: combat.combatants.map((entry) =>
      entry.id === companion.identity.residentId ? { ...entry, health }
        : entry.side === "enemies" ? { ...entry, health: 1 } : entry) } },
  });
  const after = advanceWorld(before);
  if (after.depth.combat !== null || after.depth.completedCombats.at(-1)?.outcome !== "victory") {
    throw new Error("First-victory fixture did not end in a canonical victory");
  }
  return { before, after };
}

describe("first shared-victory projection", () => {
  it.each(["healthy", "injured"] as const)("projects the canonical first win with a %s participating companion", (condition) => {
    const { before, after } = firstSharedVictoryFixture(condition);
    const packet = projectFirstSharedVictory(before, after);
    const source = after.chronicle.at(-1)!;
    const companion = after.depth.companions.active[0]!;
    expect(before.depth.companions.active[0]!.victories).toBe(0);
    expect(companion.victories).toBe(1);
    expect(source.commandType).toBe("combat-action");
    expect(packet).toEqual({
      kind: "first-shared-victory", campaignId: after.campaignId, eventId: source.id, tick: after.tick,
      combatId: before.depth.combat!.id, heroName: after.hero.name, companionName: companion.identity.name,
      companionId: companion.identity.residentId, condition,
      battle: { location: source.location, headline: source.headline, tick: after.tick },
    });
    expect(Object.isFrozen(packet)).toBe(true);
    expect(Object.isFrozen(packet?.battle)).toBe(true);
    expect(upgradeWorldState(structuredClone(before))).toEqual(before);
    expect(upgradeWorldState(structuredClone(after))).toEqual(after);
    if (condition === "injured") expect(companion.resources.health).toBe(0);
  });

  it("is deterministic and does not mutate either canonical state", () => {
    const { before, after } = firstSharedVictoryFixture();
    const original = canonicalStringify({ before, after });
    expect(projectFirstSharedVictory(before, after)).toEqual(projectFirstSharedVictory(before, after));
    expect(canonicalStringify({ before, after })).toBe(original);
  });

  it("allows identical visible names when the verified hero and companion are distinct participants", () => {
    const { before } = firstSharedVictoryFixture();
    const sharedName = before.depth.companions.active[0]!.identity.name;
    before.hero.name = sharedName;
    before.depth.hero.name = sharedName;
    before.depth.combat!.combatants.find((entry) => entry.id === before.hero.id)!.name = sharedName;
    const valid = upgradeWorldState(before);
    const after = advanceWorld(valid);
    const packet = projectFirstSharedVictory(valid, after);
    expect(packet).toMatchObject({ heroName: sharedName, companionName: sharedName });
    expect(packet?.companionId).not.toBe(valid.hero.id);
    expect(packet).not.toHaveProperty("heroId");
  });

  const corruptions: readonly [string, (before: WorldState, after: WorldState) => void][] = [
    ["different campaign", (_before, after) => { after.campaignId = "another-campaign"; }],
    ["different seed", (_before, after) => { after.seed = "another-seed"; }],
    ["different hero", (_before, after) => { after.hero.id = "another-hero"; }],
    ["changed hero name", (_before, after) => { after.hero.name = "Another Hero"; }],
    ["nonadjacent tick", (_before, after) => { after.tick += 1; }],
    ["divergent depth tick", (_before, after) => { after.depth.tick += 1; }],
    ["wrong command", (_before, after) => { after.chronicle.at(-1)!.commandType = "wait"; }],
    ["wrong command id", (_before, after) => { after.chronicle.at(-1)!.commandId = "not-the-canonical-command"; }],
    ["wrong event id", (_before, after) => { after.chronicle.at(-1)!.id = "not-the-canonical-event"; }],
    ["wrong event tick", (_before, after) => { after.chronicle.at(-1)!.tick -= 1; }],
    ["wrong source mode", (_before, after) => { after.chronicle.at(-1)!.mode = "camp"; }],
    ["duplicate latest event", (_before, after) => { after.chronicle = [...after.chronicle, after.chronicle.at(-1)!]; }],
    ["event already present", (before, after) => { before.chronicle = [...before.chronicle, after.chronicle.at(-1)!]; }],
    ["forged source wording", (_before, after) => { after.chronicle.at(-1)!.headline = "An invented victory."; after.scene.headline = "An invented victory."; }],
    ["ongoing combat remains", (before, after) => { after.depth.combat = before.depth.combat; }],
    ["no active prior combat", (before) => { before.depth.combat = null; }],
    ["previous combat already completed", (before) => { before.depth.combat!.outcome = "victory"; }],
    ["defeat", (_before, after) => { after.depth.completedCombats.at(-1)!.outcome = "defeat"; }],
    ["stalemate", (_before, after) => { after.depth.completedCombats.at(-1)!.outcome = "stalemate"; }],
    ["missing completed battle", (_before, after) => { after.depth.completedCombats = []; }],
    ["different completed battle", (_before, after) => { after.depth.completedCombats.at(-1)!.id = "other-combat"; }],
    ["duplicate completed battle", (_before, after) => { after.depth.completedCombats = [...after.depth.completedCombats, after.depth.completedCombats.at(-1)!]; }],
    ["already retained completed battle", (before, after) => { before.depth.completedCombats = [after.depth.completedCombats.at(-1)!]; }],
    ["second victory", (before, after) => { before.depth.companions.active[0]!.victories = 1; after.depth.companions.active[0]!.victories = 2; }],
    ["counter jumps to two", (_before, after) => { after.depth.companions.active[0]!.victories = 2; }],
    ["unchanged counter", (_before, after) => { after.depth.companions.active[0]!.victories = 0; }],
    ["no companion before", (before) => { before.depth.companions.active = []; }],
    ["no companion after", (_before, after) => { after.depth.companions.active = []; }],
    ["different companion", (_before, after) => { after.depth.companions.active[0]!.identity.residentId = "different-companion"; }],
    ["hero and companion share one id", (before, after) => { before.depth.companions.active[0]!.identity.residentId = before.hero.id; after.depth.companions.active[0]!.identity.residentId = after.hero.id; }],
    ["missing prior hero", (before) => { before.depth.combat!.combatants = before.depth.combat!.combatants.filter((entry) => entry.id !== before.hero.id); }],
    ["missing completed hero", (_before, after) => { const combat = after.depth.completedCombats.at(-1)!; combat.combatants = combat.combatants.filter((entry) => entry.id !== after.hero.id); }],
    ["duplicate prior hero", (before) => { const combat = before.depth.combat!; combat.combatants = [...combat.combatants, combat.combatants.find((entry) => entry.id === before.hero.id)!]; }],
    ["duplicate completed hero", (_before, after) => { const combat = after.depth.completedCombats.at(-1)!; combat.combatants = [...combat.combatants, combat.combatants.find((entry) => entry.id === after.hero.id)!]; }],
    ["duplicate prior companion", (before) => { const combat = before.depth.combat!; combat.combatants = [...combat.combatants, combat.combatants.find((entry) => entry.id === before.depth.companions.active[0]!.identity.residentId)!]; }],
    ["duplicate completed companion", (_before, after) => { const combat = after.depth.completedCombats.at(-1)!; combat.combatants = [...combat.combatants, combat.combatants.find((entry) => entry.id === after.depth.companions.active[0]!.identity.residentId)!]; }],
    ["forged prior hero role", (before) => { before.depth.combat!.combatants.find((entry) => entry.id === before.hero.id)!.side = "enemies"; }],
    ["forged completed hero role", (_before, after) => { after.depth.completedCombats.at(-1)!.combatants.find((entry) => entry.id === after.hero.id)!.side = "enemies"; }],
    ["forged prior hero name", (before) => { before.depth.combat!.combatants.find((entry) => entry.id === before.hero.id)!.name = "A stranger"; }],
    ["forged completed hero name", (_before, after) => { after.depth.completedCombats.at(-1)!.combatants.find((entry) => entry.id === after.hero.id)!.name = "A stranger"; }],
    ["missing prior participant", (before) => { before.depth.combat!.combatants = before.depth.combat!.combatants.filter((entry) => entry.id !== before.depth.companions.active[0]!.identity.residentId); }],
    ["missing completed participant", (_before, after) => { const combat = after.depth.completedCombats.at(-1)!; combat.combatants = combat.combatants.filter((entry) => entry.id !== after.depth.companions.active[0]!.identity.residentId); }],
    ["forged combat identity", (before) => { before.depth.combat!.combatants.find((entry) => entry.id === before.depth.companions.active[0]!.identity.residentId)!.name = "A stranger"; }],
    ["resource mismatch", (_before, after) => { after.depth.companions.active[0]!.resources.health -= 1; }],
    ["impossible injury", (_before, after) => { after.depth.companions.active[0]!.injury = "fallen"; }],
    ["forged final combat log", (_before, after) => { after.depth.completedCombats.at(-1)!.log.at(-1)!.message = "An invented final action."; }],
    ["noncanonical reward", (_before, after) => { after.depth.hero.gold += 1; }],
    ["unsafe public name", (_before, after) => { after.depth.companions.active[0]!.identity.name = "<b>Someone</b>"; }],
    ["unsafe public source", (_before, after) => { after.chronicle.at(-1)!.location = "Town\u0000"; }],
    ["unbounded public headline", (_before, after) => { after.chronicle.at(-1)!.headline = "x".repeat(161); }],
  ];

  it.each(corruptions)("rejects %s without creating a milestone", (_name, corrupt) => {
    const { before, after } = firstSharedVictoryFixture();
    corrupt(before, after);
    expect(projectFirstSharedVictory(before, after)).toBeNull();
  });

  it("does not reconstruct a first victory from load, a repeated source, or a later scene", () => {
    const { before, after } = firstSharedVictoryFixture();
    expect(projectFirstSharedVictory(before, before)).toBeNull();
    expect(projectFirstSharedVictory(after, after)).toBeNull();
    expect(projectFirstSharedVictory(after, advanceWorld(after))).toBeNull();
  });
});
