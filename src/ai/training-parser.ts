import { TrainingLogSchema, type TrainingLogInput } from '../domain/training.js';
import { parseTrainingMessage } from '../utils/parse-training.js';
import { extractWithOpenAI } from '../services/openai.js';
import { toISO } from '../utils/dates.js';

const PROMPT = `Ты парсер тренировок. Извлеки данные в JSON.

Поля:
- date (YYYY-MM-DD), если не указано — null
- distance_km (number)
- duration_minutes (number)
- avg_heart_rate (number)
- max_heart_rate (number)
- rpe (1-10)
- feeling (short text)
- notes (short text)

Верни только JSON.`;

function normalize(input: TrainingLogInput, now = new Date()): TrainingLogInput {
  const date = input.date || toISO(now);
  let duration_seconds = input.duration_seconds || null;
  if (!duration_seconds && input.duration_minutes) {
    duration_seconds = Math.round(input.duration_minutes * 60);
  }
  return {
    ...input,
    date,
    duration_seconds
  };
}

export async function parseTrainingWithAI(message: string, now = new Date()): Promise<TrainingLogInput> {
  const base = parseTrainingMessage(message, now);
  const normalizedBase = normalize(base, now);
  if (normalizedBase.distance_km && normalizedBase.duration_seconds) return normalizedBase;

  let ai: any = {};
  try {
    ai = await extractWithOpenAI(PROMPT, message);
  } catch {
    return normalizedBase;
  }
  const merged = { ...normalizedBase, ...(ai || {}) } as TrainingLogInput;
  const normalizedMerged = normalize(merged, now);
  if (normalizedMerged.distance_km && normalizedMerged.duration_seconds) {
    return normalizedMerged;
  }
  const parsed = TrainingLogSchema.safeParse(merged);
  if (!parsed.success) return normalizedBase;
  return normalize(parsed.data, now);
}
