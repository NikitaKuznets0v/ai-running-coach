import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config.js';
import type { UserProfile } from '../domain/types.js';
import { buildPhases, strategyStartDate } from '../engine/strategy-builder.js';

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseServiceKey, {
  auth: { persistSession: false }
});

export async function getActiveStrategy(userId: string) {
  const { data, error } = await supabase
    .from('training_strategies')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createStrategy(user: UserProfile) {
  const phases = buildPhases(user);

  // Calculate start: 12 weeks before race, or today if no race date
  let startDate: Date;
  if (user.race_date) {
    startDate = strategyStartDate(user.race_date);
  } else {
    startDate = new Date();
  }

  const { data, error } = await supabase
    .from('training_strategies')
    .insert({
      user_id: user.id,
      goal_type: user.goal || 'race',
      race_distance: user.race_distance || null,
      race_distance_km: user.race_distance_km || null,
      race_date: user.race_date || null,
      target_time_seconds: user.target_time_seconds || null,
      total_weeks: 12,
      start_date: startDate.toISOString().slice(0, 10),
      phases,
      status: 'active'
    })
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateStrategyStartDate(strategyId: string, startDate: string) {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 12 * 7 - 1);

  const { error } = await supabase
    .from('training_strategies')
    .update({
      start_date: startDate,
      end_date: endDate.toISOString().slice(0, 10)
    })
    .eq('id', strategyId);

  if (error) throw error;
}
