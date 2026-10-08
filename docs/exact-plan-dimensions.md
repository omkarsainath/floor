# Automatically scan printed dimensions into 3D geometry

Uploading an image now starts **Auto Detect** by default. It detects walls and openings, reads printed dimensions using local Tesseract, extracts enclosed inside-wall room boundaries, and applies clear length/area matches jointly to the actual model geometry. You no longer need to select every label or trace every enclosed room yourself. Manual tools remain available for unresolved readings.

This uses the existing local OpenCV/Shapely backend and browser geometry solver. It requires no paid API, subscription, new model training, or asset purchase. Tesseract is installed on this development machine; another machine needs the free local `tesseract` executable for text scanning. Without it, wall detection still runs and the UI explains that printed measurements were not read.

## Your examples

- **A: 4.4 m²** controls the inside floor polygon of the room containing that annotation. Its exported floor area must be 4.4 m² within a numerical tolerance of 0.000001 m².
- **4.50 m** controls the span between the detected dimension-arrow endpoints. The endpoints bind to actual wall faces or wall endpoints, so geometry changes with the measurement. A dimension can cross several rooms; it is not automatically assigned to the nearest room or wall.
- If you select wall centreline endpoints, the wall's geometric length is constrained. If you select inside faces, the clear distance between those faces is constrained. Those lengths differ by wall thickness at the ends.

A single area does not uniquely determine a room's width and depth. The solver retains the detected/traced layout as its starting shape and finds a compatible adjustment satisfying all supplied lengths and areas. Unspecified dimensions remain estimates. Numerical agreement with an accepted label is not a guarantee that OCR or the original drawing is correct.

## Use the feature

1. Restart the backend after updating the code and refresh the tracer. Upload your original floor plan with **Scan automatically** checked. The scan runs without extra clicks. **Auto Detect** reruns it after corrections.
2. Read the scan result. Green wall lines, shaded room outlines and orange measurement spans show the associations. Clear matches are already applied; their target and actual 3D values appear below the scan. The original 2D image is unchanged.
3. Open **View in 3D → Measurements → Applied plan dimensions**. Model and Render share the solved geometry. Saving/reloading retains the dimensions and their physical wall references. Unresolved scanned readings remain visible in the viewer.

For a missed length, use **Review reference → Use … for orange span**, or **Set Exact Length** and select both arrow endpoints. For a missing/ambiguous room, correct the walls and rescan, or use **Trace Room** along inside wall faces, then **Finish Room** and enter its printed area. The room detector's bounding rectangle is never used as its floor boundary. **Apply Printed Measurements** recalculates after manual changes.

Use **Edit** beside a length, or **Set area** beside a room, to correct a target. Remove a mistaken target or use **Undo**. Repeated scans replace automatic targets and preserve edited targets, traced rooms and manual calibration. A contradictory automatic batch is rejected together and shown as needing review; any remaining preview does not claim those targets were applied. Conflicting manually accepted targets stop export.

### If an updated page talks to an older backend

Python keeps the code loaded when its process starts. Updating files or refreshing the browser does not update an already-running backend. The former message “No printed dimensions returned” could therefore mean an old server omitted the measurement fields, rather than OCR finding no dimensions.

Before uploading, the tracer now checks `/api/health` for the scan contract and verifies the detection response before changing the current plan. An older server produces an explicit compatibility error; existing edits and JSON remain intact. OCR unavailable/failed and a completed scan with no readable labels remain separate outcomes. The health response also reports whether the local Tesseract executable is available. After restarting an older backend, **Auto Detect** can rescan the image already open in the tracer.

## Automatic association rules

- OCR confidence must be at least 0.85 for automatic length/area targets. This threshold is a selection rule, not a calibrated probability of correctness.
- Lengths need explicit supported units and a horizontal/vertical dimension rule with terminal marks. Unmatched text cannot independently resize the model. Repeated top/bottom dimension graphics for the same span/value produce one target.
- Room polygons come from the inside faces of the main connected wall network, using measured wall thickness. Detected door/window boxes may close a matching gap for finding room boundaries; that temporary closure is not rendered as a solid wall.
- One readable area annotation must lie wholly inside one enclosed room. Multiple area labels in an open region, leaking boundaries, unknown wall thickness or ambiguous openings remain unresolved. A label alone cannot invent a partition.
- The entire candidate batch is checked against the shared geometry solver before acceptance. All applied targets must fit together; failures are explained instead of silently dropping a conflicting target and claiming success.

## How connected geometry stays consistent

The initial pixel-to-metre conversion is followed by a shared, monotonic coordinate transformation in X and Y. Every wall endpoint, room corner, opening/furniture box and supplied footprint uses that transformation. Adjacent rooms therefore retain their shared wall; the solver does not independently scale each room and create overlapping partitions. Wall thickness and vertical heights remain fixed during this adjustment.

Room edges must follow the inside faces of the walls. Small tracing differences within 3 cm (and within one third of the host thickness) can snap to an unambiguous nearby face; adjustments are recorded. A constrained room must connect to both a horizontal and a vertical wall face, and its floor polygon must not overlap solid walls. This permits defined open-plan zones while rejecting entirely floating area polygons.

Length endpoints project onto actual structural coordinates. They must be within 3 cm of an unambiguous wall face or endpoint. A floating dimension graphic is rejected because moving the graphic alone would not change the intended wall. The saved constraint records those wall anchors. The viewer recomputes lengths from the referenced walls and areas from actual room polygons rather than trusting a previous solver report.

The solver preserves coordinate ordering and rejects incompatible constraints without modifying its input or partially exporting a result. It recomputes from the original traced geometry for each export, avoiding cumulative deformation from repeated saves. The export stores both the original calibration and the subsequent coordinate mapping.

## Current boundaries

- Exact adjustment supports horizontal/vertical walls and room edges, including concave outlines. Diagonal/curved plans receive an explicit unsupported-geometry message when exact adjustment is requested; they are not silently flattened.
- OCR can miss or misread text. Skewed photos, small/blurred labels, missing units, unrecognised openings, disconnected wall networks and open-plan areas may still require correction. Automatic scanning is implemented; arbitrary-image accuracy is not guaranteed.
- Wall thickness is held fixed. A request to change that thickness must be made through the wall/default thickness values, not by introducing a contradictory span through the same wall.
- An area printed on a plan may mean carpet, built-up or another convention. This feature uses the inside wall-face floor polygon (not skirting projection or the enclosing rectangle). Choose the correct boundary for that convention.
- A result that fails to converge is reported as unresolved; the app does not claim mathematical proof that no possible architectural redesign exists.

## Validation

**59 frontend tests and 64 backend tests pass**, including the local OCR/CV integration test and compatibility checks on this machine. The production build succeeds.

The automated suites cover automatic application, repeat scans without duplicate targets, manual-edit preservation, conflicting/low-confidence readings, enclosed/shared/concave room boundaries, evidenced opening gaps and missing walls. A local integration test starts from synthetic image pixels and exercises the real API handler, OpenCV wall detection, Tesseract OCR, room extraction and frontend solver with database/cloud/model calls disabled. It verifies a 4.50 m physical wall span and 4.4 m² actual floor polygon together.

Headless Chrome upload checks passed against both development and production builds without measurement dialogs or manual tracing. They verify Model/Render/reload, repeat scanning without duplicates and a contradictory scan flagged for review. Browser API responses use the output of the real local scan described above. This controlled image check is not an accuracy benchmark on arbitrary uploaded plans. The existing viewer bundle-size warning remains.

Regression cases cover a 4.4 m² room and 4.50 m span simultaneously, actual wall mesh length, two adjoining room areas with a shared wall/window, concave outlines, fixed thickness, unbound reference rejection, contradictory targets without mutation, SI-unit import, and detection of stale dimensions after a wall changes.

Local OCR tests also cover `A: 4.4 m²`, compact `4.50m`, multiple measurements on one text row, accurate area-label text locations, and splitting adjoining dimension rules at their extension ticks. These prevent an individual 4.50 m label from accidentally scaling the combined length of an entire dimension chain.

The attached crops are examples of the intended constraints. Validation uses controlled geometry and synthetic image evidence; it does not establish detection accuracy on the full original drawing.
