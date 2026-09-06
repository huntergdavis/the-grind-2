# Factual story-beat V2 export and offline training

These developer-only tools export the committed factual story-beat V2 corpus
into physically separate train/development and sealed-holdout files, then
train a local CPU checkpoint from train/development only. They do not run in
the game, publish or admit a model, or authorize display.

The V2 exporter is separate from the frozen V1 training path. It loads the
production TypeScript corpus through its production validator, independently
checks the complete corpus hash, and projects only `id`, `split`, `prompt`
and `target`. Each projected row and envelope gets a new canonical hash.

From the repository root, first create the already-ignored parent and then
write one fresh child:

~~~sh
mkdir -p .narrator-t5-rebuild
node tools/narrator-story-beat-v2-training/export-corpus.mjs \
  --output .narrator-t5-rebuild/story-beat-v2-export-001
~~~

The destination is created with mode 0700. Its three mode-0600 files are:

- `train-dev.json`: 1,000 train plus 128 development rows;
- `sealed-holdout.json`: 200 rows that must never enter training;
- `export-manifest.json`: V1 source, V2 source, projected corpus, byte-length
  and SHA-256 bindings with model admission and display authorization fixed
  false.

Only `train-dev.json` may be passed to the V2 trainer.

## Validate the V2 training closure

The V2 entry point reuses the complete, proven V1 CPU training core at pinned
SHA-256
`459fab2643c1d2bc328606ebcfa6adfd4ec278575d6c99327ab2ef242569ef79`.
It loads that core into a private module instance and applies only this
separate profile:

- corpus and receipt schema version 2;
- seed 20260906, CPU only, batch size 1, accumulation 8, and 3 epochs;
- maximum 384 source and 48 target tokens, with no truncation;
- Adafactor at 1e-3, deterministic algorithms, four intra-op threads, one
  inter-op thread, zero loader workers, and seeded shuffling.

Validation checks the full corpus hash, every row hash, train/dev-only split
closure, source-model closure, symlink boundaries, and a fresh destination.
It does not import PyTorch or Transformers and leaves the destination absent:

~~~sh
python3 tools/narrator-story-beat-v2-training/train.py \
  --validate-only \
  --corpus .narrator-t5-rebuild/story-beat-v2/export-d66b901-001/train-dev.json \
  --source .narrator-t5-rebuild/publication/source \
  --destination .narrator-t5-rebuild/story-beat-v2/checkpoint-v2-001
~~~

The production preflight reports corpus hash `c85cbc360a1a7a84`, 1,000
training rows, 128 development rows, and admission/display authority false.

Run both V2 fixture suites directly without changing the repository's
currently dirty package manifest:

~~~sh
node --test tools/narrator-story-beat-v2-training/export-corpus.test.mjs
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tools/narrator-story-beat-v2-training/train_test.py -v
~~~

## Train

Use the already verified offline Python environment and local safetensors
source. Do not install packages or fetch a model during the run:

~~~sh
PYTHONHASHSEED=20260906 python3 tools/narrator-story-beat-v2-training/train.py \
  --corpus .narrator-t5-rebuild/story-beat-v2/export-d66b901-001/train-dev.json \
  --source .narrator-t5-rebuild/publication/source \
  --destination .narrator-t5-rebuild/story-beat-v2/checkpoint-v2-001
~~~

The process emits one compact factual-V2 progress record per epoch. Its fresh
checkpoint and receipt bind the source closure, corpus, recipe, packages,
losses, and every output byte while retaining
`modelAdmitted=false` and `displayAuthorized=false`. Sealed evaluation,
browser evidence, publication, worker transport, and Chronicle integration
remain separate later features.

## Completed checkpoint — 2026-09-06

The first production-corpus run completed once inside the same pinned,
network-disabled CPU environment previously proven by the V1 training path.
Only the read-only source and train/development corpus plus one fresh output
mount were visible to the process; the sealed holdout was not mounted. The
validated schema-2 receipt records:

- source tree SHA-256
  `b0be7b935d129f9b38863015c2c18375b398d7f4f994609214684fce74aa86f4`
  across eight source files;
- train/development corpus hash `c85cbc360a1a7a84` and file SHA-256
  `4dca3ed0fe42d03a885143bd3aad1810e876e312dcaf1a75f1bb9abc9cb70bb1`;
- 1,000 training rows, 128 development rows and exactly 375 optimizer steps;
- mean training losses `0.24255373582034373`,
  `0.04269638903182931` and `0.018933417036500033`, with final
  development loss `0.5221119575980993`;
- eight receipt-bound artifact files totaling 311,106,466 bytes, including
  `model.safetensors` at SHA-256
  `d05fdc8359af2255e26e26f7861ddfda0ba1e02db737a8471adc25bdc3919e51`;
- receipt payload SHA-256
  `0e669f4a89407f010dc2e684fca56394458f1eec943e46a2ec852b2c8ed59055`
  and receipt-file SHA-256
  `15e5149dd8f4ac5440ff0787d2d743c8d7a0520ed3cd7c7a09ec4acee0d2a2ad`.

The committed validator independently reloaded the receipt and rehashed the
complete nine-file, 311,111,052-byte directory after the training container
exited. This is a reproducible local FP32 checkpoint, not a quality result:
`modelAdmitted=false` and `displayAuthorized=false` remain fixed. The next
atomic feature is the independent, unconstrained FP32 sealed-holdout evaluator;
q8 rebuild/publication and real browser evidence remain behind that result.
