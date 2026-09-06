# Creative local storytelling: experimental slice

Status: a separate, opt-in **Creative storyteller** is implemented with the
pinned SmolLM2 135M q8 browser model and 48 original writing seeds. This is a
usable experiment, **not a passed prose-quality gate or a default narrator**.
The manual factual Story Beat lockout repair remains in place. Creative prose
now arrives as automatic, watch-first parchment intermissions after activation.

## Current interaction

Open Local Narrator and choose **Download & try creative writer**. Initial
model/tokenizer/config assets are 139,538,098 bytes; the local ONNX runtime adds
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
There is no automatic model load/download on a fresh page in this experiment.

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
with a 90-second attempt cadence and at least 90 seconds between closing one
scroll and opening another. Unshown passages expire after three minutes. Normal
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
  returns focus to Inner life.
  Arrival, injury and travel suggest different emotional angles. Only positive
  shared victories enter this focus; zero does not imply a newly formed party.
  A seed's concrete image provides variety without its conditional plot advice.
- **Scene imagery**: atmosphere and a vivid image of the moment.

Changing focus clears the old interpretation without running the model. The
selection is fixed during writing. Character context is captured with its scene;
an explicit focus change discards a queued interpretation without starting a
request inside settings. The current companion can be selected before the first
write, not just after a draft has populated the worker context.
Only a frozen public projection is passed, never raw companion identity,
hidden disposition, internal IDs, prior prose or the whole save. The current
game has one active companion, not a multi-member party. This is literary
viewpoint control, **not a persistent emotion or relationship simulation**.
Parchment and crimson ink carry the literary presentation; no color is a claimed
mood measurement and no mood meter is placed over an actor.

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
