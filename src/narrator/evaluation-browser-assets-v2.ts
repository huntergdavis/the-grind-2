import type { NarratorVerifiedArtifactV1 } from "./evaluation-receipts";
import { isNarratorModelCandidateV2, type NarratorModelCandidate } from "./model-candidate";
import { isNarratorBoundedText, isNarratorRecord, narratorHasExactKeys } from "./protocol";

export interface NarratorBrowserRuntimeArtifactV2 {
  readonly path: string;
  readonly role: "runtime-module" | "runtime-wasm";
  readonly byteLength: number;
  readonly sha256: string;
}

export interface NarratorBrowserStagedArtifactV2 {
  readonly path: string;
  readonly bytes: ArrayBuffer;
}

export interface NarratorVerifiedBrowserAssetClosureV2 {
  readonly modelArtifacts: readonly NarratorVerifiedArtifactV1[];
  readonly runtimeArtifacts: readonly NarratorBrowserRuntimeArtifactV2[];
  modelArtifactBlob(path: string): Blob;
  runtimeArtifactBlob(path: string): Blob;
}

export type NarratorBrowserSha256V2 = (bytes: ArrayBuffer) => Promise<string>;

export const narratorBrowserOrtRuntimeV2 = Object.freeze({
  package: "onnxruntime-web" as const,
  version: "1.26.0-dev.20260416-b7804b056c" as const,
  license: "MIT" as const,
  integrity: "sha512-MD6Ss4GSpQBo6zqoJzyT9LRbKYs7x/JVN23FT24EcEvlqF4VuzPOeH6X38orZPKHQDbprn7K+SBpu0/mj2CQiw==" as const,
  assets: Object.freeze([
    Object.freeze({
      path: "ort-wasm-simd-threaded.asyncify.mjs",
      role: "runtime-module" as const,
      byteLength: 47_389,
      sha256: "5959c6733039619c9af710d8e1bae8d6e84402787990637be987c2b1bd6c5fa9",
    }),
    Object.freeze({
      path: "ort-wasm-simd-threaded.asyncify.wasm",
      role: "runtime-wasm" as const,
      byteLength: 23_567_050,
      sha256: "e0c0c6d3e73d43b8a249972f8358f845b08cc16fec3c80efafdf8bed40366786",
    }),
  ]),
});

const sha256Pattern = /^[0-9a-f]{64}$/u;

function denseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function expectedArtifactIsValid(value: unknown): value is NarratorVerifiedArtifactV1 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["path", "byteLength", "sha256"])
    && isNarratorBoundedText(value.path, 240)
    && Number.isSafeInteger(value.byteLength)
    && Number(value.byteLength) > 0
    && sha256Pattern.test(String(value.sha256));
}

function expectedRuntimeArtifactIsValid(value: unknown): value is NarratorBrowserRuntimeArtifactV2 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["path", "role", "byteLength", "sha256"])
    && isNarratorBoundedText(value.path, 240)
    && ["runtime-module", "runtime-wasm"].includes(String(value.role))
    && Number.isSafeInteger(value.byteLength)
    && Number(value.byteLength) > 0
    && sha256Pattern.test(String(value.sha256));
}

function stagedArtifactIsValid(value: unknown): value is NarratorBrowserStagedArtifactV2 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["path", "bytes"])
    && isNarratorBoundedText(value.path, 240)
    && value.bytes instanceof ArrayBuffer;
}

async function browserSha256(bytes: ArrayBuffer): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest !== "function") {
    throw new Error("Web Crypto SHA-256 is unavailable");
  }
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyNarratorBrowserAssetClosureV2(
  expectedModelArtifacts: readonly NarratorVerifiedArtifactV1[],
  expectedRuntimeArtifacts: readonly NarratorBrowserRuntimeArtifactV2[],
  stagedModelArtifacts: unknown,
  stagedRuntimeArtifacts: unknown,
  sha256: NarratorBrowserSha256V2 = browserSha256,
): Promise<NarratorVerifiedBrowserAssetClosureV2> {
  if (!denseArray(expectedModelArtifacts)
    || expectedModelArtifacts.length === 0
    || !expectedModelArtifacts.every(expectedArtifactIsValid)
    || !denseArray(expectedRuntimeArtifacts)
    || expectedRuntimeArtifacts.length !== 2
    || !expectedRuntimeArtifacts.every(expectedRuntimeArtifactIsValid)
    || !denseArray(stagedModelArtifacts)
    || !denseArray(stagedRuntimeArtifacts)
    || stagedModelArtifacts.length !== expectedModelArtifacts.length
    || stagedRuntimeArtifacts.length !== expectedRuntimeArtifacts.length
    || !stagedModelArtifacts.every(stagedArtifactIsValid)
    || !stagedRuntimeArtifacts.every(stagedArtifactIsValid)) {
    throw new TypeError("Narrator browser asset closure shape is invalid");
  }

  const expectedPaths = new Set([
    ...expectedModelArtifacts.map((artifact) => artifact.path),
    ...expectedRuntimeArtifacts.map((artifact) => artifact.path),
  ]);
  if (expectedPaths.size !== expectedModelArtifacts.length + expectedRuntimeArtifacts.length) {
    throw new TypeError("Narrator browser asset closure contains duplicate expected paths");
  }
  const stagedPaths = new Set([
    ...stagedModelArtifacts.map((artifact) => artifact.path),
    ...stagedRuntimeArtifacts.map((artifact) => artifact.path),
  ]);
  if (stagedPaths.size !== stagedModelArtifacts.length + stagedRuntimeArtifacts.length
    || stagedPaths.size !== expectedPaths.size
    || [...stagedPaths].some((path) => !expectedPaths.has(path))) {
    throw new TypeError("Narrator browser asset closure paths do not match");
  }

  const stagedByPath = new Map<string, ArrayBuffer>();
  for (const staged of [...stagedModelArtifacts, ...stagedRuntimeArtifacts]) {
    stagedByPath.set(staged.path, staged.bytes);
  }
  for (const expected of [...expectedModelArtifacts, ...expectedRuntimeArtifacts]) {
    if (stagedByPath.get(expected.path)?.byteLength !== expected.byteLength) {
      throw new TypeError(`Narrator browser asset byte length does not match: ${expected.path}`);
    }
  }

  const blobs = new Map<string, Blob>();
  for (const expected of [...expectedModelArtifacts, ...expectedRuntimeArtifacts]) {
    const bytes = stagedByPath.get(expected.path)!;
    if (await sha256(bytes) !== expected.sha256) {
      throw new TypeError(`Narrator browser asset SHA-256 does not match: ${expected.path}`);
    }
    const contentType = expected.path.endsWith(".mjs")
      ? "text/javascript"
      : expected.path.endsWith(".wasm")
        ? "application/wasm"
        : "application/octet-stream";
    blobs.set(expected.path, new Blob([bytes], { type: contentType }));
  }

  const modelEvidence = Object.freeze(expectedModelArtifacts.map((artifact) => Object.freeze({
    path: artifact.path,
    byteLength: artifact.byteLength,
    sha256: artifact.sha256,
  })));
  const runtimeEvidence = Object.freeze(expectedRuntimeArtifacts.map((artifact) => Object.freeze({ ...artifact })));
  const readBlob = (path: string, allowed: ReadonlySet<string>, label: string): Blob => {
    if (!allowed.has(path)) throw new TypeError(`Unknown ${label} asset path`);
    const blob = blobs.get(path);
    if (blob === undefined) throw new TypeError(`Missing verified ${label} asset`);
    return blob;
  };
  const modelPaths = new Set(modelEvidence.map((artifact) => artifact.path));
  const runtimePaths = new Set(runtimeEvidence.map((artifact) => artifact.path));
  return Object.freeze({
    modelArtifacts: modelEvidence,
    runtimeArtifacts: runtimeEvidence,
    modelArtifactBlob(path: string): Blob {
      return readBlob(path, modelPaths, "model");
    },
    runtimeArtifactBlob(path: string): Blob {
      return readBlob(path, runtimePaths, "runtime");
    },
  });
}

export async function verifyNarratorBrowserEvaluationAssetsV2(
  candidate: NarratorModelCandidate,
  stagedModelArtifacts: unknown,
  stagedRuntimeArtifacts: unknown,
): Promise<NarratorVerifiedBrowserAssetClosureV2> {
  if (!isNarratorModelCandidateV2(candidate)
    || candidate.modelFamily !== "t5"
    || candidate.runtime.package !== "@huggingface/transformers"
    || candidate.runtime.version !== "4.2.0") {
    throw new TypeError("Narrator browser evaluation candidate is invalid");
  }
  const expectedModelArtifacts = candidate.artifacts.map((artifact) => ({
    path: artifact.path,
    byteLength: artifact.byteLength,
    sha256: artifact.sha256,
  }));
  return verifyNarratorBrowserAssetClosureV2(
    expectedModelArtifacts,
    narratorBrowserOrtRuntimeV2.assets,
    stagedModelArtifacts,
    stagedRuntimeArtifacts,
  );
}
