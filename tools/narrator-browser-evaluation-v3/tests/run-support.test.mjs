import { describe, expect, it } from "vitest";
import {
  narratorBrowserSmokeReceiptFileV3,
  parseNarratorBrowserSmokeArgumentsV3,
} from "../run-support.mjs";

describe("V3 narrator browser smoke arguments", () => {
  it("accepts exactly one smoke invocation", () => {
    expect(parseNarratorBrowserSmokeArgumentsV3([
      "smoke",
      "--model-dir", "/private/model",
      "--run-id", "grind2:v3:smoke:001",
      "--out", "/private/evidence",
    ])).toEqual({
      mode: "smoke",
      "model-dir": "/private/model",
      "run-id": "grind2:v3:smoke:001",
      out: "/private/evidence",
    });
    expect(narratorBrowserSmokeReceiptFileV3).toBe("narrator-v3-browser-smoke-receipt.json");
  });

  it.each([
    [],
    ["run", "--model-dir", "m", "--run-id", "r", "--out", "o"],
    ["smoke", "--model-dir", "m", "--run-id", "r"],
    ["smoke", "--model-dir", "m", "--run-id", "r", "--out", "o", "--sheet-id", "s"],
    ["smoke", "--model-dir", "m", "--model-dir", "n", "--out", "o"],
    ["smoke", "model-dir", "m", "--run-id", "r", "--out", "o"],
    ["smoke", "--model-dir", "", "--run-id", "r", "--out", "o"],
  ])("rejects non-smoke, incomplete, duplicate, malformed, or expanded arguments", (argv) => {
    expect(parseNarratorBrowserSmokeArgumentsV3(argv)).toBeNull();
  });
});
