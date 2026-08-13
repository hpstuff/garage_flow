-- 0018_add_working_schedule_to_location.sql
-- Add a working schedule column to the location table.
-- Stores JSON with weekly hours and date exceptions (GF-20).

ALTER TABLE "location" ADD COLUMN "working_schedule" text NOT NULL DEFAULT '{"weekly":{"mon":{"start":"09:00","end":"18:00"},"tue":{"start":"09:00","end":"18:00"},"wed":{"start":"09:00","end":"18:00"},"thu":{"start":"09:00","end":"18:00"},"fri":{"start":"09:00","end":"18:00"},"sat":null,"sun":null},"exceptions":[]}';
