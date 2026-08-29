# The Grind 2 — Product and Technical Plan

Status: initial architecture, 2026-08-28

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
seed + clock + commands
          |
          v
  deterministic reducer <---- validated module events
          |
          +----> canonical WorldState snapshots
          +----> append-only event journal
          +----> activity eligibility and simulation
          +----> story constraints and consequences
                         |
                         v
              presentation director
                         |
             scene projections/renderers

  local Narrator worker ---> proposals/prose ---> schema + semantic validator
               (never writes canonical state directly)
```

### Canonical simulation

- `WorldState` is plain, versioned, serializable data.
- Commands express intent; validated events express facts; pure reducers apply
  events.
- Separate seeded random streams cover geography, actors, combat, story, loot,
  and presentation. Adding a visual effect cannot change combat outcomes.
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

### Presentation director

The director observes events without owning simulation truth. It builds a
queue of scene candidates, scores them, prevents repetitive modes, reserves
time for setup and payoff, and chooses an appropriate renderer. This is the
screensaver “cheat”: not every simulated action needs bespoke animation. The
director shows the most legible moments, uses transitions and summaries for
the rest, and lets offscreen systems continue at a cheaper fidelity.

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

Offer capability-based, opt-in tiers rather than forcing a large download:

| Tier | Model | Approx. Q4 download | Declared browser VRAM | Intended use |
| --- | --- | ---: | ---: | --- |
| fallback | SmolLM2-360M-Instruct | 204 MB | 376 MB | short barks and rewrites |
| default AI | Qwen3.5-2B | 1.06 GB | 2.25 GB | scene beats, dialogue, summaries |
| desktop high | Qwen3.5-4B | 2.37 GB | 3.87 GB | highest-quality local narrative tier |

An optional Qwen3.5-0.8B tier can bridge the fallback and default. These
models use Apache-2.0 licenses. The ready-made WebLLM builds use a 4,096-token
context even where native model cards advertise much longer context, so the
story architecture must never rely on transcript length.

Relevant primary sources: [WebLLM model registry and declared
memory](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts),
[Qwen3.5-2B](https://huggingface.co/Qwen/Qwen3.5-2B),
[Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B), and
[SmolLM2-360M-Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct).

The first run performs a feature probe and tiny benchmark. If WebGPU or enough
memory is unavailable, the game uses the deterministic narrator immediately.
Model work is pre-generated during travel or quiet scenes and has strict token
and time budgets. Saves are independent of model choice.

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

### Phase 0 — Foundation

- Scaffold TypeScript, Vite, tests, linting, CI, and static deployment.
- Define `WorldState`, commands, events, reducers, seeds, clocks, module
  contracts, save migrations, and the presentation scene contract.
- Build a debug timeline that can pause, step, inspect, replay, and export state.

Exit: a seeded headless simulation replays to the same state hash, survives a
save/load round trip, and deploys as a static page.

### Phase 1 — The vertical screensaver slice

- Create/resume randomly named characters.
- Generate a regional world with three towns, roads, wilderness, and one
  graph-first dungeon.
- Autoplay one full loop: prepare in town, plan, travel, encounter monsters,
  explore a dungeon, defeat a sub-boss, acquire equipment/skills, return, and
  advance a quest.
- Render world map, town, dungeon map, dialogue, planning, and 2D battle modes.
- Add director pacing, transitions, autosaves, reload catch-up, and a
  deterministic template narrator.

Exit: a fresh seed produces a coherent and visually varied 10–15 minute watch,
and reloading resumes the exact character and world without an LLM.

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

### Phase 4 — Living cast and long-form story

- Add persistent NPC schedules, relationships, knowledge, secrets, goals, and
  memories.
- Implement story acts, beat gates, setup/payoff ledger, faction arcs,
  recurring sub-bosses, betrayal prerequisites, and chapter recaps.
- Build a substantial deterministic grammar and authored beat library.

Exit: the non-LLM game completes a coherent multi-chapter arc with recurring
characters and validated consequences.

### Phase 5 — Local AI narrator

- Integrate WebLLM in a worker behind the `Narrator` interface.
- Add device probing, opt-in downloads, model cache management, bounded JSON
  proposals, validation, scene packing, prose generation, and graceful timeout.
- Run a fixed evaluation suite for fact violations, voice consistency,
  setup/payoff retention, semantic acceptance rate, speed, memory, battery, and
  thermals.

Exit: AI improves dialogue and surprise without changing game correctness,
blocking play, or making old saves model-dependent.

### Phase 6 — Infinite expansion

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

Start with Phase 0, then build the narrow Phase 1 loop end to end. Do not begin
with the LLM or the 3D renderer. The architectural proof is a compelling,
saveable, deterministic 10–15 minute generated adventure that already feels
like The Grind—only now the map, town, dungeon, monsters, battle, and story are
real systems. Once that spine works, every ambitious subsystem has a safe place
to grow.
