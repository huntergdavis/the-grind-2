# Tuned story-beat publication sanitizer

This additive, developer-only tool converts private training and evaluation
evidence into two public-safe documents. It does not copy artifacts into the
artifact repository, publish a tag, change an app pin, or grant runtime/display
authority. Every input receipt and both outputs must keep `modelAdmitted` and
`displayAuthorized` false.

The tool intentionally lives outside the app and outside the artifact
repository. Its output must be a fresh direct child of the ignored
`.narrator-t5-rebuild` workspace. The output contains hashes, counts, stable
identifiers, and artifact-relative paths only. It excludes generated prose,
prompts, reference targets, private absolute paths, losses, per-case timing,
and run timing vectors.

## Frozen V1 gate

The policy is embedded in `publication.mjs` before tuned results exist and is
bound by its canonical hash.

- FP32: exactly 200 cases; at least 198 first-pass-valid; zero unknown-word,
  unknown-capitalized-word, unknown-numeric-claim, prompt-echo,
  deterministic-fallback-copy, and exact-source-field-copy outputs.
- q8 preview: exactly 18/18 valid; zero fallback-required, unknown-lexeme,
  prompt-scaffold-echo, and source-field/fallback-headline-copy cases; at least
  eight delexicalized shapes; no shape occurs more than four times.
- q8 full: exactly 200 cases; at least 198 valid; zero fallback-required,
  unknown-lexeme, prompt-scaffold-echo, and
  source-field/fallback-headline-copy cases; at least 190 unique valid outputs;
  no raw output occurs more than twice; at least eight delexicalized shapes;
  no shape occurs more than 50 times.
- Production hostile boundary: all 18 committed negative cases remain
  rejected; the recent anti-echo FIFO remains exactly eight; the anti-echo,
  controller, production validator, corpus, and hostile tests are hash-bound.
- Reference-target exact matches are measured evidence, not a quality failure.

The 18-case run is preview evidence only. It never clears the full publication
gate without the separate 200-case q8 receipt.

The sanitizer recomputes q8 diagnostics, validity, diversity, and
delexicalized shapes from the raw private browser cases plus the sealed
holdout. It uses the exact placeholder order and neutral vocabulary from
`validate-evaluation.mjs`; the browser receipt schema does not need a shape
field. If a future exact browser schema adds either shape metric, the supplied
value must also equal the sanitizer's recomputation.

## Required evidence order

1. Let the three-epoch CPU trainer finish normally. Do not inspect or mutate
   its atomically absent destination while it runs. Validate its resulting
   `training-receipt.json` against the complete checkpoint closure.
2. Generate the full 200-case FP32 evidence and independently produce its
   validation report:

   ```sh
   PYTHONHASHSEED=20260904 python3 tools/narrator-story-beat-training/evaluate.py \
     --holdout .narrator-t5-rebuild/story-beat-v1/export-bc68f97-001/sealed-holdout.json \
     --model /absolute/path/to/completed-checkpoint \
     --output .narrator-t5-rebuild/story-beat-v1/fp32-results.json \
     --case-count 200

   node tools/narrator-story-beat-training/validate-evaluation.mjs \
     --holdout .narrator-t5-rebuild/story-beat-v1/export-bc68f97-001/sealed-holdout.json \
     --results .narrator-t5-rebuild/story-beat-v1/fp32-results.json \
     --model /absolute/path/to/completed-checkpoint \
     --report .narrator-t5-rebuild/story-beat-v1/fp32-validation-report.json
   ```

   The optional report destination is created exclusively with mode `0600`;
   validation refuses an existing file, symlinked parent, or any overlap with
   the holdout, raw results, or model closure. The same report remains visible
   on stdout.

3. Create the derived lock, perform two isolated locked-container builds, run
   `observe-pair`, and then run the read-only `verify-pair` command documented
   in `../narrator-story-beat-rebuild/README.md`. Retain the derived lock,
   pair receipt, both builds, and one exact six-file staged q8 model. The
   sanitizer validates the complete frozen recipe/toolchain, fresh-process
   evidence, byte-identical pair, 100 MiB limit, runtime roles, checkpoint
   lineage, and staged hashes.
4. Commit this sanitizer and every source path it binds before browser
   evaluation. Both browser receipts must name that exact producer HEAD. Then
   run the reviewed 18-case preview and a separate full 200-case run:

   ```sh
   node tools/narrator-story-beat-browser-evaluation/run.mjs evaluate \
     --model-dir /absolute/path/to/exact-six-file-staged-q8 \
     --holdout .narrator-t5-rebuild/story-beat-v1/export-bc68f97-001/sealed-holdout.json \
     --run-id story-beat-tuned-q8-preview-001 \
     --out .narrator-t5-rebuild/story-beat-tuned-q8-preview-001

   node tools/narrator-story-beat-browser-evaluation/run.mjs evaluate \
     --model-dir /absolute/path/to/exact-six-file-staged-q8 \
     --holdout .narrator-t5-rebuild/story-beat-v1/export-bc68f97-001/sealed-holdout.json \
     --run-id story-beat-tuned-q8-full-001 \
     --out .narrator-t5-rebuild/story-beat-tuned-q8-full-001 \
     --full
   ```

5. Create the sanitized aggregate only after every private receipt exists.
   Replace the illustrative private paths with the retained exact paths:

   ```sh
   node tools/narrator-story-beat-publication/publication.mjs create \
     --checkpoint /absolute/path/to/completed-checkpoint \
     --training-receipt /absolute/path/to/completed-checkpoint/training-receipt.json \
     --fp32-results .narrator-t5-rebuild/story-beat-v1/fp32-results.json \
     --fp32-report .narrator-t5-rebuild/story-beat-v1/fp32-validation-report.json \
     --derived-lock .narrator-t5-rebuild/story-beat-v1/derived/checkpoint.lock.json \
     --rebuild-receipt .narrator-t5-rebuild/story-beat-v1/derived/rebuild-receipt.json \
     --staged-model /absolute/path/to/exact-six-file-staged-q8 \
     --q8-preview .narrator-t5-rebuild/story-beat-tuned-q8-preview-001/story-beat-browser-evaluation.json \
     --q8-full .narrator-t5-rebuild/story-beat-tuned-q8-full-001/story-beat-browser-evaluation.json \
     --holdout .narrator-t5-rebuild/story-beat-v1/export-bc68f97-001/sealed-holdout.json \
     --out .narrator-t5-rebuild/story-beat-tuned-publication-001
   ```

The command rejects duplicate or unknown CLI flags, duplicate JSON keys,
unknown receipt keys, numeric coercion in integer-only evidence, authority
flags, symlinks, non-regular entries, input/output overlap, stale producer
bytes, any evidence or model drift during validation, mismatched raw metrics,
and any failed policy gate. No output directory is created until all expensive
validation and final drift checks pass.

## Outputs and verify mode

The fresh output contains exactly:

- `story-beat-tuned-q8-quality-receipt.json`: policy, producer HEAD and source
  closure, generator/source/test hashes, training/derivation bindings,
  aggregate FP32/q8 metrics, hostile-boundary evidence, and false authority.
- `story-beat-tuned-q8-artifact-staging-plan.json`: the exact six artifact
  paths/roles/sizes/hashes, quality-receipt hash, artifact repository,
  immutable version, immutable tag, and `overwriteAllowed: false`.

The quality receipt is finalized and hashed first. The staging plan may bind
that hash; the quality receipt never binds the plan, avoiding a self-hash
cycle.

Recompute all private inputs and require byte-exact existing output without
writing anything by changing only the verb:

```sh
node tools/narrator-story-beat-publication/publication.mjs verify \
  --checkpoint /absolute/path/to/completed-checkpoint \
  --training-receipt /absolute/path/to/completed-checkpoint/training-receipt.json \
  --fp32-results .narrator-t5-rebuild/story-beat-v1/fp32-results.json \
  --fp32-report .narrator-t5-rebuild/story-beat-v1/fp32-validation-report.json \
  --derived-lock .narrator-t5-rebuild/story-beat-v1/derived/checkpoint.lock.json \
  --rebuild-receipt .narrator-t5-rebuild/story-beat-v1/derived/rebuild-receipt.json \
  --staged-model /absolute/path/to/exact-six-file-staged-q8 \
  --q8-preview .narrator-t5-rebuild/story-beat-tuned-q8-preview-001/story-beat-browser-evaluation.json \
  --q8-full .narrator-t5-rebuild/story-beat-tuned-q8-full-001/story-beat-browser-evaluation.json \
  --holdout .narrator-t5-rebuild/story-beat-v1/export-bc68f97-001/sealed-holdout.json \
  --out .narrator-t5-rebuild/story-beat-tuned-publication-001
```

## Immutable naming and publication boundary

The version and tag are derived, not user supplied:

```text
story-beat-tuned-q8-v1-<runtime-aggregate-sha256[0:12]>-<q8-full-output-sha256[0:12]>
v1-<runtime-aggregate-sha256[0:12]>-<q8-full-output-sha256[0:12]>
```

Before copying anything, an operator must verify that neither immutable name
already exists in `huntergdavis/the-grind-2-narrator-flan-t5-small`. Never
force, move, reuse, replace, or delete the tag/version. Publish the six staged
artifacts and quality receipt exactly as planned, verify the remote hashes,
and only then make a separate reviewed app-pin change. This generator performs
none of those external mutations.

## Focused checks

```sh
node --check tools/narrator-story-beat-publication/publication.mjs
node --test tools/narrator-story-beat-publication/publication.test.mjs
```

Design lineage reuses the immutable receipt, isolated-process, and non-cyclic
publication lessons recovered by `deja "narrator artifact publication receipt"`
from `[codex] the_grind_2 · Sep 5 · 01a06835-15f` (the V0.5.80 publication
sequence). The tuned schema is additive and does not reinterpret that frozen
V1 artifact receipt.
