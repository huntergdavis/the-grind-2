# Manual story-beat q8 browser evaluation

This developer-only harness measures the manual, ephemeral story-beat contract
against the sealed 200-case holdout in Chromium with Transformers.js, ORT WASM,
and a local six-file q8 model closure. It does **not** admit a model or authorize
generated text for display. Every receipt fixes both fields to `false`.

The harness is separate from the frozen selector evaluations. It uses the
production `formatStoryBeatPromptV1`, `storyBeatGenerationOptions`, and
`validateStoryBeatResultV1` path inside a dedicated worker.

## Inputs

The model directory must contain exactly these regular, non-symlink files:

```text
config.json
generation_config.json
onnx/decoder_model_merged_quantized.onnx
onnx/encoder_model_quantized.onnx
tokenizer.json
tokenizer_config.json
```

The holdout must be the untouched `sealed-holdout.json` emitted by
`tools/narrator-story-beat-training/export-corpus.mjs`, with corpus hash
`d88a61b1639188c0` and raw SHA-256
`140995fd6888c14fec1ea5dd3fd79aeaa4c1ad230f6d4ce50e5ecca10db1f079`.
Output must be a fresh directory beneath the ignored
`.narrator-t5-rebuild/` root and must not equal, contain, or sit inside the
model directory.

The evaluator and its listed production dependencies must be tracked and
unchanged at `HEAD`. Unrelated dirty files elsewhere in the shared worktree do
not block a run. The receipt records the exact retrievable source commit and
committed file hashes; there is no production flag to bypass this check.

## Run

The default experimental pass uses this reviewed zero-based vector:

```text
4, 7, 8, 20, 30, 58, 63, 70, 79, 89, 91, 107, 126, 147, 175, 177, 189, 191
```

Tests recompute its coverage from the production corpus: exactly two cases for
each of nine scene modes, all 15 normalized target frames (18 distinct full
mode-qualified template IDs), six cases for each location shell, and three
numeric-action cases at indices 4, 89, and 91.

```sh
node tools/narrator-story-beat-browser-evaluation/run.mjs evaluate \
  --model-dir .narrator-t5-rebuild/path/to/staged-q8 \
  --holdout .narrator-t5-rebuild/path/to/sealed-holdout.json \
  --run-id story-beat-q8-preview-001 \
  --out .narrator-t5-rebuild/story-beat-browser-preview-001
```

Add `--full` to run all 200 cases explicitly. Full WASM evaluation can take
hours; neither mode changes admission state.

The coordinator verifies every input hash twice, stages bytes from loopback,
blocks service workers, switches Chromium offline before model load, and rejects
any post-offline HTTP request. The worker only serves the six verified in-memory
model artifacts to Transformers.js. Before story-beat inference, it exercises
the production `createLiveNarratorTransformersAdapter(...).verifyPinnedTokenizer()`
gate and reports completion only with `tokenizerVerified: true`. Source, model,
runtime, and holdout closures are checked again after inference to reject drift.
No output directory is created until those final checks pass.

The private receipt contains:

- model, runtime, holdout, bundle, output, timing, and content hashes;
- validity and `fallbackRequired` rates (raw candidates remain evidence);
- prompt/scaffold echo, exact source-field echo, and exact-target-match counts;
- diagnostic unknown-lexeme counts;
- raw and valid-output diversity counts;
- per-case input/output tokens and elapsed time;
- `modelAdmitted: false` and `displayAuthorized: false`.

## No-ML checks

```sh
node --test tools/narrator-story-beat-browser-evaluation/tests/*.test.mjs
npx vitest run tools/narrator-story-beat-browser-evaluation/src/*.test.ts
npx tsc --noEmit -p tools/narrator-story-beat-browser-evaluation/tsconfig.json
npx vite build --config tools/narrator-story-beat-browser-evaluation/vite.config.ts
```

Design lineage: the in-memory same-origin acquisition, dedicated-worker WASM,
offline switch, and fail-closed receipt shape reuse the local V3 browser
evaluation pattern recovered from session `[codex] the_grind_2 · Sep 5 ·
01a06835-15f`. This harness evaluates the new manual story-beat contract only;
it does not reinterpret or modify V3 selector evidence.
