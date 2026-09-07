import { describe, expect, it } from "vitest";
import { createCreativeDirectionMask } from "./creative-direction-logits";

describe("creative direction closed-choice mask", () => {
  it("preserves every candidate score exactly and masks only other tokens", () => {
    const data = new Float32Array([99, -0.5, 0.75, -2.25, 100]);
    const before = new Uint32Array(data.buffer).slice();
    const logits = { dims: [1, data.length], data };
    expect(createCreativeDirectionMask([1, 2, 3])(logits)).toBe(logits);
    const after = new Uint32Array(data.buffer);
    for (const id of [1, 2, 3]) expect(after[id]).toBe(before[id]);
    expect([...data]).toEqual([-Infinity, -0.5, 0.75, -2.25, -Infinity]);
  });

  it("lets different model scores select different labels without injected preferences", () => {
    for (const winner of [1, 2, 3]) {
      const data = new Float32Array([100, -4, -4, -4]);
      data[winner] = 0.25;
      createCreativeDirectionMask([1, 2, 3])({ dims: [1, 4], data });
      expect([...data].indexOf(Math.max(...data))).toBe(winner);
    }
  });

  it("rejects ambiguous label identities and malformed score tensors", () => {
    expect(() => createCreativeDirectionMask([1, 1, 2])).toThrow("three distinct");
    expect(() => createCreativeDirectionMask([1])).toThrow("three distinct");
    expect(() => createCreativeDirectionMask([1, 2, 3, 4])).toThrow("three distinct");
    const mask = createCreativeDirectionMask([1, 2, 3]);
    expect(() => mask({ dims: [2, 2], data: new Float32Array(4) })).toThrow("Invalid direction");
    expect(() => mask({ dims: [1, 3], data: new Float32Array(3) })).toThrow("Invalid direction");
    expect(() => mask({ dims: [1, 4], data: new Float32Array([0, 1, NaN, 2]) })).toThrow("Invalid direction");
  });

  it.each([1, 2, 3])("masks excluded label%s while preserving both eligible scores", (excluded) => {
    const data = new Float32Array([999, -0.5, 0.75, -2.25]);
    data[excluded] = 100;
    const allowed = [1, 2, 3].filter((id) => id !== excluded);
    const before = new Uint32Array(data.buffer).slice();
    createCreativeDirectionMask(allowed)({ dims: [1, 4], data });
    const after = new Uint32Array(data.buffer);
    for (const id of allowed) expect(after[id]).toBe(before[id]);
    expect(data[excluded]).toBe(-Infinity);
    expect(data[0]).toBe(-Infinity);
  });
});
