import type { WeeklyPlanData } from '../domain/plan-types.js';
import type { TrainingLogRecord } from '../domain/training.js';

export interface ComplianceReport {
  plannedKm: number;
  actualKm: number;
  compliancePercent: number;
  completedWorkouts: number;
  plannedWorkouts: number;
  missedTypes: string[];
}

export interface AdaptationDecision {
  volumeAdjustment: number;
  reason: string;
  isRecoveryWeek: boolean;
  removeIntervals?: boolean;
}

export function calculateCompliance(plan: WeeklyPlanData, trainings: TrainingLogRecord[]): ComplianceReport {
  const plannedKm = plan.workouts.reduce((sum, w) => sum + w.distance_km, 0);
  const actualKm = trainings.reduce((sum, t) => sum + (t.distance_km || 0), 0);
  const plannedWorkouts = plan.workouts.length;

  const trainingDates = new Set(trainings.map((t) => t.date));
  const completedWorkouts = plan.workouts.filter((w) => trainingDates.has(w.date)).length;
  const missedTypes = plan.workouts
    .filter((w) => !trainingDates.has(w.date))
    .map((w) => w.type);

  const compliancePercent = plannedKm > 0 ? Math.round((actualKm / plannedKm) * 100) : 0;

  return {
    plannedKm,
    actualKm,
    compliancePercent,
    completedWorkouts,
    plannedWorkouts,
    missedTypes
  };
}

export function calculateAdaptation(
  compliance: ComplianceReport,
  weeksSinceRecovery = 0,
  trainingForm: number | null = null
): AdaptationDecision {
  if (weeksSinceRecovery >= 4) {
    return {
      volumeAdjustment: -30,
      reason: 'Плановая разгрузочная неделя',
      isRecoveryWeek: true,
      removeIntervals: false
    };
  }

  let score = compliance.compliancePercent;
  const missed = new Set(compliance.missedTypes);
  if (missed.has('intervals')) score -= 15;
  if (missed.has('tempo')) score -= 10;
  if (missed.has('long_run')) score -= 10;
  if (missed.has('easy_run')) score -= 5;
  score = Math.max(0, score);

  let decision: AdaptationDecision;
  if (score > 110) {
    decision = { volumeAdjustment: 8, reason: 'Неделя выполнена выше плана', isRecoveryWeek: false };
  } else if (score >= 90) {
    decision = { volumeAdjustment: 0, reason: 'Неделя выполнена по плану', isRecoveryWeek: false };
  } else if (score >= 70) {
    decision = { volumeAdjustment: -8, reason: 'Неделя выполнена частично', isRecoveryWeek: false };
  } else {
    decision = { volumeAdjustment: -15, reason: 'Низкая выполненность, нужен откат объёма', isRecoveryWeek: false, removeIntervals: true };
  }

  if (trainingForm !== null && trainingForm < -5) {
    decision.volumeAdjustment = Math.min(decision.volumeAdjustment, -10);
    decision.reason += '; высокая усталость';
  }

  return decision;
}
