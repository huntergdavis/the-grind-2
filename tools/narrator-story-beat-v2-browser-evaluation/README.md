# Manual factual story-beat V2 q8 browser evaluation

This developer-only harness measures the retained factual story-beat V2 q8
pair against the sealed 200-case holdout in Chromium with Transformers.js,
ORT WASM, and the production target-free V2 prompt/parser/selector/adapter
path. It does not admit a model or authorize generated text for display.
Every receipt fixes both fields to false.

The six eligible presentation buckets are rotated independently of the source
target frame. The model scores only host-derived, production-valid forms
inside the assigned bucket; reference targets never enter browser inference.
The exact place and every required mechanic clause must survive final
production validation.

## Inputs

The model directory must contain exactly these regular, non-symlink files:

    config.json
    generation_config.json
    onnx/decoder_model_merged_quantized.onnx
    onnx/encoder_model_quantized.onnx
    tokenizer.json
    tokenizer_config.json

The accepted model aggregate is
3b1175e099212819c76de4d471f0e0084c3b87bc2d234b3b5e70a46076424edb.
It is bound to the retained reproducible-pair runtime manifest
ef166be09cf03bc505de153a9b16ae970159b3a66d8c31ed70e4da6061a1bf9a
and receipt-file digest
86ca0c2c6e01cfdc56e5d9141c21cc2f01967ad4e3948a67149c050026a333a7.

The holdout must be the untouched sealed-holdout.json emitted by the V2
exporter, with corpus hash 164200f6c558639e and raw SHA-256
2d6c11b3f295bb355c8b84dd659bc48692febc48f26b33d98cb1d865ae23c1fc.
Output must be a fresh directory beneath the ignored
.narrator-t5-rebuild root and must not equal, contain, or sit inside the model
directory.

The evaluator and every listed production dependency must be tracked and
unchanged at HEAD. Unrelated dirty files outside this source closure do not
block a run. The receipt records exact retrievable source-commit hashes; no
production flag bypasses this check.

## Run

The default pass uses this reviewed zero-based vector:

    0, 3, 10, 20, 24, 29, 30, 38, 43, 45, 46, 49,
    56, 61, 73, 81, 102, 104, 105, 106, 108, 113, 114, 124,
    131, 136, 139, 143, 147, 148, 152, 157, 161, 167, 170, 195

Tests recompute its mechanics coverage: four cases for each of nine scene
modes; twelve for each lens; eight for each cost metric; every one of 24
consequence metrics exactly once; six for each source target frame; and six
for each independently assigned browser presentation bucket.

Each case result has two distinct ordinals: index is its position in the
selected evaluation run, while sequenceSlot is the adapter-owned repeating
0–5 presentation slot. The bucket must match that slot exactly.

    node tools/narrator-story-beat-v2-browser-evaluation/run.mjs evaluate \
      --model-dir .narrator-t5-rebuild/story-beat-v2/derived-grounded-001/build-1-root/build/staged \
      --holdout .narrator-t5-rebuild/story-beat-v2/export-d66b901-001/sealed-holdout.json \
      --run-id factual-story-beat-v2-q8-browser-001 \
      --out .narrator-t5-rebuild/story-beat-v2/browser-evaluation-001

Add --full to run all 200 cases explicitly. Neither mode changes admission
state.

The coordinator verifies every input hash twice, stages immutable bytes from
loopback, blocks service workers, switches Chromium offline before model load,
and rejects every post-offline HTTP request. The dedicated worker serves only
the six verified in-memory model artifacts to Transformers.js. It exercises
the production pinned-tokenizer gate before inference and reports completion
only with tokenizerVerified true. Source, model, runtime, and holdout closures
are checked again after inference to reject drift. No output directory is
created until final verification passes.

The private receipt includes source, model, runtime, holdout, bundle, output,
timing and content hashes; grounding and diversity metrics; exact lens,
presentation bucket and selected-form identity; per-case tokens and elapsed
time; and modelAdmitted/displayAuthorized fixed false.

## Observed sealed pass

The corrected default pass completed in offline Chromium 151.0.7922.34 from
clean source commit 5d42e50e55e324b7e404081910a5cf89dab5ee64. Model load
took 18,625 ms and the 36 cases took 144,656 ms total.

All 36 candidates passed the production boundary, named their place exactly,
contained every required mechanic clause exactly once, and were unique. No
case needed fallback, contained an unknown lexeme, echoed prompt scaffolding,
or copied a complete source field. Four happened to equal their sealed
reference target; this was measured only after generation. Each lens appeared
12 times and each presentation bucket six times. Service workers were blocked,
the browser was offline before model load, the pinned tokenizer passed, and
both external and post-offline request counts were zero.

The private mode-0600 receipt is 50,540 bytes. Its sealed content hash is
a766584b30f23d95, output SHA-256 is
c83f0bd99bc53a6ceaf9ab8978a88a7a763239f31b5bca4d78eff3c2c1339233,
and receipt-file SHA-256 is
348649825106fc01d8483a720e740ccf0d45286a3ad61430c1262ae74c69c3b8.
Independent reload and receipt verification pass. Model admission and display
authority remain false.

## Observed full sealed pass

The explicit 200-case pass completed in the same offline Chromium
151.0.7922.34 from clean source commit
5d42e50e55e324b7e404081910a5cf89dab5ee64. Model load took 18,306 ms and
the cases took 810,990 ms total.

All 200 candidates passed the production boundary, named their place exactly,
contained every required mechanic clause exactly once, and were unique. No
case needed fallback, contained an unknown lexeme, echoed prompt scaffolding,
or copied a complete source field. Forty-two happened to equal their sealed
reference target, measured only after generation. The lens counts were
67 cost, 67 consequence, and 66 contrast. Presentation buckets followed their
full-run rotation at 34/34/33/33/33/33. Service workers were blocked, the
browser was offline before model load, the pinned tokenizer passed, and both
external and post-offline request counts were zero.

The private mode-0600 receipt is 216,816 bytes. Its sealed content hash is
b99f55efb0064486, output SHA-256 is
31c8af41cf3bd92328533416ea12546d4c155bb63012cd8c768288775f2ef342,
timing SHA-256 is
dd0c991fe6c10864483c8c7c553be0e0fa8ea6da0f1ee73a524aae29c914e687,
and receipt-file SHA-256 is
8d2e1fc7a74d33e340c64fdc9f3bc8fd0491e6f123419a737eec1aa8cf776386.
Independent reload and receipt verification pass. Model admission and display
authority remain false.

## No-ML checks

    node --check tools/narrator-story-beat-v2-browser-evaluation/run.mjs
    node --check tools/narrator-story-beat-v2-browser-evaluation/run-support.mjs
    node --test tools/narrator-story-beat-v2-browser-evaluation/tests/*.test.mjs
    npx vitest run tools/narrator-story-beat-v2-browser-evaluation/src/*.test.ts
    npx tsc --noEmit -p tools/narrator-story-beat-v2-browser-evaluation/tsconfig.json
    npx vite build --config tools/narrator-story-beat-v2-browser-evaluation/vite.config.ts

Design lineage: the same-origin in-memory acquisition, dedicated-worker WASM,
offline switch, tokenizer proof, source closure, and fail-closed receipt shape
reuse the local browser-evaluation pattern recovered from session
[codex] the_grind_2 · Sep 5 · 01a06835-15f. This V2 harness adds the factual
mechanic clauses, balanced 36-case selection, independent six-bucket rotation,
and retained q8-pair binding without modifying V1.
