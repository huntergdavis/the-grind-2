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

No model run or blind rating has been performed yet. The v0.5.74 named-phone
shadow contract now binds an exact phone, app build, candidate/artifact/runtime,
corpus/decoding, verified b2 report and its consumption receipt. Eight ordered
phases cover exact ten-minute A/B/B/A comparisons, a separate ≥30-unique-case
stress run, an exact one-hour production-rate Workday run, and exact ten-minute
zero-work Eco and hidden runs. Each generated job has an immutable synthetic
identity derived only from its frozen evaluation-corpus row. A separate observed
campaign/event/tick/fingerprint scheduling envelope measures freshness at
dispatch and result; it does not claim that the synthetic prompt came from that
source. The output is never source-matched or display-eligible. Presentation
ownership is still observed while `displayAuthorized`, `modelAdmitted`,
`persisted`, `displayed` and `canonicalMutation` remain literal false.

All summaries are recomputed from retained raw intervals and samples. Visible
phases retain five-second frame windows every minute plus overflow counters and
full Long Task coverage. The gate requires Workday frame p95/p99 ≤25/33 ms,
≤2/4 ms comparison p95/p99 regression, ≤0.25 percentage-point added missed
refreshes, ≤0.5% added Long Task blocking, at most one Long Task per ten minutes
and none above 100 ms. Stress p95 must be within eight seconds with no failure or
stale envelope, and at least 90% of the full dispatch denominator must be current.
Workday requires at least 11 current envelopes, <1% unioned inference duty,
≤480 output tokens/hour and at most two dispatches in a rolling ten minutes.

Every worker load and dispatched request—including timeout, cancellation or
failure—retains edge-to-edge memory samples at ≤100 ms cadence. The limits are
≤256 MiB incremental peak memory and <900 MiB combined peak, followed by an
exact ten-minute disposal-settlement observation. Battery, thermal and external
operator/instrument provenance are retained; the mean shadow-versus-AI-off
comparison may add at most 25 mWh per ten-minute phase, thermal state may never
reach serious/critical, paired temperature rise may not exceed 3°C and late-run
stress latency may not degrade by more than 10%. Eco/hidden cancellation must
start within 250 ms of phase onset and terminate the worker within one second,
with no accepted late result or subsequent work. Unsupported frame, Long Task,
memory, thermal or battery measurement is an evidence gap, never a zero or a
pass. Its strongest disposition is only `eligible-for-v04.13b3b`.

This remains a contract, not a claimed benchmark result. The repository still
adds no inference dependency, model bytes, download/network path, consent UI or
generated game prose. The worker kernel and pure phase archive/finalizer now
exist; candidate provenance, real observation adapters, an external diagnostic
harness/export and the named-phone run remain next. Consent/cache/delete and
guarded visible integration remain a separate later stage.

Verification on the final v0.5.74 tree passes 14 focused mutation-heavy tests,
88 narrator tests and 749 total unit tests, plus TypeScript, architecture,
version, production build and the dedicated 320×568 Chromium AI-off smoke. That
smoke advances simulation, exercises pause/resume and observes zero external
inference traffic.

## Developer-only collector kernel

Version 0.5.75 adds the first bounded b3b implementation slice without adding a
model. The exact worker protocol supports `initialize`, `verify-artifacts`,
`load`, `run-case`, `cancel` and `dispose`. Every message binds the b3a run and
plan; initialization additionally binds candidate/artifact manifests, runtime
integrity, corpus and decoding. A run request contains only a frozen corpus
ordinal. The worker resolves the prompt internally, so a caller cannot inject or
associate arbitrary prose with a benchmark row.

The injected model and tokenizer ports expose separate immutable copies of the
exact candidate/artifact/runtime/corpus/decoding binding. The state machine
verifies those bindings plus observed artifact bytes before load, accepts one
operation with no queue, replays exact duplicate requests, rejects request-ID
conflicts and stale epochs, and hard-cancels active work. It meters the frozen
prompt and raw normalized output through the tokenizer inside the runtime rather
than accepting counts in the model result. Disposal immediately reserves the
worker in a non-runnable, non-cancellable state, rejects concurrent
disposal/work, suppresses late results and is idempotent after completion. The
plan derives a finite request budget; reaching it rejects new IDs without ever
evicting an earlier replay identity.

Host validation binds every response to its exact request, epoch, response kind
and case ordinal; recomputes the artifact manifest; and rejects impossible
status/state pairs even when the forgery is rehashed. Responses are deeply
frozen and content-addressed. Generated text exists only inside the evidence-only
case response; every response sets `modelAdmitted` and `displayAuthorized` to
false. There is no normal-game import, route, UI, worker entry, dependency,
network call, download or model byte. Twenty-six focused tests exercise the
benchmark contract and collector kernel, including device loss, disposal races,
late completion, independent token budgets and rehashed substitutions.
All 761 unit tests also pass, plus TypeScript, architecture/version gates, the
production build and bundle-leakage scan, and the dedicated 320×568 Chromium
AI-off smoke with zero external inference traffic.

This is not a benchmark result or a complete collector. Version 0.5.78 adds the
family-specific Candidate V2 contract described below; version 0.5.77 added the
provenance staging gate, and version 0.5.76 added the pure phase
archive/finalizer. The next b3b2b2b slice must rebuild an actual candidate and
add real frame, Long Task, memory, thermal, battery, network and presentation ports. A
separate local diagnostic harness must stay outside `dist`, render no
prompts/output, and abort foreground measurements on visibility, resize or
orientation changes.

Primary-source research still blocks the FLAN-T5-small conversion: its pinned
card names `google/flan-t5-small` as the base model, and Google's source model
declares Apache-2.0, but the conversion does not bind an exact source revision or
publish its own license metadata. Transformers.js documents an
`allowRemoteModels = false` control; any later measured adapter must use locally
staged, digest-verified artifacts with remote loading disabled.

## Developer-only candidate provenance and staging gate

Version 0.5.77 adds a pure, exact-key provenance dossier between a passing B2
evaluation and named-phone plan construction. It binds the candidate and
artifact-manifest hashes; artifact, converted-model and source repositories plus
immutable revisions; the exact model-session artifact paths; source and
converted-repository license evidence with pinned path, SHA-256 and SPDX ID; an
exact source-revision lineage record; pinned converter repository/revision and
command; capture method and coordinator identity.

The derived report is either `blocked` or `eligible-for-device-staging` and
always has `modelAdmitted: false` and `displayAuthorized: false`. A manifest's
own `licenseStatus: "verified"` cannot bypass missing converted-license or exact
lineage evidence. A valid eligible report is now required by the B2 handoff, and
its dossier/report hashes survive plan, worker initialization, archive and
finalizer validation. Architecture checks prevent normal narrator/game/UI code
from importing this evaluation-only module.

The generic gate ships; no real candidate passes it yet. The pinned
`onnx-community/flan-t5-small-ONNX` lead is 97,391,831 bytes but lacks explicit
conversion licensing and exact source-revision lineage. The better pinned
`Xenova/flan-t5-small` lead is 98,321,955 bytes and declares Apache-2.0 plus its
base model, but still lacks exact lineage. Google's pinned source is Apache-2.0;
that fact alone does not prove either conversion. T5 also needs exact encoder and
merged-decoder sessions, so the follow-up adds Candidate V2 rather than weakening
the decoder-only V1 contract. No model bytes, adapter, download, device claim,
admission path, UI or generated prose is included here.

## Developer-only Candidate V2 session contract

Version 0.5.78 preserves `NarratorModelCandidateV1` and every released V1
evaluation/shadow wire schema. `NarratorModelCandidateV2` adds a strict model
family plus an ordered runtime-session manifest:

- decoder-only: runtime key `model`, file stem `model`, dtype `q8`, artifact
  `onnx/model_quantized.onnx`;
- T5: runtime key `model`, file stem `encoder_model`, dtype `q8`, artifact
  `onnx/encoder_model_quantized.onnx`; then runtime key and file stem
  `decoder_model_merged`, artifact
  `onnx/decoder_model_merged_quantized.onnx`.

The runtime key and file stem are deliberately separate fields: Transformers.js
loads the T5 encoder through the runtime key `model` while its public dtype map
and file lookup use `encoder_model`. Every declared session must bind an existing
weight, every weight must bind a session, and every artifact under `onnx/` must
be in that projection. This version therefore forbids external-data shards and
counts every listed artifact toward the exact 104,857,600-byte limit.

The V2 dossier repeats the complete ordered runtime-key/file-stem/dtype/path
projection. Candidate hashes bind this topology and artifact hashes independently
bind bytes. Evaluation receipts, blind reports and shadow plans accept the union
without changing their V1 envelopes; substitutions fail at each handoff.
The topology is accepted only with the exact 4.2.0 package version, Apache-2.0
license declaration, npm SRI and unpacked byte length used by the researched
runtime; even another permissive SPDX label fails closed.

The contract is based on pinned Transformers.js 4.2.0 source for
[session configuration](https://github.com/huggingface/transformers.js/blob/54652ba3366ccd1e3b64e689a96504309e6fb53b/packages/transformers/src/models/session_config.js#L21-L33),
[session lookup](https://github.com/huggingface/transformers.js/blob/54652ba3366ccd1e3b64e689a96504309e6fb53b/packages/transformers/src/models/session.js#L145-L159),
[dtype suffixes](https://github.com/huggingface/transformers.js/blob/54652ba3366ccd1e3b64e689a96504309e6fb53b/packages/transformers/src/utils/dtypes.js#L59-L71)
and [artifact loading](https://github.com/huggingface/transformers.js/blob/54652ba3366ccd1e3b64e689a96504309e6fb53b/packages/transformers/src/utils/model-loader.js#L44-L48).
Optimum's [ONNX export API](https://huggingface.co/docs/optimum-onnx/onnx/package_reference/export)
documents revision-pinned export and validation options for the next slice.

This release contains fictional test manifests only. It does not rebuild or
approve FLAN-T5, load Transformers.js in the game, download any model, collect a
phone measurement, or authorize generated prose. Those remain the gated
V04.13b3b2b2b work.

## Developer-only phase archive and finalizer

Version 0.5.76 adds a pure append-only archive around the worker/evidence
contracts. An archive binds the exact run, plan, named-phone profile, build,
candidate/artifact manifests, runtime, frozen corpus, decoding, consumed b2
report and collector session. Entries form a monotonic prior-hash chain and
retain phase slot, attempt, raw phase/opportunity/worker payloads and an ordered
observation manifest. Duplicate replay is idempotent; conflicting duplicates,
gaps, reordering, cross-session splices and post-terminal appends reject.
Interrupted attempts remain retained and make the run incomplete; aborted or
device-lost attempts terminate it.

Every channel is explicitly `missing`, `unsupported`, or `present`. Present data
is browser-observed, coordinator-imported or synthetic. A measured zero counts
only when its payload hash, record count and complete coverage window validate;
missing and unsupported data never become zero or an empty passing collection.
External observations retain instrument/operator IDs, units, capture cadence,
timebase mapping and source-file SHA-256. Memory origin is method-specific,
browser observations share one clock domain, imports share one mapped timebase,
and the two phase-bound suppression transitions cover the exact ten-minute
suppression window. Origin labels and hashes expose structural substitution and
mutation; they are not proof that a physical observation occurred.

The finalizer requires exactly the ordered A/B/B/A comparisons, stress,
Workday, Eco and hidden phases plus artifacts, suppression and ten-minute
post-disposal evidence. Worker results are request-bound: device loss maps to
`device-lost`, malformed output to `invalid-output`, and cancellation to
`cancelled`. Cancellation and timeout require a following validated cancel
exchange; timeout additionally requires the deadline. It returns either a
receipt reconstructed and revalidated through the
existing b3a contract or deterministic reasons with `receipt: null`. Collection
completeness remains separate from performance: complete but slow, hot or
power-hungry evidence finalizes and is then blocked by the evaluator.

This slice remains evaluation-only. Reverse-import architecture checks prohibit
normal game modules from importing benchmark, candidate, collector or
shadow-worker code. No model, adapter, model bytes, network path, UI,
persistence, device result, admission authority or generated game prose ships.
Forty-four focused shadow tests pass in one standalone run. Across the full run
and isolated reruns of its CPU-contention timeouts, all 803 source tests pass;
the release also checks TypeScript, version synchronization, architecture,
production bundle leakage and the existing 320×568 AI-off smoke.

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
- [W3C Long Tasks API](https://www.w3.org/TR/longtasks-1/)
- [MDN `measureUserAgentSpecificMemory()`](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory)
- [MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
- [Android Thermal API](https://developer.android.com/games/optimize/adpf/thermal)

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
Named-phone shadow tests additionally cover complete evidence, frozen-workload
versus observed-envelope identity separation, stale scheduling envelopes,
unsupported measurement, Eco activity, suppression timing, disposal settlement,
load/request peak-memory coverage, comparison duration and battery caps,
canonical/cutaway/projection/layout divergence, memory regression, exact-key
rejection, raw-trace binding and context-recomputed device-report verification.
