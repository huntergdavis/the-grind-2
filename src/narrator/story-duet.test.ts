import { describe, expect, it } from "vitest";
import type { FirstSharedVictory } from "./first-shared-victory";
import type { StoryBeatJobV1 } from "./story-beat";
import { buildStoryDuetMessages, captureStoryDuet, cleanStoryDuetOutput, storyDuetText, type StoryDuet } from "./story-duet";

const packet: FirstSharedVictory = {
  kind: "first-shared-victory", campaignId: "private-campaign", eventId: "private-event", tick: 40,
  combatId: "private-combat", companionId: "private-companion", heroName: "Mara", companionName: "Rowan",
  condition: "healthy", battle: { location: "Greyford road", headline: "Mara and Rowan won their first fight.", tick: 40 },
};
const job: StoryBeatJobV1 = {
  schemaVersion: 1, task: "author-story-beat", disposition: "manual-ephemeral-noncanonical",
  campaignId: packet.campaignId, eventId: packet.eventId, tick: packet.tick, sourceFingerprint: "private-fingerprint",
  facts: { schemaVersion: 1, kind: "public-story-beat", location: packet.battle.location, headline: packet.battle.headline,
    action: "The pair defeated the roadside bandit.", consequence: "Rowan remains uninjured after their first shared victory." },
  deterministicFallback: "private-fallback", maximumInputTokens: 320, maximumOutputTokens: 48,
};
const hero = "I want to trust this relief, but I fear how easily it could pass.";
const companion = "My hands still shake, though I am glad we faced the danger together.";
const output = `HERO: ${hero}\nCOMPANION: ${companion}`;

describe("role-bound imagined inner voices", () => {
  it("accepts exactly two distinct first-person sentences and binds only the host names", () => {
    const duet = cleanStoryDuetOutput(output, packet)!;
    expect(duet).toEqual({ kind: "inner-voices", hero: { name: "Mara", text: hero }, companion: { name: "Rowan", text: companion } });
    expect([duet, duet.hero, duet.companion].every(Object.isFrozen)).toBe(true);
    expect(storyDuetText(duet)).toBe(`${hero}\n\n${companion}`);
    expect(cleanStoryDuetOutput(output.replace("\n", "\r\n"), packet)).toEqual(duet);
    expect(cleanStoryDuetOutput(`\n${output} \n`, packet)).toEqual(duet);
  });

  it("keeps identically named people separate through explicit role tags", () => {
    const duet = cleanStoryDuetOutput(output, { ...packet, heroName: "Alex", companionName: "Alex" });
    expect(duet?.hero).toEqual({ name: "Alex", text: hero });
    expect(duet?.companion).toEqual({ name: "Alex", text: companion });
  });

  it.each([
    undefined, null, 1, {}, [], `${hero}\n${companion}`,
    `COMPANION: ${companion}\nHERO: ${hero}`,
    `HERO: ${hero}\nHERO: ${companion}`,
    `COMPANION: ${hero}\nCOMPANION: ${companion}`,
    `HERO: ${hero}`, `COMPANION: ${companion}`,
    `${output}\nNARRATOR: A new event happened.`, `Here are two thoughts:\n${output}`,
    `hero: ${hero}\ncompanion: ${companion}`, `Mara: ${hero}\nRowan: ${companion}`,
    `HERO: ${hero} COMPANION: ${companion}`, `HERO:${hero}\nCOMPANION:${companion}`,
    `HERO: ${hero}\n\nCOMPANION: ${companion}`,
  ])("rejects missing, swapped, duplicated, extra, or untagged roles: %j", (raw) => {
    expect(cleanStoryDuetOutput(raw, packet)).toBeNull();
  });

  it.each([
    "I am waiting for", "I am glad. I am also afraid.", "I am glad. And then",
    "Mara feels glad that the road is quiet.", "A victory is a moment of relief.",
    "<b>I am glad the road is quiet.</b>", "**I am glad the road is quiet.**",
    "# I am glad the road is quiet.", "I feel glad &amp; afraid.",
    "I will return exactly one short thought.", "I am writing a first-person sentence.",
    "I hear COMPANION: another thought.", "I am a continuation of the story.\u0000",
    `I am ${"very ".repeat(60)}glad.`,
  ])("rejects malformed or prompt-echoing role text without accepting a clean prefix: %j", (line) => {
    expect(cleanStoryDuetOutput(`HERO: ${line}\nCOMPANION: ${companion}`, packet)).toBeNull();
    expect(cleanStoryDuetOutput(`HERO: ${hero}\nCOMPANION: ${line}`, packet)).toBeNull();
  });

  it("rejects duplicate thoughts even with different role labels or casing", () => {
    expect(cleanStoryDuetOutput(`HERO: ${hero}\nCOMPANION: ${hero}`, packet)).toBeNull();
    expect(cleanStoryDuetOutput(`HERO: ${hero}\nCOMPANION: ${hero.toUpperCase()}`, packet)).toBeNull();
  });

  it("rejects trailing whitespace inside a role line rather than silently rewriting that thought", () => {
    expect(cleanStoryDuetOutput(`HERO: ${hero} \nCOMPANION: ${companion}`, packet)).toBeNull();
  });

  it("captures only the typed duet fields without retaining mutable caller objects", () => {
    const source = { kind: "inner-voices", hero: { name: "Mara", text: hero }, companion: { name: "Rowan", text: companion },
      privateMood: "not a recorded feeling" } satisfies StoryDuet & { privateMood: string };
    const duet = captureStoryDuet(source);
    source.hero.text = "Changed after capture.";
    source.companion.name = "Someone else";
    expect(duet.hero.text).toBe(hero);
    expect(duet.companion.name).toBe("Rowan");
    expect(duet).not.toHaveProperty("privateMood");
    expect([duet, duet.hero, duet.companion].every(Object.isFrozen)).toBe(true);
  });
});

describe("bounded first-victory duet prompt", () => {
  it("uses only public facts and bound role names, preserving the supplied outcome", () => {
    const before = structuredClone({ job, packet });
    const messages = buildStoryDuetMessages(job, packet);
    const text = messages.map(({ content }) => content).join("\n");
    for (const fact of [job.facts.location, job.facts.headline, job.facts.action, job.facts.consequence]) expect(text).toContain(fact);
    expect(text).toContain("HERO is Mara. COMPANION is Rowan.");
    expect(text).toContain("COMPANION is uninjured.");
    expect(text).not.toMatch(/private-|shared-road-oath/);
    expect(messages.map(({ role }) => role)).toEqual(["system", "user"]);
    expect(Object.isFrozen(messages) && messages.every(Object.isFrozen)).toBe(true);
    expect({ job, packet }).toEqual(before);
  });

  it("keeps the injured companion's outcome explicit without claiming recovery", () => {
    const injured = { ...packet, condition: "injured" as const };
    const source = { ...job, facts: { ...job.facts, consequence: "Rowan is alive and injured after their first shared victory." } };
    const text = JSON.stringify(buildStoryDuetMessages(source, injured));
    expect(text).toContain(source.facts.consequence);
    expect(text).toContain("COMPANION is alive and injured.");
    expect(text).not.toContain("uninjured");
  });

  it.each(["x", "界", "🌙"])("bounds even long %s public snippets well below the worker context limit", (symbol) => {
    const huge = symbol.repeat(500);
    const source = { ...job, facts: { ...job.facts, location: huge, headline: huge, action: huge, consequence: huge } };
    const names = { ...packet, heroName: huge, companionName: huge };
    const messages = buildStoryDuetMessages(source, names);
    const text = messages.map(({ content }) => content).join("\n");
    expect(new TextEncoder().encode(text).length).toBeLessThan(900);
    expect(text).not.toMatch(/[\p{Cs}]/u);
    expect(text).toContain("…");
  });
});
