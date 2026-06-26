-- ============================================================
-- AI 3D Floor Plan - Database Schema
-- Import this file in phpMyAdmin: Select database → Import → Choose this file
-- ============================================================

CREATE DATABASE IF NOT EXISTS `ai_3d_floorplan` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `ai_3d_floorplan`;

-- -----------------------------------------------------------
-- 1. Floor Plans (uploaded images)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `floor_plans` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `filename` VARCHAR(255) NOT NULL,
  `image_path` VARCHAR(512) NOT NULL COMMENT 'Server path where image is stored',
  `image_width` INT UNSIGNED DEFAULT NULL,
  `image_height` INT UNSIGNED DEFAULT NULL,
  `image_hash` VARCHAR(64) DEFAULT NULL COMMENT 'Perceptual hash for quick dedup',
  `embedding` LONGTEXT DEFAULT NULL COMMENT 'YOLO backbone embedding (JSON float array, 512-dim)',
  `status` ENUM('uploaded','detecting','detected','training','trained','failed') NOT NULL DEFAULT 'uploaded',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_created` (`created_at`),
  INDEX `idx_hash` (`image_hash`)
) ENGINE=InnoDB;

-- -----------------------------------------------------------
-- 2. Walls (auto-detected + user corrections)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `walls` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `floor_plan_id` INT UNSIGNED NOT NULL,
  `start_x` DOUBLE NOT NULL,
  `start_y` DOUBLE NOT NULL,
  `end_x` DOUBLE NOT NULL,
  `end_y` DOUBLE NOT NULL,
  `height` DOUBLE NOT NULL DEFAULT 3.0,
  `thickness` DOUBLE NOT NULL DEFAULT 0.15,
  `wall_type` ENUM('exterior','interior','half') NOT NULL DEFAULT 'interior',
  `source` ENUM('auto','manual','corrected') NOT NULL DEFAULT 'auto',
  `confidence` DOUBLE DEFAULT NULL COMMENT 'YOLO confidence score',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0 = deleted by user correction',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_floor_plan` (`floor_plan_id`),
  INDEX `idx_source` (`source`),
  CONSTRAINT `fk_walls_floor_plan` FOREIGN KEY (`floor_plan_id`) REFERENCES `floor_plans`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------
-- 3. Doors (auto-detected + user corrections)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `doors` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `floor_plan_id` INT UNSIGNED NOT NULL,
  `bbox_x1` DOUBLE NOT NULL,
  `bbox_y1` DOUBLE NOT NULL,
  `bbox_x2` DOUBLE NOT NULL,
  `bbox_y2` DOUBLE NOT NULL,
  `swing_dir` VARCHAR(32) DEFAULT 'auto',
  `source` ENUM('auto','manual','corrected') NOT NULL DEFAULT 'auto',
  `confidence` DOUBLE DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_floor_plan` (`floor_plan_id`),
  CONSTRAINT `fk_doors_floor_plan` FOREIGN KEY (`floor_plan_id`) REFERENCES `floor_plans`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------
-- 4. Objects (rooms, furniture, appliances)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `objects` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `floor_plan_id` INT UNSIGNED NOT NULL,
  `class_name` VARCHAR(100) NOT NULL COMMENT 'e.g. Sofa, Bed, Kitchen, Bedroom',
  `bbox_x1` DOUBLE NOT NULL,
  `bbox_y1` DOUBLE NOT NULL,
  `bbox_x2` DOUBLE NOT NULL,
  `bbox_y2` DOUBLE NOT NULL,
  `confidence` DOUBLE DEFAULT NULL,
  `source` ENUM('auto','manual','corrected') NOT NULL DEFAULT 'auto',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_floor_plan` (`floor_plan_id`),
  INDEX `idx_class` (`class_name`),
  CONSTRAINT `fk_objects_floor_plan` FOREIGN KEY (`floor_plan_id`) REFERENCES `floor_plans`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------
-- 5. Corrections (tracks every user edit for retraining)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `corrections` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `floor_plan_id` INT UNSIGNED NOT NULL,
  `entity_type` ENUM('wall','door','object') NOT NULL,
  `entity_id` INT UNSIGNED NOT NULL COMMENT 'ID from walls/doors/objects table',
  `action` ENUM('add','delete','modify') NOT NULL,
  `old_data` JSON DEFAULT NULL COMMENT 'Previous values before correction',
  `new_data` JSON DEFAULT NULL COMMENT 'New values after correction',
  `proposed_by` ENUM('human','ai') NOT NULL DEFAULT 'human',
  `applied_to_training` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_floor_plan` (`floor_plan_id`),
  INDEX `idx_not_trained` (`applied_to_training`),
  CONSTRAINT `fk_corrections_floor_plan` FOREIGN KEY (`floor_plan_id`) REFERENCES `floor_plans`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------
-- 6. Training Logs (auto-training history)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `training_logs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `trigger_type` ENUM('upload','correction','manual','scheduled') NOT NULL,
  `trigger_floor_plan_id` INT UNSIGNED DEFAULT NULL,
  `model_type` VARCHAR(50) NOT NULL COMMENT 'wall_yolo, door_yolo, room_object_yolo',
  `status` ENUM('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
  `train_images` INT UNSIGNED DEFAULT 0 COMMENT 'Number of images used',
  `epochs` INT UNSIGNED DEFAULT NULL,
  `score` DOUBLE DEFAULT NULL COMMENT 'mAP or loss metric',
  `weights_path` VARCHAR(512) DEFAULT NULL,
  `error_message` TEXT DEFAULT NULL,
  `started_at` TIMESTAMP NULL DEFAULT NULL,
  `completed_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_model` (`model_type`),
  INDEX `idx_trigger_fp` (`trigger_floor_plan_id`),
  CONSTRAINT `fk_training_floor_plan` FOREIGN KEY (`trigger_floor_plan_id`) REFERENCES `floor_plans`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- -----------------------------------------------------------
-- 7. Auto-training configuration
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `training_config` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `config_key` VARCHAR(100) NOT NULL,
  `config_value` TEXT NOT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `idx_key` (`config_key`)
) ENGINE=InnoDB;

-- Default training configuration
INSERT INTO `training_config` (`config_key`, `config_value`, `description`) VALUES
('auto_train_on_upload', 'true', 'Trigger training after each new upload'),
('auto_train_on_correction', 'true', 'Trigger training after user corrections'),
('min_images_for_training', '3', 'Minimum floor plans needed before training starts'),
('training_epochs', '50', 'Number of YOLO training epochs'),
('training_batch_size', '8', 'Batch size for training'),
('confidence_threshold', '0.55', 'YOLO detection confidence threshold'),
('correction_batch_size', '5', 'Number of corrections to accumulate before retraining')
ON DUPLICATE KEY UPDATE `config_value` = VALUES(`config_value`);

-- -----------------------------------------------------------
-- Useful Views
-- -----------------------------------------------------------

-- View: Floor plans with detection counts
CREATE OR REPLACE VIEW `v_floor_plan_summary` AS
SELECT 
  fp.id,
  fp.filename,
  fp.status,
  fp.created_at,
  COUNT(DISTINCT w.id) AS wall_count,
  COUNT(DISTINCT d.id) AS door_count,
  COUNT(DISTINCT o.id) AS object_count,
  COUNT(DISTINCT c.id) AS correction_count
FROM floor_plans fp
LEFT JOIN walls w ON w.floor_plan_id = fp.id AND w.is_active = 1
LEFT JOIN doors d ON d.floor_plan_id = fp.id AND d.is_active = 1
LEFT JOIN objects o ON o.floor_plan_id = fp.id AND o.is_active = 1
LEFT JOIN corrections c ON c.floor_plan_id = fp.id
GROUP BY fp.id;

-- View: Pending corrections not yet used in training
CREATE OR REPLACE VIEW `v_pending_corrections` AS
SELECT 
  c.*,
  fp.filename
FROM corrections c
JOIN floor_plans fp ON fp.id = c.floor_plan_id
WHERE c.applied_to_training = 0
ORDER BY c.created_at;

-- View: Training history summary
CREATE OR REPLACE VIEW `v_training_history` AS
SELECT 
  tl.*,
  fp.filename AS trigger_filename
FROM training_logs tl
LEFT JOIN floor_plans fp ON fp.id = tl.trigger_floor_plan_id
ORDER BY tl.created_at DESC;
