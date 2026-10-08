# Room finishes from the supplied design report

The separate [ceiling types guide](ceiling-types.md) covers the 12 architectural ceiling shapes added from your reference image. They are available alongside the 40 material concepts documented here.

For ceiling fixtures and paneling on only a marked part of a wall, see [place lights and mark wall areas in 3D](lights-and-wall-areas.md). Saved marked areas retain their individual styles when the collection changes; full-wall draft selections still follow the current collection.

Added 3 October 2026. The supplied `pasted-text.txt` report is the source of these **40 selectable finish concepts**. The implementation uses locally generated Three.js geometry/materials, with no paid assets, cloud API, image generation service or extra package.

## Use the feature

1. Open the saved project in the 3D viewer, then choose **Room Finishes** above Paint Walls and Catalog.
2. Choose a room with an actual inside-boundary polygon. Correct or trace missing boundaries in the tracer first; room detection rectangles are not used as finish footprints.
3. Choose its style collection: Living Room / Hall, Bedroom, Kitchen or Bathroom. A room name can suggest the collection; you can change it explicitly.
4. Select a floor, ceiling, wall panel and/or TV backdrop. Choose the **accent wall** for wall panels and TV backdrops. Its W-number corresponds to the labels in **Measurements**. The same accent wall is used by both wall treatments.
5. Optionally set an accent colour and a ceiling drop of 5–45 cm. **Use style colours** restores the recipe's palette. Choose **Apply to this room** to build and save the preview.
6. To inspect a ceiling from below, use **Walk** and **Toggle Ceiling**. Ceiling visibility also applies to the new decorative ceiling; it still affects clearance checks while hidden in the cutaway view.
7. Switch between Model and Render to inspect the same finishes with different lighting. Reload retains the saved room selection. **Reset this room** restores its default finishes while preserving the floor plan and furniture.

Changing a collection resets the draft selections so kitchen/bathroom-specific options cannot accidentally remain assigned under a different room type. Application is explicit: changing a dropdown does not overwrite the saved design until Apply. A failed local save keeps the previous room design.

## Included selections

| Room collection | Surface | Options from the report |
| --- | --- | --- |
| Living / Hall | False ceiling | Layered multi-tier gypsum; gypsum and wood slat fusion; coffered POP grid |
| Living / Hall | Flooring | Polished glazed vitrified tiles (800 × 1600 mm concept); natural marble grid; SPC wooden planks |
| Living / Hall | Wall panel | Charcoal louvers; veneer panels; upholstered fabric blocks |
| Living / Hall | TV backdrop | Louver and UV marble sheet; suspended fluted wood frame; backlit veneer panels |
| Bedroom | False ceiling | Floating perimeter tray; single-flush accent border; headboard cascade |
| Bedroom | Flooring | Engineered wood; herringbone planks; matte porcelain tiles |
| Bedroom | Wall panel | Classic wainscoting; full-height cushioned headboard; MDF geometric grids |
| Bedroom | TV backdrop | Half-wall board and batten; integrated wardrobe extension; recessed gypsum/POP box |
| Kitchen | False ceiling | Interlocking PVC panels; moisture-resistant gypsum; task-focused linear drop |
| Kitchen | Flooring | Anti-skid vitrified tile concept; kitchen SPC; polished Kota stone |
| Kitchen | Wall panel | Backlit acrylic sheets; SPC wall slabs |
| Kitchen | TV backdrop | High-gloss shield; WPC fluted block |
| Bathroom | False ceiling | Modular aluminium grid (2 × 2 ft concept); seamless PVC planks |
| Bathroom | Flooring | Textured matte ceramic; microcement |
| Bathroom | Wall panel | PVC tongue-and-groove; WPC fluting |

There is no bathroom TV treatment in the supplied report, so none is invented. Master and individual bedrooms share the Bedroom collection.

## Geometry, measurement and persistence

Room finishes are stored as `room.design` in the same local project JSON:

```json
{
  "roomType": "living",
  "floor": "living-floor-polished-gv",
  "ceiling": "living-ceiling-layered-tray",
  "wallPanel": null,
  "tvPanel": null,
  "ceilingDropM": 0.15
}
```

The exact IDs are defined in `apps/frontend/src/design/roomDesignCatalog.js`; use the UI or catalog exports instead of inferring IDs from labels. `accentWallId` identifies the original parent wall, and optional `color` is a hex accent colour. Original endpoints, inside-room polygons, dimension targets, object footprints and calibration evidence are retained.

Floors follow the real room polygon, including concave corners. Wall finishes follow matched inner wall faces and the same carved pieces used by the wall renderer. They do not fill door/window holes. Shared walls have separate inward-facing surfaces for adjacent rooms. Opening placement/replacement rebuilds the associated room finish so the cutouts follow the edited opening.

Decorative surfaces have visual thickness and false ceilings lower parts of the overhead surface. The printed plan area remains the room-boundary area; it is not relabelled as a new usable area after subtracting every trim, cabinet or finish. Use actual construction layers and verified heights for a detailed finished-clearance calculation. Walking uses the rendered geometry, including the lowered ceiling, with the conservative collision approximation explained in [the walkthrough guide](model-scale-and-walk.md).

A TV backdrop is a decorative concept, not a verified TV model, recess cut into a structural wall, electrical layout or manufactured wardrobe. The preview does not move a bed or infer which wall is its headboard: choose the appropriate accent wall. Report material names are represented by procedural patterns, colour, roughness and simple details, not photographic scans of purchasable products.

## Budget and material claims

The **software preview** costs no money to add or run locally. Real materials, labour, lighting and fittings are not free, and this feature does not invent prices or supplier availability. There are no automatic product purchases or external downloads.

The report contains absolute claims about waterproofing, fire/slip performance, mould, termites and durability. Those are not verified product specifications, and the preview does not certify them. A visual PVC/WPC/SPC/microcement finish is not evidence that an entire installed assembly is watertight or suitable beside a heat source. Actual products, substrate preparation and installation details need project-specific verification.

The private Google Photos references were not used to assert the building's construction stage. No construction readiness is inferred from those inaccessible references. The room/style descriptions supplied in the attachment are sufficient for these selectable previews.

## Boundaries of this addition

- This adds room finish choices and visual combinations; it does not add a construction cost engine, procurement catalog, electrical routing or Vastu validation.
- Selections are scoped to room IDs. Importing a different floor plan or regenerating rooms with new IDs can require selecting the finishes again.
- A room must have a valid polygon. Unknown or unmatched boundaries are surfaced for correction rather than decorated by guessing a rectangle.
- Browser storage remains the persistence mechanism. Reset acts only on the selected room's finishes, and resources belonging to replaced previews are disposed.

## Verification

All **113 frontend tests pass**, including generation of every one of the 40 styles, concave floors/ceiling footprints, inside-face matching, door/window cutouts, shared-wall orientation, exact metre-sized tile UVs, lowered-ceiling clearance, the headboard cascade, resource disposal and persistence rollback. `npm run build` succeeds; the existing warning about the large viewer bundle remains.

An isolated Chrome run exercised the actual Room Finishes UI on a two-room test project: distinct living/bedroom choices, bathroom/kitchen option lists, ceiling drop and visibility, Model/Render, a clear window opening through layered panels, unchanged plan coordinates, saved reload, reset of only one room, and repeated opening/wall rebuilds without accumulating duplicate groups. No browser page errors were reported. Button placement was also checked so Room Finishes does not cover Paint Walls or Catalog.

These checks establish the software behavior of the previews, not real material performance, construction readiness or a quotation. No backend restart is needed for the viewer addition.
