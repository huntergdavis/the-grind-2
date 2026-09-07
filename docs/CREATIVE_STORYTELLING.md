# Creative local storytelling: experimental slice

Status: a separate, opt-in **Creative storyteller** is implemented with the
pinned SmolLM2 135M q8 browser model and 48 original writing seeds. This is a
usable experiment, **not a passed prose-quality gate or a default narrator**.
The manual factual Story Beat lockout repair remains in place. Creative prose
now arrives as automatic, watch-first parchment intermissions after activation.
Rejected drafts can now use clearly labelled original authored emotional
interludes, controlled separately in settings; these are not model generations.

## Current interaction

Start a fresh adventure with **Play with LLM** or **Play without LLM**. That is
the whole initial setup. With LLM starts the creative writer in the background;
without LLM disables both narrators and starts the ordinary deterministic game.
Choosing a mode releases only the welcome-screen hold, never a user's pause.
**New hero** asks again. Existing saves without a remembered mode also get a
choice; older classic-narrator consent never silently activates a model.

**Focus**, **Pause** and **Menu** are the main controls. Menu contains saved
characters, New hero, speed and **Options**. **Adventure** is a top-level tab
alongside Map and Codex, not a menu popup. Character opens the same tab. Options
shows the same simple storytelling switch; **Advanced narration options** is
closed initially and contains focus, rhythm, draft recovery and model tools.
An unavailable writer leaves the game running, with **Retry LLM** in Options.

After a story has appeared, **Menu → Last story** offers an intentional reread
at a safe Watch scene. It reopens the same prose and recorded sources with the
original model/authored label and decorative accent, fully revealed and held
until Continue, Skip or Escape. There is no new generation or on-stage control.
The action also works after choosing No LLM, without reactivating either writer.

The local DM also chooses the intermission's staging: **Crimson Chronicle**,
**Impossible Orrery**, or **Moth Court**. The last actually displayed stage is
excluded from the next decision; the model scores the remaining two. This adds
visible variety through imagined scenery, not new canonical game events. Last
story keeps the same stage, and its scenery is still while intentionally reading.

When a recorded injured-companion farewell and a newer current scene are both
eligible, the DM first chooses **which moment to tell**. The chosen moment owns
the characters, frame prompt, prose prompt and recorded source. A selected
farewell replaces the existing caption with **A farewell revisited**. Attribution
for this choice stays inside the folded source; no new stage control is added.

The mode and advanced choices are separate versioned browser-local preferences,
not game-save or model data. Returning without LLM starts immediately without a
model-cache check. Returning with LLM restores a complete current cache
automatically, strictly cache-only. If cached files disappear during restoration,
loading fails without a network fallback. Missing cache or an unknown choice
opens the two-choice welcome before any download; checks have a two-second
deadline. A cancelled or replaced startup cannot later activate a narrator.

Initial model/tokenizer/config assets are 139,538,098 bytes; the local ONNX runtime adds
23,614,439 bytes (about 163 MB together, disclosed as approximately 165 MB).
Model bytes are downloaded directly from the pinned model repository; no model
files or inference server are added to this game's repository.

The loader checks a versioned browser Cache Storage namespace first. A complete
saved model and runtime changes the action to **Use saved model** and permits
cache-only restoration; partial cached files are reused during an explicitly
requested load. Turning off or canceling retains saved files. **Remove saved
creative model** clears only that model's namespace, not game saves or the
classic narrator cache. An app asset-cache update does not delete model caches.
The cache is specific to this browser/profile and site origin, not a general
scan of files elsewhere on the machine. A classic T5 cache is not a SmolLM cache.
Fresh starts never download or activate a model until the player chooses LLM.
Only an explicit LLM choice or retry may download missing files.

After loading, close settings and let the adventure run. There is no per-story
writing button or permanent creative-prose panel in Chronicle. One captured
committed scene, its public character viewpoint and one matching seed go to the
worker while play continues, including fights and mechanical cutaways. Model
latency therefore does not pause the adventure.

One finished passage waits for a later safe break: no fight, cutaway queue,
recovery, user pause, hidden page, alternate view or open dialog. A parchment
scroll then temporarily pauses presentation and game steps, revealing crimson
ink over two to four seconds. Reduced motion shows the complete text immediately.
Reading lasts 12–30 seconds based on length; **Hold to read** reveals everything
and waits for **Continue**. **Skip** or Escape closes early. Closing releases only
this reading pause, never the user's own pause setting. The caption explicitly
says **An earlier moment**; **Recorded moment** retains the captured source
headline separately from the imagined interpretation. Exact mechanical changes
remain in the game's Chronicle. Text never enters simulation, records or saves.

The director retains at most one in-flight request and one finished passage,
with the selected minimum attempt cadence and the same minimum gap between
closing one scroll and opening another. Story rhythm offers Regular (90 seconds,
the default), Quiet (3 minutes), and Rare (5 minutes). These are minimum gaps,
not a promise of a scroll at each interval. Unshown passages expire after three minutes. Normal
ticks and party changes do not cancel a captured earlier-moment draft. Turning
off, changing campaign, hiding the page or updating discards pending prose;
those invalidated requests may finish within the existing bounded
deadline but their output is ignored. Turning the writer off cancels it and keeps
cached files. No new request starts while inactive, user-paused or in settings.
Loading either narrator turns the other off to avoid retaining both runtimes.

Changing inspection tabs only dismisses an open intermission. An already-running
same-campaign draft can finish, retain its original scene and enter Narratives;
it cannot open a scroll while inspection is active. Returning to Watch may show
it at an eligible safe break before its existing expiry. While Narratives is
visible, its reading snapshot does not change underneath selection or scrolling.
**Latest stories** refreshes deliberately; exports contain the visible
stories. Selecting a scope or reopening Narratives refreshes the snapshot, and
switching heroes never leaves the old hero's list mislabeled as the current one.

**Journal → Narratives → Save stories** folds two download formats under one
control. **Readable storybook (.txt)** groups adventures separately and orders
their passages by source tick, then completion time; it does not rewrite prose
to bridge gaps. The current adventure appears first. Named paired thoughts keep
both speakers and their roles. Each passage retains its headline, place, tick,
LLM/authored attribution and shown/unshown label. **Full archive (.json)** keeps
the existing schema and displayed order. Both use only the visible reading
snapshot, never waiting new stories. Neither is a full lifetime history or game
save; no model call or save modification is involved.

**Story focus**, inside narrator settings, controls what the next draft explores:

- **Inner life** (initial choice): a private hope or worry and a conflicting
  feeling, prompted by the named hero's public values and one rotating seed.
- **Shared road**: feelings about the current companion, using their public
  name, role, oath, travel/injury status and shared victories. Unavailable when
  there is no applicable active companion; the next captured scene without one
  uses Inner life while remembering Shared road for a companion's return.
  Arrival, injury and travel suggest different emotional angles. Only positive
  shared victories enter this focus; zero does not imply a newly formed party.
  A seed's concrete image provides variety without its conditional plot advice.
- **Scene imagery**: atmosphere and a vivid image of the moment.

Changing focus clears the old interpretation without running the model. The
selection is fixed during writing. Character context is captured with its scene;
an explicit focus change discards a queued interpretation without starting a
request inside settings. The current companion can be selected before the first
write, not just after a draft has populated the worker context.
Focus and rhythm are remembered in browser-local preferences, separately from
the campaign and model cache. These advanced preferences do not activate either
narrator; the separate play-mode choice controls cached restoration. Blocked
storage leaves current-page controls usable. An explicit rhythm change discards
queued prose and recalculates spacing from the last attempt/presentation and
scroll close; it does not reset those anchors to manufacture an immediate story.
Only a frozen public projection is passed, never raw companion identity,
hidden disposition, internal IDs, prior prose or the whole save. The current
game has one active companion, not a multi-member party. This is literary
viewpoint control, **not a persistent emotion or relationship simulation**.
Parchment and crimson ink carry the literary presentation; no color is a claimed
mood measurement and no mood meter is placed over an actor.

### Simple startup and Menu verification — v0.5.96

The implementation reuses the existing creative/classic controllers, model
cache and storytelling preferences. Local recall found no matching prior menu
implementation; the checked-in interaction and cache documentation supplied
the starting point. Independent review identified a cache-eviction race in
automatic restoration, an Escape target moved into a hidden menu, and the need
to preserve an unanswered fresh choice across Back/Forward restoration. These
are addressed without changing the model, prompt, game mechanics or saves.

All 209 focused narrative/startup tests pass, plus seven actual worker-handler
tests using mocked loaders: incomplete or blocked caches cannot fetch; a late
loader fetch is blocked; complete cache-only restoration works; explicit
first-use loading remains permitted. App typecheck, version/boundary checks
and the v0.5.96 production build pass. The boundary contract now requires the
new cache-only intent as well as closure of network access before inference.

Actual 1280×800 and 320×568 welcome and collapsed-Options screenshots, plus the
phone Menu, were visually inspected: readable two-choice entry, 44-pixel
controls, contained dialogs and no horizontal overflow. Inference in the menu
browser fixtures is replaced by a test worker; tiny cache entries demonstrate
discovery and restoration intent, not real model quality.

All four menu/startup browser scenarios and the existing mobile AI-off scenario
pass: fresh choice, remembered No LLM, new-hero prompting with manual pause,
automatic creative writing, cache-only returning load, missing-cache choice
and explicit retry. The first case completed before its runner received SIGTERM;
only the four unfinished cases were resumed and all passed. No application
change or rebuild was made to obtain those results.

Both existing authored-recovery cases also pass against the same build through
Menu → Options → Advanced: the actual named injured-companion library passage
renders at desktop/phone sizes, the next accepted draft restores model
attribution, and remembered quiet recovery suppresses rejected output.

Two existing responsive Focus/compact-panel scenarios also pass through the
new Menu, including focus return and uninterrupted adventure inspection. Nine
distinct browser cases passed in total against one unchanged production build;
all owned preview/browser processes were closed after verification. The five
focused browser spec files pass standalone strict TypeScript checking.

The existing site/focus/drawer fixtures now use real visible Menu paths instead
of clicking moved controls while hidden. Broader standalone strict checking
also exposes pre-existing DOM-narrowing debt in the large site/typography specs;
that is not part of the production TypeScript check and remains a separate
test-harness cleanup, not a claimed all-specs pass.

### Authored emotional recovery — v0.5.95

**If a draft fails** offers **Authored interlude** (default) or **Wait for model
prose**. This browser-local presentation choice never activates or downloads a
model. Older saved focus/rhythm preferences keep their choices and gain the
default recovery setting. Changing it discards queued prose without triggering
another write in settings or resetting the existing story cadence.

The explicitly activated model still writes first. If a completed draft fails
text hygiene or exactly repeats the prior model draft for the same context,
Inner life or Shared road may use one of 16 original two-sentence vignettes.
Four describe a named hero's conflicting private feelings; three each reflect
travelling, arrival, injury while travelling, or injured arrival with a named
active companion. Selection is deterministic and retries rotate within the
applicable bucket. Scene imagery and missing character context have no authored
substitute. This is a small authored library, not a larger model or a training
corpus, and it does not add persistent emotions or relationship scores.

The alternative is captured with the request, not composed from later party
changes. Cancellation, navigation/hidden-page invalidation, campaign changes,
load failures, thrown write errors and timeouts never manufacture a passage.
Every attempt clears its publishable text and attribution, preventing an old
successful draft from resurfacing when a later attempt fails. Model prose that
passes the existing cleaner remains primary; semantic mistakes such as generic
weather instead of a companion scene are **not** detected by this recovery.

Authored passages use the same safe-break parchment, minimum gaps, expiry,
reading controls and captured care/trust accents. Their visible and accessible
caption says **Authored interlude · imagined interpretation**. A subsequent model
passage restores its own attribution; no authored text is represented as an LLM
success. The recorded scene stays separately available. No additional combat
labels, mood meters, network calls or simulation/save changes are introduced.

The regression fixture reuses the rejected story-continuation output from the
[v0.5.94 real-model report](../tools/creative-story-probe/context-fit-report-2026-09-07T00-37-03-923Z-d0521c53-3063-4750-b32c-e523137be3cf.json).
No new model benchmark is needed to test this authored recovery path; the model,
runtime, prompt and generation settings are unchanged. The full eight-scene
literary quality gate remains open.

Independent lifecycle review found no blocker and requested a stopped-worker
resolved-output regression, now included. All 137 focused storytelling tests,
app typecheck, version/boundary checks and standalone browser-spec typecheck
pass. Repeat detection remains scoped to retries of the same captured context;
the automatic director only attempts each committed tick once. Finite authored
choices can repeat across different scenes; no cross-scene deduplication or
long-form continuity is claimed.

Both targeted browser scenarios passed on their first run in 2.5 minutes after
one v0.5.95 production build. The actual authored library—not substituted good
model prose—produced the named injured-companion interlude for Fen Greyhaven
and Joss Glass. Desktop (1280×800) and phone (320×568) screenshots were inspected:
clear authored attribution, crimson text, separate recorded source, 44-pixel
controls, no horizontal overflow and reduced-motion instant reveal. The next
accepted fake-worker result restored model attribution. A second case proved
opt-out persistence while off, no automatic activation, and silence after a
rejected draft. These verify delivery and recovery, not new inference quality.

### Context-fit inspiration — v0.5.94

The same 48 original seeds now carry small authored prerequisites and care/trust
affinities. Seven conditional seeds require a return, success, aftermath,
disruption, advantage, setback, or rest. Those remain dormant: scene mode,
historical victories and arrival do not prove those conditions. No keyword
guessing or invented event tags are used. The remaining 41 ingredients provide
at least eight eligible choices for every scene mode.

Inner life and Shared road use the captured public companion state to favor
care images for injury and tentative-trust images for healthy companionship.
Where at least two images fit, attempts rotate through that pool. Where only
one or no image fits, neutral ingredients preserve variety without the opposite
relationship affinity. Solo scenes use the general pool; Scene imagery remains
independent of party state. Selection remains deterministic for the same scene
identity, focus, viewpoint and attempt. No generated text becomes memory.

The selected ingredient carries a decorative tone with its completed passage:
warm copper for care, muted blue-green for trust, original gold otherwise.
Only parchment edges/dividers change. Crimson prose, contrast, controls and
imagined-interpretation attribution remain unchanged; tone clears on close.
These colors reflect authored inspiration, not a measured emotional state,
relationship score, healing, or outcome.

This improves the ingredient-selection contract; it does not establish better
literary quality by itself. The broader eight-scene paired quality review stays
open, and memory callbacks remain after that work. Historical examples used
probe-specific explicit seeds, so subsequent context-selected samples must not
be described as a controlled paired experiment.

Two bounded, real browser/WASM runs reused the verified 135M model files and
completed offline with no generation requests. The [initial context-fit run](../tools/creative-story-probe/context-fit-report-2026-09-07T00-28-13-515Z-23562d9b-734c-40e6-a28b-0b001386c2b1.json)
selected the intended neutral/trust/care ingredients, but all three outputs
failed the intended named emotional scene. A [single controlled follow-up](../tools/creative-story-probe/context-fit-report-2026-09-07T00-37-03-923Z-d0521c53-3063-4750-b32c-e523137be3cf.json)
kept those facts, viewpoints, identities, seeds, model and runtime fixed. It
moved the ingredient before the emotional focus and ended with a short request
to tell the named characters' story. This subject-last prompt is the shipped
bounded correction, not evidence of a generally reliable writer.

| Case | Initial output | Subject-last follow-up |
| --- | --- | --- |
| Mara at a sealed arch | Literal boxes displaced the character and scene. | Named Mara, kept the arch closed, and described doubt and steadiness; an invented waiting-for-a-new-arch premise remains. |
| Newly sworn Rowan | Omitted both characters and invented another town. | Generic weather still omitted both characters and their relationship. |
| Injured active Rowan | Explanatory writing commentary instead of a scene. | Different writing commentary, still not a character scene. |

Follow-up generation took 70.484, 77.127 and 30.879 seconds on this test host;
these are measurements, not promises for another device. Both full raw reports
remain immutable. Final text hygiene now rejects the observed explanatory and
story-continuation phrases; the latter rejection was added **after** the second
measurement, whose original cleaned fields are retained. Filtering a bad line
does not improve its raw generation or validate literary facts. No third model
retry was run. The full eight-scene quality gate and dependable companion
storytelling remain open.

Independent council review checked metadata, neutral variety, and captured-tone
lifetime. The 101 focused narration tests, typecheck, version and reducer-boundary
checks pass; the isolated probe has five portable tests requiring no model files.
Browser checks exercise captured healthy/injured public fixtures and actual
prompt selection, but use a fake inference response: they test wiring and
presentation, not model quality or combat-caused injury.
Both targeted cases pass: healthy/trust at 1280×800 and injured/care at 320×568.
Both screenshots were inspected for crimson readability, subtle edge color,
scrolling bounds and 44-pixel controls. One production build was reused across
the runs. Initial harness corrections added Node's JSON import attribute and
used the canonical active-companion `fallen`/zero-health fixture (wounded but
alive), not the former-companion-only `wounded` value. Production code was
unchanged during browser testing; standalone browser-spec typecheck also passes.

### Earlier viewpoint experiments

The initial three-scene comparison produced a recognizable private worry for
Mara, but both companion cases returned unusable writing advice or repetition.
Those raw failures are preserved in
[the initial viewpoint report](../tools/creative-story-probe/viewpoint-initial-report.json).
Council review also caught travel/injury hints offered to healthy or arrived
companions. The revised prompt uses their actual status and omits the abstract
seed directions that the small model copied. Cleanup now rejects those measured
meta-text failures, without claiming to detect all bad or inaccurate prose.

The [revised production-worker comparison](../tools/creative-story-probe/viewpoint-report.json)
completed all three synthetic public scenes with zero generation requests after
asset load. Writes took 59.625, 55.199 and 55.872 seconds. The solo scene retained
Mara's trepidation; the new-companion scene named Rowan but omitted Mara and the
requested relationship reaction. The injury scene named both characters and
expressed worry, but added a history of loyalty and an unsupported assurance that
Rowan would recover. These are readable improvements over the initial meta-text,
**not a passed relationship or full-narrative quality gate**. The tiny model
remains opt-in and experimental; no game outcome follows from its prose.

Prior character-focus verification: 74 focused tests, application build/TypeScript and
boundary checks pass. Six browser checks pass across the full run and targeted
interaction rerun, covering real hero-name projection into the worker request,
focus selection, repeated writes, cancellation, saved-model discovery, compact
and desktop layout, combat suppression, and AI-off behavior. The 320px and 1280px
screenshots were inspected. Browser UI tests use a test-only worker and measured
prose as a layout fixture; they do not establish model quality or inference speed.

Continuity for character focus: `deja "character viewpoint emotional creative narrator"`
recovered the earlier Character viewpoint recommendation ([codex] 06,
2026-09-06T1). It reuses `HeroState` values and the existing public `projectParty`
projection rather than inventing a parallel relationship model.

The short experimental output cap is 64 new tokens with a 90-second deadline;
the cleaner keeps up to two complete sentences and drops an unfinished tail.
It checks text hygiene, not truth or literary quality. Combat, cutaways and
hidden views suppress the creative surface, not an already-running background
write. There is no sentence trie or source-word allowlist, and inference
networking is closed after asset load.

Continuity: `deja "model cache"` recovered the earlier turn-off/retain-cache and
explicit-removal design. This slice reuses that separation from the
[classic controller](../src/ui/local-narrator-controller.ts) and the existing
[stable-scene pause helper](../src/ui/story-beat-write.ts); it does not reuse
the classic model's weights or finite-output decoder.

## Evidence and remaining quality gate

The [browser probe](../tools/creative-story-probe/README.md) records four actual
offline generations with and without a rich seed. Seeds changed mood and
imagery, but the model also invented biography, omitted costs, and once reversed
an action. All four raw samples hit the token ceiling. On the two-thread
cross-origin-isolated test server they took 33–38 seconds; those figures are
not production single-thread performance. The production worker/cache probe is
reported separately alongside those samples. It restored the model after worker
disposal in 23.215 seconds with no model/runtime requests. A final single-thread
production-prompt run generated two accepted sentences in 55.419 seconds with
zero generation requests. Those sentences still invented an island and muddled
a payment: successful display does not establish good storytelling. The initial
structured prompt's rejected code-like output is preserved too; the current
short plain-language prompt avoids that failure in the recorded example.

The player's library idea therefore buys controllable inspiration, not
reliable storytelling by itself. The original eight-scene quality review and
longer two-to-four-sentence target below remain open. Next compare a more
capable writer and concise exemplars against these same scenes, measuring
relevance, invention, repetition, time to first complete sentence, and memory.
Do not expand to thousands of seeds merely to inflate a variety count.

The new character-focus comparison asks whether a reader can identify a distinct
feeling and concern, recognize the right people, and retain the actual outcome.
Prompt/context controls alone do not establish those qualities. The next steps
are a more capable writer comparison, one committed-memory callback, and a
separate farewell context for companions who have already left. Persistent
emotional arcs remain backlog work. Automatic intermission pacing is implemented;
it changes when prose is written and read, not the model's demonstrated quality.

## Automatic intermission slice and review

The director and parchment have separate ownership: the director never pauses or
renders the game, and the parchment never changes simulation state. The host
waits until a committed step and the existing mechanical-cutaway queue settle.
A separate reading-pause flag avoids stealing the cutaway watchdog's ownership
or toggling the user's Pause/Resume state. Browser checks exercise real game
steps with a test-only worker; these check scheduling and presentation, not new
model quality or throughput. The model pin, prompt and token budget are unchanged.

Verification for v0.5.92: 67 focused narration tests, TypeScript, release-version
and boundary checks pass; the production build passes. Thirteen distinct browser
cases pass across the stable-source runs and targeted reruns. These cover no
automatic download, saved-model discovery, first-write Shared road selection,
real ticks during writing, repeated passages with one worker/load, user-pause
and modal deferral, Hold/Continue/Skip/Escape, normal-motion reveal and automatic
close, actual combat deferral, and hidden/campaign/off/navigation invalidation.
The 320px and 1280px layouts pass bounds, readable-type, reduced-motion and
44px-control checks; both top and bottom screenshots were inspected.

The first browser run was invalidated by changing the release version during
its preview build, which correctly triggered the app updater. Stable-source
reruns corrected test-only clock-capture, initial visibility-checkpoint and
software-rendering timeout assumptions. UI fixtures replace inference only; the real-model
quality evidence above is unchanged, and named-device frame impact remains open.

Recovered history: `deja "cutaway"` returned `[codex] history · today ·
01a06835-15f` and the August 30 Spectator Director planning. This slice reuses
their mechanical-cutaway precedence and independently owned presentation pauses,
while following the player's explicit September 6 request to write during play.
Measured inference in the prior local browser was roughly a minute; the player
reports about five seconds on their PC. Neither is a universal device estimate.

## Remembered preferences slice — v0.5.93

Story focus and Story rhythm now survive reload when browser storage is
available, while model activation remains explicit on every visit. Shared road
is remembered during solo travel, using Inner life until an applicable companion
is present. Controls stay in the narrator panel: stacked at 320px, side-by-side
at desktop widths, with 44px targets and no stage overlays.

Verification: 81 focused narration tests, TypeScript, version/boundary checks,
and the production build pass. Two new real-app browser scenarios pass with a
test-only inference worker: off/reload persistence, zero model requests or
workers, solo Shared road fallback, compact/desktop bounds, and three consecutive
passages through Quiet/Rare/Regular cadence changes using one loaded writer.
Both settings captures were visually inspected. Browser checks validate the UI
and scheduling, not literary quality. The usual test port belonged to another
project; a temporary port-only configuration left that process untouched.

The independent council found no blocking scheduling defect and clarified the
blocked-storage disclosure. Reused the existing captured-scene director and
browser clock fixture; `deja "story rhythm"` found no earlier rhythm preference
implementation. The separate [stronger-writer comparison](NARRATIVE_WRITER_COMPARISON.md)
timed out before any complete prose: production model, prompt, cache and download
size remain unchanged. Emotion memory and relationship arcs are still backlog.

## Authored farewell remembrance — v0.5.97

This slice gives one goodbye emotional continuity without changing the model
prompt or claiming a passed literary-quality gate. When a companion leaves
wounded but alive, the host verifies the exact durable farewell and one earlier
Shared Road Oath still present in the 32-entry Chronicle. Three original authored
passages recall that oath with relief and concern, extending the 16 ordinary
emotional recovery vignettes. The departed person is not reintroduced as an active
companion, and no emotion or generated memory is written into the save.

The writer still goes first. A remembered passage is eligible only when a
completed draft is rejected or repeats, authored recovery is selected, and the
focus is not Scene imagery. Accepted model prose carries no remembered-source
label; errors, timeouts, cancellation and wait-for-model mode stay quiet. Model
identity, input messages, token budget, download consent and cache remain unchanged.

One frozen candidate in the existing director preserves this milestone while an
older draft or scroll finishes. It respects the selected minimum gap and all
combat/cutaway precedence, expires after three minutes, and clears with navigation,
No LLM, settings invalidation or campaign change. Quiet/Rare rhythms and long
holds may exceed that lifetime. Missing or evicted oath entries yield ordinary
recovery, never reconstructed history. Reload does not rebuild a lost transition.

The parchment remains the only presentation surface. Its normally folded
**Recorded moments** disclosure separately labels the farewell and earlier oath
with their tick, public location and headline. Authored attribution and the care
accent remain; opening sources does not place text over fighting actors. Every
close clears these records, and each later passage starts folded.

Reused local recall `deja "the_grind_2 remembered moments creative storyteller backlog"`
(`[codex] history`, `01a06835-15f`), the existing farewell projection, and the
backlog's Hades-inspired milestone-priority idea. Council review found and fixed
two scheduling hazards: refused writes consuming event/cooldown, and an old
writer callback overwriting the new campaign's cooldown during synchronous
publication. Source projection distinguishes the atlas label from the generated
town name in the oath; both canonical wordings remain intact.

The [alternative writer research](NARRATIVE_WRITER_COMPARISON.md#september-6-alternative-webgpu-candidate-capability-gate-not-met)
is not a model upgrade: ordinary test Chromium exposed no WebGPU adapter, and
no candidate weights or runtime were downloaded. The existing 135M writer stays
experimental. Repeated real-output proof is still required before adding earlier
oaths to the LLM prompt; persistent emotional arcs remain backlog work.

Verification: 260 focused narration/startup tests, application TypeScript,
version and reducer-boundary checks pass, with one frozen v0.5.97 production
build. Four actual-app captures at 320 and 1280 pixels were inspected: prose
starts with sources folded; expanded records remain in the scroll's reading
area above the clear Continue/Skip footer. The browser fixture uses a real
retained T1 oath and actual saved T18-to-T19 farewell transition. Only inference
is replaced; it does not demonstrate improved LLM prose or a natural battle
causing the fixture's injured condition.

The first browser batch passed No-LLM and ordinary authored/model attribution,
then reached its eight-minute overall cap after the new farewell's paired-source,
layout and close-cleanup assertions; a redundant later-story step was unfinished.
An isolated retry then failed its scroll wait during a Pattern Duel: the fixture
jumped wall time by 100 seconds during live simulation, exceeding the runtime
watchdog threshold and triggering recovery. The corrected fixture pauses before
the jump, resumes through the actual control, and promptly replies through its
mock writer. Production combat precedence and scheduling were not weakened.
The farewell case now ends after its source-clear assertion; later model-origin
restoration is already covered by the passing ordinary browser case and units.
The corrected farewell case passes in its isolated run: three distinct focused
browser cases pass across this release's runs. The legacy recovery-opt-out
browser case was not rerun after the batch cap; focused quiet/Scene controller
regressions pass. These results and the four reviewed captures validate delivery,
not real-model literary quality.

## Reading recorded sources — v0.5.98

Opening a story's recorded source now means “hold this while I read.” It reveals
the remaining prose, cancels the automatic close, and changes the existing Hold
control to Continue. This applies equally to ordinary sources and the paired
farewell/oath disclosure. Folding the source again leaves the story held; Continue,
Skip or Escape returns to play. Each later story starts with sources folded and
the normal timer restored.

The interaction reuses the existing intermission schedule and reading pause. It
does not change the player's Pause preference, story cadence, combat precedence,
model activation, prompts, cache, save format, emotional mechanics or authorship
labels. No extra stage overlay or preference is needed. The visible indication
is the existing Continue control and its reading-status line.

Council review reused the checked-in Hold/Continue flow and the backlog's
reading-time requirement. `deja storytelling` recovered the `01a06835-15f`
history and recent continuation. A Menu-only Last story reread is queued
separately; this slice does not introduce a story archive or persistent memory.

Verification: 108 focused intermission/controller/director tests and ten portable
probe-helper checks passed, followed by version/boundary checks and one production
TypeScript/Vite build. One serial actual-app browser case passed with normal
motion: opening the native source disclosure at ten seconds held a short passage
beyond its original twelve-second deadline, revealed all ink, kept simulation
paused, survived Enter/Space collapse/reopen, and resumed game ticks on Continue.
It used one fake inference worker and one draft; this verifies UI delivery, not
model prose. Reviewed 960×640 and 320×568 captures show readable source/prose and
unobstructed controls. Chromium and the isolated preview exited without a retry.
The separate real-model exemplar screen is recorded in
[the writer comparison](NARRATIVE_WRITER_COMPARISON.md); its prefix was rejected.

## Last presented story — v0.5.99

One frozen passage is retained only after its automatic scroll successfully
opens. A newer pending draft never replaces this readable memory before it has
actually appeared. Rereading neither consumes that newer draft nor requests
another model completion; existing draft expiry and cancellation still apply.
The original public sources stay separate from prose;
an authored oath/farewell retains both copied records and its authored label.

The memory is current-page/current-campaign only: New hero, campaign adoption
and reload clear it, including switching away and back. Choosing No LLM, hiding
the page or temporarily inspecting another view does not erase a displayed
story. No prose enters game saves, Chronicle, model prompts or a growing archive.

The Menu action is unavailable before any story appears and outside safe Watch
scenes. It permits intentional reading while user-paused, preserving that Pause,
but does not interrupt fights, encounter engines, cutaways, catch-up, recovery,
startup, updates or another modal. Menu closes and reading pause is claimed in
the same task, preventing the queued automatic check from presenting a different
story in between. Closing the reread restores a visible Menu focus target and
starts the existing minimum gap before another automatic intermission.

Council review reused the `deja "Last story"` continuations (`[codex] 03` /
`2026-09-03T0`, `[codex] 06` / `2026-09-06T1`), the existing safe-break gate,
and Hold/Continue controls. This adds reader control, not stronger model prose,
persistent emotional state or relationship progression.

Verification: 174 focused narrative/startup tests pass, including nine new
one-passage tests covering replacement, model/authored provenance, deeply frozen
oath/farewell records and campaign/page reset. Version/boundary checks and the
production TypeScript/Vite build pass. One actual-app browser case passes with
a fake rejected inference result and production authored-care recovery: the
same prose, caption, source, attribution and accent reopen fully revealed;
Continue preserves user Pause and restores Menu focus. Selecting No LLM retains
the reread without an additional worker, load or write. It records zero model
requests/page errors. Reviewed 960×640 and 320×568 scroll captures and the narrow
Menu show no clipping, horizontal overflow or obscured controls.

The first anchored browser selector discovered zero tests; listing confirmed
one unanchored match. That single actual case passed in 1.7 minutes (1.9 minutes
overall), without rebuilding or retrying a failed browser case. Chromium and
the isolated preview closed. This validates reader control, not real-model
literary quality. The next authored narrative slice is **First victory together**
in V04.13x2k; stronger local writing and persistent emotional arcs remain open.

## Local DM staging — v0.5.100

The existing cached model now makes a separate one-token direction decision
before its unchanged prose request. Public scene snippets, current focus and
named public character context offer three host-built compositions. The first
story offers all three; subsequent requests capture and exclude only the last
**actually shown** stage. This is a host eligibility rule for visual variety,
not a claimed gain in literary reasoning or a host-selected winner.

The worker preserves the actual scores of the two or three eligible label
tokens and masks the rest, using a custom
[Transformers.js logits processor](https://huggingface.co/docs/transformers.js/en/api/generation/logits_process).
It generates one greedy token with a 512-token input limit and 30-second
deadline. The ordinary writer's model, cache identity, prompt, 64-token output
budget and generation options remain unchanged. There is no backend, additional
model, new download or advanced setting. A completed invalid label falls back
to default parchment. Runtime failure cannot masquerade as a ready writer.

One captured request carries its selected stage through the controller, held
passage and renderer. Navigation, hiding or campaign invalidation between the
two model calls prevents starting new prose and settles without unloading the
saved model. Ordinary gameplay inactivity does not invalidate a captured scene.
Last story copies the stage only after successful presentation and rereads it
without any inference. A queued or discarded passage never consumes a stage.

The Orrery uses an angular astronomical frame and three assembling orbits;
Moth Court uses an arched velvet theater, a lantern and two paper moths. Each
occupies a clipped strip above the prose rather than overlapping text or combat.
Entrances play once, then settle. Hold, replay and reduced motion render still.
Both treatments retain the existing readable crimson-on-parchment text, folded
public sources and large reader controls. A separate **Local DM staging** line
attributes the actual choice without relabelling authored recovery as model prose.

The first [real direction report](../tools/creative-story-probe/direction-report-2026-09-07T05-55-47-024Z-bb86104d-bd07-4bee-9102-3d18264f850c.json)
used the production worker and already staged, verified model files: 52.620
seconds to load, then choices **1 / 1 / 1** in 12.609 / 10.111 / 10.013 seconds.
The same worker subsequently wrote prose in 70.330 seconds with no generation
network requests. The run closed in 162.696 seconds. It proves working model
direction followed by prose, but **no observed variation**; the text still
invented an unsupported waiting premise. The no-repeat eligibility rule was
added in response, not hidden behind retries or shuffled labels. This release
does not close the prose-quality target below.

The separate [cooldown integration report](../tools/creative-story-probe/direction-cooldown-report-2026-09-07T06-10-21-531Z-2636b2e8-df79-42c3-96cc-47c9c0b5c4dc.json)
then exercised the changed code once: excluding parchment produced **Moth Court**
(13.376 seconds), excluding Orrery produced **Crimson Chronicle** (8.863 seconds),
and excluding Moth Court produced **Crimson Chronicle** (10.657 seconds).
Every choice was eligible. The same staged model loaded in 57.814 seconds;
this test did not repeat prose generation. These three fixed exclusions are
integration fixtures, not a claimed sequential gameplay history. Observed
variety combines the explicit host eligibility rule and real model scoring.

Verification: 244 focused narrative/runtime tests and 15 portable probe tests
pass, alongside version/boundary checks, TypeScript and one production build.
One actual-app browser case passed in 1.7 minutes: fake direction 2 traversed
the real controller into Orrery, then Last story retained it without another
direction or prose request. Normal entrance, held/reduced-motion stillness,
44px controls, pause ownership and desktop/320px containment passed. Reviewed
captures show readable, separated scenery and prose. Moth Court captures use an
explicit CSS-only fixture; its actual model selection is evidenced separately
by the cooldown report above. No browser retries or new model downloads occurred.

Council review reused the recalled August 30 cutscene-selection discussion,
September 6 captured-request discussion, V04.19e imagined surreal detours and
the existing one-passage reread. The next DM slice is selecting between eligible
public narrative moments (V04.13x2m); companion first-victory reactions, factual
memory and durable emotional/relationship arcs remain in the backlog.

## Local DM chooses the story moment — v0.5.101

The first actual subject-selection slice offers one newer public scene against
one retained, unexpired injured-companion farewell. The host proves eligibility
and captures both sources. The existing worker then scores two literal labels:
1 means current scene, 2 means the recorded farewell. Its new `chooseMoment`
wrapper reuses the existing one-token direction transport and excludes label 3;
the worker, model files, cache and ordinary prose generation are unchanged.

This adds one 30-second-bounded decision only when two different eligible
sources exist. A single source follows the existing stage-then-prose path.
Missing, stale, same-event or cross-campaign alternatives cannot trigger a choice.
An invalid completed response preserves the previous milestone priority and is
labelled as default, never model selection. A runtime failure or cancellation
stays quiet. There is no additional model, backend, setting or download.

Both draft plans are prepared before inference, using their own exact public
facts, character viewpoint, focus, seed and possible authored recovery. Choosing
the current scene cannot import a departed companion into its prose or attach
the earlier oath to its recovery. If the current scene has a new active companion,
the requested Shared road focus survives the solo farewell's effective Inner
life focus. The chosen source is frozen into the held passage and Last story.

One busy operation spans moment selection, stage choice and prose. Both offered
ticks retire together; the unchosen scene is not a second queue. Existing cadence,
admission expiry and safe-break presentation remain host-owned. Invalidation
between phases prevents the next request, settles the operation, and retains
the activated worker unless the player explicitly turns it off. The older
immediate campaign-switch regression now correctly expects no stale prose call.

A verified selected farewell uses **A farewell revisited** in the existing
caption. The model's choice is explained only inside the folded recorded source.
This is separate from prose authorship and Local DM staging. Accepted model prose
retains one source record; authored oath/farewell recovery retains its existing
two records. Default selection makes no DM claim. Rereading retains the original
caption and selection without another inference call or added battlefield text.

The [real two-pair report](../tools/creative-story-probe/moment-choice-report-2026-09-07T07-27-48-716Z-03c8f499-c936-484a-9131-0787b21b4858.json)
records a 37.911-second cold load, then current/current choices in 12.537 and
10.521 seconds. One pair offered the sealed arch; the other offered ordinary
solo travel. Both competed with the same recorded alive-but-injured companion
farewell. The model chose neither farewell. The 69.132-second run used verified
staged assets, generated offline with zero generation-network requests/errors,
and closed Chromium. No prose, retries or new weights were included. This proves
working source selection, **not better emotional priority or story quality**.

Verification: 339 focused tests, 18 portable probe tests, TypeScript,
version/boundary checks and one production build pass. The independent 25-case
selection suite covers both choices, character/source binding, immutable capture,
recovery provenance, requested focus, single-source eligibility and cancellation.
One canonical actual-app browser case passed in 1.9 minutes. A real saved T18
world committed its farewell at T19 and a newer scene after that; a fake moment
choice of 2 then traversed the real controller into the farewell's exact prose
prompt, source, Orrery staging and Last story. It verified separate provenance,
one recorded source for model prose, unchanged request counts on reread, pause
ownership, folded-source behavior, and 44px controls. Desktop/320px captures were
reviewed without overlap or clipping. This is mocked selection/prose UI evidence,
not actual-model farewell prioritization. No browser retry or rebuild was needed.
Exact live-site verification is recorded in the release handoff.

This reuses the September 6 captured-request decisions recovered by
`deja "captured request"`, the bounded farewell milestone and the existing
Last story renderer. The next smaller emotional milestone is **First victory
together** (V04.13x2k); the newly queued role-bound duet (V04.13x2n) builds on
[Wildermyth's documented story-role requirements](https://wildermyth.com/wiki/Comic_Editor_Reference#Story_Roles).
Persistent relationship memory and stronger generated prose remain open.

## First victory together — v0.5.102

A committed first shared win can now become a quiet emotional intermission.
The host requires the same active companion to participate in the completed
victory and move from zero victories to one. It verifies the exact final combat
action by replaying the canonical world step only after this rare boundary is
found. Recruitment, a loaded counter, loot, later wins, absent participants,
defeat, stalemate, mismatched campaigns and edited outcomes do not qualify.

The immutable packet contains the captured hero/companion identities, condition
and public battle source. It uses the same single expiring milestone slot as a
farewell, not another queue. With authored recovery enabled and Inner life or
Shared road focus, a completed rejected/repeated draft may use one of six new
original two-sentence passages. Healthy company permits tentative trust and
gratitude; injury brings relief complicated by worry. These are imagined
interpretations, not permanent emotion, combat credit, romance or promised healing.
Scene imagery, No LLM, cancellation and runtime failures remain quiet.

When a newer current scene is also eligible, the existing local DM can choose
between it and this first victory before staging and writing. First-victory
selection changes only the public milestone label in the short decision prompt;
ordinary prose prompts, worker transport, model and cache remain unchanged.
Choosing the current scene drops the victory context completely. A single
eligible milestone needs no extra choice. Both offered ticks still retire together.

The existing caption becomes **First victory together · location**; the same
trust/care accent conveys the authored emotional theme without a new HUD or mood
score. The exact public battle record remains folded. Verified first-victory
context can accompany accepted model prose too, without implying that the model
invented the event or chose it when no choice occurred. Prose, staging and moment
selection retain separate attribution. Last story freezes all of them and does
not request another inference or write to a save.

The [real two-pair report](../tools/creative-story-probe/first-victory-choice-report-2026-09-07T08-21-59-952Z-a3595ba3-44be-4721-86c0-22f0e144a8c3.json)
records current/current for both healthy and injured first-victory alternatives.
Cold load took 46.375 seconds; decisions took 13.013 and 8.500 seconds; total was
75.614 seconds. Verified existing assets were reused, decisions ran offline with
zero generation-network requests/errors, and Chromium closed. There was no
prose generation, retry or new model download. This proves working local choice,
not improved emotional priority or literary quality. The four current choices
across this and the farewell report motivate V04.13x2o's counterbalanced-label
experiment; production must not claim meaningful preference until that is shown.

This reuses the first-victory backlog/canonical companion discussion recovered
by `deja "First victory together"` (September 6, September 3 and August 30
indexed sessions), rather than treating Battle Spoils as a universal win signal.
The council separately reviewed canonical projection, runtime source binding
and quiet rendering. The next visible relationship slice remains the role-bound
two-character intermission, informed by
[Wildermyth's required and distinct story roles](https://wildermyth.com/wiki/Comic_Editor_Reference#Story_Roles).
Persistent emotional memory, full arcs and stronger generated prose stay open.

Verification: 446 focused narrative/runtime tests across 13 files, 19 portable
probe tests, application/spec TypeScript, version/boundary checks and one frozen
production build pass. One actual-app browser case passed in 1.9 minutes with
no retry: the saved T3 world committed its real winning action at T4, recording
the actual companion's 0-to-1 win. A fake rejected model draft then exercised
the checked-in authored recovery, exact folded battle record and Last story.
Reviewed 960px/320px captures show readable prose, contained scroll layout and
44px controls. Replay made no new worker/load/write/decision requests; user Pause
ownership and zero AI-network/page-error assertions passed. This is canonical
simulation plus mocked-inference UI evidence, not actual-model prose quality.
Exact GitHub/deployment and live-site results are recorded in the release handoff.

## Finish the displayable story sooner — v0.5.107

The local 135M writer now ends generation when two finished sentences and a
lexical look-ahead establish the passage already used by the display cleaner.
This avoids spending the remaining token allowance on a third sentence that
would be discarded. Prompt tokens never count toward completion. A fresh
stopping criterion belongs to each write; the separate DM decisions are unchanged.

The existing sentence extraction is shared without changing text-cleaning rules.
Ambiguous abbreviations, initials, ellipses and unclosed quotations wait for EOS
or the unchanged 64-token ceiling. Exact two-sentence endings can still finish
at EOS. This is conservative English segmentation, not a universal grammar
validator or a semantic quality check.

No additional prose, setting, model download, cache namespace, HUD or streaming
overlay is added. Generation remains behind play. A ready story still waits for
combat and its presentation to clear, then uses the existing readable scroll;
Hold and Escape preserve the player's independent Pause choice. The 90-second
write deadline, minimum story cadence and one-passage queue remain unchanged.

This reuses the writer-latency and safe-intermission decisions recovered from
local session `01a06835-15f` with `deja "the_grind_2 writer latency"`. Actual
model timing, mocked-inference actual-app presentation and literary quality are
separate evidence: faster completion is not stronger emotion or a full arc.

### Measured completion and release verification

The [single matched browser receipt](../tools/creative-story-probe/sentence-stopping-report-2026-09-07T13-36-43-073Z-0dbd6217-8312-4b4e-9599-b40eea37213a.json)
uses the exact archived Mara prompt, 194 input tokens, production client, pinned
135M q8 model and one WASM thread. Baseline removes only the stopping property;
both variants record actual generated-token counts. Accepted prose is identical,
and candidate raw text is a baseline prefix: **64 → 38 output tokens**, with
**62.042 → 47.285 seconds** measured for writing. Cold loading took 32.661
seconds and cache-only restoration 14.639 seconds. Both offline writes and
cache restoration attempted zero requests; workers, browser and server closed.
The total was 166.880 seconds, with no retry or model download.

Baseline ran first, so warm hardware and cold/restored-worker order confound
timing. This is one operational check, not a general speed or prose-quality A/B.
The receipt predates the council's stricter possessive-apostrophe safeguard;
its exact source hashes remain intact. The final guard has separate regressions
and recorded-output replay, not another claimed inference run.

Final focused verification passes **370 tests across eight suites**, plus
**19 portable probe-contract tests**, application typecheck and production build.
Version and canonical-boundary checks pass. Full CI/deployment and the exact
live version are verified separately in the release handoff.

The single actual-app battle-to-scroll case passed in 53.499 seconds (82.267
seconds including suite setup), with no retries. It proves a completed draft
stays hidden through the real battle and its presentation, then appears with
exact cleaned prose and model attribution. Desktop 960×640 and phone 320×568
captures were inspected: contained parchment, readable ink and 44-pixel controls.
Escape resumes play without changing the player's Pause preference. The fixture
uses one mocked inference worker/load/write, zero model requests and no page
errors; it is presentation evidence, not a second real-model literary sample.

The final build entry is `index-DF_EFQ6t.js`, SHA-256
`6c4a6dfd776b0b5d3862fe2c588af3ed90b141656f3e657317a1ba04205acee7`.

## Recorded values carry into farewell — v0.5.106

The hero's recorded curiosity, loyalty, mercy or courage now shapes the second
sentence of an authored oath/farewell reflection. Eight original variations
connect concern with understanding, belonging, dignity or fear. Every one keeps
the companion wounded but alive and leaving; none invents a cure, quarrel, prior
conversation or promise about the future. Existing openings and all three
neutral paragraphs remain exact when no usable value is supplied.

This is the next authored continuity slice after first-victory hero voices. The
same captured value set and bounded selector apply, not a new personality model.
The existing recovery permission, milestone binding and story rhythm still gate
the passage. No model prompt, inference call, queue, public-history packet or
save field changes. Accepted model prose receives no authored-value attribution.

The existing parchment keeps one paragraph and the care accent. Its folded
source retains both the actual farewell and earlier oath, plus the quiet note
“Hero voice inspired by recorded loyalty.” Exact text, authored origin and the
recorded hero bind that note. Last story freezes it without generating again;
replacing the story clears it. No new HUD, role labels or mood color is added.

Recovered design context: `deja "farewell values"`, session `01a06835-15f`.
Independent council review found no integration blockers. Stronger generated
character writing and durable emotional/relationship arcs remain separate open
work; these eight authored sentences must not count as generated prose evidence.

Local verification: 509 focused narrative tests across twelve suites pass,
including unchanged first-victory/duet paths and malformed, late, replaced and
model-origin attribution cases. Application/spec typing, the single browser-case
collection, version/boundary checks and one frozen production build pass.
Frozen entry: `index-5KA1HCKU.js`, SHA-256
`7e3a9d35a70290beac72e2e4335d3413241f39311abd24330a604503f412b775`.
The production writer worker and CSS remain unchanged.

The single canonical browser case passed in 121.572 seconds (134.336-second
suite), without retry. Real T18→T19 play captured Bryn Starling's farewell to
Dima Bramble, with the earlier T1 Hollowwatch oath and the T19 Eldermere record.
Bryn's actual curiosity/courage set selected the original courage reflection;
a newer solo scene did not override stored Shared road priority. Two actual-app
requests used mocked inference (an ordinary accepted passage, then a rejected
farewell draft); production code selected and presented the authored recovery.
One worker/load, two writes, zero moment choices and two stage choices were
observed. Last story added none, and exact sources/attribution cleared on close.
No model requests or page errors occurred. This is integration evidence, not an
LLM quality sample. Receipt:
`/tmp/the-grind-2-farewell-value-browser.nqXG2M/report.json`.

All four 960px/320px folded/open-source captures passed independent and parent
visual review: readable crimson prose, internal scrolling when needed, accurate
records and quiet value attribution, with contained 44px controls. Browser and
strict-port preview closed; no additional battle overlay or role labels appeared.

### Separate stronger-writer feasibility work

Two explicitly separated tooling attempts reused two archived synthetic public
scenes, not the canonical browser farewell. The first failed when Chromium's
Cache API rejected the 491 MB GGUF, before model initialization. Its exact source
and immutable receipt were checkpointed independently as `ebe023b`.

The corrected, explicitly authorized direct-Blob mode then loaded pinned Qwen2.5
0.5B Q4_K_M with wllama 3.6.1 in 30.855 seconds, CPU-only and single-threaded.
The first unchanged Mara/arch request exceeded its 90-second write limit; no
completed prose returned, and the second scene/reload were not attempted.
The 122.991-second run closed browser/server, retained all source hashes and made
zero generation-network requests. Five portable checks passed. See the exact
[direct-Blob receipt](../tools/creative-story-probe/stronger-writer-blob-report-2026-09-07T12-38-45-589Z-58002ade-8cbd-4cfa-96d8-3c80df55b545.json)
and [probe documentation](../tools/creative-story-probe/README.md).

This establishes browser runtime loading compatibility, not acceptable writing
latency, literary quality or persistent-cache restoration. No partial-token
stream was instrumented, so the next diagnostic must distinguish prompt
processing from generation before another comparison. The approximately 500 MB
candidate stays tooling-only; the shipped model, download consent and cache
remain unchanged. Model/runtime/quantization all differ from historical 135M
results, so this is not a controlled same-runtime A/B.

## Recorded values shape a hero's voice — v0.5.105

Shared road first-victory duets now let the hero's already-recorded values shape
their authored inner thought. Curiosity explores uncertainty; loyalty weighs
trust against obligation; mercy considers kindness and dignity; courage makes
room for fear. Each value has two original healthy and two injured variations:
16 new thoughts, while the companion keeps the existing unprofiled response.
A job title, victory or injury never manufactures a companion personality.

The selector uses only the captured hero's known values, with deterministic
rotation rather than a claim about which value is strongest. Unknown, malformed
or absent values retain the exact neutral pair. The existing first-victory source,
Shared road focus, rejected-draft recovery permission and cadence still apply.
Accepted ordinary model prose remains model prose; it is not relabelled as a duet.
No additional inference, download, mood score, save field or queue is introduced.

The voice remains inside the same ink-revealed parchment. The existing folded
source quietly says, for example, “Hero voice inspired by recorded curiosity.”
Only an authored, exact-text-bound duet with valid metadata receives this note.
Last story freezes it with the original passage, and replacement or closing
clears it. The trust/care accents keep their existing meaning; values do not
create new colors, badges or battlefield text.

This reuses the recorded-value and captured-viewpoint decisions recovered by
`deja "Shared road"` from session `01a06835-15f`. The
[Wildermyth Writer's Guide](https://wildermyth.com/wiki/Writer%27s_Guide#Heroes)
describes declared hooks and personality inputs for character-specific stories.
Our adaptation uses only values the game actually stores, and copies no dialogue
or history. Distinctive companion traits and factual callbacks remain later work.

**Real-model hint experiment: not promoted.** The single
[curiosity/mercy run](../tools/creative-story-probe/value-voice-report-2026-09-07T11-26-05-105Z-64009828-3965-419d-836b-191f1d8ac691.json)
kept one healthy first-victory source, companion, seed and ordinary two-sentence
format. Only the recorded hero value and one corresponding focus hint differed;
this is not a value-only comparison or an untreated baseline. Both outputs
passed text cleanup but neither passed narrative review (0/2). Curiosity invented
age, personal battle history and a prior warning; mercy abandoned the scene for
a desert and treated Mara as a place. Different strings did not establish
distinct grounded character voices. No retry or production prompt change followed.

The run verified 139,538,098 existing artifact bytes, completed the model cache,
and generated offline with zero network requests or runtime errors. Cold load
took 45.796 seconds; writing took 60.955 and 56.732 seconds. Total measured time
was 169.824 seconds and Chromium closed. The candidate remains tooling-only;
the live value-shaped duets are explicitly authored recovery, not these outputs.
The next prose-quality task should compare a genuinely stronger client-side
writer while retaining the same fixed grounding checks and finite budget.

Local checks: 398 focused narrative tests across ten suites passed, plus six
actual-builder probe tests and 27 portable probe tests. Application/spec typing,
single-case browser collection, version/boundary checks and one frozen v0.5.105
build passed. The ordinary writer worker and CSS are unchanged.

The single actual-app browser case passed in 67.614 seconds (78.872-second suite),
without retry. Canonical T4 combat proved the companion's participated first win;
Corin's captured courage/loyalty values selected the original loyalty thought,
while Iona's historical companion line remained unchanged. One worker, one load,
one rejected mocked draft, zero moment decisions and one staging decision were
observed; Last story added none. This proves authored recovery integration, not
real-model prose quality. All four 960px/320px folded/open-source captures passed
visual review, with normal ink reveal, reduced-motion replay, contained text and
44px controls. No AI requests or page errors occurred, and the browser closed.
Receipt: `/tmp/the-grind-2-hero-value-browser.GGqPWC/report.json`.
Frozen entry: `index-Z57Zfd0s.js`, SHA-256
`d0af913f1c7b4fd840482ecdcfeccf986961f308a6328ceb7801dbb471e1b1fa`.

## Shared road prioritizes companion moments — v0.5.104

The existing **Story focus → Shared road** now prefers a captured companion
farewell or first shared victory when a newer public scene is also eligible.
The remembered preference survives the current party becoming solo; the selected
story still uses its own captured people and source. No new setting is needed.
Inner life and Scene keep the experimental local-DM subject chooser.

Only the competing-moment inference is skipped. The same local writer still
chooses staging and writes ordinary prose; rejected completed drafts may use the
existing permitted authored recovery. One worker, the expiring milestone slot,
safe-break cadence and retirement of both offered ticks remain unchanged.
Missing, invalid, expired or foreign milestones cannot gain focus attribution.
The existing quiet-recovery option does not start capturing milestones.

“Shared road focus prioritized this companion moment.” appears only inside the
folded source and survives Last story without inference. Captions, prose and
staging keep their distinct attribution. This is player-directed story emphasis,
not improved model reasoning, model-generated duets or persistent emotions.

Reused decisions: `deja "moment preference"` recovered the stored Shared road
and captured-milestone discussion from session `01a06835-15f`. The official
[Hades narrative update notes](https://www.supergiantgames.com/blog/hades-updates/)
describe contextual narrative priorities; this release adapts that principle
to our existing player focus without copying dialogue or claiming its algorithm.

**Separate real-model evidence.** The single
[counterbalanced four-choice run](../tools/creative-story-probe/counterbalanced-choice-report-2026-09-07T10-23-19-355Z-dfa0df0c-d93d-4146-a371-d7821ea06c30.json)
used two fixed public pairs, each in original and reversed order. All four raw
choices were `1`: current/farewell and current/victory respectively. Semantic
selection followed presentation in these samples; numeral and position remain
confounded. Four decisions cannot establish a universal model bias or a quality
improvement. Production prompts were unchanged and no favorable-result retry ran.
Cold load took 43.821 seconds; decisions took 12.355, 11.671, 8.290 and 7.348
seconds. The run completed in 90.988 seconds, closed Chromium, verified the
139,538,098-byte staged model, and generated offline with zero network requests
or errors. No prose or model download was involved. Stronger prose and full
character arcs remain open, alongside trait-shaped voices and factual callbacks.

Local verification: all 343 focused tests across eight narrative suites passed,
including 19 independent focus-policy cases, 75 intermission cases and 249
controller/director/provenance/replay cases. The 27 portable probe tests,
application/spec TypeScript, list-only browser collection, version/boundary checks
and one frozen production build passed. The v0.5.104 entry is
`index-GGlGRE-D.js`, SHA-256
`f309fb0efe6743439bf20fd112a497007991ea7f1d8704a01c9bb743f3fc6c8f`.
The writer worker and CSS remain unchanged from v0.5.103.

The single canonical actual-app browser case passed in 108.540 seconds
(120.815-second suite), without retry. A real T19 farewell competed with a
distinct eligible T20 solo atlas scene. Stored Shared road retained the farewell
with zero moment calls; the initial and farewell stories each still made one
stage call and one prose request. One worker/load, two writes, no terminations,
no AI-network requests or page errors. The test uses explicitly mocked accepted
prose, not a real-model prose-quality claim. Last story retained the source and
focus credit without new inference. Desktop 960px and mobile 320px folded/open
source captures were visually reviewed; text and 44px controls stayed contained.
Machine receipt: `/tmp/the-grind-2-priority-browser.K07OOv/report.json`.

## Two viewpoints on the shared road — v0.5.103

The first role-bound duet gives the hero and companion different imagined inner
thoughts after their first verified shared victory. **Menu → Options → Advanced
narration options → Story focus → Shared road** selects this treatment; the
existing preference is remembered, and its helper text now explains the duet.
Inner life retains the preceding single-voice reaction. No new setting,
automatic model activation, download, queue or per-scene button is introduced.

The first-victory projector now explicitly proves both named characters are
unique, distinct participants in the canonical before/after battle. Equal display
names are allowed because Hero and Companion are separate roles. A profession,
loaded victory counter or invented relationship cannot fill an absent role.

Six new original authored recovery pairs provide one concise first-person thought
per character. Healthy company contrasts tentative trust with belonging or doubt;
injury contrasts care with independence or fear of being a burden. They remain
imagined interpretations, not actual dialogue, durable moods, romance, promised
healing, combat credit or recorded memories. Recovery still requires a completed
rejected/repeated draft and the user's existing permission. Quiet recovery,
Scene imagery, cancellation, runtime errors and No LLM do not create a duet.

Both thoughts live inside one parchment with small static **Hero · name** and
**Companion · name** labels and restrained inset rules. The existing ink reveal
continues across the two thoughts; Hold, reread and reduced motion show them
fully. There are no chat bubbles, portrait downloads, relationship meters or
new battlefield labels. The public battle source stays folded and authorship
remains explicit. Mismatched duet/text metadata uses ordinary prose instead of
reassigning another passage to two speakers. Closing or replacing the story
clears both labels and thought nodes. Last story deeply freezes the exact pair,
source and original attribution without requesting more inference.

This reuses the Shared road focus and solo fallback recovered by
`deja "Shared road"` from session `01a06835-15f`, plus v0.5.102's canonical
milestone, captured controller request and one-passage replay. The council
reviewed role identity, recovery boundaries and quiet mobile presentation.
The [Wildermyth Writer's Guide](https://wildermyth.com/wiki/Writer%27s_Guide#Heroes)
also motivates the next existing V04.13d2 refinement: use actually recorded
values/traits to distinguish recurring voices, without manufacturing biography.
This first duet is not a full relationship arc or persistent emotional memory.

**Actual model duet experiment: not promoted.** The isolated candidate requested
exact HERO/COMPANION lines, each one distinct first-person thought. Its strict
parser never splits arbitrary ordinary prose into roles. The existing production
client/worker and 64-token generation limit ran the
[single healthy/injured trial](../tools/creative-story-probe/story-duet-report-2026-09-07T09-26-19-890Z-78f89876-0053-4b96-a2f4-de86fc37f50d.json).
Neither result supplied the required voices (0/2 structurally usable, 0/2 quality).
The healthy output promised continuing victories for years; the injured output
invented a fight between the companions and asked the reader for feedback.
The parser rejected both. No criteria were weakened and no retry followed.

Cold load took 55.729 seconds; the two writes took 34.898 and 63.746 seconds.
The 175.145-second run verified the existing 139,538,098 bytes of staged assets,
used a complete browser cache, generated offline with zero generation-network
requests/errors, and closed Chromium. The raw failure remains immutable evidence.
The candidate builder/parser remain an isolated experiment; production model
messages, worker, cache and ordinary accepted prose are unchanged. Only the
authored recovery path supplies paired voices in this release. Better generated
duets require a new demonstrated improvement, not another layout label.

Verification so far: 537 of 538 focused tests passed in the 15-file batch. The
remaining new fixture appended a third sentence to previously accepted prose;
the existing two-sentence cleaner correctly treated it as a repeat. Replacing
that fixture with genuinely different two-sentence prose made all 36 tests in
its controller suite pass, with no production change. The 22 portable probe
tests, application/spec TypeScript, version/boundary checks and one frozen build
also pass. The failed candidate prompt is absent from production JavaScript;
the creative-worker bundle is unchanged. An initial browser collection attempt
stopped before Chromium because a new test-only import pulled a browser JSON
dependency into Node. Literal reviewed fixture expectations fixed collection
without rebuilding or changing application behavior.

The single actual browser case then passed in 2.0 minutes (98.065 seconds for
the test). The real saved T3 world committed its winning combat action at T4;
the first-victory source was captured on the first draft. One fake rejected
model response exercised the actual authored duet recovery, two named roles,
trust accent, exact folded battle record and Last story. Retained counters show
one worker, one load, one write, zero moment selections, one stage choice and
zero terminations; replay added no requests. Normal-motion entry showed static
role labels while ink was still revealing, Hold revealed both thoughts, and
320px reduced-motion replay stayed fully visible. Reviewed 960px/320px captures
show readable, contained text and 44px controls. There were zero AI requests or
page errors; the preview/browser closed. This is real simulation with mocked
inference, not an actual-model dialogue pass. Full GitHub and exact live-site
verification are recorded in the release handoff.

## Original prose-quality target and acceptance (still open)

The player feedback is accurate: current Story Beats select from a finite set
of factual sentence forms. Both story Transformers adapters install a trie
logits processor; V2 additionally requires mechanics clauses. Those constraints
prevent the model from composing a scene. More scheduling cannot fix this.

The original manual-slice target was one complete interaction: choose a committed
event, click **Tell this scene**, and read two to four original sentences with
atmosphere, character voice and a reaction to what happened. Keep the exact
event and mechanical changes separately visible in Chronicle. Generated prose
is a literary interpretation and cannot execute commands or change the game.

The automatic intermission now replaces that manual UI; the unpassed prose
quality and real-output acceptance below still apply to the writer itself.

Implementation and acceptance:

1. Test a small instruction-tuned causal model in the browser with the existing
   Transformers.js stack. Use its chat template and decode the generated suffix.
   Keep actual outputs and timings from eight fixed scene inputs. Judge whether
   those samples read like engaging prose before choosing a model by size.
2. Generate without the current sentence trie or source-word allowlist. Allow
   new imagery and interior reactions; constrain length and text rendering.
   Keep factual source identity, cancellation and the game's authoritative
   record independent of the writer. Reject empty, broken or prompt-echo output.
3. Wire one explicit action through the worker to Chronicle, showing the
   factual source during generation. Distinguish model prose from fallback.
   Retrying after completion must work. Add no automatic download or server
   inference path; disclose any changed model download before activation.
4. Inspect real generated samples in the actual UI at compact and desktop
   widths, including combat suppression. Prove inference works offline after
   loading. Save the prompt, model revision, outputs and measured runtime with
   the feature so quality claims are inspectable. Mocked text and expanded
   template catalogs do not satisfy this acceptance.

Research starting point, not a quality-approved winner: Hugging Face's
[SmolLM2 model card](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct)
documents instruction tuning, rewriting and Transformers.js generation. A
[browser ONNX conversion](https://huggingface.co/onnx-community/SmolLM2-135M-Instruct-ONNX-MHA)
is available. Its measured weaknesses are recorded above. Test larger candidates
if the small model only paraphrases; do not claim creativity from its model
name. [Transformers.js WebGPU documentation](https://huggingface.co/docs/transformers.js/en/guides/webgpu)
describes GPU execution, but WASM and WebGPU performance must be measured
separately on the chosen artifact.
