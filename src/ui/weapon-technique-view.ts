import type { WorldState } from "../core/types";
import type { WeaponUseReceipt } from "../depth/types";
import { isValidCampaignWeaponTechniqueCertification } from "../depth/weapon-technique";

export const weaponTechniqueEffectLabel = "Half damage · Weakened (2)";
const damageExplanation = "Glancing strike: half direct damage after armor and before Guard (minimum 1). Applies Weakened (2), softening the next retaliation.";

export interface WeaponTechniqueProvenanceView {
  readonly abilityId: string;
  readonly abilityName: string;
  readonly effect: "weaken";
  readonly damageRule: "weapon-check-half-v1";
  readonly damageExplanation: string;
  readonly initialManaCost: number;
  readonly initialPotency: number;
  readonly weaponId: string;
  readonly weaponName: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly learningTick: number;
  readonly learningCommandId: string;
  readonly sourceUse: Readonly<WeaponUseReceipt>;
}

export interface WeaponTechniqueSceneView extends WeaponTechniqueProvenanceView {
  readonly phase: "certified";
  readonly commandId: string;
  readonly tick: number;
  readonly heroId: string;
  readonly headline: string;
  readonly detail: string;
}

/** A learned movement belongs to the hero, even after the source weapon is
 * replaced. The retained certification proves its original use and lesson. */
export function projectWeaponTechniqueProvenance(world: WorldState, abilityId: string): WeaponTechniqueProvenanceView | null {
  const state = world.depth, receipt = state.weaponTechniqueCertification;
  if (receipt == null || !isValidCampaignWeaponTechniqueCertification(state)
    || world.tick !== state.tick || world.hero.id !== `hero:${world.campaignId}`
    || world.hero.id !== state.hero.id || receipt.heroId !== state.hero.id
    || receipt.ability.id !== abilityId || receipt.ability.effect !== "weaken"
    || receipt.ability.damageRule !== "weapon-check-half-v1"
    || !state.hero.abilities.some(ability => ability.id === abilityId)) return null;
  const location = state.atlas.locations.find(entry => entry.id === receipt.locationId && entry.kind === "town");
  if (location === undefined) return null;
  return Object.freeze({ abilityId: receipt.ability.id, abilityName: receipt.ability.name,
    effect: "weaken", damageRule: "weapon-check-half-v1", damageExplanation,
    initialManaCost: receipt.ability.manaCost, initialPotency: receipt.ability.potency,
    weaponId: receipt.weapon.id, weaponName: receipt.weapon.name,
    locationId: location.id, locationName: location.name,
    learningTick: receipt.tick, learningCommandId: receipt.sourceCommandId,
    sourceUse: Object.freeze({ ...receipt.sourceUseReceipt }) });
}

/** Only the actual new training command owns the highlighted glyph. Retained
 * history cannot masquerade as a fresh lesson on a later training turn. */
export function projectWeaponTechniqueScene(world: WorldState): WeaponTechniqueSceneView | null {
  const state = world.depth, receipt = state.weaponTechniqueCertification, source = world.chronicle.at(-1);
  if (receipt == null || source == null || world.tick !== state.tick || receipt.tick !== world.tick
    || source.tick !== world.tick || source.commandType !== "certify-weapon-technique"
    || source.mode !== "training" || world.scene.mode !== "training"
    || source.commandId !== `${world.campaignId}:${receipt.sourceCommandId}`
    || state.atlas.currentLocationId !== receipt.locationId || state.atlas.route !== null
    || state.companions.active.length !== 0 || state.hero.equipment.weapon !== receipt.weapon.id
    || (["location", "headline", "action", "goal", "consequence", "sensoryIntensity"] as const)
      .some(key => world.scene[key] !== source[key])) return null;
  const provenance = projectWeaponTechniqueProvenance(world, receipt.ability.id);
  if (provenance === null) return null;
  return Object.freeze({ ...provenance, phase: "certified", commandId: source.commandId,
    tick: receipt.tick, heroId: receipt.heroId,
    headline: `${receipt.ability.name} · learned from the blade`,
    detail: `${receipt.ability.manaCost} MP to use · Half damage · Weaken` });
}

/** A collapsed addition to the existing skill card, not a second skill list. */
export function createWeaponTechniqueRecord(doc: Document, world: WorldState, abilityId: string): HTMLDetailsElement | null {
  const provenance = projectWeaponTechniqueProvenance(world, abilityId);
  if (provenance === null) return null;
  const record = doc.createElement("details"), summary = doc.createElement("summary");
  record.className = "spellbook-provenance spellbook-weapon-technique";
  record.dataset.abilityId = provenance.abilityId;
  record.dataset.weaponId = provenance.weaponId;
  record.dataset.learningSource = provenance.learningCommandId;
  record.dataset.learningTick = String(provenance.learningTick);
  record.dataset.useReceipt = provenance.sourceUse.id;
  record.dataset.useCombat = provenance.sourceUse.combatId;
  record.dataset.useTick = String(provenance.sourceUse.resolvedTick);
  record.dataset.damageRule = provenance.damageRule;
  summary.textContent = `Learned from ${provenance.weaponName}`;
  const lesson = doc.createElement("p");
  lesson.textContent = `Permanently learned at ${provenance.locationName}, T${provenance.learningTick}. Changing weapons does not remove this technique. Initial lesson: ${provenance.initialManaCost} MP, ${provenance.effect}, potency ${provenance.initialPotency}. ${provenance.damageExplanation}`;
  const use = doc.createElement("p"), receipt = provenance.sourceUse;
  use.textContent = `Actual weapon use T${receipt.resolvedTick}: ${receipt.basicStrikes} basic ${receipt.basicStrikes === 1 ? "strike" : "strikes"}, ${receipt.damage} damage; ${receipt.outcome}. Weapon mastery XP ${receipt.experienceBefore}→${receipt.experienceAfter}, level ${receipt.levelBefore}→${receipt.levelAfter}.`;
  const source = doc.createElement("p");
  source.className = "weapon-technique-source";
  source.textContent = `Learning command: ${provenance.learningCommandId}. Weapon: ${provenance.weaponId}. Use receipt: ${receipt.id}. Combat: ${receipt.combatId}.`;
  record.append(summary, lesson, use, source);
  return record;
}
