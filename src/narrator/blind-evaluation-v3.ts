import { canonicalHash, canonicalStringify } from "../core/canonical";
import type {
  NarratorBlindResolution,
  NarratorBlindSide,
} from "./blind-evaluation";
import {
  narratorBlindStudyContractHashV3,
  narratorEvaluationEvidenceContractHashV3,
} from "./evaluation-evidence-contract-v3";
import {
  narratorEvaluationCasesV1,
  narratorEvaluationCorpusHashV1,
  narratorEvaluationRequiredCases,
} from "./evaluation";
import {
  isNarratorRunReceiptV3,
  type NarratorRunReceiptV3,
} from "./evaluation-receipts-v3";
import {
  narratorFormPromptBytesHashV3,
  narratorFormSelectionContractHashV3,
} from "./evaluation-selection-contract-v3";
import { isNarratorModelCandidate, type NarratorModelCandidate } from "./model-candidate";
import {
  isNarratorBoundedText,
  isNarratorPromptV1,
  isNarratorRecord,
  narratorHasExactKeys,
  type NarratorPromptV1,
} from "./protocol";

export interface NarratorBlindSheetItemV3 {
  readonly schemaVersion: 3;
  readonly ordinal: number;
  readonly caseId: string;
  readonly prompt: NarratorPromptV1;
  readonly promptBytesHash: string;
  readonly resolution: NarratorBlindResolution;
  readonly leftText: string | null;
  readonly rightText: string | null;
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
}

export interface NarratorBlindSheetV3 {
  readonly schemaVersion: 3;
  readonly sheetId: string;
  readonly runReceiptHash: string;
  readonly runSpecHash: string;
  readonly corpusHash: string;
  readonly selectionContractHash: string;
  readonly evidenceContractHash: string;
  readonly blindStudyContractHash: string;
  readonly answerKeySaltFingerprint: string;
  readonly items: readonly NarratorBlindSheetItemV3[];
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

export interface NarratorBlindKeyV3 {
  readonly schemaVersion: 3;
  readonly sheetHash: string;
  readonly runReceiptHash: string;
  readonly runSpecHash: string;
  readonly selectionContractHash: string;
  readonly evidenceContractHash: string;
  readonly blindStudyContractHash: string;
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
  try {
    const { contentHash, ...content } = value;
    return value.contentHash === canonicalHash(content);
  } catch {
    return false;
  }
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === value.length
    && keys.every((key, index) => key === String(index));
}

function isPrivateSalt(value: unknown): value is string {
  return isNarratorBoundedText(value, 240) && /^[A-Za-z0-9_-]{43,240}$/u.test(value);
}

function copyPrompt(prompt: NarratorPromptV1): NarratorPromptV1 {
  return {
    ...prompt,
    facts: { ...prompt.facts },
  };
}

function stratumOf(ordinal: number): string {
  const prompt = narratorEvaluationCasesV1[ordinal]!.prompt;
  return `${prompt.move}:${prompt.facts.energy}:${prompt.voice}`;
}

function saltFingerprint(
  sheetId: string,
  runReceiptHash: string,
  runSpecHash: string,
  secretSalt: string,
): string {
  return canonicalHash({
    schemaVersion: 3,
    sheetId,
    runReceiptHash,
    runSpecHash,
    selectionContractHash: narratorFormSelectionContractHashV3,
    evidenceContractHash: narratorEvaluationEvidenceContractHashV3,
    blindStudyContractHash: narratorBlindStudyContractHashV3,
    secretSalt,
  });
}

function modelSideAssignments(
  sheetId: string,
  runReceiptHash: string,
  runSpecHash: string,
  secretSalt: string,
): readonly NarratorBlindSide[] {
  const groups = new Map<string, number[]>();
  for (let ordinal = 0; ordinal < narratorEvaluationCasesV1.length; ordinal += 1) {
    const stratum = stratumOf(ordinal);
    const group = groups.get(stratum) ?? [];
    group.push(ordinal);
    groups.set(stratum, group);
  }
  const domain = {
    schemaVersion: 3 as const,
    runSpecHash,
    blindStudyContractHash: narratorBlindStudyContractHashV3,
  };
  const oddStrata = [...groups.entries()]
    .filter(([, ordinals]) => ordinals.length % 2 === 1)
    .sort(([left], [right]) => {
      const leftHash = canonicalHash({ ...domain, sheetId, runReceiptHash, secretSalt, stratum: left });
      const rightHash = canonicalHash({ ...domain, sheetId, runReceiptHash, secretSalt, stratum: right });
      return leftHash < rightHash ? -1 : leftHash > rightHash ? 1 : 0;
    });
  const extraLeft = new Set(oddStrata.slice(0, oddStrata.length / 2).map(([stratum]) => stratum));
  const assignments = Array<NarratorBlindSide>(narratorEvaluationRequiredCases).fill("right");
  for (const [stratum, ordinals] of groups) {
    const ordered = [...ordinals].sort((left, right) => {
      const leftHash = canonicalHash({
        ...domain,
        sheetId,
        runReceiptHash,
        secretSalt,
        caseId: narratorEvaluationCasesV1[left]!.id,
      });
      const rightHash = canonicalHash({
        ...domain,
        sheetId,
        runReceiptHash,
        secretSalt,
        caseId: narratorEvaluationCasesV1[right]!.id,
      });
      return leftHash < rightHash ? -1 : leftHash > rightHash ? 1 : 0;
    });
    const leftCount = Math.floor(ordered.length / 2) + (extraLeft.has(stratum) ? 1 : 0);
    for (let index = 0; index < leftCount; index += 1) assignments[ordered[index]!] = "left";
  }
  return Object.freeze(assignments);
}

function expectedTexts(
  runReceipt: NarratorRunReceiptV3,
  ordinal: number,
): {
  readonly resolution: NarratorBlindResolution;
  readonly modelText: string | null;
  readonly baselineText: string | null;
} {
  const row = runReceipt.rows[ordinal]!;
  const evaluationCase = narratorEvaluationCasesV1[ordinal]!;
  const valid = row.status === "ok"
    && row.request !== null
    && row.selection !== null
    && row.selectedFormId !== null
    && row.renderedText !== null
    && row.safetyAccepted
    && row.knowledgeViolationCount === 0
    && row.selectedFormId === row.selection.selectedFormId;
  return {
    resolution: !valid
      ? "unrated-invalid"
      : row.selectedFormId === row.request.eligibility.baselineFormId ? "auto-tie" : "rate",
    modelText: valid ? row.renderedText : null,
    baselineText: valid ? evaluationCase.deterministicBaseline : null,
  };
}

export function generateNarratorBlindStudySaltV3(
  source: Pick<Crypto, "getRandomValues"> = globalThis.crypto,
): string {
  if (source === undefined || typeof source.getRandomValues !== "function") {
    throw new TypeError("Web Crypto random generation is unavailable");
  }
  const bytes = new Uint8Array(32);
  source.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function createNarratorBlindStudyV3(
  candidate: NarratorModelCandidate,
  runReceipt: NarratorRunReceiptV3,
  sheetId: string,
  secretSalt: string,
): { readonly sheet: NarratorBlindSheetV3; readonly key: NarratorBlindKeyV3 } {
  if (!isNarratorRunReceiptV3(runReceipt, candidate)) throw new TypeError("Narrator V3 run receipt is invalid");
  if (!isNarratorBoundedText(sheetId, 200) || !isPrivateSalt(secretSalt)) {
    throw new TypeError("Narrator V3 blind study identity is invalid");
  }
  const runSpecHash = runReceipt.runSpec.contentHash;
  const assignments = modelSideAssignments(sheetId, runReceipt.contentHash, runSpecHash, secretSalt);
  const items = runReceipt.rows.map((_, ordinal): NarratorBlindSheetItemV3 => {
    const evaluationCase = narratorEvaluationCasesV1[ordinal]!;
    const modelSide = assignments[ordinal]!;
    const expected = expectedTexts(runReceipt, ordinal);
    return deepFreeze({
      schemaVersion: 3,
      ordinal,
      caseId: evaluationCase.id,
      prompt: copyPrompt(evaluationCase.prompt),
      promptBytesHash: narratorFormPromptBytesHashV3(evaluationCase.prompt),
      resolution: expected.resolution,
      leftText: modelSide === "left" ? expected.modelText : expected.baselineText,
      rightText: modelSide === "right" ? expected.modelText : expected.baselineText,
      modelAdmitted: false,
      displayAuthorized: false,
    });
  });
  const sheetContent = {
    schemaVersion: 3 as const,
    sheetId,
    runReceiptHash: runReceipt.contentHash,
    runSpecHash,
    corpusHash: narratorEvaluationCorpusHashV1,
    selectionContractHash: narratorFormSelectionContractHashV3,
    evidenceContractHash: narratorEvaluationEvidenceContractHashV3,
    blindStudyContractHash: narratorBlindStudyContractHashV3,
    answerKeySaltFingerprint: saltFingerprint(sheetId, runReceipt.contentHash, runSpecHash, secretSalt),
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
    schemaVersion: 3 as const,
    sheetHash: sheet.contentHash,
    runReceiptHash: runReceipt.contentHash,
    runSpecHash,
    selectionContractHash: narratorFormSelectionContractHashV3,
    evidenceContractHash: narratorEvaluationEvidenceContractHashV3,
    blindStudyContractHash: narratorBlindStudyContractHashV3,
    secretSalt,
    items: Object.freeze(keyItems),
    modelAdmitted: false as const,
    displayAuthorized: false as const,
  };
  return deepFreeze({ sheet, key: { ...keyContent, contentHash: canonicalHash(keyContent) } });
}

function isSheetItem(
  value: unknown,
  runReceipt: NarratorRunReceiptV3,
  ordinal: number,
): value is NarratorBlindSheetItemV3 {
  const evaluationCase = narratorEvaluationCasesV1[ordinal];
  if (evaluationCase === undefined
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "ordinal", "caseId", "prompt", "promptBytesHash", "resolution",
      "leftText", "rightText", "modelAdmitted", "displayAuthorized",
    ])
    || value.schemaVersion !== 3
    || value.ordinal !== ordinal
    || value.caseId !== evaluationCase.id
    || !isNarratorPromptV1(value.prompt)
    || !exactCanonical(value.prompt, evaluationCase.prompt)
    || value.promptBytesHash !== narratorFormPromptBytesHashV3(evaluationCase.prompt)
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
): value is NarratorBlindSheetV3 {
  if (!isNarratorModelCandidate(candidate)
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "sheetId", "runReceiptHash", "runSpecHash", "corpusHash",
      "selectionContractHash", "evidenceContractHash", "blindStudyContractHash",
      "answerKeySaltFingerprint", "items", "modelAdmitted", "displayAuthorized", "contentHash",
    ])
    || value.schemaVersion !== 3
    || !isNarratorBoundedText(value.sheetId, 200)
    || value.corpusHash !== narratorEvaluationCorpusHashV1
    || value.selectionContractHash !== narratorFormSelectionContractHashV3
    || value.evidenceContractHash !== narratorEvaluationEvidenceContractHashV3
    || value.blindStudyContractHash !== narratorBlindStudyContractHashV3
    || !hashPattern.test(String(value.answerKeySaltFingerprint))
    || !isDenseArray(value.items)
    || value.items.length !== narratorEvaluationRequiredCases
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false
    || !hasValidContentHash(value)) return false;
  if (!isNarratorRunReceiptV3(runReceipt, candidate)
    || value.runReceiptHash !== runReceipt.contentHash
    || value.runSpecHash !== runReceipt.runSpec.contentHash) return false;
  return value.items.every((item, ordinal) => isSheetItem(item, runReceipt, ordinal));
}

export function isNarratorBlindRaterSheetV3(
  value: unknown,
  candidate: unknown,
  runReceipt: unknown,
): value is NarratorBlindSheetV3 {
  return raterSheetIsValid(value, candidate, runReceipt);
}

export function isNarratorBlindKeyV3(
  value: unknown,
  candidate: unknown,
  runReceipt: unknown,
  sheet: unknown,
): value is NarratorBlindKeyV3 {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "sheetHash", "runReceiptHash", "runSpecHash", "selectionContractHash",
      "evidenceContractHash", "blindStudyContractHash", "secretSalt", "items",
      "modelAdmitted", "displayAuthorized", "contentHash",
    ])
    || value.schemaVersion !== 3
    || !hashPattern.test(String(value.sheetHash))
    || !hashPattern.test(String(value.runReceiptHash))
    || !hashPattern.test(String(value.runSpecHash))
    || value.selectionContractHash !== narratorFormSelectionContractHashV3
    || value.evidenceContractHash !== narratorEvaluationEvidenceContractHashV3
    || value.blindStudyContractHash !== narratorBlindStudyContractHashV3
    || !isPrivateSalt(value.secretSalt)
    || !isDenseArray(value.items)
    || value.items.length !== narratorEvaluationRequiredCases
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false
    || !hasValidContentHash(value)) return false;
  if (!raterSheetIsValid(sheet, candidate, runReceipt)) return false;
  const typedRunReceipt = runReceipt as NarratorRunReceiptV3;
  const typedSheet = sheet as NarratorBlindSheetV3;
  if (value.sheetHash !== typedSheet.contentHash
    || value.runReceiptHash !== typedRunReceipt.contentHash
    || value.runSpecHash !== typedRunReceipt.runSpec.contentHash
    || typedSheet.answerKeySaltFingerprint !== saltFingerprint(
      typedSheet.sheetId,
      typedRunReceipt.contentHash,
      typedRunReceipt.runSpec.contentHash,
      value.secretSalt,
    )) return false;
  const expectedAssignments = modelSideAssignments(
    typedSheet.sheetId,
    typedRunReceipt.contentHash,
    typedRunReceipt.runSpec.contentHash,
    value.secretSalt,
  );
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

export function isNarratorBlindSheetV3(
  value: unknown,
  candidate: unknown,
  runReceipt: unknown,
  key: unknown,
): value is NarratorBlindSheetV3 {
  return isNarratorBlindKeyV3(key, candidate, runReceipt, value);
}
