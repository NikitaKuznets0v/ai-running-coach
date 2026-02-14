import type { UserProfile } from '../domain/types.js';
import type { WeeklyPlanData, WorkoutPlan, WorkoutType } from '../domain/plan-types.js';
import { TYPE_DESC, TYPE_RU } from './templates.js';
import { PHASE_TEMPLATES } from './plan-templates.js';
import { dayRu, toISO } from '../utils/dates.js';
import { formatPace, paceToSpeedKmh } from '../utils/pace.js';
import { calculatePaceZones } from './zones.js';
import { currentPhase, type StrategyPhase } from './phases.js';

export interface BuildPlanInput {
  user: UserProfile;
  dates: Date[]; // allowed dates
  volumeAdjustment?: number;
  removeIntervals?: boolean;
  strategy?: {
    start_date: string;
    phases: StrategyPhase[];
  } | null;
}

// Base distances (km) by level — from level-parameters.json knowledge
const LEVEL_DISTANCES: Record<string, Record<string, number>> = {
  beginner: { easy_run: 3, long_run: 6, recovery: 2 },
  intermediate: { easy_run: 5, long_run: 12, tempo: 6, fartlek: 5, recovery: 4 },
  advanced: { easy_run: 8, long_run: 18, tempo: 8, intervals: 8, fartlek: 7, recovery: 5 }
};

// Pace zone multipliers relative to 5K pace per workout type
const PACE_ZONE_MAP: Record<string, { zone: string; factor: number; rpe: number }> = {
  easy_run:  { zone: 'z2', factor: 1.25, rpe: 4 },
  recovery:  { zone: 'z1', factor: 1.45, rpe: 3 },
  long_run:  { zone: 'z2', factor: 1.30, rpe: 5 },
  tempo:     { zone: 'z3', factor: 1.08, rpe: 7 },
  intervals: { zone: 'z5', factor: 0.93, rpe: 8 },
  fartlek:   { zone: 'z3', factor: 1.15, rpe: 6 }
};

// HR zone percentages of max HR
const HR_ZONES: Record<string, [number, number]> = {
  easy_run:  [0.60, 0.70],
  recovery:  [0.50, 0.60],
  long_run:  [0.65, 0.75],
  tempo:     [0.80, 0.88],
  intervals: [0.90, 1.00],
  fartlek:   [0.70, 0.85]
};

function pickTrainingDays(dates: Date[], preferred?: string | null, weeklyRuns = 3): Date[] {
  if (!dates.length) return [];
  const limit = Math.min(weeklyRuns, dates.length);
  if (!preferred) return dates.slice(0, limit);
  const pref = preferred.toLowerCase();
  const picked = dates.filter((d) => pref.includes(dayRu(d)));
  if (picked.length >= limit) return picked.slice(0, limit);
  const rest = dates.filter((d) => !picked.includes(d));
  return picked.concat(rest).slice(0, limit);
}

function adjustDistancesByPhase(workouts: WorkoutPlan[], phase?: StrategyPhase | null) {
  if (!phase) return workouts;
  if (!('target_weekly_km_min' in phase) || !('target_weekly_km_max' in phase)) return workouts;

  const total = workouts.reduce((s, w) => s + w.distance_km, 0);
  const min = (phase as any).target_weekly_km_min;
  const max = (phase as any).target_weekly_km_max;
  if (!min || !max) return workouts;

  const target = Math.min(max, Math.max(min, total));
  const scale = total > 0 ? target / total : 1;
  // Round to nearest 0.5 km (500m) for easier input on watches/treadmills
  return workouts.map((w) => ({ ...w, distance_km: Math.round(w.distance_km * scale * 2) / 2 }));
}

function adjustDistancesByVolume(workouts: WorkoutPlan[], percent = 0) {
  if (!percent) return workouts;
  const scale = 1 + percent / 100;
  // Round to nearest 0.5 km (500m) for easier input on watches/treadmills
  return workouts.map((w) => ({ ...w, distance_km: Math.round(w.distance_km * scale * 2) / 2 }));
}

function getTargetHr(type: WorkoutType, age?: number | null): string | null {
  if (!age) return null;
  const maxHr = 220 - age;
  const zone = HR_ZONES[type];
  if (!zone) return null;
  const lo = Math.round(maxHr * zone[0]);
  const hi = Math.round(maxHr * zone[1]);
  return `${lo}-${hi}`;
}

export function buildWeeklyPlan({ user, dates, strategy, volumeAdjustment, removeIntervals }: BuildPlanInput): WeeklyPlanData {
  const weeklyRuns = user.weekly_runs || 3;
  const level = user.level || 'intermediate';
  let phaseName: string | null = null;
  if (strategy?.phases?.length && strategy.start_date) {
    const startDate = new Date(strategy.start_date);
    const res = currentPhase(strategy.phases, startDate, new Date());
    phaseName = (res.phase as any)?.name || null;
  }
  const phaseTemplates = PHASE_TEMPLATES[level as keyof typeof PHASE_TEMPLATES] || PHASE_TEMPLATES.intermediate;
  const types = phaseName ? (phaseTemplates as any)[phaseName] || phaseTemplates.base : phaseTemplates.base;

  const pickedDates = pickTrainingDays(dates, user.preferred_training_days, weeklyRuns);
  let workouts: WorkoutPlan[] = [];

  const pace5k = user.current_5k_pace_seconds || 360;
  const zones = calculatePaceZones(pace5k);
  const distances = LEVEL_DISTANCES[level] || LEVEL_DISTANCES.intermediate;

  for (let i = 0; i < pickedDates.length; i++) {
    const type = (types[i % types.length] || 'easy_run') as WorkoutType;
    const zoneInfo = PACE_ZONE_MAP[type] || PACE_ZONE_MAP.easy_run;

    // Use calculated pace zones
    const zone = zones[zoneInfo.zone as keyof typeof zones];
    const paceSec = zone
      ? Math.round((zone.min_sec_per_km + zone.max_sec_per_km) / 2)
      : Math.round(pace5k * zoneInfo.factor);

    const distance = distances[type] || distances.easy_run || 5;
    const pace = formatPace(paceSec);
    const speed = paceToSpeedKmh(paceSec);
    const targetHr = getTargetHr(type, user.age);

    workouts.push({
      date: toISO(pickedDates[i]),
      day_ru: dayRu(pickedDates[i]),
      type,
      type_ru: TYPE_RU[type],
      description: TYPE_DESC[type],
      distance_km: distance,
      target_pace_min_km: pace,
      treadmill_kmh: speed,
      target_hr: targetHr,
      rpe: zoneInfo.rpe
    });
  }

  // Phase-aware scaling
  let phase: StrategyPhase | null = null;
  if (strategy?.phases?.length && strategy.start_date) {
    const startDate = new Date(strategy.start_date);
    const res = currentPhase(strategy.phases, startDate, new Date());
    phase = res.phase as StrategyPhase | null;
  }
  workouts = adjustDistancesByPhase(workouts, phase);
  workouts = adjustDistancesByVolume(workouts, volumeAdjustment || 0);
  if (removeIntervals) {
    workouts = workouts.map((w) => w.type === 'intervals' ? { ...w, type: 'easy_run', type_ru: TYPE_RU.easy_run, description: TYPE_DESC.easy_run, rpe: 4 } : w);
  }

  const total_km = workouts.reduce((sum, w) => sum + w.distance_km, 0);
  const week_start = workouts[0]?.date || toISO(dates[0]);
  const week_end = workouts[workouts.length - 1]?.date || toISO(dates[dates.length - 1]);

  const raw_plan = workouts.map((w, idx) => {
    const hrLine = w.target_hr ? `\n- Целевой пульс: ${w.target_hr}` : '';
    return `${idx + 1}. ${w.day_ru} (${w.date})\n` +
      `- Тип: ${w.type_ru}\n` +
      `- Дистанция: ${w.distance_km} км\n` +
      `- Целевой темп: ${w.target_pace_min_km}/км (${w.treadmill_kmh} км/ч)${hrLine}\n` +
      `- RPE: ${w.rpe}`;
  }).join('\n\n');

  return {
    week_start,
    week_end,
    total_km,
    workouts,
    raw_plan,
    meta: {
      generator: 'ts-bot',
      version: 'v2',
      created_at: new Date().toISOString(),
      adjustment_percent: volumeAdjustment || 0
    }
  };
}
