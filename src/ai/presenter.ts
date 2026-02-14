import type { WeeklyPlanData } from '../domain/plan-types.js';

function formatDuration(distanceKm: number, speedKmh: number): string {
  const hours = distanceKm / speedKmh;
  const minutes = Math.round(hours * 60);
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0) return `${hrs}ч ${mins}м`;
  return `${mins} мин`;
}

export function renderPlan(plan: WeeklyPlanData): string {
  const header = `План на неделю (${plan.week_start} - ${plan.week_end}):`;
  const body = plan.workouts.map((w, idx) => {
    const duration = formatDuration(w.distance_km, w.treadmill_kmh);
    const hrLine = w.target_hr ? `- Целевой пульс: ${w.target_hr}\n` : '';

    return `${idx + 1}. ${w.day_ru} (${w.date})\n` +
      `- Тип: ${w.type_ru}\n` +
      `- Дистанция: ${w.distance_km} км (≈${duration})\n` +
      `- Целевой темп: ${w.target_pace_min_km}/км (${w.treadmill_kmh} км/ч)\n` +
      hrLine +
      `- Усилие: ${w.rpe}/10`;
  }).join('\n\n');

  return `${header}\n\n${body}`;
}
