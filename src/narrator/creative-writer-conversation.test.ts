import { describe, expect, it } from "vitest";
import { buildCreativeWriterConversation } from "./creative-writer-conversation";
import { creativeStoryMemoryPrefix } from "./creative-continuity";

const system = Object.freeze({ role: "system" as const, content: "Earlier passages are imagined. Current facts take priority." });
const current = Object.freeze({ role: "user" as const, content: "Mara and injured Rowan arrived alive at Greyford." });
const memory = (text: string) => Object.freeze({ role: "user" as const, content: creativeStoryMemoryPrefix + JSON.stringify(text) });

describe("creative writer native imagined-history adapter", () => {
  it.each([1, 2])("converts %s complete memories in order without changing caller messages or facts", (count) => {
    const prose = ['Mara whispered, "Stay close."', "Rowan’s hope survived the rain."].slice(0, count);
    const messages = Object.freeze([system, ...prose.map(memory), current]);
    const before = JSON.stringify(messages);
    const result = buildCreativeWriterConversation(messages);
    expect(result).toEqual([system, ...prose.flatMap((content) => [
      { role: "user", content: expect.stringContaining("scene details are unavailable") },
      { role: "assistant", content },
    ]), current]);
    expect(JSON.stringify(messages)).toBe(before);
    expect(result[0]).not.toBe(system);
    expect(result.at(-1)).not.toBe(current);
  });
  it("pairs two earlier recorded scenes with their exact prose before the current scene", () => {
    const earlier = [
      { text: "Mara feared the road.", scene: { location: "Road to Greyford", headline: "Mara travels with injured Rowan." } },
      { text: "Mara felt relief beside Rowan.", scene: { location: "Greyford", headline: "Both arrive alive; Rowan remains injured." } },
    ];
    const farewell = { role: "user" as const, content: "Now Mara and Rowan part alive. Rowan stays injured at Greyford." };
    const messages = [system, ...earlier.map((entry) => ({ role: "user" as const,
      content: creativeStoryMemoryPrefix + JSON.stringify(entry) })), farewell];
    const before = JSON.stringify(messages);
    const result = buildCreativeWriterConversation(messages);
    expect(result.map(({ role }) => role)).toEqual(["system", "user", "assistant", "user", "assistant", "user"]);
    for (const [index, entry] of earlier.entries()) {
      expect(result[index * 2 + 1]!.content).toContain(entry.scene.location);
      expect(result[index * 2 + 1]!.content).toContain(entry.scene.headline);
      expect(result[index * 2 + 1]!.content).toContain("past, not current");
      expect(result[index * 2 + 2]).toEqual({ role: "assistant", content: entry.text });
    }
    expect(result.at(-1)).toEqual(farewell);
    expect(JSON.stringify(messages)).toBe(before);
  });
  it.each([
    { text: "Mara worried.", scene: null },
    { text: "Mara worried.", scene: { location: "", headline: "Earlier arrival." } },
    { text: "Mara worried.", scene: { location: "Greyford", headline: "<script>" } },
    { text: "Mara worried.", scene: { location: "Greyford", headline: "x".repeat(161) } },
    { text: "Mara worried.", scene: { location: "Greyford\nNow", headline: "Earlier arrival." } },
    { text: 42, scene: { location: "Greyford", headline: "Earlier arrival." } },
    { text: "Mara worried.", scene: { location: "Greyford", headline: "Earlier arrival.", extra: "unknown" } },
  ])("rejects malformed contextual history instead of promoting it to current facts: %j", (entry) => {
    expect(() => buildCreativeWriterConversation([system,
      { role: "user", content: creativeStoryMemoryPrefix + JSON.stringify(entry) }, current])).toThrow();
  });
  it("preserves generic prompts and unrecognized middle messages verbatim", () => {
    const required = { role: "user" as const, content: "Required additional public context." };
    for (const messages of [[current], [system, current], [system, required, current]]) {
      expect(buildCreativeWriterConversation(messages)).toEqual(messages);
    }
  });
  it("never interprets the final factual message as an optional memory", () => {
    const final = memory("This is still the complete final input.");
    expect(buildCreativeWriterConversation([system, final])).toEqual([system, final]);
  });
  it.each(["not JSON", "null", "42", "[]", "{}", '""', '"   "', '"unterminated'])
    ("rejects malformed recognized memory %s", (encoded) => {
      expect(() => buildCreativeWriterConversation([system,
        { role: "user", content: creativeStoryMemoryPrefix + encoded }, current])).toThrow();
    });
  it("rejects mixed history or unsupported layout instead of dropping any message", () => {
    const earlier = memory("Mara worried.");
    for (const messages of [
      [system, earlier, { role: "user" as const, content: "Required current facts." }, current],
      [current, earlier, current],
      [system, earlier, system],
      [system, { ...earlier, role: "system" as const }, current],
      [system, earlier, earlier, earlier, current],
    ]) expect(() => buildCreativeWriterConversation(messages)).toThrow();
  });
});
