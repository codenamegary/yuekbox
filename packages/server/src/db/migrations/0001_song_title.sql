PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_songs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`stage` text,
	`stage_completed` integer,
	`stage_total` integer,
	`lyrics` text NOT NULL,
	`style` text NOT NULL,
	`title` text NOT NULL,
	`seed` integer NOT NULL,
	`cot` text DEFAULT 'full' NOT NULL,
	`duration_seconds` real,
	`truncated_abc` integer,
	`truncated_semantic` integer,
	`error_detail` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
INSERT INTO `__new_songs` (`id`, `status`, `stage`, `stage_completed`, `stage_total`, `lyrics`, `style`, `title`, `seed`, `cot`, `duration_seconds`, `truncated_abc`, `truncated_semantic`, `error_detail`, `created_at`, `updated_at`, `completed_at`)
SELECT `id`, `status`, `stage`, `stage_completed`, `stage_total`, `lyrics`, `style`, 'untitled', `seed`, `cot`, `duration_seconds`, `truncated_abc`, `truncated_semantic`, `error_detail`, `created_at`, `updated_at`, `completed_at` FROM `songs`;--> statement-breakpoint
DROP TABLE `songs`;--> statement-breakpoint
ALTER TABLE `__new_songs` RENAME TO `songs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
