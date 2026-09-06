# Factual story-beat V2 derived q8 rebuild

This developer-only adapter turns the validated factual story-beat V2 FP32
checkpoint into two independently observed q8 runtime builds. It is additive:
the V1 rebuild tool and every historical receipt remain unchanged.

`rebuild.py` pins the complete proven V1 rebuild core at SHA-256
`90bd5e8b3323aa17643fb11e1f899dbed8678f817897d8df3619b63f9a2d4e31`
and the V2 training-receipt validator at SHA-256
`5d0573f2aa9eb0ddd88589e8f90db37451395b572961af23a5c3a0c654f0ec98`.
It changes only the schema-2 lock/receipt identities and the bound V2 trainer
and wrapper paths. Conversion and observation still call the pinned historical
`build_once` and `observed_run` functions with the unchanged source,
wheelhouse, platform, ONNX and q8 recipe.

Neither a derived lock nor a pair receipt admits a model or authorizes display.
Both flags are fixed to `false`. V1 receipts fail the V2 validator, and loading
this adapter does not mutate a separately loaded V1 rebuild module.

## Derive and verify the real lock

Create the retained lock only from a committed adapter and a fresh private
destination:

~~~sh
mkdir -m 700 \
  .narrator-t5-rebuild/story-beat-v2/derived-grounded-001

python3 tools/narrator-story-beat-v2-rebuild/rebuild.py create-lock \
  --base-lock tools/narrator-t5-rebuild/toolchain.lock.json \
  --base-source .narrator-t5-rebuild/publication/source \
  --wheelhouse .narrator-t5-rebuild/publication/wheelhouse \
  --checkpoint .narrator-t5-rebuild/story-beat-v2/checkpoint-v2-001 \
  --output .narrator-t5-rebuild/story-beat-v2/derived-grounded-001/derived.lock.json

python3 tools/narrator-story-beat-v2-rebuild/rebuild.py verify-inputs \
  --lock .narrator-t5-rebuild/story-beat-v2/derived-grounded-001/derived.lock.json \
  --base-lock tools/narrator-t5-rebuild/toolchain.lock.json \
  --base-source .narrator-t5-rebuild/publication/source \
  --wheelhouse .narrator-t5-rebuild/publication/wheelhouse \
  --checkpoint .narrator-t5-rebuild/story-beat-v2/checkpoint-v2-001
~~~

Before commit, a temporary real derivation and read-only reverification passed.
It binds 1,000 train plus 128 development rows, corpus hash
`c85cbc360a1a7a84`, training receipt hash
`0e669f4a89407f010dc2e684fca56394458f1eec943e46a2ec852b2c8ed59055`
and the nine-file checkpoint tree
`fd51ae52304466f7b685fcf89ba45966280f706e8b62c510c242a58e4d3912c5`.
The deterministic mode-0600 probe lock has content SHA-256
`ea92df9f55da71b1cc4aca28b9b4b8e966d13b0bd37bd32ee8c18eacd1714c23`,
file SHA-256
`9c09a506946e17485130137f071e4701037250c23f9a3e34fa6c9266eabbbcf8`
and byte length 6,588.

## Build and observe the pair

Each `build-one` must run in its own exact historical Linux/amd64 container
process with networking disabled, `PYTHONHASHSEED=0`, the repository/source/
wheelhouse/checkpoint/lock mounted read-only, and only its fresh destination
mounted read-write. Use distinct run IDs and ordinals 1 and 2. The exact
container recipe and `observe-pair` / read-only `verify-pair` sequence remain
the ones documented in
[`../narrator-story-beat-rebuild/README.md`](../narrator-story-beat-rebuild/README.md),
substituting only this V2 entry point and the V2 paths above.

Observation accepts only byte-identical raw and staged results, preserves the
100 MiB runtime ceiling, and produces the distinct receipt kind
`factual-story-beat-v2-derived-q8-rebuild-receipt`. The retained six-file q8
closure must then pass the separate grounded browser evaluation before any
publication plan can be created.

## Retained grounded q8 pair — 2026-09-06

The retained lock was derived again after this adapter reached committed
revision `a6a4cb52d1aaae7c46e3726e14ee99cc5bfc24ed`. Its bytes exactly match the
pre-commit probe: mode 0600, 6,588 bytes, content SHA-256
`ea92df9f55da71b1cc4aca28b9b4b8e966d13b0bd37bd32ee8c18eacd1714c23`
and file SHA-256
`9c09a506946e17485130137f071e4701037250c23f9a3e34fa6c9266eabbbcf8`.

Two distinct network-disabled Linux/amd64 containers then rebuilt the
checkpoint with run IDs `factual-v2-grounded-001:1` and
`factual-v2-grounded-001:2`. A third fresh container observed the pair and
read-only `verify-pair` independently recomputed the complete receipt. Both raw
intermediate manifests and both staged runtime manifests are byte-identical.
The six runtime files total 97,098,984 bytes and have aggregate manifest
SHA-256 `ef166be09cf03bc505de153a9b16ae970159b3a66d8c31ed70e4da6061a1bf9a`:

| Runtime path | Bytes | SHA-256 |
| --- | ---: | --- |
| `config.json` | 1,506 | `f8045e716db6684883b20b6274c39cf59e6e84c148542d33c6d01de7574b6b18` |
| `generation_config.json` | 142 | `8145d7eecabff8e16a9876617a6d52728e9b8fbe24c426e6bf9ebbd6bfb87737` |
| `onnx/decoder_model_merged_quantized.onnx` | 59,041,810 | `35023ce868af4efe8cf86ef87a12b3c5f5977043503cc22e44636d8da3a217c7` |
| `onnx/encoder_model_quantized.onnx` | 35,612,462 | `ec8ada2d3ab8c526ff976b083ad36eb4485e5a92f3a8f61bece3ab4c5f245f53` |
| `tokenizer.json` | 2,422,234 | `4d4b21a8cc7c0407dafd8ac6215269cd05c8e49a521c3580479b567879526160` |
| `tokenizer_config.json` | 20,830 | `26c1243c486c113e7017520b95ef2e82a7fc64d2b79f857759b4d51de0fb8b70` |

The retained mode-0600 receipt is 14,710 bytes with sealed content SHA-256
`2a3896df62de70ad9bd470d406a497cf7e7fd95b0d34f548d96a3f277e396fb8`
and file SHA-256
`86ca0c2c6e01cfdc56e5d9141c21cc2f01967ad4e3948a67149c050026a333a7`.
It records distinct container Python process IDs 10 and 9, fixes
`fresh-python-process-per-build` / `byte-identical-isolated-processes`, and
keeps model admission and display authorization false.

The next atomic feature is a separate grounded V2 q8 browser evaluator. It
must reproduce the host-derived eligible forms and model scoring in
Transformers.js, validate every selected line at the production boundary, and
emit evidence bound to this exact manifest before publication can proceed.

## Focused checks

~~~sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest \
  tools/narrator-story-beat-v2-rebuild/rebuild_test.py -v
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest \
  tools/narrator-story-beat-rebuild/rebuild_test.py -v
~~~

The V2 adapter suite passes 4/4, the unchanged V1 rebuild suite passes 9/9,
and the V2 trainer suite passes 10/10.
