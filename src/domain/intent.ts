export type Intent = 'plan_request' | 'plan_convert' | 'training_log' | 'general';

export function detectIntent(message: string): Intent {
  const m = message.toLowerCase();
  if (/перевед|пересч|конверт|в минут|время вместо км/.test(m)) return 'plan_convert';
  if (/начинаем|с понедельника|эту неделю|следующую|план/.test(m)) return 'plan_request';
  if (/пробежал|бежал|трениров/.test(m)) return 'training_log';
  if (/пульс|rpe|самочувств|заметк|комментар/.test(m)) return 'training_log';
  if (/перенес|перенести|сдвин|поменяй|передвин/.test(m)) return 'general';
  return 'general';
}
