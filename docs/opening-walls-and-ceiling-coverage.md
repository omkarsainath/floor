# Opening masonry and ceiling coverage

The renderer previously required neighboring detected wall fragments to have
centrelines and thickness estimates matching within 1.5 cm before generating a
temporary opening host. Raster detection can exceed that tolerance even where
both fragments belong to one wall. Host matching now permits a bounded fraction
of the measured wall thickness, while still requiring aligned neighboring ends,
opening-box support, compatible height and no intervening wall. Windows receive
sill-wall and header pieces; doors receive headers, not floor-level infill.
Existing tests protect separate parallel walls and unsupported gaps.

Ceilings no longer depend exclusively on the detected room list. A visual-only
coverage pass floods the exterior of the wall network, temporarily bridging
supported door/window gaps, then joins same-height interior regions and wall tops
into perimeter polygons with holes. It no longer emits rectangular patch slabs.
Mixed OCR labels such as `Living Room / Balcony` cannot exclude an entire indoor
region. A supplied footprint is authoritative even when scanned walls are incomplete. This does
not change measured rooms, areas, walls, or stored floor-plan geometry.

Coverage resolution is the greater of 1.5 cm and the longest plan span / 500.
Consequently inferred edges are approximate, not surveyed room boundaries.
Unambiguously labelled courtyard, terrace, balcony, `ceiling: false` areas and explicit footprint
holes are excluded; an unlabelled enclosed courtyard cannot be reliably inferred
from walls alone. Unsupported exterior gaps are left open rather than covered by
a guessed bounding-box roof. Existing room heights remain unchanged; uncovered
inferred areas use the highest supplied wall height.

Validation includes raycasts for partial room detection, concave plans, courtyard
holes, partition seams, mixed room labels and corner-jamb windows. Real scan
fixtures for `test-5` and `20261006_101500_upload` exercise the actual exporter and
Three.js ceiling meshes at manually selected interior/exterior points. Both
produce a single connected ceiling, with the exterior setback left uncovered.
This is headless geometry validation, not a browser screenshot comparison of the
user's current localStorage project, and not a wall accuracy percentage.

## October 7 follow-up

Four originals were freshly scanned before/after this change: `test11.jpg`,
`test-5.jpg`, `20261006_095849_upload.jpg`, and `20261006_101500_upload.jpg`.
Captures are in `docs/wall-validation/continuous-ceiling-fix` (before) and
`docs/wall-validation/continuous-ceiling-fixed` (after). The latter also contains
ceiling JSON and blue coverage overlays generated from the frontend geometry.

The black 51'9 plan had 12 accepted vertical bands in the two stair flights;
the updated repetition filter leaves zero in those sampled flight interiors.
It uses faint edges as well as the dark-ink mask. This count is a specific
regression check, not a precision/recall estimate. Short disconnected glyph
components now go to review even when the OCR misses the title. Thin partitions
can use both endpoint and mid-segment structural junctions. Page-edge proposals
cannot suppress real outer walls during deduplication.

Remaining limits: cabinet bands can still resemble genuine partitions; missed
or misclassified openings can still prevent enclosure. Roof edges are raster
approximations. Unlabelled outdoor spaces and mixed indoor/outdoor polygons need
explicit boundaries to exclude them; these two coverage previews include the
balcony areas because their scan did not supply separate outdoor polygons.
Other drafting examples have not all been freshly revalidated in this follow-up.

Reproduce a saved scan's coverage with:

```sh
node apps/backend/scripts/validate_ceiling_coverage.mjs scan.json ceiling.json
.venv311/bin/python apps/backend/scripts/render_ceiling_validation.py original.jpg ceiling.json ceiling.png
```

Set `CEILING_PROBE=x,y` (original-image pixels) on the Node command to record a
path from an uncovered interior point to the exterior, useful for finding the
actual missing boundary instead of guessing a rectangle.

Reload the 3D viewer to apply these renderer changes to an already exported
layout. Rescan and use View in 3D if the underlying wall detections also changed.
