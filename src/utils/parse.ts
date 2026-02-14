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
  // Try to find explicit number 1-7
  const m = message.match(/\b([1-7])\b/);
  if (m) return Number(m[1]);

  // If no number found, count unique days mentioned
  const days = extractPreferredDays(message);
  if (days) {
    const uniqueDays = new Set(
      days.split(', ').map(d => {
        // Normalize: map to abbreviations
        if (d === 'пн' || d === 'понедельник') return 'пн';
        if (d === 'вт' || d === 'вторник') return 'вт';
        if (d === 'ср' || d === 'среда') return 'ср';
        if (d === 'чт' || d === 'четверг') return 'чт';
        if (d === 'пт' || d === 'пятница') return 'пт';
        if (d === 'сб' || d === 'суббота') return 'сб';
        if (d === 'вс' || d === 'воскресенье') return 'вс';
        return d;
      })
    );
    return uniqueDays.size;
  }

  return null;
}

export function extractPreferredDays(message: string): string | null {
  const m = message.toLowerCase();

  // First check for full names, then abbreviations to avoid duplicates
  const fullNames = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
  const abbrevs = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

  const found: string[] = [];

  // Add full names
  for (const day of fullNames) {
    if (m.includes(day)) found.push(day);
  }

  // Add abbreviations only if their full name wasn't already added
  for (let i = 0; i < abbrevs.length; i++) {
    const abbr = abbrevs[i];
    const full = fullNames[i];
    if (m.includes(abbr) && !found.includes(full)) {
      found.push(abbr);
    }
  }

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

// Parse relative date: "через 12 недель", "через 3 месяца"
function parseRelativeDate(text: string): string | null {
  const weekMatch = text.match(/через\s+(\d+)\s*недел/i);
  if (weekMatch) {
    const weeks = Number(weekMatch[1]);
    const d = new Date();
    d.setDate(d.getDate() + weeks * 7);
    return d.toISOString().slice(0, 10);
  }
  const monthMatch = text.match(/через\s+(\d+)\s*месяц/i);
  if (monthMatch) {
    const months = Number(monthMatch[1]);
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

// Russian word-form time: "час пятьдесят", "два часа", "полтора часа"
const HOUR_WORDS: Record<string, number> = {
  'час': 1, 'один час': 1, 'полтора': 1.5, 'два': 2, 'три': 3, 'четыре': 4, 'пять': 5
};
const MINUTE_WORDS: Record<string, number> = {
  'десять': 10, 'пятнадцать': 15, 'двадцать': 20, 'двадцать пять': 25,
  'тридцать': 30, 'тридцать пять': 35, 'сорок': 40, 'сорок пять': 45,
  'пятьдесят': 50, 'пятьдесят пять': 55
};

function parseTargetTime(text: string): number | null {
  const m = text.toLowerCase();

  // "1ч 50м", "2ч 30м"
  const hm = m.match(/(\d{1,2})\s*ч\s*(\d{1,2})\s*м/);
  if (hm) return Number(hm[1]) * 3600 + Number(hm[2]) * 60;

  // "1:50:00" or "1:50" (h:mm)
  const hhmmss = m.match(/\b(\d{1,2}):(\d{2}):(\d{2})\b/);
  if (hhmmss) return Number(hhmmss[1]) * 3600 + Number(hhmmss[2]) * 60 + Number(hhmmss[3]);
  const hhmm = m.match(/\b(\d{1}):(\d{2})\b/);
  if (hhmm && Number(hhmm[1]) >= 1 && Number(hhmm[1]) <= 5) {
    return Number(hhmm[1]) * 3600 + Number(hhmm[2]) * 60;
  }

  // "3 часа 15 минут", "час 59 минут" (digits)
  const hourMin = m.match(/(\d+)\s*час[а-яов]*\s+(\d+)\s*мин/);
  if (hourMin) return Number(hourMin[1]) * 3600 + Number(hourMin[2]) * 60;

  // "час 59 минут" (word "час" + digit minutes)
  const hourWordMin = m.match(/час\s+(\d+)\s*мин/);
  if (hourWordMin) return 3600 + Number(hourWordMin[1]) * 60;

  // "4 часа", "3 часов" (only hours, no minutes)
  const hoursOnly = m.match(/(\d+)\s*час[а-яов]*/);
  if (hoursOnly && !m.match(/(\d+)\s*час[а-яов]*\s+(\d+)/)) {
    return Number(hoursOnly[1]) * 3600;
  }

  // "110 мин", "90 минут", "55 минут"
  const mins = m.match(/\b(\d{2,3})\s*мин/);
  if (mins) return Number(mins[1]) * 60;

  // "час пятьдесят", "два часа тридцать", "полтора часа" (word-based)
  for (const [word, hours] of Object.entries(HOUR_WORDS)) {
    if (m.includes(word)) {
      // Skip if there's a digit right before this word (e.g., "4 часа")
      const digitBeforeWord = new RegExp(`\\d+\\s*${word}`).test(m);
      if (digitBeforeWord) continue;

      let seconds = hours * 3600;
      // Look for minutes after the hour word
      for (const [minWord, minVal] of Object.entries(MINUTE_WORDS)) {
        if (m.includes(minWord)) {
          seconds += minVal * 60;
          break;
        }
      }
      // "час пятьдесят" without "минут" → could be 1:50
      const minNum = m.match(new RegExp(word + '\\s+(\\d{1,2})'));
      if (minNum && !mins) {
        seconds = hours * 3600 + Number(minNum[1]) * 60;
      }
      return seconds;
    }
  }

  return null;
}

// Parse start date for training: "завтра", "с понедельника", "со следующей недели", dates
export function extractStartDate(message: string): string | null {
  const m = message.toLowerCase();
  const now = new Date();

  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  if (/сегодня/.test(m)) return iso(now);

  if (/завтра/.test(m)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return iso(d);
  }

  // "со следующей недели", "с следующей недели", "с новой недели"
  if (/следующ\S*\s+недел|с новой недел/i.test(m)) {
    const d = new Date(now);
    const day = d.getDay();
    const delta = (8 - day) % 7 || 7;
    d.setDate(d.getDate() + delta);
    return iso(d);
  }

  // Day names: "с понедельника", "в понедельник", "понедельник"
  const dayNames = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const dayAbbrev = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  for (let i = 0; i < dayNames.length; i++) {
    if (m.includes(dayNames[i]) || new RegExp(`\\b${dayAbbrev[i]}\\b`).test(m)) {
      const today = now.getDay();
      let diff = i - today;
      if (diff <= 0) diff += 7;
      const d = new Date(now);
      d.setDate(d.getDate() + diff);
      return iso(d);
    }
  }

  // "через X дней"
  const daysMatch = m.match(/через\s+(\d+)\s*дн/);
  if (daysMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() + Number(daysMatch[1]));
    return iso(d);
  }

  // Relative: "через X недель" / "через X месяцев"
  const rel = parseRelativeDate(m);
  if (rel) return rel;

  // Specific dates: "2026-02-15" or "15.02.2026"
  const dateIso = m.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (dateIso) return `${dateIso[1]}-${dateIso[2]}-${dateIso[3]}`;

  const dateRu = m.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  if (dateRu) return `${dateRu[3]}-${dateRu[2].padStart(2, '0')}-${dateRu[1].padStart(2, '0')}`;

  return null;
}

export function extractRaceDetails(message: string): RaceDetailsResult {
  const m = message.toLowerCase();
  let race_distance: string | null = null;
  let race_distance_km: number | null = null;

  // Check полумарафон first (before марафон to avoid substring match)
  if (/полумарафон|полумара|полумарик|half/.test(m)) { race_distance = 'half'; race_distance_km = 21.1; }
  else if (/марафон|(?<!полу)мара(?!фон)|marathon/.test(m)) { race_distance = 'marathon'; race_distance_km = 42.2; }
  else if (/10\s*k|10к|10 км|десятка/.test(m)) { race_distance = '10k'; race_distance_km = 10; }
  else if (/5\s*k|5к|5 км|пятёрка|пятерка|пятикилометровка/.test(m)) { race_distance = '5k'; race_distance_km = 5; }

  // Fallback: custom distances (e.g., "30 км", "15 километров")
  if (!race_distance_km) {
    const customKm = m.match(/(\d+)\s*(?:км|километр)/);
    if (customKm) race_distance_km = Number(customKm[1]);
  }

  // Parse specific dates
  const dateIso = m.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const dateRu = m.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  let race_date: string | null = null;
  if (dateIso) race_date = `${dateIso[1]}-${dateIso[2]}-${dateIso[3]}`;
  if (dateRu) race_date = `${dateRu[3]}-${dateRu[2].padStart(2, '0')}-${dateRu[1].padStart(2, '0')}`;

  // Parse relative dates: "через 12 недель", "через 3 месяца"
  if (!race_date) {
    race_date = parseRelativeDate(m);
  }

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

  // Parse target time
  const target_time_seconds = parseTargetTime(m);

  return { race_distance, race_distance_km, race_date, target_time_seconds, race_date_warning };
}
