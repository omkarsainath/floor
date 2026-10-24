# Reference furniture catalog

Added 132 reference-inspired procedural models:

- **Dining Sets:** 25 finishes/designs from [the supplied Ogaan article](https://ogaanlam.com/blog/25-latest-dining-table-design-ideas-for-modern-indian-homes/), including seating, pedestal/slab/leg bases, the wall-mounted option, and the navy bench set.
- **Centre D:** Coluxure D-01 through D-21 (PDF pages 2–22).
- **Centre A:** Coluxure A-01 through A-68 (PDF pages 23–90).
- **Office / Study:** DD-166, DD-167, DD-172–177 and MD-178–183 from the supplied images.
- **Office Chairs:** black padded, black diamond-quilted, tan headrest, and ivory executive interpretations of the chairs visible in those images. These are separate catalog items, not automatically added to desks.

## Use

Open **Catalog** in the 3D viewer, choose a category or search by code/name (`MD-182`, `A-53`, `teal`), then click to place. Existing object **Replace** also lists these categories. Dining dimensions include the entire seating arrangement. Nesting-table dimensions include the arranged group. The green wall-mounted set snaps its back edge to a nearby wall; place it against a wall, not in the middle of the room.

Click moving fronts/handles directly, or select the furniture and use **Drawers**, **Doors**, **Slide top**, **Trays** or **Swivel**, as available. Parts open independently; grouped controls open/close the relevant parts together. Model selection, footprint, position and rotation persist through project reload. Open/closed poses are transient, like existing wardrobe animations.

## Individual dining chairs

For any of the 25 reference dining sets, select the table and choose **Edit chairs**, or click a chair directly. Select a seat, choose a matching or different style, adjust its colour, width/depth, local X/Z position and rotation, then **Apply to selected chair**. **Add chair with this style**, **Duplicate selected chair**, **Delete selected chair**, and **Undo chair edit** affect seats only. **Done** restores the whole-table controls. All chairs can be removed and added again; up to 32 seats are supported. New seats are offset to avoid direct overlap with existing seats, but room/table clearance is still a manual check.

Changes save locally with the project and survive reload. Each dining object stores an optional `diningChairs` array with stable `id`, `style`, `x`, `z`, `yaw` (radians), `width`, `depth`, and optional hex `color`. Coordinates/dimensions are local metres before whole-set scaling. An absent array uses the original seating; `[]` deliberately means no chairs. Moving/rotating/scaling the complete dining set keeps the arrangement together. Seat edits never refit the table around the new arrangement. This editor does not change the older generic dining-table models; replace those with a reference Dining Set to use it.

## Fidelity and dimensions

These are lightweight, reference-inspired reconstructions, **not exact manufacturer CAD, licensed product assets, fabrication drawings or photorealistic replicas**. All 97 PDF pages and the 25 article images were inspected; the final PDF pages contain company information rather than additional model codes. No document instructions were executed. External photographs/PDF pages are not bundled or hotlinked at runtime.

PDF main table widths/depths informed nominal sizes where readable. Heights, component thicknesses, drawer travel, nested-piece proportions and ambiguous dimension notation are approximations. All dining, desk and chair dimensions are estimates. Closed assemblies are fitted to their catalog footprint; this may rescale the main piece in a nesting arrangement. The UI deliberately marks these models approximate.

Fine carving, veneers, upholstered curvature, hardware, exact compartment layouts, the DD-172 ornamental motif, and some asymmetric/rounded center-table bodies are simplified. Chair upholstery is procedural, not a replica of the photographed stitching. Two-dimensional references do not establish hidden construction. Frames, shelves, drawers and glass insets are modeled as separate parts; glass uses lightweight transparency rather than physically accurate refraction. Opening motion is illustrative and does not include room-level collision avoidance.

## Implementation and adjustment

- `apps/frontend/src/generators/referenceFurnitureCatalog.js`: stable IDs, reference codes/pages, finish palette, base/shape families, seating counts, dimensions and construction options. `w`/`d` are the complete placement footprint in metres. Centre `width`/`depth` inputs are inches, converted by 0.0254. Heights use `h`.
- `apps/frontend/src/generators/referenceFurniture.js`: geometry, hollow drawer/cabinet construction, finish textures and motion metadata. Tune color/finish/base, `drawers`, `slider`, `count`, `stools`, `shape`, and `frame` in the catalog. Builder families share geometry helpers but preserve reference-specific options.
- `object.js`: exact-ID dispatch before the older generic builders. New model IDs deliberately avoid `door`, `window` and `glass`, because those substrings identify architectural openings elsewhere in the existing application.
- `objectAnimations.js` and `main.js`: furniture-part animation and picking, sharing the existing wardrobe/window scheduler. No wall, detection or ceiling algorithm changes were made for this feature.

## Validation / preview

Run `npm test` and `npm run build`. The reference-model tests exercise every catalog entry through the actual object factory and JSON loader, finite geometry, closed bounding boxes, independent reversible animation, seating capacity and existing catalog registration. They do not prove exact visual fidelity to the references.

With `npm run dev`, open `/tests/reference-furniture-preview.html`. Its paged gallery renders all 132 entries with one shared WebGL context, has front/back views and part controls, and supports `?kind=desk`, `?kind=center`, `?kind=dining`, `?kind=office-chair`, `?page=2`, and `&open`. This is a development review page, not a production entry point.
