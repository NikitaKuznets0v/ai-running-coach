import type { UserProfile } from '../domain/types.js';
import { getActivePlan, saveWeeklyPlan } from '../services/weekly-plan.js';
import { parseReschedule, resolveDateFromDay, dayRuByIndex } from '../utils/parse-reschedule.js';

function isRescheduleIntent(message: string) {
  const m = message.toLowerCase();
  return /перенес|перенести|сдвин|поменяй|передвин/.test(m);
}

export async function handlePlanAdjust(user: UserProfile, message: string) {
  if (!isRescheduleIntent(message)) return null;

  const planRow = await getActivePlan(user.id);
  const plan = planRow?.plan_data;
  if (!plan?.workouts?.length) {
    return 'Активный план не найден. Сначала сформируй план на неделю.';
  }

  const now = new Date();
  const parsed = parseReschedule(message, now);
  if (!parsed.date && parsed.day === null) {
    return 'Не понял новую дату. Пример: "перенеси тренировку на четверг" или "на 18.02".';
  }

  const targetDate = parsed.date || resolveDateFromDay(parsed.day as number, plan.week_start);

  const workout = plan.workouts[0];
  if (!workout) return 'План пустой.';

  // Move first workout to target date for now
  workout.date = targetDate;
  workout.day_ru = dayRuByIndex(new Date(targetDate).getDay());

  plan.raw_plan = plan.workouts.map((w: any, idx: number) => {
    return `${idx + 1}. ${w.day_ru} (${w.date})\n` +
      `- Тип: ${w.type_ru}\n` +
      `- Дистанция: ${w.distance_km} км\n` +
      `- Целевой темп: ${w.target_pace_min_km}/км (${w.treadmill_kmh} км/ч)\n` +
      `- RPE: ${w.rpe}`;
  }).join('\n\n');

  await saveWeeklyPlan(user.id, plan);

  return `Перенёс тренировку на ${workout.day_ru} (${workout.date}).`;
}
