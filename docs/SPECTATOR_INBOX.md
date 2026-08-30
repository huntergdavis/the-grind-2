# Spectator inbox

The view-only screens never pause The Grind 2. While the spectator looks at the
map, inventory, or journal, a small presentation-only inbox records meaningful
changes and puts their count on Watch. Returning to Watch opens a compact
“Since you looked away” recap without moving focus or interrupting autoplay.

The inbox admits only exact state changes:

- battle start and outcome;
- monster-secret discoveries;
- dungeon entry, landmarks, and completion;
- newly discovered destinations;
- quest-objective completion;
- hero or ability level gains; and
- acquired or newly equipped items.

Routine attacks, travel steps, training ticks, recovery, and Chronicle prose do
not create moments. Every ordinary card is anchored to its first resolving
Chronicle entry while battle and dungeon changes share stable episode IDs, so
one adventure remains one card instead of becoming notification spam. A state
jump spanning several ticks is labeled as a catch-up aggregate instead of being
falsely attributed to one entry or place.

Repeated details are deduplicated. Cards retain at most eight exact details and
report their omitted-detail count; the inbox retains at most eight cards and
separately reports evicted significant moments and ticks outside retained
Chronicle history. It never labels unavailable ticks as known missed moments.

The state is deliberately module-local. It is absent from campaign saves,
commands, workers, replay hashes, and simulation policy. Leaving Watch begins a
fresh absence; returning marks the visible cards read but retains the recap
until it is closed or the spectator leaves again. Changing campaigns resets the
inbox rather than carrying one hero's history into another hero's session.

The Watch badge is visual decoration; its button label exposes the unseen count
to assistive technology. The recap is non-modal, does not steal focus, uses a
single polite aggregate announcement, has an explicit close button, and remains
bounded and scrollable in portrait and short-landscape layouts.

Unit tests exercise real combat and maze reducers rather than fabricated
presentation packets. The dungeon test reuses the project-local breadth-first
path-to-exit fixture pattern already established in `src/depth/dungeon.test.ts`;
production traversal remains unchanged.
