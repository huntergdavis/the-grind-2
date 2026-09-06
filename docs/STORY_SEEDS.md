# Original narrative seed library

[`src/narrator/story-seeds.json`](../src/narrator/story-seeds.json) contains 48
original writing prompts for a small local narrator. Each seed offers a theme,
a tension, a figurative image, and a possible emotional turn. These are creative
ingredients, not completed sentence templates or additional gameplay events.

The seeds were authored specifically for this project during this implementation.
They were not imported from game dialogue, fiction, or an external plot database.
They contain no setting-specific names or licensed story excerpts.

At runtime, select a small number of seeds compatible with the committed scene's
mode, then give them to the writer alongside the factual source. The factual
source establishes what happened. Seed images are metaphors; they do not establish
scenery, actors, possessions, relationships, memories, rewards, or actions. Seeds
with prerequisites such as an established return, success, or setback apply only
when the source supports that premise. The writer may ignore an ingredient that
does not fit. Prose cannot alter game state.

A large offline library can offer more starting points while keeping inference
local, but loading a million seeds into each prompt would bury the actual scene
and consume the small model's context. Start with this compact set and compose
selected ingredients with real events. Measure the resulting prose before
expanding: a larger file alone does not establish greater creativity. These
seeds do not replace the real model-output quality checks in
[`CREATIVE_STORYTELLING.md`](CREATIVE_STORYTELLING.md).

To expand the library:

- Keep `schemaVersion: 1`, stable unique `id` values, and the existing field names.
- Use applicable scene modes: `town`, `travel`, `dungeon`, `battle`, `training`,
  `discovery`, `camp`, `chronicle`, and `atlas`.
- Keep each text field at most 160 characters and themes roughly 30 characters.
- Add a distinct tension or emotional turn, not merely another synonym or image.
- Write prompts for interpretation. Never smuggle in an unsupported event,
  mandatory line of dialogue, mechanical outcome, or named person or place.
- Review real generated scenes for repetition, relevance, unwanted inventions,
  and whether the seed helps the narrator do more than paraphrase the record.
- Retain original-authoring provenance when adding material. If a future import
  is proposed, record its source and reuse permission before including it.
