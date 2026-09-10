# Lifetime stories: regard, humor and consequences

Status: design proposal, 2026-09-10. No new runtime system is claimed.
Owner: gameplay/story roadmap. LLM work remains paused.

## The point

A screensaver can tell a story through what characters do, what happens to them,
and how they treat each other afterward. A different encounter should leave a
different relationship, memory, problem or opportunity—not just a new backdrop.
Allow delight, incompetence, generosity, rivalry, embarrassment, disappointment,
recovery and quiet affection. A funny loss may be more memorable than another win.

## What exists, and what does not

- [CompanionRecordBase](../../src/depth/types.ts) currently stores identity,
  destination, resources, victories, bond and injury. It is not a directional
  regard/trust model.
- [syncActiveCompanionCombat](../../src/depth/companion.ts) increases the active
  companion's bond by two after a shared victory, capped at 100. Preserve that
  released meaning; do not retrospectively call it affection, regard or trust.
- [CampaignPolicy](../../src/core/types.ts) distinguishes EternalHero, Legacy
  and Mortal. New lifetime events must obey the selected policy; a funny scene
  cannot silently retire, kill or replace an Eternal hero.
- Named source facts already support specific mentor and companion histories.
  They do not establish a universal lifetime memory or relationship engine.
- `deja "regard relationship lifetime events"` on 2026-09-10 returned the current
  conversation, not independent older implementation evidence. These source
  contracts, rather than that self-match, ground the proposal.

## Distinct meanings, introduced only when a feature needs them

| Concept | Meaning | Example |
| --- | --- | --- |
| Emotion | A temporary, cause-bound current feeling | Embarrassed after a missed rhyme; relieved after an apology |
| Regard | One person's respect for another's demonstrated qualities | Impressed by a clever recovery, even after losing |
| Trust | Expectation that someone keeps promises or acts reliably | A talented rival can have high regard and low trust |
| Affection/familiarity | Warmth and shared history, not a combat reward | An old joke becomes affectionate between consenting friends |
| Memory | An event that can be recalled with its participants and context | Who lent the book; who laughed; who helped afterward |

Regard and trust are directional: A's opinion of B need not match B's opinion of
A. Victory is not automatic approval. Defeat is not automatic dislike. Private
reactions require an explicit authored rule or stored preference; never infer
them from names, portraits, professions or hidden omniscient knowledge.
An absent record means no recorded judgment, not proof of neutral feelings.
F2 must explicitly introduce its small judging-preference record; the current
resident disposition does not establish a companion's personal values or humor.

Do not introduce five meters as a prerequisite. First ship one real witnessed
event and one small directional regard record. Add trust only with a promise/
reliability producer, and other dimensions only with their own playable slice.

## Small first slice: the witness remembers

After a genuine flyting exchange resolves, a present named companion may produce
one reaction based on the committed response, outcome and declared audience
preference. A witness not present learns nothing. The ordinary duel works solo.

1. Persist exact encounter/round, speaker, target, witness and outcome identities.
2. Apply at most one bounded regard change per witness per encounter. Proposed
   first scale is five steps from -2 to +2; final thresholds belong in the slice's
   versioned rules. Repeated words or reload never farm regard.
3. Show one short reaction and pose after the exchange, with a Journal source
   entry and optional Company detail. No permanent relationship dashboard.
4. Keep one source-backed callback candidate for that pair. At a later eligible
   safe rest, recall it once; cooldowns and normal adventure priorities apply.
5. Preserve existing bond untouched. Older saves gain no fabricated reactions
   or recovered private feelings. After source eviction, do not invent a callback.

Capture witness presence at resolution, not from the roster when a delayed
animation plays. Revalidate presence for an in-person callback; a departed
companion cannot silently rejoin. Do not route flyting through tactical-victory
bond synchronization. Temporary embarrassment is not automatically distrust.

Example possible reactions, not current implemented rules:

- A precise counter earns respect even though the hero narrowly loses the duel.
- A boast lands, but a mercy-valuing witness disapproves of the chosen cruelty.
  This needs that witness's explicit preference; the hero's values do not stand
  in for the witness's values.
- A failed rhyme followed by an honest self-own makes a witness laugh without
  earning a mechanical win or erasing embarrassment.
- A companion quietly supplies an earned word; accepting help changes who gets
  credit. That assist needs its own actual action, not an animated implication.

These outcomes can coexist: funny, respected, successful and kind are not one
score. F1 flyting need not wait for these relationship records; ship the witness
consequence as the next vertical slice after the duel has real outcomes.

## Lifetime event palette

Each family needs a small producer, consequence and later callback. These are
ideas, not an instruction to introduce them all before another feature ships.

- **Shared success:** an unlikely victory, public performance, earned craft,
  dangerous crossing or promise kept. Credit actual contributors.
- **Shared absurdity:** a pretentious word used in the wrong register, a failed
  culinary flourish, a costume mishap, or both companions confidently taking
  the wrong known turn. Humor targets the situation; recoverable mistakes can
  create an inside joke without manufacturing injury or a moral judgment.
- **Disappointment:** an honestly lost contest, declined invitation, failed
  promise, disagreement or missed opportunity. Leave a route back through
  restitution, practice, support or simply time—not forced forgiveness.
- **Personal milestones:** first performance, learning to read a difficult book,
  mentorship, reunion, profession change, settling somewhere, anniversaries.
  Marriage, parenthood, retirement and death are separate future systems with
  explicit identity/lifecycle rules, not surprises added as flavor text.
- **Changed places:** a repaired bridge, revived festival, remembered inn,
  community project or ruined opportunity that the party can actually revisit.
- **Partings:** ambitions diverge, duties call, injuries change plans, or friends
  choose different roads. Reunions preserve the reason for the departure.

Do not schedule misfortune because a sadness quota is empty. Choose among
eligible situations; rules and character decisions determine consequences.
Once a fact is committed, presentation cannot reroll it for comedy or drama.

## Story-producing situations

### The borrowed word

A companion lends a real owned book. The hero later wins a formal exchange using
its newly learned vocabulary but forgets to credit the lender. A subsequent
admission or apology is a real choice with a recorded outcome. Later the same
word may mean pride, irritation or reconciliation depending on what occurred.
Lending and credit are later mechanics; first book-reading need not implement them.

### The village's second-best tongue

Reading *Large Words for Small Disagreements* teaches “grandiloquence.” In a
public duel, the hero gives one excellent answer, then forces that word into a
rhyme where it does not fit. The rival wins the declared purse. The hero closes
the book, considers its enormous title, and says, “It appears I bought the large
edition.” That authored recovery does not rewrite the score or return the purse.
Later F2 may let a witness with an explicit taste for self-deprecation remember
the recovery. Another witness need not be amused. Learned vocabulary creates
options, not guaranteed victory or universal approval.

### The expedition nobody agrees about

A board-style dungeon offers a safe detour, a public performance and a risky
shortcut. The party's declared goals inform the autonomous route choice. The
consequence may help one ambition and disappoint another, leaving a concrete
callback rather than the same universal bond increase for everyone.

## Screensaver contract

- Characters and the scene carry the moment: hesitation, glances, applause,
  awkward silence, a shared grin, a separated walk or an offered book.
- One short outcome caption is enough during the scene. Exact explanation and
  relationship history live in Journal/Company on demand.
- Branches always advance. Losing a duel, missing a joke or disagreeing must
  not require a viewer click, restart or punitive endless retry.
- Duration and cooldowns use declared clocks. Presentation speed does not
  create extra events. Pause/reload resumes exact committed consequences;
  hidden-tab catch-up queues at most one relevant recap, not a wall of scenes.
- Keep a small active memory set with honest provenance and explicit retention.
  Lifetime historical guarantees depend on real storage/archival support; do
  not claim that a bounded recent buffer remembers everything forever.
- Full, reduced-motion and static views retain the same meaning. Color or
  sound alone cannot communicate approval, loss, injury or a relationship change.

## Proportionate first acceptance

- **F1:** one real book-read source, learned vocabulary opening a legitimate
  option, one solo duel with actual win/loss/draw, exact saved outcome and
  desktop/mobile readability. Unlearned responses remain unavailable. A new
  word can still be inappropriate; do not grant hidden-answer knowledge.
- **F2:** add one actual witness, its declared judging preference and one
  directional regard consequence. Cover mixed social/contest outcomes,
  absent-witness rejection, old-save initialization and once-only reload.
- **Callback follow-up:** once those facts exist, show one safe-rest recall
  with source/presence checks and honest expiry. It does not block F1 or F2.

Use authored local content and the existing release CI. No new model,
multi-year simulation or general relationship framework is required.
