import { describe, expect, it } from "vitest";
import { buildCreativeMomentMessages, momentForChoice, normalizeCreativeMomentSelection } from "./creative-moment";
import type { StoryBeatJobV1 } from "./story-beat";

const current: StoryBeatJobV1 = {
  schemaVersion: 1,
  task: "author-story-beat",
  disposition: "manual-ephemeral-noncanonical",
  campaignId: "private-campaign-id",
  eventId: "private-current-event",
  tick: 123456789,
  sourceFingerprint: "private-current-fingerprint",
  facts: {
    schemaVersion: 1,
    kind: "public-story-beat",
    location: "Greyford",
    headline: "A sealed arch remains unexplored.",
    action: "Mara studies the sealed arch.",
    consequence: "The arch remains unopened.",
  },
  deterministicFallback: "private-current-fallback",
  maximumInputTokens: 320,
  maximumOutputTokens: 48,
};

const milestone: StoryBeatJobV1 = {
  ...current,
  eventId: "private-farewell-event",
  tick: 987654321,
  sourceFingerprint: "private-farewell-fingerprint",
  facts: {
    schemaVersion: 1,
    kind: "public-story-beat",
    location: "Eldermere",
    headline: "Rowan leaves the company.",
    action: "Mara and Rowan part at Eldermere.",
    consequence: "Rowan is injured and alive; Mara travels alone.",
  },
  deterministicFallback: "private-farewell-fallback",
};

describe("closed creative moment choices", () => {
  it("maps exact labels to their fixed candidates", () => {
    expect(momentForChoice("1")).toBe("current");
    expect(momentForChoice("2")).toBe("milestone");
  });

  it.each([undefined, null, "", "3", " 1", "1 ", "1\n", "1.", "01", "current", "milestone", "Choose 1", 1, 2, true, {}, ["1"]])(
    "preserves milestone priority for invalid %j without coercion", (raw) => {
      expect(momentForChoice(raw)).toBe("milestone");
    },
  );
});

describe("captured moment-selection provenance", () => {
  it.each([
    { choice: "current", origin: "model" },
    { choice: "milestone", origin: "model", kind: "farewell-remembrance" },
    { choice: "milestone", origin: "default", kind: "farewell-remembrance" },
    { choice: "milestone", origin: "model", kind: "first-shared-victory" },
    { choice: "milestone", origin: "default", kind: "first-shared-victory" },
  ])("normalizes valid %j into a frozen independent value", (source) => {
    const before = structuredClone(source);
    const value = normalizeCreativeMomentSelection(source);
    expect(value).toEqual(source);
    expect(value).not.toBe(source);
    expect(Object.isFrozen(value)).toBe(true);
    expect(source).toEqual(before);
    expect(normalizeCreativeMomentSelection(before)).toBe(value);
  });

  it.each([
    undefined, null, "current", [], {},
    { choice: "current" }, { origin: "model" },
    { choice: "current", origin: "default" },
    { choice: "current", origin: "MODEL" },
    { choice: "current", origin: "model", kind: "farewell-remembrance" },
    { choice: "current", origin: "model", extra: "private" },
    { choice: "milestone", origin: "model" },
    { choice: "milestone", origin: "default" },
    { choice: "milestone", origin: "model", kind: "other-milestone" },
    { choice: "milestone", origin: "model", kind: "farewell-remembrance", extra: "private" },
    { choice: "milestone", origin: "MODEL", kind: "farewell-remembrance" },
    { choice: "current", origin: "model", kind: "first-shared-victory" },
    { choice: "milestone", origin: "model", kind: "first-shared-victory", extra: "private" },
    { choice: "milestone", origin: "MODEL", kind: "first-shared-victory" },
    { choice: "milestone", origin: "model", kind: "first-shared-victory " },
    { choice: "elsewhere", origin: "model", kind: "farewell-remembrance" },
  ])("rejects invalid or unsupported attribution %j", (raw) => {
    expect(normalizeCreativeMomentSelection(raw)).toBeNull();
  });

  it("rejects throwing caller accessors without leaking errors", () => {
    const raw = { choice: "current", get origin(): string { throw new Error("untrusted getter"); } };
    expect(normalizeCreativeMomentSelection(raw)).toBeNull();
  });
});

describe("bounded public moment comparison", () => {
  it("preserves every default farewell prompt byte when the explicit kind is supplied", () => {
    expect(JSON.stringify(buildCreativeMomentMessages(current, milestone, "farewell-remembrance")))
      .toBe(JSON.stringify(buildCreativeMomentMessages(current, milestone)));
  });

  it.each([false, true])("changes only the offered label for a public first victory, injured=%s", (injured) => {
    const victory = { ...milestone, facts: {
      ...milestone.facts, headline: "Mara and Rowan won their first fight.",
      action: "The pair defeated the roadside bandit.",
      consequence: injured ? "Rowan is alive and injured after the victory." : "Both companions are uninjured after the victory.",
    } };
    const before = structuredClone(victory);
    const farewell = buildCreativeMomentMessages(current, victory);
    const messages = buildCreativeMomentMessages(current, victory, "first-shared-victory");
    expect(messages[0]).toEqual(farewell[0]);
    expect(messages[1]!.content).toBe(farewell[1]!.content.replace("2 Recorded companion farewell", "2 Recorded first shared victory"));
    expect(messages[1]!.content).toContain(victory.facts.headline);
    expect(messages[1]!.content).toContain(victory.facts.consequence);
    expect(messages[1]!.content).not.toContain("Recorded companion farewell");
    expect(messages[1]!.content).not.toContain(victory.eventId);
    expect(messages[1]!.content).not.toContain(victory.sourceFingerprint);
    expect(messages[1]!.content).not.toContain("pride");
    expect(messages[1]!.content).not.toContain("relief");
    expect(Object.isFrozen(messages)).toBe(true);
    expect(messages.every(Object.isFrozen)).toBe(true);
    expect(victory).toEqual(before);
  });

  it("keeps an exact two-message prompt with current first and farewell second", () => {
    expect(buildCreativeMomentMessages(current, milestone)).toEqual([
      { role: "system", content: "Choose which recorded moment would make the more compelling brief fantasy intermission. Select a story subject, not a new event. Reply with only 1 or 2." },
      { role: "user", content: "1 Current public scene\nPlace: Greyford\nMoment: A sealed arch remains unexplored.\n"
        + "Action: Mara studies the sealed arch.\nChanged: The arch remains unopened.\n\n"
        + "2 Recorded companion farewell\nPlace: Eldermere\nMoment: Rowan leaves the company.\n"
        + "Action: Mara and Rowan part at Eldermere.\nChanged: Rowan is injured and alive; Mara travels alone.\n\n"
        + "Use only these public snippets. Choose 1 or 2." },
    ]);
  });

  it("reads only public facts, not identities, chronology, fallbacks or attached memory", () => {
    const source = { ...milestone, remembrance: { oath: "private-oath-memory" }, privateMood: "private-mood" };
    const prompt = JSON.stringify(buildCreativeMomentMessages(current, source));
    for (const hidden of [current.campaignId, current.eventId, milestone.eventId, current.sourceFingerprint,
      milestone.sourceFingerprint, current.deterministicFallback, milestone.deterministicFallback,
      String(current.tick), String(milestone.tick), "private-oath-memory", "private-mood"]) {
      expect(prompt).not.toContain(hidden);
    }
    expect(prompt).toContain("Rowan is injured and alive");
    expect(prompt).toContain("Mara travels alone");
    expect(prompt).not.toContain("earlier");
    expect(prompt).not.toContain("recover");
    expect(prompt).not.toContain("grief");
  });

  it("does not reorder candidates by tick or alter captured public facts", () => {
    const messages = buildCreativeMomentMessages({ ...current, tick: 1 }, { ...milestone, tick: 2 });
    expect(messages[1]!.content.indexOf("Greyford")).toBeLessThan(messages[1]!.content.indexOf("Eldermere"));
    expect(buildCreativeMomentMessages({ ...current, tick: 2 }, { ...milestone, tick: 1 })).toEqual(messages);
  });

  it.each(["x", "界", "🌙"])("bounds both candidates' %s snippets by characters and UTF-8 bytes", (symbol) => {
    const huge = symbol.repeat(500);
    const facts = { ...current.facts, location: huge, headline: huge, action: huge, consequence: huge };
    const messages = buildCreativeMomentMessages({ ...current, facts }, { ...milestone, facts });
    const caps = { Place: 24, Moment: 40, Action: 48, Changed: 64 };
    let variableBytes = 0;
    for (const [label, cap] of Object.entries(caps)) {
      const snippets = messages[1]!.content.split("\n").filter((line) => line.startsWith(`${label}: `))
        .map((line) => line.slice(label.length + 2));
      expect(snippets).toHaveLength(2);
      for (const snippet of snippets) {
        const size = new TextEncoder().encode(snippet).length;
        variableBytes += size;
        expect(snippet.length).toBeLessThanOrEqual(cap);
        expect(size).toBeLessThanOrEqual(cap);
        expect(snippet.endsWith("…")).toBe(true);
        expect(snippet).not.toMatch(/[\p{Cs}]/u);
      }
    }
    expect(variableBytes).toBeLessThanOrEqual(352);
    expect(new TextEncoder().encode(messages.map(({ content }) => content).join("\n")).length).toBeLessThan(680);
  });

  it("normalizes ordinary whitespace but omits unsafe-control snippets", () => {
    const job = { ...current, facts: { ...current.facts, location: " Grey\nford\t", action: "forged\u0000action", consequence: "hidden\u202Eending" } };
    const prompt = buildCreativeMomentMessages(job, milestone)[1]!.content;
    expect(prompt).toContain("Place: Grey ford");
    expect(prompt).not.toContain("forged");
    expect(prompt).not.toContain("hidden");
    expect(prompt).not.toMatch(/[\u0000\u202E]/u);
  });

  it("returns frozen deterministic messages without mutating either job", () => {
    const before = structuredClone({ current, milestone });
    const result = buildCreativeMomentMessages(current, milestone);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.every(Object.isFrozen)).toBe(true);
    expect(buildCreativeMomentMessages(current, milestone)).toEqual(result);
    expect({ current, milestone }).toEqual(before);
  });
});
