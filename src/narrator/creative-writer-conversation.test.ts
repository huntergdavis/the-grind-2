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
    expect(result).toEqual([system, ...prose.map((content) => ({ role: "assistant", content })), current]);
    expect(JSON.stringify(messages)).toBe(before);
    expect(result[0]).not.toBe(system);
    expect(result.at(-1)).not.toBe(current);
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
