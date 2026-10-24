# Kitchen accessory integration

Open the existing **3D viewer** (`index.html`), then **Kitchen Accessories** at the bottom right, or select a supported kitchen object and use its accessory button. The floor-plan tracer remains the original separate entry point.

For a ready-made starting point, open **Catalog → Kitchen → Slab with Pull-outs**. Place the 1.80 × 0.60 m, 0.90 m high unit, exit placement with Escape, select it, and open **Kitchen Accessories**. It has three separate bays under a shared countertop: a two-tier bottle pull-out, a cutlery drawer, and three wicker drawers. Choose each bay in the cabinet selector to replace/remove its accessory, operate it, or change its finish. Replacement choices still need to fit the bay. Model dimensions are already known for this generated unit; they are not a measurement claim about an existing real kitchen. The recessed plinth keeps fronts above floor-level skirting.

Placed and replaced catalog units save their initial kitchen state. Saved edits, including removed accessories and empty bays, override the starter configuration on reload. Adding this item does not convert an existing bare slab automatically.

The editor discovers the existing base-cabinet, island, counter, stove and sink generators. Select a cabinet bay in the list or click it in the viewer. Expand **Cabinet measurements & obstructions**, enter its measured clear dimensions and check the confirmation. Compatible accessory and configuration selections apply and save immediately. The preview and installation buttons remain available; explicit previews are reversible and are not saved until installation. Use Open/Close, the percentage slider, or click the installed mechanism with the editor closed. Clicking a wicker front, basket or handle operates only that drawer. The panel also offers individual baskets or **Entire accessory**; the selected basket stays selected after operation. Bottle and spice racks remain linked pull-outs.

**This is a conceptual visualization library, not installation-ready manufacturer hardware or a claim of photographic realism.** It contains detailed procedural 3D construction, fixed-size hardware, dimensional gating and conservative sampled collision checks. It has not been verified against licensed manufacturer CAD, full engineering drawings, load ratings, drilling templates or physical prototypes.

## Existing application preserved

- Three.js 0.160, the scene, camera, orbit/walk controls, lighting/render mode and project format are reused.
- Countertop meshes, walls, appliances, placements and original door geometry remain in place. Installing hides the solid body and the affected door, then adds a reversible carcass and accessory assembly. Removing the last installation restores the original body unless a cutaway or changed finish still needs the carcass.
- Original cabinet material is the default. New laminate choices use the existing Greenlam catalog, images, roughness and grain mapping. No IVAS color samples were imported into that library.
- The original kitchen generators do not provide engineering cabinet interiors. Door divisions and 18 mm boards are **assumptions**, shown as unconfirmed until the user measures the cavity. Two doors are treated as two logical bays. A slab without doors is one manual bay, not an inferred modular run.
- Existing model transforms can change, but hardware remains at scale 1 in metres. If a new envelope no longer fits, the installation is retained in saved data and hidden with an explanation rather than stretched.

## Library

| Category | Variants | Construction / movement |
| --- | --- | --- |
| Bottle | Two / three tiers | Rounded wire baskets, glass bottles, guards, brackets, telescopic tracks |
| Magic corner | Left / right handed | Four trays, front extraction followed by sideways swing; rear carrier translates across before moving forward; pivot arms and guide |
| Spice | Three tiers | Wire baskets, jars, vertical frame, runners |
| Cutlery | Five compartments | Dividers, spoons, forks, knives, sliding tray and separate lower front |
| Waste | Single / dual bin | Open containers with wall thickness, rims, supporting cradle and runners |
| Wicker | Two / three drawers | Geometric interwoven strands, wood base, independent runners and fronts |
| Pantry | Five trays | Tall frame, baskets, jars and lower runners |

Dimensions in `catalog.js` are fixed **design-study dimensions**, not branded product specifications. Pantry installation requires a confirmed tall cavity. Corners require a confirmed connected blind-corner cavity and enough swept clearance; the editor does not convert a straight cabinet into a measured real corner. The existing app has no native engineering corner or pantry cabinet data. Those classifications must be supplied manually within an adequate model envelope. Both handings must be checked against surrounding cabinetry.

## Fit and motion

Internal width, height, usable depth and clear opening are validated, including the fixed hardware envelope plus clearance. For **Slab with Pull-outs**, dimension inputs resize the selected physical section on each valid input, updating its fronts, carcass, countertop and pull-out placement. Neighboring section sizes remain unchanged; the rear-left anchor stays fixed and subsequent sections shift along the run. Different heights or depths create a stepped countertop. Board thickness changes the usable cavity while keeping that section’s exterior dimensions. Other kitchen generators still treat these inputs as clearance measurements within their existing model envelope. Invalid, incomplete or incompatible edits keep the last valid model and show feedback beside the fields. Resizing also checks the new structure against modeled obstacles. Changes save automatically, and one Undo restores the size from before a continuous field edit. Shelves/partitions and other obstructions are measured boxes. Their x/z coordinates are relative to the cavity centre; y is relative to the cavity floor. All units in the obstruction JSON are **metres**.

Example pipe exclusion volume:

```json
[{"label":"Trap and pipe clearance","x":0,"y":0.30,"z":-0.20,"w":0.12,"h":0.60,"d":0.14}]
```

Sink installation requires explicit plumbing confirmation; the existing sink generator does not contain a measured pipe network. The user must include the sink bowl, trap, pipes and maintenance clearance. Do not interpret a checked box as automated plumbing detection.

Installation checks the closed position. When the closed assembly fits but full extension is blocked, it saves closed and displays a warning directly below the installation buttons. Every opening or closing request still checks the requested path; a warning does not disable collision checks. A collision in the closed position rejects installation and restores the previous configuration.

Opening and closing are tested against modelled walls/other objects, entered internal obstructions, carcass panels, adjacent doors and other open accessories. Forty intervals sample each sweep. External objects use oriented bounds for each visible physical mesh, so a wall's low skirting does not inflate its entire blocking volume. Door click targets are explicitly tagged as interaction proxies and excluded without disabling ray picking. Physical door panels, frames and handles still block motion, including mirrored door leaves; transparent glass remains physical geometry. Carcass panels, adjacent doors and fixtures also use oriented bounds, preventing false self-collisions when a traced cabinet is slightly rotated. Cutaway panels still participate in collision checks. Entered obstruction boxes retain conservative world-axis bounds and may reject valid rotated arrangements. This is not continuous collision detection, and unknown or unmapped obstructions cannot be checked. Existing moving furniture can still be moved into a previously cleared path; recheck before operation.

## Finishes and saving

Choose **Selected Pull-Out** to set an `OVERRIDE`; the parent finish and other cabinets stay unchanged. **Selected Cabinet** changes that cabinet's finish. **All Cabinets** changes all supported kitchen cabinets in the current viewer. `INHERIT` fronts follow their cabinet; overrides remain independent. **Reset to Kitchen Laminate** restores inheritance. Metal, plastic, glass and wicker are separate materials.

The editor supports undo/redo across installation, removal, opening state, measurements and multi-cabinet material edits. History is session-local. Installation state lives in each existing layout object's `kitchen` field and passes through the existing `preciseFloorplan` local storage/export format. Each accessory stores a UUID, parent bay, category/model ID, fixed dimensions, position/rotation/scale, configuration, handedness, open/tier state, laminate mode/choice, material and clearance metadata. Slab section sizes and the updated footprint, placement and overall height also persist. Slider input sets the selected drawer pose immediately; direct clicks and Open/Close buttons remain animated. Accessory replacement preserves its custom laminate, and grain changes apply to the existing chosen finish. Transient cutaway, previews and undo history are not persisted. Saving failure is reported in the panel.

## References and production requirements

The supplied `/Users/apple/Downloads/Modular-Kitchen.pdf` was reviewed on pages 7–9, 25–31 and 37–39. It informed organization, materials and visual construction only. It is not redistributed with the application.

The corner movement is inspired by the door-linked front/rear interaction described by [Kesseböhmer's MagicCorner page](https://www.kesseboehmer.com/en/storage-solutions/kitchen/corner-units/magic-corner). The [manufacturer download page](https://www.kesseboehmer.com/en/downloads/magiccorner) was also inspected. This implementation is a custom conceptual linkage, not a reproduction or certified fit of a specific Kesseböhmer SKU. The PDF itself shows both articulated rectangular trays and a separate kidney-shaped corner design.

Before production installation or a photographic quality claim, obtain:

1. Licensed, optimized CAD/GLB assets and technical specifications for every selected SKU.
2. As-built clear cabinet openings, board thicknesses, mounting faces, partitions and hinge geometry.
3. Corner linkage pivot coordinates, handedness, complete travel envelopes and joint constraints.
4. Sink-bowl/plumbing models and appliance service clearances.
5. Physical laminate/metal/wicker samples and calibrated textures. Existing Greenlam swatches are visual approximations.
6. Continuous collision verification, joint/load validation and showroom-quality visual review on the target devices.

## Verification

- `node --test apps/frontend/tests/kitchenAccessories.test.js`: geometry preservation, all ten variants, fit rejection, materials, rotated blockers, flush side walls, floor-level skirting, hidden obstacle meshes, corner stages, independent wicker operation, persistence and scaling.
- `node scripts/check-kitchen-accessories.mjs`: isolated headless Chrome with a temporary profile and Vite server; visual fixtures for every category, finish edits, undo/redo, preview cancellation, reload, real viewer integration and mobile panel bounds. Also checks slab installation beside a flush wall, blocked-opening warnings, failed-replacement rollback, and visible error feedback. Screenshots are written to `/private/tmp/`.
- `node scripts/check-kitchen-live-editing.mjs`: real-viewer live dimension changes, preserved input focus, grouped Undo/Redo, automatic accessory replacement, retained finishes, immediate individual slider operation, invalid-edit rollback and reload.
- `node scripts/check-kitchen-drawers.mjs`: focused real-viewer check using native mouse clicks on separate wicker drawer handles, saved mixed opening states, and the panel's individual-basket selection.
- `npm test` and `npm run build`: existing regression suite and both application entry points.

The visual fixture at `tests/kitchen-accessories-preview.html` uses its own storage key and does not change the user's floor plan. Its preconfirmed measurements describe only that test fixture.

## Files added or integrated

- `apps/frontend/src/kitchen/catalog.js`: fixed conceptual variants, fit rules and staged corner poses.
- `apps/frontend/src/kitchen/sectionGeometry.js`: separate section geometry, bounds and saved size fitting for editable catalog slabs.
- `apps/frontend/src/kitchen/presets.js`: the catalog slab entry and three editable starter sections.
- `apps/frontend/src/kitchen/models.js`: detailed geometry, materials, tracks, wicker weave and animation poses.
- `apps/frontend/src/kitchen/system.js`: original-model adapters, reversible interiors, measurements, collision checks, material inheritance and serialized state.
- `apps/frontend/src/ui/kitchenAccessoriesPanel.js`: cabinet selection, measurement editor, previews, operation, Greenlam swatches, undo/redo and saving.
- `apps/frontend/src/generators/object.js`: registers existing kitchen geometry and restores saved accessory state.
- `apps/frontend/src/main.js`: accessory entry points, ray picking, cabinet highlights, camera inspection, keyboard/drag guards and animation updates.
- `apps/frontend/tests/kitchenAccessories.test.js`, `apps/frontend/tests/kitchen-accessories-preview.html`, `scripts/check-kitchen-accessories.mjs`: automated and visual verification.

The existing unrelated working-tree edits were preserved. No changes were needed in the tracer, original Greenlam catalog, project parser or persistence format.

## Recorded results (16 October 2026)

- Full frontend suite: **639 passed, 0 failed**. The additional actual-sink regression was added afterward and passed in a **24-test focused run** including rendering regressions.
- Production build: passed for both viewer and tracer. Vite still reports its large-bundle and mixed static/dynamic import warnings.
- Final Chrome run: all tested categories installed and reached their open poses; individual overrides, inheritance, undo/redo, removal/restore, preview/cancel, reload, actual viewer integration, direct 3D handle ray picking, the Delete-key guard and mobile panel bounds passed. **Zero JavaScript exceptions and zero failed Greenlam requests.**
- Screenshots were visually inspected. These show the current procedural quality, not verified photographic realism: [bottle](bottle-open.png), [fully opened corner](corner-open.png), [wicker](wicker-open.png).

## Installation fix verification (17 October 2026)

- Removed false external collisions from the 4 mm whole-assembly margin and whole-wall bounds. Real floor-level skirting collisions remain blocked and are identified explicitly.
- Focused kitchen and rendering tests: **26 passed, 0 failed**. Production build passed with the existing bundle/import warnings.
- Isolated Chrome checks passed for flush-wall slab installation, installation with a blocked full-opening path, blocked operation, failed-replacement rollback and visible feedback. The existing viewer, handle-click, persistence, finishes and mobile checks also passed, with zero JavaScript exceptions or failed Greenlam requests.

### Rotated carcass correction

The reported `carcass-side` rejection was reproduced with a slab rotated by only 0.01 radians. World-axis structural bounds overlapped across the closed front seam. Internal panels, fixtures and adjacent fronts now use oriented mesh bounds, retaining the existing 0.2 mm contact tolerance for panels and moving meshes. Panels remain collision obstacles in cutaway mode.

The focused kitchen/rendering run passed **29 tests**, including translated and nonuniformly scaled rotated slabs, opening/closing, all ten variants in rotated cabinetry, and actual panel intersections. The production build passed. Browser checks cover both installation and opening at 0.01 and 0.37 radians.

### Door click-target correction

The reported closed-position `door` rejection was reproduced with a slab beside a door whose physical frame cleared the slab. The door's transparent click target extends 150 mm beyond its width and is 300 mm deep; it incorrectly participated in collision checks. It is now tagged as an interaction proxy and excluded from kitchen clearance checks while remaining ray-pickable. Physical door pieces have separate panel/frame/handle labels. Mirrored door bounds retain positive extents so real door collisions remain detectable.

The focused kitchen/rendering run passed **30 tests**, including both door hinge sides, unobstructed closed/open positions, ray picking, and actual leaf intersections. The production build passed. The browser regression covers preview/cancel, installation and opening beside a door, and rejection when the physical leaf overlaps the slab.

### Ready-made catalog slab

`kitchenPresets.test.js` covers preinstalled sections, simultaneous opening, replacement, removal, finishes and persistence. The focused kitchen, preset, rendering and catalog suite passed **34 tests**, and the production build passed. The browser regression placed the item through the real catalog, opened all three sections, edited accessories and laminate, and reloaded the saved project successfully, with zero JavaScript exceptions or failed Greenlam requests. [Verified catalog slab with its pull-outs open](catalog-pullouts.png).

### Independent drawer clicks

Drawer carriers now identify their tier during hit testing. Scene clicks use that tier's saved target, and animations run separately for each drawer so a second click does not stop a different drawer midway. Fixed wicker rails do not toggle the entire set. Tests cover two- and three-drawer configurations, front/handle hits, overlapping animations, closing one drawer while another stays open, and restoring mixed drawer states. The focused suite passed **36 tests**.

The production build passed. The broad Chrome run reached its time limit after the catalog/edit checks during a slow browser startup. The focused `check-kitchen-drawers.mjs` run then passed native handle clicks, saved independent states and panel selection retention, with zero JavaScript exceptions or failed Greenlam requests. [Upper drawer open with the lower drawer closed](independent-drawer.png).

### Immediate section editing

The catalog slab now rebuilds its physical sections on valid dimension input, retains neighboring sizes, and saves the new footprint and section dimensions. Compatible accessory choices and grain direction changes apply immediately; custom laminate survives replacement. Invalid input retains the last valid model and keeps the draft visible. Continuous dimension typing is grouped into one Undo step.

The focused kitchen, preset, rendering and catalog suite passed **40 tests**. A subsequent eight-test preset run also passed, including the added empty-cabinet blocker case. The production build passed with existing warnings. The focused Chrome check passed live editing, preserved focus, Undo/Redo, automatic replacement, finish retention, individual slider movement, rejected-edit rollback and reload with **zero JavaScript exceptions or failed Greenlam requests**. [Resized first section with an independently opened drawer](live-editing.png).
