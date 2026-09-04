# Isolated browser narrator evaluation

This tool is a diagnostic-only Chromium harness for the published FLAN-T5
candidate. It is not imported by the game, does not write to `public/` or the
production `dist/`, and grants neither model admission nor display authority.

## What it proves

The harness stages the published six-file model closure and the exact pinned
ONNX Runtime module/WASM pair over a loopback-only origin. The worker verifies
every byte length and SHA-256 before constructing the tokenizer or model. The
Playwright context then goes offline before model loading or inference.

The worker disables remote models and all Transformers.js browser, filesystem,
custom and WASM caches. Its model loader can read only the verified in-memory
artifacts. One tokenizer call produces the raw input IDs; one generation call
produces the full decoder IDs; one decode call returns raw text to the host. The
V2 host runner owns token accounting, normalization and output-policy checks.
Decoded output is never re-tokenized.

The smoke receipt separately binds the source commit, source files, lockfile,
diagnostic bundle, package identities, runtime assets, verified model closure,
worker binding, Chromium version and zero post-offline HTTP(S) requests. The
coordinator requires every listed source byte to match its blob in `HEAD`; the
browser recomputes both manifest aggregates and validates the receipt before the
runner writes it. This proves the observed committed sources and emitted bundle,
not deterministic or cross-machine rebuild equivalence.

## Setup and checks

Install the exact lockfile and Playwright browser, then verify the isolated
toolchain:

```sh
npm ci
npx playwright install chromium
npm run check:narrator-browser
```

`@huggingface/transformers` is an exact development dependency. The tool pins
Transformers.js 4.2.0 and its exact ONNX Runtime dependency; the runtime check
also verifies the selected `.mjs` and `.wasm` bytes from `node_modules`.

## Offline smoke

Use a local checkout of the published model repository at revision
`8c85146bbe1a9bcaa4b77faa2c7ef52b2e5b8dd4`:

```sh
npm run build:narrator-browser
node tools/narrator-browser-evaluation/run.mjs smoke \
  --model-dir /absolute/path/to/the-grind-2-narrator-flan-t5-small \
  --run-id grind2-browser-smoke:v0.5.84 \
  --out tools/narrator-browser-evaluation/.narrator-browser-evaluation-dist/evidence-v0.5.84
```

The command prints only a sanitized status summary. The ignored output directory
contains `adapter-build-receipt.json`; generated prose is not logged or written
by smoke mode. The output parent must exist and the requested output directory
must be new. The command refuses to start unless every bound source file is
tracked and byte-identical to `HEAD`.

## Full blind run

The full 200-case run is the next evidence-collection step:

```sh
node tools/narrator-browser-evaluation/run.mjs run \
  --model-dir /absolute/path/to/the-grind-2-narrator-flan-t5-small \
  --run-id grind2-b2:run:001 \
  --sheet-id grind2-b2:sheet:001 \
  --secret-salt-file /private/absolute/path/to/salt.txt \
  --adapter-receipt /private/absolute/path/to/adapter-build-receipt.json \
  --out /private/absolute/path/to/b2-run-001
```

The salt file must be outside the repository, mode `0600`, and contain only the
43-or-more-character URL-safe salt. The adapter receipt must come from a clean,
committed smoke of the same source snapshot. The output parent must already
exist; the output directory itself must not. The runner creates that directory
with mode `0700` and exclusively creates mode-`0600` evidence receipt, public
blind rater sheet, private side-assignment key and adapter-linked run package.
Keep the key and salt private. A generated sheet is not a human-rated B2 result.
No candidate may advance until independent ratings are collected and the
existing B2 gates pass.

## Runtime references

- [Transformers.js environment controls](https://github.com/huggingface/transformers.js/blob/54652ba3366ccd1e3b64e689a96504309e6fb53b/packages/transformers/src/env.js#L210-L281)
- [Transformers.js hub loading](https://github.com/huggingface/transformers.js/blob/54652ba3366ccd1e3b64e689a96504309e6fb53b/packages/transformers/src/utils/hub.js#L125-L156)
- [Transformers.js tokenizer behavior](https://github.com/huggingface/transformers.js/blob/54652ba3366ccd1e3b64e689a96504309e6fb53b/packages/transformers/src/tokenization_utils.js#L303-L364)
- [Transformers.js model loading and disposal](https://github.com/huggingface/transformers.js/blob/54652ba3366ccd1e3b64e689a96504309e6fb53b/packages/transformers/src/models/modeling_utils.js#L237-L278)
- [Transformers.js ONNX backend](https://github.com/huggingface/transformers.js/blob/54652ba3366ccd1e3b64e689a96504309e6fb53b/packages/transformers/src/backends/onnx.js#L345-L386)
- [ONNX Runtime Web environment flags](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)

The publication → exact contract → isolated adapter sequence and the ban on
manufactured B2 evidence reuse recovered session
`[codex] the_grind_2 · 01a06835-15f`.
