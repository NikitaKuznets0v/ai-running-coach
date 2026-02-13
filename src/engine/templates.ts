import type { WorkoutType } from '../domain/plan-types.js';

export const TYPE_RU: Record<WorkoutType, string> = {
  easy_run: 'Лёгкий бег',
  long_run: 'Длинная пробежка',
  tempo: 'Темповая тренировка',
  intervals: 'Интервалы',
  recovery: 'Восстановительный бег',
  fartlek: 'Фартлек'
};

export const TYPE_DESC: Record<WorkoutType, string> = {
  easy_run: 'Лёгкий бег в разговорном темпе',
  long_run: 'Длинная пробежка в лёгком темпе',
  tempo: 'Темповая работа ближе к пороговому темпу',
  intervals: 'Интервалы на VO2max с полноценным отдыхом',
  recovery: 'Очень лёгкий восстановительный бег',
  fartlek: 'Игра со скоростью: ускорения по ощущениям'
};
