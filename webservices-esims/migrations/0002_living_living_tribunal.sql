CREATE TABLE `PasswordReset` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`token_hash` varchar(255) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `PasswordReset_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `PasswordReset` ADD CONSTRAINT `PasswordReset_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE cascade ON UPDATE no action;