-- Migration: 005_flexible_race_distance.sql
-- Date: 2026-02-08
-- Description: Allow custom race distances (30km, 15km, etc.) instead of fixed enum

-- 1. Remove CHECK constraint from users.race_distance
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_race_distance_check;
-- Also try original constraint name format
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_race_distance_check1;

-- 2. Add race_distance_km column for numeric calculations
ALTER TABLE users ADD COLUMN IF NOT EXISTS race_distance_km DECIMAL(6,2);

-- 3. Backfill race_distance_km from existing race_distance values
UPDATE users SET race_distance_km = CASE
  WHEN race_distance = '5k' THEN 5.0
  WHEN race_distance = '10k' THEN 10.0
  WHEN race_distance = 'half' THEN 21.1
  WHEN race_distance = 'marathon' THEN 42.2
  WHEN race_distance = 'ultra' THEN 50.0
  ELSE NULL
END WHERE race_distance IS NOT NULL AND race_distance_km IS NULL;

-- 4. Remove CHECK constraint from training_strategies.race_distance
ALTER TABLE training_strategies DROP CONSTRAINT IF EXISTS training_strategies_race_distance_check;

-- 5. Add race_distance_km to training_strategies
ALTER TABLE training_strategies ADD COLUMN IF NOT EXISTS race_distance_km DECIMAL(6,2);

-- Backfill training_strategies too
UPDATE training_strategies SET race_distance_km = CASE
  WHEN race_distance = '5k' THEN 5.0
  WHEN race_distance = '10k' THEN 10.0
  WHEN race_distance = 'half' THEN 21.1
  WHEN race_distance = 'marathon' THEN 42.2
  WHEN race_distance = 'ultra' THEN 50.0
  ELSE NULL
END WHERE race_distance IS NOT NULL AND race_distance_km IS NULL;
