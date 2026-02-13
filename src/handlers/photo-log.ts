import type { UserProfile } from '../domain/types.js';
import { parseTrainingFromImage } from '../ai/vision-parser.js';
import { insertTraining, getLatestScreenshot, updateTraining } from '../services/trainings.js';
import { dayRu, toISO } from '../utils/dates.js';
import type { TrainingLogRecord } from '../domain/training.js';
import { getActivePlan } from '../services/weekly-plan.js';
import { getTelegramFileUrl, fetchTelegramFileBase64 } from '../utils/telegram-file.js';
import { runOcrFromBase64 } from '../services/ocr.js';
import { formatDuration } from '../utils/format-duration.js';

function toRecord(userId: string, input: any): TrainingLogRecord {
  return {
    user_id: userId,
    date: input.date || toISO(new Date()),
    distance_km: input.distance_km || 0,
    duration_seconds: input.duration_seconds || 0,
    avg_heart_rate: input.avg_heart_rate || null,
    max_heart_rate: input.max_heart_rate || null,
    rpe: input.rpe || null,
    feeling: input.feeling || null,
    notes: input.notes || null,
    source: 'screenshot' as const
  };
}

export async function handlePhotoLog(user: UserProfile, filePath: string, caption?: string) {
  const imageUrl = getTelegramFileUrl(filePath);
  let parsed = await parseTrainingFromImage(imageUrl, new Date(), caption);
  let ocrText = '';
  if (!parsed.distance_km || !parsed.duration_seconds) {
    const base64 = await fetchTelegramFileBase64(filePath);
    parsed = await parseTrainingFromImage(base64, new Date(), caption);
    if (!parsed.distance_km || !parsed.duration_seconds) {
      ocrText = await runOcrFromBase64(base64);
      const ocrParsed = parseFromOcr(ocrText);
      parsed = { ...parsed, ...ocrParsed } as any;
    }
  }
  if (!parsed.distance_km || !parsed.duration_seconds) {
    if (ocrText) {
      console.log(JSON.stringify({ level: 'info', message: 'ocr_parse_failed', ocr_snippet: ocrText.slice(0, 200) }));
    }
    return 'Не смог извлечь дистанцию и время со скриншота. Попробуй прислать более чёткий скрин.';
  }

  const record = toRecord(user.id, parsed);
  const recent = await getLatestScreenshot(user.id);
  if (recent?.created_at) {
    const created = new Date(recent.created_at).getTime();
    const now = Date.now();
    const windowMs = 3 * 60 * 1000;
    const count = Number(recent.screenshot_count || 1);
    if (now - created <= windowMs && count < 2) {
      const patch: Record<string, any> = { screenshot_count: count + 1 };
      if (parsed.avg_heart_rate && !recent.avg_heart_rate) patch.avg_heart_rate = parsed.avg_heart_rate;
      if (parsed.max_heart_rate && !recent.max_heart_rate) patch.max_heart_rate = parsed.max_heart_rate;
      if (parsed.rpe && !recent.rpe) patch.rpe = parsed.rpe;
      if (parsed.feeling && !recent.feeling) patch.feeling = parsed.feeling;
      if (parsed.notes && !recent.notes) patch.notes = parsed.notes;
      await updateTraining(recent.id, patch);
      return 'Дополнено по второму скрину.';
    }
  }
  const plan = await getActivePlan(user.id);
  if (plan?.plan_data?.week_start && plan?.plan_data?.week_end) {
    const date = record.date;
    const inRange = date >= plan.plan_data.week_start && date <= plan.plan_data.week_end;
    if (inRange) {
      record.weekly_plan_id = plan.id;
      record.is_planned = true;
      const workout = plan.plan_data.workouts?.find((w: any) => w.date === date);
      if (workout) record.type = workout.type;
    } else {
      record.is_planned = false;
    }
  }
  record.day_of_week = dayRu(new Date(record.date));

  const saved = await insertTraining(record as any);
  if (!saved) {
    return 'Похоже, эта тренировка уже записана.';
  }

  const time = formatDuration(parsed.duration_seconds);
  const hr = parsed.avg_heart_rate ? `, ср. пульс ${parsed.avg_heart_rate}` : '';
  return `Записал тренировку со скриншота: ${parsed.distance_km} км за ${time}${hr}.`;
}

function parseFromOcr(text: string) {
  const cleaned = text.replace(/\s+/g, ' ').toLowerCase();
  const original = text.toLowerCase();
  const distMatch = cleaned.match(/расст(?:ояние)?\s*([0-9]+(?:[.,][0-9]+)?)\s*км|([0-9]+(?:[.,][0-9]+)?)\s*км|([0-9]+(?:[.,][0-9]+)?)\s*km/);
  const timeMatch = cleaned.match(/время\s*([0-9]{1,2})[:. ]([0-9]{2})/) || cleaned.match(/min[: ]?sec\s*([0-9]{1,2})[:. ]([0-9]{2})/);
  const paceMatch = cleaned.match(/темп.*?([0-9]{1,2})[':. ]([0-9]{2})/) || cleaned.match(/time\/km.*?([0-9]{1,2})[':. ]([0-9]{2})/);
  const splitKmMatch = cleaned.match(/([0-9]+)\s*километр/);

  let distance_km: number | null = null;
  if (distMatch) {
    const val = distMatch[1] || distMatch[2] || distMatch[3];
    if (val) distance_km = Number(val.replace(',', '.'));
  }

  let duration_seconds: number | null = null;
  if (timeMatch) {
    const m = Number(timeMatch[1]);
    const s = Number(timeMatch[2]);
    if (Number.isFinite(m) && Number.isFinite(s)) duration_seconds = m * 60 + s;
  }
  if (!duration_seconds && paceMatch && distance_km) {
    const m = Number(paceMatch[1]);
    const s = Number(paceMatch[2]);
    if (Number.isFinite(m) && Number.isFinite(s)) {
      const paceSec = m * 60 + s;
      duration_seconds = Math.round(distance_km * paceSec);
    }
  }

  if (true) {
    const splitLen = splitKmMatch ? Number(splitKmMatch[1]) : 1;
    const splitRegex = /\b(\d{1,2})\s+(\d{2})[:.](\d{2})\b/g;
    const splits: Array<{ idx: number; sec: number }> = [];
    let match: RegExpExecArray | null;
    while ((match = splitRegex.exec(original)) !== null) {
      const idx = Number(match[1]);
      const mm = Number(match[2]);
      const ss = Number(match[3]);
      if (!Number.isFinite(idx) || !Number.isFinite(mm) || !Number.isFinite(ss)) continue;
      if (idx <= 0 || idx > 99) continue;
      splits.push({ idx, sec: mm * 60 + ss });
    }
    splits.sort((a, b) => a.idx - b.idx);
    const unique: Array<{ idx: number; sec: number }> = [];
    const seen = new Set<number>();
    for (const s of splits) {
      if (!seen.has(s.idx)) {
        unique.push(s);
        seen.add(s.idx);
      }
    }
    if (unique.length >= 2) {
      const maxIdx = unique[unique.length - 1].idx;
      distance_km = maxIdx * (splitLen || 1);
      duration_seconds = unique.reduce((sum, s) => sum + s.sec, 0);
    }
  }

  return {
    distance_km: distance_km || undefined,
    duration_seconds: duration_seconds || undefined
  };
}
