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
  ["network access", /(?:\bfetch\s*\(|\bnew\s+(?:WebSocket|XMLHttpRequest|EventSource)\b|\bsendBeacon\s*\()/],
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

const narratorEvaluationImport = /(?:shadow-(?:benchmark|collector|worker)|model-(?:candidate|provenance)|blind-evaluation(?:-v[23])?|evaluation(?:-(?:corpus|receipts(?:-v[23])?|runner(?:-v[23])?|prompt-contract|contract-v[23]|selection-contract-v3|evidence-contract-v3|worker-protocol-v[23]|browser-(?:assets|receipt|worker-port)-v2|transformers-adapter-v2))?|t5-(?:rebuild|publication))/;
for (const canary of [
  "evaluation-selection-contract-v3",
  "evaluation-contract-v3",
  "evaluation-evidence-contract-v3",
  "evaluation-worker-protocol-v3",
  "evaluation-receipts-v3",
  "evaluation-runner-v3",
  "blind-evaluation-v3",
]) {
  if (!narratorEvaluationImport.test(canary)) {
    violations.push(`Narrator V3 evaluation import canary escaped production boundary: ${canary}`);
  }
}
for (const file of productionSourceFiles) {
  const source = await readFile(file, "utf8");
  if (narratorEvaluationImport.test(source)) {
    violations.push(`${file}: production import of narrator evaluation-only module`);
  }
}

const narratorBrowserToolFiles = await sourceFiles("tools/narrator-browser-evaluation/src");
const transformersImports = [];
for (const file of narratorBrowserToolFiles) {
  const source = await readFile(file, "utf8");
  if (/from\s+["']@huggingface\/transformers["']/u.test(source)) transformersImports.push(file);
  if (/(?:core\/simulation|depth\/state|core\/persistence|CampaignRepository|pixi\.js|\bdocument\b|\bCanvas\b|\bARIA\b)/u.test(source)) {
    violations.push(`${file}: diagnostic narrator adapter crosses gameplay, persistence, renderer, or output-UI boundary`);
  }
}
if (transformersImports.length !== 1
  || transformersImports[0] !== "tools/narrator-browser-evaluation/src/transformers.worker.ts") {
  violations.push("Transformers.js must be imported only by the isolated narrator evaluation worker");
}

const productionBundleForbidden = [
  ["T5 evaluation evidence", /narrator-t5-rebuild|t5-(?:rebuild|publication)-evidence|the-grind-2-narrator-flan-t5-small|immutable-rebuild-observed|byte-identical-isolated-processes|the-grind-2:narrator-(?:prompt|token-accounting|prompt-and-token-contract):v2|the-grind-2:narrator-(?:form-[a-z0-9-]+|rendered-safety|evaluation-(?:worker-protocol|case-receipt|run-receipt|runner-sequencing|evidence)|blind-study):v3|Return exactly one value from allowedOutputs|Select the most fitting safe ambient narration form|model-selected-form-with-deterministic-host-rendering|exact top-score tie|generated-token-contract-error|workerBindingHash|narrator-browser-adapter-build|__verified_narrator__/],
  ["diagnostic model runtime", /@huggingface\/transformers|onnxruntime(?:-web)?|ort-wasm|AutoModelForSeq2SeqLM|AutoTokenizer/],
  ["Python source", /#!/],
  ["model weight file", /model\.safetensors|encoder_model_quantized|decoder_model_merged_quantized/],
];
const narratorV3BundleCanaries = [
  "the-grind-2:narrator-form-prompt:v3",
  "the-grind-2:narrator-form-registry:v3",
  "the-grind-2:narrator-form-renderer:v3",
  "the-grind-2:narrator-rendered-safety:v3",
  "the-grind-2:narrator-form-eligibility:v3",
  "the-grind-2:narrator-form-input-token-accounting:v3",
  "the-grind-2:narrator-form-target-token-accounting:v3",
  "the-grind-2:narrator-form-generation:v3",
  "the-grind-2:narrator-form-float32-scores:v3",
  "the-grind-2:narrator-form-trie-selection:v3",
  "the-grind-2:narrator-form-selection-contract:v3",
  "the-grind-2:narrator-evaluation-worker-protocol:v3",
  "the-grind-2:narrator-evaluation-case-receipt:v3",
  "the-grind-2:narrator-evaluation-run-receipt:v3",
  "the-grind-2:narrator-evaluation-runner-sequencing:v3",
  "the-grind-2:narrator-blind-study:v3",
  "the-grind-2:narrator-evaluation-evidence:v3",
];
for (const canary of narratorV3BundleCanaries) {
  if (!productionBundleForbidden[0][1].test(canary)) {
    violations.push(`Narrator V3 contract canary escaped bundle boundary: ${canary}`);
  }
}
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

async function allFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await allFiles(path));
    else files.push(path);
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

let productionAssetFiles = [];
for (const directory of ["public", "dist"]) {
  try {
    productionAssetFiles.push(...await allFiles(directory));
  } catch {
    // The production bundle does not exist before its build.
  }
}
for (const file of productionAssetFiles) {
  if (/\.(?:onnx|wasm|mjs)$/u.test(file)
    || /(?:encoder_model_quantized|decoder_model_merged_quantized|ort-wasm)/u.test(file)) {
    violations.push(`${file}: diagnostic model/runtime asset entered a production directory`);
  }
}

if (violations.length > 0) {
  throw new Error(`Canonical boundary violations:\n${violations.join("\n")}`);
}

process.stdout.write("Canonical reducer boundaries are clean.\n");
