import { describe, it, expect, vi } from 'vitest';
import { handlePlanRequest } from '../src/handlers/plan.js';
import * as strategy from '../src/services/strategy.js';
import * as weekly from '../src/services/weekly-plan.js';

const user = {
  id: 'u1',
  telegram_id: 1,
  level: 'intermediate',
  weekly_runs: 3,
  preferred_training_days: null,
  current_5k_pace_seconds: 360
};

describe('plan mid-week logic', () => {
  it('asks choice on mid-week start', async () => {
    vi.spyOn(strategy, 'getActiveStrategy').mockResolvedValueOnce(null as any);
    const res = await handlePlanRequest(user as any, 'начинаем');
    expect(String(res)).toContain('оставшихся дней');
  });

  it('builds plan for current week when user chooses', async () => {
    vi.spyOn(strategy, 'getActiveStrategy').mockResolvedValueOnce(null as any);
    vi.spyOn(weekly, 'saveWeeklyPlan').mockResolvedValueOnce({} as any);
    const res = await handlePlanRequest(user as any, 'эту неделю');
    expect(String(res)).toContain('План на неделю');
  });
});
