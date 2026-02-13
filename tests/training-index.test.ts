import { describe, it, expect } from 'vitest';
import { calculateTrainingIndex } from '../src/engine/training-index.js';

const now = new Date('2026-02-13T10:00:00Z');

function d(offset: number) {
  const date = new Date(now);
  date.setDate(date.getDate() - offset);
  return date.toISOString().slice(0, 10);
}

describe('training index', () => {
  it('returns optimal for empty data', () => {
    const res = calculateTrainingIndex([], now);
    expect(res.status).toBe('optimal');
    expect(res.form).toBe(0);
  });

  it('flags overtrained for heavy recent load', () => {
    const trainings = Array.from({ length: 7 }).map((_, i) => ({
      user_id: 'u1',
      date: d(i),
      distance_km: 12,
      duration_seconds: 3600
    }));
    const res = calculateTrainingIndex(trainings as any, now);
    expect(res.status).toBe('overtrained');
  });
});
