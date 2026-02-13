import { TrainingLogSchema, type TrainingLogInput } from '../domain/training.js';
import { extractWithOpenAIVision } from '../services/openai-vision.js';
import { toISO } from '../utils/dates.js';

const PROMPT = `Ты парсер скриншотов тренировок. Извлеки данные в JSON.

Поля:
- date (YYYY-MM-DD), если не указано — null
- distance_km (number, можно с десятичной точкой)
- duration_minutes (number) или duration_mmss ("MM:SS")
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
  const mmss = (input as any).duration_mmss as string | undefined;
  if (!duration_seconds && mmss && /^\d{1,2}:\d{2}$/.test(mmss)) {
    const [m, s] = mmss.split(':').map(Number);
    duration_seconds = m * 60 + s;
  }
  return {
    ...input,
    date,
    duration_seconds
  };
}

export async function parseTrainingFromImage(imageUrl: string, now = new Date(), caption?: string): Promise<TrainingLogInput> {
  const prompt = caption
    ? `${PROMPT}\n\nКомментарий пользователя: ${caption}`
    : PROMPT;
  const ai = await extractWithOpenAIVision(prompt, imageUrl);
  const coerced = coerceNumbers(ai || {});
  const withSplits = coerceSplits(coerced);
  const parsed = TrainingLogSchema.safeParse(coerced || {});
  if (!parsed.success) return { date: toISO(now) };
  const normalized = normalize(parsed.data, now);
  if (!normalized.duration_seconds && withSplits?.splits?.length && normalized.distance_km) {
    const total = withSplits.splits.reduce((sum: number, s: any) => sum + s.sec, 0);
    if (total > 0) normalized.duration_seconds = total;
  }
  return normalized;
}

function coerceNumbers(obj: any) {
  if (!obj || typeof obj !== 'object') return obj;
  const out: Record<string, any> = { ...obj };
  for (const key of Object.keys(out)) {
    const val = out[key];
    if (typeof val === 'string') {
      const mmss = val.match(/^\d{1,2}:\d{2}$/);
      if (mmss) {
        out['duration_mmss'] = val;
        continue;
      }
      const num = Number(val.replace(',', '.'));
      if (Number.isFinite(num)) out[key] = num;
    }
  }
  return out;
}

function coerceSplits(obj: any) {
  const splits = Array.isArray(obj?.splits) ? obj.splits : [];
  const outSplits = splits.map((s: any) => {
    const mmss = String(s.pace_mmss || '').trim();
    const m = mmss.match(/^(\d{1,2})[:.](\d{2})$/);
    if (!m) return null;
    const sec = Number(m[1]) * 60 + Number(m[2]);
    return { index: Number(s.index), sec };
  }).filter(Boolean);
  return { ...obj, splits: outSplits };
}
