import type { NarratorCapability } from "./protocol";
import {
  isNarratorBoundedText,
  isNarratorRecord,
  narratorHasExactKeys,
} from "./protocol";

export const narratorExperimentalModelIdMaximumCharacters = 160;
export const narratorExperimentalRevisionMaximumCharacters = 40;
export const narratorExperimentalArtifactManifestHashMaximumCharacters = 16;
export const narratorExperimentalLicenseMaximumCharacters = 80;

export interface NarratorExperimentalModelPolicyV1 {
  readonly schemaVersion: 1;
  readonly kind: "experimental-unrated";
  readonly modelId: string;
  readonly revision: string;
  readonly artifactManifestHash: string;
  readonly license: string;
  readonly storedWeightBytes: number;
  readonly disclosedDownloadBytes: number;
  readonly sourceEvidenceDisposition: "blocked";
  readonly humanQualityEvaluated: false;
  readonly modelAdmitted: false;
  readonly formalDisplayAuthorized: false;
  readonly productionAuthority: false;
}

export type NarratorExperimentalEligibilityCapability = Pick<
  NarratorCapability,
  "execution" | "budget" | "storedWeightBudgetBytes"
>;

const policyKeys = [
  "schemaVersion",
  "kind",
  "modelId",
  "revision",
  "artifactManifestHash",
  "license",
  "storedWeightBytes",
  "disclosedDownloadBytes",
  "sourceEvidenceDisposition",
  "humanQualityEvaluated",
  "modelAdmitted",
  "formalDisplayAuthorized",
  "productionAuthority",
] as const;

function isSingleLineIdentity(value: unknown, maximumCharacters: number): value is string {
  return isNarratorBoundedText(value, maximumCharacters)
    && !/[\t\n\r]/u.test(value);
}

export function isNarratorExperimentalModelPolicyV1(
  value: unknown,
): value is NarratorExperimentalModelPolicyV1 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, policyKeys)
    && value.schemaVersion === 1
    && value.kind === "experimental-unrated"
    && isSingleLineIdentity(value.modelId, narratorExperimentalModelIdMaximumCharacters)
    && /^[0-9a-f]{40}$/u.test(String(value.revision))
    && /^[0-9a-f]{16}$/u.test(String(value.artifactManifestHash))
    && isSingleLineIdentity(value.license, narratorExperimentalLicenseMaximumCharacters)
    && Number.isSafeInteger(value.storedWeightBytes)
    && Number(value.storedWeightBytes) > 0
    && Number.isSafeInteger(value.disclosedDownloadBytes)
    && Number(value.disclosedDownloadBytes) >= Number(value.storedWeightBytes)
    && value.sourceEvidenceDisposition === "blocked"
    && value.humanQualityEvaluated === false
    && value.modelAdmitted === false
    && value.formalDisplayAuthorized === false
    && value.productionAuthority === false;
}

export function isNarratorExperimentalModelEligible(
  value: unknown,
  capability: NarratorExperimentalEligibilityCapability,
): value is NarratorExperimentalModelPolicyV1 {
  return isNarratorExperimentalModelPolicyV1(value)
    && (capability.execution === "wasm" || capability.execution === "webgpu")
    && capability.budget === "standard"
    && Number.isSafeInteger(capability.storedWeightBudgetBytes)
    && capability.storedWeightBudgetBytes > 0
    && value.storedWeightBytes <= capability.storedWeightBudgetBytes;
}
