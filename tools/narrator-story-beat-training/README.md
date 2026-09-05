# Story-beat CPU training harness

This developer-only harness fine-tunes one local seq2seq checkpoint for the
manual, ephemeral, noncanonical “Write this beat” task. It does not run in the
game, publish a model, admit generated text, or authorize display. A trained
artifact still needs independent held-out evaluation, browser conversion, and
the production result validator.

The harness is intentionally offline and CPU-only. The training path sets the
Hugging Face offline flags before importing PyTorch or Transformers, passes
local_files_only to both loaders, refuses source symlinks and pickle weights,
and only accepts a fresh destination. Source weights must be safetensors.

## Training corpus boundary

The input is one exact JSON object:

~~~json
{
  "schemaVersion": 1,
  "corpusHash": "0123456789abcdef",
  "cases": [
    {
      "id": "story-beat-train-01",
      "split": "train",
      "prompt": "the exact production prompt",
      "target": "The reviewed target.",
      "caseHash": "0123456789abcdef"
    }
  ]
}
~~~

Each case hash is the repository canonicalHash of the exact object containing
id, split, prompt, and target. The corpus hash is canonicalHash of the exact
object containing schemaVersion and cases. Both train and dev rows are
required. The sealed holdout split is refused even if an attacker recomputes
all hashes; it must remain in a separate file and is never an input here.
Duplicate JSON keys, IDs, hashes, prompt/target pairs, malformed NFC text,
unsafe Unicode, prompts over 2,400 characters, targets over 160 characters,
extra fields, and hash mismatches fail closed.

The committed corpus hash is not yet pinned here. Add a separate reviewed lock
only after the projection artifact and its hash are final.

## Export the committed corpus

The exporter loads the production TypeScript corpus and validates it through
its production fail-closed guard. It then writes train/dev and sealed holdout
as separate, private files beneath the ignored rebuild workspace. The target
must be a fresh child of an existing directory:

~~~sh
mkdir -p .narrator-t5-rebuild/story-beat-v1
node tools/narrator-story-beat-training/export-corpus.mjs \
  --output .narrator-t5-rebuild/story-beat-v1/export-001
~~~

The fresh directory contains `train-dev.json`, `sealed-holdout.json`, and
`export-manifest.json`. The manifest binds the production corpus hash plus
both projected corpus hashes, byte lengths, row counts, and SHA-256 values.
Only `train-dev.json` may be passed to the trainer.

## Validate without ML packages

Validation checks the corpus, source closure, symlink boundaries, and fresh
destination without importing PyTorch or Transformers:

~~~sh
python3 tools/narrator-story-beat-training/train.py \
  --validate-only \
  --corpus /absolute/path/to/story-beat-train-dev.json \
  --source /absolute/path/to/local-flan-t5-source \
  --destination /absolute/path/to/fresh-output
~~~

The destination remains absent. The single JSON result reports row counts,
source-file count, corpus hash, and mlPackagesImported=false.

Run both exporter and harness fixture suites with:

~~~sh
npm run test:story-beat-training
~~~

## Train

Use the project’s already verified offline Python environment and local source
snapshot. Do not install packages or fetch a model during a training run.

~~~sh
PYTHONHASHSEED=20260904 \
python3 tools/narrator-story-beat-training/train.py \
  --corpus /absolute/path/to/story-beat-train-dev.json \
  --source /absolute/path/to/local-flan-t5-source \
  --destination /absolute/path/to/fresh-output
~~~

The immutable recipe is:

- seed 20260904 and CPU only;
- batch size 1, gradient accumulation 8, and 3 epochs;
- maximum 320 source and 48 target tokens, with no truncation;
- Adafactor at 1e-3 with relative step, parameter scaling, and warmup disabled;
- gradient clipping at 1.0;
- four intra-op and one inter-op CPU threads;
- zero data-loader workers, seeded shuffling, and dynamic per-batch padding;
- deterministic PyTorch algorithms.

The process prints exactly one compact, flushed JSON progress record after each
epoch so a long CPU run can be monitored. The final stdout line is the receipt
path.

## Outputs and receipt

The fresh destination contains safetensors weights, model/tokenizer
configuration, tokenizer material, training-log.json, and
training-receipt.json. The exact receipt binds:

- the complete source-file closure and tree SHA-256;
- the corpus path, schema version, canonical hash, and file SHA-256;
- every fixed recipe field and Python/package versions;
- total/train/dev row counts, per-epoch train loss, final dev loss, and
  optimizer-step logs;
- the complete output closure with byte lengths and SHA-256 values.

Receipt validation rejects missing or extra output files, artifact drift,
pickle outputs, malformed metrics, altered recipe fields, or any attempt to
set modelAdmitted/displayAuthorized. Both fields remain false until later
independent gates are complete.
