# Next local writer: character-scene comparison

The v0.5.92 automatic parchment flow is already implemented. This comparison
targets prose quality inside that experience, separately from story controls.
The present SmolLM2 135M model can compose imagery and feelings, but the
[recorded production-worker samples](../tools/creative-story-probe/viewpoint-report.json)
also omit the viewpoint character and invent relationship history or recovery.

## Fixed comparison

Use the same three synthetic public scenes, prompts and seeds as the recorded
viewpoint run, with one candidate model. Keep single-thread browser WASM, q8,
64 new tokens, greedy decoding, repetition penalty 1.08, and the production
90-second write deadline. Record the pinned artifact identity and byte count,
raw and cleaned output, load/write time, and requests attempted after loading.
Any different runtime or budget must be labeled a separate comparison.

| Scene | What the prose must retain | Emotional opportunity | Current measured weakness |
| --- | --- | --- | --- |
| Mara at the sealed arch | Mara; the arch is still sealed and unentered | Curiosity with anticipation or apprehension | Readable, but the raw tail invents a past |
| Newly sworn Rowan | Mara and Rowan; new companionship, not a long shared history | Tentative trust, welcome, uncertainty | Omits Mara and her reaction |
| Injured active Rowan | Mara and Rowan; alive, injured, still companions; no recovery | Concern, care, resolve without certainty | Invents lasting loyalty and guaranteed recovery |

Review complete sentences, correct people, retained outcome, identifiable
feeling, unsupported history, and repetition separately. These three spot checks
cannot establish general literary quality. Do not call a candidate an improvement
solely because it loads, returns text, or has more parameters.

## Player-facing constraints

A candidate that improves these scenes still remains experimental. Any new
download needs an explicit action and an accurate size disclosure. Retain the
existing writer/cache as a usable choice; switching must not silently delete it.
Generation stays inside the browser, with no prompt traffic after assets load.
Verify offline restoration after disposing the worker. Preserve background
generation, safe-break scrolls, reading controls, and independent pause ownership.
Persistent feelings, remembered callbacks, and multi-scene arcs remain separate
backlog work; a model change does not implement them.

## September 6 result: do not promote this candidate

The official [SmolLM2 360M Instruct model](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct)
at `a10cc1512eabd3dde888204e902eca88bddb4951` was tested using the actual
production client and worker with only build-time model identity substitution.
All five model artifacts were verified by exact size and SHA-256: 366,673,969
bytes, or 390,288,408 bytes including the existing runtime assets, before app
files and storage overhead. The present writer remains approximately 165 MB.

The [bounded comparison report](../tools/creative-story-probe/candidate-report-2026-09-06T23-28-10-911Z-9149546d.json)
records a 178.372-second cold load, followed by the first story hitting the
unchanged 90-second inference deadline. There were zero completed outputs and
zero generation-network requests. The browser cache-completeness check returned
false in this probe; its cause and offline restoration were not evaluated.
The run stopped on that first failure, closed Chromium, and left production
source unchanged. This is a runtime-fit failure on this test machine, **not**
a literary-quality comparison or a universal device speed estimate.

Do not change the production model based on this run. The next quality task is
one bounded alternative runtime/model comparison that can complete these same
scenes and verify cache recovery. Do not extend this failed run's budgets or
substitute generated samples for measurements. The independent v0.5.93 controls
slice remembers focus/rhythm; it does not improve the model's prose quality.

## Recovered context and council

`deja "storytelling"` recovered `[codex] history · today · 01a06835-15f` and the
recent `[codex] 03 · 2026-09-03T0` continuation. Reuse the player's request for
emotion-led, watch-first narrative and the existing cached/offline writer seam.
The runtime council's source review found that the necessary people and stakes
were already present in the failed prompts; adding health inventories or more
seed entries is not a demonstrated remedy for those instruction-following gaps.

## September 6 alternative: WebGPU candidate, capability gate not met

The next research candidate is **WebLLM 0.2.84 with
Qwen2.5-0.5B-Instruct-q4f16_1-MLC**, not another run of the failed 360M WASM
configuration. The [official WebLLM model registry](https://raw.githubusercontent.com/mlc-ai/web-llm/main/src/config.ts)
lists this model with the compiled library
`v0_2_84/base/Qwen2-0.5B-Instruct-q4f16_1_cs1k-webgpu.wasm` and estimates
944.62 MB of VRAM with its 4,096-token context override. This is a registry
estimate, not measured memory use here; the game renderer and browser require
additional resources. The model's own config declares 32,768 tokens, so a probe
must retain the explicit smaller runtime context rather than silently accepting
that larger allocation.

The [official MLC model files](https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/tree/32ff081fe7e4dfe4ffb167b94c66fdf11e02b8ad)
are pinned at `32ff081fe7e4dfe4ffb167b94c66fdf11e02b8ad`. Metadata-only inspection
reports eight weight shards totaling 277,996,288 bytes and all repository files
totaling 289,693,824 bytes. The latter is a repository-size ceiling, not a measured
download: tokenizer selection can change the requested subset, and compiled
WASM plus JavaScript runtime files add more bytes. Do not present the current
writer's approximately 165 MB disclosure for this candidate. A future probe must
also pin the runtime package, compiled-library URL and artifact hashes before
staging; the library path above alone is not an immutable identity.

Greater instruction-model capacity and GPU execution are reasons to test this
candidate, not evidence that it writes better or meets the 90-second deadline.
It needs a different isolated MLC worker; the existing ONNX identity-substitution
runner cannot load MLC weight shards. Preserve the existing 135M model and cache.
Check real WebGPU adapter/device support and f16 capability before downloading,
and do not promise compatibility with every phone or headless browser.

The [ordinary Chromium capability receipt](../tools/creative-story-probe/webgpu-capability-2026-09-07.json)
records Chromium 151.0.7922.34 on a secure localhost page, with no custom launch
flags. `navigator.gpu` existed, but `requestAdapter()` returned `null`; no device
could be requested, and adapter information, limits and f16 support were therefore
unavailable. The check finished in 1.587 seconds, requested only its localhost
fixture, and closed Chromium and the temporary server. No model weights,
inference runtime package or external resource was downloaded, and no generation
ran. This is an unavailable runtime capability in that browser, **not** a prose
quality failure or a claim that the candidate fails on other devices. Do not
force software rendering or unsafe GPU flags to manufacture a passing result.

When a normal GPU-capable browser is available, run one separately labeled
WebGPU/q4 comparison with the exact three recorded synthetic scenes, messages
and seeds above. Reuse `viewpoint-report.json` inputs, not a newly expanded
memory prompt; retain 64 output tokens, temperature zero, repetition penalty
1.08 and 90 seconds per write. After separately authorized, verified artifact
staging, allow at most 180 seconds for load, 270 seconds for the three sequential
writes, and 30 seconds for disposed-worker offline restoration: eight minutes
total, stopping on the first timeout/error and closing the browser. Block
network for generation and restoration, retaining raw/cleaned outputs, request
attempts and stage timings in a new report. Judge people, outcomes and feelings
using the existing checklist. This changes runtime and quantization, so it is
not a controlled same-runtime comparison, and a completed load is not a quality
pass. No model comparison is authorized or claimed by this research note.
