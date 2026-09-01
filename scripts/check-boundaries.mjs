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
  "src/ui/weapon-memory.ts",
  "src/render/cutaway-registry.ts",
  "src/render/cutaway-controller.ts",
  "src/render/hero-growth-allocation-cutaway.ts",
  "src/render/weapon-memory-cutaway.ts",
];
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

if (violations.length > 0) {
  throw new Error(`Canonical boundary violations:\n${violations.join("\n")}`);
}

process.stdout.write("Canonical reducer boundaries are clean.\n");
