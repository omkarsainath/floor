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

Use **Edit** beside a length, or **Set area** beside a room, to correct a target. Remove a mistaken target or use **Undo**. Repeated scans replace automatic targets and preserve edited targets, traced rooms and manual calibration. With no manually marked rooms, a contradictory automatic batch is rejected together and shown as needing review. Marked rooms use the direct sizing flow below instead.

**Mark Room Manually** offers optional **Exact width** and **Exact depth** fields. Width runs left-to-right on the image; depth runs top-to-bottom. Enter either or both, using metres, centimetres, millimetres, feet, or feet and inches (plain numbers mean metres). Finish the boundary, then use **Apply Printed Measurements** or **View in 3D**. Your marked outline creates its own floor and walls, with no detected walls required. Angled and concave outlines are supported; width/depth describe their overall horizontal/vertical spans. **Set width / depth** beside a saved room edits these targets; Undo restores the prior values.

Each marked room is sized independently. Explicit width and depth take priority over a conflicting area; with one dimension and an area, the other axis is derived from the polygon area. Other scanned and length constraints are retained as superseded references, not enforced or reported as satisfied. Rooms keep their positions where possible and move to the closest free bounding-box placement when sizes conflict; this can create stepped boundaries or spacing between irregular rooms. Wall thickness extends outward from the floor boundary. Shared collinear wall runs are deduplicated, objects belonging to a marked room follow its resize, and scan walls crossing edited regions are clipped/replaced. Windows do not require an existing scanned wall to export. Unedited scan geometry outside these regions is retained.

A marked floor edge does not automatically imply a solid wall. Where existing boundary walls are available, their runs and gaps follow the room resize. This preserves the open Hall-to-Kitchen passage, including a gap at the end of a wall. A wholly open edge stays open when other room edges establish the surrounding walls. Detected doors/windows retain their opening hosts for normal lintels and sills; an unlabelled passage remains open full-height. Rooms without boundary-wall evidence still receive new walls, as do new cut-out partitions. `node scripts/check-room-dimensions.mjs --passage` checks the Hall passage through export and the viewer.

Originally adjoining marked rooms follow their neighbour when it shrinks or grows, retaining a shared wall rather than leaving the second room at its old image position. The longest shared source edge supplies the primary attachment when several neighbours compete. Entered room dimensions stay fixed. Small scan seams at corners and jambs are closed using six image pixels, bounded to 2.5–12 cm; larger passages remain open. Resized door/window boxes are centred on their nearby regenerated wall so rendered frames and wall cuts use the same wall line.

When detected jamb ends define a supported opening wider than its detection box, the viewer fits the door/window box to that same physical span before creating its mesh and wall cut. This applies to existing saved layouts on load as well. Shared door/side-light spans are kept separate, and unsupported passages are not widened or filled. `node scripts/check-door-jambs.mjs` checks the actual viewer door's visible bounds against both jambs and captures a close-up.

Marked-room dimensions are saved with a room-bound measurement basis. The viewer recomputes them from the saved floor polygon on reload; changing that polygon later can therefore reveal a mismatch. Finite positive dimensions and a non-self-intersecting room polygon are still necessary to construct geometry.

### Bathroom corner cut-out

Choose **Rectangle (two corners)** and mark the overall bedroom rectangle. Enter its overall width/depth, enable **Bathroom cut-out**, select the corner as seen on the image, and enter the cut-out width/depth in the same supported units. **Finish Room → View in 3D** produces a six-corner L-shaped floor and matching walls. For the bathroom at the upper left of the supplied bedroom example, choose **Top left**. The result shows `overall width × depth − cut-out width × depth = net room area`.

The cut-out uses exact measurements, rather than estimating the recess from tracing proportions. Enabling it on an existing irregular outline replaces that outline with its overall rectangle minus the specified corner. Both cut-out dimensions must be smaller than the overall room dimensions. It does not create a separate bathroom room automatically; an existing scanned bathroom floor within the cut-out can remain. The viewer suppresses its generic rectangular background floor so it cannot fill an otherwise empty cut-out.

Under a saved room, expand **Bathroom cut-out** to edit the corner or dimensions, or disable it and select **Save cut-out**. Undo restores the previous state. The definition survives JSON export/reload. `node scripts/check-room-dimensions.mjs --cutout` checks subtraction, saved-room removal, undo, and opening the 3D viewer.

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

The shared solver described in this section applies when there are **no manually marked rooms**. Manual room exports use independent room sizing above, so wall-face matching, rectilinear constraints and shared-dimension conflicts do not block them.

The initial pixel-to-metre conversion is followed by a shared, monotonic coordinate transformation in X and Y. Every wall endpoint, room corner, opening/furniture box and supplied footprint uses that transformation. Adjacent rooms therefore retain their shared wall; the solver does not independently scale each room and create overlapping partitions. Wall thickness and vertical heights remain fixed during this adjustment.

For the shared solver, room edges must follow the inside faces of the walls. Small tracing differences within six source-image pixels (bounded to 3–8 cm) can snap to a nearby inward face; adjustments are recorded. A constrained room must connect to both a horizontal and a vertical wall face, and its floor polygon must not overlap solid walls. These matching rules do not apply to manually marked rooms.

Length endpoints project onto actual structural coordinates. They must be within 3 cm of an unambiguous wall face or endpoint. A floating dimension graphic is rejected because moving the graphic alone would not change the intended wall. The saved constraint records those wall anchors. The viewer recomputes lengths from the referenced walls and areas from actual room polygons rather than trusting a previous solver report.

The solver preserves coordinate ordering and rejects incompatible constraints without modifying its input or partially exporting a result. It recomputes from the original traced geometry for each export, avoiding cumulative deformation from repeated saves. The export stores both the original calibration and the subsequent coordinate mapping.

Before solving, small near-axis endpoint errors are aligned while keeping shared endpoints connected. This is limited to 3 degrees and a small positional tolerance based on image scale (2–6 cm); adjustments are recorded in the report. Genuine diagonal walls remain in the model and their endpoints follow the coordinate mapping, with wall thickness retained. Room overlap uses their oriented footprint, not a bounding rectangle. Unmeasured coordinates follow measured wall movement, allowing adjoining rooms to expand together without leaving intermediate walls at their old positions. The building supplies the fixed reference, so a larger footprint does not trap an expanding room. Conflicting targets still stop export.

**View in 3D** opens its tab during the click, before asynchronous export work, and closes the temporary tab if validation fails. If popups are blocked, a successful export opens the viewer in the current tab. `node scripts/check-room-dimensions.mjs` verifies two marked rooms with different depths, no scanned walls, exact saved geometry, actual viewer opening, and the popup-blocked fallback in an isolated browser.

## Current boundaries

The following shared-solver limits apply to automatic scan/length adjustment without marked rooms. Marked-room exports bypass these matching restrictions.

- Exact room targets currently require horizontal/vertical room edges, including concave outlines. Unconstrained angled room outlines and diagonal walls elsewhere do not block export. A target on an angled room identifies that specific room as unsupported; it is not silently flattened. Horizontal/vertical length references can also bind to diagonal wall endpoints.
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
