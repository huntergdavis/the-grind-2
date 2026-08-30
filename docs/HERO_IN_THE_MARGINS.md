# Hero in the Margins

Every read-only screen keeps the adventurer visibly present. One pure
`projectViewHero` projection selects a stable, canonical subject for Map,
Inventory, Journal, Codex, or Spellbook and reuses the exact equipped-item and
identity appearance recipes from the live Pixi renderer.

The vignette is storybook marginalia, not a gameplay command. It never equips,
uses, trains, casts, discovers, writes, chooses a route, changes a save, or
reveals locked lore. Its live-scene line always reports the canonical location,
headline, and action. Battle and other high-attention modes replace the calm pose
with an alert stance and explicitly say that the full action continues in Watch.

The DOM nodes remain stable while text, data attributes, colors, and silhouettes
update in place. There is no second canvas, timer, simulation, or random stream.
Pause, page suspension, and reduced motion stop the marginal animation. A
runtime liveness watchdog separately restarts an unresponsive simulation worker
from the last durable state after a bounded visible, unpaused stall.

The live hero now uses a jointed code-native rig with stable identity colors,
profiled face, negative space between limbs, scene-specific poses, and canonical
gear on the appropriate joints. Combat choreography continues to move only the
outer hero container, preserving its existing timing and impact offsets.
