import OpenAI from 'openai';
import { CONFIG } from '../config.js';
import type { UserProfile } from '../domain/types.js';
import { getKnowledge } from './knowledge.js';
import { getActivePlan } from '../services/weekly-plan.js';
import { getActiveStrategy } from '../services/strategy.js';

const client = new OpenAI({ apiKey: CONFIG.openaiApiKey });

const SYSTEM = `Ты тренер по бегу. Тон — дружелюбный и конкретный. Не выдумывай факты.
Если данных нет — скажи, что их нет. Используй контекст профиля и плана.`;

export async function chatReply(user: UserProfile, message: string): Promise<string> {
  if (!CONFIG.openaiApiKey) return 'GPT сейчас недоступен. Спроси конкретнее.';

  const planRow = await getActivePlan(user.id);
  const strategy = await getActiveStrategy(user.id);
  const knowledge = getKnowledge();

  const context = {
    user: {
      level: user.level,
      weekly_runs: user.weekly_runs,
      preferred_training_days: user.preferred_training_days,
      current_5k_pace_seconds: user.current_5k_pace_seconds,
      resting_hr: user.resting_hr,
      race_date: user.race_date,
      race_distance: user.race_distance
    },
    plan: planRow?.plan_data || null,
    strategy: strategy ? { start_date: strategy.start_date, phases: strategy.phases } : null,
    knowledge: {
      trainingTypes: knowledge.trainingTypes,
      paceZones: knowledge.paceZones
    }
  };

  const res = await client.chat.completions.create({
    model: CONFIG.openaiChatModel || 'gpt-4o-mini',
    temperature: 0.6,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: JSON.stringify({ message, context }) }
    ]
  });

  return res.choices[0]?.message?.content?.trim() || 'Не удалось сформировать ответ.';
}
