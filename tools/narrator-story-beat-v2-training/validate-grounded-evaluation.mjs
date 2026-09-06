#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generationContract as rawGenerationContract,
  groundedValidationReportKind,
  validateEvaluationFiles,
} from "./validate-evaluation.mjs";

export function groundedGenerationContract() {
  return {
    ...rawGenerationContract(),
    groundingConstraint: "factual-v2-eligible-form-token-trie-v1",
    presentationSequence: "location-shell-connector-6-slot-v2",
    targetTokenization: "host-derived-exact-roundtrip-forms-v2",
    exactTopScoreTiePolicy: "reject-v1",
  };
}

export function parseArguments(argv) {
  if (![6, 8].includes(argv.length)) {
    throw new Error(
      "Usage: node validate-grounded-evaluation.mjs --holdout <json> "
      + "--results <json> --model <checkpoint> [--report <new-json>]",
    );
  }
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !["--holdout", "--results", "--model", "--report"].includes(flag)
      || !value
      || flag in result
    ) throw new Error("grounded factual V2 scorer arguments are invalid");
    result[flag] = value;
  }
  if (!["--holdout", "--results", "--model"].every((flag) => flag in result)) {
    throw new Error("grounded factual V2 scorer arguments are incomplete");
  }
  return result;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  const reportBytes = await validateEvaluationFiles(args, {
    expectedGenerationContract: groundedGenerationContract(),
    reportKind: groundedValidationReportKind,
  });
  process.stdout.write(reportBytes);
}

const invokedPath = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `grounded factual story-beat V2 validation refused: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 2;
  });
}
