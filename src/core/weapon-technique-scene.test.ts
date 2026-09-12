import { beforeAll, describe, expect, it } from "vitest";
import { naturalWeaponTechniqueFixture, naturalWeaponTechniquePayoffFixture, turningCheckId } from "../../tests/weapon-technique-fixtures";
import { createTurningCheck } from "../depth/weapon-technique";
import { canonicalHash, canonicalStringify } from "./canonical";
import { advanceWorld, campaignDirector, upgradeWorldState } from "./simulation";

describe("an earned weapon technique at ordinary periodic training", () => {
  let journey: ReturnType<typeof naturalWeaponTechniqueFixture>;
  let payoff: ReturnType<typeof naturalWeaponTechniquePayoffFixture>;
  beforeAll(() => {
    payoff = naturalWeaponTechniquePayoffFixture(Date.now() + 20_000);
    journey = { before: payoff.before, learned: payoff.learned, next: payoff.next };
  }, 20_000);

  it("uses the equipped blade's real first effective battle and preserves all other mastery and resources", () => {
    const { before, learned, next } = journey, receipt = learned.depth.weaponTechniqueCertification!;
    const weapon = before.depth.hero.inventory.find(item => item.id === before.depth.hero.equipment.weapon)!;
    expect([before.tick, canonicalHash(before), learned.tick, next.tick]).toEqual([58, "e823e5bde8f2a9f6", 59, 60]);
    expect(before.depth.hero.abilities.some(ability => ability.id === turningCheckId)).toBe(false);
    expect(receipt).toMatchObject({ schemaVersion: 1, rulesVersion: "weapon-technique-certification-v1", heroId: before.hero.id,
      locationId: before.depth.atlas.currentLocationId, weapon, tick: 59, ability: createTurningCheck() });
    expect(receipt.sourceUseReceipt).toEqual(weapon.useMastery!.receipts[0]);
    expect(receipt.sourceUseReceipt).toMatchObject({ resolvedTick: 35, basicStrikes: 1, damage: 14, outcome: "victory" });
    expect(learned.depth.hero.abilities).toEqual([...before.depth.hero.abilities, createTurningCheck()]);
    expect(receipt.ability).toMatchObject({ damageRule: "weapon-check-half-v1", manaCost: 2, potency: 2 });
    const { abilities: _beforeAbilities, ...heroBefore } = before.depth.hero;
    const { abilities: _learnedAbilities, ...heroAfter } = learned.depth.hero;
    expect(heroAfter).toEqual({ ...heroBefore, experience: heroBefore.experience + 1 });
    for (const field of ["companions", "atlas", "quest", "towns", "completedCombats", "repartee", "reparteeWitness", "reparteeCallback",
      "usefulReply", "roomChallenge", "bellExpedition", "bellMemory", "smithyJob", "innBluff", "pennywiseGate"] as const)
      expect(learned.depth[field]).toEqual(before.depth[field]);
    expect(learned.hero.experience).toBe(before.hero.experience + 1); // Existing training's hero XP, not a new extra award.
    expect(learned.scene.mode).toBe("training");
    expect(learned.scene.action).toContain("The blade has one more lesson");
    expect(learned.scene.action).toContain(receipt.weapon.name);
    expect(learned.scene.consequence).toContain("Turning Check");
    expect(learned.chronicle.at(-1)).toMatchObject({ tick: 59, commandType: "certify-weapon-technique",
      commandId: `${learned.campaignId}:${receipt.sourceCommandId}`, action: learned.scene.action });
    expect(next.chronicle.at(-1)?.commandType).toBe("buy-road-rations");
  });

  it("restores the exact learned snapshot without repeating certification or altering earlier abilities", () => {
    for (const world of Object.values(journey)) {
      const raw = canonicalStringify(world), restored = upgradeWorldState(JSON.parse(raw));
      expect(canonicalStringify(restored)).toBe(raw);
    }
    const restored = upgradeWorldState(JSON.parse(canonicalStringify(journey.learned)))!;
    expect(advanceWorld(restored)).toEqual(journey.next);
    expect(campaignDirector(restored).candidates.every(candidate => candidate.command.type !== "certify-weapon-technique")).toBe(true);
    expect(journey.next.depth.weaponTechniqueCertification).toEqual(journey.learned.depth.weaponTechniqueCertification);
    expect(journey.before.depth).not.toHaveProperty("weaponTechniqueCertification");
    expect(upgradeWorldState(JSON.parse(canonicalStringify(journey.before)))!.depth).not.toHaveProperty("weaponTechniqueCertification");
  });

  it("eventually weakens a surviving actual enemy and prevents damage on its real retaliation", () => {
    const { beforeApplication, applied, beforeRetaliation, retaliated, applicationEvent, statusTickEvent, retaliationEvent } = payoff;
    expect(retaliated.tick).toBeLessThanOrEqual(320);
    expect([payoff.firstAttempt.after.tick, payoff.firstAttempt.targetSurvived, applied.tick, retaliated.tick]).toEqual([77, false, 276, 277]);
    expect(applied.chronicle.at(-1)?.commandType).toBe("combat-action");
    expect(applicationEvent).toMatchObject({ kind: "status-applied", actorId: beforeApplication.hero.id,
      abilityId: turningCheckId, status: "weakened" });
    expect(applied.depth.combat!.combatants.find(actor => actor.id === applicationEvent.targetId)!.health).toBeGreaterThan(0);
    const mana = applied.depth.combat!.eventStream.events.find(event => event.turn === applicationEvent.turn
      && event.kind === "mana-spent" && event.abilityId === turningCheckId);
    expect(mana).toMatchObject({ actorId: applied.hero.id, amount: 2 });
    expect(statusTickEvent).toMatchObject({ kind: "status-tick", actorId: applicationEvent.targetId,
      status: "weakened", potency: applicationEvent.potencyAfter });
    expect(statusTickEvent.durationAfter).toBeGreaterThan(0);
    expect(retaliationEvent).toMatchObject({ kind: "damage", actorId: applicationEvent.targetId, targetId: beforeRetaliation.hero.id });
    expect(retaliationEvent.healthBefore - retaliationEvent.healthAfter).toBe(retaliationEvent.amount);
    expect(payoff.damageWithoutTechnique - retaliationEvent.amount).toBe(payoff.damagePrevented);
    expect(payoff.damagePrevented).toBeGreaterThan(0);
    expect([retaliationEvent.amount, payoff.damageWithoutTechnique, payoff.damagePrevented]).toEqual([21, 23, 2]);
    expect(beforeApplication.depth.hero.equipment.weapon).not.toBe(journey.learned.depth.weaponTechniqueCertification!.weapon.id);
    expect(applied.depth.weaponTechniqueCertification).toEqual(journey.learned.depth.weaponTechniqueCertification);
    expect(retaliated.depth.weaponTechniqueCertification).toEqual(journey.learned.depth.weaponTechniqueCertification);
    expect(retaliated.depth.hero.abilities.filter(ability => ability.id === turningCheckId)).toHaveLength(1);
    for (const world of [beforeApplication, applied, beforeRetaliation, retaliated])
      expect(canonicalStringify(upgradeWorldState(JSON.parse(canonicalStringify(world))))).toBe(canonicalStringify(world));
  });
});
