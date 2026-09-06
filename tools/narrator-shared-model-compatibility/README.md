# Shared narrator-model compatibility harness

This developer-only harness proves that a proposed story-beat q8 model still
drives the existing ambient narrator exactly like the historical V1 baseline.
It runs both real six-file ONNX closures through the production
`createLiveNarratorTransformersAdapter` in offline Chromium/WASM over all 200
cases in `src/narrator/evaluation.ts`.

The comparison grants no model admission, display authorization, production
authority, or permission to change the active pin. It does not train, convert,
publish, download, or modify either model.

## Frozen V1 boundary

V1 binds:

- corpus version 1, exactly 200 cases, hash `63b3a0ee9fef092a`;
- historical V1 baseline artifact revision
  `edf60fc44500b19407f6216e1777c3e34224b937`;
- historical V1 baseline six-file aggregate SHA-256
  `4aeb36097c54d457e2f4b83acdf3c893528265c7c7a2b7605ce9e52537b1f7e0`;
- Transformers.js 4.2.0, q8 ONNX, WASM, one runtime thread;
- the exact production prompt formatter, form registry, trie processor,
  tokenizer witnesses, renderer and live-output policy;
- byte-identical `tokenizer.json` and `tokenizer_config.json` between the
  baseline and candidate.

This baseline belongs to the recorded comparison below and stays fixed when
the production model advances. The browser protocol test uses the original
six-file fixture; `src/narrator/local-model-assets.test.ts` independently checks
the active production pin against its publication evidence. Updating production
must not change the identity or meaning of historical V1 comparison receipts.

Each model directory must contain exactly:

~~~text
config.json
generation_config.json
onnx/decoder_model_merged_quantized.onnx
onnx/encoder_model_quantized.onnx
tokenizer.json
tokenizer_config.json
~~~

Stage the six baseline files into their own directory if the publication
checkout also contains provenance, license or documentation files. Baseline
and candidate directories must be real, non-symlink, distinct and
non-overlapping.

## Passing comparison

For each model the worker:

1. loads only the staged in-memory bytes after Chromium is offline;
2. verifies all ten pinned form-token witnesses;
3. calls `countInput(prompt)` and
   `realize(prompt, { maximumOutputTokens: 48 })` for every exact corpus row;
4. records the exact pinned target-token length of the compact form the model
   generated, rather than re-tokenizing the expanded display line;
5. requires the rendered line to pass `isSafeLiveNarration` and map to
   exactly one form returned by `liveNarratorForms(prompt)`.

The command passes only when all 200 baseline and all 200 candidate calls
complete and every candidate form ID and rendered-line hash equals its
baseline counterpart. There is no retry, substitution or error fallback.
A model-selected baseline form is a legitimate constrained selection and is
recorded separately; it is not a harness fallback.

The expanded line can legitimately exceed the compact generation budget when
a valid fact contains a long place name. Its safety, form identity and exact
hash remain mandatory; only the token accounting follows what the constrained
model actually emitted.

Any tie, generation error, timeout, unsafe line, ineligible form, tokenizer
change, incomplete corpus or form mismatch exits nonzero and writes no
receipt. Timing is evidence only.

## Recorded compatible V2 comparison

The first corrected full comparison, run from source commit
`7c2a2ffbe8aa1d31081c543053ac05f9d42bcd6d`, completed all 200 baseline and
200 candidate cases with exact form-and-line parity. Both tokenizers and all
ten witnesses matched; every fallback, safety, eligibility, error, timeout and
network counter remained zero. The private mode-0600 receipt has content hash
`e57e8184da714ed9`, file SHA-256
`6893592eee16a2fdba791abd1cda33054df156a7788b6c0bc9ea399160c9e5e6`,
output SHA-256
`382a529fcc883e5485d2379558391fe553a77bc580c68bda4f9fa2aa84723baa`
and timing SHA-256
`e80c4dae7c87d080480f4217489b1dd46e2ae32e1399c6109f7e110f2fb6ff35`.
It grants no authority by itself.

## Run

Install the exact lockfile and Chromium first. The harness source must be
tracked, clean and byte-identical to one commit. The output parent must already
exist beneath the ignored `.narrator-t5-rebuild` directory, and the final
output directory must be fresh.

~~~sh
node tools/narrator-shared-model-compatibility/run.mjs compare \
  --baseline-model-dir .narrator-t5-rebuild/path/to/historical-v1-six-file-q8 \
  --candidate-model-dir .narrator-t5-rebuild/path/to/candidate-six-file-q8 \
  --run-id story-beat-shared-pin-compat-001 \
  --out .narrator-t5-rebuild/shared-pin-compat-001
~~~

The coordinator snapshots both model closures, the runtime and committed
source before and after inference. It permits only exact loopback staging,
blocks service workers, switches Chromium offline before model load, and
rejects every external or post-offline HTTP request.

On success it exclusively creates a mode-0700 directory containing one
mode-0600 `shared-model-compatibility.json`. The private receipt binds both
model manifests, tokenizer identity, runtime, browser, source, bundle, corpus,
all per-case form/hash/token results, timing, network observations and false
authority fields.

This receipt must still be cross-checked against the candidate aggregate in
the separate 36-case and full 200-case factual V2 browser receipts and the
later immutable publication/pin manifest. It does not replace the 200-case
FP32 story-beat evaluation or authorize carrying historical V3 narrator
evidence to a new artifact identity.

## No-ML checks

~~~sh
node --test tools/narrator-shared-model-compatibility/tests/*.test.mjs
npx vitest run tools/narrator-shared-model-compatibility/src/*.test.ts \
  --maxWorkers=1 --no-file-parallelism
npx tsc --noEmit -p tools/narrator-shared-model-compatibility/tsconfig.json
npx vite build --config tools/narrator-shared-model-compatibility/vite.config.ts
~~~

Design lineage: the exact 200-case production-adapter parity requirement,
tokenizer byte-identity rule, offline browser boundary, and separate-artifact
fallback were recovered with `deja "narrator-shared-model-compatibility"`
from session `[codex] the_grind_2 · Sep 4 · 01a06835-15f`. This harness
implements that review as an additive no-authority gate instead of reusing the
historical V3 evaluator or changing V1 evidence.
