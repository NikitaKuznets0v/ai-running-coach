import type { UserProfile } from '../domain/types.js';
import { getActivePlan } from '../services/weekly-plan.js';
import { getActiveStrategy } from '../services/strategy.js';

function isExplainIntent(message: string) {
  const m = message.toLowerCase();
  return /почему такой план|почему так|объясни план|поясни план/.test(m);
}

export async function handlePlanExplain(user: UserProfile, message: string) {
  if (!isExplainIntent(message)) return null;
  const planRow = await getActivePlan(user.id);
  const plan = planRow?.plan_data;
  if (!plan?.workouts?.length) return 'План не найден. Сначала сформируй план на неделю.';

  const strategy = await getActiveStrategy(user.id);
  const phaseName = strategy?.phases?.length ? strategy.phases[0]?.display_name || strategy.phases[0]?.name : 'текущая фаза';
  const adjust = plan.meta.adjustment_percent ? `${plan.meta.adjustment_percent}%` : 'без изменений';
  const reason = plan.meta.adjustment_reason || 'данные недели в норме';
  const pref = user.preferred_training_days ? `, с учётом дней: ${user.preferred_training_days}` : '';

  return `План построен на основе твоего уровня и текущей стратегии (${phaseName})${pref}. ` +
    `Коррекция объёма: ${adjust} (${reason}). ` +
    `Типы тренировок распределены для баланса выносливости/скорости.`;
}
