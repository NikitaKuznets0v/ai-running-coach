import { z } from 'zod';

export interface TrainingLogInput {
  date?: string; // YYYY-MM-DD
  distance_km?: number | null;
  duration_seconds?: number | null;
  duration_minutes?: number | null;
  avg_heart_rate?: number | null;
  max_heart_rate?: number | null;
  rpe?: number | null;
  feeling?: string | null;
  notes?: string | null;
}

export interface TrainingLogRecord {
  user_id: string;
  date: string;
  distance_km: number;
  duration_seconds: number;
  avg_heart_rate?: number | null;
  max_heart_rate?: number | null;
  rpe?: number | null;
  feeling?: string | null;
  notes?: string | null;
  weekly_plan_id?: string | null;
  day_of_week?: string | null;
  type?: string | null;
  is_planned?: boolean | null;
  source?: 'manual' | 'screenshot' | 'voice' | null;
}

export const TrainingLogSchema = z.object({
  date: z.string().optional(),
  distance_km: z.number().positive().optional(),
  duration_seconds: z.number().int().positive().optional(),
  duration_minutes: z.number().positive().optional(),
  avg_heart_rate: z.number().int().min(40).max(240).optional(),
  max_heart_rate: z.number().int().min(40).max(260).optional(),
  rpe: z.number().int().min(1).max(10).optional(),
  feeling: z.string().optional(),
  notes: z.string().optional()
});
