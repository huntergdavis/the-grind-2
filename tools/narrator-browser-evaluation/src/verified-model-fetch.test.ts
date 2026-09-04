import { describe, expect, it, vi } from "vitest";
import type { NarratorVerifiedBrowserAssetClosureV2 } from "../../../src/narrator/evaluation-browser-assets-v2";
import type { NarratorModelCandidate } from "../../../src/narrator/model-candidate";
import { createNarratorVerifiedModelFetchV2 } from "./verified-model-fetch";

function setup() {
  const blob = new Blob([Uint8Array.from([1, 2, 3])], { type: "application/octet-stream" });
  const closure = {
    modelArtifacts: [{ path: "config.json", byteLength: 3, sha256: "0".repeat(64) }],
    runtimeArtifacts: [],
    modelArtifactBlob: vi.fn((path: string) => {
      if (path !== "config.json") throw new TypeError("Unknown model asset path");
      return blob;
    }),
    runtimeArtifactBlob: vi.fn(),
  } satisfies NarratorVerifiedBrowserAssetClosureV2;
  const candidate = {
    model: { repository: "owner/model" },
  } as NarratorModelCandidate;
  const onRead = vi.fn();
  const modelFetch = createNarratorVerifiedModelFetchV2(
    closure,
    candidate,
    "http://127.0.0.1:4179",
    onRead,
  );
  return { closure, onRead, modelFetch };
}

describe("Narrator verified model fetch V2", () => {
  it("serves an exact in-memory GET with byte metadata", async () => {
    const { onRead, modelFetch } = setup();
    const response = await modelFetch("/__verified_narrator__/owner/model/config.json");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("3");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(onRead).toHaveBeenCalledExactlyOnceWith("config.json");
  });

  it.each([
    ["external origin", "https://example.com/__verified_narrator__/owner/model/config.json", {}],
    ["query", "/__verified_narrator__/owner/model/config.json?revision=main", {}],
    ["fragment", "/__verified_narrator__/owner/model/config.json#x", {}],
    ["wrong root", "/models/owner/model/config.json", {}],
    ["wrong method", "/__verified_narrator__/owner/model/config.json", { method: "HEAD" }],
  ])("rejects %s", async (_label, input, init) => {
    const { closure, onRead, modelFetch } = setup();
    await expect(modelFetch(input, init)).rejects.toThrow(/unauthorized/u);
    expect(closure.modelArtifactBlob).not.toHaveBeenCalled();
    expect(onRead).not.toHaveBeenCalled();
  });

  it("fails closed for an undeclared model path", async () => {
    const { closure, onRead, modelFetch } = setup();
    await expect(modelFetch(
      "/__verified_narrator__/owner/model/special_tokens_map.json",
    )).rejects.toThrow(/Unknown model/u);
    expect(closure.modelArtifactBlob).toHaveBeenCalledExactlyOnceWith("special_tokens_map.json");
    expect(onRead).not.toHaveBeenCalled();
  });
});
