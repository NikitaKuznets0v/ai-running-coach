import type { UserProfile } from '../domain/types.js';
import { upsertUserProfile } from '../services/supabase.js';
import { extractPreferredDays } from '../utils/parse-preferred-days.js';

function isScheduleIntent(message: string) {
  const m = message.toLowerCase();
  return /расписан|дни трениров|тренируюсь|перенастро|хочу тренир|удобн.*дн|дни\W*(пн|вт|ср|чт|пт|сб|вс)/.test(m);
}

export async function handleScheduleChange(user: UserProfile, message: string) {
  if (!isScheduleIntent(message)) return null;
  const days = extractPreferredDays(message);
  if (!days) {
    return 'Какие дни тебе удобны? Например: "хочу тренироваться в пн, ср, пт".';
  }
  await upsertUserProfile({ telegram_id: user.telegram_id, preferred_training_days: days });
  return `Обновил предпочтительные дни тренировок: ${days}.`;
}
