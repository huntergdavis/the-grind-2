# The Grind 2 — Gameplay & Story Roadmap

Updated 2026-09-11. This is the clean, current feature inventory. Historical
delivery evidence and detailed older specifications remain in [BACKLOG.md](BACKLOG.md).

## Execution lane

1. **Next: D4 — A draught in the wall.** A disclosed clue admits one stationary
   investigation that opens a real shortcut between already visited rooms.
   Show the doorway in 2D/first-person, then use ordinary movement through it.
   Proposed, not implemented; reachability is not yet measured.
   [Council scope](docs/design/ADVENTURE_FORMS.md#d4-proposed-next-slice--a-draught-in-the-wall).
2. Continue the larger gameplay/UI inventory below, one playable vertical slice
   and feature commit at a time. Verify gameplay, saves and presentation, push
   to `origin/main`, then verify the public deployment.

**R2 — Share the credit is live in v0.5.169**, publicly source-verified
2026-09-11 05:24:24 PDT. A companion reacts to acknowledgement or an
undue boast after their actual damaging contribution to a shared victory.
Their words return at a real farewell and remain in Journal → Company.
Battle rewards and bond stay unchanged; one shared caption keeps actors clear
in desktop/320px/Focus. No new panel or LLM requirement.
[Release CI](https://github.com/huntergdavis/the-grind-2/actions/runs/34598199598)
passed 3,645 tests; two long audits stay opt-in. Three public assets and nine
runtime source-map entries match the final release. The initial replay failure
and original-contributor repair remain in [COUNCIL_REVIEW.md](COUNCIL_REVIEW.md).
The finite Books & Flyting/witness/memory arc, both D1 board slices, D2's
optional first-person preview, F3a's lesson, F3b's scored use, R1, D3 and R2 are shipped.
Wider 3D remains a separate proposal. Older delivery evidence is below the fold
in [BACKLOG.md](BACKLOG.md).
Shipped features, explicitly held work and
LLM improvements are excluded from this active inventory. Some entries are
scoped proposals; others are larger ideas needing smaller implementation slices.
Dependencies are not evidence of implementation. No model is required to play.

## New creative direction — 2026-09-10

**Story creates situations; situations leave a history.** The characters should
find themselves in funny, impressive, awkward, generous, disappointing and
occasionally life-changing situations. Winning, being liked, earning respect
and behaving well are different outcomes. Keep the screensaver delightful to
watch without making the viewer operate the game or read a wall of panels.

### Next story-producing slices

| Slice | Visible result | Status |
| --- | --- | --- |
| **D4 — A draught in the wall** | Investigate a disclosed clue, open a real secret passage, then traverse the shortcut | Scoped proposal; no implementation or reachability claim yet |

This is a proposed delivery sequence, not a combined release gate. Each
slice must be entertaining on its own. Vocabulary, wider relationship behavior
and other adventure forms can grow through later individual releases.

- [Flyting and book-learned vocabulary](docs/design/FLYTING.md): sibling-project
  findings, an original ruleset, vocabulary growth and concrete first slices.
- [Lifetime stories](docs/design/LIFETIME_STORIES.md): regard versus trust,
  cause-bound emotions, humor, mixed outcomes and witnessed callbacks.
- [Adventure forms](docs/design/ADVENTURE_FORMS.md): researched older/modern
  inspirations, original board expeditions and first-person view boundaries.

The requested sibling project is present locally as
`/home/hunter/workspace/the-curse-of-the-herder`. Inspection confirms books
unlock vocabulary packs and affect speaking register. Its current flyting is
staged banter, not a scored independent battle. Reuse those demonstrated
building blocks and lessons. Grind's scored F1 duel is a new original implementation,
not a scored engine inherited from that sibling.

### Keep mechanics and presentation separate

An adventure form owns how an expedition progresses; an encounter owns its
local rules; a view presents committed facts. A first-person camera can show the
existing maze. A board expedition needs its own canonical route/turn/event
rules. Neither should replace the party's identities, vocabulary, inventory,
relationships or campaign history. Prove concrete forms before extracting a
general framework. All remain client-side and work without an LLM.

## 1. Dungeons and exploration

- Additional trap families, status consequences, tools and expedition supplies.
- Known-danger avoidance, map exclusions, waypoints and risk-aware routing.
- Scouting and companion-provided dungeon knowledge.
- Secret passages, one-way hazards and passages that change.
- Named room purposes, dungeon layers, inhabitants, ecology and lasting consequences.
- **Expedition Echo Cache:** leave actual supplies during retreat and recover them later.
- **Last-known threat marks:** distinguish remembered monster positions from currently visible threats.
- Durable movement trails and lifetime dungeon statistics: exploration, disarms, triggers and resource losses.
- **Further board-style expeditions:** build beyond the shipped Borrowed Bell with original event spaces, branching paths, visible chance and actual party participation.
- Interchangeable expedition rules: a crawl, board journey, social trial or other original situation can use the same persistent cast.

## 2. Combat and autonomous decision-making

- Tactics that exploit genuinely learned weaknesses and status interactions.
- Better route decisions using supplies, health, terrain, known danger and deadlines.
- Post-battle turning-point recaps, including a clearly labeled unused alternative.
- Learned tactical instincts with limited slots and replacement rules.
- **Adventure Impressions:** experiences gradually create bounded behavioral traits.
- Broader flyting tactics and challenge families beyond F1's learned replies, public calls and personality-aware selection.
- Bank-and-spend combat tempo and temporary weakness-exposure windows.
- Real formations, interception and lane control—not merely rearranged sprites.
- **Anatomical encounters:** target known monster zones; breaking one changes its actions or stance.
- **Collateral-stakes combat:** protect a caravan or other objective independently of winning the battle.

## 3. Equipment, abilities and progression

- Small class skill trees with meaningful prerequisites and competing choices.
- Prepared ability loadouts changed at appropriate rest/training opportunities.
- Clear acquisition histories, repertoire swapping and technique retirement.
- Equipment-taught abilities and permanent certification of learned techniques.
- Spell and technique evolution: delivery, status and cost branches.
- Explicit weapon attribution for hybrid techniques and teaching.
- Equipment wear, breakage, camp patching and smith repairs.
- Weapon lifetime statistics, transfer/removal and historical archival.
- Recorded reasoning for equipment changes beyond the existing loot comparison.
- MP/status restoratives, out-of-combat item use and richer supply/vendor behavior.
- More accomplishment-based XP and differentiated quest rewards.
- Horizontal post-cap progression: new specializations, journeys and bounded tradeoffs.
- Breadth-earned titles, distinctions and heraldry without automatic power inflation.
- **Books and vocabulary expansion:** more books, registers and constructive counters beyond F1's original 12-expression repertoire; broader language opens options rather than endless damage bonuses.

## 4. Quests and campaign consequences

- Mechanically distinct successor quest families.
- More objective types involving species, companions and discoveries.
- Multiple or reassigned quest leads.
- Rescue/defense adventures with deadlines, partial success and community consequences.
- Investigation/diplomacy adventures that can finish without combat.
- Different aftermaths for victory, retreat and defeat.
- Post-encounter opportunities reflecting actual injuries and outcomes.
- Alternate discovery routes—for example, dungeon evidence or earned town trust.
- Four-stage faction/world pressure clocks.
- Meaningful returns for clues, supplies, relationships, changed places and homecomings.
- New discoveries or arc transitions when existing opportunities are exhausted.
- **Tale Tempo:** campaign pacing profiles, separate from simulation speed.
- **Commitment Strain:** bounded consequences for acting against established values.
- **Expedition Conduct:** voluntary challenge records with cosmetic recognition.
- Social outcomes independent of contest scores: a narrow loss can earn respect, while an unkind victory can disappoint a witness.

## 5. Companions and character relationships

- A second simultaneous companion.
- Broader reunion situations and specific shared-event callbacks beyond R1's fulfilled-oath greeting.
- Relationship branches: disagreement, duty, reconciliation and departure.
- Companion equipment, inventories, leveling and dungeon participation.
- Expanded treatment, injury and death policies.
- Further profession-specific tactics, subject to useful gameplay evidence.
- Durable companion career/contribution statistics.
- **Campfire Echoes:** shared experiences produce occasional camp scenes and earned paired techniques or keepsakes.
- **Elsewhere Callings:** former companions undertake profession-shaped activities and later report what happened.
- Former-companion scars, transformations and legend eligibility.
- Broader mentor relationships beyond the existing finite mentor arc.
- Authored dialogue exchanges with named speakers, transcripts and autonomous response selection.
- **Directional regard:** being impressed, unconvinced or disappointed, separate from affection, trust and the existing bond score.
- Cause-bound emotional reactions and different declared tastes in humor; no universal applause after every victory.
- Shared jokes, embarrassing moments, generosity, apologies and unresolved disagreements that can matter later.
- Lifetime milestones and lasting callbacks: first performances, reunions, anniversaries, changed ambitions and policy-appropriate partings.

## 6. World, towns and travel

- Erosion, lakes, tributaries, wetlands, deltas and named watersheds.
- Canonical bridges, fords and ferries.
- Seasons, snow, floods, weather fronts and terrain-dependent travel costs.
- More location-specific road events and landmarks.
- Resource-driven settlement specialties, trade, borders and rivalries.
- Town reactions to disrupted roads, resources and infrastructure.
- Households, NPC schedules, institutions and community projects.
- Homes, favorite places and reactions to returning after an absence.
- Surveys, rumor certainty, map annotations and neighboring-region expansion.
- **Wondermarks:** scenic discoveries tied to actual place, time and weather.
- Deeper monster habitats, ecology and population consequences.

## 7. New autonomous encounter types

Each is a real ruleset with consequences—not just another battle animation.

- **Flyting / repartee expansion:** additional rivals and claim families beyond the shipped finite F1/F2 contests, witnessed reactions and F3 book-led public challenge.
- **Poker-like showdowns:** original bluffing, tells, wagers and reveals.
- **Card-based RPG battles:** bounded decks assembled from earned campaign content.
- **Microgame gauntlets:** short dodge, catch, balance, repair, memory and escape challenges.
- **Rhythm battles:** autonomous performances, mistakes, recoveries and musical rivalries.
- **Side-scrolling brawlers:** waves, positioning, obstacles and party assists.
- **Top-down races:** routes, hazards, overtakes and rivalries.
- Further encounter-palette ideas: stealth, debates, courtroom cases, sieges,
  survival puzzles, board/dice games, sports and clockwork repair contests.

## 8. Activities and everyday adventure

- Autonomous fishing connected to equipment, ecology, inventory and towns.
- **Road Supper:** consume real ingredients for one limited expedition preparation effect.
- Later activity modules: crafting, cooking, farming, jobs, tournaments and festivals.
- Monster capture, bonding and evolution.
- Mounts, sailing, romance, property and home activities.
- Reading, book discovery and later lending/teaching, so knowledge has people and places behind it.

These are larger module ideas, not all implementation-ready tickets.

## 9. Screensaver presentation and inspection

- Chronicle Plates for battles, setbacks, discoveries, reunions and farewells—not only town visits.
- Automatic short “pages from the road” reviews.
- Persistent recap history, significance settings and links to the relevant inspection screen.
- Deeper relationship/history views and preserved reading positions.
- Mini-map labels, pins, weather/front overlays and truthful danger indicators.
- Further distinct monster research tasks, habitat evidence and hunting objectives.
- Injury/profession visual layers, research poses and more distinct inspection compositions.
- Calm versus high-stakes cutaway framing.
- **Elsewhere vignettes:** brief views of known characters whose off-screen actions actually occurred.
- Clearer intermediate mastery moments and companion celebration reactions.
- Optional sound accents and expanded original class/faction imagery.
- Remaining drawer wrapping, responsive layout and motion-preference polish.
- More efficient battle rendering and clearer compressed action cues at high speed.
- Perform social stories through glances, applause, awkward silences, gestures and short exchanges; put exact regard/memory detail in existing inspection views.

## 10. Longer-horizon world and legacy ideas

- Adaptive recurring rivals and nemeses with believable survival and succession.
- Independent faction projects and world developments.
- Anniversaries, eras and visibly changing familiar places.
- Fuller retirement/succession with inherited obligations, relationships and artifacts.
- Museums, monuments and richer legacy montages.
- Searchable Champion deeds and portable Hall records.
- Cross-campaign **Legend Cards**, explicitly treated as imported legends.
- Broader identity art: aging, professions, seasons, town damage, festivals and distinctive bosses.
- Explicit cosmology and belief rules before introducing ascended patrons.
- Optional first-person 3D rendering of the same dungeon, preserving canonical geometry, discovered knowledge and a complete 2D fallback.
- Declarative content packs and creator tools.

## 11. Supporting work—not a separate gameplay detour

- Durable adventure-event storage beyond the shipped codec.
- Snapshots, replay reconstruction and lifetime statistics.
- Verified history export/import, quota visibility and archival controls.
- Targeted multi-tab/update coordination and presentation handoff safeguards where needed.

Historical marathon testing matrices are not new feature work. Use focused
verification, a representative browser journey, the production build and the
existing release CI for ordinary slices. Preserve unrelated local ledger work.

<details>
<summary>Older decisions, shipped work and held experiments</summary>

See [the historical backlog and delivery evidence](BACKLOG.md) and
[council review history](COUNCIL_REVIEW.md). Their older narrator-first ordering
and already-delivered umbrella tasks do not override this current gameplay
roadmap. Familiar Opening and emergency companion aid remain held; the LLM
baseline remains unchanged. Do not restart those tracks while executing this list.

</details>
