CREATE TABLE `users` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255) UNIQUE NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(20),
  `role` ENUM ('CLIENT', 'TECHNICIAN', 'ADMIN') NOT NULL DEFAULT 'CLIENT',
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` DATETIME
);

CREATE TABLE `service_types` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `name` VARCHAR(100) UNIQUE NOT NULL,
  `description` TEXT,
  `base_price` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `completion_date` date,
  `is_active` BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE `service_tickets` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `ticket_number` VARCHAR(30) UNIQUE NOT NULL,
  `client_id` BIGINT NOT NULL,
  `technician_id` BIGINT NOT NULL,
  `service_type_id` BIGINT NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT NOT NULL,
  `device_name` VARCHAR(200),
  `device_serial_number` VARCHAR(100),
  `priority` ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
  `status` ENUM ('NEW', 'ACCEPTED', 'IN_PROGRESS', 'WAITING_FOR_PARTS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'NEW',
  `estimated_cost` DECIMAL(10,2),
  `final_cost` DECIMAL(10,2),
  `created_at` DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` DATETIME,
  `completed_at` DATETIME
);

CREATE TABLE `ticket_status_history` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `ticket_id` BIGINT NOT NULL,
  `changed_by` BIGINT NOT NULL,
  `old_status` ENUM ('NEW', 'ACCEPTED', 'IN_PROGRESS', 'WAITING_FOR_PARTS', 'COMPLETED', 'CANCELLED'),
  `new_status` ENUM ('NEW', 'ACCEPTED', 'IN_PROGRESS', 'WAITING_FOR_PARTS', 'COMPLETED', 'CANCELLED') NOT NULL,
  `comment` TEXT,
  `changed_at` DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE `ticket_comments` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `ticket_id` BIGINT NOT NULL,
  `author_id` BIGINT NOT NULL,
  `content` TEXT NOT NULL,
  `is_internal` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE `ticket_attachments` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `ticket_id` BIGINT NOT NULL,
  `uploaded_by` BIGINT NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `mime_type` VARCHAR(100),
  `uploaded_at` DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE `components` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `name` VARCHAR(200) NOT NULL,
  `manufacturer` VARCHAR(100),
  `model` VARCHAR(150),
  `component_type` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `price` DECIMAL(10,2) NOT NULL,
  `performance_score` DECIMAL(8,2),
  `product_url` VARCHAR(500)
);

CREATE TABLE `component_specifications` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `component_id` BIGINT NOT NULL,
  `specification_name` VARCHAR(100) NOT NULL,
  `specification_value` VARCHAR(255) NOT NULL
);

CREATE TABLE `component_compatibilities` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `component_id` BIGINT NOT NULL,
  `compatible_component_id` BIGINT NOT NULL,
  `compatibility_type` VARCHAR(100) NOT NULL,
  `description` TEXT,
  `is_compatible` BOOLEAN NOT NULL DEFAULT true,
  `checked_at` DATETIME
);

CREATE TABLE `pc_configurations` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `description` TEXT,
  `total_price` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `estimated_performance` DECIMAL(10,2),
  `is_public` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` DATETIME
);

CREATE TABLE `configuration_components` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `configuration_id` BIGINT NOT NULL,
  `component_id` BIGINT NOT NULL,
  `quantity` INT NOT NULL DEFAULT 1,
  `price_at_selection` DECIMAL(10,2) NOT NULL,
  `is_selected` BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE `component_recommendations` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `source_component_id` BIGINT NOT NULL,
  `recommended_component_id` BIGINT NOT NULL,
  `recommendation_type` ENUM ('LOWER_PRICE', 'HIGHER_PERFORMANCE', 'BETTER_VALUE') NOT NULL,
  `reason` TEXT,
  `price_difference` DECIMAL(10,2),
  `performance_difference` DECIMAL(10,2),
  `created_at` DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX `components_index_0` ON `components` (`component_type`);

CREATE UNIQUE INDEX `components_index_1` ON `components` (`manufacturer`, `model`);

CREATE UNIQUE INDEX `component_specifications_index_2` ON `component_specifications` (`component_id`, `specification_name`);

CREATE UNIQUE INDEX `component_compatibilities_index_3` ON `component_compatibilities` (`component_id`, `compatible_component_id`);

CREATE UNIQUE INDEX `configuration_components_index_4` ON `configuration_components` (`configuration_id`, `component_id`);

CREATE UNIQUE INDEX `component_recommendations_index_5` ON `component_recommendations` (`source_component_id`, `recommended_component_id`);

ALTER TABLE `service_tickets` ADD FOREIGN KEY (`client_id`) REFERENCES `users` (`id`);

ALTER TABLE `service_tickets` ADD FOREIGN KEY (`technician_id`) REFERENCES `users` (`id`);

ALTER TABLE `service_tickets` ADD FOREIGN KEY (`service_type_id`) REFERENCES `service_types` (`id`);

ALTER TABLE `ticket_status_history` ADD FOREIGN KEY (`ticket_id`) REFERENCES `service_tickets` (`id`);

ALTER TABLE `ticket_status_history` ADD FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`);

ALTER TABLE `ticket_comments` ADD FOREIGN KEY (`ticket_id`) REFERENCES `service_tickets` (`id`);

ALTER TABLE `ticket_comments` ADD FOREIGN KEY (`author_id`) REFERENCES `users` (`id`);

ALTER TABLE `ticket_attachments` ADD FOREIGN KEY (`ticket_id`) REFERENCES `service_tickets` (`id`);

ALTER TABLE `ticket_attachments` ADD FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`);

ALTER TABLE `component_specifications` ADD FOREIGN KEY (`component_id`) REFERENCES `components` (`id`);

ALTER TABLE `component_compatibilities` ADD FOREIGN KEY (`component_id`) REFERENCES `components` (`id`);

ALTER TABLE `component_compatibilities` ADD FOREIGN KEY (`compatible_component_id`) REFERENCES `components` (`id`);

ALTER TABLE `pc_configurations` ADD FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

ALTER TABLE `configuration_components` ADD FOREIGN KEY (`configuration_id`) REFERENCES `pc_configurations` (`id`);

ALTER TABLE `configuration_components` ADD FOREIGN KEY (`component_id`) REFERENCES `components` (`id`);

ALTER TABLE `component_recommendations` ADD FOREIGN KEY (`source_component_id`) REFERENCES `components` (`id`);

ALTER TABLE `component_recommendations` ADD FOREIGN KEY (`recommended_component_id`) REFERENCES `components` (`id`);
