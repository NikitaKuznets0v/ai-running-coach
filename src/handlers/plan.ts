import type { UserProfile } from '../domain/types.js';
import { buildWeeklyPlan } from '../engine/plan-builder.js';
import { renderPlan } from '../ai/presenter.js';
import { renderPlanWithGPT } from '../ai/presenter-gpt.js';
import { saveWeeklyPlan, getActivePlan, getPlanByWeekStart } from '../services/weekly-plan.js';
import { getActiveStrategy } from '../services/strategy.js';
import { nextMondayFrom, remainingWeekDates, weekRangeFromMonday, toISO } from '../utils/dates.js';
import { getTrainingsInRange } from '../services/trainings.js';
import { calculateAdaptation, calculateCompliance } from '../engine/adaptation.js';
import { calculateTrainingIndex } from '../engine/training-index.js';
import { weeksSince } from '../engine/phases.js';

const useGptPresenter = () => process.env.USE_GPT_PRESENTER === '1';

export async function handlePlanRequest(user: UserProfile, message: string) {
  const now = new Date();
  const m = message.toLowerCase();
  const isMidWeek = now.getDay() !== 1;

  if (isMidWeek && /начинаем/.test(m) && !/эту|следующую|с понедельника/.test(m)) {
    return 'Хочешь начать тренировки с оставшихся дней этой недели? Или подождать и начать с полной недели (с понедельника)?';
  }

  let dates: Date[] = [];
  if (isMidWeek && /эту|текущ/.test(m)) {
    dates = remainingWeekDates(now);
  } else {
    const monday = nextMondayFrom(now);
    const range = weekRangeFromMonday(monday);
    dates = [];
    for (let i = 0; i < 7; i++) {
      dates.push(new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate() + i));
    }
  }

  const strategy = await getActiveStrategy(user.id);

  let volumeAdjustment = 0;
  let removeIntervals = false;
  let adjustmentReason = '';
  let compliancePercent: number | null = null;

  const isFullWeek = dates.length === 7 && dates[0]?.getDay() === 1;
  if (isFullWeek) {
    const prevMonday = new Date(dates[0]);
    prevMonday.setDate(prevMonday.getDate() - 7);
    const prevRange = weekRangeFromMonday(prevMonday);
    const prevStart = toISO(prevRange.start);
    const prevEnd = toISO(prevRange.end);
    const prevPlan = await getPlanByWeekStart(user.id, prevStart);
    if (prevPlan?.plan_data?.workouts?.length) {
      const trainings = await getTrainingsInRange(user.id, prevStart, prevEnd);
      const compliance = calculateCompliance(prevPlan.plan_data, trainings as any);
      const trainingIndex = calculateTrainingIndex(trainings as any, now);
      const weeks = strategy?.start_date ? weeksSince(new Date(strategy.start_date), now) : 0;
      const decision = calculateAdaptation(compliance, weeks, trainingIndex.form);
      volumeAdjustment = decision.volumeAdjustment;
      removeIntervals = !!decision.removeIntervals;
      adjustmentReason = decision.reason;
      compliancePercent = compliance.compliancePercent;
    }
  }

  const plan = buildWeeklyPlan({
    user,
    dates,
    volumeAdjustment,
    removeIntervals,
    strategy: strategy ? { start_date: strategy.start_date, phases: strategy.phases } : null
  });

  plan.meta.adjustment_reason = adjustmentReason || undefined;
  plan.meta.compliance_percent = compliancePercent || undefined;

  await saveWeeklyPlan(user.id, plan);

  if (useGptPresenter()) {
    return await renderPlanWithGPT(plan);
  }

  return renderPlan(plan);
}

export async function handlePlanConvert(user: UserProfile) {
  const active = await getActivePlan(user.id);
  const plan = active?.plan_data;
  if (!plan || !plan.workouts) {
    return 'Активный план не найден. Сначала сформируй план на неделю.';
  }

  // Convert km to minutes using target pace
  const text = plan.workouts.map((w: any, idx: number) => {
    const paceParts = String(w.target_pace_min_km || '6:00').split(':');
    const paceSec = Number(paceParts[0]) * 60 + Number(paceParts[1] || 0);
    const minutes = Math.round((w.distance_km * paceSec) / 60);
    return `${idx + 1}. ${w.day_ru} (${w.date})\n` +
      `- Тип: ${w.type_ru}\n` +
      `- Дистанция: ${minutes} мин (${w.distance_km} км, темп ${w.target_pace_min_km}/км)\n` +
      `- RPE: ${w.rpe}`;
  }).join('\n\n');

  return `План в минутах:\n\n${text}`;
}
