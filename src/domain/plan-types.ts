export type WorkoutType = 'easy_run' | 'long_run' | 'tempo' | 'intervals' | 'recovery' | 'fartlek';

export interface WorkoutPlan {
  date: string; // YYYY-MM-DD
  day_ru: string;
  type: WorkoutType;
  type_ru: string;
  description: string;
  distance_km: number;
  target_pace_min_km: string;
  treadmill_kmh: number;
  target_hr?: string | null;
  rpe: number;
}

export interface WeeklyPlanData {
  week_start: string;
  week_end: string;
  total_km: number;
  workouts: WorkoutPlan[];
  raw_plan: string;
  meta: {
    generator: 'ts-bot';
    version: string;
    created_at: string;
    adjustment_percent?: number;
    adjustment_reason?: string;
    compliance_percent?: number;
    is_recovery_week?: boolean;
  };
}
