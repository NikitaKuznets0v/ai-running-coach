import { describe, it, expect, vi } from 'vitest';
import { handlePlanExplain } from '../src/handlers/plan-explain.js';
import * as weekly from '../src/services/weekly-plan.js';
import * as strategy from '../src/services/strategy.js';

const user = { id: 'u1', telegram_id: 1, preferred_training_days: 'понедельник, пятница' } as any;

describe('plan explain', () => {
  it('explains plan basics', async () => {
    vi.spyOn(weekly, 'getActivePlan').mockResolvedValueOnce({
      plan_data: {
        workouts: [{ date: '2026-02-10' }],
        meta: { adjustment_percent: 0, adjustment_reason: 'ok' }
      }
    } as any);
    vi.spyOn(strategy, 'getActiveStrategy').mockResolvedValueOnce({
      phases: [{ name: 'base', display_name: 'База' }]
    } as any);

    const res = await handlePlanExplain(user, 'почему такой план');
    expect(res).toContain('База');
  });
});
