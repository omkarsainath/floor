# Verify model dimensions and walk at your own height

Updated 2 October 2026. This workflow runs locally with the existing Three.js dependency. It needs no paid service, model or API key.

## Check dimensions numerically

1. Upload the original floor plan in the tracer. Review the detected wall overlay and the automatically applied printed measurements. Resolve uncertain readings, missing boundaries and conflicting dimensions there.
2. Open **View in 3D → Measurements**. Under **Applied plan dimensions**, compare **target**, **model**, **difference** and **Matched / Mismatch / Unverified**. These comparisons are recomputed from the current saved geometry, including bound wall references. A previous successful fit is not treated as permanent proof.
3. Enable **Show measurements on the model** to identify wall lengths and room floor areas. Model and Render use the same geometry: switching lighting does not resize anything.
4. Check the reference type. A printed 4.50 m clear width between inside faces must be compared with that bound span. It can legitimately differ from a wall's centreline length or the outside building width. Wall height is listed separately.
5. Check each room's inside-boundary polygon. A 4.4 m² target should produce 4.400 m², approximately **47.36 sq ft**. A room detection rectangle, room name or the overall building bounding box is not sufficient evidence of room area.

An applied 4.50 m target appears as 4.500 m. If its bound wall moves 0.10 m farther away, the display reports 4.600 m and **Mismatch: +100.000 mm**. Targets match within 0.000001 m or m²; this is a numeric geometry tolerance, not a claim that a scanned image or built wall is accurate to a micrometre. The room comparison no longer colours a difference of up to 5% as if it matched exactly.

**Unverified** means the target or reference is unavailable. **Estimated scale** and **Preview scale** must not be read as reliable building dimensions. Even **Matched** only proves agreement with the stored target: a wrong OCR reading, wrong endpoint or incorrectly traced room can still agree numerically. Check those against the original plan. The viewer does not silently repair contradictory references.

The object list measures visible rendered bounds in metres: global X width × global Z depth × height. Invisible click boxes are excluded. Rotation, handles, frames and an open door affect these bounds. They are not manufacturer dimensions or clear doorway opening measurements. Top-down furniture footprints generally cannot tell us object heights.

## Walk at 175 cm or another height

1. Set **Body (cm)** to your standing height, for example **175**.
2. Open **Walk settings**. Enter the distance from the floor to your eyes, for example **163 cm** if that is your measured value. Leaving it blank uses `body height × 0.93`, explicitly labelled **estimated**. Body height and eye height are different measurements; 175 cm body height defaults to 162.75 cm eye height.
3. Set **Body clearance width (cm)** as appropriate. Its initial 46 cm value is an editable estimate, not a measurement of the user.
4. Click **Walk**. The viewer searches for a clear starting point inside available room outlines. It keeps your eye height fixed while you look around or walk. **Reset View** finds a clear starting point again; **Orbit** returns to the overview.
5. Move with **arrow keys** or **WASD**, turn with **Q/E**, look up/down with **T/B**, or hold the **right mouse button** and drag to look. Click a door to open/close it. Furniture editing and catalog placement use Orbit.

Changing height adjusts the camera and standing clearance checks, never wall lengths, room areas or furniture scale. A saved measured eye height stays fixed when body height changes, unless it becomes invalid for a shorter body; then it resets to the labelled estimate. Preferences persist separately from the floor plan.

Walking stops at rendered walls, closed doors and furniture. Door components follow their actual current transforms, so opening the door can clear the passage. Collision uses full body height: lowering the eyes alone does not let a taller person pass under a low lintel. Hidden cutaway ceiling geometry also participates in headroom checks.

## What is fixed and what remains approximate

- Walk previously kept OrbitControls active, so looking/zooming could move the camera away from the chosen eye height. Walk now uses an independent camera orientation; OrbitControls is disabled and is not updated while walking.
- Movement previously followed keyboard repeat and passed through geometry. It now uses elapsed frame time, bounded steps and per-component collision checks to stop before thin walls.
- Body height, eye height and model scale are independent. The field of view is unchanged when height changes. Scale uncertainty remains visible in Walk.
- The Measurements panel refreshes while open, including after wall, catalog and chat edits. It reports current visible object bounds and numeric target differences.
- Catalog placement is cancelled on entering Walk. Starting placement or wall painting returns to Orbit, avoiding competing click/drag handlers.

The collision body is a standing vertical cylinder. Each rendered mesh is approximated by its transformed bounding box; this preserves thin rotated door leaves but can conservatively block some empty spaces around curved/concave furniture. It does not simulate shoulders, crouching, climbing, stairs, leaning, wheelchair access or pushing objects. An object/door moved into the person can block movement; use Reset View or Orbit to choose a clear position. Future instanced/skinned imported models need appropriate collision bounds.

The current ceiling is a single slab at the plan's maximum supplied wall height. It does not establish accurate clearance for multiple ceiling levels or a sloped roof. The viewer's walking floor is elevation 0. Wall/door/ceiling heights and object sizes need actual measurements when the plan does not print them; defaults cannot establish real headroom.

A normal monitor shows a perspective projection. Matching metre coordinates and eye height gives a dimensionally consistent viewpoint, but does not make the physical image on your screen life-size. Screen size, viewing distance and field of view still affect perception. This change does not add headset VR or head tracking.

## Verification

The automated cases cover fixed eye level during look/movement, manual and estimated eye levels, invalid values, parent transforms, thin-wall tunnelling, closed/open doors, full-height lintel checks, hidden ceilings, furniture and invisible helpers. Existing dimension tests include a 4.50 m span and 4.4 m² inside room applied jointly to geometry. Object-bound tests exclude invisible picking helpers and check rotated/scaled dimensions.

An isolated local Chrome check exercised the actual viewer controls, a measured 1.63 m eye level, body-height changes, walking, reset, both Model/Render modes, preference reload and a live +100 mm mismatch after editing a bound wall. It also verified door clicks and transitions between catalog placement and Walk. The same check loaded the previously scanned plan (25 walls, 6 rooms and 33 objects) and confirmed Walk could start and turn without changing eye height. These are software checks, not a site survey or ground-truth validation of that scan.

All **89 frontend tests pass**, and `npm run build` succeeds. Vite still reports the existing warning that the viewer bundle exceeds 500 kB; the production build is usable. No backend change or backend restart is needed for these viewer improvements.
