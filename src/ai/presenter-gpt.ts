import type { WeeklyPlanData } from '../domain/plan-types.js';
import { extractWithOpenAI } from '../services/openai.js';

const PROMPT = `Ты помощник тренера по бегу. Преврати структурированный план в аккуратный текст для Telegram.\n\nПравила:\n1) Строго сохраняй порядок тренировок и даты.\n2) Не добавляй новые тренировки.\n3) Объём указывай в километрах. Минуты можно только в скобках как справку.\n4) Формат: каждый день с новой строки, внутри — пункты.\n5) Без приветствий.`;

export async function renderPlanWithGPT(plan: WeeklyPlanData): Promise<string> {
  const res = await extractWithOpenAI(PROMPT, JSON.stringify(plan));
  if (typeof res === 'object' && res && typeof (res as any).text === 'string') {
    return (res as any).text;
  }
  // fallback to deterministic string
  return plan.raw_plan || '';
}
