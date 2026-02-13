import { describe, it, expect } from 'vitest';
import { calculateAdaptation, calculateCompliance } from '../src/engine/adaptation.js';

const plan = {
  week_start: '2026-02-03',
  week_end: '2026-02-09',
  total_km: 10,
  raw_plan: 'x',
  meta: { generator: 'ts-bot', version: 'v1', created_at: 'x' },
  workouts: [
    { date: '2026-02-03', day_ru: 'понедельник', type: 'easy_run', type_ru: 'Лёгкий бег', description: '', distance_km: 5, target_pace_min_km: '6:00', treadmill_kmh: 10, rpe: 4 },
    { date: '2026-02-06', day_ru: 'четверг', type: 'long_run', type_ru: 'Длинная пробежка', description: '', distance_km: 5, target_pace_min_km: '6:30', treadmill_kmh: 9.2, rpe: 5 }
  ]
};

describe('adaptation', () => {
  it('increases volume when compliance is high', () => {
    const compliance = calculateCompliance(plan as any, [
      { user_id: 'u1', date: '2026-02-03', distance_km: 6, duration_seconds: 2000 },
      { user_id: 'u1', date: '2026-02-06', distance_km: 6, duration_seconds: 2400 }
    ] as any);
    const decision = calculateAdaptation(compliance, 0);
    expect(decision.volumeAdjustment).toBeGreaterThan(0);
  });

  it('reduces volume when compliance is low', () => {
    const compliance = calculateCompliance(plan as any, [
      { user_id: 'u1', date: '2026-02-03', distance_km: 3, duration_seconds: 1500 }
    ] as any);
    const decision = calculateAdaptation(compliance, 0);
    expect(decision.volumeAdjustment).toBeLessThan(0);
    expect(compliance.missedTypes.length).toBeGreaterThan(0);
  });
});
