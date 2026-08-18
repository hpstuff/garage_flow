-- 0019_add_schedule_enabled_to_location.sql
-- Add a schedule-enabled flag to the location table so a garage can opt out
-- of working-schedule enforcement entirely (GF-20).

ALTER TABLE "location" ADD COLUMN "schedule_enabled" boolean NOT NULL DEFAULT true;
