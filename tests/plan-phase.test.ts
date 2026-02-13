import { describe, it, expect } from 'vitest';
import { buildWeeklyPlan } from '../src/engine/plan-builder.js';

const user = {
  id: 'u1',
  telegram_id: 1,
  level: 'intermediate',
  weekly_runs: 3,
  current_5k_pace_seconds: 360
};

describe('plan builder phase scaling', () => {
  it('scales distances to phase target range', () => {
    const dates = [
      new Date('2026-02-16'),
      new Date('2026-02-17'),
      new Date('2026-02-18')
    ];
    const plan = buildWeeklyPlan({
      user: user as any,
      dates,
      strategy: {
        start_date: '2026-01-01',
        phases: [
          { name: 'base', display_name: 'База', start_week: 1, end_week: 10, target_weekly_km_min: 30, target_weekly_km_max: 32 }
        ] as any
      }
    });
    expect(plan.total_km).toBeGreaterThanOrEqual(30);
  });
});
