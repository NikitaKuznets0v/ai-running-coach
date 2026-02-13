import { toISO } from './dates.js';

const daysRu = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const dayIndex: Record<string, number> = {
  'понедельник': 1,
  'вторник': 2,
  'среда': 3,
  'четверг': 4,
  'пятница': 5,
  'суббота': 6,
  'воскресенье': 0
};

function parseDay(message: string): number | null {
  const m = message.toLowerCase();
  for (const key of Object.keys(dayIndex)) {
    if (m.includes(key)) return dayIndex[key];
  }
  return null;
}

function parseDate(message: string, now: Date): string | null {
  const m = message.toLowerCase();
  if (m.includes('сегодня')) return toISO(now);
  if (m.includes('завтра')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return toISO(d);
  }
  if (m.includes('послезавтра')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
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

export function parseReschedule(message: string, now = new Date()) {
  const date = parseDate(message, now);
  const day = parseDay(message);
  return { date, day };
}

export function resolveDateFromDay(day: number, weekStart: string): string {
  const start = new Date(weekStart);
  const res = new Date(start);
  const delta = (day - start.getDay() + 7) % 7;
  res.setDate(start.getDate() + delta);
  return toISO(res);
}

export function dayRuByIndex(idx: number): string {
  return daysRu[idx];
}
