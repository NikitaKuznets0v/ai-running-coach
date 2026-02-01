-- Migration: Add new onboarding stages
-- Date: 2026-02-01
-- Description: Adds goal_type, race_details, and improvement_details stages

-- Drop the existing constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_onboarding_stage_check;

-- Add the new constraint with additional stages
ALTER TABLE users ADD CONSTRAINT users_onboarding_stage_check
CHECK (onboarding_stage IN (
    'started',
    'profile',
    'physical',
    'running_info',
    'goal',
    'goal_type',
    'race_details',
    'improvement_details',
    'completed'
));
