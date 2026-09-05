# Story-beat derived checkpoint rebuild

This developer-only wrapper turns one validated story-beat training checkpoint
into two independently observed q8 runtime builds. It imports the historical
`build_once` and `observed_run` mechanics rather than copying or changing the
proven conversion recipe.

The wrapper does not admit a model or authorize generated text. Every derived
lock and observation receipt fixes both `modelAdmitted` and
`displayAuthorized` to `false`.

## What the derived lock proves

`create-lock` is deterministic and performs no ML imports. It verifies and
binds all of the following before writing a fresh lock:

- the exact committed historical lock and rebuild harness;
- the original FLAN-T5 source closure, including its locked Apache-2.0 license
  evidence;
- the complete historical wheelhouse and toolchain provenance;
- the current training-receipt validator bytes observed at derivation time;
- the training receipt's own hash, fixed recipe, source closure, corpus
  evidence, package versions, and complete checkpoint artifact closure; and
- the derived wrapper, historical q8 recipe, session mapping, and runtime file
  closure.

The training receipt's source manifest must exactly equal the original locked
FLAN-T5 source manifest. Its package versions must equal either the historical
distribution pins or the exact locked wheel version. The checkpoint must have
exactly one root `training-receipt.json`, safetensors weights, and the four
configuration/tokenizer files required by the historical build.

The training receipt does **not** bind the Python harness bytes used when the
training process launched. Accordingly, the lock field is named
`receiptValidatorObservedAtDerivation`: it proves which local validator was
executed while deriving the lock, not which code produced the checkpoint. The
developer running this wrapper trusts the checked-out derived wrapper and
training validator as local executable code. The historical rebuild harness is
the exception: its bytes are verified before import against the full SHA-256
recorded in committed v2 rebuild evidence.

Symlinks, path traversal, overlapping inputs/outputs, pickle files, ONNX
external-data companions, drift, extra receipt files, and modified or
self-authorizing receipts are refused.

## Deterministic sequence

Run these from the repository root after the trainer has completed and its
receipt validates. The paths below name the current ignored local workspace;
choose a new output directory name for a later checkpoint.

```sh
mkdir -p .narrator-t5-rebuild/story-beat-v1/derived

python3 tools/narrator-story-beat-rebuild/rebuild.py create-lock \
  --base-lock tools/narrator-t5-rebuild/toolchain.lock.json \
  --base-source .narrator-t5-rebuild/publication/source \
  --wheelhouse .narrator-t5-rebuild/publication/wheelhouse \
  --checkpoint .narrator-t5-rebuild/story-beat-v1/runs/tune-78110a7-001 \
  --output .narrator-t5-rebuild/story-beat-v1/derived/tune-78110a7-001.lock.json

python3 tools/narrator-story-beat-rebuild/rebuild.py verify-inputs \
  --lock .narrator-t5-rebuild/story-beat-v1/derived/tune-78110a7-001.lock.json \
  --base-lock tools/narrator-t5-rebuild/toolchain.lock.json \
  --base-source .narrator-t5-rebuild/publication/source \
  --wheelhouse .narrator-t5-rebuild/publication/wheelhouse \
  --checkpoint .narrator-t5-rebuild/story-beat-v1/runs/tune-78110a7-001
```

Run each `build-one` invocation in a separate process in the exact historical
Linux/amd64 container digest, with networking disabled. Install packages only
from the already verified wheelhouse with `pip --no-index`; set
`GRIND2_CONTAINER_DIGEST` to the locked digest and set the locked
`PYTHONHASHSEED=0` before Python starts. Mount the repository/checkpoint,
source, wheelhouse, and derived lock read-only, and mount only each fresh build
destination read-write.

```sh
python3 tools/narrator-story-beat-rebuild/rebuild.py build-one \
  --lock .narrator-t5-rebuild/story-beat-v1/derived/tune-78110a7-001.lock.json \
  --base-lock tools/narrator-t5-rebuild/toolchain.lock.json \
  --base-source .narrator-t5-rebuild/publication/source \
  --wheelhouse .narrator-t5-rebuild/publication/wheelhouse \
  --checkpoint .narrator-t5-rebuild/story-beat-v1/runs/tune-78110a7-001 \
  --workspace .narrator-t5-rebuild/story-beat-v1/derived/build-1 \
  --ordinal 1 --run-id tune-78110a7-001:1

python3 tools/narrator-story-beat-rebuild/rebuild.py build-one \
  --lock .narrator-t5-rebuild/story-beat-v1/derived/tune-78110a7-001.lock.json \
  --base-lock tools/narrator-t5-rebuild/toolchain.lock.json \
  --base-source .narrator-t5-rebuild/publication/source \
  --wheelhouse .narrator-t5-rebuild/publication/wheelhouse \
  --checkpoint .narrator-t5-rebuild/story-beat-v1/runs/tune-78110a7-001 \
  --workspace .narrator-t5-rebuild/story-beat-v1/derived/build-2 \
  --ordinal 2 --run-id tune-78110a7-001:2
```

Finally, in the same locked offline environment, observe the retained pair into
a fresh receipt:

```sh
python3 tools/narrator-story-beat-rebuild/rebuild.py observe-pair \
  --lock .narrator-t5-rebuild/story-beat-v1/derived/tune-78110a7-001.lock.json \
  --base-lock tools/narrator-t5-rebuild/toolchain.lock.json \
  --base-source .narrator-t5-rebuild/publication/source \
  --wheelhouse .narrator-t5-rebuild/publication/wheelhouse \
  --checkpoint .narrator-t5-rebuild/story-beat-v1/runs/tune-78110a7-001 \
  --build-a .narrator-t5-rebuild/story-beat-v1/derived/build-1 \
  --build-b .narrator-t5-rebuild/story-beat-v1/derived/build-2 \
  --receipt .narrator-t5-rebuild/story-beat-v1/derived/rebuild-receipt.json \
  --run-a tune-78110a7-001:1 --run-b tune-78110a7-001:2
```

Observation revalidates the entire input bundle after reading both builds. It
accepts only byte-identical raw intermediates and byte-identical staged runtime
artifacts, using the historical ONNX validation and 100 MiB budget.

Run the no-ML fixture suite with:

```sh
python3 -m unittest tools/narrator-story-beat-rebuild/rebuild_test.py -v
```
