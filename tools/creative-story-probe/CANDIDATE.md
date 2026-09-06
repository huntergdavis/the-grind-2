# One isolated stronger-writer comparison

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
