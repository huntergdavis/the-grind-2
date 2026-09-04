# Isolated V3 browser narrator rateability run

This diagnostic-only tool performs exactly one client-side, ordered 200-case
FLAN-T5 form-selection run through the frozen V3 runner. It derives mechanical
rateability and blind-study artifacts without granting human-quality, model
admission, display, gameplay, persistence, renderer, or production authority.
The v0.5.88 one-case smoke remains byte-frozen in its separate sibling tool.

Version 0.5.89 consumed its one allowed physical execution. Inference completed,
but the post-browser host verifier used the wrong nonempty-row commitment and
therefore produced no evidence package. No rows, summary, aggregate counts or
rateability disposition were viewed, and that version will not be rerun. The
public incident is
[narrator-v3-rateability-v0.5.89-incident.json](../../docs/narrator/narrator-v3-rateability-v0.5.89-incident.json).

Version 0.5.90 corrected the row commitment, then consumed its one allowed
observation. Inference again completed, but the independent verifier compared
the core run specification's reduced nine-field candidate binding with the full
publication manifest. It produced no evidence package; no rows, summary,
aggregate counts or disposition were viewed, and v0.5.90 will not be rerun. Its
public incident is
[narrator-v3-rateability-v0.5.90-incident.json](../../docs/narrator/narrator-v3-rateability-v0.5.90-incident.json).

The v0.5.91 source derives that reduced binding independently and proves both
blocked and rateable 200-row packages through production constructors. It also
replaces the generic verifier rejection with a frozen, ordered 17-predicate
audit. Each predicate reports only a namespaced ID, pass/fail/not-evaluated
status and prerequisite IDs; no expected or actual value, row, text, blind
artifact, salt or private path enters the diagnostic. The coordinator now
durably quarantines completed core objects before browser teardown and reads
every later phase back before the independent audit. This source freezes that
completed failure-retention coordinator for one physical observation: the third
execution of the unchanged candidate and corpus and the first and only execution
under v0.5.91. The model, corpus, prompts, ordering, thresholds, candidate
revision and semantic contracts remain unchanged. Its status is `not-run`.
The observation is authorized only after the exact source commit passes the full
release gate, is pushed, independently reviewed and the annotated `v0.5.91`
tag is verified to point to it.
The verifier captures each top-level object once, validates each JSON projection
and returns the same six captured byte snapshots; it never validates one
serialization and writes another.

The isolated attempt-vault support now also freezes typed control records. Four
phase receipts parse exact copied bytes and commit only verified snapshot
metadata for the core, expected-binding, provenance and host tuples; live value
objects are not reread. A public-safe diagnostic contains only the frozen
predicate graph and a fixed failure code. Its terminal receipt enforces the
frozen failure-prefix lifecycle, refuses verification after any live-vault
failure, and derives its mechanical disposition from the committed run-package
bytes only after a passing audit and every preservation point. All authority
flags remain false. Inputs have exact keys. The live vault latches its first
safe publication/readback failure class, rejects a relabeled diagnostic, and
refuses retention when a later fault makes an existing diagnostic stale.
The admission-rejection boundary now durably publishes and reads back `00`
before creating either lock. A later run-lock failure or destination collision
publishes the exact authority-free `00` → `40` → `90` tombstone before any
attempt handle can escape. Rejected retention verifies only the phase-exact
locks created by this attempt and never opens a competing destination lock.
Publication, verification, enumeration, sync, or close uncertainty returns a
path-free retention error, performs no failure cleanup, and preserves every
forensic path still present when the fault occurs instead of claiming a durable
rejection.

The isolated admission boundary now issues one frozen, null-prototype,
zero-key capability from an exact live start-only attempt. Consumption removes
its ready identity before awaiting anything, revalidates the exact `00` record,
both directories and both held locks, and invokes the captured callback
directly after the final no-follow destination-absence check. A private
asynchronous lease and child FIFO let causally scoped read/publication work
complete without deadlocking admission, drain fire-and-forget operations, and
reject external, cross-attempt or stale-descendant work. Retained close revokes
an unused token and cannot close an active lease. Pre-callback faults retain
exact `00` → `40` → `90`; callback faults expose only a stable path-free error
and cannot manufacture a phase diagnosis.

The isolated attempt-bound finalizer now accepts exactly the active admission
capability and no attempt, path, filesystem, bindings or evidence input. It
synchronously seals later child operations, queues behind earlier admitted
work and derives all six output files from the exact committed vault prefix.
After one audit it writes and reads back a bound 0700 same-parent stage through
exclusive no-follow 0600 handles, revalidates both already-held locks, and
makes destination absence the last filesystem observation before rename. It
does not acquire the legacy finalizer's unrelated lock and performs no cleanup
after uncertainty.

The finalizer owns the passing or failure `40`/`90` pair. Audit failure
creates no stage; publication failure preserves any stage or destination.
Its child request returns no success value. Only enclosing admission can
report success, after the callback settles, its FIFO drains, output, terminal,
vault and locks revalidate, and every held handle closes. Lock files remain
retained. A fulfilled callback without finalization now fails explicitly and
allows only retained close.

The companion phase-failure finalizer accepts exactly
`{ admission, failureCode }` from that same active asynchronous lease. It
recognizes only core, bindings, host-construction, provenance and host
preservation failures. The request synchronously wins or loses the single
finalization reservation, seals later child operations and queues behind every
earlier admitted publication. A healthy exact phase prefix or an identical
already-latched child failure publishes and revalidates only that retained
prefix plus authority-free `40` and `90`, with a null audit and run package.
It creates no staging state and performs no destination observation or mutation
after reservation. Forged, stale, cross-attempt, relabeled and duplicate
requests fail without filesystem work. Physical ambiguity returns the stable
retention error, removes nothing and leaves both 0600 lock paths retained.
The legacy generic finalizer remains a compatibility path and does not import
either attempt finalizer API.

The observed host bundle now exposes provenance verification and run-package
construction as two separate stages. The first stage verifies committed source
bytes and returns one frozen provenance receipt. The second accepts the
completed core tuple plus a separately supplied provenance value, allowing the
coordinator to publish and read back `30-provenance-receipt.json` and
`31-provenance-preservation.json` before package construction begins. The old
combined helper remains as a compatibility composition of those exact stages.
The two production 200-row compatibility cases exercise the staged handoff for
both blocked and mechanically rateable packages.

The CLI now calls one browser-free attempt coordinator instead of the legacy
generic verifier/finalizer or combined host helper. It owns
begin → issue → consume, publishes and reads back core evidence immediately
after the browser runner returns, and permits host construction only after the
observation callback closes its producers and confirms the seal. Expected
bindings, provenance and the host pair are committed in order through `39`;
provenance inputs come only from read-back `20`, while package construction
receives read-back core and provenance values. Success is reserved immediately
after `39`; bounded phase failures retain their exact prefix, and missing seal
confirmation retains without a fabricated terminal. Standard output waits for
the enclosing admission to verify terminal/output durability and close handles.
No Playwright, browser, model, game or UI execution occurred in this integration
slice. There is no visual state to reconcile.

Twenty-two focused admission cases and twenty-eight finalizer cases cover
identity, hostile requests, FIFO ordering, mandatory settlement, exact byte
provenance, audit failure, late collision, terminal truth and post-callback
close. All eight isolated V3 suites pass 250 tests, including eleven
coordinator cases for successful/blocked settlement, single-use hooks, absent
seals, exact failure prefixes, read-back authority and the final `39`
failure-to-success handoff.
The wiring reuses recovered session
`[codex] the_grind_2 · today · 01a06835-15f`.

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

Install the exact lockfile and Chromium. Create a fresh URL-safe 32-byte-or-longer
secret in a non-symlink external file with mode 0600, then choose a new external
output path beneath an existing, current-user-owned exact-mode 0700 directory.
The fixed non-secret output basename is
`grind2-v3-rateability-v0.5.91-evidence`; its private parent remains local.
The final `node … run` invocation below is single-use and must not be invoked
until the checked, pushed, independently reviewed source commit is the commit
named by the annotated `v0.5.91` tag. Preparation commands may be repeated;
never repeat the final invocation under these or alternate identities, resume
it, repair it or reuse its identities.

**SINGLE-USE TEMPLATE — RUN ONLY AFTER EVERY CONDITION ABOVE IS TRUE.**

~~~sh
npm ci
npx playwright install chromium
npm run check:narrator-rateability-v3
node tools/narrator-browser-rateability-v3/run.mjs run \
  --model-dir /absolute/path/to/the-grind-2-narrator-flan-t5-small \
  --run-id grind2-v3-rateability:v0.5.91 \
  --sheet-id grind2-v3-blind:v0.5.91 \
  --secret-salt-file /private/absolute/path/to/salt.txt \
  --out /private/absolute/path/to/existing-0700-parent/grind2-v3-rateability-v0.5.91-evidence
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
