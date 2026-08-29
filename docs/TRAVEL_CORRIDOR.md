# Canonical travel corridors

The travel scene is a projection of the same oriented atlas edge used by route
movement and the parchment map. It does not roll decorative geography.

`projectTravelCorridor` derives a small, unsaved window around the party: exact
edge and direction, current and look-ahead biome, elevation, moisture, river
flux, signed slope, route curvature, and nearby canonical crossing. Forward
progress and complementary reverse progress occupy the same world point; slope
and crossing offsets reverse with the traveler.

The road recedes toward a vanishing point while the equipped hero crosses a
foreground apron left-to-right at stable scale. Road, trail, pass, and
river-crossed route have different marks. Biome controls palette and silhouette;
moisture controls only density. Water appears only when an atlas crossing enters
the bounded window. It is called a water crossing—not a bridge, ford, or ferry—
because the atlas does not yet store infrastructure.

The persistent traversal card and stable stage `data-travel-*` attributes consume
the same projection. A just-completed directed leg supplies an arrival tableau
for its exact arrival tick without changing the save schema.

The slice deliberately excludes weather, seasons, encounter selection, named
crossing infrastructure, and cinematic transitions. Those require canonical
state and causal rules before presentation.

Design principles were adapted from Battle Brothers' official
[world-map article](https://battlebrothersgame.com/blog-post-7-worldmap/), where
geography gives tactical terrain meaning, and inkle's official
[80 Days overview](https://www.inklestudios.com/80days/), where route and mode of
travel shape the journey. The implementation copies no content or formulas.
