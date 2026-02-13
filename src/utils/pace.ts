export function formatPace(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export function paceToSpeedKmh(sec: number): number {
  return Math.round((3600 / sec) * 10) / 10;
}

export function estimatePaceFrom5k(pace5kSec?: number | null, factor = 1.2): number {
  const base = pace5kSec || 360;
  return Math.round(base * factor);
}
