import { describe, it, expect, vi } from 'vitest';
import { detectIntent } from '../src/domain/intent.js';
import { handlePlanRequest, handlePlanConvert } from '../src/handlers/plan.js';
import { handleTrainingLog } from '../src/handlers/training-log.js';
import { handlePlanAdjust } from '../src/handlers/plan-adjust.js';
import { handleScheduleChange } from '../src/handlers/schedule.js';
import { handlePlanExplain } from '../src/handlers/plan-explain.js';
import { handleGeneral } from '../src/handlers/general.js';
import * as strategy from '../src/services/strategy.js';
import * as weekly from '../src/services/weekly-plan.js';
import * as trainings from '../src/services/trainings.js';
import * as supa from '../src/services/supabase.js';

const user = {
  id: 'u1',
  telegram_id: 1001,
  level: 'intermediate',
  weekly_runs: 3,
  preferred_training_days: 'понедельник, среда, пятница',
  current_5k_pace_seconds: 360
} as any;

const planRow = {
  id: 'p1',
  plan_data: {
    week_start: '2026-02-09',
    week_end: '2026-02-15',
    total_km: 10,
    raw_plan: 'x',
    meta: { generator: 'ts-bot', version: 'v1', created_at: 'x' },
    workouts: [
      { date: '2026-02-09', day_ru: 'понедельник', type: 'easy_run', type_ru: 'Лёгкий бег', description: '', distance_km: 5, target_pace_min_km: '6:00', treadmill_kmh: 10, rpe: 4 },
      { date: '2026-02-12', day_ru: 'четверг', type: 'long_run', type_ru: 'Длинная пробежка', description: '', distance_km: 5, target_pace_min_km: '6:30', treadmill_kmh: 9.2, rpe: 5 }
    ]
  }
};

describe('regression scenarios', () => {
  it('intent: plan request (эту неделю)', () => {
    expect(detectIntent('эту неделю')).toBe('plan_request');
  });

  it('intent: plan convert', () => {
    expect(detectIntent('переведи в минуты')).toBe('plan_convert');
  });

  it('intent: training log', () => {
    expect(detectIntent('пробежал 5 км за 30 минут')).toBe('training_log');
  });

  it('plan request: midweek asks question', async () => {
    vi.spyOn(strategy, 'getActiveStrategy').mockResolvedValueOnce(null as any);
    vi.spyOn(weekly, 'saveWeeklyPlan').mockResolvedValueOnce({} as any);
    const res = await handlePlanRequest(user, 'начинаем');
    expect(res.toLowerCase()).toContain('хочешь начать');
  });

  it('plan request: next week builds plan', async () => {
    vi.spyOn(strategy, 'getActiveStrategy').mockResolvedValueOnce(null as any);
    vi.spyOn(weekly, 'saveWeeklyPlan').mockResolvedValueOnce({} as any);
    vi.spyOn(weekly, 'getPlanByWeekStart').mockResolvedValueOnce(null as any);
    vi.spyOn(trainings, 'getTrainingsInRange').mockResolvedValueOnce([] as any);
    const res = await handlePlanRequest(user, 'с понедельника');
    expect(res).toContain('План на неделю');
  });

  it('plan convert: uses active plan', async () => {
    vi.spyOn(weekly, 'getActivePlan').mockResolvedValueOnce(planRow as any);
    const res = await handlePlanConvert(user);
    expect(res).toContain('План в минутах');
  });

  it('training log: saves workout', async () => {
    vi.spyOn(weekly, 'getActivePlan').mockResolvedValueOnce(planRow as any);
    vi.spyOn(trainings, 'insertTraining').mockResolvedValueOnce({} as any);
    const res = await handleTrainingLog(user, 'пробежал 5 км за 30 минут, пульс средний 140');
    expect(res).toContain('Записал тренировку');
  });

  it('training update: updates last workout', async () => {
    vi.spyOn(trainings, 'getTrainingByDate').mockResolvedValueOnce(null as any);
    vi.spyOn(trainings, 'getLatestTraining').mockResolvedValueOnce({ id: 't1' } as any);
    vi.spyOn(trainings, 'updateTraining').mockResolvedValueOnce({} as any);
    const res = await handleTrainingLog(user, 'пульс средний 145');
    expect(res).toContain('Обновил данные');
  });

  it('plan adjust: reschedules', async () => {
    vi.spyOn(weekly, 'getActivePlan').mockResolvedValueOnce(planRow as any);
    vi.spyOn(weekly, 'saveWeeklyPlan').mockResolvedValueOnce({} as any);
    const res = await handlePlanAdjust(user, 'перенеси тренировку на четверг');
    expect(res).toContain('четверг');
  });

  it('schedule change: updates preferred days', async () => {
    vi.spyOn(supa, 'upsertUserProfile').mockResolvedValueOnce({} as any);
    const res = await handleScheduleChange(user, 'хочу тренироваться в пн, ср, пт');
    expect(res).toContain('Обновил предпочтительные дни');
  });

  it('plan explain: explains plan', async () => {
    vi.spyOn(weekly, 'getActivePlan').mockResolvedValueOnce(planRow as any);
    vi.spyOn(strategy, 'getActiveStrategy').mockResolvedValueOnce({ phases: [{ display_name: 'База' }] } as any);
    const res = await handlePlanExplain(user, 'почему такой план');
    expect(res).toContain('База');
  });

  it('general: fallback message', async () => {
    const res = await handleGeneral('привет');
    expect(res).toContain('Спроси конкретнее');
  });
});
