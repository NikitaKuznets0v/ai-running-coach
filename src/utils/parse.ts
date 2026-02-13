import type { Level } from '../domain/types.js';

const DAYS = [
  'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье',
  'пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'
];

export function extractLevel(message: string): Level | null {
  const m = message.toLowerCase();
  if (/нович/i.test(m)) return 'beginner';
  if (/любител/i.test(m)) return 'intermediate';
  if (/продвин|опытн/i.test(m)) return 'advanced';
  if (/beginner/i.test(m)) return 'beginner';
  if (/intermediate|любитель/i.test(m)) return 'intermediate';
  if (/advanced/i.test(m)) return 'advanced';
  return null;
}

export function extractAge(message: string): number | null {
  const m = message.match(/\b(1[0-9]|[2-9][0-9])\b/);
  return m ? Number(m[1]) : null;
}

export function extractHeightWeight(message: string): { height_cm?: number; weight_kg?: number } {
  const nums = Array.from(message.matchAll(/\b(\d{2,3})\b/g)).map((m) => Number(m[1]));
  let height_cm: number | undefined;
  let weight_kg: number | undefined;
  for (const n of nums) {
    if (!height_cm && n >= 120 && n <= 230) height_cm = n;
    else if (!weight_kg && n >= 30 && n <= 200) weight_kg = n;
  }
  return { height_cm, weight_kg };
}

export function extractRestingHr(message: string): number | null {
  const m = message.toLowerCase();
  if (/не знаю|не помню|нет данных/i.test(m)) return null;
  const n = m.match(/\b(3\d|[4-9]\d|1[01]\d)\b/);
  return n ? Number(n[1]) : null;
}

export function extractWeeklyRuns(message: string): number | null {
  const m = message.match(/\b([1-7])\b/);
  return m ? Number(m[1]) : null;
}

export function extractPreferredDays(message: string): string | null {
  const m = message.toLowerCase();
  const found = DAYS.filter((d) => m.includes(d));
  if (!found.length) return null;
  return found.join(', ');
}

export function extract5kPaceSeconds(message: string): number | null {
  const m = message.toLowerCase();
  if (/(\d+):(\d{2})\s*\/\s*км/.test(m)) {
    const mm = m.match(/(\d+):(\d{2})\s*\/\s*км/);
    if (!mm) return null;
    return Number(mm[1]) * 60 + Number(mm[2]);
  }
  const time = m.match(/(\d{2,3})\s*мин/);
  if (time) {
    const totalMin = Number(time[1]);
    return Math.round((totalMin * 60) / 5);
  }
  return null;
}

export function extractLabTesting(message: string): { has_lab_testing?: boolean; vo2max?: number | null; lthr?: number | null } {
  const m = message.toLowerCase();
  if (/не делал|нет|не проходил/i.test(m)) return { has_lab_testing: false, vo2max: null, lthr: null };
  let has = /делал|есть|проходил/i.test(m);
  const vo = m.match(/vo2\s*max\s*(\d{2})/i);
  const lthr = m.match(/lthr\s*(\d{2,3})/i);
  const vo2max = vo ? Number(vo[1]) : null;
  const lthrVal = lthr ? Number(lthr[1]) : null;
  if (vo2max || lthrVal) has = true;
  return { has_lab_testing: has, vo2max, lthr: lthrVal };
}

export interface RaceDetailsResult {
  race_distance?: string | null;
  race_distance_km?: number | null;
  race_date?: string | null;
  target_time_seconds?: number | null;
  race_date_warning?: string | null;
}

export function extractRaceDetails(message: string): RaceDetailsResult {
  const m = message.toLowerCase();
  let race_distance: string | null = null;
  let race_distance_km: number | null = null;

  if (/полумарафон|half/.test(m)) { race_distance = 'half'; race_distance_km = 21.1; }
  else if (/марафон|marathon/.test(m)) { race_distance = 'marathon'; race_distance_km = 42.2; }
  else if (/10\s*k|10к|10 км/.test(m)) { race_distance = '10k'; race_distance_km = 10; }
  else if (/5\s*k|5к|5 км/.test(m)) { race_distance = '5k'; race_distance_km = 5; }

  const dateIso = m.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const dateRu = m.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  let race_date: string | null = null;
  if (dateIso) race_date = `${dateIso[1]}-${dateIso[2]}-${dateIso[3]}`;
  if (dateRu) race_date = `${dateRu[3]}-${dateRu[2].padStart(2, '0')}-${dateRu[1].padStart(2, '0')}`;

  // Validate race date
  let race_date_warning: string | null = null;
  if (race_date) {
    const raceDay = new Date(race_date);
    const now = new Date();
    const diffMs = raceDay.getTime() - now.getTime();
    const diffWeeks = diffMs / (7 * 24 * 60 * 60 * 1000);

    if (diffMs < 0) {
      race_date_warning = 'past';
      race_date = null;
    } else if (diffWeeks < 2) {
      race_date_warning = 'too_soon';
      race_date = null;
    } else if (diffWeeks > 24) {
      race_date_warning = 'too_far';
    } else if (diffWeeks > 12) {
      race_date_warning = 'two_cycles';
    }
  }

  let target_time_seconds: number | null = null;
  const timeH = m.match(/(\d{1,2})\s*ч\s*(\d{1,2})\s*м/);
  if (timeH) target_time_seconds = Number(timeH[1]) * 3600 + Number(timeH[2]) * 60;
  const timeM = m.match(/\b(\d{2,3})\s*мин\b/);
  if (!target_time_seconds && timeM) target_time_seconds = Number(timeM[1]) * 60;

  return { race_distance, race_distance_km, race_date, target_time_seconds, race_date_warning };
}
