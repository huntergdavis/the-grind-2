import { isValidWeaponUseMastery } from "../depth/rpg";
import type { CombatState, DetailedHeroState, ItemState, WeaponUseReceipt } from "../depth/types";
import type { CombatVisualCue } from "./combat-choreography";
import { projectGearAppearance, type GearSilhouette } from "./hero-appearance";

export type FamiliarWeaponSilhouette = Extract<GearSilhouette, "sword" | "spear" | "wand">;
export type FamiliarWeaponFormId =
  | "familiar-form-sword-v1"
  | "familiar-form-spear-v1"
  | "familiar-form-wand-v1";

export interface FamiliarWeaponFormFact {
  readonly schemaVersion: 1;
  readonly rulesVersion: "weapon-familiar-form-v1";
  readonly formId: FamiliarWeaponFormId;
  readonly formName: "Measured Cut" | "Set Thrust" | "Anchored Arc";
  readonly weaponId: string;
  readonly weaponName: string;
  readonly silhouette: FamiliarWeaponSilhouette;
  readonly displayedMasteryLevel: number;
  readonly unlockReceiptId: string;
  readonly unlockCombatId: string;
  readonly mechanicalBonus: 0;
}

export interface CombatFamiliarWeaponFormFact extends FamiliarWeaponFormFact {
  readonly sourceCombatId: string;
  readonly terminal: boolean;
}

export interface FamiliarWeaponFormPose {
  readonly bodyRotationOffset: number;
  readonly frontArmRotationOffset: number;
  readonly rearArmRotationOffset: number;
  readonly frontLegRotationOffset: number;
  readonly rearLegRotationOffset: number;
  readonly glyphAlpha: number;
  readonly glyphScale: number;
}

const formDefinitions: Readonly<Record<FamiliarWeaponSilhouette, Readonly<{
  formId: FamiliarWeaponFormId;
  formName: FamiliarWeaponFormFact["formName"];
}>>> = {
  sword: { formId: "familiar-form-sword-v1", formName: "Measured Cut" },
  spear: { formId: "familiar-form-spear-v1", formName: "Set Thrust" },
  wand: { formId: "familiar-form-wand-v1", formName: "Anchored Arc" },
};

const neutralPose: FamiliarWeaponFormPose = {
  bodyRotationOffset: 0,
  frontArmRotationOffset: 0,
  rearArmRotationOffset: 0,
  frontLegRotationOffset: 0,
  rearLegRotationOffset: 0,
  glyphAlpha: 0,
  glyphScale: 1,
};

const poseKeyframes: Readonly<Record<FamiliarWeaponSilhouette, Readonly<{
  windup: FamiliarWeaponFormPose;
  impact: FamiliarWeaponFormPose;
  followThrough: FamiliarWeaponFormPose;
}>>> = {
  sword: {
    windup: { bodyRotationOffset: -0.1, frontArmRotationOffset: -0.48, rearArmRotationOffset: 0.08, frontLegRotationOffset: 0.08, rearLegRotationOffset: -0.06, glyphAlpha: 0, glyphScale: 0.84 },
    impact: { bodyRotationOffset: 0.08, frontArmRotationOffset: 1.18, rearArmRotationOffset: -0.12, frontLegRotationOffset: -0.12, rearLegRotationOffset: 0.08, glyphAlpha: 0.96, glyphScale: 1.08 },
    followThrough: { bodyRotationOffset: 0.04, frontArmRotationOffset: 0.62, rearArmRotationOffset: -0.04, frontLegRotationOffset: -0.05, rearLegRotationOffset: 0.03, glyphAlpha: 0.48, glyphScale: 1.02 },
  },
  spear: {
    windup: { bodyRotationOffset: -0.04, frontArmRotationOffset: -0.24, rearArmRotationOffset: 0.42, frontLegRotationOffset: 0.04, rearLegRotationOffset: -0.04, glyphAlpha: 0, glyphScale: 0.82 },
    impact: { bodyRotationOffset: 0.13, frontArmRotationOffset: 0.72, rearArmRotationOffset: -0.34, frontLegRotationOffset: -0.18, rearLegRotationOffset: 0.16, glyphAlpha: 0.96, glyphScale: 1.12 },
    followThrough: { bodyRotationOffset: 0.07, frontArmRotationOffset: 0.34, rearArmRotationOffset: -0.18, frontLegRotationOffset: -0.08, rearLegRotationOffset: 0.07, glyphAlpha: 0.42, glyphScale: 1.04 },
  },
  wand: {
    windup: { bodyRotationOffset: -0.06, frontArmRotationOffset: -0.82, rearArmRotationOffset: -0.18, frontLegRotationOffset: 0.02, rearLegRotationOffset: -0.02, glyphAlpha: 0.12, glyphScale: 0.72 },
    impact: { bodyRotationOffset: -0.02, frontArmRotationOffset: -0.38, rearArmRotationOffset: 0.22, frontLegRotationOffset: -0.03, rearLegRotationOffset: 0.03, glyphAlpha: 0.94, glyphScale: 1.18 },
    followThrough: { bodyRotationOffset: 0.02, frontArmRotationOffset: 0.12, rearArmRotationOffset: 0.08, frontLegRotationOffset: 0, rearLegRotationOffset: 0, glyphAlpha: 0.5, glyphScale: 1.08 },
  },
};

function isWeaponSilhouette(value: GearSilhouette): value is FamiliarWeaponSilhouette {
  return value === "sword" || value === "spear" || value === "wand";
}

function levelFourReceipt(item: ItemState): WeaponUseReceipt | null {
  if (item.useMastery === null) return null;
  return item.useMastery.receipts.find((receipt) =>
    receipt.experienceAfter === 6 && receipt.levelBefore === 3 && receipt.levelAfter === 4
  ) ?? null;
}

function formFact(item: ItemState, displayedMasteryLevel: number): FamiliarWeaponFormFact | null {
  if (
    item.kind !== "equipment" || item.slot !== "weapon" || item.useMastery === null ||
    !isValidWeaponUseMastery(item.useMastery, item.id) || displayedMasteryLevel < 4
  ) return null;
  const unlock = levelFourReceipt(item);
  const appearance = projectGearAppearance(item);
  if (unlock === null || appearance === null || !isWeaponSilhouette(appearance.silhouette)) return null;
  const definition = formDefinitions[appearance.silhouette];
  return {
    schemaVersion: 1,
    rulesVersion: "weapon-familiar-form-v1",
    formId: definition.formId,
    formName: definition.formName,
    weaponId: item.id,
    weaponName: item.name,
    silhouette: appearance.silhouette,
    displayedMasteryLevel,
    unlockReceiptId: unlock.id,
    unlockCombatId: unlock.combatId,
    mechanicalBonus: 0,
  };
}

export function projectFamiliarWeaponForm(item: ItemState): FamiliarWeaponFormFact | null {
  return formFact(item, item.useMastery?.level ?? 0);
}

export function projectCombatFamiliarWeaponForm(
  hero: Pick<DetailedHeroState, "id" | "equipment" | "inventory">,
  combat: CombatState,
  cue: CombatVisualCue | null,
): CombatFamiliarWeaponFormFact | null {
  const tracked = combat.weaponUse;
  if (
    cue === null || cue.action !== "attack" || cue.amount <= 0 || cue.actorId !== hero.id ||
    tracked.tracking !== "tracked" || tracked.heroId !== hero.id || tracked.basicStrikes < 1
  ) return null;
  if (combat.outcome === "ongoing" && hero.equipment.weapon !== tracked.weaponId) return null;
  const item = hero.inventory.find((candidate) => candidate.id === tracked.weaponId);
  if (item?.useMastery === null || item === undefined) return null;

  const terminal = combat.outcome !== "ongoing";
  const settlement = terminal
    ? item.useMastery.receipts.find((receipt) => receipt.combatId === combat.id) ?? null
    : null;
  const displayedMasteryLevel = terminal
    ? settlement?.levelBefore ?? (item.useMastery.level === 10 ? 10 : 0)
    : item.useMastery.level;
  const projected = formFact(item, displayedMasteryLevel);
  return projected === null ? null : {
    ...projected,
    sourceCombatId: combat.id,
    terminal,
  };
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function interpolate(
  from: FamiliarWeaponFormPose,
  to: FamiliarWeaponFormPose,
  progress: number,
): FamiliarWeaponFormPose {
  const amount = clampUnit(progress);
  return {
    bodyRotationOffset: from.bodyRotationOffset + (to.bodyRotationOffset - from.bodyRotationOffset) * amount,
    frontArmRotationOffset: from.frontArmRotationOffset + (to.frontArmRotationOffset - from.frontArmRotationOffset) * amount,
    rearArmRotationOffset: from.rearArmRotationOffset + (to.rearArmRotationOffset - from.rearArmRotationOffset) * amount,
    frontLegRotationOffset: from.frontLegRotationOffset + (to.frontLegRotationOffset - from.frontLegRotationOffset) * amount,
    rearLegRotationOffset: from.rearLegRotationOffset + (to.rearLegRotationOffset - from.rearLegRotationOffset) * amount,
    glyphAlpha: from.glyphAlpha + (to.glyphAlpha - from.glyphAlpha) * amount,
    glyphScale: from.glyphScale + (to.glyphScale - from.glyphScale) * amount,
  };
}

export function projectFamiliarWeaponFormPose(
  silhouette: FamiliarWeaponSilhouette,
  elapsedSeconds: number,
  cueDurationSeconds: number,
  staticTableau: boolean,
): FamiliarWeaponFormPose {
  const keyframes = poseKeyframes[silhouette];
  if (staticTableau) return { ...keyframes.impact };
  const progress = clampUnit(elapsedSeconds / cueDurationSeconds);
  if (progress < 0.12) return { ...neutralPose };
  if (progress < 0.32) return interpolate(neutralPose, keyframes.windup, (progress - 0.12) / 0.2);
  if (progress < 0.48) return interpolate(keyframes.windup, keyframes.impact, (progress - 0.32) / 0.16);
  if (progress < 0.72) return interpolate(keyframes.impact, keyframes.followThrough, (progress - 0.48) / 0.24);
  if (progress < 1) return interpolate(keyframes.followThrough, neutralPose, (progress - 0.72) / 0.28);
  return { ...neutralPose };
}
