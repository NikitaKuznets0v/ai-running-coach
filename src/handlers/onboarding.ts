import type { UserProfile } from '../domain/types.js';
import { ONBOARDING_FLOW } from '../domain/onboarding-flow.js';
import { upsertUserProfile } from '../services/supabase.js';
import { fallbackExtract } from '../utils/openai-extract.js';
import { UserProfilePatchSchema } from '../domain/schemas.js';
import { createStrategy } from '../services/strategy.js';
import { buildWeeklyPlan } from '../engine/plan-builder.js';
import { renderPlan } from '../ai/presenter.js';
import { saveWeeklyPlan } from '../services/weekly-plan.js';
import { nextMondayFrom, weekRangeFromMonday, remainingWeekDates } from '../utils/dates.js';
import { formatStrategyPreview } from '../utils/format-strategy.js';

function isStartCommand(text: string): boolean {
  return /^\/?start$/i.test(text.trim());
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
        reply: `${msg} Укажи другую дату забега.\n\nНапример: 15.06.2026 или 2026-06-15`,
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

  // Strategy preview → create strategy, show it, generate first plan, advance to completed
  if (nextStage === 'strategy_preview') {
    const strategy = await createStrategy(updated);
    let reply = '';

    if (dateNote) {
      reply += dateNote + '\n\n';
    }

    if (strategy?.phases) {
      reply += formatStrategyPreview(strategy.phases, updated.race_date || '', updated.race_distance || '');
    } else {
      reply += 'Стратегия подготовки сформирована.\n';
    }

    // Auto-generate first week plan
    try {
      const now = new Date();
      const isMidWeek = now.getDay() !== 1;
      const dates = isMidWeek ? remainingWeekDates(now) : (() => {
        const monday = nextMondayFrom(now);
        const range = weekRangeFromMonday(monday);
        const d: Date[] = [];
        for (let i = 0; i < 7; i++) {
          d.push(new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate() + i));
        }
        return d;
      })();

      if (dates.length > 0) {
        const plan = buildWeeklyPlan({
          user: updated,
          dates,
          strategy: strategy ? { start_date: strategy.start_date, phases: strategy.phases } : null
        });
        await saveWeeklyPlan(updated.id, plan);
        reply += '\n' + renderPlan(plan);
      }
    } catch {
      reply += '\nНапиши "план" или "с понедельника" чтобы получить план на неделю.';
    }

    await upsertUserProfile({ telegram_id: user.telegram_id, onboarding_stage: 'completed' });
    return { reply, updated: { ...updated, onboarding_stage: 'completed' as const } };
  }

  const nextStep = ONBOARDING_FLOW[nextStage];
  const reply = typeof nextStep.question === 'function' ? nextStep.question(updated) : nextStep.question;

  return { reply, updated };
}
