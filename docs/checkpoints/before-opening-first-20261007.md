# Checkpoint before opening-first detection

Branch: `checkpoint/walls-ceiling-before-opening-first-20261007`

This checkpoint preserves the current source, tests, dependency lockfile and
documentation before any change to the detection order. It includes existing
working-tree changes, not just the wall/ceiling changes. The branch was created
on October 7; the checkpoint was completed on October 8, 2026.

## Model weights (local archive, not committed)

Archive: `backups/model-weights-before-opening-first-20261007.tar.gz`

SHA-256: `313991a10992a923769ef5bdf957bf391f460ac4a21add6c2d58177fed73e225`

Contents and SHA-256 checksums:

- `models/best.pt`: `1f69591abf451605a063d06f6c679d2864ec6321881371e1fe409c863e2f6994`
- `apps/room-and-object/runs/room_object_yolo/weights/best.pt`: `fc012b9f55de94378efb95d21fb84d7feceb203db4f829cb3b55e0d7eceff07b`

The separate `models/wall_best.pt`, `models/door_best.pt` and
`models/window_glass_best.pt` files were absent. Their configured defaults fall
back to the combined model. Environment overrides and secrets are not captured.
The archive and branch are local; neither has been pushed or uploaded.

To inspect or restore the weights without overwriting active files, extract the
archive into a new empty directory and verify these checksums before replacement.
Keep the archive with any copy of this checkpoint: Git ignores the weight files.

## Runtime tuning

`before-opening-first-20261007-params.json` preserves the runtime file from
`apps/backend/outputs/self_train/params.json`. The recorded score is a legacy
tuning score, **not** a measured wall-detection accuracy. Review the destination
before copying the saved settings back during a restore.

## Scope and validation

Source, tests (including ceiling-plan fixtures), documentation and documentation
images are versioned. Original input images, uploads, generated validation
outputs, local environments, editor settings, and database contents are not.
Existing input images and reports remain on disk.

The preceding implementation verification passed 177 frontend tests, 100 backend
tests and the frontend build. Four supplied plans were reprocessed for ceiling
coverage; this is not exhaustive accuracy validation or manually labelled ground
truth. See `docs/opening-walls-and-ceiling-coverage.md` for remaining limitations.

No opening-first implementation or model retraining is part of this checkpoint.
