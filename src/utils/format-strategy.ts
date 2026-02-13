import type { StrategyPhase } from '../engine/strategy-builder.js';

const DISTANCE_NAMES: Record<string, string> = {
  '5k': '5 км',
  '10k': '10 км',
  'half': 'полумарафон',
  'marathon': 'марафон'
};

export function formatStrategyPreview(phases: StrategyPhase[], raceDate: string, raceDistance: string): string {
  const dist = DISTANCE_NAMES[raceDistance] || raceDistance || 'забег';
  const lines: string[] = [];

  lines.push(`12-недельная стратегия подготовки к ${dist}:`);
  if (raceDate) lines.push(`Дата старта: ${raceDate}`);
  lines.push('');

  for (const p of phases) {
    const km = ('target_weekly_km_min' in p && 'target_weekly_km_max' in p)
      ? ` (${p.target_weekly_km_min}-${p.target_weekly_km_max} км/нед)`
      : '';
    lines.push(`${p.display_name} (нед. ${p.start_week}-${p.end_week}): ${p.focus}${km}`);
  }

  return lines.join('\n');
}
