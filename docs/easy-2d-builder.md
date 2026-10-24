# Easy 2D Plan Builder

Open **Build a 2D Plan** below the tracer canvas, or visit `/builder.html`, to start fresh. Opening that address again (including refreshing it) starts a blank plan and keeps earlier nonempty drafts in **Saved Files**. Choose **Continue in 2D** there to reopen a specific plan; its `/builder.html?plan=…` address also survives refresh. **Edit 2D plan** in the 3D viewer reopens its matching plan.

1. Choose room cards. Drag rooms together; the sides snap to a shared wall. Change dimensions in the right panel or drag a corner square.
2. Select a room and add furniture from the shared catalogue. Drag items, use the movement arrows, or edit their sizes. Doors and windows attach to walls. Purple dashed footprints are elevated items such as lofts.
3. Choose **See in 3D**. Use the existing 3D editors for cabinet sections, pull-outs, sinks, materials and other detailed configuration. **Edit 2D plan** returns to the builder with saved furniture changes.

Sizes display in feet and inches by default; metres are also available. A plain number uses the selected unit. Internal geometry uses metres, room sizes represent clear interior space, walls are 150 mm thick and 3 m high. Drag snapping uses 6 inches; typed sizes are not grid-rounded. Furniture overlap warnings are approximate footprint/height checks, not manufacturing clearance certification.

Undo/Redo and Command/Ctrl+Z apply to builder changes. Text fields retain their normal text-editing shortcuts. Select a room/item from the dropdown to operate it without dragging. Arrow keys move the selected item when not typing. Escape cancels a drag or selection.

Drafts use `easy2DPlanDraft` (version 1). Opening 3D writes the existing `preciseFloorplan`/`floorplanTimestamp` handoff, first backing up a different active project to `easy2DPreviousProject`. The review step includes Download plan, Open a builder backup, and Open previous 3D project. Drafts stay on the current browser/device. Storage failure is displayed; it must not be reported as saved. Earlier nonempty drafts are retained by plan ID in `easy2DSavedPlans` when another plan replaces them; the current draft remains in `easy2DPlanDraft`. The header has **Saved Files** and **Download 2D plan**. Downloads include a PNG image, an SVG drawing with dimensions, and an editable JSON backup. Images fit the entire plan, including furniture, regardless of zoom or selection. Use Saved Files to reopen JSON backups. Storage is limited to this browser and address; download backups for portability.

The builder handles new rectangular-room plans and their own backups. It does not import traced/irregular floor plans. Existing tracing controls remain available. 3D furniture changes and material metadata are merged back only for the same builder ID and revision; a newer 2D draft is never overwritten by an older viewer snapshot.

Verification:

- `node --test apps/frontend/tests/planBuilder.test.js`
- `node scripts/check-plan-builder.mjs` (isolated Chrome profile and Vite server, macOS Chrome required)
- `npm run build`

Browser checks cover tracer entry, two rooms, imperial sizing, furniture placement, handle resize, Command+Z, pointer-driven shared-wall door placement, window placement, reload, 3D handoff, real kitchen laminate saving, return to 2D and mobile width. Screenshots are written under `/private/tmp/easy-2d-builder-*.png`.

## Pooja Room

The **Pooja Room** card starts at 4 ft × 5 ft. Select a containing room before adding it to place it there automatically when it fits, or use **Place inside a room** on the right afterwards. Dragging into another room also works. It can remain a standalone room. Only fully contained Pooja Rooms may overlap another room; crossings through walls and overlapping Pooja Rooms are rejected. Resize it to fit a smaller room.

Moving, rotating, duplicating or deleting a containing room includes its Pooja Room and contents, with Undo available. The 3D handoff includes separate Pooja walls and a separate floor; the containing room's base floor and applied floor finish exclude the Pooja floor area. Add a door from the furniture step to create an entrance.

## Cut or remove a wall

Choose **Cut / remove wall** above the plan. Click a wall, or choose it from the right-hand dropdown. The orange dot marks its start. Enter **Start from orange dot** (zero is allowed) and **Width to remove**, then click **Cut this part**. For an open room connection, use **Remove whole selected wall**. Walls divided by a room junction are selectable as separate segments.

Cuts go from floor to ceiling and remove shared walls for both rooms, including touching wall layers whose centre lines are slightly offset by grid placement. Saved cuts use this same rule when the plan is reopened. They are real gaps in the exported 3D walls. Move or delete doors and windows in the selected part first. **Restore** brings back a removed part; Undo/Redo and Command/Ctrl-Z also work. **Done cutting** returns to room editing. Cuts save with the plan and follow their owning room when moved, rotated, duplicated or deleted. Shrinking a room past an existing cut is rejected until the cut is restored.
