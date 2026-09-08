# Storytelling v1 — a three-day finish plan

Updated September 7, 2026 (America/Los_Angeles).

Target: a small, convincing storytelling release by September 10, not completion
of the entire game backlog. This is a working delivery target, not a guarantee
that an untested model will meet quality or device limits.

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
P0-A/B/C remain open; this delivery fix is not a stronger-prose qualification.

## What already works

The client-only pipeline already has explicit LLM/No LLM startup, reusable model
cache, background writing, current public scene facts and two earlier imagined
passages, moment/stage selection, safe-break intermissions, and a persistent
Narratives archive with readable and JSON exports. Do not rebuild these systems.

The missing result is consistently interesting, connected prose. Real 135M and
360M trials did not demonstrate it. The Qwen/wllama single-thread CPU route did
not return prose in its bounded deadline. More seed volume, UI polish, metadata
or completed model calls do not close this gap.

The selected first candidate is [Qwen2.5-0.5B ONNX](https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct/blob/cc5cc01a65cc3ff17bdb73a7de33d879f62599b0/README.md)
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
