import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

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

const boundaryRepositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const narratorRateabilityToolRoot = "tools/narrator-browser-rateability-v3";
const narratorRateabilityClosureRoots = Object.freeze([
  `${narratorRateabilityToolRoot}/run.mjs`,
  `${narratorRateabilityToolRoot}/vite.config.ts`,
  `${narratorRateabilityToolRoot}/vite.host.config.ts`,
  `${narratorRateabilityToolRoot}/index.html`,
]);
const narratorRateabilityExplicitInputs = Object.freeze([
  ".gitignore",
  "docs/narrator/narrator-v3-browser-smoke-receipt.json",
  "docs/narrator/t5-artifact-publication-receipt.json",
  "package-lock.json",
  "package.json",
  "scripts/check-boundaries.mjs",
  "src/narrator/evaluation-prompt-contract.ts",
  `${narratorRateabilityToolRoot}/tsconfig.json`,
  "tsconfig.json",
]);

function repositoryPath(path) {
  return resolve(boundaryRepositoryRoot, path);
}

function normalizedRepositoryPath(path) {
  const normalized = relative(boundaryRepositoryRoot, path).split(sep).join("/");
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error("Narrator V3 rateability source edge escapes the repository");
  }
  return normalized;
}

async function regularFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (typeof error === "object" && error !== null && error.code === "ENOENT") return false;
    throw error;
  }
}

async function directory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (typeof error === "object" && error !== null && error.code === "ENOENT") return false;
    throw error;
  }
}

async function resolveNarratorRateabilityEdge(fromPath, specifier, htmlRoot = false) {
  const relativeSpecifier = specifier.startsWith(".") || (htmlRoot && specifier.startsWith("/"));
  if (!relativeSpecifier) return null;
  const base = htmlRoot && specifier.startsWith("/")
    ? resolve(repositoryPath(narratorRateabilityToolRoot), `.${specifier}`)
    : resolve(dirname(repositoryPath(fromPath)), specifier);
  normalizedRepositoryPath(base);
  const candidates = [base, `${base}.ts`, `${base}.mjs`, `${base}.js`, `${base}.json`, resolve(base, "index.ts")];
  for (const candidate of candidates) {
    if (await regularFile(candidate)) return normalizedRepositoryPath(candidate);
  }
  if (await directory(base)) return null;
  throw new Error(`Unresolved narrator V3 rateability source edge: ${fromPath} -> ${specifier}`);
}

function literalCodeEdges(source, path) {
  const edges = [];
  const patterns = [
    /(?:^|\n)\s*(?:import|export)\s+(?:(?!;)[\s\S])*?\sfrom\s+["']([^"'\n]+)["']\s*;?/gu,
    /(?:^|\n)\s*import\s+["']([^"'\n]+)["']\s*;?/gu,
    /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/gu,
    /\bnew\s+URL\s*\(\s*["']([^"'\n]+)["']\s*,\s*import\.meta\.url\s*\)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) edges.push(match[1]);
  }
  for (const match of source.matchAll(/\bimport\s*\(([^)]*)\)/gu)) {
    const observedHostImport = path === `${narratorRateabilityToolRoot}/run.mjs`
      && match[1].trim() === "hostEvidenceModuleUrl";
    if (!/^\s*["'][^"'\n]+["']\s*$/u.test(match[1]) && !observedHostImport) {
      throw new Error(`Nonliteral dynamic import in narrator V3 rateability closure: ${path}`);
    }
  }
  return edges;
}

function literalHtmlEdges(source, path) {
  const edges = [];
  for (const match of source.matchAll(/<script\b([^>]*)>/giu)) {
    const attributes = match[1];
    const type = /\btype\s*=\s*["']module["']/iu.test(attributes);
    const sourceMatch = attributes.match(/\bsrc\s*=\s*["']([^"']+)["']/iu);
    if (type && sourceMatch !== null) edges.push(sourceMatch[1]);
  }
  if (edges.length === 0) {
    throw new Error(`Narrator V3 rateability HTML has no literal module source: ${path}`);
  }
  return edges;
}

async function deriveNarratorRateabilityClosure() {
  const pending = [...narratorRateabilityClosureRoots, ...narratorRateabilityExplicitInputs];
  const discovered = new Set();
  while (pending.length > 0) {
    const path = pending.pop();
    if (discovered.has(path)) continue;
    if (!await regularFile(repositoryPath(path))) {
      throw new Error(`Narrator V3 rateability closure input is missing: ${path}`);
    }
    discovered.add(path);
    const source = await readFile(repositoryPath(path), "utf8");
    const edges = path.endsWith(".html")
      ? literalHtmlEdges(source, path)
      : /\.(?:ts|mjs|js)$/u.test(path)
        ? literalCodeEdges(source, path)
        : [];
    for (const specifier of edges) {
      const resolved = await resolveNarratorRateabilityEdge(path, specifier, path.endsWith(".html"));
      if (resolved !== null && !discovered.has(resolved)) pending.push(resolved);
    }
  }
  return [...discovered].sort();
}

function literalNarratorRateabilityManifest(source, declaration) {
  const declarationIndex = source.indexOf(declaration);
  if (declarationIndex < 0) throw new Error(`Missing narrator V3 source manifest: ${declaration}`);
  const match = source.slice(declarationIndex).match(/Object\.freeze\(\[([\s\S]*?)\]\s*(?:as const)?\s*\)/u);
  if (match === null) throw new Error(`Invalid narrator V3 source manifest: ${declaration}`);
  const paths = [...match[1].matchAll(/"([^"\n]+)"/gu)].map((entry) => entry[1]);
  if (paths.length === 0
    || new Set(paths).size !== paths.length
    || paths.some((path, index) => index > 0 && paths[index - 1] >= path)) {
    throw new Error(`Narrator V3 source manifest is not sorted and unique: ${declaration}`);
  }
  return paths;
}

const derivedNarratorRateabilityClosure = await deriveNarratorRateabilityClosure();
for (const path of derivedNarratorRateabilityClosure) {
  if (path === "scripts/check-boundaries.mjs" || !/\.(?:ts|mjs|js|html)$/u.test(path)) continue;
  const source = await readFile(repositoryPath(path), "utf8");
  if (/\b(?:WebSocket|EventSource|XMLHttpRequest|WebTransport|RTCPeerConnection)\b|\.sendBeacon\s*\(/u.test(source)) {
    violations.push(`${path}: narrator V3 rateability closure contains an unmeasured network API`);
  }
}
const narratorRateabilityManifestSources = Object.freeze([
  Object.freeze({
    path: "src/narrator/evaluation-browser-run-receipt-v3.ts",
    declaration: "narratorBrowserFullRunSourcePathsV3",
  }),
  Object.freeze({
    path: `${narratorRateabilityToolRoot}/run.mjs`,
    declaration: "const sourcePaths",
  }),
]);
for (const manifestSource of narratorRateabilityManifestSources) {
  const manifest = literalNarratorRateabilityManifest(
    await readFile(repositoryPath(manifestSource.path), "utf8"),
    manifestSource.declaration,
  );
  if (JSON.stringify(manifest) !== JSON.stringify(derivedNarratorRateabilityClosure)) {
    const expected = new Set(derivedNarratorRateabilityClosure);
    const observed = new Set(manifest);
    const missing = derivedNarratorRateabilityClosure.filter((path) => !observed.has(path));
    const extra = manifest.filter((path) => !expected.has(path));
    violations.push(`${manifestSource.path}: narrator V3 rateability source closure differs (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"})`);
  }
}

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
const narratorNetworkAllowlist = new Set([
  "src/narrator/local-model-assets.ts",
]);
for (const file of narratorBoundaryFiles) {
  const source = await readFile(file, "utf8");
  for (const [label, pattern] of narratorForbidden) {
    if (label === "network access" && narratorNetworkAllowlist.has(file)) continue;
    if (pattern.test(source)) violations.push(`${file}: narrator ${label}`);
  }
}
for (const file of narratorNetworkAllowlist) {
  const source = await readFile(file, "utf8");
  const calls = source.match(/\bfetch\s*\(/gu) ?? [];
  if (calls.length !== 1
    || !source.includes("https://raw.githubusercontent.com/")
    || !source.includes('method: "GET"')
    || !source.includes('cache: "no-store"')
    || !source.includes('credentials: "omit"')
    || !source.includes("/__the_grind_2_local_narrator__/v1/")) {
    violations.push(`${file}: narrator network exception is broader than the explicit pinned asset installer`);
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

const narratorEvaluationImport = /(?:shadow-(?:benchmark|collector|worker)|model-(?:candidate|provenance)|blind-evaluation(?:-v[23])?|evaluation(?:-(?:corpus|receipts(?:-v[23])?|runner(?:-v[23])?|prompt-contract|contract-v[23]|selection-contract-v3|evidence-contract-v3|rateability-v3|worker-protocol-v[23]|browser-(?:assets-v2|(?:receipt|worker-port)-v[23]|run-receipt-v3)|transformers-adapter-v[23]))?|t5-(?:rebuild|publication))/;
for (const canary of [
  "evaluation-selection-contract-v3",
  "evaluation-contract-v3",
  "evaluation-evidence-contract-v3",
  "evaluation-worker-protocol-v3",
  "evaluation-receipts-v3",
  "evaluation-runner-v3",
  "blind-evaluation-v3",
  "evaluation-transformers-adapter-v3",
  "evaluation-browser-worker-port-v3",
  "evaluation-browser-receipt-v3",
  "evaluation-rateability-v3",
  "evaluation-browser-run-receipt-v3",
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

const narratorBrowserToolFiles = [
  ...await sourceFiles("tools/narrator-browser-evaluation/src"),
  ...await sourceFiles("tools/narrator-browser-evaluation-v3/src"),
  ...await sourceFiles("tools/narrator-browser-rateability-v3/src"),
  "tools/narrator-browser-evaluation-v3/run-support.mjs",
  "tools/narrator-browser-evaluation-v3/run.mjs",
  "tools/narrator-browser-evaluation-v3/vite.config.ts",
  "tools/narrator-browser-rateability-v3/run-support.mjs",
  "tools/narrator-browser-rateability-v3/run.mjs",
  "tools/narrator-browser-rateability-v3/vite.config.ts",
];
const narratorRateabilityHarnessSource = await readFile(
  "tools/narrator-browser-rateability-v3/src/harness.ts",
  "utf8",
);
const narratorRateabilityCoordinatorSource = await readFile(
  "tools/narrator-browser-rateability-v3/run.mjs",
  "utf8",
);
const narratorRateabilityCoordinatorSupportSource = await readFile(
  "tools/narrator-browser-rateability-v3/run-support.mjs",
  "utf8",
);
const coreRunnerInvocations = narratorRateabilityHarnessSource
  .match(/\brunNarratorEvaluationV3\s*\(/gu) ?? [];
const transportStageInvocations = narratorRateabilityHarnessSource
  .match(/\.stageForOffline\s*\(/gu) ?? [];
if (coreRunnerInvocations.length !== 1 || transportStageInvocations.length !== 1) {
  violations.push("Narrator V3 rateability harness must stage transport once and invoke the core runner once");
}
for (const semanticCall of ["handshake", "verifyArtifacts", "load", "evaluate", "dispose"]) {
  if (new RegExp(`\\.${semanticCall}\\s*\\(`, "u").test(narratorRateabilityHarnessSource)) {
    violations.push(`Narrator V3 rateability harness staging calls semantic worker operation: ${semanticCall}`);
  }
}
const coordinatorInvocation = narratorRateabilityCoordinatorSource.indexOf(
  "const report = await coordinateNarratorBrowserRateabilityAttemptV3({",
);
const coordinatorObserve = narratorRateabilityCoordinatorSource.indexOf(
  "observe: async ({ preserveCore, confirmProducerSeal }) => {",
  coordinatorInvocation,
);
const coordinatorLaunch = narratorRateabilityCoordinatorSource.indexOf(
  "browser = await chromium.launch({ headless: true })",
  coordinatorObserve,
);
const coordinatorStage = narratorRateabilityCoordinatorSource.indexOf(
  ".__theGrindNarratorRateabilityV3.stage(",
  coordinatorLaunch,
);
const coordinatorOffline = narratorRateabilityCoordinatorSource.indexOf(
  ".setOffline(true)",
  coordinatorStage,
);
const coordinatorRun = narratorRateabilityCoordinatorSource.indexOf(
  ".__theGrindNarratorRateabilityV3.runAfterOffline(",
  coordinatorOffline,
);
const coordinatorCorePreservation = narratorRateabilityCoordinatorSource.indexOf(
  "await preserveCore(completed)",
  coordinatorRun,
);
const coordinatorWorkerSeal = narratorRateabilityCoordinatorSource.indexOf(
  "waitForWorkerSeal(page)",
  coordinatorCorePreservation,
);
const coordinatorProducerSeal = narratorRateabilityCoordinatorSource.indexOf(
  "const seal = await sealProducers();",
  coordinatorWorkerSeal,
);
const coordinatorSealConfirmation = narratorRateabilityCoordinatorSource.indexOf(
  "confirmProducerSeal();",
  coordinatorProducerSeal,
);
const coordinatorStdout = narratorRateabilityCoordinatorSource.indexOf(
  "process.stdout.write",
  coordinatorSealConfirmation,
);
const producerSealHelperStart = narratorRateabilityCoordinatorSource.indexOf(
  "async function sealBrowserProducers(",
);
const producerSealHelperEnd = narratorRateabilityCoordinatorSource.indexOf(
  "\nconst options =",
  producerSealHelperStart,
);
const producerSealHelperSource = narratorRateabilityCoordinatorSource.slice(
  producerSealHelperStart,
  producerSealHelperEnd,
);
const coordinatorPageClose = producerSealHelperSource.indexOf(
  ".close({ runBeforeUnload: false })",
);
const coordinatorContextClose = producerSealHelperSource.indexOf(
  "await context.close()",
);
const coordinatorBrowserClose = producerSealHelperSource.indexOf(
  "await browser.close()",
);
const attemptCoordinatorStart = narratorRateabilityCoordinatorSupportSource.indexOf(
  "export async function coordinateNarratorBrowserRateabilityAttemptV3(",
);
const attemptCoordinatorEnd = narratorRateabilityCoordinatorSupportSource.indexOf(
  "\nexport async function finalizeNarratorBrowserRateabilityEvidenceV3(",
  attemptCoordinatorStart,
);
const attemptCoordinatorSource = narratorRateabilityCoordinatorSupportSource.slice(
  attemptCoordinatorStart,
  attemptCoordinatorEnd,
);
const attemptBegin = attemptCoordinatorSource.indexOf(
  "beginNarratorBrowserRateabilityAttemptVaultV3(start)",
);
const attemptIssue = attemptCoordinatorSource.indexOf(
  "issueNarratorBrowserRateabilityAttemptAdmissionV3({",
  attemptBegin,
);
const attemptConsume = attemptCoordinatorSource.indexOf(
  "consumeNarratorBrowserRateabilityAttemptAdmissionV3({",
  attemptIssue,
);
const attemptCore = attemptCoordinatorSource.indexOf(
  "publishAttemptCoordinatorCore(attempt, value)",
  attemptConsume,
);
const attemptBindings = attemptCoordinatorSource.indexOf(
  "publishAttemptCoordinatorBindings(attempt, observedBindings)",
  attemptCore,
);
const attemptLoadHost = attemptCoordinatorSource.indexOf(
  "loadHostEvidence()",
  attemptBindings,
);
const attemptCreateProvenance = attemptCoordinatorSource.indexOf(
  "host.createProvenanceReceipt(",
  attemptLoadHost,
);
const attemptPublishProvenance = attemptCoordinatorSource.indexOf(
  "publishAttemptCoordinatorProvenance(",
  attemptCreateProvenance,
);
const attemptCreatePackage = attemptCoordinatorSource.indexOf(
  "host.createRunPackage(",
  attemptPublishProvenance,
);
const attemptPublishPackage = attemptCoordinatorSource.indexOf(
  'name: "32-run-package.json"',
  attemptCreatePackage,
);
const attemptHostPreservationFailure = attemptCoordinatorSource.indexOf(
  '"host-preservation-failed"',
  attemptPublishPackage,
);
const attemptPreserveHost = attemptCoordinatorSource.indexOf(
  'name: "39-host-preservation.json"',
  attemptHostPreservationFailure,
);
const attemptFinalize = attemptCoordinatorSource.indexOf(
  "finalizeNarratorBrowserRateabilityAttemptEvidenceV3({",
  attemptPreserveHost,
);
if (!(coordinatorInvocation >= 0
  && coordinatorInvocation < coordinatorObserve
  && coordinatorObserve < coordinatorLaunch
  && coordinatorLaunch < coordinatorStage
  && coordinatorStage < coordinatorOffline
  && coordinatorOffline < coordinatorRun
  && coordinatorRun < coordinatorCorePreservation
  && coordinatorCorePreservation < coordinatorWorkerSeal
  && coordinatorWorkerSeal < coordinatorProducerSeal
  && coordinatorProducerSeal < coordinatorSealConfirmation
  && coordinatorSealConfirmation < coordinatorStdout)) {
  violations.push("Narrator V3 rateability CLI must preserve browser evidence, seal producers, and finalize before stdout");
}
if (!(producerSealHelperStart >= 0
  && coordinatorPageClose >= 0
  && coordinatorPageClose < coordinatorContextClose
  && coordinatorContextClose < coordinatorBrowserClose)) {
  violations.push("Narrator V3 rateability producer seal must close page, context, then browser");
}
if (!(attemptBegin >= 0
  && attemptBegin < attemptIssue
  && attemptIssue < attemptConsume
  && attemptConsume < attemptCore
  && attemptCore < attemptBindings
  && attemptBindings < attemptLoadHost
  && attemptLoadHost < attemptCreateProvenance
  && attemptCreateProvenance < attemptPublishProvenance
  && attemptPublishProvenance < attemptCreatePackage
  && attemptCreatePackage < attemptPublishPackage
  && attemptPublishPackage < attemptHostPreservationFailure
  && attemptHostPreservationFailure < attemptPreserveHost
  && attemptPreserveHost < attemptFinalize)) {
  violations.push("Narrator V3 rateability attempt coordinator must own ordered admission, evidence stages, and finalization");
}
if (!narratorRateabilityCoordinatorSource.includes("host/evidence-host.mjs")
  || !narratorRateabilityCoordinatorSource.includes("connect-src 'self' blob:")
  || !narratorRateabilityCoordinatorSource.includes("producerSeal !== \"confirmed\"")
  || !narratorRateabilityCoordinatorSource.includes(
    "createAndVerifyNarratorBrowserProvenanceReceiptV3",
  )
  || !narratorRateabilityCoordinatorSource.includes(
    "createAndVerifyNarratorBrowserRunPackageV3",
  )
  || !narratorRateabilityCoordinatorSource.includes(
    '({ path }) => path !== "host/evidence-host.mjs"',
  )) {
  violations.push("Narrator V3 rateability coordinator is missing its observed host bundle, CSP, or producer-seal assertion");
}
for (const legacyBypass of [
  "createAndVerifyNarratorBrowserEvidenceV3",
  "verifyNarratorBrowserRateabilityEvidenceSetV3",
  "finalizeNarratorBrowserRateabilityEvidenceV3",
]) {
  if (narratorRateabilityCoordinatorSource.includes(legacyBypass)) {
    violations.push(`Narrator V3 rateability CLI bypasses its attempt coordinator through ${legacyBypass}`);
  }
}
const runnerCall = narratorRateabilityHarnessSource.indexOf("runNarratorEvaluationV3(");
const workerTermination = narratorRateabilityHarnessSource.indexOf("activePort.terminate()", runnerCall);
const summaryCreation = narratorRateabilityHarnessSource.indexOf(
  "createNarratorRateabilitySummaryV3(",
  runnerCall,
);
if (!(runnerCall >= 0 && runnerCall < workerTermination && workerTermination < summaryCreation)) {
  violations.push("Narrator V3 rateability harness must terminate the worker before derived evidence creation");
}
const transformersImports = [];
for (const file of narratorBrowserToolFiles) {
  const source = await readFile(file, "utf8");
  if (/from\s+["']@huggingface\/transformers["']/u.test(source)) transformersImports.push(file);
  if (/(?:core\/simulation|depth\/state|core\/persistence|CampaignRepository|pixi\.js|\bdocument\b|\bCanvas\b|\bARIA\b)/u.test(source)) {
    violations.push(`${file}: diagnostic narrator adapter crosses gameplay, persistence, renderer, or output-UI boundary`);
  }
}
for (const file of productionSourceFiles) {
  const source = await readFile(file, "utf8");
  if (/from\s+["']@huggingface\/transformers["']/u.test(source)) transformersImports.push(file);
}
const allowedTransformersImports = [
  "tools/narrator-browser-evaluation/src/transformers.worker.ts",
  "tools/narrator-browser-evaluation-v3/src/transformers.worker.ts",
  "src/narrator/local-narrator.worker.ts",
];
if (transformersImports.length !== allowedTransformersImports.length
  || allowedTransformersImports.some((file) => !transformersImports.includes(file))) {
  violations.push("Transformers.js must be imported only by the exact isolated narrator workers");
}

const localNarratorWorkerSource = await readFile("src/narrator/local-narrator.worker.ts", "utf8");
const localNarratorWorkerFactorySource = await readFile(
  "src/narrator/local-narrator-worker-factory.ts",
  "utf8",
);
const localNarratorRuntimeSources = await readFile(
  "src/narrator/local-narrator-runtime-sources.ts",
  "utf8",
);
const productionViteConfig = await readFile("vite.config.ts", "utf8");
for (const requiredWorkerContract of [
  "env.allowRemoteModels = false",
  "env.useBrowserCache = false",
  "env.useCustomCache = false",
  "env.experimental_useCrossOriginStorage = false",
  "local_files_only: true",
  'device: "wasm"',
  'dtype: "q8"',
  "wasm.numThreads = 1",
  "createLocalNarratorAssetStore().read()",
  "localNarratorArtifactManifestHash",
  "modelAssets.clear()",
]) {
  if (!localNarratorWorkerSource.includes(requiredWorkerContract)) {
    violations.push(`src/narrator/local-narrator.worker.ts: missing production worker contract ${requiredWorkerContract}`);
  }
}
if (!localNarratorWorkerFactorySource.includes('name: localNarratorWorkerName')
  || !localNarratorWorkerFactorySource.includes(
    'localNarratorWorkerName = "the-grind-2:local-narrator"',
  )) {
  violations.push("src/narrator/local-narrator-worker-factory.ts: narrator worker name is not stable");
}
for (const runtimePath of [
  "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url",
  "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url",
]) {
  if (!localNarratorRuntimeSources.includes(runtimePath)) {
    violations.push(`src/narrator/local-narrator-runtime-sources.ts: missing exact runtime URL ${runtimePath}`);
  }
}
if (!productionViteConfig.includes('conditions: ["onnxruntime-web-use-extern-wasm"]')) {
  violations.push("vite.config.ts: narrator worker must select ONNX's external-WASM export");
}
if (!productionViteConfig.includes('worker: {\n    format: "es",\n  }')) {
  violations.push("vite.config.ts: narrator worker output must use ES modules");
}
const productionPackage = JSON.parse(await readFile("package.json", "utf8"));
if (productionPackage.devDependencies?.["@huggingface/transformers"] !== "4.2.0"
  || productionPackage.dependencies?.["@huggingface/transformers"] !== undefined
  || productionPackage.dependencies?.["onnxruntime-web"]
    !== "1.26.0-dev.20260416-b7804b056c") {
  violations.push("package.json: narrator build/runtime dependencies are not exact");
}

const productionBundleForbidden = [
  ["T5 evaluation evidence", /narrator-t5-rebuild|t5-(?:rebuild|publication)-evidence|the-grind-2-narrator-flan-t5-small|immutable-rebuild-observed|byte-identical-isolated-processes|the-grind-2:narrator-(?:prompt|token-accounting|prompt-and-token-contract):v2|the-grind-2:narrator-(?:form-[a-z0-9-]+|rendered-safety|evaluation-(?:worker-protocol|case-receipt|run-receipt|runner-sequencing|evidence)|blind-study|rateability|transformers-adapter|browser-(?:adapter-smoke|full-run(?:-package)?)):v3|Return exactly one value from allowedOutputs|Select the most fitting safe ambient narration form|model-selected-form-with-deterministic-host-rendering|exact top-score tie|generated-token-contract-error|workerBindingHash|narrator-browser-adapter-build|__verified_narrator__/],
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
  "the-grind-2:narrator-transformers-adapter:v3",
  "the-grind-2:narrator-browser-adapter-smoke:v3",
  "the-grind-2:narrator-rateability:v3",
  "the-grind-2:narrator-browser-full-run:v3",
  "the-grind-2:narrator-browser-full-run-package:v3",
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
