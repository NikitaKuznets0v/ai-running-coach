export type Level = 'beginner' | 'intermediate' | 'advanced';

export type OnboardingStage =
  | 'started'
  | 'profile'
  | 'physical'
  | 'heart_rate'
  | 'running_info'
  | 'lab_testing'
  | 'training_freq'
  | 'race_details'
  | 'strategy_preview'
  | 'start_date'
  | 'completed';

export interface UserProfile {
  id: string;
  telegram_id: number;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  language?: string | null;

  gender?: 'male' | 'female' | null;
  age?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;

  level?: Level | null;
  training_type?: 'outdoor' | 'treadmill' | null;
  weekly_runs?: number | null;
  preferred_training_days?: string | null;

  goal?: 'general' | 'race' | 'improvement' | null;
  race_distance?: string | null;
  race_distance_km?: number | null;
  race_date?: string | null;
  target_time_seconds?: number | null;

  current_5k_pace_seconds?: number | null;
  current_weekly_km?: number | null;

  resting_hr?: number | null;
  max_hr?: number | null;

  has_lab_testing?: boolean | null;
  vo2max?: number | null;
  lthr?: number | null;

  onboarding_stage?: OnboardingStage;
}

export interface OnboardingStep {
  stage: OnboardingStage;
  question: string | ((user: UserProfile) => string);
  extract: (message: string) => Partial<UserProfile>;
  next: OnboardingStage;
}
