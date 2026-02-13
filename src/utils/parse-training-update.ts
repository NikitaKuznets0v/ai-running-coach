import { toISO } from './dates.js';

function extractAvgHr(message: string): number | null {
  const m = message.toLowerCase();
  const direct = m.match(/(?:средн[а-яё]*\s*пульс|пульс\s*средн[а-яё]*|avg\s*hr)\s*(\d{2,3})/);
  if (direct) return Number(direct[1]);
  const short = m.match(/(?:ср\.?\s*пульс)\s*(\d{2,3})/);
  if (short) return Number(short[1]);
  return null;
}

function extractMaxHr(message: string): number | null {
  const m = message.toLowerCase();
  const direct = m.match(/(?:макс[а-яё]*\s*пульс|max\s*hr|пик)\s*(\d{2,3})/);
  if (direct) return Number(direct[1]);
  return null;
}

function extractRpe(message: string): number | null {
  const m = message.toLowerCase();
  const direct = m.match(/rpe\s*(\d{1,2})/);
  if (direct) return Number(direct[1]);
  const ru = m.match(/нагрузк[а-яё]*\s*(\d{1,2})/);
  if (ru) return Number(ru[1]);
  return null;
}

function extractFeeling(message: string): string | null {
  const m = message.toLowerCase();
  if (/отличн/.test(m)) return 'great';
  if (/хорош/.test(m)) return 'good';
  if (/норм/.test(m)) return 'ok';
  if (/устал/.test(m)) return 'tired';
  if (/очень\s*устал|выжат|измотан/.test(m)) return 'exhausted';
  return null;
}

function extractNotes(message: string): string | null {
  const m = message.toLowerCase();
  const note = m.match(/(?:заметк[а-яё]*|комментар[а-яё]*)\s*[:\-]\s*(.+)$/);
  if (note && note[1]) return note[1].trim();
  return null;
}

function extractDate(message: string, now: Date): string | null {
  const m = message.toLowerCase();
  if (m.includes('сегодня')) return toISO(now);
  if (m.includes('вчера')) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return toISO(d);
  }
  const dm = m.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (dm) {
    const day = Number(dm[1]);
    const month = Number(dm[2]);
    const yearRaw = dm[3];
    const year = yearRaw ? Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw) : now.getFullYear();
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return toISO(new Date(year, month - 1, day));
    }
  }
  return null;
}

export function parseTrainingUpdate(message: string, now = new Date()) {
  return {
    date: extractDate(message, now) || toISO(now),
    avg_heart_rate: extractAvgHr(message),
    max_heart_rate: extractMaxHr(message),
    rpe: extractRpe(message),
    feeling: extractFeeling(message),
    notes: extractNotes(message)
  };
}
