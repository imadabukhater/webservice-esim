-- Store visibility and pricing per provider and per plan
ALTER TABLE `Provider` ADD `is_visible` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `Provider` ADD `qr_price` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `Provider` ADD `renewal_price` int;--> statement-breakpoint
ALTER TABLE `Plan` ADD `renewal_price` int;--> statement-breakpoint
ALTER TABLE `Plan` ADD `is_visible` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `Plan` ADD `show_qr` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `ESIMPurchase` ADD `qr_fee` int DEFAULT 0 NOT NULL;--> statement-breakpoint
-- eSIM QR inventory belongs to the provider, so plans can be deleted and re-synced
ALTER TABLE `ESIM` ADD `provider_id` int;--> statement-breakpoint
UPDATE `ESIM` e JOIN `Plan` p ON p.`plan_id` = e.`plan_id` SET e.`provider_id` = p.`provider_id`;--> statement-breakpoint
ALTER TABLE `ESIM` MODIFY COLUMN `provider_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `ESIM` DROP FOREIGN KEY `ESIM_plan_id_Plan_plan_id_fk`;--> statement-breakpoint
ALTER TABLE `ESIM` MODIFY COLUMN `plan_id` int;--> statement-breakpoint
-- One plan name per provider: normalise names, then merge duplicates into the oldest plan
UPDATE `Plan` SET `plan_name` = TRIM(REGEXP_REPLACE(`plan_name`, '[[:space:]]+', ' '));--> statement-breakpoint
UPDATE `ESIMPurchase` e JOIN `Plan` p ON p.`plan_id` = e.`plan_id` JOIN (SELECT `provider_id`, `plan_name`, MIN(`plan_id`) AS `keep_id` FROM `Plan` GROUP BY `provider_id`, `plan_name`) k ON k.`provider_id` = p.`provider_id` AND k.`plan_name` = p.`plan_name` SET e.`plan_id` = k.`keep_id` WHERE p.`plan_id` <> k.`keep_id`;--> statement-breakpoint
UPDATE `ESIM` e JOIN `Plan` p ON p.`plan_id` = e.`plan_id` JOIN (SELECT `provider_id`, `plan_name`, MIN(`plan_id`) AS `keep_id` FROM `Plan` GROUP BY `provider_id`, `plan_name`) k ON k.`provider_id` = p.`provider_id` AND k.`plan_name` = p.`plan_name` SET e.`plan_id` = k.`keep_id` WHERE p.`plan_id` <> k.`keep_id`;--> statement-breakpoint
UPDATE IGNORE `CustomerFavoritePlan` f JOIN `Plan` p ON p.`plan_id` = f.`plan_id` JOIN (SELECT `provider_id`, `plan_name`, MIN(`plan_id`) AS `keep_id` FROM `Plan` GROUP BY `provider_id`, `plan_name`) k ON k.`provider_id` = p.`provider_id` AND k.`plan_name` = p.`plan_name` SET f.`plan_id` = k.`keep_id` WHERE p.`plan_id` <> k.`keep_id`;--> statement-breakpoint
DELETE p FROM `Plan` p JOIN (SELECT `provider_id`, `plan_name`, MIN(`plan_id`) AS `keep_id` FROM `Plan` GROUP BY `provider_id`, `plan_name`) k ON k.`provider_id` = p.`provider_id` AND k.`plan_name` = p.`plan_name` WHERE p.`plan_id` <> k.`keep_id`;--> statement-breakpoint
ALTER TABLE `Plan` ADD CONSTRAINT `Plan_provider_name_unique` UNIQUE(`provider_id`,`plan_name`);--> statement-breakpoint
ALTER TABLE `ESIM` ADD CONSTRAINT `ESIM_provider_id_Provider_provider_id_fk` FOREIGN KEY (`provider_id`) REFERENCES `Provider`(`provider_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ESIM` ADD CONSTRAINT `ESIM_plan_id_Plan_plan_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `Plan`(`plan_id`) ON DELETE set null ON UPDATE no action;
