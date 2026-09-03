# T5 rebuild harness

This developer-only harness rebuilds FLAN-T5-small twice from one verified,
immutable source snapshot and accepts a receipt only when both staged runtime
closures and all ten raw intermediates are byte-identical. It is not imported
by the game and does not admit a model or authorize generated text.

The lock pins the executed harness path and SHA-256, source files, Linux/amd64
container digest, complete wheelhouse, Optimum/ONNX Runtime source revisions,
export arguments, q8 method, runtime closure, and Transformers.js session
mapping. Keep all source weights, wheels,
intermediates, output models, logs, and receipts under `.narrator-t5-rebuild/`,
which is ignored by git and excluded from `dist`.

1. Download only the source and wheel files enumerated by `toolchain.lock.json`.
2. Run `verify-inputs` on the host before entering the container.
3. Install exclusively from the verified mounted wheelhouse with `pip --no-index`.
4. Run `run-pair` inside the exact container digest with networking disabled and
   `GRIND2_CONTAINER_DIGEST` set to the locked value.
5. Independently run `observe-pair` over the retained output before publishing
   any artifact repository.

The export uses Optimum `main_export` with validation and offline local files.
Quantization targets only the encoder and merged decoder with the last pinned
official Transformers.js q8 algorithm: dynamic signed QInt8 weights, unsigned
activations, the integer-op registry, subgraphs enabled, and constant-B MatMul
gating. ONNX checker, external-initializer inspection, CPU session construction,
an exact six-file runtime closure, complete logs, the 100 MiB ceiling, and two
fresh byte-identical builds are mandatory.

The real two-build metadata receipt is committed under `docs/narrator/`; no model
bytes are. This desktop receipt establishes rebuild lineage only. Evaluation and
named-phone evidence are separate gates.
