-- Whole-unit prices: round up existing plan prices before the column becomes int
UPDATE `Plan` SET `price` = CEILING(`price`);--> statement-breakpoint
-- Orders still waiting for payment are priced in ILS, whole units
UPDATE `ESIMPurchase` SET `amount` = CEILING(`amount`), `currency` = 'ILS' WHERE `payment_status` = 'pending';--> statement-breakpoint
CREATE TABLE `BalanceTransaction` (
	`balance_transaction_id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`amount` int NOT NULL,
	`balance_after` int NOT NULL,
	`kind` enum('topup','purchase','refund','adjustment') NOT NULL,
	`order_id` int,
	`wallet_transaction_id` int,
	`note` varchar(255),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `BalanceTransaction_balance_transaction_id` PRIMARY KEY(`balance_transaction_id`)
);
--> statement-breakpoint
ALTER TABLE `ESIMPurchase` MODIFY COLUMN `amount` int NOT NULL;--> statement-breakpoint
ALTER TABLE `ESIMPurchase` MODIFY COLUMN `currency` varchar(3) DEFAULT 'ILS';--> statement-breakpoint
ALTER TABLE `PaymentClaim` MODIFY COLUMN `order_id` int;--> statement-breakpoint
ALTER TABLE `Plan` MODIFY COLUMN `price` int NOT NULL;--> statement-breakpoint
ALTER TABLE `ESIMPurchase` ADD `purchase_type` enum('new','renewal','extension') DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE `ESIMPurchase` ADD `renews_purchase_id` int;--> statement-breakpoint
ALTER TABLE `PaymentClaim` ADD `purpose` enum('order','topup') DEFAULT 'order' NOT NULL;--> statement-breakpoint
ALTER TABLE `PaymentClaim` ADD `topup_amount` int;--> statement-breakpoint
ALTER TABLE `User` ADD `balance` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `BalanceTransaction` ADD CONSTRAINT `BalanceTransaction_customer_fk` FOREIGN KEY (`customer_id`) REFERENCES `User`(`user_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `BalanceTransaction` ADD CONSTRAINT `BalanceTransaction_order_fk` FOREIGN KEY (`order_id`) REFERENCES `ESIMPurchase`(`esim_purchase_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `BalanceTransaction` ADD CONSTRAINT `BalanceTransaction_wallet_fk` FOREIGN KEY (`wallet_transaction_id`) REFERENCES `WalletTransaction`(`wallet_transaction_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ESIMPurchase` ADD CONSTRAINT `ESIMPurchase_renews_fk` FOREIGN KEY (`renews_purchase_id`) REFERENCES `ESIMPurchase`(`esim_purchase_id`) ON DELETE set null ON UPDATE no action;