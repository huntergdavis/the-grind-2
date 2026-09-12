import { canonicalHash } from "../src/core/canonical";
import { advanceWorld, createWorld } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import type { CombatState } from "../src/depth/types";
import { combatDamageV1 } from "../src/depth/combat-damage";
import { resolveSupperDamage } from "../src/depth/supper-preparation";

export const weaponTechniqueCampaignId = "campaign:browser-repartee-memory";
export const turningCheckId = "technique:turning-check";
export interface WeaponTechniqueJourney { before: WorldState; learned: WorldState; next: WorldState }
let journey: WeaponTechniqueJourney | undefined;
const checkpoints = new Map<number, WorldState>();
export function recordWeaponTechniqueCheckpoint(world: WorldState): void {
  if ([58, 59, 60, 72, 73, 74, 75, 76, 85, 86, 87].includes(world.tick)
      || world.chronicle.at(-1)?.commandType === "reunite-companion") checkpoints.set(world.tick, world);
}
export function weaponTechniqueCheckpoints(): WorldState[] { return [...checkpoints.values()]; }
function checkDeadline(deadline: number): void {
  if (Date.now() > deadline) throw new Error("Weapon technique source exceeded its original 20-second post-import budget");
}

/** Same unchanged earned T58 prefix. No weapon, training, use receipt,
 * resources or policy values are supplied. One actual existing training
 * boundary certifies the technique before ordinary play resumes.
 */
export function naturalWeaponTechniqueFixture(deadline = Infinity): WeaponTechniqueJourney {
  if (journey !== undefined) return journey;
  let before = createWorld("shared-road-playful:7", weaponTechniqueCampaignId);
  while (before.tick < 58) { checkDeadline(deadline); before = advanceWorld(before); }
  if (canonicalHash(before) !== "e823e5bde8f2a9f6") throw new Error("Weapon technique changed the actual pre-feature T58 baseline");
  const learned = advanceWorld(before), next = advanceWorld(learned);
  [before, learned, next].forEach(recordWeaponTechniqueCheckpoint);
  if (learned.tick !== 59 || learned.chronicle.at(-1)?.commandType !== "certify-weapon-technique"
      || learned.depth.weaponTechniqueCertification === undefined
      || next.tick !== 60 || next.chronicle.at(-1)?.commandType === "certify-weapon-technique") {
    throw new Error("The actual periodic training boundary did not certify one weapon technique");
  }
  journey = { before, learned, next }; return journey;
}

type CombatEvent = CombatState["eventStream"]["events"][number];
export interface WeaponTechniquePayoff extends WeaponTechniqueJourney {
  firstAttempt: { before: WorldState; after: WorldState; targetId: string; targetSurvived: boolean };
  beforeApplication: WorldState;
  applied: WorldState;
  beforeRetaliation: WorldState;
  retaliated: WorldState;
  applicationEvent: Extract<CombatEvent, { kind: "status-applied" }>;
  statusTickEvent: Extract<CombatEvent, { kind: "status-tick" | "status-expired" }>;
  retaliationEvent: Extract<CombatEvent, { kind: "damage" }>;
  damageWithoutTechnique: number;
  damagePrevented: number;
}
let payoff: WeaponTechniquePayoff | undefined;

/** Continue that SAME earned campaign only through the original T320 ceiling.
 * A lethal first use is retained honestly and is not called a weaken payoff.
 * Success requires a surviving target, the actual applied weakened status,
 * and its later direct retaliation while that source's status still applies.
 * No forced ability, target, policy, hit points or outcome is used.
 */
export function naturalWeaponTechniquePayoffFixture(deadline = Infinity): WeaponTechniquePayoff {
  if (payoff !== undefined) return payoff;
  const learned = naturalWeaponTechniqueFixture(deadline);
  let world = learned.next;
  let firstAttempt: WeaponTechniquePayoff["firstAttempt"] | undefined;
  let pending: { before: WorldState; applied: WorldState; combatId: string;
    event: WeaponTechniquePayoff["applicationEvent"] } | undefined;
  while (world.tick < 320) {
    checkDeadline(deadline);
    const before = world, previous = before.depth.combat;
    world = advanceWorld(before);
    recordWeaponTechniqueCheckpoint(world);
    if (previous === null) continue;
    const combat = world.depth.combat ?? world.depth.completedCombats.find(entry => entry.id === previous.id);
    if (combat === undefined || combat.id !== previous.id) { pending = undefined; continue; }
    const packet = combat.eventStream.events.filter(event => event.turn > previous.turn);
    const application = packet.find((event): event is WeaponTechniquePayoff["applicationEvent"] =>
      event.kind === "status-applied" && event.abilityId === turningCheckId && event.actorId === before.hero.id && event.status === "weakened");
    if (application !== undefined) {
      const target = combat.combatants.find(actor => actor.id === application.targetId);
      firstAttempt ??= { before, after: world, targetId: application.targetId!, targetSurvived: target !== undefined && target.health > 0 };
      pending = target !== undefined && target.health > 0
        ? { before, applied: world, combatId: combat.id, event: application } : undefined;
    }
    if (pending !== undefined && pending.applied.tick < world.tick && pending.combatId === combat.id) {
      const overwritten = packet.some(event => event.kind === "status-applied" && event.status === "weakened"
        && event.targetId === pending!.event.targetId);
      if (overwritten) { pending = undefined; continue; }
      const statusTick = packet.find((event): event is WeaponTechniquePayoff["statusTickEvent"] =>
        event.kind === "status-tick" && event.status === "weakened" && event.actorId === pending!.event.targetId
        && event.potency === pending!.event.potencyAfter && event.durationAfter > 0);
      const damage = packet.find((event): event is WeaponTechniquePayoff["retaliationEvent"] =>
        event.kind === "damage" && event.actorId === pending!.event.targetId && event.targetId === before.hero.id);
      if (statusTick !== undefined && damage !== undefined && firstAttempt !== undefined) {
        const actor = previous.combatants.find(entry => entry.id === damage.actorId)!;
        const target = previous.combatants.find(entry => entry.id === damage.targetId)!;
        const ability = damage.abilityId === null ? null : actor.abilities.find(entry => entry.id === damage.abilityId)!;
        const unweakened = combatDamageV1(before.seed, combat.id, damage.turn, actor, { ...target, health: damage.healthBefore },
          ability, 0, damage.guarded).resolvedDamage;
        const damageWithoutTechnique = Math.min(damage.healthBefore,
          damage.supper === undefined ? unweakened : resolveSupperDamage(unweakened, damage.guarded));
        const damagePrevented = damageWithoutTechnique - damage.amount;
        if (damagePrevented <= 0) continue; // Do not call overkill or a damage-floor tie a payoff.
        payoff = { ...learned, firstAttempt, beforeApplication: pending.before, applied: pending.applied,
          beforeRetaliation: before, retaliated: world, applicationEvent: pending.event,
          statusTickEvent: statusTick, retaliationEvent: damage, damageWithoutTechnique, damagePrevented };
        return payoff;
      }
    }
    if (combat.outcome !== "ongoing") pending = undefined;
  }
  throw new Error(`The actual technique did not produce a surviving weakened retaliation by T320; first attempt ${firstAttempt?.after.tick ?? "none"}, survived ${firstAttempt?.targetSurvived ?? "none"}`);
}
