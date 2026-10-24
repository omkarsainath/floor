# Seven horses mural

Created with the built-in imagegen tool. Reference-inspired photographic mural with baked lighting; not sculpted horse geometry or a physically simulated backlight. The original wall-relief-horses selection now uses these assets. The scene lights switch selects lit/unlit textures. Composition is contained without stretching and cutouts share continuous UVs.

Files: seven-horses-lit.png, seven-horses-unlit.png.

Generation prompt:
Use case: product-mockup. Asset type: high-resolution wall mural texture for a Three.js interior viewer. Create a photorealistic ivory plaster bas-relief of exactly seven anatomically detailed galloping horses facing toward the viewer, flowing carved manes, muscular chests, lifted hooves, layered sculpted clouds underfoot. Large golden sun disc centered behind them, delicate sun rays and subtle clouds carved in the background. Warm 2700K concealed LED halos behind the horse silhouettes and sun, golden light spilling softly onto matte beige plaster, rich carved recess shadows and realistic stone microtexture. Straight-on orthographic front view, landscape aspect 16:9, artwork fills image edge to edge; entire seven horses and sun inside frame with small margins. This is the artwork texture itself, no room, furniture, frame, text, watermark, UI, labels, or icons. Match the luxurious warm sculptural appearance of the user's reference, not simplistic geometric horses.

Unlit edit prompt (lit asset supplied as edit target):
Use case: lighting-weather. Edit this exact wall mural texture to show all concealed LED lights switched OFF. Keep precisely the same seven horses, sun, clouds, camera, crop, composition and all geometry at the same pixel locations. Remove every golden emissive halo and golden backlight spill, leaving neutral ivory plaster in soft neutral ambient daylight with natural sculptural shadows. No other changes, no text.

## Raised geometry update
The artwork now uses CPU-displaced geometry (up to 14 cm, reduced for small areas), closed edge returns, and a rough MeshStandardMaterial. Seven-horses-depth.png is an AI-estimated height field, not measured sculpture geometry; it cannot reproduce undercuts. Lit/unlit artwork still contains baked lighting.

Depth asset created with built-in imagegen using seven-horses-unlit.png as the reference/edit target. Prompt:
Create a precisely registered grayscale HEIGHT MAP for displacement of this exact bas-relief. Preserve exact image dimensions, framing, horse poses and positions, all silhouettes and sun/cloud registration. Not a grayscale photograph: remove lighting, shadows, material grain and all color. Encode only physical distance outward from the wall: backing wall black (0.03), sun disc dark gray (0.22), background clouds gray (0.3), horses' torsos and necks light gray (0.65), protruding noses/chests/knees and nearest hooves near white (0.95). Model smooth rounded anatomical volumes, recessed gaps dark, manes intermediate height with flowing strands. Frontal orthographic scalar displacement map. No text, no legend, no gradient background, no perspective changes.
