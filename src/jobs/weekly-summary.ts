import cron from 'node-cron';
import type { Bot } from 'grammy';
import { getCompletedUsers } from '../services/supabase.js';
import { getPlanByWeekStart, saveWeeklyPlan, getWeeksSinceRecovery } from '../services/weekly-plan.js';
import { getTrainingsInRange } from '../services/trainings.js';
import { calculateCompliance, calculateAdaptation } from '../engine/adaptation.js';
import { calculateTrainingIndex } from '../engine/training-index.js';
import { buildWeeklyPlan } from '../engine/plan-builder.js';
import { getActiveStrategy } from '../services/strategy.js';
import { renderPlan } from '../ai/presenter.js';
import { renderWeeklySummary } from '../ai/motivator.js';
import { mondayOfWeek, weekRangeFromMonday, toISO } from '../utils/dates.js';
import { CONFIG } from '../config.js';

function buildWeekDates(monday: Date): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
  }
  return dates;
}

export async function runWeeklySummary(bot: Bot) {
  const users = await getCompletedUsers();
  const now = new Date();
  const monday = mondayOfWeek(now);
  const range = weekRangeFromMonday(monday);
  const weekStart = toISO(range.start);
  const weekEnd = toISO(range.end);

  for (const user of users) {
    try {
      const planRow = await getPlanByWeekStart(user.id, weekStart);
      if (!planRow?.plan_data) continue;

      const trainings = await getTrainingsInRange(user.id, weekStart, weekEnd);
      const compliance = calculateCompliance(planRow.plan_data, trainings as any);
      const weeksSinceRecovery = await getWeeksSinceRecovery(user.id);
      const trainingIndex = calculateTrainingIndex(trainings as any, now);
      const decision = calculateAdaptation(compliance, weeksSinceRecovery, trainingIndex.form);

      const nextMonday = new Date(monday);
      nextMonday.setDate(nextMonday.getDate() + 7);
      const nextDates = buildWeekDates(nextMonday);

      const strategy = await getActiveStrategy(user.id);
      const nextPlan = buildWeeklyPlan({
        user,
        dates: nextDates,
        volumeAdjustment: decision.volumeAdjustment,
        removeIntervals: decision.removeIntervals,
        strategy: strategy ? { start_date: strategy.start_date, phases: strategy.phases } : null
      });
      nextPlan.meta.adjustment_reason = decision.reason;
      nextPlan.meta.compliance_percent = compliance.compliancePercent;
      nextPlan.meta.is_recovery_week = decision.isRecoveryWeek;

      await saveWeeklyPlan(user.id, nextPlan);

      const nextPlanText = renderPlan(nextPlan);
      const summary = renderWeeklySummary({
        weekStart,
        weekEnd,
        compliance,
        decision,
        index: trainingIndex,
        nextPlanText
      });

      await bot.api.sendMessage(user.telegram_id, summary);
    } catch (err) {
      console.error('weekly summary failed', { userId: user.id, err });
    }
  }
}

export function startWeeklySummaryCron(bot: Bot) {
  cron.schedule('0 20 * * 0', () => {
    runWeeklySummary(bot);
  }, { timezone: CONFIG.tz });
}
