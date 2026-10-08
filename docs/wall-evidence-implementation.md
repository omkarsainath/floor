# Wall evidence pipeline and validation

## What the supplied images and code showed

The originals are available locally. `test12.webp` matches the ensuite screenshot; `apps/backend/uploads/20261006_095745_upload.jpg` matches the prayer-room/staircase screenshot; `20261006_104237_upload.jpg` matches the 22×30 HOUSEYOG plan. Other supplied plans are in the root and the October 6 upload folder. All **45 files received before/after end-to-end API scans**, including a complete final rescan after the last evidence-rule changes. The delivered `after/` gallery contains fresh final API responses, not intermediate evidence replays or painted-over screenshots. `raw-api/` preserves earlier development captures. Some files contain duplicate source plans and are not 45 independent designs.

* **Missed outlined walls:** test12's old response had 16 wall segments. OCR labelled boxes `[157,419,538,836]` and `[157,785,522,984]` as text. Those boxes cover walls and bathroom fixtures, so the old CV text-mask stage erased genuine structure. The original outlined-wall extractor also required a large connected component and assumed horizontal/vertical faces. That excluded valid disconnected returns and diagonals.
* **False walls:** the supplied overlays visibly trace beds, sofa/TV edges, stair treads, room names and the HOUSEYOG phone-number logo. CV text masking did not apply to YOLO results. The final object filter only considered staircase boxes; it deliberately ignored furniture. Stair inference required seven treads in several paths, and its later grouping could union unrelated long lines into an oversized footprint.
* **Duplicate/inaccurate geometry:** thick green strokes displayed centrelines, not physical wall faces. Thin face proposals and paired bands can describe the same wall more than once. YOLO axis-aligned boxes are reduced to their long axes, which cannot represent diagonal walls. Endpoint snapping before opening detection cannot use door/window evidence.
* **No database explanation:** the tested local service reports database disabled. Baseline and after captures are fresh scans. Repeated inference is deterministic enough to look like a cached result.

## Runnable implementation

`apps/backend/src/wall_evidence.py` adds a geometry pass to the existing `/api/auto-detect` pipeline. It uses OpenCV/NumPy already in the project; no model download or cloud service is needed. The existing YOLO/CV detectors remain proposal sources.

1. Sanitize OCR word masks by typical word height and image extent before CV extraction. Preserve original pixels; local contrast enhancement is private to feature extraction. OCR maps back using the actual rounded resize dimensions on each axis.
2. Extract line segments at arbitrary angles, pair nearby parallel boundaries, check both faces and cross-wall separation, and record solid/outlined/hatched-or-grey evidence. Long single strokes remain candidates for thin partitions.
3. Measure filled-band thickness along perpendicular profiles at multiple positions. Keep local thickness; do not assign every wall one global width. The reference thickness is only a scoring hint.
4. Deduplicate only supported coincident bands with overlapping projected intervals. Do not bridge collinear gaps. Preserve preferred line coordinates instead of accumulating drift through repeated averaging. Clip duplicate face intervals while retaining unmatched portions and authored geometry.
5. Repair small L/T endpoint discrepancies only along the segment's own supporting line, with pixel support and no intersecting known opening. Snap sub-half-pixel axis drift, never real diagonals. Narrow aligned door/window boxes split bands; square door-swing boxes do not cut arbitrary holes.
6. Assess text/dimension overlap, junctions, continuity, thickness, furniture and local repeated-line patterns after combining proposals. Local repeated lines are a reason to review, not proof that a region is a staircase. Possible page-border strokes remain review candidates.
7. Return accepted walls separately from uncertain and rejected candidates. Only accepted/authored walls enter room-boundary construction. No walls are fabricated to force a closed room.

Start from the repository root:

```sh
./.venv311/bin/python apps/backend/src/train_server.py
npm run dev
```

Open `http://localhost:5173/tracer.html`, upload an original and run Auto Detect. The overlay labels wall IDs; green lines represent estimated faces and dashed blue lines centrelines. Enable **Show uncertain walls** for amber candidates. Confirm missing/uncertain geometry with Wall Mode. **Download wall scan JSON** exports the original scan, including review reasons. **Download wall overlay PNG** exports the current displayed overlay. The ordinary layout export still handles metre calibration and 3D generation.

## Output contract

`walls`, `wall_review` and `wall_rejected` contain `id`, `start`, `end`, `thickness_px`, `thickness_source`, `geometry_reference: "centreline"`, `boundary_polygon`, `boundary_reference: "estimated_parallel_faces"`, `review_status`, `review_reasons`, `pixel_support`, `boundary_support`, `junction_count` and `evidence_score`. Model `confidence` is retained when a source proposal supplied it. The evidence score is explicitly **not a calibrated probability or accuracy percentage**. Boundary polygons are straight-band estimates, not traced masonry corner contours.

`wall_geometry` records image width/height, `coordinate_space: "original_image_pixels"`, an explicit identity preprocessing transform, reference thickness and the configuration used. The backend does not resize the wall image. Ultralytics returns boxes in input-image coordinates; OCR's internal resize/rotation is reversed separately. Canvas dimensions use the image's natural size; CSS changes display size only.

## Adjustable parameters

The `WallEvidenceConfig` dataclass is the central configuration for the new pass. Both `paired_wall_proposals` and `assess_walls` accept `config=WallEvidenceConfig(...)`; pass the same configuration to both when customizing the API call in `train_server.py`.

| Parameter | Default | Meaning |
| --- | ---: | --- |
| `min_face_length_ratio` | 0.018 | Minimum paired face length / longest image side |
| `max_thickness_ratio` | 0.025 | Maximum candidate wall width / longest image side |
| `min_pair_width_ratio` | 0.002 | Minimum face spacing / longest image side |
| `angle_tolerance_degrees` | 2 | Maximum angular difference between paired faces |
| `min_boundary_support` | 0.72 | Minimum sampled edge support on both proposed faces |
| `min_accepted_score` | 0.64 | Heuristic acceptance threshold; semantic review flags still override it |
| `long_wall_ratio` | 0.12 | Length / image size at which length evidence saturates |
| `max_faces` | 900 | Limit on longest LSD faces considered; a runtime/recall tradeoff |

Other ratios are named in the code near the relevant evidence test (word height, local tread spacing, opening alignment, endpoint repair). One-pixel floors and the half-pixel axis tolerance reflect raster quantization. These are engineering defaults, not thresholds statistically fitted to this collection. Existing legacy CV/model thresholds remain in `wall_ai.py` and `train_server.py`; the final evidence pass checks their proposals rather than assuming they are correct.

## Validation and remaining limitations

[Open the before/after gallery](wall-validation/index.html). Each example has original-resolution accepted-only and review overlays and JSON. Counts are included for audit, not as accuracy measurements: opening splits can legitimately increase them. No manually labelled evaluation set was supplied, so no precision/recall/accuracy percentage is claimed.

Synthetic regression tests exercise diagonal hollow walls in original coordinates, faint and hatched faces, distinct nearby partitions, opening preservation, manual-wall priority, text exclusion and local stair geometry. Existing integration tests check that scanned pixels still drive the actual frontend room area and printed dimensions.

Final checks: **94 backend tests passed**, **165 frontend tests passed**, and the Vite production build passed (with its existing large-bundle warning). Both local services answered successfully at ports 5050 and 5173. No interactive browser automation was available; the image tests upload through the same `/api/auto-detect` endpoint used by the tracer.

### Observed before/after changes

* [Ensuite comparison](wall-validation/test12-comparison.png): previously absent outer top/left walls and the bathroom's right partition are now represented by paired faces. The window and main doorway remain gaps. Short door-leaf/return candidates and overlapping lower bands still need correction.
* [HOUSEYOG comparison](wall-validation/20261006_104237_upload-comparison.png): accepted traces on the phone-number logo, bed outlines and internal stair treads/arrow are removed. The surrounding stair enclosure remains. A kitchen counter edge and some short door-leaf/fixture candidates remain accepted.
* [Prayer-room/stair comparison](wall-validation/20261006_095745_upload-comparison.png): see accepted and amber review layers separately; removing repeated treads does not establish a complete staircase classification or guarantee every rail is excluded.
* The thin-outline plan `20261006_100253_upload` still has an accepted internal page frame and duplicate bands. Rendered/cabinet-heavy drawings also retain ambiguous furniture edges. These are known remaining errors, not claimed successes.

Remaining limitations to inspect in the gallery:

* A shower enclosure, cabinet side or door leaf can have the same double-line geometry as a thin wall. Missing/wrong object labels can leave accepted fixture edges or move genuine attached walls into review.
* Very short returns, poor scans, partially erased boundaries and tiny low-resolution plans may remain missing or uncertain. Review candidates are deliberately excluded from room closure, so room counts can drop.
* Window/door symbol boxes are imperfect. Opening splits depend on their alignment and aspect ratio; a missed symbol can leave a span intact. A floor-plan window opening also needs separate 3D sill/lintel semantics.
* Raster boundary pairing gives approximate width and straight faces. It does not establish wall height, construction material, load bearing status or exact physical dimensions.
* Rotated walls are supported in detection/output. The existing automatic exact-dimension constraint solver still requires horizontal/vertical room edges and will flag genuine diagonals for review.
* Page-edge proximity and dimension references reduce border false positives but cannot classify every detached internal page frame. Hatching and pale/coloured originals receive geometry-based candidates, but difficult renderings still need model/label improvements.

Reproduce the real-image captures with the local backend running:

```sh
./.venv311/bin/python apps/backend/scripts/validate_wall_examples.py \
  --output docs/wall-validation/after --refresh \
  --inputs *.webp *.jpg *.jpeg *.png *.avif apps/backend/uploads/20261006*upload*
./.venv311/bin/python apps/backend/scripts/wall_validation_report.py
./.venv311/bin/python -m unittest discover -s apps/backend/tests
npm test
npm run build
```

The `before/` JSON files preserve the pre-change service results. Do not overwrite them when comparing a future change. `refine_wall_examples.py` is a faster isolated evidence-pass diagnostic using recorded proposals; it does not replace end-to-end API validation. `reassess_wall_captures.py` is another development diagnostic that marks its output as a replay and keeps earlier captures in `raw-api/`; running it will replace the final `after/` results with replay output. Use the API command above to reproduce the delivered end-to-end gallery.

## Training labels that need correction

There is a concrete exporter mismatch in `auto_trainer.py`: it converts wall centreline endpoints to an axis-aligned box and floors both normalized dimensions at `0.01`. That gives a 2048px image an approximately 20px minimum label thickness regardless of its actual partition width. The database representation stores metric/default thickness, not the detected pixel faces, so those records cannot reconstruct reliable pixel-boundary training labels without calibration or reannotation.

Before retraining, use a consistent annotation convention: wall material polygons/masks (including white-filled and hatched bands), explicit door/window openings, and derived centrelines/thickness. Use segmentation or oriented boxes for diagonal walls; ordinary axis-aligned boxes contain substantial background around diagonals. Label thin partitions and exterior walls separately in geometry, without assuming thickness establishes structural role.

Audit old labels against the specific hard negatives in this collection: stair treads/arrow shafts, beds, shower trays, cupboards, sink outlines, dimension rules/ticks, text/logos/phone numbers and page frames. Annotate stair footprints, not just the printed word “STAIR CASE.” Include pale scans, grey/orange/rendered plans, solid and hollow bands, hatch patterns, multiple resolutions and rotated walls. Split train/validation by source plan so resized/cropped copies of the same plan cannot leak across splits.

Do not train on unreviewed detector output as ground truth. Review exported labels before enabling automatic retraining; keep a manually labelled holdout with boundaries, openings and wall IDs to measure precision, recall, endpoint error and thickness error. This change does not retrain weights or claim that geometry postprocessing resolves inconsistent model labels.
