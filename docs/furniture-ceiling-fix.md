# Furniture filtering and missing ceiling coverage

Source checkpoint saved before editing:
`backups/code-before-furniture-ceiling-fix-20261007.tar.gz` (127 entries).
This archive contains source/tests/configuration, not databases or model weights.

## Changes

* Short, very thin paired lines no longer gain automatic acceptance just because
  other furniture edges intersect them. They remain review candidates.
* The caption-and-closed-contour fallback also supports specific storage labels
  when OCR reads them. It does not infer a cabinet from an entire kitchen label.
* Room topology now normalizes tiny raster-fit slope in a private geometry copy.
  The screenshot's 847-pixel left wall had only 0.616 pixels of drift; the former
  0.01-pixel axis test discarded it. Genuine diagonals remain separate.
* Opening matching tolerates small differences between fitted host bands and
  symbol endpoints, while still requiring both gap ends and opening evidence.
* Inside-face endpoint stops can join a nearby perpendicular host within the
  two half-widths. Very small collinear breaks require actual drawn support on
  both faces. No broad morphological closure or bounding-box roof was added.

## Validation

The reported original is `apps/backend/uploads/20261006_101500_upload.jpg`.
Results are in `wall-validation/furniture-ceiling-fix/`; the preceding version
is retained in `wall-validation/door-bed-fix/`.

The chair/stove outline candidates highlighted in the screenshots are no longer
accepted. Some cabinet bands and window duplicates remain and need review;
the storage captions in this particular scan were not read reliably enough to
resolve all of them. This is not a claim that all furniture false positives are
eliminated.

The ceiling toggle itself was working. Ceiling meshes are generated from room
outlines, and missing topology left large regions without any mesh. Using the
actual Three.js `createCeiling` function and downward raycasts at original-image
positions `(200,500)`, `(200,1000)`, `(600,800)`, `(600,400)`, the preceding output
covered only the last point. The updated output covers all four: living hall,
master bedroom, kitchen and children's bedroom. This is a geometry check, not
an interactive browser screenshot. Detected regions may combine connected rooms;
their names and subdivision still need review before exact area use.

To update an existing viewer: return to the tracer, run **Auto Detect**, then
click **View in 3D** again. Refreshing the old viewer alone retains its previously
exported room geometry.
