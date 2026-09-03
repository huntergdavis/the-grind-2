import { readFile, readdir } from "node:fs/promises";

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) files.push(path);
  }
  return files;
}

const depthFiles = await sourceFiles("src/depth");
const ledgerFiles = await sourceFiles("src/ledger");
const canonicalFiles = [
  "src/core/rng.ts",
  "src/core/simulation.ts",
  "src/core/actor-policy.ts",
  ...depthFiles,
  ...ledgerFiles,
];
const presentationRegistryFiles = [
  "src/ui/hero-level-up.ts",
  "src/ui/hero-growth-allocation.ts",
  "src/ui/ability-resonance.ts",
  "src/ui/weapon-memory.ts",
  "src/ui/battle-spoils.ts",
  "src/ui/town-itinerary.ts",
  "src/ui/pattern-break-signature.ts",
  "src/ui/pattern-break-observer-reaction.ts",
  "src/render/cutaway-registry.ts",
  "src/render/cutaway-controller.ts",
  "src/render/hero-growth-allocation-cutaway.ts",
  "src/render/weapon-memory-cutaway.ts",
  "src/render/battle-spoils-cutaway.ts",
  "src/render/town-itinerary-cutaway.ts",
];
const narratorBoundaryFiles = await sourceFiles("src/narrator");
const narratorEvaluationFiles = narratorBoundaryFiles.filter((path) =>
  path.includes("evaluation") || path.includes("benchmark") || path.includes("collector")
    || path.includes("shadow-worker") || path.endsWith("model-candidate.ts")
    || path.endsWith("model-provenance.ts") || path.includes("t5-rebuild")
    || path.includes("t5-publication"));
const narratorEvaluationFileSet = new Set(narratorEvaluationFiles);
const productionSourceFiles = (await sourceFiles("src")).filter((path) =>
  !narratorEvaluationFileSet.has(path));
const forbidden = [
  ["ambient randomness", /Math\.random/],
  ["ambient wall time", /\bDate\s*\.|\bDate\s*\(/],
  ["ambient high-resolution time", /\bperformance\.now\s*\(/],
  ["ambient timer", /\b(?:setTimeout|setInterval|requestAnimationFrame)\s*\(/],
  ["ambient browser randomness", /\bcrypto\.getRandomValues\s*\(/],
  ["locale-sensitive ordering", /\.localeCompare\s*\(/],
  ["network access", /\b(?:fetch|WebSocket|XMLHttpRequest)\b/],
  ["DOM access", /\b(?:document|window|HTMLElement)\b/],
  ["renderer dependency", /pixi\.js/],
  ["browser storage", /\b(?:indexedDB|localStorage|sessionStorage)\b/],
  ["model runtime", /\b(?:WebLLM|webllm)\b/],
];

const violations = [];
for (const file of canonicalFiles) {
  const source = await readFile(file, "utf8");
  for (const [label, pattern] of forbidden) {
    if (pattern.test(source)) violations.push(`${file}: ${label}`);
  }
}

const presentationForbidden = [
  ["simulation dependency", /(?:core\/simulation|depth\/state|simulation-client|simulation-runtime)/],
  ["persistence dependency", /(?:core\/persistence|CampaignRepository|indexedDB|localStorage|sessionStorage)/],
  ["gameplay mutation capability", /(?:stepDepth|advanceWorld|applyCommand|reducer)/],
  ["ambient randomness", /(?:Math\.random|crypto\.getRandomValues|core\/rng)/],
  ["ambient wall time", /\bDate\s*\.|\bDate\s*\(/],
  ["ambient timer", /\b(?:setTimeout|setInterval|requestAnimationFrame)\s*\(/],
  ["network access", /\b(?:fetch|WebSocket|XMLHttpRequest)\b/],
  ["DOM access", /\b(?:document|window|HTMLElement)\b/],
  ["renderer dependency", /pixi\.js/],
];
for (const file of presentationRegistryFiles) {
  const source = await readFile(file, "utf8");
  for (const [label, pattern] of presentationForbidden) {
    if (pattern.test(source)) violations.push(`${file}: ${label}`);
  }
}

const narratorForbidden = [
  ["simulation authority", /(?:core\/simulation|depth\/state|applyCommand|advanceWorld|stepDepth)/],
  ["persistence dependency", /(?:core\/persistence|CampaignRepository|indexedDB|localStorage|sessionStorage)/],
  ["network access", /\b(?:fetch|WebSocket|XMLHttpRequest|EventSource|sendBeacon)\b/],
  ["renderer dependency", /pixi\.js/],
];
for (const file of narratorBoundaryFiles) {
  const source = await readFile(file, "utf8");
  for (const [label, pattern] of narratorForbidden) {
    if (pattern.test(source)) violations.push(`${file}: narrator ${label}`);
  }
}

const narratorEvaluationForbidden = [
  ["live narrator client authority", /(?:narrator-client|NarratorClient|NarratorModelAdmission)/],
  ["model enable authority", /\.enable\s*\(/],
  ["DOM authority", /\b(?:document\s*\.|window\s*\.(?:document|location|navigator|innerWidth|innerHeight|devicePixelRatio|matchMedia|addEventListener|removeEventListener|dispatchEvent|localStorage|sessionStorage)|HTMLElement|customElements\s*\.|navigator\.clipboard)\b/],
];
for (const file of narratorEvaluationFiles) {
  const source = await readFile(file, "utf8");
  for (const [label, pattern] of narratorEvaluationForbidden) {
    if (pattern.test(source)) violations.push(`${file}: narrator evaluation ${label}`);
  }
}

const narratorEvaluationImport = /(?:shadow-(?:benchmark|collector|worker)|model-(?:candidate|provenance)|evaluation-(?:corpus|receipts|runner)|t5-(?:rebuild|publication))/;
for (const file of productionSourceFiles) {
  const source = await readFile(file, "utf8");
  if (narratorEvaluationImport.test(source)) {
    violations.push(`${file}: production import of narrator evaluation-only module`);
  }
}

const productionBundleForbidden = [
  ["T5 evaluation evidence", /narrator-t5-rebuild|t5-(?:rebuild|publication)-evidence|the-grind-2-narrator-flan-t5-small|immutable-rebuild-observed|byte-identical-isolated-processes/],
  ["Python source", /#!/],
  ["model weight file", /model\.safetensors|encoder_model_quantized|decoder_model_merged_quantized/],
];
async function bundleFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await bundleFiles(path));
    else if (/\.(?:js|css|html|json)$/u.test(entry.name)) files.push(path);
  }
  return files;
}

let distFiles = [];
try {
  distFiles = await bundleFiles("dist");
} catch {
  // `check:boundaries` also runs before the production build.
}
for (const file of distFiles) {
  const source = await readFile(file, "utf8");
  for (const [label, pattern] of productionBundleForbidden) {
    if (pattern.test(source)) violations.push(`${file}: production bundle contains ${label}`);
  }
}

if (violations.length > 0) {
  throw new Error(`Canonical boundary violations:\n${violations.join("\n")}`);
}

process.stdout.write("Canonical reducer boundaries are clean.\n");
