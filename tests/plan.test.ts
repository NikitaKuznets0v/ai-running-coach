import { describe, it, expect } from 'vitest';
import { buildWeeklyPlan } from '../src/engine/plan-builder.js';

const user = {
  id: 'u1',
  telegram_id: 1,
  level: 'intermediate',
  weekly_runs: 3,
  preferred_training_days: 'понедельник, среда, пятница',
  current_5k_pace_seconds: 360
};

describe('plan builder', () => {
  it('builds plan respecting weekly_runs', () => {
    const dates = [
      new Date('2026-02-16'),
      new Date('2026-02-17'),
      new Date('2026-02-18'),
      new Date('2026-02-19')
    ];
    const plan = buildWeeklyPlan({ user: user as any, dates });
    expect(plan.workouts.length).toBe(3);
  });

  it('prefers training days when provided', () => {
    const dates = [
      new Date('2026-02-16'), // Monday
      new Date('2026-02-17'),
      new Date('2026-02-18'), // Wednesday
      new Date('2026-02-19'),
      new Date('2026-02-20') // Friday
    ];
    const plan = buildWeeklyPlan({ user: user as any, dates });
    const days = plan.workouts.map((w) => w.day_ru);
    expect(days).toContain('понедельник');
    expect(days).toContain('среда');
  });
});
