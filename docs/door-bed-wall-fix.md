# Door and bed false-wall correction

Before editing, the current backend/frontend source, tests, scripts, package
manifests and wall implementation notes were archived to
`backups/code-before-door-bed-fix-20261007.tar.gz` (127 archive entries).
This is a source checkpoint, not a database or model-weight backup.

The screenshot matches `apps/backend/uploads/20261006_101500_upload.jpg`.
Its object response contains a Bedroom but **no Bed detections**, despite both
printed “king size bed” captions. The old furniture-box filter therefore could
not suppress mattress outlines. The entrance door has only an object-fallback
box, whereas the old leaf filter required `swing_bbox` and imposed a wall-width
cutoff that double-stroked door leaves could exceed.

The correction reuses local OCR and requires a specific furniture caption plus
an enclosing compact, closed drawing contour. Bedroom/room labels are not bed
regions; no region is guessed from text alone. A small bounded margin includes
the mattress's double-stroked rim. Door filtering accepts square symbol fallback
boxes as well as swing boxes and checks whether the candidate runs through the
symbol interior; the narrow opening axis and outer frame are not blanket-masked.
Authored walls retain priority. Flagged automatic candidates remain available in
the amber review overlay but do not become 3D walls.

Compare the original baseline in `wall-validation/after/20261006_101500_upload-accepted.png`
with `wall-validation/door-bed-fix/20261006_101500_upload-accepted.png`.
The adjacent JSON files contain the reasons for candidates moved into review.
The new check does not solve every unlabelled chair/cabinet false positive; those
still require object-model improvements or manual review. OCR is optional; when
unavailable this caption-based fallback cannot identify missed beds.
