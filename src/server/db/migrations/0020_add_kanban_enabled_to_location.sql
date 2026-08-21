-- 0020_add_kanban_enabled_to_location.sql
-- Add a kanban-enabled flag to the location table so a Location can opt out
-- of the Kanban board section entirely (GF-22).

ALTER TABLE "location" ADD COLUMN "kanban_enabled" boolean NOT NULL DEFAULT true;
