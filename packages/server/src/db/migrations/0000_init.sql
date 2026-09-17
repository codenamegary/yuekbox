CREATE TABLE `song_audio` (
	`song_id` text PRIMARY KEY NOT NULL,
	`mp3` blob NOT NULL,
	`byte_length` integer NOT NULL,
	`content_type` text NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `songs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`stage` text,
	`lyrics` text NOT NULL,
	`style` text NOT NULL,
	`seed` integer NOT NULL,
	`cot` text DEFAULT 'full' NOT NULL,
	`score_abc` text,
	`duration_seconds` real,
	`truncated_abc` integer,
	`truncated_semantic` integer,
	`error_detail` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text
);
