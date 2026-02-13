import type { UserProfile } from '../domain/types.js';
import { parseTrainingWithAI } from '../ai/training-parser.js';
import { insertTraining, getTrainingByDate, getLatestTraining, updateTraining } from '../services/trainings.js';
import type { TrainingLogInput, TrainingLogRecord } from '../domain/training.js';
import { getActivePlan } from '../services/weekly-plan.js';
import { dayRu, toISO } from '../utils/dates.js';
import { parseTrainingUpdate } from '../utils/parse-training-update.js';
import { formatDuration } from '../utils/format-duration.js';

function toRecord(userId: string, input: TrainingLogInput): TrainingLogRecord {
  return {
    user_id: userId,
    date: input.date || toISO(new Date()),
    distance_km: input.distance_km || 0,
    duration_seconds: input.duration_seconds || 0,
    avg_heart_rate: input.avg_heart_rate || null,
    max_heart_rate: input.max_heart_rate || null,
    rpe: input.rpe || null,
    feeling: input.feeling || null,
    notes: input.notes || null
  };
}

export async function handleTrainingLog(user: UserProfile, message: string) {
  const parsed = await parseTrainingWithAI(message);

  if (!parsed.distance_km || !parsed.duration_seconds) {
    const update = parseTrainingUpdate(message);
    if (update.avg_heart_rate || update.max_heart_rate || update.rpe || update.feeling || update.notes) {
      const date = update.date || toISO(new Date());
      const existing = await getTrainingByDate(user.id, date) || await getLatestTraining(user.id);
      if (!existing) {
        return 'Не нашёл тренировку, к которой можно добавить данные. Сначала запиши тренировку с дистанцией и временем.';
      }
      const patch: Record<string, any> = {};
      if (update.avg_heart_rate) patch.avg_heart_rate = update.avg_heart_rate;
      if (update.max_heart_rate) patch.max_heart_rate = update.max_heart_rate;
      if (update.rpe) patch.rpe = update.rpe;
      if (update.feeling) patch.feeling = update.feeling;
      if (update.notes) patch.notes = update.notes;
      await updateTraining(existing.id, patch);
      return 'Обновил данные по тренировке.';
    }
    return 'Я могу записать тренировку, но не вижу дистанцию и время. Напиши, например: "пробежал 6 км за 36 минут".';
  }

  const record = toRecord(user.id, parsed);
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

  const saved = await insertTraining(record);
  if (!saved) {
    return 'Похоже, эта тренировка уже записана.';
  }

  const time = formatDuration(parsed.duration_seconds);
  const hr = parsed.avg_heart_rate ? `, ср. пульс ${parsed.avg_heart_rate}` : '';
  return `Записал тренировку: ${parsed.distance_km} км за ${time}${hr}.`;
}
