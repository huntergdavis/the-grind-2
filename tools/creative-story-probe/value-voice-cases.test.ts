import { describe, expect, it } from "vitest";
import { buildCreativeStoryMessages, selectStorySeed } from "../../src/narrator/creative-story";
import baseline from "./viewpoint-report.json";
import { createValueVoiceCases, valueVoiceHint, withValueVoiceHint } from "./value-voice-cases.mjs";
import { runContextFit, valueVoiceReportName } from "./run-context-fit.mjs";

function built() {
  return createValueVoiceCases(baseline).map((fixture) => {
    const seed = selectStorySeed(fixture.mode, fixture.identity, fixture.attempt, { viewpoint: fixture.viewpoint, focus: fixture.focus });
    const production = buildCreativeStoryMessages(fixture.job, seed, fixture.viewpoint, fixture.focus);
    return { ...fixture, seed, production,
      candidate: withValueVoiceHint(production, fixture.value, fixture.viewpoint.hero.name, fixture.viewpoint.companion.name) };
  });
}

describe("ordinary first-victory value-plus-hint probe", () => {
  it("changes only the recorded value between otherwise identical source fixtures and selected seeds", () => {
    const [curious, merciful] = built();
    expect(curious.value).toBe("curiosity");
    expect(merciful.value).toBe("mercy");
    for (const field of ["job", "mode", "focus", "identity", "attempt", "seed"]) expect(curious[field]).toEqual(merciful[field]);
    expect(curious.viewpoint.hero.name).toBe(merciful.viewpoint.hero.name);
    expect(curious.viewpoint.companion).toEqual(merciful.viewpoint.companion);
    expect(curious.viewpoint.hero.values).toEqual(["curiosity"]);
    expect(merciful.viewpoint.hero.values).toEqual(["mercy"]);
    expect(curious.job.facts.consequence).toContain("uninjured");
    expect(curious.viewpoint.companion.victories).toBe(1);
    expect(curious.focus).toBe("inner-life");
  });

  it("keeps the exact approved wonder/understanding and kindness/pity hints", () => {
    expect(valueVoiceHint("curiosity", "Mara", "Rowan"))
      .toBe("Imagine Mara's wonder about sharing this success with Rowan, and a worry about misunderstanding Rowan.");
    expect(valueVoiceHint("mercy", "Mara", "Rowan"))
      .toBe("Imagine Mara's wish to offer Rowan kindness, and a worry that kindness could feel like pity.");
  });

  it("replaces exactly one focus line while retaining all other production prompt bytes", () => {
    for (const row of built()) {
      const before = JSON.stringify(row.production);
      expect(row.candidate[0]).toEqual(row.production[0]);
      const original = row.production[1].content.split("\n");
      const candidate = row.candidate[1].content.split("\n");
      expect(candidate).toHaveLength(original.length);
      const changed = candidate.flatMap((line, index) => line === original[index] ? [] : [index]);
      expect(changed).toEqual([original.length - 2]);
      expect(candidate.at(-1)).toBe("Write two short story sentences about Mara. Use their names.");
      expect(candidate[changed[0]]).toBe(valueVoiceHint(row.value, "Mara", "Rowan"));
      expect(JSON.stringify(row.production)).toBe(before);
      expect(Object.isFrozen(row.candidate) && row.candidate.every(Object.isFrozen)).toBe(true);
      const content = row.candidate.map(({ content }) => content).join("\n");
      expect(content).not.toMatch(/HERO:|COMPANION:|synthetic:|sourceFingerprint/);
      expect(new TextEncoder().encode(content).length).toBeLessThan(1_400);
    }
  });

  it("differs across the two actual candidate prompts only in the value field and mapped focus hint", () => {
    const [curious, merciful] = built();
    expect(curious.candidate[0]).toEqual(merciful.candidate[0]);
    const left = curious.candidate[1].content.split("\n");
    const right = merciful.candidate[1].content.split("\n");
    const changed = left.flatMap((line, index) => line === right[index] ? [] : [index]);
    expect(changed).toHaveLength(2);
    expect(left[changed[0]]).toContain("Values: curiosity.");
    expect(right[changed[0]]).toContain("Values: mercy.");
    expect(changed[1]).toBe(left.length - 2);
  });

  it("rejects missing, duplicate, or mismatched focus/value lines rather than broad replacements", () => {
    const row = built()[0];
    const missing = row.production.map((message) => ({ ...message, content: message.content.replace("Imagine a private worry", "Changed focus") }));
    expect(() => withValueVoiceHint(missing, "curiosity", "Mara", "Rowan")).toThrow("focus/value line");
    expect(() => withValueVoiceHint(row.production, "mercy", "Mara", "Rowan")).toThrow("focus/value line");
    expect(() => withValueVoiceHint(row.production, "courage", "Mara", "Rowan")).toThrow("two fixed");
    expect(() => withValueVoiceHint(row.production.slice(1), "curiosity", "Mara", "Rowan")).toThrow("two-message");
    const duplicate = row.production.map((message, index) => index === 0 ? message
      : { ...message, content: `${message.content}\n${message.content.split("\n").at(-2)}` });
    expect(() => withValueVoiceHint(duplicate, "curiosity", "Mara", "Rowan")).toThrow("focus/value line");
  });

  it("uses unique reports and requires an exclusive explicit run mode", async () => {
    const now = new Date("2026-09-07T00:00:00Z");
    const name = valueVoiceReportName(now);
    expect(name).toMatch(/^value-voice-report-2026-09-07T00-00-00-000Z-[a-f0-9-]+\.json$/);
    expect(valueVoiceReportName(now)).not.toBe(name);
    await expect(runContextFit(["--value-voice"])).rejects.toThrow("Explicit execution");
    await expect(runContextFit(["--run", "--value-voice", "--story-duet"])).rejects.toThrow("Explicit execution");
    await expect(runContextFit(["--run", "--value-voice", "--prior-report", "anything"])).rejects.toThrow("Explicit execution");
  });
});
