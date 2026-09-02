import type { ChronicleEntry, WorldState } from "../core/types";
import { isValidCombatState } from "../depth/combat";
import {
  addItem,
  applyQuestProgressFact,
  applyWeaponUseMastery,
  abilityExperienceFloor,
  describeWeaponUseReceipt,
  equipBestItems,
  generateLoot,
  heroLevelForExperience,
  heroMasteryForExperience,
  recordMonsterVictory,
} from "../depth/rpg";
import { syncActiveCompanionCombat } from "../depth/companion";
import type { AbilityEffect, AbilityKind, AbilityState, CombatState, DepthLogEntry, DetailedHeroState } from "../depth/types";

export type AbilityResonanceSourceKind = "battle-use" | "practice";
export type AbilityResonanceProvenanceStatus = "verified" | "unverified";

export interface AbilityResonancePacketV1 {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly tick: number;
  readonly campaignId: string;
  readonly commandId: string;
  readonly commandType: "combat-action" | "train-ability";
  readonly sourceKind: AbilityResonanceSourceKind;
  readonly heroId: string;
  readonly heroName: string;
  readonly className: string;
  readonly heroLevelBefore: number;
  readonly heroLevelAfter: number;
  readonly location: string;
  readonly abilityId: string;
  readonly abilityName: string;
  readonly abilityKind: AbilityKind;
  readonly effect: AbilityEffect;
  readonly manaCost: number;
  readonly basePotency: number;
  readonly experienceBefore: number;
  readonly experienceDelta: number;
  readonly experienceAfter: number;
  readonly maximumExperience: number;
  readonly usesBefore: number;
  readonly usesAfter: number;
  readonly levelBefore: 19;
  readonly levelAfter: 20;
  readonly crossingActionLevel: 19 | null;
  readonly nextUseLevel: 20;
  readonly damageLevelContributionBefore: 19;
  readonly damageLevelContributionAfter: 20;
  readonly statusPotencyBefore: number | null;
  readonly statusPotencyAfter: number | null;
  readonly provenanceStatus: AbilityResonanceProvenanceStatus;
  readonly sourceMonsterId: string | null;
  readonly sourceMonsterName: string | null;
  readonly discoveryId: string | null;
  readonly discoveryTick: number | null;
  readonly newAbilityGranted: false;
  readonly branchSelected: false;
}

const abilityKinds: readonly AbilityKind[] = ["spell", "technique", "secret"];
const abilityEffects: readonly AbilityEffect[] = ["arcane", "burning", "poison", "weaken", "piercing"];
const retainedCompletedCombats = 4;
const retainedAbilityDiscoveries = 32;
const retainedDepthLogEntries = 128;
const packetKeys = Object.freeze([
  "schemaVersion", "eventId", "tick", "campaignId", "commandId", "commandType", "sourceKind",
  "heroId", "heroName", "className", "heroLevelBefore", "heroLevelAfter", "location",
  "abilityId", "abilityName", "abilityKind", "effect", "manaCost", "basePotency",
  "experienceBefore", "experienceDelta", "experienceAfter", "maximumExperience",
  "usesBefore", "usesAfter", "levelBefore", "levelAfter", "crossingActionLevel", "nextUseLevel",
  "damageLevelContributionBefore", "damageLevelContributionAfter", "statusPotencyBefore", "statusPotencyAfter",
  "provenanceStatus", "sourceMonsterId", "sourceMonsterName", "discoveryId", "discoveryTick",
  "newAbilityGranted", "branchSelected",
] as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function boundedText(value: unknown, maximum = 1_000): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function safeInteger(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((entry, index) => sameValue(entry, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).filter((key) => left[key] !== undefined).sort();
  const rightKeys = Object.keys(right).filter((key) => right[key] !== undefined).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameValue(left[key], right[key]));
}

function freezeCopy<Value>(value: Value): Readonly<Value> {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => freezeCopy(entry))) as unknown as Readonly<Value>;
  }
  if (isRecord(value)) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, freezeCopy(entry)]),
    )) as Readonly<Value>;
  }
  return value;
}

function sameAbilityIdentity(before: AbilityState, after: AbilityState): boolean {
  return before.id === after.id
    && before.name === after.name
    && before.kind === after.kind
    && before.effect === after.effect
    && before.manaCost === after.manaCost
    && before.potency === after.potency
    && before.sourceMonsterId === after.sourceMonsterId;
}

function sourceScene(source: ChronicleEntry) {
  return {
    mode: source.mode,
    location: source.location,
    headline: source.headline,
    action: source.action,
    goal: source.goal,
    consequence: source.consequence,
    sensoryIntensity: source.sensoryIntensity,
  };
}

function safeWorldPair(before: WorldState, after: WorldState, source: ChronicleEntry): boolean {
  return before.campaignId === after.campaignId
    && before.seed === after.seed
    && before.hero.id === after.hero.id
    && before.hero.name === after.hero.name
    && before.depth.hero.id === after.depth.hero.id
    && before.depth.hero.id === before.hero.id
    && after.depth.hero.id === after.hero.id
    && before.depth.hero.name === before.hero.name
    && after.depth.hero.name === after.hero.name
    && before.depth.hero.className === after.depth.hero.className
    && sameValue(after.depth.hero.attributes, before.depth.hero.attributes)
    && before.hero.health === before.depth.hero.resources.health
    && after.hero.health === after.depth.hero.resources.health
    && before.hero.maxHealth === before.depth.hero.resources.maxHealth
    && after.hero.maxHealth === after.depth.hero.resources.maxHealth
    && before.hero.gold === before.depth.hero.gold
    && after.hero.gold === after.depth.hero.gold
    && sameValue(after.hero.values, before.hero.values)
    && before.hero.level === before.depth.hero.level
    && after.hero.level === after.depth.hero.level
    && before.hero.experience === before.depth.hero.experience
    && after.hero.experience === after.depth.hero.experience
    && before.hero.level === heroLevelForExperience(before.hero.experience)
    && after.hero.level === heroLevelForExperience(after.hero.experience)
    && before.hero.mastery === heroMasteryForExperience(before.hero.experience)
    && after.hero.mastery === heroMasteryForExperience(after.hero.experience)
    && after.tick === before.tick + 1
    && before.depth.tick === before.tick
    && after.depth.tick === after.tick
    && source.id === `${after.campaignId}:${after.tick}`
    && source.tick === after.tick
    && (source.commandType === "combat-action" || source.commandType === "train-ability")
    && boundedText(source.commandId, 512)
    && !before.chronicle.some((entry) => entry.id === source.id)
    && after.chronicle.filter((entry) => entry.id === source.id).length === 1
    && sameValue(after.chronicle, [...before.chronicle.slice(-31), source])
    && sameValue(after.chronicle.at(-1), source)
    && sameValue(after.scene, sourceScene(source))
    && sameValue(after.campaignPolicy, before.campaignPolicy)
    && sameValue(after.legacy, before.legacy)
    && sameValue(after.legacyManifestations, before.legacyManifestations)
    && after.depth.schemaVersion === before.depth.schemaVersion
    && after.depth.seed === before.depth.seed
    && sameValue(after.depth.atlas, before.depth.atlas)
    && sameValue(after.depth.towns, before.depth.towns)
    && sameValue(after.depth.dungeon, before.depth.dungeon)
    && sameValue(after.depth.counterDuel, before.depth.counterDuel)
    && sameValue(after.depth.completedCounterDuels, before.depth.completedCounterDuels)
    && sameValue(after.depth.completedQuests, before.depth.completedQuests)
    && after.depth.totalCompletedQuests === before.depth.totalCompletedQuests
    && sameValue(after.depth.pendingQuestReward, before.depth.pendingQuestReward);
}

function validDecisionSource(
  before: WorldState,
  source: ChronicleEntry,
  ability: AbilityState,
  sourceKind: AbilityResonanceSourceKind,
): boolean {
  const trace = source.decisionTrace;
  const considered = source.consideredCommandIds;
  if (trace === undefined
    || trace.actorId !== before.hero.id
    || trace.actorName !== before.hero.name
    || trace.selected.commandId !== source.commandId
    || !Array.isArray(considered)
    || !considered.includes(source.commandId ?? "")
    || !trace.considered.some((entry) => entry.commandId === source.commandId)) return false;
  return sourceKind === "battle-use"
    ? source.mode === "battle"
      && trace.selected.actionLabel === `uses ${ability.name}`
      && boundedText(trace.selected.targetLabel, 160)
    : (source.mode === "training" || source.mode === "discovery")
      && trace.selected.actionLabel === "practices"
      && trace.selected.targetLabel === ability.name
      && source.chosenAction === `practice ${ability.name}`;
}

function validHeroExperienceAward(
  before: WorldState,
  after: WorldState,
  amount: 1 | 8,
): boolean {
  const expectedExperience = Math.min(Number.MAX_SAFE_INTEGER, before.hero.experience + amount);
  return after.hero.experience === expectedExperience
    && after.depth.hero.experience === expectedExperience
    && after.hero.level === heroLevelForExperience(expectedExperience)
    && after.depth.hero.level === after.hero.level
    && after.hero.mastery === heroMasteryForExperience(expectedExperience);
}

function samePracticeState(before: WorldState, after: WorldState, ability: AbilityState): boolean {
  const expectedLog = {
    id: `${before.depth.seed}:depth:${after.depth.tick}:ability`,
    tick: after.depth.tick,
    category: "ability" as const,
    message: `${after.depth.hero.name} practices ${ability.name} and reaches level 20.`,
  };
  return before.depth.combat === null
    && after.depth.combat === null
    && sameValue(after.depth.hero.attributes, before.depth.hero.attributes)
    && sameValue(after.depth.hero.resources, before.depth.hero.resources)
    && sameValue(after.depth.companions, before.depth.companions)
    && sameValue(after.depth.quest, before.depth.quest)
    && sameValue(after.depth.completedCombats, before.depth.completedCombats)
    && sameValue(after.depth.legacyUnratedCombatIds, before.depth.legacyUnratedCombatIds)
    && sameValue(after.depth.hero.inventory, before.depth.hero.inventory)
    && sameValue(after.depth.hero.equipment, before.depth.hero.equipment)
    && sameValue(after.depth.hero.monsterLore, before.depth.hero.monsterLore)
    && sameValue(after.depth.secretDiscoveryOutcomes, before.depth.secretDiscoveryOutcomes)
    && sameValue(after.depth.secretDiscoveryAdmissions, before.depth.secretDiscoveryAdmissions)
    && sameValue(after.depth.discoveries, before.depth.discoveries)
    && after.depth.hero.gold === before.depth.hero.gold
    && sameValue(after.depth.log, [...before.depth.log.slice(-127), expectedLog]);
}

function changedAbilityPair(before: WorldState, after: WorldState): readonly [AbilityState, AbilityState] | null {
  const beforeAbilities = before.depth.hero.abilities;
  const afterAbilities = after.depth.hero.abilities;
  if (beforeAbilities.length !== afterAbilities.length) return null;
  const changed: Array<readonly [AbilityState, AbilityState]> = [];
  for (let index = 0; index < beforeAbilities.length; index += 1) {
    const prior = beforeAbilities[index];
    const next = afterAbilities[index];
    if (prior === undefined || next === undefined || !sameAbilityIdentity(prior, next)) return null;
    if (!sameValue(prior, next)) changed.push([prior, next]);
  }
  return changed.length === 1 ? changed[0] ?? null : null;
}

function resolvedCombatAfter(after: WorldState, combatId: string): CombatState | null {
  const matches = [
    ...(after.depth.combat?.id === combatId ? [after.depth.combat] : []),
    ...after.depth.completedCombats.filter((combat) => combat.id === combatId),
  ];
  return matches.length === 1 ? matches[0] ?? null : null;
}

function withResolvedHero(
  hero: DetailedHeroState,
  resolved: CombatState,
): DetailedHeroState | null {
  const combatHeroes = resolved.combatants.filter((entry) => entry.id === hero.id);
  const combatHero = combatHeroes[0];
  if (combatHeroes.length !== 1 || combatHero === undefined) return null;
  return {
    ...hero,
    resources: { ...hero.resources, health: combatHero.health, mana: combatHero.mana },
    abilities: combatHero.abilities,
  };
}

function appendExpectedLog(
  log: readonly DepthLogEntry[],
  seed: string,
  tick: number,
  category: DepthLogEntry["category"],
  message: string,
): readonly DepthLogEntry[] {
  const entry: DepthLogEntry = {
    id: `${seed}:depth:${tick}:${category}`,
    tick,
    category,
    message,
  };
  return [...log.slice(-(retainedDepthLogEntries - 1)), entry];
}

function validOngoingBattleTransition(
  before: WorldState,
  after: WorldState,
  resolved: CombatState,
): boolean {
  const expectedHero = withResolvedHero(before.depth.hero, resolved);
  if (expectedHero === null) return false;
  const companionParticipated = before.depth.companions.active.some((companion) =>
    resolved.combatants.some((combatant) => combatant.id === companion.identity.residentId)
  );
  const expectedCompanions = companionParticipated
    ? syncActiveCompanionCombat(before.depth.companions, resolved.combatants, resolved.outcome)
    : before.depth.companions;
  const expectedLog = appendExpectedLog(
    before.depth.log,
    before.depth.seed,
    after.depth.tick,
    "combat",
    resolved.log.at(-1)?.message ?? "The battle continues.",
  );
  return resolved.outcome === "ongoing"
    && sameValue(after.depth.combat, resolved)
    && sameValue(after.depth.completedCombats, before.depth.completedCombats)
    && sameValue(after.depth.legacyUnratedCombatIds, before.depth.legacyUnratedCombatIds)
    && sameValue(after.depth.companions, expectedCompanions)
    && sameValue(after.depth.quest, before.depth.quest)
    && sameValue(after.depth.secretDiscoveryOutcomes, before.depth.secretDiscoveryOutcomes)
    && sameValue(after.depth.secretDiscoveryAdmissions, before.depth.secretDiscoveryAdmissions)
    && sameValue(after.depth.discoveries, before.depth.discoveries)
    && sameValue(after.depth.hero.inventory, expectedHero.inventory)
    && sameValue(after.depth.hero.equipment, expectedHero.equipment)
    && sameValue(after.depth.hero.monsterLore, expectedHero.monsterLore)
    && sameValue(after.depth.log, expectedLog)
    && after.depth.hero.gold === before.depth.hero.gold;
}

function validTerminalBattleTransition(
  before: WorldState,
  after: WorldState,
  resolved: CombatState,
): boolean {
  if (resolved.outcome === "ongoing" || after.depth.combat !== null) return false;
  let expectedHero = withResolvedHero(before.depth.hero, resolved);
  if (expectedHero === null) return false;
  let masteryMessage: string | null = null;
  if (resolved.weaponUse.tracking === "tracked" && resolved.weaponUse.basicStrikes > 0) {
    const trackedUse = resolved.weaponUse;
    const weapon = expectedHero.inventory.find((item) => item.id === trackedUse.weaponId);
    if (weapon === undefined) return false;
    try {
      const mastery = applyWeaponUseMastery(weapon, resolved, before.depth.tick + 1);
      if (mastery.receipt !== null) {
        expectedHero = {
          ...expectedHero,
          inventory: expectedHero.inventory.map((item) => item.id === weapon.id ? mastery.item : item),
        };
        masteryMessage = `${describeWeaponUseReceipt(weapon.name, mastery.receipt)}.`;
      }
    } catch {
      return false;
    }
  }
  const expectedCompleted = [
    ...before.depth.completedCombats.slice(-(retainedCompletedCombats - 1)),
    resolved,
  ];
  const retainedCombatIds = new Set(expectedCompleted.map((entry) => entry.id));
  const expectedLegacyUnrated = before.depth.legacyUnratedCombatIds.filter((id) => retainedCombatIds.has(id));
  let expectedQuest = resolved.outcome === "victory"
    ? applyQuestProgressFact(before.depth.quest, {
        schemaVersion: 1,
        kind: "combat-won",
        combatId: resolved.id,
        defeatedSpeciesIds: [...new Set(resolved.combatants.flatMap((combatant) =>
          combatant.speciesId === null ? [] : [combatant.speciesId]
        ))],
      })
    : before.depth.quest;
  const inventoryBeforeLoot = expectedHero.inventory.length;
  const loot = generateLoot(before.depth.seed, resolved.id);
  if (resolved.outcome === "victory" && !expectedHero.inventory.some((item) => item.id === loot.id)) {
    try {
      expectedHero = equipBestItems(addItem(expectedHero, loot));
    } catch {
      return false;
    }
  }
  if (expectedHero.inventory.length > inventoryBeforeLoot) {
    expectedQuest = applyQuestProgressFact(expectedQuest, {
      schemaVersion: 1,
      kind: "item-acquired",
      itemId: loot.id,
      sourceId: resolved.id,
      disposition: "inventory",
    });
  }
  const learning = resolved.outcome === "victory"
    ? recordMonsterVictory(expectedHero, resolved.combatants)
    : { hero: expectedHero, learned: [], outcomes: [] };
  expectedHero = learning.hero;
  const newSecretOutcomes = learning.outcomes.map((entry) => ({
    id: `${before.depth.seed}:secret-outcome:${entry.monsterId}`,
    recordedTick: before.depth.tick + 1,
    thresholdTick: before.depth.tick + 1,
    sourceCombatId: resolved.id,
    monsterId: entry.monsterId,
    monsterName: entry.monsterName,
    abilityId: entry.ability.id,
    abilityName: entry.ability.name,
    mechanics: {
      effect: entry.ability.effect,
      manaCost: entry.ability.manaCost,
      potency: entry.ability.potency,
    },
    disposition: entry.disposition,
    reason: entry.reason,
    repertoireCount: entry.repertoireCount,
    repertoireLimit: entry.repertoireLimit,
  }));
  const learnedOutcomes = newSecretOutcomes.filter((entry) => entry.disposition === "learned");
  const newDiscoveries = learnedOutcomes.map((entry) => ({
    id: `${before.depth.seed}:discovery:${entry.abilityId}:${before.depth.tick + 1}`,
    tick: before.depth.tick + 1,
    abilityId: entry.abilityId,
    abilityName: entry.abilityName,
    monsterId: entry.monsterId,
    monsterName: entry.monsterName,
  }));
  const newSecretAdmissions = learnedOutcomes.map((entry, index) => {
    const discovery = newDiscoveries[index];
    if (discovery === undefined) throw new Error("Secret admission lost its discovery");
    return {
      id: `${entry.id}:admission:${discovery.id}`,
      tick: before.depth.tick + 1,
      outcomeId: entry.id,
      discoveryId: discovery.id,
    };
  });
  const expectedSecretOutcomes = [...before.depth.secretDiscoveryOutcomes, ...newSecretOutcomes];
  const expectedSecretAdmissions = [...before.depth.secretDiscoveryAdmissions, ...newSecretAdmissions];
  const expectedDiscoveries = [...before.depth.discoveries, ...newDiscoveries].slice(-retainedAbilityDiscoveries);
  const companionParticipated = before.depth.companions.active.some((companion) =>
    resolved.combatants.some((combatant) => combatant.id === companion.identity.residentId)
  );
  const expectedCompanions = companionParticipated
    ? syncActiveCompanionCombat(before.depth.companions, resolved.combatants, resolved.outcome)
    : before.depth.companions;
  let expectedLog = appendExpectedLog(
    before.depth.log,
    before.depth.seed,
    after.depth.tick,
    "combat",
    `The battle ends in ${resolved.outcome}.`,
  );
  if (masteryMessage !== null) {
    expectedLog = appendExpectedLog(expectedLog, before.depth.seed, after.depth.tick, "item", masteryMessage);
  }
  const abilityMessages: string[] = [];
  if (newDiscoveries.length > 0) {
    abilityMessages.push(`${expectedHero.name} learns ${newDiscoveries.map((entry) => entry.abilityName).join(" and ")} from the defeated monsters.`);
  }
  const held = newSecretOutcomes.filter((entry) => entry.disposition === "deferred-capacity");
  if (held.length > 0) {
    abilityMessages.push(`${expectedHero.name} understands ${held.map((entry) => entry.abilityName).join(" and ")}, but holds the ${held.length === 1 ? "pattern" : "patterns"}: repertoire full ${held[0]?.repertoireCount}/${held[0]?.repertoireLimit}.`);
  }
  const rejected = newSecretOutcomes.filter((entry) => entry.disposition === "rejected");
  if (rejected.length > 0) {
    abilityMessages.push(`${rejected.map((entry) => entry.abilityName).join(" and ")} cannot enter the repertoire because an ability identity conflicts.`);
  }
  if (abilityMessages.length > 0) {
    expectedLog = appendExpectedLog(
      expectedLog,
      before.depth.seed,
      after.depth.tick,
      "ability",
      abilityMessages.join(" "),
    );
  }
  return sameValue(after.depth.completedCombats, expectedCompleted)
    && sameValue(after.depth.legacyUnratedCombatIds, expectedLegacyUnrated)
    && sameValue(after.depth.companions, expectedCompanions)
    && sameValue(after.depth.quest, expectedQuest)
    && sameValue(after.depth.secretDiscoveryOutcomes, expectedSecretOutcomes)
    && sameValue(after.depth.secretDiscoveryAdmissions, expectedSecretAdmissions)
    && sameValue(after.depth.discoveries, expectedDiscoveries)
    && sameValue(after.depth.hero.inventory, expectedHero.inventory)
    && sameValue(after.depth.hero.equipment, expectedHero.equipment)
    && sameValue(after.depth.hero.monsterLore, expectedHero.monsterLore)
    && sameValue(after.depth.log, expectedLog)
    && after.depth.hero.gold === Math.min(
      Number.MAX_SAFE_INTEGER,
      before.depth.hero.gold + (resolved.outcome === "victory" ? 5 : 0),
    );
}

function validBattleSource(
  before: WorldState,
  after: WorldState,
  source: ChronicleEntry,
  abilityBefore: AbilityState,
  abilityAfter: AbilityState,
): boolean {
  const combat = before.depth.combat;
  if (combat === null || combat.outcome !== "ongoing" || !isValidCombatState(combat)) return false;
  const actorId = combat.turnOrder[combat.activeIndex];
  const actor = combat.combatants.find((entry) => entry.id === actorId);
  const actorAbility = actor?.abilities.find((entry) => entry.id === abilityBefore.id);
  if (actor?.id !== before.hero.id || actorAbility === undefined || !sameValue(actorAbility, abilityBefore)) return false;
  const resolved = resolvedCombatAfter(after, combat.id);
  if (resolved === null || resolved.turn !== combat.turn + 1 || !isValidCombatState(resolved)) return false;
  const resolvedActor = resolved.combatants.filter((entry) => entry.id === before.hero.id);
  const resolvedAbility = resolvedActor[0]?.abilities.find((entry) => entry.id === abilityAfter.id);
  if (resolvedActor.length !== 1 || resolvedAbility === undefined || !sameValue(resolvedAbility, abilityAfter)) return false;
  if (after.depth.hero.resources.health !== resolvedActor[0]?.health
    || after.depth.hero.resources.mana !== resolvedActor[0]?.mana
    || !(resolved.outcome === "ongoing"
      ? validOngoingBattleTransition(before, after, resolved)
      : validTerminalBattleTransition(before, after, resolved))) return false;
  const intents = resolved.eventStream.events.filter((event) =>
    event.turn === resolved.turn
      && event.kind === "intent"
      && event.actorId === before.hero.id
      && event.action === "ability"
      && event.abilityId === abilityBefore.id
  );
  const intent = intents[0];
  if (intents.length !== 1 || intent === undefined || intent.targetId === null) return false;
  const expectedCommandId = `${before.campaignId}:depth:${before.depth.tick + 1}:combat:${combat.id}:${combat.turn}:${before.hero.id}:ability:${abilityBefore.id}:${intent.targetId}`;
  if (source.commandId !== expectedCommandId) return false;
  const manaEvents = resolved.eventStream.events.filter((event) =>
    event.turn === resolved.turn
      && event.kind === "mana-spent"
      && event.actorId === before.hero.id
      && event.abilityId === abilityBefore.id
  );
  const damageEvents = resolved.eventStream.events.filter((event) =>
    event.turn === resolved.turn
      && event.kind === "damage"
      && event.actorId === before.hero.id
      && event.abilityId === abilityBefore.id
  );
  const mana = manaEvents[0];
  const damage = damageEvents[0];
  return manaEvents.length === 1
    && damageEvents.length === 1
    && mana?.kind === "mana-spent"
    && mana.amount === abilityBefore.manaCost
    && damage !== undefined
    && damage.targetId === intent.targetId
    && validDecisionSource(before, source, abilityBefore, "battle-use");
}

function provenanceFacts(
  state: WorldState,
  ability: AbilityState,
): Pick<AbilityResonancePacketV1, "provenanceStatus" | "sourceMonsterId" | "sourceMonsterName" | "discoveryId" | "discoveryTick"> {
  if (ability.kind !== "secret") {
    return {
      provenanceStatus: "unverified",
      sourceMonsterId: null,
      sourceMonsterName: null,
      discoveryId: null,
      discoveryTick: null,
    };
  }
  const loreMatches = ability.sourceMonsterId === null
    ? []
    : state.depth.hero.monsterLore.filter((entry) =>
        entry.learned
          && entry.monsterId === ability.sourceMonsterId
          && entry.secretTechniqueId === ability.id
          && entry.secretTechniqueName === ability.name
      );
  if (loreMatches.length > 1) throw new TypeError("Ability resonance provenance is ambiguous");
  const lore = loreMatches[0];
  const outcomeMatches = lore === undefined
    ? []
    : state.depth.secretDiscoveryOutcomes.filter((entry) =>
        entry.monsterId === lore.monsterId
          && entry.monsterName === lore.monsterName
          && entry.abilityId === ability.id
          && entry.abilityName === ability.name
          && entry.disposition !== "rejected"
      );
  if (outcomeMatches.length > 1) throw new TypeError("Ability resonance outcome provenance is ambiguous");
  const outcome = outcomeMatches[0];
  const admissionMatches = outcome === undefined
    ? []
    : state.depth.secretDiscoveryAdmissions.filter((entry) => entry.outcomeId === outcome.id);
  if (admissionMatches.length > 1) throw new TypeError("Ability resonance admission provenance is ambiguous");
  const admission = admissionMatches[0];
  const discoveryMatches = lore === undefined || admission === undefined
    ? []
    : state.depth.discoveries.filter((entry) =>
        entry.id === admission.discoveryId
          && entry.abilityId === ability.id
          && entry.abilityName === ability.name
          && entry.monsterId === lore.monsterId
          && entry.monsterName === lore.monsterName
      );
  if (discoveryMatches.length > 1) throw new TypeError("Ability resonance discovery provenance is ambiguous");
  const discovery = discoveryMatches[0];
  if (lore === undefined || outcome === undefined || admission === undefined || discovery === undefined) {
    return {
      provenanceStatus: "unverified",
      sourceMonsterId: ability.sourceMonsterId,
      sourceMonsterName: null,
      discoveryId: null,
      discoveryTick: null,
    };
  }
  return {
    provenanceStatus: "verified",
    sourceMonsterId: lore.monsterId,
    sourceMonsterName: lore.monsterName,
    discoveryId: discovery.id,
    discoveryTick: discovery.tick,
  };
}

function statusPotency(effect: AbilityEffect, level: 19 | 20): number | null {
  const base = 1 + Math.floor(level / 5);
  if (effect === "poison") return base;
  if (effect === "burning" || effect === "weaken") return base + 1;
  return null;
}

export function isAbilityResonancePacketV1(value: unknown): value is AbilityResonancePacketV1 {
  if (!isRecord(value) || !exactKeys(value, packetKeys)) return false;
  const maximumExperience = abilityExperienceFloor(20);
  const battle = value.sourceKind === "battle-use";
  const practice = value.sourceKind === "practice";
  if (value.schemaVersion !== 1
    || !boundedText(value.eventId, 512)
    || !safeInteger(value.tick)
    || !boundedText(value.campaignId, 256)
    || !boundedText(value.commandId, 512)
    || !boundedText(value.heroId, 512)
    || !boundedText(value.heroName, 160)
    || !boundedText(value.className, 160)
    || !safeInteger(value.heroLevelBefore, 1, 1_000)
    || !safeInteger(value.heroLevelAfter, 1, 1_000)
    || Number(value.heroLevelAfter) < Number(value.heroLevelBefore)
    || Number(value.heroLevelAfter) > Number(value.heroLevelBefore) + 1
    || !boundedText(value.location)
    || !boundedText(value.abilityId, 512)
    || !boundedText(value.abilityName, 160)
    || !abilityKinds.includes(value.abilityKind as AbilityKind)
    || !abilityEffects.includes(value.effect as AbilityEffect)
    || !safeInteger(value.manaCost)
    || !safeInteger(value.basePotency)
    || !safeInteger(value.experienceBefore, abilityExperienceFloor(19), maximumExperience - 1)
    || !safeInteger(value.experienceDelta, 1, 3)
    || value.experienceAfter !== maximumExperience
    || value.maximumExperience !== maximumExperience
    || !safeInteger(value.usesBefore)
    || !safeInteger(value.usesAfter)
    || value.levelBefore !== 19
    || value.levelAfter !== 20
    || value.nextUseLevel !== 20
    || value.damageLevelContributionBefore !== 19
    || value.damageLevelContributionAfter !== 20
    || value.newAbilityGranted !== false
    || value.branchSelected !== false
    || (!battle && !practice)) return false;
  const expectedDelta = Math.min(battle ? 2 : 3, maximumExperience - Number(value.experienceBefore));
  const provenanceStatus = value.provenanceStatus;
  const nonSecret = value.abilityKind !== "secret";
  const verified = provenanceStatus === "verified";
  const unverified = provenanceStatus === "unverified";
  const validProvenance = nonSecret
    ? provenanceStatus === "unverified"
      && value.sourceMonsterId === null
      && value.sourceMonsterName === null
      && value.discoveryId === null
      && value.discoveryTick === null
    : (verified
      ? boundedText(value.sourceMonsterId, 512)
        && boundedText(value.sourceMonsterName, 160)
        && boundedText(value.discoveryId, 512)
        && safeInteger(value.discoveryTick)
      : unverified
        && (value.sourceMonsterId === null || boundedText(value.sourceMonsterId, 512))
        && value.sourceMonsterName === null
        && value.discoveryId === null
        && value.discoveryTick === null);
  const expectedStatusBefore = statusPotency(value.effect as AbilityEffect, 19);
  const expectedStatusAfter = statusPotency(value.effect as AbilityEffect, 20);
  return value.eventId === `${value.campaignId}:${value.tick}`
    && value.experienceBefore + value.experienceDelta === value.experienceAfter
    && value.experienceDelta === expectedDelta
    && (battle
      ? value.commandType === "combat-action"
        && value.usesAfter === Number(value.usesBefore) + 1
        && value.crossingActionLevel === 19
      : value.commandType === "train-ability"
        && value.usesAfter === value.usesBefore
        && value.crossingActionLevel === null)
    && value.statusPotencyBefore === expectedStatusBefore
    && value.statusPotencyAfter === expectedStatusAfter
    && (!verified || Number(value.discoveryTick) <= Number(value.tick))
    && validProvenance;
}

export function projectAbilityResonance(
  before: WorldState,
  after: WorldState,
  source: ChronicleEntry,
): AbilityResonancePacketV1 | null {
  if (!safeWorldPair(before, after, source)) return null;
  const commandId = source.commandId;
  const commandType = source.commandType;
  if (commandId === undefined || (commandType !== "combat-action" && commandType !== "train-ability")) return null;
  const changed = changedAbilityPair(before, after);
  if (changed === null) return null;
  const [prior, next] = changed;
  const maximumExperience = abilityExperienceFloor(20);
  if (prior.level !== 19
    || next.level !== 20
    || prior.experience >= maximumExperience
    || next.experience !== maximumExperience
    || !sameAbilityIdentity(prior, next)) return null;
  const battle = commandType === "combat-action";
  const expectedExperience = Math.min(maximumExperience, prior.experience + (battle ? 2 : 3));
  const expectedUses = prior.uses + (battle ? 1 : 0);
  if (next.experience !== expectedExperience
    || next.uses !== expectedUses
    || !validHeroExperienceAward(before, after, battle ? 8 : 1)
    || (battle
      ? !validBattleSource(before, after, source, prior, next)
      : commandId !== `${before.campaignId}:depth:${before.depth.tick + 1}:train:${prior.id}`
        || !validDecisionSource(before, source, prior, "practice")
        || !samePracticeState(before, after, next))) return null;
  let provenance: ReturnType<typeof provenanceFacts>;
  try {
    provenance = provenanceFacts(after, next);
  } catch {
    return null;
  }
  const packet: AbilityResonancePacketV1 = {
    schemaVersion: 1,
    eventId: source.id,
    tick: source.tick,
    campaignId: after.campaignId,
    commandId,
    commandType,
    sourceKind: battle ? "battle-use" : "practice",
    heroId: after.hero.id,
    heroName: after.hero.name,
    className: after.depth.hero.className,
    heroLevelBefore: before.hero.level,
    heroLevelAfter: after.hero.level,
    location: source.location,
    abilityId: next.id,
    abilityName: next.name,
    abilityKind: next.kind,
    effect: next.effect,
    manaCost: next.manaCost,
    basePotency: next.potency,
    experienceBefore: prior.experience,
    experienceDelta: next.experience - prior.experience,
    experienceAfter: next.experience,
    maximumExperience,
    usesBefore: prior.uses,
    usesAfter: next.uses,
    levelBefore: 19,
    levelAfter: 20,
    crossingActionLevel: battle ? 19 : null,
    nextUseLevel: 20,
    damageLevelContributionBefore: 19,
    damageLevelContributionAfter: 20,
    statusPotencyBefore: statusPotency(next.effect, 19),
    statusPotencyAfter: statusPotency(next.effect, 20),
    ...provenance,
    newAbilityGranted: false,
    branchSelected: false,
  };
  return isAbilityResonancePacketV1(packet) ? freezeCopy(packet) : null;
}
