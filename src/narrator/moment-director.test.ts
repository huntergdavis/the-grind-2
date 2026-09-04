import { describe, expect, it, vi } from "vitest";

import {
  directNarratorMoment,
  isNarratorMomentDirectorInputV1,
  narratorMomentDirectorPolicyV1,
  narratorMomentEventClasses,
  type CommittedPublicChronicleFactV1,
  type NarratorMomentDirectorInputV1,
  type NarratorMomentEventClass,
  type RecentNarratorMomentV1,
} from "./moment-director";
import {
  isLiveNarratorFormId,
  liveNarratorFormIds,
  type LiveNarratorFormId,
} from "./live-form-selection";

function fact(
  overrides: Partial<CommittedPublicChronicleFactV1> = {},
): CommittedPublicChronicleFactV1 {
  return {
    schemaVersion: 1,
    kind: "committed-public-chronicle-fact",
    visibility: "public",
    committed: true,
    campaignId: "campaign:moment-director",
    eventId: "event:moment-director:20",
    tick: 20,
    sourceFingerprint: "0123456789abcdef",
    activity: "open",
    energy: "steady",
    eventClasses: ["ambient"],
    ...overrides,
  };
}

function input(
  factOverrides: Partial<CommittedPublicChronicleFactV1> = {},
  recentMoments: readonly RecentNarratorMomentV1[] = [],
): NarratorMomentDirectorInputV1 {
  return {
    schemaVersion: 1,
    fact: fact(factOverrides),
    recentMoments,
  };
}

function recent(tick: number, formId: LiveNarratorFormId): RecentNarratorMomentV1 {
  return { tick, formId };
}

function eligible(inputValue: unknown) {
  const decision = directNarratorMoment(inputValue);
  expect(decision.kind).toBe("eligible");
  if (decision.kind !== "eligible") throw new Error("Expected an eligible narrator moment");
  return decision;
}

describe("narrator moment director policy", () => {
  it("freezes the complete fixed priority, cooldown, relax, and fatigue policy", () => {
    expect(narratorMomentDirectorPolicyV1).toEqual({
      schemaVersion: 1,
      maximumEventClasses: 3,
      maximumRecentMoments: 8,
      pressureRelaxTicks: 3,
      fatigueWindowMoments: 4,
      fatigueResetTicks: 8,
      maximumUsesPerFormInFatigueWindow: 1,
      eventClassPriority: ["danger", "discovery", "arrival", "ambient"],
      suppressionPriority: ["invalid-input", "busy", "calm", "cooldown", "relax", "fatigued"],
      minimumTickGapByEventClass: {
        danger: 2,
        discovery: 2,
        arrival: 3,
        ambient: 4,
      },
    });
    expect(Object.isFrozen(narratorMomentDirectorPolicyV1)).toBe(true);
    expect(Object.isFrozen(narratorMomentDirectorPolicyV1.eventClassPriority)).toBe(true);
    expect(Object.isFrozen(narratorMomentDirectorPolicyV1.suppressionPriority)).toBe(true);
    expect(Object.isFrozen(narratorMomentDirectorPolicyV1.minimumTickGapByEventClass)).toBe(true);
    expect(Object.isFrozen(narratorMomentEventClasses)).toBe(true);
  });

  it.each([
    ["danger", "register-pressure", ["pressure-attention", "pressure-feel", "pressure-close"]],
    ["discovery", "establish-setting", ["establish-holds", "establish-gathers", "establish-waits"]],
    ["arrival", "establish-setting", ["establish-holds", "establish-gathers", "establish-waits"]],
    ["ambient", "shade-atmosphere", ["shade-holds-baseline", "shade-rests", "shade-settles", "shade-lingers"]],
  ] as const)("maps %s only to existing production forms", (eventClass, move, formIds) => {
    const decision = eligible(input({ eventClasses: [eventClass] }));
    expect(decision).toMatchObject({ eventClass, move, eligibleFormIds: formIds });
    expect(decision.eligibleFormIds.every(isLiveNarratorFormId)).toBe(true);
    expect(decision.eligibleFormIds.every((formId) => liveNarratorFormIds.includes(formId))).toBe(true);
  });

  it.each([
    [["ambient", "arrival"], "arrival"],
    [["arrival", "discovery"], "discovery"],
    [["ambient", "danger", "discovery"], "danger"],
  ] as const)("resolves declared conflicts by fixed priority: %j", (eventClasses, expected) => {
    const decision = eligible(input({ eventClasses }));
    expect(decision.eventClass).toBe(expected);
  });

  it.each(["busy", "calm"] as const)(
    "suppresses %s presentation before cooldown, relax, or fatigue",
    (activity) => {
      const decision = directNarratorMoment(input(
        { activity, tick: 20, eventClasses: ["danger", "ambient"] },
        [recent(19, "pressure-attention")],
      ));
      expect(decision).toMatchObject({
        kind: "suppressed",
        eventClass: "danger",
        move: "register-pressure",
        suppression: activity,
        eligibleFormIds: [],
      });
    },
  );

  it("applies per-class cooldown at exact committed-tick boundaries", () => {
    expect(directNarratorMoment(input(
      { tick: 20, eventClasses: ["ambient"] },
      [recent(17, "establish-holds")],
    )).suppression).toBe("cooldown");
    expect(eligible(input(
      { tick: 20, eventClasses: ["ambient"] },
      [recent(16, "establish-holds")],
    )).eventClass).toBe("ambient");

    expect(directNarratorMoment(input(
      { tick: 20, eventClasses: ["danger"] },
      [recent(19, "establish-holds")],
    )).suppression).toBe("cooldown");
    expect(eligible(input(
      { tick: 20, eventClasses: ["danger"] },
      [recent(18, "establish-holds")],
    )).eventClass).toBe("danger");
  });

  it("holds a fixed relax period after pressure and releases on its boundary", () => {
    expect(directNarratorMoment(input(
      { tick: 20, eventClasses: ["danger"] },
      [recent(18, "pressure-attention")],
    )).suppression).toBe("relax");

    const released = eligible(input(
      { tick: 20, eventClasses: ["danger"] },
      [recent(17, "pressure-attention")],
    ));
    expect(released.eligibleFormIds).not.toContain("pressure-attention");
    expect(released.eligibleFormIds).toEqual(["pressure-feel", "pressure-close"]);
  });

  it("filters fatigued forms, including the immediately previous form", () => {
    const decision = eligible(input(
      { tick: 30, eventClasses: ["ambient"] },
      [recent(23, "shade-rests"), recent(24, "shade-settles")],
    ));
    expect(decision.eligibleFormIds).toEqual(["shade-holds-baseline", "shade-lingers"]);
    expect(decision.eligibleFormIds).not.toContain("shade-settles");
  });

  it("suppresses when the bounded fatigue window exhausts a move's forms", () => {
    const decision = directNarratorMoment(input(
      { tick: 30, eventClasses: ["ambient"] },
      [
        recent(23, "shade-holds-baseline"),
        recent(24, "shade-rests"),
        recent(25, "shade-settles"),
        recent(26, "shade-lingers"),
      ],
    ));
    expect(decision).toMatchObject({
      kind: "suppressed",
      eventClass: "ambient",
      suppression: "fatigued",
      eligibleFormIds: [],
    });
  });

  it("recovers from fatigue at the exact committed-tick reset boundary", () => {
    const history = [
      recent(23, "shade-holds-baseline"),
      recent(24, "shade-rests"),
      recent(25, "shade-settles"),
      recent(26, "shade-lingers"),
    ] as const;
    expect(directNarratorMoment(input(
      { tick: 30, eventClasses: ["ambient"] },
      history,
    )).suppression).toBe("fatigued");

    const recovered = eligible(input(
      { tick: 31, eventClasses: ["ambient"] },
      history,
    ));
    expect(recovered.eligibleFormIds).toEqual(["shade-holds-baseline"]);
    expect(recovered.eligibleFormIds).not.toContain("shade-lingers");
  });
});

describe("narrator moment director hostile input boundary", () => {
  it("accepts only an exact committed public Chronicle projection", () => {
    expect(isNarratorMomentDirectorInputV1(input())).toBe(true);
    const hostile: unknown[] = [
      null,
      "ambient",
      { ...input(), extra: true },
      input({ committed: false as true }),
      input({ visibility: "secret" as "public" }),
      input({ sourceFingerprint: "not-a-fingerprint" }),
      input({ eventClasses: [] }),
      input({ eventClasses: ["ambient", "ambient"] }),
      input({ eventClasses: ["danger", "discovery", "arrival", "ambient"] }),
      input({ eventClasses: ["unknown" as NarratorMomentEventClass] }),
      { ...input(), recentMoments: [recent(20, "shade-rests")] },
      { ...input(), recentMoments: [recent(10, "shade-rests"), recent(9, "shade-settles")] },
      { ...input(), recentMoments: [recent(10, "shade-rests"), recent(10, "shade-settles")] },
      { ...input(), recentMoments: Array.from({ length: 9 }, (_, index) =>
        recent(index, "shade-rests")) },
      { ...input(), recentMoments: [{ tick: 10, formId: "unknown-form" }] },
      { ...input(), recentMoments: [{ ...recent(10, "shade-rests"), extra: true }] },
    ];
    const sparse = input();
    const sparseMoments = new Array(1) as RecentNarratorMomentV1[];
    hostile.push({ ...sparse, recentMoments: sparseMoments });

    for (const value of hostile) {
      expect(isNarratorMomentDirectorInputV1(value)).toBe(false);
      const decision = directNarratorMoment(value);
      expect(decision).toBe(directNarratorMoment(value));
      expect(decision).toEqual({
        schemaVersion: 1,
        kind: "suppressed",
        eventClass: null,
        move: null,
        suppression: "invalid-input",
        eligibleFormIds: [],
      });
      expect(Object.isFrozen(decision)).toBe(true);
      expect(Object.isFrozen(decision.eligibleFormIds)).toBe(true);
    }
  });

  it("fails closed when hostile reflection throws", () => {
    const hostile = new Proxy({}, {
      ownKeys: () => {
        throw new Error("hostile ownKeys");
      },
    });
    expect(() => isNarratorMomentDirectorInputV1(hostile)).not.toThrow();
    expect(directNarratorMoment(hostile).suppression).toBe("invalid-input");
  });
});

describe("narrator moment director replay contract", () => {
  it("is replay-stable, immutable, and independent of clocks and randomness", () => {
    const value = input(
      { tick: 40, eventClasses: ["ambient", "discovery"], energy: "heightened" },
      [recent(31, "shade-rests"), recent(35, "establish-holds")],
    );
    const before = structuredClone(value);
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("Date.now is forbidden");
    });
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random is forbidden");
    });
    try {
      const first = directNarratorMoment(value);
      const replay = directNarratorMoment(structuredClone(value));
      expect(replay).toEqual(first);
      expect(value).toEqual(before);
      expect(Object.isFrozen(first)).toBe(true);
      expect(Object.isFrozen(first.eligibleFormIds)).toBe(true);
      expect(first).toMatchObject({
        kind: "eligible",
        eventClass: "discovery",
        move: "establish-setting",
        eligibleFormIds: ["establish-gathers", "establish-waits"],
      });
    } finally {
      dateNow.mockRestore();
      random.mockRestore();
    }
  });
});
