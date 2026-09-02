import { describe, expect, it } from "vitest";
import { advanceWorld, createWorld } from "../core/simulation";
import { createCombat } from "../depth/combat";
import { abilityExperienceFloor, maximumAbilities } from "../depth/rpg";
import type { AbilityState, MonsterLoreState } from "../depth/types";
import {
  isAbilityResonancePacketV1,
  projectAbilityResonance,
} from "./ability-resonance";

const maximumExperience = abilityExperienceFloor(20);

function resonanceAbility(ability: AbilityState, remainingExperience = 1): AbilityState {
  return {
    ...ability,
    level: 19,
    experience: maximumExperience - remainingExperience,
    uses: 7,
  };
}

function practicePair(seed: string, abilities?: readonly AbilityState[]) {
  const campaignId = `campaign:${seed}`;
  const initial = createWorld(seed, campaignId);
  const starter = initial.depth.hero.abilities[0];
  if (starter === undefined) throw new Error("Practice fixture hero has no ability");
  const preparedAbilities = abilities ?? [resonanceAbility(starter)];
  const before = {
    ...initial,
    tick: 29,
    lifecycle: { ...initial.lifecycle, simulationTick: 29 },
    depth: {
      ...initial.depth,
      tick: 29,
      hero: { ...initial.depth.hero, abilities: preparedAbilities },
    },
  };
  const after = advanceWorld(before);
  const source = after.chronicle.at(-1);
  if (source === undefined) throw new Error("Practice fixture produced no Chronicle source");
  const packet = projectAbilityResonance(before, after, source);
  return { before, after, source, packet };
}

function practiceFixture(seed: string, abilities?: readonly AbilityState[]) {
  const fixture = practicePair(seed, abilities);
  const { packet } = fixture;
  if (packet === null) throw new Error("Practice fixture produced no resonance packet");
  return { ...fixture, packet };
}

function battlePair(seed: string, remainingExperience = 1, terminal = false) {
  const campaignId = `campaign:${seed}`;
  const initial = createWorld(seed, campaignId);
  const abilities = initial.depth.hero.abilities.map((ability) => resonanceAbility(ability, remainingExperience));
  const hero = { ...initial.depth.hero, abilities };
  const created = createCombat(seed, hero, `encounter:${seed}`, terminal ? 1 : 2);
  const heroIndex = created.turnOrder.findIndex((id) => id === hero.id);
  if (heroIndex < 0) throw new Error("Battle fixture hero is absent from turn order");
  const combat = {
    ...created,
    activeIndex: heroIndex,
    combatants: terminal
      ? created.combatants.map((combatant) => combatant.id === hero.id
          ? combatant
          : { ...combatant, health: 1 })
      : created.combatants,
  };
  const before = {
    ...initial,
    depth: { ...initial.depth, hero, combat, legacyUnratedCombatIds: [combat.id] },
  };
  const after = advanceWorld(before);
  const source = after.chronicle.at(-1);
  if (source === undefined) throw new Error("Battle fixture produced no Chronicle source");
  const packet = projectAbilityResonance(before, after, source);
  return { before, after, source, packet };
}

function battleFixture(seed: string, remainingExperience = 1) {
  const fixture = battlePair(seed, remainingExperience);
  const { packet } = fixture;
  if (packet === null) throw new Error("Battle fixture produced no resonance packet");
  return { ...fixture, packet };
}

describe("exact Level-20 ability resonance projection", () => {
  it("projects one persisted practice crossing with uses unchanged and no invented unlock", () => {
    const { packet } = practiceFixture("ability-resonance-practice");
    expect(packet).toMatchObject({
      schemaVersion: 1,
      commandType: "train-ability",
      sourceKind: "practice",
      experienceBefore: maximumExperience - 1,
      experienceDelta: 1,
      experienceAfter: maximumExperience,
      levelBefore: 19,
      levelAfter: 20,
      crossingActionLevel: null,
      nextUseLevel: 20,
      damageLevelContributionBefore: 19,
      damageLevelContributionAfter: 20,
      provenanceStatus: "unverified",
      newAbilityGranted: false,
      branchSelected: false,
    });
    expect(packet.usesAfter).toBe(packet.usesBefore);
    expect(packet.eventId).toBe(`${packet.campaignId}:${packet.tick}`);
    expect(Object.isFrozen(packet)).toBe(true);
    expect(isAbilityResonancePacketV1(packet)).toBe(true);
  });

  it("projects the full unsaturated +3 practice award without changing uses", () => {
    const initial = createWorld("ability-resonance-practice-full", "campaign:practice-full-base");
    const ability = resonanceAbility(initial.depth.hero.abilities[0]!, 3);
    const { packet } = practiceFixture("ability-resonance-practice-full", [ability]);
    expect(packet).toMatchObject({
      experienceBefore: maximumExperience - 3,
      experienceDelta: 3,
      experienceAfter: maximumExperience,
      usesBefore: 7,
      usesAfter: 7,
    });
  });

  it("proves that a crossing combat action used Level 19 and only the next use reads Level 20", () => {
    const { before, after, packet } = battleFixture("ability-resonance-battle");
    expect(packet).toMatchObject({
      commandType: "combat-action",
      sourceKind: "battle-use",
      experienceDelta: 1,
      levelBefore: 19,
      levelAfter: 20,
      crossingActionLevel: 19,
      nextUseLevel: 20,
      damageLevelContributionBefore: 19,
      damageLevelContributionAfter: 20,
    });
    expect(packet.usesAfter).toBe(packet.usesBefore + 1);
    const combatBefore = before.depth.combat;
    const combatAfter = after.depth.combat ?? after.depth.completedCombats.at(-1);
    expect(combatBefore).not.toBeNull();
    expect(combatAfter?.eventStream.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "damage", actorId: packet.heroId, abilityId: packet.abilityId }),
    ]));
  });

  it("projects the full unsaturated +2 combat-use award", () => {
    const { after, packet } = battleFixture("ability-resonance-battle-full", 2);
    expect(after.depth.combat?.outcome).toBe("ongoing");
    expect(after.depth.hero.gold).toBe(12);
    expect(packet).toMatchObject({
      experienceBefore: maximumExperience - 2,
      experienceDelta: 2,
      experienceAfter: maximumExperience,
      usesBefore: 7,
      usesAfter: 8,
      crossingActionLevel: 19,
      nextUseLevel: 20,
    });
  });

  it("projects a real finishing-blow victory through canonical loot, quest, lore, and reward changes", () => {
    const { before, after, packet } = battlePair("ability-resonance-terminal-victory", 2, true);
    expect(after.depth.combat).toBeNull();
    expect(after.depth.completedCombats.at(-1)).toMatchObject({
      id: before.depth.combat?.id,
      outcome: "victory",
    });
    expect(packet).toMatchObject({
      sourceKind: "battle-use",
      experienceDelta: 2,
      levelBefore: 19,
      levelAfter: 20,
      crossingActionLevel: 19,
      nextUseLevel: 20,
    });
  });

  it.each([
    ["arcane", null, null],
    ["piercing", null, null],
    ["poison", 4, 5],
    ["burning", 5, 6],
    ["weaken", 5, 6],
  ] as const)("binds %s subsequent-use contribution facts to the Level 19 to 20 transition", (
    effect,
    statusPotencyBefore,
    statusPotencyAfter,
  ) => {
    const initial = createWorld(`ability-resonance-${effect}`, `campaign:${effect}:base`);
    const ability = resonanceAbility({ ...initial.depth.hero.abilities[0]!, effect });
    const { packet } = practiceFixture(`ability-resonance-${effect}`, [ability]);
    expect(packet).toMatchObject({
      effect,
      damageLevelContributionBefore: 19,
      damageLevelContributionAfter: 20,
      statusPotencyBefore,
      statusPotencyAfter,
      crossingActionLevel: null,
      nextUseLevel: 20,
    });
  });

  it("reports monster provenance only through the exact lore, discovery, and ability join", () => {
    const initial = createWorld("ability-resonance-provenance-base", "campaign:base");
    const ability: AbilityState = resonanceAbility({
      ...initial.depth.hero.abilities[0]!,
      id: "secret:lantern-wolf:moonhowl",
      name: "Moonhowl",
      kind: "secret",
      effect: "weaken",
      manaCost: 2,
      potency: 4,
      sourceMonsterId: "lantern-wolf",
    });
    const lore: MonsterLoreState = {
      monsterId: "lantern-wolf",
      monsterName: "Lantern Wolf",
      encounters: 3,
      victories: 3,
      insight: 3,
      requiredInsight: 3,
      secretTechniqueId: ability.id,
      secretTechniqueName: ability.name,
      learned: true,
    };
    const campaignId = "campaign:ability-resonance-provenance";
    const base = createWorld("ability-resonance-provenance", campaignId);
    const discovery = {
      id: "discovery:moonhowl",
      tick: 12,
      abilityId: ability.id,
      abilityName: ability.name,
      monsterId: lore.monsterId,
      monsterName: lore.monsterName,
    };
    const outcome = {
      id: `${base.seed}:secret-outcome:${lore.monsterId}`,
      recordedTick: 12,
      thresholdTick: 12,
      sourceCombatId: "combat:provenance",
      monsterId: lore.monsterId,
      monsterName: lore.monsterName,
      abilityId: ability.id,
      abilityName: ability.name,
      mechanics: { effect: ability.effect, manaCost: ability.manaCost, potency: ability.potency },
      disposition: "learned" as const,
      reason: "slot-available" as const,
      repertoireCount: 2,
      repertoireLimit: maximumAbilities,
    };
    const before = {
      ...base,
      tick: 29,
      lifecycle: { ...base.lifecycle, simulationTick: 29 },
      depth: {
        ...base.depth,
        tick: 29,
        hero: { ...base.depth.hero, abilities: [ability], monsterLore: [lore] },
        secretDiscoveryOutcomes: [outcome],
        secretDiscoveryAdmissions: [{
          id: `${outcome.id}:admission:${discovery.id}`,
          tick: discovery.tick,
          outcomeId: outcome.id,
          discoveryId: discovery.id,
        }],
        discoveries: [discovery],
      },
    };
    const after = advanceWorld(before);
    const source = after.chronicle.at(-1)!;
    const packet = projectAbilityResonance(before, after, source);
    expect(packet).toMatchObject({
      provenanceStatus: "verified",
      sourceMonsterId: lore.monsterId,
      sourceMonsterName: lore.monsterName,
      discoveryId: "discovery:moonhowl",
      discoveryTick: 12,
    });
    const mismatched = {
      ...after,
      depth: {
        ...after.depth,
        discoveries: after.depth.discoveries.map((entry) => ({ ...entry, abilityName: "Forged Howl" })),
      },
    };
    expect(projectAbilityResonance(before, mismatched, source)).toBeNull();

    const unverifiedBefore = {
      ...before,
      depth: {
        ...before.depth,
        hero: { ...before.depth.hero, monsterLore: [] },
        secretDiscoveryOutcomes: [],
        secretDiscoveryAdmissions: [],
        discoveries: [],
      },
    };
    const unverifiedAfter = advanceWorld(unverifiedBefore);
    const unverifiedSource = unverifiedAfter.chronicle.at(-1)!;
    expect(projectAbilityResonance(unverifiedBefore, unverifiedAfter, unverifiedSource)).toMatchObject({
      provenanceStatus: "unverified",
      sourceMonsterId: lore.monsterId,
      sourceMonsterName: null,
      discoveryId: null,
      discoveryTick: null,
    });

    const ambiguousBefore = {
      ...before,
      depth: {
        ...before.depth,
        hero: { ...before.depth.hero, monsterLore: [lore, { ...lore }] },
      },
    };
    const ambiguousAfter = {
      ...after,
      depth: {
        ...after.depth,
        hero: { ...after.depth.hero, monsterLore: [lore, { ...lore }] },
      },
    };
    expect(projectAbilityResonance(ambiguousBefore, ambiguousAfter, source)).toBeNull();
  });

  it("rejects non-Level-20 crossings and already-capped practice", () => {
    const initial = createWorld("ability-resonance-boundaries", "campaign:boundaries-base");
    const level18: AbilityState = {
      ...initial.depth.hero.abilities[0]!,
      level: 18,
      experience: abilityExperienceFloor(19) - 1,
      uses: 7,
    };
    const level18Pair = practicePair("ability-resonance-level-18", [level18]);
    expect(level18Pair.after.depth.hero.abilities[0]?.level).toBe(19);
    expect(level18Pair.packet).toBeNull();

    const capped: AbilityState = {
      ...initial.depth.hero.abilities[0]!,
      level: 20,
      experience: maximumExperience,
      uses: 7,
    };
    expect(practicePair("ability-resonance-capped", [capped]).packet).toBeNull();
  });

  it("rejects forged practice causality, hero award, unrelated state, and combat ability state", () => {
    const practice = practiceFixture("ability-resonance-causal-practice");
    const trace = practice.source.decisionTrace;
    if (trace === undefined) throw new Error("Practice fixture produced no decision trace");
    const forgedSource = {
      ...practice.source,
      decisionTrace: {
        ...trace,
        selected: { ...trace.selected, actionLabel: "waits" },
      },
    };
    const forgedSourceAfter = {
      ...practice.after,
      chronicle: [...practice.before.chronicle.slice(-31), forgedSource],
    };
    expect(projectAbilityResonance(practice.before, forgedSourceAfter, forgedSource)).toBeNull();

    const noHeroAward = {
      ...practice.after,
      hero: {
        ...practice.after.hero,
        experience: practice.before.hero.experience,
        level: practice.before.hero.level,
        mastery: practice.before.hero.mastery,
      },
      depth: {
        ...practice.after.depth,
        hero: {
          ...practice.after.depth.hero,
          experience: practice.before.depth.hero.experience,
          level: practice.before.depth.hero.level,
        },
      },
    };
    expect(projectAbilityResonance(practice.before, noHeroAward, practice.source)).toBeNull();

    const unrelatedState = {
      ...practice.after,
      depth: {
        ...practice.after.depth,
        discoveries: [{
          id: "forged:discovery",
          tick: practice.after.tick,
          abilityId: practice.packet.abilityId,
          abilityName: practice.packet.abilityName,
          monsterId: "forged:monster",
          monsterName: "Forged Monster",
        }],
      },
    };
    expect(projectAbilityResonance(practice.before, unrelatedState, practice.source)).toBeNull();

    const battle = battleFixture("ability-resonance-battle");
    const resolvedCombat = battle.after.depth.combat ?? battle.after.depth.completedCombats.at(-1);
    if (resolvedCombat === undefined) throw new Error("Battle fixture produced no resolved combat");
    const forgedCombat = {
      ...resolvedCombat,
      combatants: resolvedCombat.combatants.map((combatant) => combatant.id === battle.packet.heroId
        ? {
            ...combatant,
            abilities: combatant.abilities.map((ability) => ability.id === battle.packet.abilityId
              ? { ...ability, level: 19, experience: maximumExperience - 1 }
              : ability),
          }
        : combatant),
    };
    const disconnectedCombatAfter = battle.after.depth.combat === null
      ? {
          ...battle.after,
          depth: {
            ...battle.after.depth,
            completedCombats: battle.after.depth.completedCombats.map((combat) => combat.id === forgedCombat.id
              ? forgedCombat
              : combat),
          },
        }
      : { ...battle.after, depth: { ...battle.after.depth, combat: forgedCombat } };
    expect(projectAbilityResonance(battle.before, disconnectedCombatAfter, battle.source)).toBeNull();
  });

  it("rejects reloads, multiple changed abilities, mismatched commands, and malformed packets", () => {
    const initial = createWorld("ability-resonance-adversarial", "campaign:ability-resonance-adversarial");
    const fixture = practiceFixture(
      "ability-resonance-adversarial",
      initial.depth.hero.abilities.map((ability) => resonanceAbility(ability)),
    );
    expect(projectAbilityResonance(fixture.after, fixture.after, fixture.source)).toBeNull();
    const other = fixture.after.depth.hero.abilities.find((ability) => ability.id !== fixture.packet.abilityId);
    if (other === undefined) throw new Error("Adversarial fixture has no second ability");
    const multiple = {
      ...fixture.after,
      depth: {
        ...fixture.after.depth,
        hero: {
          ...fixture.after.depth.hero,
          abilities: fixture.after.depth.hero.abilities.map((ability) => ability.id === other.id
            ? { ...ability, uses: ability.uses + 1 }
            : ability),
        },
      },
    };
    expect(projectAbilityResonance(fixture.before, multiple, fixture.source)).toBeNull();
    expect(projectAbilityResonance(fixture.before, fixture.after, {
      ...fixture.source,
      commandId: `${fixture.source.commandId}:forged`,
    })).toBeNull();
    for (const forged of [
      { ...fixture.packet, experienceDelta: 3 },
      { ...fixture.packet, newAbilityGranted: true },
      { ...fixture.packet, crossingActionLevel: 19 },
      { ...fixture.packet, heroLevelBefore: 2, heroLevelAfter: 1 },
      { ...fixture.packet, damageLevelContributionAfter: 19 },
      { ...fixture.packet, statusPotencyAfter: 99 },
      { ...fixture.packet, inventedBranch: "storm" },
    ]) {
      expect(isAbilityResonancePacketV1(forged)).toBe(false);
    }
  });

  it("does not mutate inputs and emits a deeply frozen JSON-stable packet", () => {
    const fixture = practiceFixture("ability-resonance-immutable");
    const beforeJson = JSON.stringify(fixture.before);
    const afterJson = JSON.stringify(fixture.after);
    const sourceJson = JSON.stringify(fixture.source);
    const first = projectAbilityResonance(fixture.before, fixture.after, fixture.source);
    const second = projectAbilityResonance(fixture.before, fixture.after, fixture.source);
    expect(JSON.stringify(fixture.before)).toBe(beforeJson);
    expect(JSON.stringify(fixture.after)).toBe(afterJson);
    expect(JSON.stringify(fixture.source)).toBe(sourceJson);
    expect(first).toEqual(second);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
  });
});
