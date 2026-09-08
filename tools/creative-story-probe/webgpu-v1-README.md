# GPU narrative slice — v0.5.123

The production creative writer now uses the same pinned Qwen2.5 1.5B q4f16
model and WebLLM 0.2.85. These manual probes are not new CI matrices and their
`complete` flag is cleanup/execution status, **not a literary-quality pass**.
The new `8907eba1` sequence passes the council's minimum three-scene continuity
acceptance. This does not establish universal emotional quality; solo inner
life and occasional awkward/inferred details remain limitations.

## September 8 follow-up — no prompt promoted

[Arrival rewrite](webgpu-v1-report-2026-09-08T07-32-43-530Z-8bf844e3.json)
passed text admission but weakened farewell. The
[smaller injury-cause boundary](webgpu-v1-report-2026-09-08T07-42-02-220Z-39bb32e5.json)
improved arrival, then produced garbled farewell text rejected before archiving.
Both stopped intentionally at three of four fixtures and closed all owned
resources. Neither is a literary pass or a shipped prompt. The production source
was restored; [full verdicts and measurements](../../docs/STORYTELLING_FINISH.md#september-8--injured-arrival-candidates-not-promoted)
retain the unknown cause and distinguish the supplied-response regression from
an actual GPU reproduction.

### Source audit: production prompts are not the whole production worker

The September 8 follow-up found a remaining fidelity gap: this proxy engine has
no production logit processor and consumes up to 64 tokens instead of using the
actual worker's two-sentence interrupt/drain path. Production's pass-through
processor still adds GPU/CPU transfers and synchronization in pinned WebLLM.
Runtime bytes match and reset/seed use showed no bug; the garbling cause is not
established. Prior receipts remain bounded probe evidence, not an identical
production lifecycle. Before another prose qualification, reuse the actual
production worker/client rather than duplicating its adapter or retuning prompts.

## Recorded results — September 7, 2026 PDT

| Receipt | What actually happened | Verdict |
| --- | --- | --- |
| [Contextual scene/prose history](webgpu-v1-report-2026-09-08T04-35-07-729Z-8907eba1.json) | Four accepted outputs, 19.954s cached load; writes 30.248/29.620/35.558/22.113s. Worry → relief with care → affection at farewell; no copied old journey. Solo Inez stayed isolated. | Council passes the minimum three-scene plus solo-readability check. Wording is imperfect; solo remains scenery. Every write resets chat like production. Both history and probe reset fidelity changed, so causal attribution is not isolated. |
| [Compact opening](webgpu-v1-report-2026-09-08T02-28-49-699Z-ab8f7d4c.json) | Two emotional scenes; first load 50.408s, writes about 39s/22s. | Promising single-scene prose, not production-prompt qualification. |
| [Original production prompt](webgpu-v1-report-2026-09-08T02-41-24-081Z-c00ca82d.json) | Two outputs; seed imagery became a literal keyhole/room and displaced Rowan. | Failed character/current-scene grounding; stopped. |
| [Character-first prompt, user-turn memory](webgpu-v1-report-2026-09-08T02-47-51-862Z-8cf30ce7.json) | Arrival copied the actual road paragraph exactly. | Failed continuity; duplicate rejected; stopped. |
| [Character-first prompt, native assistant history](webgpu-v1-report-2026-09-08T02-57-33-229Z-50b7719f.json) | Four outputs, 19.149s cached load, writes 35.404/30.272/30.456/22.140s. Arrival changed but used ambiguous “final resting place”; farewell copied the unfinished road. Solo scene was mostly scenery. | **P0-B failed**, despite a successfully completed probe. Farewell was not archived as a new story. |
| [Actual built-game journey, first half](webgpu-game-report-2026-09-08T03-04-08-450Z-74c3980a.json) | v0.5.122, explicit saved-model consent, 19.080s cached load, 14.011s real DM selection, 23.099s real write. Orin's exact model prose reached scroll and Journal; ticks advanced 7→11 during writing. | 18 checks passed, then the harness tried the hidden Focus-mode Pause button after Panels was remembered. |
| [Cache-only/cancel continuation](webgpu-game-report-2026-09-08T03-16-33-976Z-3e3e547f.json) | Same actual campaign/story; cache-only ready after 20.422s; the next real write was terminated on Off before any result. | 20 checks passed; then Options Close clickability timed out. Its cause is unconfirmed, not automatically an app bug or merely a selector bug. |
| [No LLM continuation](webgpu-game-report-2026-09-08T03-28-03-637Z-ab8f8509.json) | Exact journal/campaign retained, no late canceled entry, No LLM advances and reloads without a creative worker, model call or external request. | 44 checks passed in 24.762s with all resources closed. No new inference; verifies the linked final segment, not same-page Close responsiveness after cancellation. |

All these owned browser/model processes closed. Receipts retain exact prompts,
raw output, cleaner results, eligible memories and provenance; rejected output
does not become accepted by being present in a report. The actual application
capture shows the real generated passage, not supplied or authored substitute
text. Desktop and 320px scrolls were reviewed; Journal retains the same prose
and LLM attribution below its ordinary reading controls.

Qualification is limited to this Intel UHD 620/Gen-9 hardware under the listed
Linux headless GPU flags. No default-browser or broad device claim follows.
Pinned model/config/tokenizer files total 875,705,761 bytes, plus runtime assets;
the player-facing disclosure is about 900 MB and WebGPU. Writes occur entirely
locally. The saved-model proofs attempted no external requests.

Older CPU scripts in this directory are historical. Reproduce their old inline
model/cache contract at commit `00cb96d`; do not use them to prime the current
WebLLM cache layout or interpret old CPU receipts as current GPU measurements.

## Standalone probe usage

Run `node tools/creative-story-probe/run-webgpu-v1.mjs --run` only while the browser/model slot is exclusively owned. The caller must stage `@mlc-ai/web-llm@0.2.85` under `.narrator-t5-rebuild/creative-probe/webllm-v1/node_modules` first. The runner does not install packages. It builds its own isolated Vite page, then lets WebLLM obtain the pinned Qwen2.5 1.5B q4f16 artifacts. This standalone page does not prove the production application flow.

The model revision and compatible compiled-library commit are fixed in `webgpu-v1-config.mjs`. The probe uses a module worker, a 1024-token context, 64 generated tokens, temperature 0.7, top-p 0.85 and seed 7. No authored assistant prefix or replacement story prose is supplied. The public fixtures and emotional prompt builder are shared with previous probes. The second scene uses the actual first generated passage through the production journal and continuity selector, never a canned memory.

Only the first scene runs automatically. The runner prints its raw/cleaned output and pauses for `next` (one second-scene approval) or `quit`. It pauses after scene two as well; there is no automatic third scene. Inspect literary quality and the facts before approving the next scene. Cleaning or archiving is not a quality pass. Empty or malformed output can prevent the continuity scene.

The load ceiling is 180 seconds, each write 90 seconds, and the entire run including human review 10 minutes, followed by bounded browser cleanup. Every run has a new receipt. Load progress and streamed partial output are checkpointed even if a later deadline fails. Exact input messages, source hashes, sampling pins, browser capability, request methods/paths, raw/cleaned output, usage and cleanup outcomes are recorded. Request queries are omitted because artifact-CDN URLs may be signed. Network is switched offline immediately after load and all later request attempts are blocked. Only GET/HEAD artifact requests are allowed while loading; story messages are never sent to a server.

The ignored profile `.narrator-t5-rebuild/creative-probe/webllm-v1/candidate-browser-profile` and strict local origin `127.0.0.1:19877` are preserved to permit normal model-cache reuse. It is a dedicated probe profile, not a user's browser profile. No cache deletion or automatic retry occurs. A busy port fails rather than selecting another origin. Build artifacts are also retained under that ignored staging directory.

Headless flags explicitly enable the machine's WebGPU path. The probe requires a nonfallback `shader-f16` adapter and records its identity. A successful run under these flags would establish this harness/device result, not default support in every player's browser. The library/model mapping is present in the official WebLLM registry; that compatibility listing does not establish emotional writing quality.

## Production-prompt, cache-only continuation

After the first successful probe has populated this owned profile, run `node tools/creative-story-probe/run-webgpu-v1.mjs --run --production-scenes`. This explicit mode uses the current, unmodified `buildCreativeStoryMessages` and production cleaner. Four public fixtures cover the original road, arrival, Rowan's alive-but-injured farewell at Greyford, and independent solo traveler Inez. Farewell has no active companion; the departing Rowan's condition remains explicit in the public facts. The first three scenes share one synthetic campaign. Inez has a different campaign, so no Mara/Rowan memory should leak into her scene.

Expected actual production-selected memory counts are 0, 1, 2, 0. Missing eligible generated memory stops the proof; it is never replaced with authored prose. Each output still requires a manual `next` or `quit`, and only the first scene starts automatically. The extended total ceiling is explicitly 15 minutes including reviews; the 180-second load and 90-second write ceilings are unchanged. Early `quit` closes a partial proof; inspect `outputs.length` against `plannedScenes`, not just cleanup completion.

This mode requires the preexisting owned profile and blocks every external request from browser launch onward. Local build/worker assets remain accessible until load finishes, then browser networking is switched fully offline. Cache inventory and blocked attempts are recorded; a missing model/runtime artifact fails instead of redownloading it. The original two-scene mode and its previous immutable receipt remain intact.

The worker uses `buildCreativeWriterConversation` to pair each recognized
selected passage with its recorded earlier location/headline: historical user
scene, exact imagined assistant prose, then the next pair. Current facts remain
last, and each operation resets the runtime chat. Text-only older memories have
explicitly unavailable original scene details, not invented context. The receipt records both the
original production messages and the exact model-role messages. The cleaner,
character anchor and duplicate gate must all pass before a new passage can
enter the probe journal; passing them still does not establish literary quality.

Before `8907eba1`, this standalone probe reset only for the independent solo
scene, unlike the production worker's per-operation reset. That mismatch is now
corrected and explicitly recorded as `productionChatReset`. Older immutable
receipts are retained, not retroactively described as identical lifecycle tests.

### Isolated production solo check

`node tools/creative-story-probe/run-webgpu-v1.mjs --run --production-solo`
selects only the existing fourth fixture, Inez travelling alone toward Old
Hollow. It is mutually exclusive with `--production-scenes`. This is one
cache-only production write, not a rerun of the three-scene relationship chain:
`plannedScenes` is 1, expected selected memories are 0, and `isolatedSolo`,
`productionChatReset` and `independentChatReset` are true. The current production
prompt/conversation builder and cleaner are used without fixture or prose
substitution. The journal starts empty, and chat resets before the write.

The existing owned model cache is required; external requests are blocked from
launch and there is no download, retry, or automatic next scene. After the one
output, enter `quit` to close the manual review. The existing 180-second load,
90-second write, and 10-minute total ceiling including review apply, followed by
the same bounded cleanup. A unique receipt records the result; previous modes
and immutable receipts are unchanged. This switch alone provides no new quality
evidence until a separately authorized actual run is assessed.

## Actual built application

`run-webgpu-game.mjs --run --entry=index-HASH.js --sha256=HEX --version=VERSION`
uses an already-built `dist`, hashes the entry and relevant source, and serves
the real `/the-grind-2/` path on the same isolated origin/profile. It does not
build, install, supply writer results, seed narrative history, alter clocks or
download model files. It forwards the real Worker messages unchanged for its
receipt. The total work limit is 455 seconds plus bounded cleanup.

The journey covers explicit consent, model background work while ticks advance,
safe scroll and exact Journal entry, cache-only reload, Off during a pending
real write, and advancing No LLM play after reload. A harness failure must stay
in its original receipt. A linked continuation may reuse the exact prior story
only after validating the prior receipt/build/source and actual saved history;
it must not claim to have repeated fresh consent or generated that story again.

The two bounded continuation forms are:

```sh
node tools/creative-story-probe/run-webgpu-game.mjs --run --entry=index-BHb-1uf_.js --sha256=048c4f814ee9f805a21e3782d4ccff14c5d76e6f2ecdef68b96c0bd79cda3643 --version=0.5.122 --resume=webgpu-game-report-2026-09-08T03-04-08-450Z-74c3980a.json
node tools/creative-story-probe/run-webgpu-game.mjs --run --entry=index-BHb-1uf_.js --sha256=048c4f814ee9f805a21e3782d4ccff14c5d76e6f2ecdef68b96c0bd79cda3643 --version=0.5.122 --resume-off=webgpu-game-report-2026-09-08T03-16-33-976Z-3e3e547f.json
```

`--resume-off` has a 90-second work ceiling, no GPU-enabling flags, and must
find the actual remembered No LLM preference before opening the app. It validates
both prior receipt hashes and the unchanged pre-Off journal. It never changes
mode, supplies stories or reactivates the model. These commands are exact
historical receipts, not instructions to rerun unchanged successful checks.
The local build included preserved unrelated ledger edits, excluded from the
feature commit; clean release CI may have a different entry hash. A mismatch
must fail rather than silently substituting another build.

Cleanup failures now force `complete: false`. A 25-second cleanup watchdog writes a failing receipt and exits through Playwright's owned-child process exit hooks if graceful cleanup stalls; it does not claim resource closure that was not observed. No shared browser process is killed, and the dedicated model cache remains preserved.
