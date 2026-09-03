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

No model is admitted yet. Official WebLLM configuration currently estimates its
SmolLM2-360M Q4 tier at about 376 MiB of GPU memory, above this first low-end
memory gate. The ONNX Community SmolLM2-135M Q4F16 artifact is about 117 MB,
above the stored-weight target before tokenizer/runtime overhead. These remain
candidates for measured higher tiers, not assumptions for phones.

The next slice must benchmark a pinned, permissively licensed model with its
actual tokenizer and worker runtime. Transformers.js documents both WebGPU and
WebAssembly execution; either remains local, but the admitted path must pass the
named-device latency, memory, thermal, frame-time, validity, and blinded prose
evaluation in `BACKLOG.md` before its output becomes visible.

Primary references:

- [WebLLM](https://github.com/mlc-ai/web-llm)
- [WebLLM prebuilt model configuration](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)
- [Transformers.js WebGPU guide](https://huggingface.co/docs/transformers.js/en/guides/webgpu)
- [Transformers.js custom model/runtime configuration](https://huggingface.co/docs/transformers.js/en/custom_usage)
- [SmolLM2-135M-Instruct ONNX Q4F16 artifact](https://huggingface.co/onnx-community/SmolLM2-135M-Instruct-ONNX/blob/main/onnx/model_q4f16.onnx)

## Verification

Focused tests exercise exact public projection, deterministic fallback,
capability classification, malformed/stale/duplicate/wrong-version/oversized
messages, exact token budgets, output grammar, one-job backpressure,
cancellation, suppression, timeout, worker/message loss, explicit recovery, and
idempotent disposal. A 320×568 Chromium smoke test proves the AI-off production
build makes no external request while simulation advances and pause/resume stays
responsive.
