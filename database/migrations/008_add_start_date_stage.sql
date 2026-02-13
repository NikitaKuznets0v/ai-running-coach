-- Migration 008: Add 'start_date' onboarding stage
-- After strategy_preview, bot asks user when to start training

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_onboarding_stage_check;
ALTER TABLE users ADD CONSTRAINT users_onboarding_stage_check CHECK (onboarding_stage IN (
  'started',
  'profile',
  'physical',
  'heart_rate',
  'running_info',
  'lab_testing',
  'training_freq',
  'race_details',
  'strategy_preview',
  'start_date',
  'completed'
));
