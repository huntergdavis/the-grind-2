import { describe, expect, it, vi } from "vitest";

import type { LiveNarratorFormId } from "./live-form-selection";
import {
  narratorMomentEventClasses,
  type CommittedPublicChronicleFactV1,
  type NarratorMomentDirectorInputV1,
  type NarratorMomentEventClass,
  type RecentNarratorMomentV1,
} from "./moment-director";
import {
  isPendingNarratorMomentV1,
  narratorMomentOpportunityMaximumAgeTicks,
  projectNarratorMomentOpportunityV1,
  retainNarratorMomentOpportunityV1,
} from "./moment-opportunity";

const campaignId = "campaign:moment-opportunity";

function fact(
  eventClass: NarratorMomentEventClass,
  tick: number,
  overrides: Partial<CommittedPublicChronicleFactV1> = {},
): CommittedPublicChronicleFactV1 {
  return {
    schemaVersion: 1,
    kind: "committed-public-chronicle-fact",
    visibility: "public",
    committed: true,
    campaignId,
    eventId: campaignId + ":event:" + String(tick) + ":" + eventClass,
    tick,
    sourceFingerprint: tick.toString(16).padStart(16, "0"),
    activity: "open",
    energy: "steady",
    eventClasses: [eventClass],
    ...overrides,
  };
}

function input(
  eventClass: NarratorMomentEventClass,
  tick: number,
  recentMoments: readonly RecentNarratorMomentV1[] = [],
  overrides: Partial<CommittedPublicChronicleFactV1> = {},
): NarratorMomentDirectorInputV1 {
  return {
    schemaVersion: 1,
    fact: fact(eventClass, tick, overrides),
    recentMoments,
  };
}

function recent(tick: number, formId: LiveNarratorFormId): RecentNarratorMomentV1 {
  return { tick, formId };
}

function context(currentTick: number, currentCampaignId = campaignId) {
  return { campaignId: currentCampaignId, currentTick };
}

const rankByEventClass: Readonly<Record<NarratorMomentEventClass, number>> = {
  danger: 4,
  discovery: 3,
  arrival: 2,
  ambient: 1,
};

describe("one-slot narrator moment opportunity", () => {
  it("freezes the exact canonical-tick expiry policy", () => {
    expect(narratorMomentOpportunityMaximumAgeTicks).toBe(4);
  });

  it.each(narratorMomentEventClasses)(
    "admits one current eligible %s fact and recomputes its exact decision",
    (eventClass) => {
      const candidate = input(eventClass, 20);
      const retained = retainNarratorMomentOpportunityV1(
        null,
        candidate,
        context(20),
      );
      expect(isPendingNarratorMomentV1(retained)).toBe(true);
      expect(retained).not.toBe(candidate);
      expect(retained?.directorInput).toEqual(candidate);
      expect(Object.isFrozen(retained)).toBe(true);
      expect(Object.isFrozen(retained?.directorInput)).toBe(true);
      expect(Object.isFrozen(retained?.directorInput.fact)).toBe(true);
      expect(Object.isFrozen(retained?.directorInput.fact.eventClasses)).toBe(true);
      expect(Object.isFrozen(retained?.directorInput.recentMoments)).toBe(true);
      expect(projectNarratorMomentOpportunityV1(retained, context(20))).toMatchObject({
        fact: candidate.fact,
        decision: {
          kind: "eligible",
          eventClass,
          suppression: null,
        },
        ageTicks: 0,
        timing: "current",
      });
      expect(Object.isFrozen(candidate)).toBe(false);
      expect(Object.isFrozen(candidate.fact)).toBe(false);
    },
  );

  it.each([
    ["invalid-input", {}],
    ["busy", input("danger", 20, [], { activity: "busy" })],
    ["calm", input("danger", 20, [], { activity: "calm" })],
    ["cooldown", input("danger", 20, [recent(19, "establish-holds")])],
    ["relax", input("danger", 20, [recent(18, "pressure-attention")])],
    ["fatigued", input("ambient", 30, [
      recent(23, "shade-holds-baseline"),
      recent(24, "shade-rests"),
      recent(25, "shade-settles"),
      recent(26, "shade-lingers"),
    ])],
  ] as const)("rejects the director's %s suppression path", (_reason, candidate) => {
    const tick = "fact" in candidate ? candidate.fact.tick : 20;
    expect(retainNarratorMomentOpportunityV1(
      null,
      candidate,
      context(tick),
    )).toBeNull();
  });

  const priorityCases = narratorMomentEventClasses.flatMap((currentClass) =>
    narratorMomentEventClasses.map((candidateClass) => [
      currentClass,
      candidateClass,
      rankByEventClass[candidateClass] >= rankByEventClass[currentClass]
        ? "candidate"
        : "current",
    ] as const));

  it.each(priorityCases)(
    "ranks a %s incumbent against a newer %s candidate by class before recency",
    (currentClass, candidateClass, expected) => {
      const current = retainNarratorMomentOpportunityV1(
        null,
        input(currentClass, 10),
        context(10),
      );
      const selected = retainNarratorMomentOpportunityV1(
        current,
        input(candidateClass, 11),
        context(11),
      );
      expect(selected?.directorInput.fact.tick).toBe(expected === "candidate" ? 11 : 10);
    },
  );

  it("uses the newer fact only when class priority ties", () => {
    const current = retainNarratorMomentOpportunityV1(
      null,
      input("discovery", 10),
      context(10),
    );
    expect(retainNarratorMomentOpportunityV1(
      current,
      input("discovery", 11),
      context(11),
    )?.directorInput.fact.tick).toBe(11);
  });

  it("preserves the incumbent for exact duplicates and every same-tick conflict", () => {
    const source = input("ambient", 10);
    const current = retainNarratorMomentOpportunityV1(null, source, context(10));
    const duplicate = retainNarratorMomentOpportunityV1(
      current,
      structuredClone(source),
      context(10),
    );
    expect(duplicate).toEqual(current);

    const conflict = input("danger", 10, [], {
      eventId: campaignId + ":event:10:forged",
      sourceFingerprint: "fedcba9876543210",
    });
    const selected = retainNarratorMomentOpportunityV1(current, conflict, context(10));
    expect(selected?.directorInput.fact.eventId).toBe(source.fact.eventId);
    expect(selected?.directorInput.fact.eventClasses).toEqual(["ambient"]);
  });

  it("labels held timing and expires immediately after age four", () => {
    const retained = retainNarratorMomentOpportunityV1(
      null,
      input("arrival", 8),
      context(8),
    );
    expect(projectNarratorMomentOpportunityV1(retained, context(9))).toMatchObject({
      ageTicks: 1,
      timing: "held",
    });
    const boundary = retainNarratorMomentOpportunityV1(
      retained,
      null,
      context(8 + narratorMomentOpportunityMaximumAgeTicks),
    );
    expect(projectNarratorMomentOpportunityV1(
      boundary,
      context(8 + narratorMomentOpportunityMaximumAgeTicks),
    )).toMatchObject({ ageTicks: 4, timing: "held" });
    expect(retainNarratorMomentOpportunityV1(
      boundary,
      null,
      context(8 + narratorMomentOpportunityMaximumAgeTicks + 1),
    )).toBeNull();
  });

  it("does not let invalid or lower-priority offers evict or refresh a valid slot", () => {
    const strong = retainNarratorMomentOpportunityV1(
      null,
      input("danger", 10),
      context(10),
    );
    const afterInvalid = retainNarratorMomentOpportunityV1(
      strong,
      input("ambient", 11, [], { activity: "calm" }),
      context(11),
    );
    expect(afterInvalid?.directorInput.fact.tick).toBe(10);
    const afterLowerPriority = retainNarratorMomentOpportunityV1(
      afterInvalid,
      input("ambient", 12),
      context(12),
    );
    expect(afterLowerPriority?.directorInput.fact.tick).toBe(10);
    expect(retainNarratorMomentOpportunityV1(
      afterLowerPriority,
      null,
      context(15),
    )).toBeNull();
  });

  it("rejects stale, future, and cross-campaign candidate admission", () => {
    expect(retainNarratorMomentOpportunityV1(
      null,
      input("danger", 19),
      context(20),
    )).toBeNull();
    expect(retainNarratorMomentOpportunityV1(
      null,
      input("danger", 21),
      context(20),
    )).toBeNull();
    expect(retainNarratorMomentOpportunityV1(
      null,
      input("danger", 20, [], { campaignId: "campaign:other" }),
      context(20),
    )).toBeNull();
  });

  it("drops a cross-campaign incumbent before considering candidates", () => {
    const retained = retainNarratorMomentOpportunityV1(
      null,
      input("danger", 10),
      context(10),
    );
    expect(retainNarratorMomentOpportunityV1(
      retained,
      null,
      context(10, "campaign:other"),
    )).toBeNull();
  });

  it("rejects malformed state, extra keys, sparse arrays, and invalid contexts", () => {
    const validCandidate = input("discovery", 10);
    const sparseClasses = new Array(1) as NarratorMomentEventClass[];
    const malformedCandidates: unknown[] = [
      { ...validCandidate, extra: true },
      { ...validCandidate, fact: { ...validCandidate.fact, hidden: true } },
      { ...validCandidate, fact: { ...validCandidate.fact, eventClasses: sparseClasses } },
      { ...validCandidate, recentMoments: [{ tick: 9, formId: "unknown" }] },
    ];
    for (const candidate of malformedCandidates) {
      expect(retainNarratorMomentOpportunityV1(
        null,
        candidate,
        context(10),
      )).toBeNull();
    }

    const valid = retainNarratorMomentOpportunityV1(
      null,
      validCandidate,
      context(10),
    );
    expect(isPendingNarratorMomentV1({ ...valid, extra: true })).toBe(false);
    expect(isPendingNarratorMomentV1({
      ...valid,
      directorInput: input("danger", 10, [], { activity: "calm" }),
    })).toBe(false);
    expect(retainNarratorMomentOpportunityV1(
      valid,
      null,
      { ...context(10), extra: true },
    )).toBeNull();
  });

  it("drops a malformed incumbent and still admits a valid current candidate", () => {
    const selected = retainNarratorMomentOpportunityV1(
      { schemaVersion: 1, kind: "pending-narrator-moment", directorInput: {} },
      input("arrival", 12),
      context(12),
    );
    expect(selected?.directorInput.fact.eventClasses).toEqual(["arrival"]);
  });

  it("fails closed when hostile reflection throws", () => {
    const hostile = new Proxy({}, {
      ownKeys: () => {
        throw new Error("hostile ownKeys");
      },
    });
    expect(() => isPendingNarratorMomentV1(hostile)).not.toThrow();
    expect(isPendingNarratorMomentV1(hostile)).toBe(false);
    expect(() => retainNarratorMomentOpportunityV1(
      hostile,
      hostile,
      hostile,
    )).not.toThrow();
    expect(retainNarratorMomentOpportunityV1(hostile, hostile, hostile)).toBeNull();
    expect(projectNarratorMomentOpportunityV1(hostile, hostile)).toBeNull();
  });

  it("rejects changing accessors without emitting an invalid pending moment", () => {
    const original = input("danger", 10);
    const changed = input("danger", 10, [], { activity: "busy" });
    let reads = 0;
    const candidate = {
      ...original,
      get fact() {
        reads += 1;
        return reads < 5 ? original.fact : changed.fact;
      },
    };
    expect(retainNarratorMomentOpportunityV1(null, candidate, context(10))).toBeNull();
    expect(reads).toBe(0);
  });

  it("keeps a valid incumbent when incoming data contains a throwing accessor or proxy", () => {
    const current = retainNarratorMomentOpportunityV1(null, input("danger", 10), context(10));
    const getter = vi.fn(() => { throw new Error("caller accessor"); });
    const candidate = Object.defineProperty(input("danger", 11), "fact", {
      enumerable: true,
      get: getter,
    });
    const proxy = new Proxy({}, {
      ownKeys() { throw new Error("caller reflection"); },
    });
    for (const incoming of [candidate, proxy]) {
      expect(retainNarratorMomentOpportunityV1(current, incoming, context(11))).toEqual(current);
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it("admits a valid candidate when a hostile incumbent cannot be read", () => {
    const getter = vi.fn(() => { throw new Error("caller accessor"); });
    const current = Object.defineProperty({
      schemaVersion: 1,
      kind: "pending-narrator-moment",
    }, "directorInput", { enumerable: true, get: getter });
    const selected = retainNarratorMomentOpportunityV1(current, input("arrival", 10), context(10));
    expect(selected?.directorInput.fact.eventClasses).toEqual(["arrival"]);
    expect(isPendingNarratorMomentV1(selected)).toBe(true);
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects context accessors without executing them", () => {
    const getter = vi.fn(() => { throw new Error("caller clock"); });
    const hostileContext = Object.defineProperty({ campaignId }, "currentTick", {
      enumerable: true,
      get: getter,
    });
    const current = retainNarratorMomentOpportunityV1(null, input("danger", 10), context(10));
    expect(retainNarratorMomentOpportunityV1(current, null, hostileContext)).toBeNull();
    expect(projectNarratorMomentOpportunityV1(current, hostileContext)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects a proxy reporting a different key set from its descriptors", () => {
    const hostileContext = new Proxy(context(10), {
      ownKeys: () => ["bogus-a", "bogus-b"],
    });
    expect(retainNarratorMomentOpportunityV1(null, input("danger", 10), hostileContext)).toBeNull();
  });

  it("copies and freezes nonempty history and every projected decision child", () => {
    const candidate = input("discovery", 20, [recent(16, "establish-holds")]);
    const retained = retainNarratorMomentOpportunityV1(null, candidate, context(20));
    const view = projectNarratorMomentOpportunityV1(retained, context(21));
    expect(retained?.directorInput.recentMoments[0]).not.toBe(candidate.recentMoments[0]);
    expect(Object.isFrozen(retained?.directorInput.recentMoments[0])).toBe(true);
    expect(Object.isFrozen(candidate.recentMoments[0])).toBe(false);
    expect(view?.decision.eligibleFormIds).toEqual(["establish-gathers", "establish-waits"]);
    for (const child of [view, view?.fact, view?.fact.eventClasses, view?.decision, view?.decision.eligibleFormIds]) {
      expect(child).toBeDefined();
      expect(Object.isFrozen(child)).toBe(true);
    }
  });

  it("is replay-stable, non-mutating, and independent of clocks and randomness", () => {
    const currentCandidate = input("ambient", 10);
    const currentCandidateBefore = structuredClone(currentCandidate);
    const current = retainNarratorMomentOpportunityV1(
      null,
      currentCandidate,
      context(10),
    );
    const candidate = input("discovery", 12);
    const candidateBefore = structuredClone(candidate);
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("Date.now is forbidden");
    });
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random is forbidden");
    });
    try {
      const first = retainNarratorMomentOpportunityV1(
        current,
        candidate,
        context(12),
      );
      const replay = retainNarratorMomentOpportunityV1(
        structuredClone(current),
        structuredClone(candidate),
        context(12),
      );
      expect(replay).toEqual(first);
      expect(projectNarratorMomentOpportunityV1(first, context(12)))
        .toEqual(projectNarratorMomentOpportunityV1(replay, context(12)));
      expect(currentCandidate).toEqual(currentCandidateBefore);
      expect(candidate).toEqual(candidateBefore);
    } finally {
      dateNow.mockRestore();
      random.mockRestore();
    }
  });
});
