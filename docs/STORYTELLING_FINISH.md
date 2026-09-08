# Storytelling V1 — release scope and acceptance

Updated September 8, 2026 (America/Los_Angeles).

The approved small storytelling baseline is qualified in v0.5.123 on September
7, ahead of the original September 10 target. This is not completion of the
entire game backlog or a claim of universal prose quality/device support.

## Approved V1 scope — September 7

The user cut V1 to exactly these four items. These are current delivery
priorities, not replacements for historical backlog phase IDs.

- **P0-A:** one usable client-only writer, qualified on a real supported device.
- **P0-B:** three consecutive scenes that develop a recognizable emotional
  concern while keeping the same characters and current outcomes coherent.
- **P0-C:** the chosen real writer through consent, cache, background generation,
  safe-break intermission, journal and reload, preserving No LLM.
- **P1-A:** Rare rhythm must not expire queued companion first victories or
  farewells before the next allowed story opening.

P1-B's broader device-reliability work is explicitly skipped. All P2/P3
expansion, generic UI polish, additional model tiers and CI housekeeping are
outside V1. This does not remove the single actual-device and normal flow checks
needed to establish P0-A/C. V1 is not complete until all four items are delivered.

**P1-A implementation verified (v0.5.121):** captured companion milestones now
survive the Quiet/Rare cooldown, with a bounded three-minute opportunity after
the next permitted attempt. Finished prose retains its separate freshness limit.
The 66 focused director tests and a built-browser Rare farewell journey pass,
including original-source retention, delayed eligibility and phone readability.
This delivery fix is not a stronger-prose qualification.

## Current V1 status — v0.5.123

| Priority | Status | Evidence / remaining result |
| --- | --- | --- |
| P0-A | Qualified on one real GPU device | Qwen2.5 1.5B q4f16 generates readable character prose in the browser; actual-game write 23.099 seconds after a 19.080-second cached load. |
| P0-B | Qualified for the minimum V1 acceptance | One actual sequence develops worry → relief with care → affection at farewell, retaining the people and current outcomes. Solo prose is readable and isolated, but emotionally thin. The built-game continuity wiring check also passes. |
| P0-C | Qualified via linked real-game checks | Actual consent, saved-model load, background DM/write, safe scroll, exact journal entry, cache-only return and advancing No LLM reload passed. See the interrupted-control limitation below. |
| P1-A | Shipped in v0.5.121 | Rare-mode companion milestones survive the next permitted story opening. |

**All four approved V1 items now meet the scoped baseline.** 242 focused tests,
strict browser-spec types, version/boundary checks and the production build pass.
The single existing built-browser continuity journey passes in 28.7 seconds
(1.5 minutes including build/setup): saved prior scene/prose reaches the writer,
foreign/future history is excluded, exact source attribution is archived and
the 320px Journal remains readable. Its supplied response proves wiring, not
literary quality; the separate real-model sequence provides that limited evidence.
No new panel, model download, inference call or archive/save migration is needed.

The GPU check used this machine's Intel UHD 620/Gen-9 adapter, with shader-f16
and explicit Linux headless GPU flags. It is not a claim about default browser
support everywhere or the user's PC speed. Model/config/tokenizer assets total
875,705,761 bytes; runtime assets are additional. Startup says about 900 MB,
and this is still opt-in. The old 135M files are not silently deleted or reused
as the larger model. No server inference or bundled model weights were added.

The [first game receipt](../tools/creative-story-probe/webgpu-game-report-2026-09-08T03-04-08-450Z-74c3980a.json)
proves the generated story and its presentation. The
[cache/cancel continuation](../tools/creative-story-probe/webgpu-game-report-2026-09-08T03-16-33-976Z-3e3e547f.json)
restored the model cache-only in 20.422 seconds and terminated a real pending
write when Off was selected. The
[final No LLM continuation](../tools/creative-story-probe/webgpu-game-report-2026-09-08T03-28-03-637Z-ab8f8509.json)
passed 44 checks in 24.762 seconds: unchanged actual journal, same campaign,
advancing play and reload, zero creative workers/calls, zero external requests,
and complete owned-process cleanup. No story was fabricated or regenerated
to complete these linked checks; source/build and prior receipts were verified.

These are linked segments, not a falsely reported uninterrupted journey. The
first harness hit a hidden Pause selector; the second timed out waiting for
the Options Close button to become clickable after Off. The latter's cause is
unconfirmed. Immediate same-page Close responsiveness was not qualified by the
final reload-only check. Broader device reliability remains outside V1 scope.

**v0.5.125 control follow-up:** a separate, directly reproduced layout defect
took Options' Close button offscreen when advanced settings were scrolled. The
header now sits outside one bounded scroll body. A real-pointer browser check
failed before the change, then passed after it at 960px and 320px: Close remains
visible and hit-testable, Off terminates one pending mock writer, Close restores
visible focus, and No LLM play advances with unchanged journal content. This
tests the actual UI/controller with mocked inference, not GPU timing. The older
GPU timeout's cause remains unconfirmed; no runtime change or device matrix was
substituted for that missing evidence.

The v0.5.122 [four-scene receipt](../tools/creative-story-probe/webgpu-v1-report-2026-09-08T02-57-33-229Z-50b7719f.json)
preserves the earlier failed farewell and its rejection. v0.5.123 keeps each
selected story's existing journal location/headline, reconstructs alternating
earlier-scene/prose turns, and puts the current public facts last. Older text-only
memories remain supported with explicitly unavailable scene details. No new
emotional-state store, model call, archive schema or game authority is added.

The [new actual sequence](../tools/creative-story-probe/webgpu-v1-report-2026-09-08T04-35-07-729Z-8907eba1.json)
returned four accepted passages with memory counts 0/1/2/0 and no duplicates.
Road: trembling and worry for injured Rowan. Arrival: relief with continuing
concern, with the journey completed and injury retained. Farewell: affection
makes saying goodbye painful rather than returning to the unfinished road.
“Like a brother” is an imagined relationship comparison, not invented biological
kinship. The journey testing their bond interprets the supplied shared journey,
not a separate fabricated event. Council passes the deliberately small
three-scene emotional-continuity acceptance, not a universal quality claim.

Cached load was 19.954s; writes were 30.248/29.620/35.558/22.113s. Input counts
194/320/394/180 stayed inside the 1024-token context. No external request was
attempted, and all owned browser/model resources closed. The probe now resets
chat before every write like production; earlier probes did not. That fidelity
correction and paired history changed together, so their individual causal
contribution is not isolated. Judge accepted text, not discarded trailing prose;
`complete` alone still does not mean a literary pass.

The v0.5.123 editorial limitations were explicit: arrival's “worry latched onto
Rowan” is awkward and slightly overstates the provenance of the injury; solo
Inez was readable scenery rather than meaningful inner life. These did not
close broader storytelling aspirations, but do meet this release's solo
readability/isolation minimum. Do not extend V1 into a new model tier, emotion
simulator or broad reliability matrix to erase all stylistic imperfection.

## v0.5.124 — solo opening refinement

With no active companion and no selected valid earlier passage, Inner life now
turns the hero's first recorded value into an imagined tension, then asks for a
feeling about the current action and a revealing gesture. It explicitly avoids
implying unrecorded earlier visits or relationships. Empty values retain the
generic fallback. Continuing stories (including farewell), active-companion
prompts and Scene focus are unchanged; the three qualified prompts compare
exactly with their v0.5.123 receipt. No new state, UI, model or model call.

The [first actual solo draft](../tools/creative-story-probe/webgpu-v1-report-2026-09-08T05-34-59-965Z-66a993f1.json)
had emotion but implied an unsupported earlier visit with “see old Hollow again”.
It was rejected for shipping qualification, despite passing the ordinary text
and character gates. One targeted current-action revision produced the
[final actual sample](../tools/creative-story-probe/webgpu-v1-report-2026-09-08T05-37-54-062Z-ae5e6e65.json):
Inez's curiosity competes with unease, followed by a hesitant pause beside a
tree. Possible dangers are her uncertainty, not an asserted encounter; no prior
visit, companion, injury or arrival is invented. Council passes a modest emotional
improvement, not polished or universally reliable prose. “Curiosity peaks” and
the long first sentence remain awkward. No words were stripped or substituted.

The final cache-only load took 18.071s and the write 27.568s, with 204 input
tokens and zero selected memories. Both independent manual runs had zero external
requests/errors and complete owned-resource cleanup. This is the same explicitly
configured Intel GPU device, not new browser coverage. Only curiosity received
this actual-model qualification; the four value branches, fallback and boundaries
are covered by 248 focused tests across six narrator files. The existing probe's
solo-only switch avoided rerunning the unchanged relationship sequence. No new
CI matrix or browser/UI journey was added for this prompt-only refinement.

## September 8 — injured-arrival candidates not promoted

Two bounded candidates targeted the earlier arrival's ambiguous worry and
unsupported injury provenance. Neither changed models, memory selection,
sampling, facts or non-arrival prompts, and neither is shipped.

- [Explicit relief/gesture rewrite](../tools/creative-story-probe/webgpu-v1-report-2026-09-08T07-32-43-530Z-8bf844e3.json):
  no injury cause was invented, but arrival's vague tear/“beside them” and
  farewell's mechanical “active companion” plus repeated sadness were not a net
  storytelling gain. Council rejected promotion despite three accepted outputs.
- [Original brief plus an injury-cause boundary](../tools/creative-story-probe/webgpu-v1-report-2026-09-08T07-42-02-220Z-39bb32e5.json):
  arrival improved to a smile and “We made it” beside still-injured Rowan.
  Farewell then returned control-bearing gibberish, with `cleaned: null` and
  `archived: false`. Its cause is unconfirmed; prompt or GPU causation is not
  established. Council rejected the sequence, not just its final wording.

Each cache-only run intentionally stopped after road/arrival/farewell: three
of four planned fixtures, with 0/1/2 actual memories. The unchanged solo fixture
was not rerun. Loads took 17.344s/21.900s; writes were 27.812/32.364/36.839s and
30.714/33.313/36.308s. Neither run attempted external requests or reported runtime
errors, and both closed all owned resources. An empty error list and `complete`
do not make unusable prose successful. Discarded trailing text is not credited.

The production prompt was restored exactly. Two cases added to the existing
controller/director admission test replay the actual bad reply: no model story
reaches archive/presentation callbacks; authored recovery follows its setting;
the next supplied valid response succeeds without reloading. These mocked-response
checks do not reproduce or diagnose the GPU failure. All 130 tests across the
two affected narrator/controller suites pass. No runtime version bump, new
harness or broader reliability project follows. The earlier bounded V1 pass is
retained, not expanded into a guarantee that every generation succeeds.

## v0.5.126 — an idle worker failure can be retried

A native worker error/messageerror between requests cleared client readiness
without settling any promise, so the controller stayed ready and hid both retry
controls. The client now notifies the controller after that idle teardown. The
controller publishes its existing failed state immediately, including while
paused in Options. Explicit Retry LLM creates a replacement writer using any
saved files; no background reload or download is added. Pending errors, timeout
and manual Off keep their existing paths. Retired workers cannot fail a newer
writer, and a failure during asynchronous cache confirmation cannot publish ready.
Existing journal content and playback preferences are unchanged.

202 focused client/controller/director tests pass. One built-browser journey
passed in 33.8 seconds: an idle error while paused in Options exposes Retry;
the native phone-width Retry click loads exactly one replacement; a subsequent
story reaches the scroll and journal while the prior entry remains exact.
No external request or page error occurred. The 320px recovery screenshot was
viewed, and the owned preview/browser closed. Inference and the worker error are
supplied browser fixtures, not a claim of reproducing a spontaneous GPU crash.
Strict browser-spec types, version/boundary checks and the isolated production
build pass. The initial anchored test selector found no tests; the corrected
selector ran the journey above without rebuilding unchanged code.
Unrelated local ledger edits remain excluded; the local build is not claimed
byte-identical to the clean release CI build.

This fixes a source-proven P0-C integration bug, **not** the earlier garbled
farewell. A separate source audit found that the manual prose probe uses a proxy
engine without production's registered pass-through logit processor, and consumes
the full output cap rather than production's two-sentence interrupt/drain path.
The pinned runtime performs extra GPU/CPU transfers and synchronization for that
processor even when values are returned unchanged. No evidence identifies either
difference as the garbling cause. Any next prose qualification should reuse the
actual production worker/client; no further prompt trial or model change was made.

## v0.5.127 — reject isolated-letter drafts in every focus

The manual production modes now reuse the actual client and worker, including
cache-only loading, conversation adaptation, per-operation reset, registered
processor, sentence interruption, stream draining and deadlines. Root and staged
WebLLM package versions and runtime bytes must match. Receipts hash these sources
and distinguish actual client-returned text from the legacy full proxy stream.
Worker token usage/first-token timing/finish reason are unavailable, not invented; recorded
model-role messages are a reconstruction, not observation of internal overflow
handling. This qualifies the writer path, not another full DM/UI game journey.

The [unchanged actual-worker baseline](../tools/creative-story-probe/webgpu-v1-report-2026-09-08T09-31-18-400Z-d6a50611.json)
returned exactly the earlier qualified road, arrival and farewell passages.
Cached load was 17.605s; writes were 23.917/23.610/28.838s. This confirms those
bounded results through production's worker, not universal proxy equivalence.

One [actual-worker arrival candidate](../tools/creative-story-probe/webgpu-v1-report-2026-09-08T09-35-34-796Z-bca127e5.json)
replaced only the arrival's worry clause with the hero's continuing concern for
the still-injured companion. Arrival clearly assigned Mara both relief and worry,
without inventing the injury's origin. Farewell then returned
`G!!G'!!!!!!!!!!!!!!!G`. Council rejected promotion and the original prompt was
restored exactly. Load was 18.487s; writes were 25.654/26.716/25.559s. Both runs
intentionally stopped after three of four fixtures, with 0/1/2 real memories,
zero external request attempts/runtime errors and complete owned cleanup.
The unchanged solo fixture was not rerun. These are the same explicitly configured
Intel GPU, not expanded device qualification. No further prompt trial followed.

In this new failure, cleaning returned non-null noise; the character-name gate
kept it out of the journal. Source and failing regression checks showed that
Scene focus and an absent viewpoint could admit the same noise because they
intentionally have no name requirement. The shared cleaner now requires two
adjoining Unicode letters (allowing combining marks) somewhere in the retained
passage. It checks after sentence extraction, so a discarded tail cannot rescue
it. Short prose such as “Oh!” and “I? Go.” remains valid. This is not a dictionary,
semantic-quality check or universal multilingual rule: isolated single-letter
utterances are rejected, while other malformed multi-letter text may still pass.

328 focused tests pass, including the exact new reply under all three focuses,
quiet/authored recovery, absent viewpoint, and a subsequent valid write without
reloading. The nine initial failures reproduce the old admission/status boundary;
these supplied-response tests do not reproduce GPU inference. Existing model,
sampling, prompts, save data, story rhythm and UI remain unchanged. No new
browser matrix or GPU workload is needed for this text-admission fix. Version,
source-boundary and syntax checks plus the isolated production build pass. The
local build includes preserved unrelated ledger edits; they are excluded from
the feature commit, so it is not claimed byte-identical to clean release CI.

Production-path garbling rules out a proxy-only explanation for this observed
failure, but does not establish prompt, numerical or GPU causation. The next
bounded storytelling task is to inspect that generation boundary with the exact
failed input before making another prose candidate. The scoped V1 baseline is
retained with this limitation; broader quality aspirations remain unfinished.

## September 8 — bounded numerical replays

The existing prose processor now has a manual-build-only observer. It returns
the original score array unchanged and records at most 64 steps per operation:
vocabulary length, NaN/infinity counts, finite extrema and sampled token ID/range.
No full vectors or prompt text are logged. Normal builds do not collect or log
these records. The processor already performed the GPU readback; the observer
adds CPU work and may affect timing. It observes before GPU penalties/softmax,
not the entire numerical pipeline. No score replacement or sampling change.

- [Cold-worker exact farewell replay](../tools/creative-story-probe/webgpu-v1-report-2026-09-08T10-33-06-190Z-a3c9d14d.json):
  17.126s saved-model load, 35.164s write, 43 finite-score steps with valid token
  IDs. The saved failed input returned the earlier road paragraph verbatim,
  not the original gibberish. The duplicate gate rejected it.
- [Same-worker recorded request sequence](../tools/creative-story-probe/webgpu-v1-report-2026-09-08T10-37-20-286Z-b2b98e49.json):
  17.194s load; writes 24.666/27.431/31.603s. The first two raw outputs matched
  the original exactly; farewell matched the cold replay's rejected duplicate.
  All 43/42/43 observed steps had finite scores and valid sampled IDs.

Each replay submitted the exact saved messages, including their actual earlier
generated memories, without substituting fresh outputs. They are fixed-input
diagnostics, not new sequential storytelling acceptance or journal entries.
Both restored cache-only, attempted zero external requests, reported zero runtime
errors and closed every owned resource. Sources and the original receipt are
hashed. Each request required its existing manual approval; no further inference
followed these two runs.

Council supports retaining reproducible diagnostics, not a numerical fix:
healthy observed scores here cannot explain the original failure, exclude
finite-valued corruption or validate downstream softmax/sampling. The duplicate
is a prose/coherence failure, not successful narration. No new prompt, model,
runtime version or numerical sanitization was promoted. Further investigation
must obtain new evidence at the unobserved sampling boundary if needed; repeating
these runs or adding a broad device matrix is not the next action.

An upstream [Intel/Vulkan report](https://github.com/mlc-ai/web-llm/issues/356)
involved a different model/device and explicit memory/buffer errors absent from
these receipts. It is not our diagnosis. The official
[processor interface](https://github.com/mlc-ai/web-llm/blob/main/src/types.ts)
was checked against the installed pinned 0.2.85 implementation rather than
assuming current upstream behavior.

255 focused tests, version/source-boundary and syntax checks, and the normal
production build pass. The built worker contains neither the numeric collector
nor its diagnostic log marker. Tests cover opt-in/off wiring, unchanged returned
scores/prose, nonfinite counting, sampled-ID bounds, reset and the 64-step cap.
No new UI/browser journey or CI matrix was added. Unrelated local ledger edits
remain excluded from the commit; the local bundle is not claimed byte-identical
to the clean CI build. Player-facing version remains v0.5.127.

## Post-V1 — continuation briefs not promoted

The user continued after the proposed stronger-emotional-continuity milestone.
This opens a bounded editorial follow-up, not the rest of P2/P3. Two candidates
changed only named-character continuations with valid earlier prose: active
Shared road, Scene, solo openings, memory selection and runtime settings stayed
unchanged. Both used the actual production client/worker and its owned cached GPU
profile. Road and arrival reproduced the qualified baseline exactly in both runs.

- [Earlier-feeling-first brief](../tools/creative-story-probe/webgpu-v1-report-2026-09-08T17-31-16-233Z-b53340ac.json):
  farewell copied the entire earlier unfinished-road paragraph. The existing
  duplicate gate rejected it; no new farewell was archived. Load 16.776s;
  writes 24.338/23.259/30.322s. This fails both current outcome and continuity.
- [Current-outcome-first revision](../tools/creative-story-probe/webgpu-v1-report-2026-09-08T17-36-57-244Z-333e9771.json):
  farewell was fresh and technically accepted, but read:

  > Mara's face hardened as she gazed at the fading oaths, a mix of relief and lingering worry. The journey to Greyford had tested their trust and loyalty.

  Relief and lingering worry carry an emotional thread, but the actual goodbye
  and Rowan's personal significance disappear. “Fading oaths” is abstract and
  the second sentence remains a generic journey summary. Council rejected this
  as a net improvement over the clearer baseline goodbye. Load 16.982s;
  writes 23.552/23.482/28.778s. Technical acceptance is not editorial qualification.

Each run intentionally stopped after three of four fixtures, with 0/1/2 actual
memories. No canned prior prose was substituted, no external request was
attempted, no runtime error was reported, and every owned resource closed. The
unchanged independent-solo fixture was not rerun. Candidate scope tests passed
(130 before extra coverage, 134 after), but did not establish better writing.
The experiment's production and test edits were restored exactly; receipts keep
the precise candidate prompts. No runtime/version/model/guard change is shipped.
This does not explain the earlier garbling or establish universal model quality.

The queued farewell-subject follow-up was subsequently evaluated below. It did
not qualify for promotion; do not repeat either set of unchanged prompt trials.

## Post-V1 — farewell-subject trials not promoted

Reused the queued task above and the existing canonical farewell projector;
`deja "farewell subject grounding"` found no additional session. The candidate
carried the captured departing name into both the writing subjects and existing
name check, without inventing an active companion. Source identity, safe names,
solo viewpoint and the exact canonical farewell headline were checked. Historical
oath details stayed outside the model prompt. Current-scene alternatives and
Scene focus retained their prior behavior; no canonical state or new UI was added.

Two actual production-worker, cache-only trials were editorially rejected:

- [Names-only grounding](../tools/creative-story-probe/webgpu-v1-report-2026-09-08T18-45-37-696Z-f01916f1.json)
  retained both people and continuing concern, but missed the goodbye:

  > Mara's heart ached with both pride and concern. The shared road oath was firm, but she worried about Rowan's injuries.

  The ongoing-sounding oath is ambiguous after its completion. This passed text
  admission and entered the isolated probe journal, not the user's game. It is
  not a stronger farewell than the qualified baseline. Load 17.108s; writes
  23.945/23.544/27.016s.
- [One farewell-specific revision](../tools/creative-story-probe/webgpu-v1-report-2026-09-08T18-52-39-019Z-035b4240.json)
  asked for care during goodbye and uncertainty about being apart. It copied the
  earlier unfinished-road paragraph exactly. The existing duplicate check
  rejected it and no farewell was archived. Load 17.020s; writes
  23.508/23.373/30.903s. No third trial was run.

Road and arrival reproduced the existing baseline exactly in both runs. Each
used 0/1/2 actual generated memories and stopped intentionally after three of
four scenes, with no runtime errors or external request attempts and complete
owned-resource cleanup. The synthetic farewell headline was aligned with the
game's canonical format and a synthetic source packet was added for these trials.
This is fixture alignment plus source/brief wiring, not isolated attribution to
one prompt phrase. It remains one supported GPU setup, not broader device proof.

270 focused unit tests passed on the final candidate (including the corrected
brief expectation). Before the brief revision, both existing built-browser
farewell journeys passed in four minutes: real game projection, DM/Rare selection,
both named subjects despite a solo party, exact model-attributed Journal/scroll,
Last story and 320px readability. Their supplied responses prove wiring, not
literary quality; the final revised brief was not separately browser-qualified.

All candidate runtime, tests and probe sources were restored exactly. Version
stays v0.5.132. The [final experimental runtime patch](../tools/creative-story-probe/farewell-subject-candidate-2026-09-08.patch)
is retained only for inspection/reuse; it excludes tests and probe fixtures and
must not be treated as promoted code. `git apply --check` verified it against the
restored source without applying it. The receipts retain exact inputs/outputs.

The queued destination-context approach was subsequently evaluated below.
Context interference remains a hypothesis, not an explanation of earlier garbling.

## Post-V1 — farewell context trials not promoted

Reused `deja "farewell context selection"` session `01a06835-15f`, the previous
council handoff and commit `a51ae37`. The implementation selected the newest
already-eligible destination passage naming the captured departing companion.
Missing metadata/name/source matches, ordinary solo and Scene kept their existing
selection. Literal full-name matching was deliberately conservative. Only prompt
history narrowed: the full captured selection still rejected old-road copies,
including typography-only variations. Stored Journal and canonical state stayed
unchanged, and alternate-current requests did not inherit farewell context.

- [Context-only trial](../tools/creative-story-probe/webgpu-v1-report-2026-09-08T19-34-05-614Z-d89bd971.json):
  all public facts, system instructions and the final current-scene prompt matched
  the qualified production baseline exactly. Only farewell history narrowed from
  two actual passages to arrival alone. The fresh result was:

  > Mara's heart ached with a silent hope, hopeful but also filled with worry about Rowan. Her loyalty to him remained unwavering, but her compassion for his injuries strained against the burden of their shared journey.

  Named care persists, but it does not develop a recognizable reaction to
  separation and the wording is repetitive. Council did not qualify this as a
  better farewell. Cached load 16.752s; writes 23.904/23.549/25.525s.
- [One combined follow-up](../tools/creative-story-probe/webgpu-v1-report-2026-09-08T19-44-16-202Z-7260991d.json):
  the same arrival-only context gained the previously written goodbye/separation
  brief, only when a source-verified destination passage qualified. Current facts,
  original headline and hero-only final subject remained unchanged. The result:

  > Mara's heart ached as she watched Rowan slip away from Greyford, their shared-road oath finally fulfilled. The road ahead was uncertain, but Mara vowed to follow through on their promise.

  Goodbye is now recognizable, but Rowan explicitly remains in Greyford in the
  current facts. Moving him away contradicts that outcome, and a renewed promise
  reopens the completed oath. Council rejected it. Load 16.986s; writes
  24.697/23.536/24.365s. No third trial was run.

Both actual-worker runs reproduced the unchanged road and arrival exactly,
retained full-history counts 0/1/2 and recorded prompt-history counts 0/1/1.
The synthetic packet enabled the existing source-bound path without changing
any public fixture fact; it was not presented as recorded gameplay. Both stopped
at three of four scenes, made no external request attempts, reported no runtime
errors, and closed all owned resources. Both farewells passed technical admission
and entered only the isolated probe journal; neither entered the user's game or
became an editorial pass. The pinned model/runtime/sampling were unchanged.

134 selector/controller tests passed for the first candidate; 241 focused tests
across five suites passed for the combined candidate. Browser-spec types passed.
The existing DM-farewell browser journey was extended to assert real source
projection, two selected memories versus one prompt memory, unchanged archive,
exact facts/model attribution and mobile readability. It was intentionally **not
run** after the real-model failure; supplied-response UI proof would not fix prose.

Runtime, unit/browser tests and probe source were restored exactly. Version stays
v0.5.132. The [complete experimental patch](../tools/creative-story-probe/farewell-context-candidate-2026-09-08.patch)
retains the final implementation, tests and probe changes for inspection/reuse;
it is not promoted code or an instruction to retry it. `git apply --check`
verified recoverability against restored source without applying the patch.

**Stop this prompt-only tuning loop.** The recent six continuation/farewell
candidates have not established a reliable improvement. The previously qualified
V1 remains available; its imagined brother-like simile is not a biological-kinship
claim, and this review does not revoke that baseline acceptance. A next experiment
should require the user's decision about the previously deferred stronger
browser-local model evaluation, with fixed scenes and resource limits. Greater
model size does not guarantee success. These results do not establish the cause
of earlier garbling; no further variant or model download is authorized here.

## Post-V1 — stronger local model evaluation

Reused `deja "stronger browser local model"` session `01a06835-15f` and the
four-scene actual-worker probe. The latest continuation after the explicit
evaluation question was treated as approval for one bounded model evaluation;
this assumption was stated before work. Other deferred expansion remains closed.

Preflight excluded Qwen2.5 3B because its [research license](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/blob/main/LICENSE)
is not a straightforward public-game replacement. No 3B weights were fetched.
The selected [Qwen3 4B model](https://huggingface.co/Qwen/Qwen3-4B) is Apache-2.0.
Its [pinned MLC files](https://huggingface.co/mlc-ai/Qwen3-4B-q4f16_1-MLC/tree/a5c9fab855e3ccbdfed2e7e69683d75f30332161)
and [compiled library](https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/025bcaf3780fa8254f5e5efd3bfea0a5397248f4/web-llm-models/v0_2_84/base/Qwen3-4B-q4f16_1_cs1k-webgpu.wasm)
total 2,280,372,422 logical artifact bytes, excluding runtime JS and transport/
storage overhead. The [WebLLM registry](https://github.com/mlc-ai/web-llm/blob/v0.2.85/src/config.ts)
estimates 3431.59 MB VRAM at context 4096; actual memory at our context 1024 was
not measured. Model size and registry support are not quality evidence.

Only the isolated manual build substitutes the model manifest and adapts the
real worker for Qwen3 non-thinking mode. Installed WebLLM 0.2.85 prepends the
literal empty `<think>` header to returned output and counts it against the
token ceiling. Pinned tokenizer metadata measured its IDs as
`[151667, 271, 151668, 271]`; digit labels remain `16/17/18`. The adapter removes
only that exact leading empty header, retains the original raw result separately,
and uses 68 runtime tokens for the original 64 generated-token budget. Actual
thinking or arbitrary markup is not stripped. The original worker source,
prompts, public facts, continuity/cleaner/duplicate checks and live model remain
unchanged. The receipt explicitly identifies and hashes the transformed worker;
this is not an unmodified-production-model or full-game proof. The one-token
DM adapter is source-tested but was not exercised by this prose-only run.

The [actual receipt](../tools/creative-story-probe/webgpu-candidate-report-2026-09-08T22-39-25-104Z-700078b2.json)
records a 127.271-second cold load and 64.809-second first write. After the exact
empty header, the entire client result was:

```text
!!!!!!G!!!!!!!!"!!!!!!!!!!!!!!!!!G!!!!G!!!!!!!!!!!!!!!!!!!
```

The raw header-bearing response already contains this noise; no lost story was
hidden by the adapter. `cleaned` is null, `archived` is false, and no second scene
was attempted. The run attempted one of four planned scenes, then stopped. All
worker/browser/server cleanup completed, with no runtime error reports or
external requests after load. `complete: true` means execution/cleanup finished,
**not** a qualified story. The run used this machine's explicit Linux Intel
UHD 620 WebGPU configuration, not a new device-coverage claim.

Council rejects promotion. Eight focused tests cover explicit run/network modes,
exact pins, source-limited substitution, unchanged historical probe modes and
header handling. The manual mode is reusable tooling; production remains
v0.5.132. No weights enter git or the Pages artifact, no inference server is used,
and the separate owned candidate cache is retained. No additional model, prompt
trial or CI matrix was added. A bounded investigation of the retained candidate's
adapter/runtime output boundary is the next technical item; the cause and remedy
are still unknown. This result does not establish Qwen3's general literary ability.

## Post-V1 — candidate sampling diagnostic

Reused `deja "Qwen3 candidate garbling"` session `01a06835-15f`, the saved
candidate cache and immutable failed receipt `700078b2`. The manual
`--run --candidate-diagnostic --cache-only` mode takes only that receipt's first
request unchanged, with a 180-second load limit, 90-second write limit and
10-minute total ceiling. It cannot download, continue to another scene or archive.
No production source, model, prompt or sampler changes.

The tool-only observer summarizes existing CPU logits before/after the processor
and adds a probability readback to the sampling step's existing synchronization.
It records no full vectors and caps observations at 64. No scores, random values
or selected tokens are changed; extra readback can affect timing. Exact source
markers and root/staged runtime paths limit the in-memory build transformation.

The [actual cached diagnostic](../tools/creative-story-probe/webgpu-candidate-report-2026-09-08T23-37-52-791Z-b4e34b8d.json)
reproduces the earlier request and client text exactly. Load **38.658s**, write
**55.694s**. All 64 input/output processor summaries match and contain finite
scores. All 64 probability arrays fail normalization, 17 contain positive
infinity, and six sampled IDs exceed the 151,936-entry vocabulary. First logits
and probabilities are all zero; finite probability sums never exceed 0.01185.
The cleaner rejects the result and the Journal stays empty. Only three localhost
bootstrap requests occurred; no external request was attempted. All owned
worker, browser/context and server resources closed.

This establishes invalid numeric data in the candidate execution, **not its
precise cause or a fix**. Score observation follows GPU-to-CPU copying, and the
probability copy follows sorting/sampling. They cannot yet distinguish computation
from transfer or later buffer interaction. Council source review found no
observer aliasing or missing synchronization. Do not normalize invalid values
into plausible output or infer a model-capacity limitation.

The subsequent [zero-token transfer check](../tools/creative-story-probe/webgpu-candidate-report-2026-09-08T23-49-12-827Z-c6b52717.json)
uses `--run --candidate-transfer-check --cache-only`: load-only, 180-second load
and five-minute total ceilings, no scene loop. Known float32 arrays of 64 and
151,936 elements and one int32 value pass all three paths: JS→CPU, CPU→GPU→CPU,
and JS→GPU→CPU. Every comparison is bit-exact using both direct CPU memory and
the runtime's `toArray()` conversion. All 15 temporary tensors were synchronized
and disposed. Checks took **622ms**, cached load including checks **39.407s**,
total **56.329s**; no generated tokens, external requests or errors, complete
owned-resource cleanup.

The transfer result does not reproduce a general byte-copy/conversion failure;
it does not prove live model-buffer lifetime, compiled kernels or device behavior
correct. Next isolate known finite logits through the already-loaded softmax
before sorting/sampling, without new models or prompt trials. No third GPU run
was performed in this slice. All **24 focused tests** pass; these are manual-tool
contracts, not a new CI matrix or storytelling qualification. The live narrator
stays v0.5.132, with no runtime package or production-file changes.

## What already works

The client-only pipeline already has explicit LLM/No LLM startup, reusable model
cache, background writing, current public scene facts and two earlier imagined
passages, moment/stage selection, safe-break intermissions, and a persistent
Narratives archive with readable and JSON exports. Do not rebuild these systems.

The remaining aspiration beyond the qualified small baseline is consistently
interesting, connected prose. Historical 135M/360M trials did not demonstrate
it, and Qwen/wllama on single-thread CPU did not return prose within its deadline.
The current GPU writer has a bounded continuity pass, not universal quality.
More seed volume, UI polish, metadata or completed calls alone do not close that gap.

## Historical CPU decision — not the current writer

The earlier first candidate was [Qwen2.5-0.5B ONNX](https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct/blob/cc5cc01a65cc3ff17bdb73a7de33d879f62599b0/README.md)
through the existing Transformers.js/ONNX Runtime worker, not the failed wllama
path. Its [pinned manifest](../tools/creative-story-probe/candidate-qwen25-05b-onnx.json)
contains 519,136,456 model/config/tokenizer bytes; the existing runtime adds
23,614,439 bytes, about 543 MB total. Download size is not peak RAM. Start with
one compact injured-companion scene in a fresh disk-backed browser profile,
offline during writing, with the existing 90-second write limit. Stop and read
the result before further scenes. Compatibility and quality are not assumed.

**September 7 decision:** that [one actual trial](../tools/creative-story-probe/candidate-report-2026-09-08T01-09-54-396Z-ac9e04ca.json)
reached the 180-second loading timeout before generation. The entire run took
3 minutes 35 seconds, with zero story outputs and complete owned-process cleanup.
Do not promote it or repeat this CPU setup. This is a load-budget failure on the
tested machine, not a measured prose-quality verdict or proof about the user's
device. No player-facing writer upgrade shipped from this trial.

**Updated device finding:** ordinary headless Chromium exposed no WebGPU adapter,
but a separate September 7 check with Chromium's documented Linux GPU flags
exposed this machine's real Intel Gen-9 adapter (not a fallback adapter), including
shader-f16. A compute shader returned the expected value and the browser closed.
This enables one WebLLM GPU writer trial; it does not establish model quality or
ordinary no-flags browser compatibility. Qualify the actual story output before
promotion, and do not substitute another CPU timeout for that check.

## Delivery order

1. **By September 8: choose and integrate one viable writer.** Try one materially
   different supported client runtime/model route, using the existing public
   injured-companion road/arrival scenes and actual earlier generated prose.
   Read the words before promoting it. Preserve current No LLM behavior and the
   existing cache; a larger model needs its own size-aware opt-in and cache.
   Measure initial load separately from ordinary background writes. If a device
   cannot run the candidate, report that clearly rather than freezing play.
2. **September 9: make one concern develop across scenes.** Demonstrate worry on
   the road, relief mixed with continuing care at arrival, and a later emotional
   consequence. Current people and outcomes stay authoritative. Reuse the
   journal and selected excerpts first; add a small explicit throughline only
   if actual good prose shows that recall alone is insufficient. No general
   emotion simulator or relationship graph is required for this release.
3. **September 10: watch, reread, reload, ship.** Play the complete loop with the
   chosen writer: background generation, safe scene break, readable scroll,
   Journal retention, reload/cache reuse and No LLM. Check phone and desktop
   readability once on the finished slice. Fix blockers, commit and push each
   player-facing upgrade, verify Pages, and stop adding features.

## A small acceptance check

Read three consecutive character scenes and one solo scene. This is an explicit
human spot check, not a claim of universal literary quality or a new CI matrix.

- A present concern is recognizable, expressed through a thought or gesture,
  and changes because the next scene happened; it is not just a factual recap.
- The reader can recognize the same hero and companion. Injury, arrival,
  presence and survival do not contradict the supplied scene. Imagery and
  imagined feelings are welcome; fabricated established history is not.
- Later prose develops an earlier concern without copying the prior paragraph
  or starting an unrelated biography. Not every sentence must repeat every fact.
- The solo scene is also readable. The game does not depend on a companion
  being present to tell an interesting moment.
- The existing background/cutscene/archive loop presents those actual accepted
  words. Authored recovery remains honestly labeled and is not counted as a
  successful model-generated story.

## Stop rules and scope control

- No unchanged model/prompt/runtime reruns after a clear failure. Keep one
  short receipt with the actual text, timings and verdict; reuse current tools.
- Do not add a new benchmark framework, overnight soak, seed library, HUD,
  model-training project, or cloud inference dependency to finish this slice.
- Qualify the intended device path. A failed slow CPU run cannot establish
  whether a real GPU device works, and software GPU results cannot establish
  hardware performance. An actual target-device check is needed for that claim.
- If no candidate is usable by the first day's decision point, state the
  remaining device/download tradeoff and ask for a release choice. Do not spend
  the remaining days silently repeating experiments or call authored stories
  a completed LLM upgrade.
- Defer campaign-long emotional memory, multi-member party relationships,
  larger story libraries and further UI simplification until this release works.

Context reused: local recall `deja "storytelling"`, session `01a06835-15f`,
and the actual [writer trial receipts](../tools/creative-story-probe/README.md).
