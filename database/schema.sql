-- ============================================
-- AI Running Coach - Database Schema
-- Supabase PostgreSQL
-- Version: 1.0
-- Date: 26 January 2026
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

  -- Goal settings
  goal TEXT CHECK (goal IN ('general', 'race', 'improvement')),
  race_distance TEXT CHECK (race_distance IN ('5k', '10k', 'half', 'marathon')),
  race_date DATE,
  target_time_seconds INTEGER, -- Target finish time in seconds

  -- Current fitness (from test or self-reported)
  current_5k_pace_seconds INTEGER, -- Pace per km in seconds (e.g., 360 = 6:00/km)
  current_weekly_km DECIMAL(5,1), -- Average weekly distance

  -- Calculated pace zones (seconds per km)
  zone1_pace_seconds INTEGER, -- Recovery/Easy (very slow)
  zone2_pace_seconds INTEGER, -- Easy/Aerobic
  zone3_pace_seconds INTEGER, -- Tempo/Threshold
  zone4_pace_seconds INTEGER, -- Interval/VO2max
  zone5_pace_seconds INTEGER, -- Sprint/Repetition

  -- Onboarding status
  onboarding_stage TEXT DEFAULT 'started' CHECK (onboarding_stage IN (
    'started',            -- Just /start, no data yet
    'profile',            -- Collecting basic info (level)
    'physical',           -- Collecting physical data (age, height, weight)
    'running_info',       -- Collecting running experience
    'goal',               -- Setting pace
    'goal_type',          -- Setting weekly_runs and goal type
    'race_details',       -- For race goal: collecting date, distance, target time
    'improvement_details', -- For improvement goal: collecting target result and timeline
    'completed'           -- Ready to use
  )),
  onboarding_data JSONB DEFAULT '{}', -- Temporary storage for onboarding answers

  -- Status
  is_active BOOLEAN DEFAULT true,
  timezone TEXT DEFAULT 'Europe/Moscow',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast Telegram ID lookup
CREATE INDEX idx_users_telegram_id ON users(telegram_id);

-- ============================================
-- TABLE: weekly_plans
-- Weekly training plans
-- ============================================
CREATE TABLE weekly_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Week boundaries
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  week_number INTEGER, -- Week of training cycle (1, 2, 3, etc.)

  -- Plan data (JSON structure)
  plan_data JSONB NOT NULL,
  /*
  Structure of plan_data:
  {
    "monday": {
      "type": "easy_run",
      "distance_km": 5,
      "pace_range": "6:00-6:30",
      "duration_minutes": 30,
      "notes": "Easy pace, feel comfortable",
      "completed": false,
      "completed_at": null
    },
    "tuesday": {
      "type": "rest",
      "notes": "Full rest day",
      "completed": false
    },
    "wednesday": {
      "type": "intervals",
      "distance_km": 8,
      "warmup_km": 2,
      "cooldown_km": 2,
      "intervals": "5x1km @ 5:00 pace, 2 min recovery",
      "notes": "VO2max workout",
      "completed": false
    },
    ...
  }

  Training types:
  - rest: Full rest day
  - easy_run: Easy/recovery pace
  - long_run: Long slow distance
  - tempo: Tempo/threshold run
  - intervals: Speed intervals
  - fartlek: Varied pace play
  - race: Race day
  */

  -- Summary stats (calculated)
  total_distance_km DECIMAL(5,1),
  total_sessions INTEGER,
  completed_sessions INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_week CHECK (week_end > week_start),
  CONSTRAINT unique_user_week UNIQUE (user_id, week_start)
);

-- Indexes
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

  -- When
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  day_of_week TEXT, -- 'monday', 'tuesday', etc.

  -- Training type
  type TEXT CHECK (type IN (
    'easy_run', 'long_run', 'tempo', 'intervals',
    'fartlek', 'recovery', 'race', 'other'
  )),

  -- Core metrics
  distance_km DECIMAL(5,2) NOT NULL CHECK (distance_km > 0),
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
  avg_pace_seconds INTEGER, -- Calculated: duration_seconds / distance_km

  -- Optional metrics
  avg_heart_rate INTEGER CHECK (avg_heart_rate > 0 AND avg_heart_rate < 250),
  max_heart_rate INTEGER CHECK (max_heart_rate > 0 AND max_heart_rate < 250),
  elevation_gain_m INTEGER,
  calories INTEGER,

  -- Subjective data
  feeling TEXT CHECK (feeling IN ('great', 'good', 'ok', 'tired', 'exhausted')),
  rpe INTEGER CHECK (rpe >= 1 AND rpe <= 10), -- Rate of Perceived Exertion
  notes TEXT,

  -- Was this planned?
  is_planned BOOLEAN DEFAULT true, -- true = from weekly plan, false = spontaneous

  -- Source of data
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'screenshot', 'voice')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_trainings_user_id ON trainings(user_id);
CREATE INDEX idx_trainings_date ON trainings(date);
CREATE INDEX idx_trainings_weekly_plan_id ON trainings(weekly_plan_id);

-- ============================================
-- TABLE: chat_history
-- Conversation history for AI context
-- ============================================
CREATE TABLE chat_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Message data
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,

  -- Message type for filtering
  message_type TEXT DEFAULT 'general' CHECK (message_type IN (
    'general',     -- Regular chat
    'onboarding',  -- Onboarding conversation
    'planning',    -- Plan generation
    'logging',     -- Training logging
    'feedback'     -- AI feedback on training
  )),

  -- Metadata
  telegram_message_id BIGINT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
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

  -- All-time stats
  total_distance_km DECIMAL(8,2) DEFAULT 0,
  total_trainings INTEGER DEFAULT 0,
  total_duration_seconds INTEGER DEFAULT 0,

  -- Current month
  month_distance_km DECIMAL(6,2) DEFAULT 0,
  month_trainings INTEGER DEFAULT 0,

  -- Current week
  week_distance_km DECIMAL(5,2) DEFAULT 0,
  week_trainings INTEGER DEFAULT 0,

  -- Streaks
  current_streak_days INTEGER DEFAULT 0,
  longest_streak_days INTEGER DEFAULT 0,

  -- Personal bests
  pb_5k_seconds INTEGER,
  pb_10k_seconds INTEGER,
  pb_half_seconds INTEGER,
  pb_marathon_seconds INTEGER,

  -- Last activity
  last_training_date DATE,

  -- Timestamps
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_user_stats_user_id ON user_stats(user_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to calculate pace from duration and distance
CREATE OR REPLACE FUNCTION calculate_pace(duration_sec INTEGER, distance DECIMAL)
RETURNS INTEGER AS $$
BEGIN
  IF distance > 0 THEN
    RETURN ROUND(duration_sec / distance);
  END IF;
  RETURN NULL;
END;
$$ language 'plpgsql';

-- Function to format seconds as pace string (e.g., 360 -> "6:00")
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

-- Auto-update updated_at for users
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at for weekly_plans
CREATE TRIGGER update_weekly_plans_updated_at
  BEFORE UPDATE ON weekly_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-calculate avg_pace for trainings
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
-- For Supabase - users can only access their own data
-- ============================================

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

-- Note: RLS policies should be configured based on your auth setup
-- For N8N access, you'll use service_role key which bypasses RLS

-- ============================================
-- SAMPLE DATA FOR TESTING (optional)
-- ============================================

-- Uncomment to insert test user:
/*
INSERT INTO users (telegram_id, username, first_name, level, goal, onboarding_stage)
VALUES (123456789, 'test_user', 'Test', 'intermediate', 'general', 'completed');
*/

-- ============================================
-- USEFUL QUERIES
-- ============================================

-- Get user with their current week plan:
/*
SELECT u.*, wp.plan_data, wp.status as plan_status
FROM users u
LEFT JOIN weekly_plans wp ON u.id = wp.user_id
  AND wp.status = 'active'
  AND CURRENT_DATE BETWEEN wp.week_start AND wp.week_end
WHERE u.telegram_id = $1;
*/

-- Get recent trainings for user:
/*
SELECT * FROM trainings
WHERE user_id = $1
ORDER BY date DESC
LIMIT 10;
*/

-- Get chat history for context (last 20 messages):
/*
SELECT role, content, created_at
FROM chat_history
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 20;
*/
