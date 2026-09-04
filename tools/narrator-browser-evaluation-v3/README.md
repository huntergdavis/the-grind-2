# Isolated V3 browser narrator smoke

This diagnostic-only tool proves one client-side FLAN-T5 form selection through
the frozen V3 protocol. It is a sibling of the historical V2 full-run tool: it
does not change V1/V2 evidence, is not imported by the game, and exposes no
full-corpus, rating, admission, display, or production API.

## What the smoke proves

The coordinator requires an exact clean Git source snapshot, performs a fresh
Vite build, and binds every listed source and emitted bundle byte. It stages the
published six-file model closure and two pinned ONNX Runtime assets over a
loopback-only origin. Chromium blocks service workers, then goes offline before
model load and inference.

The worker disables remote models, storage and runtime caches; permits only the
verified in-memory artifact closure; and runs q8 WASM with one thread. Its
custom Transformers.js logits processor:

- executes after runtime processors and immediately before greedy sampling;
- records each allowed float32 score as raw bits before masking;
- changes only disallowed vocabulary scores to negative infinity;
- preserves exact ties as invalid evidence instead of breaking them; and
- returns raw tokenizer, decoder-ID, target and trace evidence without a form
  ID or rendered prose.

The browser host validates that raw response, derives the selected form through
the frozen trie contract, renders exact Prompt V1 facts, checks the safety
union, and retains the complete successful ordinal-zero case receipt. A
baseline selection is valid smoke evidence; it is not a rateable result.

The single output,
narrator-v3-browser-smoke-receipt.json, also binds the source commit, package
lock, pinned toolchain identities, exact four-file bundle, model/runtime
closures, browser version, clean load/disposal, and zero external staging or
post-offline HTTP(S) requests. It explicitly records that no full corpus,
human rating, model admission, display authorization, or production authority
exists. The bundle is an observed build, not a cross-machine reproducible-build
claim. Package SRI values identify the committed lockfile entries; they do not
claim an independent byte attestation of the installed package directories.

## Run the smoke

Install the exact lockfile and Chromium, then run:

~~~sh
npm ci
npx playwright install chromium
npm run check:narrator-browser-v3
node tools/narrator-browser-evaluation-v3/run.mjs smoke \
  --model-dir /absolute/path/to/the-grind-2-narrator-flan-t5-small \
  --run-id grind2-v3-browser-smoke:v0.5.88 \
  --out tools/narrator-browser-evaluation-v3/.narrator-browser-evaluation-v3-dist/evidence-v0.5.88
~~~

The model directory must be the public artifact repository at revision
8c85146bbe1a9bcaa4b77faa2c7ef52b2e5b8dd4. The output directory must be new.
Inside the repository it is accepted only under the ignored V3 diagnostic
build directory; otherwise it must be beneath an existing external parent.
The coordinator creates the directory as 0700 and the receipt exclusively as
0600. Standard output contains only status, path, hashes, lifecycle flags,
and false authority flags—never rendered or decoded text.

The source preflight deliberately requires every executable source path to be
tracked, unstaged, unmodified, and byte-identical to HEAD. The coordinator then
materializes those committed blobs in a temporary build root, snapshots every
bundle byte once, and serves those same buffers to Chromium. Consequently, a
receipt cannot honestly be included in the same commit it names. Release flow
uses a clean implementation commit as sourceCommit, runs the observation, then
retains that exact receipt in a separate evidence-only commit.

## Runtime references

- [Transformers.js custom processor assembly](https://github.com/huggingface/transformers.js/blob/54652ba3366ccd1e3b64e689a96504309e6fb53b/packages/transformers/src/models/modeling_utils.js#L396-L543)
- [Transformers.js processor-before-sampler path](https://github.com/huggingface/transformers.js/blob/54652ba3366ccd1e3b64e689a96504309e6fb53b/packages/transformers/src/models/modeling_utils.js#L982-L1001)
- [Transformers.js logits-processor contract](https://github.com/huggingface/transformers.js/blob/54652ba3366ccd1e3b64e689a96504309e6fb53b/packages/transformers/src/generation/logits_process.js#L10-L24)

The contract → evidence → isolated-adapter sequence and prohibition on repaired
or manufactured model evidence reuse recovered sessions
[codex] history · today · 01a06835-15f and
[codex] 03 · Sep 4 · 2026-09-03T1.
