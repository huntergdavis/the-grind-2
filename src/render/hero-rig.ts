import type { SceneMode } from "../core/types";

export interface HeroRigPose {
  bodyY: number;
  bodyRotation: number;
  frontArmRotation: number;
  rearArmRotation: number;
  frontLegRotation: number;
  rearLegRotation: number;
}

const basePose: Record<SceneMode, HeroRigPose> = {
  town: { bodyY: 0, bodyRotation: 0.02, frontArmRotation: -0.12, rearArmRotation: 0.1, frontLegRotation: 0.08, rearLegRotation: -0.08 },
  atlas: { bodyY: 0, bodyRotation: 0, frontArmRotation: 0, rearArmRotation: 0, frontLegRotation: 0, rearLegRotation: 0 },
  travel: { bodyY: 0, bodyRotation: 0.06, frontArmRotation: -0.28, rearArmRotation: 0.28, frontLegRotation: 0.2, rearLegRotation: -0.2 },
  dungeon: { bodyY: 1, bodyRotation: 0.11, frontArmRotation: -0.34, rearArmRotation: 0.18, frontLegRotation: 0.12, rearLegRotation: -0.16 },
  battle: { bodyY: 2, bodyRotation: 0.12, frontArmRotation: -0.78, rearArmRotation: 0.34, frontLegRotation: -0.12, rearLegRotation: 0.24 },
  training: { bodyY: 1, bodyRotation: 0.08, frontArmRotation: -0.68, rearArmRotation: 0.28, frontLegRotation: -0.08, rearLegRotation: 0.18 },
  discovery: { bodyY: 0, bodyRotation: -0.04, frontArmRotation: -0.92, rearArmRotation: -0.08, frontLegRotation: 0.03, rearLegRotation: -0.03 },
  camp: { bodyY: 3, bodyRotation: -0.08, frontArmRotation: 0.28, rearArmRotation: 0.18, frontLegRotation: -0.34, rearLegRotation: 0.38 },
  chronicle: { bodyY: 0, bodyRotation: 0, frontArmRotation: 0, rearArmRotation: 0, frontLegRotation: 0, rearLegRotation: 0 },
};

export function projectHeroRigPose(mode: SceneMode, elapsedSeconds: number, reducedMotion: boolean): HeroRigPose {
  const base = basePose[mode];
  if (reducedMotion) return { ...base };
  const speed = mode === "battle" ? 5.2 : mode === "travel" ? 4.1 : 2.1;
  const wave = Math.sin(elapsedSeconds * speed);
  const stride = mode === "travel" ? 0.24 : mode === "battle" ? 0.08 : 0.025;
  const armSwing = mode === "travel" ? 0.3 : mode === "battle" || mode === "training" ? 0.1 : 0.035;
  return {
    bodyY: base.bodyY - Math.abs(wave) * (mode === "travel" ? 0.8 : 0.28),
    bodyRotation: base.bodyRotation + wave * (mode === "battle" ? 0.025 : 0.012),
    frontArmRotation: base.frontArmRotation + wave * armSwing,
    rearArmRotation: base.rearArmRotation - wave * armSwing,
    frontLegRotation: base.frontLegRotation - wave * stride,
    rearLegRotation: base.rearLegRotation + wave * stride,
  };
}
