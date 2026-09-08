# One isolated stronger-writer comparison

## September 7 finishing-path trial: one Qwen ONNX story opening

The [Qwen2.5-0.5B ONNX manifest](candidate-qwen25-05b-onnx.json) pins a
Transformers.js-compatible artifact for the existing ONNX Runtime worker. This
is a different execution path from the unsuccessful Qwen/wllama CPU trial, not
an extended timeout or repeat of that setup. Five files total 519,136,456 bytes;
the existing runtime adds 23,614,439 bytes. The source model is Apache-2.0; the
ONNX card identifies that source but omits its own license metadata.

```sh
node tools/creative-story-probe/run-candidate.mjs --candidate tools/creative-story-probe/candidate-qwen25-05b-onnx.json --run --story-opening --persistent-profile --skip-restore
```

The explicit opening mode selects only the first existing public Mara/Rowan
successive-scene fixture and its instruction-only compact emotional prompt.
Node and the browser use the same helper, and the receipt verifies the exact
facts/messages returned. There is no authored prefix, supplied story prose,
automatic second attempt or automatic continuity trial. Decode remains q8,
one-thread WASM, greedy, at most 64 tokens, with the existing 90-second write
deadline and sentence stopping. Read the actual result before choosing a next
step. Runtime completion and cleaner acceptance do not establish quality.

The explicit persistent-profile flag uses a fresh owned disk-backed browser
profile to avoid the previously observed incognito large-entry cache limit.
Generation remains offline. The temporary browser profile is removed only after
its context closes; verified staged downloads remain reusable. Cleanup results
are recorded. This command skips the separate reload/restore proof, so do not
claim it demonstrates cache survival across browser restarts.

Existing invocations without these flags still use the original three archived
prompts and isolated incognito context described below. The actual production
client/worker source and live model choice remain unchanged during the trial.

### Actual result: load timed out, no story to judge

The [single September 7 opening trial](candidate-report-2026-09-08T01-09-54-396Z-ac9e04ca.json)
verified all five downloaded artifacts, built the intended identity and reached
the production client's 180-second **loading** timeout. Generation never began:
there are zero outputs, no literary-quality result and no cache-restore proof.
The whole run took 214,921 ms (about 3 minutes 35 seconds), including staging,
build and cleanup. Browser, context and server closed; the owned temporary
profile was removed. Verified staged artifacts remain reusable. Production
sources and the live model were unchanged.

This disqualifies promotion on this tested one-thread CPU path within its
current load budget. It does not establish why initialization took so long,
whether another device can load it, or how well Qwen would write. Do not rerun
unchanged conditions or extend the timeout. The next decision is the intended
browser/device path, as specified in the [finish plan](../../docs/STORYTELLING_FINISH.md).
The current probe only returns accumulated loading progress after success, so
this failure receipt cannot separate transfer/cache work from ONNX session
initialization. Preserve progress on failure in a future target-device check;
do not fill that evidence gap with a guessed diagnosis.

## Original identity-only comparison

This probe changes **only model ID and pinned revision literals at build time**
in the actual production creative client and worker. Production files, current
game settings, and historical reports are never modified. The report records
both transformed modules and verifies their source files are unchanged.

The initial candidate is the official Apache-2.0 SmolLM2 360M Instruct artifact
at revision `a10cc1512eabd3dde888204e902eca88bddb4951`. Its GQA graph may not work
with the deployed one-thread WASM runtime; no compatibility or quality claim is
made before an actual run succeeds. The five files total 366,673,969 bytes.
Downloaded and reused staging files must match their exact sizes and SHA-256
digests. Model staging and generated bundles live only under the ignored
`.narrator-t5-rebuild/creative-probe/candidate-<revision>/` directory.

Build without downloading weights or launching a browser:

```sh
node tools/creative-story-probe/run-candidate.mjs --candidate tools/creative-story-probe/candidate-smollm2-360m.json --prepare
```

Explicitly download verified files, then run the comparison:

```sh
node tools/creative-story-probe/run-candidate.mjs --candidate tools/creative-story-probe/candidate-smollm2-360m.json --run
```

The browser receives the **exact three stored messages and facts** from
`viewpoint-report.json`, not newly rebuilt prompts. Generation remains q8,
one-thread WASM, greedy, 64 new tokens, and repetition penalty 1.08. The actual
client retains its 180-second load and 90-second inference deadlines. Stop on
the first load/write failure; do not conceal a timeout by changing the budget.

Cold model requests are redirected to locally staged verified bytes, streamed
over localhost to avoid a giant Playwright response body. The browser is then
offline for every generation. Any attempted generation request fails the run.
After the three writes, the worker is disposed and restored offline if enough
of the finite total budget remains. Only the already-built worker JavaScript
bootstrap is fulfilled from disk in this restore phase; model/runtime network
requests are prohibited. `--skip-restore` explicitly omits that separate phase.

Each invocation creates its own timestamped `candidate-report-*.json` (or
`candidate-preparation-*.json`). Partial reports are saved after staging/build,
before each write, after every result, and on failure. The total watchdog is
15 minutes, including staging and build; phase deadlines and an independent
cleanup deadline prevent a failed browser from lingering indefinitely.

A successful execution is not a quality pass. Compare raw and cleaned text
with the preserved baseline: correct people, actual unresolved outcome,
recognizable feeling/concern, repetition, completeness, and observed latency.
Do not promote the candidate solely because it loads or sounds more fluent.

## First actual comparison: did not qualify

The [September 6 candidate report](candidate-report-2026-09-06T23-28-10-911Z-9149546d.json)
records a 178,372 ms cold load, just inside the existing 180-second client limit.
The complete-cache check returned false; its cause was not diagnosed. The first
unchanged `rested-curious-hero` prompt then reached the production client's
90-second inference timeout. No completed prose was returned, and no generation
network request occurred. The other two prompts and cache-restore phase were
not run after that failure, as required by the bounded comparison.

The browser closed and the run finished in approximately 4 minutes 57 seconds.
Both production source files were unchanged. This candidate therefore does not
qualify for promotion under the current runtime/deadline contract. It is **not**
a measured literary-quality failure: there was no completed sample to judge.
Loading succeeded, so this run also does not establish an unsupported GQA kernel.
