import { describe, expect, it } from "vitest";
import {
  buildCreativeDirectionMessages,
  defaultNarrativeDirection,
  directionChoiceForStage,
  directionForChoice,
  narrativeStageLabels,
  normalizeNarrativeDirection,
} from "./creative-direction";
import type { CreativeStoryViewpoint } from "./creative-story";
import type { StoryBeatJobV1 } from "./story-beat";

const job: StoryBeatJobV1 = {
  schemaVersion: 1,
  task: "author-story-beat",
  disposition: "manual-ephemeral-noncanonical",
  campaignId: "private-campaign-token",
  eventId: "private-event-token",
  tick: 123456789,
  sourceFingerprint: "private-fingerprint-token",
  facts: { schemaVersion: 1, kind: "public-story-beat", location: "Greyford", headline: "An oath reaches its destination.",
    action: "Mara and Rowan arrive together.", consequence: "Rowan remains injured and alive." },
  deterministicFallback: "private-fallback-token",
  maximumInputTokens: 320,
  maximumOutputTokens: 48,
};

const viewpoint: CreativeStoryViewpoint = {
  hero: { name: "Mara", values: ["loyalty", "mercy"] },
  companion: { name: "Rowan", role: "miller", status: "arrived-injured", purpose: "shared-road-oath", victories: 987654321 },
};

describe("local DM presentation choices", () => {
  it.each([["1", "parchment"], ["2", "orrery"], ["3", "moth-court"]] as const)("maps exact label %s to model-directed %s", (choice, stage) => {
    const direction = directionForChoice(choice);
    expect(direction).toEqual({ stage, origin: "model" });
    expect(Object.isFrozen(direction)).toBe(true);
    expect(directionChoiceForStage(stage)).toBe(choice);
  });

  it.each([undefined, null, 1, 2, 3, true, "", " 1", "1 ", "2\n", "3.", "01", "orrery", "Choose 2", {}, ["1"]])(
    "uses the baseline for any nonliteral choice %j", (choice) => {
      expect(directionForChoice(choice)).toBe(defaultNarrativeDirection);
    },
  );

  it("exposes frozen human labels and an explicitly non-model baseline", () => {
    expect(narrativeStageLabels).toEqual({ parchment: "Crimson Chronicle", orrery: "Impossible Orrery", "moth-court": "Moth Court" });
    expect(Object.isFrozen(narrativeStageLabels)).toBe(true);
    expect(defaultNarrativeDirection).toEqual({ stage: "parchment", origin: "default" });
    expect(Object.isFrozen(defaultNarrativeDirection)).toBe(true);
  });

  it.each(["parchment", "orrery", "moth-court"] as const)("normalizes a valid model %s without retaining caller-owned objects", (stage) => {
    const source = { stage, origin: "model" };
    const normalized = normalizeNarrativeDirection(source);
    expect(normalized).toEqual(source);
    expect(normalized).not.toBe(source);
    expect(Object.isFrozen(normalized)).toBe(true);
  });

  it.each([
    undefined, null, [], "orrery", { stage: "orrery" }, { origin: "model" },
    { stage: "unknown", origin: "model" }, { stage: "orrery", origin: "MODEL" },
    { stage: "parchment", origin: "default" }, { stage: "orrery", origin: "default" },
    { stage: "moth-court", origin: "default" }, { stage: "parchment", origin: "model", extra: "untrusted" },
  ])("fails closed for incomplete, invalid or unearned directions %j", (value) => {
    expect(normalizeNarrativeDirection(value)).toBe(defaultNarrativeDirection);
  });

  it("fails closed for a throwing input accessor", () => {
    const value = { stage: "orrery", get origin(): string { throw new Error("untrusted getter"); } };
    expect(normalizeNarrativeDirection(value)).toBe(defaultNarrativeDirection);
  });
});

describe("bounded public direction prompt", () => {
  it("preserves the original full-choice prompt byte for byte when no previous stage is supplied", () => {
    expect(buildCreativeDirectionMessages(job, viewpoint, "shared-road")).toEqual([
      { role: "system", content: "Direct an imagined fantasy intermission, not game events. Choose its presentation. Reply with only 1, 2, or 3." },
      { role: "user", content: "1 Crimson Chronicle: intimate vows, farewells, private doubt; crimson parchment.\n"
        + "2 Impossible Orrery: wonder, discovery, unanswered questions; impossible stars.\n"
        + "3 Moth Court: mischief, awkward company, uneasy relief; paper-moth shadow theatre.\n"
        + "All are imagined staging, not events, creatures, or predictions.\n"
        + "Public scene snippets:\nPlace: Greyford\nMoment: An oath reaches its destination.\n"
        + "Action: Mara and Rowan arrive together.\nChanged: Rowan remains injured and alive.\n"
        + "Focus: shared road\nHero: Mara; loyalty, mercy\nCompanion: Rowan; arrived-injured\nChoose 1, 2, or 3." },
    ]);
  });

  it.each([
    ["parchment", "2 or 3", ["2 Impossible Orrery", "3 Moth Court"]],
    ["orrery", "1 or 3", ["1 Crimson Chronicle", "3 Moth Court"]],
    ["moth-court", "1 or 2", ["1 Crimson Chronicle", "2 Impossible Orrery"]],
  ] as const)("omits the last shown %s stage and requests only the remaining labels", (previous, labels, offered) => {
    const before = structuredClone({ job, viewpoint });
    const messages = buildCreativeDirectionMessages(job, viewpoint, "shared-road", previous);
    expect(messages[0]!.content.endsWith(`Reply with only ${labels}.`)).toBe(true);
    expect(messages[1]!.content.endsWith(`Choose ${labels}.`)).toBe(true);
    expect(messages[1]!.content).not.toContain(narrativeStageLabels[previous]);
    expect(messages[1]!.content.split("\n").filter((line) => /^[123] /u.test(line))).toHaveLength(2);
    expect(messages[1]!.content.indexOf(offered[0])).toBeLessThan(messages[1]!.content.indexOf(offered[1]));
    expect(messages[1]!.content).toContain("Changed: Rowan remains injured and alive.");
    expect(messages[1]!.content).toContain("Companion: Rowan; arrived-injured");
    expect(messages[1]!.content).toContain("not events, creatures, or predictions");
    expect(messages[1]!.content).not.toContain("previous");
    expect(Object.isFrozen(messages)).toBe(true);
    expect(messages.every(Object.isFrozen)).toBe(true);
    expect(buildCreativeDirectionMessages(job, viewpoint, "shared-road", previous)).toEqual(messages);
    expect({ job, viewpoint }).toEqual(before);
  });

  it("offers one fixed ordering and asks only for a presentation label", () => {
    const messages = buildCreativeDirectionMessages(job, viewpoint, "shared-road");
    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(messages[0]!.content).toContain("not game events");
    const prompt = messages[1]!.content;
    expect(prompt.indexOf("1 Crimson Chronicle")).toBeLessThan(prompt.indexOf("2 Impossible Orrery"));
    expect(prompt.indexOf("2 Impossible Orrery")).toBeLessThan(prompt.indexOf("3 Moth Court"));
    expect(prompt).toContain("not events, creatures, or predictions");
    expect(prompt).toContain("Choose 1, 2, or 3.");
    for (const fact of Object.values(job.facts).filter((value) => typeof value === "string" && value !== "public-story-beat")) {
      expect(prompt).toContain(fact);
    }
    expect(prompt).toContain("Hero: Mara; loyalty, mercy");
    expect(prompt).toContain("Companion: Rowan; arrived-injured");
    expect(prompt).toContain("Focus: shared road");
  });

  it("excludes IDs, counters, fallback prose and unrelated caller fields", () => {
    const supplied = { ...viewpoint, hero: { ...viewpoint.hero, privateThought: "private-thought-token" },
      companion: { ...viewpoint.companion!, id: "private-companion-token", disposition: "private-disposition-token" } };
    const text = JSON.stringify(buildCreativeDirectionMessages(job, supplied));
    for (const hidden of [job.campaignId, job.eventId, job.sourceFingerprint, job.deterministicFallback, "123456789", "987654321",
      "private-thought-token", "private-companion-token", "private-disposition-token"]) expect(text).not.toContain(hidden);
  });

  it("keeps all scene choices available for solo and scene-imagery focus", () => {
    const solo = buildCreativeDirectionMessages(job, { ...viewpoint, companion: null }, "scene");
    expect(solo[1]!.content).toContain("No active companion.");
    expect(solo[1]!.content).toContain("Focus: scene imagery");
    for (const label of Object.values(narrativeStageLabels)) expect(solo[1]!.content).toContain(label);
    expect(buildCreativeDirectionMessages(job)[1]!.content).not.toContain("Hero:");
  });

  it.each(["x", "界", "🌙"])("bounds each %s field by characters and UTF-8 bytes, visibly marking snippets", (symbol) => {
    const huge = symbol.repeat(500);
    const input = { ...job, facts: { ...job.facts, location: huge, headline: huge, action: huge, consequence: huge } };
    const people = { ...viewpoint, hero: { ...viewpoint.hero, name: huge }, companion: { ...viewpoint.companion!, name: huge } };
    const prompt = buildCreativeDirectionMessages(input, people)[1]!.content;
    const caps = { Place: 32, Moment: 56, Action: 72, Changed: 88, Hero: 24, Companion: 24 };
    for (const [label, cap] of Object.entries(caps)) {
      const line = prompt.split("\n").find((entry) => entry.startsWith(`${label}: `))!;
      const snippet = line.slice(label.length + 2).split(";")[0]!;
      expect(snippet.length).toBeLessThanOrEqual(cap);
      expect(new TextEncoder().encode(snippet).length).toBeLessThanOrEqual(cap);
      expect(snippet).toMatch(/…$/u);
      expect(snippet).not.toMatch(/[\p{Cs}]/u);
    }
    expect(prompt.length).toBeLessThan(850);
  });

  it("normalizes ordinary whitespace and omits unsafe-control input", () => {
    const messages = buildCreativeDirectionMessages({ ...job, facts: { ...job.facts, location: " Grey\nford\t", action: "forged\u0000action" } });
    expect(messages[1]!.content).toContain("Place: Grey ford");
    expect(messages[1]!.content).not.toContain("forged");
    expect(messages[1]!.content).not.toContain("\u0000");
  });

  it("is deterministic, frozen, and does not mutate the captured inputs", () => {
    const before = structuredClone({ job, viewpoint });
    const first = buildCreativeDirectionMessages(job, viewpoint);
    expect(buildCreativeDirectionMessages(job, viewpoint)).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.every(Object.isFrozen)).toBe(true);
    expect({ job, viewpoint }).toEqual(before);
  });
});
