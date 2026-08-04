-- 0016_add_hourly_rate_to_mechanic.sql
ALTER TABLE mechanic ADD COLUMN hourly_rate integer NOT NULL DEFAULT 0;
