/**
 * Predicts race finish times based on current 5K pace using Riegel formula
 * T2 = T1 * (D2/D1)^1.06
 */

export interface RacePrediction {
  optimistic: number; // seconds
  realistic: number;  // seconds
  pessimistic: number; // seconds
}

const DISTANCE_KM: Record<string, number> = {
  '5k': 5,
  '10k': 10,
  'half': 21.1,
  'marathon': 42.2
};

export function predictRaceTime(current5kSeconds: number, targetDistance: string): RacePrediction {
  const distanceKm = DISTANCE_KM[targetDistance] || 21.1;

  // Riegel formula: T2 = T1 * (D2/D1)^1.06
  const base = current5kSeconds * Math.pow(distanceKm / 5, 1.06);

  return {
    optimistic: Math.round(base * 0.95),  // -5% (if training goes very well)
    realistic: Math.round(base),          // base prediction
    pessimistic: Math.round(base * 1.10)  // +10% (conservative estimate)
  };
}

export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function assessGoalRealism(targetSeconds: number, realisticPrediction: number): {
  assessment: 'achievable' | 'challenging' | 'very_ambitious' | 'unrealistic';
  message: string;
} {
  const diff = (targetSeconds - realisticPrediction) / realisticPrediction;

  if (diff > 0.15) {
    // Target is 15%+ slower than prediction - very achievable
    return {
      assessment: 'achievable',
      message: 'Твоя цель вполне достижима! С правильными тренировками ты сможешь пробежать быстрее.'
    };
  } else if (diff > 0) {
    // Target is slower than prediction - achievable
    return {
      assessment: 'achievable',
      message: 'Твоя цель реалистична и достижима при соблюдении плана.'
    };
  } else if (diff > -0.10) {
    // Target is up to 10% faster than prediction - challenging but doable
    return {
      assessment: 'challenging',
      message: 'Цель амбициозная, но достижимая! Потребуются качественные тренировки и дисциплина.'
    };
  } else if (diff > -0.20) {
    // Target is 10-20% faster - very ambitious
    return {
      assessment: 'very_ambitious',
      message: 'Это очень амбициозная цель. Для её достижения нужен значительный прогресс и идеальное выполнение плана.'
    };
  } else {
    // Target is 20%+ faster - likely unrealistic
    return {
      assessment: 'unrealistic',
      message: 'Эта цель может быть нереалистична для текущего уровня подготовки. Рекомендую скорректировать целевое время.'
    };
  }
}
