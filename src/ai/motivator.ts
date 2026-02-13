import type { ComplianceReport, AdaptationDecision } from '../engine/adaptation.js';
import type { TrainingIndex } from '../engine/training-index.js';
import { TYPE_RU } from '../engine/templates.js';

export function renderWeeklySummary(params: {
  weekStart: string;
  weekEnd: string;
  compliance: ComplianceReport;
  decision: AdaptationDecision;
  index: TrainingIndex;
  nextPlanText: string;
}): string {
  const { weekStart, weekEnd, compliance, decision, index, nextPlanText } = params;
  const missed = compliance.missedTypes.length
    ? compliance.missedTypes.map((t) => TYPE_RU[t as keyof typeof TYPE_RU] || t).join(', ')
    : 'нет';

  const lines = [
    `Итоги недели (${weekStart} - ${weekEnd}):`,
    `- План: ${compliance.plannedKm} км, факт: ${compliance.actualKm} км`,
    `- Выполнено: ${compliance.compliancePercent}% (${compliance.completedWorkouts}/${compliance.plannedWorkouts} трен.)`,
    `- Пропущенные типы: ${missed}`,
    `- Состояние: ${index.status} (form ${index.form})`,
    `- Коррекция объёма: ${decision.volumeAdjustment}% (${decision.reason})`,
    '',
    'План на следующую неделю:',
    nextPlanText
  ];

  return lines.join('\n');
}
