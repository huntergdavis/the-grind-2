import { describe, expect, it } from "vitest";
import { captureStoryVoiceInspiration } from "./story-voice-inspiration";

const record = { kind: "hero-value", heroName: "Mara", value: "loyalty", text: "Rowan was leaving alive." };

describe("authored hero-value presentation metadata", () => {
  it.each(["curiosity", "loyalty", "mercy", "courage"])("copies and freezes recorded %s", (value) => {
    const input = { ...record, value };
    const captured = captureStoryVoiceInspiration(input);
    expect(captured).toEqual(input);
    expect(captured).not.toBe(input);
    expect(Object.isFrozen(captured)).toBe(true);
    input.text = "Changed later.";
    expect(captured?.text).toBe(record.text);
  });

  it.each([
    null, undefined, [], "loyalty", {}, { ...record, kind: "emotion" }, { ...record, value: "love" },
    { ...record, text: "" }, { ...record, text: " leading space" }, { ...record, text: "x".repeat(1001) },
    { ...record, heroName: "" }, { ...record, heroName: "x".repeat(129) },
    { ...record, text: "hidden\u200bformat" }, { ...record, heroName: "Mara\n" },
    { ...record, extra: true }, { ...record, [Symbol("extra")]: true },
  ])("rejects malformed metadata %#", (input) => {
    expect(captureStoryVoiceInspiration(input)).toBeNull();
  });

  it("does not invoke an accessor and rejects throwing proxy descriptors", () => {
    let reads = 0;
    const input = { ...record, get text() { reads++; return record.text; } };
    expect(captureStoryVoiceInspiration(input)).toBeNull();
    expect(reads).toBe(0);
    expect(captureStoryVoiceInspiration(new Proxy(record, { ownKeys() { throw new Error("no"); } }))).toBeNull();
  });
});
