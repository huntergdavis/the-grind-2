# The Grind 2 — Red-Team Council Report

Status: final council adjudication, 2026-08-28

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
