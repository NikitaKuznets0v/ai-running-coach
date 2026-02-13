import { describe, it, expect, vi } from 'vitest';
import { handlePlanRequest } from '../src/handlers/plan.js';
import * as strategy from '../src/services/strategy.js';
import * as weekly from '../src/services/weekly-plan.js';
import * as trainings from '../src/services/trainings.js';

const user = {
  id: 'u1',
  telegram_id: 1,
  level: 'intermediate',
  weekly_runs: 3,
  preferred_training_days: null,
  current_5k_pace_seconds: 360
};

describe('plan edge cases', () => {
  it('treats "с понедельника" as next-week request', async () => {
    vi.spyOn(strategy, 'getActiveStrategy').mockResolvedValueOnce(null as any);
    vi.spyOn(weekly, 'saveWeeklyPlan').mockResolvedValueOnce({} as any);
    vi.spyOn(weekly, 'getPlanByWeekStart').mockResolvedValueOnce(null as any);
    vi.spyOn(trainings, 'getTrainingsInRange').mockResolvedValueOnce([] as any);
    const res = await handlePlanRequest(user as any, 'с понедельника');
    expect(String(res)).toContain('План на неделю');
  });

  it('treats "следующую" as next-week request', async () => {
    vi.spyOn(strategy, 'getActiveStrategy').mockResolvedValueOnce(null as any);
    vi.spyOn(weekly, 'saveWeeklyPlan').mockResolvedValueOnce({} as any);
    vi.spyOn(weekly, 'getPlanByWeekStart').mockResolvedValueOnce(null as any);
    vi.spyOn(trainings, 'getTrainingsInRange').mockResolvedValueOnce([] as any);
    const res = await handlePlanRequest(user as any, 'следующую');
    expect(String(res)).toContain('План на неделю');
  });
});
