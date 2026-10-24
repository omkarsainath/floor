No. 19 — Twin Wood Handle Corner Sofa

Source: user's SOFA .pdf, physical PDF page 18, printed page 09, upper product. No. 20 (blue Bali, lower image) and No. 38 are separate products and retain their existing generators.

Reference preparation

The page was rendered with Poppler at 2200 pixels tall. `reference-product.png` isolates the upper sofa; `reference-dimensions.png` isolates its table and identity. The table reads overall 110 × 110 inches, depth 34 inches, height 33 inches. Rendering the PDF larger does not increase the detail in its embedded photograph (543 × 190 pixels).

The visible reference has two equal seated wings at 90°, broad seat pads, four large back cushions and three smaller cushions at the corner, square exposed end arms, patterned outer arm faces, light wood stiles, dark vertical accents, a low upholstered base and short dark feet. The small corner cushions and exact seam positions are less clear than the overall silhouette.

Implementation

`apps/frontend/src/generators/twinWoodCorner19.js` is used only for `sf-sofas-p18-19`. It returns a standard Three.js Group with solid mesh geometry, ordinary catalogue identity, and the application's existing placement metadata. There is no photo plane or image-based rotation substitution. Orbit, selection, movement, rotation, measurements and walkthrough continue through the existing application paths.

Previously this ID used the generic corner branch, not a dedicated chaise branch. That branch guessed a 0.93 m seating depth, allocated a full-length main wing and shorter return, forced generic main seat subdivisions despite the bench profile, and treated the corner as an extra main back cushion. It could not reproduce the symmetric seating and cushion layout in this photograph. No. 19 now bypasses that branch entirely; other products are unaffected.

| Measurement | Catalogue | Generated default envelope |
| --- | --- | --- |
| X length | 110 in | 2.794 m |
| Z length | 110 in | 2.794 m |
| Height | 33 in | 0.8382 m |
| Each wing's outside depth | 34 in | 0.8636 m |

One corner base and one square corner seat are shared by the two wings. Wing bases stop at the end arms. Backrest rails meet at a butt joint. Each wing has a broad seat pad and two large bordered loose cushions; three smaller corner cushions are separate. Their oriented bounding boxes do not intersect; axis-aligned bounds alone would falsely reject the diagonal arrangement. The plain borders and crossing strips are actual cushion surface areas around inset fabric meshes. End arms have separate upholstered bodies, patterned outer panels, light wood stiles, dark accents and short feet. Rear and underside supports use plain matching materials.

Materials and limitations

- Plain taupe-gray woven upholstery, dark patterned fabric, light wood, dark trim and feet are separate materials. Rounded padded surfaces, subtle loft and fitted piping provide geometry detail.
- `pattern-source.png` is a 64 × 33 pixel unresized crop from No. 19's original embedded photo, bounds (411, 40, 475, 73). It remains stored losslessly in `textures/twin-wood-19.json` as source evidence, but is no longer tiled onto the sofa. The full product photograph is never mapped onto the model.
- The old photographic repeat has been removed. `twinWood19Upholstery.js` synthesizes a seamless dark woven approximation with an 0.8 m repeat and independent offsets for all seven cushions and both outer arms. Four quadrants on a large cushion share continuous UVs. The smaller corner cushions use one insert each, removing the previous miniature four-panel frames. Micro-weave retains the 0.12 m physical coordinates. Repeat size and weave are inferred, not manufacturer measurements.
- Hidden back construction, underside support placement, precise arm thickness, cushion loft, corner cushion angles and seams are inferred. The catalogue establishes the overall dimensions and visible design, not these engineering details. This is not a manufacturer-certified fabrication model or an exact photographic scan.

Review and verification

Open `/tests/twin-wood-19-preview.html` on the local frontend for a continuously orbitable live model, source comparison, six validation views and a GLB download. The six saved images below the canvas are review evidence, not the model viewer.

`node scripts/check-twin-wood-19.mjs` checks the bounding box, renders 36 views around a complete 360° orbit with nonblank-pixel assertions, captures catalogue-angle/front/rear/left/right/top images, exports GLB with embedded textures, reloads it with GLTFLoader, checks the reloaded envelope, and captures `glb-roundtrip.png`. The export converts procedural texture pixels into lossless embedded PNGs and converts micro-bump to tangent-space normals for glTF. It does not alter the application model's materials.

`node scripts/check-sofa-appearance.mjs --viewer --no19` loads a separate room in an isolated Chrome profile, verifies the dedicated cushions/arms and reflection environment, captures Model and Render views, and checks raycast selection, 10 cm movement, 45° rotation and Walk camera turning through the existing controls. It does not modify the user's local storage.

The four focused tests cover exact dimensions, one shared corner, equal seats, both backrests, cushion clearances, finite geometry, unit normals, required UV channels, textile physical scale and distinct panel offsets, closed base/back joins, placed-object identity, arbitrary yaw, non-default footprint sizing, and isolation from No. 20/38. Full frontend suite: 619 passed. Production build passed (existing large-bundle advisory).

Visual review includes `catalogue.png`, `front.png`, `rear.png`, `left.png`, `right.png`, and `top.png`; no obvious detached parts or cushion/backrest intersections were observed. Small upholstery seams are intentional. `validation.json` records measured bounds and mesh counts. The GLB is at `apps/frontend/public/catalog/sofa-factory/twin-wood-handle-19.glb`.

October 14 refinement

The before captures in `before/` were made from the existing dedicated No. 19 implementation before these edits. `comparison.html` compares identical camera poses, including the actual room viewer. The isolated review lighting/camera is retained; the after images also include the corrected contact pass and postprocessing antialiasing.

Actual code changes:

- `twinWoodCorner19.js`: thicker 20 cm bench pads above a lower base, deeper/reclined large back cushions, smaller separate corner pads, softer arm edges, closed rear base/back joins, fitted piping, darker matte taupe and separate wood/accent materials. Overall catalogue dimensions are enforced after padding loft. Internal cushion thicknesses, 8° recline, seams and arm dimensions are visual estimates.
- `twinWood19Upholstery.js`: rounded padded grids with bowed edges, a fuller middle, subtle edge gathers, compressed lower edges and supported seat undersides; seamless dark fabric rather than the conspicuously repeated source fragment.
- `furnitureContactPass.js` and `renderMode.js`: contact shadows in normal sofa viewing as well as Render mode. SSAO thresholds now convert metres to the camera's normalized depth range (previous constants effectively skipped small contacts at a 1000 m far plane). Render sun normal bias reduced from 25 mm to 3 mm; final antialiasing smooths offscreen-rendered edges. Authored room lights/materials and existing controls remain on their existing paths.
- Preview/export: same six cameras, full orbit check, embedded texture GLB with mipmapped baked micro-normal maps, and reload validation.

Visual review: both seated wings and backrests remain present, shared corner is counted once, the rear is closed, pads do not visibly intersect, and the object sits on its feet. The textile no longer repeats the same photographed rectangles. This remains a procedural reconstruction: the precise upholstery motif, sewing, hidden structure and foam deformation are not recoverable from this photograph. A manufacturer textile swatch/PBR scan and measured multi-angle photographs or a manufacturer mesh are needed for a faithful custom sculpt and exact fabric. Fine piping can still alias at distant views; this is not a claim of photographic identity.
