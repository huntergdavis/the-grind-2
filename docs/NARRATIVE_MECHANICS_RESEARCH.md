# Narrative mechanics for the local creative writer

Reviewed 2026-09-06. The [current experiment](CREATIVE_STORYTELLING.md) has
48 original seeds and real offline inference, but its prose-quality gate remains
open: recorded samples include invented history and a reversed action. First
complete the eight-scene comparison of model, prompt, and concise exemplars.
Publish actual outputs, completion time, memory, relevance, and invention scores.
Seed-library expansion follows demonstrated improvement in that comparison.

## Wildermyth: stories selected by applicable context

**Developer evidence.** The game's editor documentation describes matching story
roles against personality, relationship, and other requirements. An event cannot
occur when a required role is absent. It also distinguishes event priority from
relative selection weight. These are explicit authoring controls, not evidence
of an LLM generating its events. Source:
[Wildermyth Comic Editor Reference, Story Roles and Testing your Event In-Game](https://wildermyth.com/wiki/Comic_Editor_Reference).

**Our proposed feature: context-fit seed retrieval.** Extend the existing seed
selector with a small declared prerequisite set, initially `success`, `setback`,
and `return`. The host supplies these tags only from committed public event
metadata. This would stop a victory-themed ingredient being offered to a neutral
travel scene merely because both support the same scene mode. Retain general
seeds when a specific premise has no support; the model composes the prose.

**Acceptance.** Success-only seeds never appear in setback or neutral fixtures;
missing metadata selects a general seed. Retrieval remains deterministic and
retry rotation stays within eligible seeds. Run paired outputs on the same eight
scenes and retain the change only if relevance improves without increasing
invented or reversed outcomes. No additional seed count is required.

## Hades: context-specific reactions with deliberate priority

**Developer evidence.** Supergiant's December 1, 2020 patch notes describe raising
priorities for character narrative events and repairing acknowledgements tied to
particular run conditions or equipment. The September 17 notes similarly discuss
requirements and priority for subplot progression. The notes document behavior;
they do not disclose an internal memory algorithm. Source:
[Hades: Latest Updates, Voice & Narrative](https://www.supergiantgames.com/blog/hades-updates/).

**Our proposed feature: one remembered callback.** Build on the existing
`V04.13d3` public-memory proposal: select one eligible committed prior fact for
the same campaign and public subject, then supply it separately from the current
scene. Let the local writer connect their emotional significance. The ledger
provides history; generated prose never becomes a remembered fact.

**Acceptance.** Show the current source and a link to the selected prior entry.
Missing, hidden, or cross-campaign memory produces ordinary current-scene prose.
Verify deterministic selection, stale-request cancellation, and correct temporal
ordering in real model outputs; reject rollout if callbacks increase fabricated
history. Keep this after the prose-quality gate and context-fit retrieval.

Both proposals use original content and implementation; copy no dialogue,
characters, or event scripts. Selection, memory projection, and inference remain
client-side with bounded prompts and caches. Preserve explicit model activation,
offline operation after loading, and unchanged game authority. The automatic
intermission slice now moves prose out of Chronicle into a safe-break parchment;
inspect compact and desktop reading layouts with the recorded source available.
Writing can run during combat, but its creative surface waits until fighting
and mechanical cutaways finish so text never covers actors or animations.
