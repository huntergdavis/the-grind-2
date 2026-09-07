# Browser creative-story probe

## Bounded successive-story continuity proof

`node tools/creative-story-probe/run-successive-story.mjs --run` uses the existing
verified 135M artifacts without downloading. It primes a fresh isolated browser
cache from localhost, then restores one production worker cache-only and runs
two offline writes: Mara and injured Rowan on the road, then their arrival with Rowan
still injured. The first accepted model passage goes through the real journal,
continuity selector and prompt builder before the second write. Fixtures are
synthetic public scenes, not captured gameplay or authored narrative examples.
Reports keep raw/cleaned prose, selected excerpts, effective post-budget prompts,
actual token counts, exact-copy rejection, network attempts and cleanup. Each
write keeps the production 90-second limit; total work/cleanup is capped at four
minutes. It is a manual spot check, not another CI suite or a general quality gate.
Read the output to judge whether a concern develops; two completed calls alone
do not establish coherence. Every execution writes a uniquely named receipt.

The [first completed chain](successive-story-report-2026-09-07T16-44-22-792Z-7cb78e26-3054-4aad-ba4d-93b6bcf7afbb.json)
proved the exact generated-text feed but **failed narrative quality**. The first
passage invented England and years of shared history; the second ignored the
named pair's arrival, continuing injury and emotional concern. Actual input/
output tokens were 199/42 and 289/41, with 53.121s/57.682s writes. One runtime
worker completed the offline chain and closed with the browser/server in
138.832s, with zero offline requests or errors and unchanged protected inputs.
The [earlier preflight receipt](successive-story-report-2026-09-07T16-41-49-346Z-b4cee33d-b676-443f-9a8d-4107690a737c.json)
records a build-transform-count assertion failure before any model/browser load;
the correction distinguishes duplicate static build passes from runtime workers.
No additional model samples were generated after the quality failure.

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

## Current scene versus a recorded first shared victory

The separately authorized command is:
`node tools/creative-story-probe/run-context-fit.mjs --run --first-victory-choice`.
The production moment builder now accepts an optional closed milestone kind.
The default farewell prompt remains byte-identical; `first-shared-victory`
changes only the second candidate label to "Recorded first shared victory".
The same public snippet limits, system instruction, client `chooseMoment`,
worker, model, cache, greedy one-token generation, and 30-second decision limit
are unchanged. No new prose generation or model download is involved.

The two fixed synthetic pairs use the same current public scenes as the earlier
farewell probe, but explicitly supplied healthy and alive-but-injured Rowan
first-victory sources. This is a distinct source-contract check, not a paired
quality comparison or evidence of a live victory transition, queue expiry, or
presentation. The earlier farewell report remains immutable and is referenced
by SHA-256 in the new report.

### Measured result: valid decisions; first-victory prioritization not shown

The single run is preserved in
[`first-victory-choice-report-2026-09-07T08-21-59-952Z-a3595ba3-44be-4721-86c0-22f0e144a8c3.json`](./first-victory-choice-report-2026-09-07T08-21-59-952Z-a3595ba3-44be-4721-86c0-22f0e144a8c3.json).
All five existing staged artifacts verified, totaling 139,538,098 bytes. Cold
loading took 46.375 seconds and completed the browser cache. The measured run
finished in 75.614 seconds and closed Chromium. All protected inputs, including
the earlier farewell report, stayed unchanged. Generation was offline, with
zero attempted generation requests, blocked requests, or runtime errors.

| Fixed synthetic pair | Actual model choice | Decision time |
| --- | --- | --- |
| Sealed arch versus healthy companion's first shared victory | `1` — current scene | 13.013 s |
| Ordinary travel versus injured companion's first shared victory | `1` — current scene | 8.500 s |

Neither choice selected the milestone. **This proves the extended source label
works through the real model path; it does not demonstrate good emotional
prioritization, varied decisions, or improved prose.** No retry sought a desired
answer. Exact public inputs and production prompts are retained; exact input
token counts were not instrumented, while the worker enforced its 512-token
limit. Fifty-six moment-contract tests and nineteen portable probe tests passed
before the run, alongside syntax and staged-artifact checks. The probe used
175 seconds of maximum work plus five seconds of cleanup, with no prose request.

## Candidate first-victory inner-voice duet

The separately authorized command is:
`node tools/creative-story-probe/run-context-fit.mjs --run --story-duet`.
This experiment invokes the candidate `buildStoryDuetMessages` directly through
the existing production `client.write` and worker. It does not imply the
application has enabled model duets. The model, revision, q8 WASM single-thread
runtime, cache, 64-token greedy output, repetition penalty 1.08, 1,024-token
input limit, and 90-second write deadline remain unchanged. No source-choice or
stage-choice calls are added to this isolated two-write experiment.

The two synthetic public first-victory sources are the same healthy/injured
fixtures used above. Names come from their bound host packets; only bounded
public fact snippets, role names, and the companion condition enter the prompt.
The requested output is exactly `HERO: thought` followed by `COMPANION: thought`.
The strict parser requires two distinct, complete first-person sentences in
that role order. It rejects untagged ordinary prose, swapped/missing/extra roles,
markup, prompt echo, and truncated sentence prefixes. It never splits an
ordinary paragraph into two people. Structural acceptance is not itself a
literary or factual quality verdict.

### Measured result: 0/2 valid duets; do not enable model-duet generation

The single run is preserved in
[`story-duet-report-2026-09-07T09-26-19-890Z-78f89876-0053-4b96-a2f4-de86fc37f50d.json`](./story-duet-report-2026-09-07T09-26-19-890Z-78f89876-0053-4b96-a2f4-de86fc37f50d.json).
All 139,538,098 staged artifact bytes verified. Cold loading took 55.729 seconds
and completed the browser cache. The measured run finished in 175.145 seconds,
within its 235-second work plus five-second cleanup limit, and closed Chromium.
Generation was offline with zero attempted generation requests, blocked
requests, or runtime errors. Protected inputs stayed unchanged. No external
artifact download, retry, extra pair, or source/stage selection was performed.

Healthy source, 34.898 seconds, exact raw output:

> The two fighters, Mara and Rowan, have been victorious in their first fight. They will continue to be so for many years to come.

Injured source, 63.746 seconds, exact raw output:

> The pair defeated the roadside bandit in a close second to a fierce battle between Rowan and Mara.
>
> What do you think of the story? Do you like it? What would you change?

Both outputs lack the required roles and first-person thoughts, and both parsed
as `null`. The healthy result promises unsupported future victories. The
injured result invents a fight between the companions, ignores the requested
injury-grounded perspectives, and asks the reader questions. **These are failed
model duets, not material to relabel or split into voices.** The production
ordinary-model prompt should remain unchanged; role-bound presentation can use
the separately authored, clearly attributed recovery pairs. No parser gate was
weakened after observing the failures.

Before the run, 42 contract/parser tests, 22 portable probe tests, application
TypeScript, syntax/whitespace checks, and all staged-artifact hashes passed.
Those checks establish plumbing and boundary behavior, not successful model
storytelling. Exact prompts and raw failed text remain in the immutable report.

## Four counterbalanced public-moment choices

The separately authorized command is:
`node tools/creative-story-probe/run-context-fit.mjs --run --counterbalanced-choice`.
It reuses the existing sealed-arch/current versus farewell pair and the healthy
first-victory/current pair. Each pair is tested once in its original current-first
ordering and once with the milestone first, in that fixed four-case sequence.
The tools-only helper validates the bounded production prompt layout, then swaps
the two complete candidate sections and their numeric labels. Every public
snippet, the system message, and the final instruction remain byte-identical.
The production prompt builder is unchanged. Original and transformed messages
and numeric-to-semantic mappings are retained per case.

All four calls use the existing `client.chooseMoment`, which preserves the two
eligible model scores and excludes label 3. The model, pin, q8 WASM single-thread
runtime, browser cache, 512-token decision input bound, one-token greedy output,
and 30-second deadline are unchanged. The experiment allows no prose, retry,
new artifact download, or adaptive choice of pairs. It is independent of the
application's explicit Shared road companion-priority policy.

### Measured result: every choice was label 1; selected subjects changed after reversal

The single run is preserved in
[`counterbalanced-choice-report-2026-09-07T10-23-19-355Z-dfa0df0c-d93d-4146-a371-d7821ea06c30.json`](./counterbalanced-choice-report-2026-09-07T10-23-19-355Z-dfa0df0c-d93d-4146-a371-d7821ea06c30.json).

| Fixed public pair | First-listed subject | Raw label | Selected subject | Decision time |
| --- | --- | --- | --- | --- |
| Sealed arch / farewell | Current scene | `1` | Current scene | 12.355 s |
| Same sealed arch / farewell | Farewell | `1` | Farewell | 11.671 s |
| Sealed arch / healthy first victory | Current scene | `1` | Current scene | 8.290 s |
| Same sealed arch / healthy first victory | First victory | `1` | First victory | 7.348 s |

The selected subject changed when presentation order and labels changed for
both tested pairs. **These four observations do not establish a universal bias
or good narrative prioritization.** First position and numeric label 1 remain
confounded in this design; it cannot distinguish a position preference from a
label/token preference. No model-quality improvement or prose claim follows.
The visible Shared road priority is a separate user-focus policy, not a model
judgment attributed to this experiment.

All 139,538,098 existing artifact bytes verified. Cold loading took 43.821
seconds and completed the browser cache. The measured run finished in 90.988
seconds, within its 235-second work plus five-second cleanup bound, and closed
Chromium. Generation was offline with zero attempted generation requests,
blocked requests, or runtime errors. Protected inputs and both earlier
moment-choice reports stayed unchanged. Twenty-seven portable probe tests,
syntax/whitespace checks, and staged-artifact verification passed before the run.
This feature's probe changes are confined to tooling; no production prompt,
client, worker, or model setting was edited for the experiment.

## Ordinary hero prose with a recorded value plus one focus hint

The separately authorized command is:
`node tools/creative-story-probe/run-context-fit.mjs --run --value-voice`.
The same healthy first-victory public source is supplied twice, with Mara and
travelling Rowan, one shared victory, inner-life focus, attempt zero, and the
same production-selected `fear-with-a-fine-point` seed. The only changed source
field is Mara's recorded value: curiosity versus mercy. A tools-only candidate
replaces exactly one generic production focus instruction with its mapped hint.
The system message, facts, seed material, and final ordinary two-sentence
instruction are unchanged. This is **value plus hint together**, not a pure
value-only comparison or an untreated baseline.

The exact candidate focus instructions are:

> Imagine Mara's wonder about sharing this success with Rowan, and a worry about misunderstanding Rowan.

> Imagine Mara's wish to offer Rowan kindness, and a worry that kindness could feel like pity.

There is no HERO/COMPANION format and no change to the application prompt,
client, worker, model, q8 WASM single-thread runtime, 64-token greedy output,
repetition penalty 1.08, or 90-second write deadline. This experiment is
independent of the visible authored value-shaped duet feature; neither distinct
strings nor ordinary cleaner acceptance automatically promotes the candidate.

### Measured result: 0/2 grounded value-shaped passages, despite 2/2 cleaner acceptance

The single run is preserved in
[`value-voice-report-2026-09-07T11-26-05-105Z-64009828-3965-419d-836b-191f1d8ac691.json`](./value-voice-report-2026-09-07T11-26-05-105Z-64009828-3965-419d-836b-191f1d8ac691.json).

Curiosity, 60.955 seconds, exact raw output:

> Mara is a young woman who has just finished her first battle against the roadside bandit. She looks forward to the next round of battles, but she knows that the road ahead will be fraught with danger. Her mind wanders to the fact that she had been warned not to share her victory with Rowan, and

Mercy, 56.732 seconds, exact raw output:

> In the heart of the desert, where the sun beats down relentlessly, lies a place of great beauty and power. The desert is home to many wonders, but one thing stands out above all others: the majestic Mara. A place of ancient magic, where the sands whisper secrets in the wind. It is here

The ordinary cleaner retained the first two complete sentences of each; those
prefixes are also saved in the report. The curiosity sample invents Mara's age,
turns a first *shared* victory into a personal first battle, and its raw tail
invents a prior warning. It does not express the requested wonder about Rowan.
The mercy sample abandons the recorded road for a desert, treats Mara like a
place, and loses Rowan and the kindness/pity tension. **Different outputs are not
distinct, grounded character values. This candidate is not recommended for
promotion.** No cleaner or prompt was changed after observing these failures.

All 139,538,098 existing artifact bytes verified. Cold loading took 45.796
seconds and completed the browser cache. The measured run finished in 169.824
seconds within its 235-second work plus five-second cleanup bound, and closed
Chromium. Prompt content totaled 887 and 873 UTF-8 bytes respectively; exact
token counts were not instrumented, and the production worker enforced its
1,024-token input limit. Generation was offline with zero attempted generation
requests, blocked requests, or runtime errors. Protected inputs stayed unchanged;
no extra writes, retry, artifact download, or automatic rollout occurred.

Before the run, six tests using the actual production builder verified source,
seed, line-replacement, output-format, and prompt-size isolation. Twenty-seven
portable probe tests, syntax/whitespace checks, and all staged hashes also passed.
The focused producer tests are reproducible with
`npx vitest run tools/creative-story-probe/value-voice-cases.test.ts --maxWorkers=1 --no-file-parallelism`.
As throughout these receipts, plumbing checks do not establish narrative quality.

## Stronger writer, attempt 1: Cache API failure before model initialization

The [first immutable Qwen/wllama receipt](./stronger-writer-report-2026-09-07T12-31-25-812Z-d8ca956d-cb94-4d1d-a50a-bd4c1870d06b.json)
records a **storage-harness failure, not a model-quality result**. The new,
tools-only runner retains the exact archived system/user messages for rested
Mara at the sealed arch and Mara beside injured Rowan. Changing model, runtime,
quantization and chat-template implementation makes this a historical comparison,
not a fresh paired A/B. These are synthetic public fixtures, not gameplay records.

Authorized staging downloaded and verified the official
[Qwen2.5-0.5B-Instruct Q4_K_M GGUF](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/tree/9217f5db79a29953eb74d5343926648285ec7e67),
revision `9217f5db79a29953eb74d5343926648285ec7e67`, 491,400,032 bytes,
SHA-256 `74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db`,
Apache-2.0. The pinned [wllama 3.6.1 runtime](https://github.com/ngxson/wllama/releases/tag/3.6.1)
archive is 5,626,116 bytes, verified against its npm SHA-512 integrity; its
8,457,512-byte WASM also passed SHA-256 verification. Artifacts were staged only
in a task-specific temporary directory. Existing 135M and 360M artifacts were
separately hash-checked and preserved; production dependencies were unchanged.

The ordinary Chromium 151 browser was secure, non-cross-origin-isolated, and
passed the JSPI feature check. The first `Cache.put` of the locally served GGUF
then raised `UnknownError: Unexpected internal error`, before WASM fetching or
`Wllama.loadModel`. The run stopped in **12.271 seconds**, with **zero model
initializations and zero prose outputs**. Three portable fixture/budget checks
had passed before the run. The request counter records 491,797,930 streamed
HTTP response-body bytes from localhost; it is not a wire-byte or memory-use
measurement. There were no external browser requests, generation attempts,
page errors or automatic retries. Browser and server closed, and all protected
source/prompt hashes remained unchanged.

Read-only follow-up found about 9 GB free in `/tmp` and 656 GB free on the
repository filesystem. Simple disk exhaustion is therefore unsupported, but
origin quota and the precise Chromium Cache API cause were not measured. The
added whole-file Cache API write belongs to this harness, not to wllama. Pinned
wllama source supports `loadModel(Blob[], options)` directly; its model manager
uses an OPFS-backed storage path (with an optional cross-origin storage backend),
not this harness's whole-file Cache API operation.

A separately authorized direct-Blob feasibility mode could bypass that storage
gate and answer the two prose questions using the already verified artifacts.
Retained in-memory Blobs and an offline worker restart would **not** prove
persistent cache restoration. This first receipt and its original source remain
unchanged; no corrected-mode run or prose-quality verdict is claimed here.

Portable preflight: `node --test tools/creative-story-probe/run-stronger-writer.test.mjs`.
The first attempt's explicit entry is
`node tools/creative-story-probe/run-stronger-writer.mjs --run EXISTING_TASK_TEMP_DIR`;
it requires verified staged artifacts and never downloads during a run.

### Stronger writer, attempt 2: direct-Blob load works; first write times out

The first harness and its failed receipt were checkpointed in commit `ebe023b`
before this separately authorized mode was added. The original Cache API mode
remains available. The explicit runtime-only command is:

`node tools/creative-story-probe/run-stronger-writer.mjs --run --direct-blob EXISTING_TASK_TEMP_DIR`

The [separate immutable direct-Blob receipt](./stronger-writer-blob-report-2026-09-07T12-38-45-589Z-58002ade-8cbd-4cfa-96d8-3c80df55b545.json)
uses the same verified Qwen and wllama artifacts, exact two archived prompts,
64-token cap, temperature zero and a requested 1.08 repetition penalty. The latter
used wllama's typed `penalty_repeat` field; the later native-key audit below
found that this spelling does not set the native penalty. No artifact was
downloaded again. The local GGUF and WASM
were read into retained Blobs and passed through the documented
`loadModel(Blob[], options)` API, without the extra whole-file Cache API write.
The embedded GGUF chat template and model metadata are retained in the receipt.

Actual CPU-only initialization **succeeded in 30.855 seconds** with one thread,
zero GPU layers, one sequence and a 1,024-token context. Generation then ran with
the browser offline. The **first Mara/arch write exceeded the unchanged
90-second deadline**. The run stopped immediately: zero completed outputs, no
second scene, and no disposed-worker reload. This is evidence of model/runtime
load compatibility but failure to complete within this write budget; it does
not establish prose quality or a general device-speed estimate. The
non-streaming completion API returned no finished text; partial token progress
was not instrumented, so no unseen draft or literary judgment is claimed.

The run finished in 122.991 seconds and closed Chromium and the temporary HTTP
server. It recorded zero generation-network attempts, blocked requests, page
errors or runtime-console errors. Its 500,256,274-byte counter measures streamed
localhost response bodies, not memory or wire overhead. The fresh browser's
storage estimate was 6,442,450,944 bytes quota and zero usage; this is a different
context and cannot retrospectively diagnose attempt 1's Cache API error.
Protected source, archived prompts and the first receipt remained unchanged.

This mode intentionally does not prove persistence: even a successful offline
reload from retained in-page Blobs would not survive page closure. Its metadata
therefore keeps `persistentCacheProven: false`. Neither that reload nor a
persistent OPFS cache was tested after the first write timed out. Five portable
fixture/mode/budget checks passed, and the run also had an outer process timeout.
No retry, extra sample, production dependency change or model promotion followed.

### Stronger writer, streamed diagnostic: no observable native progress

The [separately authorized streamed diagnostic](./stronger-writer-stream-report-2026-09-07T13-24-13-256Z-bdbe8dc1-5c1f-4301-ae0e-5899e30c0277.json)
preserved both earlier receipts and the exact archived request. It added only
stream/progress observation: `stream: true`, an `onData` callback,
`return_progress: true`, and `timings_per_token: true`. Host-side serialized
checkpoints retain every received chunk and partial text independently of a
completed response. Content chunks are not assumed to equal tokenizer tokens.
Nine portable fixture/mode/collector/budget checks passed before the run.

Explicit command:
`node tools/creative-story-probe/run-stronger-writer.mjs --run --stream-diagnostic EXISTING_TASK_TEMP_DIR`.
This diagnostic allowed the first scene 180 seconds, with a saved 90-second
snapshot, inside a 295-second total bound. A second archived scene was allowed
only after completion with at least 95 seconds remaining. The extended deadline
is not the production 90-second acceptance criterion or an automatic retry.

Qwen loaded in **27.793 seconds** using the same verified local artifacts and
one-thread/GPU-zero configuration. The first Mara request then reached its
**180-second diagnostic deadline with zero observable chunks**. Both its
90-second snapshot and final trace retain empty partial text; exact prompt-token
count, prompt-processing time and first-visible-text latency remain `null`
because no native progress or text event supplied them. No completed prose,
second scene, or retained-Blob reload was produced. There is no literary sample
to score, and these observations do not establish model token-generation speed.

The run finished in 209.723 seconds, closed browser/server, and recorded zero
generation-network attempts, blocked requests, page errors or runtime-console
errors. There were 33 bounded native initialization log entries, not an exhausted
log buffer. The localhost response-body counter was 500,256,850 bytes. No model
download, additional sample or persistence claim followed.

The pinned [native schema](https://github.com/ggml-org/llama.cpp/blob/83d855c5a6d70487121edbf4020b25c96b7a04e7/tools/server/server-schema.cpp)
recognizes `max_tokens` as an alias for `n_predict` (lines 44–48) and
`temperature: 0` as greedy decoding (116–118). The 64-token cap therefore is not
an unsupported field in that source. However, the schema expects `repeat_penalty`
and `repeat_last_n`, while wllama's TypeScript interface exposes `penalty_repeat`
and `penalty_last_n` and forwards them verbatim. The pinned
[native defaults](https://github.com/ggml-org/llama.cpp/blob/83d855c5a6d70487121edbf4020b25c96b7a04e7/common/common.h)
are 1.0 and 64 respectively. The diagnostic deliberately kept the previous
request object; its report distinguishes requested values from the effective
settings inferred from pinned source. Prior nominal 1.08 requests must not be
described as a measured effective native 1.08 setting.

Read-only tracing identifies a concrete next boundary, not a proven cause:
[`action_completion` queues the request](https://github.com/ngxson/wllama/blob/c35450cf9597eaf901293b12458cae204aea0b65/cpp/wllama-context.h#L644),
then `action_get_result` calls `run_loop()` **before** retrieving and returning
the next result (773–807). The overridden queue loop calls
`callback_update_slots()` synchronously (1015–1036). Consequently, JavaScript
cannot receive queued progress until that inference-loop iteration returns.
The diagnostic did not instrument completion/get-result RPC entry and return,
so it cannot distinguish request dispatch, synchronous prompt processing, or
result delivery as the stalled stage. Investigate that version-pinned boundary
before interpreting the silence as slow hardware or changing model budgets.

Source-overlap caveat: the cleaner's sentence-extraction refactor was bundled at
startup, and its new transitive helper changed after the build. That helper was
not in the original protected-source list. Listed protected hashes remained
unchanged, but this is not a claim that every transitive source file stayed
frozen. The actual evaluated bundle was `assets/stronger-writer-Cen3Wxm5.js`,
22,991 bytes, SHA-256
`35f921e6be1cb37b12e345d3821a9b384abf1230689833cf134e7734e7b3b890`.
Archived model messages and requested sampling were unchanged; with no returned
text, no cleaner-derived success is claimed.

## Matched two-sentence stopping check

The [immutable matched receipt](./sentence-stopping-report-2026-09-07T13-36-43-073Z-0dbd6217-8312-4b4e-9599-b40eea37213a.json)
uses the exact first Mara/arch prompt from `viewpoint-report.json`. Both serial
workers use the production client and the same 135M/q8, one-thread, greedy,
1.08 repetition-penalty, 64-token-cap, 90-second settings. Isolated build
transforms add identical token/boot observations to both workers; only the
baseline omits the request-local `stopping_criteria` property. Ten portable
isolation/fixture/budget checks passed before the single authorized run.

| Observed measure | Baseline first | Stopping candidate second |
| --- | ---: | ---: |
| Actual prompt tokens | 194 | 194 |
| Actual generated suffix tokens | 64 | 38 |
| Write duration | 62.042 s | 47.285 s |
| Load / cache-only restore | 32.661 s | 14.639 s |

The accepted two-sentence text was **byte-identical**. Candidate raw text was
an exact prefix of baseline raw, ending with the small ` She` lookahead the
cleaner discards. It avoided 26 generated tokens, including an unnecessary
third sentence asserting invented past interests. This demonstrates preserved
accepted prose and less discarded generation for this one prompt—not improved
literary quality. Baseline-first order, cache restoration and warm hardware
confound timing; these durations are not a general speed A/B result.

The run finished in 166.880 seconds within its 295-second work/cleanup cap.
Both writes and the cache-only restore recorded zero network attempts; the
candidate's single local JavaScript bootstrap request is disclosed separately.
Both workers were terminated, Chromium and the server closed, and protected
sources stayed unchanged. Verified local artifacts were reused with no download
or retry. The receipt pins the evaluated helper/worker hashes; later conservative
sentence-guard fixes require their own unit/replay evidence and are not silently
included in this runtime measurement.

Portable checks: `node --test tools/creative-story-probe/sentence-stopping.test.mjs`.
Explicit authorized-run command:
`node tools/creative-story-probe/run-sentence-stopping.mjs --run`.

## Assistant-prefill continuation: factual retention, no emotional improvement

The [immutable prefill receipt](./assistant-prefill-report-2026-09-07T17-28-56-320Z-f821d1ee-d6da-4c3a-92fd-2edf8a600e86.json)
tests the same synthetic Mara/Rowan road-to-arrival chain as the
[earlier successive-story receipt](./successive-story-report-2026-09-07T16-44-22-792Z-7cb78e26-3054-4aad-ba4d-93b6bcf7afbb.json).
This is a historical comparison, not a fresh paired A/B. No production writer,
prompt, cache, consent flow, or model identity was changed.

Following the [official chat-prefill explanation](https://huggingface.co/docs/transformers/chat_templating#continue_final_message),
the isolated worker appended a declared factual fragment after its assistant
generation header, then tokenized the whole rendered chat without duplicate
special tokens. Installed Transformers.js 4.2 does not implement the Python
`continue_final_message` flag itself. Both exact `hostPrefix` and actual
`generatedSuffix` are recorded separately: supplied names/facts are not evidence
of the model retaining them. Prefixes are trial fixtures, not a general policy
ready for production scenes.

| Scene | Input / generated tokens | Write | Assessment of model-generated suffix |
| --- | ---: | ---: | --- |
| Travelling with injured Rowan | 211 / 18 | 29.201 s | Restates injury and survival; no care/fear, and “now she remains there” ambiguously implies premature arrival. |
| Arrived with injured Rowan | 288 / 23 | 35.712 s | Restates injury/presence and copies the no-recovery/no-departure facts; no relief, worry, or developing emotional concern. |

Both combined passages passed text hygiene and were not exact repeats. The
first genuine combined passage was archived by the production journal and
selected unchanged into the second prompt. This demonstrates transport, not
emotional continuity. **Do not promote this trial as better creative writing.**
Shorter generated outputs and these fixed-order timings do not establish a
general speed improvement, especially on a player's different device.

All five existing artifacts were SHA/size-verified: 139,538,098 bytes. One
runtime worker restored the locally primed cache in 13.508 seconds; the complete
trial took 92.277 seconds. Both writes and restore were offline, with zero
network attempts/errors. Worker, browser, and server closed; protected inputs
were unchanged. There was no new download, extra sample, or retry.

Five focused isolation/syntax checks passed:
`node --test tools/creative-story-probe/assistant-prefill.test.mjs`.
The separately authorized finite trial command is
`node tools/creative-story-probe/run-successive-story.mjs --run --assistant-prefill`.

### 360M generic emotional-focus trial: cache priming failed before inference

[Immutable September 7 receipt](./emotion-360m-report-2026-09-07T17-48-28-120Z-6bb4d279-2adb-40ac-b570-b3367481f754.json).
This separately authorized trial reused the five existing, fully SHA-256/size
verified `HuggingFaceTB/SmolLM2-360M-Instruct` artifacts at revision
`a10cc1512eabd3dde888204e902eca88bddb4951` (366,673,969 bytes). It did not download
weights or alter the deployed 135M model, cache, consent, or generation behavior.

The tools-only candidate reversibly substitutes model ID/revision in the real
production client/worker and changes the prose cap from 64 to 40 tokens. Greedy
sampling, repetition penalty 1.08, one-thread WASM, exact input trimming and the
existing two-sentence stopping remain intact. Its generic helper keeps the exact
public location/action/consequence and current names/status, with a short
instruction to imagine care/uncertainty before arrival and relief/ongoing care
after arrival. It supplies no narrative prefix. A completed first output would
pass through the actual production journal and continuity selector into the
second prompt. Comparison with earlier reports is historical, not fresh paired
A/B: model, prompt, cache state, token cap and stopping differ from the initial
360M experiment.

**No model-quality result was obtained.** The fresh isolated Chromium context
cached all four metadata/tokenizer files, then `Cache.put` rejected the verified
364,564,671-byte ONNX response with `UnknownError: Unexpected internal error`.
The run stopped after 18.094 seconds, before worker creation, model restoration,
tokenization or either requested scene. The receipt contains the last successful
cache entry and exact failing entry; disk staging is not browser-cache proof.
No inference speed, story quality or player-device capability can be inferred
from this storage failure. No retry or cache bypass was attempted.

The browser and local server closed; runtime-worker count was zero, protected
source hashes were unchanged, and no external/blocked/offline requests occurred.
The declared budget was 90 seconds for complete-cache restoration, 90 per write,
and 290 seconds work plus 5 seconds cleanup, but those inference phases were never
entered. This repeated large-entry storage symptom also occurred in the earlier
Qwen trial; its underlying browser-storage cause was not yet identified at this
checkpoint. The separately recorded persistent-profile follow-up below resolves
the storage condition without rewriting this failure as a model-quality result.

Eleven portable checks passed, including all six new generic-prompt/profile
checks and all five previous prefill checks:
`node --test tools/creative-story-probe/emotion-360m.test.mjs tools/creative-story-probe/assistant-prefill.test.mjs`.
The finite explicitly authorized command was
`node tools/creative-story-probe/run-successive-story.mjs --run --emotion-360m`.

### 360M temporary persistent profile: storage fixed, first draft still fails

[Separate immutable receipt](./emotion-360m-persistent-report-2026-09-07T17-54-55-497Z-8adb30bf-8a40-4d87-abc2-ce261fdf1811.json).
The follow-up changed only the browser-storage condition and its observations,
not the preceding trial's model, prompts, artifacts, sampling, stopping, token
budget or finite deadlines. A task-owned temporary profile was passed to
`launchPersistentContext`; no existing user profile was accessed. All inference
still used the actual production cache-only worker through the isolated profile
transform, with no artifact downloads or cache bypass.

The prior harness used `browser.newContext`, which Playwright documents as
[nonpersistent/incognito storage](https://playwright.dev/docs/api/class-browsercontext).
Chromium's [CacheStorage backend selection](https://chromium.googlesource.com/chromium/src/+/HEAD/content/browser/cache_storage/cache_storage_cache.cc)
uses an in-memory backend with `INT_MAX` capacity for memory-only caches. Its
[memory backend](https://chromium.googlesource.com/chromium/src/+/HEAD/net/disk_cache/memory/mem_backend_impl.cc)
limits an individual entry to one eighth of that capacity, or 268,435,455 bytes;
[writes above that limit fail](https://chromium.googlesource.com/chromium/src/+/HEAD/net/disk_cache/memory/mem_entry_impl.cc).
That strongly explains why the 139MB artifact fit while 364MB and 491MB artifacts
did not. The exact 151.0.7922.34 source tag was unavailable, so this is a
source-supported diagnosis, not an instrumented native error trace. Available
disk space was ample; the corrected context directly demonstrated successful
storage of the previously rejected artifact.

All seven model/runtime files cached successfully, with 390,294,784 bytes of
reported CacheStorage usage. The 360M model then restored completely offline in
15.998 seconds. The first 139-token prompt generated 21 tokens in 44.674 seconds:

```text
Mara beside Rowan (injured)

Mara beside Rowan (injured)
```

**Literary result: failed.** This repeats a supplied label rather than writing
two story sentences or developing care/uncertainty. The unchanged cleaner
returned null, nothing was archived, and the second scene was not attempted:
there was no accepted real first passage to recall. No authored substitute,
extra sample or retry was introduced. A working 360M cache/runtime does not make
this prompt/profile a storytelling improvement, and it is not promoted.

The full run took 79.722 seconds. One worker, browser and local server closed;
the run removed only its newly created temporary profile. Original staged
weights and prior receipts remain intact. Offline/blocked requests and browser
errors were zero; protected production/probe hashes were unchanged. This proves
cache priming and offline restoration within a disk-backed profile, not retained
cache across browser restarts (the temporary profile was intentionally deleted).

Seven focused portable tests passed:
`node --test tools/creative-story-probe/emotion-360m.test.mjs`.
The separately authorized finite command was
`node tools/creative-story-probe/run-successive-story.mjs --run --emotion-360m-persistent`.

### Sampled 135M prose: one bounded decoding-only follow-up

The opt-in command is
`node tools/creative-story-probe/run-successive-story.mjs --run --sampled-prose`.
It uses the existing verified 135M artifacts and the unchanged production prompt
builder, selected seed, real journal and continuity selector. Only prose decoding
changes: `do_sample: true`, `temperature: 0.7`, `top_k: 40`.
The 64-token output cap, 1.08 repetition penalty, sentence stopping, one-thread
WASM, 90-second per-write deadline and 240-second total budget remain unchanged.
The DM's one-token `direct()` path remains greedy and is not called. This does
not add a production option, change the deployed writer or enter feature CI.

The council reused `deja "persistent"` and `deja "the_grind_2 sampling"`
(Codex session `01a06835-15f`) and the immutable successive-story and persistent
360M receipts above. Those prose trials all used greedy decoding. Both staged
tokenizer configurations contain the expected assistant generation header, and
the installed tokenizer avoids adding duplicate special tokens when applying
the chat template. Label copying therefore does not by itself show incorrect
chat framing. The [official model example](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct)
uses the same `apply_chat_template` generation-header path.
[Hugging Face's decoding guide](https://huggingface.co/blog/how-to-generate)
documents greedy repetition and sampling alternatives. Sampling may escape a
repeated continuation; it does not establish emotional reasoning or fix factual
drift by itself.

Preflight inspection found that installed Transformers.js 4.2.0 does not apply
the initially proposed `top_p: 0.9`: `src/models/modeling_utils.js` comments out
`TopPLogitsWarper`. Its temperature processor is active, and
`src/generation/logits_sampler.js` applies top-k in `MultinomialSampler`.
The ignored option is therefore omitted entirely, rather than described as a
working control or replaced with a custom sampler. This trial uses supported
temperature-scaled top-k multinomial sampling, not nucleus sampling. The receipt
records the installed package version and hashes of those exact runtime sources.

This is one stochastic chain, with no fixed random seed, retries, replacement
samples or reproducibility claim. The first accepted actual model passage must
enter the real journal before the second scene recalls it. If the first output
is rejected, the chain stops without an authored substitute. Reports retain the
exact flag, requested decoding settings, instrumented-worker hash, raw and
cleaned text, requested/effective prompt hashes and messages, actual token counts,
cache-only restoration, network observations and cleanup/source-integrity checks.
The greedy comparison is historical, not a fresh paired A/B.

Acceptance requires actual named concern for injured Rowan on the unfinished
road, followed by relief at arrival mixed with the same ongoing concern. Both
people, Rowan's injury and the current location/outcome must remain consistent.
A completed call, different wording or journal admission alone does not pass.
The single actual inference run is recorded below.

[An earlier launcher receipt](./sampled-prose-report-2026-09-07T18-49-07-914Z-447f49c7-0076-47e3-95c3-e7edd297c708.json)
is preserved separately: `setsid node` detached immediately and the process
ended during build, before any browser, worker, cache request or model write.
That incomplete receipt has no cleanup result and is not literary evidence.
The main agent explicitly authorized an attached `node` launch because no prose
sample had been consumed. The replacement did not reuse or overwrite the receipt.

[Actual two-scene receipt](./sampled-prose-report-2026-09-07T18-51-27-173Z-afa64a3d-b8ce-4f39-81fe-7522a34b8be7.json).
The model restored fully offline in 14.460 seconds. The first 199-token prompt
generated 48 tokens in 53.291 seconds; its cleaned passage was:

```text
2 - 3 years ago . The old road was marked by a white rose on it , a symbol of love and brotherhood , but today it had been a thorn in the side of the weary traveler who now sought to cross it .
```

That actual passage entered the real journal and was recalled unchanged for the
296-token arrival prompt. The second write generated 64 tokens in 78.569 seconds:

```text
Frodo remembered when he'd been a boy, the path to Elya and the way his father and mother had taken him to meet up at the road he had sworn to protect. The road was named after the rose that Mara had planted there so she could see the sun rise on its beauty.
```

**Literary result: failed for both scenes; no production promotion.** The first
invents a past interval and omits Mara, Rowan and the injury. The second echoes
the rose, but invents Frodo, Elya, parents and a past act by Mara while omitting
Rowan and their current arrival/injury. Carrying an invented image forward is not
the requested emotional continuity. Cleaner acceptance and two journal entries
prove the plumbing only. The raw receipts also preserve the discarded trailing
`The` and `But` tokens. No reroll, altered seed or replacement sample followed.

The actual run finished in 162.554 seconds. One worker was terminated, its browser
and local server closed, and all protected source hashes remained unchanged.
Offline/blocked requests and browser errors were zero. Requested and effective
prompt hashes matched for both scenes. Seventeen lightweight portable contracts
passed before this run; no model or browser checks were added to feature CI.

### Final sampled 360M follow-up: same prompt and disk-backed profile

The separately authorized final variant is
`node tools/creative-story-probe/run-successive-story.mjs --run --emotion-360m-sampled-persistent`.
It reuses the pinned staged 360M model, exact generic emotional-scene prompt
builder, 40-token cap, one-thread WASM, 1.08 repetition penalty and temporary
persistent browser profile of the preceding 360M receipt. The shared sampling
transform changes only prose decoding to temperature 0.7 and top-k 40; top-p is
omitted and the DM stays greedy. The same real journal/continuity chain, 90-second
write deadline and 295-second total budget apply. Existing trials and their
receipts remain untouched. This is one last scheduled chain, not a model sweep;
no inference result is claimed until that run is recorded.

[Final immutable receipt](./emotion-360m-sampled-persistent-report-2026-09-07T19-02-10-664Z-ac290ddc-7a5b-44b6-beeb-0459abff63e0.json).
The model restored from the fully local cache in 16.707 seconds. The unchanged
139-token first prompt generated 10 tokens in 31.658 seconds, returning exactly:

```text
Mara beside Rowan (injured)
```

**Literary result: failed; no production promotion.** Sampling produced a single
copy of the supplied label instead of the previous repeated label, but still no
story sentences, imagined feeling, gesture or emotional development. The cleaner
returned null; nothing was archived and the second scene was not attempted
because there was no actual accepted passage to recall. No authored substitute,
reroll, additional prompt or further model trial followed.

The run finished in 67.915 seconds. One worker was terminated; its browser and
local server closed; only the newly created temporary browser profile was
removed. Staged weights and old receipts remain intact. All protected source
hashes were unchanged, requested and effective prompt hashes matched, and
offline/blocked requests and browser errors were zero. Eighteen lightweight
portable contracts passed before the run, covering the shared 40/64-token
decoding transform, unchanged greedy DM and previous probe modes. The result
closes this turn's writer experiments: neither sampled 135M nor sampled 360M is
evidence of better grounded emotional prose.

### Short Qwen RPC boundary diagnostic

`node tools/creative-story-probe/run-stronger-writer.mjs --run --rpc-diagnostic EXISTING_TASK_TEMP_DIR`
requires the same verified staged Qwen/wllama artifacts; it cannot download or
combine with staging or streamed modes. This is one first-scene submission with
a 20-second generation deadline, 65-second load ceiling and 110-second runtime
budget including cleanup. It does not reload the model, try a second scene or
qualify literary quality. Prompts, sampling, model/runtime pins and direct-Blob
loading are unchanged. Retained page memory is still not persistent storage.

After loading, one `_getDebugInfo()` RPC records a post-load round-trip attempt.
The pinned 3.6.1 native endpoint is a null stub, while its JS method parses JSON;
its known rejection is recorded, not mistaken for a healthy debug response or
allowed to prevent completion observation. A hung debug call still stops at
its three-second deadline.
The probe transparently observes the pinned runtime's ordinary JS
`proxy.wllamaAction` property without replacing its arguments, receiver or
results. It retains the first 16 and latest 16 completion/result calls, counting
all calls and recording pending/resolved/rejected state, exact elapsed timings,
request IDs, response UTF-8 byte lengths and empty/null/nonempty classification.
It never records prompt bodies. At most eight worker errors are retained;
existing worker handlers stay installed. Observer failures cannot change the
inference result. The previous CLI modes and receipts remain untouched.

An unresolved `completion` call locates the problem before response polling;
an acknowledged completion followed by a pending `get_result` locates it in the
first native loop iteration; repeated empty results expose queue progression.
None alone proves a root cause. This replaces uninformative long waiting with a
bounded boundary observation, not another quality experiment. Portable checks:
`node --test tools/creative-story-probe/rpc-diagnostic.test.mjs tools/creative-story-probe/run-stronger-writer.test.mjs tools/creative-story-probe/stream-diagnostic.test.mjs`.

[Single immutable diagnostic receipt](./stronger-writer-rpc-report-2026-09-07T20-35-31-196Z-4708252e-26eb-4cf0-9cb5-4f75c505b3f8.json):
the model loaded in 27.809 seconds, then the initial debug preflight rejected
with `SyntaxError: Unexpected end of JSON input`. This run used the preceding
probe revision, which treated the debug failure as fatal. Consequently it made
**zero completion calls**, generated no output and did not locate the old
generation stall. Native `cpp/wllama.cpp` lines 153-189 show `wllama_debug()`
returning `nullptr`; the pinned ESM blindly applies `JSON.parse` to its result.
That is a concrete debug-endpoint defect, not evidence about model inference.
The run stopped in 29.737 seconds; its browser and owned local server closed,
all protected source hashes stayed unchanged, and offline/blocked requests
and observed worker errors were zero. Artifacts and old receipts remain intact.

After preserving the failed receipt, portable tests and the probe were amended
to record this known debug rejection without blocking completion observation.
The first receipt's source hashes describe its actual earlier revision, not
this post-run diagnostic-only correction.

One separately authorized corrected diagnostic reached the first actual
completion attempt: [corrected immutable receipt](./stronger-writer-rpc-report-2026-09-07T20-38-41-547Z-ca56d10d-bec1-4b47-bda7-6dabf6053443.json).
All 17 portable tests passed before it. Load took 26.533 seconds; the known debug
rejection was recorded in 72.2 milliseconds and did not stop observation.
The native `completion` RPC **resolved successfully in 150.7 milliseconds**,
returning request ID 1. The first `get_result` for that ID remained pending when
the 20-second generation deadline expired. Exactly two RPC calls were observed,
not repeated empty polls. There were no returned result chunks or story output.

This rules out an unacknowledged initial submission: chat preparation and task
admission returned successfully. It locates the outstanding boundary at the
first `get_result` request, whose native handler runs the first loop iteration
before returning results. The observation does not yet distinguish slow prompt
processing from an internal native or worker-queue stall; it is not proof that
the model cannot generate. A narrowly scoped worker CPU/entry observation at
this boundary is the next diagnostic, not changed prompts, temperature or cache.

The corrected run finished in 48.511 seconds. Both owned browser and server
closed, all protected source hashes stayed unchanged, and worker/browser errors,
offline requests and blocked requests were zero. Its exact runtime ESM SHA-256
is included alongside pinned model, archive and WASM identities. No third run,
second scene, runtime rebuild, downloads, persistence qualification or quality
promotion followed. No diagnostic was added to normal game CI.

### Profiled Qwen first native decode

The explicit `--run --cpu-diagnostic EXISTING_TASK_TEMP_DIR` mode adds a CPU
profile of the sole dedicated model worker to the preceding RPC diagnostic.
It preserves the exact model/runtime/artifact pins, archived first-scene prompt,
64-token cap, greedy decoding and 20-second generation deadline. The same
110-second total runtime budget applies. There is no second scene, download,
model restart or production integration. Profiling adds overhead; its timings
are not an uninstrumented performance comparison.

Before loading any model, `node tools/creative-story-probe/worker-profile-preflight.mjs`
proved the Chromium target/Profiler transport on a synthetic worker: a
444.05-millisecond profile captured 354 samples, including 325 inside the
expected busy function and 21 idle samples. That isolated browser closed in
1.756 seconds. The real model run followed 21 passing portable contracts:
`node --test tools/creative-story-probe/worker-profile.test.mjs tools/creative-story-probe/rpc-diagnostic.test.mjs tools/creative-story-probe/run-stronger-writer.test.mjs tools/creative-story-probe/stream-diagnostic.test.mjs`.

[Immutable profiled receipt](./stronger-writer-cpu-report-2026-09-07T22-32-47-220Z-5b12c633-58df-477b-ab8b-6ee591f565b2.json)
records a 29.697-second load and successful completion admission in 171.2 ms.
The first `get_result` remained pending at the 20-second deadline. Unlike the
earlier opaque timeout, this receipt contains the raw CPU profile, all decoded
native frames, worker target/isolate identity, RPC observations and exact source
and native symbol-map hashes.

The 20.091-second profile contains 16,703 samples, only 20 idle. Its hottest
call-tree node has **14,245 samples in `ggml_vec_dot_q5_0_q8_0`**; the next has
**1,490 in `ggml_vec_dot_q6_K_q8_K`**. Both run beneath this native stack:

```text
wllama_context::action_get_result
  -> server_context_impl::update_slots
  -> llama_decode / llama_context::decode
  -> llama_context::process_ubatch
  -> ggml_compute_forward_mul_mat
  -> quantized vector dot product
```

This directly establishes active initial native decode/matrix work, not an idle
worker queue, unsubmitted request or lost JS streaming callback. Fresh model
state and the first result request make prompt prefill the supported
interpretation; the profile does not report processed prompt-token counts or
prove when the first output token would complete.

**SIMD is already present.** Pinned `package/CMakeLists.txt:15` compiles with
`-O3 -msimd128`. Read-only disassembly of the exact staged WASM confirms vector
instructions in both hot functions: function 6918 includes `i32x4.splat` and
`i32x4.replace_lane`; function 6915 includes `v128.load` and `i8x16.shl`.
Rebuilding merely to enable SIMD is therefore not a supported remedy.

The smallest next optimization is a shorter, task-specific emotional prompt
that retains hero/companion names, current injury/status, one actual scene fact
and one emotional contrast, removing verbose writing exemplars. That targets
the measured initial matrix work without changing character facts or asking
for more tokens. `n_batch`/`n_ubatch` are exposed and forwarded by the pinned
runtime, but reducing microbatch size is not itself evidence of faster total
prefill; it changes chunking, not the total prompt work. Actual prose quality
and end-to-end latency still require a separately bounded verification before
any model promotion. No optimization run was part of this profile.

The entire run finished in 51.907 seconds. The profiler detached, worker isolate
still answered its identity query, and the owned browser and local server
closed. All protected hashes remained unchanged; worker/browser errors and
offline/blocked network requests were zero. There was no generated story,
quality promotion, repeated trial or change to normal game CI.

### One compact emotional-scene experiment

The separately authorized `--run --compact-emotion EXISTING_TASK_TEMP_DIR`
mode targets the preceding measured initial decode work by shortening the
prompt, not by changing the model, runtime, generation settings or native build.
It uses one injured-companion scene from the existing archive, preserving the
exact facts/viewpoint/expected outcome in the receipt. The prompt names Mara
and Rowan at Greyford campsite, keeps Rowan alive, injured and still a companion,
and asks for care against fear of failing their shared-road oath. Two short
story-only sentences are requested, without invented history, healing, death or
departure. The messages contain 37 whitespace-separated words; this is not a
claim about the native tokenizer's count, which is recorded only if returned.

This explicit mode keeps the same pinned staged GGUF and WASM, direct in-page
Blob loading, one CPU thread, 64 output tokens and unchanged greedy sampling.
It permits at most 35 seconds for load and 90 seconds for writing within a
130-second browser-runtime budget including five seconds reserved for cleanup;
artifact verification and isolated probe bundling occur before that budget.
Generation is offline, with the existing bounded RPC observer but no profiler.
There is no second scene, reload, model download, cache experiment or production
promotion. A timestamp-and-UUID receipt retains exact rewritten messages, both
message hashes, actual raw/cleaned output when available, timings and closure.
All 22 portable diagnostic/CLI tests passed before this one attempt.

[Immutable compact-scene receipt](./stronger-writer-compact-emotion-report-2026-09-07T22-44-23-979Z-6aab2815-2868-4727-84c1-36611c0e426f.json)
records successful loading in **34.594 seconds**, completion admission in
**160 ms**, and the first `get_result` still pending at the stop. No complete
raw or cleaned story, native token count, or quality assessment is available.
The total browser-runtime ceiling clipped the nominal 90-second write to about
89 seconds; the error retains the configured `90000ms` label. The final RPC
snapshot also hit its remaining-time bound, so the receipt honestly retains
the last delivered RPC checkpoint rather than inventing a final worker state.

The run finished in **125.436 seconds**, with the owned browser and server
closed, protected inputs unchanged, and zero attempted generation requests,
blocked requests, page/runtime errors or recorded worker errors. Shortening the
prompt did not make this pinned single-thread Qwen path return within the
available budget. This does not prove that shorter prompts cannot help, or
that the native model is deadlocked; the preceding profile proves active native
math only for its own measured window. No second scene, retry, new download or
production change followed. Further work should change a source-backed runtime
constraint or measure native prompt progress; extending opaque waits is not a
story-quality result.
