import { describe, it, expect, vi } from 'vitest';
import * as weeklyJob from '../src/jobs/weekly-summary.js';
import * as supa from '../src/services/supabase.js';
import * as weekly from '../src/services/weekly-plan.js';
import * as trainings from '../src/services/trainings.js';
import * as strategy from '../src/services/strategy.js';

const bot = {
  api: {
    sendMessage: vi.fn().mockResolvedValue({})
  }
} as any;

describe('weekly summary job', () => {
  it('sends summary when plan exists', async () => {
    vi.spyOn(supa, 'getCompletedUsers').mockResolvedValueOnce([{
      id: 'u1',
      telegram_id: 1001,
      level: 'beginner',
      weekly_runs: 3
    } as any]);

    vi.spyOn(weekly, 'getPlanByWeekStart').mockResolvedValueOnce({
      id: 'p1',
      plan_data: {
        week_start: '2026-02-09',
        week_end: '2026-02-15',
        total_km: 10,
        raw_plan: 'x',
        meta: { generator: 'ts-bot', version: 'v1', created_at: 'x' },
        workouts: [
          { date: '2026-02-09', day_ru: 'понедельник', type: 'easy_run', type_ru: 'Лёгкий бег', description: '', distance_km: 5, target_pace_min_km: '6:00', treadmill_kmh: 10, rpe: 4 },
          { date: '2026-02-12', day_ru: 'четверг', type: 'long_run', type_ru: 'Длинная пробежка', description: '', distance_km: 5, target_pace_min_km: '6:30', treadmill_kmh: 9.2, rpe: 5 }
        ]
      }
    } as any);

    vi.spyOn(trainings, 'getTrainingsInRange').mockResolvedValueOnce([
      { user_id: 'u1', date: '2026-02-09', distance_km: 5, duration_seconds: 1800 }
    ] as any);

    vi.spyOn(strategy, 'getActiveStrategy').mockResolvedValueOnce(null as any);
    vi.spyOn(weekly, 'saveWeeklyPlan').mockResolvedValueOnce({} as any);

    await weeklyJob.runWeeklySummary(bot);

    expect(bot.api.sendMessage).toHaveBeenCalled();
  });
});
