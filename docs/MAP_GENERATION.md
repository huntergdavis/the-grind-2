# Map generation

The Grind 2 stores one deterministic, versioned fantasy region in every
campaign. Rendering never invents geography: terrain, waterways, sites, roads,
crossings, discovery, route progress, and the party marker all read the same
canonical atlas.

The design is inspired by Martin O'Leary's article
[Generating fantasy maps](https://mewo2.com/notes/terrain/) and its
[MIT-licensed reference implementation](https://github.com/mewo2/terrain): an
irregular mesh, composed elevation primitives, sink-filled drainage, flux-based
rivers, and suitability-based cities and borders. Red Blob Games'
[Mapgen2 article](https://www.redblobgames.com/maps/mapgen2/) and
[Apache-2.0 browser implementation](https://github.com/redblobgames/mapgen2)
informed the browser-oriented mesh and biome presentation.

No source code from either implementation is copied. This project's
`oleary-inspired-v1` generator is an original bounded integer implementation:

- a 375-point jittered triangular grid;
- hills, ridges, relaxation, sea level, and extracted coastlines;
- deterministic priority-flood outlets, accumulated flux, and downhill rivers;
- elevation, moisture, latitude, and river-derived biomes;
- sites scored for coasts, fords, basins, passes, peaks, and frontiers;
- a proximity minimum spanning site network plus bounded loops, with each
  selected road polyline independently optimized for terrain cost;
- one cumulative road-distance model used by routing and presentation.

The procedural parchment uses no external art, texture, icon, or font asset.
Future map assets must be recorded with source, license, and integrity metadata
before shipping.
