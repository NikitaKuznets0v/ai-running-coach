import type { TrainingLogRecord } from '../domain/training.js';

export interface TrainingIndex {
  fitness: number;
  fatigue: number;
  form: number;
  status: 'fresh' | 'optimal' | 'tired' | 'overtrained';
}

function sumLoad(trainings: TrainingLogRecord[], days: number, now: Date) {
  const start = new Date(now);
  start.setDate(start.getDate() - days + 1);
  const startIso = start.toISOString().slice(0, 10);
  const nowIso = now.toISOString().slice(0, 10);

  return trainings
    .filter((t) => t.date >= startIso && t.date <= nowIso)
    .reduce((sum, t) => sum + t.distance_km, 0);
}

export function calculateTrainingIndex(trainings: TrainingLogRecord[], now = new Date()): TrainingIndex {
  const fitness = Math.round((sumLoad(trainings, 42, now) / 42) * 10) / 10;
  const fatigue = Math.round((sumLoad(trainings, 7, now) / 7) * 10) / 10;
  const form = Math.round((fitness - fatigue) * 10) / 10;

  let status: TrainingIndex['status'] = 'optimal';
  if (form > 5) status = 'fresh';
  else if (form >= 0) status = 'optimal';
  else if (form >= -5) status = 'tired';
  else status = 'overtrained';

  return { fitness, fatigue, form, status };
}
