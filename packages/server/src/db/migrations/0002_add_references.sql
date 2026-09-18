CREATE TABLE `references` (
	`id` text PRIMARY KEY NOT NULL,
	`song_id` text,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_length` integer NOT NULL,
	`audio` blob NOT NULL,
	`score_abc` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade
);
