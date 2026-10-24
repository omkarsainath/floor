# Wardrobe laminate editing

Select an existing or newly placed wardrobe, then choose **🎨 Laminates**. Select an individual door, loft door, drawer front, left/right side, top, plinth, outside back or dressing counter/surround. You can also click a panel or its handle while the editor is open. Mirror glass and hardware remain separate.

Choose a swatch to apply it immediately. The scope selector can apply a finish to all main doors, all loft doors, both sides or all exterior panels. Grain rotation, visual pattern scale, undo and reset are included. Changes save in the existing project object as `wardrobeFinishes` and survive local saving, JSON export/import and object reconstruction. Closing the editor restores the normal move/resize/open controls. **Inspect close-up · render lighting** enables the existing 3D Render mode and frames the cabinet in Orbit mode; in Walk mode it changes lighting only.

Visible swatch pixels are reused immediately at their intrinsic size, independently of the thumbnail's CSS dimensions. The existing material and texture slots stay in place; when image dimensions change, the colour texture is replaced and its previous GPU storage is released. This avoids stale finishes caused by WebGL2's immutable texture dimensions. A finish applies to both faces of moving wardrobe/loft doors, so it remains visible when a door is open. Carcass interiors and drawer linings stay separate. Unloaded swatches show their sampled colour immediately while the image loads; stale downloads cannot overwrite a newer selection. The swatch list retains its scroll position and focus during edits.

## Source and coverage

The input was `/Users/apple/Downloads/Greenlam Edition 2023-2025.pdf`. Its cover and metadata identify the collection as **2025–2027**. The original PDF is copied to `apps/frontend/public/catalog/greenlam/source.pdf`, and the editor links directly to each swatch and its collection's application notes. SHA-256: `70a9da00ae63ae87480a4c6a3a4d911dbb13b220f994f7218edc3d06ce801a61`.

There are **132 curated swatches**, not the complete design index, from PDF spreads 10–19, 22, 25, 30, 33–36. Collections include Aran, Barrel, Canyon, AFX, Unicore Suede/HD Gloss, Satin, HD Gloss, VRB, Synchro elm/ash and Super Gloss. Each entry records design code, finish code, name, PDF page, printed page and exact crop coordinates. Images are inset crops of the actual swatches, excluding labels and QR codes. Product names and codes were checked against the rendered pages; OCR was only a reading aid.

Aran (10), Barrel (12), Canyon (14), Satin (18), HD Gloss (25), VRB (30), Synchro (33) and Super Gloss (34) explicitly list wardrobe use. Unicore (17) lists cabinets, shelves, doors and furniture. AFX (16) describes its surface properties but has no wardrobe application statement; the editor displays this distinction. Sheet-size checks are advisory, based on the listed collection dimensions and panel/grain orientation. They do not validate availability of every design in every sheet size.

## Appearance and limits

Panel materials use cropped swatches, aspect-preserving UVs, finish-specific roughness/clearcoat, subtle micro-bump, colour-matched edge bands and local render lighting. Solid laminate remains nonmetallic. Geometry includes softened edges, recessed plinth, pull stand-offs and hinge plates, along with existing working doors, tracks, drawers, rails and shelves. Finishes do not change furniture geometry or animation pivots.

The scanned catalogue supplies neither calibrated full-sheet textures nor measured PBR maps. Screen colour, pattern scale, gloss and embossed depth are visual approximations. The pattern-scale slider changes the preview, not the product's manufactured pattern. Final material selection should use a physical sample. This feature is an interior visualization, not a fabrication drawing.

## Development

Keep the viewer's module entry URL unversioned (`/src/main.js`); Vite handles cache invalidation. A manual `?v=...` on the entry propagates to direct imports and can instantiate a second finish module with a separate material registry. The browser regression checks the highlighted mesh and rendered pixels in the actual viewer as well as the isolated studio.

- `scripts/import-greenlam-catalog.py`: reproducible swatch manifest/crops, requires Pillow and Poppler.
- `src/materials/greenlam.js` and `greenlamCatalog.json`: source-backed catalogue and material factory.
- `src/generators/wardrobeFinishes.js`: stable part IDs, isolated material changes and normalization of saved data.
- `src/ui/wardrobeFinishEditor.js`: part controls, scope, search, undo, application/source details.
- `tests/wardrobe-finishes-preview.html`: interactive studio fixture; run with the Vite development server.

Run `npm test` and `npm run build`. `node scripts/check-wardrobe-finishes.mjs` starts its own temporary Vite server and isolated Chrome profile on macOS. It checks real viewer integration, reload persistence, keyboard protection, independent parts, grouped edits, undo, grain changes, image loading, mobile layout and close-up rendering. Screenshots are saved under `/private/tmp/greenlam-*.png`. It never changes the user's browser storage.
