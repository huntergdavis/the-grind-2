# Dungeon frontier traversal

The dungeon actor no longer receives every adjacent passage as an equivalent
choice. `projectDungeonTraversal` is a pure projection over persisted maze state:

1. Offer all reciprocal adjacent passages whose destination has not been visited,
   in canonical north/east/south/west order.
2. If the current room has no such passage, breadth-first search only through
   visited reciprocal passages to the nearest visited room with an unexplored
   exit. Offer exactly the first step of that shortest retrace path.
3. Reject an incomplete dungeon if no exploration frontier can be reached.

The Actor Policy still expresses personality among local unexplored choices, but
cannot choose an attractive visited room over an unexplored trap. Retracing is a
deliberate navigation state, not progress: visited-room count, loot, XP and quest
rewards remain unchanged unless the reducer reaches a genuinely new canonical
condition.

The persistent directive displays `Exploring` while entering new space and
`Retracing · N rooms to frontier` while following mapped halls. That count and the
reducer log come from the same projection used to constrain the action candidates.
No hidden cell, trap consequence or safety claim is inferred for presentation.

The save boundary validates reciprocal connected topology and requires every
incomplete dungeon to retain a reachable frontier. Regression coverage includes
the live failure shape—two visited rooms oscillating beside an unvisited trap—a
decreasing multi-room retrace, canonical serialized ordering, minimum/ordinary/
maximum generated mazes and malformed topology.

Canonical reducers replace dungeon objects instead of mutating them. Successful
deep validation is therefore cached by object identity: every moved or newly
parsed dungeon is checked in full once, while thousands of unrelated later ticks
can reuse the validated immutable object in O(1). Invalid objects are never
cached.

## Successor expedition landmark

One shared entry-plan selector owns both the offered `enter-dungeon` command and
reducer admission. Ordinary expeditions use layout v2. A successor quest's exact
place-bound lead uses layout v3: after deterministic topology, farthest exit and
Wayfinder Gate selection, the reachable far stair becomes a shrine and cannot
also be a trap. This changes no ordinary layout-v2 generation or chapter-zero
save.

`projectDungeonLandmark` is the public fog-of-war boundary. Before the far stair
is discovered it returns `promised` with `cellId: null`; presentation may say a
shrine waits at the expedition landmark but cannot draw or name its chamber.
After normal discovery it returns the exact mapped cell, and after first use it
returns `awakened`. The traversal panel, Canvas chip, maze rune, restoration
receipt and quest fact all derive from those canonical states.

Depth schema 19 repairs only released schema-18 successor saves whose exact
lead dungeon is layout v2 and whose shrine objective is still active. Topology,
turns, visits, gate state and location remain unchanged. If that old expedition
was already cleared, one validated `invoke-dungeon-shrine` command resolves the
newly guaranteed far-stair shrine exactly once; it cannot recreate or replay the
event on later loads.
