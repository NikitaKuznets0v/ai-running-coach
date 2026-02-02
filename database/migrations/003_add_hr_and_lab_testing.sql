-- Migration: 003_add_hr_and_lab_testing.sql
-- Date: 2026-02-03
-- Description: Add heart rate fields and lab testing support for RACE-focused onboarding

-- Add heart rate fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS resting_hr INTEGER CHECK (resting_hr > 30 AND resting_hr < 120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_hr INTEGER CHECK (max_hr > 120 AND max_hr < 230);

-- Add lab testing fields (optional, from professional metabolic testing)
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_lab_testing BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS vo2max DECIMAL(4,1) CHECK (vo2max > 20 AND vo2max < 100); -- ml/kg/min
ALTER TABLE users ADD COLUMN IF NOT EXISTS lthr INTEGER CHECK (lthr > 100 AND lthr < 220); -- Lactate threshold HR

-- Add HR zones (from lab testing or calculated)
ALTER TABLE users ADD COLUMN IF NOT EXISTS hr_zone1_max INTEGER; -- Recovery (50-60% MaxHR)
ALTER TABLE users ADD COLUMN IF NOT EXISTS hr_zone2_max INTEGER; -- Aerobic (60-70% MaxHR)
ALTER TABLE users ADD COLUMN IF NOT EXISTS hr_zone3_max INTEGER; -- Tempo (70-80% MaxHR)
ALTER TABLE users ADD COLUMN IF NOT EXISTS hr_zone4_max INTEGER; -- Threshold (80-90% MaxHR)
ALTER TABLE users ADD COLUMN IF NOT EXISTS hr_zone5_max INTEGER; -- VO2max (90-100% MaxHR)

-- Update race_distance to include 'ultra'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_race_distance_check;
ALTER TABLE users ADD CONSTRAINT users_race_distance_check
  CHECK (race_distance IN ('5k', '10k', 'half', 'marathon', 'ultra'));

-- Add new onboarding stages
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_onboarding_stage_check;
ALTER TABLE users ADD CONSTRAINT users_onboarding_stage_check
  CHECK (onboarding_stage IN (
    'started',
    'profile',
    'physical',
    'heart_rate',        -- NEW: ask for resting HR
    'running_info',
    'lab_testing',       -- NEW: optional lab testing results
    'training_freq',     -- NEW: how many days per week
    'race_details',
    'strategy_preview',  -- NEW: show strategy before completing
    'completed'
  ));

-- Comments for documentation
COMMENT ON COLUMN users.resting_hr IS 'Resting heart rate in BPM (measured in the morning before getting up)';
COMMENT ON COLUMN users.max_hr IS 'Maximum heart rate (from test or calculated as 220-age)';
COMMENT ON COLUMN users.has_lab_testing IS 'User has professional metabolic/VO2max testing results';
COMMENT ON COLUMN users.vo2max IS 'VO2max from lab testing in ml/kg/min';
COMMENT ON COLUMN users.lthr IS 'Lactate threshold heart rate from lab testing';
