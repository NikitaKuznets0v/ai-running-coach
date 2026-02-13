import type { WeeklyPlanData } from '../domain/plan-types.js';

export function renderPlan(plan: WeeklyPlanData): string {
  const header = `План на неделю (${plan.week_start} - ${plan.week_end}):`;
  const body = plan.workouts.map((w, idx) => {
    return `${idx + 1}. ${w.day_ru} (${w.date})\n` +
      `- Тип: ${w.type_ru}\n` +
      `- Дистанция: ${w.distance_km} км\n` +
      `- Целевой темп: ${w.target_pace_min_km}/км (${w.treadmill_kmh} км/ч)\n` +
      `- RPE: ${w.rpe}`;
  }).join('\n\n');

  return `${header}\n\n${body}`;
}
