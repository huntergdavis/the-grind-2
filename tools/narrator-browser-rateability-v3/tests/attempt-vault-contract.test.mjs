import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createNarratorBrowserRateabilityAttemptIdentityV3,
  narratorBrowserRateabilityAttemptVaultContractHashV3,
  narratorBrowserRateabilityAttemptVaultContractV3,
} from "../run-support.mjs";

describe("V3 narrator rateability attempt-vault contract", () => {
  it("freezes the run identity, file order, preservation points, and private modes", () => {
    expect(narratorBrowserRateabilityAttemptVaultContractV3).toEqual({
      schemaVersion: 1,
      contractId: "the-grind-2:narrator-browser-rateability-attempt-vault:v3",
      identityDomain: "the-grind-2:narrator-browser-rateability-run-id:v3",
      identityFields: ["runId"],
      identityAlgorithm: "sha256-canonical-json",
      identityScope: "one-canonical-private-output-parent",
      runIdMaximumCodeUnits: 200,
      fileOrder: [
        "00-attempt-start.json",
        "10-run-receipt.json",
        "11-rateability-summary.json",
        "12-blind-sheet.json",
        "13-blind-key.json",
        "19-core-preservation.json",
        "20-expected-bindings.json",
        "29-bindings-preservation.json",
        "30-provenance-receipt.json",
        "31-provenance-preservation.json",
        "32-run-package.json",
        "39-host-preservation.json",
        "40-verification-diagnostic.json",
        "90-attempt-terminal.json",
      ],
      coreFiles: [
        "10-run-receipt.json",
        "11-rateability-summary.json",
        "12-blind-sheet.json",
        "13-blind-key.json",
      ],
      hostFiles: [
        "30-provenance-receipt.json",
        "32-run-package.json",
      ],
      preservationFiles: {
        core: "19-core-preservation.json",
        bindings: "29-bindings-preservation.json",
        provenance: "31-provenance-preservation.json",
        host: "39-host-preservation.json",
      },
      privateDirectoryMode: 0o700,
      privateFileMode: 0o600,
      publication: "exclusive-hard-link-after-file-sync",
      readback: "no-follow-exact-bytes-and-canonical-json",
      lockLifetime: "before-browser-through-durable-terminal",
      retention: "append-only-never-delete-vault",
    });
    expect(narratorBrowserRateabilityAttemptVaultContractHashV3)
      .toBe("e7e50a2a0ea32945");
    expect(Object.isFrozen(narratorBrowserRateabilityAttemptVaultContractV3)).toBe(true);
    expect(Object.isFrozen(narratorBrowserRateabilityAttemptVaultContractV3.fileOrder)).toBe(true);
    expect(Object.isFrozen(narratorBrowserRateabilityAttemptVaultContractV3.coreFiles)).toBe(true);
    expect(Object.isFrozen(narratorBrowserRateabilityAttemptVaultContractV3.hostFiles)).toBe(true);
    expect(Object.isFrozen(narratorBrowserRateabilityAttemptVaultContractV3.preservationFiles)).toBe(true);
    expect(() => narratorBrowserRateabilityAttemptVaultContractV3.fileOrder.push("forged.json"))
      .toThrow(TypeError);
  });

  it("derives one full SHA-256 tombstone identity from the bounded run ID alone", () => {
    const runId = "narrator-rateability:v0.5.91:001";
    const identity = createNarratorBrowserRateabilityAttemptIdentityV3(runId);
    const expectedAttemptId = createHash("sha256")
      .update(JSON.stringify({
        domain: narratorBrowserRateabilityAttemptVaultContractV3.identityDomain,
        runId,
      }))
      .digest("hex");

    expect(identity).toEqual({
      schemaVersion: 1,
      identityDomain: narratorBrowserRateabilityAttemptVaultContractV3.identityDomain,
      runId,
      attemptId: expectedAttemptId,
      vaultName: `.narrator-browser-rateability-v3-attempt-${expectedAttemptId}`,
      lockName: `.narrator-browser-rateability-v3-attempt-${expectedAttemptId}.lock`,
    });
    expect(expectedAttemptId).toBe(
      "5614f3280c92ce6ebfe73f09ea06806db90cf78bdec99df797397bec44992505",
    );
    expect(Object.isFrozen(identity)).toBe(true);
    expect(createNarratorBrowserRateabilityAttemptIdentityV3(runId)).toEqual(identity);
    expect(createNarratorBrowserRateabilityAttemptIdentityV3(`${runId}:next`).attemptId)
      .not.toBe(identity.attemptId);
  });

  it.each([
    null,
    42,
    "",
    " run:001",
    "run:001 ",
    "e\u0301",
    "run:\u0000:001",
    "run:\u202e:001",
    "r".repeat(201),
  ])("rejects a run ID outside the V3 core bounded-text domain", (runId) => {
    expect(() => createNarratorBrowserRateabilityAttemptIdentityV3(runId)).toThrow(
      new TypeError("Narrator V3 rateability attempt run id is invalid"),
    );
  });
});
