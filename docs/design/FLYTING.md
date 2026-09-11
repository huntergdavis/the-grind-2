# Flyting: learned words, useful counters, remembered conduct

Status: F1 shipped in v0.5.159, publicly verified 2026-09-10 at 18:37 PDT. Broader sections below remain design proposals unless included in the shipped-scope note.
This elaborates **V04.11 Original repartee duels** in [BACKLOG.md](../../BACKLOG.md)
and the encounter contract in V04.19. It is one engine: `repartee`, with flyting
as its first ruleset. It does not introduce a competing battle framework.
F1 follows the shipped v0.5.158 mana-siphon release. F2a's finite witnessed encore
shipped in v0.5.160, publicly verified 2026-09-10 at 20:14 PDT; see [its precise scope](LIFETIME_STORIES.md) and
[ROADMAP.md](../../ROADMAP.md). F2b's one later arrival-rest callback shipped in
v0.5.161, publicly verified 2026-09-10 at 20:56 PDT; its exact source, presence
and no-repeat-reward scope is recorded in the same lifetime-story document.
The original F1 scope below remains unchanged.
This proposal requires no LLM, model experiment or protected-ledger edit.

## F1 shipped scope — v0.5.159

One original public reading copy, **A Small Dictionary for Large Nuisances**, unlocks twelve expressions and two semantic counter frames. After level two, the first eligible visited town with a real hall/inn and its resident offers a reading, then one autonomous three-round contest. Recovery, ongoing companion oaths and active encounters retain priority. No resident, book history or past learning is invented during migration.

The three declared calls concern dependence on learning, loudness as authority and caution as cowardice. Legal replies answer those actual claims: direct counters score +1, partial/conceding answers 0 and category mistakes −1. Curiosity, mercy and courage influence autonomous selection, with exact reasons in the normal decision trace. Vocabulary opens options; it does not force victory.

Positive total momentum wins, negative loses, zero draws, and explicit concession remains a legal reducer action. A win changes the existing town reputation by at most +1, capped at 100. Every outcome consumes this one opportunity. HP, MP, XP, gold, equipment, quests and companion bonds are unchanged.

The campaign snapshot retains the book source and exact three-round transcript. Journal → Adventure → Books & Flyting shows learning provenance, legal alternatives, scores and semantic explanations. Policy reasons link to the actual Chronicle while its bounded history retains them; older reasons are honestly marked unavailable. Saved receipt IDs use the depth-command namespace; world projections bind them through the exact campaign prefix.

Native dialogue and a dedicated book/two-person stage replace duplicate Watch panels for these scenes. Focus preserves the words, round marks and earned outcome; no permanent additional panel or button-driven duel is introduced. Reading and replies are foreground story commands, so hidden catch-up stops before them. F2 witness regard, more books/rivals, repeat contests and a universal encounter registry are not implemented by F1.

Recovery evidence reused before implementation: `deja "flyting"`, the committed design below and the pinned Herder reading/vocabulary findings (Claude session `7dc8bf11-9b0`). The runtime content here is original; no sibling book prose was copied.

## F3a shipped scope — A useful reply (v0.5.165)

Live and publicly verified 2026-09-11 at 01:10:32 PDT. After the actual witnessed
encore, arrival memory and farewell, a safe solo hero can read a second public
book at a real visited hall/inn: **How to Chair a Meeting Without Becoming the
Furniture**. Its original passage compares a useful chair with one that merely
creaks loudly. Learning “sounding board” opens the constructive
`turn-volume-into-service` frame; it was not part of the starter repertoire.

The resident offers a public practice claim about loudness proving leadership.
The hero can concede, compete in volume, or try the learned answer: invite the
speaker to ask who needs a hand and listen. The autonomous practice policy
prefers testing the newly learned constructive response. This is explicitly
unscored: no victory, reputation, regard, bond, XP or resource change. Every
legal reply consumes the one practice opportunity and normal adventure resumes.

Depth 33 stores one separate nullable `usefulReply` record. Exact reading and
reply sources bind the hero, real building/resident, original content and ticks.
Old saves receive no invented learning, and the original F1/F2 tables,
transcripts, witness judgment and memory remain unchanged. Later recruitment
of the same practice partner cannot invalidate that historical lesson.

The existing Watch caption shows a book desk, then two named speakers; there
are no contest marks or invented witness. The existing eight-second foreground
hold, pause/Focus controls and catch-up boundary apply. Journal → Adventure →
Books & Flyting has a collapsed second-book entry with the exact passage,
learned expression, reply, alternative known responses and both source IDs.
It is learned repertoire, not an inventory-book acquisition. No new panel,
CSS, external artwork or LLM is required.

One bounded actual continuation proves reachability: recall T39 → farewell T40
→ reading T41 → reply T42 with Cato Ash at Candle Inn, Elderwatch → the existing
Bell offer. This uses the existing natural `shared-road-playful:7` journey,
not staged health, roster, book or venue fields. Final release evidence belongs
in [COUNCIL_REVIEW.md](../../COUNCIL_REVIEW.md).

[Release CI](https://github.com/huntergdavis/the-grind-2/actions/runs/34577292255)
passed 3,580 tests across 250 files, including all four canonical tests in
14.722 seconds; two long audits remain explicitly opt-in/skipped. Natural
browser acceptance passed in 41.8 seconds using fixture-fast mode, with three
inspected desktop/mobile/Focus captures. Three public assets and eight runtime
source-map entries match release commit `e6266d2c76cce2fc0f5861f22fcf9fbf5ef9bbce`.
The initial older Bell-fixture failures and test-only follow-up are preserved
in the council receipt. F3b below remains a separate proposal.

## F3b proposed next slice — Let the room answer

Read-only council scope, 2026-09-11; not implemented or a v0.5.165 release gate.
After the existing Bell expedition settles, a real resident offers one scored
public claim: “If you ask the room what it needs, the room is leading you.”
This tests listening as leadership, rather than repeating the earlier loudness
claim. The second book's learned constructive frame opens an answer that was
unavailable before reading. The earlier practice need not have chosen it.

Two foreground commands admit the real venue/resident/claim/stakes, then commit
one reply and result. A direct counter wins (+1), a concession draws (0), and
competing in volume misses the claim (−1). A victory grants one point of the
existing town reputation, capped at 100, once. Other outcomes grant no reward;
HP, MP, gold, XP, quests, bonds and regard stay unchanged. The actor's values
may prefer a nonwinning response; wording alone cannot change its meaning.
Reuse the existing dialogue stage, one result mark and Journal, not a new panel
or another three-round engine.

Require a completed valid F3a lesson and Bell expedition, a later actual safe
solo town visit with a real eligible hall/inn resident, and the existing recovery,
reward, quest, farewell and encounter priorities. On-time and late Bell returns
both count; a rival is not claimed to have witnessed that delivery. Do not wait
for the optional D1b camp memory or lock old campaigns to a missed venue.

Use one separate finite, versioned challenge receipt: learned frame/reading,
lesson and Bell completion sources, real participants/venue, exact claim,
start/reply sources and ticks, meaning/outcome, reputation before/after.
Do not append into frozen F1/F2 tables or rewrite F3a. Migration adds no invented
challenge; later rival recruitment must preserve genuine old history.

The known natural journey already reaches reading T41, practice T42 and the
Bell offer. Continue that one finite board to locate the next real challenge
opportunity; its exact post-Bell admission tick remains unverified. Acceptance
should cover learned versus unlearned options, the three outcomes, once-only
reward/cap, exact start/result reload, unchanged prior records and ordinary
continuation. No seed sweep, model evaluation or broader framework is required.

## F3a proposed next slice — A useful reply

Original read-only scope from 2026-09-11, retained for recovery; implementation
and current delivery status are recorded above.
One new original short public book teaches a constructive counter about useful
leadership versus loud boasting. At a real safe, visited hall/inn, the hero
reads it and then demonstrates the newly learned reply to an actual resident's
public claim. This is explicitly an **unscored practice exchange**, not a new
contest victory. Reuse the book/two-person stage and Journal, with no new panel.

Keep one finite learning/reply record separate from F1/F2: exact content/rules
version, book, hero, place/building/resident, learned expression/frame and each
reading/reply command and tick. The reading must actually unlock the reply;
neither migration nor a past contest supplies retrospective learning. Admit
the once-only solo scene after owed encounters and farewell, preserve ordinary
recovery priority, and resume the usual adventure afterward. No XP, reputation,
regard, bond or invented witness is granted for this practice.

The current `repartee.ts`, `repartee-campaign.ts` and `repartee-witness.ts`
validate the original book's exact twelve expressions/two frames and rederive
historical scores. Do not append new content to those old tables or rewrite
saved transcripts. A future scored expansion needs explicit content-version
resolution; this smaller lesson can add one nullable receipt while preserving
old reading, contest, witness and callback bytes.

Acceptance: a real reading changes the legal reply; Journal retains the exact
words and both sources; reload cannot relearn or repeat the scene; normal
gameplay resumes; desktop/mobile/Focus stay readable. The existing
`naturalReparteeMemoryFixture()` is a bounded venue lead after recall/farewell,
not yet proof of an eligible lesson location. Inspect that continuation once;
if it lacks a real venue, label any staged boundary honestly rather than run a
seed sweep. Reused `deja "flyting"` and the pinned Herder reading evidence above;
no sibling prose or new model dependency is part of the proposal.

## What the sibling game actually does

The requested sibling path was absent. The inspected checkout is
`/home/hunter/workspace/the-curse-of-the-herder`, HEAD
`fbedf7a5043539566b6d8bb90449a9a1f7fd4d63`, inspected read-only on 2026-09-10.
No repository `AGENTS.md` was found. Its existing dirty files were untouched.

Before design work, the long `deja` query returned no results. `deja "flyting"`
then located `[claude] workspace/the-curse-of-the-herder`, session
`7dc8bf11-9b0`, with earlier flyting-follow-up and book-quotation work. That
recall supplied a trail to inspect; the implementation findings below come
from the actual checkout. The current Grind conversation self-match is not
independent evidence.

| Observed implementation | What Grind should learn from it |
| --- | --- |
| [Book](https://github.com/huntergdavis/curse-of-the-herder/blob/fbedf7a5043539566b6d8bb90449a9a1f7fd4d63/src/data/books.ts), lines 4–16, specifies an unlocked lexicon pack and a temporarily favored register. `finishReading`, [step.ts](https://github.com/huntergdavis/curse-of-the-herder/blob/fbedf7a5043539566b6d8bb90449a9a1f7fd4d63/src/core/sim/step.ts), lines 331–347, adds the pack, reading provenance and timed register. | A book should visibly change available language, with its source still inspectable. |
| `Grammar.entryKnown`, [grammar.ts](https://github.com/huntergdavis/curse-of-the-herder/blob/fbedf7a5043539566b6d8bb90449a9a1f7fd4d63/src/core/lang/grammar.ts), lines 68–80, admits entries from level **or** a known pack. `erudition` and `levelFor`, [progression.ts](https://github.com/huntergdavis/curse-of-the-herder/blob/fbedf7a5043539566b6d8bb90449a9a1f7fd4d63/src/core/progression.ts), lines 11–20, make books the large contributor but cap level at 12. | Do not describe Herder as books-only. Grind should use finite repertoire breadth, not copy its experience formula or indefinitely increase verbal damage. |
| `startReading`, [step.ts](https://github.com/huntergdavis/curse-of-the-herder/blob/fbedf7a5043539566b6d8bb90449a9a1f7fd4d63/src/core/sim/step.ts), lines 319–347, recognizes rereading; finishing still increments books read and refreshes the register, while pack IDs are deduplicated. | Distinguish another reading from learning another word. Grind rereads should not manufacture new unlocks or cumulative power. |
| `Grammar.generate`, `entryAllowed`, `pickRule` and `resolve`, [grammar.ts](https://github.com/huntergdavis/curse-of-the-herder/blob/fbedf7a5043539566b6d8bb90449a9a1f7fd4d63/src/core/lang/grammar.ts), lines 74–159 and 189–243, constrain grammar by part of speech, target, knowledge, register, syllables and recent usage. Output records the chosen rule and used words. | Use typed, curated composition and exact provenance. A random adjective/noun shuffle cannot supply a semantic counter. |
| The named-sheep capture handler, [main.ts](https://github.com/huntergdavis/curse-of-the-herder/blob/fbedf7a5043539566b6d8bb90449a9a1f7fd4d63/src/main.ts), lines 475–491, queues three follow-ups at level 2 or above, alternating generated insults with sheep emotes. [callbacks.ts](https://github.com/huntergdavis/curse-of-the-herder/blob/fbedf7a5043539566b6d8bb90449a9a1f7fd4d63/src/data/grammar/callbacks.ts), lines 180–185, supplies `flytingReply` rules. | Flyting exists as an escalating presentation sequence. That path does **not** implement rival decisions, semantic counter scoring or an independent victory/defeat reducer. Those are new Grind mechanics. |
| [callbacks.ts](https://github.com/huntergdavis/curse-of-the-herder/blob/fbedf7a5043539566b6d8bb90449a9a1f7fd4d63/src/data/grammar/callbacks.ts), lines 30–49, has syllable-constrained verse and generated alliteration. [packs-9-12.ts](https://github.com/huntergdavis/curse-of-the-herder/blob/fbedf7a5043539566b6d8bb90449a9a1f7fd4d63/src/data/lexicon/packs-9-12.ts), lines 1–5 and 92–102, stores hand-authored rhyme families in register tags. Grammar alliteration is best-effort; it can keep the wider pool when no matching initial exists. | Hand-check rhyme families and syllable counts. Do not claim a general rhyme solver or guaranteed meter exists in Herder. Its [REAL_BOOKS.md](https://github.com/huntergdavis/curse-of-the-herder/blob/fbedf7a5043539566b6d8bb90449a9a1f7fd4d63/docs/research/REAL_BOOKS.md), line 35, explicitly leaves the dictionary-import pipeline in the backlog. |
| `repository.save/load`, [db.ts](https://github.com/huntergdavis/curse-of-the-herder/blob/fbedf7a5043539566b6d8bb90449a9a1f7fd4d63/src/persist/db.ts), lines 43–56, saves and restores the world containing reading and pack state. `knownWords` counts currently known lexicon entries. | Persistence and the vocabulary display are real. A current count is not itself a lifetime word-acquisition history. |

Herder's [LICENSE](https://github.com/huntergdavis/curse-of-the-herder/blob/fbedf7a5043539566b6d8bb90449a9a1f7fd4d63/LICENSE) is MIT, copyright
Hunter Davis 2026, with notice retention required for copies or substantial
portions. Its book catalogue also references outside works; the repository
license is not a blanket clearance for every quoted source. This proposal
imports no code, dialogue, word bank, book excerpt, name, image or sound.
The original content below belongs to Grind's proposed content pack. Any later
source import needs its own provenance and applicable notices.

Herder's [content policy](https://github.com/huntergdavis/curse-of-the-herder/blob/fbedf7a5043539566b6d8bb90449a9a1f7fd4d63/docs/research/CONTENT_POLICY.md)
also explains useful editorial choices: specificity, absurdity, explicit
language bands and correctly used words. Its source-game target restrictions
are not silently adopted as a ban on Grind's fictional character duels.

## The playable loop

At a safe town stop the hero autonomously reads a short original book. A nearby
resident challenges the hero's newly acquired eloquence. The hero selects
responses using its known repertoire and existing curiosity, loyalty, mercy
and courage. The duel resolves honestly, then the journey continues. In the
following slice, a present companion reacts and later recalls one exchange.

The first book is **A Small Dictionary for Large Nuisances**. One original
excerpt reads: “Windbag: a person who mistakes everyone else's silence for a
request to continue.” The word is useful because it belongs to a learned
counter frame that can turn a boast about eloquence into an observation about
talking too much. The book also teaches admitting a true premise while
rejecting its conclusion. Its clean vocabulary and optional mild oaths expand
expression without making profanity a combat statistic.

Acquisition, reading and learning are separate facts. F1 can place one public
reading copy in an existing town building; owning an inventory book, loans,
theft, trade and a library economy are later features. The hero must be present,
safe and actually spend the admitted reading action before an unlock occurs.
An eligible solo hero can complete the entire first loop.

## Small contracts, using existing owners

These names are proposed additions, not existing TypeScript types. They extend
`DepthCommand`, `DepthState`, `ActorDecisionTrace` and the existing campaign
save path. Use the existing `campaignId`, hero `actorId`, town/location IDs,
resident `residentId`, command candidate IDs and encounter IDs. A companion is
the same resident in Company, Watch, the duel and the memory, not a new cast ID.

| Proposed record | Minimum authoritative content |
| --- | --- |
| `BookDefinition` | Stable `bookId`, content version, original title/excerpt, allowed reading source, finite `entryIds` and `frameIds`, optional register. Editorial author/provenance/review metadata stays with the content manifest. |
| `BookReadingReceipt` | `bookId`, content version, actor/location/building IDs, `sourceCommandId`, completion tick, `firstRead`, exactly added entry/frame IDs. The acquisition location remains distinguishable from where it was read if ownership arrives later. |
| `KnownRepertoire` | Learned entry/frame IDs and each first-reading receipt reference. F1 is bounded by its single finite catalogue, with zero unlocks fabricated on migration. |
| `ReparteeState` | `encounterId`, rules/content versions, participants, declared stakes, round/phase, public calls, committed legal responses, selected command, reply classification and score. Include a seed or stable selection key owned by this encounter. |
| `ReparteeReceipt` | Exact rounds and command IDs, used entry/frame IDs, reading provenance, score/outcome, existing town-reputation before/after, completion tick and `consumedOpportunity`. Retain the one F1 receipt in the campaign snapshot. |
| F2 witness reaction | Encounter/round/source command, speaker/target/witness resident IDs, actual preference rule, bounded regard before/after, reaction kind and callback disposition. Follow [LIFETIME_STORIES.md](LIFETIME_STORIES.md). |

Proposed commands are `read-book`, `start-repartee` and `repartee-action`.
`read-book` binds the exact book/source; `start-repartee` binds the encounter;
`repartee-action` binds the round and legal response ID. Repeated or stale
commands cannot unlock, answer twice or reapply a result. Candidate descriptions
and the decision trace must refer to those same commands. The existing
`ActorInstinctContext` needs a small repartee context when implementation lands.

The [shared encounter proposal](../../BACKLOG.md) V04.19 supplies setup, legal
actions, participants, stakes, bounded resolution and outcome principles.
Current [depth types](../../src/depth/types.ts) still have separate combat and
Counter Duel states; a universal encounter registry is not a shipped runtime
dependency. Implement the first repartee module directly, then extract a shared
adapter only where two real producers require it. Do not model spoken lines as
HP damage or replace the shipped Pattern Duel.

The [ledger envelope](../../src/ledger/types.ts), lines 332–354, already defines
`campaignId`, `sequence`, `worldTick`, `actorId`, `causeSequences` and event IDs.
Those sequences belong to the ledger owner. F1 must not invent a second global
sequence counter or claim its local round ordinal is a ledger sequence. Later
integration can add typed payloads such as `book.read`, `repartee.ended` and
`relationship.regard-changed` through that existing append-only registry. The
protected local codec/emission changes are not a prerequisite for the first
snapshot-backed playable arc and remain untouched by this design.

## Meaning before wording

A call contains an authored claim family, target, public factual anchors and
counter relationships. For example, `learning-is-dependence` can be answered by
`admit-learning-reject-incompetence`; `loudness-proves-authority` can be answered
by `demand-useful-result`. These relationships are deliberately more specific
than a three-symbol counter wheel. A response must address this call's actual
claim, not merely carry a globally winning tag.

A response carries `moveId`, `frameId`, known `entryIds`, target, referenced
public fact IDs, intended register and conduct tags. The reducer classifies the
selected meaning. The realizer then fills only compatible slots in its authored
frame. Re-rendering, punctuation, a synonym or a curse cannot change the result.

For the first catalogue, a frame has a complete setup and turn of thought, with
at most two curated interchangeable phrases. Entries carry part of speech,
meaning/topic, allowed target kinds, inflections, language band, register and
optional phonetic/syllable annotations. Slot constraints must preserve both
grammar and the specific joke. A nautical phrase cannot enter a legal-objection
slot just because both entries are nouns.

The visible response set contains three or four **legal known** choices: a
direct counter when available, a near-match, an intelligible wrong-category
answer and a personality-driven alternative. Before learning, a hero need not
possess the perfect answer. After reading, one previously unavailable direct
counter becomes eligible, demonstrably changing a fixture's decision or result.
This refines V04.11's old assumption that every menu always offers an exact
answer. Unknown answers may be explained afterward as missing knowledge; they
must not be selectable or secretly supplied by the policy.

An intentionally bad answer is a coherent sentence with a recognizable mistake.
“I challenge your jurisdiction over soup” can be a wonderful wrong answer to a
question about courage; its humor comes from the category error. The hero may
choose it through a declared stubborn or recently-read register preference,
with that reason visible. The engine does not inject random gibberish to meet a
comedy quota. If no admissible phrase realizes a committed move, display its
plain authored fallback; never reroll the meaning to obtain a funnier line.

Personal references require witnessed/public source facts. An insult can make
an obviously figurative comparison; an alleged theft, failure, secret, injury,
promise or relationship needs actual evidence and speaker knowledge. One
character's private reaction never becomes another character's knowledge for free.

## First duel rules and autonomous decisions

F1 has exactly three call/counter rounds, at most four response candidates and
no overtime. The resident chooses each call from a small declared policy using
public facts and prior replies. Its plan cannot inspect the hero's uncommitted
choice. The hero chooses with its known repertoire and existing values; it can
prefer protecting someone or honest concession over the best scoring answer.

| Reply classification | Round momentum for the hero | What it means |
| --- | --- | --- |
| Direct counter | +1 | The admitted counter relationship applies to this claim and its required evidence exists. |
| Near-match / dignified concession | 0 | Understandable and legal, but the central claim survives. |
| Category collision | -1 | The response fails to answer this claim; the resident takes the round. |
| Personality alternative | Resolve by its actual meaning | It has no automatic wildcard bonus. A self-own can concede, a clever reframe can counter, and a cruel boast can fail. |

Start momentum at zero; add the three deltas. Positive is `victory`, negative
is `defeat`, zero is `draw`. A declared concession ends as `retreat`; a technical
interruption remains pending and is not labeled a defeat. F1's encounter has
no HP, mana, injury or death effects. The window is 30–60 seconds of normal
presentation, with no viewer response needed and a bounded static fast path.
Unavailable or forged evidence makes a command invalid before resolution; it
does not license the realizer to invent an allegation and charge one point.

For this first one-time town contest, victory awards one bounded increment of
existing town reputation, using its existing cap. Defeat, draw and retreat
award none; all consume that contest opportunity and remain distinct records.
The reputation award is granted once at resolution, not per funny line. The
hero's route continues after every outcome. Later stakes can bind a clue,
invitation or faction case to the same typed outcome, but no first-slice quest,
loot currency or permanent speech-power multiplier is needed.

The first book does not guarantee victory: public challenges vary; knowledge
does not override values, evidence requirements or a bad choice. Opponents
should have distinguishable fallible policies rather than scale to the hero's
word count. A large vocabulary supplies options and recognition, not a growing
numerical advantage against every opponent.

## Rhyme and style, after the plain duel works

F1 uses plain, pompous and dry delivery to make characters distinct. A recently
read register may influence wording or a declared policy preference for one
encounter; it does not add points or unlock unknown meaning.

A later verse ruleset uses authored rhyme families and full paired clauses,
with checked end sounds, stress and syllable counts. Each pair also has a
semantic relationship; matching spelling is insufficient. Alliteration is a
separate style constraint. An unsatisfied constraint uses an explicitly plain
counter, never a line labeled “perfect rhyme” without proof.

For formal contests, a verified flourish may become one bounded tie-break mark
earned only by a valid direct counter. It cannot rescue an irrelevant answer,
stack per syllable or reward obscenity. This is a later versioned rule; F1's
three-delta outcome above has no hidden style tie-break.

## Books, repeats and saves

F1's original content target is one book, 12 curated entries, two learned
counter-frame families and three challenge families with a small reviewed set
of complete realizations. The number is a production bound, not proof of
thousands of fresh conversations. Every introduced phrase ships with a plain
fallback and an editorial record. Profanity bands control display; a clean
equivalent retains the same move and score. Reading a stronger oath does not
automatically raise the chosen language ceiling.

The recorded repertoire tracks learned additions, not the character's entire
ability to speak. A small versioned starter set of plain responses is available
without books; it does not fabricate a past reading. The before/after learning
fixture compares those starter options with one genuinely unlocked counter.

“Ever expanding” means later original books and append-only vocabulary packs
can add distinct usable expressions throughout the campaign. The one-book F1
scope is not a permanent vocabulary ceiling. Preserve learned IDs across updates;
bound the current candidate list, loaded working set and recent-repeat cache,
not the hero's earned knowledge by arbitrary eviction. More expressions provide
new meanings and styles, not a word-count damage multiplier. Each installed
catalogue stays finite and versioned, with an explicit compatible-content policy.

The first read persists exact acquired IDs and source once. A reread can show
a different approved excerpt or briefly favor its register, but adds zero
already-known entries, grants no XP, reputation or regard, and cannot stack or
extend a refresh through duplicate commands. Learning remains after the book
is gone. F1 may simply mark its reading complete and decline further reread
actions until a later activity needs them.

Use `CampaignRepository.save` and its transaction boundary. Migrate old saves
to an empty repertoire and no invented readings, victories or feelings. Persist
the reading before offering learned responses, and each selected round/result
before its consequence is shown. Save failure keeps the previous truthful
state; retry does not reroll or grant twice. The exact committed rules/content
version travels with the encounter. An update must retain its small compatible
resolver or show a recoverable unsupported encounter, not silently finish it
using newer scoring. The snapshot contains the one F1 result and its provenance.

Within a duel, reject repeated normalized realized lines and repeated full
call/reply combinations. For future recurring duels, use a persisted bounded
recent-pattern cache with distinct exact-text and semantic-pair fingerprints.
First demonstrate enough authored coverage before promising the historical
100-line / 20-duel nonrepeat windows. Exhausted optional content suppresses new
encounter admission or uses a truthful compact recap; it does not reroll an
already admitted outcome. F1 is a once-per-campaign arc, so it needs no pretend
endless content supply or ever-growing avoidance set.

A bounded recent buffer is not lifetime memory. The first reading, duel and
F2 witness callback can be retained as a small permanent episode in the current
snapshot. Repeated lifetime episodes, export and full replay belong to the
existing V04.3 storage work. Do not silently evict facts while advertising that
characters remember every duel forever, or build a parallel prose ledger.

## A companion can admire the answer and dislike the conduct

F2 follows [LIFETIME_STORIES.md](LIFETIME_STORIES.md): one actually present named
witness, one explicit authored preference, one directional regard change per
encounter, five steps from -2 to +2, and one source-backed callback at a later
eligible safe rest. It does not reinterpret the existing `bond` field or add
a universal emotional score. Older companions gain no fabricated past opinion.
No regard record means not yet established, not a measured neutral feeling.
Initialize a directional record only from the first actual witnessed cause.
Flyting victory must not call the tactical shared-victory hook or grant its
existing +2 bond. F2 can ship the witnessed reaction first; the later rest
callback is a separately reviewable follow-up, not a gate on visible approval.

Winning is independent of regard. An incisive counter can impress a witness
even when the overall duel is lost. A spiteful victory can lower regard for a
witness whose declared preference rejects that conduct. A sincere failed rhyme
can earn a laugh without either a win or a regard increase. `amused`, `impressed`,
`unmoved` and `disappointed` are different reaction kinds, with explicit causes.
One missed joke need not cause an injury, departure or permanent feud.

Trust is reserved for a later producer of promises and reliable conduct. A
borrowed book returned as promised could raise it; exposing a confidence could
lower it. That requires an actual loan/promise or private-knowledge system.
Mere cleverness, profanity, applause or winning does not alter trust. The first
witness slice adds regard only, preserving room for someone to respect the
hero's ability while later distrusting the hero's word.

The callback references who said what, where, the reading and outcome. It can
be fond, rueful or cool according to the actual reaction. Trigger it once during
an eligible shared rest, consume its source ID, then return to the journey.
No present witness means no witnessed reaction; a former companion does not
telepathically observe the duel. Injury/departure policies and higher-priority
adventure duties retain their existing ownership.

## An original mixed-outcome scene

This is an authored F2 fixture, not an assertion that these people or events
already exist. Names bind to the fixture's actual residents. The hero has read
the proposed dictionary; Sella is the present miller companion. Sella's declared
preference values respect for useful work. Bram publicly challenges the book.

> **Bram:** “All that reading, and your finest company is a miller.”
>
> **Hero:** “She has a trade. I have the bloody sense to value it.”

An authored `trade-is-inferiority` call and `value-useful-work` counter relation
in the learned premise-reframing family supply the direct counter: +1 momentum.
Its clean realization omits “bloody” without changing the move. The known
profession and actual companion presence support the exchange; no unperformed
guidance action is invented. Sella is pleased her contribution is valued; her
actual approval waits for the once-per-encounter reaction reducer.

> **Bram:** “Can you give us an answer that isn't borrowed?”
>
> **Hero:** “I challenge your jurisdiction over soup.”

The phrase is grammatically deliberate and completely wrong for this claim.
The policy chose its pompous category alternative; -1 momentum. Sella laughs,
but the laugh awards no point.

> **Bram:** “Then concede: the miller is carrying this conversation.”
>
> **Hero:** “And doing it well. I'll carry the book.”

An honest concession earns zero. The duel ends in a draw: the hero receives no
reputation award. Sella's declared preference and the explicit credit earn one
step of regard, once. The score is not revised because the exchange was warm.
At a later shared rest she points to the cooking pot: “Any legal objections?”
The hero closes the book. That callback requires this exact exchange and her
presence; it does not award regard again or claim a promise was kept.

Sibling authored fixtures must also show an outright victory, an outright
defeat, and a loss that still earns respect. Each fixes its actual command
choices and reasons, rather than altering the scoring to fit the desired mood.

## The scene should be readable without another dashboard

Keep the existing battle stage and stable hero/resident silhouettes. The book
appears during reading; the speaker turns toward its actual target. Show the
call, briefly preview three/four response captions, highlight the Actor Policy
choice, then show the reply and one clear outcome cue. In ordinary viewing the
response preview can be compact and brief; full alternatives and reasons live
in the existing inspectable transcript. No click selects the hero's move.

One short stakes line, a three-round marker and one final result are enough.
Avoid vocabulary damage bars, five relationship meters, a permanent word rack
and competitive spectator input. Put the known words/book source under Journal,
and the one relevant regard cause under Company. In F2 a glance, a laugh or
awkward silence plus one readable reaction carries the consequence. Avoid
overlaying it on the next speaker's line.

Canvas and semantic DOM share the exact committed transcript and choices.
Reduced motion presents static speaker/reply/result panels; no sound or color
is essential. Existing pause, hidden-tab, Show outcome, focus-restoration and
responsive safe-area patterns apply. A hidden-tab catch-up cannot silently
create an unpresented named social choice: stop before the admitted duel and
queue one relevant attention-safe scene. Presentation speed changes dwell;
the adventure-speed setting changes scheduling frequency. Neither rerolls a
decision, duplicates a reading or consequence, or bypasses the same ordered
canonical rules and attention policy.

## Release slices and proportionate acceptance

| Slice | Playable result | Dependencies and focused acceptance |
| --- | --- | --- |
| **F1 — The first useful book** | One safe-town reading, persistent finite vocabulary, one autonomous three-round solo duel, genuine victory/defeat/draw/retreat, once-only town consequence and transcript. | Finish v0.5.158 first. Use existing saves, commands, policy traces and cutaway patterns. Verify one learning-causes-a-different-legal-response fixture; each outcome; unavailable evidence/unknown entries; duplicate/stale commands; reload after learning and mid-duel; save failure; old-save empty migration; one desktop/mobile browser journey and normal release checks. |
| **F2 — The witness reacts** | One present companion's directional regard; win and approval can disagree. | F1 plus the small record in LIFETIME_STORIES. Verify absent-witness rejection, explicit preference, unknown versus measured regard, unchanged existing bond, once-only reaction, source identity, mixed outcome, reload and truthful reduced-motion scene. |
| **F2b — The witness remembers** | Shipped v0.5.161: one source-backed arrival-rest callback to the witnessed exchange. | Exact source/presence, once-only admission, reload, unchanged regard/bond/resources and natural desktop/mobile/Focus acceptance verified; see the delivery receipt in COUNCIL_REVIEW.md. Broader relationship proposals remain separate. |
| **F3 — A broader tongue** | A second original book, distinct useful counter family, explicit reread behavior, one formal verse variant and more opponents. | F1 supplies the learning/duel seam; F2 is not a prerequisite. Introduce the book, opponent and verse refinements separately. Audit permitted slot combinations for meaning and pronunciation; verify style cannot rescue irrelevance, registers expire, repeat admission remains bounded and no word-count power inflation occurs. |
| **F4 — Words with obligations** | A real loan, promise, credited assist or confidence produces trust or a changed recurring-rival relationship, followed by an earned return. | Each requires its own actual producer and the existing relationship/lifetime design. Recurrent immutable history integrates with V04.3 when available; this is not a prerequisite for F1/F2. |

Do not carry forward the historical 10,000-seed/100-line requirements as a
mandatory testing marathon for F1's one-time three-round arc. Exhaust the small
semantic decision table, inspect representative generated dialogue by reading
it, exercise meaningful save/lifecycle failures and run the existing release
checks. A larger corpus earns larger coverage when it exists. This document-only
design task runs no gameplay builds, runtime tests, deployment or model work.
