export interface PaceZone {
  name: string;
  min_sec_per_km: number;
  max_sec_per_km: number;
}

// Simple deterministic zones based on 5k pace.
// These are starter defaults; can be replaced by knowledge-based tables later.
export function calculatePaceZones(pace5kSec: number) {
  const z1: PaceZone = { name: 'Z1 Recovery', min_sec_per_km: Math.round(pace5kSec * 1.45), max_sec_per_km: Math.round(pace5kSec * 1.7) };
  const z2: PaceZone = { name: 'Z2 Easy', min_sec_per_km: Math.round(pace5kSec * 1.25), max_sec_per_km: Math.round(pace5kSec * 1.45) };
  const z3: PaceZone = { name: 'Z3 Tempo', min_sec_per_km: Math.round(pace5kSec * 1.08), max_sec_per_km: Math.round(pace5kSec * 1.25) };
  const z4: PaceZone = { name: 'Z4 Threshold', min_sec_per_km: Math.round(pace5kSec * 0.98), max_sec_per_km: Math.round(pace5kSec * 1.08) };
  const z5: PaceZone = { name: 'Z5 Interval', min_sec_per_km: Math.round(pace5kSec * 0.88), max_sec_per_km: Math.round(pace5kSec * 0.98) };
  return { z1, z2, z3, z4, z5 };
}

export function paceToSpeedKmh(secPerKm: number): number {
  return Math.round((3600 / secPerKm) * 10) / 10;
}
