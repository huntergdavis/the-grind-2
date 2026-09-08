# The Grind 2 — Red-Team Council Report

Status: final council adjudication, 2026-08-28

## Post-V1 council — farewell-subject trials rejected

Reused the previous council's queued source-grounding slice and canonical
`src/ui/farewell-remembrance.ts` projector; `deja "farewell subject grounding"`
found no additional session. Independent review found no wiring blocker:
source-bound departing names did not create active party members, old oath
prompt data, cross-scene inheritance or canonical emotions. Scope was retained
injured-alive farewells, not every departure.

Actual production result `f01916f1` preserved names/care but missed goodbye and
described the completed oath as firm. A single targeted goodbye/separation brief
in `035b4240` copied the earlier road paragraph exactly and was not archived.
Both are rejected, despite 270 final-candidate unit passes and two earlier
names-only built-browser journey passes. The synthetic headline also changed
to the canonical format, so causal claims cannot isolate one prompt phrase.
Both cached-GPU runs closed cleanly after three scenes with no external requests.

Runtime, tests and probe edits were restored, not replaced by a guard-only
feature. [Exact receipts and reusable experimental patch](docs/STORYTELLING_FINISH.md#post-v1--farewell-subject-trials-not-promoted)
are retained; the live version remains v0.5.132. No further trial this turn.
Next, test farewell-specific selection of the latest relevant destination prose
alone, with existing selection as fallback, unchanged prompts/model/facts and
no stored-history rewrite. Context interference is only a hypothesis; earlier
numerical-looking failures remain unexplained. P1-B/P2/P3 stay deferred.

## Post-V1 council — continuation-only prompt trials rejected

Reused `deja "continuing emotional arcs"` session `01a06835-15f` and the actual
worker baseline `d6a50611`. The user continued after the proposed post-V1
emotional-continuity milestone. Scope stayed at one brief for named-character
continuations with valid memory, not new models, state, panels or broad tests.

Council found no prompt-boundary blocker, but rejected both actual results:
`b53340ac` copied the unfinished road at farewell; `333e9771` avoided repetition
but lost Rowan and the goodbye in abstract oath imagery and a journey summary.
The second improved the explicit feeling pair, not the whole narrative. The
baseline is clearer and more personal. Prompt ordering is a hypothesis, not
established causation. No third trial or unchanged rerun was authorized.

Both owned cached-GPU runs closed after three scenes, with unchanged road/arrival
outputs, 0/1/2 actual memories, no external requests or runtime errors. Candidate
unit tests passing did not overrule literary rejection. Production and test edits
were restored exactly; player version remains v0.5.132. The receipts and
[measurements](docs/STORYTELLING_FINISH.md#post-v1--continuation-briefs-not-promoted)
are retained. Next work is bounded farewell-subject grounding using the existing
public capture, not another generic emotional brief or a guard-only substitute.

## Periodic v0.5.132 council — activation waits for saved-model removal

Reused `deja "storytelling remaining backlog"` scope decisions from sessions
`01a06835-15f` and `2026-09-03T0`; the narrower removal search found related
writer history in `2026-09-07T1`, not an existing fix. With the queued v0.5.131
task complete, a bounded audit found the shared Storytelling selector could
persist With LLM while `load()` refused to start during removal. The advanced
load button was already disabled. Council confirmed this as a concrete P0-C
delivery defect, without reopening deferred P1-B/P2/P3 work.

Main now derives removal from the existing off/busy snapshot, disables shared
activation controls only then, and shows removal progress. A late selector
change is ignored and restored to the actual preference. The controller and
cache-deletion implementation are unchanged; success or failure restores the
controls without loading a writer. Loading/writing still permit No LLM.
105 controller tests pass, including both deferred-removal outcomes followed
by explicit loading. The old built-browser regression failed on the enabled
selector while pinned fixture-cache deletion was pending.

Final council review found no blocker. Both 320px built-browser journeys pass
in 1.4 minutes total: blocked activation leaves the saved mode untouched, play
continues during deletion, both outcomes restore the controls, and explicit
reactivation delivers a fresh archived scroll while retaining the original
journal entry. Tiny seeded cache fixtures and supplied writer replies test
plumbing, not real GPU reload or prose quality. The progress screenshot is
readable with Close in reach. Browser-spec types, version/boundary checks and
production build pass. No real model files or unrelated user edits were removed.

## Periodic v0.5.131 council — recovery preferences preserve model prose

Reused the concrete fallback-preference finding from the v0.5.130 council below;
`deja "fallback preference"` found related sessions but no more specific fix.
The old built app reproduced a successful story disappearing from the automatic
scroll queue after changing **If a draft fails**, despite remaining archived.

The setting no longer invalidates the whole director. Choosing quiet calls
`discardAuthoredReady()`, which performs normal reconciliation and clears only
authored readiness. Successful model prose, pending companion moments, the
request epoch and cadence anchors remain untouched. Enabling recovery does not
discard anything. The existing busy guard and controller's live recovery policy
remain in place; focus, Off and lifecycle cancellation are unchanged.

82 focused tests pass, including exact model-story identity, idempotent discard,
unchanged archive callbacks, Rare-mode farewell retention at the original
cooldown, and an in-flight model request completing without reload. No model
trial, new panel, broader matrix or stronger-prose claim is part of this slice.

Final council review found no blocker. Both built-browser recovery journeys pass
in 1.3 minutes total: repeated toggles preserve exact held model prose, and quiet
suppresses held authored prose while retaining its unpresented journal entry,
then allows a fresh model story on the same loaded writer. The latter runs at
320 × 568. Strict browser-spec types, version/boundary checks and production build
also pass. These use supplied writer responses, not new inference qualification.

## Periodic v0.5.130 council — fresh stories after a long Hold

Reused `deja "storytelling remaining"` sessions `01a06835-15f` and `2026-09-03T0`
to retain the approved V1 scope; the specific held-scroll expiry search found no
match. Root and council confirmed different generation/presentation anchors:
the director used scroll opening, while the host enforces a fresh gap at close.
A long Rare Hold could therefore start a draft immediately after close and let
it expire before presentation. The old built app reproduced that early write.

The director now accepts the host's live `presentationNotBeforeMs` cooldown
boundary and combines it with existing attempt/presentation cadence. Main uses
the same close-plus-rhythm expression as its presentation gate. No duplicated
close state or pause-as-Infinity sentinel. Freshness and cancellation are not
extended, and the host's existing global close anchor is not reset separately
for new campaigns. Last-story rereads use that same existing cooldown. This
does not change the policy for a draft already ready before a reread, or add a
new suspension policy for companion moments during an arbitrarily long Hold.

Council also identified fallback-preference changes discarding successful model
prose; that distinct fix is recorded as next rather than bundled into this one.
Stale backlog wording asking for an already-qualified writer was reconciled with
the current V1 acceptance. No model trial, new panel or broader matrix was added.

79 focused tests pass, including the exact host-boundary test that failed before
the director change. The old v0.5.129 Rare browser case likewise failed on its
premature second write; the corrected Regular and Rare journeys both pass in
2.5 minutes total. Each confirms advancing play during the gap, then one fresh
displayed/archived story with two writes and one load total. The strict browser
types, version/source-boundary checks and production build pass. Inference is
mocked for these delivery checks; no stronger-prose qualification is claimed.

## Periodic v0.5.129 council — comparison-only narrative repetition guard

Reused `deja "duplicate narrator"` session `2026-09-07T1` and its rejected
earlier-road replay as the existing duplicate boundary, not a new inference
qualification. Council identified a concrete bypass: `Rowan’s` versus `Rowan's`
can admit otherwise identical prose. The shared comparison key uses only NFC,
curly/straight single and double quotes, whitespace collapse and trimming. No
case folding, punctuation stripping, dash folding, NFKC or fuzzy matching.

The controller captures comparison keys before asynchronous choices and retains
the existing current-moment reset and recovery rules. Prompts, visible prose and
stored entries keep their original text. Six controller regressions failed before
the wiring change; 278 focused tests pass after it, including quiet/authored
recovery, no fallback for Scene/missing viewpoint, and a later fresh write without
reloading. Helper tests preserve meaningful distinctions and cleaner output.
The manual production probe uses the same key but keeps its historical exact
comparison flag separate. No historical receipt or model setting was changed.

Council found no wiring blocker. The built-browser journey passes: recalled
typographic copy leaves the archive unchanged and scroll hidden, then a fresh
story is shown and archived exactly with one load total. This uses supplied
writer responses, not a new literary-quality result. Production build, strict
browser-spec types, probe syntax and version/boundary checks pass. The first
browser attempt had an invalid assertion about the intentionally compact status
label; it was corrected without adding diagnostic clutter to the player UI.

## Periodic v0.5.128 council — retain a story when its rhythm changes

Reused `deja "storytelling backlog"` sessions `01a06835-15f` and `2026-09-07T1`
to retain the four-item V1 scope rather than introduce a permanent emotion
simulator. Council found an unnecessary rhythm-handler invalidation: it discarded
finished prose behind Options even though cadence already reads the preference
dynamically. The fix removes only that invalidation. Existing cadence anchors,
freshness limits and focus/recovery/Off cancellation remain intact.

Council found no blocker in the focused browser regression: it verifies one
archived, initially unpresented model story, the exact scroll after changing to
Rare, then advancing play with no second archive entry, load or write. Immediate
presentation is correct for this first-ever scroll; no earlier close anchors a
five-minute gap. The unfixed build failed at the expected hidden-scroll assertion.
This test does not establish pointer accessibility, GPU timing or better prose.

The corrected build passes all three targeted browser journeys (new regression,
ordinary held-story delivery and existing rhythm/cadence anchors) in 3.4 minutes.
78 director/preferences tests, strict browser-spec types, version/boundary checks
and the production build pass. No further inference or expanded test matrix.

## September 8 council — observe the failed input without retuning it

Reused `deja "garbled narrator"` session `2026-09-03T0`, the v0.5.127 immutable
failure and the earlier reset/seed audit. Runtime review identified the existing
processor as a read-only observation point before GPU softmax. An opt-in bounded
collector records numerical counts/extrema and sampled IDs without changing
scores or adding another GPU readback. CPU observer work may affect timing.

The [cold and matched-request replays](docs/STORYTELLING_FINISH.md#september-8--bounded-numerical-replays)
returned a rejected earlier-road duplicate, not the original garbling. All
observed scores were finite and sampled IDs valid. The matched run reproduced
its first two raw outputs exactly; later inputs always remained the original
recorded messages. Neither replay is a new prose-quality pass or an archive entry.
Both closed their owned resources with no external requests/runtime errors.

Council approves retaining this evidence and tooling, but no speculative score
sanitization, model change or renewed prompt trial. It does not prove why the
original generation failed or whether downstream sampling was healthy. No further
GPU work followed. Default builds have no diagnostic logging; ordinary gameplay,
prompts, consent/cache and No LLM remain unchanged. This is investigation progress,
not a player-facing storytelling upgrade or a new runtime version. 255 focused
tests and the normal build pass; the built worker contains no numerical collector
or diagnostic log marker. Version/source boundaries and syntax checks also pass.

## Periodic v0.5.127 council — actual-worker evidence and draft admission

Reused `deja "storytelling continuity"` sessions `01a06835-15f` and
`2026-09-07T1`, plus the v0.5.126 source audit. Recall for the prose-cleaner
failure returned no match. The existing manual probe now uses the real production
client/worker rather than copying its behavior. Council found no fidelity blocker;
unavailable internal telemetry and reconstructed messages are explicitly labelled.
The [baseline and candidate evidence](docs/STORYTELLING_FINISH.md#v05127--reject-isolated-letter-drafts-in-every-focus)
confirms the earlier three-scene baseline but rejects the arrival candidate:
clearer care at arrival is not a net improvement when farewell is unreadable.
The candidate prompt was restored, and both immutable receipts were retained.

Unlike the older control-bearing sample, the new garbage passed sentence cleaning
and failed only character admission. Scene focus has no such gate. Council
approved a minimal shared shape check after sentence retention: require two
adjoining Unicode letters, allowing combining marks. This closes the exact
admission hole, not all gibberish; no dictionary or emotional-quality score is
claimed. It cannot promise unrestricted multilingual acceptance. Existing recovery
eligibility must remain unchanged, including no authored fallback for Scene focus
or missing viewpoint. 328 focused tests pass, including the newly observed reply,
short/Unicode text, discarded tails and subsequent write recovery. No further
inference, model change or device matrix was added. Generation cause is still
unknown and remains a bounded next investigation, not a claim of better prose.

## Periodic v0.5.126 council — recover an idle writer failure

Council located a concrete client/controller gap: idle native worker errors have
no pending promise through which to report failure, leaving the controller ready
and hiding Retry. The client now notifies only after idle teardown; the controller
uses current-writer identity and phase guards to expose its existing failed UI.
The asynchronous post-load cache check also verifies that the writer remains ready.
Pending failures and manual disposal are unchanged; no auto-load or new control.
Council found no implementation blocker. This is a narrowly scoped P0-C fix, not
a diagnosis of arbitrary GPU failures or a claim of better generated prose.

202 focused tests, strict browser-spec types, version/boundary checks and the
production build pass. The built-app recovery journey passed in 33.8s, with
native Retry at 320px, retained pause/journal, a fresh subsequent scroll and no
external requests/page errors. The phone capture was reviewed. Its supplied
worker event and prose prove integration, not spontaneous GPU-failure reproduction.
The isolated preview closed; existing unrelated ledger work remains uncommitted.

The separate garbled-output source audit found no reset/seed misuse or proven
cause. Staged and production runtime bytes match (`341bae95…7792c`), but the proxy
probe omits production's registered logit processor and two-sentence interruption.
The installed runtime's sampling path adds GPU/CPU copies and synchronization
when a processor is present; it does not sanitize non-finite values. Future prose
qualification should use the actual production worker/client, not another
uninstrumented prompt trial. Earlier receipts and failed candidates are preserved.

## September 8 council — arrival candidates held back

Reused `deja "storytelling continuity"` sessions `01a06835-15f` and
`2026-09-07T1`, plus the v0.5.123 actual injury/arrival limitation. Recall for
`garbled narrator` returned no match. Council first scoped a prompt-only arrival
refinement, then rejected both actual sequences: the first lost emotional
attachment at farewell; the smaller second candidate produced an unusable
farewell after a better arrival. The generation failure's cause remains unknown.
See [both immutable receipts and exact limits](docs/STORYTELLING_FINISH.md#september-8--injured-arrival-candidates-not-promoted).

Production prompts are restored, with no runtime version bump. The useful
retained change is two actual-response cases in the existing controller/director
test: corrupt text cannot reach model-attributed archive/presentation callbacks,
authored recovery respects its setting, and the next supplied valid response
works without a new load. The 130 focused tests pass. This is rejection/recovery
coverage, not a new narrator feature or GPU diagnosis. No more sampling, model
changes or P1-B/P2/P3 expansion was authorized by this result.

## Periodic v0.5.125 council — keep the narration exit reachable

`deja "narrator-close"` returned no match. Reused the recorded P0-C limitation
and [GPU receipt 3e3e547f](tools/creative-story-probe/webgpu-game-report-2026-09-08T03-16-33-976Z-3e3e547f.json).
Council found no source-proven Close-handler bug: the historical failure stopped
at browser actionability, while existing tests invoked the button programmatically.

A new genuine-pointer regression directly reproduced a separate layout defect:
deep scrolling put Close outside the dialog and prevented hit-testing. Moving
the header outside one bounded settings scroll body fixed that check at 960px
and 320px. The post-fix journey passed in 41.5s, including native Off/Close,
one pending mock writer terminated, visible focus restoration, advancing No LLM
play and unchanged journal. Both fixed captures and the before-state were viewed.
No new UI controls, narration settings, model calls or runtime changes.

The regression uses mocked inference, not a GPU workload. It does not establish
the cause or resolution of the older GPU-specific actionability timeout. Council
approved the narrowly stated scrolling fix. The existing server on port 4174
was left running; browser builds, preview and captures were isolated under ignored
scratch on port 4175. No broad browser/device/CI matrix was added.
The existing saved focus/rhythm/recovery layout journey also passed in 46.8s,
including the new body's horizontal bounds at 320px/1280px. Strict browser-spec
types, version/source boundaries and the isolated production build pass. Local
builds include preserved, unrelated ledger work and are not claimed identical
to the clean release build; those ledger files stay out of the feature commit.

## Periodic v0.5.124 council — a solo opening with inner life

Reused the value-grounded idea from `deja "solo narration inner life"`, local
session `2026-09-07T1`, and the v0.5.123 Inez scenery-only result. Council narrowed
the change to a hero without an active companion or selected valid history:
companion absence alone would also alter the already-qualified farewell.
The first recorded value now supplies a present emotional tension; continuing
passages retain their thread. Exact comparison against the prior receipt confirms
unchanged road/arrival/farewell prompts. No extra state, UI or inference call.

The [first trial](tools/creative-story-probe/webgpu-v1-report-2026-09-08T05-34-59-965Z-66a993f1.json)
was rejected because “again” implied an unrecorded visit. A current-action brief
and explicit boundary against unsupported earlier visits/relationships produced
the [final sample](tools/creative-story-probe/webgpu-v1-report-2026-09-08T05-37-54-062Z-ae5e6e65.json).
Council passes a modest improvement: curiosity, unease and hesitation instead of
scenery alone. Speculative danger is an imagined worry, not an encounter. Awkward
phrasing remains; this is one curiosity sample, not universal prose quality or
qualification of every value. Neither actual output was rewritten or hidden.

248 focused narrator tests, version/boundary checks and the production build
pass. Existing unrelated ledger edits are preserved and excluded; the local
build is not claimed byte-identical to clean release CI. The existing manual probe gained a single-solo
mode, reusing its owned cache and requiring manual closure; no CI matrix was
added. Final load/write: 18.071s/27.568s; 204 input tokens. Both runs had zero
external requests/errors and complete cleanup. The game presentation, cache,
worker and archive paths are unchanged. The scoped V1 baseline stays qualified;
broader P1-B/P2/P3 work remains deferred, not silently revived.

## Periodic v0.5.123 council — remember the scene behind each story

Reused the V1 priorities recovered by `deja "storytelling emotional continuity"`
(local sessions `01a06835-15f` and `2026-09-03T0`) and the actual failed
`50b7719f` receipt. Inspection found that continuity selection discarded the
already-saved location/headline, then supplied consecutive assistant paragraphs
without the scenes they interpreted. Council recommended restoring chronological
scene/prose pairs before considering another emotional-memory system.

The selected two earlier passages now carry optional bounded scene labels.
Selection and prompt capture detach and freeze them; malformed/missing metadata
does not discard otherwise eligible older prose. The worker reconstructs a
historical user scene followed by the exact imagined assistant prose for each
memory, with current facts last. It does not claim those are the original full
prompts. Whole optional pairs can be removed on context overflow; current facts,
memory ranking, source/campaign boundaries, paired speakers, archive schema,
model/cache identity and number of model calls are unchanged.

**Minimum P0-B prose acceptance passes on the new actual sequence.** In
[receipt 8907eba1](tools/creative-story-probe/webgpu-v1-report-2026-09-08T04-35-07-729Z-8907eba1.json),
road worry becomes relief with continuing care at arrival, then affection that
makes goodbye painful. Mara and Rowan remain recognizable, the journey is not
made unfinished again, and no death, healing or reunion replaces farewell.
“Like a brother” is an imagined comparison, not fabricated biological kinship;
their journey testing the bond interprets the supplied journey rather than
inventing a separate event. Solo Inez is readable and has no foreign-campaign
memory, but remains scenery rather than a strong inner-life passage.

This is a deliberately small acceptance, not universal coherence. Arrival's
“worry latched onto Rowan” is awkward; its injury provenance is slightly
overstated. Judge only accepted prose, not discarded trailing output. The probe
also now resets chat on every write to match production, so that fidelity
correction and paired context do not isolate a single causal explanation.
The source/reset discrepancy is recorded, not treated as a separate production
fix or evidence that the old in-game worker skipped resets.

Actual cached load 19.954s; writes 30.248/29.620/35.558/22.113s; input tokens
194/320/394/180. Four passages passed the existing hygiene/name/duplicate gates,
with 0/1/2/0 selected memories, zero external requests/errors and complete owned
browser/worker/server cleanup. Focused regression checks: 242 tests across six
files pass, as do strict browser-spec types, version and source boundaries.
The one existing built-app continuity journey passed in 28.7s (1.5 minutes with
build/setup). It supplies its own labeled fixture response to verify outgoing
context, unchanged source attribution/archive, excluded foreign/future memories
and the readable 320px Journal separately from actual-model literary quality.
The phone capture was visually reviewed; browser and preview closed. Production
build and final built boundaries pass. Unrelated ledger edits remain preserved
and excluded from this feature commit; local builds are not claimed byte-identical
to clean release CI. The approved V1 baseline is complete, with the current
single-device/prose-sample limits and earlier inconclusive post-Off Close check
retained rather than silently counted as broad reliability qualification.

## Periodic v0.5.122 council — real GPU writer, continuity still open

The approved P0-A/C integration now uses pinned Qwen2.5 1.5B q4f16 and WebLLM
0.2.85 in the existing dedicated worker. It requires shader-f16 WebGPU and
browser Cache Storage, discloses about 900 MB, and never adds remote inference.
The old model cache is preserved; it cannot be mistaken for this larger model.
Independent runtime/cache review found no new critical implementation blocker.

Council checks covered the direct-engine logit processor registry (the proxy
worker API would ignore it), finite eligible DM labels with preserved scores,
two-sentence stopping with full stream draining to release WebLLM's lock,
native selected-history roles, and current-facts-preserving context overflow.
Cache-only restoration closes both fetch and native Cache.add/addAll; removal
targets the pinned model files without fetching a manifest or deleting the
shared architecture runtime. Unsupported-device guidance reaches startup and
Options. Model weights and the inference runtime stay out of the main bundle.

**Literary review does not pass P0-B.** The latest actual road/arrival/farewell
trial improved beyond factual summaries, but arrival's “final resting place”
was ambiguous and farewell repeated the old unfinished-road paragraph despite
the completed oath. The production duplicate gate rejected it. The solo scene
was readable scenery, not a strong inner-life passage. Native assistant history
and removing irrelevant seed imagery are not a completed emotional arc. Retain
the [actual raw outputs and verdicts](tools/creative-story-probe/webgpu-v1-README.md)
and do not launch another unchanged prompt/model trial to manufacture a pass.

The real built game produced an Orin passage during play: cached load 19.080s,
DM selection 14.011s, prose 23.099s, and simulation ticks advanced 7→11 during
writing. The actual accepted passage reached a safe scroll and the Journal with
LLM attribution. Desktop and 320px parchment fit; captures were visually
reviewed. The first harness stopped during reload because it clicked a hidden
Focus-mode Pause control after Panels was remembered. A linked continuation
restored cache-only in 20.422s, retained the same actual story/campaign, and
terminated a real pending write on Off. It then timed out waiting for the
Options Close button's clickability; that cause is unconfirmed. A final
[No LLM continuation](tools/creative-story-probe/webgpu-game-report-2026-09-08T03-28-03-637Z-ab8f8509.json)
passed 44 checks in 24.762s, including unchanged persisted journal, advancing
same-campaign play and reload, no creative worker/call, no external request and
complete cleanup. Prior receipts and production hashes match. No earlier story
was regenerated or supplied. P0-C's normal loop is qualified through these
linked segments, not an uninterrupted journey or proof of immediate same-page
Close responsiveness after GPU cancellation. P0-B remains open.

Focused verification: 254 tests across story, client, worker, controller, cache
and conversation pass (including 29 cache and 13 conversation cases). Final
council review corrected a browser assertion that assumed a healthy companion
had already earned a shared victory; both tentative hope and earned trust are
valid existing prompts. No gameplay change was needed. Strict updated
browser-spec TypeScript, version/source/built
boundaries and production build pass. No long local matrix was run. Existing
unrelated ledger edits were preserved and are excluded from this feature commit;
the local application proof is therefore not claimed byte-identical to the clean
release CI build. npm reported four pre-existing Transformers/ONNX-node/sharp
dependency advisories, none introduced by WebLLM/loglevel; no unrelated audit
upgrade was mixed into the slice.

## Periodic v0.5.121 council — preserve milestones through Rare cadence

Implements the approved P1-A only: companion first victories and farewells retain
their captured source until the next permitted Quiet/Rare attempt plus a bounded
three-minute opportunity. Completed prose still expires three minutes after it
is ready. One-slot/latest-milestone behavior and campaign, hidden-tab and Off
invalidation remain intact. A later presentation correctly moves the cadence
anchor. Reused the prior milestone finding from local recall `2026-09-07T1` and
the storytelling scope from `01a06835-15f`.

Independent council review found no new blocker. A pre-existing caller-level
possibility of reoffering a fully expired, never-attempted event is not claimed
fixed; the production host offers only new committed transitions. No broader
queue redesign or reliability matrix was added.

Verification: 66 focused director tests, strict browser-spec TypeScript,
version/boundary checks and production build pass. The single built-browser
Rare farewell journey passed in 2.6 minutes: no early write after 200 seconds,
the original captured farewell after the cadence opens, Shared road without an
extra moment-choice request, intermission rereading and desktop/320px containment.
The phone capture was visually reviewed. Browser and preview closed. Its supplied
writer response proves delivery, not actual LLM prose quality; P0-A/B/C remain
open and the real GPU writer trial is tracked separately.

## September 7 storytelling finish decision — no writer promotion

The user requested a realistic finish within the next few days. The
[three-day plan](docs/STORYTELLING_FINISH.md) freezes unrelated UI, story-library
and test-matrix expansion. Existing opt-in/cache/background/scroll/archive and
short prior-passage continuity plumbing remain; stronger actual writing is the
critical unfinished result. Reused local recall `01a06835-15f` and prior real
writer receipts rather than treating earlier failed candidates as qualified.

Runtime review selected one materially different candidate: pinned
Qwen2.5-0.5B ONNX through the current Transformers.js worker, not the failed
wllama path. The [actual receipt](tools/creative-story-probe/candidate-report-2026-09-08T01-09-54-396Z-ac9e04ca.json)
verified 519,136,456 artifact bytes and the intended build-time model identity.
It reached the existing 180-second loading deadline, before writing. The whole
run finished in 214,921 ms; browser, context and server closed and the owned
temporary profile was removed. No production source or live writer changed.

Independent review agrees that zero outputs establish neither literary failure
nor literary success. Zero generation requests are vacuous here: generation
never started. The receipt also does not distinguish browser transfer/cache
time from ONNX initialization because the existing probe returns accumulated
load progress only on success. Preserve that progress on failure in a future
target-device check; this gap is not a reason to repeat identical CPU conditions.

The bounded probe now supports one shared instruction-only story opening and an
isolated disk-backed profile. Six focused Node checks and syntax/whitespace
checks pass; the original three-fixture default is retained. Final review caught
unconditional cancellation of the shutdown watchdog; it now stays armed if a
launched browser/context has not demonstrably closed. No model rerun or CI matrix
was added for that cleanup-only correction.

Next decision is the player's intended device/browser path. September 10 is a
conditional target for one usable writer and three connected character scenes,
not a promised stronger-LLM release despite absent evidence. If no writer is
usable at the first decision point, request the explicitly labeled authored
release versus delayed stronger-LLM choice. Do not quietly count fallback prose
or another UI feature as completion of the storytelling task.

## Periodic v0.5.120 council — reveal navigation without taking over reading

Closes the queued phone-tab visibility follow-up, reusing the intentional-reading
and screensaver-first direction from local recall `01a06835-15f`. The existing
layout synchronizer minimally scrolls only the navigation row. View changes and
reappearance reveal the selected destination; same-view resize also respects an
unactivated keyboard-focused tab. Cached geometry excludes scroll position, so
ordinary play does not undo deliberate horizontal scrolling. No new panel,
preference, model behavior or game-state contract is introduced.

Council caught retained old-tab focus during shortcut activation, and repeating
End after scrolling away from the already-focused last tab. Both are handled.
The built-browser proof also exposed partially clipped native keyboard focus;
Arrow/Home/End now reveal explicitly with preventScroll focus, keeping activation
separate. Test-only corrections scoped ambiguous tab selectors to the toolbar
and stopped treating native vertical anchoring during text reflow as a bug.
The regression instead checks retained reading ownership through resize and
exactly unchanged vertical scroll during explicit horizontal keyboard browsing.

Verification: 22 focused navigation/Focus tests, strict browser-spec TypeScript,
version/boundary checks and the final production build pass. The final isolated
built-app journey passed in 82.453 seconds, including native shortcuts, retained
old-focus activation, Arrow/Home/End, repeated End, desktop-to-320px resize,
manual wheel scrolling across a live tick, Focus restoration, unchanged paused
saves, no narrator requests/workers and no page errors. Both final captures were
reviewed; the phone capture deliberately retains a nonzero reading offset.
Earlier diagnostic receipts remain separate. All owned browser/preview groups
closed. No long qualification matrix was added; stronger prose and emotional
continuity remain open.

## Periodic v0.5.119 council — readable storybook, unchanged source stories

Reused the readable archive/background narrative intent from recalled session
`01a06835-15f`. A pure formatter turns the selected reading snapshot into plain
text, grouping campaigns and ordering their source ticks without rewriting any
story. Named hero/companion voices, model/authored origin and actual intermission
status remain explicit. The original JSON format remains available. A native
Save stories disclosure keeps both choices out of the main reading layout until
requested. Neither export refreshes the snapshot, changes a save or runs a model.

The runtime reviewer found no source-backed tokenization defect: the three
historical prompts matched exact ChatML output at 202/171/192 tokens, without
duplicate special tokens or truncation. Pin/q8/EOS paths also agreed. That audit
does not demonstrate literary quality, and no repeated inference run was made.

Verification: 37 focused formatter/archive tests, strict browser-spec TypeScript,
version/boundary checks and the production build pass. Two built-browser journeys
passed in 112.254 seconds: actual UTF-8 text/JSON downloads, original voices and
prose, within-campaign scene order, current/all filtering, unchanged saves/archive,
native keyboard disclosure and retained focus, plus both formats using the
visible snapshot while a new story waits. Phone/desktop captures were reviewed;
no model downloads or page errors occurred, and owned processes closed. Council
then corrected the text-only group label to “Other adventure”, since another
saved hero need not be chronologically earlier. The corrected formatter tests
and build pass; the final live download check covers that wording.

## Periodic v0.5.118 council — keep captured stories while inspecting

Reused the player's archive/background-story intent from local recall session
`01a06835-15f`. Independent review rejected the initial moving-reader diagnosis:
ordinary navigation invalidated the pending request before it could update the
archive. The actual change separates stage dismissal from narration cancellation.
An in-flight same-campaign story now completes into Narratives while another tab
is open. Watch-only starts and safe-break presentation remain unchanged; Off,
campaign changes, hidden-page and update boundaries retain hard invalidation.

Because completion can now arrive during reading, Narratives retains its DOM,
selection and displayed export snapshot until deliberate refresh. The explicit
control retains keyboard focus, and scope/campaign changes refresh the correct
list. Archive retention details fold away; live hero activity is hidden in the
story-reading section, matching Status. This is not improved model prose.

The separate runtime council measured the stronger writer's first native decode.
Almost all CPU samples were active quantized matrix work, and pinned-source plus
binary inspection confirmed SIMD already enabled. One targeted compact-prompt
comparison still returned no prose inside its bounded deadline. Its failure is
retained separately; no production model or larger-model cache is promoted.

Verification: 87 focused director/archive tests, application and browser-spec
TypeScript, version/boundary checks and the production build pass. The final
69.903-second built-app journey verifies exact captured source/unshown archival,
continued play, no new draft or cutscene during inspection, unchanged reading-row
position and text selection, visible-snapshot export, keyboard refresh/focus,
current/all-hero filtering, and phone/desktop containment with 44px controls.
Both final captures were reviewed. Fixed refresh width and a screen-reader-only
pending announcement prevent header growth from shifting the passage. No model
downloads or page errors occurred; all owned browser/preview processes closed.

## Periodic v0.5.117 council — Adventure belongs beside Map and Codex

The user's follow-up replaces the Adventure panels menu popup with a real
Adventure inspection tab. Reused the navigation/history separation from
`deja`, session `01a06835-15f`. One set of character and Chronicle nodes is
hosted in the shared inspection screen; no duplicate detail view is introduced.
Character opens that tab. The menu entry, dialog, focus trap, temporary node
hosting and all drawer CSS are removed. All eight views share keyboard access
and a horizontally scrollable navigation row. Return/Escape restores Watch and
the existing Focus preference; tab-specific scroll positions remain available.
Status and Narratives stay in Journal. Gameplay, pause and save schemas do not
change. The Watch status retains a visible, polite live announcement.

Council review caught a legacy narrator adapter that translated ineligibility
into an active cutaway. Adventure now clears automatic scene presentation
without that adapter, retaining deliberate classic Story Beat access. The
controller regression checks no new automatic offer, cleared scene text, and
retained inspection/battle suppression. Creative story cadence, models, consent
and generation settings are unchanged. Long companion locations now wrap.
Visual review also required the header, tab row and screen start to agree at
200% text and after resize. They now derive their offsets from one measured
header and tab height, observing complete border boxes. Earlier failed
geometry receipts are retained rather than counted as passing visual proof.

Verification: 56 focused tests across five navigation/narrator suites pass;
the corrected narrator suite also passes its 23 tests. Application TypeScript,
six focused browser specifications, version/boundary checks and production
build pass. The legacy site spec retains its preexisting standalone type errors,
not errors in the migrated lines. The broader built-app tab journey passes
autoplay, all eight destinations, paused-world identity, scroll restoration and
unchanged saved preferences. The final exact-detail/keyboard/Focus/resize journey
passes against the release asset in a 68.471-second harness, including 320px and
200% text, strict header/navigation/content separation, no model requests and
no page errors. All three final screenshots were reviewed; all owned browser
and preview processes closed. No long qualification tests were added to CI.

## Periodic v0.5.116 council — Character readiness without duplicate detail panels

Reused `deja "the_grind_2 next storytelling backlog"`, session `01a06835-15f`,
and the requested screensaver-first progressive disclosure. Character now keeps
readiness and immediate context; Inventory and Skills own the exact equipment
and ability detail. Two duplicate cards, two duplicate summaries and their
per-frame rendering are removed. All six attributes remain continuously updated
inside a native keyboard-accessible disclosure. Independent review found no
lost essential gear, ability or character facts. No gameplay, narrative, model,
consent, saved-state or preference change is made by this UI slice.

The drawer uses one horizontally scrollable navigation row at every size.
Visual review caught a clipped enlarged-text header despite an initially passing
geometry check. Stronger assertions then exposed a non-wrapping Changed row.
Both are fixed by wrapping, not hiding their content. Earlier failed receipts
are preserved. The final desktop, 320px and 200%-text captures were reviewed.

Verification: 53 focused tests across six UI/projection suites pass. Application
and three focused browser-spec TypeScript checks, version/boundary checks and
production build pass. One isolated built-app journey verifies exact paused
resources, combat stats, Inventory and Skills projections, all six attributes,
native keyboard disclosure, resize/zoom containment, 44px targets and Escape
focus return. It finishes with identical saved world state, no model requests
and no page errors. The final harness completed in 68.657 seconds and closed
all owned process groups. Existing affected browser fixtures now inspect the
canonical Inventory/Skills surfaces. No long qualification matrix is added.

The separately committed stronger-writer RPC diagnostic reuses the pinned
wllama history (`deja wllama`, session `2026-09-06T1`). Its first run exposed an
optional debug endpoint returning null, not a failed story submission. The
corrected run records completion admission in 150.7ms, then the first native
`get_result` still pending at the 20-second ceiling: two calls, no empty-poll
loop, no returned text. Both immutable receipts and 17 passing portable tests
are retained outside feature CI. This identifies the next profiling boundary;
it does not establish why native inference stalls or improve production prose.
All owned workloads closed; production retains the existing client-only writer.

## Periodic v0.5.115 council — recognizable values in ordinary inner life

Reused `deja "storytelling"`, session `01a06835-15f`, and the user's direction
to make characters emotionally interesting without adding screensaver clutter.
A bounded council review found that first-victory and farewell reflections
used recorded hero values while ordinary Inner life still ignored them. Eight
original reflections now give curiosity, loyalty, mercy and courage two
distinct inner tensions each, through the existing closed-value selector.
Missing or malformed values retain the exact neutral fallback. The hero's
values inspire imagined prose; they are not measured emotions or ranked traits.

Independent review cleared the implementation and all eight passages. No
biography, new external event, companion personality or promised outcome is
introduced. Recovery remains prepared before asynchronous inference; caller
changes cannot replace its captured name or value. Shared-road wording and
duet/victory/farewell precedence remain unchanged. Accepted model prose, model
calls, prompts, cache, consent, pacing, saved-state schemas and neutral visual
tone are unchanged. The existing Authored scroll and Narratives archive carry
the result without another panel or control. This improves authored
characterization, not real-model literary quality or persistent emotional arcs.

Verification: 332 tests across eight focused suites pass in 20.13 seconds,
including frozen caller-value capture and unchanged character admission.
Application and focused browser-spec TypeScript, version/boundary checks and
production build pass. One isolated built-app browser case supplies a rejected
draft to the real production recovery workflow, independently matches one of
the merciful hero's exact reflections, then verifies Authored presentation and
archive attribution, stable reading tick, desktop/320px geometry, readable text,
44px controls, one worker/write, no model network and no page errors. Inference
alone is stubbed. Both captures were visually reviewed. The harness completed
in 57.808 seconds and closed all owned process groups. No qualification matrix
or further model trial was added to this feature.

The preceding v0.5.114 correction passed Pages run 34155761318 in 3m20s. Its
initial live smoke mistakenly targeted the hidden full-layout Pause control in
fresh Focus mode; that failed receipt remains intact. Selecting the actually
visible Pause control then passed all 20 live checks in 20.212 seconds,
including the exact deployed version and reviewed entry SHA-256.

## Periodic v0.5.114 council — keep character stories with their cast

Reused `deja "sampled prose"` and the continuity history in session
`01a06835-15f`. Independent review found no evidence of malformed ChatML framing;
all prior prose trials were greedy. One 135M temperature/top-k trial produced
an invented past, then Frodo, parents and a rose planted by Mara, omitting Rowan
and the continuing injury. Both raw passages and the real journal recall remain
in an immutable receipt. A launcher failure before browser/model initialization
is preserved separately, not counted as a writing sample. Installed
Transformers.js 4.2.0 does not apply top-p; that ignored setting was omitted.

One final 360M comparison changed only supported sampling from the prior
disk-backed generic-prompt trial. It restored offline in 16.707 seconds and
generated `Mara beside Rowan (injured)` in 31.658 seconds. The cleaner returned
null, so there was no accepted first story and no second attempt. All owned
workers, browsers, servers and the temporary profile were cleaned up; no model
or decoding change is promoted. The opt-in receipts remain outside feature CI.

The player-facing change is deliberately narrower: a character-focused story
must actually mention the captured requested hero, or both people for Shared
road. This is not a vocabulary whitelist, factual validator or emotion score.
Full names and unambiguous first names count; substring lookalikes and ambiguous
shared given names do not. Each DM candidate freezes its own anchor before
asynchronous selection. A lost-character draft follows the existing named
authored recovery/quiet preference before the director can archive it. Authored
recovery cannot be labelled LLM output, and rejecting a draft cannot leave the
writer busy. Scene imagery and existing archives are unchanged. The source
model, cache, consent, prompts, token budgets and number of calls are unchanged.

Verification: 159 focused anchor/controller/director tests pass, including both
actual bad samples, honest onWritten attribution, quiet recovery, candidate
capture and a successful next request without reload. Application and focused
browser-spec TypeScript, version/boundary checks and the production build pass.
The single built-app browser case rejects hygienically valid characterless
prose, shows a named injury-aware authored interlude, archives only that authored
text, then accepts the next named model fixture on the same worker. It checks
desktop/320px cutscene layout, readable text, source labels, two writes, no worker
restart, no model network and no page errors. Inference alone is stubbed: this
proves the production workflow, not model quality. Both new intermission
captures were reviewed. The harness completed in 99.931 seconds and closed all
owned processes. Existing successful browser fixtures now use names captured
from their own requests; negative responses and static archives are unchanged.

The first v0.5.114 CI run (34154954048) failed nine tests: three additional
real-controller suites still supplied unnamed prose as successful character
stories. No deployment occurred. A read-only council audit of all five
createCreativeStoryController test callers identified the remaining shared
success fixtures and a separate first-victory continuation. Those fixtures now
name the captured hero, and the companion where Shared road requires both.
Expected origins, selection, duet attribution and request counts remain intact;
deliberately invalid or unrestricted scene responses remain unchanged. All six
affected suites now pass: 245 tests in 15.32 seconds. This is a test-only release
correction; production code and the already browser-verified v0.5.114 build are
unchanged. The unsuccessful CI result is retained rather than relabeled green.

## Periodic v0.5.113 council — one factual status-history home

Recovered the shared-log design with `deja "the_grind_2 shared status history
log"`, session `01a06835-15f`. Independent projection review found two different
sources: the 32-entry Chronicle includes autonomous decision traces, while the
128-entry depth log includes mechanical receipts absent from some Chronicle
summaries. Both remain source-labeled and newest-first; same-tick placement is
a display convention, not invented chronology. Dedupe is source-specific; seed
and legacy IDs are preserved, with ownership from the loaded campaign.

Journal Status replaces the old Adventure log and Recent Chronicle windows.
Actual action reasons are expandable, not fictional character thoughts. The
existing Narratives section retains its independent authored/LLM attribution,
archive and export. No ledger schema or narrator runtime changes are needed.
The deliberate reading snapshot does not reorder focused rows as the adventure
continues; Show latest events refreshes explicitly. A campaign switch replaces
old rows immediately. Character's shortcut hands keyboard focus to Status after
closing its native drawer; ordinary Watch keeps the compact character strip.

The first built-app run passed identity/rationale, navigation and both viewport
checks but exhausted its 150-second case budget during the final live-refresh
check. Its failure receipt remains intact. Screenshot review also found stale
12-entry subtitle copy, a redundant live Storybook margin above the history and
a three-row phone navigation header. The subtitle now describes the real homes,
Status suppresses that live card, retention details fold away, and phone
inspection navigation is a touch-sized horizontal strip. The refresh control
uses an inert aria-disabled state so completing a refresh retains keyboard
focus. The final browser case removes duplicate tab-switch loops, not the source,
layout, real-progress or unchanged-state assertions.

The second run confirmed actual progress and a stable snapshot but hit that
same case deadline on the final refresh click. The final run kept desktop
rendering for the desktop capture and used the smaller phone viewport for DOM
interactions, avoiding unnecessary software-GPU overhead. With a bounded
180-second case ceiling, it passed in 57.0 seconds (65.776 seconds including
owned preview/browser startup and cleanup). Exact identities/reasons, both
layouts, all three Journal sections, live progress, still reading, explicit
refresh with keyboard focus and zero inference/errors passed. Both final
screenshots were visually reviewed; no owned process groups remain. Neither
earlier timeout is rewritten as a passing run.

Verification uses 56 targeted projection/journal tests, application and focused
browser-spec TypeScript, version/boundary checks and a production build. The
single built-app case checks original event identities and reasons, separate
imagined stories, desktop/320px layout, stable reading while play continues,
explicit refresh, unchanged paused state and no inference. Six legacy browser
assertions now read their exact mechanical/Chronicle receipts in the shared
surface instead of the removed duplicate lists. No long-running qualification
suite is added to per-feature CI.

## September 7 narrator follow-up — separate storage limits from writing quality

The 135M assistant-prefill trial retained names/facts in host-supplied openings,
but both generated suffixes remained factual recaps without emotion. Root and
the independent reviewer did not count those openings as model creativity.
The subsequent 360M trial stopped before inference when incognito CacheStorage
rejected its 364,564,671-byte weight file. That is not a literary result.

The existing harness used Playwright's nonpersistent context. Primary-source
review found that Chromium's memory-only CacheStorage chooses an INT_MAX-sized
backend whose individual entries are limited to one eighth of that capacity.
This strongly explains the size-dependent failure; the exact shipped native
error path was not instrumented. One separately recorded temporary persistent
profile changed only the storage condition. It cached all seven files and
restored the candidate offline in 15.998s. The owned test profile was removed
after browser closure; staged weights and user profiles were not touched.

The corrected test finally measured actual writing: 139 input tokens, 21 output
tokens, 44.674s, repeating `Mara beside Rowan (injured)` twice. The production
cleaner returned null, so nothing entered the journal and the second scene was
not attempted. There is no model promotion or player-facing model/cache change.
The [immutable receipt](tools/creative-story-probe/emotion-360m-persistent-report-2026-09-07T17-54-55-497Z-8adb30bf-8a40-4d87-abc2-ce261fdf1811.json)
and [source-linked explanation](tools/creative-story-probe/README.md) preserve the
distinction. These finite opt-in probes are not added to per-feature Pages CI.
Reliable emotional continuity remains open; a model-loading fix is not a
storytelling-quality win.

## Periodic v0.5.112 council — characters before information walls

The compact portrait-vitals plan was recovered with `deja "compact portrait
vitals"` from session `2026-09-06T1`. This slice reuses the stable hero identity
color recipe, authoritative hero resources, public party projection and native
Adventure panels drawer. Ordinary Watch and Focus share a compact character
strip and one current status. Retained canvas analytical groups are hidden in
both Watch layouts; actors, effects, vitals and cutaways are not those groups.

Independent review identified details with no equivalent inspection home:
current XP threshold, derived combat totals, upcoming turns and immediate
autonomous rationale. Those detailed HUD/Chronicle nodes remain deliberately
accessible in Adventure panels, including desktop. Inventory, Skills, Journal
and Map already preserve the other equipment, ability, oath and route details.
Zero-health injured companions must not become a death label, and the public
party projection supplies no mana to invent. Existing injury/arrival wording,
exact numeric resources and stable named portraits accompany color. The change
must preserve Pause and same-button keyboard Focus through drawer transitions.

Source review caught the intermission dialog living outside the app; its real
app-state flag now suppresses the strip. Screenshot review caught the old mana
class having no color rule: mana now uses the established blue combat-meter
palette, distinct from red health. Phone Watch no longer squeezes seven tiny
navigation labels into a row; the readable, touch-sized toolbar remains inside
the explicit drawer and inspection views. A browser check exposed deferred
drawer focus restoration racing the next Focus action. Restoration now happens
synchronously after the drawer closes and the original nodes are restored.

The focused checks cover 27 projection/visibility tests, application and
browser-spec TypeScript, boundary/version checks and a production build. The
built-app proof uses a real Pattern Duel and a saved injured recruited companion,
at 1280px and 320px. It checks exact named resources, absence of invented mana or
death, stage/ribbon clearance, Character detail access, Escape/focus handoff and
unchanged paused canonical state, without loading a model. It is not a new
workday/replay/storage qualification campaign.

The final built-app proof passed in 129.990s after the focus correction; all four
desktop/phone screenshots were reviewed. Feature commit `0ccd7ba` passed
[Pages CI](https://github.com/huntergdavis/the-grind-2/actions/runs/34149289903).
The public site then passed 15/15 checks in 28.134s against the exact reviewed
JavaScript fingerprint, including both viewport sizes, retained details,
Escape focus and zero narrator requests/workers in No LLM mode. The initial
quick live check read Pause before an in-flight step settled; its corrected
check waits for the existing Resume state, without changing application code.

The parallel writing experiment is separate: previous-story context is wired,
but v0.5.111 real generated prose failed both emotional and factual continuity.
The compact interface is not counted as a model-quality improvement.

## Periodic v0.5.111 council — carry a feeling into the next scene

The journal now supplies bounded prior prose at the actual writer boundary.
Selection uses exact campaign/source identity and canonical tick ordering, not
generation wall time. The latest earlier excerpt stays; another favors the
current companion or location. Complete sentences and named paired voices are
preserved, with at most two 240-character excerpts. Both accepted LLM and authored
passages remain imagined interpretation, not canonical history.

Each current/milestone candidate builds its complete prompt before awaiting the
DM choice. Later journal writes cannot replace the selected scene's memory.
The final message retains all current public facts; optional earlier messages
are labeled and quoted as imagined data. The exact tokenizer removes oldest
history if necessary without raising the 1,024-token input or 64-token output
limit. No additional inference, download, HUD, save migration or backend is
introduced. No LLM keeps the callback inactive and reading the archive stays
independent of model activation.

This reuses the earlier continuity request recovered by
`deja "the_grind_2 narrative continuity previous stories"` from session
`2026-09-03T0`, the v0.5.109 journal's speaker-preserving projection, and the
controller's existing synchronous per-candidate prompt preparation. Review
caught the old per-scene repetition check forgetting the supplied prior story;
the final guard rejects exact copies against the selected candidate's frozen
excerpts using existing skip/recovery behavior, without fuzzy prose restrictions.
A completed model call is not by itself evidence of coherent or improved storytelling.

The real two-story chain confirmed the data path, not narrative quality. One
cache-only worker wrote two passages offline; the first accepted 192-character
passage was selected unchanged into the second prompt. Actual input/output
counts were 199/42 then 289/41; writes took 53.121s and 57.682s. The first
invented England and years of shared travel. The second added a field/horses
while dropping names, arrival, injury and emotional development. Both therefore
fail the qualitative check. The exact-copy guard did not trigger because they
were distinct passages. No extra model attempt was made to seek a better sample.
The [raw receipt](tools/creative-story-probe/successive-story-report-2026-09-07T16-44-22-792Z-7cb78e26-3054-4aad-ba4d-93b6bcf7afbb.json)
retains prompts, outputs and the zero-network/clean-closure evidence. A separate
earlier preflight failure counted two static Vite transforms as two runtime
workers; it stopped before browser/model creation and its receipt is preserved.
The corrected probe observed two build transforms but exactly one runtime worker.

Release checks passed: 236 focused tests across six narrator/journal suites,
application and browser-spec TypeScript, boundary/version checks, and production
build. One built-app case verified actual journal-to-writer prompt wiring,
cross-campaign/future exclusion, exact source archiving and the mobile reading
surface with a stubbed completion; it is not counted as model-quality evidence.

## Periodic v0.5.110 council — one-click Focus, no escaping battle panels

Read-only review traced the confirmed leak to Pixi information rails: native
HUD panels already obeyed Focus, but battle threat/TURN receipts and Pattern
Duel analysis were drawn unconditionally inside the canvas. Information-only
retained containers now follow chrome visibility; layout refresh changes their
visibility while paused without rebuilding actors or restarting cues. Scene
clear/disposal resets tracking. Attacks, vital/status cues, stance effects and
all typed narrative/canonical cutaways stay outside those information groups.

The same top-level Focus button stays reachable in both control strips and
retains keyboard focus after toggling. Passive recaps no longer open over Focus;
unread records remain available through explicit Adventure panels. The initial
portrait/resource and shared-status-log ideas remain subsequent vertical slices,
not another wholesale UI rewrite bundled into this correction.

The user's ignored local Pattern Duel screenshot confirms that this is redundant
information competing with characters, not a shortage of screen pixels. The
same visual review caught fixed navigation covering scrolled Journal text;
the inspection viewport now starts below the measured chrome, including wrapped
mobile navigation. Drawer flow remains separate. The backlog records compact
portrait vitals, one shared status/history surface and progressive disclosure.

`deja "the_grind_2 focus toggle panels"` returned no implementation match;
the review used existing Focus, renderer and browser-test source. Browser work
reuses Stage Focus decisions from session `01a06835-15f`. The real paused-battle
and Pattern Duel proof checks retained information visibility rather than
assuming a hidden HTML HUD means the canvas is also clear.

Verification: 52 focused tests across six suites, application/spec TypeScript
and the production build passed. The real-browser journal reading/export case
passed at 320/960px. The initial Focus case caught an obsolete drawer-only
`display: none` rule; removing it restored actual keyboard reachability. The
single affected case then passed for battle and Pattern Duel at 320/1280px,
including unchanged paused state, the mobile drawer exit and zero model work.
The failed receipt was retained; no broad rerun or model probe was added.

## Periodic v0.5.109 council — keep the words, keep the voices

The archive hooks accepted completion, not just presentation: a story waiting
behind combat can still be read after reload. Exact campaign/source identity
prevents duplicates; actual display only marks the existing entry. Stale,
cancelled and rejected drafts are excluded. Authored recovery is labelled, never
counted as generated prose. The journal uses bounded browser storage separately
from canonical saves, preserves corrupt/unreadable storage, and honestly offers
session-only reading/export when storage fails.

Independent review caught paired first-person thoughts losing their character
names when only the joined prose was archived. The final projection preserves
the two validated named voices in both reading and export; ordinary prose is
never heuristically split into speakers. Journal gains a quiet section selector,
not another top-level toolbar button or fighting overlay. Focused lifecycle,
storage and one actual-app browser case cover the slice; no endurance matrix or
model download is needed to prove archive plumbing. This does not claim improved
model creativity or cross-story coherence: bounded prompt continuity follows.

`deja "the_grind_2 persistent narrative journal previous narratives coherence"`
returned no match; the existing director, Last story and Journal source are the
implementation references. The storage work also reused preference-recovery
conventions recovered from session `2026-09-03T0`.

## Periodic v0.5.108 council — viewer-controlled adventure speed

The runtime reviewer confirmed that the seven Menu presets replace one existing
interval, with no stacked timers, tick batching, changed rules or missed-tick debt.
Pause, startup, hidden pages, active steps, interactions and cutaways keep their
existing admission guards. Reading and LLM cadence do not accelerate; neither
does offline catch-up. The developer fast URL caps the interval rather than
multiplying 100x a second time. The storage review caught an initial remembered
claim without confirmed storage access; neutral conditional wording resolves it.

The independent CI audit found the prior Pages job took 5m12s, with 152.55s in
seven historical evidence-tool suites. These test receipts/provenance/tamper
handling, not fresh model writing or hours of gameplay. Endurance matrices are
roadmap targets, not per-feature CI jobs. Keep focused local checks proportional
to this feature and retain a separate future fast-path/full-tooling split; do
not delete meaningful game/save tests or block the requested feature on that work.

This slice reuses the existing timer/pause ownership and Menu style plus the
speed request recovered with `deja "the_grind_2 simulation speed selector"`
from session `2026-09-03T0`. The narrative journal and bounded continuity follow.

## Periodic v0.5.107 council — finish the passage, preserve the quiet

The narrative review prioritized completed generated prose over more authored
templates. The runtime slice stops after two established sentences using the
same extraction as the display cleaner. The independent review caught a plural
possessive inside single-quoted dialogue being mistaken for a closing quote;
the final conservative guard and straight/curly regressions resolve it. Prompt
exclusion, per-write reset, direction calls and the existing 64-token cap remain.

One isolated real-model comparison preserved the accepted passage with 64 versus
38 generated tokens and measured 62.042 versus 47.285 seconds. Baseline-first
ordering and cache restoration limit timing claims. Its source hash predates
the stricter apostrophe safeguard; final tests/replay are separate evidence.
The visual review uses a single actual battle-to-scroll case at desktop and
320-pixel width, not another HUD. No production inference is mocked in the
matched probe; only inference is mocked in the actual-app presentation fixture.

A separate streamed Qwen diagnostic still produced no observable text at its
180-second diagnostic deadline. Preserve the failed receipt and investigate the
pinned native RPC/inference boundary; neither zero text nor authored recovery
establishes generated literary quality. The narrative reviewer confirmed that
an oath headline is not verbatim spoken dialogue: one verified factual callback
needs an explicit context contract before longer emotional or relationship arcs.

This reuses session `01a06835-15f` via `deja "the_grind_2 writer latency"`.
Full CI, release and live verification are recorded in the release handoff.

## Periodic v0.5.106 council — character continuity through goodbye

The writing review adds eight original second sentences to the existing farewell
openings. Recorded values shape the hero's concern without assigning a companion
personality, promising recovery or changing the wounded-but-alive departure.
All three neutral paragraphs and the preceding first-victory rotation remain exact.

Independent integration review found no blockers: attribution is bound to authored
origin, exact text and the captured hero through controller, director, UI and
Last story. Cancellation, current-scene selection and replacement cannot inherit
it. Public records, saves and inference calls remain unchanged. The visual review
keeps the explanation in the existing folded source, with no new status surface.

This reuses the farewell/recorded-value decisions from session `01a06835-15f`,
recovered with `deja "farewell values"`. A separate bounded stronger-writer
experiment must report actual prose and timing, not count these authored lines
as LLM progress. Its result and release verification are recorded separately.

## Periodic v0.5.105 council — values without invented personality

The writing reviewer supplies 16 original hero thoughts shaped by recorded
curiosity, loyalty, mercy or courage and the captured healthy/injured context.
Selection uses only the actual value set; order and duplicates cannot imply
dominance, and missing or malformed values retain neutral writing. Companion
thoughts remain unchanged because the viewpoint provides no companion traits.
This adds imagined interiority, not a biography, durable emotion or relationship.

The runtime slice captures that authored inspiration before awaiting inference
and preserves it through the director and Last story. Accepted model prose,
ordinary staging, the one-worker lifecycle, first-victory binding and recovery
permission remain separate. Later value mutations cannot rewrite a held scene.

The visual reviewer puts the explanation in the existing folded source only.
The two quiet role labels, readable ink reveal, trust/care accents and normal
controls stay unchanged. Unknown metadata, mismatched prose and model-origin
passages cannot claim this authored value inspiration.

The model reviewer separately tests two fixed ordinary-prose requests with
curiosity/mercy and one mapped hint. This is not an untreated A/B, an automatic
promotion rule or evidence that an authored pair was generated. Preserve raw
outputs and judge literary grounding independently of text hygiene.

The actual run produced zero of two grounded value-shaped passages despite both
passing text cleanup. The candidate was not promoted; no retry followed. The
visible authored feature and the failed model experiment remain clearly separate.

This reuses the Shared road/recorded-value discussion from session `01a06835-15f`
via `deja`, and the official Wildermyth character-input research. Full narrative
arcs, durable callbacks and stronger generated prose remain explicitly open.

## Periodic v0.5.104 council — let Shared road mean companion priority

The runtime and provenance review separates a user's deliberate focus from model
reasoning. When two valid public moments compete, stored Shared road prioritizes
the captured companion milestone even if the current party is now solo. Only
the moment-choice call is omitted; local stage choice and ordinary prose remain.
Both source ticks retire together, and expiry/cancellation keep their existing
one-slot lifecycle. No additional model, save field or relationship meter appears.

The visual review puts the focus credit inside the existing folded source and
retains it in Last story. Captions, authorship and staging remain independent.
The new canonical browser case must prove that a distinct newer solo source was
actually eligible, not mistake a single-source request for prioritization.

The independent four-choice model probe picked label 1 every time; reversing
the two fixed pairs reversed their semantic outcomes. This small result does
not establish universal bias or better relevance, and position remains
confounded with numeral. No retry, prose experiment or production prompt change
followed. Keep stronger generated writing and persistent emotional arcs open.

This reuses session `01a06835-15f`, recalled with `deja "moment preference"`,
and the official Hades contextual-priority research. Release verification and
the immutable experiment are recorded in the narrative release note.

## Periodic v0.5.103 council — two viewpoints on the shared road

The narrative reviewer authored six original first-person thought pairs and
strengthened the first-victory boundary to prove two unique, distinct actual
participants. Hero and Companion may share a visible name but cannot be the
same actor. The captured public condition shapes trust/care themes; no imagined
thought becomes a permanent mood, relationship score or combat fact.

The visual reviewer keeps both named roles inside the existing parchment and
word-reveal scheduler. Labels and restrained rules separate the perspectives
without chat bubbles, portrait downloads or another overlay. Hold, Last story
and reduced motion retain full readable text. Metadata must match the exact
combined passage before the renderer assigns roles; ordinary prose is not split
and relabelled as two characters.

The runtime slice reuses the remembered Shared road focus, one milestone slot,
authored-recovery permission and captured source. Inner life remains single
voice; current-source selection cannot inherit the victory duet. Quiet, Scene,
No LLM, cancellation and runtime failure remain outside authored recovery.
Last story copies the pair without inference or save mutation. This reuses the
Shared road decisions recovered from session `01a06835-15f` with `deja`.

One bounded healthy/injured candidate experiment separately assesses actual
local-model two-role output. Keep its raw result distinct from authored recovery
and mocked-inference browser evidence; do not call a role-labelled layout an
improvement in generated prose. Real sample, browser, full CI and live-version
results are recorded in the narrative release note and final handoff.

Final slice verdict: ship the authored duet and quiet two-role presentation.
The real model trial failed both fixtures and was not promoted; its prompt is
absent from the production bundle. The canonical actual-app browser proof passed
with desktop/mobile review, exact source, one write and no extra replay requests.
The earlier pre-browser collection failure required only a test import repair,
not an application change. Full narrative arcs and generated duet quality remain
explicitly open.

## Periodic v0.5.102 council — first victory together

The provenance reviewer bound the milestone to a real final combat action with
the same active participant changing from zero victories to one. Canonical
replay, healthy/injured fixtures, loaded-state roundtrips and malformed-boundary
tests distinguish this from loot, later wins or a copied counter. Six original
authored reactions keep imagined trust/care separate from durable game state.

The independent runtime review found no blocking source-binding or lifecycle
issues. Its 27 controller regressions check both moment choices, immutable
capture, unchanged prose/stage prompts, malformed bindings, quiet/Scene behavior,
revoked recovery permission, cancellation and fatal errors. The one existing
milestone slot, source watermark and safe-break cadence remain in charge.

The visual reviewer uses the existing caption, folded public record and accent;
there is no new battlefield overlay or relationship score. Accepted model prose
may carry verified host context without inheriting authored attribution or a
false claim of model selection. Last story retains the exact passage and source.

The single real offline two-pair probe chose current/current, not either first
victory. This supports functional local selection only. Queue a counterbalanced
label experiment before claiming improved priority; stronger prose, distinct
two-character voices, factual memory and lasting emotional arcs remain open.
This reuses the September 6/September 3/August 30 first-victory discussions
recovered with `deja "First victory together"` and the prior one-slot director.

Release acceptance additionally requires the canonical actual-app vertical
case, desktop/320px review, full GitHub check/deploy and exact live-site version
verification recorded in the release handoff.

## Decision summary

The Grind 2 should not generate an endless pile of disposable content. It
should build an accumulating history in which old people, places, equipment,
relationships, rivals, and events acquire new meaning.

The current plan has a strong deterministic simulation spine, but its original
exit target proved only a 10–15-minute procedural adventure. The council has
amended it for a different product: a fully client-side RPG screensaver that can
run visibly through a workday and preserve a coherent named campaign for years.

The final position is:

- "Forever" means durable continuity, bounded state, all-day visible play, and
  deterministic catch-up. It does not promise continuous execution while a tab
  is hidden or closed.
- The **Game Master** is the whole deterministic game stack. No LLM owns game
  truth, balance, memory, actor choices, or long-range story.
- A deterministic **Actor Policy** chooses what characters do from facts they
  know and values they hold. The Campaign Director can create pressure and
  opportunities; it cannot puppet a betrayal or value reversal.
- SmolLM2-360M is an optional, explicitly downloaded language enhancement to be
  evaluated task by task after the complete AI-off vertical slice. Evidence,
  not its appealing size or the title "GM," determines whether any capability
  is recommended.
- Eternal Hero is the safe default. Legacy is opt-in; fully Mortal play remains
  a later explicit opt-in. Danger comes from lasting loss and changed history,
  not surprise deletion of a years-old hero.
- Progression, active content, history working sets, model work, storage, and
  visual resources are all bounded. The world grows through changing context,
  combinations, responsibilities, eras, relationships, and provenance—not
  infinite stats or an infinite hotbar.
- Living Pixel Chronicle is the provisional visual direction, subject to
  golden-scene validation. Ninja Adventure is a curated scaffold, not the
  finished identity.

## Method

Six independent specialists red-teamed the existing `PLAN.md`:

- [A1] comic-book/D&D continuity and long-campaign critic;
- [A2] embodied RPG hero and lived-experience critic;
- [A3] systems game designer;
- [A4] visual designer and permissive-asset forager;
- [A5] workday spectator and wow-factor critic;
- [A6] JavaScript, browser, persistence, and web-graphics engineer.

The facilitator read each first-round report, produced a synthesis with 17
contested questions, then every specialist responded to all questions and to
the other roles' concerns. This report adjudicates those six reconciliation
responses. The companion backlog contains the implementation work and coverage
matrix.

All agents searched the local cross-session recall index first and reported no
relevant prior-session result. No recalled recommendation is being passed off
as new evidence. The work explicitly reuses the original game's useful ideas:

- [automatic state machine and milestone saves](https://github.com/huntergdavis/The_Grind/blob/master/src/com/hunterdavis/thegrind/Panel.java#L186-L415);
- [fixed update/render loop](https://github.com/huntergdavis/The_Grind/blob/master/src/com/hunterdavis/thegrind/CanvasThread.java#L34-L157);
- [persistent selectable character model](https://github.com/huntergdavis/The_Grind/blob/master/src/com/hunterdavis/thegrind/Player.java#L9-L299);
- [SQLite save schema](https://github.com/huntergdavis/The_Grind/blob/master/src/com/hunterdavis/thegrind/InventorySQLHelper.java#L8-L75);
- [curated content catalogues](https://github.com/huntergdavis/The_Grind/blob/master/res/values/strings.xml#L8-L1957);
- the always-visible what/where/why/now hierarchy shown in the original
  [screenshots](https://github.com/huntergdavis/The_Grind/tree/master/deploy) and
  [drawing code](https://github.com/huntergdavis/The_Grind/blob/master/src/com/hunterdavis/thegrind/Panel.java#L659-L950).

## Each role's red-team verdict

### A1 — Comic/D&D continuity

Verdict: the plan had the bones of a campaign but treated eternity like a
longer quest. A 360M model cast as sovereign GM would be the weakest link.
Persistent every-creature state, endless vertical levels, compulsory dungeon
bosses, cutscene-immunity villains, and an unbounded canon would eventually
collapse.

Material contribution retained:

- deterministic GM stack and strict model authority contract;
- adventure/saga/era hierarchy, promise ledger, faction fronts, authored plot
  kernels, earned betrayals, rival survival rules, and dungeon history/ecology;
- vertically bounded progression with bounded active and retained horizontal
  sets;
- explicit catch-up significance thresholds;
- century-scale storage concern and normative artifact-retention matrix;
- social/non-combat Phase 1 kernel;
- semantic visual recipes rather than atlas coordinates;
- provenance-bearing cross-campaign legends rather than meaningless flavor.

### A2 — Embodied RPG hero

Verdict: the plan described attributes and progression but not yet a life. The
hero lacked an inner self, relationships were scores rather than bonds, places
were useful rather than meaningful, and invisible autoplay choices risked
feeling puppeted.

Material contribution retained:

- a deterministic Actor Policy separated from campaign pacing;
- values, beliefs, loyalties, fears, commitments, stress, known alternatives,
  and evidence-backed decision rationales;
- asymmetric relationships, homes, rituals, rest, grief, recovery, and
  significance-aware catch-up;
- Eternal/Legacy/Mortal lifecycle policies and lasting non-terminal danger;
- exact retention for referenced vows, letters, clues, inscriptions, and
  pivotal dialogue;
- separate sensory and emotional intensity;
- identity-preserving entity promotion/demotion and re-encounter tests.

### A3 — Systems game design

Verdict: the plan had an excellent technical spine and an extensible demo, but
not yet proven multi-horizon play. Procedural variety could become renamed
sameness; modules could inflate each other; autoplay could conceal agency; and
constant spectacle could become wallpaper.

Material contribution retained:

- moment, scene, adventure, workday, saga, and lifetime loops that feed one
  another;
- deterministic Campaign Director using target envelopes, cooldowns, budgets,
  and reason codes rather than one optimized "fun score";
- failure/recovery, fronts, adaptive rivals, memory crystallization, living
  equipment, world eras, and a chronicle/museum;
- module admission rules requiring a new decision shape, two real system
  interactions, a sink/tradeoff, and visible consequence;
- representative long-run simulation and repetition tests;
- staged P0 contracts followed by P1 production proof.

### A4 — Visual design and asset foraging

Verdict: the plan named visual modes without defining an art language, camera
grammar, identity pipeline, licensing manifest, accessibility projection, or
resource budgets. Without those, a structurally good world would look like a
collage of asset packs.

Material contribution retained:

- provisional Living Pixel Chronicle direction;
- 16×16-rooted world art and 320×180 landscape reference camera, with native
  DOM text and explicit responsive portrait composition;
- stable cross-mode identity recipes, custom portrait parts, six side-view
  battle puppets in P1, landmark continuity, and one dominant hero effect per
  shot;
- verified/conditional/rejected asset shortlist and exact license caveats;
- bundle, atlas, texture, draw, particle, actor, accessibility, and context-loss
  budgets;
- Campaign Director emits factual urgency only; Spectator Director alone owns
  camera, shot, effect, transition, and asset-cost choices.

### A5 — Workday spectator

Verdict: multiple scene modes do not by themselves make an eight-hour
screensaver. The plan needed a glance contract, visual sentences, interruption
recaps, attention rhythm, repetition memory, work-safe defaults, burn-in
controls, power measurements, and an alternate objective that actually passes
through the presentation pipeline.

Material contribution retained:

- three-second and ten-second comprehension gates;
- semantic scene fingerprints instead of forced mode churn;
- living atlas, town diorama, dungeon thread, tactical theater, camp
  constellation, chronicle, relationship/bestiary/legacy views;
- rare earned spectacle with quiet but purposeful ambient presentation;
- camera-motion, meaning-bearing dialogue dwell, burn-in, OLED, battery/power,
  and percentile frame gates;
- a minimally presented non-dungeon Phase 1 kernel.

### A6 — JavaScript/browser/web graphics

Verdict: a page cannot promise hidden execution; `sessionStorage` cannot keep a
years-old hero; workers do not create GPU capacity; append-only forever is a
storage failure; and informal module/worker boundaries would become a
distributed monolith.

Material contribution retained:

- main-thread Pixi WebGL, dedicated simulation and narrator workers, and a
  cache-only service worker;
- sole state ownership, exclusive Web Lock, runtime-validated revisioned IPC,
  bounded queues, keyed RNG, canonical serialization, and enforced dependency
  direction;
- transactionally installed hash-chained segments, two verified heads,
  copy/migrate/validate/switch migrations, quota recovery, and export/import;
- safe service-worker activation and project-prefixed caches;
- Runtime Governor, context/device-loss recovery, task-specific LLM token
  bucket, exact reference-device protocol, and percentile performance gates;
- security and accessibility boundaries for model text, saves, content packs,
  CSP, motion, flashes, and audio.

## Final consensus

The council unanimously or near-unanimously agrees that:

1. deterministic code owns canon, legality, math, consequences, balance, actor
   knowledge, and persistence;
2. the local model is optional and never required for story correctness;
3. web "forever" is durable continuity and bounded catch-up, not continuous
   hidden execution;
4. personhood, narrative ledgers, progression caps, fidelity tiers, persistence,
   and visual identity require thin Phase 0 schemas because they are expensive
   to retrofit;
5. production art, five polished scenes, representative graphical soaks, and
   broad content validation belong in Phase 1, not as prerequisites to first
   pixels;
6. Eternal Hero is default, but failure must leave visible, durable history;
7. no mechanically consequential progression or active-content set is
   unbounded;
8. exact recent history can compact into durable semantic evidence and pinned
   artifacts; ordinary prose and diagnostics can expire;
9. "real" towns, NPCs, and monsters mean persistent causality at tiered
   fidelity, not equal simulation cost for every fish and peasant;
10. a workday presentation needs deliberate calm, readable choices, recaps,
    rare spectacle, and measured repetition—not random mode rotation;
11. art consistency, accessible native text, asset provenance, and strict
    budgets are product architecture;
12. every new subsystem must deepen the shared world instead of becoming an
    isolated currency faucet.

## Conflicts and final resolution

### 1. Is the model the Game Master?

Resolution: no. **Game Master** is the user-facing umbrella for the deterministic
stack plus optional language services. Product copy may give that stack a
personality. Diagnostics must identify the actual component and reason code.

SmolLM2 may render short language or, if a separately evaluated task passes,
rank a small allowlisted set. It cannot invent a candidate, repair an illegal
candidate by changing truth, exercise a veto, write state, or remember canon
from transcript context. [A1][A2][A3][A4][A5][A6]

### 2. Who chooses a character's action?

Resolution: add deterministic **Actor Policy**. The Campaign Director exposes
legal situations and opportunities; Rules Engine validates commands; Actor
Policy chooses among actor-known alternatives from goals, values, beliefs,
commitments, relationships, stress, and tactics. Spectator and language
services cannot change the choice. [A2], supported by [A1][A3][A5][A6]

### 3. What does forever mean in a browser?

Resolution: visible play can run all day; hidden/closed execution is not
promised. On visibility loss the app durably commits or rolls back the pending
beat, stops rendering/inference, and never relies on an unload save. On resume
it journals one wall-clock observation and performs bounded hierarchical
catch-up. This follows [Chrome Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api),
[MDN Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API),
and [IndexedDB shutdown guidance](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB).

Every event type declares:

```ts
type AttentionPolicy =
  | "backgroundSafe"
  | "queueForPresentation"
  | "forbiddenDuringCatchUp";
```

It also declares reversibility, maximum entity fidelity affected, threshold
behavior, maximum credited duration, aggregation rule, and queued fallback.
Catch-up may advance routine travel, passive recovery, production, weather,
seasons, markets, aggregate ecology, schedules, construction, and faction
pressure only below named thresholds. It stops before named injury/death,
capture, betrayal, relationship milestones, boss/rival outcomes, class/loadout
branches, unique items, named-place control/destruction, revelations, actor
promotion, hook closure, era transition, or any informed irreversible choice.
Queued attention events remain bounded and causally ordered. [A1][A2][A3][A4][A5][A6]

### 4. Eternal hero or mortality?

Resolution: save-versioned policies:

- **Eternal Hero** — default; no involuntary protagonist terminal death;
- **Legacy** — opt-in retirement/death and succession in the same world;
- **Mortal** — reserved for a later explicit opt-in.

Eternal Hero still permits failed promises, permanently missed opportunities,
scars, changed abilities, debt, capture, damaged homes, lost office/reputation,
unique-item loss/transformation, companion estrangement/departure, rival/front
victory, altered law, and changed towns. Recovery has cost and may not restore
the old status quo. [A1][A2][A3][A4][A5][A6]

### 5. Can breadth grow without bound?

Resolution: no gameplay-effective or active-content axis is unbounded. The
final wording is:

> Progression is vertically bounded and indefinitely extensible horizontally,
> with bounded active loadouts, working sets, detailed memories, inventories,
> collections, relationships, promises, institutions, and economic influence.

Action economy, multiplicative stacks, active statuses, prepared abilities,
mechanically active traits, scars, titles, pets, currencies, and inventories
all have explicit caps plus replacement, retirement, or archive rules. Old
wolves stay weak. Monotonic order markers such as simulation tick and era
ordinal use a versioned large-integer codec, add no power, and never require
iteration from zero. [A1][A2][A3][A4][A5][A6]

### 6. How much history is retained?

Resolution: distinguish semantic evidence from raw presentation.

Retention classes are:

- `canonicalEvidence` — current truth and identity-bearing evidence;
- `chronicleArtifact` — exact bounded artifact bytes with provenance;
- `recentProse` — short-lived replay/debug cache;
- `ephemeralProse` — discardable barks/drafts;
- `diagnostics` — bounded ring buffers;
- `optionalArchive` — exportable full-detail history.

Canonical evidence preserves campaign identity/version provenance, named-entity
identity/lifecycle, major choices and rationales, promises and closure reasons,
relationship milestones, unique-item ownership/transformation, irreversible
place/faction/institution changes, saga/era conclusions, and structural model
proposals that affected selection.

Exact artifact bytes are pinned for referenced vows, contracts, letters,
prophecies, clues/passwords, inscriptions, epitaphs, named-item dedications,
chapter titles, player favorites, and pivotal dialogue later cited by memory or
promise. Ordinary barks, full combat transcripts, unused drafts, and camera
choices may be purged. Pinning has visible slot/quota rules; quota pressure
offers export or explicit unpinning, never silent deletion.

The original 250 MB/ten-year gate was challenged as incompatible with the
forever claim. Final target: the mandatory campaign record is at most 100 MB
after 100 accelerated campaign-years and averages at most 1 MB/year after
warm-up, excluding model/asset caches and optional archives. This is a strict
target to validate, not a claim already proven. If the hot record approaches
its budget, older detail must be exported and replaced by verified era evidence
and summaries before play continues; the application must not silently erase a
referenced artifact. [A1 minority concern accepted; A2][A3][A4][A5][A6]

### 7. Who owns campaign pacing, presentation, and performance?

Resolution: three separate components.

- **Campaign Director:** legal objective candidates, promise/front state,
  difficulty bands, recovery debt, systemic repetition, causal readiness, and
  reason-coded scheduling. It submits commands; Rules Engine alone commits.
- **Spectator Director:** factual focus projection, mode, lens, camera, shot,
  dwell, transition, effect, asset-cost choice, sensory intensity, recaps,
  presentation repetition, and what the viewer has seen.
- **Runtime Governor:** frame deadlines, worker health, memory/storage pressure,
  save latency, context/device loss, inference duty, and fidelity/profile
  fallback. It may make execution cheaper, never change a canonical outcome.

Campaign Director may emit factual focus, dramatic priority, stakes class, and
presentation deadline. It does not choose a camera, shot, effect, transition,
or asset. No component optimizes one scalar fun score. Soft targets are rolling
diagnostics/envelopes subordinate to legality, actor integrity, causal
prerequisites, and earned consequences. [A1][A2][A3][A4][A5][A6]

### 8. How much spectacle and repetition?

Resolution: measure **sensory** and **emotional** intensity separately. A quiet
funeral may be emotionally severe and visually calm.

Over rolling one-, two-, and eight-hour foreground reports, calm sensory
presentation targets 65–80%, high sensory presentation is capped at 8%, and
medium is the remainder with a 15–30% target where the bands are compatible.
These are tuning diagnostics, not quotas that manufacture scenes. The hard
safety rule is no uninterrupted high-sensory burst over 12 seconds; a longer
battle must breathe through planning, reaction, and consequence. At least 45
seconds of low-sensory recovery is a target after a true climax. An interesting
ambient observation may satisfy a 2–5-minute beat; a 20–40-minute peak is an
opportunity/cooldown, never an obligation.

No accidental exact semantic scene fingerprint repeats inside 20 minutes.
Coherent multi-shot sequences, rituals, callbacks, match cuts, and before/after
comparisons may reuse framing when tagged with sequence/motif/comparison IDs,
change factual context, and show a visible delta. Forced renderer changes to
satisfy a quota fail review. [A1][A2][A3][A4][A5][A6]

### 9. What must be legible at a glance?

Resolution: restore a two-tier test.

- Within three seconds, at least 80% of fresh viewers identify the focused
  party/actor, place, current action, and latest material change.
- Within ten seconds, at least 80% additionally identify immediate goal and
  stakes and, during a major decision, the chosen rationale.

Always or immediately glance-visible: party/focus, place, action, goal, one
stake, latest consequence, relevant speaker/reaction, and critical tactical
status only when needed. Alternatives and one-line rationale appear around
major deliberation, then collapse into the Chronicle. Full stats, formulas,
inventory, skill tree, relationship evidence, promise ledger, actor beliefs,
maps, history, and director traces remain inspectable. Meaning-bearing dialogue
holds for at least four seconds plus roughly 180 words/minute; two seconds is
permitted only for nonessential barks. [A1][A2][A3][A4][A5][A6]

### 10. Is Living Pixel Chronicle final?

Resolution: it is the **versioned provisional baseline**, not an irrevocably
frozen style. P0 creates reference mockups/contact sheets, semantic identity
contracts, and one executable responsive smoke scene. P1 golden scenes may
reject or refine the direction before broad production.

The 320×180 target is a landscape reference camera, not a forced aspect ratio.
Use integer nearest-neighbor scaling and letterboxing or world-viewport
extension on compatible desktop sizes. Portrait uses a distinct safe-zone-aware
composition and native DOM layout; it never squeezes a desktop dashboard or
blurs source pixels. DOM text remains native resolution and scalable.

Saves store semantic identity/landmark recipe IDs and traits—not atlas
coordinates, frames, or source-pack filenames. Repacking an atlas must preserve
equivalent appearance. [A1][A2][A3][A4][A5][A6]

### 11. Which performance targets are final?

Resolution: Workday 30 FPS is default, Eco 15–20 FPS is manual/automatic,
Showcase 60 FPS is optional, and Hidden renders zero frames. All numeric budgets
are provisional until measured on a reproducibly named machine. P0 must record
exact laptop SKU, CPU/GPU/driver, RAM, OS/browser builds, display/refresh,
brightness, plugged/battery state, power profile, and thermal conditions.

Retained budgets:

- app-shell JavaScript ≤350 KB gzip; shell art/fonts ≤2 MB compressed;
- first playable scene ≤10 MB; Phase 1 2D visuals ≤5 MB; base cache ≤10 MB;
- later visual packs ≤1.5 MB each; optional 3D proof ≤12 MB;
- atlas ≤2048²; texture allocation ≤64 MB with the model loaded and ≤96 MB
  without; no-model JS heap <192 MB after warm-up; measured game+model footprint
  <900 MB;
- Workday/Eco draw calls ≤200/100, particles ≤500/100, animated actors ≤80/30;
- main-thread render average ≤4 ms and p95 ≤6 ms; measurable GPU average ≤8 ms
  and p95 ≤12 ms;
- Workday game-owned frame production p95 ≤25 ms, p99 ≤33 ms, and <1% missed
  deadlines; Eco p95 ≤50 ms at 20 FPS or ≤66 ms at 15 FPS and <1% missed;
- Showcase p95 ≤16.7 ms, p99 ≤25 ms, and <2% missed is a best-effort profile,
  not a correctness gate;
- no more than one game-attributable >50 ms long task per ten steady-state
  minutes; post-warm-up heap slope <1 MB/hour;
- one-hour power above a static equivalent page ≤5 W Workday and ≤2.5 W Eco on
  the named machine where measurable; fixed-brightness battery drain is also
  reported, with <10%/hour Workday and <5%/hour Eco as secondary targets;
- GPU/VRAM numbers are reported only where supported; missing signals are
  explicitly unmeasured, never assumed passed.

### 12. Is SmolLM2-360M the default?

Resolution: no. It is the first **evaluation target** after the complete AI-off
P1 slice. The first download is explicit and shows its approximate 204 MB size,
storage impact, expected memory, removal control, and AI-off alternative. A
WebGPU capability probe is necessary but not evidence of narrative value.

Likely first tasks are short voice-card rewrites, relationship-specific barks,
letters, journals, dreams, item/monster observations, inscriptions, reactions,
and chapter headlines. Factual recaps stay deterministic initially. Advisor,
Critic, plot ranking, and visual-tag ranking are separate lower-confidence tasks
and remain disabled unless independently successful.

Each task requires at least 200 fixed paired samples over at least 20 seeds,
automated fact/knowledge/schema checks, and blinded human comparison with
deterministic templates. A task is recommendable only when:

- valid model output wins at least 60% of non-tied comparisons and the 95%
  confidence lower bound exceeds 50%;
- first-pass normalized schema validity is at least 99%;
- zero displayed/accepted fact or knowledge violations occur after validation;
- reference-hardware latency, memory, frame, energy, thermal, and duty budgets
  pass;
- missing WebGPU, failed/removed cache, malformed output, timeout, worker death,
  model-version change, or device loss immediately falls back to templates and
  preserves save validity.

Campaign code maintains at least three valid AI-independent scene candidates.
The Narrator may cache purgeable prose variants; presentation never waits for
them. Its token bucket allows a burst of two standard calls per ten minutes,
with sustained Workday ≤1,000 output tokens/hour and <3% inference duty, Eco
≤250 tokens/hour and <1% duty, and roughly 700 input/96 output tokens per
standard call. The Runtime Governor suspends inference on missed deadlines,
memory/quota pressure, worker loss, or GPU/context loss.

Primary sources: [SmolLM2-360M-Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct),
[WebLLM](https://github.com/mlc-ai/web-llm), and the
[WebLLM registry/cache configuration](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts).

### 13. How broad is Phase 1?

Resolution: one polished town→travel→dungeon→return adventure plus three
architecturally distinct simulation kernels:

1. expedition/discovery — routes, supplies, spatial uncertainty, and returned
   knowledge;
2. rescue/defense — deadline, protection/triage, partial success, and visible
   community consequence;
3. investigation/diplomacy — facts versus beliefs, testimony/trust, and a valid
   non-combat resolution.

The generic Adventure contract may not require a dungeon, combat encounter,
boss, or BossDefeated event. Run at least 30 seeds per kernel and demonstrate
success, partial-success, retreat, and failure. At least one kernel completes
without dungeon, boss, or combat and depends on knowledge/relationship
evidence. At least one alternate non-dungeon kernel passes minimally through
the real scene-contract/presentation pipeline and appears in the two-hour gate;
it does not require a second set of polished art. [A1][A2][A3][A4][A5][A6]

### 14. What belongs in P0?

Resolution: compatibility contracts and thin runnable proofs, not production
polish.

P0 retains lifecycle/authority/clocks/RNG/IPC/persistence/compaction contracts;
thin personhood, belief/memory/promise, fidelity, progression, scene, identity,
accessibility, security, provenance, resource, and diagnostics schemas; a
working transaction/replay/fault harness; reference mockups; one responsive
renderer and cross-mode identity smoke proof; and 10 seeds × 1,000 in-game days.

P1 owns all five polished anchor scenes at target viewports, production camera
grammar, identity collision review, full asset/contact-sheet work, 100 seeds ×
10,000 days, million-event replay/compaction, two/eight-hour rendered soaks, and
seven-day resume. P3 owns 100,000-generation-seed and full upgrade/failure
release matrices. No compatibility-bearing concern was deleted; gates moved to
the first phase where representative content makes them meaningful.

### 15. Are tiered entities still real?

Resolution: yes. Reality means continuous causality. Fidelity tiers are
`canonicalNamed`, `supporting`, `aggregate`, and `ephemeral`.

Promotion records stable origin/provenance and entity IDs, source
cohort/population, generator/content version, time/place, species/role/age,
visual/voice recipe, home/job/faction/ecology role, current condition/location,
possessions, knowledge, relationships, obligations, source events, and the
promotion cause. It atomically subtracts the actor from its aggregate.

Demotion keeps a compact identity shell: ID/aliases, status/location/last-seen,
visual/voice recipe, rehydration version, unique possessions, scars, bonds,
grievances, secrets, promises, relationships, chronicle links, aggregate
destination, and eligibility proof. An entity referenced by a promise,
relationship, unique item, named scar, viewer pin, or unresolved front cannot
demote below the fidelity needed to preserve it. Aggregate updates reserve named
actors so they cannot duplicate or die anonymously.

### 16. Should antagonist cutaways exist?

Resolution: `party-only` is default. Later `dramatic-irony` mode uses a typed
Viewer Disclosure Ledger and scenes clearly labeled "Meanwhile — unknown to
the party." Viewer facts never enter actor beliefs, Actor Policy inputs,
Narrator actor packets, Rules Engine knowledge checks, or party recaps until an
independent in-world transfer event occurs. Both presentation policies produce
the same canonical campaign and actor-choice hashes. [A2][A3][A4][A5][A6]

### 17. Can separate campaigns ever meet?

Resolution: independent campaign worlds do not share mutable state. A future
Hall of Legends may import an immutable, content-addressed `LegendCard` with
source campaign ID/hash. The receiving world can canonically contain the card
as a book, rumor, dream, monument, or claimed legend, but the foreign events do
not become objective receiving-world history. Actors learn it only through
explicit events. Deleting or changing the source cannot break the receiving
save. [A1 minority refinement accepted; compatible with A2][A3][A4][A5][A6]

## Corrected runtime and Game Master architecture

```text
Main thread
  App shell + Runtime Governor
  DOM accessibility / Chronicle
  Spectator Director -> validated presentation intent
  Pixi WebGL + Presentation Time
            ^
            | revisioned read-only projection patches (<=10 Hz)
            |
Dedicated simulation worker — sole WorldState owner and campaign writer
  Rules Engine — validates commands, commits events, reduces truth
  Campaign Director — ranks/submits legal opportunities
  Actor Policy — chooses actor actions from known legal alternatives
  Simulation Tick + World Clock + Attention Clock
  keyed/counter RNG + invariants + module scheduler
  IndexedDB transactions/compaction + exclusive campaign Web Lock
            |
            | bounded facts and enumerated IDs
            | normalized structural proposal journaled before use
            v
Dedicated narrator worker
  deterministic templates OR optional WebLLM task
  Narrator / separately gated Advisor / separately gated Critic
  no WorldState write, campaign IndexedDB write, or canonical authority

Service worker
  versioned static app/assets only
  no simulation, inference, campaign ownership, or unconditional skipWaiting
```

Canonical effects have one write path: validated Rules Engine commands/events.
Actor Policy is deterministic. Campaign Director reason codes cannot override
actor moral boundaries, combat results, causal prerequisites, or earned loss.
Spectator/Runtime-only changes produce the same canonical hash.

Worker envelopes carry protocol version, campaign ID, worker epoch, request ID,
expected revision, message kind, and runtime-validated payload. Duplicate,
stale, reordered, oversized, unknown, or wrong-version messages cannot mutate
state. Queues are bounded and backpressured.

Simulation reducers use sorted canonical serialization, stable scheduling,
integer/fixed-point outcomes where needed, and versioned keyed randomness such
as `random(seed, domain, entityId, tick, purpose, ordinal)`. `Math.random`,
ambient wall time, locale-sensitive ordering, DOM, Pixi, IndexedDB, and WebLLM
are forbidden in reducers.

Pixi stays on the main thread initially. OffscreenCanvas remains an
evidence-triggered optimization because moving rendering does not create more
physical GPU capacity. See [Pixi renderer guidance](https://pixijs.com/8.x/guides/components/renderers)
and [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas).

Campaigns use IndexedDB, not `sessionStorage`; the latter is only for disposable
tab UI. Use immutable 1–4 MB hash-chained event segments, at least two verified
heads, atomic install/head advance, copy→migrate→validate→switch migrations,
compaction after 10,000 events or 25 MB, project-prefixed caches, quota recovery,
explicit export/import, and an exclusive [Web Lock](https://www.w3.org/TR/web-locks/)
per campaign. Sources: [MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage),
[storage quota and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria),
and [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB).

The service worker caches static versioned resources only. It must not own
simulation or inference and must not unconditionally call `skipWaiting()`.
Updates install, wait, checkpoint at a safe boundary, activate, and reload.
See [service-worker lifecycle](https://web.dev/articles/service-worker-lifecycle)
and [safe PWA updates](https://web.dev/learn/pwa/update).

## Long-term game design

### Narrative horizons

`beat → scene → adventure → chapter → saga → era → legacy`

Every level declares an open dramatic question, entry conditions, eligible
constraints, escalation, closure, and maximum active lifetime. Active hooks are
bounded; a hook resolves, becomes dormant, or closes with a reason. Betrayal
requires motive, opportunity, at least two visible setups, cost, and aftermath.
Rivals recur only through valid survival/resources and visible adaptation.

### Personhood and relationships

Characters have drives, values, beliefs, loyalties, fears, preferences, moral
limits, commitments, intentions, stress, tactics, and evolving identity.
Relationships are asymmetric and evidence-backed: trust, respect, affection,
fear, dependence, shared rituals, obligations, grievances, forgiveness,
departure, reconciliation, and grief. Homes, favorite places, ordinary rest,
meals, hobbies, celebrations, and return-after-absence reactions create the
baseline that makes loss and change matter.

### Failure and progression

Every major objective defines success, partial success, retreat, and failure.
Failure continues through inconvenience, resource/time loss, injury/scar,
relationship/reputation damage, failed promise, capture/displacement, and only
policy-permitted retirement/death. At least 90% of major Eternal Hero failures
leave a trace visible one chapter later unless an explicit costly recovery
closes it.

Numerical power is capped. Long-term play uses prepared tactical sidegrades,
class mastery, changing roles, living equipment, creature knowledge/bonds,
relationships, institutions, projects, titles, collections, homes, protégés,
political authority, and world eras—all with bounded active sets and archive
rules.

### Module admission

A new module must:

1. create a new decision shape and clear visual verb;
2. produce canonical cause/effect in at least two existing systems;
3. reuse at least one existing resource/relationship/world axis and introduce
   no new currency unless existing resources cannot express the cost;
4. include a sink, cost, tradeoff, or opportunity cost;
5. create a presentation scene or unmistakable visible consequence;
6. declare fidelity tiers, catch-up behavior, resource cost, migrations, and
   determinism/inflation/repetition tests;
7. remain optional to the core campaign.

Fishing is the exemplar: water/time/weather/bait/technique/keep-release choices;
ecology depletion/migration; supply, market, cooking, relationship, clue, and
festival effects; time/bait/tackle/inventory/reputation costs; and visible
shoreline, journal, market, meal, relationship, or depleted-water consequences.
It must not create Fishing XP Coins.

## Workday presentation and visual direction

Every scene declares focus entities, place, headline, action, goal, stake,
latest consequence, information lens, intensity, dwell/read time, factual
before/after, fallback, accessibility projection, safe zones, cost tier, assets,
and semantic repetition fingerprint. Major decision scenes also declare known
alternatives, chosen action, and rationale.

The compact native-DOM Chronicle preserves the original game's what/where/why/
now clarity. It occupies no more than 20% of normal landscape area, can dim,
collapse, or move 8–20 px to reduce burn-in, and returns in one action. No
bright static panel remains fixed for more than five minutes. OLED mode removes
persistent bright panels. Camera ambient pan stays at or below 0.25 viewport per
second; no continuous zoom oscillation; Workday impact shake stays at or below
4 CSS px for 150 ms and disappears under reduced motion.

Living Pixel Chronicle uses:

- warm top-down pixel dioramas rooted in a 16×16 grid;
- a generated illustrated atlas with geography, routes, weather, discoveries,
  and faction fronts—not merely a zoomed-out tile map;
- stable layered portraits and semantic actor identity across exploration,
  dialogue, and 32–48 px side-view battle puppets;
- towns readable through landmarks, districts, occupation, crowds, weather,
  lights, construction, damage, seasons, and return history;
- dungeon fog, route history, locks/keys, ecology, palette zones, and landmark
  continuity into eventual 3D;
- one dominant hero effect per shot, with spectacle from composition, lighting,
  weather, crowds, spells, and rare camera emphasis;
- Atkinson Hyperlegible Next native DOM body text; pixel fonts only for short
  decorative headings.

Accessibility remains a hard gate: body/HUD text at least 16 CSS px, dialogue
at least 18 px, scale to 200%, contrast at least 4.5:1, no color-only state, no
flashing above 3 Hz, equivalent DOM Chronicle, muted startup, user-enabled
audio, global pause/stop/hide, and `prefers-reduced-motion` support. Sources:
[W3C reduced motion](https://www.w3.org/WAI/WCAG22/Techniques/css/C39.html),
[W3C three-flashes guidance](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold),
and [browser autoplay constraints](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).

## Visual assets and licensing

License approval is attached to the exact imported bundle, included license
text, source snapshot/date, hash, per-file author/license scope where applicable,
and modification record. A mutable source page alone is not the manifest.

### Approved foundations

- [Ninja Adventure](https://pixel-boy.itch.io/ninja-adventure-asset-pack) — the
  publisher page, updated 2026-08-07, states CC0, permits commercial use, says
  attribution is optional, and applies that statement to "any and all" package
  assets. Approved as a curated 2D scaffold only. Do not ship its 89 MB authoring
  archive. Review packaged fonts, music, and sounds file by file because the page
  mentions outside production inputs. It does not by itself supply enough
  generic-fantasy identity, portraits, dungeon depth, or classic side-view
  battle art. [A4]
- [Atkinson Hyperlegible Next](https://github.com/googlefonts/atkinson-hyperlegible-next)
  — SIL OFL 1.1. Pin the exact version and retain the OFL text. Approved for
  body, dialogue, logs, statistics, and accessibility UI. [A4]
- KayKit [Dungeon](https://kaylousberg.itch.io/kaykit-dungeon-pack),
  [Adventurers](https://kaylousberg.itch.io/kaykit-adventurers),
  [Animations](https://kaylousberg.itch.io/kaykit-character-animations), and
  [Forest](https://kaylousberg.itch.io/kaykit-forest) — the publisher pages state
  CC0, commercial use, and no attribution requirement. The publisher also asks
  users not to resell unmodified copies or claim authorship; honor that request
  by shipping only selectively optimized game assets, never source bundles.
  Approved as one coherent future 3D proof family after 2D long-haul gates. [A4]

### Conditional sources

- [0x72 DungeonTileset II](https://0x72.itch.io/dungeontileset-ii) — base pack
  states CC0. Use as reference/redraw input only after palette, outline, grid,
  animation, and tile-seam validation. Linked third-party extensions require
  independent license review. [A4]
- [Game-icons.net license](https://github.com/game-icons/icons/blob/master/license.txt)
  — CC BY 3.0 by default; only specifically identified contributors are CC0.
  Per-file author tracking, attribution, and generated credits are mandatory.
  Use only in a coherent monochrome UI plane. [A4]
- Kenney [Tiny Town](https://kenney.nl/assets/tiny-town),
  [Tiny Dungeon](https://kenney.nl/assets/tiny-dungeon), and
  [Tiny Battle](https://kenney.nl/assets/tiny-battle) — listed as CC0 fallback,
  placeholder, or minimap sources. Verify and hash each actually imported pack
  against its own primary page and included license. They are too sparse to be
  the primary identity. [A4]
- [Quaternius Medieval Village MegaKit](https://quaternius.com/packs/medievalvillagemegakit.html)
  — publisher declares CC0 and commercial use; 60–70% of the pack is free. It is
  an alternative 3D family, not an additive pack to mix casually with KayKit.
  [A4]

### Rejected for this project

- [Tiny Swords](https://pixelfrog-assets.itch.io/tiny-swords) — the current
  custom license permits use and modification in commercial games but prohibits
  redistribution/repackaging; a separately named old archive is CC0. Reject the
  current pack for this project's standardized permissive/open asset policy and
  visual mismatch. Do not imply ordinary game use is forbidden or treat the old
  archive as covering current files. [A4]
- [Sprout Lands free pack](https://cupnooble.itch.io/sprout-lands-asset-pack) —
  free tier is non-commercial and prohibits redistribution; premium uses
  different custom terms. Style also conflicts. [A4]
- unreviewed OpenGameArt/community-extension collage — license varies per file
  and mixing destroys visual authorship;
- runtime AI-generated raster sprites/portraits — unstable identity, animation,
  offline, and art-direction costs. Reviewed build-time concepts with manual
  pixel cleanup remain allowed. This rejection does **not** cover deterministic
  procedural geography, towns, palettes, lighting, weather, crowds, particles,
  map lines, or canonical actor assembly. [A4][A5]

## Rejected and deferred ideas

1. **Campaign saves in `sessionStorage`: rejected.** It is per-tab and cleared
   on close. Use IndexedDB plus export/import. [A6]
2. **Sovereign GM LLM: rejected.** The model cannot ensure balance, continuity,
   memory, or long-horizon fun. [A1][A2][A3][A5][A6]
3. **Continuous hidden rendering/inference: rejected.** Browser lifecycle and
   power constraints make it unreliable and wasteful. [A4][A5][A6]
4. **Seed-only replay after model influence: rejected.** Journal normalized
   structural proposals as external inputs before effects. [A6]
5. **Mutable global/category RNG streams: rejected.** Keyed/counter RNG prevents
   unrelated calls from shifting the future. [A6]
6. **Uncompacted append-only history: rejected.** It eventually exhausts origin
   quota and memory. Use verified checkpoints, semantic compaction, pinned
   artifacts, and optional archives. [A1][A2][A3][A6]
7. **Service worker simulation/inference: rejected.** Its lifetime is not
   reliable; it owns only static cache/version behavior. [A6]
8. **Unconditional service-worker `skipWaiting()`: rejected.** It risks
   old-code/new-resource skew in long-lived clients. [A6]
9. **Foundation-time OffscreenCanvas: deferred.** Revisit after P1 only if a
   reproducible profile shows main-thread rendering is the bottleneck and a
   prototype improves missed deadlines without raising failures. [A6]
10. **Infinite stats, collections, active breadth, or universal enemy scaling:
    rejected.** They erase old-world meaning and eventually break storage,
    balance, and legibility. [A1][A2][A3][A5]
11. **Surprise default mortality: rejected.** Mortal play remains explicit
    opt-in; Eternal Hero still suffers lasting loss. [A1][A2][A3]
12. **Boss/betrayal formula: rejected.** Both remain available when causal,
    foreshadowed, costly, and rare enough to matter. [A1][A2][A3]
13. **Constant/default 60 FPS spectacle: rejected.** Showcase preserves the
    option; workday visual peaks remain rare and earned. [A2][A3][A4][A5][A6]
14. **Shipping full authoring/source archives: rejected.** Selectively optimized
    runtime assets are expected; licenses and attribution remain attached.
    [A4][A6]
15. **Executable third-party content packs: rejected for current scope.** Packs
    are declarative, validated, versioned, and subject to CSP/import limits. A
    future scripting proposal requires a separate threat model. [A6]
16. **One shared mutable world across independent character saves: deferred.**
    Legacy successors may share one campaign; independent campaigns stay
    isolated. Immutable LegendCards provide future cross-campaign flavor
    without conflicting clocks/writers. [A1][A6]
17. **Native wrapper: out of current scope.** It may be a separate future
    product, but the promised web experience cannot depend on it. [A6]
18. **Production 3D before long-haul 2D proof: deferred.** The optional KayKit
    proof moves to P3 after 2D identity, persistence, and eight-hour gates. A
    cheap topology experiment may occur earlier only through a time-boxed ADR
    that cannot delay P1. [A1][A3][A4][A6]

## Final build sequence

1. **P0 — Forever foundation:** compatibility-bearing contracts, security,
   thin personhood/story/visual schemas, deterministic/persistent skeleton,
   reference mockups, one responsive scene, small headless/fault smoke tests.
2. **P1 — Long-lived AI-off vertical slice:** one polished adventure, five
   anchor scenes, one minimally presented non-dungeon alternative, three
   simulation kernels, deterministic GM/Actor Policy, recovery, recaps,
   cross-mode identity, exact resume, 100×10,000-day and million-event tests,
   and two/eight-hour gates.
3. **P2 — Deep systemic world:** geography, towns, dungeons, classes, monsters,
   creatures, equipment, relationships, homes, fronts, rivals, eras, Legacy,
   identity art expansion, and task-specific SmolLM evaluation after AI-off P1.
4. **P3 — Disciplined expansion:** admitted activity modules, declarative
   content packs, optional model tiers/preferences, optional 3D proof,
   provenance-bearing LegendCards, and the full release/failure/upgrade matrix.

The revised architectural proof is a coherent 15-minute adventure that replays
exactly without AI, remains varied for two hours, survives an eight-hour
workday within measured budgets, closes for seven days and resumes coherently,
and accelerates through years without numeric, narrative, storage, or identity
collapse.

## Official technical sources retained

- [Chrome Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)
- [MDN Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
- [MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)
- [MDN storage quota and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [IndexedDB shutdown guidance](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)
- [Web Locks specification](https://www.w3.org/TR/web-locks/)
- [service-worker lifecycle](https://web.dev/articles/service-worker-lifecycle)
- [safe PWA update behavior](https://web.dev/learn/pwa/update)
- [Pixi renderer guidance](https://pixijs.com/8.x/guides/components/renderers)
- [WebGPU device loss](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost)
- [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
- [transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)
- [WebLLM worker/model integration](https://github.com/mlc-ai/web-llm)
- [WebLLM cache/integrity configuration](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)
- [CSP WebAssembly guidance](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src)
- [W3C reduced motion](https://www.w3.org/WAI/WCAG22/Techniques/css/C39.html)
- [W3C three-flashes guidance](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold)
- [browser autoplay constraints](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)

## Post-v0.2 red-team addendum — visible systems before more modes

Date: 2026-08-29. This addendum preserves the original council decisions and
records a new inspection of the shipped v0.2 code, its current responsive UI,
and the user's critique. Local recall (`deja`) returned this council thread but
no separate prior-session implementation advice, so no undocumented earlier
solution was reused.

### Facilitator verdict

The critique is correct. v0.2 is a useful deterministic browser foundation and
seven-scene presentation smoke test, but it is not yet an honest RPG vertical
slice. The worker protocol, keyed RNG, basic catch-up, IndexedDB campaign list,
named campaigns, and Pixi scene switching are worth preserving. The game state,
however, has no inventory, equipment, attribute block, quest graph, world-route
position, persistent town or maze topology, monster instance, or turn-based
combat state. Much of the visible RPG chrome is consequently a label, dash, or
hard-coded sentence rather than a projection of play.

The fixed `town → atlas → travel → dungeon → battle → camp → chronicle`
playlist also makes time advance without causes. A route marker derived from
the global tick is not travel; disconnected wall strokes are not a maze; an
instant random health subtraction followed by guaranteed gold and XP is not a
battle; and returning to the same town postcard is not a persistent place.
Every current screen needs a stateful verb and a visible consequence before the
project adds fishing, 3D, more modes, or in-browser inference.

### Six-role findings

- **A1 — Comic/D&D continuity critic:** the UI promises character sheets,
  quests, monsters, loot, and dungeons that the rules do not instantiate.
  Enemies are headlines rather than creatures, objectives cannot become canon,
  and a maze with no entrance-to-goal topology cannot support exploration,
  foreshadowing, locks, shortcuts, or earned boss encounters. [A1]
- **A2 — embodied RPG hero:** the hero cannot inspect attributes, choose a
  meaningful action, remember a route, possess or equip an item, pursue a
  subquest, recognize a revisited place, or see why health changed. A persistent
  log and stable world coordinates are required for the character to experience
  a continuous life rather than a slideshow. [A2]
- **A3 — systems designer:** seven presentation modes currently form a playlist,
  not interlocking loops. Build one complete causal adventure: route choice
  changes travel, travel discovers a town or dungeon, quest state motivates the
  delve, equipment and stats alter legal combat actions, and its outcome changes
  the quest, place, inventory, and Chronicle. [A3]
- **A4 — visual designer/asset forager:** the restrained 320×180 composition is
  a workable reference, but identical town geometry, tick-random dungeon lines,
  one monster silhouette, and unwired status placeholders erase identity. Use a
  single coherent, licensed prototype set with semantic sprite roles; visible
  variety must come from canonical place and entity state, not randomized
  decoration. [A4]
- **A5 — workday spectator:** abrupt postcard swaps do not yet look like someone
  playing. The watchable layer needs continuous route movement, maze discovery,
  readable combat intent/impact/reaction, item reveals, town changes, and a live
  consequence log. Spectacle should punctuate an understandable action, not
  conceal that no action occurred. [A5]
- **A6 — JavaScript/web-graphics engineer:** domain schemas must precede honest
  projections. Add typed events and canonical state for geography, quests,
  inventory, equipment, combat, and logs; then test reducers independently of
  Pixi. Preserve the sole simulation worker and keyed determinism. Patch stable
  display objects rather than clearing/rebuilding every scene, dispose resize/
  ticker listeners, and avoid refreshing every campaign record on each beat.
  [A6]

### Reconciled decisions

1. **One end-to-end depth slice wins over either architecture-only work or
   screen-only polish.** Each corrective item adds canonical rules, a tested
   projection, and a visible consequence together. Placeholder UI may land
   first for layout, but it does not satisfy an item until it reads real state.
   [A1][A2][A3][A4][A5][A6]
2. **Scenes are projections of activity, not a fixed timer carousel.** A typed
   activity/event chooses the scene; completion or interruption advances it.
   Scene pacing may still be director-controlled for a screensaver, but elapsed
   wall time alone cannot teleport the hero or award victory. [A1][A2][A3][A6]
3. **The status rail is persistent but layered.** Desktop shows actual current/
   maximum health, level/XP, six derived attributes, current quest and up to
   three subquests, route progress, equipped slots, and at least eight recent
   log events. Portrait keeps the same information behind accessible collapsible
   sections. The three-second view answers who/where/what changed; the ten-second
   view answers why and what is next. [A1][A2][A3][A4][A5][A6]
4. **Geography has one canonical coordinate model.** The world is a seeded
   node/edge graph. Travel stores `edgeId`, direction, and normalized progress;
   atlas and travel render that same position along the same route. Discovered,
   visited, blocked, and chosen edges persist across reload. [A1][A2][A3][A5][A6]
5. **Places persist.** The corrective slice contains at least three seeded towns
   with distinct topology, landmark roles, identity palettes, and changing
   state. Revisit produces the same town plus recorded consequences, never a
   newly randomized postcard. [A1][A2][A3][A4][A5]
6. **Dungeons are graph-first mazes.** Store cells/rooms, passages, entrance,
   goal, hero cell, visited/fog state, landmarks, one lock/key relation, and one
   shortcut. Validate solvability before presentation; render tiles and movement
   from this topology and preserve it on revisit. A future first-person view may
   project the same graph, but 3D remains deferred. [A1][A2][A3][A4][A5][A6]
7. **Combat is a real state machine.** Combatants own health, resources,
   initiative, statuses, legal actions, intent, and outcome. At minimum the hero
   can attack, guard, use a skill, or use an item; enemies choose under the same
   legality contract. Presentation stages intent → anticipation → impact →
   reaction → consequence, and every number shown comes from resolved events.
   Retreat and defeat are possible and recoverable. [A1][A2][A3][A4][A5][A6]
8. **Quests, items, and logs are canonical.** One main quest and at least two
   simultaneous subquests have explicit objectives, statuses, rewards, and
   consequences. Inventory is bounded; weapon, armor, and trinket slots alter
   derived rules; loot has origin/provenance. The bounded adventure log records
   typed, entity-referencing events and reloads without duplicates. [A1][A2][A3][A4][A5][A6]
9. **Every existing mode gets a depth contract.** Town exposes place/NPC/service
   change; atlas route and discovery; travel actual progress and encounter cues;
   dungeon topology and fog; battle legal choices and consequences; camp rest,
   equipment, or relationship change; Chronicle event/quest/item history. A mode
   is not complete if its main output is decorative or hard-coded. [A1][A2][A3][A4][A5][A6]
10. **No LLM, new activity mode, or production 3D work enters this recovery
    slice.** The deterministic director first has to sustain the same causal
    adventure without AI. SmolLM2-360M remains a later, measured candidate for
    bounded language tasks, not a substitute for missing state or rules. [A1][A3][A5][A6]

### Refreshed art and license decision

For the corrective prototype, the preferred coherent 16×16 foundation remains
[Ninja Adventure](https://pixel-boy.itch.io/ninja-adventure-asset-pack): the
publisher marks the pack and all assets CC0 1.0, allows commercial use, and says
credit is appreciated but not required. Record the downloaded archive version,
hash, source URL, selected-file hashes, transformations, and a retained license
copy; do not ship its full 89 MB authoring archive. [A4][A6]

Kenney's [Roguelike/RPG pack](https://kenney.nl/assets/roguelike-rpg-pack),
[Tiny Dungeon](https://www.kenney.nl/assets/tiny-dungeon),
[Tiny Town](https://www.kenney.nl/assets/tiny-town),
[Tiny Battle](https://www.kenney.nl/assets/tiny-battle),
[Minimap Pack](https://kenney.nl/assets/minimap-pack), and
[UI Pack](https://kenney.nl/assets/ui-pack) are publisher-labeled CC0 and are
approved only as conditional greybox, UI, or semantic-icon sources after a
contact-sheet/style review. Do not casually mix their scales and silhouettes
with the primary set. [A4][A5][A6]

The [Liberated Pixel Cup catalog](https://lpc.opengameart.org/lpc-art-entries)
is not selected for this slice: its documented CC-BY-SA 3.0/GPL 3.0 licensing
requires attribution and share-alike/GPL handling that conflicts with the
current CC0-first runtime-art policy. This is a project-policy exclusion, not a
claim that the art is unusable. [A4][A6]

### Corrective exit verdict

The depth recovery is complete only when a fresh campaign can visibly travel a
persistent route, revisit a distinct town, traverse and resume a solvable maze,
resolve a multi-turn battle with real stats/items, advance a main quest and two
subquests, and reload with health, equipment, position, objectives, and log
unchanged. The same canonical facts must appear consistently in every relevant
screen, with no dash or invented display value standing in for missing state.

## Periodic v0.4 council — iterative expansion and visual/mechanical consistency

The six roles reconvened after v0.3 and unanimously accepted the user's new
development rule: one subsystem or feature at a time, each independently tested,
committed, pushed, deployed and live-smoked before the next begins. The council
reviewed the shipped baseline, the schema-v4 ability work, the responsive defect,
official game-mechanics research, and the added requests for companions,
repartee, a lifelong replay ledger, and local micro-LLM cinematic dialogue.

- **A1 — canon/D&D critic:** techniques need monster provenance and finite
  learnability; repartee must arise from character history; companion arrivals
  and departures require setup, cost and payoff.
- **A2 — lived RPG character:** all learning, gear changes, travel, relationships
  and dialogue choices must be visibly experienced; departed companions remain
  recognizable NPCs rather than disappearing records.
- **A3 — systems designer:** use one action/effect/event vocabulary, but reject a
  universal-framework mega-commit; mastery rewards effective decisions rather
  than repetition, and each new loop must feed existing consequences.
- **A4 — visual designer/forager:** character safe-area correctness comes first;
  semantic equipment layers and stable side-view speaker identity precede more
  spectacle; external assets require source/license/contact-sheet review.
- **A5 — workday spectator:** travel must actually move through depth, battle must
  show anticipation and consequence, repartee must visibly select hilarious
  wrong answers, and repetition memory matters more than constant particles.
- **A6 — web engineer:** Actor Policy must own canonical commands; the compact
  ledger precedes event-heavy systems; Pixi owns one ticker/resize lifecycle;
  micro-LLM inference is isolated and never owns facts or outcomes.

Reconciled decisions: codex knowledge may grow but only six arts are prepared;
enemy learning uses finite deterministic insight; active party is hero plus at
most two temporary companions; first minigame is direct rather than an SDK;
repartee correctness is canonical and prose realization optional; semantic
history never compacts away; AI comes only after complete deterministic dialogue.

Research and full acceptance criteria are recorded in the v0.4 backlog. No code,
art, dialogue or assets from referenced games or unlicensed web recreations are
approved for import. This review reused the repository's prior council decisions
and the linked official/publisher sources; local `deja` recall found no separate
implementation to reuse.

## Periodic v0.5.79 council — immutable local-narrator rebuild

The six-role council and facilitator rejected V04.13b3b2b2b as one mega-release
and split it into immutable rebuild, evaluation adapter and named-phone proofs.
The council required a network-disabled two-build receipt, complete source and
wheel manifests, exact Transformers.js sessions, no model bytes in production,
and permanent false admission/display authority. A provisional image digest,
`quantize_dynamic` recipe and `1e-5` tolerance were corrected by direct
observation: the current image digest differs, generic quantization exceeded the
budget, and export differences exceeded that tolerance. The final official-q8
recipe passed at 97,082,423 bytes in two byte-identical builds. Council verdict:
SHIP rebuild evidence; HOLD adapter, phone claims and gameplay integration.

The facilitator's final audit temporarily held release until the receipt bound
the actual executed harness, both validators enforced intermediate equality and
the bundle exclusion ran after a fresh build. Version 0.5.79 adds all three:
path/SHA-256 self-verification, independently rehashed intermediate-mismatch
tests, and a post-build boundary pass. The real receipt was regenerated from the
retained pair inside the pinned network-disabled container.

The same review added Campfire Echoes and Elsewhere Callings as independent P2
companion mechanics. Both remain deterministic and ledger-grounded; optional
future prose cannot choose shared memories, relationships, routes or outcomes.

## Periodic v0.5.80 council — rebuild reproducibility correction

The recovered publication review split three ways across artifact provenance,
evaluation-adapter architecture and narrator boundaries. It unanimously held
artifact publication and the B2 adapter until a clean rebuild matched the
committed v0.5.79 digests. That prerequisite check instead found merged-decoder
digest drift across Python processes even though the two v0.5.79 builds agreed
inside one interpreter.

Inspection of the pinned Optimum ONNX wheel found the cause: its merger selects
and iterates duplicate initializer names through a Python set. The council
therefore rejected the v0.5.79 cross-process reproducibility claim and required
a correction before model publication. Version 0.5.80 makes `build-one` the
only real build operation, locks `PYTHONHASHSEED=0`, binds per-build process
evidence, and accepts only two distinct isolated invocations with byte-identical
raw and runtime manifests. The schema-v1 receipt is retained but superseded;
the schema-v2 receipt is authoritative. Verdict: SHIP the correction; HOLD
artifact publication, adapter execution, phone claims and gameplay integration.

## Periodic v0.5.81 council — public artifact provenance closure

The recovered publication session and three-role follow-up council audited the
artifact repository, candidate contract and narrator architecture independently.
Local `deja` recall established publication/provenance closure as the next honest
unit after v0.5.80; this release reuses that sequencing and the exact immutable
rebuild evidence rather than restarting or replacing it.

The artifact review verified anonymous public access, commit
`8c85146bbe1a9bcaa4b77faa2c7ef52b2e5b8dd4`, tree
`f98af3790d8aa5375a2cba6f3bdfda99283e42b0`, 16 ordinary Git blobs and all six
runtime SHA-256/byte identities. It also verified the Apache-2.0 source evidence,
full license text, notice/modification records, schema-v2 rebuild receipt and
toolchain lock. The 59,041,810-byte decoder exceeds GitHub's 50 MiB warning but
is below its 100 MiB hard block; production-scale delivery must not assume a CDN
service guarantee.

The adapter review rejected a draft synthetic brace-expanded conversion command:
the public evidence does not claim that literal invocation. The accepted additive
V3 dossier instead binds structured artifact/source/rebuild repositories and
revisions, published/local receipt and lock paths/hashes, and exact converter and
quantizer revisions. The derived Candidate V2 is eligible only for guarded device
staging; memory remains unmeasured and admission/display authority remain false.

The architecture review found one prerequisite before an adapter: the current
formatter hash identifies field names rather than exact prompt bytes, and token
counts do not yet bind special tokens, padding/truncation, decoder-start or EOS
semantics. Verdict: SHIP publication closure; make the exact formatter/token
contract the next separate release; HOLD adapter execution, B2 claims, phone
claims, cache/consent work and gameplay integration.

## Periodic v0.5.85 council — narrator evidence retention

Three independent reviewers examined the first post-adapter B2 slice. The
contract and architecture reviewers favored freezing additive V2 rating
semantics before building a visual rater, while the provenance reviewer found a
nearer filesystem blocker: full-run private keys could still be written beneath
the diagnostic directory that Vite deletes during rebuild. The facilitator
placed that concrete evidence-loss risk first and retained the rating work as
the next separately shippable feature.

The accepted fix requires full-run output outside the repository, Git-confirmed
ignored smoke output, realpath containment, exact private modes, exclusive
non-symlink files, salt non-disclosure, index plus worktree cleanliness and raw
committed-byte evidence. The receipt closure binds the ignore policy and helper
implementation. Verdict: SHIP the runner hardening after a fresh committed smoke;
then recover rateable model output and freeze V2 intake/rating/report/replay
semantics before exposing a rater UI. Admission, display, production integration
and manufactured human evidence remain on hold. The review reused recovered
session `[codex] the_grind_2 · 01a06835-15f`.

## Periodic v0.5.86 council — bounded form selection

Three independent reviewers audited adapter attribution, evidence provenance and
narrator architecture after the first complete V2 run blocked human rating. The
council rejected silent repair of arbitrary V2 text and rejected describing an
exact host-rendered line as model-generated prose. It also rejected the two
obvious constrained alternatives after direct experiments: a one-token selector
collapsed to baseline, while a full-line trie exceeded the 48-token ceiling,
lost Unicode fact bytes, exposed an exact tie and failed fatigue.

The accepted additive V3 boundary lets the model select a declared short form
and lets deterministic host code render that form from exact validated public
facts. The raw selected IDs, not decoded text, carry model attribution. Every
trie branch is recomputable; finite float32 score bits must prove a unique strict
maximum; exact ties are invalid. The shade baseline joins the V3 candidate union
without modifying V1's historical policy.

The reviewers considered symmetric baseline suppression and a longer run-state
machine. The facilitator chose the smaller predeclared runtime policy after the
coordinator-reported exploratory 200-case probe using the proposed contract:
fixed two-call bursts, suppression only of the preceding selected non-baseline
form on the second call, baseline always eligible, and reset at each burst and
seed. This preserves a genuine model-versus-
baseline comparison and already produced zero repeated bursts, maximum form run
two and variation in all 20 sequences. Those exploratory observations are design
inputs, not retained evidence; future fatigue results must be described as the
model-plus-policy system rather than spontaneous model diversity.

Verdict: SHIP only the pure V3 formatter, form registry, exact renderer, safety,
eligibility, token/trie/score semantics and additive RunSpec/WorkerBinding after
full verification. HOLD the V3 evidence seam, worker protocol, Transformers.js
adapter, browser run, rating, phone evidence, production integration and display.
V1/V2 hashes, validators and blocked v0.5.84 evidence remain authoritative
historical records. This review reused recovered session
`[codex] the_grind_2 · 01a06835-15f` and verified its runtime assumptions against
the pinned official Transformers.js source.

## Periodic v0.5.87 council — selection evidence seam

Three independent reviewers audited adapter-facing protocol semantics, artifact
provenance and narrator architecture after the V3 selection contract was frozen.
The facilitator reconciled their initial representation preference by retaining
complete validated request and response preimages in private case receipts while
granting the worker no selected-form, target-set, rendered-prose, admission or
display authority. Host code alone reaccounts target vectors, validates the
strict trie trace, derives the form and renders exact Prompt V1 facts.

The protocol review found that the first wire schema capped raw target vectors
at the authoritative 48-token target limit. That made a genuine 49-token
`target-token-contract-error` impossible to retain or classify. The corrected
wire envelope permits a bounded 320-token diagnostic vector, while frozen target
accounting still rejects anything above 48. A regression proves that the same
49-token evidence is accepted only for the target-contract failure and rejected
for generation success or selection.

The provenance review closed two additional honesty gaps. First, successful
load chronology could accept a `not-run` row before a later terminal row; the
run validator now rejects any preterminal hole while preserving all-not-run
load-failure receipts. Second, `render-contract-error` was advertised but no
valid transcript could truthfully produce it. Because every accepted selected
response deterministically yields a registry form and safe host render, the
dead status was removed. A renderer/safety exception is an internal invariant
failure and aborts receipt creation; a caller cannot rehash a valid selected
response into a false failure downgrade.

The architecture review confirmed that the blind sheet projects only prompt,
resolution and balanced baseline/candidate text. Form IDs, token/target/trace
evidence, model side, worker/model identity and the secret salt stay outside the
public schema; invalid rows hide both sides and baseline selections auto-tie.
It also identified a test-only five-second timeout on three complete 200-row
load-failure validations and the resulting stale focused-test count. The
proportional bound is now explicit and the documented total is 32.

Verdict: SHIP the additive protocol, receipts, runner and blind projection after
the ordinary release gate; HOLD the Transformers.js V3 adapter, any model run,
human rating, production import, UI, admission and display for their separate
backlog items. All evidence in this slice is synthetic mechanics proof. The
review reused recovered sessions `[codex] history · 01a06835-15f` and
`[codex] 03 · Sep 4 · 2026-09-03T1`; no generated prose or preference was
promoted into observed evidence.

## Periodic v0.5.88 council — isolated V3 browser adapter

Three independent reviewers examined the adapter contract, receipt provenance
and browser architecture before any model execution. Local `deja` recall
recovered session `[codex] history · 01a06835-15f`, preserving its required
contract → evidence → adapter sequence, host-owned rendering and prohibition on
manufactured model observations.

The adapter review required exact tokenizer/decode/generation options,
pre-mask float32 score capture, disallowed-only trie masking, trace finalization
from returned runtime IDs and deterministic disposal. The accepted adapter
never decodes generated output. The worker emits raw evidence only; the host
revalidates the full trace, derives the declared form and renders exact public
facts.

The provenance and architecture reviews initially held release. They found
missing production canaries, a mutable-worktree build race, bundle paths that
could be re-read after hashing, an unsound nested-request ingress predicate,
incomplete CLI boundary coverage and cleanup paths that could mask the primary
failure. The accepted implementation adds both V3 contract canaries, validates
the nested request, scans executable TypeScript and MJS tool sources, builds a
40-path committed-blob closure in a temporary root, snapshots every regular
bundle byte once and serves those same buffers. Cleanup now attempts every
resource while preserving the operational error. Package SRI claims were
narrowed explicitly to committed lockfile identity.

A follow-up adversarial audit recomputed 32 transitive local files with zero
closure misses and cleared every hold. The exact source commit then passed 111
files and 1,025 tests plus both browser builds, production build and final
leakage scan. Only afterward did Chromium run the one allowed ordinal-zero
smoke: verified model/runtime closure, offline before load/inference, one valid
declared-form selection, zero post-offline requests and acknowledged disposal.
The byte-retained receipt names source commit
`991d3bb7d677afde9b7939c0ecb01187bb8ba729`.

Verdict: SHIP the isolated adapter and exactly one committed smoke receipt.
Advance next to the separate full V3 rateability run. HOLD the rating contract,
rater UI, human evidence, named-phone claims, production integration, admission
and display. Because this release adds no production UI, its visual-consistency
claim is limited to unchanged AI-off presentation and continued exclusion of
diagnostic contracts/runtime from the production bundle.

## Periodic v0.5.91 council — V3 rateability observation

The release reviewer held the physical observation until exact source commit
`752174b4db01519e628ac0ffc36236a71c358e98` passed the complete clean gate,
matched `origin/main`, and was published as annotated tag `v0.5.91`. The final
gate passed 121 files and 1,300 tests plus the rebuild proof, all typechecks,
pinned runtime checks, three narrator browser builds, production build and both
boundary scans. The reviewer then returned an explicit GO for one execution
with no retry, resume, repair or alternate identity.

That sole execution—the third physical run of the unchanged candidate and
corpus—completed all 200 cases with 200 valid rows, zero knowledge violations
and a truthful `blocked` package. It supplied 122 rateable non-baseline rows,
below the frozen 140-row minimum, and also failed the stratum-rateability,
voice-rateability and same-form-burst thresholds. Model load and disposal
succeeded; the producer seal and browser cleanup completed; service workers
were blocked; both external request counters were zero. Human quality was not
evaluated.

The public retention review permits only the versioned provenance receipt,
aggregate summary and run package. It recomputed their canonical and file
hashes, all public cross-links, and all 47 provenance-listed source files
against the tagged commit. The private run receipt, blind sheet, blind key and salt remain
outside Git. The run is consumed and will not be repeated to seek a preferred
result.

Verdict: ACCEPT and publish the blocked observation evidence. HOLD formal V3
rating, candidate admission, display authorization and production authority.
The UX, architecture, selector and browser-test reviews separately support a
new milestone and policy type labeled **Local Narrator — Experimental Beta**:
default off, explicitly **Experimental / Unrated**, approximately 121 MB,
client-only, deterministic text first, same-scene replacement only, and no
authority over saves, rules, outcomes, timing, facts or rewards. This is not
the gated V04.13b3c admission path and must not pass the candidate through
`NarratorModelAdmission` or reuse the frozen evaluator as production code. Its
line belongs in the Chronicle and compact focus ribbon, never over the
battlefield. These reviews reuse recovered session
`[codex] the_grind_2 · today · 01a06835-15f`.
