# Code review and improvement priorities

Reviewed: 19 September 2026. Companion: [zero-budget integration plan](zero-budget-3d-plan.md).

The best next investment is reliable geometry and saved project state, followed by a small GLB furniture catalog. The project already has useful building blocks; it does not need a framework rewrite or paid AI to reach a usable first version.

## Scope and evidence

This is a repository-wide source and architecture review of the frontend, Python backend, database SQL, training/evaluation utilities, PDF extractor, configuration, and example layout formats. Binary model weights and the full image/label datasets were not audited for accuracy or provenance. Credentials in `.env` were not read. Existing edits in `apps/frontend/tracer.html`, `.vscode/`, and the generated dataset YAML were preserved.

Validation performed without starting services or training:

- Python AST parsing passed for 22 source files, including empty placeholders.
- JavaScript syntax checking passed for all nine frontend `.js` modules. This does not verify browser rendering or inline tracer JavaScript.
- Direct execution of `jsonLoader.js`, using an in-memory module and mocked fetch, reproduced furniture removal, removal of a door without confidence, loss of wall metadata, and rescaling a 10-unit wall to 20 units.
- The same loader accepted an invalid coordinate as zero.
- An isolated execution of the DB wall deduplication function retained an automatic row over its corrected duplicate when supplied in the order produced by the current SQL.
- `package.json`, `layout.schema.json`, and `constants.json` are empty, invalid JSON documents. The sole backend test file is empty.

No end-to-end browser, MySQL, external AI, model-accuracy, or GPU benchmark was run. Findings below distinguish demonstrated behavior from conclusions based on source inspection; syntax success is not an application health check.

## What to keep

- `wall_ai.py` provides local OpenCV detection and optional YOLO inference. Manual tracing can remain useful when either detector fails.
- The frontend already separates scene setup, loading, controls, and geometry generators. Extend those boundaries.
- Procedural doors support hinges and interaction; procedural floors provide textures without purchased assets.
- The DB uses parameterized values and connection-level commit/rollback. Retain these practices while widening transaction boundaries for complete edits.
- The trainer already has weight backups, atomic file replacement, and inference-cache invalidation. These are useful once model identity and evaluation are corrected.
- The tracer offers manual scale calibration. Make that measurement authoritative throughout import, editing, and export.

## Prioritized findings

P0 means address before more training or exposing the service. P1 means address before the asset-library milestone. P2 means follow after the core workflow works.

### R1 — P0: different trainers can overwrite the same production model

Evidence: [auto_trainer.py](../apps/backend/src/auto_trainer.py), `COMBINED_WEIGHTS`, `PRODUCTION_WEIGHTS`, `generate_labels_for_model`, and `_promote_weights`; [train_server.py](../apps/backend/src/train_server.py), detection branches.

Wall, door, and window/glass training jobs all promote into `models/best.pt`. Inference assumes the combined model has door class 0, wall class 1, and window class 2. Door training uses a one-class dataset; glass training uses five classes, while wall labels are written with class 0. A successful specialized retrain can replace the combined model with an incompatible class map. The configured external wall `data.yaml` is also missing in this checkout.

Fix: temporarily disable all automatic training triggers. Choose one explicit combined-model class map and dataset, or give genuinely separate models separate paths. Validate class names and count before promotion. Store model hash, class map, training configuration, and evaluation split together. Updating three configuration variables to one path is insufficient.

Acceptance: incompatible weights are rejected before replacing the active file; each inference class resolves from the model manifest; detection still works after a controlled promotion and rollback.

### R2 — P0: validation data is also training data

Evidence: [auto_trainer.py](../apps/backend/src/auto_trainer.py), `_build_data_yaml`, `_should_promote`, `_run_training`; [db.py](../apps/backend/src/db.py), seeded production scores.

The auto-trainer sets `train` and `val` to the same image directory. It compares the resulting score against a historical baseline that may describe another dataset or model. This cannot establish improvement on unseen plans. Auto-generated and AI-corrected annotations can also become training labels without human review. This finding concerns the auto-trainer; some standalone scripts do use separate splits.

Fix: freeze train/validation/test manifests grouped by original floor plan so copies and augmentations cannot cross splits. Use human-reviewed labels. Compare incumbent and candidate on the exact same validation manifest and preprocessing. Track per-class precision/recall, mAP50–95, wall connectivity, and opening placement. Do not treat ADK confidence-count summaries as accuracy measurements.

Acceptance: no source-plan overlap between splits; promotion records both comparable evaluations; an unreviewed upload cannot enter the approved training set.

### R3 — P0: local API exposure and request validation need boundaries

Evidence: [train_server.py](../apps/backend/src/train_server.py), `Handler`, `resolve_image_path`, and `main`.

The service binds to `0.0.0.0`, returns wildcard CORS headers, accepts mutation requests without authentication, reads the supplied content length without a size cap, and accepts caller-supplied image paths without containment checks. JSON parsing occurs before endpoint exception handling. Detection and external AI calls run inside a single-threaded `HTTPServer` request.

Fix for the local MVP: bind to loopback, allow only the frontend origin, enforce JSON/image size and dimension limits, validate all payloads, and reject paths outside an upload directory. Prefer upload IDs over paths. Return structured 400/413/404/503 errors. Move expensive inference into one bounded worker with request IDs, timeouts, and status polling. Add authentication and per-project authorization before any remote deployment; CORS alone is not authentication.

Acceptance: malformed JSON produces a response rather than a dropped connection; traversal input is rejected; oversized images are rejected; a long detection does not prevent a status request.

### R4 — P1: import paths change project meaning

Evidence: [jsonLoader.js](../apps/frontend/src/loaders/jsonLoader.js), `validateLayout`, `dedupeObjects`, `limitObjects`, `normalizeLayout`; [main.js](../apps/frontend/src/main.js), `initLayout`; [tracer.html](../apps/frontend/tracer.html), `generateJSON`.

File loading retains only doors, windows, stairs, and lifts. A sofa with 99% confidence is discarded. A manually traced door without a confidence field is treated as confidence 0 and discarded. Object counts are silently capped. Every file-loaded plan is fitted to a 20-unit span even if already calibrated. `validateWall` drops `wall_type`, and layout validation drops scale metadata. Local-storage loading bypasses this entire path. The same saved plan therefore behaves differently depending on how it is opened.

Fix: one versioned import/validation pipeline for files, tracer, DB, and local storage. Preserve measured meters, stable IDs, semantic class, provenance, and asset references. Separate filtering raw detector proposals from loading accepted project objects. Fit the camera to the plan instead of resizing the plan. Make visibility limits explicit UI choices.

Acceptance: a 10 m wall stays 10 m; a sofa and manual door survive save/reload; file and tracer imports produce equivalent project data.

### R5 — P1: no effective shared data contract

Evidence: empty [layout.schema.json](../apps/backend/schemas/layout.schema.json), [constants.json](../apps/shared/constants.json), and [validate_json.py](../scripts/validate_json.py); [layout.sample.json](../apps/shared/layout.sample.json); [jsonLoader.js](../apps/frontend/src/loaders/jsonLoader.js), `ensureNumber` and `validatePoint`.

The shared sample uses polygon/array coordinates while the viewer expects point objects. Other outputs contain detector boxes or different metadata. Invalid coordinates silently become zero. This will become more damaging once physical asset dimensions and attachment points are introduced.

Fix: implement one canonical schema with explicit units, coordinates, project version, and separate rooms/walls/openings/objects. Keep legacy adapters at the import boundary. Reject non-finite coordinates, duplicate IDs, negative dimensions, zero-length walls, and invalid polygons with field-level messages.

Acceptance: all committed canonical fixtures validate; each supported legacy format has a named adapter; malformed input cannot silently render as a different plan.

### R6 — P1: floors and walls use opposite plan-Y directions

Evidence: [floor.js](../apps/frontend/src/generators/floor.js), `createFloor`; [wall.js](../apps/frontend/src/generators/wall.js), `createWall`.

The floor builds XY geometry and rotates it by −π/2 around X, mapping plan Y to negative world Z. Walls place plan Y directly into positive Z. By the rotation math, an asymmetric floor is reflected relative to its walls; a centered rectangle can conceal this. This is a source-level geometry finding, not a browser screenshot verification.

Fix: implement a shared plan-to-world transform and use it for floors, walls, ceilings, objects, openings, and camera targets. Verify winding/normals after the change.

Acceptance: an asymmetric L-shaped room, with a marked corner and doorway, aligns in both 2D and 3D.

### R7 — P1: wall openings and object dimensions are disconnected

Evidence: [main.js](../apps/frontend/src/main.js), `extendWalls`, `carveWalls`, and lintel generation; [object.js](../apps/frontend/src/generators/object.js), door/window branches; [ceiling.js](../apps/frontend/src/generators/ceiling.js).

Opening carving is axis-aligned and driven by boxes; door placement separately snaps to a nearest wall. Lintels use fixed wall/door/window heights, while door geometry derives its height from box dimensions. These paths can disagree. Walls are extended with fixed heuristics, and the ceiling is one bounding rectangle that fills concavities and courtyards.

Fix: represent each opening by `wallId`, distance along that wall, width, sill, and height. Derive both opening mesh segments and fitted door/window geometry from that record. Project into arbitrary wall directions. Use room/building outlines for floors and ceilings. Keep procedural openings while importing decorative furniture.

Acceptance: a rotated wall, two adjacent openings, and a nonstandard-height door render without extra gaps or intersecting lintels.

### R8 — P1: scene edits are not saved project edits

Evidence: [chatPanel.js](../apps/frontend/src/ai/chatPanel.js), `addObjectToScene`, `removeObjectFromScene`, and material changes; [main.js](../apps/frontend/src/main.js), `layoutRef`.

Chat actions change Three.js meshes but do not update `layoutRef.current` or saved JSON. Added furniture disappears on reload and later chat requests see stale state. Removal iterates and mutates `scene.children`, potentially skipping adjacent matches. Removed meshes and replaced materials are not disposed.

Fix: introduce a small project store and ID-based commands for add/move/rotate/remove/material changes. Persist commands or snapshots and support undo/redo. Render from state. Maintain an object-ID-to-scene-root map and explicit geometry/material ownership for cleanup.

Acceptance: add, rotate, delete, undo, export, and reload preserve the same project; repeated replacement releases instance-owned resources without breaking shared assets.

### R9 — P1: chat inserts untrusted text as HTML

Evidence: [chatPanel.js](../apps/frontend/src/ai/chatPanel.js), `addMessage`, assigns both user/model messages to `innerHTML`.

Fix: use `textContent` with `white-space: pre-wrap`; build status badges as separate elements. Validate action types, IDs, coordinates, dimensions, and colors before applying them. Preview proposed edits through the same command system used by manual controls.

Acceptance: HTML-like input appears literally; invalid actions leave the project unchanged; valid actions can be undone.

### R10 — P1: correction persistence can discard the correction

Evidence: [db.py](../apps/backend/src/db.py), `get_data_by_floor_plan_id`, `get_best_data_for_image`, and `_dedupe_*`; [train_server.py](../apps/backend/src/train_server.py), `/api/save-corrections` and `_apply_correction`.

`ORDER BY FIELD(source, 'corrected', 'manual', 'auto') DESC` puts automatic rows first, while deduplication keeps the first matching row. The isolated check reproduced the automatic row winning. Object-only corrections do not qualify for the current correction lookup. Door deduplication also omits saved swing metadata. Saving corrections appends rows instead of replacing a project revision, and record mutation plus correction logging use separate transactions.

Fix: explicit source priority, stable entity IDs, project revisions, atomic update-plus-history transactions, object-aware lookup, and preserved swing fields. Apply deletion tombstones when merging later detections so deleted proposals do not reappear. Make repeated saves idempotent.

Acceptance: a corrected wall wins; door swing and object-only edits reload; a deleted object stays deleted after detection; repeated save does not multiply rows.

### R11 — P1: similarity is used as image identity

Evidence: [embeddings.py](../apps/backend/src/embeddings.py), extraction/fallback and model cache; [train_server.py](../apps/backend/src/train_server.py), embedding lookup; [db.py](../apps/backend/src/db.py), similarity scan.

Similarity ≥0.97 does not prove that two plans are the same image with the same pixel coordinates. Stored embeddings lack a model/preprocessing version, and the embedding model cache is separate from the cache invalidated during promotion. The fallback descriptor shares a vector size with learned embeddings despite representing different features. Reusing corrections from a similar image can apply geometry to the wrong plan.

Fix: use an immutable source ID/hash and explicit image transform for automatic correction replay. Offer similar plans as suggestions. Version embeddings and compare only compatible descriptors. Hash original upload bytes for byte identity; document any normalized-image hash separately. Recompute descriptors after model changes when required.

Acceptance: similar but distinct plans never automatically inherit coordinates; resized copies require a known transform; incompatible embedding versions are not compared.

### R12 — P1: training behavior and AI use are coupled to ordinary editing

Evidence: [train_server.py](../apps/backend/src/train_server.py), `/api/save-corrections`, `/api/save`, `/api/train`, auto-detection review; [auto_trainer.py](../apps/backend/src/auto_trainer.py), `trigger_auto_train`; [schema.sql](../apps/backend/database/schema.sql), training defaults.

`AUTO_TRAIN_ON_DETECT=False` does not disable direct training calls in all save routes. DB defaults enable upload/correction training. When one model is training, subsequent requests can be skipped rather than queued. AI review is coupled to the DB-enabled detection branch and module availability, with no single local-only switch.

Fix: one central policy for local-only mode and separately requested training jobs. Saving and viewing must never imply training. Keep AI proposals distinct from approved labels. Use a bounded durable queue only when manual batching becomes necessary; one local worker is sufficient initially.

Acceptance: local-only mode produces zero cloud requests, saving produces zero training jobs, and a requested training batch has visible queued/running/completed/failed state.

### R13 — P1: a fresh checkout cannot reproduce the setup

Evidence: empty [package.json](../package.json), one-line original README, empty run scripts; [requirements.txt](../requirements.txt); [db.py](../apps/backend/src/db.py); training script defaults.

The requirements do not declare several directly used packages, including `supervision`, `roboflow`, `pymysql`, and optional Google/dotenv integrations. Dependencies are unpinned. Training paths and the default MySQL socket are specific to this machine. The viewer imports Three.js from a CDN. There is no working automated test suite.

Fix: document the two backend entry points; create a valid frontend package and lockfile, initially preserving Three.js 0.160.0. Separate core, training, cloud, and evaluation Python requirements. Add an environment example with names and safe defaults, not credentials. Derive filesystem paths from configuration/repository roots. Make required model availability visible, with no hidden download in local-only mode.

Acceptance: documented fresh setup renders a fixture without DB or API keys; optional capabilities report availability accurately; regression checks run with one command.

## Further improvements after the foundation

| Area | Evidence and consequence | Recommended change |
| --- | --- | --- |
| Detection efficiency | `train_server.py` runs the same combined model separately for walls, doors, and windows, then embeddings can add more inference. | Predict once and partition results using the verified class map. Measure timing before/after; cache by image hash + model/config version. |
| Real room geometry | `ai_assistant.py::_fallback_room_detection` assigns room types to quadrants. The tracer exports `rooms: []`. | Let users draw/confirm room polygons; later polygonize a corrected wall graph. Label inferred room types as suggestions. |
| Auto-furnishing | `auto_furnish` applies fixed offsets without polygon containment or collision checks. | Place templates only inside confirmed room polygons, reserving wall/opening and walking clearances; keep manual placement first. |
| Rendering | Continuous render loop, many individual furniture meshes, fixed 2048 shadow map; no general scene lifecycle. | Profile draw calls and memory, share resources, add a lower-quality setting, and render on change with continued frames during damping/animation. |
| Controls | Global key handler responds while typing; click handler is on `window`; door roots and descendants are both raycast targets. | Ignore editable inputs, scope picking to the canvas, raycast roots recursively once, and prevent overlapping door animations. |
| SQL setup | Migrations run during module import; initial SQL re-seeds training settings with overwrite behavior. Summary view joins multiple one-to-many tables. | Explicit versioned migrations, preserve existing settings, and aggregate child counts before joining when scale warrants it. |
| PDF import | `extract_pdf.py` uses regex for ordered line/rect attributes, ignores paths/transforms, merges three pages, and labels division by 72 as feet. | Treat as experimental. Parse SVG properly, keep pages separate, and calibrate a known real length; 72 PDF points is one page inch, not one real-world foot. |
| Standalone training | `train_all_optimized.py` has old production paths and, for door/room jobs, can copy a weights file onto itself. `train_window_glass_v3.py` trains at module top level. | Central model registry, unique run paths, checked promotion, shared YAML parser, `main` guard, configurable device/batch. |
| Evaluation tools | FiftyOne scripts delete an existing named dataset and predict an entire split at once. | Use unique run names or explicit replace options; batch/stream evaluation. Keep FiftyOne optional for the small MVP. |
| Maintainability | `train_server.py` combines 1,448 lines of HTTP, detection, persistence, review, and training policy; class aliases repeat across modules. | Extract services incrementally and use one class/asset registry. Avoid introducing a second web framework merely to split files. |

## Recommended implementation order

1. Protect current weights and make training/cloud use explicit: R1–R3, R12.
2. Make setup and fixtures reproducible: R13.
3. Unify project schema, transforms, and persistence: R4–R6, R8–R10.
4. Correct openings and image identity: R7, R11.
5. Add the small GLB catalog described in the [integration plan](zero-budget-3d-plan.md).
6. Evaluate on reviewed held-out plans before spending time retraining: R2.

The scope above is a review and plan. The application fixes and asset integration have not yet been implemented.
