export type Intent = 'plan_request' | 'plan_convert' | 'training_log' | 'general';

export function detectIntent(message: string): Intent {
  const m = message.toLowerCase();

  // Plan conversion: convert km to minutes
  if (/перевед|пересч|конверт|в минут|время вместо км/.test(m)) return 'plan_convert';

  // Plan request: ask for new plan
  if (/начинаем|с понедельника|эту неделю|следующую|план|программ/.test(m)) return 'plan_request';

  // Training log: ONLY when user reports COMPLETED training (past tense)
  // "пробежал 5 км", "бежал сегодня", "закончил тренировку"
  if (/пробежал|бежал|закончил трениров|сделал трениров|выполнил|завершил/.test(m)) return 'training_log';

  // Training log: metrics that indicate completed training
  // "5 км за 30 минут", "пульс средний 140"
  if (/\d+\s*км\s+за\s+\d+|пульс средний|пульс макс|средний пульс|максимальный пульс/.test(m)) return 'training_log';

  // Everything else is general chat
  return 'general';
}
