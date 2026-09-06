import { describe, expect, it } from "vitest";
import { advanceWorld, createWorld } from "../core/simulation";
import type { ChronicleEntry, WorldState } from "../core/types";
import {
  isCommittedStoryBeatMechanicsV2,
  isStoryBeatPublicMechanicsV2,
  projectCommittedStoryBeatMechanicsV2,
  storyBeatConsequenceMetricsV2,
  storyBeatCostMetricsV2,
  type CommittedStoryBeatMechanicsV2,
} from "./story-beat-mechanics-v2";

const policy = Object.freeze({
  attention: "backgroundSafe" as const,
  reversible: true,
  maximumFidelityAffected: "ephemeral" as const,
  thresholdBehavior: "continue" as const,
  maximumCreditedDurationTicks: 1,
  aggregation: "none" as const,
  queuedFallback: "The road waits.",
});

function transition(
  mutate: (before: WorldState, after: WorldState) => void,
): {
  readonly before: WorldState;
  readonly after: WorldState;
  readonly source: ChronicleEntry;
} {
  const before = createWorld("story-beat-mechanics-v2", "campaign:story-beat-mechanics-v2");
  const after = structuredClone(before);
  after.tick = before.tick + 1;
  after.depth.tick = after.tick;
  after.lifecycle.simulationTick = after.tick;
  after.scene = {
    mode: "chronicle",
    location: "Moonclock Vault",
    headline: "The mechanism turns.",
    action: "Mira commits one exact move.",
    goal: "Observe the resulting public mechanics.",
    consequence: "The committed state changes.",
    sensoryIntensity: 1,
  };
  mutate(before, after);
  const source: ChronicleEntry = {
    ...after.scene,
    id: `${after.campaignId}:${after.tick}`,
    tick: after.tick,
    attention: "backgroundSafe",
    consideredActions: ["commit the exact move"],
    chosenAction: "commit the exact move",
    rationale: "The deterministic policy selected it.",
    commandId: `${after.campaignId}:wait`,
    commandType: "wait",
    consideredCommandIds: [`${after.campaignId}:wait`],
    policy,
  };
  after.chronicle = [source];
  return { before, after, source };
}

function project(
  fixture: ReturnType<typeof transition>,
): CommittedStoryBeatMechanicsV2 | null {
  return projectCommittedStoryBeatMechanicsV2(
    fixture.before,
    fixture.after,
    fixture.source,
    fixture.source.id,
  );
}

describe("story-beat V2 host mechanics projection", () => {
  it("derives a cost lens only from a typed resource decrease", () => {
    const fixture = transition((_before, after) => {
      after.hero.health -= 3;
      after.depth.hero.resources.health -= 3;
    });
    const result = project(fixture);
    expect(result?.facts).toEqual({
      schemaVersion: 2,
      kind: "public-story-beat-mechanics",
      beatLensId: "cost",
      costs: [{
        kind: "cost",
        metric: "hero-health",
        direction: "decrease",
        before: fixture.before.hero.health,
        after: fixture.after.hero.health,
        amount: 3,
      }],
      consequences: [],
    });
  });

  it("derives a consequence lens only from typed progress", () => {
    const fixture = transition((_before, after) => {
      after.hero.experience += 4;
      after.depth.hero.experience += 4;
    });
    const result = project(fixture);
    expect(result?.facts.beatLensId).toBe("consequence");
    expect(result?.facts.costs).toEqual([]);
    expect(result?.facts.consequences).toContainEqual({
      kind: "consequence",
      metric: "hero-experience",
      direction: "increase",
      before: fixture.before.hero.experience,
      after: fixture.after.hero.experience,
      amount: 4,
    });
  });

  it("selects contrast only when the same committed tick contains both kinds", () => {
    const fixture = transition((before, after) => {
      after.hero.gold -= 5;
      after.depth.hero.gold -= 5;
      const townId = before.depth.atlas.currentLocationId;
      after.depth.towns = {
        ...after.depth.towns,
        [townId]: {
          ...after.depth.towns[townId]!,
          visits: after.depth.towns[townId]!.visits + 1,
        },
      };
    });
    const result = project(fixture);
    expect(result?.facts.beatLensId).toBe("contrast");
    expect(result?.facts.costs.map((fact) => fact.metric)).toEqual(["hero-gold"]);
    expect(result?.facts.consequences.map((fact) => fact.metric)).toContain("town-visits");
  });

  it("binds deterministic, frozen facts to an exact latest Chronicle source", () => {
    const fixture = transition((_before, after) => {
      after.hero.health -= 2;
      after.depth.hero.resources.health -= 2;
      after.hero.experience += 3;
      after.depth.hero.experience += 3;
      const townId = after.depth.atlas.currentLocationId;
      after.depth.towns = {
        ...after.depth.towns,
        [townId]: {
          ...after.depth.towns[townId]!,
          visits: after.depth.towns[townId]!.visits + 1,
        },
      };
    });
    const first = project(fixture);
    const replay = projectCommittedStoryBeatMechanicsV2(
      structuredClone(fixture.before),
      structuredClone(fixture.after),
      structuredClone(fixture.source),
      fixture.source.id,
    );
    expect(replay).toEqual(first);
    expect(first?.sourceFingerprint).toMatch(/^[0-9a-f]{16}$/u);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first?.facts)).toBe(true);
    expect(Object.isFrozen(first?.facts.costs)).toBe(true);
    expect(Object.isFrozen(first?.facts.consequences)).toBe(true);
    expect(isCommittedStoryBeatMechanicsV2(structuredClone(first))).toBe(true);
    expect(JSON.stringify(first?.facts)).not.toMatch(
      /headline|action|goal|consequence":"|campaignId|eventId|commandId/u,
    );

    const changed = structuredClone(fixture.after);
    changed.scene = { ...changed.scene, goal: "A different committed goal." };
    const changedSource = { ...fixture.source, goal: changed.scene.goal };
    changed.chronicle = [changedSource];
    expect(projectCommittedStoryBeatMechanicsV2(
      fixture.before,
      changed,
      changedSource,
      changedSource.id,
    )?.sourceFingerprint).not.toBe(first?.sourceFingerprint);
  });

  it("projects real simulation transitions and never interprets their prose", () => {
    let before = createWorld("story-beat-mechanics-real", "campaign:story-beat-mechanics-real");
    let observed: CommittedStoryBeatMechanicsV2 | null = null;
    for (let index = 0; index < 40 && observed === null; index += 1) {
      const after = advanceWorld(before);
      const source = after.chronicle.at(-1);
      observed = projectCommittedStoryBeatMechanicsV2(before, after, source, source?.id);
      before = after;
    }
    expect(observed).not.toBeNull();
    expect(isCommittedStoryBeatMechanicsV2(structuredClone(observed))).toBe(true);
    expect(storyBeatCostMetricsV2).not.toContain("headline");
    expect(storyBeatConsequenceMetricsV2).not.toContain("action");
  });

  it("returns null for no mechanic signal, stale sources, gaps, mismatches, and hostile inputs", () => {
    const fixture = transition(() => undefined);
    expect(project(fixture)).toBeNull();

    const changed = transition((_before, after) => {
      after.hero.health -= 1;
      after.depth.hero.resources.health -= 1;
    });
    expect(projectCommittedStoryBeatMechanicsV2(
      changed.before,
      changed.after,
      changed.source,
      "stale:event",
    )).toBeNull();
    expect(projectCommittedStoryBeatMechanicsV2(
      changed.before,
      { ...changed.after, tick: changed.after.tick + 1 },
      changed.source,
      changed.source.id,
    )).toBeNull();
    expect(projectCommittedStoryBeatMechanicsV2(
      changed.before,
      changed.after,
      { ...changed.source, action: "Forged prose." },
      changed.source.id,
    )).toBeNull();
    expect(projectCommittedStoryBeatMechanicsV2(
      new Proxy(changed.before, {
        get(target, property, receiver) {
          if (property === "campaignId") throw new Error("hostile state getter");
          return Reflect.get(target, property, receiver);
        },
      }),
      changed.after,
      changed.source,
      changed.source.id,
    )).toBeNull();
  });
});

describe("story-beat V2 mechanics validation", () => {
  function validProjection(): CommittedStoryBeatMechanicsV2 {
    const fixture = transition((_before, after) => {
      after.hero.health -= 2;
      after.depth.hero.resources.health -= 2;
      after.hero.experience += 3;
      after.depth.hero.experience += 3;
      const townId = after.depth.atlas.currentLocationId;
      after.depth.towns = {
        ...after.depth.towns,
        [townId]: {
          ...after.depth.towns[townId]!,
          visits: after.depth.towns[townId]!.visits + 1,
        },
      };
    });
    const result = project(fixture);
    if (result === null) throw new Error("Expected valid mechanics projection");
    return structuredClone(result);
  }

  it("requires exact keys, exact arithmetic, strict order, and a derived lens", () => {
    const valid = validProjection();
    expect(isCommittedStoryBeatMechanicsV2(valid)).toBe(true);
    expect(isStoryBeatPublicMechanicsV2(valid.facts)).toBe(true);

    const record = valid as unknown as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const missing = { ...record };
      delete missing[key];
      expect(isCommittedStoryBeatMechanicsV2(missing), `missing ${key}`).toBe(false);
    }
    expect(isCommittedStoryBeatMechanicsV2({ ...valid, hiddenAuthority: true })).toBe(false);
    expect(isStoryBeatPublicMechanicsV2({ ...valid.facts, prose: "invented" })).toBe(false);
    expect(isStoryBeatPublicMechanicsV2({
      ...valid.facts,
      beatLensId: "cost",
    })).toBe(false);
    expect(isStoryBeatPublicMechanicsV2({
      ...valid.facts,
      costs: [{ ...valid.facts.costs[0], amount: 999 }],
    })).toBe(false);
    expect(isStoryBeatPublicMechanicsV2({
      ...valid.facts,
      consequences: [...valid.facts.consequences].reverse(),
    })).toBe(false);
  });

  it("fails closed on sparse arrays, duplicates, proxies, and throwing getters", () => {
    const valid = validProjection();
    const sparse = new Array(1);
    expect(isStoryBeatPublicMechanicsV2({ ...valid.facts, costs: sparse })).toBe(false);
    expect(isStoryBeatPublicMechanicsV2({
      ...valid.facts,
      costs: [valid.facts.costs[0], valid.facts.costs[0]],
    })).toBe(false);
    expect(isCommittedStoryBeatMechanicsV2(new Proxy(valid, {
      ownKeys() {
        throw new Error("hostile ownKeys");
      },
    }))).toBe(false);
    const throwing = Object.defineProperty({ ...valid }, "facts", {
      enumerable: true,
      get() {
        throw new Error("hostile facts getter");
      },
    });
    expect(isCommittedStoryBeatMechanicsV2(throwing)).toBe(false);
  });
});
