import { toISO } from './dates.js';

const num = (v: string) => Number(v.replace(',', '.'));

function extractDistanceKm(message: string): number | null {
  const m = message.match(/(\d+(?:[.,]\d+)?)\s*(?:км|km)(?!\S)/i);
  if (!m) return null;
  const value = num(m[1]);
  return Number.isFinite(value) ? value : null;
}

function extractDurationMinutes(message: string): number | null {
  const m = message.toLowerCase();

  const hm = m.match(/(\d+)\s*ч(?:ас|аса|ов)?\s*(\d+)?\s*(?:мин|минут|м)?(?:\s|[.,!?)]|$)/);
  if (hm) {
    const h = Number(hm[1]);
    const mm = Number(hm[2] || 0);
    if (Number.isFinite(h) && Number.isFinite(mm)) return h * 60 + mm;
  }

  const withTime = m.match(/(?:за|время)\s*(\d{1,2})\s*[:.]\s*(\d{2})/);
  if (withTime) {
    const a = Number(withTime[1]);
    const b = Number(withTime[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) return a * 60 + b;
  }

  const mins = m.match(/(?:за|время)\s*(\d+)\s*(?:мин|минут|м)(?:\s|[.,!?)]|$)/);
  if (mins) {
    const value = Number(mins[1]);
    return Number.isFinite(value) ? value : null;
  }

  return null;
}

function extractAvgHr(message: string): number | null {
  const m = message.toLowerCase();
  const direct = m.match(/(?:средн[а-яё]*\s*пульс|пульс\s*средн[а-яё]*|avg\s*hr)\s*(\d{2,3})/);
  if (direct) return Number(direct[1]);
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

export function parseTrainingMessage(message: string, now = new Date()) {
  const distance_km = extractDistanceKm(message);
  const duration_minutes = extractDurationMinutes(message);
  const avg_heart_rate = extractAvgHr(message);
  const max_heart_rate = extractMaxHr(message);
  const rpe = extractRpe(message);
  const date = extractDate(message, now) || toISO(now);

  return {
    date,
    distance_km: distance_km ?? null,
    duration_minutes: duration_minutes ?? null,
    avg_heart_rate: avg_heart_rate ?? null,
    max_heart_rate: max_heart_rate ?? null,
    rpe: rpe ?? null
  };
}
