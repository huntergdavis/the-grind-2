# Browser creative-story probe

Run from the repository root: `node tools/creative-story-probe/run.mjs`.

The runner downloads five artifacts from the pinned SmolLM2 135M instruct ONNX
revision, builds this isolated page with the installed Vite version, and loads
the q8 model in headless Chromium using Transformers.js 4.2.0 and WASM. Node
downloads and serves files; **all model inference runs inside the browser**.
After model loading, Playwright switches the browser context offline before any
generation. The report records all attempted requests during generation.

Two synthetic adventuring fact capsules each run once without a creative seed
and once with the same rich creative direction. Both conditions use the same
system instruction and greedy decoding with a 64-new-token ceiling. The local
server sends cross-origin isolation headers to permit two WASM threads. There is
no trie, fixed answer list, vocabulary whitelist, or authored completion. Greedy
decoding controls sampling noise for this small comparison; these four examples
are evidence of behavior, not a general quality evaluation.

Model artifacts and build output stay in ignored
`.narrator-t5-rebuild/creative-probe/`. The small synthetic `report.json` records
outputs, latency, artifact byte counts and SHA-256 hashes, model and tokenizer
revision, runtime versions, and offline request evidence. A three-minute browser
watchdog closes Chromium if model loading or generation stalls. Downloads have
individual three-minute timeouts.

Primary references:

- [Pinned ONNX repository](https://huggingface.co/onnx-community/SmolLM2-135M-Instruct-ONNX-MHA/tree/5b6682c7c9df18f004bfb7e635cba3f3d98537d8)
- [Source model card and Apache-2.0 license declaration](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct)
- [Transformers.js browser and quantized model documentation](https://huggingface.co/docs/transformers.js/en/index)

The ONNX conversion card itself omits license metadata. Its declared source
model has Apache-2.0 metadata; distributing an artifact should include the
applicable source license and attribution.

Local recall before implementing (`deja "SmolLM2 browser generation creative
story probe"`) returned no prior implementation. The existing
`tools/narrator-story-beat-browser-evaluation` supplied the local WASM runtime
configuration pattern; its finite-output decoder is deliberately not part of
this experiment.

## Observed four-sample result

The committed synthetic report records four actual browser generations, with
zero requests during generation. Model and tokenizer/config artifacts total
139,538,098 bytes. Loading took 16.411 seconds; each 64-token output took
33.297–37.637 seconds with two WASM threads. This server's cross-origin isolation
headers enable two threads; those timings do **not** represent the current
single-thread production deployment. An earlier one-thread trial needed 80.549
seconds for 100 tokens and its three-minute run watchdog stopped before a second
sample completed.

The seed did change the writing: the river passage shifted from color imagery
to freedom, poverty, loneliness, and sadness. That shows steering, not a quality
win. Both conditions omitted the important paid-coin cost; the seeded passage
added an unsupported personal history. The watchtower outputs similarly added
unsupported surroundings, and one reversed the climb into a descent. All four
outputs reached the token ceiling mid-sentence. Seeds are useful creative
ingredients, but this tiny model remains an experimental writer with weak fact
retention; these samples do not justify making it the default narrator.

## Production cache and offline probe

After staging artifacts with the first command, run:
`node tools/creative-story-probe/run-cache.mjs`.

This builds the actual production client, worker, seed selector, prompt builder,
and text cleaner. It runs without cross-origin isolation, using the production
single WASM thread. A fresh browser loads the model from pinned artifact URLs
fulfilled with the local downloaded files. It checks the cache, disposes that
worker, switches the browser offline, and creates another production worker.
Only that worker's built JavaScript bootstrap is supplied from disk during
restore; all model and runtime network requests are blocked. It then generates
using the production prompt and records both raw and cleaned text. Requests,
runtime asset byte sizes, load timing, and output are saved to `cache-report.json`.
This tests model persistence; it does not claim the entire application shell is
available offline.

The first production probe successfully saved the model and restored it after
worker disposal with the browser offline. Cold loading took 46.278 seconds;
cache restoration took 23.215 seconds. Restore requested only the permitted
worker bootstrap, and generation attempted no requests. The shipped asyncify
runtime files measured 47,389 and 23,567,050 bytes: 23,614,439 bytes of runtime
assets, or 163,152,537 bytes including the five model artifacts (excluding app
and worker JavaScript).

That first production JSON/structured-seed prompt produced template-like code
instead of prose after 68.725 seconds. The real text cleaner returned `null`.
Cache persistence therefore passed, while that prompt failed the visible-prose
check. Do not count a completed model call as a successful story.

The strict pinned-URL fixture also exposed a Transformers.js 4.2.0 preflight bug:
`loadTokenizer` calls `get_tokenizer_files` without forwarding options, and its
metadata lookup defaults to revision `main`. The worker now pins the environment
remote path template as well as passing the revision. This ensures both the
preflight and cache lookup use the recorded model revision.

The structured-prompt failure is preserved in
`cache-structured-prompt-report.json`. A subsequent simplified-prompt cache run
verified restoration again, but its cold load and second initialization consumed
too much of the fixed three-minute budget; no output returned before the watchdog.
That inconclusive attempt is recorded in
`cache-simplified-prompt-timeout-report.json`.

The final production prose check skipped the already-proven second model load:
`node tools/creative-story-probe/run-cache.mjs --single-write`.
It retains the same three-minute overall limit and the production 90-second
write deadline. The observed result is in `generation-report.json`: cold loading
took 41.529 seconds and the real offline write took 55.419 seconds. It attempted
zero requests during generation. The simplified natural-language prompt produced
prose, and the production cleaner retained two complete sentences while dropping
the later meta-explanation.

This is a functional prose-path result, not a literary or factual quality pass.
The text invented an island and muddled the paid-coin cost. Seeds and shorter
prompts can steer this model, but these observations support an explicitly
experimental writer and further evaluation, not a dependable default narrator.

## Named-character viewpoint probe

Run `node tools/creative-story-probe/run-cache.mjs --viewpoint` to load the
production writer once, switch the browser offline, and generate three serial
samples. This mode has a five-minute overall watchdog and retains the production
90-second deadline for each write. It uses the staged model files without a new
download. This legacy command overwrites `viewpoint-report.json`, including
partial results after each completed sample. Do not rerun it over historical
evidence. The context-fit runner below creates a unique report on every run.

The fixtures are explicitly synthetic public scenes, not captured gameplay:

- A fully rested, curious Mara faces an arch that remains sealed and unentered.
- Mara welcomes Rowan, a newly sworn active companion with no shared victories.
- Mara keeps watch beside injured Rowan, who remains active in the party and
  has neither recovered nor departed.

The first uses `inner-life` focus; the other two use `shared-road`. Each passes
public hero values and at most one active companion through the actual
`projectCreativeStoryViewpoint` projection and `buildCreativeStoryMessages`
builder. Reports retain facts, projected names/status, seed, focus, full prompt,
raw output, cleaned output, and latency. Expected outcomes and emotional
opportunities are evaluation notes and are not extra model instructions.

These are qualitative spot checks of names, outcomes, and readable emotional
content. A nonempty cleaned string alone is not a quality pass. There is no
departed-companion history in this first probe.

Before implementing, `deja "creative story viewpoint companion"` recovered the
prior Character viewpoint plan in `[codex] 03 · 2026-09-03T0`: varied hopes,
worries, and mixed feelings grounded in hero values and public relationships.
That intent and the existing local browser runner were reused; the fixture
episodes themselves are newly authored synthetic data.

The initial named-character run is preserved in `viewpoint-initial-report.json`.
All three real writes completed offline, after a 42.947-second load:

| Synthetic case | Write time | Qualitative result |
| --- | --- | --- |
| Rested Mara, sealed arch | 59.716 s | Named, readable anticipation and trepidation; no overt change to the unresolved arch. An invented past appeared later in raw text and was omitted by the two-sentence cleaner. |
| Newly sworn Rowan | 36.075 s | Failed: source-of-the-source repetition, with neither named character nor the relationship represented. |
| Injured active Rowan | 59.857 s | Failed: advice about writing sentences, with no usable character moment or injury context. |

Both failed outputs were accepted as text by the initial cleaner. This exposes a
gap between text hygiene and meaningful storytelling; it is not evidence that
shared-road character narration works. The new-oath seed also contained an
unsupported conditional return premise, showing why host-side seed suitability
matters for a small model. The revised run is recorded separately in
`viewpoint-report.json` using these same synthetic fixtures.

The revised run completed all three writes with no generation requests, after a
47.405-second load. The model, runtime, fixtures, and selected seeds were retained;
the shared-road prompt became shorter and used only the seed's concrete image.

| Synthetic case | Write time | Revised qualitative result |
| --- | --- | --- |
| Rested Mara, sealed arch | 59.625 s | Same prompt and identical raw/cleaned output as the initial control. The named, unresolved character moment remains readable. |
| Newly sworn Rowan | 55.199 s | Improved to prose about Rowan walking and scanning for danger, but omits Mara and her feelings about the new companionship. It does not satisfy the requested hero viewpoint. |
| Injured active Rowan | 55.872 s | Names Mara and Rowan, retains Rowan's present injury, and expresses Mara's worry. However, it invents an enduring relationship history and claims she knows he will recover soon. |

The revised shared-road samples are readable prose, not the initial repetitive
source text or writing advice. That is a functional improvement, but not a full
fidelity pass. In the injury sample, the accepted second sentence still contains
"she had always been loyal to Rowan" and "she knew he would recover soon enough".
Those claims are not established by the synthetic public facts. The raw text
also continued into invented memories, which the two-sentence cleaner omitted.
Names, emotions, and injury can reach the model, but it does not yet preserve the
requested viewpoint and uncertainty reliably. These spot checks do not justify
a broad claim of reliable relationship storytelling.

## Context-fit emotional seed probe

After the production context-aware selector is ready, explicitly run:
`node tools/creative-story-probe/run-context-fit.mjs --run`.
Portable unit checks, which do not require model files or start a browser, are:
`node --test tools/creative-story-probe/run-context-fit.test.mjs`.
Their artifact-verification cases generate tiny temporary fixtures and clean
them up after each test. The explicit `--run` still requires and verifies every
real staged model artifact before building or loading anything.

This isolated runner verifies all five already-staged 135M artifact byte counts
and SHA-256 hashes. A missing or mismatched artifact aborts; there is no download
fallback. It uses the unchanged production client and worker: one WASM thread,
q8, 64 greedy new tokens, and the existing 90-second write deadline. One browser
loads once, switches offline, and attempts the same three historical synthetic
public cases in order. The first write failure stops the run. A five-minute
overall watchdog includes verification, build, loading, and generation, followed
by bounded browser cleanup. A second cache restore is intentionally omitted.

Each case retains the historical facts, named viewpoint, and focus, but selects
its seed with the real controller identity
`JSON.stringify([job.campaignId, job.eventId, job.tick, job.sourceFingerprint])`,
attempt zero, and the current `{ viewpoint, focus }` selection context. There is
no forced seed override. The report records selected seed ID, theme and
relationship fit, exact prompts, raw/cleaned output, latency, and attempted
generation requests. Historical probe-specific seed choices are included as
context, not represented as a controlled paired A/B quality comparison.

Every invocation creates a new timestamp-and-UUID `context-fit-report-*.json`
with exclusive creation, then checkpoints only that new file. Existing viewpoint,
cache, generation, and candidate reports are never rewritten. Readable emotional
content and faithful outcomes still require inspection; successful generation or
a nonempty cleaned string is not automatically a quality pass.

For a separately authorized follow-up, append `--prior-report PATH` pointing to
an existing `context-fit-report-*.json` in this directory. The runner records
that immutable report's SHA-256 and source hashes. Before loading the model it
requires identical worker/client/seed-library sources and generation settings,
then compares every prepared case's facts, viewpoint, focus, controller identity,
attempt, and selected seed. Prompt hashes may differ and are recorded explicitly.
Both raw and cleaned results remain available, so a text-hygiene change cannot
be mistaken for improved raw writing. The prior report is read, never rewritten.

### Initial context-fit observations

The initial run is preserved in
[`context-fit-report-2026-09-07T00-28-13-515Z-23562d9b-734c-40e6-a28b-0b001386c2b1.json`](./context-fit-report-2026-09-07T00-28-13-515Z-23562d9b-734c-40e6-a28b-0b001386c2b1.json).
It verified all 139,538,098 staged bytes, loaded in 51.425 seconds, and finished
in 269.754 seconds overall. Cache completion was true, generation attempted zero
requests, and protected production sources/historical inputs remained unchanged.

| Synthetic case | Actual selected seed / fit | Write time | Initial qualitative result |
| --- | --- | --- | --- |
| Rested Mara, sealed arch | `question-behind-the-answer` / neutral | 74.091 s | Failed: literal wooden boxes displaced Mara, the arch, and her feelings. |
| Newly sworn Rowan | `horizon-bargain` / trust | 67.291 s | Failed: atmospheric description omitted both characters and invented Willowdale. |
| Injured active Rowan | `silence-in-the-pack` / care | 66.101 s | Failed: named care appeared only in explanatory metacommentary, which the then-current cleaner accepted. |

The selection mechanism chose the intended relationship categories, but none of
these three outputs satisfied the requested named emotional scene. Matching a
seed's emotional category is not equivalent to improved model prose.

### Single named-instruction follow-up

The separately authorized follow-up is preserved in
[`context-fit-report-2026-09-07T00-37-03-923Z-d0521c53-3063-4750-b32c-e523137be3cf.json`](./context-fit-report-2026-09-07T00-37-03-923Z-d0521c53-3063-4750-b32c-e523137be3cf.json).
Its prior-report SHA and comparison checks confirm the same facts, viewpoints,
foci, controller identities, selected seeds, model, and runtime. The writing
idea moved before the emotional focus, and the final instruction explicitly
requested short story sentences about the named subject(s). Text hygiene also
rejected the specific previously observed 30-word explanatory pattern; raw
outputs are retained separately from cleaned text.

The model loaded in 46.142 seconds and the run finished in 234.012 seconds.
All real artifacts again passed size/SHA checks, cache completion was true,
generation made zero requests, and protected inputs remained unchanged.

| Synthetic case | Follow-up write time | Follow-up qualitative result |
| --- | --- | --- |
| Rested Mara, sealed arch | 70.484 s | Recovered Mara, a still-closed arch, and readable doubt/steadiness. The invented, awkward waiting-for-a-new-arch premise remains a caveat. |
| Newly sworn Rowan | 77.127 s | Still failed: generic sky, wind, and damp-earth description omitted both names and their relationship. |
| Injured active Rowan | 30.879 s | Still failed: a statement about the story continuing at camp, not a character scene. The cleaner at measurement time accepted it. |

The first output now begins, "The arch was closed, but Mara's heart remained
steady." That is a recovered emotional character moment compared with the
initial boxes, not proof of reliable fidelity. The two shared-road cases still
did not work. These six measured outputs support further narrow evaluation,
not a general quality claim, a dependable companion storyteller, or a third
unreported retry. Both browser sessions closed; neither needed new downloads.

After the second report was finalized, production text hygiene additionally
rejected its observed "continuation of the story" / "story continues with a
description" metacommentary. The report's original cleaned fields remain
unchanged. That later filtering is covered by unit tests, not represented as
another generation measurement or an improvement to the raw prose.

## Two short authored demonstrations: historical screening only

The separately authorized command is:
`node tools/creative-story-probe/run-context-fit.mjs --run --exemplars`.
This probe-only variant appends two original `Example facts` / `Example story`
pairs to the existing system instruction. The ordinary production prompt builder,
user message, seed selection, cleaner, client, and worker are unchanged. The
examples demonstrate Ada's curiosity/caution and Neri's concern for injured Pell;
none of those names appears in the three measured scenes. They are writing
demonstrations, not candidate responses or fallback content. The exact text is
in `exemplar-messages.mjs` and every prepared prompt is retained in the report.

The variant reuses the exact three context-fit facts, viewpoints, foci,
controller identities, attempts, and selected seeds. Its comparison with the
earlier named-instruction report is explicitly **historical, not a fresh paired
A/B**: production client/worker cache-only branches and output hygiene changed
since that report, while pinned model identity and generation settings did not.
The existing strict `--prior-report` source-hash checks were not relaxed.

Each invocation requires `--run`, verifies the five already-staged artifacts by
byte length and SHA-256 without downloading, and creates a unique, exclusively
created `exemplar-report-*.json` with checkpoints. It retains one ordinary
single-thread WASM browser, 64 greedy output tokens, repetition penalty 1.08,
90 seconds per write, and 300 seconds overall. Generation is offline. The run
stops on the first runtime failure, not merely a disappointing literary result.

### Measured result: do not promote the prefix

The single run is preserved in
[`exemplar-report-2026-09-07T04-23-44-239Z-d66b4275-03db-4bfc-9e18-aec60163e39d.json`](./exemplar-report-2026-09-07T04-23-44-239Z-d66b4275-03db-4bfc-9e18-aec60163e39d.json).
All 139,538,098 staged model bytes verified. Cold loading took 53.568 seconds,
cache completion was true, and the run stopped after 234.146 seconds overall.
Chromium closed, protected sources and historical reports stayed unchanged,
and generation attempted zero network requests.

| Synthetic case | Observed result |
| --- | --- |
| Rested Mara, sealed arch | Completed in 78.662 s, but described a dark room and stone walls instead of Mara, the sealed arch, or conflicting feelings. The later raw tail invented a young couple. The cleaner retained two sentences; that is not a quality pass. |
| Newly sworn Rowan | Hit the unchanged 90-second write deadline. No completed output or prose-quality judgment is available. |
| Injured active Rowan | Not attempted because the runner stopped on the preceding timeout. |

The completed output begins, "The room was dark, and the air was thick with the
scent of damp earth and ozone." This variant supplies no evidence for promotion
or a general claim that few-shot examples cannot work. Ten portable helper tests
and both syntax checks passed before the run; those establish prompt isolation,
fixture/report handling, and artifact verification, not creative quality. No
production prompt changed, no model weights were downloaded, and no retry ran.

## Real one-token stage direction on the existing writer

The separately authorized command is:
`node tools/creative-story-probe/run-context-fit.mjs --run --direction`.
It imports the production direction prompt and calls `client.direct(messages)`
for the exact three synthetic public scenes above, with the same fixed option
ordering: 1 Crimson Chronicle, 2 Impossible Orrery, 3 Moth Court. These are
host-authored imagined visual treatments, not game events or unconstrained
model-written stage descriptions.

The current loaded 135M model selects one token through a small logits processor.
The tokenizer dynamically verifies that each label encodes to one token and
decodes back exactly; the staged tokenizer uses IDs 33/34/35. Only non-candidate
scores are masked. Candidate model scores are preserved, with greedy generation,
one output token, repetition penalty 1, a 512-token input cap, and a 30-second
client deadline. The ordinary prose request remains 64 tokens, repetition penalty
1.08, and 90 seconds. Both use the same worker, model, and cache. An invalid
completed direction can return `null` for honest default staging; a real timeout
still terminates the worker and cannot pretend that prose may safely continue.

The isolated runner verifies the existing five staged artifacts, loads once,
switches the browser offline, and checkpoints each actual returned label and
latency in a unique `direction-report-*.json`. It does not alter labels or retry
to obtain variety. After three decisions, one ordinary prose request runs on
that same worker only when at least 95 seconds remain in the 300-second budget.
The report retains exact direction/prose prompts and protected input hashes.

### Measured result: decision path works; variation was not observed

The single run is preserved in
[`direction-report-2026-09-07T05-55-47-024Z-bb86104d-bd07-4bee-9102-3d18264f850c.json`](./direction-report-2026-09-07T05-55-47-024Z-bb86104d-bd07-4bee-9102-3d18264f850c.json).
All 139,538,098 model-artifact bytes verified. Cold loading took 52.620 seconds,
cache completion was true, and the whole run finished in 162.696 seconds with
Chromium closed. Protected production/probe inputs were unchanged. Generation
attempted zero network requests and reported zero errors.

| Fixed synthetic scene | Actual returned label | Decision time |
| --- | --- | --- |
| Rested Mara, sealed arch | `1` — Crimson Chronicle | 12.609 s |
| Newly sworn Rowan | `1` — Crimson Chronicle | 10.111 s |
| Injured active Rowan | `1` — Crimson Chronicle | 10.013 s |

All three decisions completed within the 30-second limit, but they all chose
the first option. **This run does not demonstrate varied or superior staging.**
It is evidence of actual model-scored bounded selection, not evidence that
Impossible Orrery or Moth Court will appear for these scenes, and no retries
were used to manufacture different choices.

The same worker subsequently completed the unchanged Mara prose prompt in
70.330 seconds. Its raw output matches the earlier named-instruction sample,
beginning "The arch was closed, but Mara's heart remained steady." The invented
waiting-for-a-new-arch premise remains; neither direction selection nor this
successful subsequent write is a prose-quality improvement. Forty-two focused
runtime/client/mask tests, twelve portable runner tests, syntax checks, and the
integrated application type check passed before the actual run. The mask tests
use synthetic scores to check preservation; only the separately recorded browser
run supplies real model choices. No new model weights were downloaded.

## Host stage cooldown with real choice among two eligible treatments

The separately authorized command is:
`node tools/creative-story-probe/run-context-fit.mjs --run --direction-cooldown`.
This is a distinct eligibility experiment, not a retry of the all-labels prompt.
The preserved all-1 report above remains immutable and is referenced by SHA-256.

The production API now accepts `direct(messages, { exclude: "1" | "2" | "3" })`.
The host passes the last actually displayed treatment; the production prompt
removes that option and the worker masks its token along with other ineligible
tokens. Exactly two model-scored labels remain, never one. With no exclusion,
the original three-label prompt and selection are unchanged. Eligible scores
remain unmodified. The client captures the exclusion before awaiting and rejects
an excluded completed response as `null`, without claiming model-directed
staging. The 512-token input cap, one output token, 30-second deadline, cache,
and ordinary prose settings are unchanged.

This probe supplies explicit synthetic previous stages to the same three fixed
scene fixtures: parchment, orrery, and moth-court, producing exclusions 1, 2,
and 3 respectively. These inputs are not a recorded gameplay sequence. It loads
the verified existing artifacts once, generates offline, and permits no prose
write or retry. Its bound is 175 seconds of work plus five seconds for cleanup.

### Measured result: all choices eligible, host-assisted variety observed

The single run is preserved in
[`direction-cooldown-report-2026-09-07T06-10-21-531Z-2636b2e8-df79-42c3-96cc-47c9c0b5c4dc.json`](./direction-cooldown-report-2026-09-07T06-10-21-531Z-2636b2e8-df79-42c3-96cc-47c9c0b5c4dc.json).
Cold loading took 57.814 seconds, with a complete browser cache. The measured
run finished in 99.500 seconds and closed Chromium. All 139,538,098 staged bytes
verified; protected inputs and the all-1 baseline stayed unchanged. There were
zero attempted generation requests, blocked requests, or runtime errors.

| Fixed synthetic scene | Host excludes | Actual model choice | Decision time |
| --- | --- | --- | --- |
| Rested Mara, sealed arch | `1` — Crimson Chronicle | `3` — Moth Court | 13.376 s |
| Newly sworn Rowan | `2` — Impossible Orrery | `1` — Crimson Chronicle | 8.863 s |
| Injured active Rowan | `3` — Moth Court | `1` — Crimson Chronicle | 10.657 s |

Every returned choice was eligible. Two treatments appeared, but **the variety
comes from host eligibility plus actual model selection**, not demonstrated
improvement in model reasoning or spontaneous diversity. This run does not
establish that a particular treatment is artistically better for its scene,
and it did not select Impossible Orrery. The earlier same-worker prose proof
stands separately; no new prose-quality claim is made. Fifty-three focused
runtime/client/mask tests, thirteen portable runner tests, integrated TypeScript,
syntax, and whitespace checks passed before this run. No new model download or
unreported retry occurred.

## Choosing between a current public scene and a recorded farewell

The separately authorized command is:
`node tools/creative-story-probe/run-context-fit.mjs --run --moment-choice`.
It uses `client.chooseMoment(messages)`, a thin wrapper around the existing
`direct(messages, { exclude: "3" })` path. Labels 1 and 2 retain their actual
model scores; label 3 is ineligible. No new worker protocol, model, cache,
runtime, or generation setting was introduced. Each decision has a 512-token
input limit, one greedy output token, and the existing 30-second deadline.

Two explicit synthetic public pairs compare a current sealed-arch scene and
ordinary travel respectively with the same earlier alive-but-injured companion
farewell. Label 1 always names the current scene; label 2 always names the
farewell. These fixtures do not prove live queue eligibility, expiry, capture,
or presentation. Exact full fixtures and truncated production prompt snippets
are retained in the report. The probe permits no prose generation or retries,
and is bounded to 175 seconds of work plus five seconds for cleanup.

### Measured result: two valid choices, neither selected the farewell

The single run is preserved in
[`moment-choice-report-2026-09-07T07-27-48-716Z-03c8f499-c936-484a-9131-0787b21b4858.json`](./moment-choice-report-2026-09-07T07-27-48-716Z-03c8f499-c936-484a-9131-0787b21b4858.json).
All five existing artifacts verified, totaling 139,538,098 bytes. Cold loading
took 37.911 seconds and completed the browser cache. The measured run finished
in 69.132 seconds, with Chromium closed and all protected inputs unchanged.
No model artifacts were downloaded from an external service: pinned requests
were served from verified local staging, then the browser was taken offline.
Generation attempted zero requests; blocked requests and runtime errors were
also zero.

| Fixed synthetic pair | Actual model choice | Decision time |
| --- | --- | --- |
| Sealed arch versus recorded Rowan farewell | `1` — current scene | 12.537 s |
| Ordinary travel versus the same recorded farewell | `1` — current scene | 10.521 s |

Both choices were eligible and completed within the limit. **This is evidence
of a functioning model-scored selection path, not good milestone prioritization
or varied decisions.** The model did not prefer the farewell even over the
mundane travel fixture. No prose-quality claim follows, and no second run was
used to seek a preferred answer. Exact input token counts were not instrumented;
the production worker enforced its 512-token limit. Sixty-three focused
client/worker/mask tests, sixteen portable probe tests, syntax checks,
application TypeScript, and whitespace checks passed before the run.
