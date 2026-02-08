-- Migration: 006_training_deduplication.sql
-- Date: 2026-02-08
-- Description: Prevent duplicate training entries from photo re-uploads

-- Unique constraint: one training per user per date per distance (rounded to integer km)
-- This prevents the same photo from creating multiple entries
-- Uses a functional index on rounded distance to allow for small rounding differences
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_training_per_day
  ON trainings(user_id, date, ROUND(distance_km));

-- Note: if existing duplicates prevent index creation, clean them up first:
-- DELETE FROM trainings a USING trainings b
-- WHERE a.id > b.id
--   AND a.user_id = b.user_id
--   AND a.date = b.date
--   AND ROUND(a.distance_km) = ROUND(b.distance_km);
