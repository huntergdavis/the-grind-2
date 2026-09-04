# Isolated V3 browser narrator rateability run

This diagnostic-only tool performs exactly one client-side, ordered 200-case
FLAN-T5 form-selection run through the frozen V3 runner. It derives mechanical
rateability and blind-study artifacts without granting human-quality, model
admission, display, gameplay, persistence, renderer, or production authority.
The v0.5.88 one-case smoke remains byte-frozen in its separate sibling tool.

## What is frozen before observation

The pure rateability contract recomputes every result from a fully validated V3
run receipt. It requires at least 198 valid rows, at least 140 genuinely
model-selected nonbaseline rows, 90% validity and 60% rateable capacity in each
move/energy/voice stratum, and 65% rateable capacity in each voice. Across the
twenty chronological ten-case seeds, no two-call burst may repeat a valid form,
the maximum valid form run is three, and every seed must contain at least two
valid form IDs.

Those are capacity and fatigue gates only. Model wins, prose quality, confidence
and B2 disposition require an independent human rating in a later release.

The browser provenance contract separately records service-worker policy,
external staging attempts, whether offline mode preceded load, post-transition
requests, worker shutdown, page/context/browser close status, and the complete
runner lifecycle. Context routing observes HTTP(S) traffic and page WebSockets;
response CSP also prevents an isolated worker from opening an external
connection where Chromium does not expose that worker socket to Playwright.
The committed executable closure statically excludes every non-staging network
API. Nonzero observed network counts and failed lifecycle or producer-close
observations are valid retained evidence with a blocked disposition; they are
not repaired by a retry, rescore, reorder or substitution.

Pre-offline staging acquires verified bytes, constructs the worker and performs
only its transport initialization so the module and transferred buffers exist
before isolation. The one core runner invocation remains the sole owner of
handshake, artifact verification, model load, cases, disposal and termination.
A failure before a worker port can be constructed is a pre-observation tool
failure and has no run package; the coordinator never retries it automatically.
A fatal exception before the runner returns its complete receipt/summary/sheet/
key set likewise cannot form the six-file package. Ordinary load, row, disposal
and termination failures are represented by that completed evidence set.

## Private package and public projection

The coordinator writes one new external directory with exact mode 0700 and six
exact-mode 0600 files:

- `adapter-run-provenance-receipt.json`
- `blind-key.json`
- `blind-sheet.json`
- `rateability-summary.json`
- `run-receipt.json`
- `run-package.json`

The directory is finalized by an atomic same-parent rename only after all file
bytes and package commitments validate. Its existing parent must be a real
directory owned by the current user with exact mode 0700. The coordinator holds
an exclusive cooperative lock through its final missing-target check and rename;
this no-clobber guarantee assumes no hostile same-user process bypasses that
lock. The package manifest commits each of the first five files by schema,
structural content hash, serialized byte length and SHA-256.

Until independent rating is complete, the run receipt, blind sheet and blind key
remain private. The run receipt reveals selected forms and score traces; the key
contains the secret salt and model-side assignments. Only the provenance
receipt, aggregate rateability summary and commitment-only package manifest are
safe to retain publicly. That public projection is not independently replayable
until the private evidence is released after rating.

## Run

Install the exact lockfile and Chromium. Create a URL-safe 32-byte-or-longer
secret in a non-symlink external file with mode 0600, then use a new external
output path beneath an existing, current-user-owned exact-mode 0700 directory:

~~~sh
npm ci
npx playwright install chromium
npm run check:narrator-rateability-v3
node tools/narrator-browser-rateability-v3/run.mjs run \
  --model-dir /absolute/path/to/the-grind-2-narrator-flan-t5-small \
  --run-id grind2-v3-rateability:v0.5.89 \
  --sheet-id grind2-v3-blind:v0.5.89 \
  --secret-salt-file /private/absolute/path/to/salt.txt \
  --out /private/absolute/path/to/new-evidence-directory
~~~

The model directory must be the public artifact repository at revision
`8c85146bbe1a9bcaa4b77faa2c7ef52b2e5b8dd4`. The serial run normally takes
roughly 11–15 minutes from the v0.5.88 one-case timing; allow more than 30
minutes and prevent machine sleep. There is intentionally no checkpoint,
resume, retry or partial-run repair.

The coordinator materializes every executable source byte from the clean named
Git commit into a temporary build root, snapshots every emitted regular file
once. The observed build contains the four browser outputs plus one self-
contained host-evidence module. Only the browser outputs are served. It also
snapshots and verifies the six model and two runtime files before staging them.
Chromium blocks service workers and external HTTP(S)/page-WebSocket routes;
response CSP additionally hard-blocks external worker connections. The context
then attempts to switch offline before model load and inference. A failed switch
is retained as a blocker.

After the runner returns, its worker is terminated and the coordinator closes
the page, context and browser before freezing the final request counts. Only
then does Node import the exact hashed host-evidence module and create/verify the
provenance receipt and package. The separate host verifier revalidates serialized
bytes and cross-links against Node-owned committed source/build, candidate,
model/runtime, browser and sealed network observations plus literal frozen
contract hashes. Standard output reads those frozen observations, omits the
private path and contains aggregate counts, non-secret hashes, blockers and
false authority flags only.

A receipt cannot honestly be included in the source commit it names. Release
flow is therefore source commit → one real observation → public evidence-only
commit, with the tag pointing to the source commit.

This contract/evidence order and the prohibition on manufactured or repaired
results reuse recovered session `[codex] the_grind_2 · today · 01a06835-15f`.
