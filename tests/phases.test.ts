import { describe, it, expect } from 'vitest';
import { currentPhase, weeksSince } from '../src/engine/phases.js';

describe('phases', () => {
  it('calculates weeks since start', () => {
    const start = new Date('2026-01-01');
    const now = new Date('2026-01-08');
    expect(weeksSince(start, now)).toBe(1);
  });

  it('picks current phase', () => {
    const phases = [
      { name: 'base', display_name: 'База', start_week: 1, end_week: 4 },
      { name: 'build', display_name: 'Сборка', start_week: 5, end_week: 8 }
    ];
    const start = new Date('2026-01-01');
    const now = new Date('2026-02-10');
    const res = currentPhase(phases, start, now);
    expect(res.phase?.name).toBe('build');
  });
});
