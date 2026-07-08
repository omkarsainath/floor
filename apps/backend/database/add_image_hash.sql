-- Run this in phpMyAdmin to add embedding column to existing floor_plans table
-- Go to: ai_3d_floorplan → SQL tab → paste this → Execute

-- Add embedding column (LONGTEXT to store JSON-serialized 512-dim float vector)
ALTER TABLE `floor_plans`
ADD COLUMN `embedding` LONGTEXT DEFAULT NULL COMMENT 'YOLO backbone embedding (JSON float array)'
AFTER `image_hash`;

-- Verify it was added
DESCRIBE `floor_plans`;
