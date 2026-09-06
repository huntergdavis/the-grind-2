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
