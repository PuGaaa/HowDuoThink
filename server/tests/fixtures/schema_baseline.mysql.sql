ai_index
CREATE TABLE `ai_index` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `source_type` varchar(32) NOT NULL,
  `source_id` varchar(64) NOT NULL,
  `chunk_kind` varchar(32) NOT NULL,
  `content` mediumtext NOT NULL,
  `embedding` mediumtext NOT NULL,
  `model` varchar(128) NOT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_ai` (`source_type`,`source_id`,`chunk_kind`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

ai_usage
CREATE TABLE `ai_usage` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `uid` varchar(64) DEFAULT NULL,
  `kind` varchar(32) NOT NULL,
  `prompt_tokens` bigint NOT NULL DEFAULT '0',
  `completion_tokens` bigint NOT NULL DEFAULT '0',
  `duration_ms` bigint NOT NULL DEFAULT '0',
  `ok` tinyint NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `ix_ai_usage_created` (`created_at`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

articles
CREATE TABLE `articles` (
  `id` varchar(64) NOT NULL,
  `source_type` varchar(32) NOT NULL,
  `source_id` varchar(64) NOT NULL,
  `title` varchar(191) NOT NULL,
  `layer` varchar(191) NOT NULL,
  `domain` varchar(64) NOT NULL,
  `steps` mediumtext NOT NULL,
  `lessons` mediumtext NOT NULL,
  `author` varchar(191) NOT NULL,
  `published_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

assets
CREATE TABLE `assets` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `object_key` varchar(512) NOT NULL,
  `filename` varchar(255) NOT NULL,
  `category` varchar(32) NOT NULL DEFAULT 'misc',
  `content_type` varchar(128) NOT NULL DEFAULT '',
  `size_bytes` bigint NOT NULL DEFAULT '0',
  `sha256` char(64) NOT NULL DEFAULT '',
  `note` varchar(512) NOT NULL DEFAULT '',
  `uploaded_by` varchar(64) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `ix_assets_category` (`category`),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_assets_object_key` (`object_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

cases
CREATE TABLE `cases` (
  `id` varchar(64) NOT NULL,
  `submission_id` varchar(64) DEFAULT NULL,
  `author_id` varchar(64) DEFAULT NULL,
  `title` varchar(191) NOT NULL,
  `domain` varchar(64) NOT NULL,
  `layer` varchar(191) NOT NULL,
  `difficulty` int NOT NULL,
  `version` int NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'published',
  `payload` mediumtext NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `published_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

meta
CREATE TABLE `meta` (
  `meta_key` varchar(64) NOT NULL,
  `value` mediumtext NOT NULL,
  PRIMARY KEY (`meta_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

ops_snapshots
CREATE TABLE `ops_snapshots` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `ts` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `requests` bigint NOT NULL DEFAULT '0',
  `errors` bigint NOT NULL DEFAULT '0',
  `avg_ms` bigint NOT NULL DEFAULT '0',
  `rss_mb` double NOT NULL DEFAULT '0',
  `disk_free_mb` double NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

progress
CREATE TABLE `progress` (
  `user_id` varchar(64) NOT NULL,
  `payload` mediumtext NOT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

resource_slots
CREATE TABLE `resource_slots` (
  `slot` varchar(64) NOT NULL,
  `asset_id` bigint NOT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`slot`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

settings
CREATE TABLE `settings` (
  `setting_key` varchar(64) NOT NULL,
  `value` mediumtext NOT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

sms_codes
CREATE TABLE `sms_codes` (
  `phone` varchar(32) NOT NULL,
  `code` varchar(16) NOT NULL,
  `expires_at` bigint NOT NULL,
  `used` tinyint NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

submissions
CREATE TABLE `submissions` (
  `id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `title` varchar(191) NOT NULL,
  `symptom` mediumtext NOT NULL,
  `resolution` mediumtext NOT NULL,
  `key_error` mediumtext,
  `timeline` varchar(512) DEFAULT NULL,
  `lessons` mediumtext NOT NULL DEFAULT (_utf8mb4'[]'),
  `stack_tags` mediumtext NOT NULL DEFAULT (_utf8mb4'[]'),
  `domain_hint` varchar(64) DEFAULT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'pending',
  `review_note` varchar(1024) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

user_activity
CREATE TABLE `user_activity` (
  `user_id` varchar(64) NOT NULL,
  `day` varchar(10) NOT NULL,
  `hits` bigint NOT NULL DEFAULT '1',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`day`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

users
CREATE TABLE `users` (
  `id` varchar(64) NOT NULL,
  `login` varchar(191) NOT NULL,
  `name` varchar(191) DEFAULT NULL,
  `avatar` varchar(512) DEFAULT NULL,
  `role` varchar(32) NOT NULL DEFAULT 'user',
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `password_hash` varchar(255) DEFAULT NULL,
  `phone` varchar(32) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `login` (`login`),
  UNIQUE KEY `ux_users_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
