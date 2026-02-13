export interface StrategyPhase {
  name: string;
  display_name: string;
  start_week: number;
  end_week: number;
}

export function weeksSince(startDate: Date, now: Date): number {
  const diff = now.getTime() - startDate.getTime();
  return Math.max(1, Math.ceil(diff / (7 * 24 * 60 * 60 * 1000)));
}

export function currentPhase(phases: StrategyPhase[], startDate: Date, now: Date) {
  const w = weeksSince(startDate, now);
  for (const p of phases) {
    if (w >= p.start_week && w <= p.end_week) return { phase: p, week: w };
  }
  return { phase: null, week: w };
}
