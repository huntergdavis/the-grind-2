# The Grind 2 — Gameplay & Story Roadmap

Updated 2026-09-11. This is the clean, current feature inventory. Historical
delivery evidence and detailed older specifications remain in [BACKLOG.md](BACKLOG.md).

## Execution lane

1. Continue the larger gameplay/UI inventory below, one playable vertical slice
   and feature commit at a time. Verify gameplay, saves and presentation, push
   to `origin/main`, then verify the public deployment.
2. News from the oven is shipped, not an outstanding task. LLM work remains
   paused. Deferred proposals do not block other gameplay lanes.

<details>
<summary>Latest verified release: News from the oven, v0.5.180</summary>

Publicly source-verified **2026-09-11 16:51:16 PDT**. On a newly earned matching
reunion, the former baker reports the actual completed loaf. Original witnessed
dialogue and older completed greetings remain unchanged. A separate short line
and existing Company history join the off-screen activity to the hero's story.
No extra panel, timer, LLM request, reward or invented delivery.

[Release CI](https://github.com/huntergdavis/the-grind-2/actions/runs/34659280008)
passes **3,834 tests in 296 files**, with two optional skips. Forty-two focused
checks, the 58.7-second production browser and three inspected layouts pass.
Complete public HTML, three assets and five emitted source entries match
`1f90a1c`. All golden hashes and test limits remain unchanged.
[Scope](docs/design/LIFETIME_STORIES.md#news-from-the-oven--v05180).
</details>

<details>
<summary>Previous release: Elsewhere — The Experimental Loaf, v0.5.179</summary>

Publicly source-verified **2026-09-11 16:11:17 PDT**. One healthy former baker
undertakes an inn-supplied trial while the hero is away. A steady or experimental
choice yields a plain, delightful or bricklike loaf. The actual baker/oven scene
uses a short existing-controller cutaway, while Company retains both receipts.
The hero's commands, scene, resources and knowledge remain unchanged.

[Release CI](https://github.com/huntergdavis/the-grind-2/actions/runs/34656637066)
passes **3,819 tests in 293 files**, with two optional skips. Forty-six focused
checks, the final 56.5-second production browser and three inspected
desktop/mobile/Focus captures pass. Complete public HTML, three assets and
eight source entries match the release. The corrected hand/dough staging,
initial source-ID finding and local replay timeout remain in the
[council record](COUNCIL_REVIEW.md). No LLM work or new permanent panel.
[Scope](docs/design/LIFETIME_STORIES.md#elsewhere-the-experimental-loaf--v05179).
</details>

<details>
<summary>Previous release: An old line returns, v0.5.178</summary>

Publicly source-verified **2026-09-11 14:55:31 PDT**. Newly earned matching
reunions recall an exact flyting line the same former companion witnessed.
Six authored response families preserve the original reaction rather than
awarding automatic praise. The existing two-person scene and collapsed Company
history retain the exact words and sources; old completed greetings do not change.
No new panel, timer, model request, reward or relationship score.

[Release CI](https://github.com/huntergdavis/the-grind-2/actions/runs/34651143030)
passes **3,800 tests in 289 files**, with two optional skips. The 54.5-second
production browser and three inspected desktop/mobile/Focus captures pass.
Twenty-four focused checks, exact old-save compatibility and canonical CI pass;
three public assets and four source entries match the release. Initial test-loader
and local replay findings remain in [the council record](COUNCIL_REVIEW.md).
[Scope](docs/design/LIFETIME_STORIES.md#an-old-line-returns--v05178).
</details>

<details>
<summary>Previous release: Spare change, v0.5.177</summary>

Publicly source-verified **2026-09-11 14:13:01 PDT**. One actual later-market
sale removes an unused, outclassed spare weapon for one gold. Equipped gear,
earned mastery, combat attribution and resources remain intact. The market
scene shows the sold object and one coin; exact history stays in Status.
No new panel or LLM request. This is one sale per campaign, not a full economy.

[Release CI](https://github.com/huntergdavis/the-grind-2/actions/runs/34647678382)
passes **3,790 tests in 287 files**, with two optional skips. The corrected
91.6-second sale browser and 82.7-second current-supper compatibility browser
pass, with six inspected captures. Three public assets and nine source entries
match the feature commit. Canonical replays pass without increasing their gate.
Initial findings and preserved released-save coverage remain in
[the council record](COUNCIL_REVIEW.md). [Scope](docs/design/ADVENTURE_FORMS.md#spare-change--v05177).
</details>

<details>
<summary>Previous release: Last exchange, v0.5.176</summary>

Publicly source-verified **2026-09-11 12:58:54 PDT**. Direct-damage battle endings
now show their actual closing exchange in the existing Watch ribbon. A collapsed
Status disclosure keeps the full text and exact event sources where an existing
timestamped receipt can identify the fight. Ordinary recovery clears the live
recap; exact reload restores eligible history. No extra panel or gameplay change.

[Release CI](https://github.com/huntergdavis/the-grind-2/actions/runs/34641107562)
passes **3,771 tests in 283 files**, with two optional audits skipped. The first
51.5-second browser run and three inspected desktop/mobile/Focus captures pass.
Three public assets and five emitted source entries match the exact feature
commit. Simulation, CSS and LLM workers are unchanged; no replay or narrative
baseline was regenerated. Wider tactical turning points and unused alternatives
remain future work. [Scope](docs/design/ADVENTURE_FORMS.md#last-exchange--v05176).
</details>

<details>
<summary>Previous release: Road Supper, v0.5.175</summary>

Publicly source-verified **2026-09-11 11:32:37 PDT**. Two gold buys two actual
rations at a later market; one solo camp consumes both for the next road
battle's first direct incoming hit. Damage is reduced 25% before HP clamping;
stronger Guard wins without stacking. No immediate healing or extra panel.
The actual acceptance battle still loses, truthfully recording zero HP saved.

[Release CI](https://github.com/huntergdavis/the-grind-2/actions/runs/34633233091)
passes **3,758 tests in 281 files**, with two optional audits skipped. The
78.7-second browser scenario and three inspected desktop/mobile/Focus captures
pass. Three public assets and sixteen source entries match the pushed release.
The mobile layout correction and test-only guardian/bell fixture repairs remain
in [the council record](COUNCIL_REVIEW.md). LLM work is unchanged and paused.
[Scope and evidence](docs/design/ADVENTURE_FORMS.md#road-supper--v05175).
</details>

<details>
<summary>Previous release: D5 — The Room Is Taken, v0.5.174</summary>

Publicly source-verified **2026-09-11 10:22:06 PDT**. One actual entered lair
admits one guardian; victory clears the room, while defeat or stalemate leaves
an unbeaten memory without a rematch or extra reward. Native 2D/first-person
marks and stone battle staging use the existing captions, actors and Status.
The real acceptance journey loses, recovers at the entrance and continues.

[Release CI](https://github.com/huntergdavis/the-grind-2/actions/runs/34626245256)
passes **3,734 tests in 276 files**; two long audits remain opt-in. Browser
acceptance and three inspected desktop/mobile/Focus captures pass. Four public
assets and thirteen source-map entries match the pushed release. The initial
four outdated test assumptions and their test-only corrections remain in
[the council record](COUNCIL_REVIEW.md); no gameplay or test limit was changed
to force an old trajectory. LLM work remains paused.
</details>

<details>
<summary>Previous release: B1 — The Cup Is Exaggerating, v0.5.173</summary>

**B1 — The Cup Is Exaggerating, v0.5.173**, publicly source-verified
2026-09-11 09:14:36 PDT. A real inn resident offers a short covered-die claim.
Challenge for one gold or decline for free; reveal the committed truth once.
Winning returns two gold, losing returns none. One table, two actual actors,
one reveal gesture and existing caption/Status history; no extra panel or model.

The unchanged B1 baseline finds an eligible Candle Inn boundary at T4 in 456 ms, after the
actual smithy job. Integrated play seats Aster with Cato Ash, an actual scholar,
at T5; a steady tell leads to a natural T6 decline of the committed five, keeping
nine gold. A separately authored legal challenge of that same five loses one
gold. Ordinary route planning to Glimmerwood resumes at T7. The tell agrees
with the hidden claim two times in three, not always; private truth never enters
the pre-reveal decision or drawing packet. [Current evidence](COUNCIL_REVIEW.md).

[Release CI](https://github.com/huntergdavis/the-grind-2/actions/runs/34620222087)
passes 3,716 tests in 273 files; two long audits remain opt-in. The production
browser scenario passes with three inspected desktop/320px/Focus views, exact
saves and no external/model requests or errors. Three public assets and ten
runtime source-map entries match the pushed release. Initial fixture failures,
test-only corrections and local replay timeouts (passing in clean CI) remain
in [COUNCIL_REVIEW.md](COUNCIL_REVIEW.md).
</details>

T1's ferry is deferred: the bounded known journey and all 14 roads on its map
have no recorded river crossings. That negative evidence is preserved.
The finite Books & Flyting/witness/memory arc, both D1 board slices, D2's
optional first-person preview, F3a's lesson, F3b's scored use, R1, D3, R2, D4, T2, W1, B1, D5 and Road Supper are shipped.
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
| **News from the oven** | On a real later reunion, the same baker tells the hero how the recorded bake turned out | Shipped v0.5.180; browser, CI and public-source verification passed |
| **A thought in a bottle** | Buy one mana draught, then visibly drink it at a real low-mana dungeon boundary | Deferred: market found, but no low-MP dungeon use in the bounded journey |
| **Known-danger detour** | Remember a revealed danger and take an actual known way around it | Deferred: the bounded unchanged journey found no eligible bypass; no implementation |

The detour probe completed 160 actual commands in 4,640 ms. Its only two
revealed armed traps (T125 and T139) were already in the current room and
correctly required disarming. No remote armed trap or known alternate route
was observed. This is a negative result for that journey, not proof that
detours are impossible; no seed sweep or larger test gate was added.

The deferred mana-restorative proposal is one purchased dose (proposed cost: three
gold), consumed between dungeon actions by a living solo hero at half MP or
below. Restore a quarter of maximum MP, rounded up and clamped; no healing,
movement, XP or bond reward. Reuse the existing drink gesture, caption and MP
bar. Give the item an explicit mana capability and truthful inventory label;
do not route it through the current health-only combat consumable path. The
actual purchase-to-use journey is not established. The unchanged known campaign
completed 160 commands in 5,152 ms: T60 provided a real market, but all 45 living
solo dungeon observations had full MP (24/24). No seed, route, resource or item
was altered to create a need. Evidence is retained locally in ignored
`scratch/mana-draught-baseline-evidence.json`. No free starter bottle,
new vendor panel, crafting system or forced successful spell belongs to this slice.

This is an individual delivery sequence, not a combined release gate. Each
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
- Wider secret-passage networks beyond D4, one-way hazards and passages that change.
- Named room purposes, dungeon layers, inhabitants, ecology and lasting consequences beyond D5's shipped first occupied lair.
- **Expedition Echo Cache:** leave actual supplies during retreat and recover them later.
- **Last-known threat marks:** distinguish remembered monster positions from currently visible threats.
- Durable movement trails and lifetime dungeon statistics: exploration, disarms, triggers and resource losses.
- **Further board-style expeditions:** build beyond the shipped Borrowed Bell with original event spaces, branching paths, visible chance and actual party participation.
- Interchangeable expedition rules: a crawl, board journey, social trial or other original situation can use the same persistent cast.

## 2. Combat and autonomous decision-making

- Tactics that exploit genuinely learned weaknesses and status interactions.
- Better route decisions using supplies, health, terrain, known danger and deadlines.
- Post-battle turning-point recaps, including a clearly labeled unused alternative.
  First source-backed **Last exchange** slice shipped in v0.5.176; it does not yet
  judge tactical turning points or invent counterfactual outcomes.
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
  Dependency: a broader earned repertoire and preservation of unprepared mastery.
  The 2026-09-11 single known journey has only two techniques at every training
  opportunity, so two slots add no decision. No loadout is implemented; see
  [the council assessment](COUNCIL_REVIEW.md#next-lane-assessment-prepared-abilities).
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
- **Poker-like showdowns:** broader original bluffing, tells, wagers and reveals beyond B1's shipped single covered-cup encounter.
- **Card-based RPG battles:** bounded decks assembled from earned campaign content.
- **Microgame gauntlets:** short dodge, catch, balance, repair, memory and escape challenges.
- **Rhythm battles:** autonomous performances, mistakes, recoveries and musical rivalries.
- **Side-scrolling brawlers:** waves, positioning, obstacles and party assists.
- **Top-down races:** routes, hazards, overtakes and rivalries.
- Further encounter-palette ideas: stealth, debates, courtroom cases, sieges,
  survival puzzles, board/dice games, sports and clockwork repair contests.

## 8. Activities and everyday adventure

- Autonomous fishing connected to equipment, ecology, inventory and towns.
- Further meal recipes and supply choices beyond the finite Road Supper slice above; no general cooking system yet.
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
