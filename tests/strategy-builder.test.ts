import { describe, it, expect } from 'vitest';
import { buildPhases } from '../src/engine/strategy-builder.js';

const user = { level: 'intermediate', current_weekly_km: 30 } as any;

describe('strategy builder', () => {
  it('builds 4 phases', () => {
    const phases = buildPhases(user);
    expect(phases.length).toBe(4);
    expect(phases[0].name).toBe('base');
    expect(phases[3].name).toBe('taper');
  });
});
