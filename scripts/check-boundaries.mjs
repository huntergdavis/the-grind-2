import { readFile, readdir } from "node:fs/promises";

const depthFiles = (await readdir("src/depth"))
  .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
  .map((file) => `src/depth/${file}`);
const canonicalFiles = ["src/core/rng.ts", "src/core/simulation.ts", ...depthFiles];
const forbidden = [
  ["ambient randomness", /Math\.random/],
  ["ambient wall time", /\bDate\s*\.|\bDate\s*\(/],
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

if (violations.length > 0) {
  throw new Error(`Canonical boundary violations:\n${violations.join("\n")}`);
}

process.stdout.write("Canonical reducer boundaries are clean.\n");
