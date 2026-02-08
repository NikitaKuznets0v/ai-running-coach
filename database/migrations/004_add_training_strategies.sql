-- Migration: 004_add_training_strategies.sql
-- Date: 2026-02-08
-- Description: Add training_strategies table for long-term periodized training plans

CREATE TABLE training_strategies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  goal_type TEXT NOT NULL CHECK (goal_type IN ('race', 'improvement', 'general')),
  race_distance TEXT CHECK (race_distance IN ('5k', '10k', 'half', 'marathon', 'ultra')),
  race_date DATE,
  target_time_seconds INTEGER,

  total_weeks INTEGER NOT NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,

  -- Phases array: [{name, display_name, start_week, end_week, duration_weeks, focus, target_weekly_km_min, target_weekly_km_max, key_workouts, intensity_distribution, notes}]
  phases JSONB NOT NULL,

  summary TEXT,

  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned', 'replaced')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_training_strategies_user_id ON training_strategies(user_id);
CREATE INDEX idx_training_strategies_status ON training_strategies(status);

-- Only one active strategy per user
CREATE UNIQUE INDEX idx_unique_active_strategy ON training_strategies(user_id)
  WHERE status = 'active';

CREATE TRIGGER update_training_strategies_updated_at
  BEFORE UPDATE ON training_strategies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
