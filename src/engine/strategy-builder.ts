import fs from 'node:fs';
import path from 'node:path';
import type { UserProfile } from '../domain/types.js';

export type PhaseName = 'base' | 'development' | 'stabilization' | 'taper';

export interface StrategyPhase {
  name: PhaseName;
  display_name: string;
  start_week: number;
  end_week: number;
  duration_weeks: number;
  focus: string;
  target_weekly_km_min: number;
  target_weekly_km_max: number;
  key_workouts: string[];
  intensity_distribution: string;
}

function loadLevelParams() {
  const p = path.join(process.cwd(), 'docs', 'coach-knowledge', 'level-parameters.json');
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function baseWeeklyKm(user: UserProfile) {
  if (user.current_weekly_km) return user.current_weekly_km;
  const levels = loadLevelParams();
  const level = user.level || 'intermediate';
  const range = levels[level]?.volume?.weekly_km || { min: 20, max: 30 };
  return Math.round((range.min + range.max) / 2);
}

function scaleRange(base: number, minMul: number, maxMul: number) {
  return {
    min: Math.round(base * minMul),
    max: Math.round(base * maxMul)
  };
}

export function buildPhases(user: UserProfile): StrategyPhase[] {
  const baseKm = baseWeeklyKm(user);
  const baseRange = scaleRange(baseKm, 0.9, 1.0);
  const devRange = scaleRange(baseKm, 1.0, 1.1);
  const stabRange = scaleRange(baseKm, 0.9, 1.0);
  const taperRange = scaleRange(baseKm, 0.6, 0.8);

  return [
    {
      name: 'base',
      display_name: 'База',
      start_week: 1,
      end_week: 4,
      duration_weeks: 4,
      focus: 'аэробная база',
      target_weekly_km_min: baseRange.min,
      target_weekly_km_max: baseRange.max,
      key_workouts: ['easy_run', 'long_run'],
      intensity_distribution: '80/20'
    },
    {
      name: 'development',
      display_name: 'Развитие',
      start_week: 5,
      end_week: 8,
      duration_weeks: 4,
      focus: 'развитие скорости и VO2max',
      target_weekly_km_min: devRange.min,
      target_weekly_km_max: devRange.max,
      key_workouts: ['tempo', 'intervals', 'long_run'],
      intensity_distribution: '75/25'
    },
    {
      name: 'stabilization',
      display_name: 'Стабилизация',
      start_week: 9,
      end_week: 10,
      duration_weeks: 2,
      focus: 'ритм, специфичность к дистанции',
      target_weekly_km_min: stabRange.min,
      target_weekly_km_max: stabRange.max,
      key_workouts: ['tempo', 'long_run'],
      intensity_distribution: '80/20'
    },
    {
      name: 'taper',
      display_name: 'Тейпер',
      start_week: 11,
      end_week: 12,
      duration_weeks: 2,
      focus: 'снижение объёма, сохранение скорости',
      target_weekly_km_min: taperRange.min,
      target_weekly_km_max: taperRange.max,
      key_workouts: ['easy_run', 'tempo'],
      intensity_distribution: '85/15'
    }
  ];
}

export function strategyStartDate(raceDate: string) {
  const d = new Date(raceDate);
  d.setDate(d.getDate() - 84);
  return d;
}
