# Client-only local narrator

The optional narrator is a presentation system. It can turn a tiny packet of
already-committed public facts into one ambient line; it cannot decide, mutate,
remember, reward, reveal, or advance anything. The game remains complete and
responsive with the narrator off, unavailable, slow, invalid, or terminated.

```text
Rules Engine -> committed Chronicle scene -> public fact projection
                                             |-> immediate template line
                                             `-> optional local worker line
                                                   -> strict validation
                                                   -> same-scene replacement only
```

## Model-visible contract

The worker realizer receives only `NarratorPromptV1`: scene kind, public place,
quiet/steady/heightened energy, one semantic move, and either an observer or
unattributed hero-aside voice. Event IDs, ticks, fingerprints, headlines,
actions, goals, consequences, decisions, rewards, stats, relationships, and raw
Chronicle text remain host-only. NPC speech stays disabled until a later typed
speaker-knowledge packet exists.

The immediate fallback is deterministic:

- observer: `<place> holds a <energy> moment.`
- hero aside: `This <energy> moment has my attention.`

Generated text is optional polish. It is accepted only for the still-current
source fingerprint and only after exact envelope, token, character, line,
sentence, vocabulary, voice, and identity checks. It is never saved or hashed.

## Low-end lifecycle

AI starts `off`. Enabling an admitted model moves it to `available` without
creating a worker. The first admitted scene lazily creates and loads one
dedicated worker. There is one in-flight job, no queue, two admitted dispatches
per rolling ten minutes, an eight-second response deadline, and no implicit
retry after failure. Hidden and Eco modes terminate work immediately. Simulation,
saves, controls, and rendering never await inference.

The first low-end admission gate is:

- at most 100 MiB of stored model weights;
- at most 256 MiB incremental peak working memory;
- at most 320 exact input tokens and 48 exact output tokens;
- WebAssembly plus a dedicated worker; WebGPU is an optional acceleration path;
- a permissive license, pinned revision, explicit download consent, progress,
  cancellation, and deletion before a real model can ship.

There is no server inference path, API key, telemetry path, model dependency, or
weight download in the lifecycle foundation. Source guards reject network,
storage, renderer, persistence, and simulation-authority imports in its boundary.

## Candidate status

No model is admitted. The benchmark-only TinyStories-Instruct-33M INT8 ONNX
candidate pins its source/model revisions and all eight artifacts; those
artifacts total 82,096,737 bytes. The proposed Transformers.js 4.2.0 runtime is
pinned with its npm integrity and Apache-2.0 license. The instruct checkpoint,
however, has no verified license metadata and incremental phone memory remains
unmeasured. It therefore cannot be downloaded, bundled, or shown to players.

SmolLM2-135M-Instruct Q4F16 is not a low-end fallback: its single ONNX file is
117,266,133 bytes before tokenizer/configuration files, already beyond the first
100 MiB tier. A pinned quantized FLAN-T5-small ONNX set is a more promising
97,391,831 bytes and its source checkpoint declares Apache-2.0. Its conversion
repository does not identify the exact source revision or its own license,
however, so it remains a research lead rather than an admitted candidate.

The frozen evaluation corpus contains 200 packets across 20 deterministic seed
labels, all current scene modes, all nine semantic-move × energy strata and
generated-name edge cases. Its version-one golden hash is
`63b3a0ee9fef092a`. This is test material, not proof that a model works.

## Candidate-bound evidence harness

The benchmark runner now requires an exact worker handshake covering run,
candidate/artifact manifests, source and model revisions, runtime package,
version and integrity, corpus, prompt formatter and greedy decoding. It parses
every worker value from `unknown`, checks observed artifact byte lengths and
SHA-256 digests before load, applies load/case/disposal watchdogs, and emits one
ordered 200-row receipt even after failure. Impossible histories—such as output
after a terminal timeout or successful rows after a failed load—are invalid.

Blind sheets counterbalance model placement globally and inside every
move/energy/voice stratum. The coordinator must obtain its private salt from
`generateNarratorBlindStudySaltV1`, which draws 32 bytes with Web Crypto. Sheets
expose neither that salt nor model-side labels. Invalid output is hidden and
unrated; output identical to the template is forced to tie. A report advances
only when all of these hold:

- at least 198 of 200 outputs pass the exact tokenizer and output grammar;
- zero accepted knowledge violations;
- at least 120 model wins, at least 140 decisive ratings, and at least 60% score
  with ties retained in the 200-case denominator;
- the decisive model-win Wilson lower bound is above 50%;
- every semantic stratum and both voices pass independent validity, quality and
  decisiveness floors;
- no repeated prose form inside a two-call burst, no form run above three, and
  at least two forms in every chronological ten-line sequence;
- load and disposal both succeed and the required external rating-run registry
  reports no replay.

The only passing disposition is `advance-to-v04.13b3`; `modelAdmitted` is
literally always false. Missing or excessive incremental-memory evidence is
reported separately as `requiredInV04_13b3`; a caller-authored manifest number
cannot substitute for the typed named-phone receipt that the next stage must
produce. Reports cannot validate themselves: verification
recomputes the complete report from the candidate, run receipt, blind sheet,
private key, locked ratings and prior replay registry. The report binds that
registry's epoch/fingerprint and a sheet+rater consumption identity, so merely
changing `ratingRunId` cannot reuse a rating. Pure consumption receipts retain
the exact prior and next registries and can be reverified against current state;
a future coordinator must persist the receipt and next registry atomically.
The 16-hex `canonicalHash` fields are deterministic structural fingerprints for
detecting accidental or casual mutation, not cryptographic signatures,
commitments or authenticity proof. Retain and replay all raw evidence.

No model run or blind rating has been performed yet. Named-phone sustained
performance and artifact provenance are next. The repository still adds no
inference dependency, model bytes, download/network path, consent UI or generated
game prose. That next stage must require its typed named-phone receipt even when
a candidate manifest contains a preliminary memory estimate.

Primary references:

- [WebLLM](https://github.com/mlc-ai/web-llm)
- [WebLLM prebuilt model configuration](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)
- [Transformers.js WebGPU guide](https://huggingface.co/docs/transformers.js/en/guides/webgpu)
- [Transformers.js custom model/runtime configuration](https://huggingface.co/docs/transformers.js/en/custom_usage)
- [SmolLM2-135M-Instruct source](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct)
- [Pinned SmolLM2-135M-Instruct ONNX artifacts](https://huggingface.co/onnx-community/SmolLM2-135M-Instruct-ONNX/tree/b8a5c0f183b78c55955a5364f610c36668b5e681/onnx)
- [FLAN-T5-small source](https://huggingface.co/google/flan-t5-small)
- [Pinned FLAN-T5-small ONNX conversion](https://huggingface.co/onnx-community/flan-t5-small-ONNX/tree/76988c16f73cadb2c2e13e2d7d85608944223105)
- [TinyStories-Instruct-33M ONNX repository](https://huggingface.co/onnx-community/TinyStories-Instruct-33M-ONNX/tree/main)
- [TinyStories-Instruct-33M ONNX artifacts](https://huggingface.co/onnx-community/TinyStories-Instruct-33M-ONNX/tree/main/onnx)
- [TinyStories-Instruct-33M source repository](https://huggingface.co/roneneldan/TinyStories-Instruct-33M)
- [Transformers.js source and browser runtime](https://github.com/huggingface/transformers.js/)

## Verification

Focused tests exercise exact public projection, deterministic fallback,
capability classification, malformed/stale/duplicate/wrong-version/oversized
messages, exact token budgets, output grammar, one-job backpressure,
cancellation, suppression, timeout, worker/message loss, explicit recovery, and
idempotent disposal. Candidate tests additionally prove exact schemas, hashes,
sizes, runtime identity, path safety, required artifact roles and fail-closed
license/memory policy. Corpus tests lock its hash, dimensions, semantic strata,
scene modes, name edges and deep immutability. A 320×568 Chromium smoke test
proves the AI-off production build makes no external request while simulation
advances and pause/resume stays responsive.

Evidence tests additionally cover exact runtime handshakes, malformed worker
returns, causal load/row/disposal histories, timeout/abort/device-loss hard
termination, full-denominator blind metrics, form-level fatigue, failed-load and
failed-disposal blocking, replay rejection, malformed evaluator inputs and
context-recomputed report verification.
