import { describe, expect, it } from "vitest";
import { advanceWorld, createWorld, upgradeWorldState } from "../core/simulation";
import type { WorldState } from "../core/types";
import { projectCriticalRoadsideRecovery } from "./critical-roadside-recovery";

function recoveryFixture(): WorldState {
  let routed = createWorld("critical-recovery-projection", "campaign:critical-recovery-projection");
  for (let step = 0; step < 24 && routed.depth.atlas.route === null; step += 1) routed = advanceWorld(routed);
  if (routed.depth.atlas.route === null) throw new Error("Projection fixture needs an unresolved route");
  const health = Math.floor(routed.depth.hero.resources.maxHealth / 2);
  const depleted = upgradeWorldState({
    ...routed,
    hero: { ...routed.hero, health },
    depth: {
      ...routed.depth,
      hero: {
        ...routed.depth.hero,
        resources: { ...routed.depth.hero.resources, health, mana: 0 },
      },
    },
  });
  return advanceWorld(depleted);
}

describe("critical roadside recovery projection", () => {
  it("projects exact Chronicle-backed facts for the canonical recovery command", () => {
    const state = recoveryFixture();
    const projection = projectCriticalRoadsideRecovery(state);

    expect(projection).toEqual({
      commandId: state.chronicle.at(-1)?.commandId,
      tick: state.tick,
      location: state.scene.location,
      recoveryText: state.scene.action,
      readinessText: state.scene.consequence,
      health: state.depth.hero.resources.maxHealth,
      maxHealth: state.depth.hero.resources.maxHealth,
      mana: state.depth.hero.resources.maxMana,
      maxMana: state.depth.hero.resources.maxMana,
    });
    expect(Object.isFrozen(projection)).toBe(true);
  });

  it("fails closed for forged identity, route, resources, log, or scene facts", () => {
    const state = recoveryFixture();
    const source = state.chronicle.at(-1);
    const latestLog = state.depth.log.at(-1);
    if (source === undefined || latestLog === undefined) throw new Error("Projection fixture lost its source facts");
    const forged: WorldState[] = [
      { ...state, chronicle: [...state.chronicle.slice(0, -1), { ...source, commandId: `${source.commandId}:forged` }] },
      { ...state, chronicle: [...state.chronicle.slice(0, -1), { ...source, commandId: `other-campaign:depth:${state.tick}:critical-roadside-recovery` }] },
      { ...state, depth: { ...state.depth, atlas: { ...state.depth.atlas, route: null } } },
      { ...state, depth: { ...state.depth, hero: { ...state.depth.hero, resources: { ...state.depth.hero.resources, health: state.depth.hero.resources.health - 1 } } } },
      { ...state, depth: { ...state.depth, log: [...state.depth.log.slice(0, -1), { ...latestLog, message: "forged" }] } },
      { ...state, scene: { ...state.scene, location: "forged" } },
      { ...state, scene: { ...state.scene, headline: "forged" } },
      { ...state, scene: { ...state.scene, goal: "forged" } },
      { ...state, scene: { ...state.scene, consequence: "forged" } },
      { ...state, scene: { ...state.scene, sensoryIntensity: 3 } },
    ];

    for (const candidate of forged) expect(projectCriticalRoadsideRecovery(candidate)).toBeNull();
  });
});
