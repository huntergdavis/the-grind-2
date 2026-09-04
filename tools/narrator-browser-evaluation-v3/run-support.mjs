export const narratorBrowserSmokeReceiptFileV3 = "narrator-v3-browser-smoke-receipt.json";

export function parseNarratorBrowserSmokeArgumentsV3(argv) {
  if (!Array.isArray(argv)) return null;
  const [mode, ...rest] = argv;
  if (mode !== "smoke" || rest.length !== 6) return null;
  const allowed = new Set(["model-dir", "run-id", "out"]);
  const options = { mode };
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (typeof key !== "string"
      || !key.startsWith("--")
      || typeof value !== "string"
      || value.length === 0) return null;
    const name = key.slice(2);
    if (!allowed.has(name) || Object.hasOwn(options, name)) return null;
    options[name] = value;
  }
  if (!options["model-dir"] || !options["run-id"] || !options.out) return null;
  return Object.freeze(options);
}
