CREATE TABLE `AdminAction` (
	`action_id` int AUTO_INCREMENT NOT NULL,
	`admin_id` int NOT NULL,
	`action_category` enum('esim','Plan','Provider','Customer','Purchase') NOT NULL,
	`action_type` enum('UPDATE','Delete','Create') NOT NULL,
	`entity_id` int NOT NULL,
	`notes` text,
	`performed_at` timestamp DEFAULT (now()),
	CONSTRAINT `AdminAction_action_id` PRIMARY KEY(`action_id`)
);
--> statement-breakpoint
CREATE TABLE `CustomerFavoritePlan` (
	`favorite_id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`plan_id` int NOT NULL,
	`added_at` timestamp DEFAULT (now()),
	CONSTRAINT `CustomerFavoritePlan_favorite_id` PRIMARY KEY(`favorite_id`),
	CONSTRAINT `CustomerFavoritePlan_customer_id_plan_id_unique` UNIQUE(`customer_id`,`plan_id`)
);
--> statement-breakpoint
CREATE TABLE `ESIMPurchase` (
	`esim_purchase_id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`plan_id` int NOT NULL,
	`esim_id` int,
	`order_number` varchar(50) NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`currency` varchar(3) DEFAULT 'EUR',
	`purchase_status` enum('pending','code_sent','activated','expired') DEFAULT 'pending',
	`payment_status` enum('pending','completed','failed','refunded') DEFAULT 'pending',
	`payment_method` varchar(20) NOT NULL DEFAULT 'paypal',
	`payment_reference` varchar(100),
	`transaction_id` varchar(100),
	`sent_at` timestamp,
	`activation_date` timestamp,
	`expiry_date` date NOT NULL,
	`purchase_date` timestamp DEFAULT (now()),
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ESIMPurchase_esim_purchase_id` PRIMARY KEY(`esim_purchase_id`),
	CONSTRAINT `ESIMPurchase_esim_id_unique` UNIQUE(`esim_id`),
	CONSTRAINT `ESIMPurchase_order_number_unique` UNIQUE(`order_number`),
	CONSTRAINT `ESIMPurchase_payment_reference_unique` UNIQUE(`payment_reference`),
	CONSTRAINT `ESIMPurchase_transaction_id_unique` UNIQUE(`transaction_id`)
);
--> statement-breakpoint
CREATE TABLE `ESIM` (
	`esim_id` int AUTO_INCREMENT NOT NULL,
	`plan_id` int NOT NULL,
	`phone_number` varchar(20) NOT NULL,
	`iccid` varchar(50) NOT NULL,
	`qr_code` text NOT NULL,
	`status` enum('available','assigned','expired') DEFAULT 'available',
	`activation_date` timestamp,
	`expiry_date` timestamp,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ESIM_esim_id` PRIMARY KEY(`esim_id`),
	CONSTRAINT `ESIM_phone_number_unique` UNIQUE(`phone_number`),
	CONSTRAINT `ESIM_iccid_unique` UNIQUE(`iccid`)
);
--> statement-breakpoint
CREATE TABLE `Plan` (
	`plan_id` int AUTO_INCREMENT NOT NULL,
	`provider_id` int NOT NULL,
	`plan_name` varchar(100) NOT NULL,
	`data_amount_gb` int NOT NULL,
	`call_minutes` int DEFAULT 0,
	`sms_count` int DEFAULT 0,
	`validity_days` int NOT NULL,
	`price` decimal(10,2) NOT NULL,
	`description` text,
	`is_active` boolean DEFAULT true,
	CONSTRAINT `Plan_plan_id` PRIMARY KEY(`plan_id`)
);
--> statement-breakpoint
CREATE TABLE `Provider` (
	`provider_id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`logo_url` varchar(255),
	`is_active` boolean DEFAULT true,
	`description` text,
	CONSTRAINT `Provider_provider_id` PRIMARY KEY(`provider_id`),
	CONSTRAINT `Provider_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `User` (
	`user_id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(100) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`full_name` varchar(100) NOT NULL,
	`phone_number` varchar(20),
	`role` enum('customer','admin') NOT NULL,
	`is_verified` boolean DEFAULT false,
	`last_login` timestamp,
	`is_active` boolean DEFAULT true,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `User_user_id` PRIMARY KEY(`user_id`),
	CONSTRAINT `User_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `AdminAction` ADD CONSTRAINT `AdminAction_admin_id_User_user_id_fk` FOREIGN KEY (`admin_id`) REFERENCES `User`(`user_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CustomerFavoritePlan` ADD CONSTRAINT `CustomerFavoritePlan_customer_id_User_user_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `User`(`user_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CustomerFavoritePlan` ADD CONSTRAINT `CustomerFavoritePlan_plan_id_Plan_plan_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `Plan`(`plan_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ESIMPurchase` ADD CONSTRAINT `ESIMPurchase_customer_id_User_user_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `User`(`user_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ESIMPurchase` ADD CONSTRAINT `ESIMPurchase_plan_id_Plan_plan_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `Plan`(`plan_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ESIMPurchase` ADD CONSTRAINT `ESIMPurchase_esim_id_ESIM_esim_id_fk` FOREIGN KEY (`esim_id`) REFERENCES `ESIM`(`esim_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ESIM` ADD CONSTRAINT `ESIM_plan_id_Plan_plan_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `Plan`(`plan_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `Plan` ADD CONSTRAINT `Plan_provider_id_Provider_provider_id_fk` FOREIGN KEY (`provider_id`) REFERENCES `Provider`(`provider_id`) ON DELETE cascade ON UPDATE no action;