# Monster Codex

The Monster Codex is a read-only spectator screen built entirely from a hero's
canonical `monsterLore`, learned abilities, and discovery records. It lists only
species that hero has encountered. The renderer never imports the complete
monster catalog, shows an unseen placeholder, or treats the 16-entry save bound
as a world-completion total.

Each alphabetized dossier exposes exact encounters, victories, and technique
insight. Before the pattern is complete, the projection removes the secret
technique's name, ID, effect, cost, and potency. A technique appears only when
all of these records agree:

- lore says the pattern is learned;
- the hero owns the exact ability ID;
- that ability names the same source monster; and
- a matching discovery records the same monster, ability, and names.

If completed lore lacks that join, the card says “Pattern understood” and
“Repertoire record unverified” while continuing to redact the technique. Current
saves do not record whether the ability cap rejected a discovery, so the UI
cannot honestly call that state learned or capacity-blocked. A canonical outcome
for that case remains in the backlog.

The pure projection deduplicates species IDs, sorts by known name then ID, caps
the visible list at 24 cards, reports exact overflow, and maps only an encountered
species ID to a known visual key. Unknown or future IDs receive a neutral
silhouette. The five current silhouettes and learned-effect colors reuse the
project's existing battle presentation language; no combat statistics, habitats,
weaknesses, drops, rarity, or behavioral prose are invented.

The Codex is module/UI state only. Opening it does not pause autoplay, move focus
during live updates, change a command, or alter campaign bytes. Reload still
returns to Watch.
