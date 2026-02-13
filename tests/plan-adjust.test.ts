import { describe, it, expect, vi } from 'vitest';
import { handlePlanAdjust } from '../src/handlers/plan-adjust.js';
import * as weekly from '../src/services/weekly-plan.js';

const user = { id: 'u1', telegram_id: 1 } as any;

const planRow = {
  plan_data: {
    week_start: '2026-02-09',
    week_end: '2026-02-15',
    total_km: 10,
    raw_plan: 'x',
    meta: { generator: 'ts-bot', version: 'v1', created_at: 'x' },
    workouts: [
      { date: '2026-02-09', day_ru: 'понедельник', type: 'easy_run', type_ru: 'Лёгкий бег', description: '', distance_km: 5, target_pace_min_km: '6:00', treadmill_kmh: 10, rpe: 4 }
    ]
  }
};

describe('plan adjust', () => {
  it('moves workout to target day', async () => {
    vi.spyOn(weekly, 'getActivePlan').mockResolvedValueOnce(planRow as any);
    vi.spyOn(weekly, 'saveWeeklyPlan').mockResolvedValueOnce({} as any);
    const res = await handlePlanAdjust(user, 'перенеси тренировку на четверг');
    expect(res).toContain('четверг');
  });
});
