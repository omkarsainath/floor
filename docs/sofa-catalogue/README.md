# Catalogue sofas and photo-assisted 3D

The five sofa categories contain **75 products**: 38 sofas, 23 economic sofas, 3 recliners, 5 sofa beds and 6 wooden sofa sets. Their references are the original **SOFA .pdf**, physical pages 11–44. No. 19 remains a separate, dedicated model; No. 20 and No. 38 do not reuse it.

[Open the visual review](index.html) for the original product crops, before/after galleries and six views of each model. [Photo editor screenshot](upload/editor.png), [placed sofa after project reload](upload/placed-room.png), [example exported GLB](upload/photo-sofa.glb).

## What changed

- Re-read each sofa's dimension table. Added seating depth independently of the overall L-shaped footprint. One inch is 0.0254 metres throughout.
- Full corner sofas now use two seated runs and a single shared corner. Back rails meet at the corner; smaller corner pillows occupy deliberate positions rather than an extra full-size back cushion crossing the other run.
- Chaise products keep their extended seats and rear backs. Arm length follows seating depth instead of continuing to the end of the chaise. Economic No. 22 has backrests on both wings, as shown in its photograph, despite the lounger wording in its table.
- Separate sets preserve each component's listed width, depth and height before arrangement. Their catalogue-card footprint includes display spacing, not a manufacturer's overall set measurement. The pieces face inward.
- Product profiles distinguish visible seat divisions from nominal seating capacity. Broad backs, headrests, arm trays, timber frames, rolled arms, decorative inserts, patterned fabric and exposed legs remain product-specific.
- Softer foam geometry, bowed edges, thicker seats, surface-following seams and a closed rear/base connection replace flat cushion slabs and floating rear shells. Split back tiers share the same inclined plane.
- Fabric uses physical UV scale and fine matte weave. Decorative sample tiles preserve native source pixels, use mirrored edges and change phase between cushions. No entire product photograph is projected onto a sofa. No. 19 uses its own seamless woven approximation; No. 38 has separate bordered inserts.
- Existing contact-shadow rendering remains active in the viewer; the review and upload preview use the same ambient-occlusion pass plus floor shadows.
- Selecting a catalogue sofa exposes **Download selected sofa GLB**, including materials and embedded textures.

## Use the photo feature

1. Open **Catalog → Upload sofa photo → 3D** at the bottom of the catalogue.
2. Choose JPEG, PNG or WebP. The photo stays local. The app compares the image with catalogue references and suggests nearby visual styles; these are not guaranteed product identifications.
3. Check the construction reference and layout. Edit seat/back divisions, return side and colours. Alternatively, choose **Use this catalogue model unchanged** when that really is the desired product.
4. Enter overall width, depth, height and seating depth, choosing metres, centimetres, millimetres or inches. **Use selected catalogue dimensions** is an explicit shortcut. A photo alone never establishes scale.
5. Choose **Update 3D preview**, inspect it by continuous orbit, then **Place in room**. The existing move/rotate/selection/walkthrough controls apply. The editable model description and a small reference thumbnail survive local project reloads.
6. **Download GLB** exports actual meshes and embedded textures, not a picture viewer.

Changes invalidate the previous preview before placement/export. Invalid files, missing dimensions, invalid counts and impossible L-shaped footprints produce an inline explanation. A preview must be rebuilt after edits.

## Validation and limits

Validation completed on 15 October 2026: the full test suite passed **623/623** tests. After the final piping adjustment, the nine focused catalogue, upholstery and photo-model tests passed again; the 75-product browser render, photo upload/placement/reload/GLB check and production build also passed. The build retains Vite's large-bundle warning.

`after/render-results.json` records 75 renders and six inspection directions per product (450 views). The geometry regression verifies overall dimensions, floor contact, finite unit normals, both backrest wings, one shared corner, seat-cushion separation and individual set component dimensions. The browser upload check covers invalid file handling, reference retrieval, mandatory dimensions, unit conversion, editable layout, GLB dimension roundtrip, placement and saved-project reload. The existing No. 19 viewer check exercises selection, movement, 45° rotation and Walk mode.

These are **reference-based procedural reconstructions, not exact manufacturer scans**. The original catalogue cannot establish hidden framing, underside construction, foam compression, all small carvings, textile repeat size or material response under neutral light. Mirrored small textile samples can still have recognisable motifs; exact seamless fabric scans are needed to reproduce the printed cloth faithfully. Complex carved arms, tailored folds and recliner mechanisms would benefit from dedicated sculpted GLB meshes plus PBR fabric/wood scans. Sofa-bed/recliner hidden mechanics are illustrative, not engineering models.

Economic No. 02 lists its diwan width as 50 inches but omits depth and height. Both are provisionally 23 inches, explicitly recorded as inferred, using the catalogue's standalone diwan as a starting point. Uploaded separate sets use the chosen reference's component proportions; changing only overall dimensions does not establish each component's exact size.

## Reproduce the checks

- `npm test`
- `npm run build`
- `node scripts/check-sofa-appearance.mjs --all --audit` (frontend on localhost:5173)
- `node scripts/check-sofa-photo.mjs`
- `node scripts/check-sofa-appearance.mjs --viewer --no19`

The PDF crops and dimension provenance are recorded in `reference/manifest.json`. `scripts/sofa-dimension-audit.json` preserves reviewed measurements when the raw importer is rerun. The renderer uses `sofaDesigns.js`, `sofaFactory.js`, `sofaSharedCorner.js`, `sofaSetLayout.js`, `sofaUpholstery.js` and `sofaSurface.js`. Photo retrieval is isolated in `sofaPhotoAnalysis.js`; validated model records and the editor are in `photoSofa.js` and `sofaPhotoPanel.js`.
