import { supabase } from './supabase.js';
import type { TrainingLogRecord } from '../domain/training.js';

export async function insertTraining(log: TrainingLogRecord) {
  const { data, error } = await supabase
    .from('trainings')
    .insert({
      user_id: log.user_id,
      weekly_plan_id: log.weekly_plan_id || null,
      day_of_week: log.day_of_week || null,
      type: log.type || null,
      date: log.date,
      distance_km: log.distance_km,
      duration_seconds: log.duration_seconds,
      avg_heart_rate: log.avg_heart_rate || null,
      max_heart_rate: log.max_heart_rate || null,
      rpe: log.rpe || null,
      feeling: log.feeling || null,
      notes: log.notes || null,
      is_planned: typeof log.is_planned === 'boolean' ? log.is_planned : null,
      source: log.source || 'manual'
    })
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) {
    if ((error as any).code === '23505') return null;
    throw error;
  }
  return data;
}

export async function getTrainingsInRange(userId: string, start: string, end: string) {
  const { data, error } = await supabase
    .from('trainings')
    .select('*')
    .eq('user_id', userId)
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getTrainingByDate(userId: string, date: string) {
  const { data, error } = await supabase
    .from('trainings')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getLatestTraining(userId: string) {
  const { data, error } = await supabase
    .from('trainings')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getLatestScreenshot(userId: string) {
  const { data, error } = await supabase
    .from('trainings')
    .select('*')
    .eq('user_id', userId)
    .eq('source', 'screenshot')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateTraining(id: string, patch: Record<string, any>) {
  const { data, error } = await supabase
    .from('trainings')
    .update(patch)
    .eq('id', id)
    .select('*')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
