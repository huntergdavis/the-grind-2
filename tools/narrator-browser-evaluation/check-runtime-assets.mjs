import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const expected = Object.freeze({
  transformers: {
    version: "4.2.0",
    integrity: "sha512-8BRCoBMH0XsWaEIamuR0LrJGAfftgHAfb2Vrffy0VKlSAE/MnUJ5/h/zTfEP3fDIft+nk7TqB8xXEyABGitBjQ==",
  },
  ort: {
    version: "1.26.0-dev.20260416-b7804b056c",
    integrity: "sha512-MD6Ss4GSpQBo6zqoJzyT9LRbKYs7x/JVN23FT24EcEvlqF4VuzPOeH6X38orZPKHQDbprn7K+SBpu0/mj2CQiw==",
  },
  assets: [
    {
      path: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs",
      byteLength: 47_389,
      sha256: "5959c6733039619c9af710d8e1bae8d6e84402787990637be987c2b1bd6c5fa9",
    },
    {
      path: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm",
      byteLength: 23_567_050,
      sha256: "e0c0c6d3e73d43b8a249972f8358f845b08cc16fec3c80efafdf8bed40366786",
    },
  ],
});

const packageLock = JSON.parse(await readFile("package-lock.json", "utf8"));
const transformers = packageLock.packages?.["node_modules/@huggingface/transformers"];
const ort = packageLock.packages?.["node_modules/onnxruntime-web"];
if (transformers?.version !== expected.transformers.version
  || transformers?.integrity !== expected.transformers.integrity
  || ort?.version !== expected.ort.version
  || ort?.integrity !== expected.ort.integrity) {
  throw new Error("Narrator browser runtime package identity does not match the pinned closure");
}

for (const asset of expected.assets) {
  const bytes = await readFile(asset.path);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== asset.byteLength || sha256 !== asset.sha256) {
    throw new Error(`Narrator browser runtime asset does not match: ${asset.path}`);
  }
}

process.stdout.write("Narrator browser runtime assets match the pinned package closure.\n");
