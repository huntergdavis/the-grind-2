import { canonicalHash, canonicalStringify } from "../core/canonical";
import type {
  NarratorBlindResolution,
  NarratorBlindSide,
} from "./blind-evaluation";
import {
  narratorEvaluationCasesV1,
  narratorEvaluationCorpusHashV1,
  narratorEvaluationRequiredCases,
} from "./evaluation";
import { narratorPromptAndTokenContractHashV2 } from "./evaluation-prompt-contract";
import { isNarratorRunReceiptV2, type NarratorRunReceiptV2 } from "./evaluation-receipts-v2";
import { isNarratorModelCandidate, type NarratorModelCandidate } from "./model-candidate";
import {
  isNarratorBoundedText,
  isNarratorPromptV1,
  isNarratorRecord,
  narratorHasExactKeys,
  type NarratorPromptV1,
} from "./protocol";

export interface NarratorBlindSheetItemV2 {
  readonly schemaVersion: 2;
  readonly ordinal: number;
  readonly caseId: string;
  readonly prompt: NarratorPromptV1;
  readonly resolution: NarratorBlindResolution;
  readonly leftText: string | null;
  readonly rightText: string | null;
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
}

export interface NarratorBlindSheetV2 {
  readonly schemaVersion: 2;
  readonly sheetId: string;
  readonly runReceiptHash: string;
  readonly corpusHash: string;
  readonly contractHash: string;
  readonly answerKeySaltFingerprint: string;
  readonly items: readonly NarratorBlindSheetItemV2[];
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

export interface NarratorBlindKeyV2 {
  readonly schemaVersion: 2;
  readonly sheetHash: string;
  readonly runReceiptHash: string;
  readonly contractHash: string;
  readonly secretSalt: string;
  readonly items: readonly {
    readonly ordinal: number;
    readonly caseId: string;
    readonly modelSide: NarratorBlindSide;
  }[];
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

const hashPattern = /^[0-9a-f]{16}$/u;
const sides: readonly NarratorBlindSide[] = ["left", "right"];
const resolutions: readonly NarratorBlindResolution[] = ["rate", "auto-tie", "unrated-invalid"];

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function exactCanonical(value: unknown, expected: unknown): boolean {
  try {
    return canonicalStringify(value) === canonicalStringify(expected);
  } catch {
    return false;
  }
}

function hasValidContentHash(value: Record<string, unknown>): boolean {
  if (!hashPattern.test(String(value.contentHash))) return false;
  const { contentHash, ...content } = value;
  return value.contentHash === canonicalHash(content);
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function isPrivateSalt(value: unknown): value is string {
  return isNarratorBoundedText(value, 240) && /^[A-Za-z0-9_-]{43,240}$/u.test(value);
}

function stratumOf(ordinal: number): string {
  const prompt = narratorEvaluationCasesV1[ordinal]!.prompt;
  return `${prompt.move}:${prompt.facts.energy}:${prompt.voice}`;
}

function saltFingerprint(sheetId: string, runReceiptHash: string, secretSalt: string): string {
  return canonicalHash({
    schemaVersion: 2,
    sheetId,
    runReceiptHash,
    contractHash: narratorPromptAndTokenContractHashV2,
    secretSalt,
  });
}

function modelSideAssignments(
  sheetId: string,
  runReceiptHash: string,
  secretSalt: string,
): readonly NarratorBlindSide[] {
  const groups = new Map<string, number[]>();
  for (let ordinal = 0; ordinal < narratorEvaluationCasesV1.length; ordinal += 1) {
    const stratum = stratumOf(ordinal);
    const group = groups.get(stratum) ?? [];
    group.push(ordinal);
    groups.set(stratum, group);
  }
  const oddStrata = [...groups.entries()]
    .filter(([, ordinals]) => ordinals.length % 2 === 1)
    .sort(([left], [right]) => {
      const leftHash = canonicalHash({ sheetId, runReceiptHash, secretSalt, stratum: left });
      const rightHash = canonicalHash({ sheetId, runReceiptHash, secretSalt, stratum: right });
      return leftHash < rightHash ? -1 : leftHash > rightHash ? 1 : 0;
    });
  const extraLeft = new Set(oddStrata.slice(0, oddStrata.length / 2).map(([stratum]) => stratum));
  const assignments = Array<NarratorBlindSide>(narratorEvaluationRequiredCases).fill("right");
  for (const [stratum, ordinals] of groups) {
    const ordered = [...ordinals].sort((left, right) => {
      const leftHash = canonicalHash({ sheetId, runReceiptHash, secretSalt, caseId: narratorEvaluationCasesV1[left]!.id });
      const rightHash = canonicalHash({ sheetId, runReceiptHash, secretSalt, caseId: narratorEvaluationCasesV1[right]!.id });
      return leftHash < rightHash ? -1 : leftHash > rightHash ? 1 : 0;
    });
    const leftCount = Math.floor(ordered.length / 2) + (extraLeft.has(stratum) ? 1 : 0);
    for (let index = 0; index < leftCount; index += 1) assignments[ordered[index]!] = "left";
  }
  return Object.freeze(assignments);
}

function expectedTexts(
  runReceipt: NarratorRunReceiptV2,
  ordinal: number,
): {
  readonly resolution: NarratorBlindResolution;
  readonly modelText: string | null;
  readonly baselineText: string | null;
} {
  const row = runReceipt.rows[ordinal]!;
  const evaluationCase = narratorEvaluationCasesV1[ordinal]!;
  const valid = row.status === "ok" && row.safetyAccepted && row.outputText !== null;
  return {
    resolution: !valid
      ? "unrated-invalid"
      : row.outputText === evaluationCase.deterministicBaseline ? "auto-tie" : "rate",
    modelText: valid ? row.outputText : null,
    baselineText: valid ? evaluationCase.deterministicBaseline : null,
  };
}

export function generateNarratorBlindStudySaltV2(
  source: Pick<Crypto, "getRandomValues"> = globalThis.crypto,
): string {
  if (source === undefined || typeof source.getRandomValues !== "function") {
    throw new TypeError("Web Crypto random generation is unavailable");
  }
  const bytes = new Uint8Array(32);
  source.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function createNarratorBlindStudyV2(
  candidate: NarratorModelCandidate,
  runReceipt: NarratorRunReceiptV2,
  sheetId: string,
  secretSalt: string,
): { readonly sheet: NarratorBlindSheetV2; readonly key: NarratorBlindKeyV2 } {
  if (!isNarratorRunReceiptV2(runReceipt, candidate)) throw new TypeError("Narrator V2 run receipt is invalid");
  if (!isNarratorBoundedText(sheetId, 200) || !isPrivateSalt(secretSalt)) {
    throw new TypeError("Narrator V2 blind study identity is invalid");
  }
  const assignments = modelSideAssignments(sheetId, runReceipt.contentHash, secretSalt);
  const items = runReceipt.rows.map((_, ordinal): NarratorBlindSheetItemV2 => {
    const evaluationCase = narratorEvaluationCasesV1[ordinal]!;
    const modelSide = assignments[ordinal]!;
    const expected = expectedTexts(runReceipt, ordinal);
    return deepFreeze({
      schemaVersion: 2,
      ordinal,
      caseId: evaluationCase.id,
      prompt: evaluationCase.prompt,
      resolution: expected.resolution,
      leftText: modelSide === "left" ? expected.modelText : expected.baselineText,
      rightText: modelSide === "right" ? expected.modelText : expected.baselineText,
      modelAdmitted: false,
      displayAuthorized: false,
    });
  });
  const sheetContent = {
    schemaVersion: 2 as const,
    sheetId,
    runReceiptHash: runReceipt.contentHash,
    corpusHash: narratorEvaluationCorpusHashV1,
    contractHash: narratorPromptAndTokenContractHashV2,
    answerKeySaltFingerprint: saltFingerprint(sheetId, runReceipt.contentHash, secretSalt),
    items: Object.freeze(items),
    modelAdmitted: false as const,
    displayAuthorized: false as const,
  };
  const sheet = deepFreeze({ ...sheetContent, contentHash: canonicalHash(sheetContent) });
  const keyItems = assignments.map((modelSide, ordinal) => Object.freeze({
    ordinal,
    caseId: narratorEvaluationCasesV1[ordinal]!.id,
    modelSide,
  }));
  const keyContent = {
    schemaVersion: 2 as const,
    sheetHash: sheet.contentHash,
    runReceiptHash: runReceipt.contentHash,
    contractHash: narratorPromptAndTokenContractHashV2,
    secretSalt,
    items: Object.freeze(keyItems),
    modelAdmitted: false as const,
    displayAuthorized: false as const,
  };
  return deepFreeze({ sheet, key: { ...keyContent, contentHash: canonicalHash(keyContent) } });
}

function isSheetItem(
  value: unknown,
  runReceipt: NarratorRunReceiptV2,
  ordinal: number,
): value is NarratorBlindSheetItemV2 {
  const evaluationCase = narratorEvaluationCasesV1[ordinal];
  if (evaluationCase === undefined
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "ordinal", "caseId", "prompt", "resolution", "leftText", "rightText",
      "modelAdmitted", "displayAuthorized",
    ])
    || value.schemaVersion !== 2
    || value.ordinal !== ordinal
    || value.caseId !== evaluationCase.id
    || !isNarratorPromptV1(value.prompt)
    || !exactCanonical(value.prompt, evaluationCase.prompt)
    || !resolutions.includes(value.resolution as NarratorBlindResolution)
    || !(value.leftText === null || typeof value.leftText === "string")
    || !(value.rightText === null || typeof value.rightText === "string")
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false) return false;
  const expected = expectedTexts(runReceipt, ordinal);
  if (value.resolution !== expected.resolution) return false;
  if (expected.resolution === "unrated-invalid") return value.leftText === null && value.rightText === null;
  return (value.leftText === expected.modelText && value.rightText === expected.baselineText)
    || (value.leftText === expected.baselineText && value.rightText === expected.modelText);
}

function raterSheetIsValid(
  value: unknown,
  candidate: unknown,
  runReceipt: unknown,
): value is NarratorBlindSheetV2 {
  if (!isNarratorModelCandidate(candidate)
    || !isNarratorRunReceiptV2(runReceipt, candidate)
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "sheetId", "runReceiptHash", "corpusHash", "contractHash",
      "answerKeySaltFingerprint", "items", "modelAdmitted", "displayAuthorized", "contentHash",
    ])
    || value.schemaVersion !== 2
    || !isNarratorBoundedText(value.sheetId, 200)
    || value.runReceiptHash !== runReceipt.contentHash
    || value.corpusHash !== narratorEvaluationCorpusHashV1
    || value.contractHash !== narratorPromptAndTokenContractHashV2
    || !hashPattern.test(String(value.answerKeySaltFingerprint))
    || !isDenseArray(value.items)
    || value.items.length !== narratorEvaluationRequiredCases
    || !value.items.every((item, ordinal) => isSheetItem(item, runReceipt, ordinal))
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false
    || !hasValidContentHash(value)) return false;
  return true;
}

export function isNarratorBlindRaterSheetV2(
  value: unknown,
  candidate: unknown,
  runReceipt: unknown,
): value is NarratorBlindSheetV2 {
  return raterSheetIsValid(value, candidate, runReceipt);
}

export function isNarratorBlindKeyV2(
  value: unknown,
  candidate: unknown,
  runReceipt: unknown,
  sheet: unknown,
): value is NarratorBlindKeyV2 {
  if (!isNarratorModelCandidate(candidate)
    || !isNarratorRunReceiptV2(runReceipt, candidate)
    || !raterSheetIsValid(sheet, candidate, runReceipt)
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "sheetHash", "runReceiptHash", "contractHash", "secretSalt", "items",
      "modelAdmitted", "displayAuthorized", "contentHash",
    ])
    || value.schemaVersion !== 2
    || value.sheetHash !== sheet.contentHash
    || value.runReceiptHash !== runReceipt.contentHash
    || value.contractHash !== narratorPromptAndTokenContractHashV2
    || !isPrivateSalt(value.secretSalt)
    || !isDenseArray(value.items)
    || value.items.length !== narratorEvaluationRequiredCases
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false
    || !hasValidContentHash(value)
    || sheet.answerKeySaltFingerprint !== saltFingerprint(sheet.sheetId, runReceipt.contentHash, value.secretSalt)) {
    return false;
  }
  const typedRunReceipt = runReceipt as NarratorRunReceiptV2;
  const typedSheet = sheet as NarratorBlindSheetV2;
  const expectedAssignments = modelSideAssignments(typedSheet.sheetId, typedRunReceipt.contentHash, value.secretSalt);
  return value.items.every((item, ordinal) => {
    if (!isNarratorRecord(item)
      || !narratorHasExactKeys(item, ["ordinal", "caseId", "modelSide"])
      || item.ordinal !== ordinal
      || item.caseId !== narratorEvaluationCasesV1[ordinal]!.id
      || !sides.includes(item.modelSide as NarratorBlindSide)
      || item.modelSide !== expectedAssignments[ordinal]) return false;
    const expected = expectedTexts(typedRunReceipt, ordinal);
    const sheetItem = typedSheet.items[ordinal]!;
    return sheetItem.leftText === (item.modelSide === "left" ? expected.modelText : expected.baselineText)
      && sheetItem.rightText === (item.modelSide === "right" ? expected.modelText : expected.baselineText);
  });
}

export function isNarratorBlindSheetV2(
  value: unknown,
  candidate: unknown,
  runReceipt: unknown,
  key: unknown,
): value is NarratorBlindSheetV2 {
  return raterSheetIsValid(value, candidate, runReceipt)
    && isNarratorBlindKeyV2(key, candidate, runReceipt, value);
}
