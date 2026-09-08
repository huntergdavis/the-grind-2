import { describe, expect, it } from "vitest";
import { createCreativeWriterDiagnostics } from "./creative-writer-diagnostics";

describe("creative writer numerical diagnostics", () => {
  it("counts numerical categories and finite bounds without changing score bits", () => {
    const diagnostics = createCreativeWriterDiagnostics();
    const data = new Float32Array([0, -0, -7.5, 4.25, NaN, NaN, Infinity, -Infinity, -Infinity]);
    const before = new Uint32Array(data.buffer).slice();
    diagnostics.observeLogits(data);
    expect(new Uint32Array(data.buffer)).toEqual(before);
    expect(diagnostics.snapshot()).toEqual([{
      step: 1, vocabularySize: 9, nanCount: 2, positiveInfinityCount: 1, negativeInfinityCount: 2,
      finiteMin: -7.5, finiteMax: 4.25, sampledToken: null, sampledTokenInRange: null,
    }]);
    diagnostics.observeToken(8);
    expect(diagnostics.snapshot()[0]).toMatchObject({ sampledToken: 8, sampledTokenInRange: true });
    expect(new Uint32Array(data.buffer)).toEqual(before);
  });

  it.each([
    [new Float32Array(), 0, 0, 0],
    [new Float32Array([NaN, Infinity, -Infinity]), 1, 1, 1],
  ] as const)("uses null finite bounds when there are no finite scores", (data, nanCount, positiveInfinityCount, negativeInfinityCount) => {
    const diagnostics = createCreativeWriterDiagnostics();
    diagnostics.observeLogits(data);
    expect(diagnostics.snapshot()[0]).toMatchObject({
      vocabularySize: data.length, finiteMin: null, finiteMax: null,
      nanCount, positiveInfinityCount, negativeInfinityCount,
    });
  });

  it.each([
    [0, 0, true], [2, 2, true], [-1, -1, false], [3, 3, false], [1.5, 1.5, false],
    [NaN, "non-finite", false], [Infinity, "non-finite", false], [-Infinity, "non-finite", false],
  ] as const)("records sampled token %s without admitting invalid indices", (token, sampledToken, sampledTokenInRange) => {
    const diagnostics = createCreativeWriterDiagnostics();
    diagnostics.observeLogits(new Float32Array(3));
    diagnostics.observeToken(token);
    expect(diagnostics.snapshot()[0]).toMatchObject({ sampledToken, sampledTokenInRange });
    expect(JSON.parse(JSON.stringify(diagnostics.snapshot()))[0]).toMatchObject({ sampledToken, sampledTokenInRange });
  });

  it("attaches a token only to the latest recorded step", () => {
    const diagnostics = createCreativeWriterDiagnostics();
    diagnostics.observeToken(1);
    expect(diagnostics.snapshot()).toEqual([]);
    diagnostics.observeLogits(new Float32Array(2));
    diagnostics.observeLogits(new Float32Array(3));
    diagnostics.observeToken(2);
    expect(diagnostics.snapshot()).toEqual([
      expect.objectContaining({ step: 1, sampledToken: null, sampledTokenInRange: null }),
      expect.objectContaining({ step: 2, sampledToken: 2, sampledTokenInRange: true }),
    ]);
  });

  it("caps records at 64 and never attributes truncated tokens to step 64", () => {
    const diagnostics = createCreativeWriterDiagnostics();
    const data = new Float32Array(2);
    for (let step = 1; step <= 64; step++) {
      diagnostics.observeLogits(data);
      diagnostics.observeToken(1);
    }
    for (let step = 65; step <= 100; step++) {
      diagnostics.observeLogits(data);
      diagnostics.observeToken(0);
    }
    expect(diagnostics.snapshot()).toHaveLength(64);
    expect(diagnostics.snapshot().at(-1)).toMatchObject({ step: 64, sampledToken: 1 });
  });

  it("returns immutable independent snapshots and resets observations and step numbering", () => {
    const diagnostics = createCreativeWriterDiagnostics();
    const data = new Float32Array([1, 2]);
    diagnostics.observeLogits(data);
    const captured = diagnostics.snapshot();
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen(captured[0])).toBe(true);
    diagnostics.observeToken(1);
    data.fill(99);
    expect(captured[0]).toMatchObject({ sampledToken: null, finiteMin: 1, finiteMax: 2 });
    expect(diagnostics.snapshot()[0]).toMatchObject({ sampledToken: 1, finiteMin: 1, finiteMax: 2 });
    diagnostics.reset();
    diagnostics.observeToken(1);
    expect(diagnostics.snapshot()).toEqual([]);
    diagnostics.observeLogits(new Float32Array([3]));
    expect(diagnostics.snapshot()[0]).toMatchObject({ step: 1, vocabularySize: 1, finiteMin: 3, sampledToken: null });
    expect(captured).toHaveLength(1);
  });
});
