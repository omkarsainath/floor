# Sofa Factory catalogue photographs

Source: user-provided `SOFA .pdf`, 88 pages, PDF metadata title
`SOFA FACTORY BROCHURE NEW FINAL 07 11 2022.cdr`.

145 numbered product entries are included across 12 categories. Cover,
showroom, promotional and customization pages are not product entries.
Product serial numbers are not globally unique: stable IDs include category,
physical PDF page number and printed serial number. The PDF itself skips some
numbers and restarts the antique chair numbering; no missing product is invented.

WebP images are crops of rendered PDF pages, preserving the original photo,
PDF masks, orientation and multi-image product arrangements. They are not AI
substitutes. Source page and printed serial are recorded in
`src/generators/sofaFactoryCatalog.json`.

The 3D models are procedural approximations with measured dimensions when
available. Dimensions use inches × 0.0254; sets include additional placement
space for chairs/sofa components. Upholstery colours are estimated from photos.
Hidden geometry, fine carvings and fabric patterns are not reconstructed exactly.

Reimport from the repository root with Poppler and the project's Python/Pillow:

    mkdir -p /tmp/sofa-extract /tmp/sofa-pages
    pdftohtml -xml -hidden '/Users/apple/Downloads/SOFA .pdf' /tmp/sofa-extract/catalog.xml
    pdftoppm -f 11 -l 79 -r 108 -png '/Users/apple/Downloads/SOFA .pdf' /tmp/sofa-pages/page
    .venv311/bin/python scripts/import-sofa-catalog.py /tmp/sofa-extract/catalog.xml

The importer can fall back to embedded-image composition, but rendered page
crops are required to preserve PDF transparency masks exactly.

Sofa-bed products now have a reversible two-stage pull-out animation. The
`sofaBedExpanded` layout property restores the pose after reload. This mechanism
is an illustration: the brochure supplies closed-product photos, not engineering
or open-state references. Ordinary sofas do not receive this control.

The Wooden Cum Bed, L-Cum Bed Lounger and L-Cum Bed Corner upholstery uses
small fabric crops from their page 39 catalogue photos. Synchronous DataTextures
are stored in `src/generators/textures/` with source attribution, so catalogue
previews and saved models use the same fabric without an asynchronous image load.
These low-resolution swatches contain the original photographed shading; they
are not seamless, high-resolution manufacturer fabric scans. Wooden frame
profiles distinguish enclosed bases, horizontal rails, curved sides, upholstered
sides and spindle frames. The models remain reference-based approximations.
