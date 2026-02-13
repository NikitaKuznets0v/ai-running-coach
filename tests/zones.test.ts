import { describe, it, expect } from 'vitest';
import { calculatePaceZones, paceToSpeedKmh } from '../src/engine/zones.js';

describe('pace zones', () => {
  it('generates monotonic zones', () => {
    const zones = calculatePaceZones(360); // 6:00/km
    expect(zones.z1.min_sec_per_km).toBeGreaterThan(zones.z2.min_sec_per_km);
    expect(zones.z2.min_sec_per_km).toBeGreaterThan(zones.z3.min_sec_per_km);
    expect(zones.z3.min_sec_per_km).toBeGreaterThan(zones.z4.min_sec_per_km);
    expect(zones.z4.min_sec_per_km).toBeGreaterThan(zones.z5.min_sec_per_km);
  });

  it('converts pace to speed', () => {
    expect(paceToSpeedKmh(360)).toBe(10);
    expect(paceToSpeedKmh(300)).toBe(12);
  });
});
