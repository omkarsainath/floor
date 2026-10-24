# Wardrobe and loft layout editing

Select a wardrobe or standalone loft and choose **Edit wardrobe**. The laminate panel also has **Edit layout, dimensions & mirrors**. Dimensions are entered in centimetres and applied when the field is committed. Changes are saved to the existing project; the editor includes undo.

To remove a handle, select its section and set **Handle on this door → No handle** (below Hinge side). Choose **Show handle** to restore it. Drawer handles can be switched separately for each section; the independent loft has its own handle setting. Removing handles preserves door opening and mirrors, supports undo, and stays saved after reload. Existing projects keep handles by default.

- Body width, height, depth and elevation can be set numerically. Body height excludes an attached loft; total height is displayed separately. Depth is the cabinet body, excluding protruding fronts and handles.
- The loft has its own width, depth, height, door count, and left/centre/right alignment. It can be removed and re-added. Its back stays aligned with the body even when its depth differs.
- Each vertical section has its own width and front layout: a full-height door, door over drawers, drawers only, open shelves, dressing mirror over drawers, or shelves over drawers. Changing one section's width keeps the other widths unchanged; changing body width scales section widths proportionally.
- **Remove drawers · extend door to bottom** fills that section with a door. **Replace this door with drawers** creates a full drawer stack. Drawer count and mixed-layout drawer height are editable. Sections can be added and removed.
- Door mirrors can fit the door automatically or use measured width/height centred within the door. Oversized mirrors are rejected before changing the scene. Mirrors are attached to the moving door and reflect the live scene in Model and Render views.
- Select a wall and its side to attach the cabinet's back. Resizing its depth keeps the back flush with that wall face; its position is clamped to fit along the wall. Set **Free standing** to detach before rotating.

Closed doors, loft leaves and drawer fronts cover the cabinet frame with a 1 mm operating seam. Hinged fronts open exactly 90 degrees. These changes also apply to existing saved cabinets on reload. Intentionally open shelf and dressing sections remain open.

When placing a wardrobe or loft from the catalogue, its back automatically aligns to the nearest wall within 2.5 m. Corner placement includes the side wall thickness. Nearby units snap edge-to-edge with aligned backs; each keeps its own depth, height and base elevation. Placement uses closed cabinet dimensions, so an open door does not create a false gap. Loft width and base elevation are available before placement, and loft wall snapping can be disabled. The preview and click use the same calculation; overlapping or oversized placements are rejected with a message instead of changing dimensions. Automatic wall attachments are saved with the project.

The editor rebuilds cabinet geometry while retaining the selectable outer group, placement, open/closed state of retained fronts and existing per-part laminate choices. Saved `wardrobeConfig` data is copied through the existing project JSON import/export path. Existing models are unchanged until a structural field is edited; legacy layouts are converted into editable sections on that first edit.

Section and drawer IDs remain stable through width and count edits so finishes do not shift to neighbouring parts. Removed-part finishes remain in the project record for structural undo. Direct laminate edits continue to use the existing finish editor.

`wardrobeConfig.js` validates dimensions and calculates placement; `configuredWardrobe.js` builds editable geometry; `wardrobeEditing.js` validates and builds before changing the live object; `wardrobeStructureEditor.js` provides the controls. Mirror render targets are disposed alongside their material and recursive mirror rendering is bounded.

Run `node --test apps/frontend/tests/wardrobeStructure.test.js` for geometry, validation, animation, isolation, attachment and persistence checks. `node scripts/check-wardrobe-structure.mjs` exercises the actual viewer in an isolated Chrome profile, including live mirror pixels, all new controls, reload, laminate editing and mobile layout. Screenshots are saved as `/private/tmp/wardrobe-structure-*.png`.

`node --test apps/frontend/tests/cabinetPlacement.test.js` covers wall faces, corners, unequal adjacent cabinets, diagonal walls, elevated lofts, narrow front seams and the 90-degree opening limit. The browser check also exercises catalogue preview/click agreement, invalid overlaps and attachment persistence.
