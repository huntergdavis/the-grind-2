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

The frozen evaluation corpus contains 200 packets across 20 deterministic seed
labels, all current scene modes, all nine semantic-move × energy strata and
generated-name edge cases. Its version-one golden hash is
`63b3a0ee9fef092a`. This is test material, not proof that a model works.

The next slice must produce exact candidate/runtime/corpus/run-bound receipts,
watchdog-bounded tokenizer/model observations, counterbalanced locked blind
ratings, and sustained named-phone measurements. Until that evidence exists,
there is deliberately no admission function. This slice adds no dependency,
runtime, model bytes, network path, consent UI, or generated prose.

Primary references:

- [WebLLM](https://github.com/mlc-ai/web-llm)
- [WebLLM prebuilt model configuration](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)
- [Transformers.js WebGPU guide](https://huggingface.co/docs/transformers.js/en/guides/webgpu)
- [Transformers.js custom model/runtime configuration](https://huggingface.co/docs/transformers.js/en/custom_usage)
- [SmolLM2-135M-Instruct ONNX Q4F16 artifact](https://huggingface.co/onnx-community/SmolLM2-135M-Instruct-ONNX/blob/main/onnx/model_q4f16.onnx)
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
