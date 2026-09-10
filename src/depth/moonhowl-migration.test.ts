import { describe, expect, it } from "vitest";
import { createFieldResearchState } from "./field-research";
import { createDepthState, stepDepth, unresolvedRouteEncounterId, upgradeDepthState } from "./state";

const seed = "browser-field-research:0";
const heroId = "hero:campaign:browser-field-research";

function observedInkcap(complete: boolean) {
  const base = createDepthState(seed, heroId, "Mara");
  const origin = base.atlas.currentLocationId;
  const edge = base.atlas.edges.find((entry) => entry.from === origin || entry.to === origin)!;
  const routed = stepDepth(base, { type: "plan-route", destinationId: edge.from === origin ? edge.to : edge.from });
  const started = stepDepth(routed, { type: "start-combat", encounterId: unresolvedRouteEncounterId(routed)!, enemyCount: 1 });
  const enemy = started.combat!.combatants.find((unit) => unit.side === "enemies")!;
  expect(enemy.speciesId).toBe("inkcap-mimic");
  const ready = { ...started,
    hero: { ...started.hero, resources: { ...started.hero.resources, health: started.hero.resources.maxHealth, mana: 0 } },
    combat: { ...started.combat!, activeIndex: 0, turnOrder: [enemy.id, heroId],
      combatants: started.combat!.combatants.map((unit) => unit.id === heroId ? { ...unit, health: unit.maxHealth, mana: 0 } : unit) },
  };
  const applied = stepDepth(ready, { type: "combat-action", action: { type: "ability", actorId: enemy.id,
    targetId: heroId, abilityId: "secret:inkcap-mimic:false-treasure", itemId: null } });
  return complete ? stepDepth(applied, { type: "combat-action", action: { type: "guard", actorId: heroId,
    targetId: null, abilityId: null, itemId: null } }) : applied;
}

describe("Moonhowl old-save migration", () => {
  it.each([false, true])("preserves actual Inkcap proof from schema23 (completed=%s)", (complete) => {
    const current = JSON.parse(JSON.stringify(observedInkcap(complete)));
    expect(current.fieldResearch.inkcap.application).not.toBeNull();
    expect(current.fieldResearch.inkcap.aftereffect !== null).toBe(complete);
    const legacy = { ...current, schemaVersion: 23, fieldResearch: current.fieldResearch.inkcap };
    const bytes = JSON.stringify(legacy);
    const loaded = upgradeDepthState(legacy, seed, heroId, "Mara");
    expect(loaded).toEqual(current);
    expect(loaded.fieldResearch.moonhowl).toEqual(createFieldResearchState().moonhowl);
    expect(JSON.stringify(legacy)).toBe(bytes);
    expect(upgradeDepthState(JSON.parse(JSON.stringify(loaded)), seed, heroId, "Mara")).toEqual(loaded);
  });

  it("rejects malformed or future legacy evidence instead of erasing it during migration", () => {
    const current = observedInkcap(true);
    const inkcap = current.fieldResearch.inkcap;
    for (const fieldResearch of [undefined, null, { ...inkcap, schemaVersion: 3 },
      { ...inkcap, application: { ...inkcap.application!, targetId: "hero:other" } },
      { ...inkcap, aftereffect: { ...inkcap.aftereffect!, applicationEventId: "not-the-source" } },
    ]) {
      expect(() => upgradeDepthState({ ...current, schemaVersion: 23, fieldResearch }, seed, heroId, "Mara")).toThrow();
    }
  });
});
