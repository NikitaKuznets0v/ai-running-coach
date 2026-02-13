import type { WeeklyPlanData } from '../domain/plan-types.js';
import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config.js';

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseServiceKey, {
  auth: { persistSession: false }
});

export async function saveWeeklyPlan(userId: string, plan: WeeklyPlanData) {
  const { data, error } = await supabase
    .from('weekly_plans')
    .upsert({
      user_id: userId,
      week_start: plan.week_start,
      week_end: plan.week_end,
      plan_data: plan,
      total_distance_km: plan.total_km,
      total_sessions: plan.workouts.length,
      status: 'active'
    }, { onConflict: 'user_id,week_start' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function getActivePlan(userId: string) {
  const { data, error } = await supabase
    .from('weekly_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPlanByWeekStart(userId: string, weekStart: string) {
  const { data, error } = await supabase
    .from('weekly_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getWeeksSinceRecovery(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('weekly_plans')
    .select('plan_data')
    .eq('user_id', userId)
    .order('week_start', { ascending: false })
    .limit(8);
  if (error || !data?.length) return 0;

  let count = 0;
  for (const row of data) {
    const meta = (row.plan_data as any)?.meta;
    if (meta?.is_recovery_week) break;
    count++;
  }
  return count;
}
