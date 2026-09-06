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
