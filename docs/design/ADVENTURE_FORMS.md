# Adventure forms: places that change what the party does

Research/design proposal, 2026-09-10. No feature described as a proposal below is
implemented by this document. The first candidate within this adventure track
is one small board expedition; the project-wide order lives in
[ROADMAP.md](../../ROADMAP.md). The broader collection is a direction for authored
adventures, not a request to build five engines together.

The promise is a familiar hero entering an unfamiliar situation: carrying a
ridiculous responsibility, needing someone else's expertise, making a choice
with an understandable cost, and living with the result afterward. A different
camera can make a place feel new. A different adventure form changes the legal
choices, goal, resources, or way an encounter resolves. Both are valuable.

## What the existing project already supplies

- [V04.19 and V04.19e](../../BACKLOG.md#v0419-polymorphic-autonomous-encounter-framework-a1a2a3a4a5a6)
  already propose encounters with different rules, autonomous choices, bounded
  duration, typed consequences, and original content. This document supplies
  concrete places and a small next slice for that direction.
- [Dungeon state](../../src/depth/types.ts) already has stable cell IDs, exits,
  current/visited/discovered rooms, traps, a key gate, search receipts, shrine
  resource receipts, and a traversal log. [Dungeon logic](../../src/depth/dungeon.ts)
  already projects move knowledge, wayfinding, visible traps, keys, and the
  far-stair shrine. Hidden traps are masked from move knowledge, and a promised
  unseen shrine does not expose its cell ID.
- [Hero policy types](../../src/core/types.ts) expose curiosity, loyalty, mercy,
  courage, and explicit decision traces. These can motivate choices; a new
  adventure still needs its own admitted legal actions and policy context.
- The [cutaway registry](../../src/render/cutaway-registry.ts) presents frozen
  fact packets. Its two-slot queue and recipe budgets are presentation tools.
  They do not authorize movement, create witnesses, roll dice, or change bonds.
- Companion records have identities, resources, injury, and a bounded bond
  value. Their existence does not establish dungeon participation or witnessed
  knowledge. New participation and relationship effects need canonical events.
- [P3.4](../../BACKLOG.md#p34-optional-first-person-3d-dungeon-proof-a1a3a4a5a6)
  records the earlier optional rendering proposal. Current ordering belongs to
  ROADMAP; a small D2 view proof preserves 2D identity and knowledge contracts
  without reopening the historical full-release or century-test matrices.
  [P2.6](../../BACKLOG.md#p26-long-haul-composition-viewer-disclosure-and-visual-histories-a2a3a4a5a6)
  keeps party-only disclosure as the default.

Recall performed before designing: `deja "the_grind_2 dungeon board game first
person adventure creativity"` returned no match. `deja "polymorphic"` and the
MCP compact-context reader found Codex session
`2026-08-30T14-13-29-01a05485-2ca5-78b2-8210-fb5df63c0072`, whose retained excerpt
records reading the clock/attention, module-boundary, spectator, catch-up, trap,
and encounter contracts. Reused: that investigation's contract-first direction,
confirmed against the current files above. The excerpt contains no reusable
board design; the following premises are new proposals.

## A small reference shelf, with specific lessons

All sources are official publisher/developer material accessed 2026-09-10.
The adaptation column is our design inference, not a claim by the source or a
claim that this project implements those games' features. References inform
principles; names, characters, scripts, boards, art, and sound remain original.

| Reference and era | Source date and observed principle | Adaptation here |
| --- | --- | --- |
| The Legend of Zelda (1986), [Nintendo's interview with Miyamoto, Tezuka, and Kondo](https://www.nintendo.com/en-gb/News/2016/November/Nintendo-Classic-Mini-NES-special-interview-Volume-4-The-Legend-of-Zelda-1160048.html) | 2016-11-25. The designers discuss treasure-hunting, hints and maps, and the surprise of an apparent enemy offering help. | A room should change an expectation. A tollkeeper can need rescuing; learning a route can matter as much as taking treasure. Disclose useful clues without exposing hidden answers. |
| Mario Party, Nintendo 64 (European release 1999), [Nintendo's original-game overview](https://www.nintendo.com/en-gb/Games/Nintendo-64/Mario-Party-269569.html) | Publication date not stated; page gives regional release 1999-03-19. Dice movement, a board, and short contests vary the activity and temporary team arrangements. | Make a board a place with spatial stakes, route decisions, short local problems, and recurring participants. Design a cooperative expedition with resource choices and a deadline; require no viewer reflexes. |
| Chrono Trigger (1995), [Square Enix's game overview](https://www.jp.square-enix.com/game/detail/chronotrigger/) and [official story](https://www.jp.square-enix.com/chronotrigger/en/story.html) | Overview publication date not stated; identifies the 1995 original. Story page publication date not stated. A mundane fair and a malfunction launch characters into very different situations and eras. | Let a local obligation expand into an unexpected adventure. Revisit people and places with changed responsibilities; a new chapter need not begin with a larger monster. |
| Outer Wilds, [Alex Beachum's “Demaking Outer Wilds” development article](https://www.mobiusdigitalgames.com/news/demaking-outer-wilds) | 2015-07-30. A small paper/text prototype tested linked discoveries; too much concentrated information overwhelmed readers, revealing a need for downtime. | Prove one causal adventure with simple rooms and original code-drawn props. Spread discoveries across travel and camp beats before funding elaborate 3D presentation. |
| Hades (v1.0, 2020), [Supergiant's Hades FAQ](https://www.supergiantgames.com/blog/hades-faq/) | Published 2018-12-07; updated 2025-07-16. Repeated excursions develop a story with characters who remember the protagonist. | An unsuccessful outing can still produce a remembered favor, a practical lesson, or a later conversation. Preserve this campaign's EternalHero policy; do not import another game's death loop. |

## Two different changes, two different responsibilities

| Proposal | What changes | What must stay tied to canonical facts |
| --- | --- | --- |
| Optional first-person dungeon view | Camera position, room geometry, lighting, and presentation of a committed step. | The existing graph, movement, visibility, locked passages, actors, traps, resources, and outcomes. A view switch cannot roll again or uncover a room. |
| Board expedition | Movement rules, route/pace actions, landing effects, objective, deadline, and outcome resolution. | Seeded decisions and draws, hero identity/resources, accepted participation, exact consequences, and saved progress. This needs a new concrete canonical ruleset. |
| A room that switches encounter type | A declared local resolver, such as a hearing or repair challenge, controls that room's legal actions. | A committed handoff and result reconnect the room to the expedition. The renderer cannot choose a different resolver because it looks exciting. |

A 3D rendering of the existing dungeon is not evidence that a board engine
exists. A board drawn in 2D already counts as a different adventure if its rules
and consequences differ. Begin with a concrete module; generalize only after a
second working ruleset demonstrates which interfaces it actually shares.

## Five original adventure premises

### 1. The Borrowed Bell: a dungeon that observes municipal game rules

**Scene.** The town loaned its festival bell to an underground storehouse. The
storehouse now insists that every borrower is a piece on its delivery board.
Corridors have right-of-way signs; the hero must get the bell to the exit before
the storehouse's closing procession. One rude room ceremonially labels the
hero “miscellaneous parcel.”

**Autonomous decision.** A visible movement roll offers speed with uncertain
landings. Spending one real MP steadies the load and converts the roll to one
step. At marked forks the hero chooses a sheltered route or a shorter route
with disclosed hazards. Low resources favor safety; curiosity can favor an
unvisited branch when survival and the deadline allow it. Later party versions
can ask who carries the bell and who holds a door, once participation exists.

**Mechanical consequence.** Landing resolves one room effect. Passing through
does not collect its reward. A missed stop, spent MP, a route choice, and whether
the bell was delivered are recorded. On-time delivery grants one bounded reward;
missing closing time forgoes that bonus, and the hero returns the bell late
through the same finite route. Nobody waits forever for the spectator to roll.

**Relationship and callback.** In a later admitted party version, a named
companion who holds a gate while the carrier receives the applause can gain a
specific claim to credit. Sharing that credit can change trust under the
relationship rules; taking it all can create a repairable grievance. At a later
festival, that same person may be asked to ring the bell. A solo hero's camp
account is explicitly a report, not proof that absent companions witnessed it.

**Failure worth seeing.** The bell arrives after closing, so a clerk stamps the
hero's forehead instead of the delivery form. The late delivery is the real
setback; the stamp is a brief presentation flourish. No recurring fee, permanent
humiliation status, or automatic bond loss follows the joke.

### 2. The House That Hired Its Invaders: the boss fight is a disastrous shift

**Scene.** An abandoned guardian-house mistakes the party for its replacement
staff. The healer is assigned demolition, the warrior becomes a delicately
uniformed lift operator, and the supposed boss needs someone to keep its furnace
from freezing before its inspection.

**Autonomous decision.** For one bounded encounter, actors choose between
operating their assigned station, assisting another station, and safely
stopping a machine. A station supplies a local legal action, not an unearned
permanent ability. Existing aptitudes and recorded prior cooperation decide
who leads; assistance has an explicit resource/time cost.

**Mechanical consequence.** The goal is a small set of machine conditions,
with overheating and blocked routes replacing an enemy health bar. A successful
shift opens a known service passage. Failure shuts down one station and offers
the slower exit. The party keeps its real identities, equipment, and resources.

**Relationship and callback.** The confident fighter may need the miller's
practical advice. Credited assistance creates a witnessed reason to trust that
person at the next repair encounter. A later boast can cite exactly who fixed
the lift; nobody gains the memory merely by sharing the town.

**Failure worth seeing.** A beautifully repaired lift deposits everyone one
floor below where they began. They lose a bounded amount of time, discover the
service stairs, and continue. A friend can laugh once and then help.

### 3. The Museum of Almost Us: a dungeon built from claims about the party

**Scene.** A local museum stages an inaccurate exhibit about an actual earlier
expedition. It credits the hero for a companion's action and displays a
comically enormous replica of an ordinary dropped spoon. The curator's story
has become a sequence of rooms; opening the final gallery requires settling
three disputed labels.

**Autonomous decision.** A short evidence hearing replaces attacks. An actor
can cite an eligible event, acknowledge uncertainty, concede credit, or accept
an explicitly labeled flattering claim. Evidence must be learned or personally
witnessed. Private memories and hidden world facts are not legal submissions.

**Mechanical consequence.** A bounded claim/evidence resolver decides which
labels are amended and which remain disputed. It can open an archive route or
change a local reputation receipt. An erroneous exhibit remains an in-world
claim; it never overwrites the original event or proves the curator's version.

**Relationship and callback.** Restoring a companion's credit gives that
companion a concrete reason to soften an existing grievance. Accepting false
praise can leave a grievance unresolved. A later visitor can learn the amended
label through an explicit visit/report, enabling a different greeting.

**Failure worth seeing.** The heroic portrait remains spectacularly unflattering
even after all the facts are corrected. Losing a hearing blocks only the bonus
gallery, never the campaign, and leaves a later correction opportunity.

### 4. Supper on the Run: the dungeon is a moving evacuation kitchen

**Scene.** During an evacuation, the party must serve a hot meal while a
creaking platform carries residents between safe ledges. Ingredients, seats,
and frightened people compete for the same limited space. The cook's pride
matters, but so does getting everyone across.

**Autonomous decision.** Actors choose which requests to handle and in what
order: secure a passenger, brace a pot, move the platform, or prepare a simple
meal. Local role actions use a tiny explicit state space. Mercy may prioritize
a frightened passenger; loyalty may honor a previously recorded food promise;
low resources favor the safe, plain meal.

**Mechanical consequence.** A scheduling/transport puzzle tracks seats,
platform position, and a bounded number of requests. Serving every elaborate
dish is optional. A missed meal can cost a bonus or delay an offered favor;
resident safety and the mandatory exit have deterministic fallback routes.

**Relationship and callback.** A cook embarrassed by the party's improvisation
may still recognize who protected the passengers. A later town visit can turn
that witnessed act into an invitation, an apprenticeship offer, or an ordinary
shared supper, each requiring its own canonical event. A ruined feast need not
become permanent hostility.

**Failure worth seeing.** The emergency meal is bland enough to earn an original
nickname, which may be reused by the actual diners after a cooldown. They can
later deliberately order it for comfort. The nickname does not pretend the
evacuation was harmless if the canonical result says otherwise.

### 5. The Flood That Kept Appointments: an expedition with changing access

**Scene.** A flooded observatory drains different corridors on a posted bell
schedule. An elderly attendant needs a chart rescued from a low room. The hero
can reach the dramatic summit or honor that small request before the water rises.

**Autonomous decision.** A future timing ruleset exposes the current phase,
known door schedules, the request, and each reachable action's duration. The
hero chooses when to search, retrieve, or retreat using only learned schedules.
Knowledge from an earlier visit can justify a better route; an unknown corridor
cannot be optimistically treated as a guaranteed shortcut.

**Mechanical consequence.** A short fixed phase cycle changes declared door
availability. Choosing the chart can forgo a summit bonus. Missing a window
causes a bounded wait or retreat to a safe landing. There is always a progress
path and a hard expedition cap. No flood loop can consume infinite supplies.

**Relationship and callback.** Returning the chart can establish a witnessed
favor with the attendant. A future encounter can show what the chart meant,
such as an old research partnership, through an authored, evidenced revelation.
Missing the promise can create disappointment and a later repair opportunity.
The attendant's age alone creates no death or retirement event.

**Failure worth seeing.** The summit photograph shows only the hero's boots
because they stopped to retrieve the chart. A later exhibition can celebrate
that small act if the town actually learns of it. The first-person view could
make rising water memorable, but changing doors belongs to this future ruleset,
not to the rendering prototype below.

## First delivery: one small Borrowed Bell board expedition

### Delivered D1a scope — v0.5.162

Live and publicly source-verified 2026-09-10 at 22:12 PDT. The final natural
browser journey, inspected desktop/mobile/Focus captures and
[release CI](https://github.com/huntergdavis/the-grind-2/actions/runs/34564713752)
pass. The broader original proposal below remains future scope where it extends
beyond these delivered rules.

The first vertical slice below is the complete nine-space delivery loop and
its saved Journal, not the later camp callback. D1b owns that separate follow-up.
Admission is once per campaign at a real visited, discovered town, with a fit
level-two-or-higher solo hero after at least one recorded companion departure. Existing
recovery, supplies, first book/contest and companion journeys retain admission
priority. The newly admitted storehouse board is its own authored expedition;
it does not pretend an ordinary maze or unrelated quest was completed.

One foreground command admits the board, then each turn commits its seeded die
before a separate route/pace command. The public graph and signs allow informed
choices; inspection/counter effects remain unrevealed until an actual landing.
Curiosity can spend one MP for a deliberate stop; the known closing deadline
favors direct routes. Passing a room grants nothing. The actual MP/gold receipts,
paths, unused pips and outcome are saved; later commands cannot replay rewards.
HP, combat XP, inventory, companion bond and unrelated quest progress are untouched.

Depth 31 migrates missing boards to null and preserves old records exactly.
The supported v1 graph always finishes within seven moves. Admission records
the no-bonus return fallback and the reducer has an eight-turn defensive bound;
unsupported or malformed saved rules are rejected without overwriting the save,
not silently reconstructed as an invented settlement. A future rules-version
release must define its own supported migration before admitting v2. The broader
unavailable-ruleset settlement proposal below is not claimed implemented here.

The native board shows one actual hero, code-drawn bell/die/route markers and
known room information. A compact caption uses the existing visible-time spoken
scene hold, global pause/Focus and foreground catch-up behavior. Journal keeps
the exact transcript and the existing inbox coalesces the expedition. No new
permanent dashboard, asset download, model or general adventure framework is added.

### Delivered D1b scope — v0.5.163

Attach one private recollection to a later rest only when `selectPaidInnRest`
already admits an inn stay, or the existing `needsCriticalRoadsideRecovery`
requires a solo, living hero's roadside recovery. Preserve the inn's ordinary
five-gold cost or the camp's zero-gold recovery exactly; the callback adds no
XP, resources, bond or quest credit. Retain the actual board completion and
chosen move sources, actual inn or road position and new rest source.
A passed-but-unlanded room cannot be recalled
as an experienced event, and no absent companion becomes a witness.

Show the hero's thought briefly and retain it under the existing board Journal.
Only that memory-bearing rest needs a foreground presentation hold. Require
once-only/reload protection, exact source validation and unchanged rest effects.
Publicly source-verified 2026-09-10 at 23:10:08 PDT: final browser acceptance
passed in 38.9 seconds, with three corrected native desktop/mobile/Focus
captures inspected. [Release CI](https://github.com/huntergdavis/the-grind-2/actions/runs/34568327841)
passed 3,552 tests and canonical replay; public assets and seventeen source-map
entries match the feature commit. Inn coverage uses an explicit service
boundary; the uninterrupted natural journey below supplies roadside acceptance.
Do not add a generic free
`wait`: ordinary non-recovery waits currently grant one XP.

The initial inn-only proposal proved too rare in two bounded known journeys:
the delivered `shared-road-playful:7` continuation found no inn through T800,
and the older paid-inn reference `golden:7` now returned the bell late at T71
and found no subsequent inn through T1000. Those are negative observations,
not proof that all campaigns lack inns. The first journey instead provides an
actual solo recovery at T253: HP 11→42, MP 28 unchanged, gold 20 unchanged,
XP 486 unchanged, and the same waiting road encounter afterward. D1b therefore
also decorates that existing recovery, without creating extra actions or
loosening recovery eligibility. The shared roadside predicates are extracted
unchanged; no seed sweep or fabricated low-mana history supplies this acceptance.

### Original wider proposal — remaining future scope

The first implementation should answer one question: does an autonomous hero's
route and resource choice create a legible, amusing story with a later factual
callback? Build a single original board in the existing browser renderer, using
current hero art, code-drawn spaces/arrows, existing HP/MP/gold displays, and
authored local text. No LLM, external service, asset download, 3D dependency,
viewer input, minigame collection, or generic encounter framework is needed.

### Small concrete rules

1. Use nine authored cells with two forks. The first offers a short toll route
   or a longer inspection route; the second offers a parcel-counter detour.
   The directed acyclic edges are `0→1`, `1→2→4`, `1→3→5→4`,
   `4→7`, `4→6→7`, `7→8`. Entry is `0`, forks are `1` and `4`, exit is `8`.
   This is a new board graph and movement resolver, not a relabeled maze.
2. The hero carries the quest bell from entry. There is one hero pawn. Current
   companions are not silently promoted into dungeon participants; the first
   slice does not change their resources or bonds.
3. Each turn commits one seeded roll from `1..3`. After seeing it, the hero
   either uses it or spends exactly `1 MP` to move exactly one cell. This is
   optional precision, not a reroll. Zero MP still permits ordinary movement.
4. Movement stops on reaching a fork or the exit; remaining pips are discarded.
   At a fork, the hero selects one of its legal outgoing routes before moving.
   Marked branch risk and discovered room information are public inputs. Future
   rolls and unrevealed room effects never enter the actor's policy input.
5. Use three original landing effects once per cell: cell `2` is a disclosed
   shortcut toll that removes at most `1 MP`; cell `3` is an optional inspection
   that yields a route note; cell `6` is an optional parcel counter granting
   `1 gold`. Other cells are transit. A traversed cell has no landing effect.
   Both branches remain usable at zero MP; the toll cannot create debt.
6. Reaching cell `8` by turn four delivers the bell and grants exactly `3 gold`
   once. A later arrival is a late return with no delivery bonus. Every turn
   moves at least one forward cell, so all legal runs finish by turn seven.
   Retain an eight-turn hard cap as corruption/unavailable-action recovery:
   settle a failed return with the declared fallback and preserve every
   committed resource change. No loop and no reward retry is possible.
7. At the next eligible camp, show one brief factual callback to the expedition
   result and its decisive receipt: spent MP to stop at the inspection, skipped
   the counter to make time, or returned late. The hero can remember their own
   actions. Any companion hearing the account needs an explicit report event
   before future relationship rules can use it. Witness-based bond effects are
   a subsequent slice, not a claim about this prototype.

The inspection and coin stops compete with the deadline, while a larger roll
can pass them. Short versus long routes matter even before adding another
encounter engine; the first board does not need a library of microgames.

### Admission, persistence, and presentation

- Keep one small versioned board state with the instance/rules ID, current cell,
  turn, committed roll/action/path, resolved landing cells, bell outcome, and
  exact reward receipt. The active adventure owns its state; no renderer owns
  dice or resource arithmetic. Old saves without a board remain ordinary saves.
- Before admitting a save-bearing version, define a lossless supported-version
  migration and a deterministic unavailable-ruleset settlement. Freeze the
  promised fallback at admission. Returning a borrowed bell is not a claim that
  a normal dungeon was completed, and must not satisfy an unrelated quest.
- Show the causal beat in a compact sequence: roll → chosen route/pace and cost
  → movement → landing/result. Give the die number and room consequence text
  equivalents. A stable board and one actor are enough; avoid a constant screen
  of bouncing counters. A cutaway may consume the final receipt later.
- Party-only knowledge remains the default. Even though the board is authored,
  reveal destinations/effects according to declared board knowledge. Ordinary
  dungeon fog, secret traps, and hidden cell IDs keep their existing rules.
- Global pause freezes simulation and presentation; reduced motion shows the
  same committed states without travel animation. Hidden-tab/catch-up behavior
  uses an explicitly declared fidelity and a concise return summary. It may
  omit flourish, but it cannot omit canonical decisions or redraw the roll.
- Run entirely locally in the browser with NoLLM mode. Render on state changes
  and bounded presentation frames; stop continuous work while paused/hidden.
  Cap effect counts and dispose temporary graphics at settlement. Performance
  claims require measurements on the project's named target hardware.

Acceptance for that future implementation: demonstrate an on-time delivery, a
late return, a zero-MP run, both forks, a deliberate precision stop, and one
later accurate callback; save/reload at roll/action/landing/settlement without
different choices or duplicate rewards; render the same outcome in normal,
reduced-motion, paused/resumed, and static fallback modes. Prove unknown effects
stay out of policy and party-only views. These are targeted scenario checks,
not a requirement to build a general simulation test framework first.

## Optional first-person view: shipped preview and wider proposal

### Delivered D2 scope — v0.5.164

Menu → Dungeon view selects `2D map` or `First-person preview`. The choice is
stored separately from the campaign and narrator consent; malformed or
unavailable storage defaults to the map. One lazy-loaded native drawing module
shows the current room, public doorways, known gate/key/shrine cues, revealed
traps, a compact compass/back-exit cue and the current hero's identity-colored
hands. It receives an allowlisted packet, not raw dungeon or world state.

Physical visible doorways are separate from the policy's available next moves:
trap handling does not paint a back passage as a wall. No neighboring onward
geometry, hidden trap, seed or undiscovered landmark location is passed through.
Only a source-bound adjacent committed move changes facing; stationary actions
retain it. With no prior presented step, including a fresh reload, the initial
orientation is north. The preference persists; camera history is not a new save
field. There is no free camera, extra turn, head-bob or new graphics engine.

The existing caption and portrait/resource card remain shared. Failed optional
loading/drawing keeps 2D available and is not retried every frame. Two same-build
browser scenarios prove the exact save/choice invariants, real search/movement,
preference reload, one failed-load fallback and desktop/mobile/Focus layouts.
The main journey passed in 53.6 seconds; failed-load continuation in 25.4 seconds.
Three final captures were directly inspected. Publicly source-verified
2026-09-11 at 00:02:46 PDT: [release CI](https://github.com/huntergdavis/the-grind-2/actions/runs/34571954359)
passed 3,567 tests across 248 files and all four canonical tests; two long audits
remain opt-in/skipped. Five public assets and nine source-map entries match
feature `54519e7b3d8f946ef6038972f600e56448f3fe25`. Simulation and both narrator
workers are unchanged. The older dungeon-search browser test's stale trap
expectations remain a separately queued maintenance item, not a claimed pass.
Wider 3D asset, animation and named-device performance proposals below are not
claimed implemented by this small 2.5D preview.

### Original wider visual proposal

For the independently reviewable D2 prototype, start with one existing dungeon
snapshot and original code-generated walls, floors, doors, and simple landmark
shapes. Use a small grid-perspective or raycast prototype to test readability and motion. If it is
a 2.5D prototype, label it honestly; it does not establish production 3D readiness.
No imported art is necessary for this first geometry experiment. P3.4's proposed
KayKit treatment remains a later asset/identity option, not a dependency on the
first view proof. Neither a board engine nor a broad 3D framework is required.

Consume an allowlisted view of the same cell IDs, legal exits, known route,
projected gate/landmark state, and revealed traps used by the 2D experience.
Do not give the adapter raw hidden room features merely to hide them behind
walls. A first-person view must not reveal a secret door through lighting,
occlusion, a reflection, a room name, or an automatically centered camera.

The camera follows already committed steps and facing inferred from the last
step; looking does not spend a turn or advance the hero. No free-roaming camera
can inspect unexplored cells. First-person/2D view changes preserve canonical
and choice hashes, hero position, fog, locks, and rewards. Current hero identity
and resources remain readable in the established UI, with a compact known-map
orientation aid if needed. Never invent a companion standing in the corridor.

Use fixed lighting, bounded sight distance, simple geometry, and no continuous
head-bob. Reduce motion to discrete views and factual DOM text. Pause freezes
motion. The adapter is optional and lazy-loaded; rendering/context failure or a
budget violation returns to 2D/static presentation with the committed outcome
intact. Measure actual frame, memory, and power behavior before adopting any
3D library or publishing a performance claim. P3.4's compressed-bundle and
named-hardware targets remain gates, not measurements supplied by this document.

### D2 first playable boundary — read-only council follow-up, 2026-09-10

Start with one room and its visible doorways in the existing Pixi renderer,
not unrestricted raycasting or a new engine. A menu preference, `2D map` /
`First-person preview`, should persist separately from campaign saves and
default or fall back to 2D when unavailable. Reuse the storage-failure handling
in `src/ui/adventure-speed.ts`; no campaign schema change is needed for a view.

The first implementation boundary is a public-facts adapter: reuse
`projectDungeonMoveKnowledge`, `projectDungeonTraps`, `projectDungeonKeyGate`,
`projectDungeonLandmark` and `projectDungeonSearchView`. The optional drawing
module must not receive raw `WorldState`, hidden features or a discovered
neighbor's unexplored onward exits. Integrate inside the existing `drawDungeon`
viewport and retain its caption, resources and 2D fallback.

Use an actual adjacent committed move to derive facing; stationary actions
retain it, and an explicit fixed initial facing covers the absence of a prior
step. The prose traversal log is not structured facing evidence. Discrete views
are sufficient for this first slice, with no head-bob, free camera or new turn.

The existing `browser-dungeon-search:8` fixture in
`tests/dungeon-search.spec.ts` supplies actual generated traps and commands,
but its location handoff is staged, not uninterrupted natural travel. A natural
dungeon-entry checkpoint remains unverified. Focus acceptance on identical
campaign/choice hashes across toggles, hidden-feature noninterference, search
versus movement, preference reload, pause/reduced motion and failure fallback.
This review reused the existing projections and public-only framing contract;
recall found no reusable natural-fixture result. It is planning, not shipped D2.

## Make the adventures accumulate into a life

Each authored adventure should leave at most a small number of useful facts:
what changed, who actually participated or witnessed it, what resource was
spent, whose promise/credit was involved, and which later situation can use it.
The same event can be funny to one participant and disappointing to another;
neither reaction implies omniscience or automatically changes a numerical bond.
Relationship producers resolve their own bounded effects from eligible facts.

Alternate hard-won triumph, practical trouble, embarrassment, quiet friendship,
and ordinary competence. Let some outings end with a meal, a repaired sign, or
a thank-you rather than another crisis. Cool down repeated premises and jokes;
do not schedule a grievance every time two characters travel together. A later
callback needs a new causal purpose, not just the same punchline again.

EternalHero remains the governing lifecycle. Milestones, reunions, anniversaries,
changes of vocation, mentorship, and fulfilled obligations can mark a long
life without forcing retirement or death. An injury, departure, healing,
romance, promotion, or reconciliation requires its own supported event and
policy. Cosmetic age, a dramatic camera, and a moving caption establish none
of those facts. A memorial-shaped prop cannot quietly declare someone dead.
