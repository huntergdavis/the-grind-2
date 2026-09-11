# Lifetime stories: regard, humor and consequences

Status: F2a shipped in v0.5.160; F2b shipped in v0.5.161, publicly verified 2026-09-10 at 20:56 PDT. Broader systems below remain proposals unless included in a scope note.
Owner: gameplay/story roadmap. LLM work remains paused.

## F2b shipped scope — a shared memory before parting

One actual `recall-repartee` command creates a quiet rest at the reached oath
destination's gates, before the ordinary farewell. It is not a paid inn stay:
no building, visit, healing or resource reward is invented. The same healthy,
living companion must have actually arrived, with the route cleared and no
active encounter, dungeon or quest settlement. Recovery and settlement keep
priority. The one eligible pause is an intentional bounded addition to arrival;
the next ordinary command closes the oath. No detour or repeat-rest loop exists.

The saved receipt retains the exact encounter, original reaction and spoken
round, both participants and oath identity, destination and new command/tick.
The line quotes an exact first sentence of the original reply and preserves
the cause-bound judgment: amusement after a losing joke stays amusement, not a
new win. Regard, combat bond, HP, MP, XP, gold and inventory do not change.
A roundless retreat supplies no remembered answer. Departed or fallen witnesses
cannot appear; an already recorded callback remains history after farewell.
Depth 30 migrates older saves to an empty callback slot, not a retrospective rest.

The existing eight-second visible-time spoken-scene path shows the actual hero
and companion at the town threshold. No absent rival, score markers or new
permanent panel appears. Journal → Adventure → Books & Flyting keeps the rest
and original sources; the activity inbox records one separate memory moment.
Foreground catch-up queues this command rather than silently consuming it.
General lifetime memory, new relationship dimensions and LLM changes remain
outside this finite callback slice.

## F2a shipped scope — a companion judges the encore

After the original solo contest, one later eligible road-oath departure may
offer an autonomous encore in its actual visited origin town. The hero carries
the original learned vocabulary; a version-two duel can use a different real
hall/inn and resident without rewriting where the book was read. The witness
cannot also be the rival. The original transcript is archived exactly, and the
encore consumes one additional opportunity rather than enabling repeat farming.
Recovery, active encounters, quest settlement and arrival/farewell retain priority;
the next ordinary action after resolution returns to oath route planning.

At admission, that actual companion declares a stable, seeded judging preference:
precision, humility or playfulness. This is authored character state, not an
inference from profession, portrait, disposition or the hero's values. At
resolution, the still-present companion records one reaction to exact spoken
evidence. A sound answer can earn regard despite defeat, a hollow leadership
boast can lose regard despite victory, and culinary nonsense can amuse without
changing its legitimately losing score. No prior opinion is invented: the first
directional record starts with `regardBefore: null` and records -1, 0 or +1.
Zero means this recorded exchange produced no change, not a known lifetime
neutral relationship. Existing combat bond is untouched.

The native three-person stage shows a short witness line and a nod, frown,
laugh or quiet posture. Journal → Adventure → Books & Flyting retains both
contests, declared preference, exact evidence, outcome and witness-to-hero regard.
No new permanent panel or viewer-operated contest is introduced. Depth 29
migration initializes empty witness history, never retroactive opinions.
All four encore commands remain foreground story beats; hidden catch-up stops
before them. F2b's later safe-rest callback, trust, affection, more performances
and a general relationship system are not implemented by this slice.

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
F2a explicitly introduces its small judging-preference record; the existing
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
