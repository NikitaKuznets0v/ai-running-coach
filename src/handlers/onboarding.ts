import type { UserProfile } from '../domain/types.js';
import { ONBOARDING_FLOW } from '../domain/onboarding-flow.js';
import { upsertUserProfile } from '../services/supabase.js';
import { fallbackExtract } from '../utils/openai-extract.js';
import { UserProfilePatchSchema } from '../domain/schemas.js';
import { createStrategy, getActiveStrategy, updateStrategyStartDate } from '../services/strategy.js';
import { buildWeeklyPlan } from '../engine/plan-builder.js';
import { renderPlan } from '../ai/presenter.js';
import { saveWeeklyPlan } from '../services/weekly-plan.js';
import { formatStrategyPreview } from '../utils/format-strategy.js';
import { extractStartDate } from '../utils/parse.js';
import { predictRaceTime, formatTime, assessGoalRealism } from '../utils/race-predictor.js';

function isStartCommand(text: string): boolean {
  return /^\/?start$/i.test(text.trim());
}

function generateDatesFromStart(startDateStr: string): Date[] {
  const start = new Date(startDateStr);
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return dates;
}

function buildOnboardingSummary(user: UserProfile): string {
  const distanceNames: Record<string, string> = {
    '5k': '5 км',
    '10k': '10 км',
    'half': 'полумарафон',
    'marathon': 'марафон'
  };

  const distance = distanceNames[user.race_distance || ''] || user.race_distance_km ? `${user.race_distance_km} км` : 'дистанцию';
  const raceDate = user.race_date || 'скоро';
  const targetTime = user.target_time_seconds ? formatTime(user.target_time_seconds) : null;

  let summary = `Отлично! Я понял:\n`;
  summary += `📅 Мы готовимся к забегу **${distance}** на **${raceDate}**.\n`;
  if (targetTime) {
    summary += `🎯 Твоя цель — пробежать за **${targetTime}**.\n`;
  }

  // Add race prediction if we have 5K pace
  if (user.current_5k_pace_seconds && user.race_distance) {
    const prediction = predictRaceTime(user.current_5k_pace_seconds, user.race_distance);
    const assessment = targetTime && user.target_time_seconds
      ? assessGoalRealism(user.target_time_seconds, prediction.realistic)
      : null;

    summary += `\n**Мой прогноз** на основе твоего текущего темпа (5 км за ${formatTime(user.current_5k_pace_seconds)}):\n`;
    summary += `• Оптимистичный сценарий: **${formatTime(prediction.optimistic)}**\n`;
    summary += `• Реалистичный прогноз: **${formatTime(prediction.realistic)}**\n`;
    summary += `• Консервативная оценка: **${formatTime(prediction.pessimistic)}**\n`;

    if (assessment) {
      summary += `\n💬 ${assessment.message}\n`;
    }
  }

  return summary;
}

export async function handleOnboarding(user: UserProfile, messageText: string) {
  const stage = user.onboarding_stage || 'started';
  const step = ONBOARDING_FLOW[stage];

  if (!step) {
    const updated = await upsertUserProfile({ telegram_id: user.telegram_id, onboarding_stage: 'started' });
    const q = ONBOARDING_FLOW.started.question;
    const reply = typeof q === 'function' ? q(updated) : q;
    return { reply, updated };
  }

  // /start → show greeting without advancing
  if (stage === 'started' && isStartCommand(messageText)) {
    const q = step.question;
    const reply = typeof q === 'function' ? q(user) : q;
    return { reply, updated: user };
  }

  // --- strategy_preview stage: user is answering start date question ---
  // (Strategy was already shown, now we parse when they want to start)
  if (stage === 'strategy_preview') {
    const startDateStr = extractStartDate(messageText);
    if (!startDateStr) {
      return {
        reply: 'Не удалось распознать дату. Попробуй ещё раз.\n\nНапример: "завтра", "с понедельника", "со следующей недели", или конкретную дату (15.03.2026).',
        updated: user
      };
    }

    // Update strategy start_date if we have one
    const strategy = await getActiveStrategy(user.id);
    if (strategy) {
      await updateStrategyStartDate(strategy.id, startDateStr);
    }

    // Generate first week plan
    const dates = generateDatesFromStart(startDateStr);
    let reply = '';
    try {
      const plan = buildWeeklyPlan({
        user,
        dates,
        strategy: strategy ? { start_date: startDateStr, phases: strategy.phases } : null
      });
      await saveWeeklyPlan(user.id, plan);
      reply = 'Отлично! Вот твой план на первую неделю:\n\n' + renderPlan(plan);
      reply += '\n\nОнбординг завершён! Теперь можешь писать мне как тренеру — задавать вопросы, отправлять фото тренировок, просить новый план.';
    } catch {
      reply = 'План будет готов к началу недели. Напиши "план" чтобы получить его.';
    }

    await upsertUserProfile({ telegram_id: user.telegram_id, onboarding_stage: 'completed' });
    return { reply, updated: { ...user, onboarding_stage: 'completed' as const } };
  }

  // --- Normal onboarding extraction ---
  let extracted = step.extract(messageText) || {};

  // If extraction produced nothing useful, fallback to OpenAI extraction
  const hasUseful = Object.values(extracted).some((v) => v !== undefined && v !== null);
  if (!hasUseful) {
    const kindMap: Record<string, keyof typeof import('../domain/extract-prompts.js').EXTRACT_PROMPTS> = {
      started: 'level',
      profile: 'age',
      physical: 'height_weight',
      heart_rate: 'resting_hr',
      running_info: 'pace5k',
      lab_testing: 'lab_testing',
      training_freq: 'training_freq',
      race_details: 'race_details'
    } as const;

    const kind = kindMap[stage];
    if (kind) extracted = await fallbackExtract(kind, messageText);
  }

  // Handle race date warnings before proceeding
  if (stage === 'race_details') {
    const warning = (extracted as any).race_date_warning as string | null;
    delete (extracted as any).race_date_warning;

    if (warning === 'past' || warning === 'too_soon') {
      const msg = warning === 'past'
        ? 'Эта дата уже прошла.'
        : 'До забега меньше 2 недель — слишком мало для подготовки.';

      // Save distance/target if extracted, but re-ask for date
      const partialPatch: Record<string, any> = {};
      if ((extracted as any).race_distance) partialPatch.race_distance = (extracted as any).race_distance;
      if ((extracted as any).race_distance_km) partialPatch.race_distance_km = (extracted as any).race_distance_km;
      if ((extracted as any).target_time_seconds) partialPatch.target_time_seconds = (extracted as any).target_time_seconds;

      if (Object.keys(partialPatch).length > 0) {
        await upsertUserProfile({ telegram_id: user.telegram_id, ...partialPatch });
      }

      return {
        reply: `${msg} Укажи другую дату забега.\n\nНапример: 15.06.2026 или "через 12 недель"`,
        updated: { ...user, ...partialPatch }
      };
    }

    // For two_cycles/too_far — proceed but we'll add a note later
    if (warning === 'two_cycles' || warning === 'too_far') {
      (extracted as any)._dateNote = warning === 'two_cycles'
        ? 'До забега больше 12 недель. Подготовка строится в 12-недельном цикле — я начну его ближе к дате старта.'
        : 'До забега больше полугода. Я начну 12-недельный цикл подготовки ближе к дате старта.';
    }
  }

  // After all attempts — if still nothing, re-show question with hint
  // (heart_rate and lab_testing allow "не знаю" → null is valid)
  const hasExtracted = Object.values(extracted).some((v) => v !== undefined && v !== null);
  if (!hasExtracted && stage !== 'heart_rate' && stage !== 'lab_testing') {
    const q = step.question;
    const hint = typeof q === 'function' ? q(user) : q;
    return { reply: `Не удалось распознать ответ. Попробуй ещё раз.\n\n${hint}`, updated: user };
  }

  const dateNote = (extracted as any)?._dateNote as string | undefined;
  delete (extracted as any)?._dateNote;

  const nextStage = step.next;

  const patch: Partial<UserProfile> = {
    ...(extracted as Partial<UserProfile>),
    onboarding_stage: nextStage
  };

  // Validate patch shape (soft)
  const safe = UserProfilePatchSchema.safeParse({ telegram_id: user.telegram_id, ...patch });
  const finalPatch = safe.success ? safe.data : { telegram_id: user.telegram_id, ...patch };

  const updated = await upsertUserProfile(finalPatch);

  // Strategy preview → create strategy, show it, then ask start date
  if (nextStage === 'strategy_preview') {
    const strategy = await createStrategy(updated);
    let reply = '';

    if (dateNote) {
      reply += dateNote + '\n\n';
    }

    // Add summary of collected data + prediction
    reply += buildOnboardingSummary(updated);
    reply += '\n\n';

    // Show strategy
    if (strategy?.phases) {
      reply += formatStrategyPreview(strategy.phases, updated.race_date || '', updated.race_distance || '');
    } else {
      reply += 'Стратегия подготовки сформирована.';
    }

    // Ask when to start training
    reply += '\n\nС какого дня ты готов начать тренировки?\n\nНапример: "завтра", "с понедельника", "со следующей недели"';

    return { reply, updated: { ...updated, onboarding_stage: 'strategy_preview' as const } };
  }

  const nextStep = ONBOARDING_FLOW[nextStage];
  if (!nextStep) {
    return { reply: 'Онбординг завершён!', updated };
  }
  const reply = typeof nextStep.question === 'function' ? nextStep.question(updated) : nextStep.question;

  return { reply, updated };
}
