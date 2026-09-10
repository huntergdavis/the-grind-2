# The Grind 2 — Red-Team Council Report

Status: council reviews, latest update 2026-09-10

## Gameplay-first council — smith supplies and assisted disarming (v0.5.157)

Reuses `deja "dungeon tool"` and `deja "disarming kit"` sessions06/03, the
previous session30 separate-disarm contract, and BACKLOG item21. One recorded
smith sells one capped Disarming Kit for five gold. Existing recovery, tonic,
inn, quest-route and oath priorities stay ahead of optional supplies. Purchase
costs one normal turn, with exact building/gold/quantity proof and no XP grant.
One detected trap consumes the kit on success or failure for +2 on the existing
check, preserving its skill and fixed roll. No hidden-roll policy lookahead,
second attempt, new RNG, crafting framework, panel or narrator dependency.

Depth26 initializes old purchase/use histories empty without granting tools.
Sparse typed item capabilities leave old items unchanged. Keep only the latest
purchase and the current dungeon's latest use; validate arithmetic, owner,
source and quantity transitions on play and reload. Inventory describes the
actual utility, the town scene binds to the recorded smith, and the existing
trap cutaway accepts a validated assisted V2 packet while preserving V1's
unassisted arithmetic and rejecting malformed packets. Keep the +2 contribution
visible rather than pretending the hero's skill increased.

Acceptance reuses the generated browser-dungeon-search:8 layout. The starting
Oakcross smith and twelve gold are real initial state; the new purchase must be
autonomous. A separately identified staged handoff moves that actual purchased
save to the existing dungeon location with half HP. It does not fabricate a
kit, receipt, room, trap difficulty or roll. The original three-step diagnostic
confirms an unassisted intellect11 + roll0 check fails difficulty12; require the
real purchased kit to yield13, consume1→0 and prevent that damage. This is a
representative legal purchase/use journey, not uninterrupted natural travel.
Targeted tests, one desktop/mobile browser journey and existing release CI are
the gates; no new long seed sweep or expanded device matrix is required.
Focused engine/purchase and presentation checks pass, including genuine
repurchase chronology and mechanical-level-capped trap arithmetic. Independent
final review finds no integration blocker. Old route fixtures now resolve the
real zero-XP purchase before their route/XP assertions; the ten exact seeded
hashes are intentionally updated because supply turns change gameplay. All
63 simulation/canonical tests pass in a 257.20s local batch. The existing
progression test now stops when its level/mastery/quest preconditions are met,
retaining every state-bound assertion instead of requiring 20,000 turns.
The source-closure gate caught a new types→purchase-implementation dependency.
Following recalled session03, move the receipt interfaces into the existing
shared types module; do not expand narrator manifests or runtime dependencies.
Version, boundary, TypeScript and production build now pass: entry
`index-DkJHL-By.js`, simulation `simulation.worker-D4k5MBvk.js`, unchanged CSS
`index-DjMkgq3A.css` and both unchanged narrator workers. The first browser
journey passes in59.6s, but visual review finds the pre-existing desktop trap
heading under the toolbar. Three renderer lines include wide trap scenes in
the existing reserved tableau layout; no CSS or mobile layout changes.
The corrected build (`index-BTDVZygw.js`, same simulation/CSS/narrator workers)
passes the strengthened same journey in81.3s (1.7m runner, unchanged120s
budget). Actual smith purchase and Inventory captures join the 1280/320 trap
captures and a scrolled320 proof. The test checks actual desktop heading
clearance and fully visible, hit-tested mobile attempt/consequence rows with
at least11px native text. Mobile canvas text remains small; readable proof is
in the existing native rail, not claimed from the miniature canvas. Exact
purchase, retained staged handoff, real search/entry/use, Status provenance,
cleanup and saved reload pass with zero browser errors, inference or external
requests. Root and independent browser review approve all five captures;
owned preview19880 is closed and user preview4174 is untouched.
The broad local duplicate test run was stopped after a stack sample located
its delay in the unchanged narrator evaluation-package validator. Local
regression work is restricted to game subsystems; the existing complete Pages
suite remains unchanged. Newly affected route/XP/timed-combat fixtures resolve
the real purchase or derive genuine canonical checkpoints, retaining source,
reward, pause and reload assertions. No gameplay is disabled to satisfy tests.
The game-only batch covers1,730 tests across138 files:1,704 pass initially and
26 failures identify the stale fixtures above plus one observer timing case.
All ten affected files then pass focused reruns (71 cases), without increasing
timeouts; the independent63-case simulation/replay batch also passes. Final
TypeScript, version and boundary checks pass. No full local narrator evaluation
or full browser matrix is claimed. Source is ready for the existing clean
Pages CI and public-asset verification; nothing is claimed live yet.

## Gameplay-first council — recorded road-battle memory (v0.5.156)

Reuses `deja "companion restorative"` sessions06/28 and
`deja "last-known threat marks"` session01a06835-15f and session03.
The queued companion-tonic feature did not meet its natural-occurrence gate:
two bounded samples total 8,000 turns, 21 recruitments and 29 hero-plus-companion
action windows. The only critical companion case, golden7 T31, already has a
guaranteed Spell Edge finish; T32 confirms victory. No tonic-aid code or save
migration was introduced. Item19 is held, not declared impossible or complete.

Instead, item20 exposes existing completed road battles as quiet historical
Map ink and a native disclosure in Browse known places. This is a precursor,
not completion of V04.21e: actual roaming-threat identities and sensing are
still absent. Project only the four retained completed combats, exact rated
road provenance and discovered endpoints. Keep the latest record per road,
observed species and result. Mid-road hollow diamonds are diagrammatic, never
creature coordinates; no invented age, current-danger claim, new archive,
canonical state, policy, reward or narrator change. Watch gets no extra ink.

The engine reviewer supplied a natural golden1/campaign1 witness: a completed
Cinderreach–Ambervale River Wyrmling victory is available at T12; Watch's atlas
scene occurs at T15 and the next battle at T16. Six focused projection tests
pass, covering exact save/reload, immutability, hidden roads, route mismatch,
geometry, latest-record selection, bounded pruning and malformed sources.
The 11 existing Gazetteer/party-marker tests also pass, as do version,
boundary, TypeScript and production-build checks. Simulation and narrator
workers retain their v155 hashes. Independent integration review caught that
adding history to the entry key could close existing district disclosures on
refresh. Same-place/campaign updates now preserve their open IDs and keyboard
focus as well as the new battle disclosure; the reviewer approves the fix.
The first browser journey passes its source/save assertions in 78.3s, but root
and independent visual review reject its 320px capture: the existing sticky
Return button covers the new history heading and note. Bounds-only checks
missed actual occlusion. Reusing `deja "gazetteer"` sessions03/09's existing
full-height browser, the mobile expanded layout now reserves a separate Return
row and scrolls only the notes below it. Desktop and collapsed Map are unchanged.
The corrected production build passes: entry `index-DGcxoPgN.js`, stylesheet
`index-DjMkgq3A.css`, with the same unchanged workers.
The corrected journey passes in 57.1s (1.2m runner, unchanged 120s budget).
It retains natural T15→16 exact autoplay/source facts, selected place and
native disclosure focus, an open district, four 1280/320 captures and exact
save/reload. It now checks hit targets and Return-rectangle non-intersection,
and clicks the actual mobile Return control to prove Watch cleanup. Zero
browser errors, inference or external requests. The T15→16 source key is stable;
this is not claimed as forced ring-change coverage of the rebuild branch.
Root and the independent renderer reviewer approve all corrected visuals:
the history count, caveat and result are clear below Return. Original captures
are retained separately as evidence of the bounds-only check's limitation.
Feature `0b0da3a8a8d08c94a85edd3010096ff3514fd77d` is pushed and live.
[Pages run 34458283238](https://github.com/huntergdavis/the-grind-2/actions/runs/34458283238)
passes 3,378 tests across 225 files, with a 272.22s release suite and 5m27s
deployment (09:00:50–09:06:17 UTC). At 2026-09-10 02:07 PDT the actual public
version/cache 0.5.156, entry `index-DGcxoPgN.js`, CSS `index-DjMkgq3A.css`,
unchanged simulation worker and source maps for the committed projection,
Gazetteer view and renderer match the verified build. The public stylesheet
matches local build bytes and committed stylesheet source; narrator references
remain unchanged. Ignored `scratch/verify-road-memory-live.mjs` records the
procedure. Preview19880 is closed, and protected ledger work and parked drafts
remain untouched. No further implementation is required for this slice.

The next recommendation promotes V04.18a's tools/supplies remainder into one
smith-purchased disarming kit. Reuses `deja "dungeon tool"` session30's separate
canonical disarm contract and session01a06835-15f's dungeon-depth inventory.
Source review confirms one skill-plus-fixed-roll check and no tool producer/
consumer. A +2 consumable can reuse real disarm outcomes and existing Inventory/
Status presentation. Preserve public-fact decision-making, single attempt,
normal consequences and exact purchase/use receipts. The known rune-ward
fixture demonstrates an unassisted failure, not yet verified assisted utility
or uninterrupted natural acquisition: its location and hero HP are staged.
Queue one representative legal purchase
through use/reload, without another long seed sweep or general crafting system.
No kit code is part of v156.

## Gameplay-first council — readable mobile Codex dossiers (v0.5.155)

Reuses `deja "Codex mobile"` sessions03/06/09, BACKLOG item18, V04.16b's
portrait-dossier contract and V04.19c2's remaining 320px containment intent.
The v154 capture demonstrates that avoiding overflow is not enough: the
permanent portrait column leaves clues and source receipts in a cramped
adjacent article. Give that text the full available card width at the existing
760px breakpoint, with the same silhouette in a fixed 8.75rem header above it.
Keep desktop composition, font sizes, every fact and native disclosure intact.
No markup, script, save, engine, narrator, control or new panel changes.

Independent source review confirms all existing creature bodies, heads,
species-specific features, eyes and shadows fit the header. Use an actual
height, not only a minimum, so expanded evidence cannot stretch the portrait.
The existing genuine Copperhorn 85→89 browser journey will cover full-width
text, bounded art, reachable evidence, native focus/open-state preservation,
exact saved reload and desktop agreement within its unchanged 120s budget.
No new encounter fixture, broad matrix or long replay is required for this CSS
change; existing deployment CI remains the full regression gate.

Final independent CSS diff review is approved. Version, reducer-boundary,
TypeScript and production-build checks pass. The entry is `index-DtPvUvr7.js`
and stylesheet `index-CJXRzz2S.css`; simulation and both narrator workers retain
their v154 hashes. The strengthened existing natural Copperhorn journey passes
first-run in 66.7s (1.4m runner, unchanged 120s budget). It retains the actual
85→89 progression/source assertions and adds >250px full inner-card text width,
bounded 140px portrait, every heading/summary/source row scroll-reachable below
navigation, identical fonts, native collapsed/expanded controls, exact desktop
geometry after 1280→320→1280 resize, retained focus/open-state and exact saved
reload. Batching turn/save/view reads removes redundant browser round trips;
no natural transition or source assertion is dropped. Root and browser reviewer
inspected both actual 320px captures: the silhouette stays together above its name,
and expanded evidence uses the full text width. No browser errors, inference or
external requests; owned preview 19880 closed.

Feature `1f9c4eb975a18d44e4544c393e6bd6e762939bc8` is pushed and live.
[Pages run 34450778070](https://github.com/huntergdavis/the-grind-2/actions/runs/34450778070)
passes 3,372 tests across 224 files; the release suite takes 285.27s and the
deployment 5m53s (07:36:10–07:42:03 UTC). At 2026-09-10 00:42 PDT the actual
public version/cache 0.5.155, entry `index-DtPvUvr7.js`, stylesheet
`index-CJXRzz2S.css`, emitted compact-header rule and unchanged simulation
worker match the verified build. The stylesheet matches committed source and
the public entry source map matches unchanged main.ts. Narrator worker
references remain unchanged. Ignored `scratch/verify-mobile-codex-live.mjs`
records the verification procedure; protected ledger work and parked drafts
remain untouched. No further implementation is required for this slice.

The next gameplay recommendation reuses session28's companion/recovery
groundwork and V04.20k1's explicit deferred-allies boundary. Source inspection
confirms the emergency selector admits only the hero and item resolution
requires self-targeting; schema-1 tonic effects persist `target: self`.
Queue one hero-owned emergency tonic action for a critically wounded active
companion, preserving existing finisher/self-recovery priority. First establish
a natural surviving critical-HP companion witness; then version the target
contract and join exact actor/target, quantity, healing and presentation facts.
No fabricated HP, resurrection, new reward currency, narrator dependency or
protected ledger edits. This is queued as item19, not included in v155.

## Gameplay-first council — Copperhorn final-ember research (v0.5.154)

Reuses the prior Copperhorn proposal recalled from sessions03/06 and BACKLOG
item17. The first frozen-v153 sample (golden0–5, 400 turns each) found 16
Copperhorn combat identities, nine burning applications and one first burn,
but no final expiry. The lone golden2 sequence ended in a lethal reapplication
after the hero used a tonic; it was not a tracker failure. No implementation
was promoted from that negative sample.

A separately bounded golden6–37, maximum120 turns each, stopped at golden27
T89 after 2,609 turns. Tinker Aster Starling receives Bellmetal Charge at T86
(HP54→30, burning2, potency2), suffers its first tick at T87 (30→28, 2→1),
uses Springbolt to leave the foe at six HP, witnesses an actual enemy Guard at
T88, then suffers final expiry T89 (28→26, 1→0) before a basic-strike victory.
All actions came from uninterrupted createWorld/advanceWorld autoplay. The
lossless source archive is in ignored scratch/copperhorn-natural-witness-v153.json;
the separate negative report and causal trace are preserved. This is an
occurrence witness, not a claim of frequent or all-class completion.

The fixed research task keeps application, supporting first-tick and final
expiry receipts. The supporting receipt does not create a third progress step.
Require an uninterrupted source-linked status chain; unrelated/overwritten fire
or missing packets cannot complete it. Final damage may interrupt an attempted
action, so the clue must not promise survival or an executed move. ResearchV3
and depth25 preserve existing Inkcap/Moonhowl evidence and initialize Copperhorn
empty for old saves. Reuse Codex evidence disclosure; no new panel, reward,
combat policy, narrator or compact-ledger work.

The engine and UI implementations are frozen. Independent read-only save/engine
review found no blockers. All 29 fixed-research engine tests, 33 research/view
projection tests and 60 save-migration/depth-state tests pass; the fatal-final-
burn test also verifies that an intent is not falsely described as an executed
action. TypeScript, version, boundary and production-build checks pass.
The existing ten-seed, 1,000-turn replay's normalized v153 hashes are unchanged;
only the full-state snapshots change for researchV3/depth25. This uses the
existing replay loop, not an added duration matrix. The natural No-LLM browser
journey passes first-run in 117.4s (2.3m runner, unchanged 120s budget): real
T85→T89 saves match advanceWorld exactly, 0/1/1/1/2 progress, actual Guard and
winning strike, positive final HP loss, native disclosure/focus, 1280/320
captures and actual reload. Zero browser errors, inference or external requests;
both captures reviewed and owned preview19880 closed. The existing mobile Codex
column is narrow and scrolls vertically, but has no horizontal overflow.

The broader local simulation/canonical run finished with 52 passes, nine stale
depth-version assertion failures and two existing timeout failures: the
20,000-turn progression test took83.6s against60s, and the save/replay test
took22.7s against20s while other host workloads were active. All affected
legacy expectations were corrected; their targeted rerun passes11/11. The
ten golden full-state and normalized gameplay assertions pass. Do not increase
timeouts or claim the complete local suite passed; existing clean-run deployment
CI must resolve those two timing checks before marking this release delivered.

Delivery verification resolves that gate: feature
`415f6a5ad4bb32346a27d8cb752a571a5e770dcc` is pushed and live.
[Pages run 34447460510](https://github.com/huntergdavis/the-grind-2/actions/runs/34447460510)
passes all 3,372 release tests across 224 files in256.85s; the complete
deployment takes5m26s (06:55:46–07:01:12 UTC). The existing progression test
passes in9.203s and save/replay in1.322s, with their original limits unchanged.
At 2026-09-10 00:02 PDT the actual public version/cache0.5.154, entry
`index-C5XRIO2Q.js`, simulation worker `simulation.worker-DE6llA_g.js` and
unchanged stylesheet `index-C9e4LhCm.css` match the verified build bytes.
Public source maps match committed main/projection/research/state/simulation
sources in the browser bundle and research/state/simulation in the worker.
Narrator worker references stay unchanged; protected ledger work and parked
drafts remain untouched. Ignored `scratch/verify-copperhorn-live.mjs` records
the verification procedure. No further code or testing is required for v154.

Next-slice council reuses Codex mobile recalls from sessions03/09 and the
actual v154 capture: V04.16b's portrait dossiers and V04.19c2's 320px acceptance
support a compact full-width evidence layout. The current 5.25rem portrait
column leaves the adjacent text cramped even without horizontal overflow.
Retain the silhouette as a short header and preserve every disclosed fact,
native control and desktop composition. Queue this separately as item18;
do not silently change the frozen v154 CSS. Broader risk-aware routing is not
selected: existing actor policy already scores known traps, keys, useful
shrines, searches and disarming; claiming that as new would duplicate shipped
behavior. New routing mechanics need their own distinct design.

## Gameplay-first council — mobile Map toolbar clearance (v0.5.153)

Reuses session09's v152 browser finding and recorded BACKLOG item16: the
collapsed mobile Map card grew upward behind fixed navigation, despite the
new hint itself fitting horizontally. Existing header/toolbar measurements
already expose `--inspection-viewport-top`; the expanded Gazetteer uses it.
The fix stays in CSS, not a second measurement loop or renderer mutation.

Only the collapsed Map card at the existing 760px breakpoint receives a height
cap: 65% of the space below the actual toolbar and above its bottom margin.
The remaining band keeps the map visible. Independent council review flagged
implicit auto grid rows shrinking the overflow-hidden hero margin; explicit
max-content rows preserve its complete contents within one scroll container.
Expanded Gazetteer, sticky return control and desktop styling stay untouched.

Acceptance extends the existing natural No-LLM T4→T5 inspection journey rather
than adding another test case or duration matrix: actual vertical bounds,
scroll-reachable details/disclosure/return, native Gazetteer open/close and
keyboard focus, paused narrow/desktop round-trip resize, exact saved state and
reload. Keep the unchanged 120s journey budget, normal release checks and CI.

Independent final CSS review is clear. Version, canonical boundaries, production
build and the final TypeScript check pass. Only CSS changes in production;
simulation and both narrator workers retain their v152 hashes. The existing
browser journey passes first-run in 74.4s / 1.5m runner under its unchanged
120s budget. It verifies the 65% height cap/35% map band, every named target
inside the scrollport and below navigation, and the notice inside its own
hero card—not just horizontal fit. Native Gazetteer full-height/sticky Return,
closing focus and bounds, 320×480 clearance, exact paused 1280→320→1280
Map/navigation geometry, unchanged canonical save and actual reload all pass.
Root inspected all four captures: mobile route details now clear navigation,
the visible atlas band remains, and desktop/Inventory are unchanged. Zero
browser errors, inference or external requests; owned preview 19880 is closed.

Feature `5396ef07f8db298dc90bae4d3a1950acc017c6d7` is pushed and live.
[Pages run 34441754329](https://github.com/huntergdavis/the-grind-2/actions/runs/34441754329)
passes 3,355 tests across 222 files; the release suite takes 207.18s and the
deployment 4m25s (05:36:32–05:40:57 UTC). At 2026-09-09 22:41 PDT, the public
version/cache, entry `index-BFnQOE02.js`, stylesheet `index-C9e4LhCm.css` and
unchanged simulation worker pass byte comparisons against the verified build.
Stylesheet source equals the feature commit and the public main source map
matches committed main. No protected ledger or parked narrator/art work ships.

The next bounded gameplay recommendation promotes Copperhorn final-ember
research under existing V04.16e, rather than claiming this exact subtask was
already specified. Root confirmed only Inkcap/Moonhowl exist in the fixed
research state; Bellmetal Charge applies two-turn burning, and prepareTurn
records positive HP loss even on its 1→0 expiry before action resolution.
Reuses recalled sessions06/09 and the existing species-research backlog.
Require a natural encounter witness first: refreshes/early victory may prevent
expiry. Preserve existing research evidence, exact source/HP receipts and empty
migration for the new task. No LLM, reward, policy, new panel or ledger work is
included; the held zero-potency Familiar Opening draft stays unshipped.

## Gameplay-first council — truthful inspection status (v0.5.152)

Reuses the v151 Inventory screenshot finding recorded in BACKLOG.md item 15:
a paused, settled victory still claimed that battle continued off-screen.
The precise local history query had no result; the council recovered the same
queued finding from session03. Scope is the existing marginal hint, not a new
panel or a change to autonomous gameplay.

Read-only council review requires effective host pause state, immediate text
refresh on Pause/Resume, distinct tactical/Pattern Duel state, and current
recorded-command binding before naming a settled outcome. A battle backdrop
alone is not evidence of a running encounter or an old victory. Settled heroes
return to their ordinary inspection pose; existing paused CSS freezes animation.
Other significant scenes use neutral moment wording, and adjacent inspection
headings no longer claim an adventure is moving while paused.

Verification is a focused projection suite, one natural golden 1 T4→T5 browser
journey with exact saves/reload and 1280/320 captures, release build and normal
deployment CI. No expanded duration/storage/model matrix or raised timeout.

The 12 inspection regressions and 22 adjacent view/appearance checks pass.
Actual golden 1 autoplay supplies ongoing and settled tactical witnesses;
real duel reducers supply bounded projection fixtures, not a claim of a second
whole-campaign browser journey. Current command identity/turn and stale-source
branches are covered. Startup review finds no early onHold invocation before
the inspection hosts exist. Version, canonical boundaries and build pass;
simulation and narrator worker bundles and CSS retain their v151 hashes.

Root inspected all four 1280/320 Map/Inventory captures. New status text is
readable and stays within the viewport. The 320px Map capture also exposes
upper atlas details behind fixed navigation, so this is not a claim of a fully
clean Map layout; that distinct panel-height/toolbar-clearance fix is queued
as item 16 rather than hidden by the horizontal-overflow assertion.

The single built-game browser journey passes on its first run in 69.4s / 1.5m
runner under the unchanged 120s budget. Exact paused T4 save, same-turn native
Resume/Pause, actual automatic T5 victory, both Map/Inventory hosts, terminal
inspection pose, exact persisted reload and zero browser errors/inference/
external requests all pass. Owned preview port 19880 is closed. The untouched
collapsed mobile Map CSS lacks the toolbar-relative inset/overflow already
used for its expanded gazetteer; shorter status copy does not introduce that
existing layout defect. It remains the next distinct UI release.

The final TypeScript pass caught two negative test fixtures assigning explicit
undefined to an exact-optional command ID. Fixtures now delete a missing field
or supply an empty invalid ID. This test-only correction leaves production
and the verified browser build unchanged. Type checking and the 12-case rerun
both pass before committing (7.94s test runner).

Feature `06cc700d046b2d82749a3b0b34b647b44f7c7f37` is pushed and live.
[Pages run 34438293091](https://github.com/huntergdavis/the-grind-2/actions/runs/34438293091)
passes 3,355 tests in 222 files; the release suite takes 266.18s and deployment
5m25s (04:43:39–04:49:04 UTC). At 2026-09-09 21:49 PDT, public version/cache
0.5.152, entry `index-8qOZdAi9.js`, CSS `index-DeqLtJ6M.css` and simulation
worker `simulation.worker-ALgjj60V.js` pass byte comparisons against the local
build. Public entry maps exactly match committed main and inspection-projector
sources. Protected ledger work and parked narrator/art drafts remain untouched.

Next-slice council review confirms the collapsed mobile Map bottom anchor is
the separate overflow cause. Reuse session09's existing header-derived inset
and resize observer, bound only the collapsed panel and retain a visible map
band. Preserve the expanded Gazetteer layout and sticky return. Extend the
existing browser journey to assert vertical bounds, scroll reachability and
paused round-trip resize; horizontal fit alone was insufficient. No new panel,
measurement loop or renderer/gameplay change is needed.

## Gameplay-first council — efficient finishing strikes (v0.5.151)

The proposed Familiar Opening failed its promotion gate: committed-v150 golden
0/1/2, 1,000 ticks each, retained only Use-L1 weapons. This bounded sample is not
an all-class claim. Source arithmetic also shows the zero-potency art losing
to free piercing techniques and to trained physical techniques at the current
maximum enemy armor. A manufactured unlock or removed ability would hide those
problems. The incomplete draft is parked in ignored scratch; the shipped scope
is the finisher prerequisite, not a nominally wired but unproved weapon art.

Independent review approves the comparison after matched-rule priority and
before legacy score: only the actual hero's existing, guaranteed battle-ending
attack/ability alternatives compare MP, minimum overkill, then basic exact tie.
Canonical candidates have uniform keys within that rule, avoiding a mixed-key
sort cycle. Existing forecasts retain Guard and pre-action status arithmetic.
Other actor profiles, multiple foes, Shared Opening and recovery priorities are
unchanged. Review caught potentially misleading retained personality text;
the selected finisher now replaces it with the actual economic explanation.

Actual basic strikes must earn their existing receipts without altered mastery,
hidden rolls, added rewards or a new panel. The representative browser journey
must show exact save/reload and current weapon presentation at 1280/320. An L4
unlocking terminal strike correctly retains its pre-unlock L3 pose; any new
Familiar Form assertion must use a subsequent genuine strike. Existing golden
hashes will change intentionally with the new policy, but exact deterministic
JSON/replay checks stay.

Actual pacing uncovered an existing settlement defect at golden 2 T476: a
repeated path-derived combat ID had left the four-combat history but remained
in the weapon's source receipts from T142. Reviewed fix is idempotent settlement
after normal validation, preserving the exact first receipt and returning no
new credit. It does not rename route encounters or imply every physical revisit
is a distinct mastery source. Eleven focused finisher and two new settlement
regressions pass; the combined RPG/finisher run passes 40 tests. Unchanged enemy,
multi-foe, Guard/status and restoration behavior remains directly covered.

Corrected 1,000-tick samples now yield 5/9/10 actual basic finishes and 5/9/7
unique receipts across golden 0/1/2, with maximum Use levels 3/3/4. Golden 2
naturally earns its sixth Foxfire Wand receipt and Use L4 at T902. Duplicate
route credit stays suppressed. These samples still offer no useful window for
the original zero-potency art; no premature art promotion is included.

The frozen production journey passes in 40.9s / 59.8s runner under its unchanged
120s budget: natural golden 1 T4→T5, actual Guard, four-HP basic-strike victory,
zero MP cost, untouched abilities, one Roadworn Blade L1→L2 receipt, exact save
and reload, and native Inventory/Status. Root inspected all four 1280/320
Watch/Inventory captures; no overlap/overflow. Zero browser errors, inference
or external requests; preview closed. The first harness attempt expected an
L4-only form marker on an L2 receipt; corrected assertions use actual victory/
mastery truth without claiming a particular paused cue phase. No production
change was needed. Version, boundaries and production build pass.

The local existing 20,000-turn case takes 96.309s and exceeds its unchanged
60s budget. A matched profiled 5,000-turn baseline/current comparison measures
21.162s/23.326s (+10.2%, single uncontrolled pair) with bounded state and equal
hero-level/quest milestones, not an unbounded loop. Weapon-mastery validation
is only 2.71% inclusive in the current profile; do not justify speculative
validation rewrites from that timeout. Previous successful CI completed the
actual 20,000 turns in 9.477s. Keep the existing CI gate and budgets unchanged.
Whole-state goldens and the now-earlier finite mentor journey are intentionally
updated for changed policy; exact JSON/replay assertions remain in place.

Release complete: feature `4361f09` passed Pages run `34435682054` with 3,347
tests / 222 files, a 267.04s release suite and a 5m27s deployment. The actual
20,000-turn CI check passes in 9.610s versus prior 9.477s, without changing its
60s limit. Public v0.5.151/cache, entry `index-mvNb2Rq3.js`, simulation worker
`simulation.worker-ALgjj60V.js` and unchanged CSS `index-DeqLtJ6M.css` match local
bytes. All four Actor Policy/RPG source-map copies across entry and worker
match the exact committed files. Verified live at 2026-09-09 21:10 PDT.

## Gameplay-first council — readable dungeon captions (v0.5.150)

Reuses session 09's mobile-caption review. The pure helper depends only on
actual scene scale: compact 12/11 CSS-pixel targets, a rail ending at y30 above
the unchanged y32 room area, and established wide-screen metrics. Short or
extremely small scenes use a readable headline or no rail, not microscopic text.
The renderer updates fonts, positions and factual short copy during paused
resize, and its common world cleanup removes the binding and new attributes.

Independent review finds no source blocker. Compact variants preserve armed
versus spent traps, unverified passages, partial shrine restoration and the
distinction between gate opening/crossing. The existing landmark suppression
now includes all mechanism-rail owners. Exact results remain in Status and
Chronicle; measured width fallback selects short copy without shrinking fonts.
No canonical state, policy, narrator, ledger, CSS or public-room framing change.

Five new and 34 existing focused tests, version/boundaries, TypeScript and
production build pass. The simulation worker and CSS stay unchanged. The
existing actual search/entry/failed-disarm browser journey retains its 120s
budget and exact saves/actions; one-shot Pause requests reuse the previously
proved harness correction. Actual Pixi glyph bounds, desktop/mobile captures,
paused resize and reload remain the browser acceptance gate. The first browser
attempt found a one-pixel overlap of measured mobile text boxes despite nominal
line-height separation. The corrected compact rail uses y0→30 and centers the
actual measured glyph heights with a one-CSS-pixel gap; font sizes and room
bounds are unchanged. The five helper tests and corrected build pass. The same
browser assertions were rerun without a longer timeout. A later exact
resize-back assertion exposed an existing position-only observer gap: the
toolbar rectangles returned to their original desktop values, but the Watch
stage retained an intermediate top offset. The four paused snapshots in
`scratch/dungeon-caption-geometry-evidence.json` preserve the actual evidence.
The existing inspection observer now synchronizes toolbar geometry and then
Watch reservations, as startup already does. Independent review confirms no
new observer/timer, initialization problem or apparent feedback loop. Exact
caption/save/resize assertions are retained, not loosened. The observer-order
change alone was insufficient: Watch now also uses the existing inspection
strategy of header-derived toolbar position plus measured toolbar height,
instead of rereading a possibly stale position in the callback. Final source
review finds no blocker. The fresh paused diagnostic now passes exact equality
of initial/returned desktop rectangles, chrome properties, all stage metrics
and saved tick: stage y132 / height495 / scale2.75. The strict full journey now
passes in 58.1s under its unchanged 120s budget: three exact canonical actions,
12/11 CSS-pixel minimums, actual glyph containment/separation, exact resize-back,
genuine reload and native Chronicle consequence. Root reviewed all four final
1280/320 search/disarm captures; no hero/room overlap or horizontal overflow.
Zero browser errors, inference or external requests. Release review is clear;
the owned preview is closed. Feature `41c8c5a` passed Pages run `34431709911`
with 3,334 release tests / 221 files and a 5m38s deployment. Public v0.5.150/cache,
entry `index-_ONuBqXR.js`, unchanged simulation worker
`simulation.worker-CFEvwV8L.js` and unchanged CSS `index-DeqLtJ6M.css` match local
production bytes. The public source map matches the exact committed caption
layout, renderer and main modules. Verified live on hunterdavis.com at
2026-09-09 20:10 PDT.

Next gameplay recommendation: promote V04.20l2b Familiar Opening into one
receipt-earned, 2-MP, once-per-combat piercing weapon art against existing Guard,
without extra potency or a passive multiplier. Use the real Use-L4 unlock and
current weapon identity, preserve restoration/cheaper-finish precedence, and
require a useful minimum-damage improvement plus real guard→art pacing evidence.
New bounded combat-local provenance must migrate old active combats inert;
protected compact-ledger work remains separate.

The council's first recommendation incorrectly inferred enemy behavior from
the standalone `chooseCombatAction`. Root checked the actual `advanceWorld` →
Campaign Director → Actor Policy path. The active enemy enters `direCombat`
at HP≤⅓ and can already choose `dire.guard`; no new enemy-Guard rule is needed.
The reviewer corrected the recommendation after tracing that live path. These
are next-slice design choices, not gameplay changes in this UI release.

## Gameplay-first council — Moonhowl field research (v0.5.149)

Implements the previously queued two-observation Wolf study, not a generic
research engine. The source is an actual surviving-hero Moonhowl application;
the consequence joins its still-live weakened status tick, hero strike intent
and later real enemy damage. Three retained event identities separate zero
status HP loss from the foe's actual hit. Latest-source identity prevents
overwriting or reassigning credit. Guard, restoration, expiry, unavailable
history, pre-action death and fatal applications do not satisfy the strike.

The Codex reuses its existing card, progress and native evidence disclosure.
Both studies retain independent disclosure/focus state. The public study title
does not grant a learned technique or reveal private ability mechanics; two old
whole-card name checks now distinguish that title while retaining redaction of
the unavailable learned-technique view. No new panel, CSS, power, reward, actor
policy, combat mechanic, narrator or compact-ledger dependency is added.

Depth23→24 preserves validated V1 Inkcap proof exactly and creates empty
Moonhowl in a fixed V2 wrapper. Both tasks validate before use; invalid/future
old evidence is rejected. Independent review finds no blocker. All 120 focused
research/UI/migration/state checks pass, as do version/boundaries, TypeScript
and the corrected production build. Ten existing 1,000-turn snapshots retain
their exact released gameplay/Inkcap hashes after the research-only projection;
canonical resume and empty legacy Moonhowl migration pass. Nine journeys reach
2/2. The audited new raw hashes and released-normalized mentor hash are pinned
without increasing any test budget. Moonhowl's actual browser journey passes in
63.6s under the unchanged 120s bound. It proves 0/1/2 progress, source-linked
hero/foe HP outcomes, only ordinary Strike XP and an exact persisted reload.
Root reviewed 1280/320 captures: wrapped evidence, native 44px disclosure,
no horizontal overflow or browser/model/external errors. Initial harness-only
failures were signed-zero JSON transport and repeated clicks cancelling a
pending Pause; exact state assertions remain, with one-shot Pause requests.
The expanded mobile card remains narrow beside its portrait: later layout
polish, not a new always-on panel. Inkcap's representative regression passes in
59.4s, preserving the actual poison 5→3/tonic recovery to 14 and no research
reward. Root reviewed its two captures too; all four are retained separately.
The owned preview is closed. Feature `94a820d` passed Pages run `34427735125`
with 3,329 release tests / 220 files and a 5m8s deployment. Public v0.5.149/cache,
entry `index-CUEfkbpq.js`, simulation worker `simulation.worker-CFEvwV8L.js` and
unchanged CSS match local production bytes. Eight relevant source-map copies
match the exact committed modules; the Moonhowl title and no-health-drain clue
are present. Verified live on hunterdavis.com at 2026-09-09 19:06 PDT.

Next recommendation: V04.18a mobile dungeon caption readability. Root verified
the current 7/4.5-design-pixel mechanism and hazard text in `game-renderer.ts`;
the existing framing enlarged the rooms, not those captions. Use one responsive
layout inside the reserved rail, retaining concise labels and exact Status
consequences, and reuse the actual search→disarm browser journey at 320/1280.
The read-only council reused `deja "mastery sidegrade settlement"` (session 06)
and checked the current backlog: Familiar Opening still needs pacing/action/
policy/balance decisions; settlement chains need a new front-state contract.
Those larger mechanics remain queued, rather than pretending another research
clone or a UI-only marker completes them. No implementation of the next slice
is included here.

## Gameplay-first council — discovered-room framing (v0.5.148)

Reuses session 09's v147 capture review. The new pure helper accepts public
coordinates only, fits every known room with bounded enlargement and feeds one
shared renderer transform. Hidden geometry, trap contents and full maze size
cannot influence framing. Search does not shift the camera when knowledge of
room coordinates is unchanged. No canonical, ledger or narrator change.

The hero grows with early rooms; trap outcomes use the existing fixed top strip
instead of a floating prose box over known routes. Exact outcomes remain in the
existing record. New framing/hero/alert attributes reset outside the scene.
Independent review finds no blocking leak, clipping, stale cue or false hazard
claim. Search/shrine/trap landmark-label competition is resolved. Remaining
nonblocking notes: fixed halo minima slightly exceed the room-framing rectangle
at 24 rows but remain inside the stage background and below the receipt strip;
existing landmark/key-gate overlap and small canvas captions need later polish.

Thirty-four focused framing/layout/search/visibility tests, version/boundaries,
TypeScript and production build pass. The first actual search/entry/failed-disarm
browser journey passes in 51.8 seconds under its unchanged 120-second budget.
Search framing remains unchanged, entry expands only known bounds, and an actual
reload preserves the exact camera and save. The source-bound consequence remains
readable in native Status; outcome/history/resize actions never change saved
bytes. Four 1280/320 search/disarm captures were independently and root-reviewed:
larger centered hero/rooms, separate rail, no interior prose box or overflow.
Zero browser errors, inference or external requests; owned preview closed.
Feature `019d20f` passed Pages run `34424913338`: 3,311 release tests / 218
files, deployed in 5m4s. Public v0.5.148/cache, entry `index-DX3JuEYu.js`,
unchanged simulation worker `simulation.worker-DVTUICeY.js` and CSS match the
built bytes. Both framing/renderer source-map modules match the commit exactly.
The slice is verified live on hunterdavis.com.

Next bounded gameplay recommendation: V04.16e2 Lantern Wolf/Moonhowl research.
The existing ability applies weakened; the later hero's status-tick/strike
packet provides a distinct observable consequence. Reuse the actual
status-to-strike joining pattern already exercised by Millstone Drag, including
source ownership and overwrite/expiry rejection. Teach raw strike-power loss,
not a guaranteed final HP-damage comparison. Keep existing Inkcap progress,
bounded evidence and the Codex disclosure; no new combat event, power grant,
ledger dependency or general framework. Root inspected the current Moonhowl
definition and combat damage input before queuing the proposal.

## Gameplay-first council — cautious dungeon searching (v0.5.147)

Implements the previously recommended V04.18a active-search subset: public
frontier/health admission, one stationary turn, +2 using the existing fixed
detection roll, once per room. Zero-HP recovery, current disarming, gate unlock,
immediately sighted keys and unspent adjacent shrines keep priority. Search
success is discovery, not disarming or guaranteed safety. Failure receipts reveal
no hidden checks and match trap-free public geometry.

Depth schema 23 migrates empty bounded search history; one latest source receipt
retains only public exits and successful discoveries. Historical proof survives
the existing far-stair trap-to-shrine migration. The renderer uses the existing
Watch dungeon-map stage, compact mechanism rail and traversal status, not a new
panel or the top-level atlas tab. Exact latest-command/scene binding prevents
stale search cues. The narrator and protected compact-ledger edits are unchanged.

Sixty-seven focused engine/policy/projection/existing core checks pass. Independent review finds
no hidden-knowledge admission or extra reward. A natural seed-8 browser fixture
has baseline detection 10 vs 11; search reaches 12. Its later disarm naturally
fails and costs four HP, explicitly proving search is not disarm success.
Production build, version, boundaries and TypeScript pass. The first browser
journey passes in 37.6 seconds with all three actions, retained evidence,
unchanged paused saves, two reviewed captures and zero errors/external/model
requests. The existing small-screen canvas-label scaling is a nonblocking
readability follow-up; no new panel was added.

All ten replay prefixes match v146 until their first actual search command.
The 10,000-turn audit observes 201 searches and 28 discoveries; exact canonical
save resumes pass. Golden updates reflect these inspected decisions. The mentor
arc still completes within its unchanged 12,000-step budget (T9229/visit 22),
retains all no-power checks and does not repeat. One old spent-shrine expectation
was updated to assert the new finite search followed by its original treasure
choice; unspent shrine/key priorities remain intact. The first Pages run
`34423085703` stopped before deployment on two older immediate-movement test
assumptions (3,302 other release tests passed). Updated successor allowlists
retain all completion/migration checks; the full 57-test depth-state suite passes.
Independent review confirms the recovery failure was the inserted search turn:
its corrected test proves unchanged HP/MP/XP/position, one spent turn and exact
JSON replay, then retains the original defeat/forced-wait/recovery checks. The
test-only correction is `4388b59`; no release gate was removed or widened.

The broader local simulation rerun passed 57 tests, skipped only the previously
audited mentor arc, and timed out on the existing 20,000-step progression test
(82.7s against its unchanged 60s limit). That same progression test passed the
first CI run in 8.692s. No retry, timeout increase or production change was made;
the targeted corrected recovery test passed independently and in the broader run.

The corrected Pages run `34423707167` passed all 3,304 release tests / 217 files
and deployed in 5m8s; its unchanged long progression check passed in 7.763s.
Public v0.5.147, service-worker cache, CSS and search presentation are verified.
All 13 checked entry/worker source-map copies match `4388b59` exactly; assets
are `index-CGMQT3gp.js` and `simulation.worker-DVTUICeY.js`. Feature `258d1fa`
and its test correction are live on hunterdavis.com.

Next-slice presentation review inspected both actual search captures. The hero
and two revealed rooms occupy a small portion of a mostly empty full-maze frame.
Recommend V04.18a discovered-room framing: a small pure renderer helper derives
bounded zoom/offset from public discovered coordinates only; the existing renderer
uses that transform consistently for rooms, routes, hero and hazard glyphs.
Acceptance: larger readable action at 320/1280, all discovered routes visible,
hidden-room changes cannot alter framing, static/reloaded output stays stable,
and saves remain untouched. No new panel. A text fallback is cheaper but leaves
the miniature action unchanged; framing itself does not solve canvas caption size.

## Gameplay-first council — Inkcap Mimic field research (v0.5.146)

Reuses the prior council's V04.16e1 dependency review: one source-grounded task,
not a generic research engine. An actual False Treasure application and its later
positive pre-action poison damage are distinct observations. The second receipt
must retain the actual source and reject intervening overwrite or unrelated
poison. Completed minimal evidence persists after combat history rolls off.

Depth schema 22 adds a bounded record, with empty migration from schema 21 and
older. The existing Codex card carries the progress and factual clue; no power,
ability admission, actor-policy or narrator change. Protected compact-ledger
edits remain outside this slice. Review checks source attribution, save behavior,
no-power replay equivalence and a short visible browser journey. Fifty-one
focused checks, version/boundaries, TypeScript and the production build pass.
The first browser run passes in 104.7 seconds under the existing 120-second
budget: actual source-bound poison HP 5→3 is distinct from later tonic HP 14,
with no power/ability grants or research XP, unchanged paused saves, native
disclosure continuity and 1280/320px layouts. Both captures were inspected;
zero errors, inference or external requests. Independent v145/current replay
matches all 10,010 states after removing only research and its schema increment;
all ten canonical JSON saves resume and legacy saves migrate empty. The mentor
arc retains its exact released normalized hash and T6147/visit 22 completion.
No combat, rewards or decision policy changed. Feature commit `6fde045` passed
Pages run `34418600240` (3,282 release tests / 214 files, 5m8s). Public manifest,
service-worker version, research markup/CSS and eight entry/worker source-map
copies match the commit. v0.5.146 is verified live on hunterdavis.com.

Next-slice council recommendation: the explicitly queued V04.18a active-search
subset, using a once-per-room stationary command, existing deterministic trap
detection and Map knowledge. Search admission must not inspect hidden trap
existence, and old saves must not gain searched-room history. Settle its bounded
advantage/cost before implementation; keep disarming, recovery and key priorities.
The lower-risk alternate is one further source-grounded species study. Familiar
Opening remains gated on its pacing and non-dominant response contract. Mobile
Codex portrait width is a nonblocking presentation follow-up, not a Watch panel.

## Gameplay-first council — town-visit Chronicle Plates (v0.5.145)

Implements the previously recommended V04.16i1a subset using the validated
event-time town itinerary, after the canonical save succeeds and independently
of cutaway selection. Retain only source identity/tick, town and up to three
recorded landmarks, plus the exact visit/reputation outcome. The small static
illustration is an explicitly labeled reconstruction in a collapsed Adventure
disclosure, not a new Watch panel or a claim about historical actors or weather.

Review focuses on honest retention: immutable snapshots, campaign/source checks,
48-entry and 128-KiB bounds, save/load, dedupe, readable storage-failure status,
stable reading while new pages arrive and matching native text at 320px. No
simulation, narrator or protected compact-ledger changes are required. The full
multi-event Chronicle Plates travelogue remains deferred. Thirty new focused
recipe/archive/view tests and nine existing town-itinerary tests pass. Version,
boundaries, TypeScript and the production build pass. Read-only review confirms
the post-save capture ordering and view-only behavior. Browser and deployment
verification are complete, with details below.

Initial browser attempts exhausted their 120-second total budget. The test now
batches repeated static DOM reads and omits a duplicate second-hero visit while
retaining real hero-switch isolation checks; the time limit is unchanged. The
batched run passed all feature assertions in 112 seconds with zero browser,
inference or external-request errors, then its final whole-save comparison
caught ordinary catch-up bookkeeping after switching heroes. Reapply the
fixture's existing future checkpoint before returning to the original hero;
do not change the game or ignore the metadata. Fully framed 320px and desktop
cards were visually reviewed and are clear. The corrected same-build journey
passes every assertion in 98 seconds within the unchanged 120-second limit,
including exact reload dedupe, hero filtering and whole paused-save equality.
Diagnostics report zero browser errors, inference or external requests. Final
release review is clear; the owned preview is closed. Commit `e9b8837` passed
Pages run `34414452477` in 5m5s, including all 3,266 release tests. Public
v0.5.145, service worker, markup, exact CSS and committed source maps for the
three plate modules and `main.ts` are verified. Simulation worker is unchanged.

Next-slice read-only review recommends V04.16e1: one Inkcap Mimic research task.
Actual False Treasure poison application and attributable pre-action poison
damage are distinct evidence; aggregate MonsterLore encounters are not. A new
bounded canonical record must retain source IDs and HP arithmetic after combat
history rolls off, starting empty on old-save migration. Source overwrite or
missing evidence cannot qualify. Completion reveals the factual poison-timing
clue, with no power reward or narrator change. Other research systems remain
deferred. Reuses the `deja` field-research dependency audit and session
`01a06835-15f`; no research mechanic is included in v0.5.145.

## Gameplay-first council — Millrace Reversal (v0.5.144)

Reuses the V04.9b6a proposal recovered from Codex session 09: one
earned cooperation payoff for the shipped Miller kit. The exact weakened target
must complete a damaging action before the hero can spend one battle-local
Shared Opening on one piercing weapon strike. Emergency restoration wins;
another hero action or an invalid participant expires the opening.

The implementation uses runtime V2, an explicit joint action and exact
earn/spend/expiry receipts. Source ownership is lost when another Weaken replaces
the Miller's effect. The equipped hero gets one weapon-use credit with existing
piercing armor arithmetic, no extra hit or ability/companion XP. A separate
three-rule opening profile places restoration first and keeps the older combat
profiles unchanged. Forecasts retain Guard and never inspect future RNG.

Independent dependency review confirmed live persistence saves full world/combat
snapshots; the standalone compact ledger has no production consumer. The existing
Counter Duel ledger edits remain untouched, and compact-ledger encoding/emission
is explicitly deferred. No second profession, species/catalog change, general
combo framework or narrator change is included.

Review caught a migration-order issue: V1 combat must be validated before its
runtime is upgraded, or new spent receipts relabeled as V1 could bypass the
version gate. The fixed loader accepts genuine V1 cooldowns with an empty new
opening and rejects relabeled new history. A focused regression proves both.
The bounded history pruner now advances its actual retained floor; a sixty-turn
fixture demonstrates the old marker error without increasing 12/96 event limits.

Twenty-two backend/existing Roadcraft tests, six new core tests, twenty-two older
actor/Guard tests and thirty-three rendering checks pass. TypeScript, boundaries
and the production build pass. The ten existing campaign hashes and full mentor
acceptance remain unchanged. First-divergence comparison with released v0.5.143
found only transient Miller runtime changes in seeds 1/3/4 at T16/T205/T73; the
other seven campaigns were identical through 1,000 turns. One built-game browser
journey proves the automatic earn→reload→spend chain, exact receipts, native
fallback and next-turn teardown in four responsive layouts, with no inference,
external requests or page errors. Visual review found a backward low-mastery
sword pose; the corrected positive impact pose passes all thirty-three rendering
checks, the build and the same 1.4-minute browser journey. Final desktop/mobile
captures are clear. Final council integration review found no release blocker.
Commit `b1a2de8` passed Pages run `34410185789` in 4m58s, with all 3,236
release tests passing. Public v0.5.144, service worker and all 17 bundled source
copies across ten feature modules match the released commit.

### Next-slice recommendation — town-visit Chronicle Plates

Read-only dependency review reuses `deja "Chronicle Plates"`, session
`01a06835-15f`, and the earlier warning about missing event-time visual facts.
The existing validated `TownItineraryPacketV1` supplies exact campaign/event/tick,
town, district, building and visit/reputation outcomes after a saved transition.
A landmark-only illustrated reconstruction in Adventure can retain those facts
without narrator or compact-ledger changes. Cap the archive at 48 recipes and an
explicit byte budget; require dedupe, reload retention, campaign separation and
honest storage-failure behavior. Do not claim personal meetings or reconstruct
old gear, weather or poses from current state. Balanced multi-event curation,
automatic reviews, catch-up and ledger rebuilding remain outside this first
V04.16i1a subset. This is queued work, not a delivered feature.

## Gameplay-first council — Read the Guard (v0.5.143)

Reuses the V04.2b public-state tactics recommendation recovered from Codex session
09. A baseline regression independently showed the actor calling a guarded
nine-HP foe a safe finisher: the old estimate was nine, while the actual damage
range was four to six. That incorrectly outranked an available emergency tonic.

The forecast and resolver now share the existing damage arithmetic, including
Guard, Weakening, piercing and ability level. Forecasts use public variance
bounds, not the future seeded roll. Exact old damage objects across all five
variances are retained. Final status damage still happens before an action;
Weakening at duration one expires, but the target's Guard stays until its owner
acts. A dead actor cannot provide a guaranteed finishing strike.

Final code review is clear. Finishing priority uses the minimum resolved damage;
the visible range alone is clamped to remaining HP. Guard-aware explanation and
considered strikes use the existing Status/Chronicle records. No profile, legal
command, damage balance, save schema, ledger event or Watch panel changes.

Twelve arithmetic checks, nine targeted policy/status cases and thirteen existing
actor-policy cases pass. The representative fixture includes a genuine enemy
Guard resolver event, with an explicit legacy-unrated binding for its isolated
combat. It passes unchanged save validation; no forged visual flags or weakened
validator is used. The 1.7-minute real browser transition and desktop/phone
captures pass without a new panel or visual blocker. All ten seeded campaign
goldens pass after first-divergence comparison with the committed v0.5.142 actor
policy; only the nine explained expectations change. No budget changes. Detailed
transition and release evidence is recorded in the backlog. The existing mentor
acceptance completes earlier at T6147/visit 22 and passes its full no-power,
no-repeat and reload contract after one audited terminal-hash update. No limits
or assertions were removed to accommodate the new combat ordering.

Release review found one stale ability-resonance fixture after 3,211 release
tests passed: a one-HP foe now appropriately attracts a basic finisher instead
of a level-19 spell. An independent old/current-policy comparison confirms the
cause. Correct only the terminal fixture to an HP window requiring an ability,
with explicit public damage bounds and a real selected-ability assertion. Keep
the canonical victory/reward and level-up checks, and leave the production
resonance projector unchanged.

The fifteen focused resonance tests pass after that fixture-only repair. All
3,212 release tests and Pages deployment pass in run `34404262699` for `6a7ce1e`.
Public v0.5.143, its service worker and both bundled copies of all three changed
combat modules match the pushed commit. Read the Guard is delivered; protected
ledger work and paused narrator experiments remain excluded.

## Gameplay-first council — paid inn rest (v0.5.142)

Promotes the one-stop inn-service proposal recovered from Codex session 06.
The town must be known and visited, the inn must mutually belong to a recorded
district, and the selected building ID is stable. Fit solo heroes with depleted
mana and five gold may rest; routes, encounters, active oaths, unfinished dungeons,
quest closure and pending rewards cannot be interrupted. Tonic restocking stays
first. Full mana removes eligibility, so this is not a recurring spending loop.

Final code review is clear: actor choice, deduction, zero XP and the scene receipt
use the same pre-rest selector. The current Chronicle decision binds the rendered
inn after eligibility disappears. The selected building is included even beyond
the normal eighteen-building display limit. The window, bed sign, resting hero
and five coins reuse code-native drawing and the existing reduced-motion pose.
Scene/Map transitions clear the markers, and source town arrays are unchanged.

Nine focused depth tests and four real world/actor/visual-projection/replay checks
pass. No save schema, ledger format, model call or new panel is introduced. The
ten-seed audit found one intended new inn stop, at seed 7/T73: five gold spent,
full HP/MP restored, no XP/item/quest gain. Only that audited golden expectation
changes. Browser and deployment evidence are recorded in the backlog entry.

## Gameplay-first council — Journal Company (v0.5.141)

The compact Company section consolidates the existing companion and mentor
records inside Journal rather than adding another top-level panel. Watch keeps
its existing portraits and vitals. The inspected companion uses the same public
identity projection; health and bond have both textual values and native meters.
Exact journey facts remain readable behind native disclosures. No relationship
graph or inferred emotion is claimed, and browsing never changes the campaign.

Independent review found one accessibility regression: rebuilding the active
record could discard keyboard focus from its disclosure. Preserve the open and
focused state only for the same companion, without scrolling or moving focus
from other controls. The follow-up browser journey exercises an actual automatic
step separately from paused save-immutability checks. Former/mentor disclosures
are outside the replaced children and retain their own state. Existing browser
checks are updated to navigate Company before inspecting those records.

Fifty-nine focused checks and version/boundary/production-build checks pass.
Final read-only review is clear. Browser evidence includes the two-minute Company
journey with one real focus-preserving update, plus the existing mentor journey.
Visual review caught a shared health gradient overriding bond's accent color;
explicit green fill rules and wider desktop cards fix it. The final captures
and supported style checks agree. A Chromium pseudo-element introspection failure
was corrected in the test, not hidden by changing the requirement. One older
Shared Road script still assumes pre-streamlining Watch panels; that independent
test-maintenance debt is recorded in the backlog, not counted as passing.

## Gameplay-first council — recurring shared-road companions (v0.5.140)

Approved after code review: one shared predicate now gates both candidate
selection and reducer execution. A first oath keeps its existing path. Later
oaths require 12 completed input-state depth ticks since the latest departure
and a different town. The recruitment command's own tick cannot bypass the
interval. Active or full rosters are rejected; the existing selector still
owns discovered/visited places, reachable destinations, distinct residents,
deterministic identity and combat-kit admission.

The change retains one active oath, at most 12 former companions, and the
existing quest/recovery/encounter priorities. Former records are not rewritten;
no model, relationship graph, inferred emotion, save schema or ledger format
is added. Existing validation rejects future departure facts. New tests cover
the old two-gate failure, 11/12 boundary, same-town rejection, latest farewell,
distinct second identity, JSON resume, quest priority and a real world/Chronicle
recruitment transition. All 38 focused companion/quest/forward-motion tests pass.

This deliberately changes future autonomous choices after the first journey.
Same-build replay and resume are preserved; identical long-horizon outcomes
across different released rule versions are not claimed. Browser and release
evidence are recorded in the backlog entry.

CI exposed a real mentor pacing regression in addition to intended golden
changes. Recurring recruitment could displace the town visits that advance
an unfinished mentor story. One pending safe visit now precedes a later oath;
the existing consecutive-visit guard prevents it monopolizing the town.
The original 12,000-step acceptance budget and full three-phase assertions
remain. The repaired arc completes at T9946/visit 23 with no imported power,
no repeated farewell and exact JSON resume; all 12 focused checks pass.
Four no-mentor golden seeds were independently audited at their actual later
recruitment transitions before expected hashes changed. No test was weakened.

## Gameplay-first council — known-place gazetteer (v0.5.139)

The user explicitly reopened gameplay/UI depth and paused narrator changes.
The first slice promotes the gazetteer subset of V04.16d1, not a new world
simulation or the full town/relationship backlog.

The Map entry is collapsed until requested; opening it uses the available
inspection area beneath navigation and hides the Map puppet. Watch and its
eight top-level views remain unchanged. Selectors and expandable districts are
native controls. The selected place is viewer-only, retained across ordinary
updates and tab changes, and cleared for a different campaign.

Only discovered places and recorded, visited town snapshots are projected.
Residents are explicitly a settlement roster, not people personally met or
currently sighted; building types do not promise a usable service. Mutual
district/building/resident IDs are checked, source data is never changed, and
all user-facing names use textContent. Independent code review finds no blocker.
The 34 focused gazetteer/map checks, version/boundary checks and production
build pass. Browser evidence is recorded with the release backlog entry.

Next mechanics recommendation: existing autoplay admits only the first oath,
although the bounded roster supports later distinct residents. Promote recurring
recruitment with a 12-depth-tick solo interval and a different town after
farewell; preserve quest-route priority and the one-active/12-former limits.
Journal Company is a separate follow-up. A real paid inn service is another
small gameplay candidate; settlement wars and Chronicle Plates need larger
foundations and are not claimed by these slices.

## Post-V1 council — first-victory emotional grounding (v0.5.138)

Final read-only review passes source binding, both-name admission even in Inner
life, pre-await capture, alternate-scene isolation and separate recovery gates.
Quiet allows milestone model narration without enabling authored fallback.
Scene/No LLM, existing cadence, model, memory and token budgets remain unchanged.
The injured brief explicitly forbids a **new** injury rather than suppressing
mention of the recorded one. Reuses the canonical first-victory projector and
the existing farewell delivery/async isolation patterns.

All 607 focused tests, version/boundary checks and the production build pass.
One 1.2-minute built-game browser journey confirms the real first-win transition,
Quiet/Inner life prompt, exact archive/replay, readable 320px scroll and zero
external requests/browser errors. One worker/load and at most two supplied
writes are used; replay adds no inference. The test's initial authored-only
source-label expectation was corrected to the existing model record contract.
No production behavior was changed to satisfy that assertion.

The first Pages run exposed three legacy assertions across two further suites
that required first-victory and ordinary prompts to remain identical. Those
expectations are updated for the intended brief/both-name change; model origin,
non-duet output, public facts and identical staging remain asserted. All 86
checks across those suites and moment selection pass, bringing focused coverage
to 607. The correction changes tests and evidence only, not production behavior.

One cached actual-game v0.5.137 sample is readable but emotionally weak:
unexplained despair despite road progress, with little recorded-value specificity.
The 31 app/network checks pass; the final source check fails because v0.5.138
source was edited concurrently. The frozen served bundle remained v0.5.137,
all owned resources closed, and the receipt remains incomplete. Do not call it
new-victory prose qualification or rerun it merely to obtain a passing label.
[Evidence and limits](docs/STORYTELLING_FINISH.md#post-v1--first-victory-emotional-grounding).

## Post-V1 council — wholly recycled sentence rejection (v0.5.137)

The council supports the narrow **all sentences already known** rule, not
rejection whenever any sentence repeats. New wording can develop a recalled
feeling; mixed old/new prose remains eligible in either order. Keep exact
comparison normalization, speaker labels, candidate-history isolation and
existing recovery/cancellation. No fuzzy score, automatic retry or text rewrite.

Reuses recall session `01a06835-15f`, v0.5.129, and retained actual copied
paragraphs in `b53340ac` / `035b4240`. Reordered/subset/collage cases are synthetic
regressions rather than new measured literary failures. Four controller cases
fail against the old guard. The current probe now shares production admission;
its historical exact-repeat flag and saved receipts retain their old meaning.
All 380 focused production tests and 44 focused probe checks pass. Version,
boundary and production-build checks pass; the creative worker is unchanged.
The existing browser recovery scenario passes in 1.2 minutes with one loaded
worker/two supplied writes. Wholly recycled prose is neither shown nor archived;
the mixed callback arrives unchanged and remains readable at 320px. This is
mocked integration evidence, not a new literary qualification.
Final independent read-only review passes with no blocker in exact admission,
callback allowance, captured candidate histories, cancellation or recovery.
[Evidence and limits](docs/STORYTELLING_FINISH.md#post-v1--wholly-recycled-sentence-rejection).

## Post-V1 council — natural-name relationship recall (v0.5.136)

Independent read-only inspection confirmed that admitted given-name prose could
lose companion-memory relevance to unrelated same-location prose. Reuse the
existing admission matcher rather than introducing a second alias policy. Query
only the companion role, but retain the complete pair for surname/overlap and
shared-name disambiguation. Exact excerpts, latest-plus-relevant selection and
two-memory limits remain unchanged for both active and departed companions.

Reuses `39d99ca`, `31f147d` and the existing character-anchor tests; local recall
found no additional indexed match. The reproduced old behavior fails four focused
regressions. This is not a stronger-model promotion, literary qualification,
new panel, archive schema or broader V1 reopening.
Final code review finds no blocker. All 268 focused tests, version/boundary
checks, release build and one 44.2s browser case pass. The browser uses one
supplied reply and proves alias-aware recall, exact archive preservation and
readable mobile presentation, not real-model prose quality. No new test matrix.
[Release evidence](docs/STORYTELLING_FINISH.md#post-v1--natural-name-relationship-recall).

## Post-V1 council — recorded farewells without oath history (v0.5.135)

Reuses `39d99ca`, recall session `01a06835-15f`, the canonical departure projector
and existing farewell intermission. Narration now receives a separately bound
current-departure context; an old oath is required only for the existing optional
authored remembrance. Healthy and injured conditions stay explicit rather than
inferred from imagined prior prose. Existing archive/moment metadata is reused,
without a save migration or another panel.

Acceptance covers exact canonical source/health wording, pre-await capture,
alternate-scene isolation, quiet recovery, source mismatch rejection, and both
healthy/no-oath and prior wounded browser flows. Mocked replies and intentionally
omitted history prove integration, not literary improvement or a long-duration
simulation. [Evidence and limits](docs/STORYTELLING_FINISH.md#post-v1--recorded-farewells-without-oath-history).

Independent read-only review finds no release blocker. Both browser scenarios
and the release build pass; desktop/mobile captures remain uncluttered. One
invalid positive-health active-wounded test fixture was removed after checking
the existing invariant: active companions use `none` above zero health and
`fallen` at zero. The real healthy and fallen-but-alive departure cases remain;
no production invariant or admission rule was relaxed.

## Post-V1 council — live farewell identity and continuity (v0.5.134)

Reuses `489afa3`, the canonical farewell projector and the earlier rejected
farewell subject/context trials. Independent identity/continuity implementation
and end-to-end review find no blocker: source-bound names, captured pre-await
memory, alternate-scene isolation, bounded excerpts, quiet recovery and settled
name-check failures remain consistent. Only departing identity enters the new
model context; historical oath provenance stays host-side. The two-memory
policy is not the rejected arrival-only experiment. **369 focused tests pass.**

Browser fixtures check real simulation → farewell offer → remembered prompt →
scroll → archive/replay, with inference supplied by a test double. This is wiring
and visual evidence, not a new real-model quality measurement. Scope remains
wounded-but-alive departures with a retained matching oath. Keep the current
model and existing departure staging; no new matrix or promotion.
[Release evidence and limitations](docs/STORYTELLING_FINISH.md#post-v1--live-farewell-identity-and-continuity).

## Post-V1 council — connected execution succeeds, narrative qualification does not

Reuses `8baf543`/`d4bfd7e`, the original `85f1c932` connected flow and the actual
`66028840` stopping-policy proof. Local recall found no additional matching
connected-budget session. Independent prompt/memory and runtime reviewers pass
the new explicit mode, numbered per-scene evidence and unchanged old modes.
One review gap—submitted memory strings not directly bound to verified earlier
prose—was fixed and regression-tested before the GPU trial. All 160 focused
checks pass; seven affected checks pass again after that correction.

Actual `7d4f2532` finishes all three scenes with current-run 0/1/2 memories and
successful per-write settlement. The first two results finish naturally; the
farewell uses the completed-sentence budget. This is execution/provenance
success, not a claim of natural EOS for every scene, a two-sentence pass, or
all-token numerical qualification.

Literary verdict: **do not promote**. Concern → reassurance → remembrance is
readable, but repeated hand gestures stand in for a developed relationship.
Cloak/satchel are unsupported props; “still rests” implies an unestablished
earlier contact. The scar invents injury history, without explicitly asserting
healing. Arrival and farewell depend heavily on the surrounding scene to convey
their milestones. These misses remain visible in the
[exact passages and receipt](docs/STORYTELLING_FINISH.md#post-v1--grounded-connected-budget-qualification).

Next: a visible live-writer farewell payoff that develops remembered concern
into letting go and clearly stages the canonical companion departure. Keep the
current model; do not turn this result into another model/prompt/device matrix.

## Post-V1 council — live completed-sentence fallback (v0.5.133)

Reuses `8baf543` and its actual `66028840` cached-model receipt; a fresh local
recall query found no additional matching session. Production worker regression
and historical probe compatibility are reviewed independently. The shipping
scope is stopping behavior only: the current Qwen2.5 model, prompt, memory,
sampling, No LLM flow and 90s client deadline stay unchanged.

Acceptance requires normal-completion precedence, exact prefix preservation,
one interruption, complete drainage, full-tail hygiene, bounded storage and
failure before late settlement can claim success. Retry attempts share the
original budget; the next write receives a fresh budget. Optional diagnostics
label the fallback without logging prose or claiming natural EOS. Existing
candidate modes must remove the live policy before their own transforms.

Focused production and browser results are recorded with the
[release evidence](docs/STORYTELLING_FINISH.md#post-v1--live-completed-sentence-fallback).
Both independent reviews find no release blocker. The worker/helper/client
suite passes 119 tests; the final worker-only rerun passes 66. All 143 probe
checks pass, including byte-identical historical candidate behavior after
live-policy removal. Cooperative selection still needs a new stream chunk;
it does not guarantee a story at exactly 80 seconds or waive the client timeout.
The earlier candidate's 80.956s result remains historical, not a new live-model
timing claim. No additional GPU trial or model promotion is part of this slice.

## Post-V1 council — completed-sentence fallback is useful and ready for live integration

Reused `295e3e8`/`870ed082`, `b9cd592b` and recalled session
`01a06835-15f`. Independent reviews pass conservative prefix selection using
the real production cleaner, unchanged context, cache-only/exclusive mode gates,
worker-plugin/source-hash parity and explicit one-sentence fallback labeling.
The real transformed worker is exercised with a fake clock/engine: normal-stop
priority, one interrupt, late chunks, shared retry clock, new-write reset, and
interrupt/drain/settlement/hygiene/overflow failures. **141 focused tests pass**.

Actual `66028840` completes in **80.956s**, preserving the original complete
first sentence and discarding only an unfinished continuation. It passes
ordinary admission with no archive write. Stop/drain succeeds; all 47 source
hashes match and offline cleanup completes. Seven tiny above-one probability
warnings remain explicit under unchanged strict checks.

Literary verdict: **usable arrival intermission**, though somewhat ornate.
Mara's care, relief and fear develop the prior scene without inventing a prop,
recovery, departure or unfulfilled oath. Rowan's uneven breathing is imagined
bodily texture, not supplied game-state evidence. The surrounding scene still
establishes arrival. This is one bounded passage, not a qualified connected arc
or approval to promote the stronger model.

Next: ship this stopping behavior in the current live writer, separately from
model replacement. Keep normal completion and the existing hard/error bounds;
do not hold that improvement behind another candidate-model sequence.
[Exact prose and measured evidence](docs/STORYTELLING_FINISH.md#post-v1--completed-sentence-soft-budget).

## Post-V1 council — grammar execution passes, narrative remains unqualified

Reused `423a6b7`/`b9cd592b` and the actual road memory from `85f1c932`;
local recall for the new grammar query found no exact match. Independent runtime
review verifies the synthetic thinking header is outside grammar acceptance,
actual bundled CPU grammar compilation, and byte-identical manual/plugin
transform chains. Mode gates, raw-output validation and bounded native events
pass. **125 focused tests** pass; no production edits or new CI matrix.

Actual `870ed082` completes in 81.330s: two 15-word sentences, 231-token prefill,
native grammar acceptance and complete settlement/cleanup. Forty-six source
hashes match. All 45 observed samples are finite/in range; nine small above-one
values remain failures under the unchanged strict numerical check.

Literary verdict: **do not promote**. Relief and concern are visible, but the
word-count grammar permits “stingofuncertainty” as one lexical word. The forge
is invented and the waiting oath conflicts with the completed destination.
Neither ordinary admission nor shape validation catches these semantic defects.

Next bounded recommendation: natural free prose with a completed-sentence soft
deadline, retaining the hard timeout and honest one-sentence-fallback labeling.
This explicitly relaxes our internal two-sentence convention, not the need for
coherent, grounded prose. Do not patch this one fused word, build a dictionary,
extend the deadline or start another grammar sweep.
[Actual result and limits](docs/STORYTELLING_FINISH.md#post-v1--sentence-grammar-trial).

## Post-V1 council — grounded imagery improves, but two-sentence brevity fails

Reused `4db2354`/`c1a6da44` and recalled session `01a06835-15f`. Independent
reviews pass the grounded-mode dependency chain, explicit variant/provenance,
unchanged memory/current-scene message, no-archive bounds and old-mode behavior.
All **107 focused tests** pass; no production code or new CI matrix.

Actual `b9cd592b` keeps 231 input tokens/37.301s prefill, then times out at 90.004s
after 56 completed decode steps. The partial passage connects Mara's relief and
fear through contact with Rowan, without the previous invented possession.
Uneven breathing is still imagined detail. Its first sentence is too long and
the second is incomplete: **no literary qualification or live promotion**.

Forty-three hashes match; runtime/model/settings and current memory/facts match
the compact comparison. Cleanup completes offline, the checked kernel window
has no entries, and probability overshoots stay explicit. No second GPU trial.

Next single goal: bounded two-sentence output using the installed runtime's
existing grammar support, after checking Qwen header compatibility. Target
12–15 words per sentence and validate final shape; keep actual facts/memory,
the hard deadline and human review. Grammar cannot guarantee grounding. Do not
relax the goal to one sentence or start a prompt sweep.
[Exact partial output and timing](docs/STORYTELLING_FINISH.md#post-v1--grounded-arrival-revision).

## Post-V1 council — compact arrival improves latency, not yet narrative fidelity

Independent source review passes the single-variant bounds, explicit compacted
input labeling, original-message provenance, exact memory/action/consequence,
unchanged model/settings/deadline, and no-archive behavior. All **100 focused
tests** pass. Actual `c1a6da44` reduces input 321 → 231 tokens and measured prefill
53.316 → 36.959s; generation completes in 73.212s. This is one sequential pair,
not a universal performance claim. Timing/settlement evidence passes.

Literary verdict: **not qualified**. Relief versus care develops the earlier
passage, but the victory-linked leather satchel invents history; the gate is
unsupported scenery, and the model returns one sentence rather than two.
The full receipt remains incomplete because the review acknowledgment was
missed before the total limit, not because generation timed out. No rerun hides
that failure. Cleanup is complete, 41 source hashes match, the checked kernel
window has no entries, and numerical overshoots remain explicit.

Next single goal: one compact, grounded-arrival revision that uses present
bodily gestures, keeps actual memory/facts, and requires two sentences. One
cached comparison; no prompt matrix or promotion. [Exact result and limits](docs/STORYTELLING_FINISH.md#post-v1--compact-arrival-context).

## Post-V1 council — saved arrival timing identifies the expensive phases

Reused `14f0148`/`85f1c932` after local recall. Independent review passes the
exact saved-arrival request, actual recorded memory, fresh-worker scope,
cache-only one-scene gates, unchanged deadlines, and no-archive behavior.
Runtime observation adds no GPU wait or score change. A reviewer identified
unnecessary whole-receipt writes; decode checkpoints are now batched while
retaining every bounded timing record. All **94 focused tests** pass.

Actual `ebd53af9` records 321-token prefill at 53.316s and 38 completed decode
steps at 35.827s before the 90.004s timeout. No interrupt or drainage begins;
termination is cleanup, not successful settlement. Reset/setup is negligible
in this run. The phase bottleneck is measured, not its underlying hardware cause.
Forty source hashes match; the checked kernel window has no entries and all
resources close offline. Six small probability overshoots remain explicit.

The partial draft starts an emotional movement from road fear toward relief,
then begins a hand gesture. It is too incomplete to assess continuing care,
the Rowan anchor or a coherent arrival outcome. “The clearing” is unprovided
setting detail; “familiar ground” may imply unestablished familiarity. There
is no complete prose or connected-arc pass, and nothing is promoted live.

Verdict: one compact-context trial is justified by measured prefill cost, with
actual earlier prose and all meaningful current/emotional constraints preserved.
Use the same deadline and judge both input cost and completed prose. Do not
extend the timeout, sweep prompts/models or rerun the unchanged full sequence.
Live v0.5.132 stays unchanged. [Evidence and limits](docs/STORYTELLING_FINISH.md#post-v1--saved-arrival-timing).

## Post-V1 council — connected flow implemented, actual arrival times out

Reused `5df26ec`/`9fa28599`, the existing observer/production-memory code and
recalled session `01a06835-15f`. Independent reviews pass the three-scene bounds,
run-local history provenance, per-write native-loss windows, partial-run status
and unchanged single-scene behavior. All **84 focused tests** pass. The tests
using production memory functions and mocked replies are explicitly wiring proof.

Actual `85f1c932` passes the road passage, preserving care versus uncertainty and
the unfinished journey/injury. Arrival gets the exact current-run prose and scene
context, but times out after 90.023s. No arrival prose or farewell exists to judge;
no completed emotional arc or live promotion is claimed. Receipt remains incomplete.

Observed arrival samples are finite and in range, with three small above-one
failures. The 64-record cap limits observation to 40 road plus 24 arrival samples.
No per-scene timing separates prefill, decode or drainage. Independent kernel
review finds no entries during 06:39:00–06:43:20 UTC; all resources close offline.
All 38 source hashes match. Missing arrival settlement is not hidden as success.

Verdict: next isolate only the saved arrival request using existing timing/progress
boundaries, then reduce the demonstrated cost. No unchanged full-sequence retry,
larger deadline, speculative prompt rewrite or broader matrix. Live v0.5.132
stays unchanged. [Actual receipt and limitations](docs/STORYTELLING_FINISH.md#post-v1--connected-story-sequence).

## Post-V1 council — the two known shader races are repaired in the candidate

Reused `e667b7e` and its retained `d474de03` source after local recall returned
no exact match. Independent review verifies the two scalar-store guards alone
change; all reductions, barriers and 151,936 exact-once outputs remain intact.
The isolated compile hook requires entire-source equality and records bounded
provenance; final acceptance also verifies actual repaired live/fresh dispatches
and unchanged chunk WGSL. All 72 focused tests pass; no production change.

Actual `9fa28599` passes repair, complete-story and cleanup evidence. The same
coherent care-and-doubt passage survives unchanged, with no altered facts or
Journal entry. Cached load 36.430s, write 69.982s, 24,163 dispatch/flush pairs.
Independent kernel review finds no entries during 05:34:05–05:37:15 UTC. All 38
source hashes match. Three small above-one probabilities remain unchanged, so
strict numerical qualification is still false. The known races are repaired;
rounding behavior and the earlier hang cause have not thereby been explained.

Verdict: proceed to a bounded connected road/arrival/farewell sequence using
this repaired cached candidate and its actual earlier prose. This is not new
creativity evidence, a universal GPU fix or live promotion. Keep warnings
visible; no threshold relaxation, extra model search or new CI matrix. Live
v0.5.132 remains unchanged. [Receipt and limits](docs/STORYTELLING_FINISH.md#post-v1--pinned-shader-race-repair).

## Post-V1 council — a complete emotional passage from the stronger candidate

Reused `2afbfc0` and `4c771c92`; the narrow local recall returned no exact match.
The new one-scene mode preserves first-comparison evidence and the real worker's
generation, error replies and cleanup. Independent review found no integration
blocker and confirmed quit-only/cache-only operation without Journal or production
changes. Device-loss observation spans the write; detailed GPU validation and
uncaptured-error capture is still first-comparison scoped. All 66 tests pass.

Actual `d474de03` completes two readable sentences contrasting Mara's steady care
for injured Rowan with doubt about the unfinished journey. The original and
cleaned text match; ordinary admission passes without archiving. The imagery is
conventional, but the passage conveys an emotional concern rather than noise or
only a factual recap. Independent literary review gives a narrow pass and agrees
that wound-tending implies no healing outcome. This is one sample, not a
connected-sequence qualification.

Cached load 37.291s; write 70.348s; 40 observed samples; 24,163 separately flushed
dispatches; all resources closed offline. The checked 04:39:50–04:42:40 UTC kernel
window contains no entries. All 36 source hashes match. Three distributions
retain small above-one values, so strict numerical qualification remains false;
no criterion was relaxed. The known shader race remains unrepaired.

Verdict: retain this actual improvement and proceed with the already identified
two-guard shader repair in the isolated candidate, then a connected-story check.
No live model switch, extra model search or broad reliability matrix. v0.5.132
remains live. [Exact passage, receipt and limits](docs/STORYTELLING_FINISH.md#post-v1--one-complete-cached-story).

## Post-V1 council — submission policy gives a meaningful first-token improvement

Reused `f9490d5` and its receipts after the new narrow recall query found no
additional session. Kernel review found actual i915 hang/reset entries in both
prior run windows, including the run with an empty native-error list. Source
review isolated command batching as one testable boundary, not a proven cause.
The opt-in experiment flushes after each compute pass, with no added GPU wait,
shader change or direct score rewrite. Timing and uniform-pool reuse do change.
Two independent reviews found no isolation/reporting blocker; 59 tests pass.

Actual `4c771c92` completes the guarded first-token diagnostic: 607 separately
flushed dispatches, four full hashed shader records, one sample, all resources
closed offline. Kernel journal has no entries in the checked run window.
Live/fresh outputs match bit-for-bit and the expected argmax; maximum reference
error is about 2.86e-6. The value 1.000002861 still violates the strict probability
range, so numerical qualification remains false. No threshold was loosened.

Verdict: a promising submission-policy workaround, not a universal repair or
better live prose. Next run one complete cached story under this candidate;
judge the actual words and kernel health before extending the sequence. A
separately confirmed shared-scalar shader race remains a before-promotion item.
[Evidence and pinned upstream provenance](docs/STORYTELLING_FINISH.md#post-v1--per-dispatch-submission-experiment)
keep these findings distinct. No second GPU experiment or production change
this slice; v0.5.132 remains live.

## Post-V1 council — first-token stop and device-loss evidence

Reused the `5fe1f0b` handoff and retained receipts; the narrow
`deja "Qwen3 softmax dispatch"` query returned no new match. Independent reviews
covered dispatch scope, source-transform isolation, actual buffer identities,
shader bounds and honest completion. Review caught a completion-guard gap:
nested GPU errors now reject a nominal stop along with truncated/missing traces,
cleanup failures and native device loss. All 54 focused tests pass.

Actual `25952e40` reached one-sample comparison and intentional shutdown, with
four non-skipped dispatch records and matching live/fresh uniforms and shaders.
Its chunk source is truncated, so it remains incomplete. The fully captured
output shader covers the logical vocabulary; backing allocation size alone is
not a demonstrated defect. Its scalar shared-reduction writes merit source
review but are not a measured cause, given the earlier standalone passes.

Final `1f6289d1`, after enlarging the source cap, failed before any sample or
softmax-dispatch observation. Native capture retained
`vkQueueSubmit failed with VK_ERROR_DEVICE_LOST`; mapping aborted and there was
no stop acknowledgment. Both runs closed offline without Journal writes.
Neither receipt qualifies a complete trace or usable stronger writer. No third
GPU run, OOM claim or live-default switch. v0.5.132 stays unchanged.

[Evidence and next source boundary](docs/STORYTELLING_FINISH.md#post-v1--first-token-dispatch-and-native-device-loss)
retain the partial results. Next inspect prefill submission/readback and the
specific shared-reduction codegen pattern, not an unchanged full generation,
speculative allocator patch or expanded reliability matrix.

## Post-V1 council — fresh input also fails after model execution

Reused `deja "Qwen3"` session `01a06835-15f` and the `e87687b` handoff. Two
independent reviews checked runner isolation, snapshot ordering, tensor ownership,
error scopes and interpretation. Fresh compute runs after the original sampled
token and diagnostic, preserving the earlier probability snapshot. Extra reads,
allocation and synchronization still perturb execution; no sample-equivalence
claim is made. All 43 focused tests and source-boundary checks pass.

Actual `2fd91ae0` completes its first-token comparison, but neither the original
nor fresh-owned-input result matches the reference. Transfers/direct reads and
bounds pass. Oversized pooled-looking probability allocations are evidence to
investigate, not proof of a pooling defect. The scoped first-token GPU checks
report no error; **later generation loses the GPU device**. The request fails,
its receipt stays incomplete, and all owned resources close. Do not call this
a successful generation, input-copy fix, or established out-of-memory diagnosis.

An independent read-only npm tarball/integrity comparison proves root and staged
runtime files are pristine 0.2.85. The optimizations observed in that file are
upstream artifact content, not demonstrated repo-local patches. [Full receipt,
provenance and limits](docs/STORYTELLING_FINISH.md#post-v1--live-versus-owned-buffer-comparison)
preserve these distinctions. Stop GPU runs for this slice. Next work must use a
first-token boundary rather than another full known-bad generation. v0.5.132
remains unchanged; no candidate promotion, new model download or CI matrix.

Final source review finds no supported allocator-cache purge in the inspected
JS. Next capture the live/fresh softmax dispatch dimensions, scalar uniforms,
buffer identities/sizes, WGSL/hash and any debug-limit skip. Whole-buffer storage
bindings and integer-like residual bits justify this inspection, not a claim
that the output was never written or that pooled storage is defective.

## Post-V1 council — failure precedes sorting, standalone softmax passes

Reused `deja "Qwen3"` session `01a06835-15f` and the retained numeric/transfer
receipts. Independent reviews covered the probe instrumentation, tensor
ownership, dispatch/uniform source and interpretation. No identifiable JS
dispatch/uniform-pool defect was found; this does not qualify device execution.

Known-input `7b932262` passes the loaded softmax on two full-vocabulary patterns,
including a unique interior maximum, exact transfers and stable Float64
reference comparison. Zero generated tokens; all 12 temporary tensors disposed.
Paired actual-request `f53a9c75` observes 64 invalid probability arrays before
sorting, bit-identical afterward. Sorting did not introduce the observed
corruption in this run. Fourteen arrays contain infinity and eight selected
tokens are outside the vocabulary. The failed output changed with the added
readback, so only the failure class reproduced, not the original token string.

Both runs closed offline with no Journal writes. Root verified final cleanup
after the source review. All 36 focused tests pass; default diagnostic transform
bytes, production source and v0.5.132 remain unchanged. No new CI matrix or
third GPU run. [Receipts and limitations](docs/STORYTELLING_FINISH.md#post-v1--known-input-computation-check)
record diagnostic progress, not a storytelling improvement or candidate promotion.

Next compare model-backed versus fresh owned logits after the real forward pass,
with backing-buffer size/offset metadata first. A correct fresh result with a
wrong live result narrows storage/binding/lifetime; both wrong despite standalone
success narrows post-forward execution state. Neither outcome alone identifies
an allocator or driver cause. The runtime's missing upper token-bound check is
a secondary validation gap, not an explanation or replacement storytelling fix.

## Post-V1 council — candidate numeric failure reproduced

Exact cached replay `b4e34b8d` returned `700078b2`'s noise unchanged. All 64
observed probability arrays are invalid, 17 contain infinity and six sampled
IDs are out of vocabulary. Processor input/output summaries match. Independent
source review found no observer aliasing or missing synchronization, but finite
logits alone do not prove correct computation or copying. First logits are all
zero; probability copying follows sorting/sampling. Do not infer a precise
softmax, model-capacity or GPU cause. Next distinguish transfer from computation
using known numbers, not score sanitization or another literary retry.
The 18 initial focused tests passed; the run was offline, non-archiving and
fully cleaned up. [Receipt and limits](docs/STORYTELLING_FINISH.md#post-v1--candidate-sampling-diagnostic)
retain this evidence without claiming a player-facing improvement.

Follow-up `c6b52717` passes every known CPU/GPU transfer and direct-memory versus
`toArray()` comparison, including full-vocabulary floats and a scalar token.
Zero story tokens, 622ms check, 39.407s cached load including check, 15/15
temporary tensors disposed and full browser/server cleanup. A general transfer
defect was not reproduced; dynamic compute-buffer correctness remains unproven.
Next isolate the compiled softmax on known finite logits before sorting/sampling.
No normalization workaround or third GPU run. Final focused tests: 24 passing.

## Post-V1 council — stronger model probe rejected at the first scene

The latest continuation was explicitly interpreted as approval for one bounded
stronger-local-model evaluation. Qwen3 4B q4f16 was selected after a license and
resource preflight; no production default changed. The existing real worker was
used with an evaluation-only manifest/non-thinking adapter, preserving current
prompts, facts, memory selection and acceptance gates. The raw framing and exact
adapter are recorded rather than described as the unchanged production model.

Actual `700078b2` produced only punctuation and isolated letters, before and after
removing the runtime's empty thinking header. The cleaner rejected it; no journal
entry or second scene followed. Load 127.271s, write 64.809s, complete cleanup,
no external requests after load. Eight bounded tooling tests passed. Editorial
review rejects promotion and does not infer a model-capacity, GPU, or numerical
cause from unusable output alone. [Evidence and limits](docs/STORYTELLING_FINISH.md#post-v1--stronger-local-model-evaluation)
retain the failed result and unchanged v0.5.132 baseline. A next diagnostic must
target this retained configuration's execution boundary, not launch another
prompt/model search or broad device matrix.

## Post-V1 council — context trials rejected; stop prompt-only tuning

Reused `deja "farewell context selection"` session `01a06835-15f` and the
`a51ae37` handoff. The bounded destination-memory selector passed source review:
only qualified farewell prompt history narrowed, while full-history duplicate
protection, archive, Scene/current-choice isolation and canonical state stayed
unchanged. A combined follow-up made the same source-verified destination context
eligible for the exact previously written goodbye/separation brief. No new model,
sampling change, public fact, headline change or final subject-list change.

Actual `d89bd971` stayed generic despite fresh named care. Actual `7260991d`
depicted parting but moved Rowan away from Greyford against the current facts and
renewed a completed promise. Both failed editorial review despite technical
admission. 241 final-candidate focused tests and browser types passed; the prepared
UI regression was not run after the actual failure. Both GPU runs closed cleanly
at three scenes with no external requests. [Full receipts and reusable patch](docs/STORYTELLING_FINISH.md#post-v1--farewell-context-trials-not-promoted)
retain all work; runtime/test/probe source is restored and v0.5.132 stays live.

Stop further prompt-only variants here. Retain qualified V1 or ask the user to
approve one bounded stronger browser-local model evaluation, previously deferred.
No larger-model success or original garbling cause is established. This is a
scope decision, not a new CI blocker; P1-B/P2/P3 remain deferred. The earlier
baseline's brother-like language is an imagined simile, not biological kinship;
the prior limited V1 qualification is not retroactively revoked.

## Post-V1 council — farewell-subject trials rejected

Reused the previous council's queued source-grounding slice and canonical
`src/ui/farewell-remembrance.ts` projector; `deja "farewell subject grounding"`
found no additional session. Independent review found no wiring blocker:
source-bound departing names did not create active party members, old oath
prompt data, cross-scene inheritance or canonical emotions. Scope was retained
injured-alive farewells, not every departure.

Actual production result `f01916f1` preserved names/care but missed goodbye and
described the completed oath as firm. A single targeted goodbye/separation brief
in `035b4240` copied the earlier road paragraph exactly and was not archived.
Both are rejected, despite 270 final-candidate unit passes and two earlier
names-only built-browser journey passes. The synthetic headline also changed
to the canonical format, so causal claims cannot isolate one prompt phrase.
Both cached-GPU runs closed cleanly after three scenes with no external requests.

Runtime, tests and probe edits were restored, not replaced by a guard-only
feature. [Exact receipts and reusable experimental patch](docs/STORYTELLING_FINISH.md#post-v1--farewell-subject-trials-not-promoted)
are retained; the live version remains v0.5.132. No further trial this turn.
Next, test farewell-specific selection of the latest relevant destination prose
alone, with existing selection as fallback, unchanged prompts/model/facts and
no stored-history rewrite. Context interference is only a hypothesis; earlier
numerical-looking failures remain unexplained. P1-B/P2/P3 stay deferred.

## Post-V1 council — continuation-only prompt trials rejected

Reused `deja "continuing emotional arcs"` session `01a06835-15f` and the actual
worker baseline `d6a50611`. The user continued after the proposed post-V1
emotional-continuity milestone. Scope stayed at one brief for named-character
continuations with valid memory, not new models, state, panels or broad tests.

Council found no prompt-boundary blocker, but rejected both actual results:
`b53340ac` copied the unfinished road at farewell; `333e9771` avoided repetition
but lost Rowan and the goodbye in abstract oath imagery and a journey summary.
The second improved the explicit feeling pair, not the whole narrative. The
baseline is clearer and more personal. Prompt ordering is a hypothesis, not
established causation. No third trial or unchanged rerun was authorized.

Both owned cached-GPU runs closed after three scenes, with unchanged road/arrival
outputs, 0/1/2 actual memories, no external requests or runtime errors. Candidate
unit tests passing did not overrule literary rejection. Production and test edits
were restored exactly; player version remains v0.5.132. The receipts and
[measurements](docs/STORYTELLING_FINISH.md#post-v1--continuation-briefs-not-promoted)
are retained. Next work is bounded farewell-subject grounding using the existing
public capture, not another generic emotional brief or a guard-only substitute.

## Periodic v0.5.132 council — activation waits for saved-model removal

Reused `deja "storytelling remaining backlog"` scope decisions from sessions
`01a06835-15f` and `2026-09-03T0`; the narrower removal search found related
writer history in `2026-09-07T1`, not an existing fix. With the queued v0.5.131
task complete, a bounded audit found the shared Storytelling selector could
persist With LLM while `load()` refused to start during removal. The advanced
load button was already disabled. Council confirmed this as a concrete P0-C
delivery defect, without reopening deferred P1-B/P2/P3 work.

Main now derives removal from the existing off/busy snapshot, disables shared
activation controls only then, and shows removal progress. A late selector
change is ignored and restored to the actual preference. The controller and
cache-deletion implementation are unchanged; success or failure restores the
controls without loading a writer. Loading/writing still permit No LLM.
105 controller tests pass, including both deferred-removal outcomes followed
by explicit loading. The old built-browser regression failed on the enabled
selector while pinned fixture-cache deletion was pending.

Final council review found no blocker. Both 320px built-browser journeys pass
in 1.4 minutes total: blocked activation leaves the saved mode untouched, play
continues during deletion, both outcomes restore the controls, and explicit
reactivation delivers a fresh archived scroll while retaining the original
journal entry. Tiny seeded cache fixtures and supplied writer replies test
plumbing, not real GPU reload or prose quality. The progress screenshot is
readable with Close in reach. Browser-spec types, version/boundary checks and
production build pass. No real model files or unrelated user edits were removed.

## Periodic v0.5.131 council — recovery preferences preserve model prose

Reused the concrete fallback-preference finding from the v0.5.130 council below;
`deja "fallback preference"` found related sessions but no more specific fix.
The old built app reproduced a successful story disappearing from the automatic
scroll queue after changing **If a draft fails**, despite remaining archived.

The setting no longer invalidates the whole director. Choosing quiet calls
`discardAuthoredReady()`, which performs normal reconciliation and clears only
authored readiness. Successful model prose, pending companion moments, the
request epoch and cadence anchors remain untouched. Enabling recovery does not
discard anything. The existing busy guard and controller's live recovery policy
remain in place; focus, Off and lifecycle cancellation are unchanged.

82 focused tests pass, including exact model-story identity, idempotent discard,
unchanged archive callbacks, Rare-mode farewell retention at the original
cooldown, and an in-flight model request completing without reload. No model
trial, new panel, broader matrix or stronger-prose claim is part of this slice.

Final council review found no blocker. Both built-browser recovery journeys pass
in 1.3 minutes total: repeated toggles preserve exact held model prose, and quiet
suppresses held authored prose while retaining its unpresented journal entry,
then allows a fresh model story on the same loaded writer. The latter runs at
320 × 568. Strict browser-spec types, version/boundary checks and production build
also pass. These use supplied writer responses, not new inference qualification.

## Periodic v0.5.130 council — fresh stories after a long Hold

Reused `deja "storytelling remaining"` sessions `01a06835-15f` and `2026-09-03T0`
to retain the approved V1 scope; the specific held-scroll expiry search found no
match. Root and council confirmed different generation/presentation anchors:
the director used scroll opening, while the host enforces a fresh gap at close.
A long Rare Hold could therefore start a draft immediately after close and let
it expire before presentation. The old built app reproduced that early write.

The director now accepts the host's live `presentationNotBeforeMs` cooldown
boundary and combines it with existing attempt/presentation cadence. Main uses
the same close-plus-rhythm expression as its presentation gate. No duplicated
close state or pause-as-Infinity sentinel. Freshness and cancellation are not
extended, and the host's existing global close anchor is not reset separately
for new campaigns. Last-story rereads use that same existing cooldown. This
does not change the policy for a draft already ready before a reread, or add a
new suspension policy for companion moments during an arbitrarily long Hold.

Council also identified fallback-preference changes discarding successful model
prose; that distinct fix is recorded as next rather than bundled into this one.
Stale backlog wording asking for an already-qualified writer was reconciled with
the current V1 acceptance. No model trial, new panel or broader matrix was added.

79 focused tests pass, including the exact host-boundary test that failed before
the director change. The old v0.5.129 Rare browser case likewise failed on its
premature second write; the corrected Regular and Rare journeys both pass in
2.5 minutes total. Each confirms advancing play during the gap, then one fresh
displayed/archived story with two writes and one load total. The strict browser
types, version/source-boundary checks and production build pass. Inference is
mocked for these delivery checks; no stronger-prose qualification is claimed.

## Periodic v0.5.129 council — comparison-only narrative repetition guard

Reused `deja "duplicate narrator"` session `2026-09-07T1` and its rejected
earlier-road replay as the existing duplicate boundary, not a new inference
qualification. Council identified a concrete bypass: `Rowan’s` versus `Rowan's`
can admit otherwise identical prose. The shared comparison key uses only NFC,
curly/straight single and double quotes, whitespace collapse and trimming. No
case folding, punctuation stripping, dash folding, NFKC or fuzzy matching.

The controller captures comparison keys before asynchronous choices and retains
the existing current-moment reset and recovery rules. Prompts, visible prose and
stored entries keep their original text. Six controller regressions failed before
the wiring change; 278 focused tests pass after it, including quiet/authored
recovery, no fallback for Scene/missing viewpoint, and a later fresh write without
reloading. Helper tests preserve meaningful distinctions and cleaner output.
The manual production probe uses the same key but keeps its historical exact
comparison flag separate. No historical receipt or model setting was changed.

Council found no wiring blocker. The built-browser journey passes: recalled
typographic copy leaves the archive unchanged and scroll hidden, then a fresh
story is shown and archived exactly with one load total. This uses supplied
writer responses, not a new literary-quality result. Production build, strict
browser-spec types, probe syntax and version/boundary checks pass. The first
browser attempt had an invalid assertion about the intentionally compact status
label; it was corrected without adding diagnostic clutter to the player UI.

## Periodic v0.5.128 council — retain a story when its rhythm changes

Reused `deja "storytelling backlog"` sessions `01a06835-15f` and `2026-09-07T1`
to retain the four-item V1 scope rather than introduce a permanent emotion
simulator. Council found an unnecessary rhythm-handler invalidation: it discarded
finished prose behind Options even though cadence already reads the preference
dynamically. The fix removes only that invalidation. Existing cadence anchors,
freshness limits and focus/recovery/Off cancellation remain intact.

Council found no blocker in the focused browser regression: it verifies one
archived, initially unpresented model story, the exact scroll after changing to
Rare, then advancing play with no second archive entry, load or write. Immediate
presentation is correct for this first-ever scroll; no earlier close anchors a
five-minute gap. The unfixed build failed at the expected hidden-scroll assertion.
This test does not establish pointer accessibility, GPU timing or better prose.

The corrected build passes all three targeted browser journeys (new regression,
ordinary held-story delivery and existing rhythm/cadence anchors) in 3.4 minutes.
78 director/preferences tests, strict browser-spec types, version/boundary checks
and the production build pass. No further inference or expanded test matrix.

## September 8 council — observe the failed input without retuning it

Reused `deja "garbled narrator"` session `2026-09-03T0`, the v0.5.127 immutable
failure and the earlier reset/seed audit. Runtime review identified the existing
processor as a read-only observation point before GPU softmax. An opt-in bounded
collector records numerical counts/extrema and sampled IDs without changing
scores or adding another GPU readback. CPU observer work may affect timing.

The [cold and matched-request replays](docs/STORYTELLING_FINISH.md#september-8--bounded-numerical-replays)
returned a rejected earlier-road duplicate, not the original garbling. All
observed scores were finite and sampled IDs valid. The matched run reproduced
its first two raw outputs exactly; later inputs always remained the original
recorded messages. Neither replay is a new prose-quality pass or an archive entry.
Both closed their owned resources with no external requests/runtime errors.

Council approves retaining this evidence and tooling, but no speculative score
sanitization, model change or renewed prompt trial. It does not prove why the
original generation failed or whether downstream sampling was healthy. No further
GPU work followed. Default builds have no diagnostic logging; ordinary gameplay,
prompts, consent/cache and No LLM remain unchanged. This is investigation progress,
not a player-facing storytelling upgrade or a new runtime version. 255 focused
tests and the normal build pass; the built worker contains no numerical collector
or diagnostic log marker. Version/source boundaries and syntax checks also pass.

## Periodic v0.5.127 council — actual-worker evidence and draft admission

Reused `deja "storytelling continuity"` sessions `01a06835-15f` and
`2026-09-07T1`, plus the v0.5.126 source audit. Recall for the prose-cleaner
failure returned no match. The existing manual probe now uses the real production
client/worker rather than copying its behavior. Council found no fidelity blocker;
unavailable internal telemetry and reconstructed messages are explicitly labelled.
The [baseline and candidate evidence](docs/STORYTELLING_FINISH.md#v05127--reject-isolated-letter-drafts-in-every-focus)
confirms the earlier three-scene baseline but rejects the arrival candidate:
clearer care at arrival is not a net improvement when farewell is unreadable.
The candidate prompt was restored, and both immutable receipts were retained.

Unlike the older control-bearing sample, the new garbage passed sentence cleaning
and failed only character admission. Scene focus has no such gate. Council
approved a minimal shared shape check after sentence retention: require two
adjoining Unicode letters, allowing combining marks. This closes the exact
admission hole, not all gibberish; no dictionary or emotional-quality score is
claimed. It cannot promise unrestricted multilingual acceptance. Existing recovery
eligibility must remain unchanged, including no authored fallback for Scene focus
or missing viewpoint. 328 focused tests pass, including the newly observed reply,
short/Unicode text, discarded tails and subsequent write recovery. No further
inference, model change or device matrix was added. Generation cause is still
unknown and remains a bounded next investigation, not a claim of better prose.

## Periodic v0.5.126 council — recover an idle writer failure

Council located a concrete client/controller gap: idle native worker errors have
no pending promise through which to report failure, leaving the controller ready
and hiding Retry. The client now notifies only after idle teardown; the controller
uses current-writer identity and phase guards to expose its existing failed UI.
The asynchronous post-load cache check also verifies that the writer remains ready.
Pending failures and manual disposal are unchanged; no auto-load or new control.
Council found no implementation blocker. This is a narrowly scoped P0-C fix, not
a diagnosis of arbitrary GPU failures or a claim of better generated prose.

202 focused tests, strict browser-spec types, version/boundary checks and the
production build pass. The built-app recovery journey passed in 33.8s, with
native Retry at 320px, retained pause/journal, a fresh subsequent scroll and no
external requests/page errors. The phone capture was reviewed. Its supplied
worker event and prose prove integration, not spontaneous GPU-failure reproduction.
The isolated preview closed; existing unrelated ledger work remains uncommitted.

The separate garbled-output source audit found no reset/seed misuse or proven
cause. Staged and production runtime bytes match (`341bae95…7792c`), but the proxy
probe omits production's registered logit processor and two-sentence interruption.
The installed runtime's sampling path adds GPU/CPU copies and synchronization
when a processor is present; it does not sanitize non-finite values. Future prose
qualification should use the actual production worker/client, not another
uninstrumented prompt trial. Earlier receipts and failed candidates are preserved.

## September 8 council — arrival candidates held back

Reused `deja "storytelling continuity"` sessions `01a06835-15f` and
`2026-09-07T1`, plus the v0.5.123 actual injury/arrival limitation. Recall for
`garbled narrator` returned no match. Council first scoped a prompt-only arrival
refinement, then rejected both actual sequences: the first lost emotional
attachment at farewell; the smaller second candidate produced an unusable
farewell after a better arrival. The generation failure's cause remains unknown.
See [both immutable receipts and exact limits](docs/STORYTELLING_FINISH.md#september-8--injured-arrival-candidates-not-promoted).

Production prompts are restored, with no runtime version bump. The useful
retained change is two actual-response cases in the existing controller/director
test: corrupt text cannot reach model-attributed archive/presentation callbacks,
authored recovery respects its setting, and the next supplied valid response
works without a new load. The 130 focused tests pass. This is rejection/recovery
coverage, not a new narrator feature or GPU diagnosis. No more sampling, model
changes or P1-B/P2/P3 expansion was authorized by this result.

## Periodic v0.5.125 council — keep the narration exit reachable

`deja "narrator-close"` returned no match. Reused the recorded P0-C limitation
and [GPU receipt 3e3e547f](tools/creative-story-probe/webgpu-game-report-2026-09-08T03-16-33-976Z-3e3e547f.json).
Council found no source-proven Close-handler bug: the historical failure stopped
at browser actionability, while existing tests invoked the button programmatically.

A new genuine-pointer regression directly reproduced a separate layout defect:
deep scrolling put Close outside the dialog and prevented hit-testing. Moving
the header outside one bounded settings scroll body fixed that check at 960px
and 320px. The post-fix journey passed in 41.5s, including native Off/Close,
one pending mock writer terminated, visible focus restoration, advancing No LLM
play and unchanged journal. Both fixed captures and the before-state were viewed.
No new UI controls, narration settings, model calls or runtime changes.

The regression uses mocked inference, not a GPU workload. It does not establish
the cause or resolution of the older GPU-specific actionability timeout. Council
approved the narrowly stated scrolling fix. The existing server on port 4174
was left running; browser builds, preview and captures were isolated under ignored
scratch on port 4175. No broad browser/device/CI matrix was added.
The existing saved focus/rhythm/recovery layout journey also passed in 46.8s,
including the new body's horizontal bounds at 320px/1280px. Strict browser-spec
types, version/source boundaries and the isolated production build pass. Local
builds include preserved, unrelated ledger work and are not claimed identical
to the clean release build; those ledger files stay out of the feature commit.

## Periodic v0.5.124 council — a solo opening with inner life

Reused the value-grounded idea from `deja "solo narration inner life"`, local
session `2026-09-07T1`, and the v0.5.123 Inez scenery-only result. Council narrowed
the change to a hero without an active companion or selected valid history:
companion absence alone would also alter the already-qualified farewell.
The first recorded value now supplies a present emotional tension; continuing
passages retain their thread. Exact comparison against the prior receipt confirms
unchanged road/arrival/farewell prompts. No extra state, UI or inference call.

The [first trial](tools/creative-story-probe/webgpu-v1-report-2026-09-08T05-34-59-965Z-66a993f1.json)
was rejected because “again” implied an unrecorded visit. A current-action brief
and explicit boundary against unsupported earlier visits/relationships produced
the [final sample](tools/creative-story-probe/webgpu-v1-report-2026-09-08T05-37-54-062Z-ae5e6e65.json).
Council passes a modest improvement: curiosity, unease and hesitation instead of
scenery alone. Speculative danger is an imagined worry, not an encounter. Awkward
phrasing remains; this is one curiosity sample, not universal prose quality or
qualification of every value. Neither actual output was rewritten or hidden.

248 focused narrator tests, version/boundary checks and the production build
pass. Existing unrelated ledger edits are preserved and excluded; the local
build is not claimed byte-identical to clean release CI. The existing manual probe gained a single-solo
mode, reusing its owned cache and requiring manual closure; no CI matrix was
added. Final load/write: 18.071s/27.568s; 204 input tokens. Both runs had zero
external requests/errors and complete cleanup. The game presentation, cache,
worker and archive paths are unchanged. The scoped V1 baseline stays qualified;
broader P1-B/P2/P3 work remains deferred, not silently revived.

## Periodic v0.5.123 council — remember the scene behind each story

Reused the V1 priorities recovered by `deja "storytelling emotional continuity"`
(local sessions `01a06835-15f` and `2026-09-03T0`) and the actual failed
`50b7719f` receipt. Inspection found that continuity selection discarded the
already-saved location/headline, then supplied consecutive assistant paragraphs
without the scenes they interpreted. Council recommended restoring chronological
scene/prose pairs before considering another emotional-memory system.

The selected two earlier passages now carry optional bounded scene labels.
Selection and prompt capture detach and freeze them; malformed/missing metadata
does not discard otherwise eligible older prose. The worker reconstructs a
historical user scene followed by the exact imagined assistant prose for each
memory, with current facts last. It does not claim those are the original full
prompts. Whole optional pairs can be removed on context overflow; current facts,
memory ranking, source/campaign boundaries, paired speakers, archive schema,
model/cache identity and number of model calls are unchanged.

**Minimum P0-B prose acceptance passes on the new actual sequence.** In
[receipt 8907eba1](tools/creative-story-probe/webgpu-v1-report-2026-09-08T04-35-07-729Z-8907eba1.json),
road worry becomes relief with continuing care at arrival, then affection that
makes goodbye painful. Mara and Rowan remain recognizable, the journey is not
made unfinished again, and no death, healing or reunion replaces farewell.
“Like a brother” is an imagined comparison, not fabricated biological kinship;
their journey testing the bond interprets the supplied journey rather than
inventing a separate event. Solo Inez is readable and has no foreign-campaign
memory, but remains scenery rather than a strong inner-life passage.

This is a deliberately small acceptance, not universal coherence. Arrival's
“worry latched onto Rowan” is awkward; its injury provenance is slightly
overstated. Judge only accepted prose, not discarded trailing output. The probe
also now resets chat on every write to match production, so that fidelity
correction and paired context do not isolate a single causal explanation.
The source/reset discrepancy is recorded, not treated as a separate production
fix or evidence that the old in-game worker skipped resets.

Actual cached load 19.954s; writes 30.248/29.620/35.558/22.113s; input tokens
194/320/394/180. Four passages passed the existing hygiene/name/duplicate gates,
with 0/1/2/0 selected memories, zero external requests/errors and complete owned
browser/worker/server cleanup. Focused regression checks: 242 tests across six
files pass, as do strict browser-spec types, version and source boundaries.
The one existing built-app continuity journey passed in 28.7s (1.5 minutes with
build/setup). It supplies its own labeled fixture response to verify outgoing
context, unchanged source attribution/archive, excluded foreign/future memories
and the readable 320px Journal separately from actual-model literary quality.
The phone capture was visually reviewed; browser and preview closed. Production
build and final built boundaries pass. Unrelated ledger edits remain preserved
and excluded from this feature commit; local builds are not claimed byte-identical
to clean release CI. The approved V1 baseline is complete, with the current
single-device/prose-sample limits and earlier inconclusive post-Off Close check
retained rather than silently counted as broad reliability qualification.

## Periodic v0.5.122 council — real GPU writer, continuity still open

The approved P0-A/C integration now uses pinned Qwen2.5 1.5B q4f16 and WebLLM
0.2.85 in the existing dedicated worker. It requires shader-f16 WebGPU and
browser Cache Storage, discloses about 900 MB, and never adds remote inference.
The old model cache is preserved; it cannot be mistaken for this larger model.
Independent runtime/cache review found no new critical implementation blocker.

Council checks covered the direct-engine logit processor registry (the proxy
worker API would ignore it), finite eligible DM labels with preserved scores,
two-sentence stopping with full stream draining to release WebLLM's lock,
native selected-history roles, and current-facts-preserving context overflow.
Cache-only restoration closes both fetch and native Cache.add/addAll; removal
targets the pinned model files without fetching a manifest or deleting the
shared architecture runtime. Unsupported-device guidance reaches startup and
Options. Model weights and the inference runtime stay out of the main bundle.

**Literary review does not pass P0-B.** The latest actual road/arrival/farewell
trial improved beyond factual summaries, but arrival's “final resting place”
was ambiguous and farewell repeated the old unfinished-road paragraph despite
the completed oath. The production duplicate gate rejected it. The solo scene
was readable scenery, not a strong inner-life passage. Native assistant history
and removing irrelevant seed imagery are not a completed emotional arc. Retain
the [actual raw outputs and verdicts](tools/creative-story-probe/webgpu-v1-README.md)
and do not launch another unchanged prompt/model trial to manufacture a pass.

The real built game produced an Orin passage during play: cached load 19.080s,
DM selection 14.011s, prose 23.099s, and simulation ticks advanced 7→11 during
writing. The actual accepted passage reached a safe scroll and the Journal with
LLM attribution. Desktop and 320px parchment fit; captures were visually
reviewed. The first harness stopped during reload because it clicked a hidden
Focus-mode Pause control after Panels was remembered. A linked continuation
restored cache-only in 20.422s, retained the same actual story/campaign, and
terminated a real pending write on Off. It then timed out waiting for the
Options Close button's clickability; that cause is unconfirmed. A final
[No LLM continuation](tools/creative-story-probe/webgpu-game-report-2026-09-08T03-28-03-637Z-ab8f8509.json)
passed 44 checks in 24.762s, including unchanged persisted journal, advancing
same-campaign play and reload, no creative worker/call, no external request and
complete cleanup. Prior receipts and production hashes match. No earlier story
was regenerated or supplied. P0-C's normal loop is qualified through these
linked segments, not an uninterrupted journey or proof of immediate same-page
Close responsiveness after GPU cancellation. P0-B remains open.

Focused verification: 254 tests across story, client, worker, controller, cache
and conversation pass (including 29 cache and 13 conversation cases). Final
council review corrected a browser assertion that assumed a healthy companion
had already earned a shared victory; both tentative hope and earned trust are
valid existing prompts. No gameplay change was needed. Strict updated
browser-spec TypeScript, version/source/built
boundaries and production build pass. No long local matrix was run. Existing
unrelated ledger edits were preserved and are excluded from this feature commit;
the local application proof is therefore not claimed byte-identical to the clean
release CI build. npm reported four pre-existing Transformers/ONNX-node/sharp
dependency advisories, none introduced by WebLLM/loglevel; no unrelated audit
upgrade was mixed into the slice.

## Periodic v0.5.121 council — preserve milestones through Rare cadence

Implements the approved P1-A only: companion first victories and farewells retain
their captured source until the next permitted Quiet/Rare attempt plus a bounded
three-minute opportunity. Completed prose still expires three minutes after it
is ready. One-slot/latest-milestone behavior and campaign, hidden-tab and Off
invalidation remain intact. A later presentation correctly moves the cadence
anchor. Reused the prior milestone finding from local recall `2026-09-07T1` and
the storytelling scope from `01a06835-15f`.

Independent council review found no new blocker. A pre-existing caller-level
possibility of reoffering a fully expired, never-attempted event is not claimed
fixed; the production host offers only new committed transitions. No broader
queue redesign or reliability matrix was added.

Verification: 66 focused director tests, strict browser-spec TypeScript,
version/boundary checks and production build pass. The single built-browser
Rare farewell journey passed in 2.6 minutes: no early write after 200 seconds,
the original captured farewell after the cadence opens, Shared road without an
extra moment-choice request, intermission rereading and desktop/320px containment.
The phone capture was visually reviewed. Browser and preview closed. Its supplied
writer response proves delivery, not actual LLM prose quality; P0-A/B/C remain
open and the real GPU writer trial is tracked separately.

## September 7 storytelling finish decision — no writer promotion

The user requested a realistic finish within the next few days. The
[three-day plan](docs/STORYTELLING_FINISH.md) freezes unrelated UI, story-library
and test-matrix expansion. Existing opt-in/cache/background/scroll/archive and
short prior-passage continuity plumbing remain; stronger actual writing is the
critical unfinished result. Reused local recall `01a06835-15f` and prior real
writer receipts rather than treating earlier failed candidates as qualified.

Runtime review selected one materially different candidate: pinned
Qwen2.5-0.5B ONNX through the current Transformers.js worker, not the failed
wllama path. The [actual receipt](tools/creative-story-probe/candidate-report-2026-09-08T01-09-54-396Z-ac9e04ca.json)
verified 519,136,456 artifact bytes and the intended build-time model identity.
It reached the existing 180-second loading deadline, before writing. The whole
run finished in 214,921 ms; browser, context and server closed and the owned
temporary profile was removed. No production source or live writer changed.

Independent review agrees that zero outputs establish neither literary failure
nor literary success. Zero generation requests are vacuous here: generation
never started. The receipt also does not distinguish browser transfer/cache
time from ONNX initialization because the existing probe returns accumulated
load progress only on success. Preserve that progress on failure in a future
target-device check; this gap is not a reason to repeat identical CPU conditions.

The bounded probe now supports one shared instruction-only story opening and an
isolated disk-backed profile. Six focused Node checks and syntax/whitespace
checks pass; the original three-fixture default is retained. Final review caught
unconditional cancellation of the shutdown watchdog; it now stays armed if a
launched browser/context has not demonstrably closed. No model rerun or CI matrix
was added for that cleanup-only correction.

Next decision is the player's intended device/browser path. September 10 is a
conditional target for one usable writer and three connected character scenes,
not a promised stronger-LLM release despite absent evidence. If no writer is
usable at the first decision point, request the explicitly labeled authored
release versus delayed stronger-LLM choice. Do not quietly count fallback prose
or another UI feature as completion of the storytelling task.

## Periodic v0.5.120 council — reveal navigation without taking over reading

Closes the queued phone-tab visibility follow-up, reusing the intentional-reading
and screensaver-first direction from local recall `01a06835-15f`. The existing
layout synchronizer minimally scrolls only the navigation row. View changes and
reappearance reveal the selected destination; same-view resize also respects an
unactivated keyboard-focused tab. Cached geometry excludes scroll position, so
ordinary play does not undo deliberate horizontal scrolling. No new panel,
preference, model behavior or game-state contract is introduced.

Council caught retained old-tab focus during shortcut activation, and repeating
End after scrolling away from the already-focused last tab. Both are handled.
The built-browser proof also exposed partially clipped native keyboard focus;
Arrow/Home/End now reveal explicitly with preventScroll focus, keeping activation
separate. Test-only corrections scoped ambiguous tab selectors to the toolbar
and stopped treating native vertical anchoring during text reflow as a bug.
The regression instead checks retained reading ownership through resize and
exactly unchanged vertical scroll during explicit horizontal keyboard browsing.

Verification: 22 focused navigation/Focus tests, strict browser-spec TypeScript,
version/boundary checks and the final production build pass. The final isolated
built-app journey passed in 82.453 seconds, including native shortcuts, retained
old-focus activation, Arrow/Home/End, repeated End, desktop-to-320px resize,
manual wheel scrolling across a live tick, Focus restoration, unchanged paused
saves, no narrator requests/workers and no page errors. Both final captures were
reviewed; the phone capture deliberately retains a nonzero reading offset.
Earlier diagnostic receipts remain separate. All owned browser/preview groups
closed. No long qualification matrix was added; stronger prose and emotional
continuity remain open.

## Periodic v0.5.119 council — readable storybook, unchanged source stories

Reused the readable archive/background narrative intent from recalled session
`01a06835-15f`. A pure formatter turns the selected reading snapshot into plain
text, grouping campaigns and ordering their source ticks without rewriting any
story. Named hero/companion voices, model/authored origin and actual intermission
status remain explicit. The original JSON format remains available. A native
Save stories disclosure keeps both choices out of the main reading layout until
requested. Neither export refreshes the snapshot, changes a save or runs a model.

The runtime reviewer found no source-backed tokenization defect: the three
historical prompts matched exact ChatML output at 202/171/192 tokens, without
duplicate special tokens or truncation. Pin/q8/EOS paths also agreed. That audit
does not demonstrate literary quality, and no repeated inference run was made.

Verification: 37 focused formatter/archive tests, strict browser-spec TypeScript,
version/boundary checks and the production build pass. Two built-browser journeys
passed in 112.254 seconds: actual UTF-8 text/JSON downloads, original voices and
prose, within-campaign scene order, current/all filtering, unchanged saves/archive,
native keyboard disclosure and retained focus, plus both formats using the
visible snapshot while a new story waits. Phone/desktop captures were reviewed;
no model downloads or page errors occurred, and owned processes closed. Council
then corrected the text-only group label to “Other adventure”, since another
saved hero need not be chronologically earlier. The corrected formatter tests
and build pass; the final live download check covers that wording.

## Periodic v0.5.118 council — keep captured stories while inspecting

Reused the player's archive/background-story intent from local recall session
`01a06835-15f`. Independent review rejected the initial moving-reader diagnosis:
ordinary navigation invalidated the pending request before it could update the
archive. The actual change separates stage dismissal from narration cancellation.
An in-flight same-campaign story now completes into Narratives while another tab
is open. Watch-only starts and safe-break presentation remain unchanged; Off,
campaign changes, hidden-page and update boundaries retain hard invalidation.

Because completion can now arrive during reading, Narratives retains its DOM,
selection and displayed export snapshot until deliberate refresh. The explicit
control retains keyboard focus, and scope/campaign changes refresh the correct
list. Archive retention details fold away; live hero activity is hidden in the
story-reading section, matching Status. This is not improved model prose.

The separate runtime council measured the stronger writer's first native decode.
Almost all CPU samples were active quantized matrix work, and pinned-source plus
binary inspection confirmed SIMD already enabled. One targeted compact-prompt
comparison still returned no prose inside its bounded deadline. Its failure is
retained separately; no production model or larger-model cache is promoted.

Verification: 87 focused director/archive tests, application and browser-spec
TypeScript, version/boundary checks and the production build pass. The final
69.903-second built-app journey verifies exact captured source/unshown archival,
continued play, no new draft or cutscene during inspection, unchanged reading-row
position and text selection, visible-snapshot export, keyboard refresh/focus,
current/all-hero filtering, and phone/desktop containment with 44px controls.
Both final captures were reviewed. Fixed refresh width and a screen-reader-only
pending announcement prevent header growth from shifting the passage. No model
downloads or page errors occurred; all owned browser/preview processes closed.

## Periodic v0.5.117 council — Adventure belongs beside Map and Codex

The user's follow-up replaces the Adventure panels menu popup with a real
Adventure inspection tab. Reused the navigation/history separation from
`deja`, session `01a06835-15f`. One set of character and Chronicle nodes is
hosted in the shared inspection screen; no duplicate detail view is introduced.
Character opens that tab. The menu entry, dialog, focus trap, temporary node
hosting and all drawer CSS are removed. All eight views share keyboard access
and a horizontally scrollable navigation row. Return/Escape restores Watch and
the existing Focus preference; tab-specific scroll positions remain available.
Status and Narratives stay in Journal. Gameplay, pause and save schemas do not
change. The Watch status retains a visible, polite live announcement.

Council review caught a legacy narrator adapter that translated ineligibility
into an active cutaway. Adventure now clears automatic scene presentation
without that adapter, retaining deliberate classic Story Beat access. The
controller regression checks no new automatic offer, cleared scene text, and
retained inspection/battle suppression. Creative story cadence, models, consent
and generation settings are unchanged. Long companion locations now wrap.
Visual review also required the header, tab row and screen start to agree at
200% text and after resize. They now derive their offsets from one measured
header and tab height, observing complete border boxes. Earlier failed
geometry receipts are retained rather than counted as passing visual proof.

Verification: 56 focused tests across five navigation/narrator suites pass;
the corrected narrator suite also passes its 23 tests. Application TypeScript,
six focused browser specifications, version/boundary checks and production
build pass. The legacy site spec retains its preexisting standalone type errors,
not errors in the migrated lines. The broader built-app tab journey passes
autoplay, all eight destinations, paused-world identity, scroll restoration and
unchanged saved preferences. The final exact-detail/keyboard/Focus/resize journey
passes against the release asset in a 68.471-second harness, including 320px and
200% text, strict header/navigation/content separation, no model requests and
no page errors. All three final screenshots were reviewed; all owned browser
and preview processes closed. No long qualification tests were added to CI.

## Periodic v0.5.116 council — Character readiness without duplicate detail panels

Reused `deja "the_grind_2 next storytelling backlog"`, session `01a06835-15f`,
and the requested screensaver-first progressive disclosure. Character now keeps
readiness and immediate context; Inventory and Skills own the exact equipment
and ability detail. Two duplicate cards, two duplicate summaries and their
per-frame rendering are removed. All six attributes remain continuously updated
inside a native keyboard-accessible disclosure. Independent review found no
lost essential gear, ability or character facts. No gameplay, narrative, model,
consent, saved-state or preference change is made by this UI slice.

The drawer uses one horizontally scrollable navigation row at every size.
Visual review caught a clipped enlarged-text header despite an initially passing
geometry check. Stronger assertions then exposed a non-wrapping Changed row.
Both are fixed by wrapping, not hiding their content. Earlier failed receipts
are preserved. The final desktop, 320px and 200%-text captures were reviewed.

Verification: 53 focused tests across six UI/projection suites pass. Application
and three focused browser-spec TypeScript checks, version/boundary checks and
production build pass. One isolated built-app journey verifies exact paused
resources, combat stats, Inventory and Skills projections, all six attributes,
native keyboard disclosure, resize/zoom containment, 44px targets and Escape
focus return. It finishes with identical saved world state, no model requests
and no page errors. The final harness completed in 68.657 seconds and closed
all owned process groups. Existing affected browser fixtures now inspect the
canonical Inventory/Skills surfaces. No long qualification matrix is added.

The separately committed stronger-writer RPC diagnostic reuses the pinned
wllama history (`deja wllama`, session `2026-09-06T1`). Its first run exposed an
optional debug endpoint returning null, not a failed story submission. The
corrected run records completion admission in 150.7ms, then the first native
`get_result` still pending at the 20-second ceiling: two calls, no empty-poll
loop, no returned text. Both immutable receipts and 17 passing portable tests
are retained outside feature CI. This identifies the next profiling boundary;
it does not establish why native inference stalls or improve production prose.
All owned workloads closed; production retains the existing client-only writer.

## Periodic v0.5.115 council — recognizable values in ordinary inner life

Reused `deja "storytelling"`, session `01a06835-15f`, and the user's direction
to make characters emotionally interesting without adding screensaver clutter.
A bounded council review found that first-victory and farewell reflections
used recorded hero values while ordinary Inner life still ignored them. Eight
original reflections now give curiosity, loyalty, mercy and courage two
distinct inner tensions each, through the existing closed-value selector.
Missing or malformed values retain the exact neutral fallback. The hero's
values inspire imagined prose; they are not measured emotions or ranked traits.

Independent review cleared the implementation and all eight passages. No
biography, new external event, companion personality or promised outcome is
introduced. Recovery remains prepared before asynchronous inference; caller
changes cannot replace its captured name or value. Shared-road wording and
duet/victory/farewell precedence remain unchanged. Accepted model prose, model
calls, prompts, cache, consent, pacing, saved-state schemas and neutral visual
tone are unchanged. The existing Authored scroll and Narratives archive carry
the result without another panel or control. This improves authored
characterization, not real-model literary quality or persistent emotional arcs.

Verification: 332 tests across eight focused suites pass in 20.13 seconds,
including frozen caller-value capture and unchanged character admission.
Application and focused browser-spec TypeScript, version/boundary checks and
production build pass. One isolated built-app browser case supplies a rejected
draft to the real production recovery workflow, independently matches one of
the merciful hero's exact reflections, then verifies Authored presentation and
archive attribution, stable reading tick, desktop/320px geometry, readable text,
44px controls, one worker/write, no model network and no page errors. Inference
alone is stubbed. Both captures were visually reviewed. The harness completed
in 57.808 seconds and closed all owned process groups. No qualification matrix
or further model trial was added to this feature.

The preceding v0.5.114 correction passed Pages run 34155761318 in 3m20s. Its
initial live smoke mistakenly targeted the hidden full-layout Pause control in
fresh Focus mode; that failed receipt remains intact. Selecting the actually
visible Pause control then passed all 20 live checks in 20.212 seconds,
including the exact deployed version and reviewed entry SHA-256.

## Periodic v0.5.114 council — keep character stories with their cast

Reused `deja "sampled prose"` and the continuity history in session
`01a06835-15f`. Independent review found no evidence of malformed ChatML framing;
all prior prose trials were greedy. One 135M temperature/top-k trial produced
an invented past, then Frodo, parents and a rose planted by Mara, omitting Rowan
and the continuing injury. Both raw passages and the real journal recall remain
in an immutable receipt. A launcher failure before browser/model initialization
is preserved separately, not counted as a writing sample. Installed
Transformers.js 4.2.0 does not apply top-p; that ignored setting was omitted.

One final 360M comparison changed only supported sampling from the prior
disk-backed generic-prompt trial. It restored offline in 16.707 seconds and
generated `Mara beside Rowan (injured)` in 31.658 seconds. The cleaner returned
null, so there was no accepted first story and no second attempt. All owned
workers, browsers, servers and the temporary profile were cleaned up; no model
or decoding change is promoted. The opt-in receipts remain outside feature CI.

The player-facing change is deliberately narrower: a character-focused story
must actually mention the captured requested hero, or both people for Shared
road. This is not a vocabulary whitelist, factual validator or emotion score.
Full names and unambiguous first names count; substring lookalikes and ambiguous
shared given names do not. Each DM candidate freezes its own anchor before
asynchronous selection. A lost-character draft follows the existing named
authored recovery/quiet preference before the director can archive it. Authored
recovery cannot be labelled LLM output, and rejecting a draft cannot leave the
writer busy. Scene imagery and existing archives are unchanged. The source
model, cache, consent, prompts, token budgets and number of calls are unchanged.

Verification: 159 focused anchor/controller/director tests pass, including both
actual bad samples, honest onWritten attribution, quiet recovery, candidate
capture and a successful next request without reload. Application and focused
browser-spec TypeScript, version/boundary checks and the production build pass.
The single built-app browser case rejects hygienically valid characterless
prose, shows a named injury-aware authored interlude, archives only that authored
text, then accepts the next named model fixture on the same worker. It checks
desktop/320px cutscene layout, readable text, source labels, two writes, no worker
restart, no model network and no page errors. Inference alone is stubbed: this
proves the production workflow, not model quality. Both new intermission
captures were reviewed. The harness completed in 99.931 seconds and closed all
owned processes. Existing successful browser fixtures now use names captured
from their own requests; negative responses and static archives are unchanged.

The first v0.5.114 CI run (34154954048) failed nine tests: three additional
real-controller suites still supplied unnamed prose as successful character
stories. No deployment occurred. A read-only council audit of all five
createCreativeStoryController test callers identified the remaining shared
success fixtures and a separate first-victory continuation. Those fixtures now
name the captured hero, and the companion where Shared road requires both.
Expected origins, selection, duet attribution and request counts remain intact;
deliberately invalid or unrestricted scene responses remain unchanged. All six
affected suites now pass: 245 tests in 15.32 seconds. This is a test-only release
correction; production code and the already browser-verified v0.5.114 build are
unchanged. The unsuccessful CI result is retained rather than relabeled green.

## Periodic v0.5.113 council — one factual status-history home

Recovered the shared-log design with `deja "the_grind_2 shared status history
log"`, session `01a06835-15f`. Independent projection review found two different
sources: the 32-entry Chronicle includes autonomous decision traces, while the
128-entry depth log includes mechanical receipts absent from some Chronicle
summaries. Both remain source-labeled and newest-first; same-tick placement is
a display convention, not invented chronology. Dedupe is source-specific; seed
and legacy IDs are preserved, with ownership from the loaded campaign.

Journal Status replaces the old Adventure log and Recent Chronicle windows.
Actual action reasons are expandable, not fictional character thoughts. The
existing Narratives section retains its independent authored/LLM attribution,
archive and export. No ledger schema or narrator runtime changes are needed.
The deliberate reading snapshot does not reorder focused rows as the adventure
continues; Show latest events refreshes explicitly. A campaign switch replaces
old rows immediately. Character's shortcut hands keyboard focus to Status after
closing its native drawer; ordinary Watch keeps the compact character strip.

The first built-app run passed identity/rationale, navigation and both viewport
checks but exhausted its 150-second case budget during the final live-refresh
check. Its failure receipt remains intact. Screenshot review also found stale
12-entry subtitle copy, a redundant live Storybook margin above the history and
a three-row phone navigation header. The subtitle now describes the real homes,
Status suppresses that live card, retention details fold away, and phone
inspection navigation is a touch-sized horizontal strip. The refresh control
uses an inert aria-disabled state so completing a refresh retains keyboard
focus. The final browser case removes duplicate tab-switch loops, not the source,
layout, real-progress or unchanged-state assertions.

The second run confirmed actual progress and a stable snapshot but hit that
same case deadline on the final refresh click. The final run kept desktop
rendering for the desktop capture and used the smaller phone viewport for DOM
interactions, avoiding unnecessary software-GPU overhead. With a bounded
180-second case ceiling, it passed in 57.0 seconds (65.776 seconds including
owned preview/browser startup and cleanup). Exact identities/reasons, both
layouts, all three Journal sections, live progress, still reading, explicit
refresh with keyboard focus and zero inference/errors passed. Both final
screenshots were visually reviewed; no owned process groups remain. Neither
earlier timeout is rewritten as a passing run.

Verification uses 56 targeted projection/journal tests, application and focused
browser-spec TypeScript, version/boundary checks and a production build. The
single built-app case checks original event identities and reasons, separate
imagined stories, desktop/320px layout, stable reading while play continues,
explicit refresh, unchanged paused state and no inference. Six legacy browser
assertions now read their exact mechanical/Chronicle receipts in the shared
surface instead of the removed duplicate lists. No long-running qualification
suite is added to per-feature CI.

## September 7 narrator follow-up — separate storage limits from writing quality

The 135M assistant-prefill trial retained names/facts in host-supplied openings,
but both generated suffixes remained factual recaps without emotion. Root and
the independent reviewer did not count those openings as model creativity.
The subsequent 360M trial stopped before inference when incognito CacheStorage
rejected its 364,564,671-byte weight file. That is not a literary result.

The existing harness used Playwright's nonpersistent context. Primary-source
review found that Chromium's memory-only CacheStorage chooses an INT_MAX-sized
backend whose individual entries are limited to one eighth of that capacity.
This strongly explains the size-dependent failure; the exact shipped native
error path was not instrumented. One separately recorded temporary persistent
profile changed only the storage condition. It cached all seven files and
restored the candidate offline in 15.998s. The owned test profile was removed
after browser closure; staged weights and user profiles were not touched.

The corrected test finally measured actual writing: 139 input tokens, 21 output
tokens, 44.674s, repeating `Mara beside Rowan (injured)` twice. The production
cleaner returned null, so nothing entered the journal and the second scene was
not attempted. There is no model promotion or player-facing model/cache change.
The [immutable receipt](tools/creative-story-probe/emotion-360m-persistent-report-2026-09-07T17-54-55-497Z-8adb30bf-8a40-4d87-abc2-ce261fdf1811.json)
and [source-linked explanation](tools/creative-story-probe/README.md) preserve the
distinction. These finite opt-in probes are not added to per-feature Pages CI.
Reliable emotional continuity remains open; a model-loading fix is not a
storytelling-quality win.

## Periodic v0.5.112 council — characters before information walls

The compact portrait-vitals plan was recovered with `deja "compact portrait
vitals"` from session `2026-09-06T1`. This slice reuses the stable hero identity
color recipe, authoritative hero resources, public party projection and native
Adventure panels drawer. Ordinary Watch and Focus share a compact character
strip and one current status. Retained canvas analytical groups are hidden in
both Watch layouts; actors, effects, vitals and cutaways are not those groups.

Independent review identified details with no equivalent inspection home:
current XP threshold, derived combat totals, upcoming turns and immediate
autonomous rationale. Those detailed HUD/Chronicle nodes remain deliberately
accessible in Adventure panels, including desktop. Inventory, Skills, Journal
and Map already preserve the other equipment, ability, oath and route details.
Zero-health injured companions must not become a death label, and the public
party projection supplies no mana to invent. Existing injury/arrival wording,
exact numeric resources and stable named portraits accompany color. The change
must preserve Pause and same-button keyboard Focus through drawer transitions.

Source review caught the intermission dialog living outside the app; its real
app-state flag now suppresses the strip. Screenshot review caught the old mana
class having no color rule: mana now uses the established blue combat-meter
palette, distinct from red health. Phone Watch no longer squeezes seven tiny
navigation labels into a row; the readable, touch-sized toolbar remains inside
the explicit drawer and inspection views. A browser check exposed deferred
drawer focus restoration racing the next Focus action. Restoration now happens
synchronously after the drawer closes and the original nodes are restored.

The focused checks cover 27 projection/visibility tests, application and
browser-spec TypeScript, boundary/version checks and a production build. The
built-app proof uses a real Pattern Duel and a saved injured recruited companion,
at 1280px and 320px. It checks exact named resources, absence of invented mana or
death, stage/ribbon clearance, Character detail access, Escape/focus handoff and
unchanged paused canonical state, without loading a model. It is not a new
workday/replay/storage qualification campaign.

The final built-app proof passed in 129.990s after the focus correction; all four
desktop/phone screenshots were reviewed. Feature commit `0ccd7ba` passed
[Pages CI](https://github.com/huntergdavis/the-grind-2/actions/runs/34149289903).
The public site then passed 15/15 checks in 28.134s against the exact reviewed
JavaScript fingerprint, including both viewport sizes, retained details,
Escape focus and zero narrator requests/workers in No LLM mode. The initial
quick live check read Pause before an in-flight step settled; its corrected
check waits for the existing Resume state, without changing application code.

The parallel writing experiment is separate: previous-story context is wired,
but v0.5.111 real generated prose failed both emotional and factual continuity.
The compact interface is not counted as a model-quality improvement.

## Periodic v0.5.111 council — carry a feeling into the next scene

The journal now supplies bounded prior prose at the actual writer boundary.
Selection uses exact campaign/source identity and canonical tick ordering, not
generation wall time. The latest earlier excerpt stays; another favors the
current companion or location. Complete sentences and named paired voices are
preserved, with at most two 240-character excerpts. Both accepted LLM and authored
passages remain imagined interpretation, not canonical history.

Each current/milestone candidate builds its complete prompt before awaiting the
DM choice. Later journal writes cannot replace the selected scene's memory.
The final message retains all current public facts; optional earlier messages
are labeled and quoted as imagined data. The exact tokenizer removes oldest
history if necessary without raising the 1,024-token input or 64-token output
limit. No additional inference, download, HUD, save migration or backend is
introduced. No LLM keeps the callback inactive and reading the archive stays
independent of model activation.

This reuses the earlier continuity request recovered by
`deja "the_grind_2 narrative continuity previous stories"` from session
`2026-09-03T0`, the v0.5.109 journal's speaker-preserving projection, and the
controller's existing synchronous per-candidate prompt preparation. Review
caught the old per-scene repetition check forgetting the supplied prior story;
the final guard rejects exact copies against the selected candidate's frozen
excerpts using existing skip/recovery behavior, without fuzzy prose restrictions.
A completed model call is not by itself evidence of coherent or improved storytelling.

The real two-story chain confirmed the data path, not narrative quality. One
cache-only worker wrote two passages offline; the first accepted 192-character
passage was selected unchanged into the second prompt. Actual input/output
counts were 199/42 then 289/41; writes took 53.121s and 57.682s. The first
invented England and years of shared travel. The second added a field/horses
while dropping names, arrival, injury and emotional development. Both therefore
fail the qualitative check. The exact-copy guard did not trigger because they
were distinct passages. No extra model attempt was made to seek a better sample.
The [raw receipt](tools/creative-story-probe/successive-story-report-2026-09-07T16-44-22-792Z-7cb78e26-3054-4aad-ba4d-93b6bcf7afbb.json)
retains prompts, outputs and the zero-network/clean-closure evidence. A separate
earlier preflight failure counted two static Vite transforms as two runtime
workers; it stopped before browser/model creation and its receipt is preserved.
The corrected probe observed two build transforms but exactly one runtime worker.

Release checks passed: 236 focused tests across six narrator/journal suites,
application and browser-spec TypeScript, boundary/version checks, and production
build. One built-app case verified actual journal-to-writer prompt wiring,
cross-campaign/future exclusion, exact source archiving and the mobile reading
surface with a stubbed completion; it is not counted as model-quality evidence.

## Periodic v0.5.110 council — one-click Focus, no escaping battle panels

Read-only review traced the confirmed leak to Pixi information rails: native
HUD panels already obeyed Focus, but battle threat/TURN receipts and Pattern
Duel analysis were drawn unconditionally inside the canvas. Information-only
retained containers now follow chrome visibility; layout refresh changes their
visibility while paused without rebuilding actors or restarting cues. Scene
clear/disposal resets tracking. Attacks, vital/status cues, stance effects and
all typed narrative/canonical cutaways stay outside those information groups.

The same top-level Focus button stays reachable in both control strips and
retains keyboard focus after toggling. Passive recaps no longer open over Focus;
unread records remain available through explicit Adventure panels. The initial
portrait/resource and shared-status-log ideas remain subsequent vertical slices,
not another wholesale UI rewrite bundled into this correction.

The user's ignored local Pattern Duel screenshot confirms that this is redundant
information competing with characters, not a shortage of screen pixels. The
same visual review caught fixed navigation covering scrolled Journal text;
the inspection viewport now starts below the measured chrome, including wrapped
mobile navigation. Drawer flow remains separate. The backlog records compact
portrait vitals, one shared status/history surface and progressive disclosure.

`deja "the_grind_2 focus toggle panels"` returned no implementation match;
the review used existing Focus, renderer and browser-test source. Browser work
reuses Stage Focus decisions from session `01a06835-15f`. The real paused-battle
and Pattern Duel proof checks retained information visibility rather than
assuming a hidden HTML HUD means the canvas is also clear.

Verification: 52 focused tests across six suites, application/spec TypeScript
and the production build passed. The real-browser journal reading/export case
passed at 320/960px. The initial Focus case caught an obsolete drawer-only
`display: none` rule; removing it restored actual keyboard reachability. The
single affected case then passed for battle and Pattern Duel at 320/1280px,
including unchanged paused state, the mobile drawer exit and zero model work.
The failed receipt was retained; no broad rerun or model probe was added.

## Periodic v0.5.109 council — keep the words, keep the voices

The archive hooks accepted completion, not just presentation: a story waiting
behind combat can still be read after reload. Exact campaign/source identity
prevents duplicates; actual display only marks the existing entry. Stale,
cancelled and rejected drafts are excluded. Authored recovery is labelled, never
counted as generated prose. The journal uses bounded browser storage separately
from canonical saves, preserves corrupt/unreadable storage, and honestly offers
session-only reading/export when storage fails.

Independent review caught paired first-person thoughts losing their character
names when only the joined prose was archived. The final projection preserves
the two validated named voices in both reading and export; ordinary prose is
never heuristically split into speakers. Journal gains a quiet section selector,
not another top-level toolbar button or fighting overlay. Focused lifecycle,
storage and one actual-app browser case cover the slice; no endurance matrix or
model download is needed to prove archive plumbing. This does not claim improved
model creativity or cross-story coherence: bounded prompt continuity follows.

`deja "the_grind_2 persistent narrative journal previous narratives coherence"`
returned no match; the existing director, Last story and Journal source are the
implementation references. The storage work also reused preference-recovery
conventions recovered from session `2026-09-03T0`.

## Periodic v0.5.108 council — viewer-controlled adventure speed

The runtime reviewer confirmed that the seven Menu presets replace one existing
interval, with no stacked timers, tick batching, changed rules or missed-tick debt.
Pause, startup, hidden pages, active steps, interactions and cutaways keep their
existing admission guards. Reading and LLM cadence do not accelerate; neither
does offline catch-up. The developer fast URL caps the interval rather than
multiplying 100x a second time. The storage review caught an initial remembered
claim without confirmed storage access; neutral conditional wording resolves it.

The independent CI audit found the prior Pages job took 5m12s, with 152.55s in
seven historical evidence-tool suites. These test receipts/provenance/tamper
handling, not fresh model writing or hours of gameplay. Endurance matrices are
roadmap targets, not per-feature CI jobs. Keep focused local checks proportional
to this feature and retain a separate future fast-path/full-tooling split; do
not delete meaningful game/save tests or block the requested feature on that work.

This slice reuses the existing timer/pause ownership and Menu style plus the
speed request recovered with `deja "the_grind_2 simulation speed selector"`
from session `2026-09-03T0`. The narrative journal and bounded continuity follow.

## Periodic v0.5.107 council — finish the passage, preserve the quiet

The narrative review prioritized completed generated prose over more authored
templates. The runtime slice stops after two established sentences using the
same extraction as the display cleaner. The independent review caught a plural
possessive inside single-quoted dialogue being mistaken for a closing quote;
the final conservative guard and straight/curly regressions resolve it. Prompt
exclusion, per-write reset, direction calls and the existing 64-token cap remain.

One isolated real-model comparison preserved the accepted passage with 64 versus
38 generated tokens and measured 62.042 versus 47.285 seconds. Baseline-first
ordering and cache restoration limit timing claims. Its source hash predates
the stricter apostrophe safeguard; final tests/replay are separate evidence.
The visual review uses a single actual battle-to-scroll case at desktop and
320-pixel width, not another HUD. No production inference is mocked in the
matched probe; only inference is mocked in the actual-app presentation fixture.

A separate streamed Qwen diagnostic still produced no observable text at its
180-second diagnostic deadline. Preserve the failed receipt and investigate the
pinned native RPC/inference boundary; neither zero text nor authored recovery
establishes generated literary quality. The narrative reviewer confirmed that
an oath headline is not verbatim spoken dialogue: one verified factual callback
needs an explicit context contract before longer emotional or relationship arcs.

This reuses session `01a06835-15f` via `deja "the_grind_2 writer latency"`.
Full CI, release and live verification are recorded in the release handoff.

## Periodic v0.5.106 council — character continuity through goodbye

The writing review adds eight original second sentences to the existing farewell
openings. Recorded values shape the hero's concern without assigning a companion
personality, promising recovery or changing the wounded-but-alive departure.
All three neutral paragraphs and the preceding first-victory rotation remain exact.

Independent integration review found no blockers: attribution is bound to authored
origin, exact text and the captured hero through controller, director, UI and
Last story. Cancellation, current-scene selection and replacement cannot inherit
it. Public records, saves and inference calls remain unchanged. The visual review
keeps the explanation in the existing folded source, with no new status surface.

This reuses the farewell/recorded-value decisions from session `01a06835-15f`,
recovered with `deja "farewell values"`. A separate bounded stronger-writer
experiment must report actual prose and timing, not count these authored lines
as LLM progress. Its result and release verification are recorded separately.

## Periodic v0.5.105 council — values without invented personality

The writing reviewer supplies 16 original hero thoughts shaped by recorded
curiosity, loyalty, mercy or courage and the captured healthy/injured context.
Selection uses only the actual value set; order and duplicates cannot imply
dominance, and missing or malformed values retain neutral writing. Companion
thoughts remain unchanged because the viewpoint provides no companion traits.
This adds imagined interiority, not a biography, durable emotion or relationship.

The runtime slice captures that authored inspiration before awaiting inference
and preserves it through the director and Last story. Accepted model prose,
ordinary staging, the one-worker lifecycle, first-victory binding and recovery
permission remain separate. Later value mutations cannot rewrite a held scene.

The visual reviewer puts the explanation in the existing folded source only.
The two quiet role labels, readable ink reveal, trust/care accents and normal
controls stay unchanged. Unknown metadata, mismatched prose and model-origin
passages cannot claim this authored value inspiration.

The model reviewer separately tests two fixed ordinary-prose requests with
curiosity/mercy and one mapped hint. This is not an untreated A/B, an automatic
promotion rule or evidence that an authored pair was generated. Preserve raw
outputs and judge literary grounding independently of text hygiene.

The actual run produced zero of two grounded value-shaped passages despite both
passing text cleanup. The candidate was not promoted; no retry followed. The
visible authored feature and the failed model experiment remain clearly separate.

This reuses the Shared road/recorded-value discussion from session `01a06835-15f`
via `deja`, and the official Wildermyth character-input research. Full narrative
arcs, durable callbacks and stronger generated prose remain explicitly open.

## Periodic v0.5.104 council — let Shared road mean companion priority

The runtime and provenance review separates a user's deliberate focus from model
reasoning. When two valid public moments compete, stored Shared road prioritizes
the captured companion milestone even if the current party is now solo. Only
the moment-choice call is omitted; local stage choice and ordinary prose remain.
Both source ticks retire together, and expiry/cancellation keep their existing
one-slot lifecycle. No additional model, save field or relationship meter appears.

The visual review puts the focus credit inside the existing folded source and
retains it in Last story. Captions, authorship and staging remain independent.
The new canonical browser case must prove that a distinct newer solo source was
actually eligible, not mistake a single-source request for prioritization.

The independent four-choice model probe picked label 1 every time; reversing
the two fixed pairs reversed their semantic outcomes. This small result does
not establish universal bias or better relevance, and position remains
confounded with numeral. No retry, prose experiment or production prompt change
followed. Keep stronger generated writing and persistent emotional arcs open.

This reuses session `01a06835-15f`, recalled with `deja "moment preference"`,
and the official Hades contextual-priority research. Release verification and
the immutable experiment are recorded in the narrative release note.

## Periodic v0.5.103 council — two viewpoints on the shared road

The narrative reviewer authored six original first-person thought pairs and
strengthened the first-victory boundary to prove two unique, distinct actual
participants. Hero and Companion may share a visible name but cannot be the
same actor. The captured public condition shapes trust/care themes; no imagined
thought becomes a permanent mood, relationship score or combat fact.

The visual reviewer keeps both named roles inside the existing parchment and
word-reveal scheduler. Labels and restrained rules separate the perspectives
without chat bubbles, portrait downloads or another overlay. Hold, Last story
and reduced motion retain full readable text. Metadata must match the exact
combined passage before the renderer assigns roles; ordinary prose is not split
and relabelled as two characters.

The runtime slice reuses the remembered Shared road focus, one milestone slot,
authored-recovery permission and captured source. Inner life remains single
voice; current-source selection cannot inherit the victory duet. Quiet, Scene,
No LLM, cancellation and runtime failure remain outside authored recovery.
Last story copies the pair without inference or save mutation. This reuses the
Shared road decisions recovered from session `01a06835-15f` with `deja`.

One bounded healthy/injured candidate experiment separately assesses actual
local-model two-role output. Keep its raw result distinct from authored recovery
and mocked-inference browser evidence; do not call a role-labelled layout an
improvement in generated prose. Real sample, browser, full CI and live-version
results are recorded in the narrative release note and final handoff.

Final slice verdict: ship the authored duet and quiet two-role presentation.
The real model trial failed both fixtures and was not promoted; its prompt is
absent from the production bundle. The canonical actual-app browser proof passed
with desktop/mobile review, exact source, one write and no extra replay requests.
The earlier pre-browser collection failure required only a test import repair,
not an application change. Full narrative arcs and generated duet quality remain
explicitly open.

## Periodic v0.5.102 council — first victory together

The provenance reviewer bound the milestone to a real final combat action with
the same active participant changing from zero victories to one. Canonical
replay, healthy/injured fixtures, loaded-state roundtrips and malformed-boundary
tests distinguish this from loot, later wins or a copied counter. Six original
authored reactions keep imagined trust/care separate from durable game state.

The independent runtime review found no blocking source-binding or lifecycle
issues. Its 27 controller regressions check both moment choices, immutable
capture, unchanged prose/stage prompts, malformed bindings, quiet/Scene behavior,
revoked recovery permission, cancellation and fatal errors. The one existing
milestone slot, source watermark and safe-break cadence remain in charge.

The visual reviewer uses the existing caption, folded public record and accent;
there is no new battlefield overlay or relationship score. Accepted model prose
may carry verified host context without inheriting authored attribution or a
false claim of model selection. Last story retains the exact passage and source.

The single real offline two-pair probe chose current/current, not either first
victory. This supports functional local selection only. Queue a counterbalanced
label experiment before claiming improved priority; stronger prose, distinct
two-character voices, factual memory and lasting emotional arcs remain open.
This reuses the September 6/September 3/August 30 first-victory discussions
recovered with `deja "First victory together"` and the prior one-slot director.

Release acceptance additionally requires the canonical actual-app vertical
case, desktop/320px review, full GitHub check/deploy and exact live-site version
verification recorded in the release handoff.

## Decision summary

The Grind 2 should not generate an endless pile of disposable content. It
should build an accumulating history in which old people, places, equipment,
relationships, rivals, and events acquire new meaning.

The current plan has a strong deterministic simulation spine, but its original
exit target proved only a 10–15-minute procedural adventure. The council has
amended it for a different product: a fully client-side RPG screensaver that can
run visibly through a workday and preserve a coherent named campaign for years.

The final position is:

- "Forever" means durable continuity, bounded state, all-day visible play, and
  deterministic catch-up. It does not promise continuous execution while a tab
  is hidden or closed.
- The **Game Master** is the whole deterministic game stack. No LLM owns game
  truth, balance, memory, actor choices, or long-range story.
- A deterministic **Actor Policy** chooses what characters do from facts they
  know and values they hold. The Campaign Director can create pressure and
  opportunities; it cannot puppet a betrayal or value reversal.
- SmolLM2-360M is an optional, explicitly downloaded language enhancement to be
  evaluated task by task after the complete AI-off vertical slice. Evidence,
  not its appealing size or the title "GM," determines whether any capability
  is recommended.
- Eternal Hero is the safe default. Legacy is opt-in; fully Mortal play remains
  a later explicit opt-in. Danger comes from lasting loss and changed history,
  not surprise deletion of a years-old hero.
- Progression, active content, history working sets, model work, storage, and
  visual resources are all bounded. The world grows through changing context,
  combinations, responsibilities, eras, relationships, and provenance—not
  infinite stats or an infinite hotbar.
- Living Pixel Chronicle is the provisional visual direction, subject to
  golden-scene validation. Ninja Adventure is a curated scaffold, not the
  finished identity.

## Method

Six independent specialists red-teamed the existing `PLAN.md`:

- [A1] comic-book/D&D continuity and long-campaign critic;
- [A2] embodied RPG hero and lived-experience critic;
- [A3] systems game designer;
- [A4] visual designer and permissive-asset forager;
- [A5] workday spectator and wow-factor critic;
- [A6] JavaScript, browser, persistence, and web-graphics engineer.

The facilitator read each first-round report, produced a synthesis with 17
contested questions, then every specialist responded to all questions and to
the other roles' concerns. This report adjudicates those six reconciliation
responses. The companion backlog contains the implementation work and coverage
matrix.

All agents searched the local cross-session recall index first and reported no
relevant prior-session result. No recalled recommendation is being passed off
as new evidence. The work explicitly reuses the original game's useful ideas:

- [automatic state machine and milestone saves](https://github.com/huntergdavis/The_Grind/blob/master/src/com/hunterdavis/thegrind/Panel.java#L186-L415);
- [fixed update/render loop](https://github.com/huntergdavis/The_Grind/blob/master/src/com/hunterdavis/thegrind/CanvasThread.java#L34-L157);
- [persistent selectable character model](https://github.com/huntergdavis/The_Grind/blob/master/src/com/hunterdavis/thegrind/Player.java#L9-L299);
- [SQLite save schema](https://github.com/huntergdavis/The_Grind/blob/master/src/com/hunterdavis/thegrind/InventorySQLHelper.java#L8-L75);
- [curated content catalogues](https://github.com/huntergdavis/The_Grind/blob/master/res/values/strings.xml#L8-L1957);
- the always-visible what/where/why/now hierarchy shown in the original
  [screenshots](https://github.com/huntergdavis/The_Grind/tree/master/deploy) and
  [drawing code](https://github.com/huntergdavis/The_Grind/blob/master/src/com/hunterdavis/thegrind/Panel.java#L659-L950).

## Each role's red-team verdict

### A1 — Comic/D&D continuity

Verdict: the plan had the bones of a campaign but treated eternity like a
longer quest. A 360M model cast as sovereign GM would be the weakest link.
Persistent every-creature state, endless vertical levels, compulsory dungeon
bosses, cutscene-immunity villains, and an unbounded canon would eventually
collapse.

Material contribution retained:

- deterministic GM stack and strict model authority contract;
- adventure/saga/era hierarchy, promise ledger, faction fronts, authored plot
  kernels, earned betrayals, rival survival rules, and dungeon history/ecology;
- vertically bounded progression with bounded active and retained horizontal
  sets;
- explicit catch-up significance thresholds;
- century-scale storage concern and normative artifact-retention matrix;
- social/non-combat Phase 1 kernel;
- semantic visual recipes rather than atlas coordinates;
- provenance-bearing cross-campaign legends rather than meaningless flavor.

### A2 — Embodied RPG hero

Verdict: the plan described attributes and progression but not yet a life. The
hero lacked an inner self, relationships were scores rather than bonds, places
were useful rather than meaningful, and invisible autoplay choices risked
feeling puppeted.

Material contribution retained:

- a deterministic Actor Policy separated from campaign pacing;
- values, beliefs, loyalties, fears, commitments, stress, known alternatives,
  and evidence-backed decision rationales;
- asymmetric relationships, homes, rituals, rest, grief, recovery, and
  significance-aware catch-up;
- Eternal/Legacy/Mortal lifecycle policies and lasting non-terminal danger;
- exact retention for referenced vows, letters, clues, inscriptions, and
  pivotal dialogue;
- separate sensory and emotional intensity;
- identity-preserving entity promotion/demotion and re-encounter tests.

### A3 — Systems game design

Verdict: the plan had an excellent technical spine and an extensible demo, but
not yet proven multi-horizon play. Procedural variety could become renamed
sameness; modules could inflate each other; autoplay could conceal agency; and
constant spectacle could become wallpaper.

Material contribution retained:

- moment, scene, adventure, workday, saga, and lifetime loops that feed one
  another;
- deterministic Campaign Director using target envelopes, cooldowns, budgets,
  and reason codes rather than one optimized "fun score";
- failure/recovery, fronts, adaptive rivals, memory crystallization, living
  equipment, world eras, and a chronicle/museum;
- module admission rules requiring a new decision shape, two real system
  interactions, a sink/tradeoff, and visible consequence;
- representative long-run simulation and repetition tests;
- staged P0 contracts followed by P1 production proof.

### A4 — Visual design and asset foraging

Verdict: the plan named visual modes without defining an art language, camera
grammar, identity pipeline, licensing manifest, accessibility projection, or
resource budgets. Without those, a structurally good world would look like a
collage of asset packs.

Material contribution retained:

- provisional Living Pixel Chronicle direction;
- 16×16-rooted world art and 320×180 landscape reference camera, with native
  DOM text and explicit responsive portrait composition;
- stable cross-mode identity recipes, custom portrait parts, six side-view
  battle puppets in P1, landmark continuity, and one dominant hero effect per
  shot;
- verified/conditional/rejected asset shortlist and exact license caveats;
- bundle, atlas, texture, draw, particle, actor, accessibility, and context-loss
  budgets;
- Campaign Director emits factual urgency only; Spectator Director alone owns
  camera, shot, effect, transition, and asset-cost choices.

### A5 — Workday spectator

Verdict: multiple scene modes do not by themselves make an eight-hour
screensaver. The plan needed a glance contract, visual sentences, interruption
recaps, attention rhythm, repetition memory, work-safe defaults, burn-in
controls, power measurements, and an alternate objective that actually passes
through the presentation pipeline.

Material contribution retained:

- three-second and ten-second comprehension gates;
- semantic scene fingerprints instead of forced mode churn;
- living atlas, town diorama, dungeon thread, tactical theater, camp
  constellation, chronicle, relationship/bestiary/legacy views;
- rare earned spectacle with quiet but purposeful ambient presentation;
- camera-motion, meaning-bearing dialogue dwell, burn-in, OLED, battery/power,
  and percentile frame gates;
- a minimally presented non-dungeon Phase 1 kernel.

### A6 — JavaScript/browser/web graphics

Verdict: a page cannot promise hidden execution; `sessionStorage` cannot keep a
years-old hero; workers do not create GPU capacity; append-only forever is a
storage failure; and informal module/worker boundaries would become a
distributed monolith.

Material contribution retained:

- main-thread Pixi WebGL, dedicated simulation and narrator workers, and a
  cache-only service worker;
- sole state ownership, exclusive Web Lock, runtime-validated revisioned IPC,
  bounded queues, keyed RNG, canonical serialization, and enforced dependency
  direction;
- transactionally installed hash-chained segments, two verified heads,
  copy/migrate/validate/switch migrations, quota recovery, and export/import;
- safe service-worker activation and project-prefixed caches;
- Runtime Governor, context/device-loss recovery, task-specific LLM token
  bucket, exact reference-device protocol, and percentile performance gates;
- security and accessibility boundaries for model text, saves, content packs,
  CSP, motion, flashes, and audio.

## Final consensus

The council unanimously or near-unanimously agrees that:

1. deterministic code owns canon, legality, math, consequences, balance, actor
   knowledge, and persistence;
2. the local model is optional and never required for story correctness;
3. web "forever" is durable continuity and bounded catch-up, not continuous
   hidden execution;
4. personhood, narrative ledgers, progression caps, fidelity tiers, persistence,
   and visual identity require thin Phase 0 schemas because they are expensive
   to retrofit;
5. production art, five polished scenes, representative graphical soaks, and
   broad content validation belong in Phase 1, not as prerequisites to first
   pixels;
6. Eternal Hero is default, but failure must leave visible, durable history;
7. no mechanically consequential progression or active-content set is
   unbounded;
8. exact recent history can compact into durable semantic evidence and pinned
   artifacts; ordinary prose and diagnostics can expire;
9. "real" towns, NPCs, and monsters mean persistent causality at tiered
   fidelity, not equal simulation cost for every fish and peasant;
10. a workday presentation needs deliberate calm, readable choices, recaps,
    rare spectacle, and measured repetition—not random mode rotation;
11. art consistency, accessible native text, asset provenance, and strict
    budgets are product architecture;
12. every new subsystem must deepen the shared world instead of becoming an
    isolated currency faucet.

## Conflicts and final resolution

### 1. Is the model the Game Master?

Resolution: no. **Game Master** is the user-facing umbrella for the deterministic
stack plus optional language services. Product copy may give that stack a
personality. Diagnostics must identify the actual component and reason code.

SmolLM2 may render short language or, if a separately evaluated task passes,
rank a small allowlisted set. It cannot invent a candidate, repair an illegal
candidate by changing truth, exercise a veto, write state, or remember canon
from transcript context. [A1][A2][A3][A4][A5][A6]

### 2. Who chooses a character's action?

Resolution: add deterministic **Actor Policy**. The Campaign Director exposes
legal situations and opportunities; Rules Engine validates commands; Actor
Policy chooses among actor-known alternatives from goals, values, beliefs,
commitments, relationships, stress, and tactics. Spectator and language
services cannot change the choice. [A2], supported by [A1][A3][A5][A6]

### 3. What does forever mean in a browser?

Resolution: visible play can run all day; hidden/closed execution is not
promised. On visibility loss the app durably commits or rolls back the pending
beat, stops rendering/inference, and never relies on an unload save. On resume
it journals one wall-clock observation and performs bounded hierarchical
catch-up. This follows [Chrome Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api),
[MDN Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API),
and [IndexedDB shutdown guidance](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB).

Every event type declares:

```ts
type AttentionPolicy =
  | "backgroundSafe"
  | "queueForPresentation"
  | "forbiddenDuringCatchUp";
```

It also declares reversibility, maximum entity fidelity affected, threshold
behavior, maximum credited duration, aggregation rule, and queued fallback.
Catch-up may advance routine travel, passive recovery, production, weather,
seasons, markets, aggregate ecology, schedules, construction, and faction
pressure only below named thresholds. It stops before named injury/death,
capture, betrayal, relationship milestones, boss/rival outcomes, class/loadout
branches, unique items, named-place control/destruction, revelations, actor
promotion, hook closure, era transition, or any informed irreversible choice.
Queued attention events remain bounded and causally ordered. [A1][A2][A3][A4][A5][A6]

### 4. Eternal hero or mortality?

Resolution: save-versioned policies:

- **Eternal Hero** — default; no involuntary protagonist terminal death;
- **Legacy** — opt-in retirement/death and succession in the same world;
- **Mortal** — reserved for a later explicit opt-in.

Eternal Hero still permits failed promises, permanently missed opportunities,
scars, changed abilities, debt, capture, damaged homes, lost office/reputation,
unique-item loss/transformation, companion estrangement/departure, rival/front
victory, altered law, and changed towns. Recovery has cost and may not restore
the old status quo. [A1][A2][A3][A4][A5][A6]

### 5. Can breadth grow without bound?

Resolution: no gameplay-effective or active-content axis is unbounded. The
final wording is:

> Progression is vertically bounded and indefinitely extensible horizontally,
> with bounded active loadouts, working sets, detailed memories, inventories,
> collections, relationships, promises, institutions, and economic influence.

Action economy, multiplicative stacks, active statuses, prepared abilities,
mechanically active traits, scars, titles, pets, currencies, and inventories
all have explicit caps plus replacement, retirement, or archive rules. Old
wolves stay weak. Monotonic order markers such as simulation tick and era
ordinal use a versioned large-integer codec, add no power, and never require
iteration from zero. [A1][A2][A3][A4][A5][A6]

### 6. How much history is retained?

Resolution: distinguish semantic evidence from raw presentation.

Retention classes are:

- `canonicalEvidence` — current truth and identity-bearing evidence;
- `chronicleArtifact` — exact bounded artifact bytes with provenance;
- `recentProse` — short-lived replay/debug cache;
- `ephemeralProse` — discardable barks/drafts;
- `diagnostics` — bounded ring buffers;
- `optionalArchive` — exportable full-detail history.

Canonical evidence preserves campaign identity/version provenance, named-entity
identity/lifecycle, major choices and rationales, promises and closure reasons,
relationship milestones, unique-item ownership/transformation, irreversible
place/faction/institution changes, saga/era conclusions, and structural model
proposals that affected selection.

Exact artifact bytes are pinned for referenced vows, contracts, letters,
prophecies, clues/passwords, inscriptions, epitaphs, named-item dedications,
chapter titles, player favorites, and pivotal dialogue later cited by memory or
promise. Ordinary barks, full combat transcripts, unused drafts, and camera
choices may be purged. Pinning has visible slot/quota rules; quota pressure
offers export or explicit unpinning, never silent deletion.

The original 250 MB/ten-year gate was challenged as incompatible with the
forever claim. Final target: the mandatory campaign record is at most 100 MB
after 100 accelerated campaign-years and averages at most 1 MB/year after
warm-up, excluding model/asset caches and optional archives. This is a strict
target to validate, not a claim already proven. If the hot record approaches
its budget, older detail must be exported and replaced by verified era evidence
and summaries before play continues; the application must not silently erase a
referenced artifact. [A1 minority concern accepted; A2][A3][A4][A5][A6]

### 7. Who owns campaign pacing, presentation, and performance?

Resolution: three separate components.

- **Campaign Director:** legal objective candidates, promise/front state,
  difficulty bands, recovery debt, systemic repetition, causal readiness, and
  reason-coded scheduling. It submits commands; Rules Engine alone commits.
- **Spectator Director:** factual focus projection, mode, lens, camera, shot,
  dwell, transition, effect, asset-cost choice, sensory intensity, recaps,
  presentation repetition, and what the viewer has seen.
- **Runtime Governor:** frame deadlines, worker health, memory/storage pressure,
  save latency, context/device loss, inference duty, and fidelity/profile
  fallback. It may make execution cheaper, never change a canonical outcome.

Campaign Director may emit factual focus, dramatic priority, stakes class, and
presentation deadline. It does not choose a camera, shot, effect, transition,
or asset. No component optimizes one scalar fun score. Soft targets are rolling
diagnostics/envelopes subordinate to legality, actor integrity, causal
prerequisites, and earned consequences. [A1][A2][A3][A4][A5][A6]

### 8. How much spectacle and repetition?

Resolution: measure **sensory** and **emotional** intensity separately. A quiet
funeral may be emotionally severe and visually calm.

Over rolling one-, two-, and eight-hour foreground reports, calm sensory
presentation targets 65–80%, high sensory presentation is capped at 8%, and
medium is the remainder with a 15–30% target where the bands are compatible.
These are tuning diagnostics, not quotas that manufacture scenes. The hard
safety rule is no uninterrupted high-sensory burst over 12 seconds; a longer
battle must breathe through planning, reaction, and consequence. At least 45
seconds of low-sensory recovery is a target after a true climax. An interesting
ambient observation may satisfy a 2–5-minute beat; a 20–40-minute peak is an
opportunity/cooldown, never an obligation.

No accidental exact semantic scene fingerprint repeats inside 20 minutes.
Coherent multi-shot sequences, rituals, callbacks, match cuts, and before/after
comparisons may reuse framing when tagged with sequence/motif/comparison IDs,
change factual context, and show a visible delta. Forced renderer changes to
satisfy a quota fail review. [A1][A2][A3][A4][A5][A6]

### 9. What must be legible at a glance?

Resolution: restore a two-tier test.

- Within three seconds, at least 80% of fresh viewers identify the focused
  party/actor, place, current action, and latest material change.
- Within ten seconds, at least 80% additionally identify immediate goal and
  stakes and, during a major decision, the chosen rationale.

Always or immediately glance-visible: party/focus, place, action, goal, one
stake, latest consequence, relevant speaker/reaction, and critical tactical
status only when needed. Alternatives and one-line rationale appear around
major deliberation, then collapse into the Chronicle. Full stats, formulas,
inventory, skill tree, relationship evidence, promise ledger, actor beliefs,
maps, history, and director traces remain inspectable. Meaning-bearing dialogue
holds for at least four seconds plus roughly 180 words/minute; two seconds is
permitted only for nonessential barks. [A1][A2][A3][A4][A5][A6]

### 10. Is Living Pixel Chronicle final?

Resolution: it is the **versioned provisional baseline**, not an irrevocably
frozen style. P0 creates reference mockups/contact sheets, semantic identity
contracts, and one executable responsive smoke scene. P1 golden scenes may
reject or refine the direction before broad production.

The 320×180 target is a landscape reference camera, not a forced aspect ratio.
Use integer nearest-neighbor scaling and letterboxing or world-viewport
extension on compatible desktop sizes. Portrait uses a distinct safe-zone-aware
composition and native DOM layout; it never squeezes a desktop dashboard or
blurs source pixels. DOM text remains native resolution and scalable.

Saves store semantic identity/landmark recipe IDs and traits—not atlas
coordinates, frames, or source-pack filenames. Repacking an atlas must preserve
equivalent appearance. [A1][A2][A3][A4][A5][A6]

### 11. Which performance targets are final?

Resolution: Workday 30 FPS is default, Eco 15–20 FPS is manual/automatic,
Showcase 60 FPS is optional, and Hidden renders zero frames. All numeric budgets
are provisional until measured on a reproducibly named machine. P0 must record
exact laptop SKU, CPU/GPU/driver, RAM, OS/browser builds, display/refresh,
brightness, plugged/battery state, power profile, and thermal conditions.

Retained budgets:

- app-shell JavaScript ≤350 KB gzip; shell art/fonts ≤2 MB compressed;
- first playable scene ≤10 MB; Phase 1 2D visuals ≤5 MB; base cache ≤10 MB;
- later visual packs ≤1.5 MB each; optional 3D proof ≤12 MB;
- atlas ≤2048²; texture allocation ≤64 MB with the model loaded and ≤96 MB
  without; no-model JS heap <192 MB after warm-up; measured game+model footprint
  <900 MB;
- Workday/Eco draw calls ≤200/100, particles ≤500/100, animated actors ≤80/30;
- main-thread render average ≤4 ms and p95 ≤6 ms; measurable GPU average ≤8 ms
  and p95 ≤12 ms;
- Workday game-owned frame production p95 ≤25 ms, p99 ≤33 ms, and <1% missed
  deadlines; Eco p95 ≤50 ms at 20 FPS or ≤66 ms at 15 FPS and <1% missed;
- Showcase p95 ≤16.7 ms, p99 ≤25 ms, and <2% missed is a best-effort profile,
  not a correctness gate;
- no more than one game-attributable >50 ms long task per ten steady-state
  minutes; post-warm-up heap slope <1 MB/hour;
- one-hour power above a static equivalent page ≤5 W Workday and ≤2.5 W Eco on
  the named machine where measurable; fixed-brightness battery drain is also
  reported, with <10%/hour Workday and <5%/hour Eco as secondary targets;
- GPU/VRAM numbers are reported only where supported; missing signals are
  explicitly unmeasured, never assumed passed.

### 12. Is SmolLM2-360M the default?

Resolution: no. It is the first **evaluation target** after the complete AI-off
P1 slice. The first download is explicit and shows its approximate 204 MB size,
storage impact, expected memory, removal control, and AI-off alternative. A
WebGPU capability probe is necessary but not evidence of narrative value.

Likely first tasks are short voice-card rewrites, relationship-specific barks,
letters, journals, dreams, item/monster observations, inscriptions, reactions,
and chapter headlines. Factual recaps stay deterministic initially. Advisor,
Critic, plot ranking, and visual-tag ranking are separate lower-confidence tasks
and remain disabled unless independently successful.

Each task requires at least 200 fixed paired samples over at least 20 seeds,
automated fact/knowledge/schema checks, and blinded human comparison with
deterministic templates. A task is recommendable only when:

- valid model output wins at least 60% of non-tied comparisons and the 95%
  confidence lower bound exceeds 50%;
- first-pass normalized schema validity is at least 99%;
- zero displayed/accepted fact or knowledge violations occur after validation;
- reference-hardware latency, memory, frame, energy, thermal, and duty budgets
  pass;
- missing WebGPU, failed/removed cache, malformed output, timeout, worker death,
  model-version change, or device loss immediately falls back to templates and
  preserves save validity.

Campaign code maintains at least three valid AI-independent scene candidates.
The Narrator may cache purgeable prose variants; presentation never waits for
them. Its token bucket allows a burst of two standard calls per ten minutes,
with sustained Workday ≤1,000 output tokens/hour and <3% inference duty, Eco
≤250 tokens/hour and <1% duty, and roughly 700 input/96 output tokens per
standard call. The Runtime Governor suspends inference on missed deadlines,
memory/quota pressure, worker loss, or GPU/context loss.

Primary sources: [SmolLM2-360M-Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct),
[WebLLM](https://github.com/mlc-ai/web-llm), and the
[WebLLM registry/cache configuration](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts).

### 13. How broad is Phase 1?

Resolution: one polished town→travel→dungeon→return adventure plus three
architecturally distinct simulation kernels:

1. expedition/discovery — routes, supplies, spatial uncertainty, and returned
   knowledge;
2. rescue/defense — deadline, protection/triage, partial success, and visible
   community consequence;
3. investigation/diplomacy — facts versus beliefs, testimony/trust, and a valid
   non-combat resolution.

The generic Adventure contract may not require a dungeon, combat encounter,
boss, or BossDefeated event. Run at least 30 seeds per kernel and demonstrate
success, partial-success, retreat, and failure. At least one kernel completes
without dungeon, boss, or combat and depends on knowledge/relationship
evidence. At least one alternate non-dungeon kernel passes minimally through
the real scene-contract/presentation pipeline and appears in the two-hour gate;
it does not require a second set of polished art. [A1][A2][A3][A4][A5][A6]

### 14. What belongs in P0?

Resolution: compatibility contracts and thin runnable proofs, not production
polish.

P0 retains lifecycle/authority/clocks/RNG/IPC/persistence/compaction contracts;
thin personhood, belief/memory/promise, fidelity, progression, scene, identity,
accessibility, security, provenance, resource, and diagnostics schemas; a
working transaction/replay/fault harness; reference mockups; one responsive
renderer and cross-mode identity smoke proof; and 10 seeds × 1,000 in-game days.

P1 owns all five polished anchor scenes at target viewports, production camera
grammar, identity collision review, full asset/contact-sheet work, 100 seeds ×
10,000 days, million-event replay/compaction, two/eight-hour rendered soaks, and
seven-day resume. P3 owns 100,000-generation-seed and full upgrade/failure
release matrices. No compatibility-bearing concern was deleted; gates moved to
the first phase where representative content makes them meaningful.

### 15. Are tiered entities still real?

Resolution: yes. Reality means continuous causality. Fidelity tiers are
`canonicalNamed`, `supporting`, `aggregate`, and `ephemeral`.

Promotion records stable origin/provenance and entity IDs, source
cohort/population, generator/content version, time/place, species/role/age,
visual/voice recipe, home/job/faction/ecology role, current condition/location,
possessions, knowledge, relationships, obligations, source events, and the
promotion cause. It atomically subtracts the actor from its aggregate.

Demotion keeps a compact identity shell: ID/aliases, status/location/last-seen,
visual/voice recipe, rehydration version, unique possessions, scars, bonds,
grievances, secrets, promises, relationships, chronicle links, aggregate
destination, and eligibility proof. An entity referenced by a promise,
relationship, unique item, named scar, viewer pin, or unresolved front cannot
demote below the fidelity needed to preserve it. Aggregate updates reserve named
actors so they cannot duplicate or die anonymously.

### 16. Should antagonist cutaways exist?

Resolution: `party-only` is default. Later `dramatic-irony` mode uses a typed
Viewer Disclosure Ledger and scenes clearly labeled "Meanwhile — unknown to
the party." Viewer facts never enter actor beliefs, Actor Policy inputs,
Narrator actor packets, Rules Engine knowledge checks, or party recaps until an
independent in-world transfer event occurs. Both presentation policies produce
the same canonical campaign and actor-choice hashes. [A2][A3][A4][A5][A6]

### 17. Can separate campaigns ever meet?

Resolution: independent campaign worlds do not share mutable state. A future
Hall of Legends may import an immutable, content-addressed `LegendCard` with
source campaign ID/hash. The receiving world can canonically contain the card
as a book, rumor, dream, monument, or claimed legend, but the foreign events do
not become objective receiving-world history. Actors learn it only through
explicit events. Deleting or changing the source cannot break the receiving
save. [A1 minority refinement accepted; compatible with A2][A3][A4][A5][A6]

## Corrected runtime and Game Master architecture

```text
Main thread
  App shell + Runtime Governor
  DOM accessibility / Chronicle
  Spectator Director -> validated presentation intent
  Pixi WebGL + Presentation Time
            ^
            | revisioned read-only projection patches (<=10 Hz)
            |
Dedicated simulation worker — sole WorldState owner and campaign writer
  Rules Engine — validates commands, commits events, reduces truth
  Campaign Director — ranks/submits legal opportunities
  Actor Policy — chooses actor actions from known legal alternatives
  Simulation Tick + World Clock + Attention Clock
  keyed/counter RNG + invariants + module scheduler
  IndexedDB transactions/compaction + exclusive campaign Web Lock
            |
            | bounded facts and enumerated IDs
            | normalized structural proposal journaled before use
            v
Dedicated narrator worker
  deterministic templates OR optional WebLLM task
  Narrator / separately gated Advisor / separately gated Critic
  no WorldState write, campaign IndexedDB write, or canonical authority

Service worker
  versioned static app/assets only
  no simulation, inference, campaign ownership, or unconditional skipWaiting
```

Canonical effects have one write path: validated Rules Engine commands/events.
Actor Policy is deterministic. Campaign Director reason codes cannot override
actor moral boundaries, combat results, causal prerequisites, or earned loss.
Spectator/Runtime-only changes produce the same canonical hash.

Worker envelopes carry protocol version, campaign ID, worker epoch, request ID,
expected revision, message kind, and runtime-validated payload. Duplicate,
stale, reordered, oversized, unknown, or wrong-version messages cannot mutate
state. Queues are bounded and backpressured.

Simulation reducers use sorted canonical serialization, stable scheduling,
integer/fixed-point outcomes where needed, and versioned keyed randomness such
as `random(seed, domain, entityId, tick, purpose, ordinal)`. `Math.random`,
ambient wall time, locale-sensitive ordering, DOM, Pixi, IndexedDB, and WebLLM
are forbidden in reducers.

Pixi stays on the main thread initially. OffscreenCanvas remains an
evidence-triggered optimization because moving rendering does not create more
physical GPU capacity. See [Pixi renderer guidance](https://pixijs.com/8.x/guides/components/renderers)
and [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas).

Campaigns use IndexedDB, not `sessionStorage`; the latter is only for disposable
tab UI. Use immutable 1–4 MB hash-chained event segments, at least two verified
heads, atomic install/head advance, copy→migrate→validate→switch migrations,
compaction after 10,000 events or 25 MB, project-prefixed caches, quota recovery,
explicit export/import, and an exclusive [Web Lock](https://www.w3.org/TR/web-locks/)
per campaign. Sources: [MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage),
[storage quota and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria),
and [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB).

The service worker caches static versioned resources only. It must not own
simulation or inference and must not unconditionally call `skipWaiting()`.
Updates install, wait, checkpoint at a safe boundary, activate, and reload.
See [service-worker lifecycle](https://web.dev/articles/service-worker-lifecycle)
and [safe PWA updates](https://web.dev/learn/pwa/update).

## Long-term game design

### Narrative horizons

`beat → scene → adventure → chapter → saga → era → legacy`

Every level declares an open dramatic question, entry conditions, eligible
constraints, escalation, closure, and maximum active lifetime. Active hooks are
bounded; a hook resolves, becomes dormant, or closes with a reason. Betrayal
requires motive, opportunity, at least two visible setups, cost, and aftermath.
Rivals recur only through valid survival/resources and visible adaptation.

### Personhood and relationships

Characters have drives, values, beliefs, loyalties, fears, preferences, moral
limits, commitments, intentions, stress, tactics, and evolving identity.
Relationships are asymmetric and evidence-backed: trust, respect, affection,
fear, dependence, shared rituals, obligations, grievances, forgiveness,
departure, reconciliation, and grief. Homes, favorite places, ordinary rest,
meals, hobbies, celebrations, and return-after-absence reactions create the
baseline that makes loss and change matter.

### Failure and progression

Every major objective defines success, partial success, retreat, and failure.
Failure continues through inconvenience, resource/time loss, injury/scar,
relationship/reputation damage, failed promise, capture/displacement, and only
policy-permitted retirement/death. At least 90% of major Eternal Hero failures
leave a trace visible one chapter later unless an explicit costly recovery
closes it.

Numerical power is capped. Long-term play uses prepared tactical sidegrades,
class mastery, changing roles, living equipment, creature knowledge/bonds,
relationships, institutions, projects, titles, collections, homes, protégés,
political authority, and world eras—all with bounded active sets and archive
rules.

### Module admission

A new module must:

1. create a new decision shape and clear visual verb;
2. produce canonical cause/effect in at least two existing systems;
3. reuse at least one existing resource/relationship/world axis and introduce
   no new currency unless existing resources cannot express the cost;
4. include a sink, cost, tradeoff, or opportunity cost;
5. create a presentation scene or unmistakable visible consequence;
6. declare fidelity tiers, catch-up behavior, resource cost, migrations, and
   determinism/inflation/repetition tests;
7. remain optional to the core campaign.

Fishing is the exemplar: water/time/weather/bait/technique/keep-release choices;
ecology depletion/migration; supply, market, cooking, relationship, clue, and
festival effects; time/bait/tackle/inventory/reputation costs; and visible
shoreline, journal, market, meal, relationship, or depleted-water consequences.
It must not create Fishing XP Coins.

## Workday presentation and visual direction

Every scene declares focus entities, place, headline, action, goal, stake,
latest consequence, information lens, intensity, dwell/read time, factual
before/after, fallback, accessibility projection, safe zones, cost tier, assets,
and semantic repetition fingerprint. Major decision scenes also declare known
alternatives, chosen action, and rationale.

The compact native-DOM Chronicle preserves the original game's what/where/why/
now clarity. It occupies no more than 20% of normal landscape area, can dim,
collapse, or move 8–20 px to reduce burn-in, and returns in one action. No
bright static panel remains fixed for more than five minutes. OLED mode removes
persistent bright panels. Camera ambient pan stays at or below 0.25 viewport per
second; no continuous zoom oscillation; Workday impact shake stays at or below
4 CSS px for 150 ms and disappears under reduced motion.

Living Pixel Chronicle uses:

- warm top-down pixel dioramas rooted in a 16×16 grid;
- a generated illustrated atlas with geography, routes, weather, discoveries,
  and faction fronts—not merely a zoomed-out tile map;
- stable layered portraits and semantic actor identity across exploration,
  dialogue, and 32–48 px side-view battle puppets;
- towns readable through landmarks, districts, occupation, crowds, weather,
  lights, construction, damage, seasons, and return history;
- dungeon fog, route history, locks/keys, ecology, palette zones, and landmark
  continuity into eventual 3D;
- one dominant hero effect per shot, with spectacle from composition, lighting,
  weather, crowds, spells, and rare camera emphasis;
- Atkinson Hyperlegible Next native DOM body text; pixel fonts only for short
  decorative headings.

Accessibility remains a hard gate: body/HUD text at least 16 CSS px, dialogue
at least 18 px, scale to 200%, contrast at least 4.5:1, no color-only state, no
flashing above 3 Hz, equivalent DOM Chronicle, muted startup, user-enabled
audio, global pause/stop/hide, and `prefers-reduced-motion` support. Sources:
[W3C reduced motion](https://www.w3.org/WAI/WCAG22/Techniques/css/C39.html),
[W3C three-flashes guidance](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold),
and [browser autoplay constraints](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).

## Visual assets and licensing

License approval is attached to the exact imported bundle, included license
text, source snapshot/date, hash, per-file author/license scope where applicable,
and modification record. A mutable source page alone is not the manifest.

### Approved foundations

- [Ninja Adventure](https://pixel-boy.itch.io/ninja-adventure-asset-pack) — the
  publisher page, updated 2026-08-07, states CC0, permits commercial use, says
  attribution is optional, and applies that statement to "any and all" package
  assets. Approved as a curated 2D scaffold only. Do not ship its 89 MB authoring
  archive. Review packaged fonts, music, and sounds file by file because the page
  mentions outside production inputs. It does not by itself supply enough
  generic-fantasy identity, portraits, dungeon depth, or classic side-view
  battle art. [A4]
- [Atkinson Hyperlegible Next](https://github.com/googlefonts/atkinson-hyperlegible-next)
  — SIL OFL 1.1. Pin the exact version and retain the OFL text. Approved for
  body, dialogue, logs, statistics, and accessibility UI. [A4]
- KayKit [Dungeon](https://kaylousberg.itch.io/kaykit-dungeon-pack),
  [Adventurers](https://kaylousberg.itch.io/kaykit-adventurers),
  [Animations](https://kaylousberg.itch.io/kaykit-character-animations), and
  [Forest](https://kaylousberg.itch.io/kaykit-forest) — the publisher pages state
  CC0, commercial use, and no attribution requirement. The publisher also asks
  users not to resell unmodified copies or claim authorship; honor that request
  by shipping only selectively optimized game assets, never source bundles.
  Approved as one coherent future 3D proof family after 2D long-haul gates. [A4]

### Conditional sources

- [0x72 DungeonTileset II](https://0x72.itch.io/dungeontileset-ii) — base pack
  states CC0. Use as reference/redraw input only after palette, outline, grid,
  animation, and tile-seam validation. Linked third-party extensions require
  independent license review. [A4]
- [Game-icons.net license](https://github.com/game-icons/icons/blob/master/license.txt)
  — CC BY 3.0 by default; only specifically identified contributors are CC0.
  Per-file author tracking, attribution, and generated credits are mandatory.
  Use only in a coherent monochrome UI plane. [A4]
- Kenney [Tiny Town](https://kenney.nl/assets/tiny-town),
  [Tiny Dungeon](https://kenney.nl/assets/tiny-dungeon), and
  [Tiny Battle](https://kenney.nl/assets/tiny-battle) — listed as CC0 fallback,
  placeholder, or minimap sources. Verify and hash each actually imported pack
  against its own primary page and included license. They are too sparse to be
  the primary identity. [A4]
- [Quaternius Medieval Village MegaKit](https://quaternius.com/packs/medievalvillagemegakit.html)
  — publisher declares CC0 and commercial use; 60–70% of the pack is free. It is
  an alternative 3D family, not an additive pack to mix casually with KayKit.
  [A4]

### Rejected for this project

- [Tiny Swords](https://pixelfrog-assets.itch.io/tiny-swords) — the current
  custom license permits use and modification in commercial games but prohibits
  redistribution/repackaging; a separately named old archive is CC0. Reject the
  current pack for this project's standardized permissive/open asset policy and
  visual mismatch. Do not imply ordinary game use is forbidden or treat the old
  archive as covering current files. [A4]
- [Sprout Lands free pack](https://cupnooble.itch.io/sprout-lands-asset-pack) —
  free tier is non-commercial and prohibits redistribution; premium uses
  different custom terms. Style also conflicts. [A4]
- unreviewed OpenGameArt/community-extension collage — license varies per file
  and mixing destroys visual authorship;
- runtime AI-generated raster sprites/portraits — unstable identity, animation,
  offline, and art-direction costs. Reviewed build-time concepts with manual
  pixel cleanup remain allowed. This rejection does **not** cover deterministic
  procedural geography, towns, palettes, lighting, weather, crowds, particles,
  map lines, or canonical actor assembly. [A4][A5]

## Rejected and deferred ideas

1. **Campaign saves in `sessionStorage`: rejected.** It is per-tab and cleared
   on close. Use IndexedDB plus export/import. [A6]
2. **Sovereign GM LLM: rejected.** The model cannot ensure balance, continuity,
   memory, or long-horizon fun. [A1][A2][A3][A5][A6]
3. **Continuous hidden rendering/inference: rejected.** Browser lifecycle and
   power constraints make it unreliable and wasteful. [A4][A5][A6]
4. **Seed-only replay after model influence: rejected.** Journal normalized
   structural proposals as external inputs before effects. [A6]
5. **Mutable global/category RNG streams: rejected.** Keyed/counter RNG prevents
   unrelated calls from shifting the future. [A6]
6. **Uncompacted append-only history: rejected.** It eventually exhausts origin
   quota and memory. Use verified checkpoints, semantic compaction, pinned
   artifacts, and optional archives. [A1][A2][A3][A6]
7. **Service worker simulation/inference: rejected.** Its lifetime is not
   reliable; it owns only static cache/version behavior. [A6]
8. **Unconditional service-worker `skipWaiting()`: rejected.** It risks
   old-code/new-resource skew in long-lived clients. [A6]
9. **Foundation-time OffscreenCanvas: deferred.** Revisit after P1 only if a
   reproducible profile shows main-thread rendering is the bottleneck and a
   prototype improves missed deadlines without raising failures. [A6]
10. **Infinite stats, collections, active breadth, or universal enemy scaling:
    rejected.** They erase old-world meaning and eventually break storage,
    balance, and legibility. [A1][A2][A3][A5]
11. **Surprise default mortality: rejected.** Mortal play remains explicit
    opt-in; Eternal Hero still suffers lasting loss. [A1][A2][A3]
12. **Boss/betrayal formula: rejected.** Both remain available when causal,
    foreshadowed, costly, and rare enough to matter. [A1][A2][A3]
13. **Constant/default 60 FPS spectacle: rejected.** Showcase preserves the
    option; workday visual peaks remain rare and earned. [A2][A3][A4][A5][A6]
14. **Shipping full authoring/source archives: rejected.** Selectively optimized
    runtime assets are expected; licenses and attribution remain attached.
    [A4][A6]
15. **Executable third-party content packs: rejected for current scope.** Packs
    are declarative, validated, versioned, and subject to CSP/import limits. A
    future scripting proposal requires a separate threat model. [A6]
16. **One shared mutable world across independent character saves: deferred.**
    Legacy successors may share one campaign; independent campaigns stay
    isolated. Immutable LegendCards provide future cross-campaign flavor
    without conflicting clocks/writers. [A1][A6]
17. **Native wrapper: out of current scope.** It may be a separate future
    product, but the promised web experience cannot depend on it. [A6]
18. **Production 3D before long-haul 2D proof: deferred.** The optional KayKit
    proof moves to P3 after 2D identity, persistence, and eight-hour gates. A
    cheap topology experiment may occur earlier only through a time-boxed ADR
    that cannot delay P1. [A1][A3][A4][A6]

## Final build sequence

1. **P0 — Forever foundation:** compatibility-bearing contracts, security,
   thin personhood/story/visual schemas, deterministic/persistent skeleton,
   reference mockups, one responsive scene, small headless/fault smoke tests.
2. **P1 — Long-lived AI-off vertical slice:** one polished adventure, five
   anchor scenes, one minimally presented non-dungeon alternative, three
   simulation kernels, deterministic GM/Actor Policy, recovery, recaps,
   cross-mode identity, exact resume, 100×10,000-day and million-event tests,
   and two/eight-hour gates.
3. **P2 — Deep systemic world:** geography, towns, dungeons, classes, monsters,
   creatures, equipment, relationships, homes, fronts, rivals, eras, Legacy,
   identity art expansion, and task-specific SmolLM evaluation after AI-off P1.
4. **P3 — Disciplined expansion:** admitted activity modules, declarative
   content packs, optional model tiers/preferences, optional 3D proof,
   provenance-bearing LegendCards, and the full release/failure/upgrade matrix.

The revised architectural proof is a coherent 15-minute adventure that replays
exactly without AI, remains varied for two hours, survives an eight-hour
workday within measured budgets, closes for seven days and resumes coherently,
and accelerates through years without numeric, narrative, storage, or identity
collapse.

## Official technical sources retained

- [Chrome Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)
- [MDN Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
- [MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)
- [MDN storage quota and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [IndexedDB shutdown guidance](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)
- [Web Locks specification](https://www.w3.org/TR/web-locks/)
- [service-worker lifecycle](https://web.dev/articles/service-worker-lifecycle)
- [safe PWA update behavior](https://web.dev/learn/pwa/update)
- [Pixi renderer guidance](https://pixijs.com/8.x/guides/components/renderers)
- [WebGPU device loss](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost)
- [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
- [transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)
- [WebLLM worker/model integration](https://github.com/mlc-ai/web-llm)
- [WebLLM cache/integrity configuration](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)
- [CSP WebAssembly guidance](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src)
- [W3C reduced motion](https://www.w3.org/WAI/WCAG22/Techniques/css/C39.html)
- [W3C three-flashes guidance](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold)
- [browser autoplay constraints](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)

## Post-v0.2 red-team addendum — visible systems before more modes

Date: 2026-08-29. This addendum preserves the original council decisions and
records a new inspection of the shipped v0.2 code, its current responsive UI,
and the user's critique. Local recall (`deja`) returned this council thread but
no separate prior-session implementation advice, so no undocumented earlier
solution was reused.

### Facilitator verdict

The critique is correct. v0.2 is a useful deterministic browser foundation and
seven-scene presentation smoke test, but it is not yet an honest RPG vertical
slice. The worker protocol, keyed RNG, basic catch-up, IndexedDB campaign list,
named campaigns, and Pixi scene switching are worth preserving. The game state,
however, has no inventory, equipment, attribute block, quest graph, world-route
position, persistent town or maze topology, monster instance, or turn-based
combat state. Much of the visible RPG chrome is consequently a label, dash, or
hard-coded sentence rather than a projection of play.

The fixed `town → atlas → travel → dungeon → battle → camp → chronicle`
playlist also makes time advance without causes. A route marker derived from
the global tick is not travel; disconnected wall strokes are not a maze; an
instant random health subtraction followed by guaranteed gold and XP is not a
battle; and returning to the same town postcard is not a persistent place.
Every current screen needs a stateful verb and a visible consequence before the
project adds fishing, 3D, more modes, or in-browser inference.

### Six-role findings

- **A1 — Comic/D&D continuity critic:** the UI promises character sheets,
  quests, monsters, loot, and dungeons that the rules do not instantiate.
  Enemies are headlines rather than creatures, objectives cannot become canon,
  and a maze with no entrance-to-goal topology cannot support exploration,
  foreshadowing, locks, shortcuts, or earned boss encounters. [A1]
- **A2 — embodied RPG hero:** the hero cannot inspect attributes, choose a
  meaningful action, remember a route, possess or equip an item, pursue a
  subquest, recognize a revisited place, or see why health changed. A persistent
  log and stable world coordinates are required for the character to experience
  a continuous life rather than a slideshow. [A2]
- **A3 — systems designer:** seven presentation modes currently form a playlist,
  not interlocking loops. Build one complete causal adventure: route choice
  changes travel, travel discovers a town or dungeon, quest state motivates the
  delve, equipment and stats alter legal combat actions, and its outcome changes
  the quest, place, inventory, and Chronicle. [A3]
- **A4 — visual designer/asset forager:** the restrained 320×180 composition is
  a workable reference, but identical town geometry, tick-random dungeon lines,
  one monster silhouette, and unwired status placeholders erase identity. Use a
  single coherent, licensed prototype set with semantic sprite roles; visible
  variety must come from canonical place and entity state, not randomized
  decoration. [A4]
- **A5 — workday spectator:** abrupt postcard swaps do not yet look like someone
  playing. The watchable layer needs continuous route movement, maze discovery,
  readable combat intent/impact/reaction, item reveals, town changes, and a live
  consequence log. Spectacle should punctuate an understandable action, not
  conceal that no action occurred. [A5]
- **A6 — JavaScript/web-graphics engineer:** domain schemas must precede honest
  projections. Add typed events and canonical state for geography, quests,
  inventory, equipment, combat, and logs; then test reducers independently of
  Pixi. Preserve the sole simulation worker and keyed determinism. Patch stable
  display objects rather than clearing/rebuilding every scene, dispose resize/
  ticker listeners, and avoid refreshing every campaign record on each beat.
  [A6]

### Reconciled decisions

1. **One end-to-end depth slice wins over either architecture-only work or
   screen-only polish.** Each corrective item adds canonical rules, a tested
   projection, and a visible consequence together. Placeholder UI may land
   first for layout, but it does not satisfy an item until it reads real state.
   [A1][A2][A3][A4][A5][A6]
2. **Scenes are projections of activity, not a fixed timer carousel.** A typed
   activity/event chooses the scene; completion or interruption advances it.
   Scene pacing may still be director-controlled for a screensaver, but elapsed
   wall time alone cannot teleport the hero or award victory. [A1][A2][A3][A6]
3. **The status rail is persistent but layered.** Desktop shows actual current/
   maximum health, level/XP, six derived attributes, current quest and up to
   three subquests, route progress, equipped slots, and at least eight recent
   log events. Portrait keeps the same information behind accessible collapsible
   sections. The three-second view answers who/where/what changed; the ten-second
   view answers why and what is next. [A1][A2][A3][A4][A5][A6]
4. **Geography has one canonical coordinate model.** The world is a seeded
   node/edge graph. Travel stores `edgeId`, direction, and normalized progress;
   atlas and travel render that same position along the same route. Discovered,
   visited, blocked, and chosen edges persist across reload. [A1][A2][A3][A5][A6]
5. **Places persist.** The corrective slice contains at least three seeded towns
   with distinct topology, landmark roles, identity palettes, and changing
   state. Revisit produces the same town plus recorded consequences, never a
   newly randomized postcard. [A1][A2][A3][A4][A5]
6. **Dungeons are graph-first mazes.** Store cells/rooms, passages, entrance,
   goal, hero cell, visited/fog state, landmarks, one lock/key relation, and one
   shortcut. Validate solvability before presentation; render tiles and movement
   from this topology and preserve it on revisit. A future first-person view may
   project the same graph, but 3D remains deferred. [A1][A2][A3][A4][A5][A6]
7. **Combat is a real state machine.** Combatants own health, resources,
   initiative, statuses, legal actions, intent, and outcome. At minimum the hero
   can attack, guard, use a skill, or use an item; enemies choose under the same
   legality contract. Presentation stages intent → anticipation → impact →
   reaction → consequence, and every number shown comes from resolved events.
   Retreat and defeat are possible and recoverable. [A1][A2][A3][A4][A5][A6]
8. **Quests, items, and logs are canonical.** One main quest and at least two
   simultaneous subquests have explicit objectives, statuses, rewards, and
   consequences. Inventory is bounded; weapon, armor, and trinket slots alter
   derived rules; loot has origin/provenance. The bounded adventure log records
   typed, entity-referencing events and reloads without duplicates. [A1][A2][A3][A4][A5][A6]
9. **Every existing mode gets a depth contract.** Town exposes place/NPC/service
   change; atlas route and discovery; travel actual progress and encounter cues;
   dungeon topology and fog; battle legal choices and consequences; camp rest,
   equipment, or relationship change; Chronicle event/quest/item history. A mode
   is not complete if its main output is decorative or hard-coded. [A1][A2][A3][A4][A5][A6]
10. **No LLM, new activity mode, or production 3D work enters this recovery
    slice.** The deterministic director first has to sustain the same causal
    adventure without AI. SmolLM2-360M remains a later, measured candidate for
    bounded language tasks, not a substitute for missing state or rules. [A1][A3][A5][A6]

### Refreshed art and license decision

For the corrective prototype, the preferred coherent 16×16 foundation remains
[Ninja Adventure](https://pixel-boy.itch.io/ninja-adventure-asset-pack): the
publisher marks the pack and all assets CC0 1.0, allows commercial use, and says
credit is appreciated but not required. Record the downloaded archive version,
hash, source URL, selected-file hashes, transformations, and a retained license
copy; do not ship its full 89 MB authoring archive. [A4][A6]

Kenney's [Roguelike/RPG pack](https://kenney.nl/assets/roguelike-rpg-pack),
[Tiny Dungeon](https://www.kenney.nl/assets/tiny-dungeon),
[Tiny Town](https://www.kenney.nl/assets/tiny-town),
[Tiny Battle](https://www.kenney.nl/assets/tiny-battle),
[Minimap Pack](https://kenney.nl/assets/minimap-pack), and
[UI Pack](https://kenney.nl/assets/ui-pack) are publisher-labeled CC0 and are
approved only as conditional greybox, UI, or semantic-icon sources after a
contact-sheet/style review. Do not casually mix their scales and silhouettes
with the primary set. [A4][A5][A6]

The [Liberated Pixel Cup catalog](https://lpc.opengameart.org/lpc-art-entries)
is not selected for this slice: its documented CC-BY-SA 3.0/GPL 3.0 licensing
requires attribution and share-alike/GPL handling that conflicts with the
current CC0-first runtime-art policy. This is a project-policy exclusion, not a
claim that the art is unusable. [A4][A6]

### Corrective exit verdict

The depth recovery is complete only when a fresh campaign can visibly travel a
persistent route, revisit a distinct town, traverse and resume a solvable maze,
resolve a multi-turn battle with real stats/items, advance a main quest and two
subquests, and reload with health, equipment, position, objectives, and log
unchanged. The same canonical facts must appear consistently in every relevant
screen, with no dash or invented display value standing in for missing state.

## Periodic v0.4 council — iterative expansion and visual/mechanical consistency

The six roles reconvened after v0.3 and unanimously accepted the user's new
development rule: one subsystem or feature at a time, each independently tested,
committed, pushed, deployed and live-smoked before the next begins. The council
reviewed the shipped baseline, the schema-v4 ability work, the responsive defect,
official game-mechanics research, and the added requests for companions,
repartee, a lifelong replay ledger, and local micro-LLM cinematic dialogue.

- **A1 — canon/D&D critic:** techniques need monster provenance and finite
  learnability; repartee must arise from character history; companion arrivals
  and departures require setup, cost and payoff.
- **A2 — lived RPG character:** all learning, gear changes, travel, relationships
  and dialogue choices must be visibly experienced; departed companions remain
  recognizable NPCs rather than disappearing records.
- **A3 — systems designer:** use one action/effect/event vocabulary, but reject a
  universal-framework mega-commit; mastery rewards effective decisions rather
  than repetition, and each new loop must feed existing consequences.
- **A4 — visual designer/forager:** character safe-area correctness comes first;
  semantic equipment layers and stable side-view speaker identity precede more
  spectacle; external assets require source/license/contact-sheet review.
- **A5 — workday spectator:** travel must actually move through depth, battle must
  show anticipation and consequence, repartee must visibly select hilarious
  wrong answers, and repetition memory matters more than constant particles.
- **A6 — web engineer:** Actor Policy must own canonical commands; the compact
  ledger precedes event-heavy systems; Pixi owns one ticker/resize lifecycle;
  micro-LLM inference is isolated and never owns facts or outcomes.

Reconciled decisions: codex knowledge may grow but only six arts are prepared;
enemy learning uses finite deterministic insight; active party is hero plus at
most two temporary companions; first minigame is direct rather than an SDK;
repartee correctness is canonical and prose realization optional; semantic
history never compacts away; AI comes only after complete deterministic dialogue.

Research and full acceptance criteria are recorded in the v0.4 backlog. No code,
art, dialogue or assets from referenced games or unlicensed web recreations are
approved for import. This review reused the repository's prior council decisions
and the linked official/publisher sources; local `deja` recall found no separate
implementation to reuse.

## Periodic v0.5.79 council — immutable local-narrator rebuild

The six-role council and facilitator rejected V04.13b3b2b2b as one mega-release
and split it into immutable rebuild, evaluation adapter and named-phone proofs.
The council required a network-disabled two-build receipt, complete source and
wheel manifests, exact Transformers.js sessions, no model bytes in production,
and permanent false admission/display authority. A provisional image digest,
`quantize_dynamic` recipe and `1e-5` tolerance were corrected by direct
observation: the current image digest differs, generic quantization exceeded the
budget, and export differences exceeded that tolerance. The final official-q8
recipe passed at 97,082,423 bytes in two byte-identical builds. Council verdict:
SHIP rebuild evidence; HOLD adapter, phone claims and gameplay integration.

The facilitator's final audit temporarily held release until the receipt bound
the actual executed harness, both validators enforced intermediate equality and
the bundle exclusion ran after a fresh build. Version 0.5.79 adds all three:
path/SHA-256 self-verification, independently rehashed intermediate-mismatch
tests, and a post-build boundary pass. The real receipt was regenerated from the
retained pair inside the pinned network-disabled container.

The same review added Campfire Echoes and Elsewhere Callings as independent P2
companion mechanics. Both remain deterministic and ledger-grounded; optional
future prose cannot choose shared memories, relationships, routes or outcomes.

## Periodic v0.5.80 council — rebuild reproducibility correction

The recovered publication review split three ways across artifact provenance,
evaluation-adapter architecture and narrator boundaries. It unanimously held
artifact publication and the B2 adapter until a clean rebuild matched the
committed v0.5.79 digests. That prerequisite check instead found merged-decoder
digest drift across Python processes even though the two v0.5.79 builds agreed
inside one interpreter.

Inspection of the pinned Optimum ONNX wheel found the cause: its merger selects
and iterates duplicate initializer names through a Python set. The council
therefore rejected the v0.5.79 cross-process reproducibility claim and required
a correction before model publication. Version 0.5.80 makes `build-one` the
only real build operation, locks `PYTHONHASHSEED=0`, binds per-build process
evidence, and accepts only two distinct isolated invocations with byte-identical
raw and runtime manifests. The schema-v1 receipt is retained but superseded;
the schema-v2 receipt is authoritative. Verdict: SHIP the correction; HOLD
artifact publication, adapter execution, phone claims and gameplay integration.

## Periodic v0.5.81 council — public artifact provenance closure

The recovered publication session and three-role follow-up council audited the
artifact repository, candidate contract and narrator architecture independently.
Local `deja` recall established publication/provenance closure as the next honest
unit after v0.5.80; this release reuses that sequencing and the exact immutable
rebuild evidence rather than restarting or replacing it.

The artifact review verified anonymous public access, commit
`8c85146bbe1a9bcaa4b77faa2c7ef52b2e5b8dd4`, tree
`f98af3790d8aa5375a2cba6f3bdfda99283e42b0`, 16 ordinary Git blobs and all six
runtime SHA-256/byte identities. It also verified the Apache-2.0 source evidence,
full license text, notice/modification records, schema-v2 rebuild receipt and
toolchain lock. The 59,041,810-byte decoder exceeds GitHub's 50 MiB warning but
is below its 100 MiB hard block; production-scale delivery must not assume a CDN
service guarantee.

The adapter review rejected a draft synthetic brace-expanded conversion command:
the public evidence does not claim that literal invocation. The accepted additive
V3 dossier instead binds structured artifact/source/rebuild repositories and
revisions, published/local receipt and lock paths/hashes, and exact converter and
quantizer revisions. The derived Candidate V2 is eligible only for guarded device
staging; memory remains unmeasured and admission/display authority remain false.

The architecture review found one prerequisite before an adapter: the current
formatter hash identifies field names rather than exact prompt bytes, and token
counts do not yet bind special tokens, padding/truncation, decoder-start or EOS
semantics. Verdict: SHIP publication closure; make the exact formatter/token
contract the next separate release; HOLD adapter execution, B2 claims, phone
claims, cache/consent work and gameplay integration.

## Periodic v0.5.85 council — narrator evidence retention

Three independent reviewers examined the first post-adapter B2 slice. The
contract and architecture reviewers favored freezing additive V2 rating
semantics before building a visual rater, while the provenance reviewer found a
nearer filesystem blocker: full-run private keys could still be written beneath
the diagnostic directory that Vite deletes during rebuild. The facilitator
placed that concrete evidence-loss risk first and retained the rating work as
the next separately shippable feature.

The accepted fix requires full-run output outside the repository, Git-confirmed
ignored smoke output, realpath containment, exact private modes, exclusive
non-symlink files, salt non-disclosure, index plus worktree cleanliness and raw
committed-byte evidence. The receipt closure binds the ignore policy and helper
implementation. Verdict: SHIP the runner hardening after a fresh committed smoke;
then recover rateable model output and freeze V2 intake/rating/report/replay
semantics before exposing a rater UI. Admission, display, production integration
and manufactured human evidence remain on hold. The review reused recovered
session `[codex] the_grind_2 · 01a06835-15f`.

## Periodic v0.5.86 council — bounded form selection

Three independent reviewers audited adapter attribution, evidence provenance and
narrator architecture after the first complete V2 run blocked human rating. The
council rejected silent repair of arbitrary V2 text and rejected describing an
exact host-rendered line as model-generated prose. It also rejected the two
obvious constrained alternatives after direct experiments: a one-token selector
collapsed to baseline, while a full-line trie exceeded the 48-token ceiling,
lost Unicode fact bytes, exposed an exact tie and failed fatigue.

The accepted additive V3 boundary lets the model select a declared short form
and lets deterministic host code render that form from exact validated public
facts. The raw selected IDs, not decoded text, carry model attribution. Every
trie branch is recomputable; finite float32 score bits must prove a unique strict
maximum; exact ties are invalid. The shade baseline joins the V3 candidate union
without modifying V1's historical policy.

The reviewers considered symmetric baseline suppression and a longer run-state
machine. The facilitator chose the smaller predeclared runtime policy after the
coordinator-reported exploratory 200-case probe using the proposed contract:
fixed two-call bursts, suppression only of the preceding selected non-baseline
form on the second call, baseline always eligible, and reset at each burst and
seed. This preserves a genuine model-versus-
baseline comparison and already produced zero repeated bursts, maximum form run
two and variation in all 20 sequences. Those exploratory observations are design
inputs, not retained evidence; future fatigue results must be described as the
model-plus-policy system rather than spontaneous model diversity.

Verdict: SHIP only the pure V3 formatter, form registry, exact renderer, safety,
eligibility, token/trie/score semantics and additive RunSpec/WorkerBinding after
full verification. HOLD the V3 evidence seam, worker protocol, Transformers.js
adapter, browser run, rating, phone evidence, production integration and display.
V1/V2 hashes, validators and blocked v0.5.84 evidence remain authoritative
historical records. This review reused recovered session
`[codex] the_grind_2 · 01a06835-15f` and verified its runtime assumptions against
the pinned official Transformers.js source.

## Periodic v0.5.87 council — selection evidence seam

Three independent reviewers audited adapter-facing protocol semantics, artifact
provenance and narrator architecture after the V3 selection contract was frozen.
The facilitator reconciled their initial representation preference by retaining
complete validated request and response preimages in private case receipts while
granting the worker no selected-form, target-set, rendered-prose, admission or
display authority. Host code alone reaccounts target vectors, validates the
strict trie trace, derives the form and renders exact Prompt V1 facts.

The protocol review found that the first wire schema capped raw target vectors
at the authoritative 48-token target limit. That made a genuine 49-token
`target-token-contract-error` impossible to retain or classify. The corrected
wire envelope permits a bounded 320-token diagnostic vector, while frozen target
accounting still rejects anything above 48. A regression proves that the same
49-token evidence is accepted only for the target-contract failure and rejected
for generation success or selection.

The provenance review closed two additional honesty gaps. First, successful
load chronology could accept a `not-run` row before a later terminal row; the
run validator now rejects any preterminal hole while preserving all-not-run
load-failure receipts. Second, `render-contract-error` was advertised but no
valid transcript could truthfully produce it. Because every accepted selected
response deterministically yields a registry form and safe host render, the
dead status was removed. A renderer/safety exception is an internal invariant
failure and aborts receipt creation; a caller cannot rehash a valid selected
response into a false failure downgrade.

The architecture review confirmed that the blind sheet projects only prompt,
resolution and balanced baseline/candidate text. Form IDs, token/target/trace
evidence, model side, worker/model identity and the secret salt stay outside the
public schema; invalid rows hide both sides and baseline selections auto-tie.
It also identified a test-only five-second timeout on three complete 200-row
load-failure validations and the resulting stale focused-test count. The
proportional bound is now explicit and the documented total is 32.

Verdict: SHIP the additive protocol, receipts, runner and blind projection after
the ordinary release gate; HOLD the Transformers.js V3 adapter, any model run,
human rating, production import, UI, admission and display for their separate
backlog items. All evidence in this slice is synthetic mechanics proof. The
review reused recovered sessions `[codex] history · 01a06835-15f` and
`[codex] 03 · Sep 4 · 2026-09-03T1`; no generated prose or preference was
promoted into observed evidence.

## Periodic v0.5.88 council — isolated V3 browser adapter

Three independent reviewers examined the adapter contract, receipt provenance
and browser architecture before any model execution. Local `deja` recall
recovered session `[codex] history · 01a06835-15f`, preserving its required
contract → evidence → adapter sequence, host-owned rendering and prohibition on
manufactured model observations.

The adapter review required exact tokenizer/decode/generation options,
pre-mask float32 score capture, disallowed-only trie masking, trace finalization
from returned runtime IDs and deterministic disposal. The accepted adapter
never decodes generated output. The worker emits raw evidence only; the host
revalidates the full trace, derives the declared form and renders exact public
facts.

The provenance and architecture reviews initially held release. They found
missing production canaries, a mutable-worktree build race, bundle paths that
could be re-read after hashing, an unsound nested-request ingress predicate,
incomplete CLI boundary coverage and cleanup paths that could mask the primary
failure. The accepted implementation adds both V3 contract canaries, validates
the nested request, scans executable TypeScript and MJS tool sources, builds a
40-path committed-blob closure in a temporary root, snapshots every regular
bundle byte once and serves those same buffers. Cleanup now attempts every
resource while preserving the operational error. Package SRI claims were
narrowed explicitly to committed lockfile identity.

A follow-up adversarial audit recomputed 32 transitive local files with zero
closure misses and cleared every hold. The exact source commit then passed 111
files and 1,025 tests plus both browser builds, production build and final
leakage scan. Only afterward did Chromium run the one allowed ordinal-zero
smoke: verified model/runtime closure, offline before load/inference, one valid
declared-form selection, zero post-offline requests and acknowledged disposal.
The byte-retained receipt names source commit
`991d3bb7d677afde9b7939c0ecb01187bb8ba729`.

Verdict: SHIP the isolated adapter and exactly one committed smoke receipt.
Advance next to the separate full V3 rateability run. HOLD the rating contract,
rater UI, human evidence, named-phone claims, production integration, admission
and display. Because this release adds no production UI, its visual-consistency
claim is limited to unchanged AI-off presentation and continued exclusion of
diagnostic contracts/runtime from the production bundle.

## Periodic v0.5.91 council — V3 rateability observation

The release reviewer held the physical observation until exact source commit
`752174b4db01519e628ac0ffc36236a71c358e98` passed the complete clean gate,
matched `origin/main`, and was published as annotated tag `v0.5.91`. The final
gate passed 121 files and 1,300 tests plus the rebuild proof, all typechecks,
pinned runtime checks, three narrator browser builds, production build and both
boundary scans. The reviewer then returned an explicit GO for one execution
with no retry, resume, repair or alternate identity.

That sole execution—the third physical run of the unchanged candidate and
corpus—completed all 200 cases with 200 valid rows, zero knowledge violations
and a truthful `blocked` package. It supplied 122 rateable non-baseline rows,
below the frozen 140-row minimum, and also failed the stratum-rateability,
voice-rateability and same-form-burst thresholds. Model load and disposal
succeeded; the producer seal and browser cleanup completed; service workers
were blocked; both external request counters were zero. Human quality was not
evaluated.

The public retention review permits only the versioned provenance receipt,
aggregate summary and run package. It recomputed their canonical and file
hashes, all public cross-links, and all 47 provenance-listed source files
against the tagged commit. The private run receipt, blind sheet, blind key and salt remain
outside Git. The run is consumed and will not be repeated to seek a preferred
result.

Verdict: ACCEPT and publish the blocked observation evidence. HOLD formal V3
rating, candidate admission, display authorization and production authority.
The UX, architecture, selector and browser-test reviews separately support a
new milestone and policy type labeled **Local Narrator — Experimental Beta**:
default off, explicitly **Experimental / Unrated**, approximately 121 MB,
client-only, deterministic text first, same-scene replacement only, and no
authority over saves, rules, outcomes, timing, facts or rewards. This is not
the gated V04.13b3c admission path and must not pass the candidate through
`NarratorModelAdmission` or reuse the frozen evaluator as production code. Its
line belongs in the Chronicle and compact focus ribbon, never over the
battlefield. These reviews reuse recovered session
`[codex] the_grind_2 · today · 01a06835-15f`.
