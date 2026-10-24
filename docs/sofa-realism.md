Sofa catalogue reconstruction

No. 19 now has a dedicated measured reconstruction and GLB export. See [its reference audit and validation](sofa-no19/README.md); this supersedes the generic corner construction described below for that product only.

The 75 sofa entries in the supplied SOFA .pdf now have explicit product construction records in sofaDesigns.js. The photographs were reviewed individually for layout, cushions, arms, headrests, frame type, contrasting finishes and visible decorative details. The table below records those observations. It describes the reference; each generated model is an approximation of those features.

The pale L-Cum Bed Lounger uses a continuous left chaise and a bench seat, four original floral back cushions, four raised headrests, and the right arm's wooden tray and open side shelf. It no longer uses a generic L-shaped arrangement of separate chairs. Corner sofas have joined bases with only two outside arms. Right-hand chaises, separate 3+2 and 3+1+1 sets, the extra diwan and open timber frames have separate construction paths.

Upholstery swatches are extracted from the corresponding catalogue photographs by scripts/extract-sofa-upholstery.py. Prints remain at their actual source resolution; there is no invented high-resolution claim. Twenty source swatches cover patterned products. Patchwork patterns are represented separately, rather than borrowing another sofa's flowers. Physical-scale fabric weave, roughness, cushion loft, recessed tufts, fitted piping, and restrained wood varnish add surface detail. The older generated floral asset is not used by these catalogue models.

The normal viewer now has a neutral reflection environment. The 3D Model / 3D Render switch is at the bottom centre so the top walk toolbar cannot cover it. Render mode adds contact shading and its dedicated light rig. Saved product identifiers and placement widths/depths remain compatible. Sofa heights use the catalogue value; the Viva table was corrected to its own 82/60 × 35 × 37 inch set measurements.

These are editable procedural reconstructions, not manufacturer scans. Low-resolution single-view photographs cannot establish exact fabric repeats, hidden construction, rear geometry or measured contours. Small carved motifs, intricate stitching, fabric drape and bed mechanisms remain approximations. Estimated catalogue dimensions remain labelled as estimates in the catalogue. A photographic match from every angle would require detailed multi-view reference or manufacturer 3D assets.

Verification and review

- npm test: 615 tests passed.
- npm run build: passes; Vite reports the existing large viewer bundle warning.
- node scripts/check-sofa-appearance.mjs --all: renders all 75 products in an isolated Chrome profile and checks browser/shader errors.
- node scripts/check-sofa-appearance.mjs --viewer: checks the actual room viewer, its material environment, the lounger details and unobstructed Render button, then captures both modes.
- /tests/sofa-upholstery-preview.html: six representative photo/model comparisons. Add ?page=1 through ?page=5 to review all 75.
- Browser screenshots and metrics are written to /private/tmp/sofa-review; they are not production assets.

Product reference audit

| Product | PDF page | Layout | Visible reference details |
| --- | --- | --- | --- |
| Butterfly Corner Sofa · 1 | 11 | corner | Beige button backs, rolled arms, dark carved end inserts and patterned corner backs. |
| Art Design Corner Sofa · 2 | 11 | corner | Ivory button cushions, chocolate corner pads, wood arm outlines and vertical seat flutes. |
| Camel Back Sofa 3 + 2 · 3 | 11 | set | Teal separate three and two seat sofas, square padded backs and metal arm badges. |
| Fountain Corner Sofa · 4 | 12 | corner | Blue velvet corner, single-row button backs, fluted seats and pale hooked arm inlays. |
| Ghana Corner Sofa · 5 | 12 | corner | Mustard yellow, horizontal brown back slots and glossy brown bands on rolled arms. |
| Cuba Corner Sofa · 6 | 13 | corner | Brown straight arms, inset lumbar pads, pale corner pads and small arm emblems. |
| Vintage-2 Corner Sofa · 7 | 13 | corner | Grey two-tier channel backs, dark scatter cushions, timber trays on low arms. |
| Capetown Sofa 3 + 2 · 8 | 13 | set | Taupe high curved arms with silver swooping trim, buttoned lumbar panels and metal feet. |
| Camel Back Corner Sofa · 9 | 14 | corner | Cognac square-grid back and seat panels, boxed arms and slim brass feet. |
| Fitting Corner Sofa · 10 | 14 | corner | Low grey diamond back panels below broad separate adjustable headrests. |
| Italian Sofa 3 + 2 · 11 | 14 | set | Red brown leather, three horizontal back bolsters, rolled padded arms and dark plinth. |
| Peacock Corner Sofa · 12 | 15 | corner | Rust velvet, buttons above gathered channels, squared arms with slim metallic edges. |
| Red Fort Corner Sofa · 13 | 15 | corner | Terracotta cushions, pale curved outer frame, patterned corner and tapered gold feet. |
| Capetown Corner Sofa · 14 | 16 | corner | Black tufted lower backs with broad upper cushions, silver curved arm trim. |
| Gloria Corner Sofa · 15 | 16 | corner | Brown high backs, ribbed inset lumbar pads and champagne swept arm inserts. |
| Lisa Corner Sofa · 16 | 17 | corner | White tall channel backs, gold outlined arms, slim feet and leaf corner motif. |
| Atlantic Corner Sofa · 17 | 17 | corner | Grey split backs with buttoned lumbar row, timber swept side surround and low base. |
| J Sofa 3 + 2 · 18 | 17 | set | Chocolate separate sofas, raised track arms, inset arm outlines and small matching pillows. |
| Twin Wood Handle Corner Sofa · 19 | 18 | corner | Pale brown seat benches, dark woven back inserts and twin vertical wood arm posts. |
| Bali Corner Sofa · 20 | 18 | corner | Turquoise upper backs, quilted lumbar panels and pale curved end inserts. |
| Vintage Corner Sofa · 21 | 19 | corner | Grey horizontal split backs with vertical lower flutes, timber arm edging and dark tapered feet. |
| Watch Fitting Sofa 3 + 2 · 22 | 19 | set | Aqua upholstered sets, flip-up headrests, metallic rectangular arm outlines and thin feet. |
| Rio Corner Sofa · 23 | 19 | corner | Pale blue loose backs, diamond quilted side panels, timber arm caps and tapered feet. |
| Innova Sofa 3 + 1 + 1 · 24 | 20 | set | Cream three-seat and two armchairs, padded arm pillows and broad segmented high backs. |
| Gtc Corner Sofa · 25 | 20 | corner | Brown fluted base and lumbar panels, brass ribbed arm fronts and raised head cushions. |
| Titanic Corner Sofa · 26 | 21 | corner | Pale loose backs and geometric pillows, rounded sloped arms with timber caps. |
| Craft Sofa 3 Seater · 27 | 21 | straight | Compact beige two-cushion sofa with two turquoise pillows and angled metal legs. |
| 002 Model Corner Sofa · 28 | 21 | corner | Mauve button backs, straight padded arms and pale inset arm outlines. |
| Rinkle Corner Sofa · 29 | 22 | corner | Emerald backs above gathered lumbar pads, ribbed side arms and gold piping. |
| Rome Corner Sofa · 30 | 22 | corner | Charcoal head pillows and channelled lower back, fluted arms framed by timber. |
| Chester Corner Sofa · 31 | 23 | corner | Low Chesterfield diamond upholstery and deep rolled arms, with small round timber feet. |
| Voltas Corner Sofa · 32 | 23 | corner | Grey multi-row button backs, quilted side panels and slender angular brass feet. |
| Sky Golden Corner Sofa · 33 | 23 | corner | Forest green simple backs with uninterrupted gold horizontal bands. |
| Craft Model Sofa 3 + 2 · 34 | 24 | set | Coral three and two seat sets with large loose angled scatter cushions. |
| Deluxe Lounger Sofa · 35 | 24 | chaise | Dark teal frame around taupe long benches, raised dark headrests and patchwork scatter pillows. |
| Royal Corner Sofa · 36 | 25 | corner | Forest green broad backs, fluted arm panels and fine brass accents. |
| Viva Sofa 3 + 2 · 37 | 25 | set | Sage separate sofas with curled arms, wooden side slots and tapered timber feet. |
| Twin Wood 2 Handle Corner Sofa · 38 | 25 | corner | Brown corner with cream textured back strips and two gold bands on timber arm fronts. |
| E Fountain Corner Sofa · 01 | 26 | corner | Olive loose rectangular backs, black hook-shaped end inlays and short silver feet. |
| 3 + 2 + Diwan Sofa · 02 | 26 | set | Blue grey three-seat, two-seat and separate backless diwan with rose-print cushions. |
| Piping Lounger Sofa · 03 | 27 | chaise | Taupe long bench and left chaise, black and cream floral backs with pale piping. |
| Carvin Corner Sofa · 04 | 27 | corner | Tan buttoned back cushions and tall narrow arms with black front insert strips. |
| Laser Sofa 3 + 2 · 05 | 27 | set | Blue quilted backs, low waved arms and cream perforated arm inserts. |
| Orma Corner Sofa · 06 | 28 | corner | Taupe bench seats, cream side arms and black botanical back upholstery. |
| Golden Piping Sofa 3 + 2 · 07 | 28 | set | Ivory single bench and continuous fixed back, broad square arms and gold feet. |
| Flort Sofa 3 + 2 · 08 | 29 | set | Black frame around cream seat benches and dark leaf-print loose backs. |
| Fly Lounger Corner Sofa · 09 | 29 | chaise | Right-hand teal chaise, pale frame, green feather-print pillows and small head pads. |
| Air Corner Sofa · 10 | 29 | corner | Blue benches in a cream frame, dark branching back fabric and diamond centre pillow. |
| Deco Sofa 3 + 2 · 11 | 30 | set | Navy padded sets, horizontal head pillows and tall pale pierced arm-front inserts. |
| Silver Corner Sofa · 12 | 30 | corner | Champagne cushions, fluted seat fronts and silver-edged scroll arms. |
| Oaks Corner Sofa · 13 | 31 | corner | Dark frame and cream seat benches, dark botanical backs and one pale centre cushion. |
| Cum Bed Lounger Sofa · 14 | 31 | chaise | Ochre low sleeper base and broad left chaise with brown floral loose backs. |
| Seven Star Sofa · 15 | 31 | corner | Dark blue upholstery with contrasting cream L-shaped arm outlines and very low feet. |
| Golden Piping Lounger Sofa · 16 | 32 | chaise | Right chaise, taupe diamond-quilted back and side panels with slender gold feet. |
| Twist Corner Sofa · 17 | 32 | corner | Burgundy split seat cushions, soft backs and pale vertical arm-front accents. |
| Star Sofa 3 + 2 · 18 | 33 | set | Grey continuous seat and back, softly sloped arms, diamond pillows and timber feet. |
| Office Sofa 3 + 2 · 19 | 33 | set | Compact continuous bench sofas, square low arms and all-over mottled woven fabric. |
| Casa Corner Sofa · 20 | 33 | corner | Rose pink benches with cream outlines and multicolour leaf-print backs. |
| Library Corner Sofa · 21 | 34 | corner | Navy sleeper benches and sloped side cheeks with pale botanical backs and a diamond pillow. |
| E-L Cum Bed Sofa · 22 | 34 | chaise | Pale patterned seats enclosed by brown borders, multicolour back pillows and a left return. |
| Diwan · 23 | 35 | daybed | Backless black diwan with two tall padded end bolsters and short silver legs. |
| Burfi Recliner Sofa 3 + 1 + 1 · 01 | 37 | set | Grey reclining three-seat and chairs, three padded back tiers and thick pillow arms. |
| H - Pattern Recliner Sofa 3 + 1 + 1 · 02 | 37 | set | Tan leather recliners, H-shaped segmented back panels and padded footrests. |
| Single Seater Recliner · 03 | 37 | straight | Single orange recliner with ivory piping, crossed side seams and cream headrest stripes. |
| L-Cum Bed Lounger · 01 | 39 | chaise | Pale left chaise sleeper, long bench, three floral scatter backs plus one chaise back, raised headrests, right arm tray and open shelf. |
| L - Cum Bed Corner · 02 | 39 | corner | Dark frame around cream bench cushions, geometric cream and charcoal back pillows and timber arm ends. |
| Wooden Cum Bed · 03 | 39 | straight | Black enclosed timber frame, olive bench, three cream and ochre floral back cushions. |
| 3 Fold Cum Bed Spider · 04 | 40 | straight | Teal three-fold sleeper, single bench, gathered back fabric and two matching pillows. |
| 3 Fold Cum Bed Magnet · 05 | 40 | straight | Rust three-fold sleeper, diamond back upholstery, two cushions and vertical base gathers. |
| Aster Pattern Sofa 3 + 1 + 1 · 01 | 43 | set | Cream loose cushions, open timber base and looping side supports with angled legs. |
| Teak Thapi Sofa 3 + 2 + 1 · 02 | 43 | set | Grey seat and back pads, exposed dark timber rails, vertical side spindles and square legs. |
| Fish Pattern Sofa 3 + 2 + 1 · 03 | 43 | set | Taupe pads, dark open timber frame and curved fish-shaped side arm supports. |
| Box Pattern Sofa 3 + 2 + 1 + 1 · 04 | 44 | set | Brown cushions with thick wooden box arms formed from three horizontal rails, four separate components. |
| Box Pattern Sofa 3 + 1 + 1 · 05 | 44 | set | Cream cushions, dark horizontal timber box rails, low enclosed front base. |
| Classic Sofa 3 + 1 + 1 · 06 | 44 | set | Grey loose pads in a dark timber frame with upholstered side infills and exposed legs. |

Archived generated asset provenance (unused by the catalogue)

Generated asset: `apps/frontend/public/textures/sofas/floral-linen-v2.png` (1254 × 1254). Created with the built-in imagegen tool using the imagegen skill. No external API key or CLI fallback was used. The original output remains at `/Users/apple/.codex/generated_images/01a12f24-e605-7a40-9c9b-c9c8ac8ca262/exec-795696d9-5e35-44cb-b933-af9ac06fdc9d.png`.

Final generation prompt:

> Create one square 1024x1024 physically based material base-color texture for floral sofa upholstery in a Three.js interior app. Photorealistic-natural macro textile sample photographed perfectly straight-on flat orthographic, edge-to-edge fabric. Warm ivory cream woven linen background with scattered small vintage botanical flower clusters in muted tobacco brown, ochre gold, taupe and olive green. About 7 flower clusters across the tile, varied orientations, loosely scattered with cream negative space. Authentic printed cotton linen upholstery, crisp fine individual threads visible, restrained realistic textile colors. Absolutely flat even diffuse lighting, NO shadows, NO folds, NO cushion shape, NO perspective, NO borders, NO labels or text. Seamless repeating surface if possible. This is a new reference-inspired floral textile to replace a blurry 76x57 pixel sofa upholstery crop, NOT a picture of furniture. Save the generated asset so it can be copied into the local project.
