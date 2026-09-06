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
download. Historical reports remain untouched; results go to
`viewpoint-report.json`, with partial results saved after each completed sample.

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
