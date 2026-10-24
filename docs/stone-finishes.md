# Lavina catalogue finishes

110 named granite and marble swatches were extracted from the user-supplied
`/Users/apple/Downloads/E-catalogue.pdf`, PDF pages 6–11. Each entry retains its
name, stone category, source page and local JPEG. Decorative frames, repeated
background labels and office photographs are excluded. The seven Tan Brown
finish demonstrations are not separate stone products in this collection.

Choose **Kitchen Accessories → Slab top · Granite & marble** for a searchable
named image picker. Apply to the entire editable slab or the selected section.
Selections save in each cabinet's `counterStone` field and participate in Undo.
Sink openings retain the stone material. Restore original slab top clears it.

Choose **Room Finishes → room → Flooring**, select a named image and press Apply
to save the floor. All room types share the stone collection.

The photographs are small printed catalogue swatches (approximately 450 × 250
pixels). They are not measured full-slab scans, seamless textures, or calibrated
material maps. Mirrored repetition reduces hard seams; texture width is assumed
to be 1.2 m. Rendering uses sRGB colour textures, nonmetallic polished stone and
scene lighting. Actual colour, grain scale, batch variation and reflections will
differ from a real installed slab. Exact matching needs calibrated high-resolution
slab photographs, measured sample dimensions and finish/lighting references.

Regenerate with `scripts/extract-stone-catalog.py` (PyMuPDF required). Focused
checks are in `stoneCatalog.test.js` and `scripts/check-stone-finishes.mjs`.
