# The Grind 2 — Product and Technical Plan

Status: initial architecture with council amendment, 2026-08-28

## North star

The Grind 2 is a fully client-side, auto-playing fantasy RPG screensaver. It
should feel like watching an excellent player experience an enormous game:
crossing a living world, entering believable towns, planning with a party,
exploring maze-like dungeons, fighting monsters, meeting recurring NPCs, and
living through generated story arcs with sub-bosses, betrayal, and payoff.

The game must be entertaining without input. Interaction is welcome for
inspection, character selection, speed controls, and future optional nudges,
but it can never be required for the world to keep producing understandable,
interesting events.

## Forever target and council amendment

The eventual target is not merely a sequence of short generated adventures.
The game should run visibly throughout a workday and preserve a named campaign
for months, years, or indefinitely. “Forever” means durable continuity, bounded
state, long-lived identity, and coherent deterministic catch-up. A browser
cannot promise continuous execution while hidden or closed, so hidden mode
renders and infers nothing; resume advances only background-safe systems and
queues consequential moments for presentation.

The Game Master is the whole deterministic game stack, not an LLM. Rules code
owns truth, legality, balance, consequences, actor knowledge, and persistence.
A Campaign Director creates pressures and opportunities, an Actor Policy makes
evidence-based character choices, a Spectator Director chooses what the viewer
sees, and a Runtime Governor protects performance. A small local model may add
voice or rank a supplied allowlist only after that exact task proves useful,
safe, and affordable.

Long-term growth builds accumulating history rather than infinite numbers:
bounded tactical progression, changing roles, relationships, scars, homes,
rivals, equipment provenance, institutions, world eras, and callbacks. Eternal
Hero is the safe default; Legacy succession is opt-in. The complete adjudicated
design is in [COUNCIL_REVIEW.md](COUNCIL_REVIEW.md), and the operational source
of truth for priorities and acceptance gates is [BACKLOG.md](BACKLOG.md). Where
this initial plan conflicts with those documents, the council decisions win.

## Product constraints

1. The shipped game is static HTML, CSS, JavaScript, and assets. It has no
   backend, account system, remote inference, or required API.
2. After the initial load, the core game works offline. A local LLM is an
   optional enhancement, never a dependency.
3. The canonical game state is deterministic, serializable, versioned, and
   owned by game code. Generated prose never becomes game truth by itself.
4. Multiple saved characters can coexist. A launch screen can resume one or
   create a new randomly named character.
5. Every place and actor is a persistent entity. A town, monster, NPC, item,
   faction, dungeon, relationship, and story hook exists beyond the text that
   describes it.
6. Every major activity is a module that can improve independently. The game
   must be able to absorb new systems indefinitely without rewriting its core.
7. Procedural generation must create topology, constraints, history, and
   consequences—not merely random labels.

## What carries forward from The Grind

The original game gets surprising mileage from a very small design:

- Physical or automatic “grind distance” accumulates until it advances one
  legible story beat.
- A compact state machine alternates preparation, travel, combat, and
  incidental activity.
- Quest progress requires both fights and visited locations, creating the
  impression of a journey rather than a single counter.
- Victories feed character progression, loot, spells, relationships, and the
  next quest, with saves at meaningful milestones.
- A complete character snapshot makes old heroes selectable.
- Large curated lists of real-world nouns make a tiny simulation feel much
  larger and stranger than it is.
- The screen always exposes the current quest, subquest, action, and character
  growth, making it understandable at a glance.

The sequel keeps those principles, but replaces the single coupled class with
a typed event-driven simulation, explicit module boundaries, seeded random
streams, independent renderers, durable browser storage, and a presentation
director.

Original references: [autonomous state machine and milestone
saves](https://github.com/huntergdavis/The_Grind/blob/master/src/com/hunterdavis/thegrind/Panel.java#L186-L415),
[fixed update/render
loop](https://github.com/huntergdavis/The_Grind/blob/master/src/com/hunterdavis/thegrind/CanvasThread.java#L34-L157),
[persistent character
model](https://github.com/huntergdavis/The_Grind/blob/master/src/com/hunterdavis/thegrind/Player.java#L9-L299),
[SQLite save
schema](https://github.com/huntergdavis/The_Grind/blob/master/src/com/hunterdavis/thegrind/InventorySQLHelper.java#L8-L75),
and [curated content
catalogues](https://github.com/huntergdavis/The_Grind/blob/master/res/values/strings.xml#L8-L1957).

## The viewing experience

The simulation runs continuously, but an automatic director decides what the
viewer sees. It selects scenes using novelty, dramatic importance, visual
variety, unresolved tension, and time since a mode was last shown. It holds a
scene long enough to read, then transitions cleanly.

Initial presentation modes:

- world map: routes, weather, discoveries, pursuit, and party travel;
- travel: a closer moving view for road events and environmental storytelling;
- town: streets, homes, shops, jobs, schedules, rumors, and social encounters;
- dialogue/cutscene: portraits, blocking, speech, choices made by the party;
- planning/camp: goals, class builds, equipment, supplies, and party dynamics;
- dungeon map: exploration, branches, loops, secrets, locks, and landmarks;
- dungeon first-person: a later 3D view over the same canonical dungeon graph;
- battle: readable 2D party combat inspired by classic console RPGs;
- progression: loot, class levels, powers, creature growth, and relationship
  changes;
- activities: fishing, crafting, games, contests, festivals, training, and
  future modules.

Transitions are driven by simulation events, not a fixed playlist. Important
events can interrupt mundane scenes; quieter scenes provide pacing between
climaxes.

## Core architecture

```text
Rules Engine <--- Campaign Director opportunities <--- world/story constraints
     ^
     +--- Actor Policy choices from actor-known legal alternatives
     |
     +---> canonical WorldState + journal + snapshots
                         |
                         +---> Spectator Director ---> Pixi/DOM presentation
                         +---> Runtime Governor ----> fidelity and work budgets
                         +---> optional Narrator ---> validated, bounded prose

Only Rules Engine commands/events can mutate canonical state.
```

### Canonical simulation

- `WorldState` is plain, versioned, serializable data.
- Commands express intent; validated events express facts; pure reducers apply
  events.
- Versioned keyed/counter randomness covers geography, actors, combat, story,
  loot, and presentation. Adding a visual or loot call cannot shift any other
  outcome.
- Simulation advances in meaningful beats. Rendering interpolates smoothly at
  display rate, but game logic does not depend on frame rate.
- On browser resume, elapsed time is converted into a bounded deterministic
  catch-up simulation and an optional recap instead of pretending a hidden tab
  continued running.
- Invariants are checked after every committed event in development builds.

### Activity modules

Every subsystem implements the same small contract:

- declare whether it is eligible from current state;
- propose one or more bounded actions;
- validate prerequisites and costs;
- emit typed domain events;
- expose a presentation projection and interest score;
- serialize only through canonical state and events;
- declare its schema/content version and migrations.

Examples include travel, town life, battle, dungeon exploration, dialogue,
class training, creature capture, fishing, crafting, shopping, camp, and
minigames. Modules may depend on shared domain services, but never reach into
another module's private runtime state.

### Directors and Runtime Governor

The Campaign Director schedules only legal, causally ready opportunities using
reason-coded pacing, novelty, recovery, and promise/payoff budgets. Actor Policy
chooses what a character actually does from goals, values, beliefs, knowledge,
relationships, stress, and tactics. The Spectator Director independently turns
committed facts into readable scenes and remembers presentation repetition.
The Runtime Governor may lower rendering fidelity or suspend inference, but it
cannot change an outcome.

This separation is the screensaver “cheat”: not every simulated action needs
bespoke animation. The Spectator Director shows the most legible moments and
summarizes the rest, while tiered simulation keeps distant systems causal at a
cheaper fidelity.

## Generation systems

### World maps

Generate a persistent world from layered elevation, temperature, moisture,
watersheds, biomes, coasts, resources, and hazards. Place settlements where
water, terrain, resources, defense, and routes make sense. Connect them with a
weighted road and sea-route graph. Names and lore decorate this structure;
they do not substitute for it.

The first implementation is a bounded regional map. Chunking and distant
world generation come later, once save stability and visual language are
proven.

### Towns that feel real

Each town has terrain-constrained roads, districts, lots, buildings, civic
services, an economy, factions, households, and a reason to exist. NPCs have
homes, work, schedules, needs, relationships, possessions, knowledge, and
memories. Town state changes after shortages, festivals, attacks, political
events, deaths, and the party's actions.

Only nearby or dramatically relevant details run at high fidelity. Distant
towns advance through aggregate economic and social events.

### Dungeons that are real mazes

Generate a semantic dungeon graph before drawing tiles. The graph contains a
main route, optional loops, gated branches, locks and keys, secrets,
landmarks, shortcuts, encounter ecology, safe pockets, and a sub-boss/boss
arc. Validate that required paths are solvable and optional rewards are
reachable.

Rasterize that graph into a 2D plan. A later first-person 3D renderer extrudes
the same rooms, corridors, doors, landmarks, and entity positions. Changing
views never changes what the dungeon is.

### Real monsters and creature collecting

Monsters are persistent instances of generated or curated species. Species
define habitat, diet, behavior, abilities, social structure, rarity, and loot;
instances have identity, age, condition, location, relationships, and history.
Encounters arise from ecology and faction movement. A creature-collecting
module can add discovery, capture, bonding, evolution, breeding, and party use
without replacing the base monster or combat models.

### Real NPCs

NPC identity is simulation data: biography facts, household, job, faction,
goals, fears, relationships, schedule, inventory, location, knowledge, secrets,
voice card, and event memories. NPCs act through rules and planning code. The
LLM expresses their actions and can propose bounded plans, but cannot invent a
dead character back to life or reveal a secret the speaker does not know.

### Characters, classes, skills, and equipment

A character has core attributes, derived combat values, traits, conditions,
relationships, inventory, equipment loadout, learned abilities, and progress
across one or more classes. Class definitions contain prerequisites,
experience sources, level tracks, skills, passive effects, and branching
specializations. Multiclass and prestige-like systems can be added through the
same data model.

Equipment is a persistent item instance with base type, material, quality,
affixes, provenance, durability or condition where useful, ownership history,
and granted actions/passives. Generated text explains an item's identity; game
code calculates its effects.

### Battle

Start with deterministic, turn-based party combat rendered in a classic 2D
formation. Combatants choose actions from goals, tactics, abilities, threat,
resources, personality, and story context. Typed battle events support damage,
healing, movement, status effects, interrupts, capture, escape, rewards, and
scripted phase changes. Replays and exact-seed tests make balance debuggable.

## Narrative architecture

Long stories are state machines with prose, not transcripts with wishful
memory.

Canonical story state stores acts, chapters, eligible beats, quest gates,
factions, relationships, secrets known per character, setups, foreshadowing,
promises, betrayals and their prerequisites, sub-boss gates, payoffs, and an
immutable event log.

At a meaningful boundary:

1. Code derives eligible dramatic moves from current truth.
2. The local model optionally proposes two or three structured beat candidates.
3. A semantic validator rejects impossible participants, locations,
   prerequisites, knowledge, or state effects.
4. Seeded code selects and commits a valid beat.
5. A scene packer supplies only relevant character cards, location facts,
   recent events, open hooks, and a compact chapter summary.
6. The model renders bounded dialogue/narration.
7. Code applies only enumerated, validated effects and records the resulting
   facts.

The deterministic director and curated grammar/template system must tell a
complete story with AI disabled. The model adds voice, surprise, variation,
scene detail, and bounded proposals. This permits the narrative to go off the
rails aesthetically without going off the rails logically.

## Local browser LLM plan

Use [WebLLM](https://github.com/mlc-ai/web-llm) in a dedicated worker. It runs
fully in-browser on WebGPU, supports schema-constrained JSON generation and
streaming, and caches model data locally. Function calling is not required.

The first evaluation target is
[SmolLM2-360M-Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct):
approximately 204 MB of Q4 weights and a much more plausible workday footprint
than multi-gigabyte tiers. It is not enabled by default until task-level tests
show that it beats deterministic templates without violating facts, knowledge,
frame, memory, power, or thermal budgets. Its download is always explicit and
removable.

Initial candidate tasks are short voice rewrites, relationship-specific barks,
letters, journals, dreams, inscriptions, item/monster observations, reactions,
and chapter headlines. Factual recaps remain deterministic. Advisor, Critic,
plot ranking, and visual-tag ranking are separate capabilities and stay off
until independently validated. The model never creates stats, balances an
encounter, remembers canon from transcript context, writes a save, or supplies
the only valid next action.

Model work is sparse, pre-generated during measured slack, and immediately
replaceable by templates. Accepted structural proposals are normalized and
journaled as external inputs before effects, so replay never requires inference
or a particular model. Larger Qwen tiers remain possible later experiments,
not the default architecture. Relevant runtime details are in the [WebLLM
registry](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts).

## Persistence and offline behavior

Use IndexedDB for characters, world snapshots, append-only event segments,
generated chunks, story cards, migrations, and settings. Use `sessionStorage`
only for disposable per-tab UI state. Ask for persistent origin storage when
appropriate, show whether it was granted, and support explicit JSON save
export/import because browser storage can still be cleared.

Autosave on meaningful events and periodic checkpoints. Each save contains a
schema version, content version, seed, RNG stream states, last simulation time,
snapshot, and journal tail. Writes use transactions and keep the previous good
checkpoint until the new one is complete.

A service worker caches the core static game for offline launch. Optional model
weights use the runtime's browser cache and are removable independently of
character saves.

Long-lived campaigns use verified checkpoints, compacted hash-chained journal
segments, fidelity tiers, retention classes, and exportable optional archives.
The hot mandatory record targets at most 100 MB after 100 accelerated campaign
years and at most 1 MB/year after warm-up, excluding model/assets and optional
archives. Referenced vows, clues, letters, named items, promises, and other
identity-bearing artifacts are never silently discarded.

## Web stack

- TypeScript in strict mode for the simulation and all module contracts;
- Vite for development and a static production build;
- PixiJS v8 with production WebGL for high-performance 2D scenes;
- DOM/CSS overlays for menus, accessibility, save management, and diagnostics;
- dedicated workers for simulation and local inference so rendering stays
  responsive;
- IndexedDB, Cache API, and a service worker for saves and offline assets;
- WebLLM behind a replaceable `Narrator` interface;
- Vitest for pure simulation/generation tests and Playwright for browser flows;
- GitHub Actions and GitHub Pages for static deployment.

PixiJS currently recommends WebGL for production while its WebGPU renderer is
still maturing. That also avoids forcing rendering and inference to compete for
the same newest graphics path. Vite's output is directly deployable as static
assets.

References: [PixiJS renderer
guidance](https://pixijs.com/8.x/guides/components/renderers), [Vite static
deployment](https://vite.dev/guide/static-deploy.html), [IndexedDB for
structured client-side data](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API),
and [Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API).

## Build phases

The detailed P0–P3 sequence and acceptance gates in [BACKLOG.md](BACKLOG.md)
supersede the older phase outline below. Thin personhood, narrative, fidelity,
visual identity, lifecycle, security, and compaction schemas belong in the
foundation; representative production depth follows in the vertical slice.

### Phase 0 — Foundation

- Scaffold TypeScript, Vite, tests, linting, CI, and static deployment.
- Define `WorldState`, commands, events, reducers, seeds, clocks, module
  contracts, save migrations, and the presentation scene contract.
- Define authority, Actor Policy, lifecycle, attention, progression, retention,
  entity-fidelity, personhood, story, identity, security, and resource contracts.
- Build a debug timeline that can pause, step, inspect, replay, and export state.

Exit: a seeded headless simulation replays to the same state hash, survives a
save/load round trip, and deploys as a static page.

### Phase 1 — The vertical screensaver slice

- Create/resume randomly named characters.
- Generate a regional world with three towns, roads, wilderness, and one
  graph-first dungeon.
- Autoplay one polished town/travel/dungeon/return loop plus expedition,
  rescue/defense, and investigation/diplomacy kernels. At least one completes
  without a dungeon, boss, or combat.
- Render world map, town, dungeon map, dialogue, planning, and 2D battle modes.
- Add director pacing, transitions, autosaves, reload catch-up, and a
  deterministic template narrator.

Exit: AI-off play passes a coherent 15-minute watch, a two-hour non-repetition
test, an eight-hour named-device foreground soak, exact seven-day resume, and
accelerated multi-year determinism/compaction gates.

### Phase 2 — Deep procedural places

- Add geography, watersheds, biomes, settlement placement, routes, and chunking.
- Add town districts, buildings, households, schedules, economy, factions, and
  changing local conditions.
- Add dungeon locks, keys, loops, secrets, landmarks, ecology, factions,
  puzzles, and generation validators.

Exit: generated maps are connected and playable; towns have traceable reasons
for their shape and economy; dungeons are solvable and recognizable on return.

### Phase 3 — RPG and creature depth

- Implement class levels, skill trees, branching specializations, abilities,
  status effects, equipment generation, and party tactics.
- Implement persistent monster species/instances, habitats, behavior, and
  rewards.
- Add creature discovery and capture as the first major optional module.

Exit: progression creates materially different builds and visible tactical
behavior; monster encounters reflect location and ecology.

### Phase 4 — Deepen the living cast and long-form story

- Deepen the thin persistent NPC, relationship, knowledge, goal, and memory
  schemas established in the foundation.
- Implement story acts, beat gates, setup/payoff ledger, faction arcs,
  recurring sub-bosses, betrayal prerequisites, and chapter recaps.
- Build a substantial deterministic grammar and authored beat library.

Exit: the non-LLM game completes a coherent multi-chapter arc with recurring
characters and validated consequences.

### Phase 5 — Local AI narrator

- Evaluate SmolLM2-360M task by task behind the `Narrator` interface only after
  the complete AI-off vertical slice.
- Add device probing, opt-in downloads, model cache management, bounded JSON
  proposals, validation, scene packing, prose generation, and graceful timeout.
- Run a fixed evaluation suite for fact violations, voice consistency,
  setup/payoff retention, semantic acceptance rate, speed, memory, battery, and
  thermals.

Exit: AI improves dialogue and surprise without changing game correctness,
blocking play, or making old saves model-dependent.

### Phase 6 — Disciplined expansion

- Add the first-person 3D dungeon renderer over existing dungeon state.
- Add fishing, crafting, cooking, farming, tournaments, card/dice games,
  festivals, jobs, homes, romance, mounts, sailing, politics, and other modules
  one at a time.
- Add content packs and developer diagnostics for simulating thousands of
  seeds quickly.

Each addition must have independent tests, a simulation-only mode, at least one
presentation scene, and no required changes to unrelated modules.

## Quality gates

- Determinism: a seed plus event stream reproduces the same canonical state.
- Generation: settlements are reachable; required dungeon paths are solvable;
  locks cannot precede all keys; actors never occupy impossible locations.
- Narrative: participants are alive and co-located; knowledge and secrets are
  respected; every committed effect is enumerated; setups and payoffs are
  traceable.
- Persistence: interrupted writes preserve a prior valid save; migrations are
  fixture-tested; export/import round trips; multiple heroes remain isolated.
- Screensaver pacing: no unreadably fast cuts, long dead screens, or repetitive
  mode loops in long seeded runs.
- Performance: stable rendering while simulation and inference run in workers;
  configurable low-power mode; bounded memory and model generation budgets.
- Compatibility: core game works without WebGPU and without the model; desktop
  and mobile browser smoke tests run in CI where feasible and on real devices
  before releases.

## Principal risks and controls

- Infinite scope: build the complete vertical loop before deepening any one
  subsystem; every later idea enters as a module.
- LLM incoherence: models only propose bounded structures and prose; code owns
  truth, validation, and effects.
- Large model downloads: opt-in tiers, visible size/device estimates, local
  caching, deletion controls, and a strong no-model experience.
- Browser eviction: request persistent storage, checkpoint transactionally, and
  provide export/import.
- Hidden-tab throttling: timestamp saves and deterministically catch up on
  resume rather than relying on continuous background execution.
- Procedural sameness: combine structural generators, persistent history,
  simulation consequences, curated content, and presentation pacing; test many
  seeds with metrics and visual review.
- Battery and heat: separate low-power simulation/render profiles and schedule
  inference sparingly during natural pre-generation windows.

## First implementation target

Start with the P0 backlog, then build the P1 slice end to end. Do not begin with
the LLM or 3D renderer. The architectural proof is a compelling, saveable,
deterministic AI-off adventure whose map, town, dungeon, monsters, battle,
relationships, choices, setbacks, and story are real systems—and which remains
varied for two hours, stable through an eight-hour workday, resumes coherently
after seven days, and advances through accelerated years without numeric,
narrative, storage, or identity collapse. Once that spine works, every ambitious
subsystem has a safe place to grow.
