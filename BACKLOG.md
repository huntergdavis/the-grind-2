# The Grind 2 — Final Development Backlog

Status: council-adjudicated backlog, 2026-08-28

This backlog is the actionable companion to the final council report. It
supersedes the facilitator draft's provisional priorities. Provenance tags show
which council roles proposed or materially supported an item:

- [A1] comic/D&D continuity;
- [A2] embodied RPG hero;
- [A3] systems game design;
- [A4] visual design and asset licensing;
- [A5] workday spectator;
- [A6] JavaScript/browser/web graphics.

Dependencies name prerequisite backlog IDs. An acceptance gate moves with its
work if scheduling changes; it is not silently deleted.

## Priority definitions

- **P0 — Forever foundation:** compatibility-bearing contracts and thin
  runnable proofs required before broad content work.
- **P1 — AI-off vertical screensaver:** one polished adventure, representative
  alternate shape, five anchor scenes, durable resume, and workday gates.
- **P2 — Deep systemic world:** living places/cast, bounded RPG depth, eras,
  expanded identity art, and evidence-gated SmolLM evaluation.
- **P3 — Disciplined expansion:** admitted modules, declarative packs, optional
  model/3D/cross-campaign features, and full release matrices.

## P0 — Forever foundation

### P0.1 Lifecycle, clocks, and campaign-policy charter [A1][A2][A3][A5][A6]

Dependencies: none.

Define Simulation Tick, World Clock, Attention Clock, Presentation Time, and
journaled Wall-Clock Observation. Define save-versioned `EternalHero` default,
opt-in `Legacy`, and reserved opt-in `Mortal` policies. Add event metadata:

```ts
type AttentionPolicy =
  | "backgroundSafe"
  | "queueForPresentation"
  | "forbiddenDuringCatchUp";
```

Each event also declares reversibility, maximum fidelity affected, threshold
behavior, maximum credited duration, aggregation, and queued fallback.

Acceptance:

- hidden mode performs zero renders and zero model jobs;
- visibility loss durably commits or rolls back the pending beat without
  relying on unload-time IndexedDB work;
- exhaustive schema/property tests prove catch-up commits only
  `backgroundSafe` events;
- routine travel/recovery/production/weather/economy/ecology/front pressure
  stops before every declared named or irreversible threshold;
- seven days closed creates a deterministic, bounded, causally ordered catch-up
  queue with no duplicate effect;
- lifecycle policy/version persists in every campaign.

### P0.2 Game Master authority, Actor Policy, and Runtime Governor [A1][A2][A3][A4][A5][A6]

Dependencies: P0.1.

Specify separate contracts for Rules Engine, Campaign Director, Actor Policy,
Spectator Director, Runtime Governor, deterministic Narrator, optional model
Narrator, optional Advisor, and optional Critic.

Acceptance:

- Rules Engine is the only canonical mutation path; every effect cites a
  validated command/event;
- Campaign Director ranks/submits legal opportunities but cannot bypass
  validation or choose presentation intents;
- Actor Policy selects from actor-known legal alternatives using goals, values,
  beliefs, commitments, relationships, stress, and tactics;
- Spectator Director alone owns mode/lens/camera/shot/effect/transition/dwell;
- Runtime Governor may reduce fidelity or suspend inference but cannot alter a
  canonical outcome;
- identical actor state/choice set produces the same action when model,
  Spectator, or Runtime state changes;
- 10,000 major decisions use no unknown facts and store alternatives, evidence,
  choice, and deterministic rationale;
- model fuzzing produces zero unauthorized mutations; model absence uses a
  deterministic fallback;
- replaying a journaled structural proposal without the model yields the same
  selected move, reason code, and canonical hash.

### P0.3 Deterministic core, keyed RNG, serialization, and invariants [A1][A3][A6]

Dependencies: P0.1, P0.2.

Implement versioned keyed/counter randomness,
`random(seed, domain, entityId, tick, purpose, ordinal)`, stable scheduling,
sorted canonical serialization, fixed/integer outcome math, logical large
counters, and development invariants.

Acceptance:

- lint prevents `Math.random`, ambient wall time, locale-sensitive ordering,
  DOM, Pixi, IndexedDB, and WebLLM in reducers;
- ten P0 golden campaigns end at identical hashes in Node and Chromium;
- adding an unrelated loot/presentation random call changes no other outcome;
- 100,000 empty era transitions add <1 KB attributable to the ordinal, grant no
  power, and require no iteration from era zero;
- canonical hashes are stable across save/load and worker restart.

### P0.4 Module SDK, dependency graph, worker IPC, and backpressure [A3][A6]

Dependencies: P0.2, P0.3.

Create namespaced commands/events, read-only world views, public module
capabilities, runtime schemas, revisioned worker envelopes, deterministic saga
ordering, bounded queues, and explicit projection backpressure.

Acceptance:

- envelopes contain protocol version, campaign ID, worker epoch, request ID,
  expected revision, kind, and validated payload;
- duplicate, stale, reordered, oversized, unknown, and wrong-version messages
  cannot mutate state;
- killing the simulation worker restores the last durable revision;
- projection/narrative queues cannot grow without bound;
- CI rejects private module-to-module imports and browser/renderer/storage/model
  APIs in simulation packages;
- cross-module consequences use public typed events and stable ordering.

### P0.5 Transactional persistence, versions, export, locks, and safe updates [A1][A2][A3][A6]

Dependencies: P0.3, P0.4.

Use IndexedDB stores for campaign heads, snapshots, event segments, story facts,
prose cache, content manifests, settings, and bounded diagnostics. Add 1–4 MB
immutable hash-chained segments, two verified heads, atomic head advance,
copy→migrate→validate→switch migrations, per-campaign Web Lock, persistent
storage request/status, quota recovery, JSON export/import, project-prefixed
caches, and staged service-worker activation.

Acceptance:

- fault injection at every checkpoint phase always leaves a readable prior head;
- two tabs cannot both write one campaign; a second tab is read-only or requests
  takeover;
- all released fixtures migrate or open read-only for export;
- export/import round-trips to the same canonical hash;
- quota failure preserves the current head, purges only regenerable caches, and
  offers export/recovery;
- sessionStorage holds only disposable tab UI;
- N−1 app/N service-worker online/offline tests show no old-code/new-resource
  skew, unconditional `skipWaiting()`, or cross-project cache deletion.

### P0.6 Retention, compaction, entity fidelity, and provenance [A1][A2][A3][A4][A5][A6]

Dependencies: P0.3, P0.5.

Implement fidelity tiers (`canonicalNamed`, `supporting`, `aggregate`,
`ephemeral`), evented promotion/demotion, aggregate conservation, memory/belief
provenance, promise budgets, compaction, and retention classes:
`canonicalEvidence`, `chronicleArtifact`, `recentProse`, `ephemeralProse`,
`diagnostics`, and `optionalArchive`.

Acceptance:

- facts, beliefs, rumors, lies, prophecies, actor knowledge, and viewer
  disclosure are distinct typed stores;
- promotion records origin/cohort, stable ID, generator/content version,
  time/place, species/role/age, semantic visual/voice recipe, home/job/faction,
  condition/location, possessions, knowledge, relationships, obligations,
  source events, and cause; source aggregate decreases atomically;
- demotion preserves the identity shell, status/location, recipes, unique
  possessions, scars, bonds, grievances, secrets, promises, relationships,
  chronicle links, aggregate destination, and eligibility proof;
- active promises, relationships, unique items, named scars, viewer pins, and
  unresolved fronts prevent destructive demotion;
- 10,000 promote→demote→compact→migrate→reload→re-encounter cycles preserve
  identity, appearance semantics, knowledge, relationships, possessions, and
  aggregate conservation with zero duplicates;
- compaction triggers by 10,000 events or 25 MB and removes no referenced
  semantic fact;
- exact bytes and hashes survive for referenced vows, contracts, letters,
  prophecies, clues/passwords, inscriptions, epitaphs, named-item dedications,
  pivotal cited dialogue, chapter titles, and player favorites;
- 100 callback tests recover identical artifact hashes/source event IDs;
- ordinary barks, unused drafts, camera choices, and detailed combat transcripts
  remain purgeable;
- pin budgets are visible; quota pressure offers export or explicit unpinning,
  never silent deletion.

### P0.7 Bounded progression, economy, consequences, and module admission [A1][A2][A3][A5][A6]

Dependencies: P0.3, P0.6.

Define caps and archive/replacement rules for core stats, action economy,
multiplicative modifiers, active statuses, prepared abilities, active traits,
scars, titles, currencies, inventory, creatures, relationships, promises,
institutions, and economic influence. Define enemy-tier policy, objective
outcomes, failure ladder, recovery cost, and generic module-admission schema.

Acceptance:

- no mechanically effective or active-content axis is unbounded;
- old low-tier enemies remain honestly weak; no universal hidden scaling;
- every major objective declares success, partial success, retreat, and failure;
- at least 80% of meaningful failures create a distinct playable consequence;
- each consequence tier above inconvenience has a world-visible persistence
  test and cannot be instantly restored by the director;
- a 1,000-equivalent-hour synthetic run has no runaway multiplier, overflow,
  infinite hotbar, or dominant sidegrade;
- every module declares inputs, outputs, sources, sinks, caps, two canonical
  cross-system interactions, visible consequence, fidelity/catch-up behavior,
  resource cost, migrations, and disable/removal behavior;
- a module cannot add a new currency when an existing resource can express its
  cost.

### P0.8 Personhood, Actor Policy data, and narrative spine [A1][A2][A3][A5]

Dependencies: P0.2, P0.6, P0.7.

Define hero/actor drives, values, beliefs, loyalties, fears, preferences, moral
limits, commitments, intentions, stress, tactics, goals, asymmetric relationship
evidence, homes/belonging, fronts, promise ledger, recurring-cast status,
chapter/saga/era hierarchy, recap facts, and betrayal prerequisites.

Acceptance:

- major choices store known alternatives, relevant self/relationship evidence,
  selected action, rationale, and later consequences;
- absent/dead actors acquire no impossible memory;
- active hook/promise counts are capped; every hook resolves, sleeps, or closes
  with a reason;
- no payoff commits without causal prerequisites;
- betrayal requires motive, opportunity, at least two visible setups, cost, and
  aftermath;
- Campaign metrics alone cannot cause a value reversal, departure, betrayal, or
  permanent consequence;
- thin schemas serialize, migrate, and replay before rich authored content exists.

### P0.9 Spectator, responsive scene, identity, and style contracts [A1][A2][A3][A4][A5][A6]

Dependencies: P0.2, P0.8.

Version and validate the provisional Living Pixel Chronicle style bible,
semantic visual identity recipes, spectator metadata, responsive safe zones,
camera/effect grammar, Chronicle hierarchy, accessibility projection, Viewer
Disclosure Ledger, and repetition fingerprints. P0 produces reference mockups/
contact sheets and one executable responsive smoke scene—not five polished
modes.

Acceptance:

- style rules cover grid, palette, silhouettes, lighting, animation, portraits,
  battle puppets, typography, VFX, camera, UI, 2D/3D continuity, and reduced
  motion;
- 320×180 is a landscape reference camera; desktop uses nearest-neighbor
  integer scaling/letterbox or viewport extension; 390×844 uses a distinct
  portrait composition and native DOM text without blurred pixels;
- saves store semantic visual/landmark recipe IDs and traits, never atlas
  coordinates, frame numbers, or source-pack filenames;
- repacking the smoke atlas preserves equivalent appearance;
- every scene declares focus/place/action/goal/stake/latest change/lens,
  sensory and emotional intensity, dwell/read time, before/after, fallback,
  safe zones, cost, assets, DOM equivalent, and semantic fingerprint;
- Campaign Director supplies factual focus/urgency only; Spectator Director owns
  every presentation intent;
- model-proposed visual IDs stay allowlisted and cannot mutate canon;
- party-only and dramatic-irony projections are typed separately; changing
  viewer policy changes no actor-knowledge or canonical hash.

### P0.10 Asset provenance, atlas tooling, and resource budgets [A4][A5][A6]

Dependencies: P0.9.

Implement a manifest and deterministic atlas pipeline. Register only a small
curated scaffold in P0; production breadth arrives in P1/P2.

Acceptance:

- every imported bundle/file records source URL/snapshot date, bundle hash,
  included license-text/hash, author, version, per-file license scope,
  attribution, modifications, and semantic tags;
- CI rejects unregistered assets and generates credits;
- atlas checks dimensions, alpha, palette, seams, trim/extrude, frames, naming,
  and semantic identity references; maximum atlas is 2048²;
- full authoring/source archives do not ship;
- exact Ninja Adventure visual files are reviewed separately from packaged
  fonts/music/sounds; community extensions never inherit a parent license;
- bundle/texture/draw/particle/actor/frame budgets are instrumented before
  production content.

### P0.11 Workplace safety, accessibility, security, and privacy [A4][A5][A6]

Dependencies: P0.4, P0.9, P0.10.

Add global pause/stop/hide, muted startup, user-enabled audio, reduced motion,
flash limits, safe native-DOM Chronicle, CSP, import limits, text-only model/save
rendering, and no required remote telemetry.

Acceptance:

- imported/model text uses text nodes, never unsanitized HTML;
- imports enforce byte, nesting, string, and entity-count limits and allow only
  declarative content;
- CSP avoids general `unsafe-eval`; any `wasm-unsafe-eval` requirement is
  narrowly documented;
- no flashing above 3 Hz, no color-only state, body/HUD text ≥16 CSS px,
  dialogue ≥18 px, contrast ≥4.5:1, and text scales to 200%;
- reduced motion replaces shake/zoom/parallax/nonessential particles with calm
  emphasis and keeps an equivalent DOM event record;
- audio never autoplays before user interaction;
- a degraded/overdue save has a visible warning; normal model/worker status does
  not clutter the fantasy layer.

### P0.12 Diagnostics, reference device, and smoke harness [A1][A2][A3][A4][A5][A6]

Dependencies: P0.1–P0.11.

Build pause/step/replay/export tools, local diagnostics, fault injection,
headless acceleration, basic screenshot capture, and a reproducible device
profile.

Acceptance:

- `reference-hardware.md` names exact laptop SKU, CPU, GPU/driver, RAM, OS,
  browser build, display/refresh, brightness, network, plugged/battery state,
  power profile, and thermal/fan conditions plus the 4-core/8-GB/iGPU class;
- diagnostics include build/schema/rules/content/model hashes, state/durable
  revisions, sim/render/IPC/IDB/model timings, queue depth, memory/storage,
  context/worker loss, and director repetition;
- export is bounded, local, and user-initiated;
- P0 smoke runs 10 seeds × 1,000 in-game days, a one-hour headless soak, worker/
  save fault injection, and the responsive golden smoke scene with no broken
  reference, impossible location, overflow, or unbounded queue;
- instrumentation reports p50/p95/p99, deadlines, long tasks, heap slope, power
  where measurable, and AI-on/off resource separation.

## P1 — Long-lived AI-off vertical screensaver

### P1.1 Durable multi-character launch and save health [A1][A2][A5][A6]

Dependencies: P0.5, P0.6, P0.11.

Create/resume multiple randomly named heroes, each in an isolated campaign with
lifecycle selection, storage/persistence status, export/import, read-only
second-tab viewing, and explicit takeover.

Acceptance:

- create/select/reload/export/import multiple heroes without state leakage;
- each round-trip preserves the canonical hash and lifecycle policy;
- closing the tab loses no acknowledged meaningful beat;
- `sessionStorage` loss changes no campaign state.

### P1.2 Regional spine and three distinct adventure kernels [A1][A2][A3][A4][A5][A6]

Dependencies: P0.4, P0.7, P0.8, P0.9.

Polish one town→travel→graph-first-dungeon→return adventure. Implement three
generic kernels:

1. expedition/discovery — routes, supplies, uncertainty, returned knowledge;
2. rescue/defense — deadline, protection/triage, partial success, community
   consequence;
3. investigation/diplomacy — facts/beliefs, testimony/trust, non-combat outcome.

Acceptance:

- generic Adventure schema requires no dungeon, combat, boss, or BossDefeated;
- at least 30 seeds per kernel reach valid success, partial success, retreat,
  and failure paths;
- kernels have different decisions/resources/consequence graphs, not renamed
  states;
- at least one completes without dungeon, boss, or combat and relies on
  knowledge/relationship evidence;
- at least one alternate non-dungeon kernel produces real scene-contract
  projections/contact sheets through climax and consequence and appears in the
  P1 two-hour test;
- a fourth declarative kernel needs no lifecycle-schema change.

### P1.3 Emotional loop, belonging, agency, and glance legibility [A1][A2][A3][A4][A5][A6]

Dependencies: P0.8, P0.9, P1.2.

Include meaningful deliberation, companion disagreement, persistent setback,
rest/recovery, relationship evidence, home/favorite-place attachment, and return
to a visibly changed familiar place.

Acceptance:

- at least 80% of fresh viewers identify party/focus, place, current action, and
  latest change within three seconds;
- at least 80% additionally identify goal/stakes and, during major decisions,
  rationale within ten seconds;
- alternatives and one-line rationale appear around major choices and remain
  in the inspectable Chronicle;
- full stats/formulas/inventory/relationships/promises stay on demand, not in a
  permanent dashboard;
- at least 80% of blinded viewers identify why a sampled major choice occurred
  after its deliberation/aftermath;
- rest changes readiness/relationships and a return visibly reflects at least
  one hero-specific attachment and one consequence.

### P1.4 Deterministic Campaign Director and Actor Policy v1 [A1][A2][A3][A4][A5][A6]

Dependencies: P0.2, P0.7, P0.8, P1.2.

Implement rolling pacing diagnostics, promise/payoff and recovery debt,
difficulty bands, systemic novelty, cast/faction/subsystem spotlight, candidate
budgets/cooldowns, Actor Policy, and reason traces.

Acceptance:

- replay is exact with every model component absent;
- every override logs candidates, hard constraints, reason, cooldown, and
  safety/continuity/preference class;
- adversarial tests cannot force moral-boundary violations, illegal encounters,
  premature payoffs, altered combat results, or nullified earned failure;
- no permanent consequence has only `quota`, `novelty`, `spotlight`, or
  `winStreak` as its cause;
- an eight-hour trace has no deadlock, endless scene, unsupported betrayal,
  active-hook explosion, or repeated campaign-selection loop.

### P1.5 Minimal saga, fronts, relationships, rival, and recovery [A1][A2][A3][A5]

Dependencies: P0.8, P1.2, P1.4.

Ship one setup/payoff, recurring actor, evidence-based relationship change,
faction front, adaptive rival, reversal, failed objective or partial success,
recovery, and changed-home consequence.

Acceptance:

- rival recurrence cites survival/resources and shows adaptation; no cutscene
  immunity;
- relationship change cites shared facts and actor values;
- betrayal, if used, meets all setup/cost/aftermath gates;
- fronts can advance without the hero but consequential thresholds wait for
  attention;
- at least five persistent non-terminal consequence families survive
  save/resume and alter later eligibility;
- at least 90% of major Eternal Hero failures remain visible one chapter later
  unless a recorded costly recovery closes them;
- setup pays off and chapter closes with AI disabled.

### P1.6 Five polished anchors and alternate-kernel presentation [A2][A3][A4][A5][A6]

Dependencies: P0.9, P0.10, P1.2, P1.3.

Build polished living atlas, town diorama, camp/dialogue, dungeon thread, and
tactical battle plus the minimally presented alternate non-dungeon kernel.

Acceptance:

- reviewed goldens pass at 1366×768, 1920×1080, ultrawide, 4:3, and 390×844;
- no accidental exact semantic fingerprint repeats within 20 minutes;
- coherent setup/action/reaction/consequence sequences can remain in one mode;
  callbacks/comparisons use sequence/motif/comparison IDs and show a factual
  delta;
- forced renderer churn solely to satisfy a quota fails review;
- semantic framing repetition alerts after three uses/15 minutes unless a
  logged continuity/comparison hold applies;
- every major event has a visible before/after consequence;
- meaning-bearing dialogue holds ≥4 seconds plus ~180 words/minute; only
  nonessential barks may use a two-second minimum;
- one dominant hero effect per shot; no dead presentation >20 seconds.

### P1.7 Persistent visual identity and minimum custom art [A1][A2][A4][A5][A6]

Dependencies: P0.9, P0.10, P1.6.

Create modular portrait parts and at least six side-view battle puppets; map
semantic actor recipes across portrait, exploration, dialogue, battle, palette,
silhouette, equipment, scars, and accessories.

Acceptance:

- 100 actors preserve identity across save/load, all modes, and reordered atlas
  packing;
- fewer than 2% have confusing silhouette collisions in review;
- at least 90% of blinded viewers match a named hero across four modes;
- at least 80% identify intended relationship/emotional state in dialogue
  goldens;
- battle puppets support idle, attack, cast, hit, defend, status, victory, and
  defeat and visibly reflect class/equipment;
- Ninja Adventure remains scaffold; custom work prevents generic ninja reskins
  and palette-swap major actors/bosses.

### P1.8 Believable atlas, towns, dungeons, NPCs, and monsters [A1][A2][A3][A4][A5]

Dependencies: P1.2, P1.6, P1.7.

Generate a regional atlas with three towns, roads, wilderness, and one semantic
dungeon. Towns have causal location/economy, districts, households/routines,
history, and visible state. Dungeon has original purpose, historical strata,
resources/ecology, territories, routes/loops/locks/keys/secrets, and landmarks.

Acceptance:

- settlements are reachable and resource/location logic validates;
- each town is recognizable without its label through at least three landmarks,
  district/occupation language, and day/night/weather/crisis state;
- return visits retain landmarks, visible history, reputation, and hero
  attachment;
- dungeon required paths are solvable; locks never precede every key; zone,
  route, gates, secrets, danger, ecology, and landmarks are glance-readable;
- atlas geography/routes/weather/fronts/discoveries/party movement correspond
  only to canonical facts;
- recurring monsters/NPCs preserve identity, ecology/role, last shared event,
  condition, and knowledge provenance.

### P1.9 Tactical battle, planning, failure, and consequence readability [A1][A2][A3][A4][A5]

Dependencies: P0.7, P1.3, P1.7.

Implement deterministic turn-based combat, tactics/intent planning, clear
threat/counter telegraphing, status/interrupt/escape/capture events, and
success/retreat/defeat continuations.

Acceptance:

- victory, retreat, injury/scar, capture/displacement, loss, and recovery paths
  work and never deadlock the campaign;
- planning shows alternatives and actor/party intent;
- post-battle explanation identifies decisions and counters that determined the
  outcome;
- no hidden mid-fight rubber-banding or Campaign/Spectator override changes a
  committed result;
- default mode never resolves a hero-terminal event unwatched.

### P1.10 Catch-up, recap, Chronicle, and renderer lifecycle [A1][A2][A3][A4][A5][A6]

Dependencies: P0.1, P0.5, P0.6, P0.9, P1.5, P1.6.

Implement hierarchical catch-up in ≤200 ms chunks, significance queue, factual
return recap, Chronicle archive, and renderer
`mount/patch/suspend/resume/dispose`.

Acceptance:

- 15+ minutes away with material changes produces a skippable/expandable
  20–30-second recap of ≤5 facts and roughly ≤80 words;
- queued attention events retain causal order and require no unpresented
  dialogue/choice;
- 10,000 forced scene transitions leave zero orphan ticker/listener and heap
  slope <1 MB/hour after warm-up;
- WebGL context restoration rebuilds active scene from projection and returns
  under the texture ceiling within two transitions;
- seven-day resume remains responsive and exact;
- save acknowledgement occurs only after durable commit.

### P1.11 Deterministic narrator and declarative plot-kernel tooling [A1][A2][A3]

Dependencies: P0.8, P1.4, P1.5.

Build authored grammars/templates and declarative validated kernels for
situations, dilemmas, testimony, revelation, reversal, choice, recovery, and
closure.

Acceptance:

- AI-off completes a coherent multi-chapter arc with recurring actors and
  validated consequences;
- authors add a kernel without code changes;
- every effect maps to an enumerated event and every utterance sees only
  speaker-allowed facts;
- historical dialogue/prose referenced later is promoted to a pinned artifact;
- factual recap correctness does not depend on language generation.

### P1.12 P1 exit: determinism, longevity, watchability, accessibility, and power [A1][A2][A3][A4][A5][A6]

Dependencies: P1.1–P1.11.

Acceptance requires all of:

- coherent attractive 15-minute AI-off adventure and minimally presented
  alternate kernel;
- 100 seeds × 10,000 in-game days without broken references, impossible
  locations, overflow, unbounded queues, stuck arcs, or unwinnable global state;
- one-million-event replay/compaction resumes to the expected canonical hash;
- two-hour multi-seed non-repetition test including the alternate kernel;
- eight-hour named-device foreground soak with no invalid head, duplicate event,
  unhandled rejection, inaccessible scene, dead frame >20 seconds, or heap slope
  >1 MB/hour;
- Workday game-owned frame p95 ≤25 ms, p99 ≤33 ms, missed deadlines <1%; Eco
  p95 ≤50 ms at 20 FPS or ≤66 ms at 15 FPS, missed <1%; no more than one
  game-attributable >50 ms task/10 steady-state minutes;
- main render average ≤4 ms/p95 ≤6 ms; measurable GPU average ≤8 ms/p95 ≤12 ms;
- one-hour power above static equivalent ≤5 W Workday and ≤2.5 W Eco where
  measurable; fixed-brightness battery targets <10%/hour and <5%/hour are
  reported secondarily;
- payload, cache, atlas, texture, heap, draw, particle, actor, and game+model
  budgets pass (model gate uses only an approved synthetic workload in P1);
- sensory/emotional intensity reported separately over one/two/eight hours;
  high sensory ≤8% and no continuous burst >12 seconds; calm target 65–80%,
  medium remainder with 15–30% target, and ≥45-second low-sensory recovery after
  a true climax as a reason-reviewed target;
- Chronicle ≤20% landscape area, no bright panel fixed >5 minutes, anchor drift/
  fade 8–20 px, OLED mode, camera pan ≤0.25 viewport/s, no zoom oscillation,
  Workday shake ≤4 CSS px/150 ms and zero under reduced motion;
- all target layouts, 200% text, reduced motion, contrast, flash, DOM Chronicle,
  pause/hide, muted start, and CSP/import tests pass;
- exact save/resume, export/import, multi-tab, seven-day close/reopen, and
  no-WebGPU/no-model paths pass.

## P2 — Deep systemic world and evaluated tiny AI

### P2.1 Deep regions, towns, dungeons, ecology, and belonging [A1][A2][A3][A4]

Dependencies: P1.8, P1.12.

Add watersheds/biomes/routes/chunking, settlement placement, households,
schedules, economies, factions, projects, seasons, damage/recovery, dungeon
history/ecology/territories/puzzles, property, homes, favorite places, and
return-after-absence reactions.

Acceptance:

- generation validates reachability, watersheds/resources, economy reasons,
  schedules, solvability, keys, ecology, and actor locations across ≥10,000
  seeds;
- distant places advance at aggregate fidelity without identity contradictions;
- revisited places preserve landmark/relationship/history continuity and visibly
  react to absence and return;
- construction, scarcity, conflict, damage, and recovery create canonical and
  visible changes.

### P2.2 Bounded classes, mastery, living equipment, monsters, and creatures [A1][A2][A3][A4][A5]

Dependencies: P0.7, P1.9, P2.1.

Add class tracks/specializations, prepared sidegrades, tactical roles, living
equipment/provenance, monster species/instances/ecology/knowledge, capture,
bonding/evolution, and population consequences.

Acceptance:

- 100-year runs keep stats, action economy, modifiers, statuses, loadouts,
  active collections, currency, and storage within declared caps;
- a new mature sidegrade still creates a measurable tradeoff rather than
  strictly dominating prior choices;
- old monsters remain weak where appropriate; habitats and player actions alter
  encounters/populations;
- captured/bonded/scarred/named/repeated monsters promote with NPC-grade identity
  provenance;
- living equipment preserves naming, ownership, transformations, visual state,
  and situational power without endless rarity inflation.

### P2.3 Autonomous cast, nemeses, institutions, homes, and fronts [A1][A2][A3][A4][A5]

Dependencies: P1.5, P2.1, P2.2.

Add companion negotiation/departure/reconciliation/grief, subjective memory,
nemesis motives/resources/adaptation/succession, institutions/projects, home
rituals, memory crystallization, and independent faction/world fronts.

Acceptance:

- actors disagree/leave/reconcile from Actor Policy evidence, never drama quota;
- nemeses recur only through causal survival and support reconciliation,
  permanent resolution, or succession;
- memories crystallize into bounded slots with source events and replacement;
- projects/institutions visibly change towns/world eligibility;
- front advancement remains bounded/legible and attention-gates consequential
  thresholds;
- promoted/demoted cast survives ten-year re-encounter with identity, knowledge,
  relationship, possession, and aggregate conservation intact.

### P2.4 World eras, Eternal mastery, Legacy succession, and museum [A1][A2][A3][A5][A6]

Dependencies: P0.1, P0.6, P2.2, P2.3.

Add seasons/anniversaries, era transitions, mentorship/protégés, retirement and
successor selection in Legacy, Eternal role changes, Chronicle/museum, monuments,
and inherited artifacts/obligations.

Acceptance:

- Eternal Hero crosses eras without numeric runaway or automatic lifetime power;
- Legacy successor inherits selected obligations, relationships, institutions,
  artifacts, and world consequences without becoming a clone;
- retired/dead actors remain in world history under policy;
- long counters use stable constant-cost access and no era-zero iteration;
- century simulation mandatory record targets ≤100 MB at year 100 and ≤1 MB/
  year average after warm-up, excluding caches/optional archives; approaching
  budget triggers explicit archive/export and verified era compaction, never
  silent artifact loss.

### P2.5 SmolLM2-360M task evaluation and guarded integration [A1][A2][A3][A4][A5][A6]

Dependencies: P1.11, P1.12, P0.2, P0.12.

Integrate [WebLLM](https://github.com/mlc-ai/web-llm) in a dedicated narrator
worker and evaluate [SmolLM2-360M-Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct)
per task. Begin with voice rewrites, barks, letters/journals/dreams,
inscriptions, item/monster observations, reactions, and chapter headlines.
Keep factual recaps deterministic; Advisor/Critic/structural/visual ranking stay
disabled until separately proven.

Acceptance per enabled task:

- first download is explicit and shows ~204 MB size, storage/memory impact,
  deletion control, and AI-off alternative; never silently fetch;
- ≥200 fixed paired fact packets over ≥20 seeds, automated validation, and
  blinded comparison against templates;
- valid output wins ≥60% of non-tied pairs and 95% confidence lower bound >50%;
- first-pass normalized schema validity ≥99%; zero displayed/accepted fact or
  knowledge violations after validation;
- missing WebGPU, download/cache/version failure, malformed output, timeout,
  worker/device loss, and deletion immediately fall back and preserve saves;
- normal packet roughly ≤700 input/96 output tokens; token bucket burst two
  standard calls/10 minutes; sustained Workday ≤1,000 output tokens/hour and
  <3% inference duty; Eco ≤250/hour and <1%;
- campaign maintains ≥3 AI-independent valid scene candidates; visuals never
  wait for prose;
- named-device latency, frame, memory, power, thermal, and combined <900 MB
  footprint gates pass;
- a success in one task enables only that task.

### P2.6 Long-haul composition, Viewer Disclosure, and visual histories [A2][A3][A4][A5][A6]

Dependencies: P1.6, P1.10, P2.3, P2.4.

Add composition memory across mode/place/weather/palette/camera/subject/lens,
relationship/world-history/route/quest visualizations, monster field journal,
legacy montage, and optional dramatic-irony cutaways.

Acceptance:

- party-only remains default; dramatic-irony scenes are labeled "Meanwhile —
  unknown to the party" and cite committed fact IDs;
- viewer disclosure never enters Actor Policy, actor Narrator packets, Rules
  Engine knowledge checks, or party recaps;
- same campaign under both spoiler policies has identical canonical and actor-
  choice hashes;
- eight-hour tests across ≥20 seeds meet attention/repetition targets with no
  exact dialogue/shot/transition signature in its suppression window;
- callbacks/comparisons retain motifs while showing new causal meaning;
- long histories remain understandable through Chronicle/museum/atlas rather
  than permanent dashboards.

### P2.7 Visual identity expansion and build-time art workflow [A1][A2][A4][A5]

Dependencies: P1.7, P2.1–P2.4.

Expand modular portraits, battle puppets, generic-fantasy variants, map/front/
weather glyphs, professions, seasons/aging/state, fishing/boats/mounts/camps,
town damage/festivals, cross-mode dungeon landmarks, and unique boss/faction
silhouettes. Use commissioned or build-time generated concepts with manual
cleanup; ship no raw generated sprite sheet.

Acceptance:

- every addition passes source/license manifest, style, palette, outline,
  lighting, dimensions, alpha, seam, frame, naming, silhouette, accessibility,
  and day/night/biome/battle/color-vision contact-sheet review;
- recurring identity is stable across every applicable mode and era state;
- no major faction/species/boss relies only on a generic ninja reskin or palette
  swap;
- content packs stay within lazy payload/atlas/texture budgets.

## P3 — Disciplined expansion and optional capabilities

### P3.1 Admitted activity modules [A1][A2][A3][A4][A5][A6]

Dependencies: P0.4, P0.7, P2.1–P2.4.

Add fishing first, then crafting, cooking, farming, tournaments, games,
festivals, jobs, romance, mounts, sailing, politics, and homes one at a time.

Acceptance for every module:

- passes the P0.7 admission schema and remains optional to the core campaign;
- uses public typed cross-system contracts and supports disable/removal migration;
- long-run economy/ecology/repetition/storage tests stay bounded;
- fishing specifically changes ecology plus economy/relationship/story, reuses
  existing resources, pays time/bait/tackle/inventory/reputation costs, exposes
  keep/release tradeoffs, and creates visible shoreline/journal/market/meal/
  relationship/ecology consequences;
- repeated fishing extraction lowers later yield and may affect reputation;
  sustainable behavior produces a distinct consequence;
- no standalone Fishing XP currency or universal combat buff.

### P3.2 Declarative content packs and creator tooling [A1][A3][A4][A6]

Dependencies: P0.4, P0.5, P0.10, P0.11, P1.11.

Support versioned declarative modules, plot kernels, encounter kits, visual
motifs, and content manifests without third-party executable code.

Acceptance:

- validation enforces schema, IDs, namespaces, licenses/attribution, hashes,
  import limits, performance budgets, and deterministic ordering;
- malformed/hostile packs cannot execute code or write canonical state outside
  validated events;
- removal cannot corrupt campaigns; missing content opens read-only/export or
  migrates through a declared fallback;
- credits generate automatically.

### P3.3 Optional model tiers and bounded viewer preferences [A1][A3][A5][A6]

Dependencies: P2.5, P2.6.

Only after SmolLM proves the interface, separately evaluate larger local models
and preferences such as more battles, less dialogue, or follow this NPC.

Acceptance:

- every model/task repeats P2.5 quality, fact, security, power, and fallback
  evaluation; larger size alone is not evidence;
- changing/deleting model never changes save validity;
- preferences adjust only bounded future candidate/presentation weights and
  never rewrite history, violate Actor Policy, or bypass cooldown/safety rules;
- AI-off remains the complete baseline.

### P3.4 Optional first-person 3D dungeon proof [A1][A3][A4][A5][A6]

Dependencies: P1.12, P2.7; must not begin before 2D long-haul and identity gates.

Use the coherent KayKit family to render the same canonical dungeon graph,
entities, and landmark IDs through a pixel-treated palette/LUT. Production 3D
is not implied by a successful proof.

Acceptance:

- optional bundle ≤12 MB compressed and lazy-loaded;
- same topology, doors, locks, routes, entities, and landmarks as the 2D view;
- 30 FPS Workday-class target on named hardware, context-loss restoration, and
  measured texture/memory/thermal/model coexistence;
- Runtime Governor disables 3D or inference when combined budgets fail;
- only selectively optimized runtime assets ship; no KayKit source bundle
  resale/repackaging;
- failure removes no 2D capability or canonical state.

### P3.5 Provenance-bearing Hall of Legends [A1][A2][A3][A4][A5][A6]

Dependencies: P0.6, P2.4, P3.2.

Allow an isolated campaign to import an immutable content-addressed `LegendCard`
from another campaign without shared mutable world state.

Acceptance:

- card stores source campaign ID/hash and cannot mutate the source;
- receiving world may canonically contain the card as book, rumor, dream,
  monument, or claimed legend, but foreign events never become objective local
  fact;
- actors know it only after explicit learning events and retain belief/legend
  epistemic status;
- deletion/change of source does not break receiving save;
- independent campaign clocks/writers remain isolated.

### P3.6 Full release, failure, upgrade, and century matrix [A1][A2][A3][A4][A5][A6]

Dependencies: all release-target P0–P3 items.

Acceptance:

- ≥100,000 generation seeds, million-event replay fixtures, 100-year campaign,
  two-hour automated browser runs, and eight-hour real-device foreground runs;
- forced worker death, IPC reorder/duplication, WebGL/WebGPU loss, quota error,
  checkpoint interruption, model failure/cache deletion, and asset eviction;
- N−1→N online/offline service-worker and save-migration matrix across current
  Chrome, Firefox, and WebKit smoke tests;
- no invalid head, invariant failure, duplicate event, broken reference,
  unauthorized knowledge flow, inaccessible scene, unhandled rejection,
  post-warm-up heap slope >1 MB/hour, or unexplained budget regression;
- mandatory save record meets the adjudicated century budget or an explicit ADR
  documents measured impossibility and a safer export/compaction replacement;
- release report publishes exact reference hardware, unmeasured signals,
  AI-on/off results, attention/repetition report, and license/credits manifest.

## Cross-cutting resource and presentation gates

These gates are owned by their items above and collected here for discoverability.

- Workday/Eco/Showcase/Hidden: 30/15–20/60/0 FPS.
- App-shell JavaScript ≤350 KB gzip; shell art/fonts ≤2 MB; first scene ≤10 MB;
  Phase 1 visuals ≤5 MB; base cache ≤10 MB; later pack ≤1.5 MB; 3D ≤12 MB.
- Atlas ≤2048²; texture ≤64 MB with model/≤96 MB without; no-model JS heap
  <192 MB; measured game+model <900 MB.
- Workday/Eco draw calls ≤200/100, particles ≤500/100, animated actors ≤80/30.
- Workday p95/p99 game frame ≤25/33 ms and <1% missed; Eco p95 ≤50 ms at 20
  FPS or ≤66 ms at 15 FPS and <1% missed.
- Main render average/p95 ≤4/6 ms; GPU average/p95 ≤8/12 ms where supported;
  ≤1 game-attributable >50 ms Long Task/10 steady minutes.
- Workday/Eco power above static target ≤5/2.5 W; battery <10%/<5% per hour is a
  secondary named-device target.
- Chronicle ≤20% landscape, no bright fixed panel >5 minutes, 8–20 px drift/
  fade, OLED mode, camera pan ≤0.25 viewport/s, no zoom oscillation, Workday
  shake ≤4 CSS px/150 ms and none under reduced motion.
- Body/HUD ≥16 CSS px, dialogue ≥18 px, scale 200%, contrast ≥4.5:1, no
  color-only state, no flash >3 Hz, muted start, accessible DOM Chronicle.
- High sensory ≤8% and ≤12 continuous seconds; calm target 65–80%; medium is
  remainder with 15–30% target; sensory and emotional intensity are separate.

## Council coverage matrix

An `X` means the role's accepted material improvement is implemented by the
listed backlog items. The cells name representative IDs; the detailed provenance
tags above are authoritative.

| Accepted improvement | A1 | A2 | A3 | A4 | A5 | A6 | Backlog coverage |
|---|:---:|:---:|:---:|:---:|:---:|:---:|---|
| Deterministic GM; model never sovereign | X | X | X | X | X | X | P0.2, P1.4, P2.5 |
| Actor integrity and evidence-backed choices | X | X | X |  | X | X | P0.2, P0.8, P1.3–P1.5 |
| Browser-honest forever and attention gating | X | X | X | X | X | X | P0.1, P1.10, P1.12 |
| Eternal/Legacy/Mortal policy and lasting loss | X | X | X | X | X | X | P0.1, P0.7, P1.5, P2.4 |
| Bounded progression/working sets and honest old enemies | X | X | X | X | X | X | P0.7, P2.2, P2.4 |
| Semantic history, pinned artifacts, century concern | X | X | X | X | X | X | P0.6, P2.4, P3.6 |
| Entity fidelity and promotion/demotion continuity | X | X | X | X | X | X | P0.6, P1.8, P2.1–P2.3 |
| Multi-horizon story, fronts, promises, rivals, recovery | X | X | X |  | X |  | P0.8, P1.4–P1.5, P1.11, P2.3 |
| Three kernels including non-combat/social proof | X | X | X | X | X | X | P1.2, P1.6, P1.12 |
| Module admission and anti-currency rules | X | X | X | X | X | X | P0.7, P3.1 |
| Campaign/Spectator/Runtime metric ownership | X | X | X | X | X | X | P0.2, P0.9, P1.4 |
| Sensory/emotional rhythm and callback-safe repetition | X | X | X | X | X | X | P0.9, P1.6, P1.12, P2.6 |
| Three-/ten-second glance and layered Chronicle | X | X | X | X | X | X | P1.3, P1.6, P1.12 |
| Living Pixel Chronicle and responsive 320×180 reference | X | X | X | X | X | X | P0.9, P1.6–P1.8 |
| Asset provenance and exact license caveats | X |  | X | X | X | X | P0.10, P2.7, P3.2, P3.4 |
| Cross-mode identity and minimum P1 custom art | X | X |  | X | X | X | P0.9, P1.7, P2.7 |
| Workday power, percentile frame, burn-in, camera gates | X | X | X | X | X | X | P0.12, P1.12 |
| IndexedDB transactions, Web Locks, safe updates | X | X | X |  |  | X | P0.5, P1.1, P1.10 |
| IPC/module/security/accessibility boundaries |  |  | X | X | X | X | P0.4, P0.11, P1.12, P3.2 |
| SmolLM task-level evidence, explicit download, fallback | X | X | X | X | X | X | P2.5, P3.3 |
| Party-only default and isolated viewer disclosure | X | X | X | X | X | X | P0.9, P2.6 |
| Staged P0 contracts versus P1 production proof | X | X | X | X | X | X | P0.9–P0.12, P1.6, P1.12 |
| Optional 3D only after long-haul 2D gates | X |  | X | X | X | X | P3.4 |
| Provenance-bearing, non-shared Hall of Legends | X | X | X | X | X | X | P3.5 |

## Per-role coverage audit

- **A1:** authority contract, adventure diversity/social resolution, promise and
  canon budgets, bounded active breadth, dungeon ecology/history, earned
  betrayal/rival recurrence, century storage pressure, semantic visual recipes,
  LegendCards, and late 3D are in P0.2/P0.6–P0.9/P1.2/P1.5/P1.8/P2.4/P3.4–P3.6.
- **A2:** Actor Policy, self-model, relationship evidence, homes/rest, lifecycle
  safety, lasting consequences, attention-gated choices, exact pivotal artifacts,
  intensity separation, entity continuity, and viewer/actor knowledge isolation
  are in P0.1–P0.2/P0.6/P0.8–P0.9/P1.3/P1.5/P2.3–P2.6.
- **A3:** multi-horizon loops, deterministic fun direction, failure/recovery,
  fronts/rivals/living equipment/eras, long-run tests, economy contracts, and
  module admission are in P0.7–P0.8/P1.2/P1.4–P1.5/P2.2–P2.4/P3.1/P3.6.
- **A4:** Living Pixel Chronicle, responsive pixel/DOM composition, coherent
  identity, custom battle/portrait minimum, provenance/license manifest, atlas/
  visual budgets, accessibility, golden scenes, and curated/lazy 3D are in
  P0.9–P0.11/P1.6–P1.8/P1.12/P2.7/P3.4.
- **A5:** two-tier glance test, scene sentences, rare wow, attention/repetition
  memory, recaps, alternate presented kernel, frame/power/camera/burn-in/OLED
  gates, and persistent visual consequences are in P1.2–P1.3/P1.6/P1.10/
  P1.12/P2.6.
- **A6:** sole-writer worker architecture, keyed determinism, validated IPC,
  Web Locks, transactional segmented persistence, compaction, quota/export,
  safe service-worker updates, Runtime Governor, named hardware, security/CSP,
  context/device loss, model token bucket, and failure matrices are in
  P0.3–P0.6/P0.11–P0.12/P1.10/P1.12/P2.5/P3.2/P3.6.

No accepted material recommendation from a reconciliation response is omitted.
Minority concerns are retained explicitly: A1's century-scale storage and
provenance-bearing legends, A2's Actor Policy and emotional/sensory split, A4's
precise Tiny Swords/KayKit caveats, and A5's stronger glance/burn-in/power gates.

## Post-v0.2 corrective backlog — v0.3 depth slice

These items refine and pull forward the concrete RPG portions of P0/P1; they do
not replace the longevity architecture above. `P0-corrective` blocks further
feature breadth. `P1-corrective` is required for the next playable-depth exit.

### V03.1 Canonical RPG domain and schema-v3 migration [A1][A2][A3][A5][A6]

- **Priority:** P0-corrective.
- **Dependencies:** P0.3, P0.5, P0.6, P0.8.
- **Deliver:** typed IDs, events, invariants, reducers, and persisted state for
  attributes/derived stats, inventory/equipment, quest graph, world graph and
  route position, towns, dungeons, battles, and adventure-log references.
- **Acceptance:** schema-v2 saves migrate deterministically; schema-v3 state
  round-trips through IndexedDB after session storage is cleared; 100 seeded
  replay cases produce byte-equivalent canonical state; invalid references and
  illegal transitions are rejected; no required display value is manufactured
  by the renderer or DOM.

### V03.2 Real status rail and layered inspector [A1][A2][A3][A4][A5][A6]

- **Priority:** P1-corrective.
- **Dependencies:** V03.1, P0.9, P0.11.
- **Deliver:** responsive projection of health/current maximum, XP/level, MIG,
  AGI, WIT, SPI, ARM, POW, current quest, up to three subquests, journey
  progress, equipped weapon/armor/trinket, and recent events.
- **Acceptance:** every field is sourced from canonical state and updates on its
  resolving event; desktop exposes all groups persistently; portrait exposes
  the same groups through keyboard/screen-reader-operable collapsibles; at least
  eight events and two active subquests are readable; automated viewport tests
  show no clipping at 320×568, 768×1024, and 1366×768; three-/ten-second review
  identifies hero/location/current action and then cause/next objective.

### V03.3 Persistent world graph and visible route traversal [A1][A2][A3][A4][A5][A6]

- **Priority:** P1-corrective.
- **Dependencies:** V03.1, P1.2, P1.8.
- **Deliver:** seeded nodes/edges, route selection, discovery/visit flags, and
  canonical `edgeId`/direction/normalized progress shared by atlas and travel.
- **Acceptance:** reference region has at least six nodes, seven traversable
  edges, and three towns; each simulation step moves at most the configured
  distance and cannot cross a blocked edge; marker progress is monotonic along
  the selected polyline; atlas and travel resolve to the same coordinate; a
  mid-edge reload resumes exactly; deterministic tests cover 100 seeds.

### V03.4 Three seeded, persistent towns [A1][A2][A3][A4][A5]

- **Priority:** P1-corrective.
- **Dependencies:** V03.1, V03.3, P0.10, P1.7.
- **Deliver:** three named towns with distinct topology, palette/material rules,
  at least three landmark/service roles each, resident/NPC anchors, and mutable
  consequence state.
- **Acceptance:** town topology and landmark IDs are stable across leave/revisit
  and reload; silhouette-only review distinguishes all three; a quest or battle
  outcome visibly changes one town without changing the others; no town scene
  reuses the same complete building layout; deterministic snapshots cover 100
  seeds and golden images cover each town.

### V03.5 Graph-first dungeon and step traversal [A1][A2][A3][A4][A5][A6]

- **Priority:** P1-corrective.
- **Dependencies:** V03.1, V03.3, P1.8.
- **Deliver:** persisted cells/rooms and passages, entrance, goal, hero cell,
  visited/fog state, landmarks, at least one lock/key relation, and one shortcut;
  2D presentation is derived from that topology.
- **Acceptance:** an independent solver proves entrance-to-goal reachability and
  lock/key ordering for 1,000 seeds; every hero step crosses one legal adjacency;
  fog only reveals allowed cells; the displayed hero/goal/walls equal canonical
  coordinates; save/reload and town detour preserve the maze and visited set;
  no dungeon wall is generated from display tick alone.

### V03.6 Multi-turn tactical battle [A1][A2][A3][A4][A5][A6]

- **Priority:** P1-corrective.
- **Dependencies:** V03.1, V03.8, P1.9.
- **Deliver:** combatant instances, health/resources, initiative, statuses,
  intent, action legality, resolution events, rewards, and victory/retreat/
  defeat outcomes; minimum hero verbs are attack, guard, skill, and item.
- **Acceptance:** at least two mechanically different monster definitions use
  the same legality contract as the hero; health/status/resource bars reflect
  resolved events; presentation shows intent → anticipation → impact → reaction
  → consequence; no encounter grants rewards before a valid outcome; 1,000
  seeded simulations terminate without negative health, illegal action, or
  invariant failure and replay identically.

### V03.7 Main quest, subquests, and world consequences [A1][A2][A3][A5][A6]

- **Priority:** P1-corrective.
- **Dependencies:** V03.1, V03.3, V03.5, V03.6, P1.5.
- **Deliver:** quest/objective graph with inactive, active, completed, failed,
  and resolved states; event-driven progress, rewards, and place/entity changes.
- **Acceptance:** the reference adventure runs one main quest and at least two
  simultaneous subquests; travel, dungeon, and combat events advance explicit
  objectives; at least one optional outcome changes a later town or encounter;
  invalid or repeated events cannot double-claim a reward; objective state and
  consequence IDs survive reload and deterministic replay.

### V03.8 Bounded inventory, equipment, and item provenance [A1][A2][A3][A4][A5][A6]

- **Priority:** P1-corrective.
- **Dependencies:** V03.1, P0.6, P0.7.
- **Deliver:** bounded item instances and stacks, loot origins, weapon/armor/
  trinket slots, derived-stat effects, and usable battle items.
- **Acceptance:** the slice includes at least six mechanically distinct item
  definitions; loot enters inventory exactly once; equipping each slot changes
  a tested derived rule and is visible in the status rail; an item action changes
  a legal battle outcome; capacity behavior is explicit and lossless; origin,
  owner, and acquisition event persist through save/reload.

### V03.9 Canonical adventure log and Chronicle projection [A1][A2][A3][A5][A6]

- **Priority:** P1-corrective.
- **Dependencies:** V03.1, V03.3, V03.6, V03.7, V03.8, P0.6.
- **Deliver:** bounded typed events with sequence/time, category, entity refs,
  cause, consequence, and deterministic text projection for recent history.
- **Acceptance:** status UI exposes at least eight recent entries; retained
  working history holds at least 128 without unbounded growth; travel, discovery,
  quest, item, battle, injury, recovery, and town-change events are distinguishable
  without color alone; reload adds no duplicate and loses no committed event;
  Chronicle sentences resolve to existing entity and cause IDs.

### V03.10 Existing-screen depth contract [A1][A2][A3][A4][A5][A6]

- **Priority:** P1-corrective.
- **Dependencies:** V03.2–V03.9, P1.6.
- **Deliver:** each current mode projects at least one canonical action, one live
  state/progress measure, one consequence, and one legible transition animation.
- **Acceptance:** town shows place/NPC/service change; atlas shows topology,
  chosen route, position, and visited state; travel shows an actual route step;
  dungeon shows maze/hero/fog/landmarks; battle shows legal choice and resolved
  phases; camp performs rest, equipment, or relationship change; Chronicle shows
  referenced event/quest/item history. A test fixture fails if any primary label,
  number, marker, or result is hard-coded independently of canonical state.

### V03.11 Coherent licensed prototype-art pass [A4][A5][A6]

- **Priority:** P1-corrective.
- **Dependencies:** P0.10, V03.3–V03.6.
- **Deliver:** a reviewed subset of Ninja Adventure as the primary 16×16 set;
  Kenney CC0 packs may supply normalized UI/minimap/greybox gaps only. Retain the
  procedural fallback. Do not import Liberated Pixel Cup into this slice.
- **Acceptance:** manifest records source URL, publisher license statement,
  retained license, archive/version hash, selected-file hash, transformation,
  atlas placement, and semantic role; contact sheets approve scale/palette/
  silhouette coherence; no runtime asset lacks provenance; optimized selections
  remain inside P0.10 budgets; full authoring archives are absent from the build.

### V03.12 Renderer lifecycle and projection efficiency [A4][A5][A6]

- **Priority:** P1-corrective.
- **Dependencies:** V03.1, V03.10, P0.4, P0.12.
- **Deliver:** stable scene display objects updated from projections, explicit
  mount/dispose ownership for ticker and resize listeners, and incremental
  campaign-list refresh separate from the simulation beat.
- **Acceptance:** 100 scene transitions leave one ticker callback and one resize
  listener; mounted display-object count returns to the established baseline;
  no unchanged campaign record is reread or rerendered per beat; a 30-minute
  representative run has no monotonic listener/display-object growth and meets
  the existing frame/Long Task gates on named hardware.

### V03.13 v0.3 causal-adventure exit gate [A1][A2][A3][A4][A5][A6]

- **Priority:** P0-corrective release gate.
- **Dependencies:** V03.1–V03.12, P1.10, P1.12.
- **Deliver:** deterministic integration fixture, UI/e2e journey, golden scenes,
  and a user-critique checklist linked to evidence.
- **Acceptance:** a fresh named hero visibly traverses a persistent route,
  revisits a distinct town, enters and resumes a solvable maze, resolves a
  multi-turn battle, changes health/stats/items, advances one main quest and two
  subquests, and exposes at least eight log entries; reload at mid-route,
  mid-dungeon, and mid-battle restores the exact canonical head; screenshots
  cover every existing mode at desktop and portrait sizes; unit, deterministic,
  worker, build, and e2e checks pass. No new activity mode, production 3D, or LLM
  integration may displace this gate.

## Post-v0.2 council coverage matrix

| Accepted corrective improvement | A1 | A2 | A3 | A4 | A5 | A6 | Coverage |
|---|:---:|:---:|:---:|:---:|:---:|:---:|---|
| Canonical stats/health/quests/items/log state | X | X | X |  | X | X | V03.1–V03.2, V03.7–V03.9 |
| Persistent route and exact visible traversal | X | X | X | X | X | X | V03.3 |
| Three recognizable persistent towns | X | X | X | X | X |  | V03.4 |
| Solvable persistent maze and step traversal | X | X | X | X | X | X | V03.5 |
| Legal multi-turn combat with visible causality | X | X | X | X | X | X | V03.6 |
| Depth and consequence in every current screen | X | X | X | X | X | X | V03.10, V03.13 |
| Coherent permissive art and exact provenance |  |  |  | X | X | X | V03.11 |
| Lifecycle-safe, efficient projections |  |  |  | X | X | X | V03.12 |
| No breadth/LLM/3D before causal slice | X | X | X | X | X | X | V03.13 |

All six roles accepted the status, route, place, maze, combat, item, quest, log,
and screen-depth recovery as one causal slice. Minority emphases remain visible:
A1's canon/legality requirements, A2's continuity of lived experience, A3's
cross-system loop, A4's license/style gate, A5's readable action spectacle, and
A6's domain-first lifecycle and deterministic-test constraints.

## v0.4 iterative expansion backlog

Every item below is one green feature commit and push. Begin only from the last
deployed commit; stage explicit files, run deterministic/unit/build plus relevant
browser/visual checks, push without force, and verify Pages before starting the
next item. Domain state, projection, accessibility, migration, and tests ship
together when they are one feature; unrelated systems never share a commit.

### V04.0 Responsive character safe area — delivered [A2][A4][A5][A6]

- **Commit:** `7e30d23 fix: keep characters aligned on mobile screens`.
- **Deliver:** pure responsive layer-layout projection that preserves the
  character layer's centered base offset during presentation animation.
- **Acceptance:** 320×568, 375×667, and 568×320 before/after captures keep the
  hero aligned with the world; five unit fixtures, 45 tests, build, Chromium,
  CI, and live deployment pass. Extend later goldens to every mode and reduced
  motion at 430×932 and 1366×768.

### V04.1 Typed abilities and monster secrets — foundation delivered [A1][A2][A3][A5][A6]

- **Commit:** `0ff9dd4 feat: add typed abilities and monster secrets`.
- **Deliver:** original named spells, class techniques, monster signatures,
  mana/effect legality, use mastery, species lore, three-victory guaranteed
  learning, bounded discoveries, and world-4/depth-2 migration.
- **Acceptance:** active schema-3 combat migrates without reroll/heal/reward;
  v1/v2/v3 saves upgrade; 20,000 ticks stay under the 1 MB worker envelope;
  collections remain capped; 40 tests, Chromium, CI, and live deployment pass.

### V04.2 Canonical Actor Policy commands [A1][A2][A3][A5][A6]

- **Commit:** `refactor: make actor choices drive canonical commands`.
- **Dependencies:** V04.1.
- **Deliver:** director exposes typed legal commands; Actor Policy chooses one;
  the reducer resolves that exact command/event instead of independently
  selecting mechanics behind flavor prose.
- **Acceptance:** Chronicle rationale cites command/event IDs; 1,000-seed replay
  finds no displayed action that disagrees with resolved state.

### V04.3 Lifelong compact adventure ledger [A1][A2][A3][A5][A6]

- **Commits:** codec → immutable segments → snapshots/replay → statistics →
  export/archive, each separately green and pushed.
- **Dependencies:** V04.2.
- **Deliver:** versioned semantic events with campaign/sequence/tick/type/actor/
  entity/cause references; numeric enums, varints/deltas, segment dictionaries,
  checksums and hash chain; append-only IndexedDB segments; verified heads;
  periodic snapshots; rebuildable statistics; import/export and quota UI.
- **Acceptance:** malformed lengths/refs/checksums fail safely; a million-event
  fixture replays to the same canonical hash; semantic history is never silently
  deleted; only frames, replaceable prose, and camera instructions compact away.
  Target median record ≤64 bytes, p95 ≤256 bytes, million events ≤64 MB, and
  mandatory year-100 campaign data ≤100 MB. Session storage remains disposable
  tab state rather than ledger authority.

### V04.4 Monster research and witnessed technique learning [A1][A2][A3][A4][A5][A6]

- **Commit:** `feat: learn techniques from witnessed monster behavior`.
- **Dependencies:** V04.1, V04.3.
- **Deliver:** bounded species field ledger; witnessed moves, habitats, tested
  defenses/statuses and outcomes reveal facts in tiers; witnessing a signature
  plus surviving/countering and battle outcome advances finite deterministic
  insight; learned secrets retain source species/event provenance.
- **Acceptance:** at least three monsters telegraph and perform distinct original
  techniques; hints never reveal unknown facts; documented conditions guarantee
  learning within a bounded encounter count; no prose or ambient chance decides
  correctness. Codex can grow, but only six techniques are prepared.

### V04.5 Effective-use mastery, equipment lessons, and breakthroughs [A1][A2][A3][A5][A6]

- **Commits:** use mastery, equipment certification, then pressure breakthrough.
- **Dependencies:** V04.2–V04.4.
- **Deliver:** first effective/contextual uses earn capped mastery; equipment may
  teach an art while worn and permanently certify it after visible progress;
  eligible difficult actions build pressure toward precommitted original
  technique discoveries, at most one per encounter.
- **Acceptance:** misses, illegal attempts, trivial spam and post-outcome actions
  earn nothing; old sidegrade gear retains curricular value; 1,000-hour tests
  find no repetition-optimal or unbounded growth path.

### V04.5a Persistent ability HUD and milestone scenes — delivered [A1][A2][A3][A4][A5][A6]

- **Commit:** `9d7e661 feat: add mastery and discovery scenes`.
- **Deliver:** persistent named spell/technique/secret summary at every viewport;
  desktop rows expose level, effect, mana, uses and current-level mastery meter;
  attention-gated `training` and `discovery` modes render code-native practice
  and monster-to-hero technique transfer scenes; presentation mode overlays but
  never replaces the underlying camp/travel/town mechanical effect.
- **Acceptance:** scheduled training and learned-secret fixtures mutate the exact
  ability by three XP; learned lore/discovery provenance survives JSON validation
  and reload; camp/discovery overlap still fully heals; 58 tests, build, two
  browser cases and earned training desktop/portrait captures pass.

### V04.6 Visible equipment — visual foundation delivered [A1][A2][A3][A4][A5][A6]

- **Commit:** `9351fd2 feat: show equipped gear on the hero`.
- **Dependencies:** V04.1.
- **Deliver:** pure `projectHeroAppearance()` maps canonical equipped item IDs to
  body, armor, head, weapon, offhand, feet and charm layers; Actor Policy records
  comparison/rationale when equipping an upgrade.
- **Delivered:** deterministic weapon, offhand, head, body, feet and charm
  appearance projections; three weapon and multiple armor/head silhouettes;
  rarity palettes; persistent compact gear summary and full desktop modifiers;
  desktop/portrait captures, 47 tests, build and Chromium pass.
- **Remaining:** record a canonical comparison/rationale for every autonomous
  equip decision and replace the portrait compact summary with an operable full
  equipment disclosure.

### V04.7 Continuous perspective-correct road travel — projection delivered [A1][A2][A3][A4][A5][A6]

- **Commits:** `1f38db3 feat: traverse real routes in perspective` and
  `b28ab64 fix: synchronize scenes after viewport resizes`.
- **Dependencies:** V04.0, V04.2.
- **Deliver:** atlas and travel share one pure current-leg projection; a vanishing
  road moves the hero toward the horizon with scale/depth rather than unrelated
  left-to-right motion; scenery keys by edge/world-distance, not global tick;
  terrain, time, weather, landmarks, distance and destination remain legible.
- **Delivered:** atlas and road share one tested leg projection; map marker,
  full-route bar, perspective position/scale, bend and edge-stable scenery agree;
  serialization/multi-leg tests and desktop/native-portrait/dynamic-resize
  captures pass. A ResizeObserver now recomputes the exact portrait transform.
- **Remaining:** reverse-edge/multi-leg visual goldens, terrain/weather/time and
  landmark layers, three canonical road-event types, and a settled reduced-
  motion travel presentation.

### V04.8 Spectator-readable battle choreography — presentation foundation delivered [A1][A2][A3][A4][A5][A6]

- **Commit:** `4b4eded feat: stage readable autonomous battle actions`.
- **Dependencies:** V04.4–V04.6.
- **Deliver:** resolved event packet drives intent → anticipation → impact →
  reaction → consequence; active actor, target, named art, cost, status and
  health/resource delta remain visible; common hits coalesce while danger turns,
  discoveries and defeats receive emphasis.
- **Delivered:** pure six-phase motion projection; last resolved log actor and
  target drive short lunge/reaction animation through one ticker; guard, arcane,
  burning, poison, weaken, piercing and attack effects anchor to the target;
  five monster species have distinct code-native silhouettes; status kinds and
  duration pips remain visible; DOM says who acted and who is next; reduced
  motion removes translation/bob while retaining impact. 54 tests, production
  build, two browser cases and desktop/portrait impact captures pass.
- **Remaining:** fast/instant cue compression, explicit cost/HP-before/after and
  defeat events, per-unit DOM roster/turn strip, retained display objects and
  the 10,000-transition object/heap soak. These are split below.

### V04.8a Bounded canonical combat turn events [A1][A2][A3][A5][A6]

- **Commit:** `feat: emit bounded canonical combat turn events`.
- **Dependencies:** V04.3, V04.8.
- **Deliver:** each resolved turn emits stable ordered `intent`, `statusTick`,
  `damage`/`heal`, `statusApplied`/`Expired`, `defeated` and `outcome` records with
  combat/turn/ordinal ID, actor, target, ability/status, amount, before/after
  resources and guarded/critical flags. No renderer inference from prose.
- **Acceptance:** every resource/status mutation balances against exactly one
  event; finishing blows order damage → defeated → outcome; at most 12 events
  per turn and 96 retained combat events; replay is byte-identical across seeds.

### V04.8b Per-unit combat roster and turn strip [A1][A2][A3][A4][A5][A6]

- **Commit:** `feat: expose combatants and upcoming turns`.
- **Dependencies:** V04.8a.
- **Deliver:** focused target plus compact living/dead roster, individual HP/
  mana/status duration, action/ability/cost/result, and next-three living turn
  order have native-DOM equivalents; target reticle uses shape plus color.
- **Acceptance:** 1/3/5-enemy fixtures never overlap at 320×180 or portrait;
  canvas-hidden users can answer who acted, what changed and who is next; status
  and target information never depends on color alone.

### V04.8c Retained battle presentation and soak gate [A4][A5][A6]

- **Commit:** `refactor: retain battle presentation objects`.
- **Dependencies:** V04.8b.
- **Deliver:** stable formation/unit/fx/label containers are patched rather than
  destroyed each beat; ticker, resize observer and reduced-motion listener have
  one owned lifecycle and idempotent disposal; fast mode snaps or compresses a
  cue instead of accumulating it.
- **Acceptance:** 10,000 scene transitions retain one ticker/observer and return
  display-object count to baseline; two-hour animation soak meets heap/frame/
  long-task budgets; pause/hide/reload never replays damage or loses final pose.

### V04.9 Temporary companion arcs [A1][A2][A3][A4][A5][A6]

- **Commits:** lifecycle first, profession kits second.
- **Dependencies:** V04.3, V04.7, V04.8.
- **Deliver:** hero plus at most two temporary companions; join records place,
  cause, quest/arc, relationship, knowledge and review point; leave follows
  resolution, failure, conflict, injury, duty or character choice; up to twelve
  former companions retain compact NPC identity and re-encounter eligibility.
- **Acceptance:** every departure gets setup/payoff, farewell Chronicle artifact
  and persistent consequence. At least three comic professions have two balanced
  original actions—for example a farmer's cow intervention or a clockmaker's
  spring/gear control. Names, gear, appearance, injuries, voice and relationships
  remain consistent before and after party service.

### V04.10 Cinematic side-view dialogue stage [A1][A2][A3][A4][A5][A6]

- **Commit:** `feat: add cinematic side-view dialogue scenes`.
- **Dependencies:** V04.0, V04.9.
- **Deliver:** canonical packets specify speaker IDs, portrait/pose, stage side,
  blocking, tone, lines and response candidates; narrator composes pacing from
  committed facts while DOM supplies a full transcript and operable responses.
- **Acceptance:** speaker name/portrait cannot diverge; subtitles are ≥18 CSS px;
  choices follow accessible native/radio behavior; focus restores; auto-advance
  pauses; reduced motion removes entrances/camera motion without hiding text.

### V04.11 Original repartee duels [A1][A2][A3][A4][A5][A6]

- **Commits:** deterministic duel reducer, then presentation.
- **Dependencies:** V04.3, V04.10.
- **Deliver:** 3–7 escalating call/counter exchanges with a visible 3–4-response
  menu; one exact response, plausible near-match, hilariously wrong category
  collision and personality wildcard; Actor Policy visibly highlights and picks;
  semantic scoring changes momentum and canonical morale plus reputation,
  relationship, quest, combat or access consequences.
- **Acceptance:** correctness is deterministic and AI-independent; funny failure
  can reveal a clue or seed rivalry without faking success; no exact line repeats
  within 100 lines or full pair within 20 duels; exhausted banks narrate/skip;
  10,000 seeds pass safety, legality, duration and replay tests. Use no Monkey
  Island dialogue, names, art, audio, branding, or scraped corpus.

### V04.12 First autonomous minigame: fishing vignette [A1][A2][A3][A4][A5][A6]

- **Commit:** `feat: add autonomous fishing journeys`.
- **Dependencies:** V04.3, V04.7.
- **Deliver:** cast → tell → hook → resolve uses location, weather, equipment,
  stats and Actor Policy; results feed existing items, quests, towns,
  relationships or Chronicle state and add no standalone currency.
- **Acceptance:** 30–90-second sessions summarize safely in catch-up, preserve
  character safe areas and replay across 1,000 seeds. A generic minigame SDK is
  deferred until a second activity proves shared structure.

### V04.13 Optional local micro-LLM cinematic narration [A1][A2][A3][A4][A5][A6]

- **Commits:** model lifecycle → constrained prose realizer → dialogue evaluation.
- **Dependencies:** V04.3, V04.10, V04.11.
- **Deliver:** AI-off by default; explicit capability/download/license/memory/
  progress/cancel/delete UI; dedicated narrator worker; SmolLM2-360M-class model
  evaluated rather than assumed; schema input contains only allowed facts,
  speaker knowledge, relationships, semantic moves, tone and blocking; output may
  realize bounded prose/barks only.
- **Acceptance:** model never authors IDs, facts, correctness, rewards, knowledge
  or transitions; schema/safety/speaker/fact/repetition validation precedes
  display; any failure uses deterministic templates. Target ≤700 input/96 output
  tokens, two-call burst/10 minutes, Workday <3% inference duty, combined game+
  model <900 MB, and zero accepted knowledge violations in fixed evaluation.

### Research provenance and originality rules

The council extracted interaction principles, not names/content/formulas, from
official or publisher sources: [FFXIV Blue Mage](https://na.finalfantasyxiv.com/jobguide/bluemage/)
for witness/defeat/spellbook/loadout pressure; [Final Fantasy II proficiency](https://support.na.square-enix.com/faqarticle.php?c=6&id=6623&kid=54393&la=1&ret=faqtop&sc=0)
for action-shaped mastery; [SaGa](https://saga-franchise.square-enix-games.com/about)
for pressure breakthroughs; [Pokémon Legends: Arceus research](https://www.pokemon.com/us/pokemon-news/a-look-at-the-early-days-of-pokemon-research-in-pokemon-legends-arceus)
for multi-task species knowledge; [Stone Story RPG](https://stonestoryrpg.com/)
for legible auto-RPG agency; [Battle Brothers art layering](https://battlebrothersgame.com/dev-blog-5-concept-art-explaining-battle-brothers-character-art-style/)
for equipment silhouettes; and [Wildermyth event design](https://wildermyth.com/wiki/Event)
for travel/relationship/state coupling.

Lucasfilm describes the broad tongue-as-sword challenge/response premise in its
[Monkey Island retrospective](https://www.lucasfilm.com/news/lucasfilm-games-rewind-the-secret-of-monkey-island/),
but only the abstract interaction lesson is admissible. The Copyright Office
distinguishes ideas/methods from protected expression in
[Circular 33](https://www.copyright.gov/circs/circ33.pdf); this is a project
originality rule, not legal advice. Every shipped line, character, UI, visual,
animation, sound and corpus must be independently created and avoid protected
traits, slurs, sexual humiliation, self-harm, body shaming and real-person abuse.
