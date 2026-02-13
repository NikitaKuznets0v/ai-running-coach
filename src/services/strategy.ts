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
  if (!user.race_date) return null;
  const phases = buildPhases(user);
  const startDate = strategyStartDate(user.race_date);

  const { data, error } = await supabase
    .from('training_strategies')
    .insert({
      user_id: user.id,
      goal_type: user.goal || 'race',
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
