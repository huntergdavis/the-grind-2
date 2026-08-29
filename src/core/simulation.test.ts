import { describe, expect, it } from "vitest";
import {
  actorPolicy,
  advanceWorld,
  campaignDirector,
  catchUpWorld,
  createWorld,
  attentionPolicyForMode,
  rulesEngine,
  upgradeWorldState,
} from "./simulation";

describe("autonomous simulation", () => {
  it("replays exactly from a seed", () => {
    let left = createWorld("replay-seed", "campaign");
    let right = createWorld("replay-seed", "campaign");
    for (let index = 0; index < 250; index += 1) {
      left = advanceWorld(left);
      right = advanceWorld(right);
    }
    expect(left).toEqual(right);
  });

  it("records alternatives and actor rationale", () => {
    const initial = createWorld("choice-seed", "campaign");
    const world = {
      ...initial,
      depth: {
        ...initial.depth,
        atlas: { ...initial.depth.atlas, currentLocationId: "location:1" },
      },
    };
    const opportunity = campaignDirector(world);
    const choice = actorPolicy(world, opportunity);
    expect(choice.consideredActions.length).toBeGreaterThan(1);
    expect(choice.consideredActions).toContain(choice.action);
    expect(choice.rationale).toContain(world.hero.name);
    expect(choice.trace.selected.commandId).toBe(choice.commandId);
    expect(choice.trace.considered.length).toBeLessThanOrEqual(4);
    expect(choice.command.type).toBe("plan-route");
    const resolved = rulesEngine(world, opportunity, choice);
    expect(resolved.chronicle.at(-1)).toMatchObject({
      commandId: choice.commandId,
      commandType: "plan-route",
      chosenAction: choice.action,
      rationale: choice.rationale,
    });
    if (choice.command.type !== "plan-route") throw new Error("Expected a route command");
    expect(resolved.depth.atlas.route?.destinationId).toBe(choice.command.destinationId);
  });

  it("keeps command opportunities bounded, unique, serializable, and deterministic across 1,000 seeds", () => {
    for (let index = 0; index < 1_000; index += 1) {
      const world = createWorld(`candidate-audit:${index}`, `campaign:${index}`);
      const first = campaignDirector(world);
      const replay = campaignDirector(JSON.parse(JSON.stringify(world)));
      expect(first).toEqual(replay);
      expect(first.candidates.length).toBeGreaterThanOrEqual(1);
      expect(first.candidates.length).toBeLessThanOrEqual(12);
      expect(new Set(first.candidates.map((candidate) => candidate.id)).size).toBe(first.candidates.length);
      expect(JSON.parse(JSON.stringify(first.candidates))).toEqual(first.candidates);
      expect(actorPolicy(world, first)).toEqual(actorPolicy(world, replay));
    }
  }, 20_000);

  it("resolves the exact canonical combat actor, target, and ability selected", () => {
    let world = createWorld("combat-choice-seed", "campaign");
    while (world.depth.combat === null) world = advanceWorld(world);
    const opportunity = campaignDirector(world);
    const choice = actorPolicy(world, opportunity);
    if (choice.command.type !== "combat-action") throw new Error("Expected a combat command");
    const command = choice.command;
    const resolved = rulesEngine(world, opportunity, choice);
    const action = (resolved.depth.combat ?? resolved.depth.completedCombats.at(-1))?.log.at(-1);
    expect(action).toMatchObject({
      actorId: command.action.actorId,
      targetId: command.action.targetId,
      abilityId: command.action.abilityId,
    });
    expect(resolved.scene.action).toBe(action?.message);
  });

  it("attributes enemy decisions to the enemy instead of the hero", () => {
    let world = createWorld("enemy-choice-seed", "campaign");
    while (world.depth.combat === null) world = advanceWorld(world);
    while (
      world.depth.combat !== null &&
      world.depth.combat.combatants.find((entry) => entry.id === world.depth.combat?.turnOrder[world.depth.combat.activeIndex])?.side !== "enemies"
    ) world = advanceWorld(world);
    const opportunity = campaignDirector(world);
    const choice = actorPolicy(world, opportunity);
    if (choice.command.type !== "combat-action") throw new Error("Expected an enemy combat command");
    const command = choice.command;
    const actor = world.depth.combat?.combatants.find((entry) => entry.id === command.action.actorId);
    expect(actor?.side).toBe("enemies");
    expect(opportunity.candidates.every((candidate) => candidate.deciderId === actor?.id)).toBe(true);
    expect(choice.rationale).toContain(actor?.name);
    expect(choice.rationale.startsWith(`${world.hero.name} chose`)).toBe(false);
    expect(choice.trace.actorId).toBe(actor?.id);
    expect(choice.trace.actorName).toBe(actor?.name);
  });

  it("rejects a command that was not one of the director's legal candidates", () => {
    const world = createWorld("illegal-choice-seed", "campaign");
    const opportunity = campaignDirector(world);
    const choice = actorPolicy(world, opportunity);
    expect(() => rulesEngine(world, opportunity, {
      ...choice,
      command: { type: "travel", distance: 999 },
    })).toThrow("illegal action");
  });

  it("presents scheduled ability training as an attention-gated scene", () => {
    const initial = createWorld("training-scene", "campaign");
    const ability = initial.depth.hero.abilities[0];
    if (ability === undefined) throw new Error("Hero has no starter ability");
    const world = {
      ...initial,
      tick: 29,
      depth: { ...initial.depth, tick: 29 },
      lifecycle: { ...initial.lifecycle, simulationTick: 29 },
    };
    expect(campaignDirector(world).mode).toBe("training");
    expect(attentionPolicyForMode("training")).toBe("queueForPresentation");
    const opportunity = campaignDirector(world);
    const choice = actorPolicy(world, opportunity);
    if (choice.command.type !== "train-ability") throw new Error("Expected training");
    const command = choice.command;
    const trained = advanceWorld(world);
    expect(trained.scene.mode).toBe("training");
    expect(trained.scene.action).toContain("practices");
    const before = world.depth.hero.abilities.find((entry) => entry.id === command.abilityId);
    expect(trained.depth.hero.abilities.find((entry) => entry.id === command.abilityId)?.experience).toBe((before?.experience ?? 0) + 3);
  });

  it("presents a newly learned monster secret before continuing the road", () => {
    const initial = createWorld("discovery-scene", "campaign");
    const ability = initial.depth.hero.abilities[0];
    if (ability === undefined) throw new Error("Hero has no starter ability");
    const tick = 8;
    const world = {
      ...initial,
      tick,
      depth: {
        ...initial.depth,
        tick,
        discoveries: [{
          id: "discovery:test",
          tick,
          abilityId: ability.id,
          abilityName: ability.name,
          monsterId: "lantern-wolf",
          monsterName: "Lantern Wolf",
        }],
      },
      lifecycle: { ...initial.lifecycle, simulationTick: tick },
    };
    expect(campaignDirector(world).mode).toBe("discovery");
    expect(attentionPolicyForMode("discovery")).toBe("queueForPresentation");
    const discovered = advanceWorld(world);
    expect(discovered.scene.mode).toBe("discovery");
    expect(discovered.scene.headline).toContain(ability.name);
    expect(discovered.scene.action).toContain("Lantern Wolf");
    expect(discovered.depth.hero.abilities.find((entry) => entry.id === ability.id)?.experience).toBe(ability.experience + 3);
  });

  it("does not hide camp healing behind a discovery training command", () => {
    const initial = createWorld("discovery-camp", "campaign");
    const ability = initial.depth.hero.abilities[0];
    if (ability === undefined) throw new Error("Hero has no starter ability");
    const tick = 17;
    const health = Math.max(1, initial.depth.hero.resources.maxHealth - 10);
    const world = {
      ...initial,
      tick,
      hero: { ...initial.hero, health },
      depth: {
        ...initial.depth,
        tick,
        hero: {
          ...initial.depth.hero,
          resources: { ...initial.depth.hero.resources, health },
        },
        discoveries: [{
          id: "discovery:camp",
          tick,
          abilityId: ability.id,
          abilityName: ability.name,
          monsterId: "lantern-wolf",
          monsterName: "Lantern Wolf",
        }],
      },
      lifecycle: { ...initial.lifecycle, simulationTick: tick },
    };
    const opportunity = campaignDirector(world);
    expect(opportunity.mode).toBe("discovery");
    expect(opportunity.candidates.every((candidate) => candidate.command.type === "train-ability")).toBe(true);
    const advanced = advanceWorld(world);
    expect(advanced.scene.mode).toBe("discovery");
    expect(advanced.depth.hero.resources.health).toBe(health);
  });

  it("recovers only through an explicit wait command", () => {
    const initial = createWorld("explicit-recovery", "campaign");
    const world = {
      ...initial,
      hero: { ...initial.hero, health: 0 },
      depth: {
        ...initial.depth,
        hero: {
          ...initial.depth.hero,
          resources: { ...initial.depth.hero.resources, health: 0 },
        },
      },
    };
    const opportunity = campaignDirector(world);
    const choice = actorPolicy(world, opportunity);
    expect(choice.command.type).toBe("wait");
    const recovered = rulesEngine(world, opportunity, choice);
    expect(recovered.depth.hero.resources.health).toBeGreaterThan(0);
    expect(recovered.depth.hero.resources.health).toBeLessThan(recovered.depth.hero.resources.maxHealth);
  });

  it("reloads a learned secret with matching lore and discovery provenance", () => {
    const initial = createWorld("secret-reload", "campaign");
    const secret = {
      id: "secret:lantern-wolf:moonhowl",
      name: "Moonhowl",
      kind: "secret" as const,
      effect: "weaken" as const,
      level: 1,
      experience: 0,
      uses: 0,
      manaCost: 2,
      potency: 4,
      sourceMonsterId: "lantern-wolf",
    };
    const world = {
      ...initial,
      depth: {
        ...initial.depth,
        hero: {
          ...initial.depth.hero,
          abilities: [...initial.depth.hero.abilities, secret],
          monsterLore: [...initial.depth.hero.monsterLore, {
            monsterId: "lantern-wolf",
            monsterName: "Lantern Wolf",
            encounters: 3,
            victories: 3,
            insight: 3,
            requiredInsight: 3,
            secretTechniqueId: secret.id,
            secretTechniqueName: secret.name,
            learned: true,
          }],
        },
        discoveries: [{
          id: "discovery:moonhowl:reload",
          tick: 0,
          abilityId: secret.id,
          abilityName: secret.name,
          monsterId: "lantern-wolf",
          monsterName: "Lantern Wolf",
        }],
      },
    };
    const restored = upgradeWorldState(JSON.parse(JSON.stringify(world)));
    expect(restored.depth.hero.abilities.at(-1)).toEqual(secret);
    expect(restored.depth.hero.monsterLore.at(-1)?.learned).toBe(true);
    expect(restored.depth.discoveries.at(-1)?.abilityId).toBe(secret.id);
  });

  it("keeps eternal progression bounded while mastery continues", () => {
    let world = createWorld("forever-seed", "campaign");
    for (let index = 0; index < 20_000; index += 1) world = advanceWorld(world);
    expect(world.hero.level).toBeGreaterThanOrEqual(40);
    expect(world.hero.level).toBeLessThanOrEqual(50);
    expect(world.hero.mastery).toBeGreaterThan(0);
    expect(world.hero.health).toBeGreaterThan(0);
    expect(world.depth.hero.abilities.length).toBeLessThanOrEqual(16);
    expect(world.depth.hero.monsterLore.length).toBeLessThanOrEqual(16);
    expect(world.depth.discoveries.length).toBeLessThanOrEqual(32);
    expect(world.chronicle.every((entry) =>
      entry.decisionTrace !== undefined &&
      entry.decisionTrace.considered.length <= 4 &&
      entry.decisionTrace.reasons.length <= 3
    )).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(world)).byteLength).toBeLessThan(1_000_000);
  });

  it("bounds the live chronicle without duplicate event ids", () => {
    let world = createWorld("chronicle-seed", "campaign");
    for (let index = 0; index < 10_000; index += 1) world = advanceWorld(world);
    expect(world.chronicle).toHaveLength(32);
    expect(new Set(world.chronicle.map((entry) => entry.id)).size).toBe(32);
  });

  it("bounds seven-day catch-up and stops before an attention threshold", () => {
    const world = createWorld("catch-up-seed", "campaign");
    const caughtUp = catchUpWorld(world, {
      id: "observation:seven-days",
      observedAtMs: 604_800_000,
      elapsedMs: 604_800_000,
      requestedTicks: 126_000,
    });

    expect(caughtUp.tick).toBeGreaterThan(0);
    expect(caughtUp.tick).toBeLessThan(96);
    expect(caughtUp.chronicle.every((entry) => entry.attention === "backgroundSafe")).toBe(
      true,
    );
    expect(caughtUp.pendingAttention).toHaveLength(1);
    const pending = caughtUp.pendingAttention[0];
    expect(pending?.tick).toBe(caughtUp.tick + 1);
    expect(pending?.policy.attention).not.toBe("backgroundSafe");
    expect(pending?.commandId).toBeTruthy();
    expect(caughtUp.lifecycle.wallClockJournal[0]).toMatchObject({
      creditedTicks: 96,
      appliedTicks: caughtUp.tick,
      stoppedAtEventId: pending?.id,
    });
  });

  it("does not apply the same wall-clock observation twice", () => {
    const world = createWorld("catch-up-seed", "campaign");
    const request = {
      id: "observation:repeat",
      observedAtMs: 50_000,
      elapsedMs: 50_000,
      requestedTicks: 10,
    };
    const once = catchUpWorld(world, request);
    expect(catchUpWorld(once, request)).toBe(once);
  });

  it("upgrades released schema-one saves with lifecycle defaults", () => {
    const current = createWorld("migration-seed", "campaign");
    const legacy = {
      ...current,
      schemaVersion: 1,
      lifecycle: undefined,
      pendingAttention: undefined,
      depth: undefined,
      chronicle: current.chronicle.map(({ policy: _policy, ...entry }) => entry),
    };
    const upgraded = upgradeWorldState(legacy);
    expect(upgraded.schemaVersion).toBe(4);
    expect(upgraded.lifecycle.simulationTick).toBe(upgraded.tick);
    expect(upgraded.pendingAttention).toEqual([]);
    expect(upgraded.depth.tick).toBe(upgraded.tick);
    expect(upgraded.depth.hero.id).toBe(upgraded.hero.id);
    expect(upgraded.depth.hero.resources.health).toBe(upgraded.hero.health);
  });

  it("upgrades released schema-two saves without losing lifecycle progress", () => {
    let current = createWorld("migration-two-seed", "campaign-two");
    for (let index = 0; index < 7; index += 1) current = advanceWorld(current);
    const legacy = {
      ...current,
      schemaVersion: 2,
      depth: undefined,
    };
    const upgraded = upgradeWorldState(legacy);
    expect(upgraded.schemaVersion).toBe(4);
    expect(upgraded.tick).toBe(current.tick);
    expect(upgraded.lifecycle).toEqual(current.lifecycle);
    expect(upgraded.pendingAttention).toEqual(current.pendingAttention);
    expect(upgraded.depth.tick).toBe(current.tick);
    expect(upgraded.depth.hero.name).toBe(current.hero.name);
    expect(upgraded.depth.hero.gold).toBe(current.hero.gold);
  });

  it("upgrades a schema-three active battle in place", () => {
    let current = createWorld("migration-three-seed", "campaign-three");
    while (current.depth.combat === null) current = advanceWorld(current);
    const legacy = JSON.parse(JSON.stringify(current)) as {
      schemaVersion: number;
      depth: {
        schemaVersion: number;
        hero: Record<string, unknown>;
        combat: { id: string; round: number; turn: number; activeIndex: number; turnOrder: string[]; combatants: Record<string, unknown>[]; log: Record<string, unknown>[] } | null;
        completedCombats: { combatants: Record<string, unknown>[]; log: Record<string, unknown>[] }[];
        discoveries?: unknown;
      };
    };
    if (legacy.depth.combat !== null) {
      const hero = legacy.depth.combat.combatants.find((entry) => entry.id === current.hero.id);
      if (hero !== undefined) {
        hero.health = Math.max(1, Number(hero.health) - 2);
        hero.mana = Math.max(0, Number(hero.mana) - 1);
        hero.statuses = [{ kind: "poisoned", duration: 2, potency: 1 }];
        legacy.depth.combat.log.push({
          turn: 1,
          actorId: current.hero.id,
          action: "skill",
          message: `${current.hero.name} used a legacy skill.`,
          amount: 3,
        });
      }
    }
    legacy.schemaVersion = 3;
    legacy.depth.schemaVersion = 1;
    delete legacy.depth.hero.abilities;
    delete legacy.depth.hero.monsterLore;
    delete legacy.depth.discoveries;
    const downgradeCombat = (combat: { combatants: Record<string, unknown>[]; log: Record<string, unknown>[] }): void => {
      for (const combatant of combat.combatants) {
        delete combatant.speciesId;
        delete combatant.abilities;
      }
      for (const entry of combat.log) {
        if (entry.action === "ability") entry.action = "skill";
        delete entry.targetId;
        delete entry.abilityId;
      }
    };
    if (legacy.depth.combat === null) throw new Error("Expected active combat");
    downgradeCombat(legacy.depth.combat);
    for (const combat of legacy.depth.completedCombats) downgradeCombat(combat);
    const before = legacy.depth.combat;
    const upgraded = upgradeWorldState(legacy);
    expect(upgraded.schemaVersion).toBe(4);
    expect(upgraded.depth.schemaVersion).toBe(2);
    expect(upgraded.depth.combat).toMatchObject({
      id: before.id,
      round: before.round,
      turn: before.turn,
      activeIndex: before.activeIndex,
      turnOrder: before.turnOrder,
    });
    expect(upgraded.depth.combat?.combatants.map(({ health, mana, statuses }) => ({ health, mana, statuses }))).toEqual(
      before.combatants.map(({ health, mana, statuses }) => ({ health, mana, statuses })),
    );
    expect(upgraded.depth.combat?.combatants.every((entry) => entry.abilities.length > 0)).toBe(true);
    expect(upgraded.depth.hero.abilities).toHaveLength(2);
    expect(upgraded.depth.hero.monsterLore).toEqual([]);
    expect(upgraded.depth.discoveries).toEqual([]);
  });
});
