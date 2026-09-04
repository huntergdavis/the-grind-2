import adapterSmokeReceipt from "../../../docs/narrator/narrator-v3-browser-smoke-receipt.json";
import publicationReceipt from "../../../docs/narrator/t5-artifact-publication-receipt.json";
import type {
  NarratorBlindKeyV3,
  NarratorBlindSheetV3,
} from "../../../src/narrator/blind-evaluation-v3";
import { narratorBrowserOrtRuntimeV2 } from "../../../src/narrator/evaluation-browser-assets-v2";
import type {
  NarratorBrowserAdapterSmokeReceiptV3,
  NarratorBrowserObservedBuildV3,
} from "../../../src/narrator/evaluation-browser-receipt-v3";
import {
  createNarratorBrowserFullRunPackageV3,
  createNarratorBrowserFullRunProvenanceReceiptV3,
  isNarratorBrowserFullRunPackageForEvidenceV3,
  verifyNarratorBrowserFullRunProvenanceReceiptV3,
  type NarratorBrowserFullRunNetworkV3,
  type NarratorBrowserFullRunPackageV3,
  type NarratorBrowserFullRunProvenanceFieldsV3,
  type NarratorBrowserFullRunProvenanceReceiptV3,
} from "../../../src/narrator/evaluation-browser-run-receipt-v3";
import type { NarratorRateabilitySummaryV3 } from "../../../src/narrator/evaluation-rateability-v3";
import type { NarratorRunReceiptV3 } from "../../../src/narrator/evaluation-receipts-v3";
import { createNarratorT5PublishedCandidateV1 } from "../../../src/narrator/t5-publication-evidence";

export interface NarratorBrowserCompletedEvidenceV3 {
  readonly receipt: NarratorRunReceiptV3;
  readonly summary: NarratorRateabilitySummaryV3;
  readonly sheet: NarratorBlindSheetV3;
  readonly key: NarratorBlindKeyV3;
}

export interface NarratorBrowserProvenanceRequestV3 {
  readonly sourceCommit: string;
  readonly observedBuild: NarratorBrowserObservedBuildV3;
  readonly buildToolchain: NarratorBrowserFullRunProvenanceFieldsV3["buildToolchain"];
  readonly browser: NarratorBrowserFullRunProvenanceFieldsV3["browser"];
  readonly network: NarratorBrowserFullRunNetworkV3;
}

export interface NarratorBrowserCommittedSourceBlobV3 {
  readonly path: string;
  readonly bytes: ArrayBuffer;
}

export interface NarratorBrowserCreatedEvidenceV3 {
  readonly provenanceReceipt: NarratorBrowserFullRunProvenanceReceiptV3;
  readonly runPackage: NarratorBrowserFullRunPackageV3;
}

export const narratorBrowserRateabilityCandidateV3 =
  createNarratorT5PublishedCandidateV1(publicationReceipt);

const smokeReceipt = adapterSmokeReceipt as NarratorBrowserAdapterSmokeReceiptV3;

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function provenanceFields(
  request: NarratorBrowserProvenanceRequestV3,
  evidence: NarratorBrowserCompletedEvidenceV3,
): NarratorBrowserFullRunProvenanceFieldsV3 {
  return {
    ...request,
    verifiedRuntimeArtifacts: narratorBrowserOrtRuntimeV2.assets,
    adapterSmokeReceipt: smokeReceipt,
    runReceipt: evidence.receipt,
    rateabilitySummary: evidence.summary,
  };
}

function committedSourceReader(
  expectedSourceCommit: string,
  sources: readonly NarratorBrowserCommittedSourceBlobV3[],
): (commit: string, path: string) => Promise<ArrayBuffer> {
  const sourceMap = new Map<string, ArrayBuffer>();
  for (const source of sources) {
    if (typeof source !== "object"
      || source === null
      || typeof source.path !== "string"
      || !(source.bytes instanceof ArrayBuffer)
      || sourceMap.has(source.path)) {
      throw new TypeError("Narrator V3 committed source input is invalid");
    }
    sourceMap.set(source.path, source.bytes);
  }
  return async (commit, path) => {
    if (commit !== expectedSourceCommit) throw new Error("Unexpected narrator source commit");
    const bytes = sourceMap.get(path);
    if (bytes === undefined) throw new Error("Missing narrator committed source bytes");
    return bytes;
  };
}

export async function createAndVerifyNarratorBrowserEvidenceV3(
  request: NarratorBrowserProvenanceRequestV3,
  completed: NarratorBrowserCompletedEvidenceV3,
  sources: readonly NarratorBrowserCommittedSourceBlobV3[],
): Promise<NarratorBrowserCreatedEvidenceV3> {
  const fields = provenanceFields(request, completed);
  const provenanceReceipt = createNarratorBrowserFullRunProvenanceReceiptV3(
    narratorBrowserRateabilityCandidateV3,
    fields,
  );
  const provenanceValid = await verifyNarratorBrowserFullRunProvenanceReceiptV3(
    provenanceReceipt,
    narratorBrowserRateabilityCandidateV3,
    fields,
    committedSourceReader(request.sourceCommit, sources),
  );
  if (!provenanceValid) {
    throw new Error("Narrator V3 full-run provenance receipt is invalid");
  }

  const packageEvidence = {
    provenanceReceipt,
    runReceipt: completed.receipt,
    rateabilitySummary: completed.summary,
    blindSheet: completed.sheet,
    blindKey: completed.key,
  };
  const runPackage = await createNarratorBrowserFullRunPackageV3(
    narratorBrowserRateabilityCandidateV3,
    smokeReceipt,
    packageEvidence,
  );
  if (!await isNarratorBrowserFullRunPackageForEvidenceV3(
    runPackage,
    narratorBrowserRateabilityCandidateV3,
    smokeReceipt,
    packageEvidence,
  )) {
    throw new Error("Narrator V3 full-run package is invalid");
  }
  return deepFreeze({ provenanceReceipt, runPackage });
}
