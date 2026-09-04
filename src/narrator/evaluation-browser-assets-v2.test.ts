import { describe, expect, it, vi } from "vitest";
import {
  verifyNarratorBrowserAssetClosureV2,
  type NarratorBrowserRuntimeArtifactV2,
  type NarratorBrowserStagedArtifactV2,
} from "./evaluation-browser-assets-v2";
import type { NarratorVerifiedArtifactV1 } from "./evaluation-receipts";

function bytes(...values: number[]): ArrayBuffer {
  return Uint8Array.from(values).buffer;
}

function fixtures() {
  const modelBytes = bytes(1, 2, 3);
  const moduleBytes = bytes(4, 5);
  const wasmBytes = bytes(6, 7, 8, 9);
  const model: readonly NarratorVerifiedArtifactV1[] = [{
    path: "config.json",
    byteLength: modelBytes.byteLength,
    sha256: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
  }];
  const runtime: readonly NarratorBrowserRuntimeArtifactV2[] = [
    {
      path: "runtime.mjs",
      role: "runtime-module",
      byteLength: moduleBytes.byteLength,
      sha256: "2fa1b377bf67309f65e5e7bc9d924345ca648dec4e601a398a9cb497dcba3765",
    },
    {
      path: "runtime.wasm",
      role: "runtime-wasm",
      byteLength: wasmBytes.byteLength,
      sha256: "d0d7b3d71be31dcc65d10a500b03c2494533d7017c92e37f5a85f67b39152621",
    },
  ];
  const stagedModel: readonly NarratorBrowserStagedArtifactV2[] = [{ path: "config.json", bytes: modelBytes }];
  const stagedRuntime: readonly NarratorBrowserStagedArtifactV2[] = [
    { path: "runtime.mjs", bytes: moduleBytes },
    { path: "runtime.wasm", bytes: wasmBytes },
  ];
  return { model, runtime, stagedModel, stagedRuntime };
}

describe("Narrator browser asset closure V2", () => {
  it("retains only an exact verified model/runtime closure as immutable blobs", async () => {
    const fixture = fixtures();
    const result = await verifyNarratorBrowserAssetClosureV2(
      fixture.model,
      fixture.runtime,
      fixture.stagedModel,
      fixture.stagedRuntime,
    );

    expect(result.modelArtifacts).toEqual(fixture.model);
    expect(result.runtimeArtifacts).toEqual(fixture.runtime);
    expect([...new Uint8Array(await result.modelArtifactBlob("config.json").arrayBuffer())]).toEqual([1, 2, 3]);
    expect(result.runtimeArtifactBlob("runtime.mjs").type).toBe("text/javascript");
    expect(result.runtimeArtifactBlob("runtime.wasm").type).toBe("application/wasm");
    expect(() => result.modelArtifactBlob("missing.json")).toThrow(/Unknown model/u);
    expect(Object.isFrozen(result.modelArtifacts)).toBe(true);
  });

  it.each([
    ["missing", () => []],
    ["extra", (fixture: ReturnType<typeof fixtures>) => [...fixture.stagedModel, { path: "extra.json", bytes: bytes(0) }]],
    ["duplicate", (fixture: ReturnType<typeof fixtures>) => [fixture.stagedModel[0], fixture.stagedModel[0]]],
  ])("rejects a %s model closure", async (_label, mutate) => {
    const fixture = fixtures();
    await expect(verifyNarratorBrowserAssetClosureV2(
      fixture.model,
      fixture.runtime,
      mutate(fixture),
      fixture.stagedRuntime,
    )).rejects.toThrow(/shape|paths/u);
  });

  it("rejects wrong length before computing any digest", async () => {
    const fixture = fixtures();
    const digest = vi.fn(async () => "0".repeat(64));
    await expect(verifyNarratorBrowserAssetClosureV2(
      fixture.model,
      fixture.runtime,
      [{ path: "config.json", bytes: bytes(1, 2) }],
      fixture.stagedRuntime,
      digest,
    )).rejects.toThrow(/byte length/u);
    expect(digest).not.toHaveBeenCalled();
  });

  it("rejects same-length corruption after hashing", async () => {
    const fixture = fixtures();
    await expect(verifyNarratorBrowserAssetClosureV2(
      fixture.model,
      fixture.runtime,
      [{ path: "config.json", bytes: bytes(1, 2, 4) }],
      fixture.stagedRuntime,
    )).rejects.toThrow(/SHA-256/u);
  });

  it("rejects sparse staging arrays", async () => {
    const fixture = fixtures();
    const sparse = Array(1) as NarratorBrowserStagedArtifactV2[];
    await expect(verifyNarratorBrowserAssetClosureV2(
      fixture.model,
      fixture.runtime,
      sparse,
      fixture.stagedRuntime,
    )).rejects.toThrow(/shape/u);
  });
});
