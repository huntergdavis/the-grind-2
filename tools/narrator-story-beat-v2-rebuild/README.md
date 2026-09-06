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

## Focused checks

~~~sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest \
  tools/narrator-story-beat-v2-rebuild/rebuild_test.py -v
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest \
  tools/narrator-story-beat-rebuild/rebuild_test.py -v
~~~

The V2 adapter suite passes 4/4, the unchanged V1 rebuild suite passes 9/9,
and the V2 trainer suite passes 10/10.
