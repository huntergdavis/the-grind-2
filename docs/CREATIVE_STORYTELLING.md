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

Only **Pause** and **Menu** remain in the main controls. Menu contains saved
characters, New hero, Adventure panels, Stage focus and **Options**. Options
shows the same simple storytelling switch; **Advanced narration options** is
closed initially and contains focus, rhythm, draft recovery and model tools.
An unavailable writer leaves the game running, with **Retry LLM** in Options.

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
off, changing campaign/view, hiding the page or updating discards pending prose;
hidden/navigation-invalidated requests may finish within the existing bounded
deadline but their output is ignored. Turning the writer off cancels it and keeps
cached files. No new request starts while inactive, user-paused or in settings.
Loading either narrator turns the other off to avoid retaining both runtimes.

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
