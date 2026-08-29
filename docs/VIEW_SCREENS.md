# View-only adventure screens

The first optional interaction in The Grind 2 changes presentation, never the
adventure. `Watch`, `Map`, `Inventory`, and `Journal` are ephemeral browser views
outside `WorldState`, worker messages, saves, commands, events, and replay.
Autoplay and persistence continue while any screen is open; reload starts in
`Watch`.

- `Map` asks the renderer to present the same canonical atlas, discovery mask,
  live route, and party projection used by autoplay. It creates no second map.
- `Inventory` lists every exact carried stack, quantity, kind, slot, rarity,
  modifier, and equipped state. It includes no equip/use affordance.
- `Journal` shows the exact main quest/subquest hierarchy and at most the twelve
  newest entries from the already bounded live Chronicle. It does not claim to
  be permanent complete history.

The toolbar has one tab stop, arrow/Home/End focus movement, `aria-pressed`
selection, and visible focus. Escape returns to `Watch` unless a future dialog or
menu owns the key. Hidden panels leave the accessibility tree, screen scroll is
preserved across live updates, and portrait buttons are at least 44 CSS pixels
tall.

The navigation follows the W3C WAI [toolbar pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/).
The project deliberately does not mark the screens modal because the persistent
toolbar and campaign controls remain available; future true dialogs must follow
the WAI [modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
including focus containment and Escape ownership.
