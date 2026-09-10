import { describe, expect, it } from "vitest";
import { advanceWorld, createWorld, upgradeWorldState } from "../core/simulation";
import type { ChronicleEntry, WorldState } from "../core/types";
import { createCounterDuel, resolveCounterDuelRound } from "../depth/counter-duel";
import { projectViewHero } from "./hero-inspection-activity";

function realBattle(): { ongoing: WorldState; victory: WorldState } {
  const opening = createWorld("golden:1", "campaign:1");
  let ongoing = advanceWorld(opening);
  // The real smith purchase grants no XP and changes subsequent actor cadence.
  expect(ongoing.chronicle.at(-1)?.commandType).toBe("buy-disarming-kit");
  for (let step = 0; step < 32; step += 1) {
    const victory = advanceWorld(ongoing);
    const battle = ongoing.depth.combat;
    const completed = victory.depth.completedCombats.at(-1);
    if (battle?.outcome === "ongoing" && victory.depth.combat === null
      && completed?.id === battle.id && completed.outcome === "victory") {
      expect(victory.tick).toBe(ongoing.tick + 1);
      expect(victory.chronicle.at(-1)?.commandType).toBe("combat-action");
      return { ongoing, victory };
    }
    ongoing = victory;
  }
  throw new Error("The bounded real journey must produce an adjacent ongoing battle and its victory");
}

function withSource(world: WorldState, changes: Partial<ChronicleEntry>): WorldState {
  const source = world.chronicle.at(-1);
  if (source === undefined) throw new Error("A recorded scene is required");
  return { ...world, chronicle: [...world.chronicle.slice(0, -1), { ...source, ...changes }] };
}

function realDuel(): { ongoing: WorldState; settled: WorldState } {
  // Use actual duel APIs, but stage the inspection source separately: this is
  // a projection fixture, not a claim that a whole campaign chose these reads.
  const base = realBattle().victory;
  const seed = "inspection-duel";
  const initial = createCounterDuel(seed, "encounter:inspection-duel", base.hero.id, base.depth.hero.resources.maxHealth);
  const ongoing = { ...base, depth: { ...base.depth, counterDuel: initial } };
  let duel = initial;
  for (let round = 0; round < 5 && duel.outcome === "ongoing"; round += 1) {
    duel = resolveCounterDuelRound(duel, "rush", seed);
  }
  if (duel.outcome === "ongoing") throw new Error("Five actual rounds must settle the duel");
  const latest = duel.history.at(-1)!;
  const settled = withSource({ ...base, depth: { ...base.depth, counterDuel: null, completedCounterDuels: [duel] } }, {
    commandType: "counter-duel-action",
    commandId: `${base.campaignId}:depth:${base.depth.tick}:counter-duel:${duel.id}:${latest.round}:${latest.prediction}`,
  });
  return { ongoing, settled };
}

describe("hero inspection activity", () => {
  it("projects exact, read-only subjects for every inspection view", () => {
    let world = createWorld("hero-margins", "campaign");
    for (let index = 0; index < 28; index += 1) world = advanceWorld(world);
    const before = JSON.stringify(world);
    for (const view of ["map", "inventory", "journal", "codex", "spellbook", "hall"] as const) {
      const projected = projectViewHero(world, view);
      expect(projected.view).toBe(view);
      expect(projected.tick).toBe(world.tick);
      expect(projected.heroName).toBe(world.depth.hero.name);
      expect(projected.sceneHeadline).toBe(world.scene.headline);
      expect(projected.appearance.weapon?.itemId ?? null).toBe(world.depth.hero.equipment.weapon);
    }
    expect(JSON.stringify(world)).toBe(before);
  });

  it("keeps a still-valid per-view subject focused as the world advances", () => {
    const world = createWorld("hero-margin-focus", "campaign");
    const first = projectViewHero(world, "inventory");
    expect(first.subjectId).not.toBeNull();
    const next = projectViewHero(advanceWorld(world), "inventory", first.subjectId ?? undefined);
    expect(next.subjectId).toBe(first.subjectId);
  });

  it("never reveals an unlearned monster secret through the marginal activity", () => {
    const world = createWorld("hero-margin-redaction", "campaign");
    const secretName = "Name That Must Stay Hidden";
    const secretId = "secret:must-stay-hidden";
    const withLore = {
      ...world,
      depth: {
        ...world.depth,
        hero: {
          ...world.depth.hero,
          monsterLore: [{
            monsterId: "lantern-wolf",
            monsterName: "Lantern Wolf",
            encounters: 2,
            victories: 1,
            insight: 1,
            requiredInsight: 3,
            secretTechniqueId: secretId,
            secretTechniqueName: secretName,
            learned: false,
          }],
        },
      },
    };
    const encoded = JSON.stringify(projectViewHero(withLore, "codex"));
    expect(encoded).not.toContain(secretId);
    expect(encoded).not.toContain(secretName);
    expect(encoded).toContain("1/3 insight");
  });

  it("does not infer an ongoing battle from a synthetic backdrop without combat", () => {
    const base = createWorld("hero-margin-attention", "campaign");
    const battle = { ...base, scene: { ...base.scene, mode: "battle" as const } };
    const discovery = { ...base, scene: { ...base.scene, mode: "discovery" as const } };
    expect(projectViewHero(battle, "journal")).toMatchObject({
      pose: "alert",
      attention: "forbiddenDuringCatchUp",
      liveNotice: "Battle scene — return to Watch.",
    });
    expect(projectViewHero(discovery, "spellbook")).toMatchObject({
      pose: "alert",
      attention: "queueForPresentation",
      liveNotice: "A significant moment — return to Watch.",
    });
  });

  it("distinguishes the real running battle from a same-tick presentation pause without changing its subject", () => {
    const { ongoing } = realBattle();
    const before = JSON.stringify(ongoing);
    const running = projectViewHero(ongoing, "inventory");
    const paused = projectViewHero(ongoing, "inventory", running.subjectId ?? undefined, { paused: true });
    expect(running).toMatchObject({ pose: "battle", liveNotice: "Battle continues off-screen — return to Watch." });
    expect(paused).toMatchObject({ pose: "battle", liveNotice: "Battle paused — return to Watch.", subjectId: running.subjectId, tick: ongoing.tick });
    expect(projectViewHero(ongoing, "inventory", running.subjectId ?? undefined, { paused: false })).toEqual(running);
    expect(JSON.stringify(ongoing)).toBe(before);
  });

  it("shows the real settled victory while paused or resumed and after JSON reload", () => {
    const { victory } = realBattle();
    const before = JSON.stringify(victory);
    const paused = projectViewHero(victory, "journal", undefined, { paused: true });
    expect(paused).toMatchObject({ pose: "review", liveNotice: "Battle won · paused — return to Watch.", tick: victory.tick });
    expect(projectViewHero(victory, "journal")).toMatchObject({ pose: "review", liveNotice: "Battle won — return to Watch." });
    const restored = upgradeWorldState(JSON.parse(before));
    expect(JSON.stringify(restored)).toBe(before);
    expect(projectViewHero(restored, "journal", undefined, { paused: true })).toEqual(paused);
    expect(JSON.stringify(victory)).toBe(before);
  });

  it.each([
    ["defeat", "Battle lost"],
    ["stalemate", "Battle ended in stalemate"],
  ] as const)("labels a source-bound %s without assuming victory", (outcome, label) => {
    const { victory } = realBattle();
    const completed = victory.depth.completedCombats.at(-1)!;
    // Bounded copy-only branch test; the actual victory integration is above.
    const world = { ...victory, depth: { ...victory.depth, completedCombats: [{ ...completed, outcome }] } };
    expect(projectViewHero(world, "journal", undefined, { paused: true })).toMatchObject({
      pose: "review", liveNotice: `${label} · paused — return to Watch.`,
    });
  });

  it("never borrows a stale tactical result for an unrelated or mismatched current source", () => {
    const { victory } = realBattle();
    const source = victory.chronicle.at(-1)!;
    const completed = victory.depth.completedCombats.at(-1)!;
    const prefix = `${victory.campaignId}:depth:${victory.depth.tick}:combat:`;
    const mismatches: Partial<ChronicleEntry>[] = [
      { tick: source.tick - 1 }, { id: "another-campaign:5" }, { commandType: "wait" },
      { commandId: "" },
      { commandId: `${prefix}another-combat:${completed.turn - 1}:actor:attack:basic:target` },
      { commandId: `${prefix}${completed.id}:${completed.turn}:actor:attack:basic:target` },
    ];
    for (const mismatch of mismatches) {
      expect(projectViewHero(withSource(victory, mismatch), "journal", undefined, { paused: true })).toMatchObject({
        pose: "alert", liveNotice: "Battle scene · paused — return to Watch.",
      });
    }
    const missingCommand = structuredClone(victory);
    delete missingCommand.chronicle[missingCommand.chronicle.length - 1]!.commandId;
    expect(projectViewHero(missingCommand, "journal").liveNotice).toBe("Battle scene — return to Watch.");
    const later = { ...victory, tick: victory.tick + 1, depth: { ...victory.depth, tick: victory.depth.tick + 1 } };
    expect(projectViewHero(later, "journal").liveNotice).toBe("Battle scene — return to Watch.");
  });

  it("uses the actual Pattern Duel engine for ongoing and exactly bound settled notices despite old tactical history", () => {
    const { ongoing, settled } = realDuel();
    expect(ongoing.depth.completedCombats.at(-1)?.outcome).toBe("victory");
    expect(projectViewHero(ongoing, "codex")).toMatchObject({ pose: "battle", liveNotice: "Duel continues off-screen — return to Watch." });
    expect(projectViewHero(ongoing, "codex", undefined, { paused: true }).liveNotice).toBe("Duel paused — return to Watch.");
    const duel = settled.depth.completedCounterDuels.at(-1)!;
    const expected = { victory: "Duel won", defeat: "Duel lost", draw: "Duel drawn", ongoing: "invalid" }[duel.outcome];
    const before = JSON.stringify(settled);
    expect(projectViewHero(settled, "codex")).toMatchObject({ pose: "study", liveNotice: `${expected} — return to Watch.` });
    expect(projectViewHero(settled, "codex", undefined, { paused: true }).liveNotice).toBe(`${expected} · paused — return to Watch.`);
    expect(JSON.stringify(settled)).toBe(before);
  });

  it("does not replace a stale duel result with a tactical outcome or accept the wrong round", () => {
    const { settled } = realDuel();
    const duel = settled.depth.completedCounterDuels.at(-1)!;
    const latest = duel.history.at(-1)!;
    const prefix = `${settled.campaignId}:depth:${settled.depth.tick}:counter-duel:`;
    for (const commandId of ["", `${prefix}another-duel:${latest.round}:${latest.prediction}`,
      `${prefix}${duel.id}:${latest.round + 1}:${latest.prediction}`]) {
      expect(projectViewHero(withSource(settled, { commandId }), "codex")).toMatchObject({
        pose: "alert", liveNotice: "Battle scene — return to Watch.",
      });
    }
  });

  it("describes significant paused scenes without claiming action continues or changing facts", () => {
    const base = createWorld("hero-margin-paused-discovery", "campaign");
    const discovery = { ...base, scene: { ...base.scene, mode: "discovery" as const } };
    const before = JSON.stringify(discovery);
    expect(projectViewHero(discovery, "spellbook", undefined, { paused: true })).toMatchObject({
      pose: "alert", liveNotice: "Scene paused — return to Watch.", sceneHeadline: discovery.scene.headline,
    });
    expect(projectViewHero(discovery, "spellbook").liveNotice).toBe("A significant moment — return to Watch.");
    expect(projectViewHero(base, "hall", undefined, { paused: true }).subjectDetail).not.toMatch(/keeps moving|continues/u);
    expect(JSON.stringify(discovery)).toBe(before);
  });
});
