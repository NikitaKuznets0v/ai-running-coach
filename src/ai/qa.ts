import { CONFIG } from '../config.js';
import { extractWithOpenAI } from '../services/openai.js';
import { getKnowledge } from './knowledge.js';

function trainingTypeByKeyword(question: string) {
  const q = question.toLowerCase();
  if (q.includes('темпов')) return 'tempo';
  if (q.includes('интервал')) return 'intervals';
  if (q.includes('длинн') || q.includes('лонг')) return 'long_run';
  if (q.includes('восстанов')) return 'recovery';
  if (q.includes('лёгк') || q.includes('легк')) return 'easy_run';
  if (q.includes('фартлек')) return 'fartlek';
  return null;
}

function paceZoneAnswer(question: string, knowledge: ReturnType<typeof getKnowledge>) {
  const q = question.toLowerCase();
  if (!q.includes('темп') && !q.includes('зон')) return null;
  const zones = knowledge.paceZones.pace_zones || {};
  const lines: string[] = ['Зоны темпа:'];
  for (const key of Object.keys(zones)) {
    const z = zones[key];
    lines.push(`- ${z.name_ru}: ${z.adjustment_seconds} от текущего темпа 5К, RPE ${z.rpe?.join('-') || ''}`);
  }
  return lines.join('\n');
}

function trainingTypeAnswer(question: string, knowledge: ReturnType<typeof getKnowledge>) {
  const key = trainingTypeByKeyword(question);
  if (!key) return null;
  const t = knowledge.trainingTypes[key];
  if (!t) return null;
  const lines = [
    `${t.name_ru}: ${t.purpose}`,
    t.pace_description ? `Темп: ${t.pace_description}` : null,
    t.duration_minutes ? `Длительность: ${t.duration_minutes.min}-${t.duration_minutes.max} мин` : null
  ].filter(Boolean) as string[];
  return lines.join('\n');
}

function fallbackAnswer(question: string) {
  const knowledge = getKnowledge();
  const type = trainingTypeAnswer(question, knowledge);
  if (type) return type;
  const zones = paceZoneAnswer(question, knowledge);
  if (zones) return zones;
  return 'Пока могу отвечать только на вопросы про типы тренировок и темповые зоны. Сформулируй вопрос конкретнее.';
}

const SYSTEM_PROMPT = `Ты тренер по бегу. Отвечай кратко и по делу. Не выдумывай. Если данных нет — скажи это. Используй знания из JSON ниже.`;

export async function answerQuestion(question: string): Promise<string> {
  if (!CONFIG.openaiApiKey) return fallbackAnswer(question);
  const knowledge = getKnowledge();
  const payload = {
    trainingTypes: knowledge.trainingTypes,
    paceZones: knowledge.paceZones,
    coreRules: knowledge.coreRules,
    goalTemplates: knowledge.goalTemplates,
    levelParameters: knowledge.levelParameters
  };

  const res = await extractWithOpenAI(SYSTEM_PROMPT, JSON.stringify({ question, knowledge: payload }));
  if (typeof res === 'object' && res && typeof (res as any).text === 'string') {
    return (res as any).text;
  }
  return fallbackAnswer(question);
}
