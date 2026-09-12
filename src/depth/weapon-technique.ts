import { abilityExperienceFloor, abilityLevelForExperience, createHero, isValidItemState, maximumAbilities } from "./rpg";
import { selectPaidInnRest } from "./town-rest";
import type { AbilityState, CombatState, DepthCommand, DepthState, ItemState, WeaponUseReceipt } from "./types";

export const turningCheckAbilityId = "technique:turning-check";
export const weaponTechniqueCertificationRulesVersion = "weapon-technique-certification-v1";

export interface WeaponTechniqueCertification {
  readonly schemaVersion: 1;
  readonly rulesVersion: typeof weaponTechniqueCertificationRulesVersion;
  readonly heroId: string;
  readonly locationId: string;
  readonly townId: string;
  readonly townName: string;
  /** Exact owned weapon and its bounded effective-use history at certification. */
  readonly weapon: ItemState;
  readonly sourceUseReceipt: WeaponUseReceipt;
  /** The original learned template, not mutable later ability mastery. */
  readonly ability: AbilityState;
  readonly tick: number;
  readonly sourceCommandId: string;
}
type CertificationCommand = Extract<DepthCommand, { type: "certify-weapon-technique" }>;
const certificationKeys = ["schemaVersion", "rulesVersion", "heroId", "locationId", "townId", "townName", "weapon", "sourceUseReceipt", "ability", "tick", "sourceCommandId"];

export function createTurningCheck(): AbilityState {
  return { id: turningCheckAbilityId, name: "Turning Check", kind: "technique", effect: "weaken",
    manaCost: 2, potency: 2, damageRule: "weapon-check-half-v1", level: 1, experience: 0, uses: 0, sourceMonsterId: null };
}
function integer(value: unknown, minimum = 0): value is number { return Number.isSafeInteger(value) && (value as number) >= minimum; }
function keys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}
function same(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left)) return Array.isArray(right) && left.length === right.length && left.every((value, index) => same(value, right[index]));
  return right !== null && typeof right === "object" && !Array.isArray(right) && keys(left, Object.keys(right))
    && Object.entries(right).every(([key, value]) => same(left[key], value));
}
function canonicalBlade(state: DepthState, item: unknown): item is ItemState {
  if (!isValidItemState(item) || item.id !== `${state.hero.id}:item:roadblade` || item.useMastery === null) return false;
  const original = createHero(state.seed, state.hero.id).inventory[0]!;
  return same(item, { ...original, useMastery: item.useMastery });
}
function quietTown(state: DepthState): boolean {
  return state.hero.resources.health > 0 && state.hero.resources.health * 2 > state.hero.resources.maxHealth
    && state.companions.active.length === 0 && state.atlas.route === null && state.combat === null && state.counterDuel === null
    && (state.dungeon === null || state.dungeon.completed) && state.repartee.active === null
    && (state.bellExpedition === null || state.bellExpedition.completion !== null)
    && (state.usefulReply === null || state.usefulReply.reply !== null)
    && (state.roomChallenge === null || state.roomChallenge.result !== null)
    && (state.companionReunion === null || state.companionReunion.completed !== null)
    && (state.companionCredit == null || state.companionCredit.exchange !== null)
    && (state.pennywiseGate == null || state.pennywiseGate.completion !== null)
    && (state.smithyJob == null || state.smithyJob.completion !== null)
    && (state.innBluff == null || state.innBluff.resolution !== null)
    && (state.roadSupper?.meal == null || state.roadSupper.terminal !== null)
    && state.quest.status === "active" && state.pendingQuestReward === null;
}
function venue(state: DepthState, locationId: string) {
  const town = state.towns[locationId];
  if (town === undefined || town.locationId !== locationId || town.visits < 1
    || !state.atlas.discoveredLocationIds.includes(locationId)
    || !state.atlas.locations.some(location => location.id === locationId && location.kind === "town")) return null;
  return { locationId, townId: town.id, townName: town.name };
}
function retainedCombats(state: DepthState): readonly CombatState[] {
  return [...state.completedCombats, ...(state.combat === null ? [] : [state.combat]),
    ...[state.roadSupper?.terminal?.combat, state.dungeon?.lair?.encounter?.resolution?.combat,
      state.companionCredit?.evidence.combat].filter((combat): combat is CombatState => combat !== undefined)];
}
/** Training adds three XP; an actual use adds two. No replay or mutable-cache shortcut. */
function validLearnedAbility(value: unknown, elapsedTicks: number): value is AbilityState {
  const template = createTurningCheck(), cap = abilityExperienceFloor(20);
  if (!keys(value, Object.keys(template)) || !integer(value.experience) || value.experience > cap
    || !integer(value.uses) || value.uses > elapsedTicks || value.experience > Math.min(cap, elapsedTicks * 3)) return false;
  const useExperience = Math.min(cap, value.uses * 2);
  if (value.experience < useExperience || value.experience < cap && (value.experience - useExperience) % 3 !== 0) return false;
  return same(value, { ...template, experience: value.experience, uses: value.uses, level: abilityLevelForExperience(value.experience) });
}

/** Compare every available copy of the original item history. Generic battle IDs
 * can recur; only timestamped battle archives identify the exact old resolution. */
function retainedSourceMatches(state: DepthState, certification: WeaponTechniqueCertification): boolean {
  const snapshot = certification.weapon, receipts = snapshot.useMastery!.receipts;
  const current = state.hero.inventory.find(item => item.id === snapshot.id);
  if (current !== undefined && (!canonicalBlade(state, current) || current.useMastery!.receipts.length < receipts.length)) return false;
  const retainedItems = [current, state.spareGearTrade?.keptWeapon, state.spareGearTrade?.soldItem]
    .filter((item): item is ItemState => item !== undefined && item.id === snapshot.id);
  for (const item of retainedItems) {
    if (!canonicalBlade(state, item) || !receipts.slice(0, item.useMastery!.receipts.length)
      .every((receipt, index) => same(receipt, item.useMastery!.receipts[index]))) return false;
  }
  const archives = [state.roadSupper?.terminal, state.dungeon?.lair?.encounter?.resolution, state.companionCredit?.evidence];
  for (const source of receipts) {
    for (const archive of archives) {
      if (archive === undefined || archive === null || archive.tick !== source.resolvedTick || archive.combat.id !== source.combatId) continue;
      const battle = archive.combat, tracked = battle.weaponUse;
      if (tracked.tracking !== "tracked" || tracked.heroId !== certification.heroId || tracked.weaponId !== snapshot.id
        || tracked.basicStrikes !== source.basicStrikes || tracked.damage !== source.damage || battle.outcome !== source.outcome) return false;
    }
  }
  return true;
}

export function weaponTechniqueCertificationCommandId(tick: number, command: CertificationCommand): string {
  return `depth:${tick}:certify-weapon-technique:${command.weaponId}:${command.receiptId}`;
}

export function selectWeaponTechniqueCertification(state: DepthState): WeaponTechniqueCertification | null {
  try {
    if (Object.hasOwn(state, "weaponTechniqueCertification") || !integer(state.tick, 1) || state.tick >= Number.MAX_SAFE_INTEGER
      || state.tick % 29 !== 0 || !quietTown(state) || selectPaidInnRest(state) !== null
      || state.discoveries.at(-1)?.tick === state.tick || state.hero.abilities.length >= maximumAbilities
      || state.hero.abilities.some(ability => ability.id === turningCheckAbilityId || ability.effect === "weaken")) return null;
    const place = venue(state, state.atlas.currentLocationId), weapon = state.hero.inventory.find(item => item.id === state.hero.equipment.weapon);
    if (place === null || !canonicalBlade(state, weapon) || weapon.useMastery!.level < 2
      || weapon.useMastery!.receipts.length === 0 || weapon.useMastery!.receipts.some(receipt => receipt.resolvedTick >= state.tick + 1)) return null;
    const sourceUseReceipt = weapon.useMastery!.receipts[0]!, tick = state.tick + 1;
    if (!integer(sourceUseReceipt.resolvedTick, 1)) return null;
    const certification: WeaponTechniqueCertification = { schemaVersion: 1, rulesVersion: weaponTechniqueCertificationRulesVersion,
      heroId: state.hero.id, ...place, weapon: structuredClone(weapon), sourceUseReceipt: { ...sourceUseReceipt },
      ability: createTurningCheck(), tick,
      sourceCommandId: weaponTechniqueCertificationCommandId(tick, { type: "certify-weapon-technique", weaponId: weapon.id, receiptId: sourceUseReceipt.id }) };
    return retainedSourceMatches(state, certification) ? certification : null;
  } catch { return null; }
}

export function isValidCampaignWeaponTechniqueCertification(state: DepthState): boolean {
  try {
    if (!Object.hasOwn(state, "weaponTechniqueCertification")) {
      return !state.hero.abilities.some(ability => ability.id === turningCheckAbilityId)
        && !retainedCombats(state).some(combat => combat.combatants.some(actor => actor.abilities.some(ability => ability.id === turningCheckAbilityId)));
    }
    const value: unknown = state.weaponTechniqueCertification;
    if (!keys(value, certificationKeys) || value.schemaVersion !== 1 || value.rulesVersion !== weaponTechniqueCertificationRulesVersion) return false;
    const certification = value as unknown as WeaponTechniqueCertification;
    if (certification.heroId !== state.hero.id || !integer(certification.tick, 2) || certification.tick > state.tick
      || (certification.tick - 1) % 29 !== 0 || !canonicalBlade(state, certification.weapon)
      || certification.weapon.useMastery!.level < 2 || certification.weapon.useMastery!.receipts.length === 0
      || certification.weapon.useMastery!.receipts.some(receipt => receipt.resolvedTick >= certification.tick)
      || !same(certification.sourceUseReceipt, certification.weapon.useMastery!.receipts[0])
      || !integer(certification.sourceUseReceipt.resolvedTick, 1) || !same(certification.ability, createTurningCheck())
      || certification.sourceCommandId !== weaponTechniqueCertificationCommandId(certification.tick,
        { type: "certify-weapon-technique", weaponId: certification.weapon.id, receiptId: certification.sourceUseReceipt.id })) return false;
    const place = venue(state, certification.locationId);
    if (place === null || !Object.entries(place).every(([key, value]) => certification[key as keyof WeaponTechniqueCertification] === value)
      || !retainedSourceMatches(state, certification)) return false;
    const learned = state.hero.abilities.filter(ability => ability.id === turningCheckAbilityId);
    if (learned.length !== 1 || !validLearnedAbility(learned[0], state.tick - certification.tick)) return false;
    const currentAbility = learned[0]!;
    if (state.combat !== null) {
      const actor = state.combat.combatants.find(combatant => combatant.id === certification.heroId && combatant.side === "heroes");
      if (actor === undefined || !same(actor.abilities.find(ability => ability.id === turningCheckAbilityId), currentAbility)) return false;
    }
    for (const combat of retainedCombats(state)) {
      for (const actor of combat.combatants) {
        const abilities = actor.abilities.filter(ability => ability.id === turningCheckAbilityId);
        if (abilities.length > 1 || abilities.length > 0 && (actor.id !== certification.heroId || actor.side !== "heroes"
          || !validLearnedAbility(abilities[0], state.tick - certification.tick)
          || abilities[0]!.experience > currentAbility.experience || abilities[0]!.uses > currentAbility.uses)) return false;
      }
    }
    if (certification.tick !== state.tick) return true;
    return quietTown(state) && selectPaidInnRest(state) === null && state.atlas.currentLocationId === certification.locationId
      && state.hero.equipment.weapon === certification.weapon.id
      && same(state.hero.inventory.find(item => item.id === certification.weapon.id), certification.weapon)
      && same(learned[0], certification.ability)
      && !state.hero.abilities.some(ability => ability.id !== turningCheckAbilityId && ability.effect === "weaken");
  } catch { return false; }
}

export function stepWeaponTechniqueCertification(state: DepthState, command: CertificationCommand): {
  hero: DepthState["hero"]; weaponTechniqueCertification: WeaponTechniqueCertification;
} {
  const certification = selectWeaponTechniqueCertification(state);
  if (certification === null || command.weaponId !== certification.weapon.id || command.receiptId !== certification.sourceUseReceipt.id) {
    throw new Error("No matching earned weapon technique certification is available");
  }
  return { hero: { ...state.hero, abilities: [...state.hero.abilities, certification.ability] }, weaponTechniqueCertification: certification };
}
