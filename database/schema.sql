-- ============================================
-- AI Running Coach - Database Schema
-- Supabase PostgreSQL
-- Version: 2.0 (includes migrations 002-007)
-- Date: 8 February 2026
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE: users
-- Main user profile and running data
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id BIGINT UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  language TEXT DEFAULT 'ru',

  -- Personal profile
  gender TEXT CHECK (gender IN ('male', 'female')),
  age INTEGER CHECK (age > 0 AND age < 120),
  height_cm INTEGER CHECK (height_cm > 100 AND height_cm < 250),
  weight_kg DECIMAL(5,2) CHECK (weight_kg > 0 AND weight_kg < 300),

  -- Running profile
  level TEXT CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  training_type TEXT DEFAULT 'outdoor' CHECK (training_type IN ('outdoor', 'treadmill')),
  weekly_runs INTEGER DEFAULT 3 CHECK (weekly_runs >= 1 AND weekly_runs <= 7),
  preferred_training_days TEXT,       -- Free text: "понедельник, среда, пятница, один из выходных"

  -- Goal settings
  goal TEXT CHECK (goal IN ('general', 'race', 'improvement')),
  race_distance TEXT,                -- '5k', '10k', 'half', 'marathon', '30k', etc. (no CHECK — any distance allowed)
  race_distance_km DECIMAL(6,2),     -- Numeric distance in km for calculations
  race_date DATE,
  target_time_seconds INTEGER,       -- Target finish time in seconds

  -- Current fitness (from test or self-reported)
  current_5k_pace_seconds INTEGER,   -- Pace per km in seconds (e.g., 360 = 6:00/km)
  current_weekly_km DECIMAL(5,1),    -- Average weekly distance

  -- Heart rate data
  resting_hr INTEGER CHECK (resting_hr > 30 AND resting_hr < 120),
  max_hr INTEGER CHECK (max_hr > 120 AND max_hr < 230),

  -- Lab testing (optional, from professional metabolic testing)
  has_lab_testing BOOLEAN DEFAULT false,
  vo2max DECIMAL(4,1) CHECK (vo2max > 20 AND vo2max < 100),  -- ml/kg/min
  lthr INTEGER CHECK (lthr > 100 AND lthr < 220),             -- Lactate threshold HR

  -- HR zones (from lab testing or calculated via Karvonen formula)
  hr_zone1_max INTEGER,  -- Recovery (50-60% MaxHR)
  hr_zone2_max INTEGER,  -- Aerobic (60-70% MaxHR)
  hr_zone3_max INTEGER,  -- Tempo (70-80% MaxHR)
  hr_zone4_max INTEGER,  -- Threshold (80-90% MaxHR)
  hr_zone5_max INTEGER,  -- VO2max (90-100% MaxHR)

  -- Calculated pace zones (seconds per km)
  zone1_pace_seconds INTEGER,  -- Recovery/Easy (very slow)
  zone2_pace_seconds INTEGER,  -- Easy/Aerobic
  zone3_pace_seconds INTEGER,  -- Tempo/Threshold
  zone4_pace_seconds INTEGER,  -- Interval/VO2max
  zone5_pace_seconds INTEGER,  -- Sprint/Repetition

  -- Onboarding status
  onboarding_stage TEXT DEFAULT 'started' CHECK (onboarding_stage IN (
    'started',
    'profile',
    'physical',
    'heart_rate',
    'running_info',
    'lab_testing',
    'training_freq',
    'race_details',
    'strategy_preview',
    'completed'
  )),
  onboarding_data JSONB DEFAULT '{}',

  -- Status
  is_active BOOLEAN DEFAULT true,
  timezone TEXT DEFAULT 'Europe/Moscow',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_telegram_id ON users(telegram_id);

-- ============================================
-- TABLE: training_strategies
-- Long-term periodized training plans
-- ============================================
CREATE TABLE training_strategies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  goal_type TEXT NOT NULL CHECK (goal_type IN ('race', 'improvement', 'general')),
  race_distance TEXT,
  race_distance_km DECIMAL(6,2),
  race_date DATE,
  target_time_seconds INTEGER,

  total_weeks INTEGER NOT NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,

  -- Phases: [{name, display_name, start_week, end_week, duration_weeks, focus,
  --           target_weekly_km_min, target_weekly_km_max, key_workouts, intensity_distribution}]
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

-- ============================================
-- TABLE: weekly_plans
-- Weekly training plans
-- ============================================
CREATE TABLE weekly_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  week_number INTEGER,

  plan_data JSONB NOT NULL,

  total_distance_km DECIMAL(5,1),
  total_sessions INTEGER,
  completed_sessions INTEGER DEFAULT 0,

  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_week CHECK (week_end > week_start),
  CONSTRAINT unique_user_week UNIQUE (user_id, week_start)
);

CREATE INDEX idx_weekly_plans_user_id ON weekly_plans(user_id);
CREATE INDEX idx_weekly_plans_week_start ON weekly_plans(week_start);
CREATE INDEX idx_weekly_plans_status ON weekly_plans(status);

-- ============================================
-- TABLE: trainings
-- Completed training logs
-- ============================================
CREATE TABLE trainings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekly_plan_id UUID REFERENCES weekly_plans(id) ON DELETE SET NULL,

  date DATE NOT NULL DEFAULT CURRENT_DATE,
  day_of_week TEXT,

  type TEXT CHECK (type IN (
    'easy_run', 'long_run', 'tempo', 'intervals',
    'fartlek', 'recovery', 'race', 'other'
  )),

  -- Core metrics
  distance_km DECIMAL(5,2) NOT NULL CHECK (distance_km > 0),
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
  avg_pace_seconds INTEGER,

  -- Optional metrics
  avg_heart_rate INTEGER CHECK (avg_heart_rate > 0 AND avg_heart_rate < 250),
  max_heart_rate INTEGER CHECK (max_heart_rate > 0 AND max_heart_rate < 250),
  elevation_gain_m INTEGER,
  calories INTEGER,

  -- Subjective data
  feeling TEXT CHECK (feeling IN ('great', 'good', 'ok', 'tired', 'exhausted')),
  rpe INTEGER CHECK (rpe >= 1 AND rpe <= 10),
  notes TEXT,

  is_planned BOOLEAN DEFAULT true,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'screenshot', 'voice')),

  -- Multi-photo merge support (max 2 screenshots per training)
  screenshot_count INTEGER NOT NULL DEFAULT 1,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trainings_user_id ON trainings(user_id);
CREATE INDEX idx_trainings_date ON trainings(date);
CREATE INDEX idx_trainings_weekly_plan_id ON trainings(weekly_plan_id);

-- Prevent duplicate trainings per day (same user, same date, same rounded distance)
CREATE UNIQUE INDEX idx_unique_training_per_day
  ON trainings(user_id, date, ROUND(distance_km));

-- ============================================
-- TABLE: chat_history
-- Conversation history for AI context
-- ============================================
CREATE TABLE chat_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,

  message_type TEXT DEFAULT 'general' CHECK (message_type IN (
    'general', 'onboarding', 'planning', 'logging', 'feedback'
  )),

  telegram_message_id BIGINT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_history_user_id ON chat_history(user_id);
CREATE INDEX idx_chat_history_created_at ON chat_history(created_at);
CREATE INDEX idx_chat_history_message_type ON chat_history(message_type);

-- ============================================
-- TABLE: user_stats
-- Aggregated statistics (updated periodically)
-- ============================================
CREATE TABLE user_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  total_distance_km DECIMAL(8,2) DEFAULT 0,
  total_trainings INTEGER DEFAULT 0,
  total_duration_seconds INTEGER DEFAULT 0,

  month_distance_km DECIMAL(6,2) DEFAULT 0,
  month_trainings INTEGER DEFAULT 0,

  week_distance_km DECIMAL(5,2) DEFAULT 0,
  week_trainings INTEGER DEFAULT 0,

  current_streak_days INTEGER DEFAULT 0,
  longest_streak_days INTEGER DEFAULT 0,

  pb_5k_seconds INTEGER,
  pb_10k_seconds INTEGER,
  pb_half_seconds INTEGER,
  pb_marathon_seconds INTEGER,

  last_training_date DATE,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_stats_user_id ON user_stats(user_id);

-- ============================================
-- FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE FUNCTION calculate_pace(duration_sec INTEGER, distance DECIMAL)
RETURNS INTEGER AS $$
BEGIN
  IF distance > 0 THEN
    RETURN ROUND(duration_sec / distance);
  END IF;
  RETURN NULL;
END;
$$ language 'plpgsql';

CREATE OR REPLACE FUNCTION format_pace(seconds INTEGER)
RETURNS TEXT AS $$
BEGIN
  IF seconds IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN CONCAT(
    FLOOR(seconds / 60)::TEXT,
    ':',
    LPAD((seconds % 60)::TEXT, 2, '0')
  );
END;
$$ language 'plpgsql';

-- ============================================
-- TRIGGERS
-- ============================================

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_weekly_plans_updated_at
  BEFORE UPDATE ON weekly_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_training_strategies_updated_at
  BEFORE UPDATE ON training_strategies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION calculate_training_pace()
RETURNS TRIGGER AS $$
BEGIN
  NEW.avg_pace_seconds = calculate_pace(NEW.duration_seconds, NEW.distance_km);
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER calculate_training_pace_trigger
  BEFORE INSERT OR UPDATE ON trainings
  FOR EACH ROW
  EXECUTE FUNCTION calculate_training_pace();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

-- Note: N8N uses service_role key which bypasses RLS
