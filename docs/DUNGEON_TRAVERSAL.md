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
