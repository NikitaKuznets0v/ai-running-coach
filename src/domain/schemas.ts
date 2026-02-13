import { z } from 'zod';

export const LevelSchema = z.enum(['beginner', 'intermediate', 'advanced']);

export const OnboardingStageSchema = z.enum([
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
]);

export const UserProfilePatchSchema = z.object({
  telegram_id: z.number().int().positive(),
  first_name: z.string().optional(),
  last_name: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  level: LevelSchema.optional(),
  age: z.number().int().min(10).max(99).optional(),
  height_cm: z.number().int().min(120).max(230).optional(),
  weight_kg: z.number().min(30).max(250).optional(),
  weekly_runs: z.number().int().min(1).max(7).optional(),
  preferred_training_days: z.string().nullable().optional(),
  resting_hr: z.number().int().min(30).max(120).nullable().optional(),
  current_5k_pace_seconds: z.number().int().min(150).max(900).optional(),
  has_lab_testing: z.boolean().optional(),
  vo2max: z.number().min(20).max(100).nullable().optional(),
  lthr: z.number().int().min(100).max(220).nullable().optional(),
  race_distance: z.string().nullable().optional(),
  race_distance_km: z.number().min(1).max(100).nullable().optional(),
  race_date: z.string().nullable().optional(),
  target_time_seconds: z.number().int().min(600).max(20000).nullable().optional(),
  onboarding_stage: OnboardingStageSchema.optional()
}).passthrough();
