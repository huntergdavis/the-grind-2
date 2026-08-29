# Game Master forward motion

The Game Master constrains road choices before the hero's personality ranks them.
It is a deterministic rules layer, not an LLM judgment and not renderer prose.

The canonical world stores at most eight recent arrivals and completed directed
legs, a saturating decisions-since-progress counter, and the active route
directive. After `A → B`, `B → A` is removed when another road exists. If it is
the only exit it remains legal and is labeled `ONLY OPEN ROAD`. Unseen sites rank
ahead of revisits; exhausted choices relax to the least-recent destination.

Only typed state changes count as progress: a newly discovered site, objective
delta, dungeon traversal, learned secret, or resolved combat. A new sentence,
scene, tick, or repeated arrival does not count.

The route card reflects the stored directive through planning, combat, partial
travel, save, and reload. Actor personality still chooses among equally legal
forward-moving options.

The current slice deliberately does not invent meaningful narrative returns or
new content. Those require canonical quest, relationship, changed-place, and arc
scheduling commands in V04.15b–c.

Research principles were adapted from Valve's [AI Director presentation](https://cdn.cloudflare.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf)
and Wildermyth's [event eligibility and recency rules](https://wildermyth.com/wiki/Event).
