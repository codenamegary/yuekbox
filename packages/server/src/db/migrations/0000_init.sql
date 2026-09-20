CREATE TABLE `ai_config` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `songs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`stage` text,
	`stage_completed` integer,
	`stage_total` integer,
	`lyrics` text NOT NULL,
	`style` text NOT NULL,
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
