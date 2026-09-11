# Adventure forms: places that change what the party does

Research/design proposal, 2026-09-10. No feature described as a proposal below is
implemented by this document. The first candidate within this adventure track
is one small board expedition; the project-wide order lives in
[ROADMAP.md](../../ROADMAP.md). The broader collection is a direction for authored
adventures, not a request to build five engines together.

Latest release: [An old line returns](LIFETIME_STORIES.md#an-old-line-returns--v05178)
is live in v0.5.178, publicly source-verified 2026-09-11 14:55:31 PDT.
Spare change, Last exchange, Road Supper, D5 and earlier explicitly
marked deliveries are shipped; unimplemented proposals retain their separate status.

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

## D3 proposed next slice — Dungeon field medicine

Council scope, 2026-09-11; **shipped in v0.5.168**, publicly source-verified
2026-09-11 04:03:48 PDT. This takes
the existing backlog's out-of-combat item use into one active solo dungeon.
A living, badly wounded hero can use an actually owned Ember Tonic before
continuing. Reuse `restorativeHealthAmount` in `src/depth/rpg.ts`: restore
`ceil(maxHP / 4)`, clamped to missing health, and remove exactly one item from
the actual stack. No invented supplies, free refill, revival or new XP.

Give consumption its own committed command between dungeon actions. Keep
active combat, defeat recovery and owed settlement ahead of it. No movement,
search, trap roll, MP, quest progress, or equipment change is bundled with the
drink. Preserve the current room and all earlier expedition facts. Reuse the
portrait's HP bar and existing status history with one brief character action;
do not add another panel or require viewer input or an LLM.

The unchanged v0.5.167 earned journey supplies a genuine T71 opportunity at
Hollowwatch's dungeon entrance: living solo hero, HP11/42, three owned tonics,
with search as the old next command. The single bounded probe took 1.846 seconds;
no health, inventory or location was staged. The new T72 medicine action restores
HP11→22/42, consumes tonic3→2 and keeps the same cell. Exact reload and ordinary
next movement pass; healing crosses the old cautious-search threshold. Direct
and autonomous use share the same at-or-below-half-HP rule.
Acceptance covers one real consumption, exact item/HP changes, save and
reload, normal next dungeon action, and rejection of empty/forged stacks, full
health, death and active combat. Clearly label any isolated resource boundary;
do not manufacture a natural-use claim or widen a journey to find one.
The production browser sequence passes in 54.5 seconds, with three native
desktop/320px/Focus captures inspected. [Final release CI](https://github.com/huntergdavis/the-grind-2/actions/runs/34591703971)
passes 3,627 tests with the existing replay limits. Two earlier test-fixture CI
failures and their fixes remain documented in the council history.

**Why not Echo Cache first?** The council's source inspection finds no voluntary
retreat/resume producer. Defeat recovery in `src/depth/state.ts` relocates the
still-active dungeon to its entrance; it is not a supply deposit. Depth retains
one dungeon and a new entry replaces it. An honest cache therefore needs an
explicit retained expedition, deposit, return and retrieval with actual stack
transfers. Keep that larger proposal in the roadmap; do not disguise it as a
cosmetic chest. This smaller medicine slice reuses the established item effect
and creates a useful choice without those additional systems.

## D4 proposed next slice — A draught in the wall

Council recommendation, 2026-09-11; shipped in v0.5.170 and publicly
source-verified 2026-09-11 06:07:04 PDT. The actual earned journey reaches
the clue at T121, opens it at T122 and crosses at T123, shortening a known route
six → four moves. Production browser, exact reload, release CI and public-source
checks pass. This narrows the roadmap's secret-passage idea to one useful shortcut
in an ordinary solo dungeon, without another adventure engine.

A public draught cue in the current room admits one stationary investigation.
An eligible hidden latch connects two already visited, physically adjacent
rooms whose ordinary route is longer. Opening commits a real bidirectional
passage; a later ordinary move uses it. No teleport, loot, XP, resource change,
automatic dungeon completion or claim that a companion discovered it. An
original brief line can frame the surprise: “For a wall, it had a suspicious
amount of weather.” Keep the doorway and actual movement more prominent than
the text, in both the existing 2D and optional first-person views.

Existing hooks are `generateDungeon`, `isDungeonPassageOpen` and
`projectDungeonWayfinding` in `src/depth/dungeon.ts`, the dungeon command lane
in `src/depth/state.ts`, and the public packet in
`src/ui/dungeon-perspective-view.ts`. The original validator checks the maze's
tree after removing its key-gate edge. D4 stores its one extra edge separately
from the base cells, so that same base-tree check remains unchanged. Effective
movement, wayfinding, search and rendering include only the actually opened
extra edge. Connectivity, reciprocity and key ordering are preserved: a clue
is eligible only after the key gate is open and its shortcut already visited.
The new connection cannot bypass an unearned gate or reveal an unvisited room.

Keep one versioned passage and its exact reveal/open receipt per eligible new
expedition. Old expeditions remain unchanged. Public rendering sees only the
current disclosed cue or an opened connection, never the hidden target.
First acceptance is one bounded existing journey or clearly labeled fixture:
cue → investigation/open → actual shortcut traversal, exact reload before and
after, once-only opening and unchanged resources. No new long-run matrix or
seed search is a prerequisite. Wider secret networks and changing passages
remain later backlog items.

## T1 proposed next slice — The Pennywise Ferry

Council recommendation, 2026-09-11 05:51:05 PDT. Proposed only: no ferry rules,
natural reachability or browser acceptance are claimed. This narrows the
roadmap's canonical ferries and location-specific road events into one small
original situation, using the existing travel view rather than another engine.

Deferred after the bounded 2026-09-11 check: the unchanged known journey has no
eligible approach through T320, and all 14 edges on that one map have zero
recorded river crossings. No seed search or fabricated geography follows.
T2 adapts the tradeoff to a different original road situation below; it is not
evidence that a ferry shipped.

An unattended rope ferry offers two prices: two gold, or personally hauling
the rope. A living solo hero approaching an actual river crossing, after the
road encounter and higher-priority recovery/story obligations, reaches a real
bank checkpoint. Only then does the new canonical ferry event offer its choices.
Pay two actually owned gold for one-action passage, or take the rope and haul
across in two actions. The autonomous choice should expose its authored reason;
neither option is spectator input. The free branch remains legal without gold.
Both finish at the same far-bank terrain point by ordinary measured route
progress, never a settlement teleport. No HP, MP, XP, bond or bonus reward.
Original payoff: “Free passage. Every inch of it.”

Existing source hooks are `AtlasEdge.crossingPointIndices`, `pathDistances`,
`orientedEdgePath()` and `advanceRoute()` in `src/depth/atlas.ts`, the ordinary
travel lane in `src/depth/state.ts`, and its native river/traveler renderer.
Those fields prove a path crosses water, not that a ferry already exists.
The new event must explicitly establish that fact, with exact route, approach,
choice and completion sources. One versioned record per campaign is sufficient;
save/load must not infer a past crossing, repeat a fee or reroll the choice.

Present rope, platform, actual water and hero through the existing travel
stage: leaning into a haul versus riding. Reuse one short caption and Status
history for the cost, progress and exact source. No new Watch panel or invented
ferryman. First evidence is one bounded existing journey that really reaches
an eligible crossing, then bank → choice → far bank → ordinary travel. Check
both legal branches and exact reloads; do not stage a river or scan seeds to
claim reachability. Stop and rescope if that source boundary is unavailable.

Exclude companion participation, NPC schedules, weather, swimming, injury,
randomized loss, repeat tolls, a general travel-event framework and later
callbacks. Those are separate possible slices, not gates for this proposal.

## T2 current slice — The Pennywise Gate

Delivered in v0.5.171, publicly source-verified 2026-09-11 07:22:21 PDT.
A self-service wooden road barrier offers an honest
choice: put two owned gold into its counterweight and pass in one action, or
lift it by hand, remain in place, and walk through on the next action. No
spectator button, invented gatekeeper, injury, HP/MP/XP reward or bond change.
“Free passage. Some lifting required.” Ordinary travel to the gate keeps its
existing travel XP; the gate actions add none. Curiosity can favor trying the
manual mechanism; the default preference buys the shorter interaction if
affordable. The free option remains available with no gold.

One new canonical gate is established per campaign only by a real approach
on an existing oriented road. Near and far points are consecutive, strictly
interior terrain samples. Travel stops at the near point; paid/free passage
advances the exact same remaining route distance without crossing a settlement
boundary. An optional versioned record retains site, approach, choice, gold
and completion sources. It is absent until earned, survives later road reuse,
and cannot reopen, charge twice or acquire unexplained intervening actions.

The pinned unchanged first-road proof succeeds at T7: actual settled duel,
living solo hero, real forest road 0→8, near point313 at mile8 and far point312
at mile15 of70. Its next ordinary12-mile travel is clipped to8, admitting the
gate at T8. The map, supplies, road encounter and outcome were not staged.
Native wood, honor box and the actual hero use a readable road close-up, the
existing caption, route progress and Status. Lifting stays stationary; paid
and free crossing show the far side. No new Watch panel, CSS drawer, LLM or
adventure engine. The final desktop/mobile/Focus journey and both legal choices
pass, with exact reloads and ordinary onward travel. All three native captures
were inspected; existing CI limits remain unchanged. The successful release
passes 3,681 tests, with two long audits opt-in; three public assets and nine
emitted runtime source entries match the pushed release.

## W1 proposed next slice — Surely I Can Make One Nail

Read-only council recommendation, 2026-09-11 07:02:38 PDT. This is a small
original job/microgame from the roadmap's crafting/jobs lane and the workshop
premise above, not implementation of the full guardian-house encounter.
Reuse the existing visited-smithy admission pattern in
`src/depth/town-disarming-kit.ts`, town action priority in `src/depth/state.ts`
and the native town stage in `src/render/game-renderer.ts`. No new research,
source probe had been performed at the proposal checkpoint; no crafting
framework or LLM work is included. Implementation status is recorded below.

At an actual visited smithy, its actual resident offers one two-gold job:
produce a straight nail. A living solo hero makes two autonomous strokes.
A gentle tap adds one shaping point for no MP; a focused drive adds two and
spends one owned MP, representing deliberate technique rather than an injury
or an invented stamina resource. Driving is unavailable without that MP;
gentle tapping always lets the finite job finish. Exactly three points makes
the straight nail and pays two gold once. Two leaves an unfinished piece and
no pay; four bends it and earns no pay: “Excellent. A corner nail.” Do not call
every failure bent when the actual problem was underworking. No XP, health
loss, permanent ability, inventory filler, regard or companion participation.

Admit once per campaign with at least one MP, in a visited smithy with a real
resident and no active route/combat/dungeon. Recovery, rewards, oaths and existing
owed conversations retain priority. Record the actual location/resident, both
stroke sources, MP deltas, resulting shape and payment. Old absent saves remain
absent until the genuine job; reload never repeats a stroke or wage. The known
sequence and costs are public to policy. Resource-aware behavior and personality
may differ, but the rules do not silently upgrade a poor result to success.

Show the actual hero at a native anvil, two discrete hammer strokes and the
correct unfinished/straight/bent result beside the resident. Existing portrait
MP/gold, one short caption and Status carry the consequences; no new Watch panel,
spectator input, precision timing, minigame engine or ongoing workshop economy.

Before implementation, one unchanged known journey must prove real admission
within T320 and 20 seconds after imports. Stop on negative evidence; no seed
sweep, staged smith/resident/MP or expanded search. Four legal stroke sequences
cover the three shapes and exact costs; separately check zero-MP legality,
once-only payment, exact boundary reloads and ordinary onward activity. One
compact desktop/mobile/Focus browser scenario is sufficient for presentation.
Admission frequency across devices/campaigns remains unmeasured. This was the
next proposal at T2 delivery, not a combined release gate.

### W1 delivered — v0.5.172

The unchanged v171 `shared-road-playful:7` journey reaches the actual visited
Wheel Smithy at T1 in 318 ms, after buying its disarming kit. Its resident is
Hale Cooper, a healer, not a fabricated smith. The start command explicitly
admits both participants at the worksite; home association alone is not proof
of prior physical co-presence. New admission excludes active/former companions,
requires a healthy solo hero and one MP, and gives existing obligations priority.

At the v172 release, natural play performs T2 admission → T3 drive → T4 tap/straight nail
and two-gold wage → T5 ordinary route planning. All four legal stroke sequences
pass with exact costs, outcomes, history and reloads. Conserving personalities
may accept unfinished work; curious, courageous ones may overwork it. No outcome
is silently upgraded. Existing canonical campaigns include both straight and
bent natural outcomes without altering their seeds or personality.

Native admitted workshop staging uses the real hero/host, one-shot hammer
motion and the exact nail shape. The existing caption, MP portrait and Status
carry the facts. Only smithy commands queue for foreground presentation;
startup preserves unfinished work and the exact final result before catch-up.
The final 2.0-minute browser scenario passes; native desktop/320px/Focus captures
are inspected. All 3,699 CI tests pass, including canonical and forward-motion
checks, with unchanged limits. Public assets and nine emitted runtime sources
are verified at 2026-09-11 08:23:11 PDT. W1 is complete; initial CI
fixture drift and exact test-only repairs remain in [the council record](../../COUNCIL_REVIEW.md).

## B1 proposed next slice — The Cup Is Exaggerating

Read-only council recommendation, 2026-09-11 07:56:32 PDT, from the roadmap's
original bluffing/tells/wagers lane and this document's short-contest principle.
This is an original two-action inn encounter, not a generic card/deck economy.
At that proposal checkpoint, no B1 source journey or new research had run;
admission was unproven. The implementation evidence is recorded below.

At an actual visited inn, a real local resident covers a die and announces,
“At least four. A thoroughly respectable number.” Admission explicitly seats
both actors and commits a deterministic d6 face plus a fallible public tell.
The autonomous hero then challenges or declines. A challenge spends one owned
gold; an exposed bluff pays two back (net +1), while a true claim loses the
stake (net -1). Declining costs nothing. The face is revealed once and normal
adventure resumes. Keep private truth out of the public decision view and
pre-reveal rendering; personality and the actual tell may guide the choice,
not hindsight. The implemented tell distribution is specified below.

Once per campaign, living healthy solo hero with at least one gold, a real inn
and resident, no route/combat/dungeon, and no owed recovery/reward/conversation.
Exclude hosts who have left as companions. No W1 or flyting prerequisite.
Use one optional receipt with actual participants, both command sources,
committed face, public tell, chosen action and exact gold delta. No NPC-bankroll
system, health/MP/XP cost, automatic regard, invented friendship or item reward.
Absent old saves remain absent; reloading never rerolls or repays.

Winning: “The cup had been speaking above its means.” Losing: “My suspicion
was free. The explanation was not.” Declining: “I decline to invest in the
cup's reputation.” Present the actual actors, small table, opaque cup, revealed
die pips and one reaction gesture in the existing town stage. One caption and
Status history carry the result, with no betting dashboard or new assets.

First use one unchanged v172 `shared-road-playful:7` journey, at most 64 commands
and 10 seconds after imports, to demonstrate a real eligible inn boundary.
Stop if negative; no seed search or staged participants/resources. Then cover
legal challenge win/loss/decline, hidden-information boundaries, exact sources,
once-only money, boundary saves and ordinary onward play. One compact existing-
style production browser scenario is enough. This proposal does not block W1.

### B1 delivered — v0.5.173

The original known v172 journey proves a real eligible inn boundary at T4
in 456 ms, canonical hash `63f2927459e83ca1`, under the unchanged 64-command /
10-second post-import cap. No search, staged die, location, host or resource
was needed. The actual Candle Inn and Cato Ash's scholar role are retained;
the new admission command seats both actors rather than inferring physical
presence from their building association. Recovery, rewards and owed work
retain priority. W1 happens to precede this example but is not a prerequisite.

The private face is committed once by the admission command. A separate
three-way RNG draw makes the public tell agree with the hidden claim two times
in three and mislead one time in three. A fidgeting hand suggests a bluff;
a steady hand suggests an honest claim. Neither guarantees the result.
Only the copied public decision packet informs the choice; pre-reveal drawing
has no face, outcome or private receipt. The opaque cup has no die object until
the real resolution reveals its exact pips. The existing native town stage,
caption and Status history carry both actors and one non-looping reveal gesture.

Integrated source proof passes in 1.464 seconds: T5 admission commits a five
with a steady tell, natural T6 declines without spending any of the nine gold,
then T7 plans the ordinary route to Glimmerwood. A separately authored legal
challenge of the same five loses one gold (9→8); it is explicitly not the
hero's natural choice. Both preserve exact sources, HP/MP/XP, inventory and
prior story history. A challenge win is covered by a separate literal unit
fixture, not a forced alternate truth for this cup. Old absent saves remain
absent until admission; completed receipts do not reroll or repay.

Eight pure rules tests, six core tests, 36 UI/render/XP checks, TypeScript,
version/boundary checks and the production build pass. The single 150-second
browser scenario passes (2.3-minute runner), covering the natural decline and
legal loss, exact reloads and Status sources, simulated result-resume debt and
three inspected desktop/320px/Focus captures. No external/model requests or
browser errors occur. All 3,716 CI tests pass, including unchanged-limit
canonical and forward-motion checks. Three public assets and ten emitted runtime
sources match the pushed release at 2026-09-11 09:14:36 PDT. B1 is complete;
initial fixture failures, their test-only repairs and local replay timeouts
remain in [the council record](../../COUNCIL_REVIEW.md). No new panel,
model, inventory filler, HP/MP/XP effect or automatic regard is included.

## D5 proposed next slice — The Room Is Taken

**Shipped in v0.5.174; publicly source-verified 2026-09-11 10:22:06 PDT.**
The heading retains the original proposal link. This
2026-09-11 08:55:31 PDT council recommendation comes from the roadmap's named
room purposes, inhabitants and encounter-variety lane. Existing generated
`lair` cells now have a narrow first-entry consequence in new expeditions,
not another mandatory opening-town scene.

At the first eligible newly entered lair in a new solo expedition, reveal one
real guardian, resolve existing tactical combat, then resume the same maze.
“The map said lair. I had hoped it meant former lair.” A living solo hero,
actual arrival at a generated lair, active expedition and no owed recovery or
other encounter are required. There is one guarded room per expedition,
represented by one bounded source-bound record in that dungeon; do not populate
old saves retroactively or reveal an unvisited inhabitant on the map.

Record the actual dungeon, cell, arrival command and combat identity. Only a
real victory clears the lair. Preserve normal combat HP/MP, learning and reward
rules, with no extra room-completion payout or repeated victory rewards.
Defeat remains defeat, using existing recovery at the dungeon entrance.
The exact rule is **one attempt**: defeat or stalemate retains an unbeaten
memory; later traversal skirts the encounter without rechallenge, enemy reset
or another loot roll. That remembered mark does not assert the guardian's
current off-screen presence. A real victory alone clears this room, not the maze.

The separate `start-dungeon-guardian` command admits the recorded lair's actual
combat identity, leaving `start-combat`'s unresolved-road guard intact. Its
`dungeon-bound` threat provenance carries the actual dungeon, room and place
danger, not fabricated road or quest context. Native presentation reuses the
dungeon caption, existing combatants in a stone chamber, Status history and
source-bound room marks in both 2D and first-person. Only the exact final
combat source presents the result; later recovery remains the existing camp
event. No extra Watch panel, model, reading clock, deck engine or art pack.

The unchanged v173 `shared-road-playful:7` / `campaign:browser-repartee-memory`
source proof passes in 2.808 seconds under the original T320/20-second cap.
Actual T104→T105 moves west from Salt Labyrinth (2,6) to new lair (1,6), with
living solo Aster at HP42/42, MP24/24 and gold20. No seed, room, enemy or
resource was staged; the reusable fixture pins T112. Integrated proof then
admits Inkcap Mimic at T106, resolves a real defeat at T108, and performs
ordinary entrance recovery at T109. No natural victory is fabricated.

All 20 focused guardian/perspective presentation checks pass, including exact
sources, public packet boundaries, reloads and existing Status records.
Final production build, one bounded browser scenario, CI and public-source
verification pass; exact results and initial test-only repairs remain in
[the council log](../../COUNCIL_REVIEW.md). CI passes 3,734 tests in 276 files.
Three native desktop/mobile/Focus views are inspected, not a new test matrix.
At D5 delivery, Road Supper's real supply/rest prerequisites were the next
scoping action. The subsequent finite implementation is recorded below.

## Road Supper — v0.5.175

**Live and source-verified 2026-09-11 11:32:37 PDT.** This is the
finite meal premise from [V04.12a](../../BACKLOG.md#v0412a-original-road-supper-preparation-vignette-a1a2a3a4a5a6),
which already cites the official Monster Hunter manuals as design inspiration.
The rules, props and line here are original: “Two rations, one pot. A feast,
provided nobody asks the pot.” No new external-mechanics claim is needed.

**Earn the ingredients.** After existing owed obligations and at a genuinely
visited later market, one `buy-road-rations` command spends two owned gold for
two canonical Road Rations. Food capability is typed and owner-bound, not
inferred from a name, market building or baker profession. No starter freebies
or invented vendor. Existing inventory and Status retain exact quantities,
gold, place, tick and source.

**Make one meal for one actual encounter.** The living solo hero uses
`prepare-road-supper` at the captured route's real upcoming tactical encounter,
consuming both rations, 2→0. No immediate HP, MP, XP, bond or quest reward.
One bounded campaign record retains purchase, meal, combat assignment and
terminal history. It cannot become an unbounded recipe archive or repeatedly
grant food, preparation or combat rewards.

**Keep preparation distinct from Guard.** The bound fight's first direct
incoming hit receives 25% damage reduction before HP clamping, rounded down
with minimum damage one. Existing 50% Guard takes precedence, without stacking,
and that hit still consumes the meal effect. Poison and other status damage do
not consume it. If no direct hit uses it, it expires at terminal combat. The
displayed prevention is actual HP saved after clamping, including zero for a
fatal overkill; this is not the historical generic `Guarding 25/1` proposal.

**One quiet native scene.** Show the actual hero and purchased bundles at the
real market, then a bowl, empty wrappers and a brief settling steam gesture at
the actual roadside camp. No companion, vendor or inn is invented. Reuse the
existing caption/Status, portrait resources and compact combat rail, respecting
pause, Focus and reduced motion. No extra panel, mandatory 20–40-second hold,
new timer, model, external asset or narration work.

**Actual source evidence.** The single 2,879 ms integrated run preserves the
unchanged T58 anchor, then performs T59 training → T60 purchase (gold20→18,
rations0→2) → T61 route0→5 → T62 meal (2→0) → T63 fight → T65 defeat →
T66 ordinary recovery. Its first incoming hit is 65→48 raw damage against
42 HP, still HP42→0 and zero actual HP saved. The earlier candidate ordering
that would interrupt owed T28 recruitment was fixed before this proof, not
accepted as a new story order.

Presentation 27/27, producer 8/8, combat effect 5/5, narrator evaluation 8/8 and
final TypeScript pass. Build, local source verification and the original ten
1,000-command canonical journeys pass. The production browser passes in 78.7s
with three inspected captures, exact saves and no errors/model/external requests.
[CI](https://github.com/huntergdavis/the-grind-2/actions/runs/34633233091) passes
3,758 tests in 281 files with two optional skips; three public assets and sixteen
source entries match release commit `f29ea3f2265cff64615cff8185d74a790f8ca8ce`.
The actual failures and corrections remain in
[the council record](../../COUNCIL_REVIEW.md).

### Next proposal only — Known-danger detour

“I remembered the trap. An unusually inexpensive memory.” Scope one autonomous
choice around an actually revealed armed trap using only an already-known safe
alternate path. The same hero must walk every committed step; no free disarm,
new passage, hidden-neighbor knowledge or avoidance reward. A short existing
caption and factual route trace would show what the hero remembered.

Admission is **not established; proposal deferred**. The unchanged v175
`shared-road-playful:7` / `campaign:browser-repartee-memory` journey completed
160 actual commands in 4,640 ms after imports on 2026-09-11. Among 45 active
dungeon states, its only two revealed armed traps were mana siphons in the
current room: T125 at (0,2) and T139 at (4,4), both followed by an actual disarm.
There were zero remote armed states and zero same-obstacle bypass loops.
Final T160 hash: `24220f5131aa7f34`. The ignored local diagnostic is
`scratch/known-danger-detour-baseline-evidence.json`. No further seed sweep,
pathfinding framework, runtime implementation or combined release gate follows
this negative result. A future detour needs actual eligible evidence.

Read-only council mapping (2026-09-11): `projectDungeonTraps()` and
`routeToKnownCell()` in `src/depth/dungeon.ts` expose known armed traps and
visited-cell routes. Candidate generation and `move-dungeon` in
`src/depth/state.ts` must share the same traversal plan; actor scoring alone
cannot make a legal detour. A current-room armed trap already requires
disarming, so avoidance must begin before entry and use an existing open loop.
Choosing a different frontier is not evidence of bypassing the same obstacle.
No eligible journey or runtime change was established by this review.

## Last exchange — v0.5.176

**Live; publicly source-verified 2026-09-11 12:58:54 PDT.** The first battle-aftermath slice replaces
the ordinary terminal Watch headline with two short clauses from the last
recorded exchange. The previous actual attack can set up the closing blow,
but is not described as a mistake, revenge, or the cause of losing. Names,
abilities, targets and actual HP loss come from retained combat event packets.
The terminal defeat receipt must name that direct damage event as its cause.
Status-caused endings, stalemates and missing evidence keep existing display.

The full text and exact event IDs live in a collapsed disclosure on the
existing terminal Status row. Historical binding requires a timestamped
receipt already retained by the game (initially Road Supper or dungeon lair).
Generic completed fights can appear in their current terminal scene, but are
not guessed into old history rows from reused road IDs. This is not a new
archive or a promise of permanent retention. Ordinary recovery clears the
Watch recap; exact save/reload reconstructs eligible retained history.

No extra panel, canonical field, random draw, reward, narrator request or
display timer is added. Existing HP bars, quick receipts, actor clearance and
special encounter presentation remain authoritative. The bounded acceptance
uses the actual Road Supper T64 → T65 defeat → T66 recovery; it does not reroll
the result. Its first browser run passes in 51.5 seconds, with three inspected
desktop/mobile/Focus captures and exact saves. Twenty-three focused tests,
TypeScript, module boundaries and production/source-match checks pass. Full
[release CI](https://github.com/huntergdavis/the-grind-2/actions/runs/34641107562)
passes 3,771 tests in 283 files, with two optional audits skipped; public assets
and source maps match feature commit `03f4ff6`.
Wider turning-point analysis, unused alternatives and Chronicle
Plates remain future backlog items.

## Spare change — v0.5.177

**Live and source-verified 2026-09-11 14:13:01 PDT.** “At last, a weapon against my luggage.”
One real market trade turns an unused, outclassed spare weapon into one gold.
The hero keeps the equipped weapon, its mastery and all current stats. A small
gear silhouette and coin use the existing market staging; the item disappears
from inventory and the exact transaction enters Status without another panel.

This first slice is once per campaign. Only an unequipped common/uncommon weapon
with no use history, no quest-grant obligation and no retained combat reference
can qualify. The worn weapon must be at least as good in every modifier and
strictly better in one. The canonical receipt archives the sold item's exact
snapshot, the kept weapon comparison and the actual market/tick/command, with
one item removed and one gold added atomically. No healing, XP, affinity, extra
reward, invented merchant or forced future purchase. Absence in older saves is
inert; malformed present receipts are not silently accepted.

The existing T60 Kettle Market save supplies a genuine unused Ashen Spear and
a stronger, actually used Roadworn Blade. This is a new small adaptation of the
vendor economy / weapon removal backlog, not a claim that a full trading or
salvage economy already exists. Mana restoratives remain deferred after their
bounded known journey had no low-MP dungeon use.

The actual T60 save advances to T61 sale (gold18→19; Ashen Spear removed) and
T62 ordinary route planning, preserving the Blade's actual T35 mastery receipt.
The 91.6-second sale browser passes exact saves, reload, read-only inventory/
history and desktop/mobile/Focus layouts. A separate 82.7-second supper
compatibility browser passes the genuine changed journey and its three HP
saved. Six captures were inspected; no runtime errors or model/external
requests occurred. [CI](https://github.com/huntergdavis/the-grind-2/actions/runs/34647678382)
passes 3,790 tests in 287 files, with two optional skips. Public assets and nine
emitted source entries match feature `95d47dc`. Initial failures and their
corrections remain in the council record, not relabeled as first-attempt passes.

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
