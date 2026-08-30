# Spellbook truth contract

The Spellbook is a bounded, read-only projection of abilities the current hero
already owns. It never reads starter templates, monster definitions, future
unlocks, hidden lore, combat internals, or an inferred loadout.

Each card may show only canonical `AbilityState` facts: name, kind, effect, level,
total experience, current-level experience band, battle uses, mana cost and
potency. Potency is labelled as potency rather than predicted damage. Level 20 is
the current mastery cap and has no fake next-level meter.

## Monster-secret provenance

A source monster is shown only when all of these agree:

- the hero owns a `secret` ability with a non-null monster source;
- learned lore has the same monster, ability ID and ability name; and
- one discovery has the same ability ID/name and monster ID/name.

Any mismatch keeps the owned ability card but replaces origin details with
“Monster-secret origin unconfirmed.” Locked lore never creates a Spellbook card.

## Presentation isolation

Projection sorts by kind, name and ID, deduplicates IDs, caps the view at the
canonical 16 abilities and reports exact overflow. Opening the view changes no
campaign state, save byte, simulation step, renderer mode, or toolbar focus during
autoplay. Mobile navigation uses a contained 3×2 toolbar; cards scroll beneath it.

The sigils are original CSS geometry and reuse the existing battle-effect palette.
No external art, font, runtime model, or license dependency is introduced.
