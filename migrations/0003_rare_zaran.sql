CREATE TABLE `PaymentClaim` (
	`claim_id` int AUTO_INCREMENT NOT NULL,
	`order_id` int NOT NULL,
	`customer_id` int NOT NULL,
	`sender_name` varchar(150),
	`sender_name_normalized` varchar(150),
	`sender_phone` varchar(20),
	`reference` varchar(100),
	`status` enum('pending','matched','rejected') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`matched_transaction_id` int,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `PaymentClaim_claim_id` PRIMARY KEY(`claim_id`),
	CONSTRAINT `PaymentClaim_order_id_unique` UNIQUE(`order_id`)
);
--> statement-breakpoint
CREATE TABLE `WalletTransaction` (
	`wallet_transaction_id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(30) NOT NULL DEFAULT 'jawwal_pay',
	`reference` varchar(100) NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'ILS',
	`sender_name` varchar(150),
	`sender_name_normalized` varchar(150),
	`sender_phone` varchar(20),
	`balance_after` decimal(12,2),
	`raw_text` text NOT NULL,
	`source` enum('mail','webhook','manual') NOT NULL,
	`status` enum('unmatched','matched','ignored') NOT NULL DEFAULT 'unmatched',
	`matched_order_id` int,
	`matched_at` timestamp,
	`received_at` timestamp NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `WalletTransaction_wallet_transaction_id` PRIMARY KEY(`wallet_transaction_id`),
	CONSTRAINT `WalletTransaction_reference_unique` UNIQUE(`reference`)
);
--> statement-breakpoint
ALTER TABLE `PaymentClaim` ADD CONSTRAINT `PaymentClaim_order_id_ESIMPurchase_esim_purchase_id_fk` FOREIGN KEY (`order_id`) REFERENCES `ESIMPurchase`(`esim_purchase_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `PaymentClaim` ADD CONSTRAINT `PaymentClaim_customer_id_User_user_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `User`(`user_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `PaymentClaim` ADD CONSTRAINT `PaymentClaim_matched_transaction_fk` FOREIGN KEY (`matched_transaction_id`) REFERENCES `WalletTransaction`(`wallet_transaction_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `WalletTransaction` ADD CONSTRAINT `WalletTransaction_matched_order_fk` FOREIGN KEY (`matched_order_id`) REFERENCES `ESIMPurchase`(`esim_purchase_id`) ON DELETE set null ON UPDATE no action;